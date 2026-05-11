import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { estimateBoothMapSaveD1CallCount } from '../src/routes/booth-maps.mjs';
import { normalizeOrderListParams } from '../src/routes/orders.mjs';

function getUtf8ByteLength(value) {
  return new TextEncoder().encode(String(value || '')).length;
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...tokens) {
      tokens.filter(Boolean).forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.filter(Boolean).forEach((token) => values.delete(token));
    },
    toggle(token, force) {
      const shouldHave = force === undefined ? !values.has(token) : !!force;
      if (shouldHave) values.add(token);
      else values.delete(token);
      return shouldHave;
    },
    contains(token) {
      return values.has(token);
    }
  };
}

function createElement(id = '', tagName = 'div') {
  const attributes = new Map();
  return {
    id,
    tagName: String(tagName || 'div').toUpperCase(),
    classList: createClassList(),
    dataset: {},
    style: {},
    value: '',
    innerHTML: '',
    innerText: '',
    clientWidth: 1000,
    clientHeight: 600,
    setAttribute(name, value) {
      attributes.set(String(name), String(value));
    },
    getAttribute(name) {
      return attributes.get(String(name)) || '';
    },
    addEventListener() {},
    removeEventListener() {},
    closest() {
      return null;
    }
  };
}

function createOrderPickerHarness() {
  const orderSource = readFileSync(new URL('../public/js/order.js', import.meta.url), 'utf8');
  const elementMap = new Map([
    ['global-project-select', createElement('global-project-select', 'select')],
    ['order-booth-map-select', createElement('order-booth-map-select', 'select')],
    ['order-booth-map-svg', createElement('order-booth-map-svg', 'svg')],
    ['order-booth-map-empty-state', createElement('order-booth-map-empty-state')],
    ['order-booth-map-title', createElement('order-booth-map-title')],
    ['order-booth-map-tip', createElement('order-booth-map-tip')],
    ['order-booth-map-selected-list', createElement('order-booth-map-selected-list')],
    ['order-booth-map-selected-count', createElement('order-booth-map-selected-count')]
  ]);
  elementMap.get('global-project-select').value = '7';

  const runtimePayload = {
    map: {
      id: 12,
      name: '1号馆',
      canvas_width: 800,
      canvas_height: 600,
      scale_pixels_per_meter: 10,
      display_config: {}
    },
    items: [{
      id: 101,
      booth_code: '1A01',
      booth_type: '标摊',
      shape_type: 'rect',
      width_m: 3,
      height_m: 3,
      x: 20,
      y: 30,
      fill_color: '#ffffff',
      stroke_color: '#0f172a',
      company_text: '福建海洋科技'
    }]
  };
  let featureLoadCount = 0;
  const requestedUrls = [];

  const document = {
    getElementById(id) {
      if (!elementMap.has(id)) elementMap.set(id, createElement(id));
      return elementMap.get(id);
    }
  };
  const window = {
    document,
    addEventListener() {},
    removeEventListener() {},
    ensureFeatureScriptLoaded: async (featureKey) => {
      assert.equal(featureKey, 'booth-map');
      featureLoadCount += 1;
      window.getBoothMapRenderedBackgroundRect = (map) => ({
        x: 0,
        y: 0,
        width: Number(map?.canvas_width || 0),
        height: Number(map?.canvas_height || 0)
      });
      window.renderBoothMapItemText = (item, _widthPx, _heightPx, runtimeItem, _mode, _map, clipPathId) => (
        `<text data-clip="${window.escapeHtml(clipPathId)}">${window.escapeHtml(item.booth_code)} / ${window.escapeHtml(runtimeItem.company_text)}</text>`
      );
    },
    apiFetch: async (url) => {
      requestedUrls.push(String(url));
      return { url };
    },
    readApiSuccessJson: async (response) => {
      if (String(response.url).startsWith('/api/booth-maps')) {
        return { items: [runtimePayload.map] };
      }
      if (String(response.url).startsWith('/api/booth-map-runtime-view')) {
        return runtimePayload;
      }
      return {};
    },
    escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    },
    normalizeBoothCode(value) {
      return String(value || '').trim().toUpperCase();
    },
    showToast() {}
  };
  window.window = window;

  const context = vm.createContext({
    window,
    document,
    console,
    allBooths: [],
    globalPrices: {},
    currentStandardFee: 0,
    dynamicFees: []
  });
  vm.runInContext(orderSource, context, { filename: 'public/js/order.js' });

  return {
    window,
    getSvgHtml: () => elementMap.get('order-booth-map-svg').innerHTML,
    getFeatureLoadCount: () => featureLoadCount,
    getRequestedUrls: () => [...requestedUrls]
  };
}

