// ================= js/api.js =================
// 声明全局共享变量 (使用 var 确保跨文件可访问)
var currentUser = null; 
var allProjects = []; 
var globalPrices = { '标摊': 0, '豪标': 0, '光地': 0 }; 
var allBooths = []; 
var currentStandardFee = 0; 
var isJointExhibition = false; 
var dynamicFees = []; 
var allOrders = []; 
var currentModalOrderId = null; 
var fmDynamicFees = [];
var fmSwapFees = [];
var fmSwapCandidateBooth = null;
var currentViewOrder = null; 
var projectAccounts = []; 
var projectIndustries = []; 
var lastFmTab = 'pay';
var currentSilentOrderId = null; 
var projectErpConfig = null;
var currentPrintObjectUrl = null;
var boothMaps = [];
var currentBoothMap = null;
var currentBoothMapItems = [];
var currentBoothMapRuntimeItems = [];
var currentBoothMapId = null;
var boothMapDirty = false;
var orderListState = { page: 1, pageSize: 30, total: 0, totalPages: 1, hasMore: false };
var orderListFilterTimer = null;
var orderListRequestSeq = 0;
var orderSalesFilterProjectId = '';
var lastOrderDashboardKey = '';
var AUTH_STORAGE_KEY = 'exhibition_user';
var assetObjectUrlCache = {};
var pendingAssetObjectUrlRequests = {};
var assetDataUrlCache = {};
var pendingAssetDataUrlRequests = {};
var projectStaffCache = {};
var projectResourceCache = {};
var pendingProjectResourceRequests = {};
var pendingJsZipLoader = null;
var pendingXlsxLoader = null;
var pendingFeatureScriptLoaders = {};
var PROJECT_RESOURCE_CACHE_STORAGE_PREFIX = 'expo_project_resource';
var PROJECT_RESOURCE_CACHE_TTLS = {
    prices: 60 * 1000,
    booths: 60 * 1000,
    staff: 60 * 1000,
    accounts: 60 * 1000,
    industries: 60 * 1000,
    erpConfig: 60 * 1000,
    orderReleaseSettings: 60 * 1000,
    orderFieldSettings: 60 * 1000
};

window.expoState = window.expoState || {};
window.expoState.resources = window.expoState.resources || {
    projectStaffCache,
    projectResourceCache,
    pendingProjectResourceRequests,
    assetObjectUrlCache,
    assetDataUrlCache
};
window.expoState.orderList = window.expoState.orderList || orderListState;
window.expoState.featureScripts = window.expoState.featureScripts || {
    pendingLoaders: pendingFeatureScriptLoaders
};

window.getFeatureState = function(featureKey, defaults = {}) {
    const normalizedKey = String(featureKey || '').trim();
    if (!normalizedKey) return defaults;
    window.expoState = window.expoState || {};
    window.expoState.features = window.expoState.features || {};
    window.expoState.features[normalizedKey] = {
        ...defaults,
        ...(window.expoState.features[normalizedKey] || {})
    };
    return window.expoState.features[normalizedKey];
}

