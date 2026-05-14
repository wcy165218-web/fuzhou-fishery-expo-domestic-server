// ================= js/finance.js =================
window.selectedOrderExportIds = window.selectedOrderExportIds || new Set();
window.orderExportSelectionProjectId = window.orderExportSelectionProjectId || '';

window.buildOverpaymentActionsHtml = function(order, context = 'detail') {
    if (!window.canHandleOverpayment(order)) {
        return '<span class="badge-readonly">待所属业务员处理</span>';
    }
    const safeOrderId = JSON.stringify(String(order.id));
    const adjustBtn = `<button onclick='window.openOverpaymentModalById(${safeOrderId}, "fx_diff", "${context}")' class="btn-secondary px-3 py-1.5 text-xs shadow-sm">去处理</button>`;
    if (order?.overpayment_status === 'resolved_as_fx_diff' || order?.overpayment_status === 'on_hold') {
        return `${adjustBtn}<button onclick='window.openOverpaymentModalById(${safeOrderId}, ${JSON.stringify(order.overpayment_reason === 'on_hold' ? 'on_hold' : 'fx_diff')}, "${context}")' class="btn-soft-primary px-3 py-1.5 text-xs'>调整说明</button>`;
    }
    return `
        <button onclick='window.openFinanceDirectById(${safeOrderId}, "adj")' class="btn-soft-amber px-3 py-1.5 text-xs shadow-sm">去订单变更补录应收</button>
        <button onclick='window.openOverpaymentModalById(${safeOrderId}, "fx_diff", "${context}")' class="btn-soft-primary px-3 py-1.5 text-xs'>确认汇率差</button>
        <button onclick='window.openOverpaymentModalById(${safeOrderId}, "on_hold", "${context}")' class="btn-secondary px-3 py-1.5 text-xs'>填写说明并暂挂</button>
    `;
}

window.renderOverpaymentAlert = function(order, config) {
    const root = document.getElementById(config.rootId);
    const summaryEl = document.getElementById(config.summaryId);
    const metaEl = document.getElementById(config.metaId);
    const actionsEl = document.getElementById(config.actionsId);
    if (!root || !summaryEl || !metaEl || !actionsEl) return;
    const overpaidAmount = window.getOverpaidAmount(order);
    if (overpaidAmount <= 0.01) {
        root.classList.add('hidden');
        summaryEl.textContent = '';
        metaEl.textContent = '';
        actionsEl.innerHTML = '';
        return;
    }
    root.classList.remove('hidden');
    const totalAmount = Number(order.total_amount || 0);
    const paidAmount = Number(order.paid_amount || 0);
    summaryEl.textContent = `当前应收 ${window.formatCurrency(totalAmount)}，已收 ${window.formatCurrency(paidAmount)}，超收 ${window.formatCurrency(overpaidAmount)}`;
    metaEl.textContent = window.formatOverpaymentMeta(order);
    actionsEl.innerHTML = window.buildOverpaymentActionsHtml(order, config.context || 'detail');
}

window.refreshVisibleOrderContexts = function() {
    if (window.currentViewOrder) {
        const latest = (window.allOrders || []).find((item) => String(item.id) === String(window.currentViewOrder.id))
            || (window.pendingOrders || []).find((item) => String(item.id) === String(window.currentViewOrder.id));
        if (latest && !document.getElementById('order-detail-modal').classList.contains('hidden')) {
            window.currentViewOrder = latest;
            window.showOrderDetail(latest);
        }
    }
    if (window.currentModalOrderId) {
        const latest = (window.allOrders || []).find((item) => String(item.id) === String(window.currentModalOrderId))
            || (window.pendingOrders || []).find((item) => String(item.id) === String(window.currentModalOrderId));
        if (latest && !document.getElementById('finance-modal').classList.contains('hidden')) {
            window.currentFinanceOrder = latest;
            window.refreshFinanceModalStats();
        }
    }
}
window.paymentHistoryState = window.paymentHistoryState || {
    orderId: '',
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasMore: false
};

window.changePaymentHistoryPage = async function(targetPage) {
    const state = window.paymentHistoryState || {};
    const orderId = window.currentModalOrderId || state.orderId;
    if (!orderId) return;
    const normalizedTargetPage = Math.max(1, Math.min(Number(targetPage || 1), Number(state.totalPages || 1)));
    await window.loadPaymentHistory(orderId, { page: normalizedTargetPage });
}

window.ensureDetailRegionOptions = function() {
    const detailProv = document.getElementById('edit-dt-reg-prov');
    const detailCity = document.getElementById('edit-dt-reg-city-sel');
    const detailDist = document.getElementById('edit-dt-reg-dist');
    const sourceProv = document.getElementById('reg-prov');
    const sourceCity = document.getElementById('reg-city-sel');
    const sourceDist = document.getElementById('reg-dist');
    if (!detailProv || !detailCity || !detailDist || !sourceProv || !sourceCity || !sourceDist) return;
    if (detailProv.options.length <= 1) detailProv.innerHTML = sourceProv.innerHTML;
    if (detailCity.options.length <= 1) detailCity.innerHTML = sourceCity.innerHTML;
    if (detailDist.options.length <= 1) detailDist.innerHTML = sourceDist.innerHTML;
}

window.onDetailProvinceChange = function() {
    const prov = document.getElementById('edit-dt-reg-prov').value;
    const intlInput = document.getElementById('edit-dt-reg-intl');
    const citySel = document.getElementById('edit-dt-reg-city-sel');
    const cityInp = document.getElementById('edit-dt-reg-city-inp');
    const distSel = document.getElementById('edit-dt-reg-dist');

    intlInput.classList.add('hidden');
    citySel.classList.add('hidden');
    cityInp.classList.add('hidden');
    distSel.classList.add('hidden');

    intlInput.value = '';
    citySel.value = '';
    cityInp.value = '';
    distSel.value = '';

    if (prov === '国际') {
        intlInput.classList.remove('hidden');
    } else if (prov === '福建') {
        citySel.classList.remove('hidden');
        window.onDetailCityChange();
    } else if (prov !== '') {
        cityInp.classList.remove('hidden');
    }
}

window.onDetailCityChange = function() {
    const prov = document.getElementById('edit-dt-reg-prov').value;
    const city = document.getElementById('edit-dt-reg-city-sel').value;
    const distSel = document.getElementById('edit-dt-reg-dist');
    if (prov === '福建' && city === '福州') {
        distSel.classList.remove('hidden');
        distSel.value = '';
    } else {
        distSel.classList.add('hidden');
        distSel.value = '';
    }
}

window.populateDetailRegionFields = function(region) {
    window.ensureDetailRegionOptions();
    const provSelect = document.getElementById('edit-dt-reg-prov');
    const intlInput = document.getElementById('edit-dt-reg-intl');
    const citySel = document.getElementById('edit-dt-reg-city-sel');
    const cityInp = document.getElementById('edit-dt-reg-city-inp');
    const distSel = document.getElementById('edit-dt-reg-dist');
    const rawRegion = String(region || '').trim();

    provSelect.value = '';
    intlInput.value = '';
    citySel.value = '';
    cityInp.value = '';
    distSel.value = '';
    window.onDetailProvinceChange();

    if (!rawRegion) return;

    if (rawRegion.startsWith('国际 - ')) {
        provSelect.value = '国际';
        window.onDetailProvinceChange();
        intlInput.value = rawRegion.replace(/^国际 - /, '').trim();
        return;
    }

    const parts = rawRegion.split(' - ').map((item) => item.trim()).filter(Boolean);
    if (parts.length === 0) return;

    const provincePart = parts[0].replace(/省$|市$|自治区$|特别行政区$/g, '');
    provSelect.value = provincePart;
    window.onDetailProvinceChange();

    if (provincePart === '福建') {
        const cityPart = (parts[1] || '').replace(/市$/g, '').trim();
        if (cityPart) {
            citySel.value = cityPart;
            window.onDetailCityChange();
        }
        if (cityPart === '福州' && parts[2]) {
            distSel.value = parts[2];
        }
        return;
    }

    if (parts[1]) {
        cityInp.value = parts[1];
    }
}

window.getDetailRegionValue = function() {
    const prov = document.getElementById('edit-dt-reg-prov').value;
    if (!prov) return '';
    if (prov === '国际') {
        const intl = document.getElementById('edit-dt-reg-intl').value.trim();
        return intl ? `国际 - ${intl}` : '';
    }
    if (prov === '福建') {
        const city = document.getElementById('edit-dt-reg-city-sel').value;
        if (!city) return '';
        let finalRegion = `${prov}省 - ${city}市`;
        if (city === '福州') {
            const dist = document.getElementById('edit-dt-reg-dist').value;
            if (!dist) return '';
            finalRegion += ` - ${dist}`;
        }
        return finalRegion;
    }
    const city = document.getElementById('edit-dt-reg-city-inp').value.trim();
    return city ? `${prov} - ${city}` : '';
}

window.toggleDetailCreditCode = function() {
    const input = document.getElementById('edit-dt-code');
    const checkbox = document.getElementById('edit-dt-no-code');
    if (!input || !checkbox) return;
    if (checkbox.checked) {
        input.placeholder = "无代码请输入护照号等";
        input.classList.add('bg-gray-100');
        input.classList.remove('bg-white');
    } else {
        input.placeholder = "防止重复，请准确填写";
        input.classList.remove('bg-gray-100');
        input.classList.add('bg-white');
    }
}

window.getSelectedSalesFilter = function() {
    const select = document.getElementById('order-sales-filter');
    if (!select || !window.isAdminUser?.()) return '';
    return select.value;
}

window.getSelectedOrderExportIds = function() {
    if (!(window.selectedOrderExportIds instanceof Set)) {
        window.selectedOrderExportIds = new Set(Array.isArray(window.selectedOrderExportIds) ? window.selectedOrderExportIds : []);
    }
    return window.selectedOrderExportIds;
}

window.canExportAllVisibleOrders = function() {
    return window.isSuperAdmin?.();
}

window.canExportOrder = function(order) {
    return window.canExportAllVisibleOrders() || window.isOwnOrder(order);
}

window.syncOrderExportSelectionSummary = function() {
    const summaryEl = document.getElementById('order-export-selection-summary');
    const buttonTextEl = document.getElementById('order-export-button-text');
    if (summaryEl) {
        summaryEl.innerText = window.canExportAllVisibleOrders()
            ? '将按当前筛选条件导出全部订单'
            : '将按当前筛选条件导出本人名下订单';
    }
    if (buttonTextEl) {
        buttonTextEl.innerText = '按筛选导出';
    }
}

window.toggleOrderExportSelection = function(orderId, checked) {
    const selectedIds = window.getSelectedOrderExportIds();
    const normalizedOrderId = String(orderId || '');
    if (!normalizedOrderId) return;
    if (checked) selectedIds.add(normalizedOrderId);
    else selectedIds.delete(normalizedOrderId);
    window.syncOrderExportSelectionSummary();
}

window.toggleAllOrderExportSelections = function(checked) {
    const selectedIds = window.getSelectedOrderExportIds();
    (window.allOrders || []).forEach((order) => {
        if (!window.canExportOrder(order)) return;
        const normalizedOrderId = String(order.id || '');
        if (!normalizedOrderId) return;
        if (checked) selectedIds.add(normalizedOrderId);
        else selectedIds.delete(normalizedOrderId);
    });
    window.renderOrderList();
}

window.applyExpensePayeeSuggestion = function(value) {
    const input = document.getElementById('exp-payee');
    if (!input || !value) return;
    input.value = value;
}

window.populateExpensePayeeSuggestions = function(order, expenseHistory = []) {
    const wrap = document.getElementById('exp-payee-suggestion-wrap');
    const select = document.getElementById('exp-payee-suggestion');
    const input = document.getElementById('exp-payee');
    if (!wrap || !select || !input) return;
    const options = [];
    const appendOption = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized || options.includes(normalized)) return;
        options.push(normalized);
    };
    if (Number(order?.is_agent || 0) === 1) appendOption(order?.agent_name);
    (Array.isArray(expenseHistory) ? expenseHistory : []).forEach((expense) => appendOption(expense?.payee_name));
    select.innerHTML = '<option value="">快捷选择收款人 / 供应商</option>'
        + options.map((value) => `<option value="${window.escapeHtml(value)}">${window.escapeHtml(value)}</option>`).join('');
    wrap.classList.add('hidden');
    if (Number(order?.is_agent || 0) === 1 && String(order?.agent_name || '').trim()) {
        const agentName = String(order.agent_name).trim();
        select.value = agentName;
        if ((document.getElementById('exp-type')?.value || '') === '返佣支出') {
            input.value = agentName;
        }
    } else {
        select.value = '';
    }
}

window.loadOrderSalesFilterOptions = async function() {
    const select = document.getElementById('order-sales-filter');
    if (!select) return;

    if (!window.isAdminUser?.()) {
        select.classList.add('hidden');
        window.orderSalesFilterProjectId = '';
        return;
    }

    const pid = document.getElementById('global-project-select').value;
    if (!pid) return;
    if (window.orderSalesFilterProjectId === String(pid) && select.options.length > 1) {
        select.classList.remove('hidden');
        return;
    }

    try {
        const previousValue = select.value;
        const staff = await window.readApiJson(
            await window.apiFetch(`/api/staff?projectId=${pid}`),
            '加载业务员筛选失败',
            []
        );
        select.innerHTML = '<option value="">全部业务员</option>';
        staff.forEach((member) => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.name;
            select.appendChild(option);
        });
        const defaultSalesName = !window.isSuperAdmin?.()
            ? String(window.currentUser?.name || '').trim()
            : '';
        if (staff.some((member) => member.name === previousValue)) {
            select.value = previousValue;
        } else if (defaultSalesName && staff.some((member) => member.name === defaultSalesName)) {
            select.value = defaultSalesName;
        } else {
            select.value = '';
        }
        select.classList.remove('hidden');
        window.orderSalesFilterProjectId = String(pid);
    } catch (e) {
        window.showToast(e.message || '加载业务员筛选失败', 'error');
    }
}

window.renderOrderDashboardStats = function(stats) {
    const panel = document.getElementById('order-dashboard-panel');
    if (!panel) return;

    const fmtMoney = window.formatCurrency;
    const fmtCount = window.formatCompactCount;
    const fmtPercent = window.formatCompactPercent;
    const clampPercent = (value) => Math.max(0, Math.min(Number(value || 0), 100));
    const receivableTotal = Number(stats.receivable_total || 0);
    const receivedTotal = Number(stats.received_total || 0);
    const unpaidTotal = Number(stats.unpaid_total || 0);
    const depositBooths = Number(stats.deposit_booth_count || 0);
    const fullPaidBooths = Number(stats.full_paid_booth_count || 0);
    const completedBooths = depositBooths + fullPaidBooths;
    const targetTotal = Number(stats.target_total || 0);
    const advancedRate = targetTotal > 0 ? (completedBooths / targetTotal) * 100 : 0;
    const receivableOtherFee = Number(stats.receivable_other_fee || 0);

    const renderKpiCard = ({ accent, caption, mainValue, mainTone, percentText, percentTone, percentBg, barFrom, barTo, rate, chips }) => `
        <div class="order-kpi-card" style="--kpi-accent:${accent};">
            <div class="order-kpi-head">
                <div>
                    <div class="order-kpi-caption">${caption}</div>
                    <div class="order-kpi-main" style="color:${mainTone};">${mainValue}</div>
                </div>
                <div class="order-kpi-percent" style="color:${percentTone}; background:${percentBg};">${percentText}</div>
            </div>
            <div class="order-kpi-bar-track">
                <div class="order-kpi-bar-fill" style="width:${clampPercent(rate)}%; background:linear-gradient(to right, ${barFrom}, ${barTo});"></div>
            </div>
            <div class="order-kpi-chip-grid" style="--chip-cols:${chips.length};">
                ${chips.map((chip) => `
                    <div class="order-kpi-chip">
                        <div class="order-kpi-chip-label">${chip.label}</div>
                        <div class="order-kpi-chip-value" style="color:${chip.tone};">${chip.value}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    const boothChips = [
        { label: '目标展位数', value: fmtCount(targetTotal), tone: '#1e3a8a' },
        { label: '已付定金展位数', value: fmtCount(depositBooths), tone: '#b45309' },
        { label: '全款展位数', value: fmtCount(fullPaidBooths), tone: '#047857' }
    ];
    const moneyChips = [
        { label: '应收展位费', value: fmtMoney(stats.receivable_booth_fee), tone: '#be123c' },
        { label: '已收费用总计', value: fmtMoney(receivedTotal), tone: '#047857' },
        { label: '剩余未收费用', value: fmtMoney(unpaidTotal), tone: '#b45309' }
    ];
    if (receivableOtherFee > 0) {
        moneyChips.push({ label: '应收其他费用', value: fmtMoney(receivableOtherFee), tone: '#475569' });
    }

    panel.innerHTML = `
        ${renderKpiCard({
            accent: '#3b82f6',
            caption: '目标展位推进',
            mainValue: `${fmtCount(completedBooths)}<span class="order-kpi-main-suffix">个</span>`,
            mainTone: '#0f172a',
            percentText: fmtPercent(advancedRate),
            percentTone: '#1d4ed8',
            percentBg: '#dbeafe',
            barFrom: '#3b82f6',
            barTo: '#6366f1',
            rate: advancedRate,
            chips: boothChips
        })}
        ${renderKpiCard({
            accent: '#10b981',
            caption: '应收费用与已收情况',
            mainValue: fmtMoney(receivableTotal),
            mainTone: '#0f172a',
            percentText: fmtPercent(stats.collection_rate),
            percentTone: '#047857',
            percentBg: '#d1fae5',
            barFrom: '#10b981',
            barTo: '#22c55e',
            rate: stats.collection_rate,
            chips: moneyChips
        })}
    `;
}

var ORDER_LIST_DEFAULT_PAGE_SIZE = 30;
var ORDER_LIST_BOOTH_TYPE_OPTIONS = ['标摊', '豪标', '光地'];

window.syncOrderListRegionFilterVisibility = function() {
    const regionEnabled = window.isOrderFieldEnabled?.('region') !== false;
    document.getElementById('order-list-region-header')?.classList.toggle('hidden', !regionEnabled);
    document.getElementById('order-region-filter-wrap')?.classList.toggle('hidden', !regionEnabled);
    return regionEnabled;
}

window.buildCompactOrderActionButtonHtml = function({ label, shortLabel, tone, disabled = false, onClick = '' }) {
    const normalizedLabel = String(label || '').trim();
    const normalizedShortLabel = String(shortLabel || '').trim() || normalizedLabel.slice(0, 1);
    const disabledAttr = disabled ? 'disabled' : '';
    const onclickAttr = !disabled && onClick ? `onclick='${onClick}'` : '';
    return `
        <div class="compact-order-action">
            <button type="button" ${onclickAttr} ${disabledAttr} class="compact-order-action-btn" data-tone="${window.escapeHtml(tone || 'secondary')}" aria-label="${window.escapeHtml(normalizedLabel)}" title="${window.escapeHtml(normalizedLabel)}">
                <span>${window.escapeHtml(normalizedShortLabel)}</span>
            </button>
            <span class="compact-order-action-tip">${window.escapeHtml(normalizedLabel)}</span>
        </div>
    `;
}

window.buildCompactOrderActionButtonsHtml = function(order) {
    const canManage = window.canManageOrder(order);
    const canCancel = !!order && (!!window.isSuperAdmin?.() || window.isOwnOrder(order));
    const safeId = JSON.stringify(String(order?.id || ''));
    const safeBoothId = JSON.stringify(String(order?.booth_id || ''));
    const actions = [
        {
            label: '收款',
            shortLabel: '财',
            tone: 'primary',
            disabled: !canManage,
            onClick: `window.openFinanceDirectById(${safeId}, \"pay\")`
        },
        {
            label: '变更',
            shortLabel: '变',
            tone: 'amber',
            disabled: !canManage,
            onClick: `window.openFinanceDirectById(${safeId}, \"adj\")`
        },
        {
            label: '换展位',
            shortLabel: '换',
            tone: 'secondary',
            disabled: !canManage,
            onClick: `window.openFinanceDirectById(${safeId}, \"swap\")`
        },
        {
            label: '代付',
            shortLabel: '付',
            tone: 'dark',
            disabled: !canManage,
            onClick: `window.openFinanceDirectById(${safeId}, \"exp\")`
        },
        {
            label: '退订',
            shortLabel: '退',
            tone: 'danger',
            disabled: !canManage || !canCancel,
            onClick: `window.cancelOrder(${safeId}, ${safeBoothId})`
        }
    ];
    return `<div class="compact-order-actions">${actions.map((item) => window.buildCompactOrderActionButtonHtml(item)).join('')}</div>`;
}

