import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const authSource = readFileSync(new URL('../public/js/auth.js', import.meta.url), 'utf8');

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
    },
    toString() {
      return Array.from(values).join(' ');
    }
  };
}

function createElement(id = '', tagName = 'div') {
  return {
    id,
    tagName: String(tagName || 'div').toUpperCase(),
    type: '',
    name: '',
    value: '',
    checked: false,
    innerHTML: '',
    innerText: '',
    className: '',
    style: {},
    dataset: {},
    options: [],
    children: [],
    scrollTop: 0,
    scrollLeft: 0,
    classList: createClassList(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    }
  };
}

function createAuthHarness() {
  const elementMap = new Map();
  const sectionIds = [
    'home',
    'config',
    'exhibition',
    'booth-map',
    'booth',
    'agents',
    'order-entry',
    'order-list',
    'pending-orders'
  ];
  const sectionElements = sectionIds.map((sectionId) => {
    const element = createElement(`sec-${sectionId}`, 'section');
    element.classList = createClassList(['page-section']);
    elementMap.set(element.id, element);
    return element;
  });

  [
    'nav-buttons',
    'current-page-title',
    'main-content',
    'workbench-tabs-shell',
    'workbench-tabs',
    'login-view',
    'main-view',
    'user-info',
    'global-project-select'
  ].forEach((id) => {
    const element = createElement(id, id === 'global-project-select' ? 'select' : 'div');
    if (id === 'workbench-tabs-shell') element.classList.add('hidden');
    if (id === 'global-project-select') {
      element.value = '1';
      element.options = [{ value: '1', selected: true, text: '测试项目' }];
    }
    elementMap.set(id, element);
  });

  const mainElement = createElement('main-view-main', 'main');
  const storage = new Map();
  const loaderCalls = {
    home: 0,
    orderList: 0,
    pending: 0,
    agents: 0,
    booth: 0,
    boothMap: 0,
    exhibition: 0,
    config: 0,
    orderEntry: 0,
    orderFields: 0
  };

  const document = {
    documentElement: createElement('document-element', 'html'),
    body: createElement('document-body', 'body'),
    scrollingElement: createElement('scrolling-element', 'html'),
    getElementById(id) {
      if (!elementMap.has(id)) {
        elementMap.set(id, createElement(id));
      }
      return elementMap.get(id);
    },
    createElement(tagName) {
      return createElement('', tagName);
    },
    querySelector(selector) {
      if (selector === '#main-view main') return mainElement;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.page-section') return sectionElements;
      return [];
    }
  };

  const window = {
    document,
    console,
    scrollY: 0,
    scrollTo(_x, y) {
      this.scrollY = Number(y || 0);
    },
    addEventListener() {},
    requestAnimationFrame(fn) {
      if (typeof fn === 'function') fn();
      return 1;
    },
    setTimeout(fn) {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout() {},
    showToast() {},
    renderIcon() {
      return '<svg></svg>';
    },
    escapeHtml(value) {
      return String(value ?? '');
    },
    loadProjects() {},
    loadHomeDashboard: async () => {
      loaderCalls.home += 1;
    },
    loadOrderFieldSettings: async () => {
      loaderCalls.orderFields += 1;
    },
    loadOrderList: async () => {
      loaderCalls.orderList += 1;
    },
    loadPendingOrderList: async () => {
      loaderCalls.pending += 1;
    },
    loadAgents: async () => {
      loaderCalls.agents += 1;
    },
    loadPrices: async () => {
      loaderCalls.booth += 1;
    },
    loadBooths: async () => {
      loaderCalls.booth += 1;
    },
    initBoothMapPage: async () => {
      loaderCalls.boothMap += 1;
    },
    loadExhibitionPanel: async () => {
      loaderCalls.exhibition += 1;
    },
    initOrderForm: async () => {
      loaderCalls.orderEntry += 1;
    },
    openConfigPanel() {
      loaderCalls.config += 1;
    },
    renderConfigSubnav() {},
    switchHomeTab() {},
    switchBoothMapTab() {},
    renderOrderActionToolbar() {},
    getOrderListState() {
      return { page: 1, pageSize: 30, total: 0, totalPages: 1, hasMore: false };
    },
    getPendingOrderListState() {
      return { page: 1, pageSize: 50, total: 0, totalPages: 1, hasMore: false };
    },
    getBoothMapState() {
      return { activeTab: 'editor', viewBox: null, previewViewBox: null };
    }
  };

  const sessionStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    }
  };

  const context = vm.createContext({
    window,
    document,
    console,
    sessionStorage,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    currentUser: { role: 'admin', name: 'admin' },
    currentBoothMapId: 0,
    currentStandardFee: 0,
    isJointExhibition: false,
    dynamicFees: [],
    currentBoothMap: null,
    currentBoothMapItems: [],
    currentBoothMapRuntimeItems: [],
    currentOrderFinancePanel: 'closed'
  });

  window.window = window;
  window.currentUser = context.currentUser;

  vm.runInContext(authSource, context, { filename: 'public/js/auth.js' });

  return {
    window,
    document,
    sessionStorage,
    loaderCalls
  };
}

