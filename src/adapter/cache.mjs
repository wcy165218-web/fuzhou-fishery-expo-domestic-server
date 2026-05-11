import NodeCache from 'node-cache';

function parseStoredValue(value, type) {
    if (type === 'json' && typeof value === 'string') {
        return JSON.parse(value);
    }
    return value;
}

export function createKVCache(options = {}) {
    const cache = new NodeCache({
        stdTTL: Number(options.stdTTL || 0),
        checkperiod: Number(options.checkperiod || 60),
        useClones: false
    });

    return {
        async get(key, type) {
            const value = cache.get(String(key || ''));
            if (value === undefined) return null;
            return parseStoredValue(value, type);
        },

        async put(key, value, putOptions = {}) {
            const ttl = Number(putOptions.expirationTtl || 0);
            if (ttl > 0) {
                cache.set(String(key || ''), value, ttl);
            } else {
                cache.set(String(key || ''), value);
            }
        },

        async delete(key) {
            cache.del(String(key || ''));
        },

        _cache: cache
    };
}
