import {
    clampNumber,
    resolveOrderPaymentStage,
    roundTo
} from '../utils/helpers.mjs';
import { normalizeBoothCode, splitBoothCodeList } from '../utils/booth-map.mjs';

const DEFAULT_SCALE_PIXELS_PER_METER = 40;
const SQL_IN_CHUNK_SIZE = 80;
const RUNTIME_VIEW_CACHE_TTL_MS = 5000;
const KV_RUNTIME_VIEW_PREFIX = 'rv:';
const KV_RUNTIME_VIEW_TTL_S = 30;
const ELIGIBLE_LINTEL_BOOTH_TYPES = new Set(['标摊', '豪标']);
const SPECIAL_DECORATION_BOOTH_TYPE = '光地';
const runtimeViewCache = new Map();

const STATUS_META = {
    locked: {
        code: 'locked',
        label: '已锁定',
        fillColor: '#6b7280',
        strokeColor: '#374151'
    },
    full_paid: {
        code: 'full_paid',
        label: '已付全款',
        fillColor: '#ef4444',
        strokeColor: '#991b1b'
    },
    deposit: {
        code: 'deposit',
        label: '已付定金',
        fillColor: '#3b82f6',
        strokeColor: '#1d4ed8'
    },
    reserved: {
        code: 'reserved',
        label: '已预定',
        fillColor: '#f59e0b',
        strokeColor: '#b45309'
    },
    available: {
        code: 'available',
        label: '可售',
        fillColor: '#ffffff',
        strokeColor: '#0f172a'
    }
};

function safeParseJson(rawValue, fallback) {
    try {
        if (rawValue === null || rawValue === undefined || rawValue === '') return fallback;
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
}

function getEffectiveScale(scalePixelsPerMeter) {
    const normalized = Number(scalePixelsPerMeter || 0);
    return normalized > 0 ? normalized : DEFAULT_SCALE_PIXELS_PER_METER;
}

function getDefaultCompanyRotation(widthPx, heightPx) {
    const safeHeight = Math.max(Number(heightPx || 0), 1);
    const ratio = Number(widthPx || 0) / safeHeight;
    if (ratio <= 0.8) return 90;
    return 0;
}

function chunkItems(items = [], chunkSize = SQL_IN_CHUNK_SIZE) {
    const output = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        output.push(items.slice(index, index + chunkSize));
    }
    return output;
}

function getLintelCompositeKey(orderId, boothCode) {
    return `${Number(orderId || 0)}::${normalizeBoothCode(boothCode)}`;
}

function isEligibleLintelBoothType(boothType) {
    return ELIGIBLE_LINTEL_BOOTH_TYPES.has(String(boothType || '').trim());
}

function isSpecialDecorationBoothType(boothType) {
    return String(boothType || '').trim() === SPECIAL_DECORATION_BOOTH_TYPE;
}

function isMissingTableError(error) {
    return /no such table/i.test(String(error?.message || ''));
}

export function getBoothStatusMeta(code) {
    return STATUS_META[code] || STATUS_META.available;
}

export function deriveBoothRuntimeStatus(storedStatus, activeOrders = []) {
    const normalizedOrders = Array.isArray(activeOrders) ? activeOrders : [];
    const normalizedStoredStatus = String(storedStatus || '').trim();

    if (normalizedStoredStatus === '已锁定' && normalizedOrders.length === 0) {
        return STATUS_META.locked;
    }
    if (normalizedOrders.length === 0) {
        return STATUS_META.available;
    }

    const totalPaidAmount = normalizedOrders.reduce((sum, order) => sum + Number(order?.paid_amount || 0), 0);
    const totalReceivableAmount = normalizedOrders.reduce((sum, order) => sum + Number(order?.total_amount || 0), 0);
    const paymentStage = resolveOrderPaymentStage(totalPaidAmount, totalReceivableAmount);
    return STATUS_META[paymentStage] || STATUS_META.reserved;
}