function extractNavLabels(container) {
  return (container.children || []).map((child) => {
    if (typeof child.innerHTML === 'string' && child.innerHTML) return child.innerHTML;
    if (Array.isArray(child.children) && child.children[0]?.innerHTML) return child.children[0].innerHTML;
    return '';
  });
}

function testFeatureScriptManifest() {
  const { window } = createAuthHarness();
  const manifest = window.getFeatureScriptManifest();
  assert.equal(typeof window.ensureFeatureScriptLoaded, 'function', 'auth.js should expose feature script loader');
  assert.deepEqual(Object.keys(manifest).sort(), ['booth-map', 'exhibition', 'finance']);
  for (const [featureKey, config] of Object.entries(manifest)) {
    assert.ok(Array.isArray(config.scripts) && config.scripts.length > 0, `${featureKey} should define lazy scripts`);
    assert.ok(config.scripts.every((src) => /\.js\?v=/.test(src)), `${featureKey} lazy scripts should be versioned`);
    assert.equal(typeof config.ready, 'function', `${featureKey} should expose a ready guard`);
  }
}

async function testWorkbenchTabsDeduplicateAndFallback() {
  const { window, loaderCalls } = createAuthHarness();

  await window.openSection('home', '数据看板');
  assert.equal(window.getWorkbenchTabs().length, 1);
  assert.equal(window.activeWorkbenchTabId, 'home');
  assert.equal(loaderCalls.home, 1);

  await window.openSection('order-list', '订单与财务管理');
  assert.equal(window.getWorkbenchTabs().length, 2);
  assert.equal(window.activeWorkbenchTabId, 'order-finance');
  assert.equal(loaderCalls.orderList, 1);

  await window.openSection('pending-orders', '订单与财务管理 · 待确认订单列表');
  assert.equal(window.getWorkbenchTabs().length, 2, 'order-finance should stay a single tab group');
  const orderFinanceTab = window.getWorkbenchTabs().find((tab) => tab.id === 'order-finance');
  assert.ok(orderFinanceTab, 'order-finance tab should exist');
  assert.equal(orderFinanceTab.sectionId, 'pending-orders');
  assert.equal(orderFinanceTab.title, '订单与财务管理 · 待确认订单列表');
  assert.equal(loaderCalls.pending, 1);

  await window.closeWorkbenchTab('order-finance');
  assert.equal(window.activeWorkbenchTabId, 'home');
  assert.equal(window.getWorkbenchTabs().length, 1);
}

async function testExhibitionWorkbenchUsesSingleGroup() {
  const { window, loaderCalls } = createAuthHarness();
  window.currentUser = { role: 'super_admin', name: 'admin' };

  window.currentExhibitionPanel = 'project-settings';
  await window.openSection('exhibition', '展务管理 · 展务项目设置');
  let exhibitionTab = window.getWorkbenchTabs().find((tab) => tab.id === 'exhibition');
  assert.ok(exhibitionTab, 'exhibition workbench tab should exist');
  assert.equal(exhibitionTab.panelKey, 'project-settings');
  assert.equal(loaderCalls.exhibition, 1);

  window.currentExhibitionPanel = 'refrigerator-rentals';
  await window.openSection('exhibition', '展务管理 · 冰柜租赁管理');
  exhibitionTab = window.getWorkbenchTabs().find((tab) => tab.id === 'exhibition');
  assert.equal(window.getWorkbenchTabs().filter((tab) => tab.id === 'exhibition').length, 1, 'exhibition should stay a single workbench group');
  assert.equal(exhibitionTab.panelKey, 'refrigerator-rentals');
  assert.equal(loaderCalls.exhibition, 2);
}

