import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const boothMapSource = readFileSync(new URL('../public/js/booth-map.js', import.meta.url), 'utf8');

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
      if (force === undefined) {
        if (values.has(token)) {
          values.delete(token);
          return false;
        }
        values.add(token);
        return true;
      }
      if (force) values.add(token);
      else values.delete(token);
      return !!force;
    },
    contains(token) {
      return values.has(token);
    }
  };
}

function createElement(id = '', tagName = 'div') {
  if (String(tagName || '').toLowerCase() === 'canvas') {
    return {
      getContext() {
        return {
          font: '',
          measureText(text) {
            const fontSize = Number.parseFloat(this.font) || 12;
            const isMonospace = /SFMono|Menlo|Monaco|Consolas|Courier|monospace/i.test(this.font);
            const width = Array.from(String(text || '')).reduce((sum, char) => {
              if (isMonospace) return sum + fontSize * 0.62;
              if (/[I1]/.test(char)) return sum + fontSize * 0.28;
              if (/[MW]/.test(char)) return sum + fontSize * 0.82;
              return sum + fontSize * 0.56;
            }, 0);
            return { width };
          }
        };
      }
    };
  }
  return {
    id,
    tagName: String(tagName || 'div').toUpperCase(),
    className: '',
    classList: createClassList(),
    style: {},
    innerHTML: '',
    innerText: '',
    value: '',
    checked: false,
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

function createHarness() {
  const elementMap = new Map([
    ['bm-filter-status-group', createElement('bm-filter-status-group')],
    ['bm-filter-type-group', createElement('bm-filter-type-group')],
    ['bm-filter-lintel-group', createElement('bm-filter-lintel-group')]
  ]);
  elementMap.get('bm-filter-type-group').classList.add('hidden');
  elementMap.get('bm-filter-lintel-group').classList.add('hidden');

  const document = {
    body: createElement('body', 'body'),
    documentElement: createElement('html', 'html'),
    getElementById(id) {
      if (!elementMap.has(id)) {
        elementMap.set(id, createElement(id));
      }
      return elementMap.get(id);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tagName) {
      return createElement('', tagName);
    },
    addEventListener() {},
    removeEventListener() {}
  };

  const window = {
    document,
    console,
    addEventListener() {},
    removeEventListener() {},
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
      return 1;
    },
    cancelAnimationFrame() {},
    showToast() {},
    closeModal() {},
    openPrintModal() {},
    apiFetch: async () => ({ ok: true, json: async () => ({}) }),
    readApiJson: async (_response, _message, defaultValue) => defaultValue,
    readApiSuccessJson: async (_response, _message, defaultValue) => defaultValue,
    ensureApiSuccess: async () => {},
    getAuthorizedAssetUrl(url) {
      return url;
    },
    normalizeBoothCode(value) {
      return String(value || '').trim().toUpperCase();
    },
    currentUser: { role: 'admin', name: 'manager01' }
  };
  window.window = window;

  const context = vm.createContext({
    window,
    document,
    console,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    currentBoothMap: null,
    currentBoothMapItems: [],
    currentBoothMapRuntimeItems: [],
    boothMapDirty: false
  });

  vm.runInContext(boothMapSource, context, { filename: 'public/js/booth-map.js' });

  let renderCalls = 0;
  window.renderCurrentBoothMap = function() {
    renderCalls += 1;
  };

  return {
    window,
    document,
    getRenderCalls() {
      return renderCalls;
    }
  };
}

function testSwitchToLintelModeShowsCorrectFilterGroup() {
  const { window, document, getRenderCalls } = createHarness();
  window.switchBoothMapFilterMode('lintel');
  assert.equal(window.getBoothMapState().previewFilterMode, 'lintel');
  assert.equal(document.getElementById('bm-filter-status-group').classList.contains('hidden'), true);
  assert.equal(document.getElementById('bm-filter-type-group').classList.contains('hidden'), true);
  assert.equal(document.getElementById('bm-filter-lintel-group').classList.contains('hidden'), false);
  assert.equal(getRenderCalls(), 1);
}

function testLintelPreviewFiltersDriveVisibilityAndLegend() {
  const { window, getRenderCalls } = createHarness();
  const state = window.getBoothMapState();
  state.runtimeByBoothCode = {
    '1A01': { exhibition_status_code: 'lintel_confirmed', lintel_status_code: 'unconfirmed' },
    '1A02': { exhibition_status_code: 'special_decoration_unreported' },
    '1A03': { lintel_status_code: 'not_applicable' }
  };

  window.switchBoothMapFilterMode('lintel');
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A01' }), true);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A02' }), true);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A03' }), true);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A04' }), true);

  window.toggleBoothMapPreviewLintelFilter('lintel_confirmed', false);
  assert.equal(state.previewLintelFilters.lintel_confirmed, false);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A01' }), false);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A02' }), true);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A03' }), true);

  window.toggleBoothMapPreviewLintelFilter('not_applicable', false);
  assert.equal(state.previewLintelFilters.not_applicable, false);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A03' }), false);
  assert.equal(window.isBoothMapItemVisibleInPreview({ booth_code: '1A04' }), false);

  const previewColors = window.getBoothMapItemPreviewColors({ booth_code: '1A02' });
  assert.equal(previewColors.fillColor, '#ef4444');
  assert.equal(previewColors.strokeColor, '#dc2626');

  const legend = window.getBoothMapActivePreviewLegend();
  assert.equal(legend.some((item) => item.label === '楣板已确认'), false);
  assert.equal(legend.some((item) => item.label === '楣板未确认'), true);
  assert.equal(legend.some((item) => item.label === '光地已报图'), true);
  assert.equal(legend.some((item) => item.label === '光地未报图'), true);
  assert.equal(legend.some((item) => item.label === '无状态'), false);
  assert.equal(getRenderCalls(), 3);
}

