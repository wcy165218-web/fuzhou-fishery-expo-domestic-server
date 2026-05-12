import {
    clampNumber,
    getChinaTimestamp,
    normalizeUploadExtension,
    roundTo,
    validateBoothMapImageFile
} from '../utils/helpers.mjs';
import { buildPrivateFileCacheHeaders, errorResponse, internalErrorResponse, isEtagNotModified } from '../utils/response.mjs';
import { BOOTH_MAP_IMAGE_UPLOAD_BODY_LIMIT, readFormDataBody, readJsonBody } from '../utils/request.mjs';
import {
    getBoothMapDetail,
    getCachedBoothMapRuntimeView,
    invalidateRuntimeViewCache,
    normalizeLabelStyle
} from '../services/booth-map-view.mjs';
import { invalidateHomeDashboardCache } from '../services/home-dashboard-cache.mjs';
import { isSuperAdmin } from '../utils/auth.mjs';
import {
    deriveHallFromBoothCode,
    normalizeBoothCode,
    resolveHallFromMapName,
    splitBoothCodeList
} from '../utils/booth-map.mjs';

const ALLOWED_BOOTH_TYPES = new Set(['标摊', '豪标', '光地']);
const ALLOWED_OPENING_TYPES = new Set(['单开口', '双开口', '三开口', '四面开']);
const SQL_IN_CHUNK_SIZE = 80;
const BATCH_CHUNK_SIZE = 40;
const MAX_BOOTH_MAP_ITEMS = 300;
const MAX_DELETED_BOOTH_CODES = 300;
const D1_FREE_TIER_CALL_BUDGET = 45;

function buildAssetEdgeCacheKey(url, key, mapId) {
    return new Request(`${url.origin}/api/booth-map-asset/${encodeURIComponent(key)}?mapId=${mapId}&_edge=1`);
}

function purgeAssetEdgeCache(url, key, mapId) {
    caches.default.delete(buildAssetEdgeCacheKey(url, key, mapId)).catch(() => {});
}

function deleteR2ObjectQuietly(bucket, key) {
    if (!bucket || !key) return;
    bucket.delete(key).catch((err) => console.warn('R2 delete failed:', key, err));
}

function jsonResponse(payload, corsHeaders) {
    return new Response(JSON.stringify(payload), { headers: corsHeaders });
}

function normalizeMapName(rawValue) {
    return String(rawValue || '').trim();
}

function normalizeMapDimension(rawValue, fallbackValue) {
    const normalized = Number(rawValue);
    if (!Number.isFinite(normalized)) return fallbackValue;
    return clampNumber(normalized, 320, 5000);
}

function normalizeViewportValue(rawValue, fallbackValue = 0) {
    const normalized = Number(rawValue);
    if (!Number.isFinite(normalized)) return fallbackValue;
    return roundTo(normalized, 2);
}

function normalizeScaleValue(rawValue) {
    const normalized = Number(rawValue);
    if (!Number.isFinite(normalized) || normalized < 0) return 0;
    return roundTo(clampNumber(normalized, 0, 1000), 4);
}

function normalizeStrokeWidth(rawValue) {
    const normalized = Number(rawValue);
    if (!Number.isFinite(normalized)) return 2;
    return roundTo(clampNumber(normalized, 1, 12), 2);
}

