import { getOrderFieldSettings } from './order-fields.mjs';
import { acquireBoothLocks, releaseBoothLocks } from './booth-locks.mjs';
import { syncBoothStatusByBoothIds } from './booth-sync.mjs';
import {
    countDisplayNameUnits,
    findActiveAgentByName,
    getChinaTimestamp,
    normalizeEditableFeeItems,
    roundTo,
    toBoothCount,
    toNonNegativeNumber,
    validateStandardBoothDisplayName
} from '../utils/helpers.mjs';
import { normalizeBoothCode, splitBoothCodeList } from '../utils/booth-map.mjs';

const SQL_IN_CHUNK_SIZE = 80;
const BATCH_CHUNK_SIZE = 40;
const MAX_IMPORT_ROWS = 300;
const MAX_SELECTED_BOOTHS = 20;
const PROFILE_MAX_LENGTH = 300;
const PREVIEW_LIMIT = 50;
const ALLOWED_ORDER_STATUSES = new Set(['正常', '已退订', '已作废']);

const HEADER_ALIAS_MAP = {
    sales_name: 'sales_name',
    业务员: 'sales_name',
    归属业务员: 'sales_name',
    company_name: 'company_name',
    参展企业全称: 'company_name',
    credit_code: 'credit_code',
    统一社会信用代码: 'credit_code',
    no_code_checked: 'no_code_checked',
    无代码: 'no_code_checked',
    特殊无代码: 'no_code_checked',
    contact_person: 'contact_person',
    联系人: 'contact_person',
    phone: 'phone',
    联系电话: 'phone',
    region: 'region',
    所在地区: 'region',
    category: 'category',
    产品分类: 'category',
    main_business: 'main_business',
    主营业务: 'main_business',
    详细展品: 'main_business',
    profile: 'profile',
    企业简介: 'profile',
    企业简介或产品亮点: 'profile',
    is_agent: 'is_agent',
    招展渠道分类: 'is_agent',
    渠道分类: 'is_agent',
    agent_name: 'agent_name',
    代理商公司名称: 'agent_name',
    total_booth_fee: 'total_booth_fee',
    最终成交展位费: 'total_booth_fee',
    actual_booth_fee: 'total_booth_fee',
    other_income: 'other_income',
    其他应收: 'other_income',
    fees_json: 'fees_json',
    其他费用json: 'fees_json',
    其他费用JSON: 'fees_json',
    paid_amount: 'paid_amount',
    已收金额: 'paid_amount',
    booth_id: 'booth_id',
    展位号: 'booth_id',
    booth_display_name: 'booth_display_name',
    展位图简称: 'booth_display_name',
    standard_booth_display_name: 'standard_booth_display_name',
    标准展位简称: 'standard_booth_display_name',
    ground_booth_display_name: 'ground_booth_display_name',
    光地显示名称: 'ground_booth_display_name',
    area: 'area',
    面积: 'area',
    price_unit: 'price_unit',
    计价单位: 'price_unit',
    unit_price: 'unit_price',
    成交单价: 'unit_price',
    standard_fee: 'standard_fee',
    标准金额: 'standard_fee',
    booth_type: 'booth_type',
    展位类型: 'booth_type',
    hall: 'hall',
    馆号: 'hall',
    is_joint: 'is_joint',
    联合参展: 'is_joint',
    是否联合参展: 'is_joint',
    no_booth_order: 'no_booth_order',
    无展位订单: 'no_booth_order',
    selected_booths_json: 'selected_booths_json',
    多展位JSON: 'selected_booths_json',
    status: 'status',
    状态: 'status',
    created_at: 'created_at',
    录入时间: 'created_at',
    discount_reason: 'discount_reason',
    优惠说明: 'discount_reason',
    contract_url: 'contract_url',
    合同附件地址: 'contract_url'
};

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

function normalizeHeader(header) {
    const rawHeader = String(header || '').trim();
    if (!rawHeader) return '';
    const deannotatedHeader = rawHeader
        .replace(/（[^）]*）/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/【[^】]*】/g, '')
        .replace(/\[[^\]]*]/g, '')
        .trim();
    const compactHeader = deannotatedHeader.toLowerCase().replace(/[\s_-]+/g, '');
    const matched = Object.entries(HEADER_ALIAS_MAP).find(([alias]) => alias.toLowerCase().replace(/[\s_-]+/g, '') === compactHeader);
    return matched ? matched[1] : (deannotatedHeader || rawHeader);
}

