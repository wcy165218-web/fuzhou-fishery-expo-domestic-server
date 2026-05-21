import { canConfirmExhibitionRentals, canManageExhibitionModule, isAdminUser, isExhibitionManager, isSuperAdmin } from '../utils/auth.mjs';
import { splitBoothCodeList } from '../utils/booth-map.mjs';
import {
    countDisplayNameUnits,
    getChinaTimestamp,
    normalizeUploadExtension,
    parseChinaDateTime,
    validateExhibitionImageFile
} from '../utils/helpers.mjs';
import {
    buildPrivateFileCacheHeaders,
    errorResponse,
    internalErrorResponse,
    isEtagNotModified
} from '../utils/response.mjs';
import {
    EXHIBITION_IMAGE_UPLOAD_BODY_LIMIT,
    readFormDataBody,
    readJsonBody
} from '../utils/request.mjs';
import { decryptSensitiveValue, encryptSensitiveValue } from '../utils/crypto.mjs';
import { invalidateRuntimeViewCache } from '../services/booth-map-view.mjs';
import { checkPublicSubmitRateLimit } from '../services/write-rate-limit.mjs';

const SQL_IN_CHUNK_SIZE = 80;
const COMPANY_SEARCH_LIMIT = 30;
const PAYMENT_METHOD_ORGANIZER = 'organizer';
const PAYMENT_METHOD_VENUE = 'venue';
const RENTAL_MODE_BOOTH = 'booth';
const RENTAL_MODE_NO_BOOTH = 'no_booth';
const VENUE_CONFIRMATION_PENDING = 0;
const VENUE_CONFIRMATION_CONFIRMED = 1;
const LINTEL_UNCONFIRMED = 0;
const LINTEL_CONFIRMED = 1;
const SPECIAL_DECORATION_UNREPORTED = 0;
const SPECIAL_DECORATION_REPORTED = 1;
const SPECIAL_DECORATION_PAGE_SIZE = 20;
const LEGACY_LINTEL_NAME_UNIT_LIMIT = 24;
const LINTEL_LOCK_MESSAGE = '展务已确认，请联系展务组修改';
const ELIGIBLE_LINTEL_BOOTH_TYPES = new Set(['标摊', '豪标']);
const SPECIAL_DECORATION_BOOTH_TYPE = '光地';
const EXHIBITOR_INFO_STATUS_DEFAULT = 'sales_default';
const EXHIBITOR_INFO_STATUS_CONFIRMED = 'exhibitor_confirmed';
const EXHIBITOR_INFO_STATUS_REOPENED = 'reopened';
const EXHIBITOR_CONFIRMATION_OPERATOR = '展商确认链接';
const LINTEL_CONFIRM_SOURCE_SALES = 'sales';
const LINTEL_CONFIRM_SOURCE_EXHIBITOR = 'exhibitor';
const DEFAULT_CONFIRMATION_LINK_TTL_MINUTES = 30;
const CONFIRMATION_TOKEN_BYTES = 32;
const CONFIRMATION_BANNER_PREFIX = 'exhibitor-confirmation-banners';
const PROFILE_MAX_LENGTH = 300;

function chunkItems(items = [], chunkSize = SQL_IN_CHUNK_SIZE) {
    const output = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        output.push(items.slice(index, index + chunkSize));
    }
    return output;
}

function normalizeProjectId(value) {
    const projectId = Number(value || 0);
    return Number.isInteger(projectId) && projectId > 0 ? projectId : 0;
}

function normalizeSearchValue(value) {
    return String(value || '').trim();
}

function escapeSqlLikePattern(value) {
    return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function roundCurrency(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Number(amount.toFixed(2));
}

function normalizeNonNegativeInteger(value) {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 0) return NaN;
    return amount;
}

function normalizePaymentMethod(value) {
    const normalized = String(value || '').trim();
    if (normalized === PAYMENT_METHOD_ORGANIZER) return PAYMENT_METHOD_ORGANIZER;
    if (normalized === PAYMENT_METHOD_VENUE) return PAYMENT_METHOD_VENUE;
    return '';
}

function normalizeRentalMode(value) {
    return String(value || '').trim() === RENTAL_MODE_NO_BOOTH ? RENTAL_MODE_NO_BOOTH : RENTAL_MODE_BOOTH;
}

function normalizeVenueConfirmationFlag(value) {
    return Number(value || 0) === VENUE_CONFIRMATION_CONFIRMED ? VENUE_CONFIRMATION_CONFIRMED : VENUE_CONFIRMATION_PENDING;
}

function isVenueConfirmedRental(rental) {
    return normalizeVenueConfirmationFlag(rental?.venue_confirmed) === VENUE_CONFIRMATION_CONFIRMED;
}

function getVenueConfirmationLabel(rental) {
    return isVenueConfirmedRental(rental) ? '已确认' : '未确认';
}

function getPaymentMethodLabel(value) {
    return value === PAYMENT_METHOD_ORGANIZER ? '组委会付款' : '企业直接付至主场';
}

function buildRefrigeratorImageApiUrl(imageKey) {
    const normalizedKey = String(imageKey || '').trim();
    return normalizedKey ? `/api/exhibition/refrigerator-image/${encodeURIComponent(normalizedKey)}` : '';
}

