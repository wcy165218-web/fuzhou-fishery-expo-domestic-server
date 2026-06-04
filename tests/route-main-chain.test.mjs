import assert from 'node:assert/strict';
import { handleOrderRoutes } from '../src/routes/orders.mjs';
import { handlePaymentRoutes } from '../src/routes/payments.mjs';

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function createMockEnv(options = {}) {
    const captured = { prepareCalls: [], batchCalls: [], runCalls: [] };
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
            const mapped = statements.map((s) => ({ sql: s.sql, params: [...s.params] }));
            captured.batchCalls.push(mapped);
            if (batchResponses) return batchResponses;
            return statements.map(() => ({ meta: { changes: 1 } }));
        }
    };

    return { captured, DB };
}

function jsonRequest(url, body) {
    return new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

function getRequest(url) {
    return new Request(url, { method: 'GET' });
}

const CORS = { 'Content-Type': 'application/json' };
const ADMIN = { role: 'admin', name: 'admin' };
const MANAGER = { role: 'admin', name: 'manager01' };
const SALES = { role: 'sales', name: '张三' };

// ---------------------------------------------------------------------------
// submit-order tests
// ---------------------------------------------------------------------------

async function testSubmitOrderSuccess() {
    const db = createMockEnv({
        firstResponses: {
            'COUNT(*) AS total': { total: 0 },
            'SELECT name FROM Staff WHERE name = ?': { name: '张三' }
        },
        allResponses: {
            'FROM Orders': { results: [] },
            'FROM Booths': { results: [] }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/submit-order', {
        project_id: 7,
        company_name: '测试海洋科技',
        credit_code: '91350100MA12345678',
        category: '水产预制菜',
        main_business: '海鲜加工',
        contact_person: '王先生',
        phone: '13800000001',
        region: '福建省 - 福州市 - 鼓楼区',
        sales_name: '张三',
        total_booth_fee: 5000,
        selected_booths: [
            { booth_id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', unit_price: 5000, standard_fee: 5000 }
        ],
        standard_booth_display_name: '测试海洋',
        fees_json: '[]'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.created_count, 1);
    const insertCalls = db.captured.batchCalls.flat().filter((c) => c.sql.includes('INSERT INTO Orders'));
    assert.ok(insertCalls.length >= 1, 'should have at least 1 order INSERT');
    assert.ok(
        insertCalls.every((call) => call.params.every((value) => value !== undefined)),
        'should not bind undefined values into D1'
    );
    assert.equal(insertCalls[0].params[11], '1A01');
}

async function testSubmitOrderSuperAdminCanAssignDifferentSalesOwner() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT name FROM Staff WHERE name = ?': { name: '李四' },
            'SELECT main_business, profile': {
                main_business: '海鲜',
                profile: '企业简介',
                exhibitor_info_status: 'exhibitor_confirmed'
            }
        },
        allResponses: {
            'FROM Orders': { results: [] },
            'FROM Booths': { results: [] }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/submit-order', {
        project_id: 7,
        company_name: '测试海洋科技',
        credit_code: '91350100MA12345678',
        category: '水产预制菜',
        main_business: '海鲜加工',
        contact_person: '王先生',
        phone: '13800000001',
        region: '福建省 - 福州市 - 鼓楼区',
        sales_name: '李四',
        total_booth_fee: 5000,
        selected_booths: [
            { booth_id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', unit_price: 5000, standard_fee: 5000 }
        ],
        standard_booth_display_name: '测试海洋',
        fees_json: '[]'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const insertCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('INSERT INTO Orders'));
    assert.equal(insertCall.params[24], '李四');
}

async function testSubmitOrderRejectsLongProfile() {
    const db = createMockEnv();
    const req = jsonRequest('http://localhost/api/submit-order', {
        project_id: 7,
        company_name: '测试海洋科技',
        credit_code: '91350100MA12345678',
        category: '水产预制菜',
        main_business: '海鲜加工',
        profile: '亮'.repeat(301),
        contact_person: '王先生',
        phone: '13800000001',
        region: '福建省 - 福州市 - 鼓楼区',
        sales_name: '张三',
        total_booth_fee: 5000,
        selected_booths: [
            { booth_id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', unit_price: 5000, standard_fee: 5000 }
        ],
        standard_booth_display_name: '测试海洋',
        fees_json: '[]'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /企业简介或产品亮点不能超过 300 字/);
    assert.equal(db.captured.batchCalls.length, 0);
}

async function testSubmitOrderNonSuperAdminCannotReassignSalesOwner() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT name FROM Staff WHERE name = ?': { name: 'manager01' }
        },
        allResponses: {
            'FROM Orders': { results: [] },
            'FROM Booths': { results: [] }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/submit-order', {
        project_id: 7,
        company_name: '测试海洋科技',
        credit_code: '91350100MA12345678',
        category: '水产预制菜',
        main_business: '海鲜加工',
        contact_person: '王先生',
        phone: '13800000001',
        region: '福建省 - 福州市 - 鼓楼区',
        sales_name: '李四',
        total_booth_fee: 5000,
        selected_booths: [
            { booth_id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', unit_price: 5000, standard_fee: 5000 }
        ],
        standard_booth_display_name: '测试海洋',
        fees_json: '[]'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: MANAGER, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const insertCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('INSERT INTO Orders'));
    assert.equal(insertCall.params[24], 'manager01');
}

async function testSubmitOrderExceedMaxBooths() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT name FROM Staff WHERE name = ?': { name: '张三' }
        }
    });
    const booths = Array.from({ length: 21 }, (_, i) => ({
        booth_id: `1A${String(i + 1).padStart(2, '0')}`,
        hall: '1号馆',
        type: '标摊',
        area: 9,
        price_unit: '个',
        unit_price: 5000,
        standard_fee: 5000
    }));
    const req = jsonRequest('http://localhost/api/submit-order', {
        project_id: 7,
        company_name: '测试公司',
        credit_code: '91350100MA12345678',
        category: '水产',
        main_business: '加工',
        contact_person: '王先生',
        phone: '13800000001',
        region: '福建省',
        sales_name: '张三',
        total_booth_fee: 100000,
        selected_booths: booths,
        standard_booth_display_name: '测试公司',
        fees_json: '[]'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.ok(body.error, 'should return error for >20 booths');
    assert.equal(res.status, 400);
}

async function testSubmitOrderBoothLockConflict() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT name FROM Staff WHERE name = ?': { name: '张三' }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 0 } },
            'INSERT INTO BoothLocks': { meta: { changes: 0 } }
        }
    });
    const req = jsonRequest('http://localhost/api/submit-order', {
        project_id: 7,
        company_name: '测试公司',
        credit_code: '91350100MA12345678',
        category: '水产',
        main_business: '加工',
        contact_person: '王先生',
        phone: '13800000001',
        region: '福建省',
        sales_name: '张三',
        total_booth_fee: 5000,
        selected_booths: [
            { booth_id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', unit_price: 5000, standard_fee: 5000 }
        ],
        standard_booth_display_name: '测试公司',
        fees_json: '[]'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 409);
}

async function testSubmitOrderBoothOccupied() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT name FROM Staff WHERE name = ?': { name: '张三' }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes("status = '正常'")) {
                    return { results: [{ id: 99, booth_id: '1A01', area: 9, created_at: '2026-04-01' }] };
                }
                return { results: [] };
            },
            'FROM Booths': { results: [] }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/submit-order', {
        project_id: 7,
        company_name: '测试公司',
        credit_code: '91350100MA12345678',
        category: '水产',
        main_business: '加工',
        contact_person: '王先生',
        phone: '13800000001',
        region: '福建省',
        sales_name: '张三',
        total_booth_fee: 5000,
        selected_booths: [
            { booth_id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', unit_price: 5000, standard_fee: 5000, is_joint: 0 }
        ],
        standard_booth_display_name: '测试公司',
        fees_json: '[]'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(body.error.includes('已被占用'));
}

