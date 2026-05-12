import assert from 'node:assert/strict';
import { handleExpenseRoutes } from '../src/routes/expenses.mjs';
import { handleOrderRoutes } from '../src/routes/orders.mjs';

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
      if (!sql.includes(pattern)) continue;
      return typeof handler === 'function' ? handler(sql, params) : handler;
    }
    return undefined;
  }

  return {
    captured,
    DB: {
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
            const matched = resolveResponse(firstResponses, sql, this.params);
            return matched === undefined ? null : matched;
          },
          async all() {
            captured.prepareCalls.push({ sql, params: [...this.params], type: 'all' });
            const matched = resolveResponse(allResponses, sql, this.params);
            return matched === undefined ? { results: [] } : matched;
          },
          async run() {
            captured.runCalls.push({ sql, params: [...this.params] });
            const matched = resolveResponse(runResponses, sql, this.params);
            return matched === undefined ? { meta: { changes: 1 } } : matched;
          }
        };
      },
      async batch(statements) {
        captured.batchCalls.push(statements.map((statement) => ({
          sql: statement.sql,
          params: [...statement.params]
        })));
        return batchResponses || statements.map(() => ({ meta: { changes: 1 } }));
      }
    }
  };
}

function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const CORS = { 'Content-Type': 'application/json' };
const ADMIN = { role: 'admin', name: 'admin' };
const SALES = { role: 'user', name: 'sales01' };

async function testSubmitOrderCanonicalizesAgentName() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT name FROM Staff WHERE name = ?': { name: 'sales01' },
      'FROM Agents WHERE project_id = ?': { id: 9, project_id: 1, name: '福建汇源展览', sales_name: 'sales01' }
    },
    allResponses: {
      "FROM Orders\n            WHERE project_id = ?": { results: [] },
      'FROM Booths': { results: [] }
    },
    runResponses: {
      'DELETE FROM BoothLocks': { meta: { changes: 1 } },
      'INSERT INTO BoothLocks': { meta: { changes: 1 } }
    }
  });
  const req = jsonRequest('http://localhost/api/submit-order', {
    project_id: 1,
    company_name: '测试海产',
    credit_code: '91350100MA12345678',
    category: '水产',
    main_business: '冷冻海鲜',
    is_agent: true,
    agent_name: ' 福建汇源展览 ',
    contact_person: '张三',
    phone: '13800000001',
    region: '福建省 - 福州市',
    total_booth_fee: 6000,
    sales_name: 'sales01',
    selected_booths: [
      { booth_id: '1A01', hall: '1号馆', type: '标摊', area: 9, price_unit: '个', unit_price: 6000, standard_fee: 6000 }
    ],
    standard_booth_display_name: '测试海产',
    fees_json: '[]'
  });
  const res = await handleOrderRoutes({ request: req, env, url: new URL(req.url), currentUser: ADMIN, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  const insertCall = env.captured.batchCalls.flat().find((call) => call.sql.includes('INSERT INTO Orders'));
  assert.equal(insertCall.params[7], '福建汇源展览');
}

async function testUpdateCustomerInfoRejectsUnknownAgent() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT sales_name FROM Orders WHERE id = ?': { sales_name: 'sales01' },
      'SELECT main_business, profile': {
        main_business: '海鲜加工',
        profile: '企业简介',
        exhibitor_info_status: 'sales_default'
      },
      'FROM Agents WHERE project_id = ?': null
    }
  });
  const req = jsonRequest('http://localhost/api/update-customer-info', {
    project_id: 1,
    order_id: 8,
    region: '福建省 - 福州市',
    category: '水产',
    main_business: '海鲜加工',
    profile: '企业简介',
    is_agent: true,
    agent_name: '未知代理'
  });
  const res = await handleOrderRoutes({ request: req, env, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, '代理商不存在，请先从代理商库中选择');
}

async function testAddCommissionExpenseCanonicalizesAgentName() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT sales_name FROM Orders WHERE id = ?': { sales_name: 'sales01' },
      'FROM Agents WHERE project_id = ?': { id: 9, project_id: 1, name: '福建汇源展览', sales_name: 'sales01' }
    }
  });
  const req = jsonRequest('http://localhost/api/add-expense', {
    project_id: 1,
    order_id: 3,
    expense_type: '返佣支出',
    payee_name: ' 福建汇源展览 ',
    payee_channel: '转账',
    amount: 500,
    applicant: 'sales01',
    reason: '返佣支出'
  });
  const res = await handleExpenseRoutes({ request: req, env, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  const insertCall = env.captured.runCalls.find((call) => call.sql.includes('INSERT INTO Expenses'));
  assert.equal(insertCall.params[3], '福建汇源展览');
}

async function testAddCommissionExpenseRejectsUnknownAgent() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT sales_name FROM Orders WHERE id = ?': { sales_name: 'sales01' },
      'FROM Agents WHERE project_id = ?': null
    }
  });
  const req = jsonRequest('http://localhost/api/add-expense', {
    project_id: 1,
    order_id: 3,
    expense_type: '返佣支出',
    payee_name: '未知代理',
    payee_channel: '转账',
    amount: 500,
    applicant: 'sales01',
    reason: '返佣支出'
  });
  const res = await handleExpenseRoutes({ request: req, env, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, '返佣支出必须选择代理商库中的有效代理商');
}

async function testDeleteCommissionExpenseReturnsDeletedExpenseSnapshot() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT id, order_id, project_id, expense_type, payee_name, amount, source FROM Expenses WHERE id = ? AND deleted_at IS NULL': {
        id: 11,
        order_id: 3,
        project_id: 1,
        expense_type: '返佣支出',
        payee_name: '福建汇源展览',
        amount: 800
      },
      'SELECT sales_name FROM Orders WHERE id = ?': { sales_name: 'sales01' }
    }
  });
  const req = jsonRequest('http://localhost/api/delete-expense', {
    expense_id: 11
  });
  const res = await handleExpenseRoutes({ request: req, env, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.deleted_expense.expense_type, '返佣支出');
  assert.equal(body.deleted_expense.payee_name, '福建汇源展览');
  assert.equal(body.deleted_expense.amount, 800);
  const deleteCall = env.captured.runCalls.find((call) => call.sql.includes('UPDATE Expenses SET deleted_at = ?, deleted_by = ?'));
  assert.ok(deleteCall, 'should soft delete expense');
}

await testSubmitOrderCanonicalizesAgentName();
await testUpdateCustomerInfoRejectsUnknownAgent();
await testAddCommissionExpenseCanonicalizesAgentName();
await testAddCommissionExpenseRejectsUnknownAgent();
await testDeleteCommissionExpenseReturnsDeletedExpenseSnapshot();

console.log('Agent integrity tests passed');
