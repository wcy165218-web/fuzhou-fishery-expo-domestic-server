import { canManageOrder, canViewOrderCommercialNotes, canViewSensitiveOrderFields, isAdminUser, isSuperAdmin } from '../utils/auth.mjs';
import {
    countDisplayNameUnits,
    findActiveAgentByName,
    getChinaTimestamp,
    hasMetaChanges,
    normalizeEditableFeeItems,
    toBoothCount,
    toNonNegativeNumber,
    validateStandardBoothDisplayName
} from '../utils/helpers.mjs';
import { errorResponse, internalErrorResponse } from '../utils/response.mjs';
import { readJsonBody } from '../utils/request.mjs';
import { acquireBoothLocks, releaseBoothLocks } from '../services/booth-locks.mjs';
import { syncBoothStatusByBoothIds } from '../services/booth-sync.mjs';
import { invalidateHomeDashboardCache } from '../services/home-dashboard-cache.mjs';
import { refreshOrderOverpaymentIssue } from '../services/overpayment.mjs';
import {
    applyRefrigeratorRentalBoothSnapshotSync,
    prepareRefrigeratorRentalBoothSnapshotSync
} from '../services/refrigerator-rental-sync.mjs';
import { normalizeBoothCode, splitBoothCodeList } from '../utils/booth-map.mjs';
import {
    ORDER_STATUS_ACTIVE,
    ORDER_STATUS_PENDING,
    buildReleaseDueAt,
    expireOverdueReservedOrders,
    expireOverdueReservedOrdersThrottled,
    getEffectivePaymentSummary,
    getOrderReleaseSettings,
    refreshOrderReleaseDue,
    releaseOrderToPending
} from '../services/order-release.mjs';

const SQL_IN_CHUNK_SIZE = 80;
const BATCH_CHUNK_SIZE = 40;
const ORDER_LIST_DEFAULT_PAGE_SIZE = 30;
const ORDER_LIST_MAX_PAGE_SIZE = 200;
const ORDER_LIST_SEARCH_MAX_BYTES = 40;
const MAX_SELECTED_BOOTHS = 20;
const PROFILE_MAX_LENGTH = 300;
const ORDER_LIST_ALLOWED_BOOTH_TYPES = new Set(['标摊', '豪标', '光地']);

function chunkItems(items = [], chunkSize = SQL_IN_CHUNK_SIZE) {
    const output = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        output.push(items.slice(index, index + chunkSize));
    }
    return output;
}

function resolveBoothDisplayName(boothType, payload) {
    const normalizedBoothType = String(boothType || '').trim();
    const standardName = String(payload.standard_booth_display_name || '').trim();
    const groundName = String(payload.ground_booth_display_name || '').trim();
    const companyName = String(payload.company_name || '').trim();
    if (normalizedBoothType === '光地') {
        return groundName || companyName;
    }
    return standardName;
}

function resolveCompositeBoothDisplayName(booths = [], payload = {}) {
    const normalizedBooths = Array.isArray(booths) ? booths : [];
    const hasStandardBooth = normalizedBooths.some((item) => ['标摊', '豪标'].includes(String(item?.type || '').trim()));
    const hasGroundBooth = normalizedBooths.some((item) => String(item?.type || '').trim() === '光地');
    if (hasStandardBooth) return String(payload.standard_booth_display_name || '').trim();
    if (hasGroundBooth) return String(payload.ground_booth_display_name || '').trim() || String(payload.company_name || '').trim();
    return String(payload.company_name || '').trim();
}

function resolveBoothChangeDisplayName(booths = [], payload = {}, currentOrder = {}) {
    const normalizedBooths = Array.isArray(booths) ? booths : [];
    const hasStandardBooth = normalizedBooths
        .some((item) => ['标摊', '豪标'].includes(String(item?.type || '').trim()));
    const hasGroundBooth = normalizedBooths.some((item) => String(item?.type || '').trim() === '光地');
    const existingName = String(currentOrder?.booth_display_name || '').trim();
    if (hasStandardBooth) {
        const explicitName = String(payload.standard_booth_display_name || '').trim();
        if (explicitName) {
            return {
                displayName: explicitName,
                error: validateStandardBoothDisplayName(explicitName)
            };
        }
        if (existingName && !validateStandardBoothDisplayName(existingName)) {
            return {
                displayName: existingName,
                error: ''
            };
        }
        return {
            displayName: '',
            error: '原展位简称无法继承到新的标摊/豪标，请填写新的展位简称后再换展位'
        };
    }
    if (hasGroundBooth) {
        const explicitName = String(payload.ground_booth_display_name || '').trim();
        if (explicitName) {
            const error = countDisplayNameUnits(explicitName) > 24
                ? '光地显示名称不能超过 12 个汉字或 24 个英文字符'
                : '';
            return { displayName: explicitName, error };
        }
        if (existingName && countDisplayNameUnits(existingName) <= 24) {
            return { displayName: existingName, error: '' };
        }
        return {
            displayName: '',
            error: '原展位显示名称无法继承到新的光地，请填写新的光地显示名称后再换展位'
        };
    }
    return {
        displayName: String(payload.company_name || '').trim(),
        error: ''
    };
}

function normalizeUtf8SearchValue(rawValue, maxBytes = ORDER_LIST_SEARCH_MAX_BYTES) {
    const value = String(rawValue || '').trim();
    if (!value) return '';
    let result = '';
    let byteCount = 0;
    for (const char of value) {
        const charByteCount = new TextEncoder().encode(char).length;
        if (byteCount + charByteCount > maxBytes) break;
        result += char;
        byteCount += charByteCount;
    }
    return result;
}

function escapeSqlLikePattern(value) {
    return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function createRouteError(message, status = 400) {
    const error = new Error(message);
    error.status = Number(status) || 400;
    return error;
}

export function normalizeOrderListParams(urlObj, currentUser) {
    const rawPage = Number(urlObj.searchParams.get('page') || 1);
    const rawPageSize = Number(urlObj.searchParams.get('pageSize') || ORDER_LIST_DEFAULT_PAGE_SIZE);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, ORDER_LIST_MAX_PAGE_SIZE)
        : ORDER_LIST_DEFAULT_PAGE_SIZE;
    const boothType = String(urlObj.searchParams.get('boothType') || '').trim();
    const paymentStatus = String(urlObj.searchParams.get('paymentStatus') || '').trim();
    return {
        projectId: Number(urlObj.searchParams.get('projectId') || 0),
        page,
        pageSize,
        selectedSales: isAdminUser(currentUser) ? String(urlObj.searchParams.get('salesName') || '').trim() : '',
        search: normalizeUtf8SearchValue(urlObj.searchParams.get('search')),
        businessSearch: normalizeUtf8SearchValue(urlObj.searchParams.get('businessSearch')),
        regionSearch: normalizeUtf8SearchValue(urlObj.searchParams.get('regionSearch')),
        boothType: ORDER_LIST_ALLOWED_BOOTH_TYPES.has(boothType) ? boothType : '',
        paymentStatus: ['未付', '定金', '全款'].includes(paymentStatus) ? paymentStatus : ''
    };
}

function appendOrderListFilters(whereClauses, params, filters, currentUser) {
    whereClauses.push("o.status = '正常'");

    if (filters.selectedSales) {
        whereClauses.push('o.sales_name = ?');
        params.push(filters.selectedSales);
    }
    if (filters.search) {
        const escapedSearch = `%${escapeSqlLikePattern(filters.search)}%`;
        whereClauses.push("(o.company_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR o.booth_id LIKE ? ESCAPE '\\' COLLATE NOCASE)");
        params.push(escapedSearch, escapedSearch);
    }
    if (filters.businessSearch) {
        const escapedSearch = `%${escapeSqlLikePattern(filters.businessSearch)}%`;
        whereClauses.push("COALESCE(o.main_business, '') LIKE ? ESCAPE '\\' COLLATE NOCASE");
        params.push(escapedSearch);
    }
    if (filters.regionSearch) {
        const escapedSearch = `%${escapeSqlLikePattern(filters.regionSearch)}%`;
        whereClauses.push("COALESCE(o.region, '') LIKE ? ESCAPE '\\' COLLATE NOCASE");
        params.push(escapedSearch);
    }
    if (filters.boothType) {
        whereClauses.push(`EXISTS (
            SELECT 1
            FROM Booths booth_filter
            WHERE booth_filter.project_id = o.project_id
              AND booth_filter.type = ?
              AND INSTR(
                    ',' || REPLACE(UPPER(COALESCE(o.booth_id, '')), ' ', '') || ',',
                    ',' || REPLACE(UPPER(booth_filter.id), ' ', '') || ','
                ) > 0
        )`);
        params.push(filters.boothType);
    }
    if (filters.paymentStatus === '未付') {
        whereClauses.push('COALESCE(o.total_amount, 0) > 0 AND COALESCE(o.paid_amount, 0) <= 0');
    } else if (filters.paymentStatus === '定金') {
        whereClauses.push('COALESCE(o.total_amount, 0) > 0 AND COALESCE(o.paid_amount, 0) > 0 AND COALESCE(o.paid_amount, 0) < COALESCE(o.total_amount, 0)');
    } else if (filters.paymentStatus === '全款') {
        whereClauses.push('(COALESCE(o.total_amount, 0) <= 0 OR COALESCE(o.paid_amount, 0) >= COALESCE(o.total_amount, 0))');
    }
}

