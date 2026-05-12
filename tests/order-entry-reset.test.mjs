import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const orderSource = readFileSync(new URL('../public/js/order.js', import.meta.url), 'utf8');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...tokens) {
      tokens.filter(Boolean).forEach((token) => values.add(token));
    },
    remove(...tokens) {
      tokens.filter(Boolean).forEach((token) => values.delete(token));
    },
    replace(oldToken, newToken) {
      if (values.has(oldToken)) {
        values.delete(oldToken);
      }
      if (newToken) {
        values.add(newToken);
      }
      return true;
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
  return {
    id,
    tagName: String(tagName || 'div').toUpperCase(),
    type: '',
    name: '',
    value: '',
    checked: false,
    files: [],
    innerHTML: '',
    innerText: '',
    className: '',
    style: {},
    dataset: {},
    options: [],
    children: [],
    classList: createClassList(),
    focusCalls: 0,
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
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {
      this.focusCalls += 1;
    }
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createOrderHarness() {
  const elementMap = new Map();
  const toasts = [];
  const modalCalls = [];
  const invalidateCalls = [];
  const orderListState = { page: 5 };
  const pendingOrderListState = { page: 7 };

  const radioDirect = createElement('is-agent-direct', 'input');
  radioDirect.type = 'radio';
  radioDirect.name = 'is_agent';
  radioDirect.value = '0';
  radioDirect.checked = true;

  const radioAgent = createElement('is-agent-agent', 'input');
  radioAgent.type = 'radio';
  radioAgent.name = 'is_agent';
  radioAgent.value = '1';

  const ids = [
    'global-project-select',
    'order-company',
    'order-credit-code',
    'order-contact',
    'order-phone',
    'order-no-booth-order',
    'order-standard-display-name',
    'order-ground-display-name',
    'order-agent-name',
    'reg-prov',
    'reg-intl',
    'reg-city-sel',
    'reg-dist',
    'reg-city-inp',
    'order-actual-fee',
    'order-discount-reason',
    'order-category',
    'order-business',
    'order-profile',
    'order-contract',
    'order-no-code',
    'calc-booth',
    'calc-type',
    'calc-area',
    'calc-unit',
    'calc-standard-fee',
    'calc-final-total',
    'dynamic-strategy-display',
    'discount-reason-container',
    'selected-booth-id',
    'order-agent-search',
    'order-agent-dropdown',
    'order-sales-owner'
  ];

  ids.forEach((id) => {
    const tagName = id === 'global-project-select' ? 'select' : 'input';
    const element = createElement(id, tagName);
    if (id === 'dynamic-strategy-display' || id === 'order-agent-dropdown') {
      element.classList.add('hidden');
    }
    elementMap.set(id, element);
  });

  elementMap.get('global-project-select').value = '1';
  elementMap.get('global-project-select').options = [{ value: '1', selected: true, textContent: '测试项目' }];
  elementMap.get('order-company').value = '旧企业';
  elementMap.get('order-credit-code').value = '91350100MA12345678';
  elementMap.get('order-contact').value = '张经理';
  elementMap.get('order-phone').value = '13800000001';
  elementMap.get('order-standard-display-name').value = '海鲜';
  elementMap.get('order-ground-display-name').value = '';
  elementMap.get('reg-prov').value = '国际';
  elementMap.get('reg-intl').value = '韩国';
  elementMap.get('order-actual-fee').value = '1000';
  elementMap.get('order-discount-reason').value = '';
  elementMap.get('order-category').value = '水产预制菜';
  elementMap.get('order-business').value = '海鲜加工';
  elementMap.get('order-profile').value = '主营海鲜加工与冷链产品';
  elementMap.get('order-contract').files = [];
  elementMap.get('order-no-code').checked = false;
  elementMap.get('order-no-booth-order').checked = false;
  elementMap.get('order-sales-owner').value = '业务员甲';

  const document = {
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
      if (selector === 'input[name="is_agent"]:checked') {
        return [radioDirect, radioAgent].find((radio) => radio.checked) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="is_agent"]') {
        return [radioDirect, radioAgent];
      }
      return [];
    }
  };

  const window = {
    document,
    console,
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    showToast(message, type) {
      toasts.push({ message, type });
    },
    formatCurrency(value) {
      return `¥ ${Number(value || 0).toFixed(2)}`;
    },
    escapeHtml(value) {
      return String(value ?? '');
    },
    toggleBtnLoading() {},
    isSuperAdmin(user = window.currentUser) {
      if (!user) return false;
      const role = String(user.role || '').trim().toLowerCase();
      return role === 'super_admin' || (role === 'admin' && user.name === 'admin');
    },
    isOrderFieldEnabled(fieldKey) {
      return fieldKey !== 'extra_fees';
    },
    isOrderFieldRequired(fieldKey) {
      return !['agent_name', 'extra_fees', 'contract_upload'].includes(fieldKey);
    },
    countDisplayNameUnits(value) {
      return Array.from(String(value || '')).length;
    },
    getPendingDynamicFees() {
      return [];
    },
    getSavedDynamicFees() {
      return [];
    },
    getSelectedOrderSalesOwner() {
      return '业务员甲';
    },
    uploadContractFile: async () => ({ fileKey: 'contract-key' }),
    apiFetch: async (url, options = {}) => ({ url, options }),
    readApiJson: async (response) => {
      if (response?.url === '/api/submit-order') {
        return { created_count: 2 };
      }
      return {};
    },
    markOrderDashboardDirty() {},
    invalidateWorkbenchTabs(payload) {
      invalidateCalls.push(payload);
    },
    openOrderSubmitSuccessModal(payload) {
      modalCalls.push(payload);
    },
    openPrintModal() {},
    closeModal() {},
    openSection() {},
    renderDynamicFees() {},
    toggleNoBoothOrder() {},
    renderSelectedBooths() {},
    updateBoothDisplayNamePanel() {},
    closeOrderBoothMapPicker() {},
    applyOrderFieldSettings() {},
    populateOrderSalesOwnerSelect: async () => {},
    refreshOrderOverview() {},
    toggleAgent() {},
    toggleCreditCode() {},
    onProvinceChange() {},
    getOrderListState() {
      return orderListState;
    },
    getPendingOrderListState() {
      return pendingOrderListState;
    }
  };

  const context = vm.createContext({
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    currentUser: { role: 'super_admin', name: '管理员' },
    currentStandardFee: 1000,
    isJointExhibition: false,
    dynamicFees: [],
    globalPrices: {},
    allBooths: [],
    confirm: () => true
  });

  window.window = window;
  window.currentUser = context.currentUser;

  vm.runInContext(orderSource, context, { filename: 'public/js/order.js' });

  window.showToast = (message, type) => {
    toasts.push({ message, type });
  };
  window.openOrderSubmitSuccessModal = (payload) => {
    modalCalls.push(payload);
  };
  window.selectedOrderBooths = [{
    id: 'A01',
    hall: '1号馆',
    type: '标摊',
    area: 18,
    price_unit: '个',
    unit_price: 1000,
    standard_fee: 1000,
    is_joint: 0
  }];

  return {
    window,
    document,
    toasts,
    modalCalls,
    invalidateCalls,
    orderListState,
    pendingOrderListState
  };
}