async function testSuperAdminCanUpdateOrderSalesOwner() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT name FROM Staff WHERE name = ?': { name: '李四' },
            'SELECT main_business, profile': {
                main_business: '海鲜',
                profile: '企业简介',
                exhibitor_info_status: 'exhibitor_confirmed'
            }
        },
        runResponses: {
            'UPDATE Orders SET region = ?': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/update-customer-info', {
        project_id: 7,
        order_id: 101,
        region: '福建省 - 福州市 - 鼓楼区',
        category: '水产',
        main_business: '海鲜',
        profile: '企业简介',
        is_agent: false,
        agent_name: '',
        sales_name: '李四'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const updateCall = db.captured.runCalls.find((call) => call.sql.includes('UPDATE Orders SET region = ?'));
    assert.ok(updateCall.params.includes('李四'));
}

async function testUpdateCustomerInfoRejectsLongProfile() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT main_business, profile': {
                main_business: '海鲜',
                profile: '原简介',
                exhibitor_info_status: 'sales_default'
            }
        }
    });
    const req = jsonRequest('http://localhost/api/update-customer-info', {
        project_id: 7,
        order_id: 101,
        region: '福建省 - 福州市 - 鼓楼区',
        category: '水产',
        main_business: '海鲜',
        profile: '亮'.repeat(301),
        is_agent: false,
        agent_name: ''
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /企业简介或产品亮点不能超过 300 字/);
    assert.equal(db.captured.runCalls.length, 0);
}

async function testNonSuperAdminCannotUpdateOrderSalesOwner() {
    const db = createMockEnv();
    const req = jsonRequest('http://localhost/api/update-customer-info', {
        project_id: 7,
        order_id: 101,
        region: '福建省 - 福州市 - 鼓楼区',
        category: '水产',
        main_business: '海鲜',
        profile: '企业简介',
        is_agent: false,
        agent_name: '',
        sales_name: '李四'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: MANAGER, corsHeaders: CORS });
    assert.equal(res.status, 403);
}

// ---------------------------------------------------------------------------
// add-payment tests
// ---------------------------------------------------------------------------

async function testGetPaymentsPaginationClampsPage() {
    const db = createMockEnv({
        firstResponses: {
            'COUNT(*) AS total': { total: 3 }
        },
        allResponses: {
            'FROM Payments': {
                results: [
                    {
                        id: 203,
                        project_id: 7,
                        order_id: 101,
                        amount: 800,
                        payment_time: '2026-04-09',
                        payer_name: '王先生',
                        bank_name: '中国银行',
                        remarks: '尾款',
                        source: 'MANUAL',
                        raw_payload: ''
                    }
                ]
            }
        }
    });
    const req = new Request('http://localhost/api/payments?orderId=101&page=5&pageSize=2');
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.total, 3);
    assert.equal(body.page, 2);
    assert.equal(body.pageSize, 2);
    assert.equal(body.totalPages, 2);
    assert.equal(body.hasMore, false);
    assert.equal(body.items.length, 1);
    const listCall = db.captured.prepareCalls.find((call) => call.type === 'all' && call.sql.includes('FROM Payments'));
    assert.deepEqual(listCall?.params, [101, 2, 2]);
}

async function testAddPaymentSuccess() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: '张三' },
            'SELECT project_id, status': { project_id: 7, status: '正常' },
            'SELECT total_amount, paid_amount': { total_amount: 5000, paid_amount: 1000 },
            'SELECT booth_id, total_amount, paid_amount': { booth_id: '1A01', total_amount: 5000, paid_amount: 2000 },
            'SELECT id, project_id': { id: 7, project_id: 7 }
        },
        runResponses: {
            'UPDATE Orders': { meta: { changes: 1 } },
            'INSERT INTO Payments': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } },
            'UPDATE OrderOverpaymentIssues': { meta: { changes: 1 } }
        },
        allResponses: {
            'FROM Booths': { results: [{ id: '1A01', status: '可售' }] },
            'FROM Orders': { results: [{ booth_id: '1A01', paid_amount: 2000, total_amount: 5000 }] }
        }
    });
    const req = jsonRequest('http://localhost/api/add-payment', {
        order_id: 101,
        amount: 1000,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: '定金'
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const insertCalls = db.captured.runCalls.filter((c) => c.sql.includes('INSERT INTO Payments'));
    assert.equal(insertCalls.length, 1, 'should have exactly 1 payment INSERT');
}

async function testAddPaymentWouldOverpay() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: '张三' },
            'SELECT project_id, status': { project_id: 7, status: '正常' },
            'SELECT total_amount, paid_amount FROM Orders': { total_amount: 1000, paid_amount: 900 }
        },
        runResponses: {
            'UPDATE Orders': { meta: { changes: 0 } }
        }
    });
    const req = jsonRequest('http://localhost/api/add-payment', {
        order_id: 101,
        amount: 500,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: ''
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('超过'));
}