window.formatMoneyNumber = function(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0';
    return amount.toLocaleString('zh-CN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

window.formatCurrency = function(value, prefix = '¥') {
    return `${prefix}${window.formatMoneyNumber(value)}`;
}

window.formatCompactCount = function(value) {
    return Number(value || 0).toFixed(2).replace(/\.00$/, '');
}

window.formatCompactPercent = function(value) {
    return `${Number(value || 0).toFixed(1).replace(/\.0$/, '')}%`;
}

window.cloneCachedResourceValue = function(value) {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch (error) {}
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

window.getProjectResourceCacheKey = function(resourceKey, projectId) {
    return `${String(resourceKey || '').trim()}:${String(projectId || '').trim()}`;
}

window.getProjectResourceCacheStorageKey = function(cacheKey) {
    return `${PROJECT_RESOURCE_CACHE_STORAGE_PREFIX}:${String(cacheKey || '').trim()}`;
}

window.getProjectResourceCacheTtl = function(resourceKey) {
    return Number(PROJECT_RESOURCE_CACHE_TTLS[String(resourceKey || '').trim()] || (30 * 1000));
}

window.readSessionCacheEntry = function(storageKey) {
    try {
        const rawValue = sessionStorage.getItem(storageKey);
        if (!rawValue) return null;
        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        return null;
    }
}

window.writeSessionCacheEntry = function(storageKey, entry) {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {}
}

window.readProjectCachedResource = async function(resourceKey, projectId, loader, options = {}) {
    const normalizedResourceKey = String(resourceKey || '').trim();
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedResourceKey || !normalizedProjectId || typeof loader !== 'function') {
        return typeof loader === 'function' ? loader() : null;
    }

    const force = options.force === true;
    const explicitTtl = Number(options.ttlMs);
    const ttlMs = Number.isFinite(explicitTtl)
        ? Math.max(0, explicitTtl)
        : window.getProjectResourceCacheTtl(normalizedResourceKey);
    const cacheKey = window.getProjectResourceCacheKey(normalizedResourceKey, normalizedProjectId);
    const storageKey = window.getProjectResourceCacheStorageKey(cacheKey);
    const now = Date.now();

    if (!force) {
        const memoryEntry = projectResourceCache[cacheKey];
        if (memoryEntry && Number(memoryEntry.expiresAt || 0) > now) {
            return window.cloneCachedResourceValue(memoryEntry.value);
        }
        delete projectResourceCache[cacheKey];

        const sessionEntry = window.readSessionCacheEntry(storageKey);
        if (sessionEntry && Number(sessionEntry.expiresAt || 0) > now) {
            projectResourceCache[cacheKey] = sessionEntry;
            return window.cloneCachedResourceValue(sessionEntry.value);
        }
        try {
            sessionStorage.removeItem(storageKey);
        } catch (error) {}
    }

    if (pendingProjectResourceRequests[cacheKey]) {
        return pendingProjectResourceRequests[cacheKey];
    }

    pendingProjectResourceRequests[cacheKey] = Promise.resolve()
        .then(() => loader())
        .then((value) => {
            const normalizedValue = window.cloneCachedResourceValue(value);
            const cacheEntry = {
                value: normalizedValue,
                expiresAt: Date.now() + ttlMs
            };
            projectResourceCache[cacheKey] = cacheEntry;
            window.writeSessionCacheEntry(storageKey, cacheEntry);
            return window.cloneCachedResourceValue(normalizedValue);
        })
        .finally(() => {
            delete pendingProjectResourceRequests[cacheKey];
        });

    return pendingProjectResourceRequests[cacheKey];
}

window.invalidateProjectResourceCache = function(resourceKeys, projectId = '') {
    const normalizedKeys = Array.isArray(resourceKeys)
        ? resourceKeys.map((item) => String(item || '').trim()).filter(Boolean)
        : (resourceKeys ? [String(resourceKeys).trim()] : []);
    const normalizedProjectId = String(projectId || '').trim();

    Object.keys(projectResourceCache).forEach((cacheKey) => {
        const [resourceKey, resourceProjectId] = cacheKey.split(':');
        if (normalizedKeys.length > 0 && !normalizedKeys.includes(resourceKey)) return;
        if (normalizedProjectId && resourceProjectId !== normalizedProjectId) return;
        delete projectResourceCache[cacheKey];
        delete pendingProjectResourceRequests[cacheKey];
        try {
            sessionStorage.removeItem(window.getProjectResourceCacheStorageKey(cacheKey));
        } catch (error) {}
    });
}

window.getProjectStaffList = async function(projectId, { force = false } = {}) {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) return [];
    const staff = await window.readProjectCachedResource('staff', normalizedProjectId, async () => {
        const result = await window.readApiJson(
            await window.apiFetch(`/api/staff?projectId=${encodeURIComponent(normalizedProjectId)}`),
            '加载业务员列表失败',
            []
        );
        return Array.isArray(result) ? result : [];
    }, { force, ttlMs: 60 * 1000 });
    projectStaffCache[normalizedProjectId] = Array.isArray(staff) ? staff : [];
    return projectStaffCache[normalizedProjectId];
}

window.ensureJSZipLoaded = async function() {
    if (window.JSZip) return window.JSZip;
    if (pendingJsZipLoader) return pendingJsZipLoader;

    pendingJsZipLoader = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-jszip-loader="1"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(window.JSZip), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('压缩组件加载失败，请稍后重试')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.integrity = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';
        script.crossOrigin = 'anonymous';
        script.defer = true;
        script.dataset.jszipLoader = '1';
        script.onload = () => {
            if (window.JSZip) {
                resolve(window.JSZip);
                return;
            }
            reject(new Error('压缩组件加载失败，请稍后重试'));
        };
        script.onerror = () => reject(new Error('压缩组件加载失败，请稍后重试'));
        document.head.appendChild(script);
    }).finally(() => {
        pendingJsZipLoader = null;
    });

    return pendingJsZipLoader;
}