async function testSubmitOrderClearsFormImmediately() {
  const { window, document, modalCalls, invalidateCalls, orderListState, pendingOrderListState } = createOrderHarness();
  const refreshDeferred = createDeferred();
  let refreshCalls = 0;
  let initCalls = 0;

  window.loadOrderFormDependencies = ({ projectId, force }) => {
    refreshCalls += 1;
    assert.equal(projectId, '1');
    assert.equal(force, true);
    return refreshDeferred.promise;
  };
  window.initOrderForm = async () => {
    initCalls += 1;
    await refreshDeferred.promise;
    window.resetOrderForm();
  };

  await window.submitOrderForm();

  assert.equal(refreshCalls, 1, 'success path should kick off one background refresh');
  assert.equal(initCalls, 0, 'success path should not reuse initOrderForm and risk a late reset');
  assert.equal(document.getElementById('order-company').value, '', 'company should clear immediately after success');
  assert.equal(document.getElementById('order-contact').value, '', 'contact should clear immediately after success');
  assert.equal(document.getElementById('order-standard-display-name').value, '', 'display name should clear immediately after success');
  assert.equal(window.selectedOrderBooths.length, 0, 'selected booths should clear immediately after success');
  assert.equal(orderListState.page, 1, 'order list pager should reset after success');
  assert.equal(pendingOrderListState.page, 1, 'pending order pager should reset after success');
  assert.equal(modalCalls.length, 1, 'success modal should still open');
  assert.equal(invalidateCalls.length, 1, 'order finance workbench snapshot should be invalidated once');
  assert.deepEqual(Array.from(invalidateCalls[0].groupIds || []), ['order-finance']);
  assert.equal(invalidateCalls[0].resetSnapshots, true);

  document.getElementById('order-company').value = '下一家企业';
  refreshDeferred.resolve();
  await flushMicrotasks();

  assert.equal(document.getElementById('order-company').value, '下一家企业', 'late dependency refresh should not erase new input');
}

