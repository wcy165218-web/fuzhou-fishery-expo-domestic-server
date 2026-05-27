import assert from 'node:assert/strict';
import { handleExhibitionRoutes } from '../src/routes/exhibition.mjs';

function createMockEnv(options = {}) {
  const captured = { firstCalls: [], allCalls: [], runCalls: [], puts: [] };
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
            return value === undefined ? { meta: { changes: 1, last_row_id: 501 } } : value;
          }
        };
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

async function testListConfigs() {
  const env = createMockEnv({
    allResponses: {
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 1, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: 'img1.png', unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: [{ config_id: 1, rented_quantity: 3 }]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/refrigerator-configs?projectId=7', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(payload.length, 1);
  assert.equal(payload[0].available_quantity, 9);
  assert.equal(payload[0].image_url, '/api/exhibition/refrigerator-image/img1.png');
}

async function testSaveRental() {
  const env = createMockEnv({
    allResponses: {
      'FROM Orders': {
        results: [
          { company_name: '福建海洋科技', sales_name: '张三', booth_id: '1A01, 1A02', created_at: '2026-04-23 10:00:00' }
        ]
      },
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: []
      },
      'FROM Booths': {
        results: [
          { id: '1A01', hall: '1号馆' },
          { id: '1A02', hall: '1号馆' }
        ]
      },
      'FROM ExhibitionRefrigeratorRentals': {
        results: []
      }
    },
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': null,
      'SELECT id FROM ExhibitionRefrigeratorRentals': null
    },
    runResponses: {
      'INSERT INTO ExhibitionRefrigeratorRentals': { meta: { changes: 1, last_row_id: 901 } },
      'INSERT INTO ExhibitionRefrigeratorRentalItems': { meta: { changes: 1 } }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/refrigerator-rentals', {
    project_id: 7,
    company_name: '福建海洋科技',
    items: [
      { config_id: 11, quantity: 1, payment_method: 'organizer' },
      { config_id: 11, quantity: 2, payment_method: 'venue' }
    ]
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.rental_id, 901);
  const rentalInsert = env.captured.runCalls.find((call) => call.sql.includes('INSERT INTO ExhibitionRefrigeratorRentals'));
  assert.ok(rentalInsert);
  assert.equal(rentalInsert.params[1], '福建海洋科技');
  assert.equal(rentalInsert.params[2], '张三');
  assert.equal(rentalInsert.params[3], 'booth');
  assert.equal(rentalInsert.params[4], '1号馆');
  assert.equal(rentalInsert.params[5], '1A01, 1A02');
  assert.equal(rentalInsert.params[6], '');
  assert.equal(rentalInsert.params[7], 1800);
  assert.equal(rentalInsert.params[8], 3600);
  const itemInserts = env.captured.runCalls.filter((call) => call.sql.includes('INSERT INTO ExhibitionRefrigeratorRentalItems'));
  assert.equal(itemInserts.length, 2);
  assert.equal(itemInserts[0].params[0], 901);
  assert.equal(itemInserts[0].params[6], 1);
  assert.equal(itemInserts[0].params[7], 'organizer');
  assert.equal(itemInserts[1].params[0], 901);
  assert.equal(itemInserts[1].params[6], 2);
  assert.equal(itemInserts[1].params[7], 'venue');
}

async function testRentalDetailPreservesDuplicateConfigLines() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': {
        id: 101,
        project_id: 7,
        company_name: '福建海洋科技',
        sales_name: '张三',
        hall_names: '1号馆',
        booth_numbers: '1A01',
        organizer_payment_total: 1800,
        venue_payment_total: 3600,
        total_amount: 5400,
        created_at: '2026-04-23 10:00:00',
        updated_at: '2026-04-23 10:30:00'
      }
    },
    allResponses: {
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: [
          {
            id: 1,
            rental_id: 101,
            config_id: 11,
            style_name_snapshot: '立式双门冰柜',
            spec_snapshot: '1200L',
            image_key_snapshot: null,
            unit_price_snapshot: 1800,
            quantity: 1,
            payment_method: 'organizer',
            line_amount: 1800,
            current_style_name: '立式双门冰柜',
            current_display_order: 1,
            current_is_active: 1
          },
          {
            id: 2,
            rental_id: 101,
            config_id: 11,
            style_name_snapshot: '立式双门冰柜',
            spec_snapshot: '1200L',
            image_key_snapshot: null,
            unit_price_snapshot: 1800,
            quantity: 2,
            payment_method: 'venue',
            line_amount: 3600,
            current_style_name: '立式双门冰柜',
            current_display_order: 1,
            current_is_active: 1
          }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/refrigerator-rental-detail?rentalId=101', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.selected_items.length, 2);
  assert.equal(payload.selected_items[0].payment_method, 'organizer');
  assert.equal(payload.selected_items[1].payment_method, 'venue');
}

async function testSaveNoBoothRental() {
  const env = createMockEnv({
    allResponses: {
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: []
      },
      'FROM ExhibitionRefrigeratorRentals': {
        results: []
      }
    },
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': null,
      'SELECT id FROM ExhibitionRefrigeratorRentals': null
    },
    runResponses: {
      'INSERT INTO ExhibitionRefrigeratorRentals': { meta: { changes: 1, last_row_id: 902 } },
      'INSERT INTO ExhibitionRefrigeratorRentalItems': { meta: { changes: 1 } }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/refrigerator-rentals', {
    project_id: 7,
    company_name: '海峡冷链服务点',
    rental_mode: 'no_booth',
    usage_location: '北广场服务台',
    items: [
      { config_id: 11, quantity: 1, payment_method: 'organizer' }
    ]
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.rental_id, 902);
  const rentalInsert = env.captured.runCalls.find((call) => call.sql.includes('INSERT INTO ExhibitionRefrigeratorRentals'));
  assert.ok(rentalInsert);
  assert.equal(rentalInsert.params[1], '海峡冷链服务点');
  assert.equal(rentalInsert.params[2], '张三');
  assert.equal(rentalInsert.params[3], 'no_booth');
  assert.equal(rentalInsert.params[4], '');
  assert.equal(rentalInsert.params[5], '北广场服务台');
  assert.equal(rentalInsert.params[6], '北广场服务台');
}

async function testRentalDetailIncludesNoBoothFields() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': {
        id: 102,
        project_id: 7,
        company_name: '海峡冷链服务点',
        sales_name: '张三',
        rental_mode: 'no_booth',
        hall_names: '',
        booth_numbers: '北广场服务台',
        usage_location: '北广场服务台',
        organizer_payment_total: 1800,
        venue_payment_total: 0,
        total_amount: 1800,
        created_at: '2026-04-23 10:00:00',
        updated_at: '2026-04-23 10:30:00'
      }
    },
    allResponses: {
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: [
          {
            id: 3,
            rental_id: 102,
            config_id: 11,
            style_name_snapshot: '立式双门冰柜',
            spec_snapshot: '1200L',
            image_key_snapshot: null,
            unit_price_snapshot: 1800,
            quantity: 1,
            payment_method: 'organizer',
            line_amount: 1800,
            current_style_name: '立式双门冰柜',
            current_display_order: 1,
            current_is_active: 1
          }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/refrigerator-rental-detail?rentalId=102', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.rental.rental_mode, 'no_booth');
  assert.equal(payload.rental.usage_location, '北广场服务台');
}

async function testExhibitionManagerCanListAllRentals() {
  const env = createMockEnv({
    allResponses: {
      'FROM ExhibitionRefrigeratorRentals': (_sql, params) => (params.length === 1 ? {
        results: [
          {
            id: 101,
            project_id: 7,
            company_name: '福建海洋科技',
            sales_name: '张三',
            hall_names: '1号馆',
            booth_numbers: '1A01',
            organizer_payment_total: 1800,
            venue_payment_total: 0,
            total_amount: 1800,
            venue_confirmed: 1,
            created_at: '2026-04-23 10:00:00',
            updated_at: '2026-04-23 10:30:00'
          },
          {
            id: 102,
            project_id: 7,
            company_name: '福州远洋渔业',
            sales_name: '李四',
            hall_names: '2号馆',
            booth_numbers: '2B08',
            organizer_payment_total: 0,
            venue_payment_total: 2200,
            total_amount: 2200,
            venue_confirmed: 0,
            created_at: '2026-04-23 11:00:00',
            updated_at: '2026-04-23 11:30:00'
          }
        ]
      } : { results: [] }),
      'FROM ExhibitionRefrigeratorRentalItems i': { results: [] },
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/refrigerator-rentals?projectId=7', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'exhibition_manager', name: 'expo01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].venue_confirmation_status, '已确认');
  assert.equal(payload.items[1].venue_confirmation_status, '未确认');
  const listCall = env.captured.allCalls.find((call) => call.sql.includes('FROM ExhibitionRefrigeratorRentals'));
  assert.ok(listCall);
  assert.equal(listCall.params.length, 1, 'exhibition manager list query should not be scoped by sales name');
}

async function testExportCsvRequiresSuperAdminAndBuildsRows() {
  const env = createMockEnv({
    allResponses: {
      'FROM ExhibitionRefrigeratorRentals': {
        results: [
          {
            id: 101,
            project_id: 7,
            company_name: '福建海洋科技',
            sales_name: '张三',
            hall_names: '1号馆',
            booth_numbers: '1A01',
            venue_confirmed: 1,
            organizer_payment_total: 1800,
            venue_payment_total: 0,
            total_amount: 1800,
            created_at: '2026-04-23 10:00:00',
            updated_at: '2026-04-23 10:30:00'
          }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: [
          {
            id: 1,
            rental_id: 101,
            config_id: 11,
            style_name_snapshot: '立式双门冰柜',
            spec_snapshot: '1200L',
            image_key_snapshot: null,
            unit_price_snapshot: 1800,
            quantity: 1,
            payment_method: 'organizer',
            line_amount: 1800,
            current_style_name: '立式双门冰柜',
            current_display_order: 1,
            current_is_active: 1
          }
        ]
      },
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      }
    }
  });
  const deniedRequest = new Request('http://localhost/api/exhibition/refrigerator-rentals-export?projectId=7', { method: 'GET' });
  const deniedResponse = await handleExhibitionRoutes({
    request: deniedRequest,
    env,
    url: new URL(deniedRequest.url),
    currentUser: { role: 'user', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  assert.equal(deniedResponse.status, 403);

  const exportRequest = new Request('http://localhost/api/exhibition/refrigerator-rentals-export?projectId=7', { method: 'GET' });
  const exportResponse = await handleExhibitionRoutes({
    request: exportRequest,
    env,
    url: new URL(exportRequest.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const csvBytes = new Uint8Array(await exportResponse.arrayBuffer());
  const csvText = new TextDecoder('utf-8').decode(csvBytes);
  assert.equal(exportResponse.status, 200);
  assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(csvText, /企业名称,主场确认状态,馆号,展位号\/使用地点,业务员姓名/);
  assert.match(csvText, /福建海洋科技,已确认,1号馆,"=""1A01""",张三/);

  const exhibitionManagerRequest = new Request('http://localhost/api/exhibition/refrigerator-rentals-export?projectId=7', { method: 'GET' });
  const exhibitionManagerResponse = await handleExhibitionRoutes({
    request: exhibitionManagerRequest,
    env,
    url: new URL(exhibitionManagerRequest.url),
    currentUser: { role: 'exhibition_manager', name: 'expo01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  assert.equal(exhibitionManagerResponse.status, 200);
}

async function testRentalListScopesSalesButAllowsAdminAll() {
  const env = createMockEnv({
    allResponses: {
      'FROM ExhibitionRefrigeratorRentals': (sql, params) => {
        if (params.length === 2 && params[1] === '张三') {
          return {
            results: [
              {
                id: 101,
                project_id: 7,
                company_name: '福建海洋科技',
                sales_name: '张三',
                hall_names: '1号馆',
                booth_numbers: '1A01',
                organizer_payment_total: 1800,
                venue_payment_total: 0,
                total_amount: 1800,
                created_at: '2026-04-23 10:00:00',
                updated_at: '2026-04-23 10:30:00'
              }
            ]
          };
        }
        return {
          results: [
            {
              id: 101,
              project_id: 7,
              company_name: '福建海洋科技',
              sales_name: '张三',
              hall_names: '1号馆',
              booth_numbers: '1A01',
              organizer_payment_total: 1800,
              venue_payment_total: 0,
              total_amount: 1800,
              created_at: '2026-04-23 10:00:00',
              updated_at: '2026-04-23 10:30:00'
            },
            {
              id: 102,
              project_id: 7,
              company_name: '福州远洋渔业',
              sales_name: '李四',
              hall_names: '2号馆',
              booth_numbers: '2B08',
              organizer_payment_total: 0,
              venue_payment_total: 2200,
              total_amount: 2200,
              created_at: '2026-04-23 11:00:00',
              updated_at: '2026-04-23 11:30:00'
            }
          ]
        };
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: []
      },
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      }
    }
  });
  const salesRequest = new Request('http://localhost/api/exhibition/refrigerator-rentals?projectId=7', { method: 'GET' });
  const salesResponse = await handleExhibitionRoutes({
    request: salesRequest,
    env,
    url: new URL(salesRequest.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const salesPayload = await salesResponse.json();
  assert.equal(salesResponse.status, 200);
  assert.equal(salesPayload.items.length, 1);
  assert.equal(salesPayload.items[0].company_name, '福建海洋科技');

  const adminRequest = new Request('http://localhost/api/exhibition/refrigerator-rentals?projectId=7', { method: 'GET' });
  const adminResponse = await handleExhibitionRoutes({
    request: adminRequest,
    env,
    url: new URL(adminRequest.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const adminPayload = await adminResponse.json();
  assert.equal(adminResponse.status, 200);
  assert.equal(adminPayload.items.length, 2);
}

async function testDeleteConfigBlockedWhenReferenced() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorConfigs': { id: 11 },
      'FROM ExhibitionRefrigeratorRentalItems': { ref_count: 2 }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/delete-refrigerator-config', {
    id: 11,
    project_id: 7
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error, '该冰柜样式已被租赁明细引用，不能删除，请先停用或保留历史配置');
  assert.equal(env.captured.runCalls.length, 0);
}

async function testDeleteConfigSucceedsWhenUnused() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorConfigs': { id: 11 },
      'FROM ExhibitionRefrigeratorRentalItems': { ref_count: 0 }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/delete-refrigerator-config', {
    id: 11,
    project_id: 7
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('DELETE FROM ExhibitionRefrigeratorConfigs')));
}

async function testDeleteRentalRequiresOwnership() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': {
        id: 901,
        project_id: 7,
        company_name: '福建海洋科技',
        sales_name: '张三'
      }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/delete-refrigerator-rental', {
    rental_id: 901
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '李四' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error, '无权限删除该租赁记录');
  assert.equal(env.captured.runCalls.length, 0);
}

async function testConfirmedRentalCannotBeDeleted() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': {
        id: 901,
        project_id: 7,
        company_name: '福建海洋科技',
        sales_name: '张三',
        venue_confirmed: 1
      }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/delete-refrigerator-rental', {
    rental_id: 901
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error, '该租赁记录已被主场确认，需先驳回后才能删除');
}

async function testExhibitionManagerCanConfirmAndRejectRentals() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': (sql, params) => ({
        id: Number(params[0] || 0),
        project_id: 7,
        company_name: '福建海洋科技',
        sales_name: '张三',
        venue_confirmed: 0
      })
    },
    runResponses: {
      'UPDATE ExhibitionRefrigeratorRentals\n          SET venue_confirmed': { meta: { changes: 1 } }
    }
  });
  const confirmRequest = jsonRequest('http://localhost/api/exhibition/refrigerator-rental-confirmation', {
    rental_ids: [901, 902],
    confirmed: 1
  });
  const confirmResponse = await handleExhibitionRoutes({
    request: confirmRequest,
    env,
    url: new URL(confirmRequest.url),
    currentUser: { role: 'exhibition_manager', name: 'expo01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const confirmPayload = await confirmResponse.json();
  assert.equal(confirmResponse.status, 200);
  assert.equal(confirmPayload.updated_count, 2);
  const confirmCalls = env.captured.runCalls.filter((call) => call.sql.includes('SET venue_confirmed'));
  assert.equal(confirmCalls.length, 2);
  assert.equal(confirmCalls[0].params[0], 1);
  assert.equal(confirmCalls[0].params[1], 'expo01');

  env.captured.runCalls.length = 0;
  const rejectRequest = jsonRequest('http://localhost/api/exhibition/refrigerator-rental-confirmation', {
    rental_id: 901,
    confirmed: 0
  });
  const rejectResponse = await handleExhibitionRoutes({
    request: rejectRequest,
    env,
    url: new URL(rejectRequest.url),
    currentUser: { role: 'exhibition_manager', name: 'expo01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const rejectPayload = await rejectResponse.json();
  assert.equal(rejectResponse.status, 200);
  assert.equal(rejectPayload.updated_count, 1);
  const rejectCall = env.captured.runCalls.find((call) => call.sql.includes('SET venue_confirmed'));
  assert.ok(rejectCall);
  assert.equal(rejectCall.params[0], 0);
  assert.equal(rejectCall.params[1], '');
}

async function testAdminCanSaveOtherSalesRental() {
  const env = createMockEnv({
    allResponses: {
      'FROM Orders': {
        results: [
          { company_name: '福建海洋科技', sales_name: '张三', booth_id: '1A01', created_at: '2026-04-23 10:00:00' }
        ]
      },
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: []
      },
      'FROM Booths': {
        results: [
          { id: '1A01', hall: '1号馆' }
        ]
      }
    },
    firstResponses: {
      'WHERE id = ?': { id: 901, project_id: 7, company_name: '福建海洋科技', sales_name: '张三', hall_names: '1号馆', booth_numbers: '1A01' },
      'WHERE project_id = ?\n        AND company_name = ?': { id: 901 }
    },
    runResponses: {
      'UPDATE ExhibitionRefrigeratorRentals': { meta: { changes: 1 } },
      'DELETE FROM ExhibitionRefrigeratorRentalItems': { meta: { changes: 1 } },
      'INSERT INTO ExhibitionRefrigeratorRentalItems': { meta: { changes: 1 } }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/refrigerator-rentals', {
    project_id: 7,
    rental_id: 901,
    company_name: '福建海洋科技',
    items: [
      { config_id: 11, quantity: 1, payment_method: 'venue' }
    ]
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('UPDATE ExhibitionRefrigeratorRentals')));
}

async function testEditingRentalCanSwitchOrderSubject() {
  const env = createMockEnv({
    allResponses: {
      'FROM Orders': {
        results: [
          { company_name: '福州远洋渔业', sales_name: '李四', booth_id: '2B08', created_at: '2026-04-23 10:00:00' }
        ]
      },
      'FROM ExhibitionRefrigeratorConfigs': {
        results: [
          { id: 11, project_id: 7, style_name: '立式双门冰柜', spec: '1200L', image_key: null, unit_price: 1800, stock_quantity: 12, is_active: 1, display_order: 1 }
        ]
      },
      'FROM ExhibitionRefrigeratorRentalItems i': {
        results: []
      },
      'FROM Booths': {
        results: [
          { id: '2B08', hall: '2号馆' }
        ]
      }
    },
    firstResponses: {
      'WHERE id = ?': { id: 901, project_id: 7, company_name: '福建海洋科技', sales_name: '张三', hall_names: '1号馆', booth_numbers: '1A01' },
      'WHERE project_id = ?\n        AND company_name = ?': null
    },
    runResponses: {
      'UPDATE ExhibitionRefrigeratorRentals': { meta: { changes: 1 } },
      'DELETE FROM ExhibitionRefrigeratorRentalItems': { meta: { changes: 1 } },
      'INSERT INTO ExhibitionRefrigeratorRentalItems': { meta: { changes: 1 } }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/refrigerator-rentals', {
    project_id: 7,
    rental_id: 901,
    company_name: '福州远洋渔业',
    items: [
      { config_id: 11, quantity: 1, payment_method: 'venue' }
    ]
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  const rentalUpdate = env.captured.runCalls.find((call) => call.sql.includes('UPDATE ExhibitionRefrigeratorRentals'));
  assert.ok(rentalUpdate);
  assert.equal(rentalUpdate.params[0], '福州远洋渔业');
  assert.equal(rentalUpdate.params[1], '李四');
  assert.equal(rentalUpdate.params[3], '2号馆');
  assert.equal(rentalUpdate.params[4], '2B08');
}

async function testDeleteRentalSucceedsForOwner() {
  const env = createMockEnv({
    firstResponses: {
      'FROM ExhibitionRefrigeratorRentals': {
        id: 901,
        project_id: 7,
        company_name: '福建海洋科技',
        sales_name: '张三'
      }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/delete-refrigerator-rental', {
    rental_id: 901
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('DELETE FROM ExhibitionRefrigeratorRentalItems')));
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('DELETE FROM ExhibitionRefrigeratorRentals')));
}

async function testLintelListBuildsEligibleRowsWithDefaults() {
  const env = createMockEnv({
    allResponses: {
      'FROM Orders o': {
        results: [
          {
            id: 301,
            company_name: '福州海洋渔业科技发展有限公司',
            sales_name: '张三',
            booth_id: '1A01,1B01,1C01',
            created_at: '2026-04-23 10:00:00'
          }
        ]
      },
      'SELECT id, hall, type\n          FROM Booths': {
        results: [
          { id: '1A01', hall: '1号馆', type: '标摊' },
          { id: '1B01', hall: '1号馆', type: '豪标' },
          { id: '1C01', hall: '1号馆', type: '光地' }
        ]
      },
      'FROM ExhibitionLintels\n      WHERE project_id = ?': {
        results: [
          {
            id: 91,
            project_id: 7,
            order_id: 301,
            booth_code: '1A01',
            name_zh: '海洋渔业科技',
            name_en: 'Ocean Tech',
            remark: '靠墙制作',
            business_confirmed: 1,
            business_confirmed_by: '张三',
            business_confirmed_at: '2026-04-23 12:00:00',
            exhibition_confirmed: 0,
            exhibition_confirmed_by: '',
            exhibition_confirmed_at: '',
            created_at: '2026-04-23 11:00:00',
            updated_at: '2026-04-23 12:00:00'
          }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/lintels?projectId=7', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].booth_code, '1A01');
  assert.equal(payload.items[0].hall, '1号馆');
  assert.equal(payload.items[0].business_confirm_status, '业务已确认');
  assert.equal(payload.items[0].name_en, 'Ocean Tech');
  assert.equal(payload.items[1].booth_code, '1B01');
  assert.equal(payload.items[1].booth_type_label, '升级标摊');
  assert.equal(payload.items[1].company_name, '福州海洋渔业科技发展有限公司');
  assert.equal(payload.items[1].business_confirm_status, '未确认');
  assert.equal(payload.items[1].sales_name, '张三');
  assert.equal(payload.items[1].name_zh.length > 0, true);
}

async function testLintelListExpandsLegacyTruncatedDefaultChineseName() {
  const companyName = '福建海洋渔业科技发展有限公司';
  const env = createMockEnv({
    allResponses: {
      'FROM Orders o': {
        results: [
          {
            id: 302,
            company_name: companyName,
            sales_name: '李四',
            booth_id: '2A01',
            created_at: '2026-04-23 15:00:00'
          }
        ]
      },
      'SELECT id, hall, type\n          FROM Booths': {
        results: [
          { id: '2A01', hall: '2号馆', type: '标摊' }
        ]
      },
      'FROM ExhibitionLintels\n      WHERE project_id = ?': {
        results: [
          {
            id: 92,
            project_id: 7,
            order_id: 302,
            booth_code: '2A01',
            name_zh: '福建海洋渔业科技发展有限',
            name_en: '',
            remark: '',
            business_confirmed: 0,
            business_confirmed_by: '',
            business_confirmed_at: '',
            exhibition_confirmed: 0,
            exhibition_confirmed_by: '',
            exhibition_confirmed_at: '',
            created_at: '2026-04-23 15:10:00',
            updated_at: '2026-04-23 15:10:00'
          }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/lintels?projectId=7', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].name_zh, companyName);
}

async function testSaveLintelEditsCreatesSparseRecord() {
  let lintelLookupCount = 0;
  const env = createMockEnv({
    firstResponses: {
      'FROM Orders\n      WHERE id = ? AND project_id = ?': {
        id: 301,
        company_name: '福建海洋科技有限公司',
        sales_name: '张三',
        booth_id: '1A01',
        status: '正常',
        deleted_at: '',
        created_at: '2026-04-23 10:00:00'
      },
      'FROM Booths\n      WHERE project_id = ? AND id = ?': {
        id: '1A01',
        hall: '1号馆',
        type: '标摊'
      },
      'FROM ExhibitionLintels\n      WHERE project_id = ? AND order_id = ? AND booth_code = ?': () => {
        lintelLookupCount += 1;
        if (lintelLookupCount === 1) return null;
        return {
          id: 101,
          project_id: 7,
          order_id: 301,
          booth_code: '1A01',
          name_zh: '福建海洋',
          name_en: '',
          remark: '',
          business_confirmed: 0,
          business_confirmed_by: '',
          business_confirmed_at: '',
          exhibition_confirmed: 0,
          exhibition_confirmed_by: '',
          exhibition_confirmed_at: '',
          created_at: '2026-04-23 10:10:00',
          updated_at: '2026-04-23 10:10:00'
        };
      }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/lintel-save', {
    project_id: 7,
    order_id: 301,
    booth_code: '1A01',
    name_zh: '福建海洋科技',
    name_en: 'FJ Ocean Tech',
    remark: '如有特殊要求请写明'
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('INSERT OR IGNORE INTO ExhibitionLintels')));
  const updateCall = env.captured.runCalls.find((call) => call.sql.includes('UPDATE ExhibitionLintels\n      SET name_zh = ?'));
  assert.ok(updateCall);
  assert.equal(updateCall.params[0], '福建海洋科技');
  assert.equal(updateCall.params[1], 'FJ Ocean Tech');
  assert.equal(updateCall.params[2], '如有特殊要求请写明');
}

async function testBusinessWithdrawBlockedAfterExhibitionConfirmation() {
  const env = createMockEnv({
    firstResponses: {
      'FROM Orders\n      WHERE id = ? AND project_id = ?': {
        id: 301,
        company_name: '福建海洋科技有限公司',
        sales_name: '张三',
        booth_id: '1A01',
        status: '正常',
        deleted_at: '',
        created_at: '2026-04-23 10:00:00'
      },
      'FROM Booths\n      WHERE project_id = ? AND id = ?': {
        id: '1A01',
        hall: '1号馆',
        type: '标摊'
      },
      'FROM ExhibitionLintels\n      WHERE project_id = ? AND order_id = ? AND booth_code = ?': {
        id: 101,
        project_id: 7,
        order_id: 301,
        booth_code: '1A01',
        name_zh: '福建海洋科技',
        name_en: '',
        remark: '',
        business_confirmed: 1,
        business_confirmed_by: '张三',
        business_confirmed_at: '2026-04-23 11:00:00',
        exhibition_confirmed: 1,
        exhibition_confirmed_by: 'admin',
        exhibition_confirmed_at: '2026-04-23 11:30:00',
        created_at: '2026-04-23 10:10:00',
        updated_at: '2026-04-23 11:30:00'
      }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/lintel-business-confirmation', {
    project_id: 7,
    confirmed: 0,
    items: [{ order_id: 301, booth_code: '1A01' }]
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'user', name: '张三' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error, '展务已确认，请联系展务组修改');
}

async function testSuperAdminCanToggleLintelExhibitionConfirmation() {
  const env = createMockEnv({
    firstResponses: {
      'FROM Orders\n      WHERE id = ? AND project_id = ?': {
        id: 301,
        company_name: '福建海洋科技有限公司',
        sales_name: '张三',
        booth_id: '1A01',
        status: '正常',
        deleted_at: '',
        created_at: '2026-04-23 10:00:00'
      },
      'FROM Booths\n      WHERE project_id = ? AND id = ?': {
        id: '1A01',
        hall: '1号馆',
        type: '标摊'
      },
      'FROM ExhibitionLintels\n      WHERE project_id = ? AND order_id = ? AND booth_code = ?': {
        id: 101,
        project_id: 7,
        order_id: 301,
        booth_code: '1A01',
        name_zh: '福建海洋科技',
        name_en: '',
        remark: '',
        business_confirmed: 1,
        business_confirmed_by: '张三',
        business_confirmed_at: '2026-04-23 11:00:00',
        exhibition_confirmed: 0,
        exhibition_confirmed_by: '',
        exhibition_confirmed_at: '',
        created_at: '2026-04-23 10:10:00',
        updated_at: '2026-04-23 11:00:00'
      }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/lintel-exhibition-confirmation', {
    project_id: 7,
    confirmed: 1,
    items: [{ order_id: 301, booth_code: '1A01' }]
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.updated_count, 1);
  const updateCall = env.captured.runCalls.find((call) => call.sql.includes('SET exhibition_confirmed = ?'));
  assert.ok(updateCall);
  assert.equal(updateCall.params[0], 1);
  assert.equal(updateCall.params[1], 'admin');
}

async function testSpecialDecorationListFiltersAndSortsGroundOrders() {
  const env = createMockEnv({
    allResponses: {
      'SELECT o.id, o.company_name, o.sales_name, o.booth_id, o.area, o.created_at': {
        results: [
          { id: 501, company_name: '福建远洋科技有限公司', sales_name: '张三', booth_id: '1A03,1A01', area: 54, created_at: '2026-04-25 10:00:00' },
          { id: 502, company_name: '福州海鲜供应链有限公司', sales_name: '李四', booth_id: '1A02', area: 36, created_at: '2026-04-25 11:00:00' },
          { id: 503, company_name: '普通标摊企业', sales_name: '王五', booth_id: '1B01', area: 9, created_at: '2026-04-25 12:00:00' }
        ]
      },
      'SELECT id, hall, type, area': {
        results: [
          { id: '1A01', hall: '1号馆', type: '光地', area: 27 },
          { id: '1A02', hall: '1号馆', type: '光地', area: 36 },
          { id: '1A03', hall: '1号馆', type: '光地', area: 27 },
          { id: '1B01', hall: '1号馆', type: '标摊', area: 9 }
        ]
      },
      'FROM ExhibitionSpecialDecorationReports': {
        results: [
          { id: 71, project_id: 7, order_id: 502, reported: 1, reported_by: 'expo01', reported_at: '2026-04-25 12:00:00', updated_by: 'expo01', created_at: '2026-04-25 12:00:00', updated_at: '2026-04-25 12:00:00' }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/special-decorations?projectId=7&status=reported&hall=1%E5%8F%B7%E9%A6%86&salesName=%E6%9D%8E%E5%9B%9B&search=%E6%B5%B7%E9%B2%9C', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.total, 1);
  assert.equal(payload.pageSize, 20);
  assert.equal(payload.can_toggle, true);
  assert.equal(payload.items[0].order_id, 502);
  assert.equal(payload.items[0].report_status, '已报图');
  assert.equal(payload.items[0].hall, '1号馆');
  assert.equal(payload.items[0].booth_code, '1A02');
  assert.equal(payload.items[0].area, 36);
  assert.deepEqual(payload.hall_options, ['1号馆']);
  assert.deepEqual(payload.sales_options, ['李四', '张三']);
}

async function testSpecialDecorationListGroupsJointGroundBoothWhenMapDisplayNameExists() {
  const env = createMockEnv({
    allResponses: {
      'SELECT o.id, o.company_name, o.sales_name, o.booth_id, o.area, o.created_at': {
        results: [
          { id: 801, company_name: '福建海产甲公司', sales_name: '张三', booth_id: '4G01', area: 20, created_at: '2026-04-25 10:00:00' },
          { id: 802, company_name: '福建海产乙公司', sales_name: '李四', booth_id: '4G01', area: 34, created_at: '2026-04-25 10:05:00' },
          { id: 803, company_name: '福建海产丙公司', sales_name: '王五', booth_id: '4G02', area: 15, created_at: '2026-04-25 10:10:00' },
          { id: 804, company_name: '福建海产丁公司', sales_name: '赵六', booth_id: '4G02', area: 15, created_at: '2026-04-25 10:15:00' }
        ]
      },
      'SELECT id, hall, type, area': {
        results: [
          { id: '4G01', hall: '4号馆', type: '光地', area: 54 },
          { id: '4G02', hall: '4号馆', type: '光地', area: 30 }
        ]
      },
      'SELECT booth_code, label_style_json': {
        results: [
          { booth_code: '4G01', label_style_json: '{"companyTextOverride":"海洋联合展团"}' },
          { booth_code: '4G02', label_style_json: '{}' }
        ]
      },
      'FROM ExhibitionSpecialDecorationReports': {
        results: [
          { id: 91, project_id: 7, order_id: 801, reported: 1, reported_by: 'expo01', reported_at: '2026-04-25 12:00:00', updated_by: 'expo01', created_at: '2026-04-25 12:00:00', updated_at: '2026-04-25 12:00:00' },
          { id: 92, project_id: 7, order_id: 802, reported: 1, reported_by: 'expo01', reported_at: '2026-04-25 12:01:00', updated_by: 'expo01', created_at: '2026-04-25 12:01:00', updated_at: '2026-04-25 12:01:00' }
        ]
      }
    }
  });
  const request = new Request('http://localhost/api/exhibition/special-decorations?projectId=7', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'super_admin', name: 'admin' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.total, 3);

  const groupedRow = payload.items.find((row) => row.booth_code === '4G01');
  assert.ok(groupedRow);
  assert.equal(groupedRow.company_name, '海洋联合展团');
  assert.deepEqual(groupedRow.order_ids, [801, 802]);
  assert.equal(groupedRow.area, 54);
  assert.equal(groupedRow.report_status, '已报图');
  assert.equal(groupedRow.display_name_source, 'booth_map_company_text_override');
  assert.equal(groupedRow.is_joint_display_group, 1);

  const splitRows = payload.items.filter((row) => row.booth_code === '4G02');
  assert.equal(splitRows.length, 2);
  assert.deepEqual(splitRows.map((row) => row.company_name).sort(), ['福建海产丁公司', '福建海产丙公司']);
  assert.deepEqual(splitRows.map((row) => row.area), [30, 30]);
}

async function testSpecialDecorationListPaginatesTwentyRowsAndScopesAdmin() {
  const orderRows = Array.from({ length: 21 }, (_, index) => ({
    id: 600 + index + 1,
    company_name: `光地企业${String(index + 1).padStart(2, '0')}`,
    sales_name: 'manager01',
    booth_id: `2A${String(index + 1).padStart(2, '0')}`,
    area: 18,
    created_at: `2026-04-25 10:${String(index).padStart(2, '0')}:00`
  }));
  const boothRows = orderRows.map((row) => ({ id: row.booth_id, hall: '2号馆', type: '光地', area: 18 }));
  const env = createMockEnv({
    allResponses: {
      'SELECT o.id, o.company_name, o.sales_name, o.booth_id, o.area, o.created_at': { results: orderRows },
      'SELECT id, hall, type, area': { results: boothRows },
      'FROM ExhibitionSpecialDecorationReports': { results: [] }
    }
  });
  const request = new Request('http://localhost/api/exhibition/special-decorations?projectId=7&page=2', { method: 'GET' });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.total, 21);
  assert.equal(payload.page, 2);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].sequence, 21);
  assert.equal(payload.items[0].booth_code, '2A21');
  assert.equal(payload.can_toggle, false);
  const orderQuery = env.captured.allCalls.find((call) => call.sql.includes('FROM Orders o') && call.sql.includes('o.sales_name = ?'));
  assert.ok(orderQuery);
  assert.equal(orderQuery.params.includes('manager01'), true);
}

async function testExhibitionManagerCanToggleSpecialDecorationReport() {
  const env = createMockEnv({
    firstResponses: {
      'FROM Orders': {
        id: 701,
        company_name: '福建光地科技有限公司',
        sales_name: '张三',
        booth_id: '3A01',
        area: 54,
        status: '正常',
        deleted_at: '',
        created_at: '2026-04-25 13:00:00'
      }
    },
    allResponses: {
      'SELECT id, hall, type, area': {
        results: [{ id: '3A01', hall: '3号馆', type: '光地', area: 54 }]
      },
      'FROM BoothMaps': { results: [] }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/special-decoration-report-status', {
    project_id: 7,
    order_ids: [701],
    reported: 1
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'exhibition_manager', name: 'expo01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.updated_count, 1);
  assert.ok(env.captured.runCalls.some((call) => call.sql.includes('INSERT OR IGNORE INTO ExhibitionSpecialDecorationReports')));
  const updateCall = env.captured.runCalls.find((call) => call.sql.includes('SET reported = ?'));
  assert.ok(updateCall);
  assert.equal(updateCall.params[0], 1);
  assert.equal(updateCall.params[1], 'expo01');
}

async function testAdminCannotToggleSpecialDecorationReport() {
  const request = jsonRequest('http://localhost/api/exhibition/special-decoration-report-status', {
    project_id: 7,
    order_ids: [701],
    reported: 1
  });
  const response = await handleExhibitionRoutes({
    request,
    env: createMockEnv(),
    url: new URL(request.url),
    currentUser: { role: 'admin', name: 'manager01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error, '仅超级管理员或展务管理员可确认报图');
}

async function testSpecialDecorationToggleRejectsNonGroundOrder() {
  const env = createMockEnv({
    firstResponses: {
      'FROM Orders': {
        id: 702,
        company_name: '标摊企业',
        sales_name: '张三',
        booth_id: '3B01',
        area: 9,
        status: '正常',
        deleted_at: '',
        created_at: '2026-04-25 14:00:00'
      }
    },
    allResponses: {
      'SELECT id, hall, type, area': {
        results: [{ id: '3B01', hall: '3号馆', type: '标摊', area: 9 }]
      }
    }
  });
  const request = jsonRequest('http://localhost/api/exhibition/special-decoration-report-status', {
    project_id: 7,
    order_ids: [702],
    reported: 1
  });
  const response = await handleExhibitionRoutes({
    request,
    env,
    url: new URL(request.url),
    currentUser: { role: 'exhibition_manager', name: 'expo01' },
    corsHeaders: { 'Content-Type': 'application/json' }
  });
  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.equal(payload.error, '存在无效的光地企业记录');
  assert.equal(env.captured.runCalls.length, 0);
}

async function run() {
  await testListConfigs();
  await testSaveRental();
  await testRentalDetailPreservesDuplicateConfigLines();
  await testSaveNoBoothRental();
  await testRentalDetailIncludesNoBoothFields();
  await testExhibitionManagerCanListAllRentals();
  await testExportCsvRequiresSuperAdminAndBuildsRows();
  await testRentalListScopesSalesButAllowsAdminAll();
  await testDeleteConfigBlockedWhenReferenced();
  await testDeleteConfigSucceedsWhenUnused();
  await testDeleteRentalRequiresOwnership();
  await testConfirmedRentalCannotBeDeleted();
  await testExhibitionManagerCanConfirmAndRejectRentals();
  await testAdminCanSaveOtherSalesRental();
  await testEditingRentalCanSwitchOrderSubject();
  await testDeleteRentalSucceedsForOwner();
  await testLintelListBuildsEligibleRowsWithDefaults();
  await testLintelListExpandsLegacyTruncatedDefaultChineseName();
  await testSaveLintelEditsCreatesSparseRecord();
  await testBusinessWithdrawBlockedAfterExhibitionConfirmation();
  await testSuperAdminCanToggleLintelExhibitionConfirmation();
  await testSpecialDecorationListFiltersAndSortsGroundOrders();
  await testSpecialDecorationListGroupsJointGroundBoothWhenMapDisplayNameExists();
  await testSpecialDecorationListPaginatesTwentyRowsAndScopesAdmin();
  await testExhibitionManagerCanToggleSpecialDecorationReport();
  await testAdminCannotToggleSpecialDecorationReport();
  await testSpecialDecorationToggleRejectsNonGroundOrder();
  console.log('Exhibition route tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
