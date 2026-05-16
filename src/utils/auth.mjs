import { errorResponse } from './response.mjs';
import { isDefaultPasswordHash } from './crypto.mjs';

export function normalizeUserRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (!normalized) return 'user';
    if (normalized === 'sales') return 'user';
    if (normalized === 'superadmin') return 'super_admin';
    if (normalized === 'exhibition' || normalized === 'exhibition_admin' || normalized === 'exhibition-manager') return 'exhibition_manager';
    return normalized;
}

export function isExhibitionManager(user) {
    if (!user) return false;
    return normalizeUserRole(user.role) === 'exhibition_manager';
}

export function isAdminUser(user) {
    if (!user) return false;
    const normalizedRole = normalizeUserRole(user.role);
    return normalizedRole === 'admin' || normalizedRole === 'super_admin';
}

export function canManageExhibitionModule(user) {
    return isAdminUser(user) || isExhibitionManager(user);
}

export function canManageBoothMap(user) {
    return isSuperAdmin(user) || isExhibitionManager(user);
}

export function canConfirmExhibitionRentals(user) {
    return canManageExhibitionModule(user);
}

async function getOrderSalesOwner(env, orderId) {
    if (!orderId) return null;
    return env.DB.prepare('SELECT sales_name FROM Orders WHERE id = ?')
        .bind(Number(orderId))
        .first();
}

export async function getStaffAuthState(env, staffName) {
    const row = await env.DB.prepare(`
      SELECT name, role, password, COALESCE(token_index, 0) AS token_index
      FROM Staff
      WHERE name = ?
    `).bind(String(staffName || '').trim()).first();
    if (!row) return null;
    return {
        name: row.name,
        role: row.role,
        token_index: Number(row.token_index || 0),
        must_change_password: await isDefaultPasswordHash(row.password)
    };
}

export function isSuperAdmin(user) {
    if (!user) return false;
    const normalizedRole = normalizeUserRole(user.role);
    return normalizedRole === 'super_admin' || (normalizedRole === 'admin' && user.name === 'admin');
}

export function requireSuperAdmin(currentUser, corsHeaders) {
    if (!isSuperAdmin(currentUser)) {
        return errorResponse('仅超级管理员可操作', 403, corsHeaders);
    }
    return null;
}

export async function canManageOrder(env, currentUser, orderId) {
    if (isSuperAdmin(currentUser)) return true;
    const order = await getOrderSalesOwner(env, orderId);
    return !!order && order.sales_name === currentUser?.name;
}

export async function canViewSensitiveOrderFields(env, currentUser, orderId) {
    if (isSuperAdmin(currentUser)) return true;
    const order = await getOrderSalesOwner(env, orderId);
    return !!order && order.sales_name === currentUser?.name;
}

export async function canViewOrderCommercialNotes(env, currentUser, orderId) {
    if (isAdminUser(currentUser)) return true;
    const order = await getOrderSalesOwner(env, orderId);
    return !!order && order.sales_name === currentUser?.name;
}

export async function canHandleOverpayment(env, currentUser, orderId) {
    if (isSuperAdmin(currentUser)) return true;
    const order = await getOrderSalesOwner(env, orderId);
    return !!order && order.sales_name === currentUser?.name;
}