window.loadOrderDashboardStats = async function() {
    const pid = document.getElementById('global-project-select').value;
    if (!pid) return;
    const salesName = window.getSelectedSalesFilter();
    const query = salesName ? `&salesName=${encodeURIComponent(salesName)}` : '';
    const stats = await window.readApiJson(
        await window.apiFetch(`/api/order-dashboard-stats?projectId=${pid}${query}`),
        '加载订单看板失败',
        {}
    );
    window.renderOrderDashboardStats(stats);
}

window.getOrderListState = function() {
    if (!window.orderListState || typeof window.orderListState !== 'object') {
        window.orderListState = {
            page: 1,
            pageSize: ORDER_LIST_DEFAULT_PAGE_SIZE,
            total: 0,
            totalPages: 1,
            hasMore: false
        };
    }
    return window.orderListState;
}

window.syncOrderBoothTypeFilterOptions = function() {
    const select = document.getElementById('order-booth-type-filter');
    if (!select) return;

    const currentValue = String(select.value || '').trim();
    const optionValues = new Set(ORDER_LIST_BOOTH_TYPE_OPTIONS);
    (window.allOrders || []).forEach((order) => {
        String(order?.booth_type || '')
            .split(/[，,]+/g)
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .forEach((item) => optionValues.add(item));
    });

    const orderedValues = [
        ...ORDER_LIST_BOOTH_TYPE_OPTIONS,
        ...[...optionValues].filter((value) => !ORDER_LIST_BOOTH_TYPE_OPTIONS.includes(value)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    ];
    select.innerHTML = ['<option value="">所有展位类型</option>']
        .concat(orderedValues.map((value) => `<option value="${window.escapeHtml(value)}">${window.escapeHtml(value)}</option>`))
        .join('');
    select.value = currentValue;
    if (select.value !== currentValue) {
        select.value = '';
    }
}

window.formatReleaseCountdown = function(seconds) {
    if (seconds === null || seconds === undefined || seconds === '') return '';
    const totalSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}天 ${String(hours).padStart(2, '0')}小时 ${String(minutes).padStart(2, '0')}分`;
}

window.getOrderReleaseRemainingSeconds = function(order) {
    if (!order?.reserved_release_due_at) return null;
    const parsed = Date.parse(String(order.reserved_release_due_at).replace(' ', 'T') + '+08:00');
    if (!Number.isFinite(parsed)) return Number(order.reserved_release_remaining_seconds ?? null);
    return Math.max(0, Math.floor((parsed - Date.now()) / 1000));
}

window.renderOrderReleaseCountdown = function(order) {
    if (Number(order?.paid_amount || 0) > 0) {
        return '';
    }
    if (!order?.reserved_release_due_at || String(order?.reserved_release_status || '') === 'disabled') {
        return '';
    }
    const seconds = window.getOrderReleaseRemainingSeconds(order);
    const tone = seconds <= 3600
        ? 'bg-rose-50 text-rose-700 border border-rose-200'
        : seconds <= 86400
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : 'bg-slate-50 text-slate-700 border border-slate-200';
    return `<div class="release-countdown rounded-md px-2 py-0.5 text-[10px] font-bold text-center tabular-data ${tone} mt-1" data-order-id="${window.escapeHtml(order.id || '')}">${window.formatReleaseCountdown(seconds)}</div>`;
}

window.startOrderReleaseCountdownTimer = function() {
    if (window.orderReleaseCountdownTimer) clearInterval(window.orderReleaseCountdownTimer);
    window.orderReleaseCountdownTimer = setInterval(() => {
        if (!document.getElementById('sec-order-list')?.classList.contains('active')) return;
        let expired = false;
        document.querySelectorAll('.release-countdown[data-order-id]').forEach((el) => {
            const order = (window.allOrders || []).find((item) => String(item.id) === String(el.dataset.orderId));
            if (!order) return;
            const seconds = window.getOrderReleaseRemainingSeconds(order);
            el.textContent = window.formatReleaseCountdown(seconds);
            if (seconds <= 0) expired = true;
        });
        if (expired && !window.orderReleaseExpiredReloading) {
            window.orderReleaseExpiredReloading = true;
            setTimeout(async () => {
                try {
                    window.markOrderDashboardDirty?.();
                    await window.loadOrderList?.();
                    await window.loadPendingOrderList?.();
                } finally {
                    window.orderReleaseExpiredReloading = false;
                }
            }, 800);
        }
    }, 60 * 1000);
}

window.readOrderListFiltersFromDom = function(overrides = {}) {
    const state = window.getOrderListState();
    const pageSizeSelect = document.getElementById('order-page-size');
    const regionEnabled = window.syncOrderListRegionFilterVisibility();
    const pageSizeValue = Number(overrides.pageSize || pageSizeSelect?.value || state.pageSize || ORDER_LIST_DEFAULT_PAGE_SIZE);
    const pageSize = Number.isFinite(pageSizeValue) && pageSizeValue > 0 ? pageSizeValue : ORDER_LIST_DEFAULT_PAGE_SIZE;
    return {
        page: Number(overrides.page || state.page || 1),
        pageSize,
        search: String(document.getElementById('order-search')?.value || '').trim(),
        businessSearch: String(document.getElementById('order-business-search')?.value || '').trim(),
        regionSearch: regionEnabled ? String(document.getElementById('order-region-search')?.value || '').trim() : '',
        boothType: String(document.getElementById('order-booth-type-filter')?.value || '').trim(),
        paymentStatus: String(document.getElementById('order-status-filter')?.value || '').trim(),
        salesName: String(typeof overrides.salesName === 'string' ? overrides.salesName : window.getSelectedSalesFilter()).trim()
    };
}

window.buildOrderListQueryParams = function(projectId, filters = {}) {
    const params = new URLSearchParams();
    params.set('projectId', String(projectId || ''));
    params.set('page', String(filters.page || 1));
    params.set('pageSize', String(filters.pageSize || ORDER_LIST_DEFAULT_PAGE_SIZE));
    if (filters.search) params.set('search', filters.search);
    if (filters.businessSearch) params.set('businessSearch', filters.businessSearch);
    if (filters.regionSearch) params.set('regionSearch', filters.regionSearch);
    if (filters.boothType) params.set('boothType', filters.boothType);
    if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
    if (filters.salesName) params.set('salesName', filters.salesName);
    return params;
}

window.fetchOrderListPage = async function({ page = 1, pageSize = null, salesName = null } = {}) {
    const pid = document.getElementById('global-project-select')?.value;
    if (!pid) {
        return {
            items: [],
            total: 0,
            page: 1,
            pageSize: pageSize || window.getOrderListState().pageSize || ORDER_LIST_DEFAULT_PAGE_SIZE,
            totalPages: 1,
            hasMore: false
        };
    }
    const filters = window.readOrderListFiltersFromDom({
        page,
        pageSize: pageSize || undefined,
        salesName: typeof salesName === 'string' ? salesName : undefined
    });
    return window.readApiJson(
        await window.apiFetch(`/api/orders?${window.buildOrderListQueryParams(pid, filters).toString()}`),
        '加载订单列表失败',
        {
            items: [],
            total: 0,
            page: filters.page,
            pageSize: filters.pageSize,
            totalPages: 1,
            hasMore: false
        }
    );
}

window.fetchAllFilteredOrders = async function({ pageSize = 200 } = {}) {
    const allItems = [];
    let nextPage = 1;
    let total = 0;
    while (true) {
        const pageData = await window.fetchOrderListPage({ page: nextPage, pageSize });
        total = Number(pageData.total || total || 0);
        const items = Array.isArray(pageData.items) ? pageData.items : [];
        allItems.push(...items);
        if (!pageData.hasMore || nextPage >= Number(pageData.totalPages || nextPage)) break;
        nextPage = Number(pageData.page || nextPage) + 1;
    }
    return { items: allItems, total };
}

window.unwrapListPayload = function(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
}

window.fetchAllOrderPayments = async function(orderId, { pageSize = 100 } = {}) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) return [];
    const allPayments = [];
    let nextPage = 1;

    while (true) {
        const response = await window.apiFetch(`/api/payments?orderId=${encodeURIComponent(normalizedOrderId)}&page=${encodeURIComponent(nextPage)}&pageSize=${encodeURIComponent(pageSize)}`);
        if (!response?.ok) return allPayments;

        const payload = await response.json();
        const items = window.unwrapListPayload(payload);
        allPayments.push(...items);

        if (Array.isArray(payload)) break;

        const totalPages = Math.max(1, Number(payload?.totalPages || 1));
        const currentPage = Math.max(1, Number(payload?.page || nextPage));
        const hasMore = payload?.hasMore === true || currentPage < totalPages;
        if (!hasMore || currentPage >= totalPages) break;
        nextPage = currentPage + 1;
    }

    return allPayments;
}

window.reloadOrderListFromFilters = function() {
    const state = window.getOrderListState();
    state.page = 1;
    return window.loadOrderList();
}

window.scheduleOrderListReload = function() {
    if (window.orderListFilterTimer) {
        clearTimeout(window.orderListFilterTimer);
    }
    window.orderListFilterTimer = setTimeout(() => {
        window.orderListFilterTimer = null;
        window.reloadOrderListFromFilters();
    }, 250);
}

window.markOrderDashboardDirty = function() {
    window.lastOrderDashboardKey = '';
}

window.changeOrderListPageSize = function() {
    const state = window.getOrderListState();
    const pageSizeValue = Number(document.getElementById('order-page-size')?.value || state.pageSize || ORDER_LIST_DEFAULT_PAGE_SIZE);
    state.pageSize = Number.isFinite(pageSizeValue) && pageSizeValue > 0 ? pageSizeValue : ORDER_LIST_DEFAULT_PAGE_SIZE;
    state.page = 1;
    return window.loadOrderList();
}

window.goToOrderListPage = function(targetPage) {
    const state = window.getOrderListState();
    const normalizedTargetPage = Math.max(1, Math.min(Number(targetPage || 1), Number(state.totalPages || 1)));
    if (normalizedTargetPage === Number(state.page || 1)) return;
    state.page = normalizedTargetPage;
    return window.loadOrderList();
}

window.renderOrderPagination = function() {
    const root = document.getElementById('order-pagination');
    const statsEl = document.getElementById('order-pagination-stats');
    if (!root || !statsEl) return;
    const state = window.getOrderListState();
    const currentPage = Number(state.page || 1);
    const totalPages = Math.max(1, Number(state.totalPages || 1));
    const total = Number(state.total || 0);
    const currentCount = Array.isArray(window.allOrders) ? window.allOrders.length : 0;
    const startIndex = total === 0 || currentCount === 0 ? 0 : ((currentPage - 1) * Number(state.pageSize || ORDER_LIST_DEFAULT_PAGE_SIZE)) + 1;
    const endIndex = total === 0 || currentCount === 0 ? 0 : startIndex + currentCount - 1;
    statsEl.innerText = total === 0
        ? '当前筛选结果为空'
        : `第 ${currentPage} / ${totalPages} 页，当前显示 ${startIndex}-${endIndex} / 共 ${total} 笔`;

    const disableClass = 'opacity-40 cursor-not-allowed';
    const buttonClass = 'px-3 py-1.5 rounded-lg border text-sm font-bold transition';
    const renderButton = (label, targetPage, disabled = false) => `
        <button
            type="button"
            onclick="${disabled ? 'void(0)' : `window.goToOrderListPage(${targetPage})`}"
            class="${buttonClass} ${disabled ? `border-slate-200 bg-slate-100 text-slate-400 ${disableClass}` : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-600'}"
            ${disabled ? 'disabled' : ''}
        >${label}</button>
    `;

    root.innerHTML = `
        ${renderButton('首页', 1, currentPage <= 1)}
        ${renderButton('上一页', currentPage - 1, currentPage <= 1)}
        <span class="px-3 py-1.5 rounded-lg bg-slate-100 text-sm font-bold text-slate-600">第 ${currentPage} / ${totalPages} 页</span>
        ${renderButton('下一页', currentPage + 1, currentPage >= totalPages)}
        ${renderButton('末页', totalPages, currentPage >= totalPages)}
    `;
}

window.loadOrderList = async function() {
    const pid = document.getElementById('global-project-select').value;
    if (!pid) return;
    if (window.orderExportSelectionProjectId !== String(pid)) {
        window.selectedOrderExportIds = new Set();
        window.orderExportSelectionProjectId = String(pid);
    }
    const state = window.getOrderListState();
    const requestSeq = Number(window.orderListRequestSeq || 0) + 1;
    window.orderListRequestSeq = requestSeq;

    try {
        await window.loadOrderSalesFilterOptions();
        const pageData = await window.fetchOrderListPage({
            page: state.page,
            pageSize: state.pageSize
        });
        if (window.orderListRequestSeq !== requestSeq) return;

        window.allOrders = Array.isArray(pageData.items) ? pageData.items : [];
        state.page = Number(pageData.page || state.page || 1);
        state.pageSize = Number(pageData.pageSize || state.pageSize || ORDER_LIST_DEFAULT_PAGE_SIZE);
        state.total = Number(pageData.total || 0);
        state.totalPages = Math.max(1, Number(pageData.totalPages || 1));
        state.hasMore = !!pageData.hasMore;
        window.syncOrderBoothTypeFilterOptions?.();

        const pageSizeSelect = document.getElementById('order-page-size');
        if (pageSizeSelect) {
            pageSizeSelect.value = String(state.pageSize);
        }

        const dashboardKey = `${pid}::${window.getSelectedSalesFilter()}`;
        if (window.lastOrderDashboardKey !== dashboardKey) {
            window.lastOrderDashboardKey = dashboardKey;
            try {
                await window.loadOrderDashboardStats();
            } catch (dashboardError) {
                window.markOrderDashboardDirty();
                if (window.orderListRequestSeq !== requestSeq) return;
                window.showToast(dashboardError.message || '加载订单看板失败', 'error');
            }
            if (window.orderListRequestSeq !== requestSeq) return;
        }

        window.renderOrderList();
        window.renderOrderPagination();
        window.startOrderReleaseCountdownTimer();
        if (document.getElementById('sec-order-list')?.classList.contains('active')) {
            window.queueMainContentTopReset?.();
        }
    } catch (error) {
        if (window.orderListRequestSeq !== requestSeq) return;
        window.allOrders = [];
        state.total = 0;
        state.totalPages = 1;
        state.hasMore = false;
        window.syncOrderBoothTypeFilterOptions?.();
        window.renderOrderList();
        window.renderOrderPagination();
        window.syncOrderExportSelectionSummary();
        if (document.getElementById('sec-order-list')?.classList.contains('active')) {
            window.queueMainContentTopReset?.();
        }
        window.showToast(error.message || '加载订单列表失败', 'error');
    }
}

window.renderOrderList = function() {
    const state = window.getOrderListState();
    const batchBtn = document.getElementById('btn-batch-download-contracts');
    if (batchBtn) {
        batchBtn.style.display = window.isSuperAdmin?.() ? 'inline-flex' : 'none';
    }
    document.querySelectorAll?.('[data-superadmin-order-import-action]').forEach((element) => {
        element.classList.toggle('hidden', !window.isSuperAdmin?.());
    });

    document.getElementById('order-total-stats').innerText = `共 ${Number(state.total || 0)} 笔`;
    const tbody = document.getElementById('order-list-tbody');
    const regionEnabled = window.syncOrderListRegionFilterVisibility();

    window.selectedOrderId = null;

    tbody.innerHTML = window.renderHtmlCollection(window.allOrders || [], (o) => {
        const canManage = window.canManageOrder(o);
        const hasOverpayment = window.hasOverpaymentIssue(o);
        const overpaidAmount = window.getOverpaidAmount(o);
        const releaseCountdownHtml = window.renderOrderReleaseCountdown(o);
        const actionHtml = window.buildCompactOrderActionButtonsHtml(o);
        let payBadge = `
            <div class="flex flex-col items-center gap-1">
                <span class="badge-danger">未付款</span>
                ${releaseCountdownHtml}
            </div>
        `;
        if(o.paid_amount > 0 && o.paid_amount < o.total_amount) {
            let ratio = ((o.paid_amount / o.total_amount) * 100).toFixed(1);
            let remain = o.total_amount - o.paid_amount;
            payBadge = `<div class="badge-warning flex flex-col items-center leading-tight rounded-xl"><span>已付定金 (${ratio}%)</span><span class="mt-1 tabular-data text-amber-700">剩${window.formatCurrency(remain)}</span></div>`;
        }
        if(o.paid_amount >= o.total_amount) payBadge = `<span class="badge-success">已付全款</span>`;
        if (hasOverpayment) {
            const statusTone = o.overpayment_status === 'resolved_as_fx_diff'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : o.overpayment_status === 'on_hold'
                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200';
            const overpaymentActions = window.canHandleOverpayment(o)
                ? `<button onclick='event.stopPropagation(); window.openOverpaymentModalById(${JSON.stringify(String(o.id))}, "fx_diff", "list")' class="mt-1 btn-secondary px-2.5 py-1 text-[11px] shadow-sm">${window.renderIcon('chevronRight', 'h-3.5 w-3.5', 2.1)}<span>去处理</span></button>`
                : '<span class="mt-1 badge-readonly">待业务员处理</span>';
            payBadge = `
                <div class="flex flex-col items-center gap-1">
                    ${payBadge}
                    <div class="rounded-xl px-2.5 py-1 text-[11px] font-bold leading-tight text-center ${statusTone}">
                        <div>${window.getOverpaymentStatusLabel(o)}</div>
                        <div class="mt-0.5 tabular-data">超 ${window.formatCurrency(overpaidAmount)}</div>
                    </div>
                    ${overpaymentActions}
                </div>
            `;
        }
        const safeCompany = window.escapeHtml(o.company_name || '');
        const safeHall = window.escapeHtml(o.hall || '');
        const safeBoothId = window.escapeHtml(o.booth_id || '');
        const boothDisplay = window.getOrderBoothDisplay(o);
        const safeBoothDisplay = window.escapeHtml(boothDisplay);
        const safeRegion = window.escapeHtml(o.region || '未填');
        const safeBoothType = window.escapeHtml(o.booth_type || '');
        const safeSalesName = window.escapeHtml(o.sales_name || '未填');
        const regionHiddenClass = regionEnabled ? '' : ' hidden';
        // 【核心优化】：合同列折叠为单行：状态 chip + 1~2 个图标按钮（hover 显示 tooltip）
        const eyeIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
        const uploadIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>';
        const refreshIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></svg>';
        let contractBtn = '';
        if (canManage && o.contract_url) {
            contractBtn = `
                <div class="order-contract-cell-compact">
                    <span class="badge-success" style="font-size:11px;padding:2px 8px;">已上传</span>
                    <button type="button" onclick='event.stopPropagation(); window.previewSingleContract(${JSON.stringify(String(o.contract_url))}, ${JSON.stringify(String(o.id))})' class="order-contract-icon-btn" title="预览合同">${eyeIcon}</button>
                    <button type="button" onclick='event.stopPropagation(); window.triggerSilentUpload(${JSON.stringify(String(o.id))})' class="order-contract-icon-btn" data-tone="amber" title="重新上传">${refreshIcon}</button>
                </div>
            `;
        } else if (canManage) {
            contractBtn = `
                <div class="order-contract-cell-compact">
                    <span class="badge-neutral" style="font-size:11px;padding:2px 8px;">未上传</span>
                    <button type="button" onclick='event.stopPropagation(); window.triggerSilentUpload(${JSON.stringify(String(o.id))})' class="order-contract-icon-btn" title="上传合同">${uploadIcon}</button>
                </div>
            `;
        } else {
            const isUploaded = Number(o.has_contract) === 1;
            contractBtn = `
                <div class="order-contract-cell-compact">
                    <span class="${isUploaded ? 'badge-success' : 'badge-neutral'}" style="font-size:11px;padding:2px 8px;" title="${isUploaded ? '预览受限' : '无权限查看'}">${isUploaded ? '已上传' : '未上传'}</span>
                </div>
            `;
        }

        return `
            <tr data-order-id="${window.escapeHtml(String(o.id))}">
                <td class="text-center align-middle">${payBadge}</td>
                <td class="font-bold text-gray-600 text-center">${safeHall || '—'}</td>
                <td class="font-bold text-blue-700">${safeBoothId || `<span class="text-sm text-slate-500 font-semibold">${safeBoothDisplay}</span>`}</td>
                <td class="order-region-cell text-xs text-gray-500 truncate${regionHiddenClass}" title="${safeRegion}">${safeRegion}</td>
                <td class="order-company-cell font-bold text-gray-800 cursor-pointer hover:text-blue-600 hover:underline" onclick='event.stopPropagation(); window.showOrderDetailById(${JSON.stringify(String(o.id))})' title="点击查看详情">${safeCompany}</td>
                <td class="font-bold text-slate-600">${safeSalesName}</td>
                <td class="tabular-data text-right">${o.area} ㎡</td>
                <td class="text-xs text-gray-500 text-center">${safeBoothType}</td>
                <td class="text-right font-bold text-gray-800 tabular-data">${window.formatCurrency(o.total_amount)}</td>
                <td class="text-right font-bold text-green-600 tabular-data">${window.formatCurrency(o.paid_amount)}</td>
                <td class="text-center align-middle order-contract-cell">${contractBtn}</td>
                <td class="order-compact-actions-cell text-center sticky right-0 bg-white sticky-action-shadow">${actionHtml}</td>
            </tr>
        `;
    }, '<tr><td colspan="12" class="p-6 text-center text-gray-400">暂无符合条件的订单</td></tr>');
    window.syncOrderExportSelectionSummary();
}

window.selectedOrderId = null;

window.selectOrderRow = function(orderId) {
    window.selectedOrderId = String(orderId || '').trim();
}

window.renderOrderActionToolbar = function() {
    const toolbar = document.getElementById('order-action-toolbar');
    if (!toolbar) return;
    toolbar.innerHTML = '';
    toolbar.classList.add('hidden');
}

window.showOrderDetailById = function(id) {
    try {
        const order = (window.allOrders || []).find(o => String(o.id) === String(id));
        if (order) window.showOrderDetail(order);
        else window.showToast('找不到对应的订单数据', 'error');
    } catch (e) { window.showToast("打开详情出错: " + e.message, 'error'); }
}

window.openFinanceDirectById = function(id, tab) {
    try {
        const order = (window.allOrders || []).find(o => String(o.id) === String(id))
            || (window.pendingOrders || []).find(o => String(o.id) === String(id));
        if (order) window.openFinanceDirect(order, tab);
        else window.showToast('找不到对应的订单数据', 'error');
    } catch (e) { window.showToast("打开面板出错: " + e.message, 'error'); }
}

window.getPendingOrderListState = function() {
    if (!window.pendingOrderListState || typeof window.pendingOrderListState !== 'object') {
        window.pendingOrderListState = {
            page: 1,
            pageSize: 50,
            total: 0,
            totalPages: 1,
            hasMore: false
        };
    }
    return window.pendingOrderListState;
}

window.parsePendingReleaseSnapshot = function(order) {
    try {
        const parsed = JSON.parse(order?.pending_release_snapshot_json || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

window.getPendingPaymentMethodLabel = function(method) {
    return ({
        full_refund: '全额退款',
        next_year: '转为明年项目',
        custom: '自定义处理方式'
    })[String(method || '')] || '未记录';
}

window.getPendingSelectedSalesFilter = function() {
    const select = document.getElementById('pending-order-sales-filter');
    if (!select || !window.isAdminUser?.()) return '';
    return select.value;
}

window.loadPendingOrderSalesFilterOptions = async function() {
    const select = document.getElementById('pending-order-sales-filter');
    if (!select) return;
    if (!window.isAdminUser?.()) {
        select.classList.add('hidden');
        window.pendingOrderSalesFilterProjectId = '';
        return;
    }
    const pid = document.getElementById('global-project-select').value;
    if (!pid) return;
    if (window.pendingOrderSalesFilterProjectId === String(pid) && select.options.length > 1) {
        select.classList.remove('hidden');
        return;
    }
    const previousValue = select.value;
    const staff = await window.readApiJson(
        await window.apiFetch(`/api/staff?projectId=${pid}`),
        '加载业务员筛选失败',
        []
    );
    select.innerHTML = '<option value="">全部业务员</option>';
    staff.forEach((member) => {
        const option = document.createElement('option');
        option.value = member.name;
        option.textContent = member.name;
        select.appendChild(option);
    });
    const defaultSalesName = !window.isSuperAdmin?.()
        ? String(window.currentUser?.name || '').trim()
        : '';
    if (staff.some((member) => member.name === previousValue)) {
        select.value = previousValue;
    } else if (defaultSalesName && staff.some((member) => member.name === defaultSalesName)) {
        select.value = defaultSalesName;
    } else {
        select.value = '';
    }
    select.classList.remove('hidden');
    window.pendingOrderSalesFilterProjectId = String(pid);
}

window.readPendingOrderListFiltersFromDom = function(overrides = {}) {
    const state = window.getPendingOrderListState();
    const pageSizeSelect = document.getElementById('pending-order-page-size');
    const pageSizeValue = Number(overrides.pageSize || pageSizeSelect?.value || state.pageSize || 50);
    const pageSize = Number.isFinite(pageSizeValue) && pageSizeValue > 0 ? pageSizeValue : 50;
    return {
        page: Number(overrides.page || state.page || 1),
        pageSize,
        search: String(document.getElementById('pending-order-search')?.value || '').trim(),
        businessSearch: String(document.getElementById('pending-order-business-search')?.value || '').trim(),
        salesName: String(typeof overrides.salesName === 'string' ? overrides.salesName : window.getPendingSelectedSalesFilter()).trim()
    };
}

window.buildPendingOrderListQueryParams = function(projectId, filters = {}) {
    const params = new URLSearchParams();
    params.set('projectId', String(projectId || ''));
    params.set('page', String(filters.page || 1));
    params.set('pageSize', String(filters.pageSize || 50));
    if (filters.search) params.set('search', filters.search);
    if (filters.businessSearch) params.set('businessSearch', filters.businessSearch);
    if (filters.salesName) params.set('salesName', filters.salesName);
    return params;
}

window.fetchPendingOrderListPage = async function({ page = 1, pageSize = null, salesName = null } = {}) {
    const pid = document.getElementById('global-project-select')?.value;
    if (!pid) {
        return { items: [], total: 0, page: 1, pageSize: pageSize || 50, totalPages: 1, hasMore: false };
    }
    const filters = window.readPendingOrderListFiltersFromDom({
        page,
        pageSize: pageSize || undefined,
        salesName: typeof salesName === 'string' ? salesName : undefined
    });
    return window.readApiJson(
        await window.apiFetch(`/api/pending-orders?${window.buildPendingOrderListQueryParams(pid, filters).toString()}`),
        '加载待确认订单失败',
        { items: [], total: 0, page: filters.page, pageSize: filters.pageSize, totalPages: 1, hasMore: false }
    );
}

window.reloadPendingOrderListFromFilters = function() {
    window.getPendingOrderListState().page = 1;
    return window.loadPendingOrderList();
}

window.schedulePendingOrderListReload = function() {
    if (window.pendingOrderListFilterTimer) clearTimeout(window.pendingOrderListFilterTimer);
    window.pendingOrderListFilterTimer = setTimeout(() => {
        window.pendingOrderListFilterTimer = null;
        window.reloadPendingOrderListFromFilters();
    }, 250);
}

window.changePendingOrderListPageSize = function() {
    const state = window.getPendingOrderListState();
    const pageSizeValue = Number(document.getElementById('pending-order-page-size')?.value || state.pageSize || 50);
    state.pageSize = Number.isFinite(pageSizeValue) && pageSizeValue > 0 ? pageSizeValue : 50;
    state.page = 1;
    return window.loadPendingOrderList();
}

window.goToPendingOrderListPage = function(targetPage) {
    const state = window.getPendingOrderListState();
    const normalizedTargetPage = Math.max(1, Math.min(Number(targetPage || 1), Number(state.totalPages || 1)));
    if (normalizedTargetPage === Number(state.page || 1)) return;
    state.page = normalizedTargetPage;
    return window.loadPendingOrderList();
}

window.renderPendingOrderPagination = function() {
    const root = document.getElementById('pending-order-pagination');
    const statsEl = document.getElementById('pending-order-pagination-stats');
    if (!root || !statsEl) return;
    const state = window.getPendingOrderListState();
    const currentPage = Number(state.page || 1);
    const totalPages = Math.max(1, Number(state.totalPages || 1));
    const total = Number(state.total || 0);
    const currentCount = Array.isArray(window.pendingOrders) ? window.pendingOrders.length : 0;
    const startIndex = total === 0 || currentCount === 0 ? 0 : ((currentPage - 1) * Number(state.pageSize || 50)) + 1;
    const endIndex = total === 0 || currentCount === 0 ? 0 : startIndex + currentCount - 1;
    statsEl.innerText = total === 0
        ? '当前筛选结果为空'
        : `第 ${currentPage} / ${totalPages} 页，当前显示 ${startIndex}-${endIndex} / 共 ${total} 笔`;
    const buttonClass = 'px-3 py-1.5 rounded-lg border text-sm font-bold transition';
    const renderButton = (label, targetPage, disabled = false) => `
        <button type="button" onclick="${disabled ? 'void(0)' : `window.goToPendingOrderListPage(${targetPage})`}" class="${buttonClass} ${disabled ? 'border-slate-200 bg-slate-100 text-slate-400 opacity-40 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-600'}" ${disabled ? 'disabled' : ''}>${label}</button>
    `;
    root.innerHTML = `
        ${renderButton('首页', 1, currentPage <= 1)}
        ${renderButton('上一页', currentPage - 1, currentPage <= 1)}
        <span class="px-3 py-1.5 rounded-lg bg-slate-100 text-sm font-bold text-slate-600">第 ${currentPage} / ${totalPages} 页</span>
        ${renderButton('下一页', currentPage + 1, currentPage >= totalPages)}
        ${renderButton('末页', totalPages, currentPage >= totalPages)}
    `;
}

window.loadPendingOrderList = async function() {
    const pid = document.getElementById('global-project-select').value;
    if (!pid) return;
    const state = window.getPendingOrderListState();
    const requestSeq = Number(window.pendingOrderListRequestSeq || 0) + 1;
    window.pendingOrderListRequestSeq = requestSeq;
    try {
        await window.loadPendingOrderSalesFilterOptions();
        const pageData = await window.fetchPendingOrderListPage({ page: state.page, pageSize: state.pageSize });
        if (window.pendingOrderListRequestSeq !== requestSeq) return;
        window.pendingOrders = Array.isArray(pageData.items) ? pageData.items : [];
        state.page = Number(pageData.page || state.page || 1);
        state.pageSize = Number(pageData.pageSize || state.pageSize || 50);
        state.total = Number(pageData.total || 0);
        state.totalPages = Math.max(1, Number(pageData.totalPages || 1));
        state.hasMore = !!pageData.hasMore;
        const pageSizeSelect = document.getElementById('pending-order-page-size');
        if (pageSizeSelect) pageSizeSelect.value = String(state.pageSize);
        window.renderPendingOrderList();
        window.renderPendingOrderPagination();
        if (document.getElementById('sec-pending-orders')?.classList.contains('active')) {
            window.queueMainContentTopReset?.();
        }
    } catch (error) {
        if (window.pendingOrderListRequestSeq !== requestSeq) return;
        window.pendingOrders = [];
        state.total = 0;
        state.totalPages = 1;
        state.hasMore = false;
        window.renderPendingOrderList();
        window.renderPendingOrderPagination();
        window.showToast(error.message || '加载待确认订单失败', 'error');
    }
}

window.renderPendingOrderList = function() {
    const state = window.getPendingOrderListState();
    const stats = document.getElementById('pending-order-total-stats');
    if (stats) stats.innerText = `当前筛选共 ${Number(state.total || 0)} 笔待确认订单`;
    const tbody = document.getElementById('pending-order-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = window.renderHtmlCollection(window.pendingOrders || [], (order) => {
        const snapshot = window.parsePendingReleaseSnapshot(order);
        const originalBooth = snapshot.booth_id
            ? `${snapshot.hall ? `${snapshot.hall} - ` : ''}${snapshot.booth_id}`
            : '无原展位';
        const paymentCount = Number(order.effective_payment_count || 0);
        const resolutionStatus = String(order.pending_payment_resolution_status || '');
        const handlingMethod = window.getPendingPaymentMethodLabel(order.pending_payment_handling_method);
        const statusHtml = paymentCount > 0
            ? (resolutionStatus === 'recorded'
                ? `<div class="flex flex-col items-center gap-1"><span class="badge-success">已记录处理方式</span><span class="text-[11px] text-slate-500">${window.escapeHtml(handlingMethod)}</span></div>`
                : '<span class="badge-danger">收款待处理</span>')
            : '<span class="badge-neutral">无收款，仅超管可删</span>';
        const sourceLabel = String(order.pending_source || '') === 'auto_release' ? '自动释放' : '人工退订';
        const canManage = window.canManageOrder(order);
        const actionHtml = `
            ${canManage ? `<button onclick='window.openPendingReactivateModalById(${JSON.stringify(String(order.id))})' class="btn-primary px-3 py-1.5 text-xs shadow-sm">选展位</button>` : '<span class="badge-readonly">无权选位</span>'}
            ${canManage ? `<button onclick='window.openFinanceDirectById(${JSON.stringify(String(order.id))}, "pay")' class="btn-secondary px-3 py-1.5 text-xs">财务</button>` : ''}
            ${paymentCount > 0 && window.isSuperAdmin() ? `<button onclick='window.openPendingPaymentHandlingById(${JSON.stringify(String(order.id))})' class="btn-soft-amber px-3 py-1.5 text-xs">处理收款</button>` : ''}
            ${window.isSuperAdmin() ? `<button onclick='window.deletePendingOrderById(${JSON.stringify(String(order.id))})' class="btn-soft-danger px-3 py-1.5 text-xs">删除</button>` : ''}
        `;
        return `
            <tr class="border-b hover:bg-blue-50 transition">
                <td class="text-center align-middle">${statusHtml}</td>
                <td class="font-bold text-slate-700">${window.escapeHtml(originalBooth)}</td>
                <td class="order-region-cell text-xs text-gray-500 truncate" title="${window.escapeHtml(order.region || '未填')}">${window.escapeHtml(order.region || '未填')}</td>
                <td class="order-company-cell font-bold text-gray-800 cursor-pointer hover:text-blue-600 hover:underline" onclick='window.showPendingOrderDetailById(${JSON.stringify(String(order.id))})'>${window.escapeHtml(order.company_name || '')}</td>
                <td class="font-bold text-slate-600">${window.escapeHtml(order.sales_name || '未填')}</td>
                <td class="max-w-[240px] truncate text-xs text-slate-500" title="${window.escapeHtml(order.main_business || '')}">${window.escapeHtml(order.main_business || '未填')}</td>
                <td class="text-right font-bold text-gray-800 tabular-data">${window.formatCurrency(snapshot.total_booth_fee || 0)}</td>
                <td class="text-right font-bold text-green-600 tabular-data">${window.formatCurrency(order.effective_paid_amount || order.paid_amount || 0)}</td>
                <td class="text-xs text-slate-500 whitespace-normal min-w-[180px]"><span class="font-bold text-slate-700">${sourceLabel}</span><br>${window.escapeHtml(order.pending_reason || '')}<br>${window.escapeHtml(order.pending_at || '')}</td>
                <td class="order-actions-cell text-center sticky right-0 bg-white sticky-action-shadow"><div class="flex flex-wrap items-center justify-center gap-1.5">${actionHtml}</div></td>
            </tr>
        `;
    }, '<tr><td colspan="10" class="p-6 text-center text-gray-400">暂无待确认订单</td></tr>');
}

window.showPendingOrderDetailById = function(id) {
    const order = (window.pendingOrders || []).find((item) => String(item.id) === String(id));
    if (order) window.showOrderDetail(order);
    else window.showToast('找不到对应的待确认订单', 'error');
}

window.openPendingPaymentHandlingById = function(id) {
    if (!window.isSuperAdmin()) return window.showToast('仅超级管理员可记录收款处理方式', 'error');
    const order = (window.pendingOrders || []).find((item) => String(item.id) === String(id));
    if (!order) return window.showToast('找不到对应的待确认订单', 'error');
    if (Number(order.effective_payment_count || 0) <= 0) return window.showToast('当前订单没有有效收款，无需处理', 'error');
    document.getElementById('pending-payment-order-id').value = order.id;
    document.getElementById('pending-payment-method').value = order.pending_payment_handling_method || 'full_refund';
    document.getElementById('pending-payment-note').value = order.pending_payment_handling_note || '';
    document.getElementById('pending-payment-order-title').innerText = `${order.company_name} (${order.sales_name || '未填'})`;
    document.getElementById('pending-payment-order-summary').innerText = `有效收款 ${window.formatCurrency(order.effective_paid_amount || order.paid_amount || 0)}，共 ${Number(order.effective_payment_count || 0)} 条流水。`;
    window.togglePendingPaymentNoteRequirement();
    document.getElementById('pending-payment-modal').classList.remove('hidden');
}

window.togglePendingPaymentNoteRequirement = function() {
    const method = document.getElementById('pending-payment-method')?.value;
    const tip = document.getElementById('pending-payment-note-tip');
    if (tip) tip.innerText = method === 'custom' ? '自定义处理方式必须填写说明。' : '可补充退款流水、转项目依据或审批备注。';
}

window.submitPendingPaymentHandling = async function() {
    const orderId = Number(document.getElementById('pending-payment-order-id')?.value || 0);
    const projectId = Number(document.getElementById('global-project-select')?.value || 0);
    const method = document.getElementById('pending-payment-method')?.value || '';
    const note = document.getElementById('pending-payment-note')?.value.trim() || '';
    if (!orderId || !projectId) return window.showToast('订单信息缺失', 'error');
    if (method === 'custom' && !note) return window.showToast('自定义处理方式必须填写说明', 'error');
    try {
        await window.withButtonLoading('btn-submit-pending-payment-handling', async () => {
            await window.ensureApiSuccess(
                await window.apiFetch('/api/handle-pending-order-payments', {
                    method: 'POST',
                    body: JSON.stringify({ project_id: projectId, order_id: orderId, method, note })
                }),
                '保存处理方式失败'
            );
            window.showToast('收款处理方式已记录，订单继续留在待确认列表');
            window.closeModal('pending-payment-modal');
            await window.loadPendingOrderList();
        });
    } catch (e) {
        window.showToast(e.message || '保存处理方式失败', 'error');
    }
}

window.deletePendingOrderById = async function(id) {
    if (!window.isSuperAdmin()) return window.showToast('仅超级管理员可删除待确认订单', 'error');
    const order = (window.pendingOrders || []).find((item) => String(item.id) === String(id));
    if (!order) return window.showToast('找不到对应的待确认订单', 'error');
    const paymentCount = Number(order.effective_payment_count || 0);
    const paymentAmount = Number(order.effective_paid_amount || order.paid_amount || 0);
    const confirmMessage = paymentCount > 0
        ? `确定彻底删除待确认订单：${order.company_name}？\n该订单有 ${paymentCount} 条历史收款记录，合计 ${window.formatCurrency(paymentAmount)}，删除后关联收款、代付、超收记录都会一并永久删除。`
        : `确定彻底删除待确认订单：${order.company_name}？\n删除后该订单及其关联记录将不可恢复。`;
    if (!confirm(confirmMessage)) return;
    try {
        await window.ensureApiSuccess(
            await window.apiFetch('/api/delete-pending-order', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: Number(document.getElementById('global-project-select')?.value || 0),
                    order_id: Number(order.id)
                })
            }),
            '删除待确认订单失败'
        );
        window.showToast('待确认订单已彻底删除');
        await window.loadPendingOrderList();
    } catch (e) {
        window.showToast(e.message || '删除失败', 'error');
    }
}

window.openPendingReactivateModalById = function(id) {
    const order = (window.pendingOrders || []).find((item) => String(item.id) === String(id));
    if (!order) return window.showToast('找不到对应的待确认订单', 'error');
    if (!window.canManageOrder(order)) return window.showToast('权限不足：不能操作他人待确认订单', 'error');
    window.pendingReactivateOrder = order;
    window.pendingReactivateCandidateBooths = [];
    window.pendingReactivateFees = window.normalizeSwapFeeDraft(order.fees_json);
    const snapshot = window.parsePendingReleaseSnapshot(order);
    const defaultDisplayName = window.countDisplayNameUnits(snapshot.booth_display_name || '') <= 8
        ? (snapshot.booth_display_name || '')
        : '';
    document.getElementById('pending-reactivate-order-id').value = order.id;
    document.getElementById('pending-reactivate-order-title').innerText = `${order.company_name} (${order.sales_name || '未填'})`;
    document.getElementById('pending-reactivate-order-summary').innerText = `当前有效已收 ${window.formatCurrency(order.effective_paid_amount || order.paid_amount || 0)}，基础资料和合同将继续沿用。`;
    document.getElementById('pending-reactivate-target-card').classList.add('hidden');
    document.getElementById('pending-reactivate-actual-fee').value = 0;
    document.getElementById('pending-reactivate-price-reason').value = '';
    document.getElementById('pending-reactivate-standard-display-name').value = defaultDisplayName;
    document.getElementById('pending-reactivate-ground-display-name').value = snapshot.booth_display_name || order.company_name || '';
    window.pendingReactivateRenderFees();
    window.calculatePendingReactivateTotal();
    document.getElementById('pending-reactivate-modal').classList.remove('hidden');
}

window.openPendingReactivateBoothMapPicker = async function() {
    const order = window.pendingReactivateOrder;
    const projectId = Number(document.getElementById('global-project-select')?.value || 0);
    if (!order || !projectId) return window.showToast('未找到当前待确认订单，无法选展位', 'error');
    window.ensureOrderBoothMapPickerInitialized();
    const state = window.getOrderBoothMapPickerState();
    state.mode = 'pending-reactivate';
    state.tempSelectedBooths = Array.isArray(window.pendingReactivateCandidateBooths)
        ? window.pendingReactivateCandidateBooths.map((item) => JSON.parse(JSON.stringify(item)))
        : [];
    state.onConfirm = (selection) => {
        const candidates = Array.isArray(selection) ? selection : [];
        if (!candidates.length) {
            window.showToast('请先从展位图中选择至少一个目标展位', 'error');
            return false;
        }
        window.applyPendingReactivateCandidates(candidates);
        window.showToast(`已选中 ${candidates.length} 个新展位`);
        return true;
    };
    try {
        await window.ensureSwapInventoryLoaded(projectId);
        await window.loadOrderBoothMapPickerMaps(0);
        const confirmBtn = document.getElementById('btn-confirm-order-booth-map');
        if (confirmBtn) confirmBtn.innerText = '确认目标展位';
        document.getElementById('order-booth-map-modal')?.classList.remove('hidden');
    } catch (error) {
        window.showToast(error.message || '打开展位图失败', 'error');
    }
}

window.applyPendingReactivateCandidates = function(candidates) {
    const normalizedCandidates = (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
        id: String(candidate?.id || ''),
        hall: String(candidate?.hall || ''),
        type: String(candidate?.type || ''),
        area: Number(candidate?.area || 0),
        price_unit: String(candidate?.price_unit || (String(candidate?.type || '') === '光地' ? '平米' : '个')),
        unit_price: Number(candidate?.unit_price || 0),
        standard_fee: Number(candidate?.standard_fee || 0),
        booth_map_id: Number(candidate?.booth_map_id || 0)
    })).filter((candidate) => candidate.id);
    if (!normalizedCandidates.length) return;
    window.pendingReactivateCandidateBooths = normalizedCandidates;
    const boothLabels = normalizedCandidates.map((candidate) => `${candidate.hall} - ${candidate.id}`);
    const totalArea = normalizedCandidates.reduce((sum, candidate) => sum + Number(candidate.area || 0), 0);
    const totalStandardFee = normalizedCandidates.reduce((sum, candidate) => sum + Number(candidate.standard_fee || 0), 0);
    document.getElementById('pending-reactivate-target-name').innerText = boothLabels.slice(0, 3).join(' / ') + (boothLabels.length > 3 ? ` 等${boothLabels.length}个` : '');
    document.getElementById('pending-reactivate-target-meta').innerText = `共 ${normalizedCandidates.length} 个展位 | 总面积 ${totalArea.toLocaleString()}㎡`;
    document.getElementById('pending-reactivate-target-standard').innerText = window.formatCurrency(totalStandardFee);
    document.getElementById('pending-reactivate-target-card').classList.remove('hidden');
    document.getElementById('pending-reactivate-actual-fee').value = totalStandardFee;
    document.getElementById('pending-reactivate-price-reason').value = '';
    window.calculatePendingReactivateTotal();
}

window.pendingReactivateAddFeeRow = function() {
    window.pendingReactivateFees.push({ name: '', amount: '' });
    window.pendingReactivateRenderFees();
}

window.pendingReactivateRemoveFeeRow = function(idx) {
    window.pendingReactivateFees.splice(idx, 1);
    window.pendingReactivateRenderFees();
}

window.pendingReactivateUpdateFeeData = function(idx, field, value) {
    if (!window.pendingReactivateFees[idx]) return;
    window.pendingReactivateFees[idx][field] = value;
    window.calculatePendingReactivateTotal();
}

window.pendingReactivateRenderFees = function() {
    const container = document.getElementById('pending-reactivate-fees-container');
    if (!container) return;
    const feeRows = window.pendingReactivateFees || [];
    if (feeRows.length === 0) {
        container.innerHTML = '<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">当前没有其他收费项，可按需新增</div>';
        window.calculatePendingReactivateTotal();
        return;
    }
    container.innerHTML = feeRows.map((fee, idx) => `
        <div class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <input type="text" value="${window.escapeAttr(fee.name || '')}" placeholder="收费名称" oninput="window.pendingReactivateUpdateFeeData(${idx}, 'name', this.value)" class="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
            <span class="text-sm font-bold text-slate-400">¥</span>
            <input type="number" value="${fee.amount === '' ? '' : Number(fee.amount || 0)}" placeholder="金额" oninput="window.pendingReactivateUpdateFeeData(${idx}, 'amount', this.value)" class="w-28 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 tabular-data">
            <button type="button" onclick="window.pendingReactivateRemoveFeeRow(${idx})" class="btn-soft-danger px-2.5 py-2 text-xs">删除</button>
        </div>
    `).join('');
    window.calculatePendingReactivateTotal();
}

window.calculatePendingReactivateTotal = function() {
    const actualFee = parseFloat(document.getElementById('pending-reactivate-actual-fee')?.value || 0) || 0;
    const otherTotal = (window.pendingReactivateFees || []).reduce((sum, fee) => sum + (parseFloat(fee.amount || 0) || 0), 0);
    const total = actualFee + otherTotal;
    document.getElementById('pending-reactivate-booth-fee-preview').innerText = window.formatCurrency(actualFee);
    document.getElementById('pending-reactivate-other-fee-preview').innerText = window.formatCurrency(otherTotal);
    document.getElementById('pending-reactivate-total-preview').innerText = window.formatCurrency(total);
}

window.submitPendingReactivate = async function() {
    const order = window.pendingReactivateOrder;
    const candidates = Array.isArray(window.pendingReactivateCandidateBooths) ? window.pendingReactivateCandidateBooths : [];
    const projectId = Number(document.getElementById('global-project-select')?.value || 0);
    if (!order || !projectId) return window.showToast('订单信息缺失', 'error');
    if (!candidates.length) return window.showToast('请先选择至少一个新展位', 'error');
    const actualFee = parseFloat(document.getElementById('pending-reactivate-actual-fee').value || 0);
    const priceReason = document.getElementById('pending-reactivate-price-reason').value.trim();
    const standardDisplayName = document.getElementById('pending-reactivate-standard-display-name').value.trim();
    const groundDisplayName = document.getElementById('pending-reactivate-ground-display-name').value.trim();
    if (!Number.isFinite(actualFee) || actualFee < 0) return window.showToast('请输入正确的新展位成交展位费', 'error');
    const standardTotal = candidates.reduce((sum, candidate) => sum + Number(candidate.standard_fee || 0), 0);
    if (actualFee < standardTotal && !priceReason) return window.showToast('成交价低于系统原价时，请填写价格说明', 'error');
    if (candidates.some((candidate) => ['标摊', '豪标'].includes(String(candidate.type || ''))) && !standardDisplayName) return window.showToast('标准展位/豪标必须填写展位图简称', 'error');
    if (window.countDisplayNameUnits(standardDisplayName) > 8) return window.showToast('标准展位简称最多 4 个汉字或 8 个英文字符', 'error');
    if (window.countDisplayNameUnits(groundDisplayName) > 24) return window.showToast('光地显示名称不能超过 12 个汉字或 24 个英文字符', 'error');
    const feeRows = [];
    for (const fee of (window.pendingReactivateFees || [])) {
        const name = String(fee?.name || '').trim();
        const rawAmount = String(fee?.amount ?? '').trim();
        if (!name && !rawAmount) continue;
        const amount = Number(rawAmount || 0);
        if (!name) return window.showToast('其他收费明细存在未填写名称的行', 'error');
        if (!Number.isFinite(amount) || amount < 0) return window.showToast(`其他收费 [${name}] 的金额无效`, 'error');
        if (amount <= 0) continue;
        feeRows.push({ name, amount });
    }
    const total = actualFee + feeRows.reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
    if (Number(order.effective_paid_amount || order.paid_amount || 0) > total) {
        return window.showToast('恢复后的总应收不能低于已有有效收款，请先处理收款', 'error');
    }
    try {
        await window.withButtonLoading('btn-submit-pending-reactivate', async () => {
            await window.ensureApiSuccess(
                await window.apiFetch('/api/reactivate-pending-order', {
                    method: 'POST',
                    body: JSON.stringify({
                        project_id: projectId,
                        order_id: order.id,
                        target_booth_ids: candidates.map((candidate) => candidate.id),
                        actual_fee: actualFee,
                        price_reason: priceReason,
                        fees_json: feeRows,
                        standard_booth_display_name: standardDisplayName,
                        ground_booth_display_name: groundDisplayName
                    })
                }),
                '恢复订单失败'
            );
            window.showToast('待确认订单已恢复为成交订单');
            window.closeModal('pending-reactivate-modal');
            window.markOrderDashboardDirty?.();
            await window.loadPendingOrderList();
            await window.loadOrderList?.();
            await window.loadBooths?.();
            if (document.getElementById('sec-booth-map')?.classList.contains('active')) await window.initBoothMapPage?.();
        });
    } catch (e) {
        window.showToast(e.message || '恢复订单失败', 'error');
    }
}

// 预览合同（新标签页打开，通过短效 cookie 传递鉴权以获取正确文件名）
window.previewSingleContract = async function(fileKey, orderId) {
    try {
        window.showToast("正在获取云端合同，准备预览...", "info");
        const savedUser = window.getCurrentAuthUser?.();
        const token = savedUser?.token;
        if (!token) return window.showToast('登录状态异常，请重新登录', 'error');
        // 设置短效 cookie，让新标签页打开的 API 请求能通过鉴权
        document.cookie = `preview_auth=${encodeURIComponent(token)}; path=/api/file/; max-age=30; samesite=lax`;
        const previewUrl = `/api/file/${encodeURIComponent(fileKey)}?orderId=${encodeURIComponent(orderId)}`;
        window.open(previewUrl, '_blank');
        // 延迟清除 cookie
        setTimeout(() => {
            document.cookie = 'preview_auth=; path=/api/file/; max-age=0; samesite=lax';
        }, 5000);
    } catch (e) { window.showToast(e.message, 'error'); }
}

window.batchDownloadContracts = async function() {
    if (!window.isSuperAdmin?.()) {
        return window.showToast('仅超级管理员可打包导出合同', 'error');
    }
    const btn = document.getElementById('btn-batch-download-contracts');
    if (!btn) return window.showToast('合同打包入口不存在', 'error');
    let ordersWithContracts = [];
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> 打包中...`;
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-wait');

    try {
        const { items: filteredOrders, total } = await window.fetchAllFilteredOrders({ pageSize: 200 });
        ordersWithContracts = filteredOrders.filter((order) => order.contract_url && window.canExportOrder(order));
        if (ordersWithContracts.length === 0) {
            return window.showToast(total > 0 ? "当前筛选结果里没有可导出的已上传合同" : "当前筛选结果为空", "error");
        }
        if (ordersWithContracts.length < filteredOrders.length) {
            window.showToast(`当前筛选共 ${filteredOrders.length} 笔，其中 ${ordersWithContracts.length} 份合同在当前导出范围内`, "info");
        } else {
            window.showToast(`开始打包 ${ordersWithContracts.length} 份合同，请稍候...`, "info");
        }

        const JSZipCtor = await window.ensureJSZipLoaded();
        const zip = new JSZipCtor();
        const folder = zip.folder("参展企业合同打包");

        const concurrency = 5;
        for (let i = 0; i < ordersWithContracts.length; i += concurrency) {
            const chunk = ordersWithContracts.slice(i, i + concurrency);
            await Promise.all(chunk.map(async (order) => {
                try {
                    const response = await window.apiFetch(`/api/file/${order.contract_url}?orderId=${encodeURIComponent(order.id)}`);
                    if (response.ok) {
                        const blob = await response.blob();
                        const safeCompanyName = order.company_name.replace(/[\\/:*?"<>|]/g, "_");
                        const safeHall = order.hall.replace(/[\\/:*?"<>|馆号]/g, ""); 
                        const fileName = `${safeHall}馆 ${safeCompanyName} 参展合同.pdf`;
                        folder.file(fileName, blob);
                    }
                } catch (err) { console.error(`拉取合同失败: ${order.company_name}`, err); }
            }));
        }

        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `展位合同批量打包_${new Date().toLocaleDateString().replace(/\//g, '-')}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        window.showToast("合同打包下载成功！");
    } catch (error) {
        window.showToast("打包下载过程中出现网络错误", "error");
    } finally {
        btn.innerHTML = originalHtml; btn.disabled = false; btn.classList.remove('opacity-70', 'cursor-wait');
    }
}

window.exportToExcel = async function() {
    const fmtMoney = (value) => Number(value || 0).toFixed(2).replace(/\.00$/, '');
    const parseJsonSafe = (value) => {
        try {
            return value ? JSON.parse(value) : null;
        } catch (e) {
            return null;
        }
    };
    const normalizePaymentDetails = (payments) => (payments || []).map((payment) => {
        const raw = parseJsonSafe(payment.raw_payload);
        return {
            amount: payment.amount || 0,
            paymentDate: payment.payment_time || '',
            payerName: raw?.receivablesUnit || raw?.payerName || payment.payer_name || '',
            receiveBank: raw?.bank || raw?.bankName || raw?.bank_name || payment.bank_name || '',
            receiveCompany: raw?.corporateAccount || raw?.corporate_account || ''
        };
    });
    const normalizeExpenseDetails = (expenses) => (expenses || []).map((expense) => ({
        reason: expense.reason || '',
        channel: expense.payee_channel || '',
        payeeName: expense.payee_name || '',
        amount: expense.amount || 0,
        createdAt: expense.created_at || ''
    }));
    const parseFeeDetails = (feesJson) => {
        try {
            const items = JSON.parse(feesJson || '[]');
            if (!Array.isArray(items) || items.length === 0) return '';
            return items
                .map((item) => `${item.name || '未命名收费'}: ¥${fmtMoney(item.amount)}`)
                .join('；');
        } catch (e) {
            return '';
        }
    };

    window.showToast("正在整理导出数据，请稍候...", "info");

    try {
        const XLSX = await window.ensureXLSXLoaded();
        const { items: filteredOrders, total } = await window.fetchAllFilteredOrders({ pageSize: 200 });
        const exportOrders = (filteredOrders || []).filter((order) => window.canExportOrder(order));
        if (!exportOrders || exportOrders.length === 0) {
            return window.showToast(total > 0 ? "当前筛选范围内没有可导出的订单" : "当前无可导出的订单数据", 'error');
        }
        const detailRows = [];
        const concurrency = 8;
        for (let index = 0; index < exportOrders.length; index += concurrency) {
            const chunk = exportOrders.slice(index, index + concurrency);
            const chunkRows = await Promise.all(chunk.map(async (order) => {
                let payments = [];
                let expenses = [];
                if (window.canManageOrder(order)) {
                    const [paymentItems, expenseRes] = await Promise.all([
                        window.fetchAllOrderPayments(order.id),
                        window.apiFetch(`/api/expenses?orderId=${encodeURIComponent(order.id)}`)
                    ]);
                    payments = paymentItems;
                    expenses = expenseRes.ok ? window.unwrapListPayload(await expenseRes.json()) : [];
                }
                const paymentDetails = normalizePaymentDetails(payments);
                const expenseDetails = normalizeExpenseDetails(expenses);
                const otherFeeDetails = parseFeeDetails(order.fees_json);
                let status = order.paid_amount >= order.total_amount ? '已付全款' : (order.paid_amount > 0 ? '已付定金' : '未付款');
                if (order.status === '已退订' || order.status === '已作废') status = '已退订';

                return {
                    base: [
                        status,
                        order.hall || '',
                        order.booth_id || '',
                        order.area || '',
                        order.booth_type || '',
                        order.company_name || '',
                        order.credit_code || '',
                        order.region || '',
                        order.contact_person || '',
                        order.phone || '',
                        order.category || '',
                        order.main_business || '',
                        order.profile || '',
                        order.is_agent ? '代理商招展' : '直招',
                        order.is_agent ? (order.agent_name || '') : '',
                        order.sales_name || '',
                        order.total_booth_fee || 0,
                        order.other_income || 0,
                        otherFeeDetails,
                        order.total_amount || 0,
                        order.paid_amount || 0,
                        paymentDetails.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
                    ],
                    payments: paymentDetails,
                    expenseTotal: expenseDetails.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
                    expenses: expenseDetails,
                    createdAt: order.created_at || ''
                };
            }));
            detailRows.push(...chunkRows);
        }

        const maxPaymentCount = detailRows.reduce((max, row) => Math.max(max, row.payments.length), 0);
        const maxExpenseCount = detailRows.reduce((max, row) => Math.max(max, row.expenses.length), 0);
        const headers = [
            '内部状态',
            '馆号',
            '展位号',
            '展位面积',
            '类型',
            '客户名称',
            '信用代码/代号',
            '地区',
            '联系人',
            '电话',
            '产品分类',
            '主营业务/展品',
            '企业简介或产品亮点',
            '招展渠道',
            '代理商名称',
            '业务员',
            '应收展位费',
            '应收其他费用',
            '其他收费明细',
            '总计应收金额',
            '订单已收金额',
            '收款流水总额'
        ];
        for (let i = 1; i <= maxPaymentCount; i += 1) {
            headers.push(
                `收款${i}金额`,
                `收款${i}日期`,
                `收款${i}付款人`,
                `收款${i}收款银行`,
                `收款${i}收款至我司户名`
            );
        }
        headers.push('代付/返佣总额');
        for (let i = 1; i <= maxExpenseCount; i += 1) {
            headers.push(
                `代付/返佣${i}事由`,
                `代付/返佣${i}渠道`,
                `代付/返佣${i}收款人/供应商`,
                `代付/返佣${i}金额`,
                `代付/返佣${i}时间`
            );
        }
        headers.push('录入时间');

        const sheetRows = [headers];
        detailRows.forEach((row) => {
            const paymentCells = [];
            for (let i = 0; i < maxPaymentCount; i += 1) {
                const payment = row.payments[i];
                paymentCells.push(
                    payment ? payment.amount : '',
                    payment ? payment.paymentDate : '',
                    payment ? payment.payerName : '',
                    payment ? payment.receiveBank : '',
                    payment ? payment.receiveCompany : ''
                );
            }

            const expenseCells = [];
            for (let i = 0; i < maxExpenseCount; i += 1) {
                const expense = row.expenses[i];
                expenseCells.push(
                    expense ? expense.reason : '',
                    expense ? expense.channel : '',
                    expense ? expense.payeeName : '',
                    expense ? expense.amount : '',
                    expense ? expense.createdAt : ''
                );
            }

            const flatRow = [
                ...row.base,
                ...paymentCells,
                row.expenseTotal,
                ...expenseCells,
                row.createdAt
            ];
            sheetRows.push(flatRow);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
        const boothColIndex = headers.indexOf('展位号');
        for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
            const boothValue = sheetRows[rowIndex][boothColIndex];
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: boothColIndex });
            worksheet[cellAddress] = {
                t: 's',
                v: boothValue == null ? '' : String(boothValue),
                z: '@'
            };
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '订单导出');
        XLSX.writeFile(workbook, `展位订单已选导出_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`, {
            compression: true
        });
        window.showToast("已选订单导出成功！");
    } catch (e) {
        window.showToast(`导出失败: ${e.message}`, 'error');
    }
}

window.triggerSilentUpload = function(orderId) {
    const order = (window.allOrders || []).find(o => String(o.id) === String(orderId));
    if (!window.canManageOrder(order)) return window.showToast('权限不足：不能上传他人合同', 'error');
    window.currentSilentOrderId = orderId;
    document.getElementById('silent-file-upload').click();
}
window.handleSilentUpload = async function(input) {
    if(!input.files[0] || !window.currentSilentOrderId) return;
    window.showToast("正在上传合同并更新单据...");
    try {
        const upData = await window.uploadContractFile(input.files[0]);
        const order = (window.allOrders || []).find(o => String(o.id) === String(window.currentSilentOrderId));
        const data = { project_id: document.getElementById('global-project-select').value, order_id: window.currentSilentOrderId, contact_person: order.contact_person, phone: order.phone, region: order.region, main_business: order.main_business, profile: order.profile, category: order.category, is_agent: order.is_agent === 1, agent_name: order.agent_name, contract_url: upData.fileKey };
        const updateRes = await window.apiFetch('/api/update-customer-info', {method:'POST', body: JSON.stringify(data)});
        await window.ensureApiSuccess(updateRes, '数据库更新失败');
        window.showToast("合同处理成功！"); window.loadOrderList();
    } catch (e) { window.showToast("上传失败: " + e.message, 'error'); } finally { input.value = ''; window.currentSilentOrderId = null; }
}

window.toggleDtAgent = function() {
    if (!window.isOrderFieldEnabled?.('is_agent')) {
        document.getElementById('dt-view-agent-group')?.classList.add('hidden');
        document.getElementById('edit-dt-agent-group')?.classList.add('hidden');
        document.getElementById('edit-dt-agent-name')?.classList.add('hidden');
        document.getElementById('edit-dt-agent-search-wrap')?.classList.add('hidden');
        return;
    }
    const checkedRadio = document.querySelector('input[name="edit_is_agent"]:checked');
    if (!checkedRadio) return;
    const isAgent = checkedRadio.value === '1';
    const box = document.getElementById('edit-dt-agent-name');
    const searchWrap = document.getElementById('edit-dt-agent-search-wrap');
    const showAgentName = isAgent && window.isOrderFieldEnabled?.('agent_name');
    if (box) {
        if (showAgentName) { box.classList.remove('hidden'); searchWrap?.classList.remove('hidden'); window.ensureAgentsLoaded?.(); } 
        else { box.classList.add('hidden'); box.value = ''; searchWrap?.classList.add('hidden'); }
    }
}

window.setDetailFieldVisibility = function(fieldKey, visible, options = {}) {
    const isSuperAdmin = !!options.isSuperAdmin;
    const visibilityMap = {
        company_name: isSuperAdmin ? ['dt-superadmin-company-group'] : [],
        credit_code: ['dt-view-code-group', ...(isSuperAdmin ? ['dt-superadmin-code-group'] : [])],
        contact_person: ['dt-view-contact-group', 'dt-edit-contact-group'],
        phone: ['dt-view-phone-group', 'dt-edit-phone-group'],
        region: ['dt-view-region-group', 'dt-edit-region-group'],
        category: ['dt-view-category-group', 'dt-edit-category-group'],
        main_business: ['dt-view-business-group', 'dt-edit-business-group'],
        profile: ['dt-view-profile-group', 'dt-edit-profile-group'],
        is_agent: ['dt-view-agent-group', 'dt-edit-agent-group']
    };
    (visibilityMap[fieldKey] || []).forEach((id) => {
        document.getElementById(id)?.classList.toggle('hidden', !visible);
    });
}

window.populateDetailSalesOwnerSelect = async function(selectedName = '') {
    const wrap = document.getElementById('dt-superadmin-sales-group');
    const select = document.getElementById('edit-dt-sales');
    if (!wrap || !select) return;
    if (!window.isSuperAdmin?.()) {
        wrap.classList.add('hidden');
        select.innerHTML = '<option value="">请选择业务员</option>';
        return;
    }
    const projectId = document.getElementById('global-project-select')?.value;
    if (!projectId) return;
    const staffList = await window.getProjectStaffList?.(projectId);
    const options = ['<option value="">请选择业务员</option>'];
    (Array.isArray(staffList) ? staffList : []).forEach((staff) => {
        const name = String(staff?.name || '').trim();
        if (!name) return;
        options.push(`<option value="${window.escapeHtml(name)}" ${name === selectedName ? 'selected' : ''}>${window.escapeHtml(name)}</option>`);
    });
    select.innerHTML = options.join('');
    wrap.classList.remove('hidden');
}

window.applyDetailFieldSettings = function(order = window.currentViewOrder) {
    const isSuperAdmin = window.isSuperAdmin?.();
    ['company_name', 'credit_code', 'contact_person', 'phone', 'region', 'category', 'main_business', 'profile', 'is_agent'].forEach((fieldKey) => {
        window.setDetailFieldVisibility(fieldKey, window.isOrderFieldEnabled?.(fieldKey) !== false, { isSuperAdmin });
    });
    window.syncOrderListRegionFilterVisibility?.();
    if (order) window.toggleDtAgent?.();
}

window.isOrderInfoFromExhibitor = function(order = {}) {
    return String(order?.exhibitor_info_status || '').trim() === 'exhibitor_confirmed';
}

window.setOrderDetailOriginBadge = function(elementId, fromExhibitor) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    badge.innerText = fromExhibitor ? '来自企业填写' : '默认';
    badge.className = fromExhibitor
        ? 'inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200';
}

window.refreshOrderDetailOriginBadges = function(order = {}) {
    const fromExhibitor = window.isOrderInfoFromExhibitor(order);
    window.setOrderDetailOriginBadge('dt-business-origin', fromExhibitor);
    window.setOrderDetailOriginBadge('dt-profile-origin', fromExhibitor);
}

window.showOrderDetail = async function(o) {
    const canManage = window.canManageOrder(o);
    const isSuperAdmin = window.isSuperAdmin();
    const canViewSensitive = window.canViewSensitiveOrderFields(o);
    const editContactInput = document.getElementById('edit-dt-contact');
    const editPhoneInput = document.getElementById('edit-dt-phone');
    window.currentViewOrder = o; 
    document.getElementById('dt-company').innerText = o.company_name;
    document.getElementById('dt-code').innerText = o.no_code_checked ? `无代码 (代号: ${o.credit_code})` : o.credit_code;
    document.getElementById('dt-booth').innerText = window.getOrderBoothDisplay(o);
    document.getElementById('dt-sales').innerText = o.sales_name;
    document.getElementById('dt-time').innerText = o.created_at || '未知';
    document.getElementById('dt-region').innerText = o.region || '未填';
    document.getElementById('dt-contact').innerText = o.contact_person;
    document.getElementById('dt-phone').innerText = o.phone;
    document.getElementById('dt-category').innerText = o.category || '未填';
    document.getElementById('dt-business').innerText = o.main_business || '未填';
    document.getElementById('dt-profile').innerText = o.profile || '未填';
    document.getElementById('dt-agent').innerText = o.is_agent ? `由代理商 [${o.agent_name}] 代招` : '直招入驻';
    window.refreshOrderDetailOriginBadges(o);
    editContactInput.value = o.contact_person;
    editPhoneInput.value = o.phone;
    editContactInput.disabled = !canViewSensitive;
    editPhoneInput.disabled = !canViewSensitive;
    editContactInput.classList.toggle('bg-gray-100', !canViewSensitive);
    editPhoneInput.classList.toggle('bg-gray-100', !canViewSensitive);
    editContactInput.classList.toggle('cursor-not-allowed', !canViewSensitive);
    editPhoneInput.classList.toggle('cursor-not-allowed', !canViewSensitive);
    document.getElementById('edit-dt-company').value = o.company_name || '';
    document.getElementById('edit-dt-code').value = o.credit_code || '';
    document.getElementById('edit-dt-no-code').checked = Number(o.no_code_checked) === 1;
    await window.populateDetailSalesOwnerSelect(o.sales_name || '');
    window.toggleDetailCreditCode();
    window.populateDetailRegionFields(o.region || '');
    if (window.renderCategorySelect) { window.renderCategorySelect('edit-dt-category', o.category || '', true); }
    document.getElementById('edit-dt-business').value = o.main_business || '';
    document.getElementById('edit-dt-profile').value = o.profile || '';
    document.querySelector(`input[name="edit_is_agent"][value="${o.is_agent ? 1 : 0}"]`).checked = true; 
    document.getElementById('edit-dt-agent-name').value = o.agent_name || '';
    document.getElementById('dt-sensitive-edit-tip').classList.toggle('hidden', !isSuperAdmin);
    document.getElementById('dt-superadmin-company-group').classList.toggle('hidden', false);
    document.getElementById('dt-superadmin-code-group').classList.toggle('hidden', !isSuperAdmin);
    document.getElementById('dt-superadmin-sales-group').classList.toggle('hidden', !isSuperAdmin);
    
    document.querySelectorAll('input[name="edit_is_agent"]').forEach(el => el.onchange = window.toggleDtAgent);
    document.getElementById('edit-dt-no-code').onchange = window.toggleDetailCreditCode;
    window.applyDetailFieldSettings(o);
    window.toggleDtAgent();

    const actionView = document.getElementById('dt-action-view');
    if (canManage) {
        actionView.innerHTML = '<button onclick="window.toggleDetailEditMode(true)" class="btn-secondary px-4 py-2 shadow-sm">进入编辑模式</button>';
    } else {
        actionView.innerHTML = '<span class="text-xs text-gray-500 bg-gray-100 px-3 py-2 rounded font-bold">非本人录入，仅可查看受限信息</span>';
    }

    window.renderOverpaymentAlert(o, {
        rootId: 'dt-overpayment-alert',
        summaryId: 'dt-overpayment-summary',
        metaId: 'dt-overpayment-meta',
        actionsId: 'dt-overpayment-actions',
        context: 'detail'
    });

    window.applyDetailDirectBoothShellVisibility?.(o);
    window.toggleDetailEditMode(false); document.getElementById('order-detail-modal').classList.remove('hidden');
}

window.toggleDetailEditMode = function(isEditing) {
    if (isEditing && !window.canManageOrder(window.currentViewOrder)) return window.showToast('权限不足：不能修改他人客户资料', 'error');
    if (isEditing) {
        document.getElementById('dt-view-mode').classList.add('hidden');
        document.getElementById('dt-action-view').classList.add('hidden');
        document.getElementById('dt-edit-mode').classList.remove('hidden');
        document.getElementById('dt-action-edit').classList.remove('hidden');
    } else {
        document.getElementById('dt-edit-mode').classList.add('hidden');
        document.getElementById('dt-action-edit').classList.add('hidden');
        document.getElementById('dt-view-mode').classList.remove('hidden');
        document.getElementById('dt-action-view').classList.remove('hidden');
    }
    window.syncDetailBoothEditVisibility?.(isEditing);
}

window.getOrderBoothIds = function(order) {
    return String(order?.booth_id || '')
        .split(/[,\n\r;/、，]+/g)
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean);
}

window.detailBoothPickerOptions = [];
window.detailBoothPickerSelectedIds = [];

window.hasSameBoothIdSelection = function(leftIds, rightIds) {
    const left = [...new Set((leftIds || []).map((id) => String(id || '').trim().toUpperCase()).filter(Boolean))].sort();
    const right = [...new Set((rightIds || []).map((id) => String(id || '').trim().toUpperCase()).filter(Boolean))].sort();
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

window.canEditDetailBooths = function(order = window.currentViewOrder) {
    return !!order && window.isSuperAdmin?.() && String(order.status || '') !== '待确认';
}

window.syncDetailBoothEditVisibility = function(isEditing) {
    const order = window.currentViewOrder;
    const viewGroup = document.getElementById('dt-booth-view-group');
    const editGroup = document.getElementById('dt-booth-edit-group');
    if (!viewGroup || !editGroup) return;
    const showEdit = !!isEditing && window.canEditDetailBooths(order);
    viewGroup.classList.toggle('hidden', showEdit);
    editGroup.classList.toggle('hidden', !showEdit);
    if (showEdit) {
        window.populateDetailBoothOptions?.(order);
    } else {
        const searchInput = document.getElementById('edit-dt-booth-search');
        if (searchInput) searchInput.value = '';
        document.getElementById('edit-dt-booth-results')?.classList.add('hidden');
    }
}

window.populateDetailBoothOptions = async function(order = window.currentViewOrder) {
    const searchInput = document.getElementById('edit-dt-booth-search');
    const results = document.getElementById('edit-dt-booth-results');
    const selected = document.getElementById('edit-dt-booth-selected');
    const tip = document.getElementById('edit-dt-booths-tip');
    if (!searchInput || !results || !selected || !order) return;
    const projectId = Number(order.project_id || document.getElementById('global-project-select')?.value || 0);
    if (!projectId) return;
    const currentIds = window.getOrderBoothIds(order);
    searchInput.dataset.loading = '1';
    searchInput.disabled = true;
    searchInput.value = '';
    results.innerHTML = '';
    results.classList.add('hidden');
    selected.innerHTML = '';
    window.detailBoothPickerOptions = [];
    window.detailBoothPickerSelectedIds = [...currentIds];
    if (tip) tip.innerText = '正在从展位库加载可选展位。';
    try {
        const rows = await window.readApiJson(
            await window.apiFetch(`/api/booths?projectId=${projectId}`),
            '加载展位库失败',
            []
        );
        const currentSet = new Set(currentIds);
        window.detailBoothPickerOptions = (Array.isArray(rows) ? rows : [])
            .map((row) => {
                const id = String(row.id || '').trim().toUpperCase();
                const statusCode = String(row.sale_status_code || '').trim();
                const isCurrent = currentSet.has(id);
                return {
                    id,
                    hall: String(row.hall || '').trim(),
                    type: String(row.type || '').trim(),
                    area: Number(row.area || 0),
                    status: String(row.sale_status_label || row.status || '').trim(),
                    disabled: !isCurrent && statusCode && statusCode !== 'available'
                };
            })
            .filter((item) => item.id)
            .sort((a, b) => `${a.hall}-${a.id}`.localeCompare(`${b.hall}-${b.id}`, 'zh-Hans-CN'));
        searchInput.disabled = false;
        searchInput.dataset.loading = '0';
        window.renderDetailSelectedBoothTags();
        if (tip) tip.innerText = '输入展位号 / 馆号 / 类型后搜索并添加目标展位。';
    } catch (error) {
        searchInput.dataset.loading = '0';
        searchInput.disabled = true;
        results.classList.add('hidden');
        selected.innerHTML = '';
        if (tip) tip.innerText = error.message || '加载展位库失败，请稍后重试。';
    }
}

window.renderDetailSelectedBoothTags = function() {
    const container = document.getElementById('edit-dt-booth-selected');
    if (!container) return;
    const selectedIds = Array.isArray(window.detailBoothPickerSelectedIds) ? window.detailBoothPickerSelectedIds : [];
    if (!selectedIds.length) {
        container.innerHTML = '<span class="text-xs text-slate-400">尚未选择目标展位</span>';
        return;
    }
    const optionMap = new Map((window.detailBoothPickerOptions || []).map((item) => [item.id, item]));
    container.innerHTML = selectedIds.map((id) => {
        const item = optionMap.get(id);
        const label = item ? `${item.hall ? `${item.hall} - ` : ''}${item.id}` : id;
        return `<span class="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">${window.escapeHtml(label)}<button type="button" onclick='window.removeDetailBoothSelection(${JSON.stringify(id)})' class="text-amber-600 hover:text-amber-900">x</button></span>`;
    }).join('');
}

window.renderDetailBoothSearchResults = function() {
    const searchInput = document.getElementById('edit-dt-booth-search');
    const results = document.getElementById('edit-dt-booth-results');
    if (!searchInput || !results) return;
    if (searchInput.dataset.loading === '1') {
        results.classList.add('hidden');
        return;
    }
    const keyword = String(searchInput.value || '').trim().toUpperCase();
    if (!keyword) {
        results.classList.add('hidden');
        return;
    }
    const selectedSet = new Set(window.detailBoothPickerSelectedIds || []);
    const options = (window.detailBoothPickerOptions || []).filter((item) => {
        if (item.disabled || selectedSet.has(item.id)) return false;
        const haystack = `${item.id} ${item.hall} ${item.type} ${item.status}`.toUpperCase();
        return haystack.includes(keyword);
    }).slice(0, 20);
    if (!options.length) {
        results.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400">没有匹配的可选展位</div>';
        results.classList.remove('hidden');
        return;
    }
    results.innerHTML = options.map((item) => `
        <button type="button" onclick='window.selectDetailBooth(${JSON.stringify(item.id)})' class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-amber-50">
            <span>
                <span class="font-bold text-slate-800">${window.escapeHtml(item.hall ? `${item.hall} - ${item.id}` : item.id)}</span>
                <span class="ml-2 text-slate-500">${window.escapeHtml(item.type || '未分型')} · ${window.escapeHtml(String(item.area || 0))}㎡ · ${window.escapeHtml(item.status || '可售')}</span>
            </span>
            <span class="font-bold text-amber-600">添加</span>
        </button>
    `).join('');
    results.classList.remove('hidden');
}

window.selectDetailBooth = function(boothId) {
    const normalizedId = String(boothId || '').trim().toUpperCase();
    if (!normalizedId) return;
    const next = new Set(window.detailBoothPickerSelectedIds || []);
    next.add(normalizedId);
    window.detailBoothPickerSelectedIds = Array.from(next);
    const searchInput = document.getElementById('edit-dt-booth-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('edit-dt-booth-results')?.classList.add('hidden');
    window.renderDetailSelectedBoothTags();
}

window.removeDetailBoothSelection = function(boothId) {
    const normalizedId = String(boothId || '').trim().toUpperCase();
    window.detailBoothPickerSelectedIds = (window.detailBoothPickerSelectedIds || []).filter((id) => id !== normalizedId);
    window.renderDetailSelectedBoothTags();
}

window.getDetailBoothChangeDraft = function(order = window.currentViewOrder) {
    if (!window.canEditDetailBooths(order)) return { changed: false, targetBoothIds: [] };
    const group = document.getElementById('dt-booth-edit-group');
    const searchInput = document.getElementById('edit-dt-booth-search');
    if (!group || group.classList.contains('hidden') || !searchInput) return { changed: false, targetBoothIds: [] };
    if (searchInput.dataset.loading === '1') return { error: '展位库还在加载，请稍后再保存' };
    const targetBoothIds = (window.detailBoothPickerSelectedIds || []).map((id) => String(id || '').trim().toUpperCase()).filter(Boolean);
    if (targetBoothIds.length === 0) return { error: '请选择至少一个目标展位' };
    const currentIds = window.getOrderBoothIds(order);
    if (window.hasSameBoothIdSelection(currentIds, targetBoothIds)) return { changed: false, targetBoothIds };
    return { changed: true, targetBoothIds };
}
window.saveDetailEdit = async function() {
    if (!window.canManageOrder(window.currentViewOrder)) return window.showToast('权限不足：不能修改他人客户资料', 'error');
    const pid = document.getElementById('global-project-select').value;
    const currentOrder = window.currentViewOrder || {};
    const selectedAgentRadio = document.querySelector('input[name="edit_is_agent"]:checked');
    const isAgent = window.isOrderFieldEnabled('is_agent')
        ? (selectedAgentRadio?.value === '1')
        : Number(currentOrder.is_agent || 0) === 1;
    const canEditSensitive = window.canViewSensitiveOrderFields(window.currentViewOrder);
    const updatedData = {
        project_id: pid,
        order_id: window.currentViewOrder.id,
        region: window.isOrderFieldEnabled('region') ? window.getDetailRegionValue() : (currentOrder.region || ''),
        category: window.isOrderFieldEnabled('category') ? document.getElementById('edit-dt-category').value.trim() : (currentOrder.category || ''),
        main_business: window.isOrderFieldEnabled('main_business') ? document.getElementById('edit-dt-business').value.trim() : (currentOrder.main_business || ''),
        profile: window.isOrderFieldEnabled('profile') ? document.getElementById('edit-dt-profile').value.trim() : (currentOrder.profile || ''),
        is_agent: isAgent,
        agent_name: (isAgent && window.isOrderFieldEnabled('agent_name'))
            ? document.getElementById('edit-dt-agent-name').value.trim()
            : (isAgent ? (currentOrder.agent_name || '') : '')
    };
    if (canEditSensitive) {
        updatedData.contact_person = window.isOrderFieldEnabled('contact_person') ? document.getElementById('edit-dt-contact').value.trim() : (currentOrder.contact_person || '');
        updatedData.phone = window.isOrderFieldEnabled('phone') ? document.getElementById('edit-dt-phone').value.trim() : (currentOrder.phone || '');
    }
    if (window.isOrderFieldEnabled('company_name')) {
        updatedData.company_name = document.getElementById('edit-dt-company').value.trim();
    }
    if (window.isSuperAdmin()) {
        if (window.isOrderFieldEnabled('credit_code')) {
            updatedData.credit_code = document.getElementById('edit-dt-code').value.trim();
            updatedData.no_code_checked = document.getElementById('edit-dt-no-code').checked;
        }
        updatedData.sales_name = document.getElementById('edit-dt-sales')?.value?.trim() || '';
    }
    if (canEditSensitive && window.isOrderFieldEnabled('contact_person') && window.isOrderFieldRequired('contact_person') && !updatedData.contact_person) return window.showToast("请填写联系人！", 'error');
    if (canEditSensitive && window.isOrderFieldEnabled('phone') && window.isOrderFieldRequired('phone') && !updatedData.phone) return window.showToast("请填写联系电话！", 'error');
    if (window.isOrderFieldEnabled('region') && window.isOrderFieldRequired('region') && !updatedData.region) return window.showToast("请按录单规则完整选择所在地区！", 'error');
    if (window.isOrderFieldEnabled('profile') && updatedData.profile.length > 300) return window.showToast("企业简介或产品亮点不能超过 300 字", 'error');
    if (isAgent && window.isOrderFieldEnabled('agent_name') && window.isOrderFieldRequired('agent_name') && !updatedData.agent_name) return window.showToast("请填写代理商名称！", 'error');
    if (window.isOrderFieldEnabled('company_name') && window.isOrderFieldRequired('company_name') && !updatedData.company_name) return window.showToast("参展企业全称不能为空！", 'error');
    if (window.isSuperAdmin() && window.isOrderFieldEnabled('credit_code') && window.isOrderFieldRequired('credit_code') && !updatedData.no_code_checked && !updatedData.credit_code) return window.showToast("请填写统一社会信用代码！", 'error');
    if (window.isSuperAdmin() && !updatedData.sales_name) return window.showToast("请选择订单归属业务员！", 'error');
    const boothChangeDraft = window.getDetailBoothChangeDraft?.(currentOrder) || { changed: false, targetBoothIds: [] };
    if (boothChangeDraft.error) return window.showToast(boothChangeDraft.error, 'error');
    window.toggleBtnLoading('btn-save-detail', true);
    try {
        const res = await window.apiFetch('/api/update-customer-info', { method: 'POST', body: JSON.stringify(updatedData) });
        await window.ensureApiSuccess(res, '修改失败，请重试');
        if (boothChangeDraft.changed) {
            const swapRes = await window.apiFetch('/api/change-order-booth', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: pid,
                    order_id: window.currentViewOrder.id,
                    target_booth_ids: boothChangeDraft.targetBoothIds,
                    preserve_finance: 1,
                    swap_reason: ''
                })
            });
            await window.ensureApiSuccess(swapRes, '资料已更新，但展位变更失败');
        }
        window.showToast(boothChangeDraft.changed ? "资料与展位更新成功！" : "资料更新成功！");
        Object.assign(window.currentViewOrder, updatedData);
        window.currentViewOrder.is_agent = updatedData.is_agent ? 1 : 0;
        if (window.isSuperAdmin()) {
            window.currentViewOrder.no_code_checked = updatedData.no_code_checked ? 1 : 0;
            window.currentViewOrder.sales_name = updatedData.sales_name;
        }
        if (String(window.currentViewOrder.status || '') === '待确认') {
            await window.loadPendingOrderList?.();
            window.showOrderDetail(window.currentViewOrder);
        } else {
            await window.loadOrderList();
            const refreshed = (window.allOrders || []).find((item) => String(item.id) === String(window.currentViewOrder.id));
            window.showOrderDetail(refreshed || window.currentViewOrder);
        }
    } catch (e) { window.showToast(e.message, 'error'); } finally { window.toggleBtnLoading('btn-save-detail', false); }
}

window.openFinanceDirect = async function(order, tab) {
    if (!window.canManageOrder(order)) return window.showToast('权限不足：不能办理他人订单财务', 'error');
    try {
        const pid = document.getElementById('global-project-select').value;
        const res = await window.apiFetch(`/api/accounts?projectId=${pid}`);
        const data = await res.json();
        window.projectAccounts = Array.isArray(data) ? data : [];
        
        const sel = document.getElementById('pay-account-select'); 
        sel.innerHTML = '<option value="">-- 请选择收款方式 --</option>';
        
        if (window.projectAccounts.length > 0) {
            const group = document.createElement('optgroup'); 
            group.label = "系统配置对公账户";
            window.projectAccounts.forEach(a => { 
                const option = document.createElement('option');
                option.value = `${a.account_name} - ${a.bank_name || ''}`;
                option.textContent = `${a.account_name} - ${a.bank_name || ''} (账号: ${a.account_no || '未配置'})`;
                group.appendChild(option);
            });
            sel.appendChild(group); 
        }
        
        const otherGroup = document.createElement('optgroup');
        otherGroup.label = "📱 其他常规方式";
        otherGroup.innerHTML = `<option value="微信">微信</option><option value="支付宝">支付宝</option><option value="现金">现金</option>`;
        sel.appendChild(otherGroup);
        
        window.openFinanceModal(order, tab);
    } catch (e) {
        window.showToast("拉取自定义账户失败，已启用基础收款模式", "info");
        window.openFinanceModal(order, tab);
    }
}

window.openFinanceModal = async function(order, forcedTab = null) {
    window.currentModalOrderId = order.id; 
    window.currentFinanceOrder = order;
    const isPendingOrder = String(order.status || '') === '待确认';
    const targetTab = isPendingOrder ? 'pay' : (forcedTab || window.lastFmTab || 'pay');
    
    document.getElementById('fm-order-title').innerText = `当前客户：${order.company_name} (展位: ${window.getOrderBoothDisplay(order)})`;
    document.getElementById('fm-total').innerText = window.formatCurrency(order.total_amount); 
    document.getElementById('fm-paid').innerText = window.formatCurrency(order.paid_amount); 
    document.getElementById('fm-unpaid').innerText = window.formatCurrency(Number(order.total_amount || 0) - Number(order.paid_amount || 0));
    document.getElementById('fm-order-id').value = order.id; 
    
    document.getElementById('pay-amount').value = ''; document.getElementById('pay-time').value = new Date().toISOString().split('T')[0]; document.getElementById('pay-payer').value = order.company_name; document.getElementById('pay-remark').value = ''; document.getElementById('pay-account-select').value = '';
    document.getElementById('adj-actual-fee').value = order.total_booth_fee; document.getElementById('adj-reason').value = '';
    
    try { window.fmDynamicFees = JSON.parse(order.fees_json || '[]'); } catch(e) { window.fmDynamicFees = []; } 
    window.renderFmDynamicFees();
    window.resetFmSwapDraft(order);
    
    document.getElementById('exp-total-paid-display').innerText = window.formatCurrency(order.paid_amount, '¥ '); document.getElementById('exp-amount').value = ''; document.getElementById('exp-payee').value = ''; document.getElementById('exp-bank').value = ''; document.getElementById('exp-account').value = ''; document.getElementById('exp-reason').value = '';
    const expTypeSelect = document.getElementById('exp-type');
    if (expTypeSelect) expTypeSelect.value = '';
    const expAgentSearch = document.getElementById('exp-agent-search');
    if (expAgentSearch) expAgentSearch.value = '';
    window.onExpenseTypeChange?.();
    window.ensureAgentsLoaded?.();
    window.populateExpensePayeeSuggestions(order, []);
    window.renderOverpaymentAlert(order, {
        rootId: 'fm-overpayment-alert',
        summaryId: 'fm-overpayment-summary',
        metaId: 'fm-overpayment-meta',
        actionsId: 'fm-overpayment-actions',
        context: 'finance'
    });
    ['pay-amount', 'pay-time', 'pay-payer', 'pay-account-select', 'pay-remark'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = isPendingOrder;
        el.classList.toggle('bg-slate-100', isPendingOrder);
        el.classList.toggle('cursor-not-allowed', isPendingOrder);
    });
    const submitPayBtn = document.getElementById('btn-submit-payment');
    if (submitPayBtn) {
        submitPayBtn.disabled = isPendingOrder;
        submitPayBtn.classList.toggle('opacity-50', isPendingOrder);
        submitPayBtn.classList.toggle('cursor-not-allowed', isPendingOrder);
        submitPayBtn.innerText = isPendingOrder ? '待确认订单不可新增收款' : '确认入账并保存';
    }
    
    window.switchFmTab(targetTab);
    await window.loadPaymentHistory(order.id, { reset: true }); 
    await window.loadExpenseHistory(order.id); 
    
    document.getElementById('finance-modal').classList.remove('hidden');
}

window.switchFmTab = function(tab) {
    window.lastFmTab = tab; 
    const mainTitle = document.getElementById('fm-main-title');
    const titles = { 'pay': '收款流水管理', 'adj': '变更费用信息', 'swap': '换展位办理', 'exp': '代付与返佣申请' };
    mainTitle.innerText = titles[tab] || titles['pay'];
    document.getElementById('fm-tab-pay').classList.add('hidden'); document.getElementById('fm-tab-adj').classList.add('hidden'); document.getElementById('fm-tab-swap').classList.add('hidden'); document.getElementById('fm-tab-exp').classList.add('hidden');
    document.getElementById(`fm-tab-${tab}`).classList.remove('hidden');
    if (tab === 'swap') window.applyFmSwapDirectShellVisibility?.(window.currentFinanceOrder);
}

window.refreshFinanceModalStats = function() {
    const updatedOrder = (window.allOrders || []).find(o => String(o.id) === String(window.currentModalOrderId))
        || (window.pendingOrders || []).find(o => String(o.id) === String(window.currentModalOrderId));
    if (updatedOrder) {
        window.currentFinanceOrder = updatedOrder;
        document.getElementById('fm-order-title').innerText = `当前客户：${updatedOrder.company_name} (展位: ${window.getOrderBoothDisplay(updatedOrder)})`;
        document.getElementById('fm-total').innerText = window.formatCurrency(updatedOrder.total_amount);
        document.getElementById('fm-paid').innerText = window.formatCurrency(updatedOrder.paid_amount);
        document.getElementById('fm-unpaid').innerText = window.formatCurrency(Number(updatedOrder.total_amount || 0) - Number(updatedOrder.paid_amount || 0));
        document.getElementById('exp-total-paid-display').innerText = window.formatCurrency(updatedOrder.paid_amount);
        window.resetFmSwapDraft(updatedOrder);
        window.renderOverpaymentAlert(updatedOrder, {
            rootId: 'fm-overpayment-alert',
            summaryId: 'fm-overpayment-summary',
            metaId: 'fm-overpayment-meta',
            actionsId: 'fm-overpayment-actions',
            context: 'finance'
        });
    }
}

window.ensureSwapInventoryLoaded = async function(projectId) {
    const normalizedProjectId = String(projectId || '');
    if (!normalizedProjectId) return;
    if (window.swapInventoryProjectId === normalizedProjectId && Array.isArray(window.allBooths) && window.allBooths.length > 0) return;
    const [priceData, boothData] = await Promise.all([
        window.readProjectCachedResource('prices', normalizedProjectId, async () => (
            await window.readApiJson(
                await window.apiFetch(`/api/prices?projectId=${encodeURIComponent(normalizedProjectId)}`),
                '加载价格策略失败',
                {}
            )
        ), { ttlMs: 60 * 1000 }),
        window.readProjectCachedResource('booths', normalizedProjectId, async () => {
            const booths = await window.readApiJson(
                await window.apiFetch(`/api/booths?projectId=${encodeURIComponent(normalizedProjectId)}`),
                '加载展位失败',
                []
            );
            return (Array.isArray(booths) ? booths : []).map((booth) => ({
                ...booth,
                hall: window.deriveBoothHallLabel(booth.id, booth.hall)
            }));
        }, { ttlMs: 60 * 1000 })
    ]);
    globalPrices = {
        '标摊': priceData['标摊'] || 0,
        '豪标': priceData['豪标'] || 0,
        '光地': priceData['光地'] || 0
    };
    allBooths = Array.isArray(boothData) ? boothData : [];
    window.swapInventoryProjectId = normalizedProjectId;
}

window.normalizeSwapFeeDraft = function(rawFees) {
    let parsed = [];
    try {
        parsed = Array.isArray(rawFees) ? rawFees : JSON.parse(rawFees || '[]');
    } catch (e) {
        parsed = [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map((item) => ({
            name: String(item?.name || '').trim(),
            amount: Number(item?.amount || 0)
        }))
        .filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0);
}

window.fmSwapAddFeeRow = function() {
    window.fmSwapFees.push({ name: '', amount: '' });
    window.fmSwapRenderFees();
}

window.fmSwapRemoveFeeRow = function(idx) {
    window.fmSwapFees.splice(idx, 1);
    window.fmSwapRenderFees();
}

window.fmSwapUpdateFeeData = function(idx, field, value) {
    if (!window.fmSwapFees[idx]) return;
    window.fmSwapFees[idx][field] = value;
    window.calculateSwapDraftTotal();
}

window.fmSwapRenderFees = function() {
    const container = document.getElementById('fm-swap-fees-container');
    if (!container) return;
    const feeRows = window.fmSwapFees || [];
    if (feeRows.length === 0) {
        container.innerHTML = '<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">当前没有其他收费项，可按需新增</div>';
        window.calculateSwapDraftTotal();
        return;
    }
    container.innerHTML = feeRows.map((fee, idx) => {
        const safeName = window.escapeAttr ? window.escapeAttr(fee.name || '') : String(fee.name || '');
        const amountValue = fee.amount === '' ? '' : Number(fee.amount || 0);
        return `
            <div class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                <input type="text" value="${safeName}" placeholder="收费名称 (如：搭建费)" oninput="window.fmSwapUpdateFeeData(${idx}, 'name', this.value)" class="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <span class="text-sm font-bold text-slate-400">¥</span>
                <input type="number" value="${amountValue}" placeholder="金额" oninput="window.fmSwapUpdateFeeData(${idx}, 'amount', this.value)" class="w-28 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 tabular-data focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <button type="button" onclick="window.fmSwapRemoveFeeRow(${idx})" class="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100">${window.renderIcon('close', 'h-3.5 w-3.5', 2.1)}<span>删除</span></button>
            </div>
        `;
    }).join('');
    window.calculateSwapDraftTotal();
}

window.calculateSwapDraftTotal = function() {
    const actualFee = parseFloat(document.getElementById('fm-swap-actual-fee')?.value || 0) || 0;
    const otherTotal = (window.fmSwapFees || []).reduce((sum, fee) => sum + (parseFloat(fee.amount || 0) || 0), 0);
    const nextTotal = actualFee + otherTotal;
    const boothFeePreview = document.getElementById('fm-swap-booth-fee-preview');
    const otherFeePreview = document.getElementById('fm-swap-other-fee-preview');
    const totalPreview = document.getElementById('fm-swap-total-preview');
    const nextTotalEl = document.getElementById('fm-swap-next-total');
    if (boothFeePreview) boothFeePreview.innerText = window.formatCurrency(actualFee);
    if (otherFeePreview) otherFeePreview.innerText = window.formatCurrency(otherTotal);
    if (totalPreview) totalPreview.innerText = window.formatCurrency(nextTotal);
    if (nextTotalEl) nextTotalEl.innerText = (window.fmSwapCandidateBooths || []).length ? window.formatCurrency(nextTotal) : '-';
}

window.resetFmSwapDraft = function(order) {
    const currentOrder = order || window.currentFinanceOrder;
    if (!currentOrder) return;
    window.fmSwapCandidateBooths = [];
    window.fmSwapFees = window.normalizeSwapFeeDraft(currentOrder.fees_json);
    document.getElementById('fm-swap-current-booth').innerText = window.getOrderBoothDisplay(currentOrder);
    document.getElementById('fm-swap-current-area').innerText = `${Number(currentOrder.area || 0).toLocaleString()}㎡`;
    document.getElementById('fm-swap-current-total').innerText = window.formatCurrency(currentOrder.total_amount || 0);
    document.getElementById('fm-swap-current-paid').innerText = window.formatCurrency(currentOrder.paid_amount || 0);
    document.getElementById('fm-swap-next-booth').innerText = '待选择';
    document.getElementById('fm-swap-next-area').innerText = '-';
    document.getElementById('fm-swap-next-total').innerText = '-';
    document.getElementById('fm-swap-actual-fee').value = Number(currentOrder.total_booth_fee || 0);
    document.getElementById('fm-swap-price-reason').value = '';
    document.getElementById('fm-swap-reason').value = '';
    document.getElementById('fm-swap-target-name').innerText = '-';
    document.getElementById('fm-swap-target-meta').innerText = '-';
    document.getElementById('fm-swap-target-standard').innerText = '¥0';
    document.getElementById('fm-swap-target-card').classList.add('hidden');
    const preserveCheckbox = document.getElementById('fm-swap-preserve-finance');
    const manualInput = document.getElementById('fm-swap-manual-booths');
    if (preserveCheckbox) preserveCheckbox.checked = false;
    if (manualInput) manualInput.value = '';
    window.handleSwapPreserveFinanceToggle?.(false);
    window.applyFmSwapDirectShellVisibility?.(currentOrder);
    window.fmSwapRenderFees();
}

window.loadFinanceBoothCandidatesByIds = async function(projectId, ids = []) {
    const normalizedIds = (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim().toUpperCase())
        .filter(Boolean);
    if (!projectId || !normalizedIds.length) return [];
    const params = new URLSearchParams({ projectId: String(projectId) });
    normalizedIds.forEach((id) => params.append('boothIds', id));
    const res = await window.apiFetch(`/api/booth-lookup?${params.toString()}`);
    let rows = null;
    try { rows = await window.readApiJson(res, '加载展位失败', null); } catch { rows = null; }
    if (!Array.isArray(rows) || rows.length === 0) {
        const fallback = await window.apiFetch(`/api/booths?projectId=${projectId}`);
        const all = await window.readApiJson(fallback, '加载展位失败', []);
        rows = (all || []).filter((b) => normalizedIds.includes(String(b.id || '').toUpperCase()));
    }
    const map = new Map((rows || []).map((row) => [String(row.id || '').toUpperCase(), row]));
    const missing = normalizedIds.filter((id) => !map.has(id));
    if (missing.length) throw new Error(`未找到展位：${missing.join('、')}`);
    return normalizedIds.map((id) => {
        const row = map.get(id);
        const type = String(row.type || '');
        const area = Number(row.area || 0);
        const basePrice = Number(row.base_price || row.unit_price || 0);
        const priceUnit = String(row.price_unit || (type === '光地' ? '平米' : '个'));
        const standard = priceUnit === '平米' ? area * basePrice : basePrice;
        return {
            id: String(row.id),
            hall: String(row.hall || ''),
            type,
            area,
            price_unit: priceUnit,
            unit_price: basePrice,
            standard_fee: standard,
            booth_map_id: Number(row.booth_map_id || 0)
        };
    });
}

window.resolveBoothChangeDisplayNamePayload = function(order = {}, targetBooths = []) {
    const normalizedBooths = Array.isArray(targetBooths) ? targetBooths : [];
    const hasStandard = normalizedBooths.some((item) => ['标摊', '豪标'].includes(String(item?.type || '').trim()));
    const hasGround = normalizedBooths.some((item) => String(item?.type || '').trim() === '光地');
    const existingDisplayName = String(order.booth_display_name || '').trim();
    const countUnits = typeof window.countDisplayNameUnits === 'function'
        ? window.countDisplayNameUnits
        : (value) => Array.from(String(value || '')).reduce((total, char) => total + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
    if (hasStandard) {
        if (existingDisplayName && countUnits(existingDisplayName) <= 8) {
            return {
                standard_booth_display_name: existingDisplayName,
                ground_booth_display_name: countUnits(existingDisplayName) <= 24 ? existingDisplayName : ''
            };
        }
        const input = window.prompt(
            '目标展位包含标摊/豪标，原展位简称为空或超过标摊限制，无法继承。\n请填写新的展位简称（最多 4 个汉字或 8 个英文字符）：',
            countUnits(existingDisplayName) <= 8 ? existingDisplayName : ''
        );
        if (input === null) return null;
        const nextName = String(input || '').trim();
        if (!nextName) {
            window.showToast('请填写新的展位简称后再换展位', 'error');
            return null;
        }
        if (countUnits(nextName) > 8) {
            window.showToast('标准展位简称最多 4 个汉字或 8 个英文字符', 'error');
            return null;
        }
        return {
            standard_booth_display_name: nextName,
            ground_booth_display_name: countUnits(nextName) <= 24 ? nextName : ''
        };
    }
    if (hasGround) {
        if (existingDisplayName && countUnits(existingDisplayName) <= 24) {
            return {
                ground_booth_display_name: existingDisplayName,
                standard_booth_display_name: countUnits(existingDisplayName) <= 8 ? existingDisplayName : ''
            };
        }
        const companyName = String(order.company_name || '').trim();
        const defaultName = companyName && countUnits(companyName) <= 24 ? companyName : '';
        const input = window.prompt(
            '目标展位为光地，原展位显示名称为空或超过光地限制，无法继承。\n请填写新的光地显示名称（最多 12 个汉字或 24 个英文字符）：',
            defaultName
        );
        if (input === null) return null;
        const nextName = String(input || '').trim();
        if (!nextName) {
            window.showToast('请填写新的光地显示名称后再换展位', 'error');
            return null;
        }
        if (countUnits(nextName) > 24) {
            window.showToast('光地显示名称不能超过 12 个汉字或 24 个英文字符', 'error');
            return null;
        }
        return {
            ground_booth_display_name: nextName,
            standard_booth_display_name: countUnits(nextName) <= 8 ? nextName : ''
        };
    }
    return {};
}

window.applySwapBoothCandidates = function(candidates) {
    const normalizedCandidates = (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
        id: String(candidate?.id || ''),
        hall: String(candidate?.hall || ''),
        type: String(candidate?.type || ''),
        area: Number(candidate?.area || 0),
        price_unit: String(candidate?.price_unit || (String(candidate?.type || '') === '光地' ? '平米' : '个')),
        unit_price: Number(candidate?.unit_price || 0),
        standard_fee: Number(candidate?.standard_fee || 0),
        booth_map_id: Number(candidate?.booth_map_id || 0)
    })).filter((candidate) => candidate.id);
    if (!normalizedCandidates.length) {
        window.fmSwapCandidateBooths = [];
        document.getElementById('fm-swap-target-card').classList.add('hidden');
        document.getElementById('fm-swap-next-booth').innerText = '待选择';
        document.getElementById('fm-swap-next-area').innerText = '-';
        document.getElementById('fm-swap-next-total').innerText = '-';
        return;
    }
    window.fmSwapCandidateBooths = normalizedCandidates;
    const boothLabels = normalizedCandidates.map((candidate) => `${candidate.hall} - ${candidate.id}`);
    const totalArea = normalizedCandidates.reduce((sum, candidate) => sum + Number(candidate.area || 0), 0);
    const totalStandardFee = normalizedCandidates.reduce((sum, candidate) => sum + Number(candidate.standard_fee || 0), 0);
    document.getElementById('fm-swap-target-name').innerText = boothLabels.slice(0, 3).join(' / ') + (boothLabels.length > 3 ? ` 等${boothLabels.length}个` : '');
    document.getElementById('fm-swap-target-meta').innerText = `共 ${normalizedCandidates.length} 个展位 | 总面积 ${totalArea.toLocaleString()}㎡`;
    document.getElementById('fm-swap-target-standard').innerText = window.formatCurrency(totalStandardFee);
    document.getElementById('fm-swap-target-card').classList.remove('hidden');
    document.getElementById('fm-swap-next-booth').innerText = boothLabels.join(' / ');
    document.getElementById('fm-swap-next-area').innerText = `${totalArea.toLocaleString()}㎡`;
    document.getElementById('fm-swap-actual-fee').value = totalStandardFee;
    document.getElementById('fm-swap-price-reason').value = '';
    window.calculateSwapDraftTotal();
}

window.openSwapBoothMapPicker = async function() {
    const currentOrder = window.currentFinanceOrder;
    const projectId = Number(document.getElementById('global-project-select')?.value || 0);
    if (!currentOrder || !projectId) return window.showToast('未找到当前订单，无法换展位', 'error');
    if (typeof window.ensureOrderBoothMapPickerInitialized !== 'function') {
        return window.showToast('展位图选择器尚未就绪，请刷新页面后重试', 'error');
    }
    window.ensureOrderBoothMapPickerInitialized();
    const state = window.getOrderBoothMapPickerState();
    state.mode = 'swap';
    state.tempSelectedBooths = Array.isArray(window.fmSwapCandidateBooths)
        ? window.fmSwapCandidateBooths.map((item) => JSON.parse(JSON.stringify(item)))
        : [];
    state.onConfirm = (selection) => {
        const candidates = Array.isArray(selection) ? selection : [];
        if (!candidates.length) {
            window.showToast('请先从展位图中选择至少一个目标展位', 'error');
            return false;
        }
        window.applySwapBoothCandidates(candidates);
        window.showToast(`已选中 ${candidates.length} 个目标展位`);
        return true;
    };
    try {
        await window.ensureSwapInventoryLoaded(projectId);
        const preferredMapId = Number(
            window.fmSwapCandidateBooths?.[0]?.booth_map_id
            || window.findItemByBoothCode(window.allBooths, window.fmSwapCandidateBooths?.[0]?.id, 'id')?.booth_map_id
            || window.findItemByBoothCode(window.allBooths, currentOrder.booth_id, 'id')?.booth_map_id
            || 0
        );
        await window.loadOrderBoothMapPickerMaps(preferredMapId);
        const confirmBtn = document.getElementById('btn-confirm-order-booth-map');
        if (confirmBtn) confirmBtn.innerText = '确认目标展位';
        document.getElementById('order-booth-map-modal')?.classList.remove('hidden');
    } catch (error) {
        window.showToast(error.message, 'error');
    }
}

window.submitBoothSwap = async function() {
    const projectId = document.getElementById('global-project-select').value;
    const currentOrder = window.currentFinanceOrder;
    const candidates = Array.isArray(window.fmSwapCandidateBooths) ? window.fmSwapCandidateBooths : [];
    if (!currentOrder || !projectId) return window.showToast('未找到当前订单，无法换展位', 'error');
    if (!candidates.length) return window.showToast('请先从展位图中选中目标展位', 'error');
    const preserveFinance = !!document.getElementById('fm-swap-preserve-finance')?.checked;
    if (preserveFinance && !window.isSuperAdmin?.()) return window.showToast('仅超级管理员可保留原订单应收结构', 'error');
    const actualFee = parseFloat(document.getElementById('fm-swap-actual-fee').value || 0);
    const priceReason = document.getElementById('fm-swap-price-reason').value.trim();
    const swapReason = document.getElementById('fm-swap-reason').value.trim();
    if (!preserveFinance) {
        if (!Number.isFinite(actualFee) || actualFee < 0) return window.showToast('请输入正确的新展位成交展位费', 'error');
        const standardTotal = candidates.reduce((sum, candidate) => sum + Number(candidate.standard_fee || 0), 0);
        if (actualFee < standardTotal && !priceReason) return window.showToast('新展位成交价低于系统原价时，请填写价格说明', 'error');
    }
    if (!swapReason && !window.isSuperAdmin?.()) return window.showToast('请填写换展位原因', 'error');
    const feeRows = [];
    for (const fee of (window.fmSwapFees || [])) {
        const name = String(fee?.name || '').trim();
        const rawAmount = String(fee?.amount ?? '').trim();
        if (!name && !rawAmount) continue;
        const amount = Number(rawAmount || 0);
        if (!name) return window.showToast('其他收费明细存在未填写名称的行', 'error');
        if (!Number.isFinite(amount) || amount < 0) return window.showToast(`其他收费 [${name}] 的金额无效`, 'error');
        if (amount <= 0) continue;
        feeRows.push({ name, amount });
    }
    const displayNamePayload = window.resolveBoothChangeDisplayNamePayload?.(currentOrder, candidates);
    if (!displayNamePayload) return;
    window.toggleBtnLoading('btn-submit-swap', true, '确认换展位并更新订单');
    try {
        const body = {
            project_id: projectId,
            order_id: currentOrder.id,
            target_booth_ids: candidates.map((candidate) => candidate.id),
            swap_reason: swapReason
        };
        Object.assign(body, displayNamePayload);
        if (preserveFinance) {
            body.preserve_finance = 1;
        } else {
            body.actual_fee = actualFee;
            body.price_reason = priceReason;
            body.fees_json = feeRows;
        }
        const res = await window.apiFetch('/api/change-order-booth', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        await window.ensureApiSuccess(res, '换展位失败，请稍后再试');
        window.showToast('换展位成功，订单与统计已同步更新');
        window.markOrderDashboardDirty();
        await window.loadOrderList();
        await window.loadPaymentHistory(window.currentModalOrderId);
        await window.loadExpenseHistory(window.currentModalOrderId);
        window.refreshFinanceModalStats();
        window.switchFmTab('swap');
        window.refreshVisibleOrderContexts();
    } catch (e) {
        window.showToast(e.message, 'error');
    } finally {
        window.toggleBtnLoading('btn-submit-swap', false, '确认换展位并更新订单');
    }
}

window.openOverpaymentModalById = function(orderId, action = 'fx_diff', returnContext = 'detail') {
    const order = (window.allOrders || []).find((item) => String(item.id) === String(orderId));
    if (!order) return window.showToast('找不到对应订单，无法处理超收', 'error');
    if (!window.canHandleOverpayment(order)) return window.showToast('仅超级管理员或订单所属业务员可处理超收', 'error');
    window.currentOverpaymentOrderId = order.id;
    window.currentOverpaymentProjectId = Number(order.project_id || document.getElementById('global-project-select').value || 0);
    window.currentOverpaymentReturnContext = returnContext;
    document.getElementById('overpayment-action').value = action;
    document.getElementById('overpayment-note').value = order.overpayment_note || '';
    document.getElementById('overpayment-order-title').innerText = `${order.company_name} (${window.getOrderBoothDisplay(order)})`;
    const overpaidAmount = window.getOverpaidAmount(order);
    document.getElementById('overpayment-order-summary').innerText = `当前应收 ${window.formatCurrency(order.total_amount || 0)}，已收 ${window.formatCurrency(order.paid_amount || 0)}，超收 ${window.formatCurrency(overpaidAmount)}。若选择下方“确认汇率差”或“暂挂并填写说明”，系统会自动把本次差额补录为一条其他应收明细并自动平账。`;
    document.getElementById('overpayment-modal').classList.remove('hidden');
}

window.handleOverpaymentGoAdjust = function() {
    const orderId = window.currentOverpaymentOrderId;
    if (!orderId) return;
    window.closeModal('overpayment-modal');
    window.openFinanceDirectById(String(orderId), 'adj');
}

window.submitOverpaymentHandling = async function() {
    const orderId = Number(window.currentOverpaymentOrderId || 0);
    const projectId = Number(window.currentOverpaymentProjectId || 0);
    const action = document.getElementById('overpayment-action').value;
    const note = document.getElementById('overpayment-note').value.trim();
    if (!orderId || !projectId) return window.showToast('订单信息缺失，无法保存处理结果', 'error');
    if (!note) return window.showToast(action === 'fx_diff' ? '请填写汇率差说明' : '请填写暂挂说明', 'error');
    window.toggleBtnLoading('btn-submit-overpayment', true);
    try {
        const res = await window.apiFetch('/api/resolve-overpayment', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, project_id: projectId, action, note })
        });
        await window.ensureApiSuccess(res, '保存处理结果失败');
        window.showToast('超收处理结果已保存，并已自动补录其他应收明细');
        window.closeModal('overpayment-modal');
        window.markOrderDashboardDirty();
        await window.loadOrderList();
        window.refreshVisibleOrderContexts();
    } catch (e) {
        window.showToast(e.message, 'error');
    } finally {
        window.toggleBtnLoading('btn-submit-overpayment', false);
    }
}

window.findPaymentAccountOption = function(bankName = '') {
    const normalizedBankName = String(bankName || '').trim();
    if (!normalizedBankName) return null;
    return (window.projectAccounts || []).find((account) => {
        const optionValue = `${account.account_name || ''} - ${account.bank_name || ''}`.trim();
        return optionValue === normalizedBankName
            || String(account.account_name || '').trim() === normalizedBankName
            || String(account.bank_name || '').trim() === normalizedBankName;
    }) || null;
}

window.renderPaymentHistoryFieldLine = function(label, value) {
    const normalizedValue = String(value || '').trim() || '未提供';
    return `<div class="flex flex-wrap gap-1 leading-5"><span class="shrink-0 font-bold text-slate-500">${window.escapeHtml(label)}:</span><span class="min-w-0 break-words text-slate-700">${window.escapeHtml(normalizedValue)}</span></div>`;
}

window.loadPaymentHistory = async function(orderId, options = {}) {
    const listDiv = document.getElementById('fm-pay-list'); listDiv.innerHTML = '<span class="text-gray-400">加载中...</span>';
    try {
        const state = window.paymentHistoryState || {
            orderId: '',
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 1,
            hasMore: false
        };
        if (options.reset === true || String(state.orderId) !== String(orderId)) {
            state.orderId = String(orderId || '');
            state.page = 1;
        }
        const requestedPage = Number(options.page || state.page || 1);
        const response = await window.ensureApiSuccess(
            await window.apiFetch(`/api/payments?orderId=${encodeURIComponent(orderId)}&page=${encodeURIComponent(requestedPage)}&pageSize=${encodeURIComponent(state.pageSize || 20)}`),
            '获取历史记录失败'
        );
        const payload = await response.json();
        const pays = Array.isArray(payload.items) ? payload.items : [];
        state.orderId = String(orderId || '');
        state.page = Number(payload.page || requestedPage || 1);
        state.pageSize = Number(payload.pageSize || state.pageSize || 20);
        state.total = Number(payload.total || 0);
        state.totalPages = Math.max(1, Number(payload.totalPages || 1));
        state.hasMore = !!payload.hasMore;
        window.paymentHistoryState = state;

        if(pays.length === 0) {
            listDiv.innerHTML = '<p class="text-gray-400 italic">暂无收款记录</p>';
            return;
        }
        const listHtml = window.renderHtmlCollection(pays, (p) => {
            const safePayer = String(p.payer_name || '').replace(/'/g, "\\'");
            const safeBank = String(p.bank_name || '').replace(/'/g, "\\'");
            const safeRem = String(p.remarks || '').replace(/'/g, "\\'");
            const isErpSync = String(p.source || '').startsWith('ERP_SYNC');
            const isErpRefund = p.source === 'ERP_SYNC_REFUND' || Number(p.amount || 0) < 0;
            let raw = null;
            if (isErpSync) {
                try { raw = p.raw_payload ? JSON.parse(p.raw_payload) : null; } catch (e) { raw = null; }
            }
            const matchedAccount = window.findPaymentAccountOption(p.bank_name);
            const accountCompany = raw?.accountCompany || raw?.account_company || raw?.company || window.currentFinanceOrder?.company_name || '';
            const payerName = raw?.receivablesUnit || raw?.payerName || raw?.company || p.payer_name || '';
            const receiveBank = raw?.bank || raw?.bankName || raw?.bank_name || matchedAccount?.bank_name || p.bank_name || '';
            const receiveAccountName = raw?.corporateAccount || raw?.corporate_account || matchedAccount?.account_name || '';
            const receiveAccountNo = raw?.account || raw?.account_no || raw?.accountNo || matchedAccount?.account_no || '';
            const extraRemarkText = String(p.remarks || '').trim();
            const remarkHtml = extraRemarkText && (!isErpSync || (!extraRemarkText.startsWith('ERP同步导入：') && !extraRemarkText.startsWith('ERP退款同步导入：')))
                ? `<div class="leading-5 text-slate-500">备注: ${window.escapeHtml(extraRemarkText)}</div>`
                : '';
            const detailsHtml = `
                <div class="mt-2 space-y-1 text-xs">
                    ${window.renderPaymentHistoryFieldLine('入账企业', accountCompany)}
                    ${window.renderPaymentHistoryFieldLine('付款名', payerName)}
                    ${window.renderPaymentHistoryFieldLine('收至银行', receiveBank)}
                    ${window.renderPaymentHistoryFieldLine('收款账户', receiveAccountName)}
                    ${window.renderPaymentHistoryFieldLine('收款账号', receiveAccountNo)}
                    ${remarkHtml}
                </div>
            `;
            const actionHtml = isErpSync
                ? `<span class="badge-readonly">ERP 同步只读</span>`
                : `<div><button onclick="window.openEditPaymentModal('${p.id}', ${p.amount}, '${safePayer}', '${safeBank}', '${safeRem}', '${p.payment_time}')" class="btn-soft-primary px-3 py-1 text-xs mr-2">修改</button><button onclick="window.deletePayment('${p.id}')" class="btn-soft-danger px-3 py-1 text-xs">删除</button></div>`;
            const sourceBadge = isErpSync
                ? `<span class="ml-2 badge-readonly">${isErpRefund ? 'ERP退款' : 'ERP同步'}</span>`
                : '';
            const amountText = window.formatCurrency(Math.abs(Number(p.amount || 0)), '¥');
            const titleClass = isErpRefund ? 'text-rose-600' : 'text-green-600';
            const titleText = isErpRefund ? `退款 ${amountText}` : `到账 ${amountText}`;
            return `<div class="bg-white border rounded p-3 flex justify-between items-start gap-4 hover:bg-gray-50 transition"><div class="min-w-0 flex-1"><div class="font-bold ${titleClass} text-lg">${titleText}${sourceBadge}</div>${detailsHtml}</div><div class="text-right flex shrink-0 flex-col items-end gap-2"><div class="text-xs font-bold text-gray-700 tabular-data">${window.escapeHtml(p.payment_time)}</div>${actionHtml}</div></div>`;
        });
        const paginationHtml = state.total > state.pageSize
            ? `<div class="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
                    <span>第 ${state.page} / ${state.totalPages} 页，共 ${state.total} 条</span>
                    <div class="flex items-center gap-2">
                        <button onclick="window.changePaymentHistoryPage(${state.page - 1})" class="btn-secondary px-3 py-1 text-xs" ${state.page <= 1 ? 'disabled' : ''}>上一页</button>
                        <button onclick="window.changePaymentHistoryPage(${state.page + 1})" class="btn-secondary px-3 py-1 text-xs" ${state.page >= state.totalPages ? 'disabled' : ''}>下一页</button>
                    </div>
                </div>`
            : '';
        listDiv.innerHTML = `<div class="space-y-2">${listHtml}</div>${paginationHtml}`;
    } catch (e) { listDiv.innerHTML = `<p class="text-red-500">加载失败: ${e.message}</p>`; }
}

window.submitPayment = async function() {
    const pid = document.getElementById('global-project-select').value; const amt = parseFloat(document.getElementById('pay-amount').value); const time = document.getElementById('pay-time').value; const payer = document.getElementById('pay-payer').value.trim(); const bank = document.getElementById('pay-account-select').value; const orderId = document.getElementById('fm-order-id').value;
    if (String(window.currentFinanceOrder?.status || '') === '待确认') return window.showToast('待确认订单不可新增收款，请先重新选展位恢复订单', 'error');
    if(!amt || amt <= 0) return window.showToast("请输入正确的收款金额", 'error'); if(!time || !payer) return window.showToast("时间和打款户名为必填项！", 'error'); if(!bank) return window.showToast("请选择途径！", 'error');
    window.toggleBtnLoading('btn-submit-payment', true);
    try { 
        const res = await window.apiFetch('/api/add-payment', { method: 'POST', body: JSON.stringify({ project_id: pid, order_id: orderId, amount: amt, payment_time: time, payer_name: payer, bank_name: bank, remarks: document.getElementById('pay-remark').value }) }); 
        await window.ensureApiSuccess(res, '写入流水失败');
        window.showToast("收款入账成功！"); 
        window.markOrderDashboardDirty();
        await window.loadOrderList(); 
        await window.loadPaymentHistory(orderId);
        window.refreshFinanceModalStats();
        window.refreshVisibleOrderContexts();
        
        document.getElementById('pay-amount').value = '';
        document.getElementById('pay-remark').value = '';
    } catch (e) { window.showToast(e.message, 'error'); } finally { window.toggleBtnLoading('btn-submit-payment', false); }
}

window.openEditPaymentModal = function(id, amt, payer, bank, remark, time) { document.getElementById('ep-id').value = id; document.getElementById('ep-amount').value = amt; document.getElementById('ep-payer').value = payer; document.getElementById('ep-bank').value = bank; document.getElementById('ep-time').value = time; document.getElementById('ep-remark').value = remark; document.getElementById('edit-payment-modal').classList.remove('hidden'); }

window.submitEditPayment = async function() {
    const pid = document.getElementById('global-project-select').value; const data = { project_id: pid, order_id: window.currentModalOrderId, payment_id: document.getElementById('ep-id').value, amount: parseFloat(document.getElementById('ep-amount').value), payer_name: document.getElementById('ep-payer').value.trim(), bank_name: document.getElementById('ep-bank').value, payment_time: document.getElementById('ep-time').value, remarks: document.getElementById('ep-remark').value };
    if(!data.amount || !data.payer_name) return window.showToast("金额和户名必填", 'error');
    window.toggleBtnLoading('btn-save-payment', true); 
    try {
        const res = await window.apiFetch('/api/edit-payment', { method: 'POST', body: JSON.stringify(data) }); 
        await window.ensureApiSuccess(res, '流水修改失败');
        window.closeModal('edit-payment-modal'); 
        window.showToast("流水修改成功！"); 
        window.markOrderDashboardDirty();
        await window.loadOrderList();
        if (String(window.currentFinanceOrder?.status || '') === '待确认') await window.loadPendingOrderList?.();
        await window.loadPaymentHistory(window.currentModalOrderId); 
        window.refreshFinanceModalStats();
        window.refreshVisibleOrderContexts();
    } catch (e) { window.showToast(e.message, 'error'); } finally { window.toggleBtnLoading('btn-save-payment', false); }
}

window.deletePayment = async function(payId) { 
    if(!confirm("确定要删除这条收款记录吗？")) return; 
    try {
        const res = await window.apiFetch('/api/delete-payment', { method: 'POST', body: JSON.stringify({ project_id: document.getElementById('global-project-select').value, order_id: window.currentModalOrderId, payment_id: payId }) }); 
        await window.ensureApiSuccess(res, '删除失败');
        window.showToast("删除成功"); 
        window.markOrderDashboardDirty();
        await window.loadOrderList();
        if (String(window.currentFinanceOrder?.status || '') === '待确认') await window.loadPendingOrderList?.();
        await window.loadPaymentHistory(window.currentModalOrderId); 
        window.refreshFinanceModalStats();
        window.refreshVisibleOrderContexts();
    } catch (e) { window.showToast(e.message, 'error'); }
}

window.fmAddFeeRow = function() { window.fmDynamicFees.push({ name: '', amount: '' }); window.renderFmDynamicFees(); }
window.fmRemoveFeeRow = function(idx) { window.fmDynamicFees.splice(idx, 1); window.renderFmDynamicFees(); }
window.fmUpdateFeeData = function(idx, field, val) { window.fmDynamicFees[idx][field] = val; window.calculateFmAdjustTotal(); }
window.renderFmDynamicFees = function() {
    const container = document.getElementById('fm-dynamic-fees-container'); container.innerHTML = '';
    container.innerHTML = window.renderHtmlCollection(window.fmDynamicFees, (fee, idx) => `<div class="flex gap-2 items-center bg-white p-2 rounded border border-orange-100 shadow-sm"><input type="text" placeholder="名称" value="${window.escapeAttr(fee.name)}" oninput="window.fmUpdateFeeData(${idx}, 'name', this.value)" class="border p-1.5 rounded flex-1 text-sm bg-gray-50"><span class="text-gray-500 font-bold">¥</span><input type="number" placeholder="金额" value="${window.escapeAttr(fee.amount)}" oninput="window.fmUpdateFeeData(${idx}, 'amount', this.value)" class="border p-1.5 rounded w-24 text-sm bg-gray-50 font-bold text-gray-700"><button onclick="window.fmRemoveFeeRow(${idx})" class="text-red-500 hover:bg-red-100 font-bold px-2 py-1 rounded text-xs">删</button></div>`);
    window.calculateFmAdjustTotal();
}
window.calculateFmAdjustTotal = function() { const af = parseFloat(document.getElementById('adj-actual-fee').value) || 0; let ot = 0; window.fmDynamicFees.forEach(f => { ot += parseFloat(f.amount) || 0; }); document.getElementById('fm-adjust-calc-total').innerText = window.formatCurrency(af + ot, '¥ '); }

window.submitAdjustment = async function() {
    const pid = document.getElementById('global-project-select').value; const af = parseFloat(document.getElementById('adj-actual-fee').value); const r = document.getElementById('adj-reason').value.trim();
    if(isNaN(af)) return window.showToast("金额错误", 'error'); if(!r) return window.showToast("必须填写原因！", 'error');
    let ot = 0; let validFees = []; window.fmDynamicFees.forEach(f => { if(f.name && parseFloat(f.amount)) { ot += parseFloat(f.amount); validFees.push(f); } });
    window.toggleBtnLoading('btn-submit-adj', true); 
    try {
        const res = await window.apiFetch('/api/update-order-fees', { method: 'POST', body: JSON.stringify({ project_id: pid, order_id: window.currentModalOrderId, actual_fee: af, other_fee_total: ot, fees_json: JSON.stringify(validFees), reason: r }) }); 
        await window.ensureApiSuccess(res, '账单变更失败');
        window.showToast("账单变更成功！"); 
        window.markOrderDashboardDirty();
        await window.loadOrderList(); 
        window.refreshFinanceModalStats();
        window.refreshVisibleOrderContexts();
    } catch (e) { window.showToast(e.message, 'error'); } finally { window.toggleBtnLoading('btn-submit-adj', false); }
}

window.loadExpenseHistory = async function(orderId) {
    const listDiv = document.getElementById('fm-exp-list'); listDiv.innerHTML = '<span class="text-gray-400">加载中...</span>';
    try {
        const response = await window.ensureApiSuccess(
            await window.apiFetch(`/api/expenses?orderId=${orderId}`),
            '拉取数据失败'
        );
        const exps = await response.json();
        const currentOrder = (window.allOrders || []).find((item) => String(item.id) === String(orderId))
            || (window.pendingOrders || []).find((item) => String(item.id) === String(orderId));
        window.populateExpensePayeeSuggestions(currentOrder, exps);
        if(exps.length === 0) { listDiv.innerHTML = '<p class="text-gray-400 italic">暂无代付记录</p>'; return; }
        const canRevokeExpense = window.canManageOrder(currentOrder);
        listDiv.innerHTML = window.renderHtmlCollection(exps, (e) => {
            const safeE = JSON.stringify(e).replace(/'/g, "&#39;");
            const safePayeeName = window.escapeHtml(e.payee_name || '');
            const safeReason = window.escapeHtml(e.reason || '无说明');
            const safeCreatedAt = window.escapeHtml(e.created_at ? e.created_at.split(' ')[0] : '');
            const safeChannel = window.escapeHtml(e.payee_channel || '转账');
            const safeApplicant = window.escapeHtml(e.applicant || '');
            const safeExpType = window.escapeHtml(e.expense_type || '代付');
            return `<div class="bg-white border rounded p-3 mb-2 flex justify-between items-center hover:bg-gray-50"><div><div class="font-bold text-purple-700 tabular-data">金额: ¥${e.amount} <span class="text-sm font-normal text-gray-500 ml-2">(${safePayeeName})</span> <span class="badge-neutral text-xs ml-1">${safeExpType}</span></div><div class="text-xs text-gray-600 mt-1">事由: <span class="font-bold">${safeReason}</span></div><div class="text-xs text-gray-400 mt-1">${safeCreatedAt} | 渠道: ${safeChannel} | 申请人: ${safeApplicant}</div></div><div class="text-right"><button onclick='window.printExpense(${safeE})' class="bg-gray-800 text-white hover:bg-black text-xs font-bold px-3 py-1.5 rounded mr-2">打印单据</button>${canRevokeExpense ? `<button onclick='window.deleteExpense(${safeE})' class="text-red-500 hover:text-red-700 text-xs font-bold">撤销</button>` : `<span class="text-xs font-bold text-slate-400">仅本人或管理员可撤销</span>`}</div></div>`;
        });
    } catch (err) { listDiv.innerHTML = `<p class="text-red-500 font-bold">解析异常: ${err.message}</p>`; }
}

window.refreshAgentFinanceIfOpen = async function(agentName) {
    const modal = document.getElementById('agent-finance-modal');
    const currentAgent = window.currentAgentFinanceData?.agent;
    if (!modal || modal.classList.contains('hidden') || !currentAgent) return;
    const normalizeAgentName = window.normalizeAgentName || ((value) => String(value || '').trim().replace(/[\s\u3000]+/g, '').toLowerCase());
    if (agentName && normalizeAgentName(currentAgent.name) !== normalizeAgentName(agentName)) return;
    await window.openAgentFinance(currentAgent.id);
}

window.submitExpense = async function() {
    const pid = document.getElementById('global-project-select').value;
    const expenseType = document.getElementById('exp-type')?.value || '';
    const channel = document.getElementById('exp-channel').value;
    const payee = document.getElementById('exp-payee').value.trim();
    const amt = parseFloat(document.getElementById('exp-amount').value);
    const reason = document.getElementById('exp-reason').value.trim();
    if (!expenseType) return window.showToast("请选择代付类别！", 'error');
    if (expenseType === '返佣支出') {
        if (!payee) return window.showToast("返佣支出必须选择代理商！", 'error');
        const agentNames = window.getAgentOptions ? window.getAgentOptions() : [];
        if (!agentNames.includes(payee)) return window.showToast("收款人必须从代理商库中选择！", 'error');
    }
    if (expenseType === '其他代付' && (!payee || !reason)) return window.showToast("事由和收款方为必填！", 'error');
    if (expenseType === '退款' && !reason) return window.showToast("请填写退款事由！", 'error');
    if (!amt || amt <= 0) return window.showToast("金额必须大于0！", 'error');
    const finalReason = expenseType === '返佣支出' ? `返佣支出` : reason;
    const finalPayee = expenseType === '退款' ? (payee || '退款') : payee;
    window.toggleBtnLoading('btn-submit-exp', true);
    try {
        const data = { project_id: pid, order_id: window.currentModalOrderId, expense_type: expenseType, fee_item_name: '总收款抵扣', payee_name: finalPayee, payee_channel: channel, payee_bank: '', payee_account: '', amount: amt, applicant: window.currentUser.name, reason: finalReason };
        const res = await window.apiFetch('/api/add-expense', { method: 'POST', body: JSON.stringify(data) }); 
        await window.ensureApiSuccess(res, '写入失败');
        window.showToast("支出申请已记录！"); 
        document.getElementById('exp-reason').value = '';
        document.getElementById('exp-payee').value = '';
        document.getElementById('exp-amount').value = '';
        document.getElementById('exp-type').value = '';
        const agentSearch = document.getElementById('exp-agent-search');
        if (agentSearch) agentSearch.value = '';
        window.onExpenseTypeChange();
        window.loadExpenseHistory(window.currentModalOrderId);
        if (expenseType === '返佣支出') await window.refreshAgentFinanceIfOpen(finalPayee);
    } catch(err) { window.showToast(err.message, 'error'); } finally { window.toggleBtnLoading('btn-submit-exp', false); }
}

window.deleteExpense = async function(expense) {
    const expId = typeof expense === 'object' ? expense.id : expense;
    if(!confirm("确定撤销该笔申请吗？")) return; 
    try {
        const res = await window.apiFetch('/api/delete-expense', { method: 'POST', body: JSON.stringify({ expense_id: expId }) }); 
        const result = await window.readApiJson(res, '撤销失败', {});
        const deletedExpense = result.deleted_expense || (typeof expense === 'object' ? expense : null);
        window.showToast("撤销成功！"); 
        await window.loadExpenseHistory(window.currentModalOrderId);
        if (deletedExpense?.expense_type === '返佣支出') {
            await window.refreshAgentFinanceIfOpen(deletedExpense.payee_name || '');
        }
    } catch (e) { window.showToast(e.message, 'error'); }
}

window.printExpense = function(e) {
    const order = (window.allOrders || []).find(o => String(o.id) === String(e.order_id))
        || (window.pendingOrders || []).find(o => String(o.id) === String(e.order_id));
    const expType = window.escapeHtml(e.expense_type || '代付');
    const content = `<div class="text-center mb-6"><h2 class="text-2xl font-bold tracking-widest border-b-2 border-black pb-2 inline-block">支出确认单</h2></div><div class="flex justify-between text-sm mb-2 font-bold"><span>单据编号：EXP-${e.id}-${Date.now().toString().slice(-4)}</span><span>申请日期：${e.created_at ? e.created_at.split(' ')[0] : '即日'}</span></div><table class="w-full text-left border-collapse border border-black mb-6 text-sm"><tr><th class="border border-black p-3 bg-gray-100 w-1/4">项目名称</th><td class="border border-black p-3 font-bold" colspan="3">${document.getElementById('global-project-select').options[document.getElementById('global-project-select').selectedIndex].text}</td></tr><tr><th class="border border-black p-3 bg-gray-100">关联展商/展位</th><td class="border border-black p-3 font-bold text-blue-800" colspan="3">${order ? order.company_name : ''} (展位: ${order ? order.booth_id : ''})</td></tr><tr><th class="border border-black p-3 bg-gray-100">代付类别</th><td class="border border-black p-3 font-bold" colspan="3">${expType}</td></tr><tr><th class="border border-black p-3 bg-gray-100">代付事由</th><td class="border border-black p-3 font-bold text-purple-800" colspan="3">${window.escapeHtml(e.reason || '无说明')}</td></tr><tr><th class="border border-black p-3 bg-gray-100">申请支付金额</th><td class="border border-black p-3 font-bold text-xl text-red-600" colspan="3">${window.formatCurrency(e.amount, '¥ ')}</td></tr><tr><th class="border border-black p-3 bg-gray-100">收款单位全称</th><td class="border border-black p-3 font-bold" colspan="3">${window.escapeHtml(e.payee_name || '')} <span class="text-gray-500 font-normal">(${window.escapeHtml(e.payee_channel || '转账')})</span></td></tr></table><div class="text-sm font-bold mt-10 pt-6">申请人：${window.escapeHtml(e.applicant || '')}</div>`;
    document.getElementById('print-content').innerHTML = content; document.getElementById('print-modal').classList.remove('hidden');
}

window.onExpenseTypeChange = function() {
    const expType = document.getElementById('exp-type')?.value || '';
    const reasonWrap = document.getElementById('exp-reason-wrap');
    const payeeWrap = document.getElementById('exp-payee-wrap');
    const payeeSuggestionWrap = document.getElementById('exp-payee-suggestion-wrap');
    const agentSearchWrap = document.getElementById('exp-agent-search-wrap');
    const payeeInput = document.getElementById('exp-payee');
    const reasonInput = document.getElementById('exp-reason');
    // Reset
    if (reasonWrap) reasonWrap.classList.remove('hidden');
    if (payeeWrap) payeeWrap.classList.remove('hidden');
    if (payeeSuggestionWrap) payeeSuggestionWrap.classList.add('hidden');
    if (agentSearchWrap) agentSearchWrap.classList.add('hidden');
    if (payeeInput) { payeeInput.readOnly = false; payeeInput.placeholder = '姓名或企业执照全称'; payeeInput.className = 'w-full border p-2 rounded'; }
    if (reasonInput) reasonInput.placeholder = '如：展位搭建费结算 / 展具租赁 / 退款原因等';

    if (expType === '返佣支出') {
        // Return commission: payee from agent list only, no free reason input needed
        if (reasonWrap) reasonWrap.classList.add('hidden');
        if (reasonInput) reasonInput.value = '返佣支出';
        if (agentSearchWrap) agentSearchWrap.classList.remove('hidden');
        if (payeeInput) { payeeInput.readOnly = true; payeeInput.placeholder = '搜索并选择代理商后自动带出'; payeeInput.value = ''; payeeInput.className = 'w-full border-2 border-blue-300 p-2 rounded bg-blue-50 font-bold text-blue-900'; }
        window.ensureAgentsLoaded?.();
    } else if (expType === '其他代付') {
        if (reasonInput) { reasonInput.placeholder = '如：展位搭建费、展具租赁等'; reasonInput.value = ''; }
        if (payeeInput) payeeInput.placeholder = '收款人或供应商全称';
    } else if (expType === '退款') {
        if (reasonInput) reasonInput.placeholder = '请填写退款原因';
        if (payeeInput) payeeInput.placeholder = '收款人（选填）';
    }
}

window.cancelOrder = async function(orderId, boothId) {
    const pid = document.getElementById('global-project-select').value;
    if(!confirm(`确定要退订订单吗？\n展位将释放回可售状态，订单会转入“待确认订单列表”，企业资料和已有收款记录会保留。`)) return;
    try {
        const res = await window.apiFetch('/api/cancel-order', { method: 'POST', body: JSON.stringify({ project_id: pid, order_id: orderId, booth_id: boothId }) });
        await window.ensureApiSuccess(res, '退订失败');
        window.showToast("退订成功，订单已转入待确认列表");
        window.markOrderDashboardDirty();
        await window.loadOrderList();
        await window.loadPendingOrderList?.();
    } catch (e) { /* handled */ }
}

window.applyFmSwapDirectShellVisibility = function(order = window.currentFinanceOrder) {
    const shell = document.getElementById('fm-swap-direct-shell');
    if (!shell) return;
    const canOperateOrder = !!order && (window.isSuperAdmin?.() || window.canManageOrder?.(order));
    shell.classList.toggle('hidden', !canOperateOrder);
}

window.handleSwapPreserveFinanceToggle = function(checked) {
    const isPreserve = !!checked;
    const actualFeeInput = document.getElementById('fm-swap-actual-fee');
    const priceReasonInput = document.getElementById('fm-swap-price-reason');
    const feesContainer = document.getElementById('fm-swap-fees-container');
    const addFeeBtn = document.getElementById('btn-fm-swap-add-fee');
    const order = window.currentFinanceOrder || {};
    if (isPreserve) {
        if (actualFeeInput) {
            actualFeeInput.value = Number(order.total_booth_fee || 0);
            actualFeeInput.disabled = true;
            actualFeeInput.classList.add('bg-slate-100', 'cursor-not-allowed');
        }
        if (priceReasonInput) {
            priceReasonInput.value = '';
            priceReasonInput.disabled = true;
            priceReasonInput.classList.add('bg-slate-100', 'cursor-not-allowed');
        }
        if (addFeeBtn) addFeeBtn.classList.add('hidden');
        if (feesContainer) feesContainer.classList.add('opacity-60', 'pointer-events-none');
    } else {
        if (actualFeeInput) {
            actualFeeInput.disabled = false;
            actualFeeInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
        }
        if (priceReasonInput) {
            priceReasonInput.disabled = false;
            priceReasonInput.classList.remove('bg-slate-100', 'cursor-not-allowed');
        }
        if (addFeeBtn) addFeeBtn.classList.remove('hidden');
        if (feesContainer) feesContainer.classList.remove('opacity-60', 'pointer-events-none');
    }
}

window.applyManualSwapBooths = async function() {
    const projectId = Number(document.getElementById('global-project-select')?.value || 0);
    const input = document.getElementById('fm-swap-manual-booths');
    if (!projectId || !input) return;
    const raw = String(input.value || '').trim();
    if (!raw) return window.showToast('请先输入目标展位号', 'error');
    const ids = raw.split(/[,，\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!ids.length) return window.showToast('请输入有效展位号', 'error');
    try {
        const candidates = await window.loadFinanceBoothCandidatesByIds(projectId, ids);
        window.applySwapBoothCandidates(candidates);
        window.showToast(`已载入 ${candidates.length} 个目标展位`, 'success');
    } catch (e) {
        window.showToast(e.message || '加载展位失败', 'error');
    }
}

window.applyDetailDirectBoothShellVisibility = function(order) {
    const shell = document.getElementById('dt-direct-booth-shell');
    if (!shell) return;
    const visible = !!order && (window.isSuperAdmin?.() || window.canManageOrder?.(order));
    shell.classList.toggle('hidden', !visible);
    const panel = document.getElementById('dt-direct-booth-panel');
    const toggle = document.getElementById('dt-direct-booth-toggle');
    if (panel) panel.classList.add('hidden');
    if (toggle) toggle.innerText = '展开';
    const target = document.getElementById('dt-direct-booth-target');
    const reason = document.getElementById('dt-direct-booth-reason');
    if (target) target.value = '';
    if (reason) reason.value = '';
}

window.toggleDetailDirectBoothPanel = function() {
    const panel = document.getElementById('dt-direct-booth-panel');
    const toggle = document.getElementById('dt-direct-booth-toggle');
    if (!panel) return;
    const wasHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !wasHidden);
    if (toggle) toggle.innerText = wasHidden ? '收起' : '展开';
    if (wasHidden) {
        const order = window.currentViewOrder;
        const target = document.getElementById('dt-direct-booth-target');
        if (target && order) target.value = window.getOrderBoothDisplay(order) || '';
        document.getElementById('dt-direct-booth-target')?.focus();
    }
}

window.submitDetailDirectBoothChange = async function() {
    const order = window.currentViewOrder;
    if (!order) return window.showToast('未找到当前订单', 'error');
    if (!window.isSuperAdmin?.()) return window.showToast('仅超级管理员可执行直改展位', 'error');
    if (String(order.status || '') !== '正常') return window.showToast('仅正常订单可执行直改展位', 'error');
    const targetInput = document.getElementById('dt-direct-booth-target');
    const reasonInput = document.getElementById('dt-direct-booth-reason');
    const raw = String(targetInput?.value || '').trim();
    const reason = String(reasonInput?.value || '').trim();
    if (!raw) return window.showToast('请输入目标展位号', 'error');
    if (reason.length < 5) return window.showToast('请填写至少 5 个字的变更原因', 'error');
    const ids = raw.split(/[,，\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!ids.length) return window.showToast('请输入有效展位号', 'error');
    const projectId = Number(order.project_id || document.getElementById('global-project-select')?.value || 0);
    if (!projectId) return window.showToast('未找到项目信息', 'error');
    let targetBooths = [];
    try {
        targetBooths = await window.loadFinanceBoothCandidatesByIds(projectId, ids);
    } catch (e) {
        return window.showToast(e.message || '加载目标展位失败', 'error');
    }
    const displayNamePayload = window.resolveBoothChangeDisplayNamePayload?.(order, targetBooths);
    if (!displayNamePayload) return;
    const confirmText = `确认将订单 [${order.company_name}] 的展位由 [${window.getOrderBoothDisplay(order)}] 直改为 [${ids.join('、')}] 吗？\n系统会释放旧展位、占用新展位，并保留原订单的应收/已收/合同。`;
    if (!window.confirm(confirmText)) return;
    const btn = document.getElementById('dt-direct-booth-submit');
    window.toggleBtnLoading?.('dt-direct-booth-submit', true, '提交直改');
    try {
        const res = await window.apiFetch('/api/change-order-booth', {
            method: 'POST',
            body: JSON.stringify({
                project_id: projectId,
                order_id: order.id,
                target_booth_ids: ids,
                preserve_finance: 1,
                swap_reason: reason,
                ...displayNamePayload
            })
        });
        await window.ensureApiSuccess(res, '直改展位失败');
        window.showToast('直改展位成功，订单已更新');
        window.markOrderDashboardDirty?.();
        await window.loadOrderList?.();
        const refreshed = (window.allOrders || []).find((item) => String(item.id) === String(order.id));
        if (refreshed) {
            window.currentViewOrder = refreshed;
            await window.showOrderDetail(refreshed);
        } else {
            window.closeModal?.('order-detail-modal');
        }
        window.refreshVisibleOrderContexts?.();
    } catch (e) {
        window.showToast(e.message || '直改展位失败', 'error');
    } finally {
        window.toggleBtnLoading?.('dt-direct-booth-submit', false, '提交直改');
    }
}
