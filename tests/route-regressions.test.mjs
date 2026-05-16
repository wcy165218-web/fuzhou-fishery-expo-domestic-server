import assert from 'node:assert/strict';
import { handleBoothMapRoutes } from '../src/routes/booth-maps.mjs';
import { handleBoothRoutes } from '../src/routes/booths.mjs';
import { handleConfigRoutes } from '../src/routes/config.mjs';
import { handleFileRoutes } from '../src/routes/files.mjs';
import { handleOrderRoutes } from '../src/routes/orders.mjs';
import { getApiRouteHandler } from '../src/router.mjs';

function createOrderRouteEnv() {
  const captured = {
    firstCalls: [],
    allCalls: []
  };

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
            if (sql.includes('COUNT(*) AS total')) {
              return { total: 120 };
            }
            return null;
          },
          async all() {
            if (sql.includes('datetime(o.reserved_release_due_at) <=') && sql.includes('NOT EXISTS')) {
              return { results: [] };
            }
            captured.allCalls.push({ sql, params: [...this.params] });
            const canViewCommercialNotes = Number(this.params[0] || 0) === 1 || String(this.params[1] || '') === '张三';
            return {
              results: [
                {
                  id: 101,
                  project_id: 7,
                  booth_id: '1A01',
                  company_name: '福建海洋科技',
                  sales_name: '张三',
                  discount_reason: '老客户优惠',
                  visible_discount_reason: canViewCommercialNotes ? '老客户优惠' : '',
                  can_view_commercial_notes: canViewCommercialNotes ? 1 : 0,
                  paid_amount: 1000,
                  total_amount: 1000,
                  can_manage: 1,
                  can_preview_contract: 1,
                  has_contract: 1,
                  contract_url: 'contract_1.pdf',
                  hall: '1号馆',
                  booth_type: '标摊',
                  overpaid_amount: 0,
                  overpayment_status: '',
                  overpayment_reason: '',
                  overpayment_note: '',
                  overpayment_handled_by: '',
                  overpayment_handled_at: '',
                  can_handle_overpayment: 1,
                  contact_person: '联系人甲',
                  phone: '13800000000',
                  created_at: '2026-04-09 10:00:00'
                }
              ]
            };
          }
        };
      }
    }
  };
}

function createConfigRouteEnv(options = {}) {
  const captured = {
    batchCalls: [],
    firstCalls: [],
    runCalls: []
  };
  return {
    captured,
    JWT_SECRET: 'route-regression-secret',
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
            if (sql.includes('FROM ProjectErpConfigs')) {
              return options.erpConfig || null;
            }
            return null;
          },
          async run() {
            captured.runCalls.push({ sql, params: [...this.params] });
            return { meta: { changes: 1 } };
          }
        };
      },
      async batch(statements) {
        captured.batchCalls.push(statements.map((statement) => ({
          sql: statement.sql,
          params: [...statement.params]
        })));
        return statements.map((_, index) => ({
          meta: { changes: index + 1 }
        }));
      }
    }
  };
}

function createOrderedBoothMapRouteEnv() {
  const captured = {
    batchCalls: []
  };
  const existingPointsJson = JSON.stringify([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ]);
  const existingItem = {
    id: 1,
    project_id: 7,
    map_id: 3,
    booth_code: '1A01',
    hall: '1号馆',
    booth_type: '标摊',
    opening_type: '单开口',
    width_m: 3,
    height_m: 3,
    area: 9,
    x: 100,
    y: 100,
    rotation: 0,
    stroke_width: 2,
    shape_type: 'rect',
    points_json: existingPointsJson,
    label_style_json: '{}',
    z_index: 1,
    hidden: 0,
    active_order_count: 1
  };
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
            if (sql.includes('FROM BoothMaps')) {
              return {
                id: 3,
                project_id: 7,
                name: '1号馆',
                scale_pixels_per_meter: 40,
                default_stroke_width: 2,
                canvas_width: 1600,
                canvas_height: 900,
                display_config_json: '{}'
              };
            }
            return null;
          },
          async all() {
            if (sql.includes('FROM BoothMapItems bmi')) {
              return { results: [existingItem] };
            }
            if (sql.includes('FROM BoothMapItems') && sql.includes('map_id <>')) {
              return { results: [] };
            }
            if (sql.includes('SELECT booth_code') && sql.includes('FROM BoothMapItems')) {
              return { results: [{ booth_code: existingItem.booth_code }] };
            }
            if (sql.includes('SELECT id, booth_id, area, price_unit') && sql.includes('FROM Orders')) {
              return { results: [{ id: 501, booth_id: '1A01', area: 9, price_unit: '个' }] };
            }
            return { results: [] };
          },
          async run() {
            return { meta: { changes: 1 } };
          }
        };
      },
      async batch(statements) {
        captured.batchCalls.push(statements.map((statement) => ({
          sql: statement.sql,
          params: [...statement.params]
        })));
        return statements.map(() => ({ meta: { changes: 1 } }));
      }
    }
  };
}