async function testAddPaymentPermissionDenied() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: '李四' }
        }
    });
    const req = jsonRequest('http://localhost/api/add-payment', {
        order_id: 101,
        amount: 1000,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: ''
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
    assert.equal(res.status, 403);
}

async function testAddPaymentCancelledOrder() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT project_id, status': { project_id: 7, status: '已退订' }
        }
    });
    const req = jsonRequest('http://localhost/api/add-payment', {
        order_id: 101,
        amount: 1000,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: ''
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('非成交'));
}

async function testAddPaymentInvalidAmount() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'manager01' }
        }
    });
    const req = jsonRequest('http://localhost/api/add-payment', {
        order_id: 101,
        amount: -100,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: ''
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('金额'));
}

// ---------------------------------------------------------------------------
// edit-payment tests
// ---------------------------------------------------------------------------

async function testEditPaymentSuccess() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql, params) => {
                if (sql.includes('p.id') && sql.includes('p.project_id')) {
                    return { id: 201, project_id: 7, order_id: 101, amount: 1000, payment_time: '2026-04-01', payer_name: '王先生', bank_name: '中国银行', remarks: '', source: 'MANUAL', deleted_at: null };
                }
                if (sql.includes('SELECT sales_name FROM Orders')) return { sales_name: 'admin' };
                if (sql.includes('total_amount, paid_amount')) return { total_amount: 5000, paid_amount: 1000 };
                if (sql.includes('project_id, total_amount, paid_amount')) return { project_id: 7, total_amount: 5000, paid_amount: 1500 };
                if (sql.includes('booth_id, total_amount, paid_amount')) return { booth_id: '1A01', total_amount: 5000, paid_amount: 1500 };
                return null;
            }
        },
        runResponses: {
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Payments': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        },
        allResponses: {
            'FROM Booths': { results: [{ id: '1A01', status: '可售' }] },
            'FROM Orders': { results: [{ booth_id: '1A01', paid_amount: 1500, total_amount: 5000 }] }
        }
    });
    const req = jsonRequest('http://localhost/api/edit-payment', {
        payment_id: 201,
        amount: 1500,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: '修改金额'
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
}

async function testEditPaymentErpSyncRejection() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql) => {
                if (sql.includes('p.id') && sql.includes('p.project_id')) {
                    return { id: 201, project_id: 7, order_id: 101, amount: 1000, source: 'ERP_SYNC', deleted_at: null };
                }
                return null;
            }
        }
    });
    const req = jsonRequest('http://localhost/api/edit-payment', {
        payment_id: 201,
        amount: 1500,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: ''
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('ERP'));
}

async function testEditPaymentConcurrentConflict() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql) => {
                if (sql.includes('p.id') && sql.includes('p.project_id')) {
                    return { id: 201, project_id: 7, order_id: 101, amount: 1000, source: 'MANUAL', deleted_at: null };
                }
                if (sql.includes('SELECT sales_name FROM Orders')) return { sales_name: 'admin' };
                if (sql.includes('total_amount, paid_amount')) return { total_amount: 5000, paid_amount: 2000 };
                return null;
            }
        },
        runResponses: {
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Payments': { meta: { changes: 0 } }
        }
    });
    const req = jsonRequest('http://localhost/api/edit-payment', {
        payment_id: 201,
        amount: 1500,
        payment_time: '2026-04-09',
        payer_name: '王先生',
        bank_name: '中国银行',
        remarks: ''
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(body.error.includes('已变更'));
}

// ---------------------------------------------------------------------------
// delete-payment tests
// ---------------------------------------------------------------------------

async function testDeletePaymentSuccess() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql) => {
                if (sql.includes('p.id') && sql.includes('p.project_id')) {
                    return { id: 201, project_id: 7, order_id: 101, amount: 1000, source: 'MANUAL', deleted_at: null };
                }
                if (sql.includes('SELECT sales_name FROM Orders')) return { sales_name: 'admin' };
                if (sql.includes('project_id, total_amount, paid_amount')) return { project_id: 7, total_amount: 5000, paid_amount: 0 };
                if (sql.includes('booth_id, total_amount, paid_amount')) return { booth_id: '1A01', total_amount: 5000, paid_amount: 0 };
                return null;
            }
        },
        runResponses: {
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Payments': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        },
        allResponses: {
            'FROM Booths': { results: [{ id: '1A01', status: '已预定' }] },
            'FROM Orders': { results: [] }
        }
    });
    const req = jsonRequest('http://localhost/api/delete-payment', { payment_id: 201 });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const softDeleteCalls = db.captured.runCalls.filter((c) => c.sql.includes('UPDATE Payments') && c.sql.includes('deleted_at'));
    assert.ok(softDeleteCalls.length >= 1, 'should soft-delete payment');
}

async function testDeletePaymentErpSyncRejection() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql) => {
                if (sql.includes('p.id') && sql.includes('p.project_id')) {
                    return { id: 201, project_id: 7, order_id: 101, amount: 1000, source: 'ERP_SYNC', deleted_at: null };
                }
                return null;
            }
        }
    });
    const req = jsonRequest('http://localhost/api/delete-payment', { payment_id: 201 });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('ERP'));
}

async function testDeletePaymentPermissionDenied() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql) => {
                if (sql.includes('p.id') && sql.includes('p.project_id')) {
                    return { id: 201, project_id: 7, order_id: 101, amount: 1000, source: 'MANUAL', deleted_at: null };
                }
                if (sql.includes('SELECT sales_name FROM Orders')) return { sales_name: '李四' };
                return null;
            }
        }
    });
    const req = jsonRequest('http://localhost/api/delete-payment', { payment_id: 201 });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
    assert.equal(res.status, 403);
}