export function resolveBoothCompanyText(boothType, activeOrders = []) {
    if (!Array.isArray(activeOrders) || activeOrders.length === 0) {
        return {
            companyText: '',
            companyTextSource: '',
            companyNames: []
        };
    }
    const companyNames = activeOrders
        .map((order) => String(order?.booth_display_name || order?.company_name || '').trim())
        .filter(Boolean);
    if (activeOrders.length > 1) {
        return {
            companyText: companyNames.join('\n'),
            companyTextSource: 'joint_order_company_names',
            companyNames
        };
    }

    const order = activeOrders[0] || {};
    const displayName = String(order.booth_display_name || '').trim();
    const companyName = String(order.company_name || '').trim();
    const normalizedBoothType = String(boothType || '').trim();

    if (normalizedBoothType === '光地') {
        return {
            companyText: displayName || companyName,
            companyTextSource: displayName ? 'booth_display_name' : 'company_name',
            companyNames: [displayName || companyName].filter(Boolean)
        };
    }

    return {
        companyText: displayName || companyName,
        companyTextSource: displayName ? 'booth_display_name' : 'company_name',
        companyNames: [displayName || companyName].filter(Boolean)
    };
}

export function createDefaultLabelStyle(widthPx, heightPx) {
    const shortSide = Math.max(Math.min(Number(widthPx || 0), Number(heightPx || 0)), 32);
    return {
        boothNo: {
            anchorX: 0.5,
            anchorY: 0.2,
            fontSize: clampNumber(Math.round(shortSide * 0.18), 1, 26),
            rotation: 0,
            visible: true
        },
        company: {
            anchorX: 0.5,
            anchorY: 0.58,
            fontSize: clampNumber(Math.round(shortSide * 0.14), 1, 24),
            rotation: getDefaultCompanyRotation(widthPx, heightPx),
            visible: true
        }
    };
}

export function normalizeLabelStyle(rawStyle, widthPx, heightPx) {
    const defaults = createDefaultLabelStyle(widthPx, heightPx);
    const parsed = safeParseJson(rawStyle, {});
    const normalizeBlock = (blockKey) => {
        const fallback = defaults[blockKey];
        const source = parsed?.[blockKey] && typeof parsed[blockKey] === 'object' ? parsed[blockKey] : {};
        return {
            anchorX: roundTo(clampNumber(source.anchorX ?? fallback.anchorX, 0.05, 0.95), 3),
            anchorY: roundTo(clampNumber(source.anchorY ?? fallback.anchorY, 0.05, 0.95), 3),
            fontSize: roundTo(clampNumber(source.fontSize ?? fallback.fontSize, 1, 36), 2),
            rotation: roundTo(clampNumber(source.rotation ?? fallback.rotation, -180, 180), 2),
            visible: source.visible === undefined ? fallback.visible : Number(source.visible) !== 0
        };
    };
    return {
        boothNo: normalizeBlock('boothNo'),
        company: normalizeBlock('company'),
        companyTextOverride: String(parsed?.companyTextOverride || '').trim().slice(0, 80)
    };
}

export function normalizeBoothMapRecord(mapRow) {
    if (!mapRow) return null;
    return {
        ...mapRow,
        id: Number(mapRow.id || 0),
        project_id: Number(mapRow.project_id || 0),
        scale_pixels_per_meter: Number(mapRow.scale_pixels_per_meter || 0),
        default_stroke_width: Number(mapRow.default_stroke_width || 2),
        canvas_width: Number(mapRow.canvas_width || 0),
        canvas_height: Number(mapRow.canvas_height || 0),
        viewport_x: Number(mapRow.viewport_x || 0),
        viewport_y: Number(mapRow.viewport_y || 0),
        viewport_zoom: Number(mapRow.viewport_zoom || 1),
        calibration_json: safeParseJson(mapRow.calibration_json, {}),
        display_config: safeParseJson(mapRow.display_config_json, {})
    };
}

