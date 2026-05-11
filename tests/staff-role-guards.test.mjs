import assert from 'node:assert/strict';
import { handleStaffRoutes } from '../src/routes/staff.mjs';
import { canManageExhibitionModule, isAdminUser, isExhibitionManager, isSuperAdmin, normalizeUserRole } from '../src/utils/auth.mjs';

function createMockEnv(options = {}) {
  const captured = { firstCalls: [], allCalls: [], runCalls: [] };
  const { firstResponses = {}, allResponses = {}, runResponses = {} } = options;

  function resolve(responseMap, sql, params) {
    for (const [pattern, value] of Object.entries(responseMap)) {
      if (sql.includes(pattern)) {
        return typeof value === 'function' ? value(sql, params) : value;
      }
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
            const value = resolve(firstResponses, sql, this.params);
            return value === undefined ? null : value;
          },
          async all() {
            captured.allCalls.push({ sql, params: [...this.params] });
            const value = resolve(allResponses, sql, this.params);
            return value === undefined ? { results: [] } : value;
          },
          async run() {
            captured.runCalls.push({ sql, params: [...this.params] });
            const value = resolve(runResponses, sql, this.params);
            return value === undefined ? { meta: { changes: 1 } } : value;
          }
        };
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

async function testRoleHelpers() {
  assert.equal(normalizeUserRole('sales'), 'user');
  assert.equal(normalizeUserRole('superadmin'), 'super_admin');
  assert.equal(normalizeUserRole('exhibition_admin'), 'exhibition_manager');
  assert.equal(normalizeUserRole('super_admin'), 'super_admin');
  assert.equal(isAdminUser({ role: 'admin' }), true);
  assert.equal(isAdminUser({ role: 'super_admin' }), true);
  assert.equal(isExhibitionManager({ role: 'exhibition_manager' }), true);
  assert.equal(canManageExhibitionModule({ role: 'exhibition_manager' }), true);
  assert.equal(isSuperAdmin({ role: 'super_admin', name: 'root' }), true);
  assert.equal(isSuperAdmin({ role: 'admin', name: 'admin' }), true);
  assert.equal(isSuperAdmin({ role: 'admin', name: 'manager01' }), false);
}

async function testCannotCreateSecondSuperAdmin() {
  const env = createMockEnv({
    allResponses: {
      'SELECT name, role FROM Staff ORDER BY id ASC': {
        results: [{ name: 'admin', role: 'super_admin' }]
      }
    }
  });
  const request = jsonRequest('http://localhost/api/staff', { name: 'boss2', role: 'super_admin' });
  const response = await handleStaffRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error, '系统仅允许保留一个超级管理员');
  assert.equal(env.captured.runCalls.length, 0);
}

async function testCannotModifyProtectedSuperAdminRole() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT name, role FROM Staff WHERE name = ?': { name: 'admin', role: 'super_admin' }
    }
  });
  const request = jsonRequest('http://localhost/api/update-staff-role', { staffName: 'admin', role: 'admin' });
  const response = await handleStaffRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error, '不能修改超级管理员角色');
}

async function testCannotResetProtectedLegacySuperAdminPassword() {
  const env = createMockEnv({
    firstResponses: {
      'SELECT name, role FROM Staff WHERE name = ?': { name: 'admin', role: 'admin' }
    }
  });
  const request = jsonRequest('http://localhost/api/reset-password', { staffName: 'admin' });
  const response = await handleStaffRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error, '不能重置超级管理员的密码');
}

async function testAdminCanReadStaffList() {
  const env = createMockEnv({
    allResponses: {
      'SELECT name, role, target, display_order, exclude_from_sales_ranking FROM Staff ORDER BY': {
        results: [
          { name: 'admin', role: 'superadmin', target: 100, display_order: 1, exclude_from_sales_ranking: 0 },
          { name: 'expo01', role: 'exhibition_admin', target: 0, display_order: 2, exclude_from_sales_ranking: 1 },
          { name: 'sales01', role: 'sales', target: 80, display_order: 3, exclude_from_sales_ranking: 0 }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/staff?projectId=7', { method: 'GET' });
  const response = await handleStaffRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.length, 3);
  assert.equal(payload[0].role, 'super_admin');
  assert.equal(payload[1].role, 'exhibition_manager');
  assert.equal(payload[2].role, 'user');
}

async function testSalesCannotReadStaffList() {
  const request = new Request('http://localhost/api/staff?projectId=7', { method: 'GET' });
  const response = await handleStaffRoutes({
    request,
    env: createMockEnv(),
    url: new URL(request.url),
    currentUser: { role: 'user', name: 'sales01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error, '仅管理员可操作');
}

async function run() {
  await testRoleHelpers();
  await testCannotCreateSecondSuperAdmin();
  await testCannotModifyProtectedSuperAdminRole();
  await testCannotResetProtectedLegacySuperAdminPassword();
  await testAdminCanReadStaffList();
  await testSalesCannotReadStaffList();
  console.log('Staff role guard tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});