function testExhibitionNavPlacementByRole() {
  const userHarness = createAuthHarness();
  userHarness.window.currentUser = { role: 'user', name: 'sales01' };
  userHarness.window.renderNav();
  const userLabels = extractNavLabels(userHarness.document.getElementById('nav-buttons'));
  const userOrderIndex = userLabels.findIndex((label) => label.includes('订单与财务管理'));
  const userExhibitionIndex = userLabels.findIndex((label) => label.includes('展务管理'));
  assert.ok(userOrderIndex >= 0 && userExhibitionIndex === userOrderIndex + 1, 'user exhibition nav should sit below order finance');

  const adminHarness = createAuthHarness();
  adminHarness.window.currentUser = { role: 'admin', name: 'manager01' };
  adminHarness.window.renderNav();
  const adminLabels = extractNavLabels(adminHarness.document.getElementById('nav-buttons'));
  const adminBoothMapIndex = adminLabels.findIndex((label) => label.includes('展位图管理'));
  const adminExhibitionIndex = adminLabels.findIndex((label) => label.includes('展务管理'));
  assert.ok(adminBoothMapIndex >= 0 && adminExhibitionIndex === adminBoothMapIndex + 1, 'admin exhibition nav should sit below booth map');

  const superHarness = createAuthHarness();
  superHarness.window.currentUser = { role: 'super_admin', name: 'admin' };
  superHarness.window.renderNav();
  const superLabels = extractNavLabels(superHarness.document.getElementById('nav-buttons'));
  const boothIndex = superLabels.findIndex((label) => label.includes('展位库管理'));
  const superExhibitionIndex = superLabels.findIndex((label) => label.includes('展务管理'));
  assert.ok(boothIndex >= 0 && superExhibitionIndex === boothIndex + 1, 'super admin exhibition nav should sit below booth library');

  const exhibitionHarness = createAuthHarness();
  exhibitionHarness.window.currentUser = { role: 'exhibition_manager', name: 'expo01' };
  exhibitionHarness.window.renderNav();
  const exhibitionLabels = extractNavLabels(exhibitionHarness.document.getElementById('nav-buttons')).filter(Boolean);
  const exhibitionBoothMapIndex = exhibitionLabels.findIndex((label) => label.includes('展位图管理'));
  const exhibitionExhibitionIndex = exhibitionLabels.findIndex((label) => label.includes('展务管理'));
  assert.equal(exhibitionLabels.length, 2, 'exhibition manager should see booth map preview and exhibition nav');
  assert.ok(exhibitionBoothMapIndex >= 0, 'exhibition manager should see booth map nav');
  assert.ok(exhibitionExhibitionIndex === exhibitionBoothMapIndex + 1, 'exhibition nav should sit below booth map for exhibition manager');
}

async function testProjectChangeInvalidatesInactiveTabs() {
  const { window } = createAuthHarness();

  await window.openSection('home', '数据看板');
  await window.openSection('agents', '代理商管理');
  await window.openSection('home', '数据看板');

  const homeTab = window.getWorkbenchTabs().find((tab) => tab.id === 'home');
  const agentsTab = window.getWorkbenchTabs().find((tab) => tab.id === 'agents');
  assert.ok(homeTab?.loaded, 'home tab should be marked loaded after activation');
  assert.ok(agentsTab?.loaded, 'agents tab should be marked loaded after activation');

  window.handleWorkbenchProjectChange();

  assert.equal(homeTab.loaded, true, 'active tab should stay loaded after project switch');
  assert.equal(agentsTab.loaded, false, 'inactive tabs should reload on next activation after project switch');
}

async function testExplicitInvalidationCanResetOrderFinanceTab() {
  const { window } = createAuthHarness();

  await window.openSection('order-list', '订单与财务管理 · 成交订单列表与财务管理');
  await window.openSection('home', '数据看板');

  const orderFinanceTab = window.getWorkbenchTabs().find((tab) => tab.id === 'order-finance');
  assert.ok(orderFinanceTab, 'order-finance tab should exist before invalidation');
  orderFinanceTab.loaded = true;
  orderFinanceTab.scrollTop = 128;
  orderFinanceTab.snapshot = {
    sectionId: 'order-list',
    orderFinance: {
      panelKey: 'closed',
      orderListState: { page: 3 },
      pendingOrderListState: { page: 2 }
    }
  };

  window.invalidateWorkbenchTabs({ groupIds: ['order-finance'], resetSnapshots: true });

  assert.equal(orderFinanceTab.loaded, false, 'order-finance tab should be marked stale');
  assert.equal(orderFinanceTab.snapshot, null, 'snapshot should be cleared when resetSnapshots is enabled');
  assert.equal(orderFinanceTab.scrollTop, 0, 'scroll position should reset with snapshot invalidation');
}

async function testExhibitionManagerStartsInExhibitionWorkbench() {
  const { window, loaderCalls } = createAuthHarness();
  window.currentUser = { role: 'exhibition_manager', name: 'expo01' };

  await window.initializeWorkbenchTabs();

  assert.equal(window.activeWorkbenchTabId, 'exhibition');
  assert.equal(window.getWorkbenchTabs().length, 1);
  assert.equal(window.getWorkbenchTabs()[0].id, 'exhibition');
  assert.equal(loaderCalls.exhibition, 1, 'exhibition manager should load exhibition panel instead of home dashboard');
  assert.equal(loaderCalls.home, 0, 'exhibition manager should not load home dashboard on entry');
}

testFeatureScriptManifest();
await testWorkbenchTabsDeduplicateAndFallback();
await testExhibitionWorkbenchUsesSingleGroup();
testExhibitionNavPlacementByRole();
await testProjectChangeInvalidatesInactiveTabs();
await testExplicitInvalidationCanResetOrderFinanceTab();
await testExhibitionManagerStartsInExhibitionWorkbench();

console.log('Workbench tabs tests passed');