function createBoothMapMetaUpdateEnv() {
  const captured = {
    runCalls: [],
    cacheDeletes: []
  };
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
          async run() {
            captured.runCalls.push({ sql, params: [...this.params] });
            return { meta: { changes: 1 } };
          }
        };
      }
    },
    CACHE: {
      async delete(key) {
        captured.cacheDeletes.push(String(key));
      }
    }
  };
}

function createOrderedBoothRouteEnv() {
  return {
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
            if (sql.includes('FROM Booths')) {
              return {
                source: 'manual',
                booth_map_id: null,
                type: '标摊',
                area: 9,
                base_price: 0
              };
            }
            if (sql.includes('FROM Orders')) {
              return { id: 101 };
            }
            return null;
          },
          async all() {
            if (sql.includes('FROM Orders')) {
              return { results: [{ booth_id: '1A01' }] };
            }
            return { results: [] };
          },
          async run() {
            throw new Error('ordered booth edit should be blocked before writes');
          }
        };
      }
    }
  };
}

async function runTests() {
  const corsHeaders = { 'Content-Type': 'application/json' };

  assert.equal(getApiRouteHandler('/api/orders'), handleOrderRoutes);
  assert.equal(getApiRouteHandler('/api/pending-orders'), handleOrderRoutes);
  assert.equal(getApiRouteHandler('/api/order-booth-changes'), handleOrderRoutes);
  assert.equal(getApiRouteHandler('/api/prices'), handleBoothRoutes);
  assert.equal(getApiRouteHandler('/api/booth-map-runtime-view'), handleBoothMapRoutes);
  assert.equal(getApiRouteHandler('/api/upload'), handleFileRoutes);
  assert.equal(getApiRouteHandler('/api/clear-project-rollout-data'), handleConfigRoutes);
  assert.equal(getApiRouteHandler('/api/unknown-route'), null);

  const orderEnv = createOrderRouteEnv();
  const orderRequest = new Request(
    'http://localhost/api/orders?projectId=7&page=2&pageSize=50&search=%E6%B5%B7%E9%B2%9C&regionSearch=%E7%A6%8F%E5%BB%BA&boothType=%E6%A0%87%E6%91%8A&paymentStatus=%E5%85%A8%E6%AC%BE&salesName=%E5%BC%A0%E4%B8%89',
    { method: 'GET' }
  );
  const orderResponse = await handleOrderRoutes({
    request: orderRequest,
    env: orderEnv,
    url: new URL(orderRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const orderPayload = await orderResponse.json();
  assert.deepEqual(orderPayload, {
    items: [
      {
        id: 101,
        project_id: 7,
        booth_id: '1A01',
        company_name: '福建海洋科技',
        sales_name: '张三',
        discount_reason: '老客户优惠',
        can_view_commercial_notes: 1,
        paid_amount: 1000,
        total_amount: 1000,
        can_manage: 1,
        can_preview_contract: 1,
        has_contract: 1,
        contract_url: 'contract_1.pdf',
        hall: '1号馆',
        booth_type: '标摊',
        overpaid_amount: 0,
        overpayment_status: '',
        overpayment_reason: '',
        overpayment_note: '',
        overpayment_handled_by: '',
        overpayment_handled_at: '',
        can_handle_overpayment: 1,
        contact_person: '联系人甲',
        phone: '13800000000',
        created_at: '2026-04-09 10:00:00'
      }
    ],
    total: 120,
    page: 2,
    pageSize: 50,
    totalPages: 3,
    hasMore: true
  });
  assert.equal(orderEnv.captured.firstCalls.length, 1);
  assert.equal(orderEnv.captured.allCalls.length, 1);
  assert.deepEqual(orderEnv.captured.firstCalls[0].params.slice(0, 6), [7, '张三', '%海鲜%', '%海鲜%', '%福建%', '标摊']);
  assert.match(orderEnv.captured.firstCalls[0].sql, /COALESCE\(o\.region, ''\) LIKE \? ESCAPE '\\' COLLATE NOCASE/);
  assert.match(orderEnv.captured.firstCalls[0].sql, /FROM Booths booth_filter/);
  assert.match(orderEnv.captured.firstCalls[0].sql, /booth_filter\.type = \?/);
  assert.match(orderEnv.captured.firstCalls[0].sql, /COALESCE\(o\.total_amount, 0\) <= 0 OR COALESCE\(o\.paid_amount, 0\) >= COALESCE\(o\.total_amount, 0\)/);
  assert.match(orderEnv.captured.allCalls[0].sql, /ORDER BY CASE WHEN o\.sales_name = \? THEN 0 ELSE 1 END ASC/);
  assert.deepEqual(orderEnv.captured.allCalls[0].params.slice(-2), [50, 50]);

  const unpaidOrderEnv = createOrderRouteEnv();
  const unpaidOrderRequest = new Request(
    'http://localhost/api/orders?projectId=7&page=1&pageSize=20&paymentStatus=%E6%9C%AA%E4%BB%98',
    { method: 'GET' }
  );
  await handleOrderRoutes({
    request: unpaidOrderRequest,
    env: unpaidOrderEnv,
    url: new URL(unpaidOrderRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  assert.match(unpaidOrderEnv.captured.firstCalls[0].sql, /COALESCE\(o\.total_amount, 0\) > 0 AND COALESCE\(o\.paid_amount, 0\) <= 0/);

  const salesOrderEnv = createOrderRouteEnv();
  const salesOrderRequest = new Request(
    'http://localhost/api/orders?projectId=7&page=1&pageSize=50',
    { method: 'GET' }
  );
  const salesOrderResponse = await handleOrderRoutes({
    request: salesOrderRequest,
    env: salesOrderEnv,
    url: new URL(salesOrderRequest.url),
    currentUser: { role: 'sales', name: '李四' },
    corsHeaders
  });
  const salesOrderPayload = await salesOrderResponse.json();
  assert.equal(salesOrderPayload.items[0].can_view_commercial_notes, 0);
  assert.equal(salesOrderPayload.items[0].discount_reason, '');
  assert.doesNotMatch(salesOrderEnv.captured.firstCalls[0].sql, /paid_amount >= o\.total_amount/);
  assert.deepEqual(salesOrderEnv.captured.firstCalls[0].params, [7]);
  assert.deepEqual(salesOrderEnv.captured.allCalls[0].params.slice(-3), ['李四', 50, 0]);

  const configEnv = createConfigRouteEnv();
  const clearRequest = new Request('http://localhost/api/clear-project-rollout-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: 9 })
  });
  const clearResponse = await handleConfigRoutes({
    request: clearRequest,
    env: configEnv,
    url: new URL(clearRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const clearPayload = await clearResponse.json();
  assert.equal(clearResponse.status, 410);
  assert.equal(configEnv.captured.batchCalls.length, 0);
  assert.equal(clearPayload.error, '项目业务数据清理入口已停用，请勿通过系统直接清空项目数据');

  const erpConfigEnv = createConfigRouteEnv({
    erpConfig: {
      project_id: 7,
      enabled: 1,
      endpoint_url: 'https://erp.example.test',
      water_id: 'water-1',
      session_cookie: 'JSESSIONID=secret-cookie',
      expected_project_name: '福州渔博会',
      use_mock: 0,
      mock_payload: '',
      last_sync_at: '',
      last_sync_summary: ''
    }
  });
  const erpConfigRequest = new Request('http://localhost/api/erp-config?projectId=7', { method: 'GET' });
  const erpConfigResponse = await handleConfigRoutes({
    request: erpConfigRequest,
    env: erpConfigEnv,
    url: new URL(erpConfigRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const erpConfigPayload = await erpConfigResponse.json();
  assert.equal(erpConfigResponse.status, 200);
  assert.equal(erpConfigPayload.session_cookie, '');
  assert.equal(erpConfigPayload.has_session_cookie, true);
  assert.equal(erpConfigPayload.endpoint_url, 'https://erp.example.test');

  const rawUploadBody = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const uploadedObjects = [];
  const uploadRequest = new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent('回归测试合同.pdf')
    },
    body: rawUploadBody
  });
  const uploadResponse = await handleFileRoutes({
    request: uploadRequest,
    env: {
      BUCKET: {
        async put(key, body, options) {
          uploadedObjects.push({ key, size: body.byteLength, contentType: options?.httpMetadata?.contentType || '' });
        }
      }
    },
    url: new URL(uploadRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const uploadPayload = await uploadResponse.json();
  assert.equal(uploadPayload.success, true);
  assert.equal(uploadedObjects.length, 1);
  assert.equal(uploadedObjects[0].size, rawUploadBody.byteLength);
  assert.equal(uploadedObjects[0].contentType, 'application/pdf');
  assert.ok(uploadedObjects[0].key.endsWith('.pdf'));

  const jsonUploadedObjects = [];
  const retryUploadId = 'retry-upload-id-12345';
  const jsonUploadRequest = new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileName: 'JSON回归测试合同.pdf',
      mimeType: 'application/pdf',
      uploadId: retryUploadId,
      contentBase64: Buffer.from(rawUploadBody).toString('base64')
    })
  });
  const jsonUploadResponse = await handleFileRoutes({
    request: jsonUploadRequest,
    env: {
      BUCKET: {
        async put(key, body, options) {
          jsonUploadedObjects.push({ key, size: body.byteLength, contentType: options?.httpMetadata?.contentType || '' });
        }
      }
    },
    url: new URL(jsonUploadRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const jsonUploadPayload = await jsonUploadResponse.json();
  assert.equal(jsonUploadPayload.success, true);
  assert.equal(jsonUploadedObjects.length, 1);
  assert.equal(jsonUploadedObjects[0].size, rawUploadBody.byteLength);
  assert.equal(jsonUploadedObjects[0].contentType, 'application/pdf');
  assert.ok(jsonUploadedObjects[0].key.endsWith('.pdf'));

  const jsonRetryRequest = new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileName: 'JSON回归测试合同.pdf',
      mimeType: 'application/pdf',
      uploadId: retryUploadId,
      contentBase64: Buffer.from(rawUploadBody).toString('base64')
    })
  });
  const jsonRetryResponse = await handleFileRoutes({
    request: jsonRetryRequest,
    env: {
      BUCKET: {
        async put(key, body, options) {
          jsonUploadedObjects.push({ key, size: body.byteLength, contentType: options?.httpMetadata?.contentType || '' });
        }
      }
    },
    url: new URL(jsonRetryRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const jsonRetryPayload = await jsonRetryResponse.json();
  assert.equal(jsonRetryPayload.success, true);
  assert.equal(jsonRetryPayload.fileKey, jsonUploadPayload.fileKey);
  assert.equal(jsonUploadedObjects.length, 2);
  assert.equal(jsonUploadedObjects[1].key, jsonUploadedObjects[0].key);

  const pricesRequest = new Request('http://localhost/api/prices?projectId=7', {
    method: 'GET'
  });
  const pricesResponse = await handleBoothRoutes({
    request: pricesRequest,
    env: {
      DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async all() {
              return {
                results: [
                  { booth_type: '标摊', price: 1200 },
                  { booth_type: '豪标', price: 2400 }
                ]
              };
            }
          };
        }
      }
    },
    url: new URL(pricesRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  assert.equal(pricesResponse.headers.get('Cache-Control'), 'private, max-age=30, stale-while-revalidate=120');
  assert.equal(pricesResponse.headers.get('Vary'), 'Origin, Authorization');
  assert.deepEqual(await pricesResponse.json(), {
    标摊: 1200,
    豪标: 2400
  });

  const previewRequest = new Request('http://localhost/api/file/contract_preview.pdf?orderId=101', {
    method: 'GET',
    headers: { 'If-None-Match': 'etag-preview-1' }
  });
  const previewResponse = await handleFileRoutes({
    request: previewRequest,
    env: {
      DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async first() {
              return {
                sales_name: 'admin',
                contract_url: 'contract_preview.pdf'
              };
            }
          };
        }
      },
      BUCKET: {
        async get() {
          return {
            httpEtag: 'etag-preview-1',
            body: null,
            writeHttpMetadata() {}
          };
        }
      }
    },
    url: new URL(previewRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  assert.equal(previewResponse.status, 304);
  assert.equal(previewResponse.headers.get('etag'), 'etag-preview-1');
  assert.equal(previewResponse.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
  assert.equal(previewResponse.headers.get('Vary'), 'Origin, Authorization, Accept-Encoding');

  const boothMapMetaEnv = createBoothMapMetaUpdateEnv();
  const boothMapMetaRequest = new Request('http://localhost/api/update-booth-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 3,
      projectId: 7,
      name: '1号馆',
      scale_pixels_per_meter: 40,
      default_stroke_width: 2,
      canvas_width: 1600,
      canvas_height: 900,
      viewport_x: 0,
      viewport_y: 0,
      viewport_zoom: 1,
      calibration_json: {},
      display_config_json: {
        standard: {
          boothNo: { anchorX: 0.02, anchorY: 1.6, fontSize: 18, visible: true }
        }
      }
    })
  });
  const boothMapMetaResponse = await handleBoothMapRoutes({
    request: boothMapMetaRequest,
    env: boothMapMetaEnv,
    url: new URL(boothMapMetaRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  assert.equal(boothMapMetaResponse.status, 200);
  assert.equal(boothMapMetaEnv.captured.runCalls.length, 1);
  assert.deepEqual(boothMapMetaEnv.captured.cacheDeletes, ['rv:7:3']);

  const orderedBoothMapEnv = createOrderedBoothMapRouteEnv();
  const orderedBoothMapRequest = new Request('http://localhost/api/save-booth-map-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: 7,
      mapId: 3,
      replaceAll: false,
      items: [
        {
          booth_code: '1A02',
          previous_booth_code: '1A01',
          hall: '1号馆',
          booth_type: '标摊',
          opening_type: '单开口',
          width_m: 4,
          height_m: 3,
          x: 100,
          y: 100,
          rotation: 0,
          stroke_width: 2,
          shape_type: 'rect',
          label_style: {
            companyTextOverride: '福建水产展团'
          },
          z_index: 1,
          hidden: 0
        }
      ]
    })
  });
  const orderedBoothMapResponse = await handleBoothMapRoutes({
    request: orderedBoothMapRequest,
    env: orderedBoothMapEnv,
    url: new URL(orderedBoothMapRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const orderedBoothMapPayload = await orderedBoothMapResponse.json();
  assert.equal(orderedBoothMapResponse.status, 200);
  assert.equal(orderedBoothMapPayload.success, true);
  assert.equal(orderedBoothMapPayload.synced_order_count, 1);
  const orderedBoothMapStatements = orderedBoothMapEnv.captured.batchCalls.flat();
  const boothMapItemUpsertCall = orderedBoothMapStatements.find((call) => call.sql.includes('INSERT INTO BoothMapItems'));
  assert.ok(boothMapItemUpsertCall);
  assert.equal(JSON.parse(boothMapItemUpsertCall.params[15]).companyTextOverride, '福建水产展团');
  const orderSyncCall = orderedBoothMapStatements.find((call) => call.sql.includes('UPDATE Orders') && call.sql.includes('booth_id = ?'));
  assert.ok(orderSyncCall);
  assert.deepEqual(orderSyncCall.params, ['1A02', 12, '个', 501, 7]);
  assert.equal(orderedBoothMapStatements.some((call) => call.sql.includes('total_booth_fee')), false);
  assert.ok(orderedBoothMapStatements.some((call) => call.sql.includes('UPDATE ExhibitionLintels')));

  const orderedBoothEditRequest = new Request('http://localhost/api/edit-booth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 7,
      id: '1A01',
      type: '标摊',
      area: 12,
      base_price: 0
    })
  });
  const orderedBoothEditResponse = await handleBoothRoutes({
    request: orderedBoothEditRequest,
    env: createOrderedBoothRouteEnv(),
    url: new URL(orderedBoothEditRequest.url),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders
  });
  const orderedBoothEditPayload = await orderedBoothEditResponse.json();
  assert.equal(orderedBoothEditResponse.status, 400);
  assert.match(orderedBoothEditPayload.error, /不能修改面积/);
}

await runTests();
console.log('Route regression tests passed');
