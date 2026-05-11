import {
    formatChinaDateTime,
    getChinaTimestamp,
    hasMetaChanges,
    parseChinaDateTime
} from '../utils/helpers.mjs';
import { normalizeBoothCode, splitBoothCodeList } from '../utils/booth-map.mjs';
import { syncBoothStatusByBoothIds } from './booth-sync.mjs';

export const ORDER_STATUS_ACTIVE = '正常';
export const ORDER_STATUS_PENDING = '待确认';
export const ORDER_STATUS_VOID = '已作废';

export const PENDING_PAYMENT_STATUS_PENDING = 'pending';
export const PENDING_PAYMENT_STATUS_RECORDED = 'recorded';

const DEFAULT_RELEASE_SCAN_LIMIT = 100;
const MAX_RELEASE_AFTER_MINUTES = 10 * 365 * 24 * 60;
const DEFAULT_RELEASE_SWEEP_THROTTLE_MS = 30_000;
const recentReleaseSweepByProject = new Map();

export function normalizeReleaseAfterMinutes(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue <= 0) {
        throw new Error('释放时间必须是大于 0 的整数分钟，或留空表示永不自动释放');
    }
    if (numericValue > MAX_RELEASE_AFTER_MINUTES) {
        throw new Error('释放时间不能超过 10 年');
    }
    return numericValue;
}

export function buildReleaseDueAt(releaseAfterMinutes, baseDate = new Date()) {
    const normalizedMinutes = normalizeReleaseAfterMinutes(releaseAfterMinutes);
    if (normalizedMinutes === null) return null;
    const baseTime = baseDate instanceof Date ? baseDate.getTime() : Number(baseDate || Date.now());
    return formatChinaDateTime(new Date(baseTime + normalizedMinutes * 60 * 1000));
}

function parseChinaDateTimeOrNow(value) {
    const parsedTime = parseChinaDateTime(value);
    return Number.isFinite(parsedTime) ? new Date(parsedTime) : new Date();
}

function safeJsonStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return '{}';
    }
}

export async function getOrderReleaseSettings(env, projectId) {
    const row = await env.DB.prepare(`
        SELECT project_id, release_after_minutes, updated_by, updated_at
        FROM ProjectOrderReleaseSettings
        WHERE project_id = ?
    `).bind(Number(projectId)).first();
    if (!row) {
        return {
            project_id: Number(projectId || 0),
            release_after_minutes: null,
            updated_by: '',
            updated_at: ''
        };
    }
    return {
        ...row,
        release_after_minutes: row.release_after_minutes === null || row.release_after_minutes === undefined
            ? null
            : Number(row.release_after_minutes)
    };
}

export async function saveOrderReleaseSettings(env, projectId, releaseAfterMinutes, updatedBy) {
    const normalizedMinutes = normalizeReleaseAfterMinutes(releaseAfterMinutes);
    const nowText = getChinaTimestamp();
    await env.DB.prepare(`
        INSERT INTO ProjectOrderReleaseSettings (
            project_id, release_after_minutes, updated_by, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
            release_after_minutes = excluded.release_after_minutes,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at
    `).bind(
        Number(projectId),
        normalizedMinutes,
        String(updatedBy || ''),
        nowText
    ).run();
    return {
        project_id: Number(projectId),
        release_after_minutes: normalizedMinutes,
        updated_by: String(updatedBy || ''),
        updated_at: nowText
    };
}

export async function getEffectivePaymentSummary(env, orderId) {
    const row = await env.DB.prepare(`
        SELECT
            COUNT(*) AS payment_count,
            ROUND(COALESCE(SUM(amount), 0), 2) AS paid_amount
        FROM Payments
        WHERE order_id = ?
          AND deleted_at IS NULL
    `).bind(Number(orderId)).first();
    return {
        payment_count: Number(row?.payment_count || 0),
        paid_amount: Number(row?.paid_amount || 0)
    };
}