window.ensureXLSXLoaded = async function() {
    if (window.XLSX) return window.XLSX;
    if (pendingXlsxLoader) return pendingXlsxLoader;

    pendingXlsxLoader = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-xlsx-loader="1"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(window.XLSX), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Excel 导出组件加载失败，请稍后重试')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.crossOrigin = 'anonymous';
        script.defer = true;
        script.dataset.xlsxLoader = '1';
        script.onload = () => {
            if (window.XLSX) {
                resolve(window.XLSX);
                return;
            }
            reject(new Error('Excel 导出组件加载失败，请稍后重试'));
        };
        script.onerror = () => reject(new Error('Excel 导出组件加载失败，请稍后重试'));
        document.head.appendChild(script);
    }).finally(() => {
        pendingXlsxLoader = null;
    });

    return pendingXlsxLoader;
}

window.normalizeHallLabel = function(rawValue) {
    const normalized = String(rawValue || '').trim();
    if (!normalized) return '';
    if (/号馆$/.test(normalized)) {
        return normalized;
    }
    if (/馆$/.test(normalized)) {
        return normalized.replace(/馆$/, '号馆');
    }
    return /^\d+$/.test(normalized) ? `${normalized}号馆` : normalized;
}

window.normalizeBoothCode = function(rawValue) {
    return String(rawValue || '').trim().toUpperCase();
}

window.validateContractUploadFile = function(file) {
    if (!file) return '没有找到文件';
    const fileName = String(file.name || '').trim();
    const fileExt = String(fileName.split('.').pop() || '').toLowerCase();
    const fileType = String(file.type || '').trim().toLowerCase();
    if (fileExt !== 'pdf') {
        return '仅允许上传 PDF 格式文件';
    }
    if (fileType && !['application/pdf', 'application/x-pdf'].includes(fileType)) {
        return '文件类型无效，请上传 PDF 文件';
    }
    if (Number(file.size || 0) <= 0) {
        return '文件不能为空';
    }
    if (Number(file.size || 0) > 6 * 1024 * 1024) {
        return '合同文件不能超过 6MB';
    }
    return '';
}

window.sendAuthorizedUploadViaXhr = function(body, { headers = {}, timeoutMs = 45000 } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);
        xhr.responseType = 'text';
        xhr.timeout = timeoutMs;

        const authUser = window.getCurrentAuthUser?.();
        if (authUser?.token) {
            xhr.setRequestHeader('Authorization', `Bearer ${authUser.token}`);
        }
        Object.entries(headers || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                xhr.setRequestHeader(key, String(value));
            }
        });

        xhr.onload = () => {
            const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : '';
            resolve(new Response(responseText, {
                status: xhr.status || 0,
                statusText: xhr.statusText || '',
                headers: {
                    'Content-Type': xhr.getResponseHeader('Content-Type') || 'application/json'
                }
            }));
        };
        xhr.onerror = () => reject(new Error('网络请求失败，请稍后重试'));
        xhr.ontimeout = () => reject(new Error('上传超时，请稍后重试'));
        xhr.send(body);
    });
}

window.readFileAsBase64 = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const base64Value = dataUrl.includes(',') ? dataUrl.split(',').pop() : '';
            if (!base64Value) {
                reject(new Error('文件读取失败'));
                return;
            }
            resolve(base64Value);
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

window.createContractUploadId = function() {
    let randomValue = window.crypto?.randomUUID?.();
    if (!randomValue && window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        randomValue = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    if (!randomValue) {
        randomValue = `${Date.now().toString(36)}-${String(window.performance?.now?.() || 0).replace(/\D/g, '')}`;
    }
    return String(randomValue).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96);
}

window.uploadContractFile = async function(file) {
    const fileError = window.validateContractUploadFile?.(file);
    if (fileError) throw new Error(fileError);
    const uploadId = window.createContractUploadId();
    const formData = new FormData();
    formData.append('file', file, String(file.name || 'contract.pdf'));
    formData.append('uploadId', uploadId);
    const contentBase64 = await window.readFileAsBase64(file);

    const uploadAttempts = [
        async () => window.apiFetch('/api/upload', {
            method: 'POST',
            body: JSON.stringify({
                fileName: String(file.name || 'contract.pdf'),
                mimeType: String(file.type || 'application/pdf').trim() || 'application/pdf',
                uploadId,
                contentBase64
            })
        }),
        async () => window.sendAuthorizedUploadViaXhr(formData, { timeoutMs: 15000 }),
        async () => window.sendAuthorizedUploadViaXhr(file, {
            timeoutMs: 15000,
            headers: {
                'Content-Type': String(file.type || 'application/pdf').trim() || 'application/pdf',
                'X-File-Name': encodeURIComponent(String(file.name || 'contract.pdf')),
                'X-Upload-Id': uploadId
            }
        })
    ];

    let lastError = null;
    for (let index = 0; index < uploadAttempts.length; index += 1) {
        try {
            const uploadData = await window.readApiSuccessJson(
                await uploadAttempts[index](),
                '上传失败',
                {}
            );
            return uploadData;
        } catch (error) {
            lastError = error;
            console.warn(`Contract upload attempt ${index + 1} failed:`, error);
        }
    }

    throw lastError || new Error('上传失败');
}

