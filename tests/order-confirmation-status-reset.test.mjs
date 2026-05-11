import assert from 'node:assert/strict';
import { handleOrderRoutes } from '../src/routes/orders.mjs';

function createMockEnv(existingInfoRow) {
  const captured = { firstCalls: [], runCalls: [] };
  return {
    captured,
    DB: {
      prepare(query) {
        const sql = String(query || '');
        return {
          params: [],
          bind(...params) {
            this.params = params;
            return this;
          },
          async first() {
            captured.firstCalls.push({ sql, params: [...this.params] });
            if (sql.includes('SELECT main_business, profile')) return existingInfoRow;
            return null;
          },
          async run() {
            captured.runCalls.push({ sql, params: [...this.params] });
            return { meta: { changes: 1 } };
          },
          async all() {
            return { results: [] };
          }
        };
      }
    }
  };
}

function jsonRequest(body) {
  return new Request('http://localhost/api/update-customer-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: 21,
      project_id: 7,
      region: '福建',
      main_business: '原展品',
      profile: '原简介',
      is_agent: 0,
      agent_name: '',
      category: '水产',
      contact_person: '林经理',
      phone: '13800000000',
      ...body
    })
  });
}

async function updateCustomerInfo(env, body = {}) {
  const request = jsonRequest(body);
  return handleOrderRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
}

async function testContactOnlyChangeKeepsConfirmedStatus() {
  const env = createMockEnv({
    main_business: '原展品',
    profile: '原简介',
    exhibitor_info_status: 'exhibitor_confirmed'
  });
  const res = await updateCustomerInfo(env, { phone: '13900000000' });
  assert.equal(res.status, 200);
  const updateCall = env.captured.runCalls.find((call) => call.sql.includes('UPDATE Orders SET'));
  assert.ok(updateCall);
  assert.equal(updateCall.sql.includes("exhibitor_info_status = 'reopened'"), false);
}

async function testBusinessInfoChangeRequiresResubmit() {
  const env = createMockEnv({
    main_business: '原展品',
    profile: '原简介',
    exhibitor_info_status: 'exhibitor_confirmed'
  });
  const res = await updateCustomerInfo(env, { main_business: '新展品' });
  assert.equal(res.status, 200);
  const updateCall = env.captured.runCalls.find((call) => call.sql.includes('UPDATE Orders SET'));
  assert.ok(updateCall);
  assert.equal(updateCall.sql.includes("exhibitor_info_status = 'reopened'"), true);
  assert.equal(updateCall.sql.includes("exhibitor_info_confirmed_at = ''"), true);
}

async function run() {
  await testContactOnlyChangeKeepsConfirmedStatus();
  await testBusinessInfoChangeRequiresResubmit();
  console.log('Order confirmation status reset tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
