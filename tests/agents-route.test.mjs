import assert from 'node:assert/strict';
import { handleAgentRoutes } from '../src/routes/agents.mjs';

function createMockEnv({ firstResponses = {}, allResponses = {}, runResponses = {}, batchResponse } = {}) {
  const captured = { runCalls: [], batchCalls: [], firstCalls: [], allCalls: [] };

  function resolveMatch(map, sql, params) {
    for (const [pattern, handler] of Object.entries(map)) {
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
            captured.firstCalls.push({ sql, params: [...this.params] });
            const matched = resolveMatch(firstResponses, sql, this.params);
            return matched === undefined ? null : matched;
          },
          async all() {
            captured.allCalls.push({ sql, params: [...this.params] });
            const matched = resolveMatch(allResponses, sql, this.params);
            return matched === undefined ? { results: [] } : matched;
          },
          async run() {
            captured.runCalls.push({ sql, params: [...this.params] });
            const matched = resolveMatch(runResponses, sql, this.params);
            return matched === undefined ? { meta: { changes: 1 } } : matched;
          }
        };
      },
      async batch(statements) {
        captured.batchCalls.push(statements.map((statement) => ({
          sql: statement.sql,
          params: [...statement.params]
        })));
        return batchResponse || statements.map(() => ({ meta: { changes: 1 } }));
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
const SUPER_ADMIN = { role: 'admin', name: 'admin' };
const NORMAL_ADMIN = { role: 'admin', name: 'manager01' };
const SALES = { role: 'user', name: 'sales01' };

async function testDuplicateAgentRejected() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT name FROM Staff WHERE name = ?': { name: 'admin' },
      'FROM Agents WHERE project_id = ?': { id: 9 }
    }
  });
  const req = jsonRequest('http://localhost/api/add-agent', { project_id: 1, name: ' 福建汇源展览 ', sales_name: 'admin' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SUPER_ADMIN, corsHeaders: CORS });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, '该代理商名称已存在');
}

async function testSalesCanAddOwnAgent() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT name FROM Staff WHERE name = ?': { name: 'sales01' }
    }
  });
  const req = jsonRequest('http://localhost/api/add-agent', { project_id: 1, name: '销售新增代理' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(env.captured.runCalls.length, 1);
  assert.equal(env.captured.runCalls[0].params[2], 'sales01');
}

async function testSuperAdminCanAddAgentForAssignedSales() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT name FROM Staff WHERE name = ?': { name: 'sales88' }
    }
  });
  const req = jsonRequest('http://localhost/api/add-agent', { project_id: 1, name: '管理员代录代理', sales_name: 'sales88' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SUPER_ADMIN, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(env.captured.runCalls[0].params[2], 'sales88');
}

async function testNormalAdminCanAddAgent() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT name FROM Staff WHERE name = ?': { name: 'manager01' }
    }
  });
  const req = jsonRequest('http://localhost/api/add-agent', { project_id: 1, name: '管理员可新增代理' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: NORMAL_ADMIN, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(env.captured.runCalls.length, 1);
  assert.equal(env.captured.runCalls[0].params[2], 'manager01');
}

async function testSalesCanOnlyManageOwnAgent() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT * FROM Agents WHERE id = ? AND deleted_at IS NULL': { id: 8, project_id: 1, name: '我的代理', sales_name: 'sales01' },
      'AND id != ?': null
    }
  });
  const req = jsonRequest('http://localhost/api/update-agent', { id: 8, name: '我的代理新名' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(env.captured.batchCalls.length, 1);
}

async function testSuperAdminCanReassignAgentSalesOwner() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT * FROM Agents WHERE id = ? AND deleted_at IS NULL': { id: 8, project_id: 1, name: '我的代理', sales_name: 'sales01' },
      'SELECT name FROM Staff WHERE name = ?': { name: 'sales99' }
    }
  });
  const req = jsonRequest('http://localhost/api/update-agent', { id: 8, sales_name: 'sales99' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SUPER_ADMIN, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(env.captured.batchCalls[0][0].params[0], 'sales99');
}

async function testSalesCannotViewOtherAgentFinance() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT * FROM Agents WHERE id = ? AND project_id = ? AND deleted_at IS NULL': { id: 2, project_id: 1, name: '他人代理', sales_name: 'otherUser' }
    }
  });
  const req = new Request('http://localhost/api/agent-finance?agentId=2&projectId=1', { method: 'GET' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SALES, corsHeaders: CORS });
  assert.equal(res.status, 403);
}