export function normalizeBoothMapItemRecord(itemRow, scalePixelsPerMeter = 0) {
    const effectiveScale = getEffectiveScale(scalePixelsPerMeter);
    const widthMeters = Number(itemRow.width_m || 0);
    const heightMeters = Number(itemRow.height_m || 0);
    const widthPx = roundTo(widthMeters * effectiveScale, 2);
    const heightPx = roundTo(heightMeters * effectiveScale, 2);
    return {
        ...itemRow,
        id: Number(itemRow.id || 0),
        project_id: Number(itemRow.project_id || 0),
        map_id: Number(itemRow.map_id || 0),
        width_m: widthMeters,
        height_m: heightMeters,
        area: Number(itemRow.area || 0),
        x: Number(itemRow.x || 0),
        y: Number(itemRow.y || 0),
        rotation: Number(itemRow.rotation || 0),
        stroke_width: Number(itemRow.stroke_width || 2),
        z_index: Number(itemRow.z_index || 0),
        hidden: Number(itemRow.hidden || 0),
        active_order_count: Number(itemRow.active_order_count || 0),
        points_json: safeParseJson(itemRow.points_json, []),
        label_style: normalizeLabelStyle(itemRow.label_style_json, widthPx, heightPx)
    };
}

export async function getProjectBoothOrdersMap(env, projectId, boothCodes = []) {
    const normalizedBoothCodeSet = new Set(
        (Array.isArray(boothCodes) ? boothCodes : [])
            .map((code) => normalizeBoothCode(code))
            .filter(Boolean)
    );
    const ordersMap = new Map();
    if (normalizedBoothCodeSet.size === 0) return ordersMap;

        const normalizedBoothIdsSql = `
            REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(
                            REPLACE(
                                REPLACE(
                                    REPLACE(UPPER(COALESCE(o.booth_id, '')), ' ', ''),
                                    '，', ','
                                ),
                                '、', ','
                            ),
                            ';', ','
                        ),
                        '/', ','
                    ),
                    CHAR(10), ','
                ),
                CHAR(13), ','
            )
        `;
        const boothCodeList = Array.from(normalizedBoothCodeSet);
        const seenOrderKeys = new Set();

        for (let index = 0; index < boothCodeList.length; index += 25) {
                const boothCodeChunk = boothCodeList.slice(index, index + 25);
                const chunkFilterSql = boothCodeChunk
                        .map(() => `INSTR(',' || ${normalizedBoothIdsSql} || ',', ',' || ? || ',') > 0`)
                        .join(' OR ');
                const results = await env.DB.prepare(`
                    SELECT
                        o.id,
                        o.booth_id,
                        o.company_name,
                        o.booth_display_name,
                        o.sales_name,
                        COALESCE(ps.paid_amount, o.paid_amount, 0) AS paid_amount,
                        o.total_amount,
                        o.created_at,
                        o.reserved_release_due_at
                    FROM Orders o
                    LEFT JOIN (
                        SELECT order_id, ROUND(COALESCE(SUM(amount), 0), 2) AS paid_amount
                        FROM Payments
                        WHERE deleted_at IS NULL
                        GROUP BY order_id
                    ) ps ON ps.order_id = o.id
                    WHERE o.project_id = ?
                        AND o.status = '正常'
                        AND COALESCE(o.booth_id, '') != ''
                        AND (${chunkFilterSql})
                    ORDER BY datetime(o.created_at) ASC, o.id ASC
                `).bind(Number(projectId), ...boothCodeChunk).all();

                (results.results || []).forEach((row) => {
                        const orderKey = Number(row.id || 0);
                        if (orderKey && seenOrderKeys.has(orderKey)) return;
                        if (orderKey) seenOrderKeys.add(orderKey);

                        splitBoothCodeList(row.booth_id).forEach((boothCode) => {
                                if (!normalizedBoothCodeSet.has(boothCode)) return;
                                if (!ordersMap.has(boothCode)) {
                                        ordersMap.set(boothCode, []);
                                }
                                ordersMap.get(boothCode).push(row);
                        });
                });
        }

    return ordersMap;
}

