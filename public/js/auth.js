// ================= js/auth.js =================
const navConfig = [
    { id: 'home', label: '数据看板', roles: ['admin', 'user'], icon: 'home' }, 
    { id: 'agents', label: '代理商管理', roles: ['admin', 'user'], icon: 'users' },
    { id: 'order-entry', label: '订单信息录入', roles: ['admin', 'user'], icon: 'clipboard' }, 
    { id: 'order-list', label: '订单与财务管理', roles: ['admin', 'user'], icon: 'wallet' }, 
    { id: 'pending-orders', label: '待确认订单列表', roles: ['admin', 'user'], icon: 'wallet', hidden: true },
    { id: 'booth-map', label: '展位图管理', roles: ['admin', 'user', 'exhibition_manager'], icon: 'layout' },
    { id: 'booth', label: '展位库管理', roles: ['admin'], superAdminOnly: true, icon: 'layout' }, 
    { id: 'exhibition', label: '展务管理', roles: ['admin', 'user', 'exhibition_manager'], icon: 'folders' },
    { id: 'config', label: '系统配置', roles: ['admin'], superAdminOnly: true, icon: 'settings' }
];
const dashboardNavItems = [
    { key: 'sales-summary', label: '目标与收款概览', icon: 'home' },
    { key: 'sales-list', label: '业务员销售情况', icon: 'users' },
    { key: 'hall', label: '馆别经营看板', icon: 'layout', adminOnly: true },
    { key: 'region-table', label: '地区分布表格', icon: 'fields' }
];
const orderFinanceNavItems = [
    { key: 'closed', sectionId: 'order-list', label: '成交订单列表与财务管理', icon: 'wallet' },
    { key: 'pending', sectionId: 'pending-orders', label: '待确认订单列表', icon: 'clipboard' }
];
const configNavItems = [
    { key: 'basic', label: '基础配置', icon: 'folders' },
    { key: 'staff', label: '业务员与目标管理', icon: 'users' },
    { key: 'order-fields', label: '订单字段设置', icon: 'fields' },
    { key: 'order-import', label: '订单导入', icon: 'clipboard' }
];
const boothMapNavItems = [
    { key: 'canvas', label: '管理画布', icon: 'folders' },
    { key: 'editor', label: '编辑展位图', icon: 'layout' },
    { key: 'preview', label: '终版预览', icon: 'search' }
];
const exhibitionNavItems = [
    { key: 'project-settings', label: '展务项目设置', icon: 'settings', superAdminOnly: true },
    { key: 'exhibitor-directory', label: '筹展管理列表', icon: 'users' },
    { key: 'refrigerator-rentals', label: '冰柜租赁管理', icon: 'folders' },
    { key: 'equipment', label: '展具管理', icon: 'clipboard' },
    { key: 'lintel', label: '楣板管理', icon: 'layout' },
    { key: 'special-decoration', label: '特装管理', icon: 'search' }
];
window.isConfigNavExpanded = window.isConfigNavExpanded ?? false;
window.isHomeNavExpanded = window.isHomeNavExpanded ?? false;
window.isBoothMapNavExpanded = window.isBoothMapNavExpanded ?? false;
window.isOrderFinanceNavExpanded = window.isOrderFinanceNavExpanded ?? false;
window.isExhibitionNavExpanded = window.isExhibitionNavExpanded ?? false;
window.currentBoothMapPanel = window.currentBoothMapPanel || 'editor';
window.currentOrderFinancePanel = window.currentOrderFinancePanel || 'closed';
window.currentExhibitionPanel = window.currentExhibitionPanel || 'project-settings';
const WORKBENCH_STORAGE_KEY = 'expo_workbench_tabs_v1';
window.workbenchTabs = Array.isArray(window.workbenchTabs) ? window.workbenchTabs : [];
window.activeWorkbenchTabId = window.activeWorkbenchTabId || '';
window.workbenchTabHistory = Array.isArray(window.workbenchTabHistory) ? window.workbenchTabHistory : [];
window.pendingWorkbenchProjectId = window.pendingWorkbenchProjectId || '';

const FEATURE_SCRIPT_VERSION = '20260604-refrigerator-sync-1';
const lazyFeatureScriptManifest = {
    'booth-map': {
        scripts: [`./js/booth-map.js?v=${FEATURE_SCRIPT_VERSION}`],
        ready: () => typeof window.initBoothMapPage === 'function'
    },
    exhibition: {
        scripts: [`./js/exhibition.js?v=${FEATURE_SCRIPT_VERSION}`],
        ready: () => typeof window.loadExhibitionPanel === 'function'
    },
    finance: {
        scripts: [
            `./js/finance.js?v=${FEATURE_SCRIPT_VERSION}`,
            `./js/finance-bindings.js?v=${FEATURE_SCRIPT_VERSION}`
        ],
        ready: () => typeof window.loadOrderList === 'function' && typeof window.loadPendingOrderList === 'function'
    }
};

window.getFeatureScriptManifest = function() {
    return lazyFeatureScriptManifest;
}

window.isFeatureScriptReady = function(featureKey) {
    const manifest = lazyFeatureScriptManifest[String(featureKey || '').trim()];
    if (!manifest) return true;
    return typeof manifest.ready === 'function' ? !!manifest.ready() : false;
}