// ---------------------------------------------------------------------------
// change-order-booth tests
// ---------------------------------------------------------------------------

async function testChangeOrderBoothSuccess() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql, params) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return { id: 101, project_id: 7, booth_id: '1A01', area: 9, total_booth_fee: 5000, other_income: 0, total_amount: 5000, paid_amount: 1000, fees_json: '[]', booth_display_name: '测试海产', company_name: '福建测试海产有限公司', sales_name: '张三', status: '正常' };
                }
                if (sql.includes('SELECT price')) return { price: 5000 };
                if (sql.includes('SELECT sales_name')) return { sales_name: 'admin' };
                if (sql.includes('booth_id, total_amount, paid_amount')) return { booth_id: '1A02', total_amount: 5000, paid_amount: 1000 };
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes("status = '正常'")) return { results: [] };
                return { results: [{ booth_id: '1A02', paid_amount: 1000, total_amount: 5000 }] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' },
                    { id: '1A02', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A02',
        swap_reason: '客户要求',
        actual_fee: 5000
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
}

async function testChangeOrderBoothSyncsSystemRefrigeratorRentalBoothNumbers() {
    let systemSnapshotReadCount = 0;
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1A01',
                        area: 9,
                        total_booth_fee: 5000,
                        other_income: 0,
                        total_amount: 5000,
                        paid_amount: 1000,
                        fees_json: '[]',
                        booth_display_name: '测试海产',
                        company_name: '福建测试海产有限公司',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                if (sql.includes('SELECT price')) return { price: 5000 };
                if (sql.includes('booth_id, total_amount, paid_amount')) return { booth_id: '1A02', total_amount: 5000, paid_amount: 1000 };
                return null;
            }
        },
        allResponses: {
            'SELECT booth_id\n      FROM Orders': () => {
                systemSnapshotReadCount += 1;
                return {
                    results: [{
                        booth_id: systemSnapshotReadCount === 1 ? '1A01' : '1A02',
                        created_at: '2026-04-01'
                    }]
                };
            },
            'FROM ExhibitionRefrigeratorRentals': {
                results: [{
                    id: 501,
                    project_id: 7,
                    company_name: '福建测试海产有限公司',
                    hall_names: '1号馆',
                    booth_numbers: '1A01',
                    rental_mode: 'booth'
                }]
            },
            'FROM Orders': (sql) => {
                if (sql.includes("status = '正常'")) return { results: [] };
                return { results: [{ booth_id: '1A02', paid_amount: 1000, total_amount: 5000 }] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' },
                    { id: '1A02', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } },
            'UPDATE ExhibitionRefrigeratorRentals': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A02',
        swap_reason: '客户要求',
        actual_fee: 5000
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const rentalSyncCall = db.captured.runCalls.find((call) => call.sql.includes('UPDATE ExhibitionRefrigeratorRentals'));
    assert.ok(rentalSyncCall, 'should sync system-derived refrigerator rental booth snapshot');
    assert.equal(rentalSyncCall.params[0], '1号馆');
    assert.equal(rentalSyncCall.params[1], '1A02');
    assert.equal(rentalSyncCall.params[3], 501);
    assert.equal(rentalSyncCall.params[4], 7);
}

async function testChangeOrderBoothTargetOccupied() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return { id: 101, project_id: 7, booth_id: '1A01', area: 9, total_booth_fee: 5000, other_income: 0, total_amount: 5000, paid_amount: 0, fees_json: '[]', sales_name: '张三', status: '正常' };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes("status = '正常'")) {
                    return { results: [{ id: 200, booth_id: '1A02', area: 9, created_at: '2026-04-01' }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A02', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A02',
        swap_reason: '客户要求',
        actual_fee: 5000
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.ok(body.error.includes('已被占用'));
}

async function testChangeOrderBoothAllowsJointOccupiedTarget() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1A01',
                        area: 9,
                        total_booth_fee: 5000,
                        other_income: 0,
                        total_amount: 5000,
                        paid_amount: 0,
                        fees_json: '[]',
                        booth_display_name: '测试海产',
                        company_name: '福建测试海产有限公司',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes("status = '正常'")) {
                    return { results: [{ id: 200, booth_id: '1A02', area: 9, created_at: '2026-04-01' }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A02', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booths: [{ booth_id: '1A02', area: 3, is_joint: 1 }],
        swap_reason: '客户要求',
        actual_fee: 1666.67,
        price_reason: '联合参展分摊'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const batchCalls = db.captured.batchCalls.flat();
    const areaAdjustmentCall = batchCalls.find((call) => call.sql.includes('UPDATE Orders SET area = ROUND(area - ?'));
    const orderUpdateCall = batchCalls.find((call) => call.sql.includes('UPDATE Orders') && call.sql.includes('SET booth_id = ?'));
    assert.ok(areaAdjustmentCall, 'should reduce the existing occupant area for joint swap');
    assert.deepEqual(areaAdjustmentCall.params, [3, 200]);
    assert.ok(orderUpdateCall, 'should update the swapping order');
    assert.equal(orderUpdateCall.params[0], '1A02');
    assert.equal(orderUpdateCall.params[1], 3);
}

async function testChangeOrderBoothRejectsJointAreaBeyondRemaining() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1A01',
                        area: 9,
                        total_booth_fee: 5000,
                        other_income: 0,
                        total_amount: 5000,
                        paid_amount: 0,
                        fees_json: '[]',
                        booth_display_name: '测试海产',
                        company_name: '福建测试海产有限公司',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes("status = '正常'")) {
                    return { results: [{ id: 200, booth_id: '1G01', area: 10, created_at: '2026-04-01' }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1G01', hall: '1号馆', type: '光地', area: 180, price_unit: '平米', base_price: 680, status: '已预定' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booths: [{ booth_id: '1G01', area: 20, is_joint: 1 }],
        swap_reason: '客户要求',
        actual_fee: 0,
        price_reason: '联合参展分摊'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.error.includes('最多可分配 10㎡'));
    const areaAdjustmentCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('UPDATE Orders SET area = ROUND(area - ?'));
    assert.equal(areaAdjustmentCall, undefined);
}

async function testChangeOrderBoothMissingReason() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'manager01' }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A02',
        swap_reason: '',
        actual_fee: 5000
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: MANAGER, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('原因'));
}

