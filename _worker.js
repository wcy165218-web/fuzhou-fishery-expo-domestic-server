import {
    getJwtSecret,
    verifyJWT,
} from './src/utils/crypto.mjs';
import {
    getStaffAuthState,
	isSuperAdmin,
	normalizeUserRole
} from './src/utils/auth.mjs';
import {
	buildAssetCacheHeaders,
    buildCorsHeaders,
    buildSecurityHeaders,
    errorResponse,
    internalErrorResponse,
    withResponseHeaders
} from './src/utils/response.mjs';
import { enforceRequestBodyHeaderLimit } from './src/utils/request.mjs';
import { checkWriteRateLimit } from './src/services/write-rate-limit.mjs';
import { dispatchApiRoutes } from './src/router.mjs';
import {
    migrateAllLegacyErpSessionCookies,
} from './src/services/erp.mjs';
import { expireOverdueReservedOrders } from './src/services/order-release.mjs';

let legacyErpSecretMigrationScheduled = false;

const staffAuthCache = new Map();
const STAFF_AUTH_CACHE_TTL_MS = 30_000;
const CUTOVER_CANONICAL_ORIGIN = 'https://expo.chinafife.com';

function normalizeOrigin(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
        return `${parsed.protocol}//${parsed.host}`;
    } catch (error) {
        return '';
    }
}

function getExternalHost(request, url) {
    return String(request.headers.get('X-Forwarded-Host') || url.host || '').split(',')[0].trim().toLowerCase();
}

function isWorkersDevHost(host) {
    return String(host || '').toLowerCase().endsWith('.workers.dev');
}

function buildLegacyCutoverFreezeResponse(request, url) {
    if (!request?.cf) return null;
    const externalHost = getExternalHost(request, url);
    if (!externalHost || isWorkersDevHost(externalHost)) return null;
    const canonicalUrl = new URL(url.pathname + url.search, CUTOVER_CANONICAL_ORIGIN);
    if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({
            success: false,
            error: '旧入口已停止写入，请使用 https://expo.chinafife.com/'
        }), {
            status: 410,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                'Location': canonicalUrl.toString()
            }
        });
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
        return Response.redirect(canonicalUrl.toString(), 308);
    }
    return new Response('旧入口已停止写入，请使用 https://expo.chinafife.com/', {
        status: 410,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Location': canonicalUrl.toString()
        }
    });
}

function isConfirmationShortLinkRequest(request, url, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    if (url.pathname === '/' || url.pathname.startsWith('/api/')) return false;
    if (url.pathname === '/exhibitor-confirm' || url.pathname === '/exhibitor-confirm.html') return false;
    if (url.pathname.includes('.')) return false;
    const configuredOrigin = normalizeOrigin(env?.CONFIRMATION_PUBLIC_ORIGIN);
    if (!configuredOrigin) return false;
    const configuredHost = new URL(configuredOrigin).host.toLowerCase();
    return getExternalHost(request, url) === configuredHost;
}

function buildConfirmationPageRequest(request, url) {
    const rewritten = new URL(request.url);
    rewritten.pathname = '/exhibitor-confirm';
    rewritten.search = '';
    return new Request(rewritten.toString(), request);
}

function getCachedStaffAuth(name) {
    const key = String(name || '').trim().toLowerCase();
    const entry = staffAuthCache.get(key);
    if (entry && (Date.now() - entry.ts) < STAFF_AUTH_CACHE_TTL_MS) return entry.data;
    staffAuthCache.delete(key);
    return null;
}

function setCachedStaffAuth(name, data) {
    const key = String(name || '').trim().toLowerCase();
    staffAuthCache.set(key, { data, ts: Date.now() });
}