function safeParseJson(rawValue, fallback) {
    try {
        if (rawValue === null || rawValue === undefined || rawValue === '') return fallback;
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
}

function normalizeShapeType(rawValue) {
    const normalized = String(rawValue || '').trim().toLowerCase();
    if (normalized === 'trapezoid') return 'trapezoid';
    if (normalized === 'l' || normalized === 'l-shape') return 'l';
    if (normalized === 'polygon') return 'polygon';
    return 'rect';
}

function getDefaultShapePoints(shapeType) {
    if (shapeType === 'trapezoid') {
        return [
            { x: 0.15, y: 0 },
            { x: 0.85, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 }
        ];
    }
    if (shapeType === 'l') {
        return [
            { x: 0, y: 0 },
            { x: 0.58, y: 0 },
            { x: 0.58, y: 0.42 },
            { x: 1, y: 0.42 },
            { x: 1, y: 1 },
            { x: 0, y: 1 }
        ];
    }
    return [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
    ];
}

function normalizeShapePoints(rawValue, shapeType) {
    const parsed = Array.isArray(rawValue) ? rawValue : safeParseJson(rawValue, []);
    const points = (Array.isArray(parsed) ? parsed : [])
        .map((point) => ({
            x: roundTo(clampNumber(Number(point?.x), 0, 1), 4),
            y: roundTo(clampNumber(Number(point?.y), 0, 1), 4)
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    return points.length >= 3 ? points : getDefaultShapePoints(shapeType);
}

function calculatePolygonAreaRatio(points) {
    const normalized = Array.isArray(points) ? points : [];
    if (normalized.length < 3) return 1;
    let sum = 0;
    normalized.forEach((point, index) => {
        const next = normalized[(index + 1) % normalized.length];
        sum += Number(point.x || 0) * Number(next.y || 0) - Number(next.x || 0) * Number(point.y || 0);
    });
    return roundTo(Math.abs(sum) / 2, 6);
}

function normalizeBooleanFlag(rawValue) {
    return Number(rawValue || 0) ? 1 : 0;
}

function chunkItems(items = [], chunkSize = SQL_IN_CHUNK_SIZE) {
    const output = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        output.push(items.slice(index, index + chunkSize));
    }
    return output;
}

async function executeStatementsInChunks(env, statements = [], chunkSize = BATCH_CHUNK_SIZE) {
    for (const statementChunk of chunkItems(statements, chunkSize)) {
        if (statementChunk.length === 0) continue;
        await env.DB.batch(statementChunk);
    }
}

async function getActiveReferencedBoothCodes(env, projectId, boothCodes) {
    const normalizedBoothCodes = Array.from(new Set(
        (Array.isArray(boothCodes) ? boothCodes : [])
            .map((code) => normalizeBoothCode(code))
            .filter(Boolean)
    ));
    if (normalizedBoothCodes.length === 0) return [];
    const referencedCodes = new Set();
    const normalizedBoothCodeSet = new Set(normalizedBoothCodes);
    const results = await env.DB.prepare(`
      SELECT booth_id
      FROM Orders
      WHERE project_id = ?
        AND status = '正常'
        AND COALESCE(booth_id, '') != ''
    `).bind(Number(projectId)).all();
    (results.results || []).forEach((row) => {
        splitBoothCodeList(row.booth_id).forEach((boothCode) => {
            if (normalizedBoothCodeSet.has(boothCode)) referencedCodes.add(boothCode);
        });
    });
    return Array.from(referencedCodes);
}

async function getOccupiedBoothMapRows(env, projectId, mapId, boothCodes) {
    const normalizedBoothCodes = Array.from(new Set(
        (Array.isArray(boothCodes) ? boothCodes : [])
            .map((code) => normalizeBoothCode(code))
            .filter(Boolean)
    ));
    if (normalizedBoothCodes.length === 0) return [];
    const occupiedRows = [];
    for (const boothCodeChunk of chunkItems(normalizedBoothCodes)) {
        const placeholders = boothCodeChunk.map(() => '?').join(',');
        const results = await env.DB.prepare(`
          SELECT booth_code, map_id
          FROM BoothMapItems
          WHERE project_id = ?
            AND booth_code IN (${placeholders})
            AND map_id <> ?
        `).bind(Number(projectId), ...boothCodeChunk, Number(mapId)).all();
        occupiedRows.push(...(results.results || []));
    }
    return occupiedRows;
}

function ensureSuperAdminOnly(currentUser, corsHeaders) {
    if (isSuperAdmin(currentUser)) return null;
    return errorResponse('仅超级管理员可操作展位图', 403, corsHeaders);
}

export function estimateBoothMapSaveD1CallCount({
    itemCount = 0,
    removedCount = 0,
    renamedCount = 0,
    orderSyncStatementCount = 0,
    occupiedReadCalls = 0,
    removedReferencedReadCalls = 0,
    renamedReferencedReadCalls = 0,
    orderSyncReadCalls = 0
} = {}) {
    const writeStatementCount = (Number(removedCount || 0) * 2)
        + (Number(renamedCount || 0) * 2)
        + (Number(itemCount || 0) * 2)
        + Number(orderSyncStatementCount || 0)
        + 1;
    return 3
        + Number(occupiedReadCalls || 0)
        + Number(removedReferencedReadCalls || 0)
        + Number(renamedReferencedReadCalls || 0)
        + Number(orderSyncReadCalls || 0)
        + Math.ceil(writeStatementCount / BATCH_CHUNK_SIZE);
}

function getBoothPriceUnit(boothType) {
    return String(boothType || '').trim() === '光地' ? '平米' : '个';
}

function buildRenamedBoothCodeMap(normalizedItems, incomingItems) {
    const renamedBoothCodeMap = new Map();
    (Array.isArray(normalizedItems) ? normalizedItems : []).forEach((item, index) => {
        const previousBoothCode = normalizeBoothCode(incomingItems?.[index]?.previous_booth_code);
        if (previousBoothCode && previousBoothCode !== item.booth_code) {
            renamedBoothCodeMap.set(previousBoothCode, item.booth_code);
        }
    });
    return renamedBoothCodeMap;
}

export function replaceOrderBoothCodes(rawBoothId, renamedBoothCodeMap) {
    const boothIds = splitBoothCodeList(rawBoothId);
    if (boothIds.length === 0 || !(renamedBoothCodeMap instanceof Map) || renamedBoothCodeMap.size === 0) {
        return boothIds.join(', ');
    }
    return boothIds
        .map((boothId) => renamedBoothCodeMap.get(boothId) || boothId)
        .join(', ');
}

async function getBoothRowsByCode(env, projectId, boothCodes) {
    const normalizedBoothCodes = Array.from(new Set(
        (Array.isArray(boothCodes) ? boothCodes : [])
            .map((code) => normalizeBoothCode(code))
            .filter(Boolean)
    ));
    const rowsByCode = new Map();
    if (normalizedBoothCodes.length === 0) return rowsByCode;
    for (const boothCodeChunk of chunkItems(normalizedBoothCodes)) {
        const placeholders = boothCodeChunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
          SELECT id, hall, type, area, price_unit
          FROM Booths
          WHERE project_id = ?
            AND id IN (${placeholders})
        `).bind(Number(projectId), ...boothCodeChunk).all()).results || []);
        rows.forEach((row) => {
            const boothCode = normalizeBoothCode(row.id);
            if (!boothCode) return;
            rowsByCode.set(boothCode, {
                id: boothCode,
                hall: String(row.hall || ''),
                type: String(row.type || ''),
                area: Number(row.area || 0),
                price_unit: String(row.price_unit || getBoothPriceUnit(row.type))
            });
        });
    }
    return rowsByCode;
}

async function buildOrderSyncStatementsForBoothMapSave(env, projectId, normalizedItems, renamedBoothCodeMap, nowText) {
    if ((!Array.isArray(normalizedItems) || normalizedItems.length === 0) && (!(renamedBoothCodeMap instanceof Map) || renamedBoothCodeMap.size === 0)) {
        return { statements: [], affectedOrderIds: [], affectedBoothCodes: [] };
    }
    const itemRowsByCode = new Map(
        (Array.isArray(normalizedItems) ? normalizedItems : []).map((item) => [
            item.booth_code,
            {
                id: item.booth_code,
                hall: item.hall,
                type: item.booth_type,
                area: Number(item.area || 0),
                price_unit: getBoothPriceUnit(item.booth_type)
            }
        ])
    );
    const directlyChangedBoothCodes = new Set(itemRowsByCode.keys());
    const renamedFromCodes = new Set(renamedBoothCodeMap.keys());
    const activeOrderRows = ((await env.DB.prepare(`
      SELECT id, booth_id, area, price_unit
      FROM Orders
      WHERE project_id = ?
        AND status = '正常'
        AND COALESCE(booth_id, '') != ''
    `).bind(Number(projectId)).all()).results || []);

    const affectedOrders = [];
    const missingBoothCodes = new Set();
    activeOrderRows.forEach((order) => {
        const currentBoothIds = splitBoothCodeList(order.booth_id);
        if (currentBoothIds.length === 0) return;
        const nextBoothIds = currentBoothIds.map((boothId) => renamedBoothCodeMap.get(boothId) || boothId);
        const isAffected = currentBoothIds.some((boothId) => directlyChangedBoothCodes.has(boothId) || renamedFromCodes.has(boothId))
            || nextBoothIds.some((boothId) => directlyChangedBoothCodes.has(boothId));
        if (!isAffected) return;
        nextBoothIds.forEach((boothId) => {
            if (!itemRowsByCode.has(boothId)) missingBoothCodes.add(boothId);
        });
        affectedOrders.push({ order, currentBoothIds, nextBoothIds });
    });

    if (affectedOrders.length === 0) {
        return { statements: [], affectedOrderIds: [], affectedBoothCodes: [] };
    }

    const boothRowsByCode = await getBoothRowsByCode(env, projectId, Array.from(missingBoothCodes));
    const statements = [];
    const affectedOrderIds = [];
    const affectedBoothCodes = new Set();

    affectedOrders.forEach(({ order, currentBoothIds, nextBoothIds }) => {
        const boothRows = nextBoothIds
            .map((boothId) => itemRowsByCode.get(boothId) || boothRowsByCode.get(boothId))
            .filter(Boolean);
        if (boothRows.length !== nextBoothIds.length) return;
        const nextBoothId = nextBoothIds.join(', ');
        const nextArea = roundTo(boothRows.reduce((sum, row) => sum + Number(row.area || 0), 0), 2);
        const nextPriceUnit = boothRows.length === 1 ? boothRows[0].price_unit : '组合';
        const boothChanged = nextBoothId !== splitBoothCodeList(order.booth_id).join(', ');
        const areaChanged = Math.abs(Number(order.area || 0) - nextArea) >= 0.01;
        const priceUnitChanged = String(order.price_unit || '') !== String(nextPriceUnit || '');
        if (!boothChanged && !areaChanged && !priceUnitChanged) return;

        affectedOrderIds.push(Number(order.id || 0));
        currentBoothIds.forEach((boothId) => affectedBoothCodes.add(boothId));
        nextBoothIds.forEach((boothId) => affectedBoothCodes.add(boothId));
        statements.push(
            env.DB.prepare(`
              UPDATE Orders
              SET booth_id = ?,
                  area = ?,
                  price_unit = ?
              WHERE id = ? AND project_id = ?
            `).bind(nextBoothId, nextArea, nextPriceUnit, Number(order.id), Number(projectId))
        );
    });

    renamedBoothCodeMap.forEach((nextBoothCode, previousBoothCode) => {
        statements.push(
            env.DB.prepare(`
              UPDATE ExhibitionLintels
              SET booth_code = ?,
                  updated_at = ?
              WHERE project_id = ?
                AND booth_code = ?
            `).bind(nextBoothCode, nowText, Number(projectId), previousBoothCode)
        );
    });

    return {
        statements,
        affectedOrderIds: affectedOrderIds.filter(Boolean),
        affectedBoothCodes: Array.from(affectedBoothCodes)
    };
}

function normalizeBoothMapItemPayload(item, mapRecord, index) {
    const boothCode = normalizeBoothCode(item?.booth_code);
    const hall = deriveHallFromBoothCode(boothCode, item?.hall || resolveHallFromMapName(mapRecord?.name));
    const boothType = String(item?.booth_type || '').trim();
    const openingType = String(item?.opening_type || '').trim();
    const widthMeters = Number(item?.width_m);
    const heightMeters = Number(item?.height_m);
    const x = Number(item?.x);
    const y = Number(item?.y);
    const rotation = Number(item?.rotation || 0);
    const strokeWidth = Number(item?.stroke_width || 2);
    const zIndex = Number(item?.z_index || index + 1);
    const hidden = normalizeBooleanFlag(item?.hidden);
    const effectiveScale = Number(mapRecord?.scale_pixels_per_meter || 0) > 0 ? Number(mapRecord.scale_pixels_per_meter) : 40;
    const shapeType = normalizeShapeType(item?.shape_type);
    const points = normalizeShapePoints(item?.points_json, shapeType);

    if (!boothCode) {
        throw new Error(`第 ${index + 1} 个展位缺少展位号`);
    }
    if (!hall) {
        throw new Error(`展位 ${boothCode} 缺少馆号`);
    }
    if (!ALLOWED_BOOTH_TYPES.has(boothType)) {
        throw new Error(`展位 ${boothCode} 的类型无效`);
    }
    if (!Number.isFinite(widthMeters) || widthMeters <= 0 || !Number.isFinite(heightMeters) || heightMeters <= 0) {
        throw new Error(`展位 ${boothCode} 的长宽必须大于 0`);
    }
    if (boothType === '光地' && openingType) {
        throw new Error('光地不允许设置开口类型');
    }
    if (boothType !== '光地' && !ALLOWED_OPENING_TYPES.has(openingType)) {
        throw new Error('标摊或豪标必须选择开口类型');
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`展位 ${boothCode} 的画布坐标无效`);
    }

    const widthPx = roundTo(widthMeters * effectiveScale, 2);
    const heightPx = roundTo(heightMeters * effectiveScale, 2);
    const labelStyle = normalizeLabelStyle(item?.label_style || item?.label_style_json, widthPx, heightPx);

    return {
        id: Number(item?.id || 0),
        booth_code: boothCode,
        hall,
        booth_type: boothType,
        opening_type: boothType === '光地' ? '' : openingType,
        width_m: roundTo(widthMeters, 2),
        height_m: roundTo(heightMeters, 2),
        area: roundTo(widthMeters * heightMeters * calculatePolygonAreaRatio(points), 2),
        x: roundTo(x, 2),
        y: roundTo(y, 2),
        rotation: roundTo(rotation, 2),
        stroke_width: roundTo(clampNumber(strokeWidth, 1, 12), 2),
        shape_type: shapeType,
        points_json: JSON.stringify(points),
        label_style_json: JSON.stringify(labelStyle),
        z_index: Math.max(1, Number.isFinite(zIndex) ? Math.round(zIndex) : index + 1),
        hidden
    };
}

export async function handleBoothMapRoutes({
    request,
    env,
    url,
    ctx,
    currentUser,
    corsHeaders
}) {
    if (
        !url.pathname.startsWith('/api/booth-map')
        && url.pathname !== '/api/booth-maps'
        && url.pathname !== '/api/create-booth-map'
        && url.pathname !== '/api/update-booth-map'
        && url.pathname !== '/api/delete-booth-map'
        && url.pathname !== '/api/upload-booth-map-background'
        && url.pathname !== '/api/save-booth-map-items'
        && url.pathname !== '/api/delete-booth-map-background'
    ) {
        return null;
    }

    if (url.pathname === '/api/booth-maps' && request.method === 'GET') {
        const projectId = Number(url.searchParams.get('projectId') || 0);
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        const results = await env.DB.prepare(`
          SELECT
            bm.*,
            COUNT(bmi.id) AS item_count
          FROM BoothMaps bm
          LEFT JOIN BoothMapItems bmi ON bmi.map_id = bm.id AND bmi.project_id = bm.project_id
          WHERE bm.project_id = ?
          GROUP BY bm.id
          ORDER BY datetime(bm.updated_at) DESC, bm.id DESC
        `).bind(projectId).all();
        return jsonResponse({
            success: true,
            items: (results.results || []).map((row) => ({
                ...row,
                id: Number(row.id || 0),
                project_id: Number(row.project_id || 0),
                item_count: Number(row.item_count || 0),
                scale_pixels_per_meter: Number(row.scale_pixels_per_meter || 0),
                default_stroke_width: Number(row.default_stroke_width || 2),
                canvas_width: Number(row.canvas_width || 0),
                canvas_height: Number(row.canvas_height || 0),
                display_config_json: safeParseJson(row.display_config_json, {})
            }))
        }, corsHeaders);
    }

    if (url.pathname === '/api/create-booth-map' && request.method === 'POST') {
        const adminError = ensureSuperAdminOnly(currentUser, corsHeaders);
        if (adminError) return adminError;
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const projectId = Number(payload.projectId || 0);
        const name = normalizeMapName(payload.name);
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        if (!name) return errorResponse('请填写画布名称', 400, corsHeaders);
        const nowText = getChinaTimestamp();
        const result = await env.DB.prepare(`
          INSERT INTO BoothMaps (
            project_id, name, scale_pixels_per_meter, default_stroke_width, canvas_width, canvas_height,
            viewport_x, viewport_y, viewport_zoom, calibration_json, display_config_json, created_at, updated_at
          ) VALUES (?, ?, 0, 2, 1600, 900, 0, 0, 1, '{}', '{}', ?, ?)
        `).bind(projectId, name, nowText, nowText).run();
        return jsonResponse({
            success: true,
            id: Number(result.meta?.last_row_id || 0)
        }, corsHeaders);
    }

    if (url.pathname === '/api/update-booth-map' && request.method === 'POST') {
        const adminError = ensureSuperAdminOnly(currentUser, corsHeaders);
        if (adminError) return adminError;
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const mapId = Number(payload.id || 0);
        const projectId = Number(payload.projectId || 0);
        const name = normalizeMapName(payload.name);
        if (!mapId || !projectId) return errorResponse('缺少画布信息', 400, corsHeaders);
        if (!name) return errorResponse('请填写画布名称', 400, corsHeaders);
        const updatedAt = getChinaTimestamp();
        await env.DB.prepare(`
          UPDATE BoothMaps
          SET name = ?,
              scale_pixels_per_meter = ?,
              default_stroke_width = ?,
              canvas_width = ?,
              canvas_height = ?,
              viewport_x = ?,
              viewport_y = ?,
              viewport_zoom = ?,
              calibration_json = ?,
              display_config_json = ?,
              updated_at = ?
          WHERE id = ? AND project_id = ?
        `).bind(
            name,
            normalizeScaleValue(payload.scale_pixels_per_meter),
            normalizeStrokeWidth(payload.default_stroke_width),
            normalizeMapDimension(payload.canvas_width, 1600),
            normalizeMapDimension(payload.canvas_height, 900),
            normalizeViewportValue(payload.viewport_x, 0),
            normalizeViewportValue(payload.viewport_y, 0),
            normalizeViewportValue(payload.viewport_zoom, 1),
            JSON.stringify(payload.calibration_json && typeof payload.calibration_json === 'object' ? payload.calibration_json : {}),
            JSON.stringify(safeParseJson(payload.display_config_json, {})),
            updatedAt,
            mapId,
            projectId
        ).run();
        await invalidateRuntimeViewCache(env, projectId, mapId);
        return jsonResponse({ success: true, updated_at: updatedAt }, corsHeaders);
    }

    if (url.pathname === '/api/delete-booth-map' && request.method === 'POST') {
        const adminError = ensureSuperAdminOnly(currentUser, corsHeaders);
        if (adminError) return adminError;
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const mapId = Number(payload.id || 0);
        const projectId = Number(payload.projectId || 0);
        if (!mapId || !projectId) return errorResponse('缺少画布信息', 400, corsHeaders);
        const itemRows = ((await env.DB.prepare(`
          SELECT booth_code
          FROM BoothMapItems
          WHERE map_id = ? AND project_id = ?
        `).bind(mapId, projectId).all()).results || []);
        const boothCodes = itemRows.map((row) => normalizeBoothCode(row.booth_code)).filter(Boolean);
        const activeReferencedBoothCodes = await getActiveReferencedBoothCodes(env, projectId, boothCodes);
        if (activeReferencedBoothCodes.length > 0) {
            const previewText = activeReferencedBoothCodes.slice(0, 5).join('、');
            const suffix = activeReferencedBoothCodes.length > 5 ? ' 等' : '';
            return errorResponse(`以下展位已被订单引用，不能从展位图中删除：${previewText}${suffix}`, 400, corsHeaders);
        }
        const mapRow = await env.DB.prepare('SELECT background_image_key FROM BoothMaps WHERE id = ? AND project_id = ?')
            .bind(mapId, projectId).first();
        const oldBgKey = String(mapRow?.background_image_key || '').trim();
        const statements = [
            env.DB.prepare('DELETE FROM BoothMapItems WHERE map_id = ? AND project_id = ?').bind(mapId, projectId),
            env.DB.prepare('DELETE FROM Booths WHERE project_id = ? AND booth_map_id = ?').bind(projectId, mapId),
            env.DB.prepare('DELETE FROM BoothMaps WHERE id = ? AND project_id = ?').bind(mapId, projectId)
        ];
        await env.DB.batch(statements);
        if (oldBgKey) {
            purgeAssetEdgeCache(url, oldBgKey, mapId);
            deleteR2ObjectQuietly(env.BUCKET, oldBgKey);
        }
        return jsonResponse({ success: true }, corsHeaders);
    }

    if (url.pathname === '/api/booth-map-detail' && request.method === 'GET') {
        const mapId = Number(url.searchParams.get('id') || 0);
        const projectId = Number(url.searchParams.get('projectId') || 0);
        const includeActiveOrderCount = url.searchParams.get('includeActiveOrderCount') !== '0';
        if (!mapId || !projectId) return errorResponse('缺少画布信息', 400, corsHeaders);
        const detail = await getBoothMapDetail(env, projectId, mapId, { includeActiveOrderCount });
        if (!detail) return errorResponse('展位图不存在', 404, corsHeaders);
        return jsonResponse({
            success: true,
            map: detail.map,
            items: detail.items
        }, corsHeaders);
    }

    if (url.pathname === '/api/booth-map-runtime-view' && request.method === 'GET') {
        const mapId = Number(url.searchParams.get('id') || 0);
        const projectId = Number(url.searchParams.get('projectId') || 0);
        if (!mapId || !projectId) return errorResponse('缺少画布信息', 400, corsHeaders);
        const runtimeView = await getCachedBoothMapRuntimeView(env, projectId, mapId, { executionCtx: ctx });
        if (!runtimeView) return errorResponse('展位图不存在', 404, corsHeaders);
        const body = JSON.stringify({ success: true, map: runtimeView.map, items: runtimeView.items });
        const etag = `"rv-${runtimeView.items.length}-${String(runtimeView.map?.updated_at || '').replace(/\D/g, '')}"`;
        if (isEtagNotModified(request, etag)) {
            return new Response(null, { status: 304, headers: { ...corsHeaders, 'ETag': etag } });
        }
        return new Response(body, {
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'ETag': etag, 'Cache-Control': 'private, max-age=5, stale-while-revalidate=30' }
        });
    }

    if (url.pathname === '/api/upload-booth-map-background' && request.method === 'POST') {
        const adminError = ensureSuperAdminOnly(currentUser, corsHeaders);
        if (adminError) return adminError;
        const formData = await readFormDataBody(request, corsHeaders, { maxBytes: BOOTH_MAP_IMAGE_UPLOAD_BODY_LIMIT });
        if (formData instanceof Response) return formData;
        const file = formData.get('file');
        const mapId = Number(formData.get('mapId') || 0);
        const projectId = Number(formData.get('projectId') || 0);
        if (!mapId || !projectId) return errorResponse('缺少画布信息', 400, corsHeaders);
        const mapRow = await env.DB.prepare('SELECT id, background_image_key FROM BoothMaps WHERE id = ? AND project_id = ?')
            .bind(mapId, projectId).first();
        if (!mapRow) return errorResponse('展位图不存在', 404, corsHeaders);
        const uploadError = validateBoothMapImageFile(file);
        if (uploadError) return errorResponse(uploadError, 400, corsHeaders);
        const oldBgKey = String(mapRow.background_image_key || '').trim();
        const fileExt = normalizeUploadExtension(file.name);
        const fileKey = `booth_map_${projectId}_${mapId}_${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
        try {
            const fileBuffer = await file.arrayBuffer();
            await env.BUCKET.put(fileKey, fileBuffer, {
                httpMetadata: {
                    contentType: String(file.type || 'application/octet-stream').trim() || 'application/octet-stream'
                }
            });
            await env.DB.prepare(`
              UPDATE BoothMaps
              SET background_image_key = ?, updated_at = ?
              WHERE id = ? AND project_id = ?
            `).bind(fileKey, getChinaTimestamp(), mapId, projectId).run();
            if (oldBgKey) {
                purgeAssetEdgeCache(url, oldBgKey, mapId);
                deleteR2ObjectQuietly(env.BUCKET, oldBgKey);
            }
            return jsonResponse({ success: true, fileKey }, corsHeaders);
        } catch (error) {
            console.error('Upload booth map background failed:', error);
            return errorResponse('底图上传失败，请稍后重试', 500, corsHeaders);
        }
    }

    if (url.pathname === '/api/delete-booth-map-background' && request.method === 'POST') {
        const adminError = ensureSuperAdminOnly(currentUser, corsHeaders);
        if (adminError) return adminError;
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const mapId = Number(payload.mapId || payload.id || 0);
        const projectId = Number(payload.projectId || 0);
        if (!mapId || !projectId) return errorResponse('缺少画布信息', 400, corsHeaders);
        const oldMapRow = await env.DB.prepare('SELECT background_image_key FROM BoothMaps WHERE id = ? AND project_id = ?')
            .bind(mapId, projectId).first();
        const oldBgKey = String(oldMapRow?.background_image_key || '').trim();
        await env.DB.prepare(`
          UPDATE BoothMaps
          SET background_image_key = NULL, updated_at = ?
          WHERE id = ? AND project_id = ?
        `).bind(getChinaTimestamp(), mapId, projectId).run();
        if (oldBgKey) {
            purgeAssetEdgeCache(url, oldBgKey, mapId);
            deleteR2ObjectQuietly(env.BUCKET, oldBgKey);
        }
        return jsonResponse({ success: true }, corsHeaders);
    }

    if (url.pathname.startsWith('/api/booth-map-asset/') && request.method === 'GET') {
        const mapId = Number(url.searchParams.get('mapId') || 0);
        const key = decodeURIComponent(url.pathname.replace('/api/booth-map-asset/', ''));
        if (!mapId || !key) return errorResponse('缺少底图信息', 400, corsHeaders);

        // Edge Cache: check CF Cache API first (shared across requests, no Worker CPU)
        const edgeCacheKey = buildAssetEdgeCacheKey(url, key, mapId);
        try {
            const edgeCached = await caches.default.match(edgeCacheKey);
            if (edgeCached) {
                const edgeHeaders = new Headers(edgeCached.headers);
                if (corsHeaders['Access-Control-Allow-Origin']) {
                    edgeHeaders.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
                }
                const clientEtag = String(edgeCached.headers.get('etag') || '').trim();
                if (clientEtag && isEtagNotModified(request, clientEtag)) {
                    return new Response(null, { status: 304, headers: edgeHeaders });
                }
                return new Response(edgeCached.body, { headers: edgeHeaders });
            }
        } catch (_) { /* edge cache miss is fine */ }

        const mapRow = await env.DB.prepare(`
          SELECT background_image_key
          FROM BoothMaps
          WHERE id = ?
        `).bind(mapId).first();
        if (!mapRow || String(mapRow.background_image_key || '') !== key) {
            return errorResponse('文件不存在', 404, corsHeaders);
        }
        const object = await env.BUCKET.get(key);
        if (!object) return errorResponse('文件不存在', 404, corsHeaders);
        const etag = String(object.httpEtag || '').trim();
        if (isEtagNotModified(request, etag)) {
            const notModifiedHeaders = new Headers(buildPrivateFileCacheHeaders());
            if (corsHeaders['Access-Control-Allow-Origin']) {
                notModifiedHeaders.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
            }
            if (etag) notModifiedHeaders.set('etag', etag);
            return new Response(null, { status: 304, headers: notModifiedHeaders });
        }
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        if (etag) headers.set('etag', etag);
        headers.set('Cache-Control', 'public, max-age=86400');
        Object.entries(buildPrivateFileCacheHeaders()).forEach(([k, v]) => headers.set(k, v));

        if (corsHeaders['Access-Control-Allow-Origin']) {
            headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        }

        // Edge cache write: tee the body and fire-and-forget (never block the response)
        if (typeof object.body.tee === 'function') {
            const [clientStream, cacheStream] = object.body.tee();
            const cacheHeaders = new Headers(headers);
            cacheHeaders.delete('Access-Control-Allow-Origin');
            caches.default.put(edgeCacheKey, new Response(cacheStream, { headers: cacheHeaders })).catch(() => {});
            return new Response(clientStream, { headers });
        }
        return new Response(object.body, { headers });
    }

    if (url.pathname === '/api/save-booth-map-items' && request.method === 'POST') {
        const adminError = ensureSuperAdminOnly(currentUser, corsHeaders);
        if (adminError) return adminError;
        try {
            const payload = await readJsonBody(request, corsHeaders);
            if (payload instanceof Response) return payload;
            const projectId = Number(payload.projectId || 0);
            const mapId = Number(payload.mapId || 0);
            const replaceAll = payload.replaceAll !== false;
            if (!projectId || !mapId) return errorResponse('缺少画布信息', 400, corsHeaders);

            const detail = await getBoothMapDetail(env, projectId, mapId);
            if (!detail) return errorResponse('展位图不存在', 404, corsHeaders);

            const incomingItems = Array.isArray(payload.items) ? payload.items : [];
            if (incomingItems.length > MAX_BOOTH_MAP_ITEMS) {
                return errorResponse(`单次最多保存 ${MAX_BOOTH_MAP_ITEMS} 个展位`, 400, corsHeaders);
            }
            if (Array.isArray(payload.deleted_booth_codes) && payload.deleted_booth_codes.length > MAX_DELETED_BOOTH_CODES) {
                return errorResponse(`单次最多删除 ${MAX_DELETED_BOOTH_CODES} 个展位`, 400, corsHeaders);
            }
            const normalizedItems = incomingItems.map((item, index) =>
                normalizeBoothMapItemPayload(item, detail.map, index)
            );
            const boothCodes = normalizedItems.map((item) => item.booth_code);
            const requestedDeletedBoothCodes = Array.from(new Set(
                (Array.isArray(payload.deleted_booth_codes) ? payload.deleted_booth_codes : [])
                    .map((code) => normalizeBoothCode(code))
                    .filter(Boolean)
            ));
            const duplicateBoothCodes = boothCodes.filter((code, index) => boothCodes.indexOf(code) !== index);
            if (duplicateBoothCodes.length > 0) {
                return errorResponse(`展位号重复：${duplicateBoothCodes[0]}`, 400, corsHeaders);
            }

            if (boothCodes.length > 0) {
                const occupiedRows = await getOccupiedBoothMapRows(env, projectId, mapId, boothCodes);
                if (occupiedRows.length > 0) {
                    return errorResponse(`展位 ${occupiedRows[0].booth_code} 已存在于其他展位图中`, 400, corsHeaders);
                }
            }

            const existingRows = ((await env.DB.prepare(`
              SELECT booth_code
              FROM BoothMapItems
              WHERE project_id = ? AND map_id = ?
            `).bind(projectId, mapId).all()).results || []);
            const existingBoothCodes = existingRows.map((row) => normalizeBoothCode(row.booth_code)).filter(Boolean);
            const previousBoothCodes = Array.from(new Set(
                incomingItems
                    .map((item) => normalizeBoothCode(item?.previous_booth_code))
                    .filter(Boolean)
            ));
            const previousBoothCodeSet = new Set(previousBoothCodes);
            const activeTargetBoothCodes = await getActiveReferencedBoothCodes(env, projectId, boothCodes);
            const conflictingActiveTargetBoothCode = activeTargetBoothCodes.find((code) => !previousBoothCodeSet.has(code));
            if (conflictingActiveTargetBoothCode) {
                return errorResponse(`展位 ${conflictingActiveTargetBoothCode} 已被订单引用，不能作为新的展位号`, 400, corsHeaders);
            }
            if (replaceAll === false) {
                const existingBoothCodeSet = new Set(existingBoothCodes);
                const conflictingItem = normalizedItems.find((item, index) => {
                    const previousBoothCode = normalizeBoothCode(incomingItems[index]?.previous_booth_code);
                    if (!existingBoothCodeSet.has(item.booth_code)) return false;
                    if (previousBoothCode === item.booth_code) return false;
                    return !previousBoothCodeSet.has(item.booth_code);
                });
                if (conflictingItem) {
                    return errorResponse(`展位号重复：${conflictingItem.booth_code}`, 400, corsHeaders);
                }
            }
            const renamedBoothCodeMap = buildRenamedBoothCodeMap(normalizedItems, incomingItems);
            const renamedPreviousBoothCodes = Array.from(renamedBoothCodeMap.keys());
            const removedBoothCodes = replaceAll
                ? existingBoothCodes.filter((code) => !boothCodes.includes(code) && !renamedBoothCodeMap.has(code))
                : requestedDeletedBoothCodes.filter((code) => existingBoothCodes.includes(code) && !boothCodes.includes(code) && !renamedBoothCodeMap.has(code));

            const activeRemovedBoothCodes = await getActiveReferencedBoothCodes(env, projectId, removedBoothCodes);
            if (activeRemovedBoothCodes.length > 0) {
                const previewText = activeRemovedBoothCodes.slice(0, 5).join('、');
                const suffix = activeRemovedBoothCodes.length > 5 ? ' 等' : '';
                return errorResponse(`以下展位已被订单引用，不能从展位图中删除：${previewText}${suffix}`, 400, corsHeaders);
            }

            const nowText = getChinaTimestamp();
            const orderSyncResult = await buildOrderSyncStatementsForBoothMapSave(
                env,
                projectId,
                normalizedItems,
                renamedBoothCodeMap,
                nowText
            );
            const estimatedD1CallCount = estimateBoothMapSaveD1CallCount({
                itemCount: normalizedItems.length,
                removedCount: removedBoothCodes.length,
                renamedCount: renamedPreviousBoothCodes.length,
                orderSyncStatementCount: orderSyncResult.statements.length,
                occupiedReadCalls: boothCodes.length > 0 ? chunkItems(boothCodes).length : 0,
                removedReferencedReadCalls: removedBoothCodes.length > 0 ? 1 : 0,
                orderSyncReadCalls: normalizedItems.length > 0 || renamedBoothCodeMap.size > 0 ? 1 : 0
            });
            if (estimatedD1CallCount > D1_FREE_TIER_CALL_BUDGET) {
                return errorResponse('本次展位图变更过大，请拆分后重试', 400, corsHeaders);
            }

            const statements = [];
            removedBoothCodes.forEach((boothCode) => {
                statements.push(
                    env.DB.prepare('DELETE FROM BoothMapItems WHERE project_id = ? AND map_id = ? AND booth_code = ?')
                        .bind(projectId, mapId, boothCode)
                );
                statements.push(
                    env.DB.prepare('DELETE FROM Booths WHERE project_id = ? AND booth_map_id = ? AND id = ?')
                        .bind(projectId, mapId, boothCode)
                );
            });
            renamedPreviousBoothCodes.forEach((previousBoothCode) => {
                statements.push(
                    env.DB.prepare('DELETE FROM BoothMapItems WHERE project_id = ? AND map_id = ? AND booth_code = ?')
                        .bind(projectId, mapId, previousBoothCode)
                );
                statements.push(
                    env.DB.prepare('DELETE FROM Booths WHERE project_id = ? AND booth_map_id = ? AND id = ?')
                        .bind(projectId, mapId, previousBoothCode)
                );
            });

            for (let index = 0; index < normalizedItems.length; index += 1) {
                const item = normalizedItems[index];
                statements.push(env.DB.prepare(`
                  INSERT INTO BoothMapItems (
                    project_id, map_id, booth_code, hall, booth_type, opening_type,
                    width_m, height_m, area, x, y, rotation, stroke_width,
                    shape_type, points_json, label_style_json, z_index, hidden, created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(project_id, booth_code) DO UPDATE SET
                    map_id = excluded.map_id,
                    hall = excluded.hall,
                    booth_type = excluded.booth_type,
                    opening_type = excluded.opening_type,
                    width_m = excluded.width_m,
                    height_m = excluded.height_m,
                    area = excluded.area,
                    x = excluded.x,
                    y = excluded.y,
                    rotation = excluded.rotation,
                    stroke_width = excluded.stroke_width,
                    shape_type = excluded.shape_type,
                    points_json = excluded.points_json,
                    label_style_json = excluded.label_style_json,
                    z_index = excluded.z_index,
                    hidden = excluded.hidden,
                    updated_at = excluded.updated_at
                `).bind(
                    projectId,
                    mapId,
                    item.booth_code,
                    item.hall,
                    item.booth_type,
                    item.opening_type || null,
                    item.width_m,
                    item.height_m,
                    item.area,
                    item.x,
                    item.y,
                    item.rotation,
                    item.stroke_width,
                    item.shape_type,
                    item.points_json,
                    item.label_style_json,
                    item.z_index,
                    item.hidden,
                    nowText,
                    nowText
                ));
                statements.push(env.DB.prepare(`
                  INSERT INTO Booths (
                    id, project_id, hall, type, area, price_unit, base_price, status,
                    width_m, height_m, opening_type, booth_map_id, source
                  ) VALUES (?, ?, ?, ?, ?, ?, 0, '可售', ?, ?, ?, ?, 'map')
                  ON CONFLICT(id, project_id) DO UPDATE SET
                    hall = excluded.hall,
                    type = excluded.type,
                    area = excluded.area,
                    price_unit = excluded.price_unit,
                    width_m = excluded.width_m,
                    height_m = excluded.height_m,
                    opening_type = excluded.opening_type,
                    booth_map_id = excluded.booth_map_id,
                    source = excluded.source
                `).bind(
                    item.booth_code,
                    projectId,
                    item.hall,
                    item.booth_type,
                    item.area,
                    item.booth_type === '光地' ? '平米' : '个',
                    item.width_m,
                    item.height_m,
                    item.opening_type || null,
                    mapId
                ));
            }

            statements.push(...orderSyncResult.statements);
            statements.push(
                env.DB.prepare('UPDATE BoothMaps SET updated_at = ? WHERE id = ? AND project_id = ?')
                    .bind(nowText, mapId, projectId)
            );

            await executeStatementsInChunks(env, statements);
            invalidateRuntimeViewCache(env, projectId, mapId);
            invalidateHomeDashboardCache(projectId);
            return jsonResponse({
                success: true,
                saved_count: normalizedItems.length,
                synced_booth_count: normalizedItems.length,
                synced_order_count: orderSyncResult.affectedOrderIds.length,
                updated_at: nowText
            }, corsHeaders);
        } catch (error) {
            console.error('Save booth map items failed:', error);
            if (error instanceof Error && error.message) {
                return errorResponse(error.message, 400, corsHeaders);
            }
            return internalErrorResponse(corsHeaders);
        }
    }

    return null;
}