async function testChangeOrderBoothPreserveFinanceForSuperAdmin() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1A01, 1A03',
                        area: 18,
                        total_booth_fee: 9000,
                        other_income: 500,
                        total_amount: 9500,
                        paid_amount: 9800,
                        fees_json: '[{"name":"广告费","amount":500}]',
                        booth_display_name: '测试海产',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes('SELECT id, booth_id, area, created_at')) {
                    return { results: [{ id: 101, booth_id: '1A01, 1A03', area: 18, created_at: '2026-04-01' }] };
                }
                if (sql.includes('SELECT booth_id, paid_amount, total_amount')) {
                    return { results: [{ booth_id: '1A02, 1A03', paid_amount: 9800, total_amount: 9500 }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' },
                    { id: '1A02', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' },
                    { id: '1A03', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A02, 1A03',
        swap_reason: '',
        preserve_finance: 1
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.old_booth_ids, ['1A01', '1A03']);
    assert.deepEqual(body.new_booth_ids, ['1A02', '1A03']);

    const orderUpdateCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('UPDATE Orders'));
    assert.ok(orderUpdateCall, 'should update order when preserve_finance is enabled');
    assert.equal(orderUpdateCall.params[0], '1A02, 1A03');
    assert.equal(orderUpdateCall.params[4], 9000);
    assert.equal(orderUpdateCall.params[5], 500);
    assert.equal(orderUpdateCall.params[8], 9500);
    assert.equal(orderUpdateCall.params[9], '测试海产');

    const boothSyncCalls = db.captured.batchCalls.flat().filter((call) => call.sql.includes('UPDATE Booths SET status = ?'));
    const syncedBoothIds = boothSyncCalls.map((call) => call.params[1]).sort();
    assert.deepEqual(syncedBoothIds, ['1A01', '1A02', '1A03']);
}

async function testChangeOrderBoothInheritsDisplayNameWhenStandardChangesToGround() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1A01',
                        area: 9,
                        total_booth_fee: 9000,
                        other_income: 0,
                        total_amount: 9000,
                        paid_amount: 9000,
                        fees_json: '[]',
                        booth_display_name: '测试海产',
                        company_name: '福建测试海产有限公司',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes('SELECT id, booth_id, area, created_at')) {
                    return { results: [{ id: 101, booth_id: '1A01', area: 9, created_at: '2026-04-01' }] };
                }
                if (sql.includes('SELECT booth_id, paid_amount, total_amount')) {
                    return { results: [{ booth_id: '1G01', paid_amount: 9000, total_amount: 9000 }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1G01', hall: '1号馆', type: '光地', area: 18, price_unit: '平米', base_price: 500, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1G01',
        swap_reason: '',
        preserve_finance: 1
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const orderUpdateCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('UPDATE Orders'));
    assert.ok(orderUpdateCall, 'should update order when changing standard booth to ground');
    assert.equal(orderUpdateCall.params[9], '测试海产');
}

async function testChangeOrderBoothRequiresNewDisplayNameWhenInheritanceFails() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1G01',
                        area: 18,
                        total_booth_fee: 9000,
                        other_income: 0,
                        total_amount: 9000,
                        paid_amount: 9000,
                        fees_json: '[]',
                        booth_display_name: '这是一个很长的光地显示名称',
                        company_name: '福建测试海产有限公司',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes('SELECT id, booth_id, area, created_at')) {
                    return { results: [{ id: 101, booth_id: '1G01', area: 18, created_at: '2026-04-01' }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A01',
        swap_reason: '',
        preserve_finance: 1
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.error.includes('无法继承'));
    assert.ok(body.error.includes('新的展位简称'));
    const orderUpdateCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('UPDATE Orders'));
    assert.equal(orderUpdateCall, undefined);
}

async function testChangeOrderBoothRequiresNewDisplayNameForSalesUser() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: '张三' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1G01',
                        area: 18,
                        total_booth_fee: 9000,
                        other_income: 0,
                        total_amount: 9000,
                        paid_amount: 0,
                        fees_json: '[]',
                        booth_display_name: '这是一个很长的光地显示名称',
                        company_name: '福建测试海产有限公司',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes('SELECT id, booth_id, area, created_at')) {
                    return { results: [{ id: 101, booth_id: '1G01', area: 18, created_at: '2026-04-01' }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A01',
        swap_reason: '客户要求更换',
        actual_fee: 5000
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.error.includes('无法继承'));
    assert.ok(body.error.includes('新的展位简称'));
}

async function testChangeOrderBoothUsesExplicitDisplayNameWhenInheritanceFails() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'admin' },
            'SELECT': (sql) => {
                if (sql.includes('FROM Orders') && sql.includes('WHERE id = ? AND project_id = ?')) {
                    return {
                        id: 101,
                        project_id: 7,
                        booth_id: '1G01',
                        area: 18,
                        total_booth_fee: 9000,
                        other_income: 0,
                        total_amount: 9000,
                        paid_amount: 9000,
                        fees_json: '[]',
                        booth_display_name: '这是一个很长的光地显示名称',
                        company_name: '福建测试海产有限公司',
                        sales_name: '张三',
                        status: '正常'
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes('SELECT id, booth_id, area, created_at')) {
                    return { results: [{ id: 101, booth_id: '1G01', area: 18, created_at: '2026-04-01' }] };
                }
                if (sql.includes('SELECT booth_id, paid_amount, total_amount')) {
                    return { results: [{ booth_id: '1A01', paid_amount: 9000, total_amount: 9000 }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A01',
        swap_reason: '',
        preserve_finance: 1,
        standard_booth_display_name: '新简称'
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const orderUpdateCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('UPDATE Orders'));
    assert.ok(orderUpdateCall, 'should update order when a new display name is provided');
    assert.equal(orderUpdateCall.params[9], '新简称');
}

async function testChangeOrderBoothPreserveFinanceRequiresSuperAdmin() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: 'manager01' }
        }
    });
    const req = jsonRequest('http://localhost/api/change-order-booth', {
        order_id: 101,
        project_id: 7,
        target_booth_id: '1A02',
        swap_reason: '馆位整体调整',
        preserve_finance: 1
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: MANAGER, corsHeaders: CORS });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.ok(body.error.includes('仅超级管理员'));
}