async function getProjectLintelBusinessConfirmationMap(env, projectId, orderBoothPairs = []) {
    const normalizedPairs = Array.from(new Set((Array.isArray(orderBoothPairs) ? orderBoothPairs : [])
        .map((item) => getLintelCompositeKey(item?.order_id, item?.booth_code))
        .filter((key) => !key.endsWith('::'))))
        .map((key) => {
            const [orderIdText, boothCode] = key.split('::');
            return {
                order_id: Number(orderIdText || 0),
                booth_code: normalizeBoothCode(boothCode)
            };
        })
        .filter((item) => item.order_id > 0 && item.booth_code);
    if (normalizedPairs.length === 0) return new Map();

    const lintelBusinessMap = new Map();
    for (const chunk of chunkItems(normalizedPairs, 25)) {
        const pairSql = chunk.map(() => '(order_id = ? AND booth_code = ?)').join(' OR ');
        const params = [Number(projectId), ...chunk.flatMap((item) => [item.order_id, item.booth_code])];
        const rows = ((await env.DB.prepare(`
          SELECT order_id, booth_code, business_confirmed
          FROM ExhibitionLintels
          WHERE project_id = ?
            AND (${pairSql})
        `).bind(...params).all()).results || []);
        rows.forEach((row) => {
            lintelBusinessMap.set(
                getLintelCompositeKey(row.order_id, row.booth_code),
                Number(row.business_confirmed || 0) === 1 ? 1 : 0
            );
        });
    }
    return lintelBusinessMap;
}

async function getProjectSpecialDecorationReportMap(env, projectId, orderIds = []) {
    const normalizedOrderIds = Array.from(new Set((Array.isArray(orderIds) ? orderIds : [])
        .map((orderId) => Number(orderId || 0))
        .filter((orderId) => orderId > 0)));
    const reportMap = new Map();
    if (normalizedOrderIds.length === 0) return reportMap;
    try {
        for (const chunk of chunkItems(normalizedOrderIds)) {
            const placeholders = chunk.map(() => '?').join(',');
            const rows = ((await env.DB.prepare(`
              SELECT order_id, reported
              FROM ExhibitionSpecialDecorationReports
              WHERE project_id = ?
                AND order_id IN (${placeholders})
            `).bind(Number(projectId), ...chunk).all()).results || []);
            rows.forEach((row) => {
                reportMap.set(Number(row.order_id || 0), Number(row.reported || 0) === 1 ? 1 : 0);
            });
        }
    } catch (error) {
        if (isMissingTableError(error)) return reportMap;
        throw error;
    }
    return reportMap;
}

function deriveLintelRuntimeStatus(item, activeOrders = [], lintelBusinessMap = new Map()) {
    const normalizedOrders = Array.isArray(activeOrders) ? activeOrders : [];
    if (!isEligibleLintelBoothType(item?.booth_type) || normalizedOrders.length === 0) {
        return {
            code: 'not_applicable',
            label: '不涉及楣板',
            businessConfirmed: null
        };
    }
    const normalizedBoothCode = normalizeBoothCode(item?.booth_code);
    const allConfirmed = normalizedOrders.every((order) => lintelBusinessMap.get(getLintelCompositeKey(order?.id, normalizedBoothCode)) === 1);
    return allConfirmed
        ? {
            code: 'confirmed',
            label: '楣板已业务确认',
            businessConfirmed: 1
        }
        : {
            code: 'unconfirmed',
            label: '楣板未业务确认',
            businessConfirmed: 0
        };
}

function deriveExhibitionRuntimeStatus(item, activeOrders = [], lintelStatusMeta = {}, specialDecorationReportMap = new Map()) {
    const normalizedOrders = Array.isArray(activeOrders) ? activeOrders : [];
    if (isEligibleLintelBoothType(item?.booth_type)) {
        if (lintelStatusMeta?.code === 'confirmed') {
            return {
                code: 'lintel_confirmed',
                label: '楣板已确认',
                source: 'lintel'
            };
        }
        if (lintelStatusMeta?.code === 'unconfirmed') {
            return {
                code: 'lintel_unconfirmed',
                label: '楣板未确认',
                source: 'lintel'
            };
        }
        return {
            code: 'not_applicable',
            label: '不涉及展务',
            source: 'lintel'
        };
    }
    if (!isSpecialDecorationBoothType(item?.booth_type) || normalizedOrders.length === 0) {
        return {
            code: 'not_applicable',
            label: '不涉及展务',
            source: 'none'
        };
    }
    const allReported = normalizedOrders.every((order) => specialDecorationReportMap.get(Number(order?.id || 0)) === 1);
    return allReported
        ? {
            code: 'special_decoration_reported',
            label: '光地已报图',
            source: 'special_decoration'
        }
        : {
            code: 'special_decoration_unreported',
            label: '光地未报图',
            source: 'special_decoration'
        };
}

