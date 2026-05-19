import assert from 'node:assert/strict';
import { buildOrderImportPlan, executeOrderImport } from '../src/services/order-import.mjs';

function createMockEnv(options = {}) {
    const captured = { prepareCalls: [], runCalls: [], batchCalls: [] };
    const {
        firstResponses = {},
        allResponses = {},
        runResponses = {},
        batchResponses
    } = options;

    function resolveResponse(responseMap, sql, params) {
        for (const [pattern, handler] of Object.entries(responseMap)) {
            if (sql.includes(pattern)) {
                return typeof handler === 'function' ? handler(sql, params) : handler;
            }
        }
        return undefined;
    }

    const DB = {
        prepare(query) {
            const sql = String(query || '');
            return {
                sql,
                params: [],
                bind(...params) {
                    this.params = params;
                    return this;
                },
                async first() {
                    captured.prepareCalls.push({ sql, params: [...this.params], type: 'first' });
                    const res = resolveResponse(firstResponses, sql, this.params);
                    return res !== undefined ? res : null;
                },
                async all() {
                    captured.prepareCalls.push({ sql, params: [...this.params], type: 'all' });
                    const res = resolveResponse(allResponses, sql, this.params);
                    return res !== undefined ? res : { results: [] };
                },
                async run() {
                    captured.runCalls.push({ sql, params: [...this.params] });
                    const res = resolveResponse(runResponses, sql, this.params);
                    return res !== undefined ? res : { meta: { changes: 1 } };
                }
            };
        },
        async batch(statements) {
            const mapped = statements.map((statement) => ({ sql: statement.sql, params: [...statement.params] }));
            captured.batchCalls.push(mapped);
            if (batchResponses) return batchResponses;
            return statements.map(() => ({ meta: { changes: 1 } }));
        }
    };

    return { DB, captured };
}

function createBaseEnv(options = {}) {
    return createMockEnv({
        firstResponses: {
            'SELECT id, name FROM Projects': { id: 7, name: '福州渔博会 2026' },
            ...(options.firstResponses || {})
        },
        allResponses: {
            'FROM ProjectOrderFieldSettings': { results: [] },
            'SELECT name FROM Staff': { results: [{ name: '张三' }, { name: '李四' }] },
            'SELECT id, hall, type, area, price_unit, base_price': { results: [{ id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000 }] },
            "FROM Orders\n            WHERE project_id = ?\n              AND booth_id IN": { results: [] },
            'SELECT id, status': { results: [{ id: '1A01', status: '可售' }] },
            "SELECT booth_id, paid_amount, total_amount\n            FROM Orders": { results: [{ booth_id: '1A01', paid_amount: 0, total_amount: 5000 }] },
            ...(options.allResponses || {})
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            ...(options.runResponses || {})
        },
        batchResponses: options.batchResponses
    });
}

async function testPlanRejectsMissingRequiredField() {
    const env = createBaseEnv();
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee',
        '张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,,水产预制菜,海鲜加工,企业简介,直招,1A01,海洋科技,9,个,5000,5000'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 1);
    assert.equal(plan.summary.success_count, 0);
    assert.match(plan.preview[0].reason, /所在地区不能为空/);
}

async function testPlanMapsSalespersonAndBoothSuccessfully() {
    const env = createBaseEnv();
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        '张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,海洋科技,9,个,5000,5000,2026-03-01 10:00:00'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 0);
    assert.equal(plan.summary.success_count, 1);
    assert.equal(plan.importRows[0].sales_name, '张三');
    assert.equal(plan.importRows[0].distributed_booths[0].booth_id, '1A01');
    assert.equal(plan.importRows[0].distributed_booths[0].total_amount, 5000);
}

async function testPlanAcceptsAnnotatedTemplateHeaders() {
    const env = createBaseEnv();
    const csvText = [
        'sales_name（业务员，必填，需与系统账号一致）,company_name（参展企业全称，必填）,credit_code（统一社会信用代码；勾无代码时可留空）,no_code_checked（无代码标记，填 1/0 或 是/否）,contact_person（联系人，是否必填跟随系统设置）,phone（联系电话，是否必填跟随系统设置）,region（所在地区，是否必填跟随系统设置）,category（产品分类，是否必填跟随系统设置）,main_business（主营业务/详细展品，是否必填跟随系统设置）,profile（企业简介或产品亮点，是否必填跟随系统设置，300字以内）,is_agent（招展渠道，填 直招/代理商招展 或 0/1）,booth_id（展位号；多展位可用英文逗号分隔）,booth_display_name（展位图简称，可留空）,area（面积，单位平方米）,price_unit（计价单位，如 个/平米）,unit_price（成交单价）,total_booth_fee（最终成交展位费，必填）,created_at（录入时间，格式 YYYY-MM-DD HH:mm:ss）',
        '张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,海洋科技,9,个,5000,5000,2026-03-01 10:00:00'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 0);
    assert.equal(plan.summary.success_count, 1);
    assert.equal(plan.importRows[0].company_name, '示例海洋科技');
}