// ---------------------------------------------------------------------------
// order booth change history tests
// ---------------------------------------------------------------------------

async function testGetOrderBoothChangesAdminCanReadAnyOrder() {
    const db = createMockEnv({
        firstResponses: {
            'FROM Orders': { id: 101 }
        },
        allResponses: {
            'FROM OrderBoothChanges': {
                results: [
                    {
                        id: 5,
                        project_id: 7,
                        order_id: 101,
                        old_booth_id: '1A01',
                        new_booth_id: '1A02',
                        old_area: 9,
                        new_area: 18,
                        booth_delta_count: 1,
                        old_total_amount: 5000,
                        new_total_amount: 9000,
                        total_amount_delta: 4000,
                        changed_by: 'manager01',
                        reason: '换展位：客户要求；价格说明：老客户优惠',
                        changed_at: '2026-05-15 10:00:00'
                    }
                ]
            }
        }
    });
    const req = getRequest('http://localhost/api/order-booth-changes?projectId=7&orderId=101');
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: MANAGER, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.items[0].reason, '换展位：客户要求；价格说明：老客户优惠');
    assert.equal(body.items[0].old_booth_id, '1A01');
    assert.equal(body.items[0].new_booth_id, '1A02');
    assert.equal(body.items[0].total_amount_delta, 4000);
    const historyCall = db.captured.prepareCalls.find((call) => call.type === 'all' && call.sql.includes('FROM OrderBoothChanges'));
    assert.ok(historyCall);
    assert.deepEqual(historyCall.params, [7, 101]);
    assert.match(historyCall.sql, /ORDER BY datetime\(changed_at\) DESC, id DESC/);
    assert.match(historyCall.sql, /LIMIT 100/);
}

async function testGetOrderBoothChangesSalesCanReadOwnOrder() {
    const db = createMockEnv({
        firstResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes('WHERE id = ? AND project_id = ?')) return { id: 101 };
                if (sql.includes('SELECT sales_name')) return { sales_name: '张三' };
                return null;
            }
        },
        allResponses: {
            'FROM OrderBoothChanges': {
                results: [
                    {
                        id: 6,
                        project_id: 7,
                        order_id: 101,
                        old_booth_id: '1A02',
                        new_booth_id: '1A03',
                        old_area: 18,
                        new_area: 9,
                        booth_delta_count: -1,
                        old_total_amount: 9000,
                        new_total_amount: 5000,
                        total_amount_delta: -4000,
                        changed_by: '张三',
                        reason: '换展位：客户缩减面积',
                        changed_at: '2026-05-16 09:00:00'
                    }
                ]
            }
        }
    });
    const req = getRequest('http://localhost/api/order-booth-changes?projectId=7&orderId=101');
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].reason, '换展位：客户缩减面积');
}

async function testGetOrderBoothChangesSalesCannotReadOtherOrder() {
    const db = createMockEnv({
        firstResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes('WHERE id = ? AND project_id = ?')) return { id: 101 };
                if (sql.includes('SELECT sales_name')) return { sales_name: '李四' };
                return null;
            }
        }
    });
    const req = getRequest('http://localhost/api/order-booth-changes?projectId=7&orderId=101');
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.ok(body.error.includes('权限不足'));
    assert.equal(db.captured.prepareCalls.some((call) => call.type === 'all' && call.sql.includes('FROM OrderBoothChanges')), false);
}

async function testGetOrderBoothChangesMissingOrder() {
    const db = createMockEnv({
        firstResponses: {
            'FROM Orders': null
        }
    });
    const req = getRequest('http://localhost/api/order-booth-changes?projectId=7&orderId=404');
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: MANAGER, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.ok(body.error.includes('订单不存在'));
}

// ---------------------------------------------------------------------------
// pending-order handling tests
// ---------------------------------------------------------------------------

async function testDeletePendingOrderWithPaymentsAllowedForSuperAdmin() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT id, status': { id: 101, status: '待确认' },
            'COUNT(*) AS payment_count': { payment_count: 1, paid_amount: 1000 }
        },
        runResponses: {
            'DELETE FROM Payments': { meta: { changes: 1 } },
            'DELETE FROM Expenses': { meta: { changes: 0 } },
            'DELETE FROM OrderOverpaymentIssues': { meta: { changes: 0 } },
            'DELETE FROM OrderBoothChanges': { meta: { changes: 0 } },
            'DELETE FROM Orders': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/delete-pending-order', {
        project_id: 7,
        order_id: 101
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const deleteOrderCall = db.captured.runCalls.find((call) => call.sql.includes('DELETE FROM Orders'));
    const deletePaymentCall = db.captured.runCalls.find((call) => call.sql.includes('DELETE FROM Payments'));
    assert.ok(deleteOrderCall, 'should hard-delete the pending order');
    assert.ok(deletePaymentCall, 'should delete related payment records too');
}

async function testDeletePendingOrderWithoutPaymentsFullyDeletes() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT id, status': { id: 101, status: '待确认' },
            'COUNT(*) AS payment_count': { payment_count: 0, paid_amount: 0 }
        },
        runResponses: {
            'DELETE FROM Payments': { meta: { changes: 0 } },
            'DELETE FROM Expenses': { meta: { changes: 0 } },
            'DELETE FROM OrderOverpaymentIssues': { meta: { changes: 0 } },
            'DELETE FROM OrderBoothChanges': { meta: { changes: 0 } },
            'DELETE FROM Orders': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/delete-pending-order', {
        project_id: 7,
        order_id: 101
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const deleteCall = db.captured.runCalls.find((call) => call.sql.includes('DELETE FROM Orders'));
    assert.ok(deleteCall, 'should fully delete the pending order');
}