export function normalizePendingOrderListParams(urlObj, currentUser) {
    const rawPage = Number(urlObj.searchParams.get('page') || 1);
    const rawPageSize = Number(urlObj.searchParams.get('pageSize') || ORDER_LIST_DEFAULT_PAGE_SIZE);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, ORDER_LIST_MAX_PAGE_SIZE)
        : ORDER_LIST_DEFAULT_PAGE_SIZE;
    return {
        projectId: Number(urlObj.searchParams.get('projectId') || 0),
        page,
        pageSize,
        selectedSales: isAdminUser(currentUser) ? String(urlObj.searchParams.get('salesName') || '').trim() : '',
        search: normalizeUtf8SearchValue(urlObj.searchParams.get('search')),
        businessSearch: normalizeUtf8SearchValue(urlObj.searchParams.get('businessSearch'))
    };
}

function appendPendingOrderListFilters(whereClauses, params, filters) {
    whereClauses.push("o.status = '待确认'");
    whereClauses.push('o.deleted_at IS NULL');

    if (filters.selectedSales) {
        whereClauses.push('o.sales_name = ?');
        params.push(filters.selectedSales);
    }
    if (filters.search) {
        const escapedSearch = `%${escapeSqlLikePattern(filters.search)}%`;
        whereClauses.push("(o.company_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(o.pending_release_snapshot_json, '') LIKE ? ESCAPE '\\' COLLATE NOCASE)");
        params.push(escapedSearch, escapedSearch);
    }
    if (filters.businessSearch) {
        const escapedSearch = `%${escapeSqlLikePattern(filters.businessSearch)}%`;
        whereClauses.push("COALESCE(o.main_business, '') LIKE ? ESCAPE '\\' COLLATE NOCASE");
        params.push(escapedSearch);
    }
}

async function resolveAssignedSalesName(env, currentUser, requestedSalesName = '') {
    const resolvedName = isSuperAdmin(currentUser)
        ? String(requestedSalesName || '').trim()
        : String(currentUser?.name || '').trim();
    if (!resolvedName) {
        return { error: '请选择订单归属业务员' };
    }
    const staff = await env.DB.prepare('SELECT name FROM Staff WHERE name = ?').bind(resolvedName).first();
    if (!staff) {
        return { error: '订单归属业务员不存在，请先在系统配置中创建账号' };
    }
    return { salesName: String(staff.name || '').trim() };
}

async function getActiveOrdersByBoothIds(env, projectId, boothIds = []) {
    const normalizedBoothIds = Array.from(new Set(
        (Array.isArray(boothIds) ? boothIds : [])
            .map((boothId) => normalizeBoothCode(boothId))
            .filter(Boolean)
    ));
    const activeOrdersMap = new Map();
    if (!projectId || normalizedBoothIds.length === 0) return activeOrdersMap;
    const normalizedBoothIdSet = new Set(normalizedBoothIds);
    const rows = ((await env.DB.prepare(`
        SELECT id, booth_id, area, created_at
        FROM Orders
        WHERE project_id = ?
          AND status = '正常'
          AND COALESCE(booth_id, '') != ''
        ORDER BY datetime(created_at) ASC, id ASC
    `).bind(Number(projectId)).all()).results || []);
    rows.forEach((row) => {
        splitBoothCodeList(row.booth_id).forEach((boothId) => {
            if (!normalizedBoothIdSet.has(boothId)) return;
            if (!activeOrdersMap.has(boothId)) {
                activeOrdersMap.set(boothId, []);
            }
            activeOrdersMap.get(boothId).push(row);
        });
    });
    return activeOrdersMap;
}

async function executeStatementsInChunks(env, statements = [], chunkSize = BATCH_CHUNK_SIZE) {
    for (const statementChunk of chunkItems(statements, chunkSize)) {
        if (statementChunk.length === 0) continue;
        await env.DB.batch(statementChunk);
    }
}

function normalizeTargetBoothSelections(payload) {
    const rawSelections = Array.isArray(payload?.target_booths) && payload.target_booths.length > 0
        ? payload.target_booths
        : [];
    const sourceItems = rawSelections.length > 0
        ? rawSelections
        : (Array.isArray(payload?.target_booth_ids) && payload.target_booth_ids.length > 0
            ? payload.target_booth_ids
            : [payload?.target_booth_id]);
    const selectionMap = new Map();
    sourceItems.forEach((item) => {
        const rawBoothId = typeof item === 'object' && item !== null
            ? (item.booth_id || item.id || item.target_booth_id)
            : item;
        splitBoothCodeList(rawBoothId).forEach((boothId) => {
            if (!boothId || selectionMap.has(boothId)) return;
            const itemObject = typeof item === 'object' && item !== null ? item : {};
            selectionMap.set(boothId, {
                id: boothId,
                booth_id: boothId,
                area: itemObject.area === undefined ? null : toNonNegativeNumber(itemObject.area),
                is_joint: Number(itemObject.is_joint || 0) ? 1 : 0
            });
        });
    });
    return Array.from(selectionMap.values());
}

function hasSameBoothSelection(leftBoothIds = [], rightBoothIds = []) {
    const leftSet = new Set(Array.isArray(leftBoothIds) ? leftBoothIds.map((value) => normalizeBoothCode(value)).filter(Boolean) : []);
    const rightSet = new Set(Array.isArray(rightBoothIds) ? rightBoothIds.map((value) => normalizeBoothCode(value)).filter(Boolean) : []);
    if (leftSet.size !== rightSet.size) return false;
    for (const boothId of leftSet) {
        if (!rightSet.has(boothId)) return false;
    }
    return true;
}