function detectDelimiter(text) {
    const firstNonEmptyLine = String(text || '')
        .split(/\r?\n/)
        .find((line) => String(line || '').trim());
    if (!firstNonEmptyLine) return ',';
    const commaCount = (firstNonEmptyLine.match(/,/g) || []).length;
    const tabCount = (firstNonEmptyLine.match(/\t/g) || []).length;
    return tabCount > commaCount ? '\t' : ',';
}

export function parseOrderImportText(rawText) {
    const text = String(rawText || '').replace(/^\uFEFF/, '');
    if (!text.trim()) return [];
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (!inQuotes && char === delimiter) {
            row.push(cell);
            cell = '';
            continue;
        }

        if (!inQuotes && (char === '\n' || char === '\r')) {
            if (char === '\r' && nextChar === '\n') {
                index += 1;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }

        cell += char;
    }

    row.push(cell);
    rows.push(row);

    return rows.filter((item) => item.some((cellValue) => String(cellValue || '').trim()));
}

function normalizeBoolean(value, { allowBlank = false } = {}) {
    const rawValue = String(value ?? '').trim().toLowerCase();
    if (!rawValue) return allowBlank ? null : 0;
    if (['1', 'true', 'yes', 'y', '是', '有', '需', '需要'].includes(rawValue)) return 1;
    if (['0', 'false', 'no', 'n', '否', '无', '不', '不要'].includes(rawValue)) return 0;
    return null;
}

function normalizeAgentFlag(value) {
    const rawValue = String(value ?? '').trim().toLowerCase();
    if (!rawValue) return null;
    if (['1', 'true', 'yes', '代理', '代理商', '代理商招展'].includes(rawValue)) return 1;
    if (['0', 'false', 'no', '直招', '业务员直招'].includes(rawValue)) return 0;
    return null;
}

function normalizeStatus(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '正常';
    return ALLOWED_ORDER_STATUSES.has(normalized) ? normalized : '';
}

function normalizeDateTime(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized} 00:00:00`;
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(normalized)) return normalized;
    const parsedTime = Date.parse(normalized.replace(/\//g, '-').replace('T', ' '));
    if (!Number.isFinite(parsedTime)) return '';
    const date = new Date(parsedTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function parseNumeric(value, fallback = NaN) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return fallback;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
}

function safeTrim(value) {
    return String(value || '').trim();
}

function parseFeeItems(rowObject) {
    const rawFeesJson = safeTrim(rowObject.fees_json);
    if (rawFeesJson) {
        return normalizeEditableFeeItems(rawFeesJson);
    }
    const otherIncome = parseNumeric(rowObject.other_income, 0);
    if (Number.isFinite(otherIncome) && otherIncome > 0) {
        return [{ name: '历史导入其他费用', amount: Number(otherIncome.toFixed(2)) }];
    }
    return [];
}

function calculateStandardFee(type, unitPrice, area) {
    const normalizedType = safeTrim(type);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return 0;
    if (!Number.isFinite(area) || area < 0) return 0;
    return normalizedType === '光地'
        ? roundTo(unitPrice * area, 2)
        : roundTo(unitPrice * toBoothCount(area), 2);
}

function resolveBoothDisplayName(boothType, payload) {
    const normalizedBoothType = safeTrim(boothType);
    const standardName = safeTrim(payload.standard_booth_display_name);
    const groundName = safeTrim(payload.ground_booth_display_name);
    const genericName = safeTrim(payload.booth_display_name);
    const companyName = safeTrim(payload.company_name);
    if (normalizedBoothType === '光地') {
        return groundName || genericName || companyName;
    }
    return standardName || genericName;
}

function mapRowsToObjects(parsedRows) {
    const [headerRow, ...dataRows] = parsedRows;
    const canonicalHeaders = (headerRow || []).map((header) => normalizeHeader(header));
    return dataRows.map((rowValues, index) => {
        const rowObject = {};
        canonicalHeaders.forEach((header, headerIndex) => {
            if (!header) return;
            rowObject[header] = String(rowValues?.[headerIndex] ?? '').trim();
        });
        return {
            rowNumber: index + 2,
            rowObject
        };
    });
}

async function loadProject(env, projectId) {
    return env.DB.prepare('SELECT id, name FROM Projects WHERE id = ?').bind(Number(projectId)).first();
}

async function loadStaffNameSet(env) {
    const rows = (await env.DB.prepare('SELECT name FROM Staff').all()).results || [];
    return new Set(rows.map((row) => String(row.name || '').trim()).filter(Boolean));
}

async function loadBoothMap(env, projectId, boothIds = []) {
    const normalizedBoothIds = Array.from(new Set(
        (Array.isArray(boothIds) ? boothIds : [])
            .map((boothId) => normalizeBoothCode(boothId))
            .filter(Boolean)
    ));
    const boothMap = new Map();
    for (const boothIdChunk of chunkItems(normalizedBoothIds)) {
        const placeholders = boothIdChunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
            SELECT id, hall, type, area, price_unit, base_price
            FROM Booths
            WHERE project_id = ? AND id IN (${placeholders})
        `).bind(Number(projectId), ...boothIdChunk).all()).results || []);
        rows.forEach((row) => {
            boothMap.set(normalizeBoothCode(row.id), row);
        });
    }
    return boothMap;
}