export function buildPendingReleaseSnapshot(order, meta = {}) {
    const boothIds = splitBoothCodeList(order?.booth_id);
    return safeJsonStringify({
        booth_id: normalizeBoothCode(order?.booth_id),
        booth_ids: boothIds,
        hall: String(order?.hall || ''),
        booth_type: String(order?.booth_type || order?.type || ''),
        area: Number(order?.area || 0),
        price_unit: String(order?.price_unit || ''),
        unit_price: Number(order?.unit_price || 0),
        total_booth_fee: Number(order?.total_booth_fee || 0),
        total_amount: Number(order?.total_amount || 0),
        other_income: Number(order?.other_income || 0),
        discount_reason: String(order?.discount_reason || ''),
        booth_display_name: String(order?.booth_display_name || ''),
        released_at: String(meta.released_at || ''),
        released_by: String(meta.released_by || ''),
        release_source: String(meta.release_source || ''),
        release_reason: String(meta.release_reason || '')
    });
}

export async function releaseOrderToPending(env, order, {
    source = 'manual_cancel',
    reason = '',
    handledBy = ''
} = {}) {
    const orderId = Number(order?.id || 0);
    const projectId = Number(order?.project_id || 0);
    if (!orderId || !projectId) return { success: false, reason: 'missing_order' };
    if (String(order?.status || '') !== ORDER_STATUS_ACTIVE) {
        return { success: false, reason: 'not_active' };
    }

    const nowText = getChinaTimestamp();
    const oldBoothIds = splitBoothCodeList(order.booth_id);
    const paymentSummary = await getEffectivePaymentSummary(env, orderId);
    const pendingPaymentStatus = paymentSummary.payment_count > 0 ? PENDING_PAYMENT_STATUS_PENDING : '';
    const releaseSnapshot = buildPendingReleaseSnapshot(order, {
        released_at: nowText,
        released_by: handledBy,
        release_source: source,
        release_reason: reason
    });
    const nextTotalAmount = Number(Number(order.other_income || 0).toFixed(2));

    const result = await env.DB.prepare(`
        UPDATE Orders
        SET status = ?,
            pending_at = ?,
            pending_source = ?,
            pending_reason = ?,
            pending_release_snapshot_json = ?,
            pending_payment_resolution_status = ?,
            pending_payment_handling_method = NULL,
            pending_payment_handling_note = NULL,
            pending_payment_handled_by = NULL,
            pending_payment_handled_at = NULL,
            reserved_release_due_at = NULL,
            booth_id = '',
            area = 0,
            price_unit = '',
            unit_price = 0,
            total_booth_fee = 0,
            booth_display_name = '',
            total_amount = ?
        WHERE id = ?
          AND project_id = ?
          AND status = ?
    `).bind(
        ORDER_STATUS_PENDING,
        nowText,
        String(source || ''),
        String(reason || ''),
        releaseSnapshot,
        pendingPaymentStatus,
        nextTotalAmount,
        orderId,
        projectId,
        ORDER_STATUS_ACTIVE
    ).run();

    if (hasMetaChanges(result) === 0) {
        return { success: false, reason: 'conflict' };
    }

    return {
        success: true,
        order_id: orderId,
        project_id: projectId,
        released_booth_id: oldBoothIds[0] || '',
        released_booth_ids: oldBoothIds,
        effective_payment_count: paymentSummary.payment_count,
        effective_paid_amount: paymentSummary.paid_amount,
        pending_payment_resolution_status: pendingPaymentStatus
    };
}