async function testDeletePendingOrderRequiresSuperAdmin() {
    const db = createMockEnv();
    const req = jsonRequest('http://localhost/api/delete-pending-order', {
        project_id: 7,
        order_id: 101
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: { role: 'admin', name: 'manager' }, corsHeaders: CORS });
    assert.equal(res.status, 403);
}

async function testReactivatePendingOrderAllowsJointOccupiedTarget() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql) => {
                if (sql.includes('COUNT(*) AS payment_count')) {
                    return { payment_count: 0, paid_amount: 0 };
                }
                if (sql.includes('SELECT *') && sql.includes('FROM Orders')) {
                    return {
                        id: 101,
                        project_id: 7,
                        company_name: '福建测试海产有限公司',
                        status: '待确认',
                        fees_json: '[]',
                        paid_amount: 0
                    };
                }
                return null;
            }
        },
        allResponses: {
            'FROM Orders': (sql) => {
                if (sql.includes("status = '正常'")) {
                    return { results: [{ id: 200, booth_id: '1A02', area: 9, created_at: '2026-04-01' }] };
                }
                return { results: [] };
            },
            'FROM Booths': {
                results: [
                    { id: '1A02', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', base_price: 5000, status: '可售' }
                ]
            }
        },
        runResponses: {
            'DELETE FROM BoothLocks': { meta: { changes: 1 } },
            'INSERT INTO BoothLocks': { meta: { changes: 1 } },
            'UPDATE Orders': { meta: { changes: 1 } },
            'UPDATE Booths': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/reactivate-pending-order', {
        order_id: 101,
        project_id: 7,
        target_booths: [{ booth_id: '1A02', area: 3, is_joint: 1 }],
        actual_fee: 1666.67,
        price_reason: '联合参展分摊',
        standard_booth_display_name: '测试海产',
        fees_json: []
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const areaAdjustmentCall = db.captured.batchCalls.flat().find((call) => call.sql.includes('UPDATE Orders SET area = ROUND(area - ?'));
    const reactivateCall = db.captured.runCalls.find((call) => call.sql.includes('SET status = ?') && call.sql.includes('booth_id = ?'));
    assert.ok(areaAdjustmentCall, 'should reduce the existing occupant area for joint reactivation');
    assert.deepEqual(areaAdjustmentCall.params, [3, 200]);
    assert.ok(reactivateCall, 'should reactivate the pending order');
    assert.equal(reactivateCall.params[0], '正常');
    assert.equal(reactivateCall.params[1], '1A02');
    assert.equal(reactivateCall.params[2], 3);
}

async function testPendingPaymentHandlingCustomRequiresNote() {
    const db = createMockEnv();
    const req = jsonRequest('http://localhost/api/handle-pending-order-payments', {
        project_id: 7,
        order_id: 101,
        method: 'custom',
        note: ''
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('必须填写说明'));
}

async function testPendingPaymentHandlingSuccess() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT id, status': { id: 101, status: '待确认' },
            'COUNT(*) AS payment_count': { payment_count: 1, paid_amount: 1000 }
        },
        runResponses: {
            'UPDATE Orders': { meta: { changes: 1 } }
        }
    });
    const req = jsonRequest('http://localhost/api/handle-pending-order-payments', {
        project_id: 7,
        order_id: 101,
        method: 'full_refund',
        note: ''
    });
    const res = await handleOrderRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.method, 'full_refund');
    const updateCall = db.captured.runCalls.find((call) => call.sql.includes("pending_payment_resolution_status = 'recorded'"));
    assert.ok(updateCall, 'should record the payment handling method');
}

// ---------------------------------------------------------------------------
// resolve-overpayment tests
// ---------------------------------------------------------------------------

