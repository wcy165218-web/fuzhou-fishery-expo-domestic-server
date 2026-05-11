import { createKVCache } from './cache.mjs';

const EDGE_CACHE_TTL_SECONDS = 60;

async function cloneResponseForCache(response) {
    const headers = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });
    return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: await response.arrayBuffer()
    };
}

function responseFromCacheEntry(entry) {
    if (!entry) return undefined;
    return new Response(entry.body.slice(0), {
        status: entry.status,
        statusText: entry.statusText,
        headers: entry.headers
    });
}

function normalizeCacheKey(request) {
    if (request instanceof Request) return request.url;
    return String(request || '');
}

export function installRuntimeShims() {
    if (!globalThis.caches?.default) {
        const cache = createKVCache({ stdTTL: EDGE_CACHE_TTL_SECONDS });
        globalThis.caches = {
            default: {
                async match(request) {
                    return responseFromCacheEntry(await cache.get(normalizeCacheKey(request)));
                },
                async put(request, response) {
                    await cache.put(
                        normalizeCacheKey(request),
                        await cloneResponseForCache(response.clone()),
                        { expirationTtl: EDGE_CACHE_TTL_SECONDS }
                    );
                },
                async delete(request) {
                    await cache.delete(normalizeCacheKey(request));
                    return true;
                }
            }
        };
    }
}
