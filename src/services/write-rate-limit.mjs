import { formatChinaDateTime } from '../utils/helpers.mjs';

const WRITE_RATE_LIMIT = 30;
const PUBLIC_SUBMIT_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const RATE_WINDOW_TTL_SECONDS = Math.ceil(RATE_WINDOW_MS / 1000) + 5;

async function checkWriteRateLimitFromCache(env, rateKey) {
    const limit = String(rateKey || '').startsWith('public-submit:')
        ? PUBLIC_SUBMIT_RATE_LIMIT
        : WRITE_RATE_LIMIT;
    if (!env?.CACHE || typeof env.CACHE.get !== 'function' || typeof env.CACHE.put !== 'function') {
        return null;
    }
    const cacheKey = `write-rate-limit:${rateKey}`;
    const nowMs = Date.now();
    try {
        const existing = await env.CACHE.get(cacheKey, 'json');
        const windowStartedAt = Number(existing?.window_started_at || 0);
        const requestCount = Number(existing?.request_count || 0);
        const insideWindow = windowStartedAt > 0 && (nowMs - windowStartedAt) < RATE_WINDOW_MS;
        if (insideWindow && requestCount >= limit) {
            return true;
        }
        const nextEntry = {
            request_count: insideWindow ? requestCount + 1 : 1,
            window_started_at: insideWindow ? windowStartedAt : nowMs
        };
        await env.CACHE.put(cacheKey, JSON.stringify(nextEntry), { expirationTtl: RATE_WINDOW_TTL_SECONDS });
        return false;
    } catch (error) {
        console.warn('Write rate limit cache unavailable, falling back to D1:', error);
        return null;
    }
}

export async function checkWriteRateLimit(env, username) {
    const rateKey = `user:${String(username || '').toLowerCase()}`;
    const cachedLimitResult = await checkWriteRateLimitFromCache(env, rateKey);
    if (cachedLimitResult !== null) return cachedLimitResult;

    const now = formatChinaDateTime();
    const windowThreshold = formatChinaDateTime(new Date(Date.now() - RATE_WINDOW_MS));

    const existing = await env.DB.prepare(
        'SELECT request_count, window_start FROM WriteRateLimits WHERE rate_key = ?'
    ).bind(rateKey).first();

    if (existing && existing.window_start >= windowThreshold && existing.request_count >= WRITE_RATE_LIMIT) {
        return true;
    }

    await env.DB.prepare(`
        INSERT INTO WriteRateLimits (rate_key, request_count, window_start)
        VALUES (?, 1, ?)
        ON CONFLICT(rate_key) DO UPDATE SET
          request_count = CASE WHEN window_start < ? THEN 1 ELSE request_count + 1 END,
          window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
    `).bind(rateKey, now, windowThreshold, windowThreshold, now).run();

    return false;
}

export async function checkPublicSubmitRateLimit(env, clientKey) {
    const normalizedKey = String(clientKey || '').trim().toLowerCase() || 'unknown';
    const cachedLimitResult = await checkWriteRateLimitFromCache(env, `public-submit:${normalizedKey}`);
    if (cachedLimitResult !== null) return cachedLimitResult;
    return false;
}