function buildAggregatedMultiBoothOrder(targetBooths, totalBoothFee, feeItems, minimumTotalAmount = 0) {
    const normalizedTargetBooths = Array.isArray(targetBooths) ? targetBooths : [];
    if (normalizedTargetBooths.length === 0) {
        return { error: '请至少选择一个目标展位' };
    }
    const aggregatedBoothIds = normalizedTargetBooths
        .map((target) => normalizeBoothCode(target?.id || target?.booth_id))
        .filter(Boolean);
    if (aggregatedBoothIds.length !== normalizedTargetBooths.length) {
        return { error: '目标展位编号缺失，请重新选择展位' };
    }
    const normalizedFeeItems = Array.isArray(feeItems) ? feeItems : [];
    const totalOtherIncome = Number(normalizedFeeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
    const nextTotalAmount = Number((Number(totalBoothFee || 0) + totalOtherIncome).toFixed(2));
    if (Number(minimumTotalAmount || 0) - nextTotalAmount > 0.009) {
        return { error: '调整后的总应收不能低于当前已有效收款，请提高展位费或先处理收款' };
    }
    return {
        booth_id: aggregatedBoothIds.join(', '),
        area: Number(normalizedTargetBooths.reduce((sum, target) => sum + Number(target.area || 0), 0).toFixed(2)),
        price_unit: normalizedTargetBooths.length === 1 ? normalizedTargetBooths[0].price_unit : '组合',
        unit_price: normalizedTargetBooths.length === 1 ? Number(normalizedTargetBooths[0].unit_price || 0) : 0,
        total_booth_fee: Number(Number(totalBoothFee || 0).toFixed(2)),
        other_income: totalOtherIncome,
        total_amount: nextTotalAmount,
        fees_json: JSON.stringify(normalizedFeeItems),
        target_booths: normalizedTargetBooths
    };
}

function resolveJointAreaDonorOrder(activeOrders = [], requestedArea = 0) {
    const normalizedRequestedArea = Number(requestedArea || 0);
    const candidates = (Array.isArray(activeOrders) ? activeOrders : [])
        .map((order) => ({
            ...order,
            area: toNonNegativeNumber(order?.area)
        }))
        .filter((order) => Number(order.id || 0) > 0 && Number.isFinite(order.area) && order.area >= 0)
        .sort((left, right) => {
            const areaDiff = Number(right.area || 0) - Number(left.area || 0);
            if (areaDiff !== 0) return areaDiff;
            return Number(left.id || 0) - Number(right.id || 0);
        });
    if (normalizedRequestedArea <= 0) {
        return {
            donorOrder: candidates[0] || null,
            maxAvailableArea: candidates[0]?.area || 0
        };
    }
    const donorOrder = candidates.find((order) => Number(order.area || 0) + 0.009 >= normalizedRequestedArea) || null;
    return {
        donorOrder,
        maxAvailableArea: candidates[0]?.area || 0
    };
}

function buildInsufficientJointAreaMessage(boothId, maxAvailableArea = 0) {
    return `展位 ${boothId} 当前可分配剩余面积不足，最多可分配 ${Number(maxAvailableArea || 0).toLocaleString()}㎡`;
}

export async function handleOrderRoutes({
    request,
    env,
    url,
    currentUser,
    corsHeaders
}) {
    if (url.pathname === '/api/order-booth-changes' && request.method === 'GET') {
        try {
            const params = new URL(request.url).searchParams;
            const projectId = Number(params.get('projectId') || 0);
            const orderId = Number(params.get('orderId') || 0);
            if (!projectId || !orderId) return errorResponse('缺少订单变更记录查询参数', 400, corsHeaders);

            const order = await env.DB.prepare(`
                SELECT id
                FROM Orders
                WHERE id = ? AND project_id = ?
            `).bind(orderId, projectId).first();
            if (!order) return errorResponse('订单不存在', 404, corsHeaders);

            const hasPermission = await canViewOrderCommercialNotes(env, currentUser, orderId);
            if (!hasPermission) return errorResponse('权限不足：不能查看他人订单说明', 403, corsHeaders);

            const results = await env.DB.prepare(`
                SELECT
                    id,
                    project_id,
                    order_id,
                    old_booth_id,
                    new_booth_id,
                    old_area,
                    new_area,
                    booth_delta_count,
                    old_total_amount,
                    new_total_amount,
                    total_amount_delta,
                    changed_by,
                    COALESCE(reason, '') AS reason,
                    changed_at
                FROM OrderBoothChanges
                WHERE project_id = ? AND order_id = ?
                ORDER BY datetime(changed_at) DESC, id DESC
                LIMIT 100
            `).bind(projectId, orderId).all();

            return new Response(JSON.stringify({ items: results.results || [] }), { headers: corsHeaders });
        } catch (error) {
            console.error('Fetch order booth changes failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/orders' && request.method === 'GET') {
        const filters = normalizeOrderListParams(new URL(request.url), currentUser);
        if (!filters.projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        await expireOverdueReservedOrdersThrottled(env, filters.projectId);

        const countWhereClauses = ['o.project_id = ?'];
        const countParams = [filters.projectId];
        appendOrderListFilters(countWhereClauses, countParams, filters, currentUser);
        const totalRow = await env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM Orders o
            WHERE ${countWhereClauses.join(' AND ')}
        `).bind(...countParams).first();

        const total = Number(totalRow?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
        const effectivePage = total > 0 ? Math.min(filters.page, totalPages) : 1;
        const offset = (effectivePage - 1) * filters.pageSize;
        const superAdminFlag = isSuperAdmin(currentUser) ? 1 : 0;
        const commercialNotesFlag = isAdminUser(currentUser) ? 1 : 0;
        const whereClauses = ['o.project_id = ?'];
        const filterParams = [filters.projectId];
        appendOrderListFilters(whereClauses, filterParams, filters, currentUser);

        const results = await env.DB.prepare(`
            SELECT
                o.*,
                b.hall,
                b.type AS booth_type,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN 1 ELSE 0 END AS can_view_commercial_notes,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN COALESCE(o.discount_reason, '') ELSE '' END AS visible_discount_reason,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN 1 ELSE 0 END AS can_manage,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN 1 ELSE 0 END AS can_preview_contract,
                CASE WHEN o.contract_url IS NOT NULL AND o.contract_url != '' THEN 1 ELSE 0 END AS has_contract,
                CASE
                    WHEN ? = 1 OR o.sales_name = ? THEN o.contact_person
                    ELSE CASE WHEN o.contact_person IS NULL OR o.contact_person = '' THEN '未填' ELSE '***' END
                END AS contact_person,
                CASE
                    WHEN ? = 1 OR o.sales_name = ? THEN o.phone
                    ELSE CASE
                        WHEN o.phone IS NULL OR o.phone = '' THEN '未填'
                        WHEN length(o.phone) >= 7 THEN substr(o.phone, 1, 3) || '****' || substr(o.phone, -4)
                        ELSE '***'
                    END
                END AS phone,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN o.contract_url ELSE NULL END AS contract_url,
                COALESCE(oi.overpaid_amount, CASE WHEN o.paid_amount > o.total_amount THEN ROUND(o.paid_amount - o.total_amount, 2) ELSE 0 END) AS overpaid_amount,
                CASE
                    WHEN COALESCE(oi.overpaid_amount, 0) > 0 THEN oi.status
                    WHEN o.paid_amount > o.total_amount THEN 'pending'
                    ELSE ''
                END AS overpayment_status,
                COALESCE(oi.reason, '') AS overpayment_reason,
                COALESCE(oi.note, '') AS overpayment_note,
                COALESCE(oi.handled_by, '') AS overpayment_handled_by,
                COALESCE(oi.handled_at, '') AS overpayment_handled_at,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN 1 ELSE 0 END AS can_handle_overpayment,
                CASE
                    WHEN o.paid_amount > 0 THEN 'paid'
                    WHEN o.reserved_release_due_at IS NULL OR o.reserved_release_due_at = '' THEN 'disabled'
                    WHEN datetime(o.reserved_release_due_at) <= datetime('now', '+8 hours') THEN 'expired'
                    ELSE 'running'
                END AS reserved_release_status,
                CASE
                    WHEN o.paid_amount > 0 OR o.reserved_release_due_at IS NULL OR o.reserved_release_due_at = '' THEN NULL
                    ELSE MAX(0, CAST(strftime('%s', o.reserved_release_due_at) - strftime('%s', datetime('now', '+8 hours')) AS INTEGER))
                END AS reserved_release_remaining_seconds
            FROM Orders o
            LEFT JOIN Booths b ON o.booth_id = b.id AND o.project_id = b.project_id
            LEFT JOIN OrderOverpaymentIssues oi ON oi.order_id = o.id
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY CASE WHEN o.sales_name = ? THEN 0 ELSE 1 END ASC, datetime(o.created_at) DESC, o.id DESC
            LIMIT ? OFFSET ?
        `).bind(
            commercialNotesFlag, currentUser.name,
            commercialNotesFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            ...filterParams,
            currentUser.name,
            filters.pageSize,
            offset
        ).all();

        // Post-process multi-booth orders: derive merged hall and booth_type
        const orderItems = (results.results || []).map((order) => {
            order.discount_reason = String(order.visible_discount_reason || '');
            delete order.visible_discount_reason;
            return order;
        });
        const multiBoothOrders = orderItems.filter((o) => o.booth_id && o.booth_id.includes(',') && (!o.hall || !o.booth_type));
        if (multiBoothOrders.length > 0) {
            const allBoothIds = new Set();
            multiBoothOrders.forEach((o) => splitBoothCodeList(o.booth_id).forEach((id) => allBoothIds.add(id)));
            const boothIdArr = [...allBoothIds];
            const boothMetaMap = new Map();
            for (const chunk of chunkItems(boothIdArr, SQL_IN_CHUNK_SIZE)) {
                const placeholders = chunk.map(() => '?').join(',');
                const rows = ((await env.DB.prepare(
                    `SELECT id, hall, type FROM Booths WHERE project_id = ? AND id IN (${placeholders})`
                ).bind(filters.projectId, ...chunk).all()).results || []);
                rows.forEach((r) => boothMetaMap.set(normalizeBoothCode(r.id), { hall: r.hall, type: r.type }));
            }
            multiBoothOrders.forEach((o) => {
                const boothIds = splitBoothCodeList(o.booth_id);
                const halls = [...new Set(boothIds.map((id) => boothMetaMap.get(id)?.hall).filter(Boolean))];
                const types = [...new Set(boothIds.map((id) => boothMetaMap.get(id)?.type).filter(Boolean))];
                o.hall = halls.length === 1 ? halls[0] : halls.join('，');
                o.booth_type = types.length === 1 ? types[0] : types.join('，');
            });
        }

        return new Response(JSON.stringify({
            items: orderItems,
            total,
            page: effectivePage,
            pageSize: filters.pageSize,
            totalPages,
            hasMore: effectivePage < totalPages
        }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/pending-orders' && request.method === 'GET') {
        const filters = normalizePendingOrderListParams(new URL(request.url), currentUser);
        if (!filters.projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        await expireOverdueReservedOrdersThrottled(env, filters.projectId);

        const countWhereClauses = ['o.project_id = ?'];
        const countParams = [filters.projectId];
        appendPendingOrderListFilters(countWhereClauses, countParams, filters);
        const totalRow = await env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM Orders o
            WHERE ${countWhereClauses.join(' AND ')}
        `).bind(...countParams).first();

        const total = Number(totalRow?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
        const effectivePage = total > 0 ? Math.min(filters.page, totalPages) : 1;
        const offset = (effectivePage - 1) * filters.pageSize;
        const superAdminFlag = isSuperAdmin(currentUser) ? 1 : 0;
        const commercialNotesFlag = isAdminUser(currentUser) ? 1 : 0;
        const whereClauses = ['o.project_id = ?'];
        const filterParams = [filters.projectId];
        appendPendingOrderListFilters(whereClauses, filterParams, filters);

        const results = await env.DB.prepare(`
            SELECT
                o.*,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN 1 ELSE 0 END AS can_view_commercial_notes,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN COALESCE(o.discount_reason, '') ELSE '' END AS visible_discount_reason,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN 1 ELSE 0 END AS can_manage,
                CASE WHEN o.contract_url IS NOT NULL AND o.contract_url != '' THEN 1 ELSE 0 END AS has_contract,
                CASE
                    WHEN ? = 1 OR o.sales_name = ? THEN o.contact_person
                    ELSE CASE WHEN o.contact_person IS NULL OR o.contact_person = '' THEN '未填' ELSE '***' END
                END AS contact_person,
                CASE
                    WHEN ? = 1 OR o.sales_name = ? THEN o.phone
                    ELSE CASE
                        WHEN o.phone IS NULL OR o.phone = '' THEN '未填'
                        WHEN length(o.phone) >= 7 THEN substr(o.phone, 1, 3) || '****' || substr(o.phone, -4)
                        ELSE '***'
                    END
                END AS phone,
                CASE WHEN ? = 1 OR o.sales_name = ? THEN o.contract_url ELSE NULL END AS contract_url,
                COALESCE(ps.payment_count, 0) AS effective_payment_count,
                COALESCE(ps.paid_amount, 0) AS effective_paid_amount,
                CASE WHEN ? = 1 THEN 1 ELSE 0 END AS can_delete_pending,
                CASE WHEN COALESCE(ps.payment_count, 0) > 0 THEN 1 ELSE 0 END AS requires_payment_handling
            FROM Orders o
            LEFT JOIN (
                SELECT order_id, COUNT(*) AS payment_count, ROUND(COALESCE(SUM(amount), 0), 2) AS paid_amount
                FROM Payments
                WHERE deleted_at IS NULL
                GROUP BY order_id
            ) ps ON ps.order_id = o.id
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY CASE WHEN o.sales_name = ? THEN 0 ELSE 1 END ASC, datetime(o.pending_at) DESC, o.id DESC
            LIMIT ? OFFSET ?
        `).bind(
            commercialNotesFlag, currentUser.name,
            commercialNotesFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag, currentUser.name,
            superAdminFlag,
            ...filterParams,
            currentUser.name,
            filters.pageSize,
            offset
        ).all();
        const orderItems = (results.results || []).map((order) => {
            order.discount_reason = String(order.visible_discount_reason || '');
            delete order.visible_discount_reason;
            return order;
        });

        return new Response(JSON.stringify({
            items: orderItems,
            total,
            page: effectivePage,
            pageSize: filters.pageSize,
            totalPages,
            hasMore: effectivePage < totalPages
        }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/submit-order' && request.method === 'POST') {
        let lockInfo = { lockToken: '', boothIds: [], projectId: 0 };
        try {
            const payload = await readJsonBody(request, corsHeaders);
            if (payload instanceof Response) return payload;
            const projectId = Number(payload.project_id || 0);
            if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
            await expireOverdueReservedOrders(env, projectId);
            const statements = [];
            const noBoothOrder = Number(payload.no_booth_order || 0) === 1;
            const isAgentOrder = payload.is_agent === true || Number(payload.is_agent) === 1;
            let normalizedFees = [];
            try {
                normalizedFees = normalizeEditableFeeItems(payload.fees_json || '[]');
            } catch (error) {
                return errorResponse('其他应收费用格式不正确', 400, corsHeaders);
            }
            const totalOtherIncome = Number(normalizedFees.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
            const totalBoothFee = Number(Number(payload.total_booth_fee || 0).toFixed(2));
            const normalizedProfile = String(payload.profile || '').trim();
            if (normalizedProfile.length > PROFILE_MAX_LENGTH) {
                return errorResponse(`企业简介或产品亮点不能超过 ${PROFILE_MAX_LENGTH} 字`, 400, corsHeaders);
            }

            if (Array.isArray(payload.selected_booths) && payload.selected_booths.length > MAX_SELECTED_BOOTHS) {
                return errorResponse(`单次最多选择 ${MAX_SELECTED_BOOTHS} 个展位`, 400, corsHeaders);
            }

            const selectedBooths = noBoothOrder
                ? [{
                    booth_id: '',
                    area: 0,
                    price_unit: '无展位',
                    unit_price: 0,
                    standard_fee: 0,
                    is_joint: 0,
                    no_booth_order: 1
                }]
                : Array.isArray(payload.selected_booths) && payload.selected_booths.length > 0
                    ? payload.selected_booths.map((item) => {
                        const normalizedId = normalizeBoothCode(item.booth_id);
                        return {
                            id: normalizedId,
                            booth_id: normalizedId,
                            hall: String(item.hall || '').trim(),
                            type: String(item.type || '').trim(),
                            area: Number(item.area || 0),
                            price_unit: String(item.price_unit || '').trim(),
                            unit_price: Number(item.unit_price || 0),
                            standard_fee: Number(item.standard_fee || 0),
                            is_joint: Number(item.is_joint || 0) ? 1 : 0
                        };
                    }).filter((item) => item.booth_id && item.area >= 0)
                    : [{
                        id: normalizeBoothCode(payload.booth_id),
                        booth_id: normalizeBoothCode(payload.booth_id),
                        hall: '',
                        type: '',
                        area: Number(payload.area || 0),
                        price_unit: String(payload.price_unit || '').trim(),
                        unit_price: Number(payload.unit_price || 0),
                        standard_fee: Number(payload.total_booth_fee || 0),
                        is_joint: 0
                    }];

            if (!noBoothOrder && selectedBooths.length === 0) {
                return errorResponse('请至少选择一个展位', 400, corsHeaders);
            }

            const hasStandardTypeBooth = selectedBooths.some((item) => ['标摊', '豪标'].includes(String(item.type || '').trim()));
            if (hasStandardTypeBooth) {
                const standardDisplayNameError = validateStandardBoothDisplayName(payload.standard_booth_display_name);
                if (standardDisplayNameError) {
                    return errorResponse(standardDisplayNameError, 400, corsHeaders);
                }
            }
            if (countDisplayNameUnits(payload.ground_booth_display_name || '') > 24) {
                return errorResponse('光地显示名称不能超过 12 个汉字或 24 个英文字符', 400, corsHeaders);
            }

            const totalStandardFee = Number(selectedBooths.reduce((sum, item) => sum + Number(item.standard_fee || 0), 0).toFixed(2));
            const totalSelectedArea = Number(selectedBooths.reduce((sum, item) => sum + Number(item.area || 0), 0).toFixed(2));
            if (totalBoothFee < 0) return errorResponse('最终成交展位费不能为负数', 400, corsHeaders);
            if (noBoothOrder) {
                if (totalBoothFee !== 0) return errorResponse('无展位订单的应收展位费必须为0', 400, corsHeaders);
                if (normalizedFees.length === 0 || totalOtherIncome <= 0) return errorResponse('无展位订单必须至少包含一项其他应收费用', 400, corsHeaders);
            } else if (totalSelectedArea <= 0 && totalBoothFee > 0) {
                return errorResponse('0面积联合参展的应收展位费必须为0', 400, corsHeaders);
            }

            const boothIdsToLock = selectedBooths.map((item) => item.booth_id).filter(Boolean);
            lockInfo = {
                ...(await acquireBoothLocks(env, Number(payload.project_id), boothIdsToLock)),
                projectId: Number(payload.project_id)
            };
            if (!lockInfo.success) {
                return errorResponse(`展位 ${lockInfo.conflictedBoothId} 正在被其他人操作，请刷新后重试`, 409, corsHeaders);
            }

            const activeOrdersMap = await getActiveOrdersByBoothIds(env, projectId, boothIdsToLock);
            const releaseSettings = await getOrderReleaseSettings(env, projectId);
            const boothIdsToSync = new Set();
            const salesResolve = await resolveAssignedSalesName(env, currentUser, payload.sales_name);
            if (salesResolve.error) return errorResponse(salesResolve.error, 400, corsHeaders);
            const normalizedOrderPayload = {
                project_id: projectId,
                company_name: String(payload.company_name || '').trim(),
                credit_code: String(payload.credit_code || '').trim(),
                category: String(payload.category || '').trim(),
                main_business: String(payload.main_business || '').trim(),
                agent_name: String(payload.agent_name || '').trim(),
                contact_person: String(payload.contact_person || '').trim(),
                phone: String(payload.phone || '').trim(),
                region: String(payload.region || '').trim(),
                discount_reason: String(payload.discount_reason || '').trim(),
                profile: normalizedProfile,
                sales_name: salesResolve.salesName,
                contract_url: payload.contract_url ? String(payload.contract_url).trim() : null
            };
            if (isAgentOrder) {
                const agent = await findActiveAgentByName(env, normalizedOrderPayload.project_id, normalizedOrderPayload.agent_name);
                if (!agent) return errorResponse('代理商不存在，请先从代理商库中选择', 400, corsHeaders);
                normalizedOrderPayload.agent_name = agent.name;
            } else {
                normalizedOrderPayload.agent_name = '';
            }

            for (const boothItem of selectedBooths) {
                const activeOrders = activeOrdersMap.get(normalizeBoothCode(boothItem.booth_id)) || [];
                const existingOrder = activeOrders[0] || null;
                if (existingOrder && !boothItem.is_joint) {
                    return errorResponse(`展位 ${boothItem.booth_id} 已被占用，请刷新后重试`, 409, corsHeaders);
                }
                if (existingOrder && boothItem.is_joint && boothItem.area > 0) {
                    const { donorOrder, maxAvailableArea } = resolveJointAreaDonorOrder(activeOrders, boothItem.area);
                    if (!donorOrder) {
                        return errorResponse(buildInsufficientJointAreaMessage(boothItem.booth_id, maxAvailableArea), 400, corsHeaders);
                    }
                    statements.push(
                        env.DB.prepare("UPDATE Orders SET area = ROUND(area - ?, 2) WHERE id = ? AND status = '正常'")
                            .bind(boothItem.area, donorOrder.id)
                    );
                    boothIdsToSync.add(normalizeBoothCode(boothItem.booth_id));
                }

                if (boothItem.booth_id) boothIdsToSync.add(normalizeBoothCode(boothItem.booth_id));
            }

            const aggregatedOrder = noBoothOrder
                ? {
                    booth_id: '',
                    area: 0,
                    price_unit: '无展位',
                    unit_price: 0,
                    total_booth_fee: 0,
                    other_income: Number(normalizedFees.reduce((s, i) => s + Number(i.amount || 0), 0).toFixed(2)),
                    total_amount: Number(normalizedFees.reduce((s, i) => s + Number(i.amount || 0), 0).toFixed(2)),
                    fees_json: JSON.stringify(normalizedFees),
                    target_booths: []
                }
                : buildAggregatedMultiBoothOrder(selectedBooths, totalBoothFee, normalizedFees, 0);
            if (aggregatedOrder.error) return errorResponse(aggregatedOrder.error, 400, corsHeaders);
            const reservedReleaseDueAt = boothIdsToLock.length > 0
                && Number(aggregatedOrder.total_booth_fee || 0) > 0
                && releaseSettings.release_after_minutes !== null
                ? buildReleaseDueAt(releaseSettings.release_after_minutes)
                : null;

            statements.push(env.DB.prepare(`
                INSERT INTO Orders (
                    project_id, company_name, credit_code, no_code_checked, category, main_business,
                    is_agent, agent_name, contact_person, phone, region, booth_id, area, price_unit, unit_price,
                    total_booth_fee, discount_reason, other_income, fees_json, profile, total_amount, paid_amount,
                    contract_url, booth_display_name, sales_name, status, reserved_release_due_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
            `).bind(
                normalizedOrderPayload.project_id,
                normalizedOrderPayload.company_name,
                normalizedOrderPayload.credit_code,
                payload.no_code_checked ? 1 : 0,
                normalizedOrderPayload.category,
                normalizedOrderPayload.main_business,
                isAgentOrder ? 1 : 0,
                normalizedOrderPayload.agent_name,
                normalizedOrderPayload.contact_person,
                normalizedOrderPayload.phone,
                normalizedOrderPayload.region,
                noBoothOrder ? '' : aggregatedOrder.booth_id,
                noBoothOrder ? 0 : aggregatedOrder.area,
                noBoothOrder ? '无展位' : aggregatedOrder.price_unit,
                noBoothOrder ? 0 : aggregatedOrder.unit_price,
                noBoothOrder ? 0 : aggregatedOrder.total_booth_fee,
                normalizedOrderPayload.discount_reason,
                aggregatedOrder.other_income,
                aggregatedOrder.fees_json,
                normalizedOrderPayload.profile,
                aggregatedOrder.total_amount,
                0,
                normalizedOrderPayload.contract_url,
                noBoothOrder ? '' : resolveCompositeBoothDisplayName(selectedBooths, payload),
                normalizedOrderPayload.sales_name,
                ORDER_STATUS_ACTIVE,
                reservedReleaseDueAt
            ));

            await executeStatementsInChunks(env, statements, BATCH_CHUNK_SIZE);
            await syncBoothStatusByBoothIds(env, projectId, Array.from(boothIdsToSync));
            invalidateHomeDashboardCache(projectId);
            return new Response(JSON.stringify({ success: true, created_count: 1 }), { headers: corsHeaders });
        } catch (error) {
            console.error('Submit order failed:', error);
            return internalErrorResponse(corsHeaders);
        } finally {
            if (lockInfo.lockToken) {
                await releaseBoothLocks(env, lockInfo.projectId, lockInfo.boothIds, lockInfo.lockToken);
            }
        }
    }

    if (url.pathname === '/api/update-customer-info' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const hasPermission = await canManageOrder(env, currentUser, payload.order_id);
        if (!hasPermission) return errorResponse('权限不足：不能修改他人录入的客户资料', 403, corsHeaders);
        const canEditSensitive = await canViewSensitiveOrderFields(env, currentUser, payload.order_id);
        const existingInfoRow = await env.DB.prepare(`
            SELECT main_business, profile, COALESCE(exhibitor_info_status, 'sales_default') AS exhibitor_info_status
            FROM Orders
            WHERE id = ? AND project_id = ?
        `).bind(payload.order_id, payload.project_id).first();
        if (!existingInfoRow) return errorResponse('订单不存在', 404, corsHeaders);
        const isAgentOrder = payload.is_agent === true || Number(payload.is_agent) === 1;
        const normalizedProfile = String(payload.profile || '').trim();
        if (normalizedProfile.length > PROFILE_MAX_LENGTH) {
            return errorResponse(`企业简介或产品亮点不能超过 ${PROFILE_MAX_LENGTH} 字`, 400, corsHeaders);
        }
        let normalizedAgentName = '';
        if (isAgentOrder) {
            const agent = await findActiveAgentByName(env, payload.project_id, payload.agent_name);
            if (!agent) return errorResponse('代理商不存在，请先从代理商库中选择', 400, corsHeaders);
            normalizedAgentName = agent.name;
        }
        const mainBusinessChanged = String(existingInfoRow.main_business || '').trim() !== String(payload.main_business || '').trim();
        const profileChanged = String(existingInfoRow.profile || '').trim() !== normalizedProfile;
        const shouldRequireExhibitorResubmit = (mainBusinessChanged || profileChanged)
            && String(existingInfoRow.exhibitor_info_status || '').trim() === 'exhibitor_confirmed';

        let query = 'UPDATE Orders SET region = ?, main_business = ?, profile = ?, is_agent = ?, agent_name = ?, category = ?';
        const params = [payload.region, payload.main_business, normalizedProfile, isAgentOrder ? 1 : 0, normalizedAgentName, payload.category];
        if (shouldRequireExhibitorResubmit) {
            query += ", exhibitor_info_status = 'reopened', exhibitor_info_confirmed_by = '', exhibitor_info_confirmed_at = ''";
        }

        if (canEditSensitive && (payload.contact_person !== undefined || payload.phone !== undefined)) {
            query += ', contact_person = ?, phone = ?';
            params.push(payload.contact_person || '', payload.phone || '');
        }

        if (payload.company_name !== undefined) {
            query += ', company_name = ?';
            params.push(payload.company_name || '');
        }

        if (payload.credit_code !== undefined || payload.no_code_checked !== undefined) {
            if (!isSuperAdmin(currentUser)) return errorResponse('权限不足：仅超级管理员可修改信用代码', 403, corsHeaders);
            query += ', credit_code = ?, no_code_checked = ?';
            params.push(payload.credit_code || '', payload.no_code_checked ? 1 : 0);
        }

        if (payload.sales_name !== undefined) {
            if (!isSuperAdmin(currentUser)) return errorResponse('权限不足：仅超级管理员可修改订单归属业务员', 403, corsHeaders);
            const salesResolve = await resolveAssignedSalesName(env, currentUser, payload.sales_name);
            if (salesResolve.error) return errorResponse(salesResolve.error, 400, corsHeaders);
            query += ', sales_name = ?';
            params.push(salesResolve.salesName);
        }

        if (payload.contract_url !== undefined) {
            query += ', contract_url = ?';
            params.push(payload.contract_url);
        }
        query += ' WHERE id = ? AND project_id = ?';
        params.push(payload.order_id, payload.project_id);

        await env.DB.prepare(query).bind(...params).run();
        invalidateHomeDashboardCache(Number(payload.project_id || 0));
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/change-order-booth' && request.method === 'POST') {
        let lockInfo = { lockToken: '', boothIds: [], projectId: 0 };
        try {
            const payload = await readJsonBody(request, corsHeaders);
            if (payload instanceof Response) return payload;
            const orderId = Number(payload.order_id || 0);
            const projectId = Number(payload.project_id || 0);
            const swapReason = String(payload.swap_reason || '').trim();
            const priceReason = String(payload.price_reason || '').trim();
            const preserveFinance = payload.preserve_finance === true || Number(payload.preserve_finance) === 1;
            if (!orderId || !projectId) return errorResponse('缺少换展位必要信息', 400, corsHeaders);
            await expireOverdueReservedOrders(env, projectId);
            const hasPermission = await canManageOrder(env, currentUser, orderId);
            if (!hasPermission) return errorResponse('权限不足：不能操作他人订单换展位', 403, corsHeaders);
            const superAdminUser = isSuperAdmin(currentUser);
            if (!swapReason && !superAdminUser) return errorResponse('请填写换展位原因', 400, corsHeaders);
            if (preserveFinance && !superAdminUser) {
                return errorResponse('权限不足：仅超级管理员可保留原订单应收结构直改展位', 403, corsHeaders);
            }
            const effectiveSwapReason = swapReason || '超级管理员直改展位号';

            const initialOrder = await env.DB.prepare(`
                SELECT *
                FROM Orders
                WHERE id = ? AND project_id = ?
            `).bind(orderId, projectId).first();
            if (!initialOrder) return errorResponse('订单不存在', 404, corsHeaders);
            const currentBoothIds = splitBoothCodeList(initialOrder.booth_id);
            if (currentBoothIds.length === 0) return errorResponse('当前订单未绑定展位，无法换展位', 400, corsHeaders);
            const targetBoothSelections = normalizeTargetBoothSelections(payload);
            const targetBoothIds = targetBoothSelections.map((selection) => selection.booth_id);
            const targetSelectionById = new Map(targetBoothSelections.map((selection) => [selection.booth_id, selection]));
            if (targetBoothIds.length === 0) return errorResponse('请至少选择一个新的目标展位', 400, corsHeaders);
            if (hasSameBoothSelection(currentBoothIds, targetBoothIds)) {
                return errorResponse('目标展位未发生变化，请重新选择', 400, corsHeaders);
            }

            lockInfo = {
                ...(await acquireBoothLocks(env, projectId, [...currentBoothIds, ...targetBoothIds])),
                projectId
            };
            if (!lockInfo.success) {
                return errorResponse(`展位 ${lockInfo.conflictedBoothId} 正在被其他人操作，请刷新后重试`, 409, corsHeaders);
            }

            const currentOrder = await env.DB.prepare(`
                SELECT *
                FROM Orders
                WHERE id = ? AND project_id = ?
            `).bind(orderId, projectId).first();
            if (!currentOrder) return errorResponse('订单不存在', 404, corsHeaders);
            if (String(currentOrder.status || '') !== '正常') return errorResponse('仅正常订单可换展位', 400, corsHeaders);
            const latestCurrentBoothIds = splitBoothCodeList(currentOrder.booth_id);
            if (!hasSameBoothSelection(latestCurrentBoothIds, currentBoothIds)) {
                return errorResponse('订单展位状态已变化，请刷新后重试', 409, corsHeaders);
            }
            const refrigeratorRentalBoothSync = await prepareRefrigeratorRentalBoothSnapshotSync(
                env,
                projectId,
                currentOrder.company_name
            );

            const placeholders = targetBoothIds.map(() => '?').join(',');
            const targetBoothRows = ((await env.DB.prepare(`
                SELECT id, hall, type, area, price_unit, base_price, status
                FROM Booths
                WHERE project_id = ?
                  AND id IN (${placeholders})
            `).bind(projectId, ...targetBoothIds).all()).results || []);
            const targetBoothsById = new Map(targetBoothRows.map((row) => [normalizeBoothCode(row.id), row]));
            const missingBoothIds = targetBoothIds.filter((boothId) => !targetBoothsById.has(boothId));
            if (missingBoothIds.length > 0) return errorResponse(`目标展位不存在：${missingBoothIds.join('、')}`, 404, corsHeaders);

            const rawActualFee = preserveFinance
                ? toNonNegativeNumber(currentOrder.total_booth_fee)
                : toNonNegativeNumber(payload.actual_fee);
            if (!Number.isFinite(rawActualFee) || rawActualFee < 0) {
                return errorResponse('新展位成交展位费必须是非负数', 400, corsHeaders);
            }
            let normalizedFeeItems = [];
            try {
                normalizedFeeItems = preserveFinance
                    ? normalizeEditableFeeItems(currentOrder.fees_json || '[]')
                    : normalizeEditableFeeItems(payload.fees_json);
            } catch (error) {
                return errorResponse(
                    preserveFinance ? '当前订单其他收费明细异常，无法保留原订单应收结构' : '其他收费明细格式无效，请重新填写',
                    400,
                    corsHeaders
                );
            }
            const nextOtherIncome = Number(normalizedFeeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
            const currentBoothCount = toBoothCount(currentOrder.area);
            const mergedReason = [
                `换展位：${effectiveSwapReason}`,
                preserveFinance ? '保留原订单应收结构' : '',
                priceReason ? `价格说明：${priceReason}` : ''
            ].filter(Boolean).join('；');
            const nowText = getChinaTimestamp();
            const activeOrdersMap = await getActiveOrdersByBoothIds(env, projectId, targetBoothIds);
            const priceRows = ((await env.DB.prepare(`
                SELECT booth_type, price
                FROM Prices
                WHERE project_id = ?
            `).bind(projectId).all()).results || []);
            const priceMap = Object.fromEntries(priceRows.map((row) => [String(row.booth_type || '').trim(), Number(row.price || 0)]));
            const areaAdjustmentStatements = [];
            const targetBooths = targetBoothIds.map((boothId) => {
                const boothRow = targetBoothsById.get(boothId);
                if (String(boothRow.status || '') === '已锁定') {
                    throw createRouteError(`目标展位 ${boothId} 已被临时锁定，请稍后再试`, 409);
                }
                const targetBoothOrders = (activeOrdersMap.get(boothId) || []).filter((order) => Number(order.id || 0) !== orderId);
                const targetSelection = targetSelectionById.get(boothId) || {};
                const isJointTarget = Number(targetSelection.is_joint || 0) === 1;
                if (targetBoothOrders.length > 0 && !isJointTarget) {
                    throw createRouteError(`目标展位 ${boothId} 当前已被占用，暂不支持直接换入`, 409);
                }
                const boothArea = toNonNegativeNumber(boothRow.area);
                if (!Number.isFinite(boothArea) || boothArea <= 0) {
                    throw createRouteError(`目标展位 ${boothId} 面积异常，无法换展位`, 400);
                }
                const selectedArea = targetSelection.area;
                const targetArea = isJointTarget && Number.isFinite(selectedArea)
                    ? selectedArea
                    : boothArea;
                if (!Number.isFinite(targetArea) || targetArea < 0) {
                    throw createRouteError(`目标展位 ${boothId} 联合参展面积异常，无法换展位`, 400);
                }
                if (isJointTarget && targetArea >= boothArea) {
                    throw createRouteError(`目标展位 ${boothId} 联合参展面积必须小于展位总面积`, 400);
                }
                if (targetBoothOrders.length > 0 && isJointTarget && targetArea > 0) {
                    const { donorOrder, maxAvailableArea } = resolveJointAreaDonorOrder(targetBoothOrders, targetArea);
                    if (!donorOrder) {
                        throw createRouteError(buildInsufficientJointAreaMessage(boothId, maxAvailableArea), 400);
                    }
                    areaAdjustmentStatements.push(
                        env.DB.prepare("UPDATE Orders SET area = ROUND(area - ?, 2) WHERE id = ? AND status = '正常'")
                            .bind(targetArea, donorOrder.id)
                    );
                }
                const unitPrice = Number(boothRow.base_price || 0) > 0
                    ? Number(boothRow.base_price || 0)
                    : Number(priceMap[String(boothRow.type || '').trim()] || 0);
                const standardFee = String(boothRow.type || '') === '光地'
                    ? Number((unitPrice * targetArea).toFixed(2))
                    : Number((unitPrice * toBoothCount(targetArea)).toFixed(2));
                return {
                    id: boothId,
                    hall: String(boothRow.hall || ''),
                    type: String(boothRow.type || ''),
                    area: targetArea,
                    price_unit: String(boothRow.price_unit || (String(boothRow.type || '') === '光地' ? '平米' : '个')),
                    unit_price: unitPrice,
                    standard_fee: standardFee,
                    is_joint: isJointTarget ? 1 : 0
                };
            });
            const totalStandardFee = Number(targetBooths.reduce((sum, item) => sum + Number(item.standard_fee || 0), 0).toFixed(2));
            if (rawActualFee < totalStandardFee && !priceReason && !preserveFinance) {
                return errorResponse('新展位成交价低于系统原价时，请填写价格说明', 400, corsHeaders);
            }
            const aggregatedOrder = buildAggregatedMultiBoothOrder(
                targetBooths,
                rawActualFee,
                normalizedFeeItems,
                preserveFinance ? Number(currentOrder.total_amount || 0) : Number(currentOrder.paid_amount || 0)
            );
            if (aggregatedOrder.error) return errorResponse(aggregatedOrder.error, 400, corsHeaders);
            const nextTotalAmount = Number((rawActualFee + nextOtherIncome).toFixed(2));
            const totalTargetArea = Number(targetBooths.reduce((sum, item) => sum + Number(item.area || 0), 0).toFixed(2));
            if (totalTargetArea <= 0 && rawActualFee > 0) {
                return errorResponse('0面积联合参展的应收展位费必须为0', 400, corsHeaders);
            }
            const nextBoothCount = toBoothCount(totalTargetArea);
            const boothDeltaCount = Number((nextBoothCount - currentBoothCount).toFixed(2));
            const totalAmountDelta = Number((nextTotalAmount - Number(currentOrder.total_amount || 0)).toFixed(2));
            const releaseSettings = await getOrderReleaseSettings(env, projectId);
            const displayNameResult = resolveBoothChangeDisplayName(targetBooths, {
                ...payload,
                company_name: currentOrder.company_name || ''
            }, currentOrder);
            if (displayNameResult.error) {
                return errorResponse(displayNameResult.error, 400, corsHeaders);
            }
            const statements = [
                ...areaAdjustmentStatements,
                env.DB.prepare(`
                    UPDATE Orders
                    SET booth_id = ?,
                        area = ?,
                        price_unit = ?,
                        unit_price = ?,
                        total_booth_fee = ?,
                        other_income = ?,
                        fees_json = ?,
                        discount_reason = ?,
                        total_amount = ?,
                        booth_display_name = ?,
                        reserved_release_due_at = ?
                    WHERE id = ? AND project_id = ?
                `).bind(
                    aggregatedOrder.booth_id,
                    aggregatedOrder.area,
                    aggregatedOrder.price_unit,
                    aggregatedOrder.unit_price,
                    aggregatedOrder.total_booth_fee,
                    aggregatedOrder.other_income,
                    aggregatedOrder.fees_json,
                    mergedReason,
                    aggregatedOrder.total_amount,
                    displayNameResult.displayName,
                    Number(currentOrder.paid_amount || 0) > 0 || Number(aggregatedOrder.total_booth_fee || 0) <= 0 || releaseSettings.release_after_minutes === null
                        ? null
                        : buildReleaseDueAt(releaseSettings.release_after_minutes),
                    orderId,
                    projectId
                ),
                env.DB.prepare(`
                    INSERT INTO OrderBoothChanges (
                        project_id, order_id, old_booth_id, new_booth_id,
                        old_area, new_area, booth_delta_count,
                        old_total_amount, new_total_amount, total_amount_delta,
                        changed_by, reason, changed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    projectId,
                    orderId,
                    currentBoothIds.join(', '),
                    aggregatedOrder.booth_id,
                    Number(currentOrder.area || 0),
                    totalTargetArea,
                    boothDeltaCount,
                    Number(currentOrder.total_amount || 0),
                    nextTotalAmount,
                    totalAmountDelta,
                    String(currentUser.name || ''),
                    mergedReason,
                    nowText
                )
            ];

            await executeStatementsInChunks(env, statements, BATCH_CHUNK_SIZE);
            await syncBoothStatusByBoothIds(env, projectId, [...currentBoothIds, ...targetBoothIds]);
            await applyRefrigeratorRentalBoothSnapshotSync(env, refrigeratorRentalBoothSync);
            await refreshOrderReleaseDue(env, orderId);
            await refreshOrderOverpaymentIssue(env, orderId, projectId);
            invalidateHomeDashboardCache(projectId);

            return new Response(JSON.stringify({
                success: true,
                order_id: orderId,
                old_booth_id: currentBoothIds[0] || '',
                old_booth_ids: currentBoothIds,
                new_booth_ids: targetBoothIds,
                booth_delta_count: boothDeltaCount,
                total_amount_delta: totalAmountDelta,
                created_count: 0
            }), { headers: corsHeaders });
        } catch (error) {
            if (error instanceof Error && error.message) {
                return errorResponse(error.message, Number(error.status) || 400, corsHeaders);
            }
            console.error('Change order booth failed:', error);
            return internalErrorResponse(corsHeaders);
        } finally {
            if (lockInfo.lockToken) {
                await releaseBoothLocks(env, lockInfo.projectId, lockInfo.boothIds, lockInfo.lockToken);
            }
        }
    }

    if (url.pathname === '/api/reactivate-pending-order' && request.method === 'POST') {
        let lockInfo = { lockToken: '', boothIds: [], projectId: 0 };
        try {
            const payload = await readJsonBody(request, corsHeaders);
            if (payload instanceof Response) return payload;
            const orderId = Number(payload.order_id || 0);
            const projectId = Number(payload.project_id || 0);
            const priceReason = String(payload.price_reason || '').trim();
            if (!orderId || !projectId) return errorResponse('缺少重新选位必要信息', 400, corsHeaders);
            const targetBoothSelections = normalizeTargetBoothSelections(payload);
            const targetBoothIds = targetBoothSelections.map((selection) => selection.booth_id);
            const targetSelectionById = new Map(targetBoothSelections.map((selection) => [selection.booth_id, selection]));
            if (targetBoothIds.length === 0) return errorResponse('请至少选择一个目标展位', 400, corsHeaders);

            const hasPermission = await canManageOrder(env, currentUser, orderId);
            if (!hasPermission) return errorResponse('权限不足：不能操作他人待确认订单', 403, corsHeaders);
            await expireOverdueReservedOrders(env, projectId);

            lockInfo = {
                ...(await acquireBoothLocks(env, projectId, targetBoothIds)),
                projectId
            };
            if (!lockInfo.success) {
                return errorResponse(`展位 ${lockInfo.conflictedBoothId} 正在被其他人操作，请刷新后重试`, 409, corsHeaders);
            }

            const pendingOrder = await env.DB.prepare(`
                SELECT *
                FROM Orders
                WHERE id = ? AND project_id = ?
            `).bind(orderId, projectId).first();
            if (!pendingOrder) return errorResponse('订单不存在', 404, corsHeaders);
            if (String(pendingOrder.status || '') !== ORDER_STATUS_PENDING) {
                return errorResponse('仅待确认订单可重新选展位', 400, corsHeaders);
            }

            const placeholders = targetBoothIds.map(() => '?').join(',');
            const targetBoothRows = ((await env.DB.prepare(`
                SELECT id, hall, type, area, price_unit, base_price, status
                FROM Booths
                WHERE project_id = ?
                  AND id IN (${placeholders})
            `).bind(projectId, ...targetBoothIds).all()).results || []);
            const targetBoothsById = new Map(targetBoothRows.map((row) => [normalizeBoothCode(row.id), row]));
            const missingBoothIds = targetBoothIds.filter((boothId) => !targetBoothsById.has(boothId));
            if (missingBoothIds.length > 0) return errorResponse(`目标展位不存在：${missingBoothIds.join('、')}`, 404, corsHeaders);

            const rawActualFee = toNonNegativeNumber(payload.actual_fee);
            if (!Number.isFinite(rawActualFee) || rawActualFee < 0) {
                return errorResponse('新展位成交展位费必须是非负数', 400, corsHeaders);
            }

            if (countDisplayNameUnits(payload.ground_booth_display_name || '') > 24) {
                return errorResponse('光地显示名称不能超过 12 个汉字或 24 个英文字符', 400, corsHeaders);
            }

            let normalizedFeeItems = [];
            try {
                normalizedFeeItems = normalizeEditableFeeItems(payload.fees_json || '[]');
            } catch (error) {
                return errorResponse('其他收费明细格式无效，请重新填写', 400, corsHeaders);
            }
            const nextOtherIncome = Number(normalizedFeeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
            const paymentSummary = await getEffectivePaymentSummary(env, orderId);
            const nextTotalAmount = Number((rawActualFee + nextOtherIncome).toFixed(2));
            if (paymentSummary.paid_amount > nextTotalAmount) {
                return errorResponse('重新选位后的总应收不能低于已有有效收款，请先处理收款后再恢复订单', 400, corsHeaders);
            }

            const activeOrdersMap = await getActiveOrdersByBoothIds(env, projectId, targetBoothIds);
            const priceRows = ((await env.DB.prepare(`
                SELECT booth_type, price
                FROM Prices
                WHERE project_id = ?
            `).bind(projectId).all()).results || []);
            const priceMap = Object.fromEntries(priceRows.map((row) => [String(row.booth_type || '').trim(), Number(row.price || 0)]));
            const areaAdjustmentStatements = [];
            const targetBooths = targetBoothIds.map((boothId) => {
                const boothRow = targetBoothsById.get(boothId);
                if (String(boothRow.status || '') === '已锁定') {
                    throw createRouteError(`目标展位 ${boothId} 已被临时锁定，请稍后再试`, 409);
                }
                const targetBoothOrders = activeOrdersMap.get(boothId) || [];
                const targetSelection = targetSelectionById.get(boothId) || {};
                const isJointTarget = Number(targetSelection.is_joint || 0) === 1;
                if (targetBoothOrders.length > 0 && !isJointTarget) {
                    throw createRouteError(`目标展位 ${boothId} 当前已被占用，请重新选择`, 409);
                }
                const boothArea = toNonNegativeNumber(boothRow.area);
                if (!Number.isFinite(boothArea) || boothArea <= 0) {
                    throw createRouteError(`目标展位 ${boothId} 面积异常，无法选展位`, 400);
                }
                const selectedArea = targetSelection.area;
                const targetArea = isJointTarget && Number.isFinite(selectedArea)
                    ? selectedArea
                    : boothArea;
                if (!Number.isFinite(targetArea) || targetArea < 0) {
                    throw createRouteError(`目标展位 ${boothId} 联合参展面积异常，无法选展位`, 400);
                }
                if (isJointTarget && targetArea >= boothArea) {
                    throw createRouteError(`目标展位 ${boothId} 联合参展面积必须小于展位总面积`, 400);
                }
                if (targetBoothOrders.length > 0 && isJointTarget && targetArea > 0) {
                    const { donorOrder, maxAvailableArea } = resolveJointAreaDonorOrder(targetBoothOrders, targetArea);
                    if (!donorOrder) {
                        throw createRouteError(buildInsufficientJointAreaMessage(boothId, maxAvailableArea), 400);
                    }
                    areaAdjustmentStatements.push(
                        env.DB.prepare("UPDATE Orders SET area = ROUND(area - ?, 2) WHERE id = ? AND status = '正常'")
                            .bind(targetArea, donorOrder.id)
                    );
                }
                const unitPrice = Number(boothRow.base_price || 0) > 0
                    ? Number(boothRow.base_price || 0)
                    : Number(priceMap[String(boothRow.type || '').trim()] || 0);
                const standardFee = String(boothRow.type || '') === '光地'
                    ? Number((unitPrice * targetArea).toFixed(2))
                    : Number((unitPrice * toBoothCount(targetArea)).toFixed(2));
                return {
                    id: boothId,
                    hall: String(boothRow.hall || ''),
                    type: String(boothRow.type || ''),
                    area: targetArea,
                    price_unit: String(boothRow.price_unit || (String(boothRow.type || '') === '光地' ? '平米' : '个')),
                    unit_price: unitPrice,
                    standard_fee: standardFee,
                    is_joint: isJointTarget ? 1 : 0
                };
            });
            if (targetBooths.some((target) => ['标摊', '豪标'].includes(String(target.type || '').trim()))) {
                const standardDisplayNameError = validateStandardBoothDisplayName(payload.standard_booth_display_name);
                if (standardDisplayNameError) return errorResponse(standardDisplayNameError, 400, corsHeaders);
            }
            const totalStandardFee = Number(targetBooths.reduce((sum, item) => sum + Number(item.standard_fee || 0), 0).toFixed(2));
            if (rawActualFee < totalStandardFee && !priceReason) {
                return errorResponse('新展位成交价低于系统原价时，请填写价格说明', 400, corsHeaders);
            }

            const releaseSettings = await getOrderReleaseSettings(env, projectId);
            const aggregatedOrder = buildAggregatedMultiBoothOrder(targetBooths, rawActualFee, normalizedFeeItems, Number(paymentSummary.paid_amount || 0));
            if (aggregatedOrder.error) return errorResponse(aggregatedOrder.error, 400, corsHeaders);
            if (Number(aggregatedOrder.area || 0) <= 0 && rawActualFee > 0) {
                return errorResponse('0面积联合参展的应收展位费必须为0', 400, corsHeaders);
            }
            const boothDisplayName = resolveCompositeBoothDisplayName(targetBooths, {
                ...payload,
                company_name: pendingOrder.company_name || ''
            });
            if (areaAdjustmentStatements.length > 0) {
                await executeStatementsInChunks(env, areaAdjustmentStatements, BATCH_CHUNK_SIZE);
            }
            const updateStatement = env.DB.prepare(`
                UPDATE Orders
                SET status = ?,
                    booth_id = ?,
                    area = ?,
                    price_unit = ?,
                    unit_price = ?,
                    total_booth_fee = ?,
                    other_income = ?,
                    fees_json = ?,
                    discount_reason = ?,
                    total_amount = ?,
                    booth_display_name = ?,
                    reserved_release_due_at = ?,
                    pending_payment_resolution_status = '',
                    pending_payment_handling_method = NULL,
                    pending_payment_handling_note = NULL,
                    pending_payment_handled_by = NULL,
                    pending_payment_handled_at = NULL
                WHERE id = ?
                  AND project_id = ?
                  AND status = ?
            `).bind(
                ORDER_STATUS_ACTIVE,
                aggregatedOrder.booth_id,
                aggregatedOrder.area,
                aggregatedOrder.price_unit,
                aggregatedOrder.unit_price,
                aggregatedOrder.total_booth_fee,
                aggregatedOrder.other_income,
                aggregatedOrder.fees_json,
                priceReason,
                aggregatedOrder.total_amount,
                boothDisplayName,
                paymentSummary.payment_count > 0
                    || Number(aggregatedOrder.total_booth_fee || 0) <= 0
                    || releaseSettings.release_after_minutes === null
                    ? null
                        : buildReleaseDueAt(releaseSettings.release_after_minutes),
                orderId,
                projectId,
                ORDER_STATUS_PENDING
            );
            const updateResult = await updateStatement.run();

            if (hasMetaChanges(updateResult) === 0) {
                return errorResponse('订单状态已变更，请刷新后重试', 409, corsHeaders);
            }

            await syncBoothStatusByBoothIds(env, projectId, targetBoothIds);
            await refreshOrderOverpaymentIssue(env, orderId, projectId);
            invalidateHomeDashboardCache(projectId);

            return new Response(JSON.stringify({
                success: true,
                order_id: orderId,
                booth_ids: targetBoothIds,
                created_count: 0
            }), { headers: corsHeaders });
        } catch (error) {
            if (error instanceof Error && error.message) {
                return errorResponse(error.message, Number(error.status) || 400, corsHeaders);
            }
            console.error('Reactivate pending order failed:', error);
            return internalErrorResponse(corsHeaders);
        } finally {
            if (lockInfo.lockToken) {
                await releaseBoothLocks(env, lockInfo.projectId, lockInfo.boothIds, lockInfo.lockToken);
            }
        }
    }

    if (url.pathname === '/api/handle-pending-order-payments' && request.method === 'POST') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可记录待确认订单收款处理方式', 403, corsHeaders);
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const orderId = Number(payload.order_id || 0);
        const projectId = Number(payload.project_id || 0);
        const method = String(payload.method || '').trim();
        const note = String(payload.note || '').trim();
        const methodLabels = {
            full_refund: '全额退款',
            next_year: '转为明年项目',
            custom: '自定义处理方式'
        };
        if (!orderId || !projectId) return errorResponse('缺少订单信息', 400, corsHeaders);
        if (!methodLabels[method]) return errorResponse('请选择有效的收款处理方式', 400, corsHeaders);
        if (method === 'custom' && !note) return errorResponse('自定义处理方式必须填写说明', 400, corsHeaders);

        const order = await env.DB.prepare(`
            SELECT id, status
            FROM Orders
            WHERE id = ? AND project_id = ?
        `).bind(orderId, projectId).first();
        if (!order) return errorResponse('订单不存在', 404, corsHeaders);
        if (String(order.status || '') !== ORDER_STATUS_PENDING) return errorResponse('仅待确认订单可记录收款处理方式', 400, corsHeaders);

        const paymentSummary = await getEffectivePaymentSummary(env, orderId);
        if (paymentSummary.payment_count <= 0) {
            return errorResponse('当前订单没有有效收款，无需记录处理方式，可由超级管理员删除', 400, corsHeaders);
        }

        const nowText = getChinaTimestamp();
        await env.DB.prepare(`
            UPDATE Orders
            SET pending_payment_resolution_status = 'recorded',
                pending_payment_handling_method = ?,
                pending_payment_handling_note = ?,
                pending_payment_handled_by = ?,
                pending_payment_handled_at = ?
            WHERE id = ? AND project_id = ? AND status = ?
        `).bind(
            method,
            method === 'custom' ? note : (note || methodLabels[method]),
            String(currentUser.name || ''),
            nowText,
            orderId,
            projectId,
            ORDER_STATUS_PENDING
        ).run();

        invalidateHomeDashboardCache(projectId);

        return new Response(JSON.stringify({
            success: true,
            method,
            method_label: methodLabels[method],
            handled_at: nowText
        }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/delete-pending-order' && request.method === 'POST') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可删除待确认订单', 403, corsHeaders);
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const orderId = Number(payload.order_id || 0);
        const projectId = Number(payload.project_id || 0);
        if (!orderId || !projectId) return errorResponse('缺少订单信息', 400, corsHeaders);

        const order = await env.DB.prepare(`
            SELECT id, status
            FROM Orders
            WHERE id = ? AND project_id = ?
        `).bind(orderId, projectId).first();
        if (!order) return errorResponse('订单不存在', 404, corsHeaders);
        if (String(order.status || '') !== ORDER_STATUS_PENDING) return errorResponse('仅待确认订单可删除', 400, corsHeaders);

        await env.DB.prepare('DELETE FROM Payments WHERE order_id = ? AND project_id = ?')
            .bind(orderId, projectId)
            .run();
        await env.DB.prepare('DELETE FROM Expenses WHERE order_id = ? AND project_id = ?')
            .bind(orderId, projectId)
            .run();
        await env.DB.prepare('DELETE FROM OrderOverpaymentIssues WHERE order_id = ? AND project_id = ?')
            .bind(orderId, projectId)
            .run();
        await env.DB.prepare('DELETE FROM OrderBoothChanges WHERE order_id = ? AND project_id = ?')
            .bind(orderId, projectId)
            .run();
        const deleteResult = await env.DB.prepare(`
            DELETE FROM Orders
            WHERE id = ?
              AND project_id = ?
              AND status = ?
        `).bind(
            orderId,
            projectId,
            ORDER_STATUS_PENDING
        ).run();
        if (hasMetaChanges(deleteResult) === 0) {
            return errorResponse('订单状态已变更，请刷新后重试', 409, corsHeaders);
        }

        invalidateHomeDashboardCache(projectId);

        return new Response(JSON.stringify({
            success: true,
            order_id: orderId
        }), { headers: corsHeaders });
    }

    if (url.pathname === '/api/cancel-order' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        const orderId = Number(payload.order_id || 0);
        if (!orderId) return errorResponse('缺少订单信息', 400, corsHeaders);

        const currentOrder = await env.DB.prepare(`
            SELECT
                o.*,
                b.hall,
                b.type AS booth_type
            FROM Orders o
            LEFT JOIN Booths b ON b.id = o.booth_id AND b.project_id = o.project_id
            WHERE o.id = ?
        `).bind(orderId).first();
        if (!currentOrder) return errorResponse('订单不存在', 404, corsHeaders);

        const hasPermission = await canManageOrder(env, currentUser, orderId);
        if (!hasPermission) return errorResponse('权限不足：仅管理员或所属业务员可退订订单', 403, corsHeaders);
        if (String(currentOrder.status || '') !== '正常') {
            return errorResponse('仅正常订单可退订', 400, corsHeaders);
        }

        const releaseResult = await releaseOrderToPending(env, currentOrder, {
            source: 'manual_cancel',
            reason: String(payload.reason || '人工退订').trim() || '人工退订',
            handledBy: String(currentUser.name || '')
        });
        if (!releaseResult.success) {
            return errorResponse('订单状态已变更，请刷新后重试', 409, corsHeaders);
        }

        const releasedBoothIds = splitBoothCodeList(releaseResult.released_booth_ids || releaseResult.released_booth_id);
        if (releasedBoothIds.length > 0) await syncBoothStatusByBoothIds(env, Number(currentOrder.project_id), releasedBoothIds);
        await refreshOrderOverpaymentIssue(env, orderId, Number(currentOrder.project_id));
        invalidateHomeDashboardCache(Number(currentOrder.project_id));
        return new Response(JSON.stringify({
            success: true,
            pending_order_id: orderId,
            effective_payment_count: releaseResult.effective_payment_count,
            effective_paid_amount: releaseResult.effective_paid_amount
        }), { headers: corsHeaders });
    }

    return null;
}