async function testNormalAdminCanViewButCannotDelete() {
  const viewEnv = createMockEnv({
    firstResponses: {
      'SELECT * FROM Agents WHERE id = ? AND project_id = ? AND deleted_at IS NULL': { id: 2, project_id: 1, name: '公开代理', sales_name: 'sales88' }
    },
    allResponses: {
      'FROM Orders o': {
        results: [
          {
            id: 3,
            company_name: '福建海洋科技',
            total_booth_fee: 8800,
            total_amount: 8800,
            paid_amount: 0,
            booth_id: '1A01,1A02',
            area: 18,
            status: '正常',
            commission_amount: 600,
            latest_commission_at: '2026-04-13 18:00:00'
          }
        ]
      }
    }
  });
  const financeReq = new Request('http://localhost/api/agent-finance?agentId=2&projectId=1', { method: 'GET' });
  const financeRes = await handleAgentRoutes({ request: financeReq, env: viewEnv, url: new URL(financeReq.url), currentUser: NORMAL_ADMIN, corsHeaders: CORS });
  const financeBody = await financeRes.json();
  assert.equal(financeBody.summary.total_companies, 1);
  assert.equal(financeBody.summary.total_booths, 2);

  const deleteEnv = createMockEnv({
    firstResponses: {
      'SELECT * FROM Agents WHERE id = ? AND deleted_at IS NULL': { id: 2, project_id: 1, name: '公开代理', sales_name: 'sales88' }
    }
  });
  const deleteReq = jsonRequest('http://localhost/api/delete-agent', { id: 2 });
  const deleteRes = await handleAgentRoutes({ request: deleteReq, env: deleteEnv, url: new URL(deleteReq.url), currentUser: NORMAL_ADMIN, corsHeaders: CORS });
  assert.equal(deleteRes.status, 403);
}

async function testAgentFinanceRequiresMatchingProject() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT * FROM Agents WHERE id = ? AND project_id = ? AND deleted_at IS NULL': null
    }
  });
  const req = new Request('http://localhost/api/agent-finance?agentId=2&projectId=99', { method: 'GET' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SUPER_ADMIN, corsHeaders: CORS });
  assert.equal(res.status, 404);
}

async function testAgentFinanceIncludesOrdersWithoutCommission() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT * FROM Agents WHERE id = ? AND project_id = ? AND deleted_at IS NULL': { id: 5, project_id: 1, name: '未结算代理', sales_name: 'sales01' }
    },
    allResponses: {
      'FROM Orders o': {
        results: [
          {
            id: 11,
            company_name: '已录返佣企业',
            total_booth_fee: 10000,
            total_amount: 10000,
            paid_amount: 0,
            booth_id: '1A01',
            area: 9,
            status: '正常',
            commission_amount: 500,
            latest_commission_at: '2026-04-13 18:00:00'
          },
          {
            id: 12,
            company_name: '未录返佣企业',
            total_booth_fee: 20000,
            total_amount: 20000,
            paid_amount: 0,
            booth_id: '1B01,1B02',
            area: 18,
            status: '正常',
            commission_amount: 0,
            latest_commission_at: null
          }
        ]
      }
    }
  });
  const req = new Request('http://localhost/api/agent-finance?agentId=5&projectId=1', { method: 'GET' });
  const res = await handleAgentRoutes({ request: req, env, url: new URL(req.url), currentUser: SUPER_ADMIN, corsHeaders: CORS });
  const body = await res.json();
  assert.equal(body.summary.total_companies, 2);
  assert.equal(body.summary.total_booths, 3);
  assert.equal(body.summary.total_booth_fee, 30000);
  assert.equal(body.summary.total_commission, 500);
  assert.equal(body.orders[0].booth_count, 1);
  assert.equal(body.orders[1].booth_count, 2);
}

await testDuplicateAgentRejected();
await testSalesCanAddOwnAgent();
await testSuperAdminCanAddAgentForAssignedSales();
await testNormalAdminCanAddAgent();
await testSalesCanOnlyManageOwnAgent();
await testSuperAdminCanReassignAgentSalesOwner();
await testSalesCannotViewOtherAgentFinance();
await testNormalAdminCanViewButCannotDelete();
await testAgentFinanceRequiresMatchingProject();
await testAgentFinanceIncludesOrdersWithoutCommission();

console.log('Agent route tests passed');
