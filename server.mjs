import http from 'node:http';
import { Readable } from 'node:stream';
import cron from 'node-cron';
import worker from './_worker.js';
import { createAppEnv } from './src/adapter/env.mjs';
import { installRuntimeShims } from './src/adapter/runtime-shims.mjs';

installRuntimeShims();

const env = createAppEnv();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';
const waitUntilTasks = new Set();

function createExecutionContext() {
    return {
        waitUntil(promise) {
            const task = Promise.resolve(promise)
                .catch((error) => {
                    console.error('waitUntil task failed:', error);
                })
                .finally(() => {
                    waitUntilTasks.delete(task);
                });
            waitUntilTasks.add(task);
        }
    };
}

function buildRequestUrl(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
    const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || `${host}:${port}`).split(',')[0].trim();
    return `${proto}://${hostHeader}${req.url || '/'}`;
}

function headersFromIncomingMessage(req) {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            for (const item of value) headers.append(key, item);
        } else if (value !== undefined) {
            headers.set(key, String(value));
        }
    }
    return headers;
}

function requestFromIncomingMessage(req) {
    const init = {
        method: req.method,
        headers: headersFromIncomingMessage(req)
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = req;
        init.duplex = 'half';
    }
    return new Request(buildRequestUrl(req), init);
}

async function writeNodeResponse(webResponse, res) {
    res.statusCode = webResponse.status;
    res.statusMessage = webResponse.statusText;
    webResponse.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    if (!webResponse.body) {
        res.end();
        return;
    }
    Readable.fromWeb(webResponse.body).pipe(res);
}

async function handleScheduledRun(reason = 'cron') {
    console.log(`[scheduled] order release run started (${reason})`);
    await worker.scheduled(
        { scheduledTime: Date.now(), cron: '*/15 * * * *' },
        env,
        createExecutionContext()
    );
    console.log(`[scheduled] order release run queued (${reason})`);
}

const server = http.createServer(async (req, res) => {
    try {
        const request = requestFromIncomingMessage(req);
        const url = new URL(request.url);
        if (isProduction && !url.pathname.startsWith('/api/')) {
            await writeNodeResponse(new Response('Not found', { status: 404 }), res);
            return;
        }
        await writeNodeResponse(await worker.fetch(request, env, createExecutionContext()), res);
    } catch (error) {
        console.error('HTTP request failed:', error);
        await writeNodeResponse(new Response(JSON.stringify({
            success: false,
            error: '系统内部错误，请稍后重试'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        }), res);
    }
});

cron.schedule('*/15 * * * *', () => {
    handleScheduledRun().catch((error) => {
        console.error('[scheduled] order release run failed:', error);
    });
});

if (process.env.RUN_SCHEDULED_ON_START === '1') {
    handleScheduledRun('startup').catch((error) => {
        console.error('[scheduled] startup run failed:', error);
    });
}

server.listen(port, host, () => {
    console.log(`Node server listening on http://${host}:${port}`);
    console.log('Scheduled order release cron registered: */15 * * * *');
});

async function shutdown(signal) {
    console.log(`Received ${signal}, shutting down...`);
    server.close(async () => {
        await Promise.allSettled([...waitUntilTasks]);
        if (typeof env.DB?.close === 'function') env.DB.close();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
