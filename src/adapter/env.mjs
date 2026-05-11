import dotenv from 'dotenv';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createKVCache } from './cache.mjs';
import { createD1SqliteDatabase } from './db.mjs';
import { createLocalStorageBucket } from './storage.mjs';

dotenv.config({ quiet: true });

const MIME_TYPES = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.mjs', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.ico', 'image/x-icon'],
    ['.pdf', 'application/pdf'],
    ['.woff', 'font/woff'],
    ['.woff2', 'font/woff2']
]);

function parseWranglerVars(cwd) {
    const wranglerPath = path.join(cwd, 'wrangler.toml');
    if (!fs.existsSync(wranglerPath)) return {};
    const vars = {};
    const text = fs.readFileSync(wranglerPath, 'utf8');
    let inVars = false;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.startsWith('[')) {
            inVars = line === '[vars]';
            continue;
        }
        if (!inVars) continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
        if (!match) continue;
        const [, key, rawValue] = match;
        const value = rawValue.trim();
        vars[key] = value.startsWith('"') && value.endsWith('"')
            ? value.slice(1, -1).replace(/\\"/g, '"')
            : value;
    }
    return vars;
}

function resolveUnderRoot(rootDir, pathname) {
    const root = path.resolve(rootDir);
    const requestedPath = decodeURIComponent(String(pathname || '/'));
    const assetPath = requestedPath === '/'
        ? '/index.html'
        : (requestedPath === '/exhibitor-confirm' ? '/exhibitor-confirm.html' : requestedPath);
    const resolved = path.resolve(root, `.${assetPath}`);
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return resolved;
}

function createAssetsBinding({ publicDir }) {
    const assetRoot = path.resolve(publicDir);
    return {
        async fetch(request) {
            const url = new URL(request.url);
            const filePath = resolveUnderRoot(assetRoot, url.pathname);
            if (!filePath) return new Response('Not found', { status: 404 });
            try {
                const stat = await fsp.stat(filePath);
                if (!stat.isFile()) return new Response('Not found', { status: 404 });
                const headers = new Headers({
                    'Content-Type': MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
                    'Content-Length': String(stat.size),
                    'Last-Modified': stat.mtime.toUTCString()
                });
                if (request.method === 'HEAD') {
                    return new Response(null, { headers });
                }
                return new Response(await fsp.readFile(filePath), { headers });
            } catch (error) {
                if (error?.code === 'ENOENT') return new Response('Not found', { status: 404 });
                throw error;
            }
        }
    };
}

export function createAppEnv(options = {}) {
    const cwd = path.resolve(options.cwd || process.cwd());
    const wranglerVars = parseWranglerVars(cwd);
    const runtimeVars = {
        ...wranglerVars,
        ...process.env,
        ...(options.vars || {})
    };
    const sqlitePath = path.resolve(cwd, runtimeVars.SQLITE_DB_PATH || runtimeVars.DB_PATH || 'db/local/exhibition.sqlite');
    const fileStorageRoot = runtimeVars.FILE_STORAGE_ROOT || runtimeVars.LOCAL_STORAGE_ROOT || '/var/expo-files';
    const publicDir = path.resolve(cwd, runtimeVars.PUBLIC_DIR || 'public');

    return {
        ...runtimeVars,
        DB: createD1SqliteDatabase(sqlitePath),
        CACHE: createKVCache(),
        BUCKET: createLocalStorageBucket({ rootDir: fileStorageRoot }),
        ASSETS: createAssetsBinding({ publicDir })
    };
}