function testBoothNumberUsesFixedWidthBottomLeftLayout() {
  const { window } = createHarness();
  const getFirstTextY = (markup) => Number(markup.match(/<text[\s\S]*?y="([0-9.]+)"/)?.[1] || 0);
  const map = { canvas_width: 800, canvas_height: 600, display_config: {} };
  const baseItem = {
    id: 1,
    booth_type: '标摊',
    shape_type: 'rect',
    width_m: 3,
    height_m: 3
  };
  const widthPx = 120;
  const heightPx = 60;
  const textE = window.renderBoothMapItemText(
    { ...baseItem, booth_code: '2E01' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    map,
    'clip-a'
  );
  const textI = window.renderBoothMapItemText(
    { ...baseItem, booth_code: '2I01' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    map,
    'clip-b'
  );

  assert.match(textE, /font-family="[^"]*(SFMono|Menlo|Consolas|Courier|monospace)/);
  assert.match(textE, /letter-spacing="0em"/);
  assert.match(textE, /font-variant-numeric="tabular-nums"/);
  assert.match(textE, /dominant-baseline="text-after-edge"/);
  assert.match(textE, /font-size="18"/);
  assert.match(textE, /x="1\.00"/);
  assert.match(textE, /y="58\.32"/);
  assert.match(textE, /clip-path="url\(#clip-a\)"/);

  const widthE = window.measureBoothMapText('2E01', 18, 0, window.getBoothMapBoothNoFontFamily());
  const widthI = window.measureBoothMapText('2I01', 18, 0, window.getBoothMapBoothNoFontFamily());
  assert.equal(widthE, widthI);
  assert.match(textI, /2I01/);

  const smallText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: '2E01' },
    24,
    20,
    { company_text: '测试企业' },
    'preview',
    map,
    'clip-c'
  );
  assert.match(smallText, /font-size="18"/);
  assert.match(smallText, />2E01<\/text>/);
  assert.doesNotMatch(smallText, /…/);

  const tunedText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: '2E01' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    {
      ...map,
      display_config: {
        standard: {
          boothNo: { anchorX: 0.5, anchorY: 0.5, fontSize: 24, visible: true },
          company: { anchorX: 0.5, anchorY: 0.5, fontSize: 14, visible: true }
        }
      }
    },
    'clip-d'
  );
  assert.match(tunedText, /font-size="24"/);
  assert.match(tunedText, /x="57\.64"/);
  assert.match(tunedText, /y="41\.40"/);

  const standardDownText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: '2E01' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    {
      ...map,
      display_config: {
        standard: {
          boothNo: { anchorX: 0.02, anchorY: 1.6, fontSize: 18, visible: true },
          company: { anchorX: 0.5, anchorY: 0.5, fontSize: 14, visible: true }
        }
      }
    },
    'clip-e'
  );
  const standardBottomText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: '2E01' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    {
      ...map,
      display_config: {
        standard: {
          boothNo: { anchorX: 0.02, anchorY: 2, fontSize: 18, visible: true },
          company: { anchorX: 0.5, anchorY: 0.5, fontSize: 14, visible: true }
        }
      }
    },
    'clip-f'
  );
  assert.ok(getFirstTextY(standardDownText) > getFirstTextY(textE));
  assert.ok(getFirstTextY(standardBottomText) > getFirstTextY(standardDownText));
  assert.match(standardBottomText, /y="59\.82"/);
  const standardEdgeText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: '2E01' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    {
      ...map,
      display_config: {
        standard: {
          boothNo: { anchorX: 0.02, anchorY: 2.5, fontSize: 18, visible: true },
          company: { anchorX: 0.5, anchorY: 0.5, fontSize: 14, visible: true }
        }
      }
    },
    'clip-i'
  );
  assert.ok(getFirstTextY(standardEdgeText) > getFirstTextY(standardBottomText));
  assert.match(standardEdgeText, /y="67\.41"/);

  const groundBaseText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: 'G001', booth_type: '光地' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    {
      ...map,
      display_config: {
        ground: {
          boothNo: { anchorX: 0.02, anchorY: 0.93, fontSize: 20, visible: true },
          company: { anchorX: 0.5, anchorY: 0.5, fontSize: 16, visible: true },
          size: { anchorX: 0.98, anchorY: 0.02, fontSize: 13, visible: false }
        }
      }
    },
    'clip-g'
  );
  const groundBottomText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: 'G001', booth_type: '光地' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    {
      ...map,
      display_config: {
        ground: {
          boothNo: { anchorX: 0.02, anchorY: 2, fontSize: 20, visible: true },
          company: { anchorX: 0.5, anchorY: 0.5, fontSize: 16, visible: true },
          size: { anchorX: 0.98, anchorY: 0.02, fontSize: 13, visible: false }
        }
      }
    },
    'clip-h'
  );
  assert.ok(getFirstTextY(groundBottomText) > getFirstTextY(groundBaseText));
  const groundEdgeText = window.renderBoothMapItemText(
    { ...baseItem, booth_code: 'G001', booth_type: '光地' },
    widthPx,
    heightPx,
    { company_text: '测试企业' },
    'preview',
    {
      ...map,
      display_config: {
        ground: {
          boothNo: { anchorX: 0.02, anchorY: 2.5, fontSize: 20, visible: true },
          company: { anchorX: 0.5, anchorY: 0.5, fontSize: 16, visible: true },
          size: { anchorX: 0.98, anchorY: 0.02, fontSize: 13, visible: false }
        }
      }
    },
    'clip-j'
  );
  assert.ok(getFirstTextY(groundEdgeText) > getFirstTextY(groundBottomText));
  assert.match(groundEdgeText, /y="68\.23"/);

  const normalizedConfig = window.normalizeBoothMapDisplayConfig({
    standard: {
      boothNo: { anchorX: 0.02, anchorY: 3, fontSize: 18, visible: true }
    },
    ground: {
      boothNo: { anchorX: 0.02, anchorY: 3, fontSize: 20, visible: true }
    }
  }, map);
  assert.equal(normalizedConfig.standard.boothNo.anchorY, 2.5);
  assert.equal(normalizedConfig.ground.boothNo.anchorY, 2.5);
}

testSwitchToLintelModeShowsCorrectFilterGroup();
testLintelPreviewFiltersDriveVisibilityAndLegend();
testBoothNumberUsesFixedWidthBottomLeftLayout();

console.log('Booth map preview filter tests passed');