window.deriveHallFromBoothCode = function(boothCode, fallbackValue = '') {
    const normalizedBoothCode = window.normalizeBoothCode(boothCode);
    const matched = normalizedBoothCode.match(/^(\d+)/);
    if (matched) return `${matched[1]}号馆`;
    return window.normalizeHallLabel(fallbackValue);
}

window.resolveHallFromMapName = function(rawValue) {
    const normalized = String(rawValue || '').trim();
    if (!normalized) return '';
    const matched = normalized.match(/\d+号馆/);
    return matched ? matched[0] : normalized;
}

window.isSameBoothCode = function(leftValue, rightValue) {
    return window.normalizeBoothCode(leftValue) === window.normalizeBoothCode(rightValue);
}

window.findItemByBoothCode = function(items, boothCode, key = 'booth_code') {
    const normalizedBoothCode = window.normalizeBoothCode(boothCode);
    if (!normalizedBoothCode) return null;
    return (Array.isArray(items) ? items : []).find((item) => window.normalizeBoothCode(item?.[key]) === normalizedBoothCode) || null;
}

window.findItemByBoothCodeIncludes = function(items, keyword, key = 'booth_code') {
    const normalizedKeyword = window.normalizeBoothCode(keyword);
    if (!normalizedKeyword) return null;
    return (Array.isArray(items) ? items : []).find((item) => window.normalizeBoothCode(item?.[key]).includes(normalizedKeyword)) || null;
}

window.getStoredUser = function() {
    const sessionValue = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (sessionValue) return sessionValue;
    const legacyValue = localStorage.getItem(AUTH_STORAGE_KEY);
    if (legacyValue) {
        sessionStorage.setItem(AUTH_STORAGE_KEY, legacyValue);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return legacyValue;
    }
    return '';
}

window.normalizeUserRole = function(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (!normalized) return 'user';
    if (normalized === 'sales') return 'user';
    if (normalized === 'superadmin') return 'super_admin';
    return normalized;
}

window.normalizeAuthUser = function(user) {
    if (!user || typeof user !== 'object') return null;
    return {
        ...user,
        role: window.normalizeUserRole(user.role)
    };
}

window.isAdminUser = function(user = window.currentUser) {
    if (!user) return false;
    const normalizedRole = window.normalizeUserRole(user.role);
    return normalizedRole === 'admin' || normalizedRole === 'super_admin';
}

window.isExhibitionManager = function(user = window.currentUser) {
    if (!user) return false;
    return window.normalizeUserRole(user.role) === 'exhibition_manager';
}

window.canManageExhibitionModule = function(user = window.currentUser) {
    return window.isAdminUser(user) || window.isExhibitionManager(user);
}

window.canManageBoothMap = function(user = window.currentUser) {
    return !!window.isSuperAdmin?.(user) || !!window.isExhibitionManager?.(user);
}

window.canConfirmExhibitionRentals = function(user = window.currentUser) {
    return window.canManageExhibitionModule(user);
}