async function testPlanAcceptsNewChineseProfileHeader() {
    const env = createBaseEnv();
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,企业简介或产品亮点,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        '张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,专注深海水产与冷链产品,直招,1A01,海洋科技,9,个,5000,5000,2026-03-01 10:00:00'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 0);
    assert.equal(plan.summary.success_count, 1);
    assert.equal(plan.importRows[0].profile, '专注深海水产与冷链产品');
}

async function testPlanAcceptsExternalCollectionHeaders() {
    const env = createBaseEnv();
    const csvText = [
        '业务员（订单归属，必须与系统账号一致）,参展企业全称,统一社会信用代码,是否无代码,联系人,联系电话,所在地区,产品分类,主营业务/详细展品,企业简介或产品亮点（300字以内）,招展渠道（直招/代理商招展）,代理商公司名称（代理商招展时填写）,展位号（多展位用逗号隔开）,是否联合参展,联合参展分配面积,展位图简称,最终成交展位费,其他应收合计,是否无展位订单,订单录入时间,优惠说明,合同附件地址',
        '张三,示例海洋科技,91350100MA12345678,否,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,专注深海水产与冷链产品,直招,,1A01,否,,海洋科技,5000,0,否,2026-03-01 10:00:00,,'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 0);
    assert.equal(plan.summary.success_count, 1);
    assert.equal(plan.importRows[0].company_name, '示例海洋科技');
    assert.equal(plan.importRows[0].distributed_booths[0].total_amount, 5000);
}

async function testPlanRejectsLongProfile() {
    const env = createBaseEnv();
    const longProfile = '亮'.repeat(301);
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        `张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,${longProfile},直招,1A01,海洋科技,9,个,5000,5000,2026-03-01 10:00:00`
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 1);
    assert.equal(plan.summary.success_count, 0);
    assert.match(plan.preview[0].reason, /企业简介或产品亮点不能超过 300 字/);
}

async function testExecuteOrderImportWritesOrders() {
    const env = createBaseEnv();
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        '张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,海洋科技,9,个,5000,5000,2026-03-01 10:00:00'
    ].join('\n');

    const result = await executeOrderImport(env, 7, csvText);
    assert.equal(result.success, true);
    assert.equal(result.summary.imported_rows, 1);
    assert.equal(result.summary.created_orders, 1);

    const batchStatements = env.captured.batchCalls.flat();
    const orderInsert = batchStatements.find((statement) => statement.sql.includes('INSERT INTO Orders'));
    assert.ok(orderInsert, 'should insert imported order');
    assert.equal(orderInsert.params[1], '示例海洋科技');
    assert.equal(orderInsert.params[24], '张三');

    const boothStatusUpdate = batchStatements.find((statement) => statement.sql.includes('UPDATE Booths SET status = ?'));
    assert.ok(boothStatusUpdate, 'should refresh booth runtime status after import');
  }

async function testPlanWarnsButAllowsExistingCompanyName() {
    const env = createBaseEnv({
        allResponses: {
            'SELECT company_name\n            FROM Orders': { results: [{ company_name: '示例海洋科技' }] }
        }
    });
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        '张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,海洋科技,9,个,5000,5000,2026-03-01 10:00:00'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 0);
    assert.equal(plan.summary.warning_count, 1);
    assert.equal(plan.preview[0].result, 'warning');
    assert.match(plan.preview[0].warnings.join('；'), /参展企业全称已存在/);
}

async function testPlanRejectsOccupiedBoothWithoutJointFlag() {
    const env = createBaseEnv({
        allResponses: {
            "FROM Orders\n            WHERE project_id = ?\n              AND booth_id IN": { results: [{ id: 42, booth_id: '1A01', area: 9, created_at: '2026-03-01 09:00:00' }] }
        }
    });
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        '张三,联合海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,联合海洋,3,个,5000,3000,2026-03-01 10:00:00'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 1);
    assert.match(plan.preview[0].reason, /如确认为联合参展/);
}