function buildCsvCell(value) {
    const normalized = String(value ?? '');
    if (/[",\r\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}

// Excel 打开 CSV 时会把 1E40 之类的展位号识别为科学计数法。
// 用 ="value" 公式包裹强制以文本格式呈现；空值保持空。
function buildCsvTextCell(value) {
    const normalized = String(value ?? '');
    if (!normalized) return '';
    return `"=""${normalized.replace(/"/g, '""')}"""`;
}

function buildCsvContent(rows = []) {
    return `\uFEFF${rows.map((row) => row.map((cell) => {
        if (cell && typeof cell === 'object' && cell.__excelText) {
            return buildCsvTextCell(cell.value);
        }
        return buildCsvCell(cell);
    }).join(',')).join('\r\n')}`;
}

function uint8ToBase64Url(bytes) {
    const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join('');
    return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function bytesToHex(bytes) {
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createConfirmationToken() {
    return uint8ToBase64Url(crypto.getRandomValues(new Uint8Array(CONFIRMATION_TOKEN_BYTES)));
}

async function hashConfirmationToken(token) {
    const data = new TextEncoder().encode(String(token || '').trim());
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
}

function normalizeConfirmationLinkTtlMinutes(value) {
    const normalized = Math.floor(Number(value || DEFAULT_CONFIRMATION_LINK_TTL_MINUTES));
    if (!Number.isFinite(normalized) || normalized <= 0) return DEFAULT_CONFIRMATION_LINK_TTL_MINUTES;
    return normalized;
}

function addMinutesToChinaTimestamp(minutes) {
    return getChinaTimestamp(new Date(Date.now() + (normalizeConfirmationLinkTtlMinutes(minutes) * 60 * 1000)));
}

function isChinaTimestampExpired(value) {
    const timestamp = parseChinaDateTime(value);
    return !!timestamp && timestamp <= Date.now();
}

function normalizeConfirmationDeadlineAt(value) {
    const normalized = String(value || '').trim().replace('T', ' ');
    if (!normalized) return '';
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return '';
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || '00'}`;
}

function formatConfirmationDeadlineDisplay(value) {
    const normalized = normalizeConfirmationDeadlineAt(value);
    if (!normalized) return '';
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!match) return normalized;
    return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日 ${match[4]}:${match[5]}`;
}

function isConfirmationCollectionClosed(settings = {}) {
    const source = settings || {};
    const deadline = normalizeConfirmationDeadlineAt(source.collection_deadline_at);
    if (!deadline) return false;
    return isChinaTimestampExpired(deadline);
}

function getPublicSubmitClientKey(request) {
    const headers = request?.headers;
    const forwardedFor = String(headers?.get?.('CF-Connecting-IP') || headers?.get?.('X-Forwarded-For') || headers?.get?.('X-Real-IP') || '').trim();
    const firstValue = forwardedFor.split(',')[0]?.trim() || 'unknown';
    return firstValue.replace(/[^a-zA-Z0-9:._-]/g, '').slice(0, 96) || 'unknown';
}

function normalizeExhibitorInfoStatus(value) {
    const normalized = String(value || '').trim();
    if (normalized === EXHIBITOR_INFO_STATUS_CONFIRMED || normalized === EXHIBITOR_INFO_STATUS_REOPENED) return normalized;
    return EXHIBITOR_INFO_STATUS_DEFAULT;
}

function getBasicInfoStatusLabel(value) {
    const normalized = normalizeExhibitorInfoStatus(value);
    if (normalized === EXHIBITOR_INFO_STATUS_CONFIRMED) return '已确认';
    if (normalized === EXHIBITOR_INFO_STATUS_REOPENED) return '待重新提交';
    return '默认';
}

function getLintelConfirmSourceLabel(value) {
    return String(value || '').trim() === LINTEL_CONFIRM_SOURCE_EXHIBITOR ? '展商' : '业务员';
}

function normalizePublicBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
        const pathname = parsed.pathname.replace(/\/+$/g, '');
        return `${parsed.protocol}//${parsed.host}${pathname === '/' ? '' : pathname}`;
    } catch (error) {
        return '';
    }
}

function getPublicConfirmationUrl(url, token, env = {}) {
    const configuredBaseUrl = normalizePublicBaseUrl(env?.CONFIRMATION_PUBLIC_ORIGIN);
    if (configuredBaseUrl) return `${configuredBaseUrl}/${encodeURIComponent(token)}`;
    return `${url.origin}/exhibitor-confirm?token=${encodeURIComponent(token)}`;
}

function buildConfirmationShareMessage({ projectName, companyName, publicUrl }) {
    const normalizedProjectName = String(projectName || '福州渔博会').trim();
    const normalizedCompanyName = String(companyName || '').trim();
    return `【${normalizedProjectName}】您好，请点击以下安全链接，核对并确认贵司（${normalizedCompanyName}）的参展信息：${publicUrl}`;
}

function normalizeBoothCode(value) {
    return String(value || '').trim().toUpperCase();
}

function getLintelCompositeKey(orderId, boothCode) {
    return `${Number(orderId || 0)}::${normalizeBoothCode(boothCode)}`;
}

function normalizePositiveInteger(value, fallback = 1) {
    const normalized = Number(value || 0);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeSpecialDecorationStatusFilter(value) {
    const normalized = String(value || '').trim();
    if (normalized === 'reported' || normalized === 'unreported') return normalized;
    return 'all';
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

function compareBoothCodeValues(leftValue, rightValue) {
    return normalizeBoothCode(leftValue).localeCompare(normalizeBoothCode(rightValue), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function isEligibleLintelBoothType(boothType) {
    return ELIGIBLE_LINTEL_BOOTH_TYPES.has(String(boothType || '').trim());
}

function isSpecialDecorationBoothType(boothType) {
    return String(boothType || '').trim() === SPECIAL_DECORATION_BOOTH_TYPE;
}

function canViewAllSpecialDecorations(currentUser) {
    return isSuperAdmin(currentUser) || isExhibitionManager(currentUser);
}

function canManageSpecialDecorations(currentUser) {
    return canViewAllSpecialDecorations(currentUser);
}

function isMissingTableError(error) {
    return /no such table/i.test(String(error?.message || ''));
}

function formatLintelBoothTypeLabel(boothType) {
    const normalized = String(boothType || '').trim();
    return normalized === '豪标' ? '升级标摊' : normalized;
}

function truncateLintelValueByUnits(value, maxUnits = LEGACY_LINTEL_NAME_UNIT_LIMIT) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    let units = 0;
    let output = '';
    for (const char of Array.from(normalized)) {
        const charUnits = /[\u0000-\u00ff]/.test(char) ? 1 : 2;
        if (units + charUnits > maxUnits) break;
        units += charUnits;
        output += char;
    }
    return output;
}

function getDefaultLintelNameZh(companyName) {
    return String(companyName || '').trim();
}

function resolveLintelChineseName(storedValue, companyName) {
    const normalizedStoredValue = String(storedValue || '').trim();
    const normalizedCompanyName = String(companyName || '').trim();
    if (!normalizedStoredValue) return normalizedCompanyName;
    const legacyDefaultValue = truncateLintelValueByUnits(normalizedCompanyName, LEGACY_LINTEL_NAME_UNIT_LIMIT);
    if (legacyDefaultValue && legacyDefaultValue === normalizedStoredValue && legacyDefaultValue !== normalizedCompanyName) {
        return normalizedCompanyName;
    }
    return normalizedStoredValue;
}

function validateLintelChineseName(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '中文楣板名不能为空';
    return '';
}

function validateLintelEnglishName(value) {
    void value;
    return '';
}

function canViewAllLintels(currentUser) {
    return canManageExhibitionModule(currentUser);
}

function canManageLintelBusiness(currentUser, salesName) {
    return canViewAllLintels(currentUser) || String(currentUser?.name || '').trim() === String(salesName || '').trim();
}

function buildDefaultLintelRecord(sourceRow) {
    return {
        id: 0,
        project_id: Number(sourceRow?.project_id || 0),
        order_id: Number(sourceRow?.order_id || 0),
        booth_code: normalizeBoothCode(sourceRow?.booth_code),
        name_zh: getDefaultLintelNameZh(sourceRow?.company_name || ''),
        name_en: '',
        remark: '',
        business_confirmed: LINTEL_UNCONFIRMED,
        business_confirmed_by: '',
        business_confirmed_at: '',
        business_confirm_source: '',
        exhibition_confirmed: LINTEL_UNCONFIRMED,
        exhibition_confirmed_by: '',
        exhibition_confirmed_at: '',
        created_at: '',
        updated_at: ''
    };
}

function normalizeLintelRecord(record, sourceRow) {
    const fallback = buildDefaultLintelRecord(sourceRow);
    if (!record) return fallback;
    return {
        ...fallback,
        ...record,
        booth_code: normalizeBoothCode(record.booth_code || fallback.booth_code),
        name_zh: resolveLintelChineseName(record.name_zh, sourceRow?.company_name || fallback.name_zh),
        name_en: String(record.name_en || '').trim(),
        remark: String(record.remark || '').trim(),
        business_confirmed: Number(record.business_confirmed || 0) === LINTEL_CONFIRMED ? LINTEL_CONFIRMED : LINTEL_UNCONFIRMED,
        exhibition_confirmed: Number(record.exhibition_confirmed || 0) === LINTEL_CONFIRMED ? LINTEL_CONFIRMED : LINTEL_UNCONFIRMED,
        business_confirmed_by: String(record.business_confirmed_by || '').trim(),
        business_confirmed_at: String(record.business_confirmed_at || '').trim(),
        business_confirm_source: String(record.business_confirm_source || '').trim(),
        exhibition_confirmed_by: String(record.exhibition_confirmed_by || '').trim(),
        exhibition_confirmed_at: String(record.exhibition_confirmed_at || '').trim(),
        created_at: String(record.created_at || '').trim(),
        updated_at: String(record.updated_at || '').trim()
    };
}

function buildLintelListRow(sourceRow, record, currentUser, index) {
    const normalizedRecord = normalizeLintelRecord(record, sourceRow);
    const businessConfirmed = normalizedRecord.business_confirmed === LINTEL_CONFIRMED;
    const exhibitionConfirmed = normalizedRecord.exhibition_confirmed === LINTEL_CONFIRMED;
    const businessConfirmSource = businessConfirmed
        ? (normalizedRecord.business_confirm_source === LINTEL_CONFIRM_SOURCE_EXHIBITOR ? LINTEL_CONFIRM_SOURCE_EXHIBITOR : LINTEL_CONFIRM_SOURCE_SALES)
        : '';
    const canManageBusiness = canManageLintelBusiness(currentUser, sourceRow.sales_name);
    const exhibitorConfirmed = businessConfirmed && businessConfirmSource === LINTEL_CONFIRM_SOURCE_EXHIBITOR;
    return {
        key: getLintelCompositeKey(sourceRow.order_id, sourceRow.booth_code),
        id: Number(normalizedRecord.id || 0),
        project_id: Number(sourceRow.project_id || 0),
        order_id: Number(sourceRow.order_id || 0),
        sequence: index + 1,
        booth_code: sourceRow.booth_code,
        hall: sourceRow.hall,
        booth_type: sourceRow.booth_type,
        booth_type_label: sourceRow.booth_type_label,
        company_name: sourceRow.company_name,
        sales_name: sourceRow.sales_name,
        name_zh: normalizedRecord.name_zh,
        name_en: normalizedRecord.name_en,
        remark: normalizedRecord.remark,
        business_confirmed: normalizedRecord.business_confirmed,
        business_confirm_source: businessConfirmSource,
        business_confirm_status: businessConfirmed
            ? (businessConfirmSource === LINTEL_CONFIRM_SOURCE_EXHIBITOR ? '展商已确认' : '业务已确认')
            : '未确认',
        business_confirmed_by: normalizedRecord.business_confirmed_by,
        business_confirmed_at: normalizedRecord.business_confirmed_at,
        exhibition_confirmed: normalizedRecord.exhibition_confirmed,
        exhibition_confirm_status: exhibitionConfirmed ? '展务已确认' : '未确认',
        exhibition_confirmed_by: normalizedRecord.exhibition_confirmed_by,
        exhibition_confirmed_at: normalizedRecord.exhibition_confirmed_at,
        can_edit: canManageBusiness && !businessConfirmed && !exhibitionConfirmed,
        can_business_toggle: canManageBusiness && !exhibitionConfirmed && !exhibitorConfirmed,
        can_exhibition_toggle: (isSuperAdmin(currentUser) || isExhibitionManager(currentUser)) && (exhibitionConfirmed || businessConfirmed),
        business_lock_reason: exhibitionConfirmed
            ? LINTEL_LOCK_MESSAGE
            : (canManageBusiness ? (exhibitorConfirmed ? '展商已确认，需申请编辑后重新提交' : (businessConfirmed ? '业务已确认，撤回后才可编辑' : '')) : '无权限操作该条楣板'),
        exhibition_lock_reason: (!isSuperAdmin(currentUser) && !isExhibitionManager(currentUser))
            ? '仅超级管理员或展务管理人员可展务确认'
            : (!exhibitionConfirmed && !businessConfirmed ? '请先完成业务确认' : ''),
        created_at: normalizedRecord.created_at,
        updated_at: normalizedRecord.updated_at
    };
}

function normalizeLintelSelectionItems(payload) {
    const rawItems = Array.isArray(payload?.items) && payload.items.length > 0
        ? payload.items
        : [payload];
    return rawItems.map((item) => ({
        order_id: Number(item?.order_id || 0),
        booth_code: normalizeBoothCode(item?.booth_code)
    })).filter((item) => item.order_id > 0 && item.booth_code);
}

function normalizeSpecialDecorationSelectionItems(payload) {
    const rawItems = Array.isArray(payload?.order_ids) && payload.order_ids.length > 0
        ? payload.order_ids
        : (Array.isArray(payload?.items) && payload.items.length > 0 ? payload.items : [payload?.order_id || payload?.id]);
    return Array.from(new Set(rawItems.map((item) => Number(typeof item === 'object' ? item?.order_id || item?.id : item)).filter((id) => Number.isInteger(id) && id > 0)));
}

function normalizeSpecialDecorationRecord(record) {
    const reported = Number(record?.reported || 0) === SPECIAL_DECORATION_REPORTED ? SPECIAL_DECORATION_REPORTED : SPECIAL_DECORATION_UNREPORTED;
    return {
        id: Number(record?.id || 0),
        project_id: Number(record?.project_id || 0),
        order_id: Number(record?.order_id || 0),
        reported,
        reported_by: String(record?.reported_by || '').trim(),
        reported_at: String(record?.reported_at || '').trim(),
        updated_by: String(record?.updated_by || '').trim(),
        created_at: String(record?.created_at || '').trim(),
        updated_at: String(record?.updated_at || '').trim()
    };
}

function resolveSpecialDecorationReportState(orderIds = [], recordMap = new Map()) {
    const normalizedOrderIds = Array.from(new Set((Array.isArray(orderIds) ? orderIds : [])
        .map((orderId) => Number(orderId || 0))
        .filter((orderId) => orderId > 0)));
    const records = normalizedOrderIds
        .map((orderId) => normalizeSpecialDecorationRecord(recordMap.get(orderId)))
        .filter((record) => Number(record.order_id || 0) > 0 || Number(record.id || 0) > 0);
    const reported = normalizedOrderIds.length > 0
        && normalizedOrderIds.every((orderId) => normalizeSpecialDecorationRecord(recordMap.get(orderId)).reported === SPECIAL_DECORATION_REPORTED);
    const latestRecord = records.sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')))[0] || null;
    return {
        ...(latestRecord || normalizeSpecialDecorationRecord(null)),
        reported: reported ? SPECIAL_DECORATION_REPORTED : SPECIAL_DECORATION_UNREPORTED
    };
}

function buildSpecialDecorationSourceRow(projectId, orderRow, boothRows = []) {
    const groundBooths = (Array.isArray(boothRows) ? boothRows : [])
        .filter((booth) => isSpecialDecorationBoothType(booth?.type))
        .map((booth) => ({
            id: normalizeBoothCode(booth.id),
            hall: String(booth.hall || '').trim(),
            area: roundCurrency(booth.area)
        }))
        .filter((booth) => booth.id)
        .sort((left, right) => compareBoothCodeValues(left.id, right.id));
    if (!groundBooths.length) return null;
    const hallNames = [...new Set(groundBooths.map((booth) => booth.hall).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    const groundArea = roundCurrency(groundBooths.reduce((sum, booth) => sum + Number(booth.area || 0), 0));
    return {
        key: String(Number(orderRow?.id || 0)),
        project_id: projectId,
        order_id: Number(orderRow?.id || 0),
        order_ids: [Number(orderRow?.id || 0)].filter((orderId) => orderId > 0),
        company_name: String(orderRow?.company_name || '').trim(),
        company_names: [String(orderRow?.company_name || '').trim()].filter(Boolean),
        sales_name: String(orderRow?.sales_name || '').trim(),
        sales_names: [String(orderRow?.sales_name || '').trim()].filter(Boolean),
        booth_codes: groundBooths.map((booth) => booth.id),
        booth_code: groundBooths.map((booth) => booth.id).join(', '),
        sort_booth_code: groundBooths[0]?.id || '',
        hall_names: hallNames,
        hall: hallNames.join('，'),
        area: groundArea > 0 ? groundArea : roundCurrency(orderRow?.area),
        order_created_at: String(orderRow?.created_at || '').trim()
    };
}

function buildSpecialDecorationBoothGroupSourceRow(projectId, booth, orderRows = [], displayName = '') {
    const normalizedBoothCode = normalizeBoothCode(booth?.id);
    if (!normalizedBoothCode) return null;
    const normalizedOrders = (Array.isArray(orderRows) ? orderRows : [])
        .map((order) => ({
            ...order,
            id: Number(order?.id || 0),
            company_name: String(order?.company_name || '').trim(),
            sales_name: String(order?.sales_name || '').trim(),
            created_at: String(order?.created_at || '').trim()
        }))
        .filter((order) => order.id > 0)
        .sort((left, right) => {
            const createdDiff = String(left.created_at || '').localeCompare(String(right.created_at || ''));
            if (createdDiff !== 0) return createdDiff;
            return Number(left.id || 0) - Number(right.id || 0);
        });
    if (normalizedOrders.length === 0) return null;
    const companyNames = [...new Set(normalizedOrders.map((order) => order.company_name).filter(Boolean))];
    const salesNames = [...new Set(normalizedOrders.map((order) => order.sales_name).filter(Boolean))];
    return {
        key: `booth:${normalizedBoothCode}`,
        project_id: projectId,
        order_id: Number(normalizedOrders[0]?.id || 0),
        order_ids: normalizedOrders.map((order) => Number(order.id || 0)).filter((orderId) => orderId > 0),
        company_name: String(displayName || '').trim() || companyNames.join('，'),
        company_names: companyNames,
        sales_name: salesNames.join('，'),
        sales_names: salesNames,
        booth_codes: [normalizedBoothCode],
        booth_code: normalizedBoothCode,
        sort_booth_code: normalizedBoothCode,
        hall_names: [String(booth?.hall || '').trim()].filter(Boolean),
        hall: String(booth?.hall || '').trim(),
        area: roundCurrency(booth?.area),
        order_created_at: normalizedOrders[0]?.created_at || '',
        display_name_source: displayName ? 'booth_map_company_text_override' : '',
        is_joint_display_group: normalizedOrders.length > 1 ? 1 : 0
    };
}

async function listSpecialDecorationReportRecords(env, projectId, orderIds = []) {
    const normalizedOrderIds = Array.from(new Set((Array.isArray(orderIds) ? orderIds : []).map((id) => Number(id || 0)).filter((id) => id > 0)));
    const params = [projectId];
    let orderSql = '';
    if (normalizedOrderIds.length > 0) {
        orderSql = ` AND order_id IN (${normalizedOrderIds.map(() => '?').join(',')})`;
        params.push(...normalizedOrderIds);
    }
    try {
        return ((await env.DB.prepare(`
          SELECT *
          FROM ExhibitionSpecialDecorationReports
          WHERE project_id = ?${orderSql}
        `).bind(...params).all()).results || []).map((record) => normalizeSpecialDecorationRecord(record));
    } catch (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }
}

async function getSpecialDecorationBoothMap(env, projectId, boothCodes = []) {
    const normalizedCodes = Array.from(new Set((Array.isArray(boothCodes) ? boothCodes : []).map((code) => normalizeBoothCode(code)).filter(Boolean)));
    const boothMap = new Map();
    for (const chunk of chunkItems(normalizedCodes)) {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
          SELECT id, hall, type, area
          FROM Booths
          WHERE project_id = ?
            AND id IN (${placeholders})
        `).bind(projectId, ...chunk).all()).results || []);
        rows.forEach((row) => {
            boothMap.set(normalizeBoothCode(row.id), row);
        });
    }
    return boothMap;
}

async function getSpecialDecorationBoothDisplayNameMap(env, projectId, boothCodes = []) {
    const normalizedCodes = Array.from(new Set((Array.isArray(boothCodes) ? boothCodes : []).map((code) => normalizeBoothCode(code)).filter(Boolean)));
    const displayNameMap = new Map();
    try {
        for (const chunk of chunkItems(normalizedCodes)) {
            const placeholders = chunk.map(() => '?').join(',');
            const rows = ((await env.DB.prepare(`
              SELECT booth_code, label_style_json
              FROM BoothMapItems
              WHERE project_id = ?
                AND booth_code IN (${placeholders})
            `).bind(projectId, ...chunk).all()).results || []);
            rows.forEach((row) => {
                const labelStyle = safeParseJson(row.label_style_json, {});
                const displayName = String(labelStyle?.companyTextOverride || '').trim();
                if (displayName) displayNameMap.set(normalizeBoothCode(row.booth_code), displayName);
            });
        }
    } catch (error) {
        if (isMissingTableError(error)) return displayNameMap;
        throw error;
    }
    return displayNameMap;
}

async function buildSpecialDecorationSourceRows(env, projectId, currentUser) {
    const whereClauses = [
        'o.project_id = ?',
        "o.status = '正常'",
        "(o.deleted_at IS NULL OR o.deleted_at = '')"
    ];
    const params = [projectId];
    if (!canViewAllSpecialDecorations(currentUser)) {
        whereClauses.push('o.sales_name = ?');
        params.push(String(currentUser?.name || '').trim());
    }
    const orderRows = ((await env.DB.prepare(`
      SELECT o.id, o.company_name, o.sales_name, o.booth_id, o.area, o.created_at
      FROM Orders o
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY datetime(o.created_at) DESC, o.id DESC
    `).bind(...params).all()).results || []);
    const boothCodes = [];
    orderRows.forEach((row) => {
        splitBoothCodeList(row.booth_id).forEach((boothCode) => boothCodes.push(boothCode));
    });
    const boothMap = await getSpecialDecorationBoothMap(env, projectId, boothCodes);
    const groundBoothsByOrderId = new Map();
    const ordersByGroundBoothCode = new Map();
    orderRows.forEach((row) => {
        const rowGroundBooths = splitBoothCodeList(row.booth_id)
            .map((boothCode) => boothMap.get(boothCode))
            .filter((booth) => isSpecialDecorationBoothType(booth?.type))
            .map((booth) => ({
                id: normalizeBoothCode(booth.id),
                hall: String(booth.hall || '').trim(),
                type: String(booth.type || '').trim(),
                area: roundCurrency(booth.area)
            }))
            .filter((booth) => booth.id);
        groundBoothsByOrderId.set(Number(row.id || 0), rowGroundBooths);
        rowGroundBooths.forEach((booth) => {
            if (!ordersByGroundBoothCode.has(booth.id)) ordersByGroundBoothCode.set(booth.id, []);
            ordersByGroundBoothCode.get(booth.id).push(row);
        });
    });
    const jointBoothCodes = Array.from(ordersByGroundBoothCode.entries())
        .filter(([, rows]) => rows.length > 1)
        .map(([boothCode]) => boothCode);
    const displayNameMap = await getSpecialDecorationBoothDisplayNameMap(env, projectId, jointBoothCodes);
    const groupedBoothCodes = new Set(jointBoothCodes.filter((boothCode) => displayNameMap.has(boothCode)));
    const groupedRows = Array.from(groupedBoothCodes).map((boothCode) => buildSpecialDecorationBoothGroupSourceRow(
        projectId,
        boothMap.get(boothCode),
        ordersByGroundBoothCode.get(boothCode) || [],
        displayNameMap.get(boothCode) || ''
    )).filter(Boolean);
    const individualRows = orderRows.map((row) => {
        const rowBooths = (groundBoothsByOrderId.get(Number(row.id || 0)) || [])
            .filter((booth) => !groupedBoothCodes.has(booth.id));
        return buildSpecialDecorationSourceRow(projectId, row, rowBooths);
    }).filter(Boolean);
    return [...groupedRows, ...individualRows].sort((left, right) => {
        const boothDiff = compareBoothCodeValues(left.sort_booth_code, right.sort_booth_code);
        if (boothDiff !== 0) return boothDiff;
        return String(left.company_name || '').localeCompare(String(right.company_name || ''), 'zh-CN', { numeric: true });
    });
}

async function getSpecialDecorationSourceByOrderId(env, projectId, orderId) {
    const orderRow = await env.DB.prepare(`
      SELECT id, company_name, sales_name, booth_id, area, status, deleted_at, created_at
      FROM Orders
      WHERE id = ? AND project_id = ?
    `).bind(Number(orderId || 0), projectId).first();
    if (!orderRow) return null;
    if (String(orderRow.status || '').trim() !== '正常') return null;
    if (String(orderRow.deleted_at || '').trim()) return null;
    const boothCodes = splitBoothCodeList(orderRow.booth_id);
    const boothMap = await getSpecialDecorationBoothMap(env, projectId, boothCodes);
    const sourceRow = buildSpecialDecorationSourceRow(projectId, orderRow, boothCodes.map((boothCode) => boothMap.get(boothCode)).filter(Boolean));
    return sourceRow || null;
}

function buildSpecialDecorationListRow(sourceRow, recordMap, currentUser, sequence) {
    const orderIds = Array.from(new Set((Array.isArray(sourceRow.order_ids) ? sourceRow.order_ids : [sourceRow.order_id])
        .map((orderId) => Number(orderId || 0))
        .filter((orderId) => orderId > 0)));
    const normalizedRecord = resolveSpecialDecorationReportState(orderIds, recordMap);
    const reported = normalizedRecord.reported === SPECIAL_DECORATION_REPORTED;
    const canToggle = canManageSpecialDecorations(currentUser);
    return {
        key: String(sourceRow.key || sourceRow.order_id || ''),
        id: normalizedRecord.id,
        project_id: Number(sourceRow.project_id || 0),
        order_id: Number(sourceRow.order_id || 0),
        order_ids: orderIds,
        sequence,
        reported: reported ? SPECIAL_DECORATION_REPORTED : SPECIAL_DECORATION_UNREPORTED,
        report_status: reported ? '已报图' : '未报图',
        reported_by: normalizedRecord.reported_by,
        reported_at: normalizedRecord.reported_at,
        updated_by: normalizedRecord.updated_by,
        updated_at: normalizedRecord.updated_at,
        hall: sourceRow.hall,
        hall_names: sourceRow.hall_names,
        booth_code: sourceRow.booth_code,
        booth_codes: sourceRow.booth_codes,
        area: roundCurrency(sourceRow.area),
        company_name: sourceRow.company_name,
        company_names: sourceRow.company_names,
        sales_name: sourceRow.sales_name,
        sales_names: sourceRow.sales_names,
        display_name_source: sourceRow.display_name_source || '',
        is_joint_display_group: Number(sourceRow.is_joint_display_group || 0),
        can_toggle: canToggle,
        lock_reason: canToggle ? '' : '仅超级管理员或展务管理员可确认报图'
    };
}

function filterSpecialDecorationRows(sourceRows = [], recordMap = new Map(), filters = {}) {
    const keyword = normalizeSearchValue(filters.search).toUpperCase();
    const hall = String(filters.hall || '').trim();
    const status = normalizeSpecialDecorationStatusFilter(filters.status);
    const salesName = String(filters.salesName || '').trim();
    return (Array.isArray(sourceRows) ? sourceRows : []).filter((row) => {
        const record = resolveSpecialDecorationReportState(Array.isArray(row.order_ids) ? row.order_ids : [row.order_id], recordMap);
        if (status === 'reported' && record.reported !== SPECIAL_DECORATION_REPORTED) return false;
        if (status === 'unreported' && record.reported === SPECIAL_DECORATION_REPORTED) return false;
        if (hall && hall !== 'all' && !(Array.isArray(row.hall_names) ? row.hall_names : []).includes(hall)) return false;
        if (salesName && salesName !== 'all' && !(Array.isArray(row.sales_names) ? row.sales_names : [row.sales_name]).includes(salesName)) return false;
        if (!keyword) return true;
        return [row.booth_code, row.company_name, ...(Array.isArray(row.company_names) ? row.company_names : [])].map((value) => String(value || '').trim().toUpperCase()).join(' ').includes(keyword);
    });
}

async function buildSpecialDecorationListPayload(env, projectId, currentUser, filters = {}) {
    const sourceRows = await buildSpecialDecorationSourceRows(env, projectId, currentUser);
    const reportRecords = await listSpecialDecorationReportRecords(env, projectId, sourceRows.flatMap((row) => Array.isArray(row.order_ids) ? row.order_ids : [row.order_id]));
    const recordMap = new Map(reportRecords.map((record) => [Number(record.order_id || 0), record]));
    const filteredRows = filterSpecialDecorationRows(sourceRows, recordMap, filters);
    const page = normalizePositiveInteger(filters.page, 1);
    const pageSize = SPECIAL_DECORATION_PAGE_SIZE;
    const total = filteredRows.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    const hallOptions = [...new Set(sourceRows.flatMap((row) => Array.isArray(row.hall_names) ? row.hall_names : []).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    const salesOptions = [...new Set(sourceRows.flatMap((row) => Array.isArray(row.sales_names) ? row.sales_names : [row.sales_name]).map((value) => String(value || '').trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    return {
        items: filteredRows.slice(offset, offset + pageSize).map((sourceRow, index) => buildSpecialDecorationListRow(
            sourceRow,
            recordMap,
            currentUser,
            offset + index + 1
        )),
        total,
        page: safePage,
        pageSize,
        totalPages,
        hasMore: safePage < totalPages,
        hall_options: hallOptions,
        sales_options: salesOptions,
        can_toggle: canManageSpecialDecorations(currentUser)
    };
}

async function updateSpecialDecorationReportStatus(env, payload, currentUser, corsHeaders) {
    if (!canManageSpecialDecorations(currentUser)) {
        return errorResponse('仅超级管理员或展务管理员可确认报图', 403, corsHeaders);
    }
    const projectId = normalizeProjectId(payload?.project_id);
    if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
    const orderIds = normalizeSpecialDecorationSelectionItems(payload);
    if (orderIds.length === 0) return errorResponse('请先选择光地企业', 400, corsHeaders);
    const reported = Number(payload?.reported) ? SPECIAL_DECORATION_REPORTED : SPECIAL_DECORATION_UNREPORTED;
    const validatedRows = [];
    for (const orderId of orderIds) {
        const sourceRow = await getSpecialDecorationSourceByOrderId(env, projectId, orderId);
        if (!sourceRow) return errorResponse('存在无效的光地企业记录', 404, corsHeaders);
        validatedRows.push(sourceRow);
    }
    const nowText = getChinaTimestamp();
    const operatorName = String(currentUser?.name || '').trim();
    try {
        for (const sourceRow of validatedRows) {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO ExhibitionSpecialDecorationReports (
                project_id, order_id, reported, reported_by, reported_at, updated_by, created_at, updated_at
              ) VALUES (?, ?, 0, '', '', ?, ?, ?)
            `).bind(projectId, Number(sourceRow.order_id || 0), operatorName, nowText, nowText).run();
            await env.DB.prepare(`
              UPDATE ExhibitionSpecialDecorationReports
              SET reported = ?, reported_by = ?, reported_at = ?, updated_by = ?, updated_at = ?
              WHERE project_id = ? AND order_id = ?
            `).bind(
                reported,
                reported === SPECIAL_DECORATION_REPORTED ? operatorName : '',
                reported === SPECIAL_DECORATION_REPORTED ? nowText : '',
                operatorName,
                nowText,
                projectId,
                Number(sourceRow.order_id || 0)
            ).run();
        }
    } catch (error) {
        console.error('Update special decoration report status failed:', error);
        return internalErrorResponse(corsHeaders);
    }
    await invalidateProjectBoothMapRuntimeCaches(env, projectId);
    return new Response(JSON.stringify({ success: true, updated_count: validatedRows.length }), { headers: corsHeaders });
}

async function getRentalHeaderById(env, rentalId) {
    return env.DB.prepare(`
      SELECT *
      FROM ExhibitionRefrigeratorRentals
      WHERE id = ?
    `).bind(Number(rentalId || 0)).first();
}

async function getBoothHallMap(env, projectId, boothCodes = []) {
    const normalizedCodes = Array.from(new Set((Array.isArray(boothCodes) ? boothCodes : []).map((code) => String(code || '').trim()).filter(Boolean)));
    if (normalizedCodes.length === 0) return new Map();
    const boothMap = new Map();
    for (const chunk of chunkItems(normalizedCodes)) {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
          SELECT id, hall
          FROM Booths
          WHERE project_id = ?
            AND id IN (${placeholders})
        `).bind(projectId, ...chunk).all()).results || []);
        rows.forEach((row) => {
            boothMap.set(String(row.id || '').trim(), String(row.hall || '').trim());
        });
    }
    return boothMap;
}

async function buildCompanyAggregateRows(env, projectId, currentUser, search = '', exactCompanyName = '') {
    const whereClauses = [
        'project_id = ?',
        "status = '正常'",
        '(deleted_at IS NULL OR deleted_at = \'\')'
    ];
    const params = [projectId];
    if (!canManageExhibitionModule(currentUser)) {
        whereClauses.push('sales_name = ?');
        params.push(String(currentUser?.name || '').trim());
    }
    if (exactCompanyName) {
        whereClauses.push('company_name = ?');
        params.push(exactCompanyName);
    } else if (search) {
        whereClauses.push("company_name LIKE ? ESCAPE '\\' COLLATE NOCASE");
        params.push(`%${escapeSqlLikePattern(search)}%`);
    }
    const rows = ((await env.DB.prepare(`
      SELECT company_name, sales_name, booth_id, created_at
      FROM Orders
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY datetime(created_at) DESC, id DESC
    `).bind(...params).all()).results || []);

    const companyMap = new Map();
    rows.forEach((row) => {
        const companyName = String(row.company_name || '').trim();
        if (!companyName) return;
        if (!companyMap.has(companyName)) {
            companyMap.set(companyName, {
                company_name: companyName,
                sales_name: String(row.sales_name || '').trim(),
                boothCodes: new Set()
            });
        }
        const target = companyMap.get(companyName);
        splitBoothCodeList(row.booth_id).forEach((boothCode) => {
            target.boothCodes.add(String(boothCode || '').trim());
        });
    });

    const boothCodeList = [];
    companyMap.forEach((company) => {
        company.boothCodes.forEach((boothCode) => boothCodeList.push(boothCode));
    });
    const boothHallMap = await getBoothHallMap(env, projectId, boothCodeList);

    const companyNames = [...companyMap.keys()];
    const existingRentalMap = new Map();
    for (const chunk of chunkItems(companyNames)) {
        const placeholders = chunk.map(() => '?').join(',');
        const rowsForExisting = ((await env.DB.prepare(`
          SELECT id, company_name
          FROM ExhibitionRefrigeratorRentals
          WHERE project_id = ?
            AND company_name IN (${placeholders})
        `).bind(projectId, ...chunk).all()).results || []);
        rowsForExisting.forEach((row) => existingRentalMap.set(String(row.company_name || '').trim(), Number(row.id || 0)));
    }

    return [...companyMap.values()].map((company) => {
        const boothNumbers = [...company.boothCodes];
        const hallNames = [...new Set(boothNumbers.map((boothCode) => boothHallMap.get(boothCode)).filter(Boolean))];
        return {
            company_name: company.company_name,
            sales_name: company.sales_name,
            booth_numbers: boothNumbers.join(', '),
            hall_names: hallNames.join('，'),
            existing_rental_id: Number(existingRentalMap.get(company.company_name) || 0)
        };
    }).slice(0, COMPANY_SEARCH_LIMIT);
}

async function getCompanySelection(env, projectId, currentUser, companyName) {
    const exactName = String(companyName || '').trim();
    if (!exactName) return null;
    const matches = await buildCompanyAggregateRows(env, projectId, currentUser, '', exactName);
    return matches.find((item) => item.company_name === exactName) || null;
}

async function getConfigAvailabilityMap(env, projectId, excludeRentalId = 0) {
    const params = [projectId];
    let excludeSql = '';
    if (Number(excludeRentalId || 0) > 0) {
        excludeSql = ' AND r.id != ?';
        params.push(Number(excludeRentalId));
    }
    const rows = ((await env.DB.prepare(`
      SELECT i.config_id, COALESCE(SUM(i.quantity), 0) AS rented_quantity
      FROM ExhibitionRefrigeratorRentalItems i
      INNER JOIN ExhibitionRefrigeratorRentals r ON r.id = i.rental_id
      WHERE r.project_id = ?${excludeSql}
      GROUP BY i.config_id
    `).bind(...params).all()).results || []);
    const availabilityMap = new Map();
    rows.forEach((row) => {
        availabilityMap.set(Number(row.config_id || 0), Number(row.rented_quantity || 0));
    });
    return availabilityMap;
}

async function listRefrigeratorConfigs(env, projectId, excludeRentalId = 0) {
    const configs = ((await env.DB.prepare(`
      SELECT *
      FROM ExhibitionRefrigeratorConfigs
      WHERE project_id = ?
      ORDER BY display_order ASC, id ASC
    `).bind(projectId).all()).results || []);
    const rentedMap = await getConfigAvailabilityMap(env, projectId, excludeRentalId);
    return configs.map((config) => {
        const stockQuantity = Number(config.stock_quantity || 0);
        const rentedQuantity = Number(rentedMap.get(Number(config.id || 0)) || 0);
        return {
            ...config,
            unit_price: roundCurrency(config.unit_price),
            stock_quantity: stockQuantity,
            rented_quantity: rentedQuantity,
            available_quantity: Math.max(stockQuantity - rentedQuantity, 0),
            is_active: Number(config.is_active || 0),
            image_url: buildRefrigeratorImageApiUrl(config.image_key)
        };
    });
}

async function listLintelRecords(env, projectId) {
    const rows = ((await env.DB.prepare(`
      SELECT *
      FROM ExhibitionLintels
      WHERE project_id = ?
    `).bind(projectId).all()).results || []);
    return rows;
}

async function buildEligibleLintelSourceRows(env, projectId, currentUser) {
    const whereClauses = [
        'o.project_id = ?',
        "o.status = '正常'",
        "(o.deleted_at IS NULL OR o.deleted_at = '')"
    ];
    const params = [projectId];
    if (!canViewAllLintels(currentUser)) {
        whereClauses.push('o.sales_name = ?');
        params.push(String(currentUser?.name || '').trim());
    }
    const orderRows = ((await env.DB.prepare(`
      SELECT o.id, o.company_name, o.sales_name, o.booth_id, o.created_at
      FROM Orders o
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY datetime(o.created_at) DESC, o.id DESC
    `).bind(...params).all()).results || []);

    const boothCodes = [];
    orderRows.forEach((row) => {
        [...new Set(splitBoothCodeList(row.booth_id).map((code) => normalizeBoothCode(code)).filter(Boolean))]
            .forEach((code) => boothCodes.push(code));
    });
    const boothMap = new Map();
    for (const chunk of chunkItems([...new Set(boothCodes)])) {
        const placeholders = chunk.map(() => '?').join(',');
        const boothRows = ((await env.DB.prepare(`
          SELECT id, hall, type
          FROM Booths
          WHERE project_id = ?
            AND id IN (${placeholders})
        `).bind(projectId, ...chunk).all()).results || []);
        boothRows.forEach((row) => {
            boothMap.set(normalizeBoothCode(row.id), {
                id: normalizeBoothCode(row.id),
                hall: String(row.hall || '').trim(),
                type: String(row.type || '').trim()
            });
        });
    }

    const sourceRows = [];
    orderRows.forEach((row) => {
        [...new Set(splitBoothCodeList(row.booth_id).map((code) => normalizeBoothCode(code)).filter(Boolean))]
            .forEach((boothCode) => {
                const boothMeta = boothMap.get(boothCode);
                if (!boothMeta || !isEligibleLintelBoothType(boothMeta.type)) return;
                sourceRows.push({
                    project_id: projectId,
                    order_id: Number(row.id || 0),
                    company_name: String(row.company_name || '').trim(),
                    sales_name: String(row.sales_name || '').trim(),
                    booth_code: boothCode,
                    hall: boothMeta.hall,
                    booth_type: boothMeta.type,
                    booth_type_label: formatLintelBoothTypeLabel(boothMeta.type),
                    order_created_at: String(row.created_at || '').trim()
                });
            });
    });
    return sourceRows;
}

async function getEligibleLintelSourceByKey(env, projectId, orderId, boothCode) {
    const order = await env.DB.prepare(`
      SELECT id, company_name, sales_name, booth_id, status, deleted_at, created_at
      FROM Orders
      WHERE id = ? AND project_id = ?
    `).bind(Number(orderId || 0), projectId).first();
    if (!order) return null;
    if (String(order.status || '').trim() !== '正常') return null;
    if (String(order.deleted_at || '').trim()) return null;
    const normalizedBoothCode = normalizeBoothCode(boothCode);
    const orderBoothCodes = new Set(splitBoothCodeList(order.booth_id).map((code) => normalizeBoothCode(code)).filter(Boolean));
    if (!orderBoothCodes.has(normalizedBoothCode)) return null;
    const booth = await env.DB.prepare(`
      SELECT id, hall, type
      FROM Booths
      WHERE project_id = ? AND id = ?
    `).bind(projectId, normalizedBoothCode).first();
    if (!booth || !isEligibleLintelBoothType(booth.type)) return null;
    return {
        project_id: projectId,
        order_id: Number(order.id || 0),
        company_name: String(order.company_name || '').trim(),
        sales_name: String(order.sales_name || '').trim(),
        booth_code: normalizedBoothCode,
        hall: String(booth.hall || '').trim(),
        booth_type: String(booth.type || '').trim(),
        booth_type_label: formatLintelBoothTypeLabel(booth.type),
        order_created_at: String(order.created_at || '').trim()
    };
}

async function invalidateProjectBoothMapRuntimeCaches(env, projectId) {
    const normalizedProjectId = Number(projectId || 0);
    if (!normalizedProjectId) return;
    const mapRows = ((await env.DB.prepare(`
      SELECT id
      FROM BoothMaps
      WHERE project_id = ?
    `).bind(normalizedProjectId).all()).results || []);
    await Promise.all(mapRows.map((row) => invalidateRuntimeViewCache(env, normalizedProjectId, Number(row.id || 0))));
}

async function getLintelRecordByKey(env, projectId, orderId, boothCode) {
    return env.DB.prepare(`
      SELECT *
      FROM ExhibitionLintels
      WHERE project_id = ? AND order_id = ? AND booth_code = ?
    `).bind(projectId, Number(orderId || 0), normalizeBoothCode(boothCode)).first();
}

async function ensureLintelRecord(env, sourceRow) {
    const nowText = getChinaTimestamp();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO ExhibitionLintels (
        project_id, order_id, booth_code, name_zh, name_en, remark,
        business_confirmed, business_confirmed_by, business_confirmed_at,
        exhibition_confirmed, exhibition_confirmed_by, exhibition_confirmed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', '', 0, '', '', 0, '', '', ?, ?)
    `).bind(
        Number(sourceRow.project_id || 0),
        Number(sourceRow.order_id || 0),
        normalizeBoothCode(sourceRow.booth_code),
        getDefaultLintelNameZh(sourceRow.company_name || ''),
        nowText,
        nowText
    ).run();
    return getLintelRecordByKey(env, sourceRow.project_id, sourceRow.order_id, sourceRow.booth_code);
}

async function buildLintelListPayload(env, projectId, currentUser) {
    const [sourceRows, lintelRecords] = await Promise.all([
        buildEligibleLintelSourceRows(env, projectId, currentUser),
        listLintelRecords(env, projectId)
    ]);
    const recordMap = new Map((Array.isArray(lintelRecords) ? lintelRecords : []).map((record) => [
        getLintelCompositeKey(record.order_id, record.booth_code),
        record
    ]));
    return {
        items: sourceRows.map((sourceRow, index) => buildLintelListRow(
            sourceRow,
            recordMap.get(getLintelCompositeKey(sourceRow.order_id, sourceRow.booth_code)),
            currentUser,
            index
        ))
    };
}

async function saveLintelRecord(env, payload, currentUser, corsHeaders) {
    const projectId = normalizeProjectId(payload?.project_id);
    const orderId = Number(payload?.order_id || 0);
    const boothCode = normalizeBoothCode(payload?.booth_code);
    if (!projectId || !orderId || !boothCode) return errorResponse('缺少楣板条目标识', 400, corsHeaders);
    const sourceRow = await getEligibleLintelSourceByKey(env, projectId, orderId, boothCode);
    if (!sourceRow) return errorResponse('楣板条目不存在或当前不符合楣板管理条件', 404, corsHeaders);
    if (!canManageLintelBusiness(currentUser, sourceRow.sales_name)) {
        return errorResponse('无权限编辑该楣板条目', 403, corsHeaders);
    }
    const existingRecord = normalizeLintelRecord(await getLintelRecordByKey(env, projectId, orderId, boothCode), sourceRow);
    if (existingRecord.exhibition_confirmed === LINTEL_CONFIRMED) {
        return errorResponse(LINTEL_LOCK_MESSAGE, 400, corsHeaders);
    }
    if (existingRecord.business_confirmed === LINTEL_CONFIRMED) {
        return errorResponse('业务已确认，撤回后才可编辑', 400, corsHeaders);
    }
    const nameZh = String(payload?.name_zh || '').trim();
    const nameEn = String(payload?.name_en || '').trim();
    const remark = String(payload?.remark || '').trim();
    const zhError = validateLintelChineseName(nameZh);
    if (zhError) return errorResponse(zhError, 400, corsHeaders);
    const enError = validateLintelEnglishName(nameEn);
    if (enError) return errorResponse(enError, 400, corsHeaders);
    const nowText = getChinaTimestamp();
    await ensureLintelRecord(env, sourceRow);
    await env.DB.prepare(`
      UPDATE ExhibitionLintels
      SET name_zh = ?, name_en = ?, remark = ?, updated_at = ?
      WHERE project_id = ? AND order_id = ? AND booth_code = ?
    `).bind(nameZh, nameEn, remark, nowText, projectId, orderId, boothCode).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function updateLintelBusinessConfirmation(env, payload, currentUser, corsHeaders) {
    const projectId = normalizeProjectId(payload?.project_id);
    if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
    const items = normalizeLintelSelectionItems(payload);
    if (items.length === 0) return errorResponse('请先选择楣板条目', 400, corsHeaders);
    const confirmed = Number(payload?.confirmed) ? LINTEL_CONFIRMED : LINTEL_UNCONFIRMED;
    const validatedItems = [];
    for (const item of items) {
        const sourceRow = await getEligibleLintelSourceByKey(env, projectId, item.order_id, item.booth_code);
        if (!sourceRow) return errorResponse('存在无效的楣板条目', 404, corsHeaders);
        if (!canManageLintelBusiness(currentUser, sourceRow.sales_name)) {
            return errorResponse('无权限操作所选楣板条目', 403, corsHeaders);
        }
        const record = normalizeLintelRecord(await getLintelRecordByKey(env, projectId, item.order_id, item.booth_code), sourceRow);
        if (record.exhibition_confirmed === LINTEL_CONFIRMED) {
            return errorResponse(LINTEL_LOCK_MESSAGE, 400, corsHeaders);
        }
        validatedItems.push({ sourceRow, record });
    }
    const nowText = getChinaTimestamp();
    for (const item of validatedItems) {
        await ensureLintelRecord(env, item.sourceRow);
        await env.DB.prepare(`
          UPDATE ExhibitionLintels
          SET business_confirmed = ?, business_confirmed_by = ?, business_confirmed_at = ?, business_confirm_source = ?, updated_at = ?
          WHERE project_id = ? AND order_id = ? AND booth_code = ?
        `).bind(
            confirmed,
            confirmed === LINTEL_CONFIRMED ? String(currentUser?.name || '').trim() : '',
            confirmed === LINTEL_CONFIRMED ? nowText : '',
            confirmed === LINTEL_CONFIRMED ? LINTEL_CONFIRM_SOURCE_SALES : '',
            nowText,
            projectId,
            item.sourceRow.order_id,
            item.sourceRow.booth_code
        ).run();
    }
    await invalidateProjectBoothMapRuntimeCaches(env, projectId);
    return new Response(JSON.stringify({ success: true, updated_count: validatedItems.length }), { headers: corsHeaders });
}

async function updateLintelExhibitionConfirmation(env, payload, currentUser, corsHeaders) {
    if (!isSuperAdmin(currentUser) && !isExhibitionManager(currentUser)) return errorResponse('仅超级管理员或展务管理人员可展务确认楣板', 403, corsHeaders);
    const projectId = normalizeProjectId(payload?.project_id);
    if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
    const items = normalizeLintelSelectionItems(payload);
    if (items.length === 0) return errorResponse('请先选择楣板条目', 400, corsHeaders);
    const confirmed = Number(payload?.confirmed) ? LINTEL_CONFIRMED : LINTEL_UNCONFIRMED;
    const validatedItems = [];
    for (const item of items) {
        const sourceRow = await getEligibleLintelSourceByKey(env, projectId, item.order_id, item.booth_code);
        if (!sourceRow) return errorResponse('存在无效的楣板条目', 404, corsHeaders);
        const record = normalizeLintelRecord(await getLintelRecordByKey(env, projectId, item.order_id, item.booth_code), sourceRow);
        if (confirmed === LINTEL_CONFIRMED && record.business_confirmed !== LINTEL_CONFIRMED) {
            return errorResponse('请先完成业务确认', 400, corsHeaders);
        }
        validatedItems.push({ sourceRow, record });
    }
    const nowText = getChinaTimestamp();
    for (const item of validatedItems) {
        await ensureLintelRecord(env, item.sourceRow);
        await env.DB.prepare(`
          UPDATE ExhibitionLintels
          SET exhibition_confirmed = ?, exhibition_confirmed_by = ?, exhibition_confirmed_at = ?, updated_at = ?
          WHERE project_id = ? AND order_id = ? AND booth_code = ?
        `).bind(
            confirmed,
            confirmed === LINTEL_CONFIRMED ? String(currentUser?.name || '').trim() : '',
            confirmed === LINTEL_CONFIRMED ? nowText : '',
            nowText,
            projectId,
            item.sourceRow.order_id,
            item.sourceRow.booth_code
        ).run();
    }
    return new Response(JSON.stringify({ success: true, updated_count: validatedItems.length }), { headers: corsHeaders });
}

async function listRentalItemsByRentalIds(env, rentalIds = []) {
    const normalizedRentalIds = Array.from(new Set((Array.isArray(rentalIds) ? rentalIds : []).map((id) => Number(id || 0)).filter((id) => id > 0)));
    if (normalizedRentalIds.length === 0) return [];
    const rows = [];
    for (const chunk of chunkItems(normalizedRentalIds)) {
        const placeholders = chunk.map(() => '?').join(',');
        const itemRows = ((await env.DB.prepare(`
          SELECT
            i.*,
            c.style_name AS current_style_name,
            c.display_order AS current_display_order,
            c.is_active AS current_is_active
          FROM ExhibitionRefrigeratorRentalItems i
          LEFT JOIN ExhibitionRefrigeratorConfigs c ON c.id = i.config_id
          WHERE i.rental_id IN (${placeholders})
          ORDER BY i.id ASC
        `).bind(...chunk).all()).results || []);
        rows.push(...itemRows);
    }
    return rows;
}

async function buildRentalListPayload(env, projectId, currentUser, search = '') {
    const whereClauses = ['project_id = ?'];
    const params = [projectId];
    if (!canManageExhibitionModule(currentUser)) {
        whereClauses.push('sales_name = ?');
        params.push(String(currentUser?.name || '').trim());
    }
    if (search) {
        whereClauses.push("company_name LIKE ? ESCAPE '\\' COLLATE NOCASE");
        params.push(`%${escapeSqlLikePattern(search)}%`);
    }
    const rentals = ((await env.DB.prepare(`
      SELECT *
      FROM ExhibitionRefrigeratorRentals
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY datetime(updated_at) DESC, id DESC
    `).bind(...params).all()).results || []);
    const rentalIds = rentals.map((row) => Number(row.id || 0)).filter((id) => id > 0);
    const itemRows = await listRentalItemsByRentalIds(env, rentalIds);
    const configs = await listRefrigeratorConfigs(env, projectId);
    const displayOrderMap = new Map();
    configs.forEach((config) => {
        displayOrderMap.set(String(config.style_name || ''), Number(config.display_order || 0));
    });

    const itemMap = new Map();
    itemRows.forEach((row) => {
        const rentalId = Number(row.rental_id || 0);
        if (!itemMap.has(rentalId)) itemMap.set(rentalId, []);
        itemMap.get(rentalId).push({
            ...row,
            display_name: String(row.current_style_name || row.style_name_snapshot || '').trim(),
            quantity: Number(row.quantity || 0),
            line_amount: roundCurrency(row.line_amount),
            payment_method: normalizePaymentMethod(row.payment_method)
        });
    });

    const typeColumnSet = new Set(configs.map((config) => String(config.style_name || '').trim()).filter(Boolean));
    itemRows.forEach((row) => {
        const displayName = String(row.current_style_name || row.style_name_snapshot || '').trim();
        if (displayName) typeColumnSet.add(displayName);
    });
    const typeColumns = [...typeColumnSet].sort((a, b) => {
        const orderDiff = Number(displayOrderMap.get(a) ?? Number.MAX_SAFE_INTEGER) - Number(displayOrderMap.get(b) ?? Number.MAX_SAFE_INTEGER);
        if (orderDiff !== 0) return orderDiff;
        return a.localeCompare(b, 'zh-CN');
    });

    const items = rentals.map((rental, index) => {
        const rentalId = Number(rental.id || 0);
        const rentalItems = itemMap.get(rentalId) || [];
        const itemCounts = {};
        typeColumns.forEach((column) => { itemCounts[column] = 0; });
        rentalItems.forEach((row) => {
            itemCounts[row.display_name] = Number(itemCounts[row.display_name] || 0) + Number(row.quantity || 0);
        });
        return {
            id: rentalId,
            sequence: index + 1,
            company_name: String(rental.company_name || '').trim(),
            rental_mode: normalizeRentalMode(rental.rental_mode),
            hall_names: String(rental.hall_names || '').trim(),
            booth_numbers: String(rental.booth_numbers || '').trim(),
            usage_location: normalizeRentalMode(rental.rental_mode) === RENTAL_MODE_NO_BOOTH
                ? String(rental.usage_location || rental.booth_numbers || '').trim()
                : '',
            venue_confirmed: normalizeVenueConfirmationFlag(rental.venue_confirmed),
            venue_confirmation_status: getVenueConfirmationLabel(rental),
            sales_name: String(rental.sales_name || '').trim(),
            organizer_payment_total: roundCurrency(rental.organizer_payment_total),
            venue_payment_total: roundCurrency(rental.venue_payment_total),
            total_amount: roundCurrency(rental.total_amount),
            created_at: String(rental.created_at || '').trim(),
            updated_at: String(rental.updated_at || '').trim(),
            item_counts: itemCounts,
            item_summary: rentalItems.map((row) => `${row.display_name} x${row.quantity}（${getPaymentMethodLabel(row.payment_method)}）`).join('；')
        };
    });

    return { items, type_columns: typeColumns };
}

async function buildRentalDetailPayload(env, rentalId, currentUser) {
    const rental = await getRentalHeaderById(env, rentalId);
    if (!rental) return { error: '租赁记录不存在', status: 404 };
    if (!canManageExhibitionModule(currentUser) && String(rental.sales_name || '').trim() !== String(currentUser?.name || '').trim()) {
        return { error: '无权限查看该租赁记录', status: 403 };
    }
    const configs = await listRefrigeratorConfigs(env, Number(rental.project_id || 0), rentalId);
    const itemRows = await listRentalItemsByRentalIds(env, [rentalId]);
    const selectedItems = itemRows.map((row) => ({
            id: Number(row.id || 0),
            config_id: Number(row.config_id || 0),
            style_name: String(row.current_style_name || row.style_name_snapshot || '').trim(),
            spec: String(row.spec_snapshot || '').trim(),
            image_key: String(row.image_key_snapshot || '').trim(),
            unit_price: roundCurrency(row.unit_price_snapshot),
            quantity: Number(row.quantity || 0),
            payment_method: normalizePaymentMethod(row.payment_method),
            line_amount: roundCurrency(row.line_amount)
    }));
    return {
        rental: {
            ...rental,
            rental_mode: normalizeRentalMode(rental.rental_mode),
            usage_location: normalizeRentalMode(rental.rental_mode) === RENTAL_MODE_NO_BOOTH
                ? String(rental.usage_location || rental.booth_numbers || '').trim()
                : '',
            venue_confirmed: normalizeVenueConfirmationFlag(rental.venue_confirmed),
            venue_confirmation_status: getVenueConfirmationLabel(rental),
            organizer_payment_total: roundCurrency(rental.organizer_payment_total),
            venue_payment_total: roundCurrency(rental.venue_payment_total),
            total_amount: roundCurrency(rental.total_amount)
        },
        selected_items: selectedItems,
        configs
    };
}

async function saveRefrigeratorConfig(env, payload, corsHeaders) {
    const projectId = normalizeProjectId(payload?.project_id);
    if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
    const styleName = String(payload?.style_name || '').trim();
    const spec = String(payload?.spec || '').trim();
    const unitPrice = roundCurrency(payload?.unit_price);
    const stockQuantity = normalizeNonNegativeInteger(payload?.stock_quantity);
    const isActive = Number(payload?.is_active ?? 1) ? 1 : 0;
    const displayOrder = normalizeNonNegativeInteger(payload?.display_order ?? 0);
    const configId = Number(payload?.id || 0);
    if (!styleName || !spec) return errorResponse('请完整填写冰柜样式名称和规格', 400, corsHeaders);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return errorResponse('单价必须是非负数', 400, corsHeaders);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return errorResponse('库存数量必须是非负整数', 400, corsHeaders);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) return errorResponse('排序必须是非负整数', 400, corsHeaders);

    const availabilityMap = await getConfigAvailabilityMap(env, projectId);
    if (configId > 0 && stockQuantity < Number(availabilityMap.get(configId) || 0)) {
        return errorResponse('库存数量不能低于当前已租赁数量', 400, corsHeaders);
    }

    const imageKey = String(payload?.image_key || '').trim();
    const nowText = getChinaTimestamp();
    try {
        if (configId > 0) {
            await env.DB.prepare(`
              UPDATE ExhibitionRefrigeratorConfigs
              SET style_name = ?, spec = ?, image_key = ?, unit_price = ?, stock_quantity = ?, is_active = ?, display_order = ?, updated_at = ?
              WHERE id = ? AND project_id = ?
            `).bind(styleName, spec, imageKey || null, unitPrice, stockQuantity, isActive, displayOrder, nowText, configId, projectId).run();
        } else {
            await env.DB.prepare(`
              INSERT INTO ExhibitionRefrigeratorConfigs (project_id, style_name, spec, image_key, unit_price, stock_quantity, is_active, display_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(projectId, styleName, spec, imageKey || null, unitPrice, stockQuantity, isActive, displayOrder, nowText, nowText).run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } catch (error) {
        if (String(error?.message || '').includes('UNIQUE')) {
            return errorResponse('同一项目下冰柜样式名称不能重复', 409, corsHeaders);
        }
        console.error('Save refrigerator config failed:', error);
        return internalErrorResponse(corsHeaders);
    }
}

async function deleteRefrigeratorConfig(env, payload, corsHeaders) {
        const projectId = normalizeProjectId(payload?.project_id);
        const configId = Number(payload?.id || 0);
        if (!projectId || !configId) return errorResponse('缺少冰柜配置信息', 400, corsHeaders);

        const configRow = await env.DB.prepare(`
            SELECT id
            FROM ExhibitionRefrigeratorConfigs
            WHERE id = ? AND project_id = ?
        `).bind(configId, projectId).first();
        if (!configRow) return errorResponse('冰柜配置不存在', 404, corsHeaders);

        const referenceRow = await env.DB.prepare(`
            SELECT COUNT(*) AS ref_count
            FROM ExhibitionRefrigeratorRentalItems
            WHERE config_id = ?
        `).bind(configId).first();
        if (Number(referenceRow?.ref_count || 0) > 0) {
                return errorResponse('该冰柜样式已被租赁明细引用，不能删除，请先停用或保留历史配置', 400, corsHeaders);
        }

        await env.DB.prepare(`
            DELETE FROM ExhibitionRefrigeratorConfigs
            WHERE id = ? AND project_id = ?
        `).bind(configId, projectId).run();
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function deleteRefrigeratorRental(env, payload, currentUser, corsHeaders) {
    const rentalId = Number(payload?.rental_id || 0);
    if (!rentalId) return errorResponse('缺少租赁记录 ID', 400, corsHeaders);

    const rental = await getRentalHeaderById(env, rentalId);
    if (!rental) return errorResponse('租赁记录不存在', 404, corsHeaders);
    if (!canManageExhibitionModule(currentUser) && String(rental.sales_name || '').trim() !== String(currentUser?.name || '').trim()) {
        return errorResponse('无权限删除该租赁记录', 403, corsHeaders);
    }
    if (isVenueConfirmedRental(rental)) {
        return errorResponse('该租赁记录已被主场确认，需先驳回后才能删除', 400, corsHeaders);
    }

    await env.DB.prepare('DELETE FROM ExhibitionRefrigeratorRentalItems WHERE rental_id = ?').bind(rentalId).run();
    await env.DB.prepare('DELETE FROM ExhibitionRefrigeratorRentals WHERE id = ?').bind(rentalId).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function saveRefrigeratorRental(env, payload, currentUser, corsHeaders) {
    const projectId = normalizeProjectId(payload?.project_id);
    if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
    const rentalId = Number(payload?.rental_id || 0);
    const companyName = String(payload?.company_name || '').trim();
    const rentalMode = normalizeRentalMode(payload?.rental_mode);
    const usageLocation = String(payload?.usage_location || '').trim();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!companyName) return errorResponse(rentalMode === RENTAL_MODE_NO_BOOTH ? '请填写企业名称' : '请选择企业名称', 400, corsHeaders);
    if (rentalMode === RENTAL_MODE_NO_BOOTH && !usageLocation) return errorResponse('请填写冰柜使用地点', 400, corsHeaders);
    if (items.length === 0) return errorResponse('请至少添加一项冰柜租赁', 400, corsHeaders);

    const existingRental = rentalId > 0 ? await getRentalHeaderById(env, rentalId) : null;
    if (rentalId > 0 && !existingRental) return errorResponse('租赁记录不存在', 404, corsHeaders);
    if (existingRental && !canManageExhibitionModule(currentUser) && String(existingRental.sales_name || '').trim() !== String(currentUser?.name || '').trim()) {
        return errorResponse('无权限修改该租赁记录', 403, corsHeaders);
    }
    if (existingRental && isVenueConfirmedRental(existingRental)) {
        return errorResponse('该租赁记录已被主场确认，需先驳回后才能修改', 400, corsHeaders);
    }

    let companySelection = null;
    if (rentalMode === RENTAL_MODE_NO_BOOTH) {
        companySelection = {
            company_name: companyName,
            sales_name: existingRental
                ? String(existingRental.sales_name || '').trim()
                : String(currentUser?.name || '').trim(),
            hall_names: '',
            booth_numbers: usageLocation,
            usage_location: usageLocation,
            rental_mode: RENTAL_MODE_NO_BOOTH
        };
    } else {
        companySelection = await getCompanySelection(env, projectId, currentUser, companyName);
        if (!companySelection && existingRental && companyName === String(existingRental.company_name || '').trim()) {
            companySelection = {
                company_name: companyName,
                sales_name: String(existingRental.sales_name || '').trim(),
                hall_names: String(existingRental.hall_names || '').trim(),
                booth_numbers: String(existingRental.booth_numbers || '').trim(),
                usage_location: '',
                rental_mode: RENTAL_MODE_BOOTH
            };
        }
        if (!companySelection) {
            return errorResponse('企业不存在或不属于当前账号可选范围', 400, corsHeaders);
        }
    }

    const conflictRow = await env.DB.prepare(`
      SELECT id
      FROM ExhibitionRefrigeratorRentals
      WHERE project_id = ?
        AND company_name = ?
    `).bind(projectId, companyName).first();
    if (conflictRow && Number(conflictRow.id || 0) !== rentalId) {
        return errorResponse('该企业已存在冰柜租赁记录，请直接进入该企业明细修改', 409, corsHeaders);
    }

    const configs = await listRefrigeratorConfigs(env, projectId, rentalId);
    const configMap = new Map(configs.map((config) => [Number(config.id || 0), config]));
    const normalizedItems = [];
    const requestedQuantityMap = new Map();
    let organizerPaymentTotal = 0;
    let venuePaymentTotal = 0;
    let totalAmount = 0;

    for (const rawItem of items) {
        const configId = Number(rawItem?.config_id || 0);
        const quantity = normalizeNonNegativeInteger(rawItem?.quantity);
        const paymentMethod = normalizePaymentMethod(rawItem?.payment_method);
        if (!configId || !Number.isInteger(quantity) || quantity <= 0 || !paymentMethod) {
            return errorResponse('冰柜小项数据不完整，请检查数量和付款方式', 400, corsHeaders);
        }
        const config = configMap.get(configId);
        if (!config) {
            return errorResponse('存在无效的冰柜配置，请刷新后重试', 400, corsHeaders);
        }
        requestedQuantityMap.set(configId, Number(requestedQuantityMap.get(configId) || 0) + quantity);
        const lineAmount = roundCurrency(Number(config.unit_price || 0) * quantity);
        if (paymentMethod === PAYMENT_METHOD_ORGANIZER) organizerPaymentTotal += lineAmount;
        else venuePaymentTotal += lineAmount;
        totalAmount += lineAmount;
        normalizedItems.push({
            config_id: configId,
            style_name_snapshot: String(config.style_name || '').trim(),
            spec_snapshot: String(config.spec || '').trim(),
            image_key_snapshot: String(config.image_key || '').trim(),
            unit_price_snapshot: roundCurrency(config.unit_price),
            quantity,
            payment_method: paymentMethod,
            line_amount: lineAmount
        });
    }

    for (const [configId, requestedQuantity] of requestedQuantityMap.entries()) {
        const config = configMap.get(Number(configId || 0));
        if (requestedQuantity > Number(config?.available_quantity || 0)) {
            return errorResponse(`【${config?.style_name || '所选冰柜'}】库存不足，当前仅剩 ${config?.available_quantity || 0} 台可租`, 400, corsHeaders);
        }
    }

    organizerPaymentTotal = roundCurrency(organizerPaymentTotal);
    venuePaymentTotal = roundCurrency(venuePaymentTotal);
    totalAmount = roundCurrency(totalAmount);
    const nowText = getChinaTimestamp();
    try {
        let nextRentalId = rentalId;
        if (rentalId > 0) {
            await env.DB.prepare(`
              UPDATE ExhibitionRefrigeratorRentals
              SET company_name = ?, sales_name = ?, rental_mode = ?, hall_names = ?, booth_numbers = ?, usage_location = ?, organizer_payment_total = ?, venue_payment_total = ?, total_amount = ?, updated_at = ?
              WHERE id = ?
            `).bind(
                companyName,
                String(companySelection.sales_name || '').trim(),
                                rentalMode,
                String(companySelection.hall_names || '').trim(),
                String(companySelection.booth_numbers || '').trim(),
                                rentalMode === RENTAL_MODE_NO_BOOTH ? usageLocation : '',
                organizerPaymentTotal,
                venuePaymentTotal,
                totalAmount,
                nowText,
                rentalId
            ).run();
            await env.DB.prepare('DELETE FROM ExhibitionRefrigeratorRentalItems WHERE rental_id = ?').bind(rentalId).run();
        } else {
            const insertResult = await env.DB.prepare(`
                            INSERT INTO ExhibitionRefrigeratorRentals (project_id, company_name, sales_name, rental_mode, hall_names, booth_numbers, usage_location, organizer_payment_total, venue_payment_total, total_amount, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                projectId,
                companyName,
                String(companySelection.sales_name || '').trim(),
                                rentalMode,
                String(companySelection.hall_names || '').trim(),
                String(companySelection.booth_numbers || '').trim(),
                                rentalMode === RENTAL_MODE_NO_BOOTH ? usageLocation : '',
                organizerPaymentTotal,
                venuePaymentTotal,
                totalAmount,
                nowText,
                nowText
            ).run();
            nextRentalId = Number(insertResult?.meta?.last_row_id || insertResult?.meta?.lastRowId || 0);
            if (!nextRentalId) {
                const inserted = await env.DB.prepare(`
                  SELECT id FROM ExhibitionRefrigeratorRentals
                  WHERE project_id = ? AND company_name = ?
                `).bind(projectId, companyName).first();
                nextRentalId = Number(inserted?.id || 0);
            }
        }

        for (const item of normalizedItems) {
            await env.DB.prepare(`
              INSERT INTO ExhibitionRefrigeratorRentalItems (
                rental_id, config_id, style_name_snapshot, spec_snapshot, image_key_snapshot,
                unit_price_snapshot, quantity, payment_method, line_amount, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                nextRentalId,
                item.config_id,
                item.style_name_snapshot,
                item.spec_snapshot,
                item.image_key_snapshot || null,
                item.unit_price_snapshot,
                item.quantity,
                item.payment_method,
                item.line_amount,
                nowText
            ).run();
        }
        return new Response(JSON.stringify({ success: true, rental_id: nextRentalId }), { headers: corsHeaders });
    } catch (error) {
        if (String(error?.message || '').includes('UNIQUE')) {
            return errorResponse('该企业已存在冰柜租赁记录，请直接进入该企业明细修改', 409, corsHeaders);
        }
        console.error('Save refrigerator rental failed:', error);
        return internalErrorResponse(corsHeaders);
    }
}

async function updateRefrigeratorRentalVenueConfirmation(env, payload, currentUser, corsHeaders) {
    if (!canConfirmExhibitionRentals(currentUser)) {
        return errorResponse('仅管理员或展务管理人员可确认租赁记录', 403, corsHeaders);
    }
    const rentalIds = Array.isArray(payload?.rental_ids)
        ? payload.rental_ids.map((id) => Number(id || 0)).filter((id) => Number.isInteger(id) && id > 0)
        : [Number(payload?.rental_id || 0)].filter((id) => Number.isInteger(id) && id > 0);
    if (!rentalIds.length) return errorResponse('缺少租赁记录 ID', 400, corsHeaders);
    const confirmed = Number(payload?.confirmed) ? VENUE_CONFIRMATION_CONFIRMED : VENUE_CONFIRMATION_PENDING;
    const nowText = getChinaTimestamp();
    let updatedCount = 0;

    for (const rentalId of Array.from(new Set(rentalIds))) {
        const rental = await getRentalHeaderById(env, rentalId);
        if (!rental) return errorResponse('租赁记录不存在', 404, corsHeaders);
        await env.DB.prepare(`
          UPDATE ExhibitionRefrigeratorRentals
          SET venue_confirmed = ?, venue_confirmed_by = ?, venue_confirmed_at = ?, updated_at = ?
          WHERE id = ?
        `).bind(
            confirmed,
            confirmed === VENUE_CONFIRMATION_CONFIRMED ? String(currentUser?.name || '').trim() : '',
            confirmed === VENUE_CONFIRMATION_CONFIRMED ? nowText : '',
            nowText,
            rentalId
        ).run();
        updatedCount += 1;
    }

    return new Response(JSON.stringify({ success: true, updated_count: updatedCount }), { headers: corsHeaders });
}

async function uploadRefrigeratorImage(request, env, corsHeaders) {
    const formData = await readFormDataBody(request, corsHeaders, { maxBytes: EXHIBITION_IMAGE_UPLOAD_BODY_LIMIT });
    if (formData instanceof Response) return formData;
    const file = formData.get('file');
    if (!file) return errorResponse('没有找到图片', 400, corsHeaders);
    const validationError = validateExhibitionImageFile(file);
    if (validationError) return errorResponse(validationError, 400, corsHeaders);
    const uploadId = String(formData.get('uploadId') || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96);
    const fileExt = normalizeUploadExtension(file.name);
    const fileKey = uploadId
        ? `exhibition_refrigerator_${uploadId}.${fileExt}`
        : `exhibition_refrigerator_${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
    try {
        await env.BUCKET.put(fileKey, await file.arrayBuffer(), {
            httpMetadata: {
                contentType: String(file.type || 'image/jpeg').trim() || 'image/jpeg'
            }
        });
        return new Response(JSON.stringify({ success: true, fileKey, fileUrl: buildRefrigeratorImageApiUrl(fileKey) }), { headers: corsHeaders });
    } catch (error) {
        console.error('Upload refrigerator image failed:', error);
        return internalErrorResponse(corsHeaders);
    }
}

async function readRefrigeratorImage(request, env, url, corsHeaders) {
    const key = decodeURIComponent(url.pathname.replace('/api/exhibition/refrigerator-image/', ''));
    if (!key) return errorResponse('图片不存在', 404, corsHeaders);
    try {
        const object = await env.BUCKET.get(key);
        if (!object) return errorResponse('图片不存在', 404, corsHeaders);
        const etag = String(object.httpEtag || '').trim();
        if (isEtagNotModified(request, etag)) {
            const headers = new Headers(buildPrivateFileCacheHeaders({ maxAge: 600, immutable: false }));
            if (corsHeaders['Access-Control-Allow-Origin']) headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
            if (etag) headers.set('etag', etag);
            return new Response(null, { status: 304, headers });
        }
        const headers = new Headers(buildPrivateFileCacheHeaders({ maxAge: 600, immutable: false }));
        object.writeHttpMetadata(headers);
        if (etag) headers.set('etag', etag);
        if (corsHeaders['Access-Control-Allow-Origin']) headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return new Response(object.body, { headers });
    } catch (error) {
        console.error('Read refrigerator image failed:', error);
        return internalErrorResponse(corsHeaders);
    }
}

function buildConfirmationBannerApiUrl(imageKey) {
    const normalizedKey = String(imageKey || '').trim();
    return normalizedKey ? `/api/public/exhibitor-confirmation-banner/${encodeURIComponent(normalizedKey)}` : '';
}

async function readConfirmationBannerImage(request, env, url, corsHeaders) {
    const key = decodeURIComponent(url.pathname.replace('/api/public/exhibitor-confirmation-banner/', ''));
    if (!key || !key.startsWith(`${CONFIRMATION_BANNER_PREFIX}/`)) return errorResponse('图片不存在', 404, corsHeaders);
    try {
        const object = await env.BUCKET.get(key);
        if (!object) return errorResponse('图片不存在', 404, corsHeaders);
        const etag = String(object.httpEtag || '').trim();
        if (isEtagNotModified(request, etag)) {
            const headers = new Headers(buildPrivateFileCacheHeaders({ maxAge: 600, immutable: false }));
            if (corsHeaders['Access-Control-Allow-Origin']) headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
            if (etag) headers.set('etag', etag);
            return new Response(null, { status: 304, headers });
        }
        const headers = new Headers(buildPrivateFileCacheHeaders({ maxAge: 600, immutable: false }));
        object.writeHttpMetadata(headers);
        if (etag) headers.set('etag', etag);
        if (corsHeaders['Access-Control-Allow-Origin']) headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return new Response(object.body, { headers });
    } catch (error) {
        console.error('Read confirmation banner failed:', error);
        return internalErrorResponse(corsHeaders);
    }
}

async function getProjectName(env, projectId) {
    const row = await env.DB.prepare('SELECT name FROM Projects WHERE id = ?').bind(projectId).first();
    return String(row?.name || '福州渔博会').trim() || '福州渔博会';
}

async function getConfirmationSettings(env, projectId) {
    const nowText = getChinaTimestamp();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO ExhibitionConfirmationSettings (project_id, title_text, banner_image_key, link_ttl_minutes, collection_deadline_at, created_at, updated_at)
      VALUES (?, '请核对并确认参展信息', '', ?, '', ?, ?)
    `).bind(projectId, DEFAULT_CONFIRMATION_LINK_TTL_MINUTES, nowText, nowText).run();
    const row = await env.DB.prepare(`
      SELECT *
      FROM ExhibitionConfirmationSettings
      WHERE project_id = ?
    `).bind(projectId).first();
    return {
        project_id: projectId,
        title_text: String(row?.title_text || '请核对并确认参展信息').trim() || '请核对并确认参展信息',
        banner_image_key: String(row?.banner_image_key || '').trim(),
        banner_image_url: buildConfirmationBannerApiUrl(row?.banner_image_key),
        link_ttl_minutes: normalizeConfirmationLinkTtlMinutes(row?.link_ttl_minutes),
        collection_deadline_at: normalizeConfirmationDeadlineAt(row?.collection_deadline_at),
        collection_deadline_display: formatConfirmationDeadlineDisplay(row?.collection_deadline_at),
        collection_closed: isConfirmationCollectionClosed(row),
        updated_at: String(row?.updated_at || '').trim()
    };
}

async function saveConfirmationSettings(env, payload, corsHeaders) {
    const projectId = normalizeProjectId(payload?.project_id);
    if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
    const titleText = String(payload?.title_text || '').trim() || '请核对并确认参展信息';
    const bannerImageKey = String(payload?.banner_image_key || '').trim();
    const ttlMinutes = normalizeConfirmationLinkTtlMinutes(payload?.link_ttl_minutes);
    const collectionDeadlineAt = normalizeConfirmationDeadlineAt(payload?.collection_deadline_at);
    if (!collectionDeadlineAt) return errorResponse('请设置有效的信息收集截止时间', 400, corsHeaders);
    const nowText = getChinaTimestamp();
    const previousSettings = await env.DB.prepare(`
      SELECT link_ttl_minutes
      FROM ExhibitionConfirmationSettings
      WHERE project_id = ?
    `).bind(projectId).first();
    const shouldRefreshActiveLinks = !previousSettings || normalizeConfirmationLinkTtlMinutes(previousSettings.link_ttl_minutes) !== ttlMinutes;
    await env.DB.prepare(`
      INSERT INTO ExhibitionConfirmationSettings (project_id, title_text, banner_image_key, link_ttl_minutes, collection_deadline_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        title_text = excluded.title_text,
        banner_image_key = excluded.banner_image_key,
        link_ttl_minutes = excluded.link_ttl_minutes,
        collection_deadline_at = excluded.collection_deadline_at,
        updated_at = excluded.updated_at
    `).bind(projectId, titleText, bannerImageKey, ttlMinutes, collectionDeadlineAt, nowText, nowText).run();
    if (shouldRefreshActiveLinks) {
        await env.DB.prepare(`
          UPDATE ExhibitorConfirmationLinks
          SET expires_at = ?, updated_at = ?
          WHERE project_id = ?
            AND COALESCE(submitted_at, '') = ''
            AND COALESCE(revoked_at, '') = ''
        `).bind(addMinutesToChinaTimestamp(ttlMinutes), nowText, projectId).run();
    }
    const settings = await getConfirmationSettings(env, projectId);
    return new Response(JSON.stringify({ success: true, settings }), { headers: corsHeaders });
}

async function uploadConfirmationBanner(request, env, corsHeaders) {
    const form = await readFormDataBody(request, corsHeaders, { maxBytes: EXHIBITION_IMAGE_UPLOAD_BODY_LIMIT });
    if (form instanceof Response) return form;
    const file = form.get('file');
    const projectId = normalizeProjectId(form.get('project_id'));
    if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
    const validationError = validateExhibitionImageFile(file);
    if (validationError) return errorResponse(validationError, 400, corsHeaders);
    const fileExt = normalizeUploadExtension(file.name);
    const imageKey = `${CONFIRMATION_BANNER_PREFIX}/project_${projectId}_${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
    try {
        await env.BUCKET.put(imageKey, await file.arrayBuffer(), {
            httpMetadata: {
                contentType: String(file.type || 'image/jpeg').trim() || 'image/jpeg'
            }
        });
        return new Response(JSON.stringify({
            success: true,
            fileKey: imageKey,
            image_url: buildConfirmationBannerApiUrl(imageKey)
        }), { headers: corsHeaders });
    } catch (error) {
        console.error('Upload confirmation banner failed:', error);
        return internalErrorResponse(corsHeaders);
    }
}

async function getOrderForConfirmation(env, projectId, orderId) {
    const row = await env.DB.prepare(`
      SELECT
        id, project_id, company_name, sales_name, booth_id, area, main_business, profile,
        status, deleted_at, created_at,
        COALESCE(exhibitor_info_status, 'sales_default') AS exhibitor_info_status,
        COALESCE(exhibitor_info_confirmed_by, '') AS exhibitor_info_confirmed_by,
        COALESCE(exhibitor_info_confirmed_at, '') AS exhibitor_info_confirmed_at
      FROM Orders
      WHERE id = ? AND project_id = ?
    `).bind(Number(orderId || 0), projectId).first();
    if (!row) return null;
    if (String(row.status || '').trim() !== '正常') return null;
    if (String(row.deleted_at || '').trim()) return null;
    return {
        ...row,
        id: Number(row.id || 0),
        project_id: Number(row.project_id || 0),
        company_name: String(row.company_name || '').trim(),
        sales_name: String(row.sales_name || '').trim(),
        booth_id: String(row.booth_id || '').trim(),
        main_business: String(row.main_business || '').trim(),
        profile: String(row.profile || '').trim(),
        exhibitor_info_status: normalizeExhibitorInfoStatus(row.exhibitor_info_status),
        exhibitor_info_confirmed_by: String(row.exhibitor_info_confirmed_by || '').trim(),
        exhibitor_info_confirmed_at: String(row.exhibitor_info_confirmed_at || '').trim()
    };
}

function canAccessExhibitorOrder(currentUser, order) {
    if (!currentUser || !order) return false;
    if (isAdminUser(currentUser) || isExhibitionManager(currentUser)) return true;
    return String(currentUser?.name || '').trim() === String(order.sales_name || '').trim();
}

async function buildOrderBoothRows(env, order) {
    const boothCodes = splitBoothCodeList(order?.booth_id).map((code) => normalizeBoothCode(code)).filter(Boolean);
    if (boothCodes.length === 0) {
        return [{
            order_id: Number(order?.id || 0),
            booth_code: '',
            hall: '',
            booth_type: '',
            booth_type_label: '',
            area: Number(order?.area || 0),
            company_name: String(order?.company_name || '').trim(),
            sales_name: String(order?.sales_name || '').trim()
        }];
    }
    const boothMap = new Map();
    for (const chunk of chunkItems([...new Set(boothCodes)])) {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
          SELECT id, hall, type, area
          FROM Booths
          WHERE project_id = ? AND id IN (${placeholders})
        `).bind(Number(order.project_id || 0), ...chunk).all()).results || []);
        rows.forEach((row) => {
            boothMap.set(normalizeBoothCode(row.id), {
                hall: String(row.hall || '').trim(),
                booth_type: String(row.type || '').trim(),
                area: Number(row.area || 0)
            });
        });
    }
    return boothCodes.map((boothCode) => {
        const booth = boothMap.get(boothCode) || {};
        return {
            order_id: Number(order.id || 0),
            booth_code: boothCode,
            hall: String(booth.hall || '').trim(),
            booth_type: String(booth.booth_type || '').trim(),
            booth_type_label: formatLintelBoothTypeLabel(booth.booth_type),
            area: Number(booth.area || 0),
            company_name: String(order.company_name || '').trim(),
            sales_name: String(order.sales_name || '').trim()
        };
    });
}

async function buildOrderLintelRows(env, order, boothRows = []) {
    const lintelRows = [];
    for (const boothRow of boothRows) {
        if (!boothRow.booth_code || !isEligibleLintelBoothType(boothRow.booth_type)) continue;
        const sourceRow = {
            project_id: Number(order.project_id || 0),
            order_id: Number(order.id || 0),
            company_name: String(order.company_name || '').trim(),
            sales_name: String(order.sales_name || '').trim(),
            booth_code: boothRow.booth_code,
            hall: boothRow.hall,
            booth_type: boothRow.booth_type,
            booth_type_label: boothRow.booth_type_label
        };
        const record = normalizeLintelRecord(await getLintelRecordByKey(env, order.project_id, order.id, boothRow.booth_code), sourceRow);
        lintelRows.push({
            ...sourceRow,
            id: Number(record.id || 0),
            name_zh: record.name_zh,
            name_en: record.name_en,
            remark: record.remark,
            business_confirmed: record.business_confirmed,
            business_confirm_source: record.business_confirm_source,
            business_confirmed_by: record.business_confirmed_by,
            business_confirmed_at: record.business_confirmed_at,
            exhibition_confirmed: record.exhibition_confirmed,
            exhibition_confirmed_by: record.exhibition_confirmed_by,
            exhibition_confirmed_at: record.exhibition_confirmed_at,
            can_external_edit: record.exhibition_confirmed !== LINTEL_CONFIRMED,
            external_lock_reason: record.exhibition_confirmed === LINTEL_CONFIRMED ? LINTEL_LOCK_MESSAGE : ''
        });
    }
    return lintelRows;
}

async function getSpecialDecorationReportMap(env, projectId, orderIds = []) {
    const normalizedOrderIds = Array.from(new Set((Array.isArray(orderIds) ? orderIds : []).map((id) => Number(id || 0)).filter((id) => id > 0)));
    const reportMap = new Map();
    try {
        for (const chunk of chunkItems(normalizedOrderIds)) {
            const placeholders = chunk.map(() => '?').join(',');
            const rows = ((await env.DB.prepare(`
              SELECT order_id, reported, reported_by, reported_at
              FROM ExhibitionSpecialDecorationReports
              WHERE project_id = ? AND order_id IN (${placeholders})
            `).bind(projectId, ...chunk).all()).results || []);
            rows.forEach((row) => {
                reportMap.set(Number(row.order_id || 0), {
                    reported: Number(row.reported || 0) === SPECIAL_DECORATION_REPORTED ? SPECIAL_DECORATION_REPORTED : SPECIAL_DECORATION_UNREPORTED,
                    reported_by: String(row.reported_by || '').trim(),
                    reported_at: String(row.reported_at || '').trim()
                });
            });
        }
    } catch (error) {
        if (isMissingTableError(error)) return reportMap;
        throw error;
    }
    return reportMap;
}

function createConfirmationSnapshot(order, lintelRows = []) {
    return {
        main_business: String(order?.main_business || '').trim(),
        profile: String(order?.profile || '').trim(),
        lintels: (Array.isArray(lintelRows) ? lintelRows : []).map((lintel) => ({
            booth_code: normalizeBoothCode(lintel.booth_code),
            name_zh: String(lintel.name_zh || '').trim(),
            name_en: String(lintel.name_en || '').trim(),
            remark: String(lintel.remark || '').trim()
        }))
    };
}

function buildSnapshotDiff(beforeSnapshot = {}, afterSnapshot = {}) {
    const diffs = [];
    const pushDiff = (fieldKey, fieldLabel, oldValue, newValue) => {
        const normalizedOld = String(oldValue || '').trim();
        const normalizedNew = String(newValue || '').trim();
        if (normalizedOld === normalizedNew) return;
        diffs.push({ field_key: fieldKey, field_label: fieldLabel, old_value: normalizedOld, new_value: normalizedNew });
    };
    pushDiff('main_business', '详细展品', beforeSnapshot.main_business, afterSnapshot.main_business);
    pushDiff('profile', '企业简介或产品亮点', beforeSnapshot.profile, afterSnapshot.profile);
    const beforeMap = new Map((Array.isArray(beforeSnapshot.lintels) ? beforeSnapshot.lintels : []).map((item) => [normalizeBoothCode(item.booth_code), item]));
    (Array.isArray(afterSnapshot.lintels) ? afterSnapshot.lintels : []).forEach((afterLintel) => {
        const boothCode = normalizeBoothCode(afterLintel.booth_code);
        const beforeLintel = beforeMap.get(boothCode) || {};
        pushDiff(`lintel.${boothCode}.name_zh`, `展位 ${boothCode} 中文楣板名`, beforeLintel.name_zh, afterLintel.name_zh);
        pushDiff(`lintel.${boothCode}.name_en`, `展位 ${boothCode} 英文楣板名`, beforeLintel.name_en, afterLintel.name_en);
        pushDiff(`lintel.${boothCode}.remark`, `展位 ${boothCode} 楣板备注`, beforeLintel.remark, afterLintel.remark);
    });
    return diffs;
}

async function insertConfirmationEvent(env, { projectId, orderId, linkId = 0, eventType, beforeSnapshot, afterSnapshot, createdBy }) {
    const diff = buildSnapshotDiff(beforeSnapshot, afterSnapshot);
    await env.DB.prepare(`
      INSERT INTO ExhibitorConfirmationEvents (
        project_id, order_id, link_id, event_type, before_snapshot_json, after_snapshot_json, diff_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        Number(projectId || 0),
        Number(orderId || 0),
        Number(linkId || 0),
        String(eventType || '').trim(),
        JSON.stringify(beforeSnapshot || {}),
        JSON.stringify(afterSnapshot || {}),
        JSON.stringify(diff),
        String(createdBy || '').trim(),
        getChinaTimestamp()
    ).run();
}

function parseJsonSafe(value, fallback) {
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed ?? fallback;
    } catch (error) {
        return fallback;
    }
}

async function listConfirmationEvents(env, projectId, orderId) {
    const rows = ((await env.DB.prepare(`
      SELECT id, event_type, diff_json, created_by, created_at
      FROM ExhibitorConfirmationEvents
      WHERE project_id = ? AND order_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
    `).bind(projectId, orderId).all()).results || []);
    return rows.map((row) => ({
        id: Number(row.id || 0),
        event_type: String(row.event_type || '').trim(),
        event_label: String(row.event_type || '').trim() === 'reopen' ? '申请编辑' : '提交确认',
        diffs: parseJsonSafe(row.diff_json, []),
        created_by: String(row.created_by || '').trim(),
        created_at: String(row.created_at || '').trim()
    }));
}

async function findReusableConfirmationLink(env, order, settings = null) {
    const rows = ((await env.DB.prepare(`
      SELECT *
      FROM ExhibitorConfirmationLinks
      WHERE project_id = ?
        AND order_id = ?
        AND COALESCE(submitted_at, '') = ''
        AND COALESCE(revoked_at, '') = ''
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 10
    `).bind(order.project_id, order.id).all()).results || []);
    for (const row of rows) {
        if (isChinaTimestampExpired(row.expires_at)) continue;
        try {
            const token = await decryptSensitiveValue(String(row.token_secret || '').trim(), env);
            if (token) {
                const nextExpiresAt = settings ? addMinutesToChinaTimestamp(settings.link_ttl_minutes) : '';
                if (nextExpiresAt && nextExpiresAt !== String(row.expires_at || '').trim()) {
                    await env.DB.prepare(`
                      UPDATE ExhibitorConfirmationLinks
                      SET expires_at = ?, updated_at = ?
                      WHERE id = ?
                    `).bind(nextExpiresAt, getChinaTimestamp(), Number(row.id || 0)).run();
                    row.expires_at = nextExpiresAt;
                }
                return { row, token };
            }
        } catch (error) {
            console.warn('Failed to decrypt confirmation token; creating a replacement link', error);
        }
    }
    return null;
}

async function createConfirmationLinkForOrder(env, requestUrl, order, currentUser, { revokeExisting = false } = {}) {
    const nowText = getChinaTimestamp();
    if (revokeExisting) {
        await env.DB.prepare(`
          UPDATE ExhibitorConfirmationLinks
          SET revoked_at = ?, updated_at = ?
          WHERE project_id = ? AND order_id = ? AND COALESCE(revoked_at, '') = '' AND COALESCE(submitted_at, '') = ''
        `).bind(nowText, nowText, order.project_id, order.id).run();
    }
    const settings = await getConfirmationSettings(env, order.project_id);
    const reusable = revokeExisting ? null : await findReusableConfirmationLink(env, order, settings);
    const projectName = await getProjectName(env, order.project_id);
    const collectionClosed = isConfirmationCollectionClosed(settings);
    if (reusable) {
        const publicUrl = getPublicConfirmationUrl(requestUrl, reusable.token, env);
        return {
            id: Number(reusable.row.id || 0),
            url: publicUrl,
            message: buildConfirmationShareMessage({ projectName, companyName: order.company_name, publicUrl }),
            expires_at: String(reusable.row.expires_at || '').trim(),
            collection_closed: collectionClosed,
            collection_deadline_at: settings.collection_deadline_at,
            collection_deadline_display: settings.collection_deadline_display,
            reused: true
        };
    }
    const token = createConfirmationToken();
    const tokenHash = await hashConfirmationToken(token);
    const tokenSecret = await encryptSensitiveValue(token, env);
    const expiresAt = addMinutesToChinaTimestamp(settings.link_ttl_minutes);
    const createdBy = String(currentUser?.name || '').trim();
    await env.DB.prepare(`
      INSERT INTO ExhibitorConfirmationLinks (
        project_id, order_id, token_hash, token_secret, expires_at, submitted_at, revoked_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)
    `).bind(order.project_id, order.id, tokenHash, tokenSecret, expiresAt, createdBy, nowText, nowText).run();
    const linkRow = await env.DB.prepare('SELECT * FROM ExhibitorConfirmationLinks WHERE token_hash = ?').bind(tokenHash).first();
    const publicUrl = getPublicConfirmationUrl(requestUrl, token, env);
    return {
        id: Number(linkRow?.id || 0),
        url: publicUrl,
        message: buildConfirmationShareMessage({ projectName, companyName: order.company_name, publicUrl }),
        expires_at: expiresAt,
        collection_closed: collectionClosed,
        collection_deadline_at: settings.collection_deadline_at,
        collection_deadline_display: settings.collection_deadline_display,
        reused: false
    };
}

async function resolveConfirmationLinkByToken(env, token) {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) return { error: '链接无效', status: 404 };
    const tokenHash = await hashConfirmationToken(normalizedToken);
    const row = await env.DB.prepare(`
      SELECT *
      FROM ExhibitorConfirmationLinks
      WHERE token_hash = ?
    `).bind(tokenHash).first();
    if (!row || String(row.revoked_at || '').trim()) return { error: '链接无效或已失效', status: 404 };
    if (isChinaTimestampExpired(row.expires_at)) return { error: '链接已过期，请联系业务员重新获取', status: 410 };
    const order = await getOrderForConfirmation(env, Number(row.project_id || 0), Number(row.order_id || 0));
    if (!order) return { error: '确认订单不存在或已失效', status: 404 };
    return { link: row, order };
}

async function buildConfirmationOverviewPayload(env, order, { link = null, includeEvents = true } = {}) {
    const [settings, projectName, boothRows] = await Promise.all([
        getConfirmationSettings(env, order.project_id),
        getProjectName(env, order.project_id),
        buildOrderBoothRows(env, order)
    ]);
    const lintelRows = await buildOrderLintelRows(env, order, boothRows);
    const events = includeEvents ? await listConfirmationEvents(env, order.project_id, order.id) : [];
    const submittedAt = String(link?.submitted_at || order.exhibitor_info_confirmed_at || '').trim();
    const collectionClosed = isConfirmationCollectionClosed(settings);
    return {
        project: { id: Number(order.project_id || 0), name: projectName },
        settings,
        order: {
            id: Number(order.id || 0),
            project_id: Number(order.project_id || 0),
            company_name: order.company_name,
            sales_name: order.sales_name,
            booth_id: order.booth_id,
            main_business: order.main_business,
            profile: order.profile,
            basic_info_status: order.exhibitor_info_status,
            basic_info_status_label: getBasicInfoStatusLabel(order.exhibitor_info_status),
            submitted_at: submittedAt
        },
        booth_rows: boothRows,
        lintels: lintelRows,
	        events,
	        link: link ? {
	            submitted_at: String(link.submitted_at || '').trim(),
            readonly: !!String(link.submitted_at || '').trim() || collectionClosed,
            collection_closed: collectionClosed,
            collection_deadline_at: settings.collection_deadline_at,
            collection_deadline_display: settings.collection_deadline_display
        } : null
    };
}

async function createInternalConfirmationLink(env, url, payload, currentUser, corsHeaders) {
    const projectId = normalizeProjectId(payload?.project_id);
    const orderId = Number(payload?.order_id || 0);
    if (!projectId || !orderId) return errorResponse('缺少订单信息', 400, corsHeaders);
    const order = await getOrderForConfirmation(env, projectId, orderId);
    if (!order) return errorResponse('订单不存在或已失效', 404, corsHeaders);
    if (!canAccessExhibitorOrder(currentUser, order)) return errorResponse('无权限生成该订单确认链接', 403, corsHeaders);
    const link = await createConfirmationLinkForOrder(env, url, order, currentUser);
    return new Response(JSON.stringify({ success: true, link }), { headers: corsHeaders });
}

async function reopenInternalConfirmation(env, url, payload, currentUser, corsHeaders) {
    const projectId = normalizeProjectId(payload?.project_id);
    const orderId = Number(payload?.order_id || 0);
    if (!projectId || !orderId) return errorResponse('缺少订单信息', 400, corsHeaders);
    const order = await getOrderForConfirmation(env, projectId, orderId);
    if (!order) return errorResponse('订单不存在或已失效', 404, corsHeaders);
    if (!canAccessExhibitorOrder(currentUser, order)) return errorResponse('无权限申请编辑该订单', 403, corsHeaders);
    const settings = await getConfirmationSettings(env, projectId);
    if (isConfirmationCollectionClosed(settings)) return errorResponse('信息收集已截止，不能申请编辑信息', 423, corsHeaders);
    const boothRows = await buildOrderBoothRows(env, order);
    const lintelRows = await buildOrderLintelRows(env, order, boothRows);
    const beforeSnapshot = createConfirmationSnapshot(order, lintelRows);
    const nowText = getChinaTimestamp();
    await env.DB.prepare(`
      UPDATE Orders
      SET exhibitor_info_status = ?, exhibitor_info_confirmed_by = '', exhibitor_info_confirmed_at = ''
      WHERE project_id = ? AND id = ?
    `).bind(EXHIBITOR_INFO_STATUS_REOPENED, projectId, orderId).run();
    for (const lintel of lintelRows) {
        if (Number(lintel.exhibition_confirmed || 0) === LINTEL_CONFIRMED) continue;
        await ensureLintelRecord(env, lintel);
        await env.DB.prepare(`
          UPDATE ExhibitionLintels
          SET business_confirmed = 0, business_confirmed_by = '', business_confirmed_at = '', business_confirm_source = '', updated_at = ?
          WHERE project_id = ? AND order_id = ? AND booth_code = ?
        `).bind(nowText, projectId, orderId, lintel.booth_code).run();
    }
    const refreshedOrder = await getOrderForConfirmation(env, projectId, orderId);
    const refreshedLintels = await buildOrderLintelRows(env, refreshedOrder, boothRows);
    const afterSnapshot = createConfirmationSnapshot(refreshedOrder, refreshedLintels);
    const link = await createConfirmationLinkForOrder(env, url, refreshedOrder, currentUser, { revokeExisting: true });
    await insertConfirmationEvent(env, {
        projectId,
        orderId,
        linkId: link.id,
        eventType: 'reopen',
        beforeSnapshot,
        afterSnapshot,
        createdBy: String(currentUser?.name || '').trim()
    });
    await invalidateProjectBoothMapRuntimeCaches(env, projectId);
    return new Response(JSON.stringify({ success: true, link }), { headers: corsHeaders });
}

async function getInternalConfirmationOverview(env, url, currentUser, corsHeaders) {
    const projectId = normalizeProjectId(url.searchParams.get('projectId'));
    const orderId = Number(url.searchParams.get('orderId') || 0);
    if (!projectId || !orderId) return errorResponse('缺少订单信息', 400, corsHeaders);
    const order = await getOrderForConfirmation(env, projectId, orderId);
    if (!order) return errorResponse('订单不存在或已失效', 404, corsHeaders);
    if (!canAccessExhibitorOrder(currentUser, order)) return errorResponse('无权限查看该订单确认信息', 403, corsHeaders);
    const payload = await buildConfirmationOverviewPayload(env, order, { includeEvents: true });
    return new Response(JSON.stringify(payload), { headers: corsHeaders });
}

async function getPublicConfirmationOverview(env, token, corsHeaders) {
    const resolved = await resolveConfirmationLinkByToken(env, token);
    if (resolved.error) return errorResponse(resolved.error, resolved.status || 400, corsHeaders);
    const payload = await buildConfirmationOverviewPayload(env, resolved.order, { link: resolved.link, includeEvents: false });
    return new Response(JSON.stringify(payload), { headers: corsHeaders });
}

function normalizePublicConfirmationPayload(payload) {
    const mainBusiness = String(payload?.main_business || '').trim();
    const profile = String(payload?.profile || '').trim();
    const lintels = Array.isArray(payload?.lintels) ? payload.lintels : [];
    return {
        main_business: mainBusiness,
        profile,
        lintels: lintels.map((item) => ({
            booth_code: normalizeBoothCode(item?.booth_code),
            name_zh: String(item?.name_zh || '').trim(),
            name_en: String(item?.name_en || '').trim(),
            remark: String(item?.remark || '').trim()
        })).filter((item) => item.booth_code)
    };
}

async function submitPublicConfirmation(env, token, payload, corsHeaders) {
    const resolved = await resolveConfirmationLinkByToken(env, token);
    if (resolved.error) return errorResponse(resolved.error, resolved.status || 400, corsHeaders);
    const link = resolved.link;
    if (String(link.submitted_at || '').trim()) return errorResponse('该链接已提交确认，如需修改请联系业务员申请编辑', 400, corsHeaders);
    const order = resolved.order;
    const settings = await getConfirmationSettings(env, order.project_id);
    if (isConfirmationCollectionClosed(settings)) return errorResponse('信息收集已截止，当前仅可查看，不能提交。如需处理请联系组委会。', 423, corsHeaders);
    const normalizedPayload = normalizePublicConfirmationPayload(payload);
    if (!normalizedPayload.main_business) return errorResponse('请填写详细展品', 400, corsHeaders);
    if (!normalizedPayload.profile) return errorResponse('请填写企业简介或产品亮点', 400, corsHeaders);
    if (normalizedPayload.main_business.length > 200) return errorResponse('详细展品不能超过 200 字', 400, corsHeaders);
    if (normalizedPayload.profile.length > PROFILE_MAX_LENGTH) return errorResponse(`企业简介或产品亮点不能超过 ${PROFILE_MAX_LENGTH} 字`, 400, corsHeaders);
    const boothRows = await buildOrderBoothRows(env, order);
    const lintelRows = await buildOrderLintelRows(env, order, boothRows);
    const beforeSnapshot = createConfirmationSnapshot(order, lintelRows);
    const payloadLintelMap = new Map(normalizedPayload.lintels.map((item) => [item.booth_code, item]));
    for (const lintel of lintelRows) {
        if (Number(lintel.exhibition_confirmed || 0) === LINTEL_CONFIRMED) continue;
        const incoming = payloadLintelMap.get(normalizeBoothCode(lintel.booth_code));
        const nameZh = String(incoming?.name_zh || lintel.name_zh || '').trim();
        const zhError = validateLintelChineseName(nameZh);
        if (zhError) return errorResponse(`展位 ${lintel.booth_code}：${zhError}`, 400, corsHeaders);
    }
    const nowText = getChinaTimestamp();
    await env.DB.prepare(`
      UPDATE Orders
      SET main_business = ?, profile = ?, exhibitor_info_status = ?, exhibitor_info_confirmed_by = ?, exhibitor_info_confirmed_at = ?
      WHERE project_id = ? AND id = ?
    `).bind(
        normalizedPayload.main_business,
        normalizedPayload.profile,
        EXHIBITOR_INFO_STATUS_CONFIRMED,
        EXHIBITOR_CONFIRMATION_OPERATOR,
        nowText,
        order.project_id,
        order.id
    ).run();
    for (const lintel of lintelRows) {
        if (Number(lintel.exhibition_confirmed || 0) === LINTEL_CONFIRMED) continue;
        const incoming = payloadLintelMap.get(normalizeBoothCode(lintel.booth_code)) || {};
        const nextNameZh = String(incoming.name_zh || lintel.name_zh || '').trim();
        const nextNameEn = String(incoming.name_en || '').trim();
        const nextRemark = String(incoming.remark || '').trim();
        await ensureLintelRecord(env, lintel);
        await env.DB.prepare(`
          UPDATE ExhibitionLintels
          SET name_zh = ?, name_en = ?, remark = ?,
              business_confirmed = 1, business_confirmed_by = ?, business_confirmed_at = ?, business_confirm_source = ?,
              updated_at = ?
          WHERE project_id = ? AND order_id = ? AND booth_code = ?
        `).bind(
            nextNameZh,
            nextNameEn,
            nextRemark,
            EXHIBITOR_CONFIRMATION_OPERATOR,
            nowText,
            LINTEL_CONFIRM_SOURCE_EXHIBITOR,
            nowText,
            order.project_id,
            order.id,
            lintel.booth_code
        ).run();
    }
    await env.DB.prepare(`
      UPDATE ExhibitorConfirmationLinks
      SET submitted_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(nowText, nowText, Number(link.id || 0)).run();
    const updatedOrder = await getOrderForConfirmation(env, order.project_id, order.id);
    const updatedLintels = await buildOrderLintelRows(env, updatedOrder, boothRows);
    const afterSnapshot = createConfirmationSnapshot(updatedOrder, updatedLintels);
    await insertConfirmationEvent(env, {
        projectId: order.project_id,
        orderId: order.id,
        linkId: Number(link.id || 0),
        eventType: 'submit',
        beforeSnapshot,
        afterSnapshot,
        createdBy: EXHIBITOR_CONFIRMATION_OPERATOR
    });
    await invalidateProjectBoothMapRuntimeCaches(env, order.project_id);
    const overview = await buildConfirmationOverviewPayload(env, updatedOrder, {
        link: { ...link, submitted_at: nowText },
        includeEvents: false
    });
    return new Response(JSON.stringify({ success: true, overview }), { headers: corsHeaders });
}

async function buildExhibitorDirectoryPayload(env, projectId, currentUser) {
    const whereClauses = [
        'project_id = ?',
        "status = '正常'",
        "(deleted_at IS NULL OR deleted_at = '')"
    ];
    const params = [projectId];
    if (!isSuperAdmin(currentUser) && !isExhibitionManager(currentUser)) {
        whereClauses.push('sales_name = ?');
        params.push(String(currentUser?.name || '').trim());
    }
    const orderRows = ((await env.DB.prepare(`
      SELECT
        id, company_name, booth_id, sales_name, area,
        COALESCE(exhibitor_info_status, 'sales_default') AS exhibitor_info_status,
        COALESCE(exhibitor_info_confirmed_at, '') AS exhibitor_info_confirmed_at
      FROM Orders
      WHERE ${whereClauses.join(' AND ')}
    `).bind(...params).all()).results || []);

    const boothCodeSet = new Set();
    const exploded = [];
    for (const row of orderRows) {
        const boothCodes = splitBoothCodeList(row.booth_id);
        if (boothCodes.length === 0) {
            exploded.push({
                order_id: Number(row.id || 0),
                booth_code: '',
                hall: '',
                booth_type: '',
                area: Number(row.area || 0),
                company_name: String(row.company_name || '').trim(),
                sales_name: String(row.sales_name || '').trim(),
                basic_info_status: normalizeExhibitorInfoStatus(row.exhibitor_info_status),
                basic_info_status_label: getBasicInfoStatusLabel(row.exhibitor_info_status),
                submitted_at: String(row.exhibitor_info_confirmed_at || '').trim()
            });
            continue;
        }
        boothCodes.forEach((boothCode) => {
            boothCodeSet.add(boothCode);
            exploded.push({
                order_id: Number(row.id || 0),
                booth_code: boothCode,
                hall: '',
                booth_type: '',
                area: Number(row.area || 0),
                company_name: String(row.company_name || '').trim(),
                sales_name: String(row.sales_name || '').trim(),
                basic_info_status: normalizeExhibitorInfoStatus(row.exhibitor_info_status),
                basic_info_status_label: getBasicInfoStatusLabel(row.exhibitor_info_status),
                submitted_at: String(row.exhibitor_info_confirmed_at || '').trim()
            });
        });
    }

    const boothMetaMap = new Map();
    const boothCodes = [...boothCodeSet];
    for (const chunk of chunkItems(boothCodes, SQL_IN_CHUNK_SIZE)) {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(
            `SELECT id, hall, type, area FROM Booths WHERE project_id = ? AND id IN (${placeholders})`
        ).bind(projectId, ...chunk).all()).results || []);
        rows.forEach((boothRow) => {
            boothMetaMap.set(String(boothRow.id || '').trim().toUpperCase(), {
                hall: String(boothRow.hall || '').trim(),
                type: String(boothRow.type || '').trim(),
                area: Number(boothRow.area || 0)
            });
        });
    }

    exploded.forEach((row) => {
        if (!row.booth_code) return;
        const meta = boothMetaMap.get(row.booth_code);
        if (meta) {
            row.hall = meta.hall;
            row.booth_type = meta.type;
        }
    });

    const orderIds = [...new Set(exploded.map((row) => Number(row.order_id || 0)).filter((id) => id > 0))];
    const lintelMap = new Map();
    for (const chunk of chunkItems(orderIds)) {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
          SELECT order_id, booth_code, business_confirmed, business_confirm_source, exhibition_confirmed
          FROM ExhibitionLintels
          WHERE project_id = ? AND order_id IN (${placeholders})
        `).bind(projectId, ...chunk).all()).results || []);
        rows.forEach((row) => lintelMap.set(getLintelCompositeKey(row.order_id, row.booth_code), row));
    }
    const specialDecorationMap = await getSpecialDecorationReportMap(env, projectId, orderIds);
    const confirmationSettings = await getConfirmationSettings(env, projectId);
    const confirmationCollectionClosed = isConfirmationCollectionClosed(confirmationSettings);

    exploded.forEach((row) => {
        row.confirmation_collection_closed = confirmationCollectionClosed;
        row.confirmation_collection_deadline_at = confirmationSettings.collection_deadline_at;
        if (isEligibleLintelBoothType(row.booth_type)) {
            const lintel = lintelMap.get(getLintelCompositeKey(row.order_id, row.booth_code));
            const businessConfirmed = Number(lintel?.business_confirmed || 0) === LINTEL_CONFIRMED;
            const exhibitionConfirmed = Number(lintel?.exhibition_confirmed || 0) === LINTEL_CONFIRMED;
            const source = businessConfirmed && String(lintel?.business_confirm_source || '').trim() === LINTEL_CONFIRM_SOURCE_EXHIBITOR
                ? LINTEL_CONFIRM_SOURCE_EXHIBITOR
                : LINTEL_CONFIRM_SOURCE_SALES;
            row.exhibition_status = exhibitionConfirmed
                ? '已确认/展务已确认'
                : (businessConfirmed
                    ? '已确认/展务未确认'
                    : '未确认');
            row.exhibition_status_kind = exhibitionConfirmed ? 'confirmed' : (businessConfirmed ? 'pending_exhibition' : 'unconfirmed');
        } else if (isSpecialDecorationBoothType(row.booth_type)) {
            const report = specialDecorationMap.get(Number(row.order_id || 0));
            const reported = Number(report?.reported || 0) === SPECIAL_DECORATION_REPORTED;
            row.exhibition_status = reported ? '已报图' : '未报图';
            row.exhibition_status_kind = reported ? 'reported' : 'unreported';
        } else {
            row.exhibition_status = '无需展务确认';
            row.exhibition_status_kind = 'none';
        }
    });

    exploded.sort((a, b) => {
        const hallA = String(a.hall || '');
        const hallB = String(b.hall || '');
        if (hallA !== hallB) return hallA.localeCompare(hallB, 'zh-Hans-CN', { numeric: true });
        return String(a.booth_code || '').localeCompare(String(b.booth_code || ''), 'zh-Hans-CN', { numeric: true });
    });

    const hallSet = new Set();
    const boothTypeSet = new Set();
    exploded.forEach((row) => {
        if (row.hall) hallSet.add(row.hall);
        if (row.booth_type) boothTypeSet.add(row.booth_type);
    });

    return {
        items: exploded,
        hall_options: [...hallSet].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN', { numeric: true })),
        booth_type_options: [...boothTypeSet].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'))
    };
}

export async function handleExhibitionRoutes({
    request,
    env,
    url,
    currentUser,
    corsHeaders
}) {
    if (url.pathname.startsWith('/api/public/exhibitor-confirmation-banner/') && request.method === 'GET') {
        return readConfirmationBannerImage(request, env, url, corsHeaders);
    }

    if (url.pathname.startsWith('/api/public/exhibitor-confirmations/')) {
        const publicPath = url.pathname.replace('/api/public/exhibitor-confirmations/', '');
        const isSubmit = publicPath.endsWith('/submit');
        const token = decodeURIComponent(isSubmit ? publicPath.slice(0, -'/submit'.length) : publicPath);
        if (!token) return errorResponse('链接无效', 404, corsHeaders);
        if (!isSubmit && request.method === 'GET') {
            return getPublicConfirmationOverview(env, token, corsHeaders);
        }
        if (isSubmit && request.method === 'POST') {
            const limited = await checkPublicSubmitRateLimit(env, getPublicSubmitClientKey(request));
            if (limited) return errorResponse('提交过于频繁，请稍后再试', 429, corsHeaders);
            const payload = await readJsonBody(request, corsHeaders);
            if (payload instanceof Response) return payload;
            return submitPublicConfirmation(env, token, payload, corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/confirmation-settings' && request.method === 'GET') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可查看展商确认链接设置', 403, corsHeaders);
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        try {
            const settings = await getConfirmationSettings(env, projectId);
            return new Response(JSON.stringify(settings), { headers: corsHeaders });
        } catch (error) {
            console.error('Load confirmation settings failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/confirmation-settings' && request.method === 'POST') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可编辑展商确认链接设置', 403, corsHeaders);
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return saveConfirmationSettings(env, payload, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/confirmation-banner-upload' && request.method === 'POST') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可上传确认页头图', 403, corsHeaders);
        return uploadConfirmationBanner(request, env, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/exhibitor-confirmation-link' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return createInternalConfirmationLink(env, url, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/exhibitor-confirmation-reopen' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return reopenInternalConfirmation(env, url, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/exhibitor-confirmation-overview' && request.method === 'GET') {
        return getInternalConfirmationOverview(env, url, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/refrigerator-configs' && request.method === 'GET') {
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        try {
            const configs = await listRefrigeratorConfigs(env, projectId);
            return new Response(JSON.stringify(configs), { headers: corsHeaders });
        } catch (error) {
            console.error('List refrigerator configs failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/refrigerator-configs' && request.method === 'POST') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可编辑展务项目设置', 403, corsHeaders);
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return saveRefrigeratorConfig(env, payload, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/delete-refrigerator-config' && request.method === 'POST') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可编辑展务项目设置', 403, corsHeaders);
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return deleteRefrigeratorConfig(env, payload, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/refrigerator-image-upload' && request.method === 'POST') {
        if (!isSuperAdmin(currentUser)) return errorResponse('仅超级管理员可上传冰柜图示', 403, corsHeaders);
        return uploadRefrigeratorImage(request, env, corsHeaders);
    }

    if (url.pathname.startsWith('/api/exhibition/refrigerator-image/') && request.method === 'GET') {
        return readRefrigeratorImage(request, env, url, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/company-options' && request.method === 'GET') {
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        const search = normalizeSearchValue(url.searchParams.get('search'));
        try {
            const rows = await buildCompanyAggregateRows(env, projectId, currentUser, search);
            return new Response(JSON.stringify(rows), { headers: corsHeaders });
        } catch (error) {
            console.error('List company options failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/refrigerator-rentals' && request.method === 'GET') {
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        const search = normalizeSearchValue(url.searchParams.get('search'));
        try {
            const payload = await buildRentalListPayload(env, projectId, currentUser, search);
            return new Response(JSON.stringify(payload), { headers: corsHeaders });
        } catch (error) {
            console.error('List refrigerator rentals failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/refrigerator-rental-detail' && request.method === 'GET') {
        const rentalId = Number(url.searchParams.get('rentalId') || 0);
        if (!rentalId) return errorResponse('缺少租赁记录 ID', 400, corsHeaders);
        try {
            const payload = await buildRentalDetailPayload(env, rentalId, currentUser);
            if (payload?.error) return errorResponse(payload.error, payload.status || 400, corsHeaders);
            return new Response(JSON.stringify(payload), { headers: corsHeaders });
        } catch (error) {
            console.error('Load refrigerator rental detail failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/refrigerator-rentals' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return saveRefrigeratorRental(env, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/delete-refrigerator-rental' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return deleteRefrigeratorRental(env, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/refrigerator-rental-confirmation' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return updateRefrigeratorRentalVenueConfirmation(env, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/refrigerator-rentals-export' && request.method === 'GET') {
        if (!canManageExhibitionModule(currentUser)) return errorResponse('仅管理员或展务管理人员可导出租赁数据', 403, corsHeaders);
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        const search = normalizeSearchValue(url.searchParams.get('search'));
        try {
            const payload = await buildRentalListPayload(env, projectId, currentUser, search);
            const rows = [[
                '序号',
                '企业名称',
                '主场确认状态',
                '馆号',
                '展位号/使用地点',
                '业务员姓名',
                ...payload.type_columns.map((column) => `${column}数量`),
                '组委会付款金额',
                '企业直接付至主场金额',
                '总计应收款',
                '订单明细',
                '创建时间',
                '更新时间'
            ]];
            payload.items.forEach((item, index) => {
                rows.push([
                    index + 1,
                    item.company_name,
                    item.venue_confirmation_status,
                    item.hall_names,
                    { __excelText: true, value: item.usage_location || item.booth_numbers },
                    item.sales_name,
                    ...payload.type_columns.map((column) => item.item_counts?.[column] || 0),
                    item.organizer_payment_total,
                    item.venue_payment_total,
                    item.total_amount,
                    item.item_summary,
                    item.created_at,
                    item.updated_at
                ]);
            });
            return new Response(buildCsvContent(rows), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`冰柜租赁管理-${projectId}.csv`)}`
                }
            });
        } catch (error) {
            console.error('Export refrigerator rentals failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/lintels' && request.method === 'GET') {
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        try {
            const payload = await buildLintelListPayload(env, projectId, currentUser);
            return new Response(JSON.stringify(payload), { headers: corsHeaders });
        } catch (error) {
            console.error('List lintels failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/lintel-save' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return saveLintelRecord(env, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/lintel-business-confirmation' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return updateLintelBusinessConfirmation(env, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/lintel-exhibition-confirmation' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return updateLintelExhibitionConfirmation(env, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/special-decorations' && request.method === 'GET') {
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        try {
            const payload = await buildSpecialDecorationListPayload(env, projectId, currentUser, {
                search: url.searchParams.get('search'),
                hall: url.searchParams.get('hall'),
                status: url.searchParams.get('status'),
                salesName: url.searchParams.get('salesName'),
                page: url.searchParams.get('page')
            });
            return new Response(JSON.stringify(payload), { headers: corsHeaders });
        } catch (error) {
            console.error('List special decorations failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    if (url.pathname === '/api/exhibition/special-decoration-report-status' && request.method === 'POST') {
        const payload = await readJsonBody(request, corsHeaders);
        if (payload instanceof Response) return payload;
        return updateSpecialDecorationReportStatus(env, payload, currentUser, corsHeaders);
    }

    if (url.pathname === '/api/exhibition/exhibitor-directory' && request.method === 'GET') {
        const projectId = normalizeProjectId(url.searchParams.get('projectId'));
        if (!projectId) return errorResponse('缺少项目 ID', 400, corsHeaders);
        try {
            const payload = await buildExhibitorDirectoryPayload(env, projectId, currentUser);
            return new Response(JSON.stringify(payload), { headers: corsHeaders });
        } catch (error) {
            console.error('List exhibitor directory failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    return null;
}
