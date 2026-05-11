import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function assertSafeKey(key) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) throw new Error('Storage key must not be empty');
    if (path.isAbsolute(normalizedKey)) throw new Error('Storage key must not be absolute');
    if (normalizedKey.split(/[\\/]+/).some((part) => part === '..')) {
        throw new Error('Storage key must not contain path traversal');
    }
    return normalizedKey;
}

function resolveObjectPath(rootDir, key) {
    const safeKey = assertSafeKey(key);
    const root = path.resolve(rootDir);
    const resolvedPath = path.resolve(root, safeKey);
    const relative = path.relative(root, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Storage key escapes root directory');
    }
    return resolvedPath;
}

async function bodyToBuffer(body) {
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
    if (typeof body === 'string') return Buffer.from(body);
    if (body?.arrayBuffer) return Buffer.from(await body.arrayBuffer());
    throw new TypeError('Unsupported storage body');
}

function normalizeHttpMetadata(metadata = {}) {
    return Object.fromEntries(
        Object.entries(metadata || {})
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)])
    );
}

function headersFromHttpMetadata(metadata = {}) {
    const headers = {
        contentType: 'Content-Type',
        contentLanguage: 'Content-Language',
        contentDisposition: 'Content-Disposition',
        contentEncoding: 'Content-Encoding',
        cacheControl: 'Cache-Control'
    };
    return Object.entries(metadata || {}).reduce((output, [key, value]) => {
        const headerName = headers[key] || key;
        output[headerName] = value;
        return output;
    }, {});
}

export function createLocalStorageBucket({ rootDir }) {
    const storageRoot = path.resolve(rootDir || '/var/expo-files');

    return {
        async put(key, body, options = {}) {
            const objectPath = resolveObjectPath(storageRoot, key);
            const buffer = await bodyToBuffer(body);
            await fs.mkdir(path.dirname(objectPath), { recursive: true });
            await fs.writeFile(objectPath, buffer);
            const metadata = {
                httpEtag: `"${crypto.createHash('sha256').update(buffer).digest('hex')}"`,
                httpMetadata: normalizeHttpMetadata(options.httpMetadata),
                size: buffer.byteLength,
                uploaded: new Date().toISOString()
            };
            await fs.writeFile(`${objectPath}.meta.json`, JSON.stringify(metadata, null, 2));
            return metadata;
        },

        async get(key) {
            const objectPath = resolveObjectPath(storageRoot, key);
            let buffer;
            try {
                buffer = await fs.readFile(objectPath);
            } catch (error) {
                if (error?.code === 'ENOENT') return null;
                throw error;
            }
            let metadata = {};
            try {
                metadata = JSON.parse(await fs.readFile(`${objectPath}.meta.json`, 'utf8'));
            } catch (error) {
                metadata = {};
            }
            const httpMetadata = normalizeHttpMetadata(metadata.httpMetadata || {});
            const httpEtag = String(metadata.httpEtag || `"${crypto.createHash('sha256').update(buffer).digest('hex')}"`);
            return {
                body: new Blob([buffer], { type: httpMetadata.contentType || 'application/octet-stream' }).stream(),
                httpEtag,
                httpMetadata,
                writeHttpMetadata(headers) {
                    for (const [name, value] of Object.entries(headersFromHttpMetadata(httpMetadata))) {
                        headers.set(name, value);
                    }
                },
                async arrayBuffer() {
                    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
                }
            };
        },

        async delete(key) {
            const objectPath = resolveObjectPath(storageRoot, key);
            await Promise.allSettled([
                fs.unlink(objectPath),
                fs.unlink(`${objectPath}.meta.json`)
            ]);
        }
    };
}
