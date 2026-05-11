import assert from 'node:assert/strict';
import { handleBoothMapRoutes } from '../src/routes/booth-maps.mjs';
import { handleDashboardRoutes } from '../src/routes/dashboard.mjs';
import { handleOrderRoutes } from '../src/routes/orders.mjs';

const CORS = { 'Content-Type': 'application/json' };

function createFreeBoothE2EEnv() {
  const freeOrder = {
    id: 301,
    project_id: 1,
    company_name: '免费展位样本企业',
    sales_name: '陈晓莉',
    booth_id: '1D72',
    booth_display_name: '免费样本',
    area: 9,
    total_booth_fee: 0,
    other_income: 0,
    total_amount: 0,
    paid_amount: 0,
    status: '正常',
    created_at: '2026-04-20 11:13:32',
    region: '福建省 - 福州市',
    hall: '1号馆',
    booth_type: '标摊',
    reserved_release_due_at: ''
  };
  const reservedOrder = {
    id: 302,
    project_id: 1,
    company_name: '普通预留样本企业',
    sales_name: '陈晓莉',
    booth_id: '1D73',
    booth_display_name: '普通样本',
    area: 9,
    total_booth_fee: 1000,
    other_income: 0,
    total_amount: 1000,
    paid_amount: 0,
    status: '正常',
    created_at: '2026-04-20 11:20:00',
    region: '福建省 - 福州市',
    hall: '1号馆',
    booth_type: '标摊',
    reserved_release_due_at: '2026-04-20 12:20:00'
  };
  const groundOrder = {
    id: 303,
    project_id: 1,
    company_name: '光地报图样本企业',
    sales_name: '陈晓莉',
    booth_id: '1G01',
    booth_display_name: '光地样本',
    area: 36,
    total_booth_fee: 1000,
    other_income: 0,
    total_amount: 1000,
    paid_amount: 1000,
    status: '正常',
    created_at: '2026-04-20 11:30:00',
    region: '福建省 - 福州市',
    hall: '1号馆',
    booth_type: '光地',
    reserved_release_due_at: ''
  };

  const orders = [freeOrder, reservedOrder];

  const toOrderListRow = (order) => ({
    ...order,
    can_manage: 1,
    can_preview_contract: 1,
    has_contract: 0,
    contract_url: null,
    contact_person: '测试联系人',
    phone: '13800000000',
    overpaid_amount: 0,
    overpayment_status: '',
    overpayment_reason: '',
    overpayment_note: '',
    overpayment_handled_by: '',
    overpayment_handled_at: '',
    can_handle_overpayment: 1,
    reserved_release_status: order.paid_amount > 0 ? 'paid' : (order.reserved_release_due_at ? 'running' : 'disabled'),
    reserved_release_remaining_seconds: order.reserved_release_due_at ? 3600 : null
  });

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
            if (sql.includes('datetime(o.reserved_release_due_at) <=') && sql.includes('NOT EXISTS')) return null;
            if (sql.includes('FROM Projects')) {
              return { id: 1, name: '2026 福州渔博会', year: 2026 };
            }
            if (sql.includes('FROM Staff WHERE name = ?')) {
              return { name: '陈晓莉', role: 'sales', target: 5, display_order: 1, exclude_from_sales_ranking: 0 };
            }
            if (sql.includes('today_paid_booth_count')) {
              return {
                today_paid_booth_count: 0,
                week_paid_booth_count: 0,
                month_paid_booth_count: 0,
                total_paid_booth_count: 0,
                today_paid_company_count: 0,
                week_paid_company_count: 0,
                month_paid_company_count: 0,
                total_paid_company_count: 0
              };
            }
            if (sql.includes('COUNT(*) AS total')) {
              if (sql.includes('COALESCE(o.total_amount, 0) <= 0 OR COALESCE(o.paid_amount, 0) >= COALESCE(o.total_amount, 0)')) {
                return { total: 1 };
              }
              if (sql.includes('COALESCE(o.total_amount, 0) > 0 AND COALESCE(o.paid_amount, 0) <= 0')) {
                return { total: 1 };
              }
              return { total: orders.length };
            }
            if (sql.includes('FROM BoothMaps')) {
              return {
                id: 99,
                project_id: 1,
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
            if (sql.includes('datetime(o.reserved_release_due_at) <=') && sql.includes('NOT EXISTS')) {
              return { results: [] };
            }
            if (sql.includes('FROM Orders o') && sql.includes('LEFT JOIN Booths b ON o.booth_id = b.id') && sql.includes('o.total_booth_fee')) {
              return {
                results: orders.map((order) => ({
                  id: order.id,
                  region: order.region,
                  area: order.area,
                  total_booth_fee: order.total_booth_fee,
                  total_amount: order.total_amount,
                  paid_amount: order.paid_amount,
                  sales_name: order.sales_name,
                  hall: order.hall,
                  booth_type: order.booth_type
                }))
              };
            }
            if (sql.includes('FROM OrderBoothChanges')) {
              return { results: [] };
            }
            if (sql.includes('MIN(substr(p.payment_time')) {
              return { results: [] };
            }
            if (sql.includes('FROM Staff') && sql.includes('exclude_from_sales_ranking')) {
              return {
                results: [
                  { name: '陈晓莉', role: 'sales', target: 5, display_order: 1, exclude_from_sales_ranking: 0 }
                ]
              };
            }
            if (sql.includes('ROUND(SUM(p.amount), 2) AS total_received')) {
              return { results: [] };
            }
            if (sql.includes('GROUP BY o.sales_name, p_year, p_month')) {
              return { results: [] };
            }
            if (sql.includes('GROUP BY agg.p_year, agg.p_month')) {
              return { results: [] };
            }
            if (sql.includes("GROUP BY COALESCE(NULLIF(TRIM(o.region), ''), '未注明地区')")) {
              return {
                results: [
                  { region: '福建省 - 福州市', company_count: 2, booth_count: 2 }
                ]
              };
            }
            if (sql.includes('CASE WHEN ? = 1 OR o.sales_name = ? THEN 1 ELSE 0 END AS can_manage')) {
              if (sql.includes('COALESCE(o.total_amount, 0) <= 0 OR COALESCE(o.paid_amount, 0) >= COALESCE(o.total_amount, 0)')) {
                return { results: [toOrderListRow(freeOrder)] };
              }
              if (sql.includes('COALESCE(o.total_amount, 0) > 0 AND COALESCE(o.paid_amount, 0) <= 0')) {
                return { results: [toOrderListRow(reservedOrder)] };
              }
              return { results: orders.map(toOrderListRow) };
            }
            if (sql.includes('FROM BoothMapItems bmi')) {
              return {
                results: [
                  {
                    id: 1,
                    project_id: 1,
                    map_id: 99,
                    booth_code: '1D72',
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
                    points_json: '[]',
                    label_style_json: '{}',
                    z_index: 1,
                    hidden: 0,
                    booth_status: '可售',
                    booth_source: 'manual',
                    active_order_count: 0
                  },
                  {
                    id: 2,
                    project_id: 1,
                    map_id: 99,
                    booth_code: '1G01',
                    hall: '1号馆',
                    booth_type: '光地',
                    opening_type: '双开口',
                    width_m: 6,
                    height_m: 6,
                    area: 36,
                    x: 200,
                    y: 100,
                    rotation: 0,
                    stroke_width: 2,
                    shape_type: 'rect',
                    points_json: '[]',
                    label_style_json: '{}',
                    z_index: 2,
                    hidden: 0,
                    booth_status: '可售',
                    booth_source: 'manual',
                    active_order_count: 0
                  }
                ]
              };
            }
            if (sql.includes('FROM Orders o') && sql.includes('INSTR(')) {
              return {
                results: [
                  {
                    id: freeOrder.id,
                    booth_id: freeOrder.booth_id,
                    company_name: freeOrder.company_name,
                    booth_display_name: freeOrder.booth_display_name,
                    sales_name: freeOrder.sales_name,
                    paid_amount: freeOrder.paid_amount,
                    total_amount: freeOrder.total_amount,
                    created_at: freeOrder.created_at,
                    reserved_release_due_at: freeOrder.reserved_release_due_at
                  },
                  {
                    id: groundOrder.id,
                    booth_id: groundOrder.booth_id,
                    company_name: groundOrder.company_name,
                    booth_display_name: groundOrder.booth_display_name,
                    sales_name: groundOrder.sales_name,
                    paid_amount: groundOrder.paid_amount,
                    total_amount: groundOrder.total_amount,
                    created_at: groundOrder.created_at,
                    reserved_release_due_at: groundOrder.reserved_release_due_at
                  }
                ]
              };
            }
            if (sql.includes('FROM ExhibitionLintels')) {
              return {
                results: [
                  {
                    order_id: freeOrder.id,
                    booth_code: freeOrder.booth_id,
                    business_confirmed: 1
                  }
                ]
              };
            }
            if (sql.includes('FROM ExhibitionSpecialDecorationReports')) {
              return {
                results: [
                  { order_id: groundOrder.id, reported: 1 }
                ]
              };
            }
            return { results: [] };
          }
        };
      }
    }
  };
}