window.loadScriptOnce = function(src, marker) {
    const normalizedSrc = String(src || '').trim();
    if (!normalizedSrc) return Promise.resolve();
    const normalizedMarker = String(marker || normalizedSrc).replace(/[^A-Za-z0-9_-]/g, '-');
    const existingScript = document.querySelector?.(`script[data-feature-script="${normalizedMarker}"]`);
    if (existingScript) {
        if (existingScript.dataset.loaded === '1') return Promise.resolve();
        return new Promise((resolve, reject) => {
            existingScript.addEventListener('load', resolve, { once: true });
            existingScript.addEventListener('error', () => reject(new Error('功能脚本加载失败，请刷新后重试')), { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = normalizedSrc;
        script.defer = true;
        script.dataset.featureScript = normalizedMarker;
        script.onload = () => {
            script.dataset.loaded = '1';
            resolve();
        };
        script.onerror = () => reject(new Error('功能脚本加载失败，请刷新后重试'));
        const target = document.head || document.documentElement || document.body;
        target.appendChild(script);
    });
}

window.ensureFeatureScriptLoaded = async function(featureKey) {
    const normalizedKey = String(featureKey || '').trim();
    const manifest = lazyFeatureScriptManifest[normalizedKey];
    if (!manifest || window.isFeatureScriptReady(normalizedKey)) return;
    pendingFeatureScriptLoaders = pendingFeatureScriptLoaders || {};
    if (pendingFeatureScriptLoaders[normalizedKey]) return pendingFeatureScriptLoaders[normalizedKey];

    pendingFeatureScriptLoaders[normalizedKey] = (async () => {
        const scripts = Array.isArray(manifest.scripts) ? manifest.scripts : [manifest.src].filter(Boolean);
        for (let index = 0; index < scripts.length; index += 1) {
            await window.loadScriptOnce(scripts[index], `${normalizedKey}-${index}`);
        }
        if (!window.isFeatureScriptReady(normalizedKey)) {
            throw new Error('功能脚本未完成初始化，请刷新后重试');
        }
    })().finally(() => {
        delete pendingFeatureScriptLoaders[normalizedKey];
    });

    return pendingFeatureScriptLoaders[normalizedKey];
}

window.cloneWorkbenchData = function(value, fallback = null) {
    try {
        return JSON.parse(JSON.stringify(value ?? fallback));
    } catch (error) {
        return fallback;
    }
}

window.resolveWorkbenchGroupId = function(sectionId) {
    return ['order-list', 'pending-orders'].includes(String(sectionId || ''))
        ? 'order-finance'
        : String(sectionId || '').trim();
}

window.getNavItemLabel = function(sectionId) {
    if (sectionId === 'order-finance') return '订单与财务管理';
    return navConfig.find((item) => item.id === sectionId)?.label || '';
}

window.getHomePanelLabel = function(panelKey) {
    return dashboardNavItems.find((item) => item.key === panelKey)?.label || '目标与收款概览';
}

window.getConfigPanelLabel = function(panelKey) {
    return configNavItems.find((item) => item.key === panelKey)?.label || '基础配置';
}

window.getBoothMapPanelLabel = function(panelKey) {
    return window.getAvailableBoothMapNavItems?.().find((item) => item.key === panelKey)?.label || '终版预览';
}

window.getOrderFinancePanelLabel = function(panelKey) {
    return orderFinanceNavItems.find((item) => item.key === panelKey)?.label || '成交订单列表与财务管理';
}

window.getExhibitionPanelLabel = function(panelKey) {
    return window.getAvailableExhibitionNavItems?.().find((item) => item.key === panelKey)?.label || '冰柜租赁管理';
}

window.resolveHomePanelKey = function(preferred = '') {
    const available = typeof window.getAvailableHomeTabs === 'function'
        ? window.getAvailableHomeTabs(window.isAdminUser?.())
        : dashboardNavItems.filter((item) => !item.adminOnly || window.isAdminUser?.()).map((item) => ({
            id: item.key,
            label: item.label
        }));
    const candidate = String(preferred || window.activeHomeTab || '').trim();
    return available.some((item) => item.id === candidate) ? candidate : (available[0]?.id || 'sales-summary');
}

window.resolveConfigPanelKey = function(preferred = '') {
    const candidate = String(preferred || window.currentConfigPanel || '').trim();
    return configNavItems.some((item) => item.key === candidate) ? candidate : 'basic';
}

window.resolveBoothMapPanelKey = function(preferred = '') {
    const available = window.getAvailableBoothMapNavItems?.() || boothMapNavItems;
    const candidate = String(preferred || window.currentBoothMapPanel || '').trim();
    if (!window.isSuperAdmin?.()) return 'preview';
    return available.some((item) => item.key === candidate) ? candidate : (available[0]?.key || 'editor');
}

window.resolveOrderFinancePanelKey = function(preferred = '', sectionId = '') {
    const normalizedSectionId = String(sectionId || '').trim();
    const candidate = String(preferred || (normalizedSectionId === 'pending-orders' ? 'pending' : (normalizedSectionId === 'order-list' ? 'closed' : window.currentOrderFinancePanel)) || '').trim();
    return orderFinanceNavItems.some((item) => item.key === candidate) ? candidate : 'closed';
}

window.resolveExhibitionPanelKey = function(preferred = '') {
    const available = window.getAvailableExhibitionNavItems?.() || exhibitionNavItems;
    const candidate = String(preferred || window.currentExhibitionPanel || '').trim();
    return available.some((item) => item.key === candidate) ? candidate : (available[0]?.key || 'refrigerator-rentals');
}

window.getWorkbenchTabs = function() {
    if (!Array.isArray(window.workbenchTabs)) window.workbenchTabs = [];
    return window.workbenchTabs;
}

window.getActiveWorkbenchTab = function() {
    return window.getWorkbenchTabs().find((tab) => tab.id === window.activeWorkbenchTabId) || null;
}

window.refreshWorkbenchTabMeta = function(tab) {
    if (!tab || !tab.groupId) return tab;
    if (tab.groupId === 'home') {
        tab.panelKey = window.resolveHomePanelKey(tab.panelKey);
        tab.sectionId = 'home';
        tab.baseLabel = '数据看板';
        tab.title = `数据看板 · ${window.getHomePanelLabel(tab.panelKey)}`;
        return tab;
    }
    if (tab.groupId === 'config') {
        tab.panelKey = window.resolveConfigPanelKey(tab.panelKey);
        tab.sectionId = 'config';
        tab.baseLabel = '系统配置';
        tab.title = `系统配置 · ${window.getConfigPanelLabel(tab.panelKey)}`;
        return tab;
    }
    if (tab.groupId === 'booth-map') {
        tab.panelKey = window.resolveBoothMapPanelKey(tab.panelKey);
        tab.sectionId = 'booth-map';
        tab.baseLabel = '展位图管理';
        tab.title = `展位图管理 · ${window.getBoothMapPanelLabel(tab.panelKey)}`;
        return tab;
    }
    if (tab.groupId === 'exhibition') {
        tab.panelKey = window.resolveExhibitionPanelKey(tab.panelKey);
        tab.sectionId = 'exhibition';
        tab.baseLabel = '展务管理';
        tab.title = `展务管理 · ${window.getExhibitionPanelLabel(tab.panelKey)}`;
        return tab;
    }
    if (tab.groupId === 'order-finance') {
        tab.panelKey = window.resolveOrderFinancePanelKey(tab.panelKey, tab.sectionId);
        tab.sectionId = tab.panelKey === 'pending' ? 'pending-orders' : 'order-list';
        tab.baseLabel = '订单与财务管理';
        tab.title = `订单与财务管理 · ${window.getOrderFinancePanelLabel(tab.panelKey)}`;
        return tab;
    }
    tab.sectionId = tab.groupId;
    tab.baseLabel = window.getNavItemLabel(tab.groupId) || tab.baseLabel || tab.title || '';
    tab.title = tab.baseLabel;
    tab.panelKey = '';
    return tab;
}

window.buildWorkbenchTabDescriptor = function(sectionId, label = '') {
    const groupId = window.resolveWorkbenchGroupId(sectionId);
    const descriptor = {
        id: groupId,
        groupId,
        sectionId: String(sectionId || groupId || '').trim(),
        baseLabel: label || window.getNavItemLabel(groupId),
        title: label || window.getNavItemLabel(groupId),
        panelKey: '',
        loaded: false,
        scrollTop: 0,
        snapshot: null
    };
    if (groupId === 'home') {
        descriptor.panelKey = window.resolveHomePanelKey();
    } else if (groupId === 'config') {
        descriptor.panelKey = window.resolveConfigPanelKey();
    } else if (groupId === 'booth-map') {
        descriptor.panelKey = window.resolveBoothMapPanelKey();
    } else if (groupId === 'exhibition') {
        descriptor.panelKey = window.resolveExhibitionPanelKey();
    } else if (groupId === 'order-finance') {
        descriptor.panelKey = window.resolveOrderFinancePanelKey('', sectionId);
    }
    return window.refreshWorkbenchTabMeta(descriptor);
}

window.normalizeWorkbenchStoredTab = function(rawTab) {
    const rawGroupId = window.resolveWorkbenchGroupId(rawTab?.groupId || rawTab?.id || rawTab?.sectionId || '');
    if (!rawGroupId) return null;
    const preferredSectionId = rawGroupId === 'order-finance'
        ? (String(rawTab?.sectionId || '').trim() || 'order-list')
        : rawGroupId;
    const normalizedTab = window.buildWorkbenchTabDescriptor(preferredSectionId, rawTab?.title || rawTab?.baseLabel || '');
    normalizedTab.groupId = rawGroupId;
    normalizedTab.id = rawGroupId;
    normalizedTab.panelKey = String(rawTab?.panelKey || normalizedTab.panelKey || '').trim();
    normalizedTab.snapshot = window.cloneWorkbenchData(rawTab?.snapshot, null);
    normalizedTab.scrollTop = Math.max(0, Number(rawTab?.scrollTop || rawTab?.snapshot?.scrollTop || 0));
    normalizedTab.loaded = false;
    return window.refreshWorkbenchTabMeta(normalizedTab);
}

window.getMainContentScrollTop = function() {
    const mainEl = document.querySelector('#main-view main');
    const contentEl = document.getElementById('main-content');
    const documentEl = document.scrollingElement || document.documentElement;
    return Math.max(
        Number(window.scrollY || 0),
        Number(documentEl?.scrollTop || 0),
        Number(mainEl?.scrollTop || 0),
        Number(contentEl?.scrollTop || 0)
    );
}

window.restoreMainContentScrollTop = function(scrollTop = 0) {
    const normalizedTop = Math.max(0, Number(scrollTop || 0));
    const mainEl = document.querySelector('#main-view main');
    const contentEl = document.getElementById('main-content');
    const documentEl = document.scrollingElement || document.documentElement;
    const apply = () => {
        if (typeof window.scrollTo === 'function') {
            window.scrollTo(0, normalizedTop);
        }
        [documentEl, document.documentElement, document.body, mainEl, contentEl].forEach((el) => {
            if (el && typeof el.scrollTop === 'number') {
                el.scrollTop = normalizedTop;
            }
        });
    };
    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 80);
}

window.captureSectionFormState = function(sectionId) {
    const root = document.getElementById(`sec-${sectionId}`);
    if (!root || typeof root.querySelectorAll !== 'function') return null;
    const fields = {};
    const radioGroups = {};
    root.querySelectorAll('input, select, textarea').forEach((element) => {
        const type = String(element.type || '').toLowerCase();
        const tagName = String(element.tagName || '').toLowerCase();
        if (['file', 'button', 'submit', 'reset'].includes(type)) return;
        if (type === 'radio') {
            if (element.name && element.checked) radioGroups[element.name] = element.value;
            return;
        }
        const key = element.id ? `id:${element.id}` : (element.name ? `name:${element.name}` : '');
        if (!key) return;
        if (type === 'checkbox') {
            fields[key] = { kind: 'checkbox', checked: !!element.checked };
            return;
        }
        if (tagName === 'select' && element.multiple) {
            fields[key] = {
                kind: 'select-multiple',
                values: Array.from(element.options || []).filter((option) => option.selected).map((option) => option.value)
            };
            return;
        }
        fields[key] = { kind: 'value', value: element.value };
    });
    return { fields, radioGroups };
}

window.applySectionFormState = function(sectionId, formState) {
    if (!formState) return;
    const root = document.getElementById(`sec-${sectionId}`);
    if (!root) return;
    Object.entries(formState.fields || {}).forEach(([key, value]) => {
        const [lookupType, lookupValue] = key.split(':');
        const element = lookupType === 'id'
            ? document.getElementById(lookupValue)
            : root.querySelector?.(`[name="${lookupValue}"]`);
        if (!element) return;
        if (value.kind === 'checkbox') {
            element.checked = !!value.checked;
            return;
        }
        if (value.kind === 'select-multiple' && element.options) {
            const selectedValues = new Set(Array.isArray(value.values) ? value.values : []);
            Array.from(element.options).forEach((option) => {
                option.selected = selectedValues.has(option.value);
            });
            return;
        }
        element.value = value.value ?? '';
    });
    Object.entries(formState.radioGroups || {}).forEach(([name, selectedValue]) => {
        root.querySelectorAll?.(`input[type="radio"][name="${name}"]`).forEach((element) => {
            element.checked = String(element.value) === String(selectedValue);
        });
    });
}

window.captureWorkbenchSpecificSnapshot = function(tab) {
    if (!tab) return {};
    if (tab.groupId === 'home') {
        return {
            home: {
                activeHomeTab: window.resolveHomePanelKey(window.activeHomeTab),
                homeFilterStartDate: window.homeFilterStartDate || '',
                homeFilterEndDate: window.homeFilterEndDate || '',
                homeSalesListSortKey: window.homeSalesListSortKey || '',
                homeSalesListSortDirection: window.homeSalesListSortDirection || 'asc'
            }
        };
    }
    if (tab.groupId === 'config') {
        return {
            config: {
                currentConfigPanel: window.resolveConfigPanelKey(window.currentConfigPanel)
            }
        };
    }
    if (tab.groupId === 'booth-map') {
        const boothMapState = typeof window.getBoothMapState === 'function' ? window.getBoothMapState() : {};
        return {
            boothMap: {
                currentBoothMapPanel: window.resolveBoothMapPanelKey(window.currentBoothMapPanel),
                currentMapId: Number(currentBoothMapId || 0),
                activeTab: boothMapState?.activeTab || '',
                viewBox: boothMapState?.viewBox || null,
                previewViewBox: boothMapState?.previewViewBox || null
            }
        };
    }
    if (tab.groupId === 'exhibition') {
        return {
            exhibition: {
                currentExhibitionPanel: window.resolveExhibitionPanelKey(window.currentExhibitionPanel)
            }
        };
    }
    if (tab.groupId === 'order-finance') {
        return {
            orderFinance: {
                panelKey: window.resolveOrderFinancePanelKey(window.currentOrderFinancePanel, window.currentSectionId),
                orderListState: window.cloneWorkbenchData(window.getOrderListState?.(), null),
                pendingOrderListState: window.cloneWorkbenchData(window.getPendingOrderListState?.(), null),
                selectedOrderId: window.selectedOrderId || ''
            }
        };
    }
    if (tab.groupId === 'order-entry') {
        return {
            orderEntry: {
                orderNoBooth: !!window.orderNoBooth,
                currentAllocatedArea: Number(window.currentAllocatedArea || 0),
                currentStandardFee: Number(currentStandardFee || 0),
                isJointExhibition: !!isJointExhibition,
                selectedOrderBooths: window.cloneWorkbenchData(window.selectedOrderBooths || [], []),
                dynamicFees: window.cloneWorkbenchData(dynamicFees || [], [])
            }
        };
    }
    return {};
}

window.buildWorkbenchTabSnapshot = function(tab) {
    if (!tab) return null;
    return {
        sectionId: tab.sectionId,
        panelKey: tab.panelKey || '',
        scrollTop: window.getMainContentScrollTop(),
        formState: window.captureSectionFormState(tab.sectionId),
        ...window.captureWorkbenchSpecificSnapshot(tab)
    };
}

window.applyWorkbenchSnapshotBeforeLoad = function(tab) {
    const snapshot = tab?.snapshot || {};
    if (!tab) return;
    if (tab.groupId === 'home') {
        const homeSnapshot = snapshot.home || {};
        window.activeHomeTab = window.resolveHomePanelKey(homeSnapshot.activeHomeTab || tab.panelKey);
        if (homeSnapshot.homeFilterStartDate) window.homeFilterStartDate = homeSnapshot.homeFilterStartDate;
        if (homeSnapshot.homeFilterEndDate) window.homeFilterEndDate = homeSnapshot.homeFilterEndDate;
        if (typeof homeSnapshot.homeSalesListSortKey === 'string') window.homeSalesListSortKey = homeSnapshot.homeSalesListSortKey;
        if (typeof homeSnapshot.homeSalesListSortDirection === 'string') window.homeSalesListSortDirection = homeSnapshot.homeSalesListSortDirection || 'asc';
        tab.panelKey = window.activeHomeTab;
        window.refreshWorkbenchTabMeta(tab);
        return;
    }
    if (tab.groupId === 'config') {
        window.currentConfigPanel = window.resolveConfigPanelKey(snapshot.config?.currentConfigPanel || tab.panelKey);
        tab.panelKey = window.currentConfigPanel;
        window.refreshWorkbenchTabMeta(tab);
        return;
    }
    if (tab.groupId === 'booth-map') {
        window.currentBoothMapPanel = window.resolveBoothMapPanelKey(snapshot.boothMap?.currentBoothMapPanel || tab.panelKey);
        tab.panelKey = window.currentBoothMapPanel;
        window.refreshWorkbenchTabMeta(tab);
        return;
    }
    if (tab.groupId === 'exhibition') {
        window.currentExhibitionPanel = window.resolveExhibitionPanelKey(snapshot.exhibition?.currentExhibitionPanel || tab.panelKey);
        tab.panelKey = window.currentExhibitionPanel;
        window.refreshWorkbenchTabMeta(tab);
        return;
    }
    if (tab.groupId === 'order-finance') {
        const financeSnapshot = snapshot.orderFinance || {};
        tab.panelKey = window.resolveOrderFinancePanelKey(financeSnapshot.panelKey || tab.panelKey, tab.sectionId);
        window.currentOrderFinancePanel = tab.panelKey;
        tab.sectionId = tab.panelKey === 'pending' ? 'pending-orders' : 'order-list';
        if (financeSnapshot.orderListState && typeof window.getOrderListState === 'function') {
            Object.assign(window.getOrderListState(), financeSnapshot.orderListState);
        }
        if (financeSnapshot.pendingOrderListState && typeof window.getPendingOrderListState === 'function') {
            Object.assign(window.getPendingOrderListState(), financeSnapshot.pendingOrderListState);
        }
        window.refreshWorkbenchTabMeta(tab);
        if (snapshot.formState) window.applySectionFormState(tab.sectionId, snapshot.formState);
    }
}

window.applyWorkbenchSnapshotAfterLoad = function(tab) {
    const snapshot = tab?.snapshot || {};
    if (!tab) return;
    if (tab.groupId === 'order-entry') {
        window.applySectionFormState(tab.sectionId, snapshot.formState);
        const orderEntrySnapshot = snapshot.orderEntry || {};
        window.selectedOrderBooths = window.cloneWorkbenchData(orderEntrySnapshot.selectedOrderBooths || [], []);
        dynamicFees = window.cloneWorkbenchData(orderEntrySnapshot.dynamicFees || [], []);
        window.currentAllocatedArea = Number(orderEntrySnapshot.currentAllocatedArea || 0);
        window.orderNoBooth = !!orderEntrySnapshot.orderNoBooth;
        currentStandardFee = Number(orderEntrySnapshot.currentStandardFee || 0);
        isJointExhibition = !!orderEntrySnapshot.isJointExhibition;
        const noBoothCheckbox = document.getElementById('order-no-booth-order');
        if (noBoothCheckbox) noBoothCheckbox.checked = !!window.orderNoBooth;
        window.renderDynamicFees?.();
        window.toggleAgent?.();
        window.toggleCreditCode?.();
        window.onProvinceChange?.();
        window.onCityChange?.();
        window.renderSelectedBooths?.();
        window.updateBoothDisplayNamePanel?.();
        window.calculateFinalTotal?.();
        window.refreshOrderOverview?.();
        return;
    }

    if (snapshot.formState) {
        window.applySectionFormState(tab.sectionId, snapshot.formState);
    }

    if (tab.groupId === 'home') {
        window.switchHomeTab?.(tab.panelKey, false);
        return;
    }
    if (tab.groupId === 'config') {
        window.renderConfigSubnav?.();
        return;
    }
    if (tab.groupId === 'booth-map') {
        window.switchBoothMapTab?.(tab.panelKey, { syncNav: false, syncWorkbench: false });
        return;
    }
    if (tab.groupId === 'exhibition') {
        window.openExhibitionPanel?.(tab.panelKey, { skipLoad: true });
        return;
    }
    if (tab.groupId === 'order-finance') {
        window.selectedOrderId = snapshot.orderFinance?.selectedOrderId || '';
        window.renderOrderActionToolbar?.();
    }
}

window.syncWorkbenchTabFromGlobals = function(tab) {
    if (!tab) return;
    if (tab.groupId === 'home') {
        tab.panelKey = window.resolveHomePanelKey(window.activeHomeTab);
    } else if (tab.groupId === 'config') {
        tab.panelKey = window.resolveConfigPanelKey(window.currentConfigPanel);
    } else if (tab.groupId === 'booth-map') {
        tab.panelKey = window.resolveBoothMapPanelKey(window.currentBoothMapPanel);
    } else if (tab.groupId === 'exhibition') {
        tab.panelKey = window.resolveExhibitionPanelKey(window.currentExhibitionPanel);
    } else if (tab.groupId === 'order-finance') {
        tab.panelKey = window.resolveOrderFinancePanelKey(window.currentOrderFinancePanel, window.currentSectionId);
        tab.sectionId = tab.panelKey === 'pending' ? 'pending-orders' : 'order-list';
    }
    window.refreshWorkbenchTabMeta(tab);
}

window.persistWorkbenchState = function() {
    try {
        const payload = {
            tabs: window.getWorkbenchTabs().map((tab) => ({
                id: tab.id,
                groupId: tab.groupId,
                sectionId: tab.sectionId,
                baseLabel: tab.baseLabel,
                title: tab.title,
                panelKey: tab.panelKey || '',
                scrollTop: Math.max(0, Number(tab.scrollTop || 0)),
                snapshot: tab.snapshot || null
            })),
            activeTabId: window.activeWorkbenchTabId || '',
            history: Array.isArray(window.workbenchTabHistory) ? window.workbenchTabHistory : [],
            projectId: document.getElementById('global-project-select')?.value || window.pendingWorkbenchProjectId || ''
        };
        sessionStorage.setItem(WORKBENCH_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to persist workbench state:', error);
    }
}

window.restoreWorkbenchState = function() {
    try {
        const rawValue = sessionStorage.getItem(WORKBENCH_STORAGE_KEY);
        if (!rawValue) return;
        const parsed = JSON.parse(rawValue);
        const restoredTabs = (Array.isArray(parsed?.tabs) ? parsed.tabs : [])
            .map((item) => window.normalizeWorkbenchStoredTab(item))
            .filter((item) => item && window.canAccessSection(item.sectionId));
        window.workbenchTabs = restoredTabs;
        window.activeWorkbenchTabId = restoredTabs.some((item) => item.id === parsed?.activeTabId)
            ? parsed.activeTabId
            : (restoredTabs[0]?.id || '');
        const validTabIds = new Set(restoredTabs.map((item) => item.id));
        window.workbenchTabHistory = (Array.isArray(parsed?.history) ? parsed.history : []).filter((tabId) => validTabIds.has(tabId));
        window.pendingWorkbenchProjectId = String(parsed?.projectId || '').trim();
    } catch (error) {
        console.warn('Failed to restore workbench state:', error);
        window.workbenchTabs = [];
        window.activeWorkbenchTabId = '';
        window.workbenchTabHistory = [];
        window.pendingWorkbenchProjectId = '';
    }
}

window.clearWorkbenchState = function() {
    window.workbenchTabs = [];
    window.activeWorkbenchTabId = '';
    window.workbenchTabHistory = [];
    window.pendingWorkbenchProjectId = '';
    try {
        sessionStorage.removeItem(WORKBENCH_STORAGE_KEY);
    } catch (error) {
        console.warn('Failed to clear workbench state:', error);
    }
}

window.rememberWorkbenchVisit = function(tabId) {
    const normalizedTabId = String(tabId || '').trim();
    if (!normalizedTabId) return;
    window.workbenchTabHistory = (window.workbenchTabHistory || []).filter((item) => item !== normalizedTabId);
    window.workbenchTabHistory.push(normalizedTabId);
}

window.captureActiveWorkbenchTabState = function() {
    const activeTab = window.getActiveWorkbenchTab();
    if (!activeTab) return;
    window.syncWorkbenchTabFromGlobals(activeTab);
    activeTab.scrollTop = window.getMainContentScrollTop();
    activeTab.snapshot = window.buildWorkbenchTabSnapshot(activeTab);
    window.persistWorkbenchState();
}

window.addEventListener('beforeunload', () => {
    window.captureActiveWorkbenchTabState?.();
});

window.applyWorkbenchTabContext = function(tab) {
    if (!tab) return;
    if (tab.groupId === 'home') {
        window.activeHomeTab = window.resolveHomePanelKey(tab.panelKey);
    }
    if (tab.groupId === 'config') {
        window.currentConfigPanel = window.resolveConfigPanelKey(tab.panelKey);
    }
    if (tab.groupId === 'booth-map') {
        window.currentBoothMapPanel = window.resolveBoothMapPanelKey(tab.panelKey);
    }
    if (tab.groupId === 'exhibition') {
        window.currentExhibitionPanel = window.resolveExhibitionPanelKey(tab.panelKey);
    }
    if (tab.groupId === 'order-finance') {
        window.currentOrderFinancePanel = window.resolveOrderFinancePanelKey(tab.panelKey, tab.sectionId);
        tab.sectionId = window.currentOrderFinancePanel === 'pending' ? 'pending-orders' : 'order-list';
    }
    window.currentSectionId = tab.sectionId;
    window.isHomeNavExpanded = tab.groupId === 'home';
    window.isConfigNavExpanded = tab.groupId === 'config';
    window.isBoothMapNavExpanded = tab.groupId === 'booth-map';
    window.isOrderFinanceNavExpanded = tab.groupId === 'order-finance';
    window.isExhibitionNavExpanded = tab.groupId === 'exhibition';
}

window.syncWorkbenchHeader = function(tab) {
    if (!tab) return;
    document.getElementById('current-page-title').innerText = tab.title || tab.baseLabel || '';
    window.pinActiveSectionToTop(tab.sectionId);
    window.renderNav?.();
    window.renderWorkbenchTabs?.();
}

window.loadWorkbenchTabContent = async function(tab) {
    if (!tab) return;
    window.applyWorkbenchSnapshotBeforeLoad(tab);
    window.applyWorkbenchTabContext(tab);
    window.syncWorkbenchHeader(tab);

    if (tab.groupId === 'home') {
        window.switchHomeTab?.(tab.panelKey, false);
        await window.loadHomeDashboard?.();
    } else if (tab.groupId === 'config') {
        window.openConfigPanel?.(tab.panelKey, { syncWorkbench: false });
        await Promise.all([
            window.loadStaff?.(),
            window.loadAccounts?.(),
            window.loadIndustries?.(),
            window.loadErpConfig?.(),
            window.loadOrderFieldSettings?.(),
            window.loadOrderReleaseSettings?.()
        ]);
    } else if (tab.groupId === 'booth-map') {
        await window.ensureFeatureScriptLoaded?.('booth-map');
        await window.initBoothMapPage?.();
    } else if (tab.groupId === 'exhibition') {
        await window.ensureFeatureScriptLoaded?.('exhibition');
        await window.loadExhibitionPanel?.(tab.panelKey, { force: !tab.loaded });
    } else if (tab.groupId === 'booth') {
        await Promise.all([
            window.loadPrices?.(),
            window.loadBooths?.()
        ]);
    } else if (tab.groupId === 'agents') {
        await window.loadAgents?.();
    } else if (tab.groupId === 'order-entry') {
        await window.initOrderForm?.();
    } else if (tab.groupId === 'order-finance') {
        await window.ensureFeatureScriptLoaded?.('finance');
        await window.loadOrderFieldSettings?.();
        if (tab.sectionId === 'order-list') {
            await window.loadOrderList?.();
        } else {
            await window.loadPendingOrderList?.();
        }
    }

    window.applyWorkbenchSnapshotAfterLoad(tab);
    tab.loaded = true;
    tab.scrollTop = Math.max(0, Number(tab.snapshot?.scrollTop || 0));
    window.syncWorkbenchHeader(tab);
    if (tab.snapshot?.scrollTop > 0) {
        window.restoreMainContentScrollTop(tab.snapshot.scrollTop);
    } else {
        window.queueMainContentTopReset?.();
    }
    window.persistWorkbenchState();
}

window.restoreLoadedWorkbenchTab = function(tab) {
    if (!tab) return;
    window.applyWorkbenchSnapshotBeforeLoad(tab);
    window.applyWorkbenchTabContext(tab);
    window.syncWorkbenchHeader(tab);
    window.applyWorkbenchSnapshotAfterLoad(tab);
    if (tab.snapshot?.scrollTop > 0) {
        window.restoreMainContentScrollTop(tab.snapshot.scrollTop);
    } else {
        window.queueMainContentTopReset?.();
    }
    window.persistWorkbenchState();
}

window.activateWorkbenchTab = async function(tabId, options = {}) {
    const targetTab = window.getWorkbenchTabs().find((tab) => tab.id === tabId);
    if (!targetTab) return;
    if (!options.skipCapture && window.activeWorkbenchTabId) {
        window.captureActiveWorkbenchTabState();
    }
    window.activeWorkbenchTabId = targetTab.id;
    window.rememberWorkbenchVisit(targetTab.id);
    if (options.forceReload || !targetTab.loaded) {
        await window.loadWorkbenchTabContent(targetTab);
        return;
    }
    window.restoreLoadedWorkbenchTab(targetTab);
}

window.renderWorkbenchTabs = function() {
    const container = document.getElementById('workbench-tabs');
    const shell = document.getElementById('workbench-tabs-shell');
    if (!container || !shell) return;
    const tabs = window.getWorkbenchTabs();
    shell.classList.toggle('hidden', tabs.length === 0);
    container.innerHTML = '';
    tabs.forEach((tab) => {
        const isActive = tab.id === window.activeWorkbenchTabId;
        const item = document.createElement('div');
        item.className = `group inline-flex max-w-[320px] shrink-0 items-center rounded-2xl border ${isActive ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`;

        const tabButton = document.createElement('button');
        tabButton.type = 'button';
        tabButton.className = 'inline-flex min-w-0 items-center gap-2 px-3 py-2 text-sm font-bold';
        tabButton.innerHTML = `
            <span class="inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'bg-blue-500' : 'bg-slate-300'}"></span>
            <span class="truncate">${window.escapeHtml?.(tab.title || tab.baseLabel || '') || (tab.title || tab.baseLabel || '')}</span>
        `;
        tabButton.onclick = () => {
            window.activateWorkbenchTab(tab.id).catch((error) => {
                console.error('Failed to activate workbench tab:', error);
                window.showToast?.(error.message || '切换标签失败', 'error');
            });
        };

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = `mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full transition ${isActive ? 'text-blue-500 hover:bg-blue-100 hover:text-blue-700' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`;
        closeButton.setAttribute('aria-label', `关闭 ${tab.title || tab.baseLabel || '标签页'}`);
        closeButton.innerHTML = window.renderIcon?.('close', 'h-3.5 w-3.5', 2.2) || '×';
        closeButton.onclick = (event) => {
            event.stopPropagation();
            window.closeWorkbenchTab(tab.id).catch((error) => {
                console.error('Failed to close workbench tab:', error);
                window.showToast?.(error.message || '关闭标签失败', 'error');
            });
        };

        item.appendChild(tabButton);
        item.appendChild(closeButton);
        container.appendChild(item);
    });
}

window.closeWorkbenchTab = async function(tabId) {
    const tabs = window.getWorkbenchTabs();
    const targetIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (targetIndex < 0) return;
    const isActive = window.activeWorkbenchTabId === tabId;
    if (isActive) {
        window.captureActiveWorkbenchTabState();
    }
    tabs.splice(targetIndex, 1);
    window.workbenchTabHistory = (window.workbenchTabHistory || []).filter((item) => item !== tabId);

    if (tabs.length === 0) {
        window.activeWorkbenchTabId = '';
        window.persistWorkbenchState();
        const defaultSection = window.getDefaultWorkbenchSectionInfo?.();
        await window.openSection(defaultSection?.sectionId || 'home', defaultSection?.label || '数据看板');
        return;
    }

    if (!isActive) {
        window.renderWorkbenchTabs();
        window.persistWorkbenchState();
        return;
    }

    const fallbackId = window.workbenchTabHistory[window.workbenchTabHistory.length - 1]
        || tabs[Math.max(0, targetIndex - 1)]?.id
        || tabs[0]?.id;
    window.activeWorkbenchTabId = '';
    await window.activateWorkbenchTab(fallbackId, { skipCapture: true });
}

window.initializeWorkbenchTabs = function() {
    window.restoreWorkbenchState();
    if (window.getWorkbenchTabs().length === 0) {
        const defaultSection = window.getDefaultWorkbenchSectionInfo?.();
        const sectionId = defaultSection?.sectionId || 'home';
        const label = defaultSection?.label || '数据看板';
        const defaultTab = window.buildWorkbenchTabDescriptor(sectionId, label);
        window.workbenchTabs = [defaultTab];
        window.activeWorkbenchTabId = defaultTab.id;
        window.workbenchTabHistory = [];
    }
    const firstTabId = window.getWorkbenchTabs().some((tab) => tab.id === window.activeWorkbenchTabId)
        ? window.activeWorkbenchTabId
        : (window.getWorkbenchTabs()[0]?.id || '');
    window.renderWorkbenchTabs();
    return window.activateWorkbenchTab(firstTabId, { skipCapture: true }).catch((error) => {
        console.error('Failed to initialize workbench tabs:', error);
        window.showToast?.(error.message || '初始化工作台失败', 'error');
    });
}

window.handleWorkbenchProjectChange = function() {
    const activeTabId = window.activeWorkbenchTabId;
    window.getWorkbenchTabs().forEach((tab) => {
        if (tab.id !== activeTabId) tab.loaded = false;
    });
    window.captureActiveWorkbenchTabState();
    window.persistWorkbenchState();
}

window.invalidateWorkbenchTabs = function({ tabIds = [], groupIds = [], sectionIds = [], resetSnapshots = false } = {}) {
    const normalizedTabIds = new Set((Array.isArray(tabIds) ? tabIds : []).map((item) => String(item || '').trim()).filter(Boolean));
    const normalizedGroupIds = new Set((Array.isArray(groupIds) ? groupIds : []).map((item) => String(item || '').trim()).filter(Boolean));
    const normalizedSectionIds = new Set((Array.isArray(sectionIds) ? sectionIds : []).map((item) => String(item || '').trim()).filter(Boolean));
    let changed = false;

    window.getWorkbenchTabs().forEach((tab) => {
        const matches = normalizedTabIds.has(tab.id)
            || normalizedGroupIds.has(tab.groupId)
            || normalizedSectionIds.has(tab.sectionId);
        if (!matches) return;
        tab.loaded = false;
        if (resetSnapshots) {
            tab.snapshot = null;
            tab.scrollTop = 0;
        }
        changed = true;
    });

    if (changed) {
        window.persistWorkbenchState();
    }
}

window.consumeWorkbenchProjectId = function() {
    const projectId = window.pendingWorkbenchProjectId || '';
    window.pendingWorkbenchProjectId = '';
    return projectId;
}

window.isSuperAdmin = function(user = window.currentUser) {
    if (!user) return false;
    const normalizedRole = window.normalizeUserRole?.(user.role) || String(user.role || '').trim().toLowerCase();
    return normalizedRole === 'super_admin' || (normalizedRole === 'admin' && user.name === 'admin');
}

window.canAccessSection = function(sectionId, user = window.currentUser) {
    const section = navConfig.find((item) => item.id === sectionId);
    if (!section || !user) return false;
    const normalizedRole = window.normalizeUserRole?.(user.role) || String(user.role || '').trim().toLowerCase();
    const allowedRoles = (Array.isArray(section.roles) ? section.roles : []).map((role) => window.normalizeUserRole?.(role) || String(role || '').trim().toLowerCase());
    const roleAllowed = allowedRoles.includes(normalizedRole) || (normalizedRole === 'super_admin' && allowedRoles.includes('admin'));
    if (!roleAllowed) return false;
    if (section.superAdminOnly && !window.isSuperAdmin(user)) return false;
    return true;
}

window.getAvailableBoothMapNavItems = function(user = window.currentUser) {
    if (window.isSuperAdmin?.(user)) return boothMapNavItems;
    return boothMapNavItems.filter((item) => item.key === 'preview');
}

window.getAvailableExhibitionNavItems = function(user = window.currentUser) {
    const isSuper = !!window.isSuperAdmin?.(user);
    const isExhAdmin = isSuper || !!window.isExhibitionManager?.(user);
    return exhibitionNavItems.filter((item) => {
        if (item.superAdminOnly && !isSuper) return false;
        if (item.exhibitionAdminOnly && !isExhAdmin) return false;
        return true;
    });
}

window.getOrderedNavItems = function(user = window.currentUser) {
    const items = [...navConfig];
    const exhibitionIndex = items.findIndex((item) => item.id === 'exhibition');
    if (exhibitionIndex < 0) return items;
    const [exhibitionItem] = items.splice(exhibitionIndex, 1);
    const normalizedRole = window.normalizeUserRole?.(user?.role) || String(user?.role || '').trim().toLowerCase();
    if (normalizedRole === 'exhibition_manager') {
        const boothMapItem = items.find((item) => item.id === 'booth-map');
        return boothMapItem ? [boothMapItem, exhibitionItem] : [exhibitionItem];
    }
    const anchorId = window.isSuperAdmin?.(user)
        ? 'booth'
        : (normalizedRole === 'admin' || window.canAccessSection?.('booth-map', user) ? 'booth-map' : 'order-list');
    const anchorIndex = items.findIndex((item) => item.id === anchorId);
    items.splice(anchorIndex >= 0 ? anchorIndex + 1 : items.length, 0, exhibitionItem);
    return items;
}

window.handleLogin = async function() { 
    const u = document.getElementById('login-user').value; 
    const p = document.getElementById('login-pass').value; 
    if(!u || !p) return window.showToast('请输入账号和密码', 'error');

    window.toggleBtnLoading('login-btn', true);
    try {
        const loginData = await window.readApiJson(
            await fetch('/api/login', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({username: u, password: p}) 
            }),
            '登录失败，账号或密码错误',
            {}
        );
        if (!loginData?.user) {
            throw new Error('登录失败，返回数据异常');
        }
        window.setCurrentAuthUser(loginData.user);
        window.showToast('登录成功！');
        await window.enterMainView(); 
    } catch(e) {
        const message = e?.message && e.message !== 'Failed to fetch' ? e.message : '网络请求失败';
        window.showToast(message, 'error');
    } finally {
        window.toggleBtnLoading('login-btn', false);
    }
}

window.handleLogout = function() { 
    window.clearWorkbenchState();
    window.clearCurrentAuthUser();
    location.reload(); 
}

window.getDefaultWorkbenchSectionInfo = function(user = window.currentUser) {
    const normalizedRole = window.normalizeUserRole?.(user?.role) || String(user?.role || '').trim().toLowerCase();
    if (normalizedRole === 'exhibition_manager') {
        const panelKey = window.resolveExhibitionPanelKey?.(window.currentExhibitionPanel) || 'refrigerator-rentals';
        return {
            sectionId: 'exhibition',
            label: `展务管理 · ${window.getExhibitionPanelLabel?.(panelKey) || '冰柜租赁管理'}`
        };
    }
    return { sectionId: 'home', label: '数据看板' };
}

window.resetMainContentTop = function() {
    const mainEl = document.querySelector('#main-view main');
    const contentEl = document.getElementById('main-content');
    const scrollingEl = document.scrollingElement || document.documentElement;

    window.scrollTo(0, 0);
    [scrollingEl, document.documentElement, document.body, mainEl, contentEl].forEach((el) => {
        if (el && typeof el.scrollTop === 'number') {
            el.scrollTop = 0;
            el.scrollLeft = 0;
        }
    });
}

window.queueMainContentTopReset = function() {
    window.resetMainContentTop();
    requestAnimationFrame(() => window.resetMainContentTop());
    setTimeout(() => window.resetMainContentTop(), 80);
    setTimeout(() => window.resetMainContentTop(), 250);
}

window.pinActiveSectionToTop = function(sectionId) {
    const contentEl = document.getElementById('main-content');
    if (contentEl) {
        contentEl.style.alignContent = 'flex-start';
        contentEl.style.alignItems = 'flex-start';
        contentEl.style.display = 'grid';
        contentEl.style.gridTemplateColumns = 'minmax(0, 1fr)';
        contentEl.style.justifyItems = 'stretch';
    }

    if (sectionId !== 'exhibition' && window.isRefrigeratorConfigEditorOpen) {
        window.closeRefrigeratorConfigEditor?.();
    }
    if (sectionId !== 'exhibition' && window.isRefrigeratorRentalEditorOpen) {
        window.closeRefrigeratorRentalEditor?.();
    }
    if (sectionId !== 'exhibition' && window.isLintelEditorOpen) {
        window.closeLintelEditor?.();
    }

    document.querySelectorAll('.page-section').forEach((section) => {
        const isActive = section.id === `sec-${sectionId}`;
        section.classList.toggle('active', isActive);
        section.style.display = isActive ? 'block' : 'none';
        section.style.alignSelf = 'start';
        section.style.gridColumn = '1';
        section.style.gridRow = '1';
        section.style.marginTop = '0';
        section.style.minWidth = '0';
        section.style.transform = 'none';
        section.style.width = '100%';
    });
}

window.enterMainView = async function() { 
    document.getElementById('login-view').classList.add('hidden'); 
    document.getElementById('main-view').classList.remove('hidden'); 
    const normalizedRole = window.normalizeUserRole?.(currentUser?.role);
    const roleLabel = window.isSuperAdmin(currentUser)
        ? '超级管理员'
        : (normalizedRole === 'admin' ? '管理员' : (normalizedRole === 'exhibition_manager' ? '展务管理人员' : '业务员'));
    document.getElementById('user-info').innerText = `${currentUser.name} (${roleLabel})`; 
    window.renderNav(); 
    if (typeof window.loadProjects === 'function') {
        await window.loadProjects({ skipOnProjectChange: true });
    }
    await window.initializeWorkbenchTabs();
    if (currentUser?.must_change_password) {
        window.showToast('当前账号仍在使用默认密码，请先修改为 6～20 位的新密码', 'error');
        setTimeout(() => window.openPasswordModal(true), 100);
    }
}

window.openSection = async function(sectionId, label) {
    if (!window.canAccessSection(sectionId)) {
        window.showToast('该页面仅超级管理员可访问', 'error');
        return;
    }
    const descriptor = window.buildWorkbenchTabDescriptor(sectionId, label);
    const tabs = window.getWorkbenchTabs();
    const existingTab = tabs.find((tab) => tab.id === descriptor.id);
    if (!existingTab) {
        tabs.push(descriptor);
        await window.activateWorkbenchTab(descriptor.id, { forceReload: true });
        return;
    }

    window.captureActiveWorkbenchTabState();
    const previousSectionId = existingTab.sectionId;
    Object.assign(existingTab, {
        baseLabel: descriptor.baseLabel,
        title: descriptor.title,
        panelKey: descriptor.panelKey,
        sectionId: descriptor.sectionId
    });
    if (existingTab.groupId === 'order-finance' && previousSectionId !== existingTab.sectionId) {
        existingTab.loaded = false;
        existingTab.snapshot = null;
    }
    if (existingTab.groupId === 'exhibition') {
        existingTab.loaded = false;
        existingTab.snapshot = null;
    }
    window.refreshWorkbenchTabMeta(existingTab);
    await window.activateWorkbenchTab(existingTab.id, { skipCapture: true, forceReload: !existingTab.loaded });
}

window.renderNav = function() {
    const container = document.getElementById('nav-buttons'); container.innerHTML = '';
    const activeGroupId = window.resolveWorkbenchGroupId(window.currentSectionId || window.activeWorkbenchTabId || '');
    (window.getOrderedNavItems?.() || navConfig).forEach(item => {
        if (!window.canAccessSection(item.id)) return;
        if (item.hidden) return;

        if (!['config', 'home', 'booth-map', 'order-list', 'exhibition'].includes(item.id)) {
            const isActive = activeGroupId === item.id;
            const btn = document.createElement('button');
            btn.className = `${isActive ? 'btn-primary text-white shadow-sm' : 'btn-nav-muted shadow-sm'} w-full justify-start px-4 py-3 text-sm mb-1 text-left`;
            btn.innerHTML = `
                <span class="inline-flex w-full items-center gap-3">
                    <span class="nav-icon-shell ${isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-200'}">
                        ${window.renderIcon(item.icon, 'h-4 w-4', 2)}
                    </span>
                    <span class="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">${item.label}</span>
                </span>
            `;
            btn.onclick = () => { 
                window.openSection(item.id, item.label);
            }; 
            container.appendChild(btn);
            return;
        }

        const isOrderFinanceItem = item.id === 'order-list';
        const isExhibitionItem = item.id === 'exhibition';
        const groupId = isOrderFinanceItem ? 'order-finance' : item.id;
        const isActive = activeGroupId === groupId;
        const isHomeItem = item.id === 'home';
        const isBoothMapItem = item.id === 'booth-map';
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-1';

        const btn = document.createElement('button');
        btn.className = `${isActive ? 'btn-primary text-white shadow-sm' : 'btn-nav-muted shadow-sm'} w-full justify-between px-4 py-3 text-sm text-left`;
        btn.innerHTML = `
            <span class="inline-flex min-w-0 flex-1 items-center gap-3">
                <span class="nav-icon-shell ${isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-200'}">
                    ${window.renderIcon(item.icon, 'h-4 w-4', 2)}
                </span>
                <span class="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">${item.label}</span>
            </span>
            <span class="inline-flex items-center justify-center text-slate-200 transition-transform duration-200 ${(isHomeItem ? window.isHomeNavExpanded : (isBoothMapItem ? window.isBoothMapNavExpanded : (isOrderFinanceItem ? window.isOrderFinanceNavExpanded : (isExhibitionItem ? window.isExhibitionNavExpanded : window.isConfigNavExpanded)))) ? 'rotate-90' : ''}">
                ${window.renderIcon('chevronRight', 'h-4 w-4', 2)}
            </span>
        `;
        btn.onclick = () => {
            if (isActive) {
                if (isHomeItem) {
                    window.isHomeNavExpanded = !window.isHomeNavExpanded;
                } else if (isBoothMapItem) {
                    window.isBoothMapNavExpanded = !window.isBoothMapNavExpanded;
                } else if (isOrderFinanceItem) {
                    window.isOrderFinanceNavExpanded = !window.isOrderFinanceNavExpanded;
                } else if (isExhibitionItem) {
                    window.isExhibitionNavExpanded = !window.isExhibitionNavExpanded;
                } else {
                    window.isConfigNavExpanded = !window.isConfigNavExpanded;
                }
                window.renderNav();
                return;
            }
            if (isHomeItem) {
                window.isHomeNavExpanded = true;
            } else if (isBoothMapItem) {
                window.isBoothMapNavExpanded = true;
            } else if (isOrderFinanceItem) {
                window.isOrderFinanceNavExpanded = true;
            } else if (isExhibitionItem) {
                window.isExhibitionNavExpanded = true;
                } else {
                    window.isConfigNavExpanded = true;
                }
                window.openSection(item.id, isOrderFinanceItem ? '订单与财务管理 · 成交订单列表与财务管理' : item.label);
        };
        wrapper.appendChild(btn);

        const shouldShowChildren = isHomeItem
            ? window.isHomeNavExpanded
            : (isBoothMapItem ? window.isBoothMapNavExpanded : (isOrderFinanceItem ? window.isOrderFinanceNavExpanded : (isExhibitionItem ? window.isExhibitionNavExpanded : window.isConfigNavExpanded)));
        if (shouldShowChildren) {
            const childWrap = document.createElement('div');
            childWrap.className = 'mt-2 ml-2 space-y-1 rounded-2xl bg-slate-100/80 p-2 border border-slate-200';

            const childItems = isHomeItem
                ? dashboardNavItems.filter((subItem) => !subItem.adminOnly || window.isAdminUser?.())
                : (isBoothMapItem ? window.getAvailableBoothMapNavItems() : (isOrderFinanceItem ? orderFinanceNavItems : (isExhibitionItem ? window.getAvailableExhibitionNavItems() : configNavItems)));

            childItems.forEach((subItem) => {
                const isCurrentPanel = isHomeItem
                    ? (isActive && window.activeHomeTab === subItem.key)
                    : (isBoothMapItem
                        ? (isActive && window.currentBoothMapPanel === subItem.key)
                        : (isOrderFinanceItem
                            ? (isActive && window.currentOrderFinancePanel === subItem.key)
                            : (isExhibitionItem
                                ? (isActive && window.currentExhibitionPanel === subItem.key)
                                : (isActive && window.currentConfigPanel === subItem.key))));
                const childBtn = document.createElement('button');
                childBtn.className = `w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                    isCurrentPanel
                        ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`;
                childBtn.innerHTML = `
                    <span class="inline-flex min-w-0 items-center gap-2.5">
                        <span class="text-slate-400">${window.renderIcon(subItem.icon, 'h-4 w-4', 1.9)}</span>
                        <span class="flex-1 text-left ${subItem.key === 'closed' ? 'whitespace-nowrap overflow-hidden text-ellipsis' : ''}">${subItem.label}</span>
                    </span>
                `;
                childBtn.onclick = () => {
                    if (isHomeItem) {
                        window.activeHomeTab = subItem.key;
                        window.isHomeNavExpanded = true;
                        window.openSection('home', `数据看板 · ${subItem.label}`);
                    } else if (isBoothMapItem) {
                        window.currentBoothMapPanel = window.isSuperAdmin?.() ? subItem.key : 'preview';
                        window.isBoothMapNavExpanded = true;
                        window.openSection('booth-map', `展位图管理 · ${subItem.label}`);
                    } else if (isOrderFinanceItem) {
                        window.currentOrderFinancePanel = subItem.key;
                        window.isOrderFinanceNavExpanded = true;
                        window.openSection(subItem.sectionId, `订单与财务管理 · ${subItem.label}`);
                    } else if (isExhibitionItem) {
                        window.currentExhibitionPanel = subItem.key;
                        window.isExhibitionNavExpanded = true;
                        window.openSection('exhibition', `展务管理 · ${subItem.label}`);
                    } else {
                        window.currentConfigPanel = subItem.key;
                        window.isConfigNavExpanded = true;
                        window.openSection('config', `系统配置 · ${subItem.label}`);
                    }
                };
                childWrap.appendChild(childBtn);
            });

            wrapper.appendChild(childWrap);
        }

        container.appendChild(wrapper);
    });
}

window.openPasswordModal = function(force = false) {
    const modal = document.getElementById('password-modal');
    const oldPassInput = document.getElementById('modal-old-pass');
    const newPassInput = document.getElementById('modal-new-pass');
    const hint = document.getElementById('password-modal-hint');
    const cancelBtn = document.getElementById('password-modal-cancel');
    if (oldPassInput) oldPassInput.value = '';
    if (newPassInput) newPassInput.value = '';
    if (hint) {
        hint.innerText = force || window.currentUser?.must_change_password
            ? '当前账号仍在使用默认密码 123456，请立即修改为 6～20 位的新密码。'
            : '新密码长度 6～20 位，且不能继续使用默认密码 123456。';
    }
    if (cancelBtn) {
        cancelBtn.classList.toggle('hidden', !!(force || window.currentUser?.must_change_password));
    }
    modal.classList.remove('hidden');
}

window.submitPasswordChange = async function() { 
    const op = document.getElementById('modal-old-pass').value; const np = document.getElementById('modal-new-pass').value; 
    if(!op || !np) return window.showToast("请填写完整", 'error'); 
    window.toggleBtnLoading('btn-change-pass', true);
    try {
        await window.ensureApiSuccess(
            await window.apiFetch('/api/change-password', { method: 'POST', body: JSON.stringify({staffName: currentUser.name, oldPass: op, newPass: np}) }),
            '原密码错误'
        );
        const nextUser = { ...(window.getCurrentAuthUser?.() || currentUser || {}), must_change_password: false };
        window.setCurrentAuthUser(nextUser);
        window.showToast("修改成功，请重新登录"); 
        window.closeModal('password-modal'); 
        setTimeout(() => window.handleLogout(), 1500); 
    } catch (e) {
        window.showToast(e.message || "原密码错误", 'error');
    } finally {
        window.toggleBtnLoading('btn-change-pass', false);
    }
}