export async function getBoothMapDetail(env, projectId, mapId, options = {}) {
    const mapRow = await env.DB.prepare(`
      SELECT *
      FROM BoothMaps
      WHERE id = ? AND project_id = ?
    `).bind(Number(mapId), Number(projectId)).first();
    if (!mapRow) return null;

    const normalizedMap = normalizeBoothMapRecord(mapRow);
    const includeActiveOrderCount = options?.includeActiveOrderCount !== false;
    const activeOrderSelectSql = ', 0 AS active_order_count';
    const activeOrderJoinSql = '';
    const itemQuery = `
      SELECT
        bmi.*,
        b.status AS booth_status,
        b.source AS booth_source
        ${activeOrderSelectSql}
      FROM BoothMapItems bmi
      LEFT JOIN Booths b ON b.project_id = bmi.project_id AND b.id = bmi.booth_code
      ${activeOrderJoinSql}
      WHERE bmi.map_id = ? AND bmi.project_id = ?
      ORDER BY bmi.z_index ASC, bmi.id ASC
    `;
    const itemQueryParams = [Number(mapId), Number(projectId)];
    const itemRows = ((await env.DB.prepare(itemQuery).bind(...itemQueryParams).all()).results || []);
    const activeOrderCountMap = includeActiveOrderCount
        ? await getProjectBoothOrdersMap(env, Number(projectId), itemRows.map((row) => row.booth_code))
        : new Map();

    return {
        map: normalizedMap,
        items: itemRows.map((row) => ({
            ...normalizeBoothMapItemRecord(row, normalizedMap.scale_pixels_per_meter),
            active_order_count: includeActiveOrderCount
                ? Number((activeOrderCountMap.get(normalizeBoothCode(row.booth_code)) || []).length)
                : 0
        }))
    };
}

export async function getBoothMapRuntimeView(env, projectId, mapId) {
    const detail = await getBoothMapDetail(env, projectId, mapId, {
        includeActiveOrderCount: false
    });
    if (!detail) return null;

    const ordersMap = await getProjectBoothOrdersMap(
        env,
        Number(projectId),
        detail.items.map((item) => item.booth_code)
    );
    const lintelBusinessMap = await getProjectLintelBusinessConfirmationMap(
        env,
        Number(projectId),
        detail.items.flatMap((item) => {
            if (!isEligibleLintelBoothType(item.booth_type)) return [];
            const normalizedBoothCode = normalizeBoothCode(item.booth_code);
            const activeOrders = ordersMap.get(normalizedBoothCode) || [];
            return activeOrders.map((order) => ({
                order_id: Number(order.id || 0),
                booth_code: normalizedBoothCode
            }));
        })
    );
    const activeOrderIds = Array.from(new Set([...ordersMap.values()]
        .flatMap((orders) => Array.isArray(orders) ? orders : [])
        .map((order) => Number(order?.id || 0))
        .filter((orderId) => orderId > 0)));
    const specialDecorationReportMap = await getProjectSpecialDecorationReportMap(env, Number(projectId), activeOrderIds);

    return {
        map: detail.map,
        items: detail.items.map((item) => {
            const normalizedBoothCode = normalizeBoothCode(item.booth_code);
            const activeOrders = ordersMap.get(normalizedBoothCode) || [];
            const statusMeta = deriveBoothRuntimeStatus(item.status || item.booth_status, activeOrders);
            const lintelStatusMeta = deriveLintelRuntimeStatus(item, activeOrders, lintelBusinessMap);
            const exhibitionStatusMeta = deriveExhibitionRuntimeStatus(item, activeOrders, lintelStatusMeta, specialDecorationReportMap);
            const companyInfo = resolveBoothCompanyText(item.booth_type, activeOrders);
            const orderSummaries = activeOrders.map((order) => ({
                company_name: String(order.company_name || '').trim(),
                sales_name: String(order.sales_name || '').trim(),
                paid_amount: Number(order.paid_amount || 0),
                total_amount: Number(order.total_amount || 0),
                reserved_release_due_at: String(order.reserved_release_due_at || ''),
                reserved_release_remaining_seconds: order.reserved_release_due_at
                    ? Math.max(0, Math.floor((Date.parse(String(order.reserved_release_due_at).replace(' ', 'T') + '+08:00') - Date.now()) / 1000))
                    : null,
                created_at: String(order.created_at || '')
            }));
            return {
                ...item,
                active_order_count: activeOrders.length,
                status_code: statusMeta.code,
                status_label: statusMeta.label,
                fill_color: statusMeta.fillColor,
                stroke_color: statusMeta.strokeColor,
                lintel_status_code: lintelStatusMeta.code,
                lintel_status_label: lintelStatusMeta.label,
                lintel_business_confirmed: lintelStatusMeta.businessConfirmed,
                exhibition_status_code: exhibitionStatusMeta.code,
                exhibition_status_label: exhibitionStatusMeta.label,
                exhibition_status_source: exhibitionStatusMeta.source,
                booth_no_text: normalizedBoothCode,
                company_text: companyInfo.companyText,
                company_text_source: companyInfo.companyTextSource,
                company_names: companyInfo.companyNames,
                order_summaries: orderSummaries
            };
        })
    };
}

