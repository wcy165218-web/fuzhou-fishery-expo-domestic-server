// ================= js/finance-bindings.js =================
(function() {
    window.financeState = window.getFeatureState
        ? window.getFeatureState('finance', { orderListFilterEventsBound: false, pendingOrderListFilterEventsBound: false })
        : (window.financeState || { orderListFilterEventsBound: false, pendingOrderListFilterEventsBound: false });

    window.bindOrderFinanceFilterEvents = function() {
        const state = window.financeState || {};
        if (!state.orderListFilterEventsBound) {
            ['order-search', 'order-business-search', 'order-region-search'].forEach((id) => {
                document.getElementById(id)?.addEventListener('input', () => window.scheduleOrderListReload?.());
            });
            document.getElementById('order-booth-type-filter')?.addEventListener('change', () => window.reloadOrderListFromFilters?.());
            document.getElementById('order-status-filter')?.addEventListener('change', () => window.reloadOrderListFromFilters?.());
            document.getElementById('order-sales-filter')?.addEventListener('change', () => window.reloadOrderListFromFilters?.());
            document.getElementById('order-page-size')?.addEventListener('change', () => window.changeOrderListPageSize?.());
            state.orderListFilterEventsBound = true;
        }
        if (!state.pendingOrderListFilterEventsBound) {
            ['pending-order-search', 'pending-order-business-search'].forEach((id) => {
                document.getElementById(id)?.addEventListener('input', () => window.schedulePendingOrderListReload?.());
            });
            document.getElementById('pending-order-sales-filter')?.addEventListener('change', () => window.reloadPendingOrderListFromFilters?.());
            document.getElementById('pending-order-page-size')?.addEventListener('change', () => window.changePendingOrderListPageSize?.());
            state.pendingOrderListFilterEventsBound = true;
        }
    };

    const originalLoadOrderList = window.loadOrderList;
    if (typeof originalLoadOrderList === 'function') {
        window.loadOrderList = async function(...args) {
            window.bindOrderFinanceFilterEvents?.();
            return originalLoadOrderList.apply(this, args);
        };
    }

    const originalLoadPendingOrderList = window.loadPendingOrderList;
    if (typeof originalLoadPendingOrderList === 'function') {
        window.loadPendingOrderList = async function(...args) {
            window.bindOrderFinanceFilterEvents?.();
            return originalLoadPendingOrderList.apply(this, args);
        };
    }

    window.bindOrderFinanceFilterEvents();
})();