async function testPlanAcceptsOccupiedBoothWithJointFlag() {
    const env = createBaseEnv({
        allResponses: {
            "FROM Orders\n            WHERE project_id = ?\n              AND booth_id IN": { results: [{ id: 42, booth_id: '1A01', area: 9, created_at: '2026-03-01 09:00:00' }] }
        }
    });
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,is_joint,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        '张三,联合海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,是,联合海洋,3,个,5000,3000,2026-03-01 10:00:00'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 0);
    assert.equal(plan.summary.success_count, 1);
    assert.equal(plan.dbAreaAdjustments.get(42), 3);
}

async function testPlanAcceptsSameFileSharedBoothAreaSplit() {
    const env = createBaseEnv({
        allResponses: {
            'SELECT id, hall, type, area, price_unit, base_price': {
                results: [{ id: '3F27', hall: '3号馆', type: '光地', area: 216, price_unit: '平米', base_price: 1000 }]
            }
        }
    });
    const rows = ['sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,is_joint,booth_display_name,area,total_booth_fee,created_at'];
    for (let index = 1; index <= 20; index += 1) {
        rows.push([
            '张三',
            `3F27联合企业${index}`,
            `91350100MA12345${String(index).padStart(3, '0')}`,
            '0',
            `联系人${index}`,
            `1380000${String(index).padStart(4, '0')}`,
            '福建省 - 福州市 - 鼓楼区',
            '水产预制菜',
            '海鲜加工',
            '企业简介',
            '直招',
            '3F27',
            index === 1 ? '否' : '是',
            'F27',
            '10.8',
            '1000',
            '2026-03-01 10:00:00'
        ].join(','));
    }
    const plan = await buildOrderImportPlan(env, 7, rows.join('\n'));
    assert.equal(plan.summary.error_count, 0);
    assert.equal(plan.summary.success_count, 20);
    assert.equal(plan.importRows.length, 20);
    assert.equal(plan.importRows[0].distributed_booths[0].area, 10.8);
    assert.equal(plan.importRows[19].distributed_booths[0].area, 10.8);
    assert.equal(plan.dbAreaAdjustments.size, 0);
}

async function testPlanRejectsJointFlagForUnoccupiedBooth() {
    const env = createBaseEnv();
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,is_joint,booth_display_name,area,price_unit,unit_price,total_booth_fee,created_at',
        '张三,联合海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,是,联合海洋,3,个,5000,3000,2026-03-01 10:00:00'
    ].join('\n');

    const plan = await buildOrderImportPlan(env, 7, csvText);
    assert.equal(plan.summary.error_count, 1);
    assert.match(plan.preview[0].reason, /当前未被占用/);
}

async function testExecuteIgnoresPaidAmountWithWarning() {
    const env = createBaseEnv();
    const csvText = [
        'sales_name,company_name,credit_code,no_code_checked,contact_person,phone,region,category,main_business,profile,is_agent,booth_id,booth_display_name,area,price_unit,unit_price,total_booth_fee,paid_amount,created_at',
        '张三,示例海洋科技,91350100MA12345678,0,王经理,13800000001,福建省 - 福州市 - 鼓楼区,水产预制菜,海鲜加工,企业简介,直招,1A01,海洋科技,9,个,5000,5000,1000,2026-03-01 10:00:00'
    ].join('\n');

    const result = await executeOrderImport(env, 7, csvText);
    assert.equal(result.success, true);
    assert.equal(result.summary.warning_count, 1);

    const batchStatements = env.captured.batchCalls.flat();
    const orderInsert = batchStatements.find((statement) => statement.sql.includes('INSERT INTO Orders'));
    assert.ok(orderInsert, 'should insert imported order');
    assert.equal(orderInsert.params[21], 0);
}

await testPlanRejectsMissingRequiredField();
await testPlanMapsSalespersonAndBoothSuccessfully();
await testPlanAcceptsAnnotatedTemplateHeaders();
await testPlanAcceptsNewChineseProfileHeader();
await testPlanAcceptsExternalCollectionHeaders();
await testPlanRejectsLongProfile();
await testExecuteOrderImportWritesOrders();
await testPlanWarnsButAllowsExistingCompanyName();
await testPlanRejectsOccupiedBoothWithoutJointFlag();
await testPlanAcceptsOccupiedBoothWithJointFlag();
await testPlanAcceptsSameFileSharedBoothAreaSplit();
await testPlanRejectsJointFlagForUnoccupiedBooth();
await testExecuteIgnoresPaidAmountWithWarning();

console.log('order-import tests passed');