export async function expireOverdueReservedOrders(env, projectId = 0, options = {}) {
    const normalizedProjectId = Number(projectId || 0);
    const limit = Math.max(1, Math.min(Number(options.limit || DEFAULT_RELEASE_SCAN_LIMIT), DEFAULT_RELEASE_SCAN_LIMIT));
    const whereProjectSql = normalizedProjectId ? 'AND o.project_id = ?' : '';
    const params = normalizedProjectId ? [normalizedProjectId, limit] : [limit];
    const rows = (await env.DB.prepare(`
        SELECT
            o.*,
            b.hall,
            b.type AS booth_type
        FROM Orders o
        LEFT JOIN Booths b ON b.id = o.booth_id AND b.project_id = o.project_id
        WHERE o.status = '正常'
          ${whereProjectSql}
          AND o.reserved_release_due_at IS NOT NULL
          AND datetime(o.reserved_release_due_at) <= datetime('now', '+8 hours')
          AND COALESCE(o.booth_id, '') != ''
          AND COALESCE(o.total_booth_fee, 0) > 0
          AND NOT EXISTS (
              SELECT 1
              FROM Payments p
              WHERE p.order_id = o.id
                AND p.deleted_at IS NULL
          )
        ORDER BY datetime(o.reserved_release_due_at) ASC, o.id ASC
        LIMIT ?
    `).bind(...params).all()).results || [];

    const boothIdsByProject = new Map();
    const releasedOrderIds = [];
    for (const row of rows) {
        const releaseResult = await releaseOrderToPending(env, row, {
            source: 'auto_release',
            reason: '超过无收款释放时间自动转入待确认',
            handledBy: 'system'
        });
        if (!releaseResult.success) continue;
        releasedOrderIds.push(Number(row.id));
        const boothIds = splitBoothCodeList(releaseResult.released_booth_ids || releaseResult.released_booth_id);
        if (boothIds.length === 0) continue;
        const rowProjectId = Number(row.project_id || 0);
        if (!boothIdsByProject.has(rowProjectId)) boothIdsByProject.set(rowProjectId, new Set());
        boothIds.forEach((boothId) => boothIdsByProject.get(rowProjectId).add(boothId));
    }

    for (const [syncProjectId, boothIds] of boothIdsByProject.entries()) {
        await syncBoothStatusByBoothIds(env, syncProjectId, Array.from(boothIds));
    }

    return {
        released_count: releasedOrderIds.length,
        released_order_ids: releasedOrderIds
    };
}

export function clearReleaseSweepThrottle(projectId = 0) {
    const normalizedProjectId = Number(projectId || 0);
    if (normalizedProjectId > 0) {
        recentReleaseSweepByProject.delete(normalizedProjectId);
        return;
    }
    recentReleaseSweepByProject.clear();
}

export async function expireOverdueReservedOrdersThrottled(env, projectId = 0, options = {}) {
    const normalizedProjectId = Number(projectId || 0);
    const throttleMs = Math.max(0, Number(options.throttleMs || DEFAULT_RELEASE_SWEEP_THROTTLE_MS));
    if (!normalizedProjectId || throttleMs === 0) {
        return expireOverdueReservedOrders(env, normalizedProjectId, options);
    }

    const now = Date.now();
    for (const [cachedProjectId, entry] of recentReleaseSweepByProject.entries()) {
        if (!entry || Number(entry.expiresAt || 0) <= now) {
            recentReleaseSweepByProject.delete(cachedProjectId);
        }
    }

    const cachedEntry = recentReleaseSweepByProject.get(normalizedProjectId);
    if (cachedEntry && Number(cachedEntry.expiresAt || 0) > now) {
        return {
            released_count: 0,
            released_order_ids: [],
            skipped: true
        };
    }

    recentReleaseSweepByProject.set(normalizedProjectId, {
        expiresAt: now + throttleMs
    });
    try {
        return await expireOverdueReservedOrders(env, normalizedProjectId, options);
    } catch (error) {
        recentReleaseSweepByProject.delete(normalizedProjectId);
        throw error;
    }
}

