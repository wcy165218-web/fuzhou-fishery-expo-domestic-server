import assert from 'node:assert/strict';
import worker from '../_worker.js';
import { buildJwtPayloadForUser, hashPassword, signJWT } from '../src/utils/crypto.mjs';

function createMockEnv(options = {}) {
    const rateLimitStore = new Map();
    const cacheStore = new Map();
    const assetRequests = [];
    const env = {
        JWT_SECRET: 'test-secret',
        ERP_CONFIG_SECRET: 'test-erp-secret',
        CONFIRMATION_PUBLIC_ORIGIN: options.confirmationOrigin || '',
        ASSETS: {
            async fetch(request) {
                assetRequests.push(new URL(request.url));
                return new Response('asset');
            }
        },
        rateLimitStore,
        cacheStore,
        assetRequests,
        DB: {
            prepare(sql) {
                const normalizedSql = String(sql || '');
                return {
                    params: [],
                    bind(...params) {
                        this.params = params;
                        return this;
                    },
                    async first() {
                        if (normalizedSql.includes('FROM Staff')) {
                            const staffName = String(this.params[0] || '');
                            return {
                                name: staffName,
                                role: 'admin',
                                token_index: 0,
                                password: options.staffPasswords?.[staffName] || ''
                            };
                        }
                        if (normalizedSql.includes('FROM WriteRateLimits')) {
                            return rateLimitStore.get(this.params[0]) || null;
                        }
                        return null;
                    },
                    async run() {
                        if (normalizedSql.includes('INSERT INTO WriteRateLimits')) {
                            const [rateKey, now, threshold] = this.params;
                            const existing = rateLimitStore.get(rateKey);
                            if (!existing) {
                                rateLimitStore.set(rateKey, {
                                    rate_key: rateKey,
                                    request_count: 1,
                                    window_start: now
                                });
                            } else if (existing.window_start < threshold) {
                                existing.request_count = 1;
                                existing.window_start = now;
                            } else {
                                existing.request_count += 1;
                            }
                        }
                        return { meta: { changes: 1 } };
                    },
                    async all() {
                        return { results: [] };
                    }
                };
            }
        }
    };
    if (options.withCache) {
        env.CACHE = {
            async get(key, type) {
                const rawValue = cacheStore.get(key) || null;
                if (type === 'json' && rawValue) return JSON.parse(rawValue);
                return rawValue;
            },
            async put(key, value) {
                cacheStore.set(key, String(value));
            }
        };
    }
    return env;
}

async function createAuthHeaders(name = 'admin') {
    const token = await signJWT(buildJwtPayloadForUser({
        name,
        role: 'admin',
        token_index: 0
    }), 'test-secret');
    return {
        Authorization: `Bearer ${token}`
    };
}

async function callWorker(env, method, path, headers = {}, body = null) {
    return worker.fetch(new Request(`http://localhost${path}`, {
        method,
        headers,
        body
    }), env, { waitUntil() {} });
}

// Test 1: authenticated POST enters route handling and consumes quota.
{
    const env = createMockEnv();
    const response = await callWorker(env, 'POST', '/api/non-existent', await createAuthHeaders());
    assert.equal(response.status, 404);
    assert.equal(env.rateLimitStore.get('user:admin')?.request_count, 1);
}

// Test 2: authenticated POST is blocked on the 31st request within the same window.
{
    const env = createMockEnv();
    const headers = await createAuthHeaders();
    for (let index = 0; index < 30; index += 1) {
        const response = await callWorker(env, 'POST', '/api/non-existent', headers);
        assert.equal(response.status, 404, `request ${index + 1} should pass route dispatch`);
    }
    const blocked = await callWorker(env, 'POST', '/api/non-existent', headers);
    assert.equal(blocked.status, 429);
}

// Test 3: authenticated GET does not consume write quota.
{
    const env = createMockEnv();
    const response = await callWorker(env, 'GET', '/api/non-existent', await createAuthHeaders());
    assert.equal(response.status, 404);
    assert.equal(env.rateLimitStore.size, 0);
}

// Test 4: unauthenticated POST is rejected before touching write quota.
{
    const env = createMockEnv();
    const response = await callWorker(env, 'POST', '/api/non-existent');
    assert.equal(response.status, 401);
    assert.equal(env.rateLimitStore.size, 0);
}

// Test 5: when KV cache is available, write quota is enforced before D1 fallback.
{
    const env = createMockEnv({ withCache: true });
    const headers = await createAuthHeaders();
    for (let index = 0; index < 30; index += 1) {
        const response = await callWorker(env, 'POST', '/api/non-existent', headers);
        assert.equal(response.status, 404, `cached request ${index + 1} should pass route dispatch`);
    }
    const blocked = await callWorker(env, 'POST', '/api/non-existent', headers);
    assert.equal(blocked.status, 429);
    assert.equal(env.rateLimitStore.size, 0, 'KV-backed rate limiting should avoid D1 WriteRateLimits writes');
}

// Test 6: confirmation-domain short links serve the confirmation page asset.
{
    const env = createMockEnv({ confirmationOrigin: 'https://confirmation.example.com' });
    const response = await callWorker(env, 'GET', '/short-token-123', {
        'X-Forwarded-Host': 'confirmation.example.com'
    });
    assert.equal(response.status, 200);
    assert.equal(env.assetRequests[0]?.pathname, '/exhibitor-confirm');
}

// Test 7: accounts still using the default password are forced into password change.
{
    const defaultPasswordHash = await hashPassword('123456');
    const env = createMockEnv({
        staffPasswords: {
            'default-user': defaultPasswordHash
        }
    });
    const headers = await createAuthHeaders('default-user');
    const blocked = await callWorker(env, 'GET', '/api/non-existent', headers);
    const blockedPayload = await blocked.json();
    assert.equal(blocked.status, 403);
    assert.equal(blockedPayload.error, '当前账号仍在使用默认密码，请先修改密码');

    const changed = await callWorker(
        env,
        'POST',
        '/api/change-password',
        { ...headers, 'Content-Type': 'application/json' },
        JSON.stringify({ oldPass: '123456', newPass: 'safe-pass-2026' })
    );
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).success, true);
}

console.log('Write rate limit tests passed');