async function runTests() {
  const env = createFreeBoothE2EEnv();

  const homeResponse = await handleDashboardRoutes({
    request: new Request('http://localhost/api/home-dashboard?projectId=1', { method: 'GET' }),
    env,
    url: new URL('http://localhost/api/home-dashboard?projectId=1'),
    currentUser: { role: 'sales', name: '陈晓莉' },
    corsHeaders: CORS
  });
  const homePayload = await homeResponse.json();
  assert.equal(homePayload.home_progress.full_paid_booth_count, 1);
  assert.equal(homePayload.home_progress.deposit_booth_count, 0);
  assert.equal(homePayload.sales_summary_periods.total.full_paid_booth_count, 1);
  assert.equal(homePayload.sales_summary_periods.total.reserved_booth_count, 1);

  const fullPaidResponse = await handleOrderRoutes({
    request: new Request('http://localhost/api/orders?projectId=1&page=1&pageSize=20&paymentStatus=%E5%85%A8%E6%AC%BE', { method: 'GET' }),
    env,
    url: new URL('http://localhost/api/orders?projectId=1&page=1&pageSize=20&paymentStatus=%E5%85%A8%E6%AC%BE'),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders: CORS
  });
  const fullPaidPayload = await fullPaidResponse.json();
  assert.equal(fullPaidPayload.total, 1);
  assert.deepEqual(fullPaidPayload.items.map((item) => item.id), [301]);

  const unpaidResponse = await handleOrderRoutes({
    request: new Request('http://localhost/api/orders?projectId=1&page=1&pageSize=20&paymentStatus=%E6%9C%AA%E4%BB%98', { method: 'GET' }),
    env,
    url: new URL('http://localhost/api/orders?projectId=1&page=1&pageSize=20&paymentStatus=%E6%9C%AA%E4%BB%98'),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders: CORS
  });
  const unpaidPayload = await unpaidResponse.json();
  assert.equal(unpaidPayload.total, 1);
  assert.deepEqual(unpaidPayload.items.map((item) => item.id), [302]);

  const runtimeResponse = await handleBoothMapRoutes({
    request: new Request('http://localhost/api/booth-map-runtime-view?id=99&projectId=1', { method: 'GET' }),
    env,
    url: new URL('http://localhost/api/booth-map-runtime-view?id=99&projectId=1'),
    currentUser: { role: 'admin', name: 'admin' },
    corsHeaders: CORS
  });
  const runtimePayload = await runtimeResponse.json();
  assert.equal(runtimePayload.success, true);
  assert.equal(runtimePayload.items.length, 2);
  const standardItem = runtimePayload.items.find((item) => item.booth_code === '1D72');
  const groundItem = runtimePayload.items.find((item) => item.booth_code === '1G01');
  assert.ok(standardItem);
  assert.ok(groundItem);
  assert.equal(standardItem.status_code, 'full_paid');
  assert.equal(standardItem.status_label, '已付全款');
  assert.equal(standardItem.lintel_status_code, 'confirmed');
  assert.equal(standardItem.lintel_status_label, '楣板已业务确认');
  assert.equal(standardItem.lintel_business_confirmed, 1);
  assert.equal(standardItem.exhibition_status_code, 'lintel_confirmed');
  assert.equal(standardItem.exhibition_status_source, 'lintel');
  assert.equal(groundItem.exhibition_status_code, 'special_decoration_reported');
  assert.equal(groundItem.exhibition_status_label, '光地已报图');
  assert.equal(groundItem.exhibition_status_source, 'special_decoration');
}

await runTests();
console.log('Free booth end-to-end test passed');