export default {
  async scheduled(event, env, ctx = {}) {
    const releaseTask = expireOverdueReservedOrders(env).catch((error) => {
      console.error('Scheduled order release failed:', error);
    });
    if (typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(releaseTask);
      return;
    }
    await releaseTask;
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const legacyFreezeResponse = buildLegacyCutoverFreezeResponse(request, url);
    if (legacyFreezeResponse) return legacyFreezeResponse;

    if (!url.pathname.startsWith('/api/')) {
        const assetRequest = isConfirmationShortLinkRequest(request, url, env)
            ? buildConfirmationPageRequest(request, url)
            : request;
        const assetResponse = await env.ASSETS.fetch(assetRequest);
		const extraHeaders = buildSecurityHeaders({ includeCsp: true });
		if ((request.method === 'GET' || request.method === 'HEAD') && assetResponse.ok) {
			Object.assign(extraHeaders, buildAssetCacheHeaders(`${url.pathname}${url.search}`));
		}
		return withResponseHeaders(assetResponse, extraHeaders);
    }

    const corsHeaders = buildCorsHeaders(request, url, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const bodyLimitResponse = enforceRequestBodyHeaderLimit(request, url, corsHeaders);
    if (bodyLimitResponse) return bodyLimitResponse;

    let currentUser = null;
    let jwtSecret = '';

    try {
      jwtSecret = getJwtSecret(env);
    } catch (err) {
      console.error('JWT secret missing:', err);
      return errorResponse('系统未完成安全配置，请联系管理员', 500, corsHeaders);
    }

	    const isPublicApiRoute = url.pathname.startsWith('/api/public/');

	    if (url.pathname !== '/api/login' && !isPublicApiRoute) {
	      let bearerToken = null;
	      const authHeader = request.headers.get('Authorization');
	      if (authHeader && authHeader.startsWith('Bearer ')) {
	        bearerToken = authHeader.split(' ')[1];
	      }
	      // 文件预览：从短效 cookie 取 JWT（新标签页直接打开 API URL 时）
	      if (!bearerToken && url.pathname.startsWith('/api/file/')) {
	        const cookies = request.headers.get('Cookie') || '';
	        const previewMatch = cookies.match(/(?:^|;\s*)preview_auth=([^;]+)/);
	        if (previewMatch) {
	          bearerToken = decodeURIComponent(previewMatch[1]);
	        }
	      }
	      if (!bearerToken) {
	        return errorResponse('未登录或登录已过期', 401, corsHeaders);
	      }
	      try {
	        currentUser = await verifyJWT(bearerToken, jwtSecret);
	        const currentStaffState = getCachedStaffAuth(currentUser?.name)
	            || await getStaffAuthState(env, currentUser?.name);
	        if (!currentStaffState) {
	          return errorResponse('账号不存在或已被停用，请重新登录', 401, corsHeaders);
	        }
	        if (Number(currentUser?.token_index ?? 0) !== Number(currentStaffState?.token_index ?? 0)) {
	          return errorResponse('登录状态已失效，请重新登录', 401, corsHeaders);
	        }
	        setCachedStaffAuth(currentUser?.name, currentStaffState);
	        currentUser = {
	          ...currentUser,
	          name: currentStaffState.name,
	          role: normalizeUserRole(currentStaffState.role),
	          token_index: Number(currentStaffState.token_index || 0)
	        };
	        if (isSuperAdmin(currentUser) && !legacyErpSecretMigrationScheduled) {
	          legacyErpSecretMigrationScheduled = true;
	          ctx.waitUntil(
	            migrateAllLegacyErpSessionCookies(env).catch((migrationError) => {
	              console.warn('Background ERP secret migration failed:', migrationError);
	              legacyErpSecretMigrationScheduled = false;
	            })
	          );
	        }
	      } catch (err) {
	        return errorResponse('登录状态已失效，请重新登录', 401, corsHeaders);
	      }
	    }

	    try {
	      if (request.method === 'POST' && currentUser) {
	        const limited = await checkWriteRateLimit(env, currentUser.name);
	        if (limited) return errorResponse('操作过于频繁，请稍后再试', 429, corsHeaders);
	      }

	      const routeResponse = await dispatchApiRoutes({
	        request,
	        env,
	        url,
	        ctx,
	        currentUser,
	        corsHeaders,
	        jwtSecret
	      });
	      if (routeResponse) return routeResponse;

	      return errorResponse('接口不存在', 404, corsHeaders);

    } catch (err) {
      console.error('Unhandled API error:', err);
      return internalErrorResponse(corsHeaders);
    }
  }
};
