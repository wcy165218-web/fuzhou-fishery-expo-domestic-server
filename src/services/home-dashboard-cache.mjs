import { isAdminUser, normalizeUserRole } from '../utils/auth.mjs';

const HOME_DASHBOARD_CACHE_TTL_MS = 15_000;
const homeDashboardCache = new Map();

export function buildHomeDashboardCacheKey(projectId, currentUser, customStartDate = '', customEndDate = '') {
    const normalizedProjectId = Number(projectId || 0);
    const roleKey = normalizeUserRole(currentUser?.role);
    const userKey = isAdminUser(currentUser)
        ? roleKey
        : `${roleKey}:${String(currentUser?.name || '').trim()}`;
    return [
        normalizedProjectId,
        userKey,
        String(customStartDate || ''),
        String(customEndDate || '')
    ].join('::');
}

export function getCachedHomeDashboardPayload(cacheKey, now = Date.now()) {
    const entry = homeDashboardCache.get(cacheKey);
    if (entry && Number(entry.expiresAt || 0) > now) {
        return entry.payload;
    }
    homeDashboardCache.delete(cacheKey);
    return null;
}

export function setCachedHomeDashboardPayload(cacheKey, payload, ttlMs = HOME_DASHBOARD_CACHE_TTL_MS, now = Date.now()) {
    homeDashboardCache.set(cacheKey, {
        payload,
        expiresAt: now + Math.max(0, Number(ttlMs || HOME_DASHBOARD_CACHE_TTL_MS))
    });
}

export function invalidateHomeDashboardCache(projectId = 0) {
    const normalizedProjectId = Number(projectId || 0);
    if (!normalizedProjectId) {
        homeDashboardCache.clear();
        return;
    }
    for (const key of homeDashboardCache.keys()) {
        if (key.startsWith(`${normalizedProjectId}::`)) {
            homeDashboardCache.delete(key);
        }
    }
}

export function clearHomeDashboardCache() {
    homeDashboardCache.clear();
}

export { HOME_DASHBOARD_CACHE_TTL_MS };