async function loadActiveOrdersMap(env, projectId, boothIds = []) {
    const normalizedBoothIds = Array.from(new Set(
        (Array.isArray(boothIds) ? boothIds : [])
            .map((boothId) => normalizeBoothCode(boothId))
            .filter(Boolean)
    ));
    const activeOrderMap = new Map();
    for (const boothIdChunk of chunkItems(normalizedBoothIds)) {
        const placeholders = boothIdChunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
            SELECT id, booth_id, area, created_at
            FROM Orders
            WHERE project_id = ?
              AND booth_id IN (${placeholders})
              AND status = '正常'
            ORDER BY datetime(created_at) ASC, id ASC
        `).bind(Number(projectId), ...boothIdChunk).all()).results || []);
        rows.forEach((row) => {
            const boothId = normalizeBoothCode(row.booth_id);
            if (!boothId) return;
            if (!activeOrderMap.has(boothId)) {
                activeOrderMap.set(boothId, []);
            }
            activeOrderMap.get(boothId).push({
                kind: 'db',
                id: Number(row.id),
                booth_id: boothId,
                area: Number(row.area || 0),
                created_at: String(row.created_at || '')
            });
        });
    }
    return activeOrderMap;
}

function normalizeCompanyNameForMatch(value) {
    return safeTrim(value).toLowerCase();
}

async function loadExistingCompanyNameSet(env, projectId, companyNames = []) {
    const normalizedCompanyNames = Array.from(new Set(
        (Array.isArray(companyNames) ? companyNames : [])
            .map((companyName) => normalizeCompanyNameForMatch(companyName))
            .filter(Boolean)
    ));
    const companyNameSet = new Set();
    for (const companyNameChunk of chunkItems(normalizedCompanyNames)) {
        const placeholders = companyNameChunk.map(() => '?').join(',');
        const rows = ((await env.DB.prepare(`
            SELECT company_name
            FROM Orders
            WHERE project_id = ?
              AND deleted_at IS NULL
              AND LOWER(TRIM(company_name)) IN (${placeholders})
        `).bind(Number(projectId), ...companyNameChunk).all()).results || []);
        rows.forEach((row) => {
            const normalizedCompanyName = normalizeCompanyNameForMatch(row.company_name);
            if (normalizedCompanyName) companyNameSet.add(normalizedCompanyName);
        });
    }
    return companyNameSet;
}

function buildSettingsMap(settings = []) {
    return Object.fromEntries((Array.isArray(settings) ? settings : []).map((item) => [String(item.key), item]));
}

function isFieldRequired(settingsMap, key) {
    return Number(settingsMap?.[key]?.required || 0) === 1;
}

function isFieldEnabled(settingsMap, key) {
    const setting = settingsMap?.[key];
    if (!setting) return true;
    return Number(setting.enabled || 0) === 1;
}

function collectBoothInputs(rowObject) {
    const selectedBoothsJson = safeTrim(rowObject.selected_booths_json);
    if (selectedBoothsJson) {
        const parsed = JSON.parse(selectedBoothsJson);
        if (!Array.isArray(parsed)) throw new Error('selected_booths_json 必须是数组');
        return parsed;
    }
    const boothIds = splitBoothCodeList(rowObject.booth_id);
    if (boothIds.length === 0) return [];
    return boothIds.map((boothId) => ({
        booth_id: boothId,
        hall: safeTrim(rowObject.hall),
        type: safeTrim(rowObject.booth_type),
        area: rowObject.area,
        price_unit: safeTrim(rowObject.price_unit),
        unit_price: rowObject.unit_price,
        standard_fee: rowObject.standard_fee,
        is_joint: rowObject.is_joint
    }));
}

function normalizeBoothInputs(rawItems, boothMap, rowObject) {
    return (Array.isArray(rawItems) ? rawItems : []).map((item) => {
        const boothId = normalizeBoothCode(item?.booth_id || rowObject.booth_id);
        const booth = boothMap.get(boothId) || null;
        const type = safeTrim(item?.type || item?.booth_type || rowObject.booth_type || booth?.type);
        const areaInput = toNonNegativeNumber(item?.area ?? rowObject.area);
        const area = Number.isFinite(areaInput) ? areaInput : Number(booth?.area || 0);
        const unitPriceInput = toNonNegativeNumber(item?.unit_price ?? rowObject.unit_price);
        const unitPrice = Number.isFinite(unitPriceInput) ? unitPriceInput : Number(booth?.base_price || 0);
        const priceUnit = safeTrim(item?.price_unit || rowObject.price_unit || booth?.price_unit || (type === '光地' ? '平米' : '个'));
        const standardFeeInput = toNonNegativeNumber(item?.standard_fee ?? rowObject.standard_fee);
        const standardFee = Number.isFinite(standardFeeInput) ? standardFeeInput : calculateStandardFee(type, unitPrice, area);
        const isJoint = normalizeBoolean(item?.is_joint ?? rowObject.is_joint, { allowBlank: true });
        return {
            booth_id: boothId,
            hall: safeTrim(item?.hall || rowObject.hall || booth?.hall),
            type,
            area,
            price_unit: priceUnit,
            unit_price: unitPrice,
            standard_fee: standardFee,
            is_joint: isJoint === 1 ? 1 : 0
        };
    });
}

function distributeBoothAmounts(selectedBooths, totalBoothFee, feeItems, paidAmount) {
    const totalOtherIncome = roundTo(feeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0), 2);
    const totalStandardFee = roundTo(selectedBooths.reduce((sum, item) => sum + Number(item.standard_fee || 0), 0), 2);
    let remainingBoothFee = roundTo(totalBoothFee, 2);
    let remainingOtherIncome = roundTo(totalOtherIncome, 2);

    const distributed = selectedBooths.map((item, index) => {
        const isLast = index === selectedBooths.length - 1;
        let boothFeePart = 0;
        let otherIncomePart = 0;
        if (isLast) {
            boothFeePart = roundTo(remainingBoothFee, 2);
            otherIncomePart = roundTo(remainingOtherIncome, 2);
        } else {
            const ratioBase = totalStandardFee > 0 ? Number(item.standard_fee || 0) : 1;
            const ratio = totalStandardFee > 0 ? ratioBase / totalStandardFee : 1 / selectedBooths.length;
            boothFeePart = roundTo(totalBoothFee * ratio, 2);
            otherIncomePart = roundTo(totalOtherIncome * ratio, 2);
            remainingBoothFee = roundTo(remainingBoothFee - boothFeePart, 2);
            remainingOtherIncome = roundTo(remainingOtherIncome - otherIncomePart, 2);
        }
        return {
            ...item,
            total_booth_fee: boothFeePart,
            other_income: otherIncomePart,
            total_amount: roundTo(boothFeePart + otherIncomePart, 2),
            paid_amount: 0,
            fees_json: index === 0 ? JSON.stringify(feeItems) : '[]'
        };
    });

    const totalDistributedAmount = roundTo(distributed.reduce((sum, item) => sum + Number(item.total_amount || 0), 0), 2);
    let remainingPaidAmount = roundTo(paidAmount, 2);
    return distributed.map((item, index) => {
        const isLast = index === distributed.length - 1;
        let paidAmountPart = 0;
        if (isLast) {
            paidAmountPart = roundTo(remainingPaidAmount, 2);
        } else {
            const ratio = totalDistributedAmount > 0
                ? Number(item.total_amount || 0) / totalDistributedAmount
                : 1 / distributed.length;
            paidAmountPart = roundTo(paidAmount * ratio, 2);
            remainingPaidAmount = roundTo(remainingPaidAmount - paidAmountPart, 2);
        }
        return {
            ...item,
            paid_amount: paidAmountPart
        };
    });
}

function createPreviewRow({ rowNumber, companyName, salesName, boothIds, totalAmount, status, result, reason, warnings = [] }) {
    return {
        row_number: rowNumber,
        company_name: companyName,
        sales_name: salesName,
        booth_ids: boothIds,
        total_amount: totalAmount,
        status,
        result,
        reason,
        warnings
    };
}

export async function buildOrderImportPlan(env, projectId, csvText) {
    const normalizedProjectId = Number(projectId || 0);
    const project = await loadProject(env, normalizedProjectId);
    if (!project) {
        throw new Error('项目不存在，请先选择有效项目');
    }

    const parsedRows = parseOrderImportText(csvText);
    if (parsedRows.length <= 1) {
        throw new Error('请上传包含表头和至少一行数据的 CSV');
    }

    const rowObjects = mapRowsToObjects(parsedRows);
    if (rowObjects.length > MAX_IMPORT_ROWS) {
        throw new Error(`单次最多导入 ${MAX_IMPORT_ROWS} 行，请拆分后重试`);
    }

    const settingsMap = buildSettingsMap(await getOrderFieldSettings(env, normalizedProjectId));
    const staffNameSet = await loadStaffNameSet(env);
    const rowCompanyNameCounts = new Map();
    rowObjects.forEach((rowEntry) => {
        const normalizedCompanyName = normalizeCompanyNameForMatch(rowEntry.rowObject?.company_name);
        if (!normalizedCompanyName) return;
        rowCompanyNameCounts.set(normalizedCompanyName, (rowCompanyNameCounts.get(normalizedCompanyName) || 0) + 1);
    });
    const existingCompanyNameSet = await loadExistingCompanyNameSet(
        env,
        normalizedProjectId,
        rowObjects.map((rowEntry) => rowEntry.rowObject?.company_name)
    );

    const allBoothIds = [];
    const preliminaryRows = [];
    for (const rowEntry of rowObjects) {
        let rawItems = [];
        let boothInputError = '';
        try {
            rawItems = collectBoothInputs(rowEntry.rowObject);
            rawItems.forEach((item) => {
                const boothId = normalizeBoothCode(item?.booth_id);
                if (boothId) allBoothIds.push(boothId);
            });
        } catch (error) {
            boothInputError = error?.message || '展位信息格式不正确';
        }
        preliminaryRows.push({
            rowNumber: rowEntry.rowNumber,
            rowObject: rowEntry.rowObject,
            rawBoothInputs: rawItems,
            boothInputError
        });
    }

    const boothMap = await loadBoothMap(env, normalizedProjectId, allBoothIds);
    const activeOrderMap = await loadActiveOrdersMap(env, normalizedProjectId, allBoothIds);
    const runtimeBoothState = new Map(
        Array.from(activeOrderMap.entries()).map(([boothId, items]) => [boothId, items.map((item) => ({ ...item }))])
    );

    const preview = [];
    const importRows = [];
    const dbAreaAdjustments = new Map();
    const boothIdsToLock = new Set();
    let successCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (const rowEntry of preliminaryRows) {
        const { rowNumber, rowObject, rawBoothInputs, boothInputError } = rowEntry;
        const errors = [];
        const warnings = [];
        if (boothInputError) {
            errors.push(boothInputError);
        }
        const companyName = safeTrim(rowObject.company_name);
        const salesName = safeTrim(rowObject.sales_name);
        const noCodeChecked = normalizeBoolean(rowObject.no_code_checked, { allowBlank: true }) === 1 ? 1 : 0;
        const agentFlag = normalizeAgentFlag(rowObject.is_agent);
        const noBoothOrder = normalizeBoolean(rowObject.no_booth_order, { allowBlank: true }) === 1 ? 1 : 0;
        const rawPaidAmount = safeTrim(rowObject.paid_amount);
        const paidAmount = parseNumeric(rowObject.paid_amount, 0);
        const totalBoothFee = parseNumeric(rowObject.total_booth_fee, 0);
        const normalizedStatus = normalizeStatus(rowObject.status);
        const createdAt = normalizeDateTime(rowObject.created_at) || getChinaTimestamp();
        const feeItems = (() => {
            try {
                return parseFeeItems(rowObject);
            } catch (error) {
                errors.push('其他费用 JSON 格式不正确');
                return [];
            }
        })();
        const totalOtherIncome = roundTo(feeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0), 2);
        const isAgentOrder = agentFlag === 1;

        if (!salesName) errors.push('业务员不能为空');
        if (salesName && !staffNameSet.has(salesName)) errors.push('业务员不存在，请先在系统配置里创建账号');
        if (!companyName) errors.push('参展企业全称不能为空');
        const normalizedCompanyName = normalizeCompanyNameForMatch(companyName);
        if (normalizedCompanyName && existingCompanyNameSet.has(normalizedCompanyName)) {
            warnings.push('参展企业全称已存在于当前项目，请确认不是重复导入');
        }
        if (normalizedCompanyName && Number(rowCompanyNameCounts.get(normalizedCompanyName) || 0) > 1) {
            warnings.push('参展企业全称在本次导入文件中重复，请确认多展位是否应合并在同一行');
        }
        if (agentFlag === null) errors.push('请填写招展渠道分类（直招 / 代理商招展）');
        if (!normalizedStatus) errors.push('状态仅支持 正常 / 已退订 / 已作废');
        if (rawPaidAmount && (!Number.isFinite(paidAmount) || paidAmount !== 0)) {
            warnings.push('已收金额本期不通过订单导入入账，本行将按已收 0 导入，请后续通过 ERP 同步或手工收款处理');
        }
        if (!Number.isFinite(totalBoothFee) || totalBoothFee < 0) errors.push('最终成交展位费必须是非负数');

        if (isFieldRequired(settingsMap, 'credit_code') && !noCodeChecked && !safeTrim(rowObject.credit_code)) {
            errors.push('统一社会信用代码不能为空');
        }
        if (isFieldRequired(settingsMap, 'contact_person') && !safeTrim(rowObject.contact_person)) errors.push('联系人不能为空');
        if (isFieldRequired(settingsMap, 'phone') && !safeTrim(rowObject.phone)) errors.push('联系电话不能为空');
        if (isFieldRequired(settingsMap, 'region') && !safeTrim(rowObject.region)) errors.push('所在地区不能为空');
        if (isFieldRequired(settingsMap, 'category') && !safeTrim(rowObject.category)) errors.push('产品分类不能为空');
        if (isFieldRequired(settingsMap, 'main_business') && !safeTrim(rowObject.main_business)) errors.push('主营业务/详细展品不能为空');
        if (isFieldRequired(settingsMap, 'profile') && !safeTrim(rowObject.profile)) errors.push('企业简介或产品亮点不能为空');
        if (safeTrim(rowObject.profile).length > PROFILE_MAX_LENGTH) errors.push(`企业简介或产品亮点不能超过 ${PROFILE_MAX_LENGTH} 字`);
        if (isFieldRequired(settingsMap, 'contract_upload') && !safeTrim(rowObject.contract_url)) errors.push('合同附件地址不能为空');
        if (isAgentOrder && isFieldEnabled(settingsMap, 'agent_name') && isFieldRequired(settingsMap, 'agent_name') && !safeTrim(rowObject.agent_name)) {
            errors.push('代理商公司名称不能为空');
        }
        if (noBoothOrder && totalBoothFee !== 0) {
            errors.push('无展位订单的最终成交展位费必须为 0');
        }
        if (noBoothOrder && totalOtherIncome <= 0) {
            errors.push('无展位订单必须至少包含一项其他应收费用');
        }

        const selectedBooths = noBoothOrder
            ? [{
                booth_id: '',
                hall: '',
                type: '',
                area: 0,
                price_unit: '无展位',
                unit_price: 0,
                standard_fee: 0,
                is_joint: 0
            }]
            : normalizeBoothInputs(rawBoothInputs, boothMap, rowObject);

        if (!noBoothOrder && selectedBooths.length === 0) {
            errors.push('请至少提供一个展位号或 selected_booths_json');
        }
        if (!noBoothOrder && selectedBooths.length > MAX_SELECTED_BOOTHS) {
            errors.push(`单行最多导入 ${MAX_SELECTED_BOOTHS} 个展位`);
        }
        if (!noBoothOrder && selectedBooths.length > 0) {
            const totalSelectedArea = selectedBooths.reduce((sum, item) => sum + Number(item.area || 0), 0);
            if (totalSelectedArea <= 0 && Number(totalBoothFee || 0) !== 0) {
                errors.push('0面积联合参展的最终成交展位费必须为 0');
            }
        }

        const hasStandardTypeBooth = selectedBooths.some((item) => ['标摊', '豪标'].includes(safeTrim(item.type)));
        const standardDisplayName = safeTrim(rowObject.standard_booth_display_name || rowObject.booth_display_name);
        if (hasStandardTypeBooth) {
            const standardDisplayError = validateStandardBoothDisplayName(standardDisplayName);
            if (standardDisplayError) errors.push(standardDisplayError);
        }
        const groundDisplayName = safeTrim(rowObject.ground_booth_display_name || rowObject.booth_display_name);
        if (countDisplayNameUnits(groundDisplayName) > 24) {
            errors.push('光地显示名称不能超过 12 个汉字或 24 个英文字符');
        }

        selectedBooths.forEach((item) => {
            if (!item.booth_id) return;
            if (!boothMap.has(item.booth_id)) {
                errors.push(`展位 ${item.booth_id} 不存在于当前项目展位库`);
                return;
            }
            if (!Number.isFinite(item.area) || item.area < 0) {
                errors.push(`展位 ${item.booth_id} 面积不合法`);
            }
            if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
                errors.push(`展位 ${item.booth_id} 单价不合法`);
            }
        });

        let normalizedAgentName = '';
        if (isAgentOrder && safeTrim(rowObject.agent_name)) {
            const agent = await findActiveAgentByName(env, normalizedProjectId, rowObject.agent_name);
            if (!agent) {
                errors.push('代理商不存在，请先在代理商库中创建');
            } else {
                normalizedAgentName = agent.name;
            }
        }

        const distributedBooths = errors.length === 0
            ? distributeBoothAmounts(selectedBooths, Number(totalBoothFee || 0), feeItems, 0)
            : [];

        if (errors.length === 0 && normalizedStatus === '正常' && !noBoothOrder) {
            const rowDbAreaAdjustments = new Map();
            const rowBoothIds = new Set();
            const rowStateMutations = [];
            distributedBooths.forEach((boothItem) => {
                const boothId = normalizeBoothCode(boothItem.booth_id);
                if (!boothId) return;
                const activeEntries = runtimeBoothState.get(boothId) || [];
                const existingEntry = activeEntries[0] || null;
                if (existingEntry && !boothItem.is_joint) {
                    errors.push(`展位 ${boothId} 已被占用；如确认为联合参展，请填写 联合参展=是，并填写分配面积`);
                    return;
                }
                if (!existingEntry && boothItem.is_joint) {
                    errors.push(`展位 ${boothId} 当前未被占用，不需要标记联合参展，请确认是否填错展位号`);
                    return;
                }
                if (existingEntry && boothItem.is_joint && boothItem.area > Number(existingEntry.area || existingEntry.boothItemRef?.area || 0)) {
                    errors.push(`展位 ${boothId} 联合参展分配面积不能大于当前可分摊面积`);
                    return;
                }
                if (existingEntry && boothItem.is_joint && boothItem.area > 0) {
                    if (existingEntry.kind === 'db') {
                        rowDbAreaAdjustments.set(
                            existingEntry.id,
                            roundTo((rowDbAreaAdjustments.get(existingEntry.id) || 0) + Number(boothItem.area || 0), 2)
                        );
                    } else if (existingEntry.kind === 'import' && existingEntry.boothItemRef) {
                        rowStateMutations.push(() => {
                            existingEntry.boothItemRef.area = roundTo(
                                Number(existingEntry.boothItemRef.area || 0) - Number(boothItem.area || 0),
                                2
                            );
                        });
                    }
                }
                rowStateMutations.push(() => {
                    const nextEntries = runtimeBoothState.get(boothId) || [];
                    nextEntries.push({
                        kind: 'import',
                        booth_id: boothId,
                        boothItemRef: boothItem
                    });
                    runtimeBoothState.set(boothId, nextEntries);
                });
                rowBoothIds.add(boothId);
            });
            if (errors.length === 0) {
                rowDbAreaAdjustments.forEach((deltaArea, orderId) => {
                    dbAreaAdjustments.set(orderId, roundTo((dbAreaAdjustments.get(orderId) || 0) + Number(deltaArea || 0), 2));
                });
                rowStateMutations.forEach((applyMutation) => applyMutation());
                rowBoothIds.forEach((boothId) => boothIdsToLock.add(boothId));
            }
        }

        const totalAmount = errors.length === 0
            ? roundTo(distributedBooths.reduce((sum, item) => sum + Number(item.total_amount || 0), 0), 2)
            : roundTo(Number(totalBoothFee || 0) + Number(totalOtherIncome || 0), 2);
        const boothIds = selectedBooths.map((item) => item.booth_id).filter(Boolean);
        if (warnings.length > 0) warningCount += 1;

        if (errors.length > 0) {
            errorCount += 1;
            preview.push(createPreviewRow({
                rowNumber,
                companyName,
                salesName,
                boothIds,
                totalAmount,
                status: normalizedStatus || safeTrim(rowObject.status) || '未识别',
                result: 'error',
                reason: errors.join('；'),
                warnings
            }));
            continue;
        }

        successCount += 1;
        preview.push(createPreviewRow({
            rowNumber,
            companyName,
            salesName,
            boothIds,
            totalAmount,
            status: normalizedStatus,
            result: warnings.length > 0 ? 'warning' : 'ok',
            reason: normalizedStatus === '正常' ? '可导入' : '可导入（历史状态订单）',
            warnings
        }));

        importRows.push({
            rowNumber,
            company_name: companyName,
            credit_code: safeTrim(rowObject.credit_code),
            no_code_checked: noCodeChecked,
            category: safeTrim(rowObject.category),
            main_business: safeTrim(rowObject.main_business),
            is_agent: isAgentOrder ? 1 : 0,
            agent_name: normalizedAgentName,
            contact_person: safeTrim(rowObject.contact_person),
            phone: safeTrim(rowObject.phone),
            region: safeTrim(rowObject.region),
            discount_reason: safeTrim(rowObject.discount_reason),
            profile: safeTrim(rowObject.profile),
            sales_name: salesName,
            contract_url: safeTrim(rowObject.contract_url) || null,
            status: normalizedStatus,
            created_at: createdAt,
            no_booth_order: noBoothOrder,
            display_payload: {
                company_name: companyName,
                booth_display_name: safeTrim(rowObject.booth_display_name),
                standard_booth_display_name: standardDisplayName,
                ground_booth_display_name: groundDisplayName
            },
            distributed_booths: distributedBooths
        });
    }

    return {
        project_id: normalizedProjectId,
        project_name: project.name,
        summary: {
            total_rows: rowObjects.length,
            success_count: successCount,
            error_count: errorCount,
            warning_count: warningCount,
            max_rows_per_import: MAX_IMPORT_ROWS
        },
        preview: preview.slice(0, PREVIEW_LIMIT),
        importRows,
        boothIdsToLock: Array.from(boothIdsToLock),
        dbAreaAdjustments
    };
}

export async function executeOrderImport(env, projectId, csvText) {
    const preliminaryPlan = await buildOrderImportPlan(env, projectId, csvText);
    if (preliminaryPlan.summary.error_count > 0) {
        return {
            success: false,
            summary: preliminaryPlan.summary,
            preview: preliminaryPlan.preview,
            message: '预检查未通过，请先修正错误行后再导入'
        };
    }

    let lockInfo = { lockToken: '', boothIds: [] };
    try {
        lockInfo = await acquireBoothLocks(env, Number(projectId), preliminaryPlan.boothIdsToLock, { ttlSeconds: 120 });
        if (!lockInfo.success) {
            return {
                success: false,
                summary: preliminaryPlan.summary,
                preview: preliminaryPlan.preview,
                message: `展位 ${lockInfo.conflictedBoothId} 正在被其他人操作，请稍后重试`
            };
        }

        const executionPlan = await buildOrderImportPlan(env, projectId, csvText);
        if (executionPlan.summary.error_count > 0) {
            return {
                success: false,
                summary: executionPlan.summary,
                preview: executionPlan.preview,
                message: '导入期间发现展位或数据状态已变化，请重新预检查后再导入'
            };
        }

        const statements = [];
        executionPlan.dbAreaAdjustments.forEach((deltaArea, orderId) => {
            statements.push(
                env.DB.prepare("UPDATE Orders SET area = ROUND(area - ?, 2) WHERE id = ? AND status = '正常'")
                    .bind(Number(deltaArea || 0), Number(orderId))
            );
        });

        executionPlan.importRows.forEach((row) => {
            row.distributed_booths.forEach((boothItem) => {
                statements.push(env.DB.prepare(`
                    INSERT INTO Orders (
                        project_id, company_name, credit_code, no_code_checked, category, main_business,
                        is_agent, agent_name, contact_person, phone, region, booth_id, area, price_unit, unit_price,
                        total_booth_fee, discount_reason, other_income, fees_json, profile, total_amount, paid_amount,
                        contract_url, booth_display_name, sales_name, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    Number(projectId),
                    row.company_name,
                    row.credit_code,
                    row.no_code_checked ? 1 : 0,
                    row.category,
                    row.main_business,
                    row.is_agent ? 1 : 0,
                    row.agent_name,
                    row.contact_person,
                    row.phone,
                    row.region,
                    boothItem.booth_id || '',
                    Number(boothItem.area || 0),
                    boothItem.price_unit,
                    Number(boothItem.unit_price || 0),
                    Number(boothItem.total_booth_fee || 0),
                    row.discount_reason,
                    Number(boothItem.other_income || 0),
                    boothItem.fees_json,
                    row.profile,
                    Number(boothItem.total_amount || 0),
                    Number(boothItem.paid_amount || 0),
                    row.contract_url,
                    resolveBoothDisplayName(boothItem.type, row.display_payload),
                    row.sales_name,
                    row.status,
                    row.created_at || getChinaTimestamp()
                ));
            });
        });

        await executeStatementsInChunks(env, statements);
        await syncBoothStatusByBoothIds(env, Number(projectId), executionPlan.boothIdsToLock);

        return {
            success: true,
            summary: {
                ...executionPlan.summary,
                imported_rows: executionPlan.importRows.length,
                created_orders: executionPlan.importRows.reduce((sum, item) => sum + item.distributed_booths.length, 0)
            },
            preview: executionPlan.preview
        };
    } finally {
        if (lockInfo.lockToken) {
            await releaseBoothLocks(env, Number(projectId), lockInfo.boothIds, lockInfo.lockToken);
        }
    }
}