async function testResolveOverpaymentFxDiffSuccess() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT': (sql) => {
                if (sql.includes('booth_id, total_booth_fee, other_income')) {
                    return { booth_id: '1A01', total_booth_fee: 5000, other_income: 0, total_amount: 5000, paid_amount: 5500, fees_json: '[]' };
                }
                if (sql.includes('booth_id, total_amount, paid_amount')) {
                    return { booth_id: '1A01', total_amount: 5500, paid_amount: 5500 };
                }
                return null;
            }
        },
        allResponses: {
            'SELECT': (sql) => {
                if (sql.includes('FROM OrderOverpaymentIssues')) {
                    return { results: [{ order_id: 101, project_id: 7, overpaid_amount: 500, status: 'pending', reason: '', note: '', detected_at: '2026-04-08', handled_by: '', handled_at: '' }] };
                }
                if (sql.includes('id, project_id, total_amount, paid_amount, status')) {
                    return { results: [{ id: 101, project_id: 7, total_amount: 5000, paid_amount: 5500, status: '正常' }] };
                }
                if (sql.includes('FROM Booths')) {
                    return { results: [{ id: '1A01', status: '可售' }] };
                }
                if (sql.includes("status = '正常'")) {
                    return { results: [{ booth_id: '1A01', paid_amount: 5500, total_amount: 5500 }] };
                }
                return { results: [] };
            }
        }
    });
    const req = jsonRequest('http://localhost/api/resolve-overpayment', {
        order_id: 101,
        project_id: 7,
        action: 'fx_diff',
        note: '汇率差异调节'
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
    const batchOps = db.captured.batchCalls.flat();
    const orderUpdate = batchOps.find((c) => c.sql.includes('UPDATE Orders') && c.sql.includes('other_income'));
    assert.ok(orderUpdate, 'should update order fees');
    const issueUpdate = batchOps.find((c) => c.sql.includes('UPDATE OrderOverpaymentIssues') && c.sql.includes('resolved_as_fx_diff'));
    assert.ok(issueUpdate, 'should resolve overpayment issue');
}

async function testResolveOverpaymentOnHoldSuccess() {
    const db = createMockEnv({
        allResponses: {
            'SELECT': (sql) => {
                if (sql.includes('FROM OrderOverpaymentIssues')) {
                    return { results: [{ order_id: 101, project_id: 7, overpaid_amount: 500, status: 'pending', reason: '', note: '', detected_at: '2026-04-08', handled_by: '', handled_at: '' }] };
                }
                if (sql.includes('id, project_id, total_amount, paid_amount, status')) {
                    return { results: [{ id: 101, project_id: 7, total_amount: 5000, paid_amount: 5500, status: '正常' }] };
                }
                return { results: [] };
            }
        }
    });
    const req = jsonRequest('http://localhost/api/resolve-overpayment', {
        order_id: 101,
        project_id: 7,
        action: 'on_hold',
        note: '等待客户确认'
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    const body = await res.json();
    assert.equal(body.success, true);
}

async function testResolveOverpaymentInvalidAction() {
    const db = createMockEnv({
        allResponses: {
            'SELECT': (sql) => {
                if (sql.includes('FROM OrderOverpaymentIssues')) {
                    return { results: [{ order_id: 101, project_id: 7, overpaid_amount: 500, status: 'pending', reason: '', note: '', detected_at: '2026-04-08', handled_by: '', handled_at: '' }] };
                }
                if (sql.includes('id, project_id, total_amount, paid_amount, status')) {
                    return { results: [{ id: 101, project_id: 7, total_amount: 5000, paid_amount: 5500, status: '正常' }] };
                }
                return { results: [] };
            }
        }
    });
    const req = jsonRequest('http://localhost/api/resolve-overpayment', {
        order_id: 101,
        project_id: 7,
        action: 'invalid_action',
        note: '测试'
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('无效'));
}

async function testResolveOverpaymentPermissionDenied() {
    const db = createMockEnv({
        firstResponses: {
            'SELECT sales_name FROM Orders': { sales_name: '李四' }
        }
    });
    const req = jsonRequest('http://localhost/api/resolve-overpayment', {
        order_id: 101,
        project_id: 7,
        action: 'fx_diff',
        note: '汇率差'
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
    assert.equal(res.status, 403);
}

async function testResolveOverpaymentMissingNote() {
    const db = createMockEnv({
        allResponses: {
            'SELECT': (sql) => {
                if (sql.includes('FROM OrderOverpaymentIssues')) {
                    return { results: [{ order_id: 101, project_id: 7, overpaid_amount: 500, status: 'pending', reason: '', note: '', detected_at: '2026-04-08', handled_by: '', handled_at: '' }] };
                }
                if (sql.includes('id, project_id, total_amount, paid_amount, status')) {
                    return { results: [{ id: 101, project_id: 7, total_amount: 5000, paid_amount: 5500, status: '正常' }] };
                }
                return { results: [] };
            }
        }
    });
    const req = jsonRequest('http://localhost/api/resolve-overpayment', {
        order_id: 101,
        project_id: 7,
        action: 'fx_diff',
        note: ''
    });
    const res = await handlePaymentRoutes({ request: req, env: db, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('说明'));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runTests() {
    // submit-order
    await testSubmitOrderSuccess();
    await testSubmitOrderSuperAdminCanAssignDifferentSalesOwner();
    await testSubmitOrderRejectsLongProfile();
    await testSubmitOrderNonSuperAdminCannotReassignSalesOwner();
    await testSubmitOrderExceedMaxBooths();
    await testSubmitOrderBoothLockConflict();
    await testSubmitOrderBoothOccupied();
    await testSuperAdminCanUpdateOrderSalesOwner();
    await testUpdateCustomerInfoRejectsLongProfile();
    await testNonSuperAdminCannotUpdateOrderSalesOwner();

    // add-payment
    await testGetPaymentsPaginationClampsPage();
    await testAddPaymentSuccess();
    await testAddPaymentWouldOverpay();
    await testAddPaymentPermissionDenied();
    await testAddPaymentCancelledOrder();
    await testAddPaymentInvalidAmount();

    // edit-payment
    await testEditPaymentSuccess();
    await testEditPaymentErpSyncRejection();
    await testEditPaymentConcurrentConflict();

    // delete-payment
    await testDeletePaymentSuccess();
    await testDeletePaymentErpSyncRejection();
    await testDeletePaymentPermissionDenied();

    // change-order-booth
    await testChangeOrderBoothSuccess();
    await testChangeOrderBoothSyncsSystemRefrigeratorRentalBoothNumbers();
    await testChangeOrderBoothTargetOccupied();
    await testChangeOrderBoothAllowsJointOccupiedTarget();
    await testChangeOrderBoothRejectsJointAreaBeyondRemaining();
    await testChangeOrderBoothMissingReason();
    await testChangeOrderBoothPreserveFinanceForSuperAdmin();
    await testChangeOrderBoothInheritsDisplayNameWhenStandardChangesToGround();
    await testChangeOrderBoothRequiresNewDisplayNameWhenInheritanceFails();
    await testChangeOrderBoothRequiresNewDisplayNameForSalesUser();
    await testChangeOrderBoothUsesExplicitDisplayNameWhenInheritanceFails();
    await testChangeOrderBoothPreserveFinanceRequiresSuperAdmin();

    // order booth change history
    await testGetOrderBoothChangesAdminCanReadAnyOrder();
    await testGetOrderBoothChangesSalesCanReadOwnOrder();
    await testGetOrderBoothChangesSalesCannotReadOtherOrder();
    await testGetOrderBoothChangesMissingOrder();

    // pending-order handling
    await testDeletePendingOrderWithPaymentsAllowedForSuperAdmin();
    await testDeletePendingOrderWithoutPaymentsFullyDeletes();
    await testDeletePendingOrderRequiresSuperAdmin();
    await testReactivatePendingOrderAllowsJointOccupiedTarget();
    await testPendingPaymentHandlingCustomRequiresNote();
    await testPendingPaymentHandlingSuccess();

    // resolve-overpayment
    await testResolveOverpaymentFxDiffSuccess();
    await testResolveOverpaymentOnHoldSuccess();
    await testResolveOverpaymentInvalidAction();
    await testResolveOverpaymentPermissionDenied();
    await testResolveOverpaymentMissingNote();
}

await runTests();
console.log('Route main-chain regression tests passed (47 cases)');