window.setStoredUser = function(user) {
    const value = JSON.stringify(user || null);
    sessionStorage.setItem(AUTH_STORAGE_KEY, value);
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

window.clearStoredUser = function() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

window.setCurrentAuthUser = function(user) {
    const normalizedUser = window.normalizeAuthUser(user);
    window.currentUser = normalizedUser;
    currentUser = normalizedUser;
    if (normalizedUser) {
        window.setStoredUser(normalizedUser);
    } else {
        window.clearStoredUser();
    }
    return normalizedUser;
}

window.clearCurrentAuthUser = function() {
    return window.setCurrentAuthUser(null);
}

window.getCurrentAuthUser = function() {
    if (window.currentUser?.token) return window.currentUser;
    if (currentUser?.token) return currentUser;
    const savedUser = window.getStoredUser?.();
    if (!savedUser) return null;
    try {
        const parsed = JSON.parse(savedUser);
        if (parsed?.token) {
            return window.setCurrentAuthUser(parsed);
        }
    } catch (error) {
        window.clearCurrentAuthUser();
        return null;
    }
    return null;
}

window.fetchWithAuth = async function(url, options = {}) {
    const requestOptions = { ...options };
    const headers = { ...(requestOptions.headers || {}) };
    const authUser = window.getCurrentAuthUser();
    if (authUser?.token) {
        headers['Authorization'] = `Bearer ${authUser.token}`;
    }
    if (!headers['Content-Type'] && !(requestOptions.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    requestOptions.headers = headers;
    return fetch(url, requestOptions);
}

window.copyTextToClipboard = async function(text) {
    const content = String(text || '');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.className = 'fixed left-[-9999px] top-[-9999px]';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

function getOrderAuthUser(user = null) {
    return user || window.getCurrentAuthUser?.() || window.currentUser || currentUser || null;
}

// Shared order helpers live here so finance/home/order pages follow one client-side rule set.
window.isOwnOrder = function(order, user = null) {
    const authUser = getOrderAuthUser(user);
    return !!order && !!authUser && String(order.sales_name || '') === String(authUser.name || '');
}

window.canViewSensitiveOrderFields = function(order, user = null) {
    const authUser = getOrderAuthUser(user);
    return !!order && (!!window.isSuperAdmin?.(authUser) || window.isOwnOrder(order, authUser));
}

window.canViewOrderCommercialNotes = function(order, user = null) {
    const authUser = getOrderAuthUser(user);
    return !!order && !!authUser && (!!window.isAdminUser?.(authUser) || window.isOwnOrder(order, authUser) || Number(order.can_view_commercial_notes || 0) === 1);
}

window.canManageOrder = function(order, user = null) {
    const authUser = getOrderAuthUser(user);
    return !!order && !!authUser && (!!window.isSuperAdmin?.(authUser) || Number(order.can_manage) === 1);
}

window.getOrderBoothDisplay = function(order) {
    if (!order) return '无展位订单';
    const hall = String(order.hall || '').trim();
    const boothIds = String(order.booth_id || '')
        .split(/[,\n\r;/、，]+/g)
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    if (!boothIds.length) return '无展位订单';
    const boothText = boothIds.join(' / ');
    return hall && boothIds.length === 1 ? `${hall} - ${boothText}` : boothText;
}

window.getOverpaidAmount = function(order) {
    if (!order) return 0;
    const explicit = Number(order.overpaid_amount || 0);
    if (explicit > 0) return explicit;
    return Math.max(0, Number((Number(order.paid_amount || 0) - Number(order.total_amount || 0)).toFixed(2)));
}

window.hasOverpaymentIssue = function(order) {
    return window.getOverpaidAmount(order) > 0.01;
}

window.canHandleOverpayment = function(order, user = null) {
    const authUser = getOrderAuthUser(user);
    return !!order && (!!window.isSuperAdmin?.(authUser) || window.isOwnOrder(order, authUser));
}

window.getOverpaymentStatusLabel = function(order) {
    switch (order?.overpayment_status) {
        case 'resolved_as_fx_diff':
            return '已按汇率差确认';
        case 'on_hold':
            return '已暂挂待核销';
        case 'resolved_by_fee_update':
            return '已通过补录应收解除';
        default:
            return '超收异常待处理';
    }
}

window.formatOverpaymentMeta = function(order) {
    const handledBy = order?.overpayment_handled_by || '';
    const handledAt = order?.overpayment_handled_at || '';
    const note = String(order?.overpayment_note || '').trim();
    if (order?.overpayment_status === 'resolved_as_fx_diff') {
        return `${handledBy ? `处理人：${handledBy}` : '已确认汇率差'}${handledAt ? ` | 时间：${handledAt}` : ''}${note ? ` | 说明：${note}` : ''}`;
    }
    if (order?.overpayment_status === 'on_hold') {
        return `${handledBy ? `处理人：${handledBy}` : '已暂挂处理'}${handledAt ? ` | 时间：${handledAt}` : ''}${note ? ` | 说明：${note}` : ''}`;
    }
    if (order?.overpayment_status === 'resolved_by_fee_update') {
        return '已通过补录其他应收自动解除超收异常。';
    }
    return '请业务员尽快处理：补录应收、确认汇率差或暂挂说明。';
}

window.readApiErrorMessage = async function(response, fallback = '请求失败') {
    if (!response) return fallback;
    try {
        const data = await response.clone().json();
        if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
        if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
    } catch (error) {}
    try {
        const text = String(await response.clone().text() || '').trim();
        if (text) return text;
    } catch (error) {}
    return fallback;
}

window.ensureApiSuccess = async function(response, fallback = '请求失败') {
    if (response.ok) return response;
    throw new Error(await window.readApiErrorMessage(response, fallback));
}

window.readApiJson = async function(response, fallback = '请求失败', defaultValue = null) {
    await window.ensureApiSuccess(response, fallback);
    try {
        return await response.json();
    } catch (error) {
        return defaultValue;
    }
}

window.readApiSuccessJson = async function(response, fallback = '请求失败', defaultValue = null) {
    const data = await window.readApiJson(response, fallback, defaultValue);
    if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'success') && !data.success) {
        throw new Error(String(data.error || data.message || fallback));
    }
    return data;
}

window.revokeAuthorizedAssetUrl = function(rawUrl) {
    const normalizedUrl = String(rawUrl || '').trim();
    if (!normalizedUrl) return;
    if (assetObjectUrlCache[normalizedUrl]) {
        URL.revokeObjectURL(assetObjectUrlCache[normalizedUrl]);
        delete assetObjectUrlCache[normalizedUrl];
    }
    delete pendingAssetObjectUrlRequests[normalizedUrl];
    delete assetDataUrlCache[normalizedUrl];
    delete pendingAssetDataUrlRequests[normalizedUrl];
    try { sessionStorage.removeItem('asset:' + normalizedUrl); } catch (_) {}
}

window.getAuthorizedAssetDataUrl = async function(rawUrl) {
    const normalizedUrl = String(rawUrl || '').trim();
    if (!normalizedUrl) return '';
    if (assetDataUrlCache[normalizedUrl]) return assetDataUrlCache[normalizedUrl];

    // L2: sessionStorage – survives in-page navigation and soft refreshes
    try {
        const stored = sessionStorage.getItem('asset:' + normalizedUrl);
        if (stored) {
            assetDataUrlCache[normalizedUrl] = stored;
            return stored;
        }
    } catch (_) { /* sessionStorage may be unavailable */ }

    if (pendingAssetDataUrlRequests[normalizedUrl]) return pendingAssetDataUrlRequests[normalizedUrl];

    pendingAssetDataUrlRequests[normalizedUrl] = window.fetchWithAuth(normalizedUrl)
        .then(async (res) => {
            if (!res.ok) {
                let message = '资源加载失败';
                try {
                    const data = await res.clone().json();
                    if (data?.error) message = data.error;
                } catch (error) {
                    const text = await res.text().catch(() => '');
                    if (text) message = text;
                }
                throw new Error(message);
            }
            const blob = await res.blob();
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('资源读取失败'));
                reader.readAsDataURL(blob);
            });
            assetDataUrlCache[normalizedUrl] = dataUrl;
            try { sessionStorage.setItem('asset:' + normalizedUrl, dataUrl); } catch (_) {}
            return dataUrl;
        })
        .catch((error) => {
            console.error('Authorized asset data URL load failed:', normalizedUrl, error);
            return '';
        })
        .finally(() => {
            delete pendingAssetDataUrlRequests[normalizedUrl];
        });

    return pendingAssetDataUrlRequests[normalizedUrl];
}