async function testOrderBoothMapPickerLoadsRenderHelpers() {
  const { window, getSvgHtml, getFeatureLoadCount, getRequestedUrls } = createOrderPickerHarness();
  assert.equal(typeof window.renderBoothMapItemText, 'undefined');
  await window.loadOrderBoothMapPickerMaps(12);
  assert.equal(getFeatureLoadCount(), 1);
  assert.ok(getRequestedUrls().some((url) => /\/api\/booth-map-runtime-view\?id=12&projectId=7&_=/.test(url)));
  assert.match(getSvgHtml(), /1A01/);
  assert.match(getSvgHtml(), /福建海洋科技/);
  assert.match(getSvgHtml(), /<clipPath id="order-booth-map-clip-101">/);
  assert.match(getSvgHtml(), /data-clip="order-booth-map-clip-101"/);
}

async function runTests() {
  const adminParams = normalizeOrderListParams(
    new URL('http://localhost/api/orders?projectId=12&page=3&pageSize=999&search=%20%E6%B5%B7%E9%B2%9C%E5%B8%82%E5%9C%BA%20&businessSearch=%20%E9%A2%84%E5%88%B6%E8%8F%9C%20&regionSearch=%20%E7%A6%8F%E5%BB%BA%E7%9C%81%20&boothType=%E8%B1%AA%E6%A0%87&paymentStatus=%E5%AE%9A%E9%87%91&salesName=%E5%BC%A0%E4%B8%89'),
    { role: 'admin', name: 'admin' }
  );
  assert.deepEqual(adminParams, {
    projectId: 12,
    page: 3,
    pageSize: 200,
    selectedSales: '张三',
    search: '海鲜市场',
    businessSearch: '预制菜',
    regionSearch: '福建省',
    boothType: '豪标',
    paymentStatus: '定金'
  });

  const staffParams = normalizeOrderListParams(
    new URL(`http://localhost/api/orders?projectId=9&page=-2&pageSize=abc&search=${'a'.repeat(80)}&boothType=%E4%B9%B1%E5%86%99&paymentStatus=%E4%B9%B1%E5%86%99&salesName=%E6%9D%8E%E5%9B%9B`),
    { role: 'sales', name: '业务员甲' }
  );
  assert.equal(staffParams.projectId, 9);
  assert.equal(staffParams.page, 1);
  assert.equal(staffParams.pageSize, 30);
  assert.equal(staffParams.selectedSales, '');
  assert.equal(staffParams.boothType, '');
  assert.equal(staffParams.paymentStatus, '');
  assert.equal(staffParams.regionSearch, '');
  assert.ok(getUtf8ByteLength(staffParams.search) <= 40);

  assert.equal(
    estimateBoothMapSaveD1CallCount({
      itemCount: 300,
      removedCount: 20,
      renamedCount: 10,
      occupiedReadCalls: 4,
      removedReferencedReadCalls: 1,
      renamedReferencedReadCalls: 1
    }),
    26
  );

  assert.ok(
    estimateBoothMapSaveD1CallCount({
      itemCount: 300,
      removedCount: 300,
      renamedCount: 150,
      occupiedReadCalls: 6,
      removedReferencedReadCalls: 2,
      renamedReferencedReadCalls: 2
    }) > 45
  );

  await testOrderBoothMapPickerLoadsRenderHelpers();
}

await runTests();
console.log('Order list helper tests passed');
