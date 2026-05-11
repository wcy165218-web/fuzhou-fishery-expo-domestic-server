import assert from 'node:assert/strict';
import { handleExhibitionRoutes } from '../src/routes/exhibition.mjs';

function createMockEnv(options = {}) {
  const captured = { firstCalls: [], allCalls: [], runCalls: [], puts: [], cachePuts: [] };
  const { firstResponses = {}, allResponses = {}, runResponses = {}, envVars = {} } = options;
  const cacheStore = new Map();

  function resolve(responseMap, sql, params) {
    for (const [pattern, value] of Object.entries(responseMap)) {
      if (sql.includes(pattern)) {
        return typeof value === 'function' ? value(sql, params) : value;
      }
    }
    return undefined;
  }

  return {
    JWT_SECRET: 'test-secret-for-confirmation-links',
    ...envVars,
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
            return value === undefined ? { meta: { changes: 1, last_row_id: 777 } } : value;
          }
        };
      }
    },
    CACHE: {
      async get(key, type) {
        const value = cacheStore.get(key);
        if (value === undefined) return null;
        return type === 'json' ? JSON.parse(value) : value;
      },
      async put(key, value) {
        const text = String(value || '');
        captured.cachePuts.push({ key, value: text });
        cacheStore.set(key, text);
      }
    },
    BUCKET: {
      async put(key, body, options) {
        captured.puts.push({ key, size: Number(body?.byteLength || 0), contentType: options?.httpMetadata?.contentType || '' });
      },
      async get() {
        return null;
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

const ORDER_ROW = {
  id: 301,
  project_id: 7,
  company_name: '福建海洋科技有限公司',
  sales_name: '张三',
  booth_id: '1A01',
  area: 9,
  main_business: '水产预制菜',
  profile: '主营水产加工',
  status: '正常',
  deleted_at: '',
  created_at: '2026-05-04 09:00:00',
  exhibitor_info_status: 'sales_default',
  exhibitor_info_confirmed_by: '',
  exhibitor_info_confirmed_at: ''
};

function createConfirmationEnv({ settings = {} } = {}) {
  return createMockEnv({
    firstResponses: {
      'FROM Orders\n      WHERE id = ? AND project_id = ?': ORDER_ROW,
      'SELECT name FROM Projects WHERE id = ?': { name: '福州渔博会' },
      'FROM ExhibitionConfirmationSettings\n      WHERE project_id = ?': {
        project_id: 7,
        title_text: '请核对并确认参展信息',
        banner_image_key: '',
        link_ttl_minutes: 30,
        collection_deadline_at: '',
        ...settings,
        updated_at: '2026-05-04 09:00:00'
      },
      'FROM ExhibitorConfirmationLinks\n      WHERE token_hash = ?': {
        id: 777,
        project_id: 7,
        order_id: 301,
        token_hash: 'hash',
        token_secret: '',
        expires_at: '2099-01-01 00:00:00',
        submitted_at: '',
        revoked_at: '',
        created_by: '张三',
        created_at: '2026-05-04 09:00:00',
        updated_at: '2026-05-04 09:00:00'
      },
      'FROM ExhibitionLintels\n      WHERE project_id = ? AND order_id = ? AND booth_code = ?': {
        id: 0,
        project_id: 7,
        order_id: 301,
        booth_code: '1A01',
        name_zh: '福建海洋科技有限公司',
        name_en: '',
        remark: '',
        business_confirmed: 0,
        business_confirm_source: '',
        exhibition_confirmed: 0,
        created_at: '',
        updated_at: ''
      }
    },
    allResponses: {
      'FROM ExhibitorConfirmationLinks\n      WHERE project_id = ?': { results: [] },
      'FROM Booths\n          WHERE project_id = ? AND id IN': {
        results: [{ id: '1A01', hall: '1号馆', type: '标摊', area: 9 }]
      }
    }
  });
}

async function testSalesCanCreateReusableShareLinkForOwnOrder() {
  const env = createConfirmationEnv();
  const req = jsonRequest('http://localhost/api/exhibition/exhibitor-confirmation-link', {
    project_id: 7,
    order_id: 301
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.match(body.link.url, /\/exhibitor-confirm\?token=/);
  assert.match(body.link.message, /福建海洋科技有限公司/);
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('INSERT INTO ExhibitorConfirmationLinks')));
}

async function testShareLinkCanUseDedicatedConfirmationOrigin() {
  const env = createConfirmationEnv();
  env.CONFIRMATION_PUBLIC_ORIGIN = 'https://confirmation.example.com/';
  const req = jsonRequest('https://erp.example.com/api/exhibition/exhibitor-confirmation-link', {
    project_id: 7,
    order_id: 301
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.match(body.link.url, /^https:\/\/confirmation\.example\.com\/[^/?#]+$/);
  assert.match(body.link.message, /https:\/\/confirmation\.example\.com\/[^/?#]+/);
}

async function testReusableShareLinkRefreshesExpiryFromCurrentSettings() {
  const env = createMockEnv({
    firstResponses: {
      'FROM Orders\n      WHERE id = ? AND project_id = ?': ORDER_ROW,
      'SELECT name FROM Projects WHERE id = ?': { name: '福州渔博会' },
      'FROM ExhibitionConfirmationSettings\n      WHERE project_id = ?': {
        project_id: 7,
        title_text: '请核对并确认参展信息',
        banner_image_key: '',
        link_ttl_minutes: 1440,
        collection_deadline_at: '',
        updated_at: '2026-05-04 09:00:00'
      }
    },
    allResponses: {
      'FROM ExhibitorConfirmationLinks': {
        results: [{
          id: 778,
          project_id: 7,
          order_id: 301,
          token_hash: 'hash',
          token_secret: 'reusable-token',
          expires_at: '2026-12-31 00:00:00',
          submitted_at: '',
          revoked_at: '',
          created_by: '张三',
          created_at: '2026-05-04 09:00:00',
          updated_at: '2026-05-04 09:00:00'
        }]
      }
    }
  });
  const req = jsonRequest('http://localhost/api/exhibition/exhibitor-confirmation-link', {
    project_id: 7,
    order_id: 301
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.link.reused, true);
  const expiryUpdate = env.captured.runCalls.find((call) => call.sql.includes('UPDATE ExhibitorConfirmationLinks') && call.sql.includes('SET expires_at = ?'));
  assert.ok(expiryUpdate);
  assert.notEqual(body.link.expires_at, '2026-12-31 00:00:00');
}

async function testSavingLinkTtlRefreshesActiveShareLinks() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionConfirmationSettings\n      WHERE project_id = ?': {
        project_id: 7,
        title_text: '请核对并确认参展信息',
        banner_image_key: '',
        link_ttl_minutes: 30,
        collection_deadline_at: '',
        updated_at: '2026-05-04 09:00:00'
      }
    }
  });
  const req = jsonRequest('http://localhost/api/exhibition/confirmation-settings', {
    project_id: 7,
    title_text: '请核对并确认参展信息',
    banner_image_key: '',
    link_ttl_minutes: 1440,
    collection_deadline_at: '2099-05-10T10:00'
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  assert.equal(res.status, 200);
  const linkRefresh = env.captured.runCalls.find((call) => (
    call.sql.includes('UPDATE ExhibitorConfirmationLinks')
    && call.sql.includes('SET expires_at = ?')
  ));
  assert.ok(linkRefresh);
  assert.equal(linkRefresh.params[2], 7);
}

async function testSavingConfirmationSettingsRequiresCollectionDeadline() {
  const env = createMockEnv();
  const req = jsonRequest('http://localhost/api/exhibition/confirmation-settings', {
    project_id: 7,
    title_text: '请核对并确认参展信息',
    banner_image_key: '',
    link_ttl_minutes: 1440,
    collection_deadline_at: ''
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.match(body.error, /信息收集截止时间/);
  assert.equal(env.captured.runCalls.some((call) => call.sql.includes('INSERT INTO ExhibitionConfirmationSettings')), false);
}

async function testPublicSubmitUpdatesOrderLintelAndLogsEvent() {
  const env = createConfirmationEnv();
  const req = jsonRequest('http://localhost/api/public/exhibitor-confirmations/test-token/submit', {
    main_business: '冷冻海鲜、预制菜',
    profile: '企业已确认的简介',
    lintels: [{ booth_code: '1A01', name_zh: '福建海洋科技', name_en: 'FJ Ocean Tech', remark: '靠近通道' }]
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: null,
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  const orderUpdate = env.captured.runCalls.find((call) => call.sql.includes('UPDATE Orders\n      SET main_business = ?'));
  assert.ok(orderUpdate);
  assert.equal(orderUpdate.params[0], '冷冻海鲜、预制菜');
  assert.equal(orderUpdate.params[2], 'exhibitor_confirmed');
  const lintelUpdate = env.captured.runCalls.find((call) => call.sql.includes('business_confirm_source = ?'));
  assert.ok(lintelUpdate);
  assert.equal(lintelUpdate.params[5], 'exhibitor');
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('INSERT INTO ExhibitorConfirmationEvents')));
}

async function testPublicSubmitRejectsLongProfile() {
  const env = createConfirmationEnv();
  const req = jsonRequest('http://localhost/api/public/exhibitor-confirmations/test-token/submit', {
    main_business: '冷冻海鲜、预制菜',
    profile: '亮'.repeat(301),
    lintels: [{ booth_code: '1A01', name_zh: '福建海洋科技', name_en: 'FJ Ocean Tech', remark: '靠近通道' }]
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: null,
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.match(body.error, /企业简介或产品亮点不能超过 300 字/);
  assert.equal(env.captured.runCalls.some((call) => call.sql.includes('UPDATE Orders\n      SET main_business = ?')), false);
}

async function testPublicSubmitBlockedAfterCollectionDeadline() {
  const env = createConfirmationEnv({ settings: { collection_deadline_at: '2000-01-01 00:00:00' } });
  const req = jsonRequest('http://localhost/api/public/exhibitor-confirmations/test-token/submit', {
    main_business: '冷冻海鲜、预制菜',
    profile: '企业已确认的简介',
    lintels: [{ booth_code: '1A01', name_zh: '福建海洋科技' }]
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: null,
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 423);
  assert.match(body.error, /信息收集已截止/);
  assert.equal(env.captured.runCalls.some((call) => call.sql.includes('UPDATE Orders\n      SET main_business = ?')), false);
}

async function testPublicOverviewReadOnlyAfterCollectionDeadline() {
  const env = createConfirmationEnv({ settings: { collection_deadline_at: '2000-01-01 00:00:00' } });
  const req = new Request('http://localhost/api/public/exhibitor-confirmations/test-token', { method: 'GET' });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: null,
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.link.readonly, true);
  assert.equal(body.link.collection_closed, true);
}

async function testPublicOverviewSyncsLatestCollectionDeadlineSettings() {
  let currentDeadline = '2099-05-10 10:00:00';
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitorConfirmationLinks\n      WHERE token_hash = ?': {
        id: 777,
        project_id: 7,
        order_id: 301,
        token_hash: 'hash',
        token_secret: '',
        expires_at: '2099-01-01 00:00:00',
        submitted_at: '',
        revoked_at: '',
        created_by: '张三',
        created_at: '2026-05-04 09:00:00',
        updated_at: '2026-05-04 09:00:00'
      },
      'FROM Orders\n      WHERE id = ? AND project_id = ?': ORDER_ROW,
      'SELECT name FROM Projects WHERE id = ?': { name: '福州渔博会' },
      'FROM ExhibitionConfirmationSettings\n      WHERE project_id = ?': () => ({
        project_id: 7,
        title_text: '请核对并确认参展信息',
        banner_image_key: '',
        link_ttl_minutes: 30,
        collection_deadline_at: currentDeadline,
        updated_at: '2026-05-04 09:00:00'
      }),
      'FROM ExhibitionLintels\n      WHERE project_id = ? AND order_id = ? AND booth_code = ?': {
        id: 0,
        project_id: 7,
        order_id: 301,
        booth_code: '1A01',
        name_zh: '福建海洋科技有限公司',
        name_en: '',
        remark: '',
        business_confirmed: 0,
        business_confirm_source: '',
        exhibition_confirmed: 0,
        created_at: '',
        updated_at: ''
      }
    },
    allResponses: {
      'FROM Booths\n          WHERE project_id = ? AND id IN': {
        results: [{ id: '1A01', hall: '1号馆', type: '标摊', area: 9 }]
      }
    }
  });
  const readOverview = async () => {
    const req = new Request('http://localhost/api/public/exhibitor-confirmations/test-token', { method: 'GET' });
    const res = await handleExhibitionRoutes({
      request: req,
      env,
      url: new URL(req.url),
      currentUser: null,
      corsHeaders: { 'Content-Type': 'application/json' }
    });
    return { res, body: await res.json() };
  };
  const first = await readOverview();
  assert.equal(first.res.status, 200);
  assert.equal(first.body.link.collection_deadline_at, '2099-05-10 10:00:00');
  assert.equal(first.body.link.collection_deadline_display, '2099年5月10日 10:00');
  assert.equal(first.body.link.readonly, false);
  assert.equal(Object.hasOwn(first.body.link, 'expires_at'), false);

  currentDeadline = '2000-01-01 00:00:00';
  const second = await readOverview();
  assert.equal(second.res.status, 200);
  assert.equal(second.body.link.collection_deadline_at, '2000-01-01 00:00:00');
  assert.equal(second.body.link.collection_deadline_display, '2000年1月1日 00:00');
  assert.equal(second.body.link.collection_closed, true);
  assert.equal(second.body.link.readonly, true);
}

async function testReopenBlockedAfterCollectionDeadline() {
  const env = createConfirmationEnv({ settings: { collection_deadline_at: '2000-01-01 00:00:00' } });
  const req = jsonRequest('http://localhost/api/exhibition/exhibitor-confirmation-reopen', {
    project_id: 7,
    order_id: 301
  });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 423);
  assert.match(body.error, /信息收集已截止/);
}

async function testPublicSubmitRateLimitsByClientIp() {
  const env = createConfirmationEnv();
  let limitedResponse = null;
  for (let index = 0; index < 11; index += 1) {
    const req = new Request('http://localhost/api/public/exhibitor-confirmations/test-token/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.8'
      },
      body: JSON.stringify({
        main_business: '冷冻海鲜、预制菜',
        profile: '企业已确认的简介',
        lintels: [{ booth_code: '1A01', name_zh: '福建海洋科技' }]
      })
    });
    const res = await handleExhibitionRoutes({
      request: req,
      env,
      url: new URL(req.url),
      currentUser: null,
      corsHeaders: { 'Content-Type': 'application/json' }
    });
    if (res.status === 429) {
      limitedResponse = res;
      break;
    }
  }
  assert.ok(limitedResponse);
  assert.ok(env.captured.cachePuts.some((entry) => entry.key.includes('public-submit:203.0.113.8')));
}

async function testDirectoryScopesSalesAndReturnsStatusColumns() {
  const env = createMockEnv({
    allResponses: {
      'FROM Orders\n      WHERE project_id = ?': {
        results: [ORDER_ROW]
      },
      'FROM Booths WHERE project_id = ? AND id IN': {
        results: [{ id: '1A01', hall: '1号馆', type: '标摊', area: 9 }]
      },
      'FROM ExhibitionLintels\n          WHERE project_id = ? AND order_id IN': {
        results: []
      }
    }
  });
  const req = new Request('http://localhost/api/exhibition/exhibitor-directory?projectId=7', { method: 'GET' });
  const res = await handleExhibitionRoutes({
    request: req,
    env,
    url: new URL(req.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.items[0].basic_info_status_label, '默认');
  assert.equal(body.items[0].exhibition_status, '未确认');
  const orderListCall = env.captured.allCalls.find((call) => call.sql.includes('FROM Orders'));
  assert.ok(orderListCall.params.includes('张三'));
}

async function testDirectoryScopesAdminButNotExhibitionManager() {
  const createDirectoryEnv = () => createMockEnv({
    allResponses: {
      'FROM Orders\n      WHERE project_id = ?': { results: [ORDER_ROW] },
      'FROM Booths WHERE project_id = ? AND id IN': {
        results: [{ id: '1A01', hall: '1号馆', type: '标摊', area: 9 }]
      },
      'FROM ExhibitionLintels\n          WHERE project_id = ? AND order_id IN': { results: [] }
    }
  });

  const adminEnv = createDirectoryEnv();
  const adminReq = new Request('http://localhost/api/exhibition/exhibitor-directory?projectId=7', { method: 'GET' });
  const adminRes = await handleExhibitionRoutes({
    request: adminReq,
    env: adminEnv,
    url: new URL(adminReq.url),
    currentUser: { role: 'admin', name: '王经理' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  assert.equal(adminRes.status, 200);
  const adminOrderListCall = adminEnv.captured.allCalls.find((call) => call.sql.includes('FROM Orders'));
  assert.ok(adminOrderListCall.sql.includes('sales_name = ?'));
  assert.ok(adminOrderListCall.params.includes('王经理'));

  const exhibitionEnv = createDirectoryEnv();
  const exhibitionReq = new Request('http://localhost/api/exhibition/exhibitor-directory?projectId=7', { method: 'GET' });
  const exhibitionRes = await handleExhibitionRoutes({
    request: exhibitionReq,
    env: exhibitionEnv,
    url: new URL(exhibitionReq.url),
    currentUser: { role: 'exhibition_manager', name: '展务' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  assert.equal(exhibitionRes.status, 200);
  const exhibitionOrderListCall = exhibitionEnv.captured.allCalls.find((call) => call.sql.includes('FROM Orders'));
  assert.equal(exhibitionOrderListCall.sql.includes('sales_name = ?'), false);
}

async function run() {
  await testSalesCanCreateReusableShareLinkForOwnOrder();
  await testShareLinkCanUseDedicatedConfirmationOrigin();
  await testReusableShareLinkRefreshesExpiryFromCurrentSettings();
  await testSavingLinkTtlRefreshesActiveShareLinks();
  await testSavingConfirmationSettingsRequiresCollectionDeadline();
  await testPublicSubmitUpdatesOrderLintelAndLogsEvent();
  await testPublicSubmitRejectsLongProfile();
  await testPublicSubmitBlockedAfterCollectionDeadline();
  await testPublicOverviewReadOnlyAfterCollectionDeadline();
  await testPublicOverviewSyncsLatestCollectionDeadlineSettings();
  await testReopenBlockedAfterCollectionDeadline();
  await testPublicSubmitRateLimitsByClientIp();
  await testDirectoryScopesSalesAndReturnsStatusColumns();
  await testDirectoryScopesAdminButNotExhibitionManager();
  console.log('Exhibitor confirmation route tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
