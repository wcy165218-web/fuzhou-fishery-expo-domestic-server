const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
].join('; ');

export function errorResponse(msg, status = 400, extraHeaders = {}) {
    return new Response(JSON.stringify({ success: false, error: msg }), {
        status,
        headers: { 'Content-Type': 'application/json', ...extraHeaders }
    });
}

export function buildSecurityHeaders({ includeCsp = false } = {}) {
    const headers = {
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin'
    };
    if (includeCsp) {
        headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY;
    }
    return headers;
}

export function buildAssetCacheHeaders(pathname = '') {
    const normalizedUrl = String(pathname || '').trim().toLowerCase();
    const [normalizedPath, normalizedQuery = ''] = normalizedUrl.split('?');
    const hasExplicitVersion = /(?:^|&)(?:v|ver|version|hash)=[^&]+/.test(normalizedQuery);
    const hasHashedFilename = /\.[0-9a-f]{8,}\.(?:css|js|mjs|map|woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|avif|ico)$/i.test(normalizedPath);
    if (normalizedPath === '/exhibitor-confirm' || normalizedPath === '/exhibitor-confirm.html') {
        return {
            'Cache-Control': 'public, max-age=60, must-revalidate',
            'Vary': 'Accept-Encoding'
        };
    }
    if (!normalizedPath || normalizedPath === '/' || normalizedPath.endsWith('.html')) {
        return {
            'Cache-Control': 'public, max-age=300, must-revalidate',
            'Vary': 'Accept-Encoding'
        };
    }
    if (/\.(?:css|js|mjs|map|woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|avif|ico)$/i.test(normalizedPath)) {
        if (hasExplicitVersion || hasHashedFilename) {
            return {
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Vary': 'Accept-Encoding'
            };
        }
        return {
            'Cache-Control': 'public, max-age=3600, must-revalidate',
            'Vary': 'Accept-Encoding'
        };
    }
    return {
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'Vary': 'Accept-Encoding'
    };
}

export function buildPrivateApiCacheHeaders({ maxAge = 30, staleWhileRevalidate = 60 } = {}) {
    const normalizedMaxAge = Math.max(0, Number(maxAge || 0));
    const normalizedSWR = Math.max(0, Number(staleWhileRevalidate || 0));
    const directives = [
        'private',
        `max-age=${normalizedMaxAge}`
    ];
    if (normalizedSWR > 0) {
        directives.push(`stale-while-revalidate=${normalizedSWR}`);
    }
    return {
        'Cache-Control': directives.join(', '),
        'Vary': 'Origin, Authorization'
    };
}

export function buildPrivateFileCacheHeaders({ maxAge = 31536000, immutable = true } = {}) {
    const normalizedMaxAge = Math.max(0, Number(maxAge || 0));
    const directives = [
        'private',
        `max-age=${normalizedMaxAge}`
    ];
    if (immutable) {
        directives.push('immutable');
    }
    return {
        'Cache-Control': directives.join(', '),
        'Vary': 'Origin, Authorization, Accept-Encoding'
    };
}

export function isEtagNotModified(request, etag = '') {
    const incomingEtag = String(request?.headers?.get('If-None-Match') || '').trim();
    const normalizedEtag = String(etag || '').trim();
    return !!incomingEtag && !!normalizedEtag && incomingEtag === normalizedEtag;
}

export function withResponseHeaders(response, extraHeaders = {}) {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(extraHeaders || {})) {
        headers.set(key, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

export function buildCorsHeaders(request, url, env) {
    const requestOrigin = request.headers.get('Origin');
    const isProduction = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const configuredOrigins = String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const allowedOrigins = configuredOrigins.length > 0
        ? Array.from(new Set(configuredOrigins))
        : (isProduction ? [] : [url.origin]);
    const allowOrigin = requestOrigin
        ? (allowedOrigins.includes(requestOrigin) ? requestOrigin : '')
        : (allowedOrigins[0] || '');

    const headers = {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name, X-Upload-Id',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Vary': 'Origin, Authorization',
        ...buildSecurityHeaders()
    };
    if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
    return headers;
}

export function internalErrorResponse(corsHeaders) {
    return errorResponse('系统内部错误，请稍后重试', 500, corsHeaders);
}