window.getAuthorizedAssetUrl = function(rawUrl, onReady = null) {
    const normalizedUrl = String(rawUrl || '').trim();
    if (!normalizedUrl) return '';
    if (assetObjectUrlCache[normalizedUrl]) return assetObjectUrlCache[normalizedUrl];
    if (pendingAssetObjectUrlRequests[normalizedUrl]) return '';

    pendingAssetObjectUrlRequests[normalizedUrl] = window.fetchWithAuth(normalizedUrl)
        .then(async (res) => {
            if (!res.ok) {
                let message = '资源加载失败';
                try {
                    const data = await res.clone().json();
                    if (data?.error) message = data.error;
                } catch (error) {
                    const text = await res.text().catch(() => '');
                    if (text) message = text;
                }
                throw new Error(message);
            }
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            assetObjectUrlCache[normalizedUrl] = objectUrl;
            if (typeof onReady === 'function') onReady(objectUrl);
            return objectUrl;
        })
        .catch((error) => {
            console.error('Authorized asset load failed:', normalizedUrl, error);
            if (typeof onReady === 'function') onReady('');
            return '';
        })
        .finally(() => {
            delete pendingAssetObjectUrlRequests[normalizedUrl];
        });

    return '';
}

window.renderIcon = function(name, className = 'h-4 w-4', strokeWidth = 1.9) {
    const icons = {
        home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.25 9.75V20h13.5V9.75"/><path d="M9.75 20v-6.75h4.5V20"/>',
        clipboard: '<path d="M9 5.25h6"/><path d="M9.75 3h4.5a2.25 2.25 0 0 1 2.25 2.25v.75h1.5A2.25 2.25 0 0 1 20.25 8.25v10.5A2.25 2.25 0 0 1 18 21H6A2.25 2.25 0 0 1 3.75 18.75V8.25A2.25 2.25 0 0 1 6 6h1.5v-.75A2.25 2.25 0 0 1 9.75 3Z"/><path d="M12 10.5v6"/><path d="M9 13.5h6"/>',
        wallet: '<path d="M3.75 7.5h14.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2V7.5Z"/><path d="M3.75 7.5V6a2 2 0 0 1 2-2h10"/><path d="M15.75 13.5h4.5"/><path d="M17.25 13.5a.75.75 0 1 1 0 0"/>',
        layout: '<rect x="3.75" y="4.5" width="16.5" height="15" rx="2.25"/><path d="M9 4.5v15"/><path d="M9 10.5h11.25"/>',
        settings: '<path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z"/><path d="M19.5 12a7.56 7.56 0 0 0-.09-1.14l1.8-1.41-1.8-3.12-2.22.63a7.63 7.63 0 0 0-1.98-1.14L14.25 3h-4.5l-.96 1.82c-.69.27-1.36.65-1.98 1.14l-2.22-.63-1.8 3.12 1.8 1.41A7.56 7.56 0 0 0 4.5 12c0 .39.03.77.09 1.14l-1.8 1.41 1.8 3.12 2.22-.63c.62.49 1.29.87 1.98 1.14L9.75 21h4.5l.96-1.82c.69-.27 1.36-.65 1.98-1.14l2.22.63 1.8-3.12-1.8-1.41c.06-.37.09-.75.09-1.14Z"/>',
        folders: '<path d="M3.75 7.5A2.25 2.25 0 0 1 6 5.25h4.19l1.5 1.5H18A2.25 2.25 0 0 1 20.25 9v8.25A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V7.5Z"/><path d="M3.75 10.5h16.5"/>',
        users: '<path d="M15.75 19.5v-1.5a3.75 3.75 0 0 0-3.75-3.75h-3A3.75 3.75 0 0 0 5.25 18v1.5"/><path d="M10.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M18 19.5v-1.5a3.75 3.75 0 0 0-2.25-3.43"/><path d="M14.25 4.8a3 3 0 0 1 0 5.4"/>',
        fields: '<rect x="4.5" y="5.25" width="15" height="13.5" rx="2.25"/><path d="M8.25 9h7.5"/><path d="M8.25 12h7.5"/><path d="M8.25 15h4.5"/>',
        chevronRight: '<path d="m9 6 6 6-6 6"/>',
        chevronDown: '<path d="m6 9 6 6 6-6"/>',
        close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
        plus: '<path d="M12 5.25v13.5"/><path d="M5.25 12h13.5"/>',
        download: '<path d="M12 4.5v10.5"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
        swap: '<path d="M7.5 7.5h10.5"/><path d="m14.25 4.5 3.75 3-3.75 3"/><path d="M16.5 16.5H6"/><path d="m9.75 13.5-3.75 3 3.75 3"/>',
        barChart: '<path d="M4.5 19.5h15"/><path d="M7.5 16.5v-6"/><path d="M12 16.5V7.5"/><path d="M16.5 16.5v-4.5"/>'
    };
    const body = icons[name] || icons.chevronRight;
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

window.resetPrintModal = function() {
    const modal = document.getElementById('print-modal');
    const shell = modal?.firstElementChild;
    const titleEl = document.getElementById('print-modal-title');
    const contentEl = document.getElementById('print-content');
    const primaryBtn = document.getElementById('print-modal-primary');
    const secondaryBtn = document.getElementById('print-modal-secondary');
    if (titleEl) titleEl.innerText = '打印预览';
    if (contentEl) {
        contentEl.className = 'p-8 bg-white text-black overflow-y-auto flex-1';
        contentEl.innerHTML = '';
    }
    if (shell) {
        shell.className = 'bg-white shadow-2xl w-full max-w-3xl flex flex-col max-h-[95vh]';
    }
    if (primaryBtn) {
        primaryBtn.innerText = '打印本页';
        primaryBtn.className = 'px-4 py-1.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow';
        primaryBtn.onclick = () => window.print();
    }
    if (secondaryBtn) {
        secondaryBtn.className = 'hidden px-4 py-1.5 bg-slate-700 text-white rounded font-bold hover:bg-slate-800 shadow';
        secondaryBtn.innerText = '次要操作';
        secondaryBtn.onclick = null;
    }
    if (currentPrintObjectUrl) {
        URL.revokeObjectURL(currentPrintObjectUrl);
        currentPrintObjectUrl = null;
    }
}

window.openPrintModal = function({
    title = '打印预览',
    contentHtml = '',
    shellClass = 'bg-white shadow-2xl w-full max-w-3xl flex flex-col max-h-[95vh]',
    contentClass = 'p-8 bg-white text-black overflow-y-auto flex-1',
    primaryText = '打印本页',
    primaryClass = 'px-4 py-1.5 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow',
    primaryAction = null,
    secondaryText = '',
    secondaryClass = 'px-4 py-1.5 bg-slate-700 text-white rounded font-bold hover:bg-slate-800 shadow',
    secondaryAction = null
} = {}) {
    window.resetPrintModal();
    const modal = document.getElementById('print-modal');
    const shell = modal?.firstElementChild;
    const titleEl = document.getElementById('print-modal-title');
    const contentEl = document.getElementById('print-content');
    const primaryBtn = document.getElementById('print-modal-primary');
    const secondaryBtn = document.getElementById('print-modal-secondary');
    if (!modal || !contentEl || !primaryBtn) return;
    if (titleEl) titleEl.innerText = title;
    if (shell) shell.className = shellClass;
    contentEl.className = contentClass;
    contentEl.innerHTML = contentHtml;
    primaryBtn.innerText = primaryText;
    primaryBtn.className = primaryClass;
    primaryBtn.onclick = () => {
        if (typeof primaryAction === 'function') primaryAction();
    };
    if (secondaryBtn && secondaryText && typeof secondaryAction === 'function') {
        secondaryBtn.className = secondaryClass;
        secondaryBtn.innerText = secondaryText;
        secondaryBtn.onclick = () => secondaryAction();
    }
    modal.classList.remove('hidden');
}

// 通用弹窗关闭函数
window.closeModal = function(id) { 
    if (id === 'password-modal' && window.currentUser?.must_change_password) {
        window.showToast('当前账号仍在使用默认密码，请先完成修改', 'error');
        return;
    }
    if (id === 'print-modal') {
        window.resetPrintModal();
    }
    document.getElementById(id).classList.add('hidden'); 
}

// 体验升级：全局 Toast 提示系统
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const iconEl = document.createElement('span');
    const textEl = document.createElement('span');
    const bgColor = type === 'success' ? 'bg-green-500' : (type === 'error' ? 'bg-red-500' : 'bg-blue-500');
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    
    toast.className = `toast-enter text-white px-6 py-3 rounded shadow-lg flex items-center gap-2 ${bgColor}`;
    iconEl.innerText = icon;
    textEl.className = 'font-bold';
    textEl.innerText = String(message || '');
    toast.appendChild(iconEl);
    toast.appendChild(textEl);
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-enter-active');
    });

    setTimeout(() => {
        toast.classList.remove('toast-enter-active');
        toast.classList.add('toast-leave-active');
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

// 全局 API 拦截器 (携带 Token，处理过期)
window.apiFetch = async function(url, options = {}) {
    const requestOptions = { ...options };
    const res = await window.fetchWithAuth(url, requestOptions);
    if (res.status === 401) {
        if (requestOptions.skipUnauthorizedHandler) {
            return res;
        }
        window.showToast("登录状态已过期或被管理员修改，请重新登录！", 'error');
        window.clearCurrentAuthUser();
        setTimeout(() => location.reload(), 1500);
        throw new Error("Unauthorized");
    }
    return res;
}

// 按钮 Loading 状态防抖
window.toggleBtnLoading = function(btnId, isLoading, originalText = '') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<span class="spinner"></span> 处理中...`;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
        btn.disabled = false;
        btn.innerHTML = originalText || btn.dataset.originalText;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}

window.withButtonLoading = async function(btnId, task, originalText = '') {
    window.toggleBtnLoading(btnId, true, originalText);
    try {
        return await task();
    } finally {
        window.toggleBtnLoading(btnId, false, originalText);
    }
}
// 前端 XSS 防护：HTML 字符转义
window.escapeHtml = function(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.escapeAttr = function(text) {
    return window.escapeHtml(text).replace(/`/g, '&#096;');
}

window.renderHtmlCollection = function(items, renderItem, emptyHtml = '') {
    if (!Array.isArray(items) || items.length === 0) return emptyHtml;
    return items.map((item, index) => renderItem(item, index)).join('');
}