function scheduleRuntimeViewKvWrite(env, executionCtx, cacheKey, value) {
    if (!env?.CACHE || !value) return;
    const writeTask = env.CACHE.put(
        `${KV_RUNTIME_VIEW_PREFIX}${cacheKey}`,
        JSON.stringify(value),
        { expirationTtl: KV_RUNTIME_VIEW_TTL_S }
    ).catch(() => {});
    if (typeof executionCtx?.waitUntil === 'function') {
        executionCtx.waitUntil(writeTask);
        return;
    }
    void writeTask;
}

export async function getCachedBoothMapRuntimeView(env, projectId, mapId, options = {}) {
    const cacheKey = `${projectId}:${mapId}`;

    // L1: per-isolate in-memory cache (5 s TTL)
    const cached = runtimeViewCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }

    // L2: KV shared cache (30 s TTL, optional – skip if CACHE binding absent)
    if (env.CACHE) {
        try {
            const kvValue = await env.CACHE.get(`${KV_RUNTIME_VIEW_PREFIX}${cacheKey}`, 'json');
            if (kvValue) {
                runtimeViewCache.set(cacheKey, {
                    value: kvValue,
                    expiresAt: Date.now() + RUNTIME_VIEW_CACHE_TTL_MS
                });
                return kvValue;
            }
        } catch (_) { /* KV read failure is not fatal */ }
    }

    // L3: D1 query (expensive)
    const result = await getBoothMapRuntimeView(env, projectId, mapId);
    if (result) {
        runtimeViewCache.set(cacheKey, {
            value: result,
            expiresAt: Date.now() + RUNTIME_VIEW_CACHE_TTL_MS
        });
        scheduleRuntimeViewKvWrite(env, options.executionCtx, cacheKey, result);
    }
    return result;
}

export async function invalidateRuntimeViewCache(env, projectId, mapId) {
    // L1: in-memory
    if (mapId !== undefined) {
        runtimeViewCache.delete(`${projectId}:${mapId}`);
    } else {
        for (const key of runtimeViewCache.keys()) {
            if (key.startsWith(`${projectId}:`)) {
                runtimeViewCache.delete(key);
            }
        }
    }
    // L2: KV (only specific key; prefix-delete not supported by KV)
    if (env?.CACHE && mapId !== undefined) {
        try {
            await env.CACHE.delete(`${KV_RUNTIME_VIEW_PREFIX}${projectId}:${mapId}`);
        } catch (_) { /* KV delete failure is not fatal */ }
    }
}