export async function refreshOrderReleaseDue(env, orderId) {
    const order = await env.DB.prepare(`
        SELECT id, project_id, status, booth_id, total_booth_fee, paid_amount
        FROM Orders
        WHERE id = ?
    `).bind(Number(orderId)).first();
    if (!order) return null;

    const shouldClear = String(order.status || '') !== ORDER_STATUS_ACTIVE
        || !normalizeBoothCode(order.booth_id)
        || Number(order.total_booth_fee || 0) <= 0;
    if (shouldClear) {
        await env.DB.prepare('UPDATE Orders SET reserved_release_due_at = NULL WHERE id = ?')
            .bind(Number(orderId)).run();
        return null;
    }

    const paymentSummary = await getEffectivePaymentSummary(env, orderId);
    if (paymentSummary.payment_count > 0 || paymentSummary.paid_amount > 0) {
        await env.DB.prepare('UPDATE Orders SET reserved_release_due_at = NULL WHERE id = ?')
            .bind(Number(orderId)).run();
        return null;
    }

    const settings = await getOrderReleaseSettings(env, Number(order.project_id));
    if (settings.release_after_minutes === null) {
        await env.DB.prepare('UPDATE Orders SET reserved_release_due_at = NULL WHERE id = ?')
            .bind(Number(orderId)).run();
        return null;
    }

    const dueAt = buildReleaseDueAt(settings.release_after_minutes);
    await env.DB.prepare('UPDATE Orders SET reserved_release_due_at = ? WHERE id = ?')
        .bind(dueAt, Number(orderId)).run();
    return dueAt;
}

export async function buildInitialReleaseDueAtForOrder(env, projectId, {
    hasBooth = true,
    totalBoothFee = 0,
    baseDate = new Date()
} = {}) {
    if (!hasBooth || Number(totalBoothFee || 0) <= 0) return null;
    const settings = await getOrderReleaseSettings(env, projectId);
    if (settings.release_after_minutes === null) return null;
    return buildReleaseDueAt(settings.release_after_minutes, baseDate);
}

export async function syncReleaseDueForUnpaidOrders(env, projectId, releaseAfterMinutes) {
    const normalizedProjectId = Number(projectId || 0);
    const normalizedMinutes = normalizeReleaseAfterMinutes(releaseAfterMinutes);
    if (!normalizedProjectId) return { updated_count: 0 };

    let result;
    if (normalizedMinutes === null) {
        result = await env.DB.prepare(`
            UPDATE Orders
            SET reserved_release_due_at = NULL
            WHERE project_id = ?
              AND status = ?
        `).bind(normalizedProjectId, ORDER_STATUS_ACTIVE).run();
        return { updated_count: hasMetaChanges(result) };
    }

    const activeUnpaidOrders = (await env.DB.prepare(`
        SELECT id, created_at
        FROM Orders o
        WHERE o.project_id = ?
          AND o.status = ?
          AND COALESCE(o.booth_id, '') != ''
          AND COALESCE(o.total_booth_fee, 0) > 0
          AND NOT EXISTS (
              SELECT 1
              FROM Payments p
              WHERE p.order_id = o.id
                AND p.deleted_at IS NULL
          )
    `).bind(normalizedProjectId, ORDER_STATUS_ACTIVE).all()).results || [];

    let updatedCount = 0;
    for (const order of activeUnpaidOrders) {
        const dueAt = buildReleaseDueAt(normalizedMinutes, parseChinaDateTimeOrNow(order.created_at));
        const updateResult = await env.DB.prepare(`
            UPDATE Orders
            SET reserved_release_due_at = ?
            WHERE id = ?
        `).bind(dueAt, Number(order.id)).run();
        updatedCount += hasMetaChanges(updateResult);
    }

    const clearResult = await env.DB.prepare(`
        UPDATE Orders
        SET reserved_release_due_at = NULL
        WHERE project_id = ?
          AND status = ?
          AND (
              COALESCE(booth_id, '') = ''
              OR COALESCE(total_booth_fee, 0) <= 0
              OR EXISTS (
                  SELECT 1
                  FROM Payments p
                  WHERE p.order_id = Orders.id
                    AND p.deleted_at IS NULL
              )
          )
    `).bind(normalizedProjectId, ORDER_STATUS_ACTIVE).run();

    return {
        updated_count: updatedCount + hasMetaChanges(clearResult)
    };
}