async function testBackgroundRefreshFailureShowsToastWithoutBlockingSuccess() {
  const { window, document, toasts, modalCalls } = createOrderHarness();

  window.loadOrderFormDependencies = async () => {
    throw new Error('后台刷新失败');
  };

  await window.submitOrderForm();
  await flushMicrotasks();

  assert.equal(document.getElementById('order-company').value, '', 'form should already be cleared before refresh failure surfaces');
  assert.equal(modalCalls.length, 1, 'refresh failure should not block the success modal');
  assert.deepEqual(toasts.at(-1), { message: '后台刷新失败', type: 'error' });
}

async function testInitOrderFormStillResetsAfterDependenciesLoad() {
  const { window } = createOrderHarness();
  const calls = [];

  window.applyOrderFieldSettings = () => {
    calls.push('apply');
  };
  window.loadPrices = async ({ projectId, force }) => {
    calls.push(`prices:${projectId}:${force === true}`);
  };
  window.loadBooths = async ({ projectId, force }) => {
    calls.push(`booths:${projectId}:${force === true}`);
  };
  window.loadOrderFieldSettings = async ({ projectId, retryCount, force }) => {
    calls.push(`fields:${projectId}:${retryCount}:${force === true}`);
  };
  window.loadIndustries = async ({ projectId, retryCount, force }) => {
    calls.push(`industries:${projectId}:${retryCount}:${force === true}`);
  };
  window.getProjectStaffList = async (projectId, options = {}) => {
    calls.push(`staff:${projectId}:${options.force === true}`);
    return [];
  };
  window.resetOrderForm = () => {
    calls.push('reset');
  };
  window.populateOrderSalesOwnerSelect = async () => {
    calls.push('sales');
  };
  window.refreshOrderOverview = () => {
    calls.push('overview');
  };

  await window.initOrderForm();

  assert.equal(calls[0], 'apply');
  assert.ok(calls.includes('prices:1:false'));
  assert.ok(calls.includes('booths:1:false'));
  assert.ok(calls.includes('fields:1:2:false'));
  assert.ok(calls.includes('industries:1:2:false'));
  assert.ok(calls.includes('staff:1:false'));
  assert.ok(calls.indexOf('reset') > calls.indexOf('staff:1:false'), 'initOrderForm should reset only after dependency load completes');
  assert.ok(calls.indexOf('sales') > calls.indexOf('reset'), 'sales owner select should repopulate after reset');
  assert.equal(calls.at(-1), 'overview');
}

async function testSalesOrderFormDoesNotLoadStaffList() {
  const { window } = createOrderHarness();
  const calls = [];

  window.currentUser = { role: 'user', name: '业务员甲' };
  window.loadPrices = async () => {
    calls.push('prices');
  };
  window.loadBooths = async () => {
    calls.push('booths');
  };
  window.loadOrderFieldSettings = async () => {
    calls.push('fields');
  };
  window.loadIndustries = async () => {
    calls.push('industries');
  };
  window.getProjectStaffList = async () => {
    calls.push('staff');
    throw new Error('仅管理员可操作');
  };

  await window.loadOrderFormDependencies({ projectId: '1', force: true });

  assert.deepEqual(calls.sort(), ['booths', 'fields', 'industries', 'prices']);
}

await testSubmitOrderClearsFormImmediately();
await testBackgroundRefreshFailureShowsToastWithoutBlockingSuccess();
await testInitOrderFormStillResetsAfterDependenciesLoad();
await testSalesOrderFormDoesNotLoadStaffList();

console.log('Order entry reset tests passed');
