// ================= js/home.js =================
window.homeCountdownTimer = null;
window.homeTabDefinitions = [
    { id: 'sales-summary', label: '目标与收款概览', adminOnly: false },
    { id: 'sales-list', label: '业务员销售情况', adminOnly: false },
    { id: 'hall', label: '馆别经营看板', adminOnly: true },
    { id: 'region-table', label: '地区分布表格', adminOnly: false }
];
window.homePeriodTabDefinitions = [
    { id: 'today', label: '今日' },
    { id: 'week', label: '本周' },
    { id: 'month', label: '本月' },
    { id: 'total', label: '总计' }
];
window.homeFilterStartDate = window.homeFilterStartDate || '2025-01-01';
window.homeFilterEndDate = window.homeFilterEndDate || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
window.homeSalesListSortKey = window.homeSalesListSortKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('homeSalesListSortKey') || '') : '');
window.homeSalesListSortDirection = window.homeSalesListSortDirection || (typeof localStorage !== 'undefined' ? (localStorage.getItem('homeSalesListSortDirection') || 'asc') : 'asc');
window.persistHomeSalesListSort = function() {
    try {
        if (typeof localStorage === 'undefined') return;
        if (window.homeSalesListSortKey) {
            localStorage.setItem('homeSalesListSortKey', window.homeSalesListSortKey);
            localStorage.setItem('homeSalesListSortDirection', window.homeSalesListSortDirection);
        } else {
            localStorage.removeItem('homeSalesListSortKey');
            localStorage.removeItem('homeSalesListSortDirection');
        }
    } catch (_) {}
};
window.homeHallTabDefinitions = [
    { id: 'landing', label: '按馆号 · 总体落位概况' },
        { id: 'booth', label: '按馆号 · 展位概况' },
    { id: 'finance', label: '按馆号 · 财务概况' }
];

window.getCurrentProject = function() {
    const pid = document.getElementById('global-project-select')?.value;
    return (allProjects || []).find((project) => String(project.id) === String(pid)) || null;
}

window.formatHomeDate = function(date) {
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    }).format(date);
}

window.formatCountdownParts = function(diffMs) {
    const totalMinutes = Math.max(Math.floor(diffMs / 60000), 0);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    return `${days}天 ${hours}小时 ${minutes}分钟`;
}

window.updateHomeProjectHero = function() {
    const project = window.getCurrentProject();
    const dateEl = document.getElementById('home-today-date');
    const projectEl = document.getElementById('home-project-name');
    const countdownValueEl = document.getElementById('home-countdown-value');
    const countdownDescEl = document.getElementById('home-countdown-desc');
    if (!dateEl || !countdownValueEl || !countdownDescEl) return;

    const now = new Date();
    dateEl.innerText = window.formatHomeDate(now);
    if (projectEl) projectEl.innerText = project ? project.name : '未选择项目';

    if (!project || !project.start_date) {
        countdownValueEl.innerText = '--';
        countdownDescEl.innerText = '当前项目未设置展期';
        return;
    }

    const startDate = new Date(`${project.start_date}T00:00:00+08:00`);
    const endDate = project.end_date ? new Date(`${project.end_date}T23:59:59+08:00`) : startDate;
    const exhibitionRangeLabel = `${project.start_date} ~ ${project.end_date || project.start_date}`;
    countdownValueEl.innerText = exhibitionRangeLabel;

    if (now < startDate) {
        countdownDescEl.innerText = `距开展还有 ${window.formatCountdownParts(startDate - now)}`;
        return;
    }

    if (now <= endDate) {
        countdownDescEl.innerText = `展会进行中，距闭展还有 ${window.formatCountdownParts(endDate - now)}`;
        return;
    }

    countdownDescEl.innerText = `展会已结束 ${window.formatCountdownParts(now - endDate)}`;
}

window.renderMiniProgress = function(percent, colorClass = 'bg-blue-500') {
    const safePercent = Math.max(0, Math.min(Number(percent || 0), 100));
    return `
        <div class="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div class="h-full rounded-full ${colorClass}" style="width: ${safePercent}%"></div>
        </div>
    `;
}

window.getAvailableHomeTabs = function(isAdmin) {
    return window.homeTabDefinitions.filter((tab) => isAdmin || !tab.adminOnly);
}

window.renderHomeTabs = function(isAdmin) {
    const tabs = window.getAvailableHomeTabs(isAdmin);
    const currentActive = window.activeHomeTab;
    const nextActive = tabs.some((tab) => tab.id === currentActive) ? currentActive : (tabs[0]?.id || '');
    window.activeHomeTab = nextActive;
    window.switchHomeTab(nextActive, false);
}

window.switchHomeTab = function(tabId, rerenderTabs = true) {
    window.activeHomeTab = tabId;
    document.querySelectorAll('.home-tab-panel').forEach((panel) => panel.classList.add('hidden'));
    document.getElementById(`home-tab-${tabId}`)?.classList.remove('hidden');
    const label = window.homeTabDefinitions.find((tab) => tab.id === tabId)?.label;
    if (window.currentSectionId === 'home' && label) {
        const pageTitle = document.getElementById('current-page-title');
        if (pageTitle) pageTitle.innerText = `数据看板 · ${label}`;
    }

    if (rerenderTabs && window.homeDashboardData) {
        window.renderNav?.();
    }
}

window.getHomePresetDates = function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    const day = now.getDay() || 7;
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${year}-${pad(month + 1)}-${pad(date)}`;
    const weekStart = new Date(year, month, date - (day - 1));
    const weekStartStr = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
    const monthStart = `${year}-${pad(month + 1)}-01`;
    return {
        today: { start: today, end: today },
        week: { start: weekStartStr, end: today },
        month: { start: monthStart, end: today },
        total: { start: '2025-01-01', end: today }
    };
}

window.detectHomePresetKey = function() {
    const presets = window.getHomePresetDates();
    const s = window.homeFilterStartDate;
    const e = window.homeFilterEndDate;
    for (const [key, dates] of Object.entries(presets)) {
        if (s === dates.start && e === dates.end) return key;
    }
    return null;
}

window.renderHomeDateRange = function(selectPrefix, onchangeHandlerName) {
    const start = window.homeFilterStartDate || '2025-01-01';
    const end = window.homeFilterEndDate || '2026-01-01';
    const inpCls = 'bg-transparent text-slate-700 text-xs font-bold focus:outline-none cursor-pointer';
    const oc = `onchange="${onchangeHandlerName}('${selectPrefix}')"`;
    return `
        <div class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 shadow-sm">
            <span class="text-slate-400 whitespace-nowrap mr-1">日期范围</span>
            <input type="date" id="${selectPrefix}-start" value="${start}" min="2025-01-01" ${oc} class="${inpCls}">
            <span class="text-slate-400 mx-1">至</span>
            <input type="date" id="${selectPrefix}-end" value="${end}" min="2025-01-01" ${oc} class="${inpCls}">
        </div>
    `;
}

window.renderHomeFilterTabs = function(activePeriodId, switchFnName, selectPrefix, dateChangeFnName) {
    const presets = window.getHomePresetDates();
    const presetKey = window.detectHomePresetKey();
    return `
        ${window.homePeriodTabDefinitions.map((tab) => {
            const isActive = presetKey === tab.id;
            return `<button
                onclick="${switchFnName}('${tab.id}')"
                class="px-3 py-1.5 rounded-full text-xs font-bold transition border ${isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white/80 text-slate-600 border-slate-200 hover:bg-slate-100'}"
            >${tab.label}</button>`;
        }).join('')}
        ${window.renderHomeDateRange(selectPrefix, dateChangeFnName)}
    `;
}

window.onHomeDateRangeChange = function(prefix) {
    const newStart = document.getElementById(prefix + '-start')?.value || '';
    const newEnd = document.getElementById(prefix + '-end')?.value || '';
    if (!newStart || !newEnd) return;
    if (newStart > newEnd) {
        window.showToast('开始日期不能晚于结束日期', 'error');
        return;
    }
    window.homeFilterStartDate = newStart;
    window.homeFilterEndDate = newEnd;
    const presetKey = window.detectHomePresetKey();
    const label = presetKey
        ? (window.homePeriodTabDefinitions.find(t => t.id === presetKey)?.label || '')
        : `${newStart} ~ ${newEnd}`;
    window.showToast(`已切换至 ${label}`, 'success');
    if (presetKey) {
        window.renderHomeSalesSummary(window.homeDashboardData?.sales_summary_periods || {});
        window.renderHomeSalesList(window.homeDashboardData?.sales_list_periods || {}, window.homeDashboardData?.sales_list_meta || {});
    } else {
        window.loadHomeDashboard();
    }
}

window.resolveHomeFilteredBucket = function(periodMap) {
    const presetKey = window.detectHomePresetKey();
    if (presetKey) return periodMap?.[presetKey] || {};
    return periodMap?.custom || periodMap?.total || {};
}

window.resolveHomeFilteredListData = function(listPeriodMap, metaMap) {
    const presetKey = window.detectHomePresetKey();
    const key = presetKey || 'custom';
    const rows = Array.isArray(listPeriodMap?.[key]) ? listPeriodMap[key] : (Array.isArray(listPeriodMap?.total) ? listPeriodMap.total : []);
    const meta = metaMap?.[key] || metaMap?.total || {};
    return { rows, meta, periodKey: key };
}

window.renderHomeProgressSummary = function(progress) {
    const container = document.getElementById('home-progress-summary');
    if (!container) return;

    const fmtCount = window.formatCompactCount;
    const fmtMoney = window.formatCurrency;
    const fmtPercent = window.formatCompactPercent;
    const targetRate = Number(progress.target_total || 0) > 0
        ? ((Number(progress.deposit_booth_count || 0) + Number(progress.full_paid_booth_count || 0)) / Number(progress.target_total || 0)) * 100
        : 0;
    const renderMetricRow = (label, value, hint = '', toneClass = 'text-slate-800') => `
        <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 overflow-hidden">
            <div class="text-xs font-bold tracking-wide text-slate-400">${label}</div>
            <div class="text-lg md:text-xl font-black ${toneClass} mt-2 tabular-data" style="overflow-wrap:anywhere">${value}</div>
            ${hint ? `<div class="text-[11px] text-slate-400 mt-2">${hint}</div>` : ''}
        </div>
    `;

    container.innerHTML = `
        <div class="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <div class="text-xs tracking-[0.2em] text-slate-400 font-bold">展位目标推进</div>
                    <div class="text-2xl md:text-3xl font-black text-slate-900 mt-2 tabular-data" style="overflow-wrap:anywhere">${fmtCount(Number(progress.deposit_booth_count || 0) + Number(progress.full_paid_booth_count || 0))} / ${fmtCount(progress.target_total)} 个</div>
                    <div class="text-xs text-slate-500 mt-1">剩余目标数 ${fmtCount(progress.remaining_target)} 个</div>
                </div>
                <div class="text-right">
                    <div class="text-xs text-slate-400">推进比例</div>
                    <div class="text-xl font-black text-slate-800 mt-1 tabular-data">${fmtPercent(targetRate)}</div>
                </div>
            </div>
            ${window.renderMiniProgress(targetRate, 'bg-gradient-to-r from-blue-500 to-blue-400')}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                ${renderMetricRow('总计目标展位数', fmtCount(progress.target_total), '当前目标总量', 'text-slate-900')}
                ${renderMetricRow('已付定金展位数', fmtCount(progress.deposit_booth_count), '已发生部分收款', 'text-amber-700')}
                ${renderMetricRow('已付全款展位数', fmtCount(progress.full_paid_booth_count), '已完成全部收款', 'text-emerald-700')}
                ${renderMetricRow('剩余目标数', fmtCount(progress.remaining_target), '仍需继续推进', 'text-slate-700')}
            </div>
        </div>
        <div class="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <div class="text-xs tracking-[0.2em] text-slate-400 font-bold">应收与收款</div>
                    <div class="text-2xl md:text-3xl font-black text-slate-900 mt-2 tabular-data" style="overflow-wrap:anywhere">${fmtMoney(progress.receivable_total)}</div>
                    <div class="text-xs text-slate-500 mt-1">当前总计应收费用</div>
                </div>
                <div class="text-right">
                    <div class="text-xs text-slate-400">已收费用比例</div>
                    <div class="text-xl font-black text-slate-800 mt-1 tabular-data">${fmtPercent(progress.received_rate)}</div>
                </div>
            </div>
            ${window.renderMiniProgress(progress.received_rate, 'bg-gradient-to-r from-emerald-400 to-emerald-200')}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                ${renderMetricRow('总计应收费用', fmtMoney(progress.receivable_total), '当前项目累计应收', 'text-rose-700')}
                ${renderMetricRow('已收费用', fmtMoney(progress.received_total), '当前项目累计已收', 'text-emerald-700')}
                ${renderMetricRow('未收费用', fmtMoney(progress.unpaid_total), '应收减已收后的余额', 'text-slate-800')}
                ${renderMetricRow('已收费用比例', fmtPercent(progress.received_rate), '当前回款进度', 'text-slate-800')}
            </div>
        </div>
    `;
}

window.switchHomeSalesSummaryPeriod = function(periodId) {
    const presets = window.getHomePresetDates();
    const preset = presets[periodId];
    if (preset) {
        window.homeFilterStartDate = preset.start;
        window.homeFilterEndDate = preset.end;
    }
    window.renderHomeSalesSummary(window.homeDashboardData?.sales_summary_periods || {});
    window.renderHomeSalesList(window.homeDashboardData?.sales_list_periods || {}, window.homeDashboardData?.sales_list_meta || {});
}

window.renderHomeSalesSummary = function(periodMap) {
    const container = document.getElementById('home-sales-summary');
    if (!container) return;

    const current = window.resolveHomeFilteredBucket(periodMap);
    const fixedTotal = periodMap?.total || {};
    const fmtCount = window.formatCompactCount;
    const fmtMoney = window.formatCurrency;
    const fmtPercent = window.formatCompactPercent;
    const fmtMoneyShort = (value) => {
        const n = Number(value || 0);
        const abs = Math.abs(n);
        if (abs >= 1e8) return `¥${(n / 1e8).toFixed(2).replace(/\.?0+$/, '')}亿`;
        if (abs >= 1e4) return `¥${(n / 1e4).toFixed(2).replace(/\.?0+$/, '')}万`;
        return fmtMoney(n);
    };

    const targetTotal = Number(fixedTotal.target_total || current.target_total || 0);
    const reservedBooths = Number(current.reserved_booth_count || 0);
    const depositBooths = Number(current.deposit_booth_count || 0);
    const fullPaidBooths = Number(current.full_paid_booth_count || 0);
    const completedBooths = Number((depositBooths + fullPaidBooths).toFixed(2));
    const completionRate = targetTotal > 0 ? (completedBooths / targetTotal) * 100 : 0;
    const remainingTarget = Math.max(targetTotal - completedBooths - reservedBooths, 0);
    const receivableTotal = Number(current.receivable_total || 0);
    const receivedTotal = Number(current.received_total || 0);
    const collectionRate = receivableTotal > 0 ? (receivedTotal / receivableTotal) * 100 : 0;
    const unpaidTotal = Math.max(receivableTotal - receivedTotal, 0);

    const presetKey = window.detectHomePresetKey();
    const tabLabel = presetKey ? (window.homePeriodTabDefinitions.find((tab) => tab.id === presetKey)?.label || '自定义') : '自定义';
    const periodLabel = presetKey ? tabLabel : `${window.homeFilterStartDate} ~ ${window.homeFilterEndDate}`;

    // Donut chart for booth status
    const donutTotalForChart = Math.max(targetTotal, completedBooths + reservedBooths, 1);
    const segments = [
        { label: '全款', value: fullPaidBooths, color: '#059669', bg: '#d1fae5' },
        { label: '定金', value: depositBooths, color: '#d97706', bg: '#fef3c7' },
        { label: '预留', value: reservedBooths, color: '#64748b', bg: '#e2e8f0' },
        { label: '剩余目标', value: remainingTarget, color: '#cbd5e1', bg: '#f1f5f9' }
    ];
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    let donutOffset = 0;
    const donutSegments = segments.map((seg) => {
        const ratio = seg.value / donutTotalForChart;
        const dash = circumference * ratio;
        const node = `<circle cx="72" cy="72" r="${radius}" fill="none" stroke="${seg.color}" stroke-width="20"
            stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-donutOffset}" transform="rotate(-90 72 72)"></circle>`;
        donutOffset += dash;
        return node;
    }).join('');

    // Stacked bar for amount
    const receivedPct = receivableTotal > 0 ? (receivedTotal / receivableTotal) * 100 : 0;
    const unpaidPct = receivableTotal > 0 ? (unpaidTotal / receivableTotal) * 100 : 0;

    const heroBlock = (caption, rateText, leadValue, leadHint, trailHint, barBg, rate, ringClass) => `
        <div class="rounded-2xl border-2 ${ringClass} bg-white px-5 py-4">
            <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-bold text-slate-600">${caption}</div>
                <div class="text-3xl md:text-4xl font-black text-slate-900 tabular-data leading-none">${rateText}</div>
            </div>
            <div class="mt-3 h-3 rounded-full overflow-hidden" style="background:#f1f5f9;">
                <div class="h-full rounded-full" style="width: ${Math.max(0, Math.min(Number(rate || 0), 100))}%; background: ${barBg};"></div>
            </div>
            <div class="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
                <div class="text-sm text-slate-700"><span class="font-black tabular-data text-base">${leadValue}</span> <span class="text-slate-400 text-xs">${leadHint}</span></div>
                <div class="text-xs font-bold text-slate-500">${trailHint}</div>
            </div>
        </div>
    `;

    const legendDot = (color) => `<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:${color}"></span>`;
    const renderBoothSegmentRow = (seg) => {
        const pct = donutTotalForChart > 0 ? (seg.value / donutTotalForChart) * 100 : 0;
        return `
            <div class="home-booth-segment-row">
                <div class="home-booth-segment-head">
                    <div class="home-booth-segment-label">
                        ${legendDot(seg.color)}
                        <span>${seg.label}</span>
                    </div>
                    <div class="home-booth-segment-value">
                        <span>${fmtCount(seg.value)}</span>
                        <span>${fmtPercent(pct)}</span>
                    </div>
                </div>
                <div class="home-booth-segment-track" style="background:${seg.bg};">
                    <div class="home-booth-segment-fill" style="width:${Math.max(2, Math.min(pct, 100))}%; background:${seg.color};"></div>
                </div>
            </div>
        `;
    };

    container.innerHTML = `
        <style>
            .home-sales-summary-detail-grid { display: grid; grid-template-columns: minmax(380px, 0.95fr) minmax(0, 1.55fr); gap: 16px; margin-top: 16px; }
            .home-booth-structure-card { border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; padding: 20px; }
            .home-booth-structure-body { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 18px; align-items: center; }
            .home-booth-donut-wrap { width: 144px; height: 144px; position: relative; justify-self: center; }
            .home-booth-segments { display: grid; gap: 11px; }
            .home-booth-segment-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 5px; }
            .home-booth-segment-label { min-width: 0; display: flex; align-items: center; gap: 7px; color: #334155; font-size: 13px; font-weight: 800; }
            .home-booth-segment-value { flex-shrink: 0; display: flex; align-items: baseline; gap: 8px; color: #0f172a; font-size: 13px; font-weight: 900; font-variant-numeric: tabular-nums; }
            .home-booth-segment-value span:last-child { color: #64748b; font-size: 11px; font-weight: 800; }
            .home-booth-segment-track { height: 7px; border-radius: 999px; overflow: hidden; }
            .home-booth-segment-fill { height: 100%; border-radius: 999px; }
            .home-booth-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9; }
            .home-booth-summary-chip { border-radius: 12px; background: #f8fafc; padding: 10px 12px; }
            .home-booth-summary-chip-label { color: #64748b; font-size: 11px; font-weight: 800; }
            .home-booth-summary-chip-value { color: #0f172a; font-size: 18px; line-height: 1.15; font-weight: 900; font-variant-numeric: tabular-nums; margin-top: 3px; }
            .home-money-structure-card { border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; padding: 20px; display: flex; flex-direction: column; }
            @media (max-width: 980px) {
                .home-sales-summary-detail-grid { grid-template-columns: 1fr; }
            }
            @media (max-width: 560px) {
                .home-booth-structure-body { grid-template-columns: 1fr; }
                .home-booth-summary-grid { grid-template-columns: 1fr; }
            }
        </style>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div class="flex items-baseline gap-2 flex-wrap">
                <div class="text-base font-black text-slate-800">${window.escapeHtml(periodLabel)}</div>
                <div class="text-xs font-bold text-slate-400 tracking-wide">周期数据</div>
            </div>
            <div class="flex flex-wrap gap-2">
                ${window.renderHomeFilterTabs(presetKey, 'window.switchHomeSalesSummaryPeriod', 'home-sales-summary', 'window.onHomeDateRangeChange')}
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${heroBlock(
                '展位推进',
                fmtPercent(completionRate),
                `${fmtCount(completedBooths)} / ${fmtCount(targetTotal)}`,
                '已成交 / 总目标 (个)',
                `剩余 ${fmtCount(remainingTarget)} 个`,
                'linear-gradient(to right, #3b82f6, #6366f1)',
                completionRate,
                'border-blue-200'
            )}
            ${heroBlock(
                '金额回收',
                fmtPercent(collectionRate),
                `${fmtMoneyShort(receivedTotal)} / ${fmtMoneyShort(receivableTotal)}`,
                '已收 / 应收',
                `未收 ${fmtMoneyShort(unpaidTotal)}`,
                'linear-gradient(to right, #10b981, #84cc16)',
                collectionRate,
                'border-emerald-200'
            )}
        </div>

        <div class="home-sales-summary-detail-grid">
            <div class="home-booth-structure-card">
                <div class="flex items-center justify-between mb-3">
                    <div class="text-sm font-black text-slate-700">展位结构</div>
                    <div class="text-xs text-slate-400 font-bold">目标 ${fmtCount(targetTotal)} 个</div>
                </div>
                <div class="home-booth-structure-body">
                    <div class="home-booth-donut-wrap">
                        <svg viewBox="0 0 144 144" class="w-full h-full">
                            ${donutSegments}
                        </svg>
                        <div class="absolute inset-0 flex flex-col items-center justify-center">
                            <div class="text-2xl font-black text-slate-900 tabular-data leading-none">${fmtPercent(completionRate)}</div>
                            <div class="text-[11px] text-slate-500 font-bold mt-1">已成交</div>
                        </div>
                    </div>
                    <div class="home-booth-segments">
                        ${segments.map(renderBoothSegmentRow).join('')}
                    </div>
                </div>
                <div class="home-booth-summary-grid">
                    <div class="home-booth-summary-chip">
                        <div class="home-booth-summary-chip-label">参展企业</div>
                        <div class="home-booth-summary-chip-value">${current.company_count || 0}</div>
                    </div>
                    <div class="home-booth-summary-chip">
                        <div class="home-booth-summary-chip-label">已成交合计</div>
                        <div class="home-booth-summary-chip-value">${fmtCount(completedBooths)}</div>
                    </div>
                    <div class="home-booth-summary-chip">
                        <div class="home-booth-summary-chip-label">待推进目标</div>
                        <div class="home-booth-summary-chip-value">${fmtCount(remainingTarget)}</div>
                    </div>
                </div>
            </div>

            <div class="home-money-structure-card">
                <div class="flex items-center justify-between mb-3">
                    <div class="text-sm font-black text-slate-700">金额构成</div>
                    <div class="text-xs text-slate-400 font-bold">应收 ${fmtMoneyShort(receivableTotal)}</div>
                </div>
                
                <div class="flex-1 py-4 flex flex-col justify-center">
                    <div class="h-9 w-full rounded-lg overflow-hidden flex" style="background:#f1f5f9;" title="应收：${fmtMoney(receivableTotal)}">
                        <div class="h-full flex items-center justify-end pr-2 text-white text-xs font-black tabular-data" style="background:#10b981; width:${receivedPct}%" title="已收：${fmtMoney(receivedTotal)}">
                            ${receivedPct >= 12 ? fmtPercent(receivedPct) : ''}
                        </div>
                        <div class="h-full flex items-center justify-end pr-2 text-white text-xs font-black tabular-data" style="background:#fb7185; width:${unpaidPct}%" title="未收：${fmtMoney(unpaidTotal)}">
                            ${unpaidPct >= 12 ? fmtPercent(unpaidPct) : ''}
                        </div>
                    </div>
                    <div class="mt-3 flex items-center justify-end gap-5 text-sm mb-6">
                        <div class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm" style="background:#10b981;"></span><span class="text-slate-600 font-bold">已收</span></div>
                        <div class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-sm" style="background:#fb7185;"></span><span class="text-slate-600 font-bold">未收</span></div>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-auto border-t border-slate-100 pt-4">
                    <div class="rounded-xl bg-rose-50 border border-rose-100 px-3 py-3" title="${fmtMoney(receivableTotal)}">
                        <div class="text-[11px] font-bold text-slate-500">应收费用</div>
                        <div class="text-xl md:text-2xl font-black text-rose-700 tabular-data mt-1 leading-tight">${fmtMoneyShort(receivableTotal)}</div>
                    </div>
                    <div class="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3" title="${fmtMoney(receivedTotal)}">
                        <div class="text-[11px] font-bold text-slate-500">已收费用</div>
                        <div class="text-xl md:text-2xl font-black text-emerald-700 tabular-data mt-1 leading-tight">${fmtMoneyShort(receivedTotal)}</div>
                    </div>
                    <div class="rounded-xl bg-amber-50 border border-amber-100 px-3 py-3" title="${fmtMoney(unpaidTotal)}">
                        <div class="text-[11px] font-bold text-slate-500">剩余未收</div>
                        <div class="text-xl md:text-2xl font-black text-amber-700 tabular-data mt-1 leading-tight">${fmtMoneyShort(unpaidTotal)}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.switchHomeSalesListPeriod = function(periodId) {
    const presets = window.getHomePresetDates();
    const preset = presets[periodId];
    if (preset) {
        window.homeFilterStartDate = preset.start;
        window.homeFilterEndDate = preset.end;
    }
    window.renderHomeSalesSummary(window.homeDashboardData?.sales_summary_periods || {});
    window.renderHomeSalesList(
        window.homeDashboardData?.sales_list_periods || {},
        window.homeDashboardData?.sales_list_meta || {}
    );
}

window.toggleHomeSalesListSort = function(sortKey) {
    if (window.homeSalesListSortKey === sortKey) {
        if (window.homeSalesListSortDirection === 'desc') {
            window.homeSalesListSortDirection = 'asc';
        } else {
            window.homeSalesListSortKey = '';
            window.homeSalesListSortDirection = 'asc';
        }
    } else {
        window.homeSalesListSortKey = sortKey;
        window.homeSalesListSortDirection = 'desc';
    }
    window.persistHomeSalesListSort?.();
    window.renderHomeSalesList(
        window.homeDashboardData?.sales_list_periods || {},
        window.homeDashboardData?.sales_list_meta || {}
    );
}

window.resetHomeSalesListSort = function() {
    window.homeSalesListSortKey = '';
    window.homeSalesListSortDirection = 'asc';
    window.persistHomeSalesListSort?.();
    window.renderHomeSalesList(
        window.homeDashboardData?.sales_list_periods || {},
        window.homeDashboardData?.sales_list_meta || {}
    );
}

window.getSortedHomeSalesListRows = function(rows) {
    const list = Array.isArray(rows) ? [...rows] : [];
    const sortKey = window.homeSalesListSortKey;
    if (!sortKey) return list;
    const direction = window.homeSalesListSortDirection === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
        if (sortKey === 'staff_name') {
            return String(a.staff_name || '').localeCompare(String(b.staff_name || ''), 'zh-CN') * direction;
        }
        const aValue = Number(a?.[sortKey] || 0);
        const bValue = Number(b?.[sortKey] || 0);
        if (aValue !== bValue) return (aValue - bValue) * direction;
        return String(a.staff_name || '').localeCompare(String(b.staff_name || ''), 'zh-CN');
    });
}

window.renderHomeSalesListSortHeader = function(label, sortKey, align = 'left') {
    const active = window.homeSalesListSortKey === sortKey;
    const icon = active
        ? (window.homeSalesListSortDirection === 'asc'
            ? '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')
        : '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true"><path d="M5 6l3-3 3 3M11 10l-3 3-3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const justifyClass = align === 'right' ? 'justify-end' : 'justify-start';
    return `
        <button
            onclick="window.toggleHomeSalesListSort('${sortKey}')"
            class="inline-flex items-center gap-1 ${justifyClass} text-inherit font-bold hover:text-slate-900 transition"
            title="点击按${label}排序，再点切换升降序，第三次恢复默认顺序"
        >
            <span>${label}</span>
            <span class="${active ? 'text-blue-600' : 'text-slate-400'}">${icon}</span>
        </button>
    `;
}

window.getHomeSalesListViewModel = function(periodMap, metaMap = {}) {
    const resolved = window.resolveHomeFilteredListData(periodMap, metaMap);
    const presetKey = window.detectHomePresetKey();
    const rows = window.getSortedHomeSalesListRows(resolved.rows);
    const meta = resolved.meta;
    const periodLabel = presetKey
        ? (window.homePeriodTabDefinitions.find((tab) => tab.id === presetKey)?.label || '自定义')
        : `${window.homeFilterStartDate} ~ ${window.homeFilterEndDate}`;
    const championTitleMap = { today: '今日冠军', week: '本周冠军', month: '本月冠军', total: '总冠军' };
    const championTitle = presetKey ? (championTitleMap[presetKey] || '冠军') : '区间冠军';
    const isTotalChampion = presetKey === 'total';
    const championDescription = isTotalChampion
        ? '累计收款展位数排名第一'
        : `${window.escapeHtml(periodLabel)}内，新增收款展位数排名第一`;
    const championMetricLabel = isTotalChampion ? '累计收款展位数' : '新增收款展位数';
    const totals = rows.reduce((acc, row) => {
        acc.target += Number(row.target_booths || 0);
        acc.reservedBooths += Number(row.reserved_booth_count || 0);
        acc.depositBooths += Number(row.deposit_booth_count || 0);
        acc.fullPaidBooths += Number(row.full_paid_booth_count || 0);
        acc.remainingTarget += Number(row.remaining_target || 0);
        acc.receivable += Number(row.receivable_total || 0);
        acc.received += Number(row.received_total || 0);
        return acc;
    }, { target: 0, reservedBooths: 0, depositBooths: 0, fullPaidBooths: 0, remainingTarget: 0, receivable: 0, received: 0 });
    const totalProgressBooths = totals.reservedBooths + totals.depositBooths + totals.fullPaidBooths;
    const totalCompletionRate = totals.target > 0 ? (totalProgressBooths / totals.target) * 100 : 0;
    const totalCollectionRate = totals.receivable > 0 ? (totals.received / totals.receivable) * 100 : 0;
    return {
        activeId: presetKey || 'custom',
        periodLabel,
        championTitle,
        championDescription,
        championMetricLabel,
        isTotalChampion,
        rows,
        meta,
        totals,
        totalProgressBooths,
        totalCompletionRate,
        totalCollectionRate
    };
}

window.getHomeSalesListExportContext = function(view) {
    const projectSelect = document.getElementById('global-project-select');
    const projectName = projectSelect?.options?.[projectSelect.selectedIndex]?.text || '未选择项目';
    const exportTime = new Date().toLocaleString('zh-CN', { hour12: false });
    const fmtCount = window.formatCompactCount;
    const fmtMoney = window.formatCurrency;
    const fmtPercent = window.formatCompactPercent;
    const sortSummary = window.homeSalesListSortKey
        ? `当前排序：${({
            target_booths: '目标展位数',
            reserved_booth_count: '预留展位数',
            deposit_booth_count: '定金展位数',
            full_paid_booth_count: '全款展位数',
            remaining_target: '剩余目标数',
            completion_rate: '完成比例',
            receivable_total: '总计应收费用',
            received_total: '总计已收费用',
            collection_rate: '已收费用占比'
        }[window.homeSalesListSortKey] || '自定义')} ${window.homeSalesListSortDirection === 'asc' ? '升序' : '降序'}`
        : '当前排序：默认人员顺序';
    return { projectName, exportTime, fmtCount, fmtMoney, fmtPercent, sortSummary };
}

window.buildHomeSalesListReportHtml = function(view) {
    const { projectName, exportTime, fmtCount, fmtMoney, fmtPercent, sortSummary } = window.getHomeSalesListExportContext(view);
    const clampPct = (val) => Math.max(0, Math.min(Number(val || 0), 100));
    const rowsHtml = view.rows.map((row) => {
        const completionRate = Number(row.completion_rate || 0);
        const collectionRate = Number(row.collection_rate || 0);
        const progressedBooths = Number(row.reserved_booth_count || 0) + Number(row.deposit_booth_count || 0) + Number(row.full_paid_booth_count || 0);
        return `
            <tr>
                <td class="staff-cell">${window.escapeHtml(row.staff_name || '')}</td>
                <td class="num">${fmtCount(row.target_booths || 0)}</td>
                <td class="num text-muted">${fmtCount(row.reserved_booth_count || 0)}</td>
                <td class="num">${fmtCount(row.deposit_booth_count || 0)}</td>
                <td class="num text-emerald">${fmtCount(row.full_paid_booth_count || 0)}</td>
                <td class="num text-muted">${fmtCount(row.remaining_target || 0)}</td>
                <td class="progress-cell">
                    <div class="progress-line"><span>${fmtPercent(completionRate)}</span><span class="progress-aux">${fmtCount(progressedBooths)}/${fmtCount(row.target_booths || 0)}</span></div>
                    <div class="progress-track"><div class="progress-bar progress-bar-slate" style="width:${clampPct(completionRate)}%"></div></div>
                </td>
                <td class="num text-rose">${fmtMoney(row.receivable_total || 0)}</td>
                <td class="num text-emerald">${fmtMoney(row.received_total || 0)}</td>
                <td class="progress-cell">
                    <div class="progress-line"><span>${fmtPercent(collectionRate)}</span><span class="progress-aux">${fmtMoney(row.received_total || 0)}</span></div>
                    <div class="progress-track"><div class="progress-bar progress-bar-emerald" style="width:${clampPct(collectionRate)}%"></div></div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <style>
            @page { size: A4 landscape; margin: 6mm; }
            .report-wrap { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #0f172a; }
            .report-shell { padding: 4px 4px 6px; background: #f8fafc; border-radius: 18px; }
            .report-header { display:flex; justify-content:space-between; gap:14px; align-items:flex-end; padding: 6px 4px 10px; }
            .report-title { font-size:20px; font-weight:900; letter-spacing:-0.01em; margin:0; color:#0f172a; }
            .report-subtitle { margin-top:4px; font-size:9.5px; color:#64748b; line-height:1.4; }
            .report-badges { display:flex; gap:6px; flex-wrap:wrap; }
            .badge { background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:999px; padding:3px 9px; font-size:8.5px; font-weight:700; letter-spacing:.02em; }
            .summary-grid { display:grid; grid-template-columns:repeat(8, minmax(0, 1fr)); gap:7px; margin-bottom:10px; }
            .summary-card { border:1px solid #e2e8f0; border-radius:14px; background:#ffffff; padding:8px 10px; box-shadow: 0 1px 0 rgba(15,23,42,.02); }
            .summary-label { font-size:8.5px; color:#94a3b8; font-weight:700; letter-spacing:.06em; }
            .summary-value { font-size:15px; font-weight:900; margin-top:3px; line-height:1.1; color:#0f172a; }
            .summary-card.accent-receivable .summary-value { color:#be123c; }
            .summary-card.accent-received .summary-value { color:#047857; }
            .table-shell { border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; background:#ffffff; }
            table { width:100%; border-collapse:collapse; font-size:9px; }
            thead th { background:#f1f5f9; color:#475569; font-weight:800; padding:6px 6px; border-bottom:1px solid #e2e8f0; text-align:right; white-space:nowrap; letter-spacing:.02em; }
            thead th:first-child { text-align:left; }
            tbody td { padding:5px 6px; border-bottom:1px solid #f1f5f9; text-align:right; vertical-align:middle; line-height:1.2; }
            tbody td.staff-cell { text-align:left; font-weight:800; color:#0f172a; }
            tbody tr:nth-child(even) td { background:#fbfdff; }
            tbody tr.total-row td { background:#f1f5f9; font-weight:900; border-top:2px solid #cbd5e1; border-bottom:none; padding-top:6px; padding-bottom:6px; }
            .num { font-variant-numeric: tabular-nums; font-weight:700; color:#0f172a; }
            .text-muted { color:#64748b; font-weight:600; }
            .text-emerald { color:#047857; }
            .text-rose { color:#be123c; }
            .progress-cell { min-width:120px; text-align:left; padding:5px 8px; }
            .progress-line { display:flex; justify-content:space-between; font-size:8.5px; font-weight:800; color:#334155; line-height:1.2; }
            .progress-aux { color:#94a3b8; font-weight:600; }
            .progress-track { margin-top:3px; height:4px; border-radius:999px; background:#e2e8f0; overflow:hidden; }
            .progress-bar { height:100%; border-radius:999px; }
            .progress-bar-slate { background:linear-gradient(to right, #64748b, #334155); }
            .progress-bar-emerald { background:linear-gradient(to right, #34d399, #059669); }
        </style>
        <div class="report-wrap">
            <div class="report-shell">
                <div class="report-header">
                    <div>
                        <h1 class="report-title">业务员销售情况全景报告</h1>
                        <div class="report-subtitle">
                            项目：${window.escapeHtml(projectName)} ｜ 范围：${window.escapeHtml(view.periodLabel)} ｜ 导出时间：${window.escapeHtml(exportTime)} ｜ 导出人：${window.escapeHtml(window.currentUser?.name || '')}
                        </div>
                    </div>
                    <div class="report-badges">
                        <span class="badge">${window.escapeHtml(sortSummary)}</span>
                    </div>
                </div>
                <div class="summary-grid">
                    <div class="summary-card"><div class="summary-label">目标展位</div><div class="summary-value num">${fmtCount(view.totals.target)}</div></div>
                    <div class="summary-card"><div class="summary-label">预留展位</div><div class="summary-value num">${fmtCount(view.totals.reservedBooths)}</div></div>
                    <div class="summary-card"><div class="summary-label">定金展位</div><div class="summary-value num">${fmtCount(view.totals.depositBooths)}</div></div>
                    <div class="summary-card"><div class="summary-label">全款展位</div><div class="summary-value num">${fmtCount(view.totals.fullPaidBooths)}</div></div>
                    <div class="summary-card"><div class="summary-label">剩余目标</div><div class="summary-value num">${fmtCount(view.totals.remainingTarget)}</div></div>
                    <div class="summary-card accent-receivable"><div class="summary-label">总计应收费用</div><div class="summary-value num">${fmtMoney(view.totals.receivable)}</div></div>
                    <div class="summary-card accent-received"><div class="summary-label">总计已收费用</div><div class="summary-value num">${fmtMoney(view.totals.received)}</div></div>
                    <div class="summary-card"><div class="summary-label">完成 / 已收占比</div><div class="summary-value num">${fmtPercent(view.totalCompletionRate)} / ${fmtPercent(view.totalCollectionRate)}</div></div>
                </div>
                <div class="table-shell">
                    <table>
                        <thead>
                            <tr>
                                <th>业务员</th>
                                <th>目标展位数</th>
                                <th>预留展位数</th>
                                <th>定金展位数</th>
                                <th>全款展位数</th>
                                <th>剩余目标数</th>
                                <th style="text-align:left">完成比例</th>
                                <th>总计应收费用</th>
                                <th>总计已收费用</th>
                                <th style="text-align:left">已收费用占比</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                            <tr class="total-row">
                                <td class="staff-cell">总计</td>
                                <td class="num">${fmtCount(view.totals.target)}</td>
                                <td class="num text-muted">${fmtCount(view.totals.reservedBooths)}</td>
                                <td class="num">${fmtCount(view.totals.depositBooths)}</td>
                                <td class="num text-emerald">${fmtCount(view.totals.fullPaidBooths)}</td>
                                <td class="num text-muted">${fmtCount(view.totals.remainingTarget)}</td>
                                <td class="progress-cell">
                                    <div class="progress-line"><span>${fmtPercent(view.totalCompletionRate)}</span><span class="progress-aux">${fmtCount(view.totalProgressBooths)}/${fmtCount(view.totals.target)}</span></div>
                                    <div class="progress-track"><div class="progress-bar progress-bar-slate" style="width:${clampPct(view.totalCompletionRate)}%"></div></div>
                                </td>
                                <td class="num text-rose">${fmtMoney(view.totals.receivable)}</td>
                                <td class="num text-emerald">${fmtMoney(view.totals.received)}</td>
                                <td class="progress-cell">
                                    <div class="progress-line"><span>${fmtPercent(view.totalCollectionRate)}</span><span class="progress-aux">${fmtMoney(view.totals.received)}</span></div>
                                    <div class="progress-track"><div class="progress-bar progress-bar-emerald" style="width:${clampPct(view.totalCollectionRate)}%"></div></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}


window.exportHomeSalesListReport = function() {
    if (!window.isSuperAdmin?.(window.currentUser)) return;
    const view = window.getHomeSalesListViewModel(
        window.homeDashboardData?.sales_list_periods || {},
        window.homeDashboardData?.sales_list_meta || {}
    );
    window.openPrintModal({
        title: 'A4报告预览',
        contentHtml: window.buildHomeSalesListReportHtml(view),
        shellClass: 'bg-white shadow-2xl w-full max-w-7xl flex flex-col max-h-[95vh]',
        contentClass: 'p-5 bg-white text-black overflow-y-auto flex-1',
        primaryText: '打印A4报告',
        primaryAction: () => window.print()
    });
}

window.escapeSvgText = function(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.buildHomeSalesListLongImageSvg = function(view) {
    const { projectName, exportTime, fmtCount, fmtMoney, fmtPercent } = window.getHomeSalesListExportContext(view);
    const escapeText = window.escapeSvgText;
    const clampPct = (val) => Math.max(0, Math.min(Number(val || 0), 100));
    const width = 1640;
    const padding = 40;
    const innerWidth = width - padding * 2;

    // Header
    const headerY = 54;
    const subtitleY = 84;

    // Summary cards
    const summaryY = 110;
    const summaryHeight = 86;
    const summaryGap = 12;
    const summaryCount = 8;
    const summaryCardWidth = (innerWidth - (summaryCount - 1) * summaryGap) / summaryCount;
    const summary = [
        { label: '目标展位', value: fmtCount(view.totals.target), color: '#0f172a' },
        { label: '预留展位', value: fmtCount(view.totals.reservedBooths), color: '#475569' },
        { label: '定金展位', value: fmtCount(view.totals.depositBooths), color: '#0f172a' },
        { label: '全款展位', value: fmtCount(view.totals.fullPaidBooths), color: '#047857' },
        { label: '剩余目标', value: fmtCount(view.totals.remainingTarget), color: '#64748b' },
        { label: '总计应收', value: fmtMoney(view.totals.receivable), color: '#be123c' },
        { label: '总计已收', value: fmtMoney(view.totals.received), color: '#047857' },
        { label: '完成 / 已收', value: `${fmtPercent(view.totalCompletionRate)} / ${fmtPercent(view.totalCollectionRate)}`, color: '#0f172a' }
    ];
    const summarySvg = summary.map((card, i) => {
        const x = padding + i * (summaryCardWidth + summaryGap);
        return `
            <g transform="translate(${x},${summaryY})">
                <rect x="0" y="0" width="${summaryCardWidth}" height="${summaryHeight}" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
                <text x="16" y="30" font-size="11" font-weight="800" fill="#94a3b8">${escapeText(card.label)}</text>
                <text x="16" y="64" font-size="22" font-weight="900" fill="${card.color}">${escapeText(card.value)}</text>
            </g>
        `;
    }).join('');

    // Table columns
    const columns = [
        { key: 'staff_name', label: '业务员', width: 220, align: 'left', type: 'text' },
        { key: 'target_booths', label: '目标展位数', width: 120, align: 'right', type: 'count' },
        { key: 'reserved_booth_count', label: '预留展位数', width: 120, align: 'right', type: 'count', color: '#475569' },
        { key: 'deposit_booth_count', label: '定金展位数', width: 120, align: 'right', type: 'count' },
        { key: 'full_paid_booth_count', label: '全款展位数', width: 120, align: 'right', type: 'count', color: '#047857' },
        { key: 'remaining_target', label: '剩余目标数', width: 120, align: 'right', type: 'count', color: '#64748b' },
        { key: 'completion_rate', label: '完成比例', width: 170, align: 'left', type: 'progress', barColor: 'slate' },
        { key: 'receivable_total', label: '总计应收费用', width: 200, align: 'right', type: 'money', color: '#be123c' },
        { key: 'received_total', label: '总计已收费用', width: 200, align: 'right', type: 'money', color: '#047857' },
        { key: 'collection_rate', label: '已收费用占比', width: 170, align: 'left', type: 'progress', barColor: 'emerald' }
    ];
    let xCursor = padding;
    columns.forEach((col) => { col.x = xCursor; xCursor += col.width; });

    const tableY = 220;
    const tableHeaderHeight = 44;
    const rowHeight = 40;
    const dataRowCount = view.rows.length;
    const tableHeight = tableHeaderHeight + (dataRowCount + 1) * rowHeight;
    const tableEndY = tableY + tableHeight;
    const height = tableEndY + 36;

    const headerCellsSvg = columns.map((col, i) => {
        const textX = col.align === 'left' ? col.x + 16 : col.x + col.width - 16;
        const anchor = col.align === 'left' ? 'start' : 'end';
        const sep = i > 0 ? `<line x1="${col.x}" y1="${tableY + 12}" x2="${col.x}" y2="${tableY + tableHeaderHeight - 12}" stroke="#e2e8f0"/>` : '';
        return `${sep}<text x="${textX}" y="${tableY + 29}" font-size="13" font-weight="800" text-anchor="${anchor}" fill="#475569">${escapeText(col.label)}</text>`;
    }).join('');

    const allRows = [
        ...view.rows.map((r) => ({
            staff_name: r.staff_name || '',
            target_booths: { count: r.target_booths || 0 },
            reserved_booth_count: { count: r.reserved_booth_count || 0 },
            deposit_booth_count: { count: r.deposit_booth_count || 0 },
            full_paid_booth_count: { count: r.full_paid_booth_count || 0 },
            remaining_target: { count: r.remaining_target || 0 },
            completion_rate: {
                pct: Number(r.completion_rate || 0),
                aux: `${fmtCount(Number(r.reserved_booth_count || 0) + Number(r.deposit_booth_count || 0) + Number(r.full_paid_booth_count || 0))}/${fmtCount(r.target_booths || 0)}`
            },
            receivable_total: { money: r.receivable_total || 0 },
            received_total: { money: r.received_total || 0 },
            collection_rate: { pct: Number(r.collection_rate || 0), aux: fmtMoney(r.received_total || 0) },
            isTotal: false
        })),
        {
            staff_name: '总计',
            target_booths: { count: view.totals.target },
            reserved_booth_count: { count: view.totals.reservedBooths },
            deposit_booth_count: { count: view.totals.depositBooths },
            full_paid_booth_count: { count: view.totals.fullPaidBooths },
            remaining_target: { count: view.totals.remainingTarget },
            completion_rate: { pct: Number(view.totalCompletionRate || 0), aux: `${fmtCount(view.totalProgressBooths)}/${fmtCount(view.totals.target)}` },
            receivable_total: { money: view.totals.receivable },
            received_total: { money: view.totals.received },
            collection_rate: { pct: Number(view.totalCollectionRate || 0), aux: fmtMoney(view.totals.received) },
            isTotal: true
        }
    ];

    const renderText = (col, y, value, isTotal) => {
        const textX = col.align === 'left' ? col.x + 16 : col.x + col.width - 16;
        const anchor = col.align === 'left' ? 'start' : 'end';
        const fontWeight = isTotal ? '900' : (col.key === 'staff_name' ? '800' : '700');
        const fill = col.color || '#0f172a';
        return `<text x="${textX}" y="${y + 26}" font-size="13" font-weight="${fontWeight}" text-anchor="${anchor}" fill="${fill}">${escapeText(value)}</text>`;
    };

    const renderProgress = (col, y, raw, isTotal) => {
        const pct = clampPct(raw.pct);
        const label = `${Number(raw.pct || 0).toFixed(1).replace(/\.0$/, '')}%`;
        const aux = raw.aux || '';
        const baseX = col.x + 14;
        const lineW = col.width - 28;
        const fontWeight = isTotal ? '900' : '800';
        const trackY = y + rowHeight - 13;
        return `
            <text x="${baseX}" y="${y + 18}" font-size="12" font-weight="${fontWeight}" fill="#334155">${escapeText(label)}</text>
            <text x="${baseX + lineW}" y="${y + 18}" font-size="11" font-weight="700" text-anchor="end" fill="#94a3b8">${escapeText(aux)}</text>
            <rect x="${baseX}" y="${trackY}" width="${lineW}" height="5" rx="2.5" fill="#e2e8f0"/>
            <rect x="${baseX}" y="${trackY}" width="${(pct / 100) * lineW}" height="5" rx="2.5" fill="url(#bar-${col.barColor})"/>
        `;
    };

    const dataRowsSvg = allRows.map((row, idx) => {
        const y = tableY + tableHeaderHeight + idx * rowHeight;
        const isTotal = row.isTotal;
        const rowFill = isTotal ? '#f1f5f9' : (idx % 2 === 0 ? '#ffffff' : '#fbfdff');
        const bg = `<rect x="${padding}" y="${y}" width="${innerWidth}" height="${rowHeight}" fill="${rowFill}"/>`;
        const topBorder = isTotal ? `<line x1="${padding}" y1="${y}" x2="${padding + innerWidth}" y2="${y}" stroke="#cbd5e1" stroke-width="2"/>` : '';
        const bottomBorder = !isTotal ? `<line x1="${padding}" y1="${y + rowHeight}" x2="${padding + innerWidth}" y2="${y + rowHeight}" stroke="#f1f5f9"/>` : '';
        const cells = columns.map((col) => {
            const raw = row[col.key];
            if (col.type === 'progress') return renderProgress(col, y, raw, isTotal);
            if (col.type === 'count') return renderText(col, y, fmtCount(raw.count || 0), isTotal);
            if (col.type === 'money') return renderText(col, y, fmtMoney(raw.money || 0), isTotal);
            return renderText(col, y, raw || '', isTotal);
        }).join('');
        return `${bg}${topBorder}${cells}${bottomBorder}`;
    }).join('');

    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="bar-slate" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#64748b"/>
                    <stop offset="100%" stop-color="#334155"/>
                </linearGradient>
                <linearGradient id="bar-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#34d399"/>
                    <stop offset="100%" stop-color="#059669"/>
                </linearGradient>
                <clipPath id="sales-table-clip">
                    <rect x="${padding}" y="${tableY}" width="${innerWidth}" height="${tableHeight}" rx="16"/>
                </clipPath>
            </defs>
            <rect width="${width}" height="${height}" fill="#f8fafc"/>
            <text x="${padding}" y="${headerY}" font-size="30" font-weight="900" fill="#0f172a">业务员销售情况全景</text>
            <text x="${padding}" y="${subtitleY}" font-size="13" font-weight="600" fill="#64748b">项目：${escapeText(projectName)} ｜ 范围：${escapeText(view.periodLabel)} ｜ 导出时间：${escapeText(exportTime)} ｜ 导出人：${escapeText(window.currentUser?.name || '')}</text>
            ${summarySvg}
            <g clip-path="url(#sales-table-clip)">
                <rect x="${padding}" y="${tableY}" width="${innerWidth}" height="${tableHeight}" fill="#ffffff"/>
                <rect x="${padding}" y="${tableY}" width="${innerWidth}" height="${tableHeaderHeight}" fill="#f1f5f9"/>
                <line x1="${padding}" y1="${tableY + tableHeaderHeight}" x2="${padding + innerWidth}" y2="${tableY + tableHeaderHeight}" stroke="#e2e8f0"/>
                ${headerCellsSvg}
                ${dataRowsSvg}
            </g>
            <rect x="${padding}" y="${tableY}" width="${innerWidth}" height="${tableHeight}" rx="16" fill="none" stroke="#e2e8f0"/>
        </svg>
    `.trim();
}

window.downloadHomeSalesListPng = function(svgText, filenameBase) {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob((blob) => {
            if (!blob) return;
            const pngUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `${filenameBase}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(pngUrl);
        }, 'image/png');
    };
    img.src = svgUrl;
}


window.exportHomeSalesListLongImage = function() {
    if (!window.isSuperAdmin?.(window.currentUser)) return;
    const view = window.getHomeSalesListViewModel(
        window.homeDashboardData?.sales_list_periods || {},
        window.homeDashboardData?.sales_list_meta || {}
    );
    const svg = window.buildHomeSalesListLongImageSvg(view);
    window.openPrintModal({
        title: '长图预览',
        contentHtml: `
            <div class="space-y-3">
                <div class="text-sm text-slate-500">下方为当前页面视角生成的长图预览，确认后可导出为 PNG。</div>
                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 overflow-auto">
                    <img id="home-sales-list-long-image-preview" alt="业务员销售情况全景长图预览" class="w-full h-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                </div>
            </div>
        `,
        shellClass: 'bg-white shadow-2xl w-full max-w-7xl flex flex-col max-h-[95vh]',
        contentClass: 'p-5 bg-white text-black overflow-y-auto flex-1',
        primaryText: '下载PNG',
        primaryAction: () => {
            window.downloadHomeSalesListPng(svg, `业务员销售情况全景-${view.periodLabel}-${new Date().toISOString().slice(0, 10)}`);
        }
    });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    currentPrintObjectUrl = URL.createObjectURL(blob);
    const previewEl = document.getElementById('home-sales-list-long-image-preview');
    if (previewEl) {
        previewEl.src = currentPrintObjectUrl;
    }
}

window.exportHomeSalesListExcel = function() {
    if (!window.isSuperAdmin?.(window.currentUser)) return;
    const view = window.getHomeSalesListViewModel(
        window.homeDashboardData?.sales_list_periods || {},
        window.homeDashboardData?.sales_list_meta || {}
    );
    const { projectName, exportTime, fmtCount, fmtMoney, fmtPercent, sortSummary } = window.getHomeSalesListExportContext(view);
    const escapeCell = (value) => window.escapeHtml(String(value ?? ''));
    const rowsHtml = view.rows.map((row) => `
        <tr>
            <td>${escapeCell(row.staff_name || '')}</td>
            <td>${escapeCell(fmtCount(row.target_booths || 0))}</td>
            <td>${escapeCell(fmtCount(row.reserved_booth_count || 0))}</td>
            <td>${escapeCell(fmtCount(row.deposit_booth_count || 0))}</td>
            <td>${escapeCell(fmtCount(row.full_paid_booth_count || 0))}</td>
            <td>${escapeCell(fmtCount(row.remaining_target || 0))}</td>
            <td>${escapeCell(fmtPercent(row.completion_rate || 0))}</td>
            <td>${escapeCell(fmtMoney(row.receivable_total || 0))}</td>
            <td>${escapeCell(fmtMoney(row.received_total || 0))}</td>
            <td>${escapeCell(fmtPercent(row.collection_rate || 0))}</td>
        </tr>
    `).join('');
    const workbookHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; }
                table { border-collapse: collapse; width: 100%; }
                td, th { border: 1px solid #d7dee7; padding: 6px 8px; font-size: 12px; }
                th { background: #f3f6fa; font-weight: 700; }
                .meta-label { background: #f8fafc; width: 120px; font-weight: 700; }
                .total-row td { background: #eef3f8; font-weight: 700; }
            </style>
        </head>
        <body>
            <table>
                <tr><td class="meta-label">报表</td><td colspan="9">业务员销售情况全景</td></tr>
                <tr><td class="meta-label">项目</td><td colspan="9">${escapeCell(projectName)}</td></tr>
                <tr><td class="meta-label">导出范围</td><td colspan="9">${escapeCell(view.periodLabel)}</td></tr>
                <tr><td class="meta-label">导出时间</td><td colspan="9">${escapeCell(exportTime)}</td></tr>
                <tr><td class="meta-label">导出人</td><td colspan="9">${escapeCell(window.currentUser?.name || '')}</td></tr>
                <tr><td class="meta-label">冠军</td><td colspan="9">${escapeCell(view.meta.champion_name || '暂无')}</td></tr>
                <tr><td class="meta-label">冠军口径</td><td colspan="9">${escapeCell(view.championMetricLabel)}</td></tr>
                <tr><td class="meta-label">排序</td><td colspan="9">${escapeCell(sortSummary)}</td></tr>
            </table>
            <br />
            <table>
                <thead>
                    <tr>
                        <th>业务员</th>
                        <th>目标展位数</th>
                        <th>预留展位数</th>
                        <th>定金展位数</th>
                        <th>全款展位数</th>
                        <th>剩余目标数</th>
                        <th>完成比例</th>
                        <th>总计应收费用</th>
                        <th>总计已收费用</th>
                        <th>已收费用占比</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    <tr class="total-row">
                        <td>总计</td>
                        <td>${escapeCell(fmtCount(view.totals.target))}</td>
                        <td>${escapeCell(fmtCount(view.totals.reservedBooths))}</td>
                        <td>${escapeCell(fmtCount(view.totals.depositBooths))}</td>
                        <td>${escapeCell(fmtCount(view.totals.fullPaidBooths))}</td>
                        <td>${escapeCell(fmtCount(view.totals.remainingTarget))}</td>
                        <td>${escapeCell(fmtPercent(view.totalCompletionRate))}</td>
                        <td>${escapeCell(fmtMoney(view.totals.receivable))}</td>
                        <td>${escapeCell(fmtMoney(view.totals.received))}</td>
                        <td>${escapeCell(fmtPercent(view.totalCollectionRate))}</td>
                    </tr>
                </tbody>
            </table>
        </body>
        </html>
    `;
    const blob = new Blob(['\uFEFF', workbookHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `业务员销售情况全景-${view.periodLabel}-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

window.renderHomeSalesList = function(periodMap, metaMap = {}) {
    const container = document.getElementById('home-sales-list');
    if (!container) return;

    const view = window.getHomeSalesListViewModel(periodMap, metaMap);
    const { activeId, periodLabel, championTitle, championDescription, championMetricLabel, isTotalChampion, rows, meta, totals, totalProgressBooths, totalCompletionRate, totalCollectionRate } = view;

    const fmtCount = window.formatCompactCount;
    const fmtMoney = window.formatCurrency;
    const fmtPercent = window.formatCompactPercent;
    const isSuperAdmin = !!window.isSuperAdmin?.(window.currentUser);

    const SCOPED_STYLE = `
        <style>
            .hsl-v2 { --hsl-blue:#2563eb; --hsl-blue-soft:#dbeafe; --hsl-emerald:#10b981; --hsl-emerald-soft:#d1fae5; --hsl-amber:#f59e0b; --hsl-amber-soft:#fef3c7; --hsl-rose:#e11d48; --hsl-slate-50:#f8fafc; --hsl-slate-100:#f1f5f9; --hsl-slate-200:#e2e8f0; --hsl-slate-400:#94a3b8; --hsl-slate-500:#64748b; --hsl-slate-700:#334155; --hsl-slate-900:#0f172a; }
            .hsl-v2 .hsl-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:12px; }
            .hsl-v2 .hsl-toolbar-tip { display:inline-flex; align-items:center; gap:6px; color:var(--hsl-slate-500); font-size:12px; }
            .hsl-v2 .hsl-toolbar-tip-dot { width:6px; height:6px; border-radius:999px; background:var(--hsl-blue); }
            .hsl-v2 .hsl-search { position:relative; }
            .hsl-v2 .hsl-search input { width:200px; padding:7px 10px 7px 30px; border-radius:10px; border:1px solid var(--hsl-slate-200); background:#fff; font-size:13px; transition:border-color .15s, box-shadow .15s; }
            .hsl-v2 .hsl-search input:focus { outline:none; border-color:var(--hsl-blue); box-shadow:0 0 0 3px rgba(37,99,235,0.15); }
            .hsl-v2 .hsl-search::before { content:''; position:absolute; left:9px; top:50%; transform:translateY(-50%); width:14px; height:14px; background-image:url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E"); background-size:contain; background-repeat:no-repeat; }
            .hsl-v2 .hsl-toolbar-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; font-size:12px; font-weight:700; border-radius:10px; background:#fff; color:var(--hsl-slate-700); border:1px solid var(--hsl-slate-200); cursor:pointer; transition:background .15s, border-color .15s; }
            .hsl-v2 .hsl-toolbar-btn:hover { background:var(--hsl-slate-50); border-color:var(--hsl-slate-400); }
            .hsl-v2 .hsl-toolbar-btn[data-tone="primary"] { background:var(--hsl-slate-900); color:#fff; border-color:var(--hsl-slate-900); }
            .hsl-v2 .hsl-toolbar-btn[data-tone="primary"]:hover { background:#1e293b; }
            .hsl-v2 .hsl-toolbar-btn[data-tone="ghost"] { background:transparent; }
            .hsl-v2 .hsl-toolbar-spacer { flex:1; min-width:8px; }
            .hsl-v2 .hsl-champion { display:flex; flex-wrap:wrap; align-items:center; gap:18px; padding:18px 20px; margin-bottom:14px; border:1px solid var(--hsl-slate-200); border-radius:18px; background:linear-gradient(135deg, #fff 0%, #f8fafc 100%); position:relative; overflow:hidden; }
            .hsl-v2 .hsl-champion::after { content:''; position:absolute; right:-40px; top:-40px; width:160px; height:160px; border-radius:50%; background:radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%); pointer-events:none; }
            .hsl-v2 .hsl-champion-icon { width:64px; height:64px; border-radius:18px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, #fde68a 0%, #f59e0b 100%); color:#fff; flex-shrink:0; box-shadow:0 6px 20px -8px rgba(245,158,11,0.5); }
            .hsl-v2 .hsl-champion-info { flex:1; min-width:200px; }
            .hsl-v2 .hsl-champion-tag { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; font-size:11px; font-weight:800; letter-spacing:0.08em; color:var(--hsl-blue); background:var(--hsl-blue-soft); border-radius:999px; }
            .hsl-v2 .hsl-champion-name { font-size:34px; font-weight:900; color:var(--hsl-slate-900); margin-top:6px; line-height:1.05; letter-spacing:-0.01em; }
            .hsl-v2 .hsl-champion-desc { font-size:12px; color:var(--hsl-slate-500); margin-top:6px; }
            .hsl-v2 .hsl-champion-metric { display:flex; flex-direction:column; align-items:flex-end; padding-left:18px; border-left:1px solid var(--hsl-slate-200); min-width:160px; }
            .hsl-v2 .hsl-champion-metric-label { font-size:11px; font-weight:700; color:var(--hsl-slate-500); letter-spacing:0.05em; }
            .hsl-v2 .hsl-champion-metric-value { font-size:48px; font-weight:900; color:var(--hsl-slate-900); line-height:1; margin-top:6px; font-variant-numeric:tabular-nums; }
            .hsl-v2 .hsl-champion-metric-note { font-size:11px; color:var(--hsl-slate-400); margin-top:4px; }
            .hsl-v2 .hsl-table-wrap { border:1px solid var(--hsl-slate-200); border-radius:14px; overflow:hidden; background:#fff; min-width:0; }
            .hsl-v2 .hsl-table-scroll { overflow:auto; max-width:100%; max-height:70vh; -webkit-overflow-scrolling:touch; touch-action:pan-x pan-y; }
            .hsl-v2 table.hsl-table { width:100%; min-width:1180px; table-layout:fixed; border-collapse:separate; border-spacing:0; font-size:13px; }
            .hsl-v2 .hsl-col-staff { width:15%; }
            .hsl-v2 .hsl-col-count { width:6%; }
            .hsl-v2 .hsl-col-progress { width:14%; }
            .hsl-v2 .hsl-col-money { width:13.5%; }
            .hsl-v2 .hsl-table thead th { position:sticky; top:0; z-index:5; background:var(--hsl-slate-50); color:var(--hsl-slate-500); font-weight:800; font-size:11.5px; letter-spacing:0.04em; padding:9px 10px; border-bottom:1px solid var(--hsl-slate-200); white-space:nowrap; text-align:right; }
            .hsl-v2 .hsl-table thead th.hsl-th-left { text-align:left; }
            .hsl-v2 .hsl-table thead th.hsl-th-center { text-align:center; }
            .hsl-v2 .hsl-table tbody td { padding:9px 10px; border-bottom:1px solid var(--hsl-slate-100); vertical-align:middle; }
            .hsl-v2 .hsl-table tbody tr:nth-child(even) td { background:#fafbfc; }
            .hsl-v2 .hsl-table tbody tr:hover td { background:#eff6ff !important; }
            .hsl-v2 .hsl-table tbody tr.hsl-row-total td { background:#f1f5f9 !important; font-weight:900; border-top:2px solid var(--hsl-slate-200); border-bottom:none; }
            .hsl-v2 .hsl-staff { display:flex; align-items:center; gap:10px; min-width:0; }
            .hsl-v2 .hsl-avatar { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:900; letter-spacing:0; flex-shrink:0; user-select:none; }
            .hsl-v2 .hsl-staff-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:800; color:var(--hsl-slate-900); font-size:13px; }
            .hsl-v2 .hsl-num { font-variant-numeric:tabular-nums; font-feature-settings:"tnum"; text-align:right; font-weight:700; }
            .hsl-v2 .hsl-num-strong { color:var(--hsl-slate-900); font-weight:800; }
            .hsl-v2 .hsl-num-mute { color:var(--hsl-slate-400); }
            .hsl-v2 .hsl-money-receivable { color:var(--hsl-slate-700); }
            .hsl-v2 .hsl-money-received { color:var(--hsl-emerald); font-weight:800; }
            .hsl-v2 .hsl-progress-cell { min-width:0; }
            .hsl-v2 .hsl-progress-row { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11.5px; }
            .hsl-v2 .hsl-progress-pct { flex:0 0 auto; font-weight:900; font-variant-numeric:tabular-nums; }
            .hsl-v2 .hsl-progress-pct[data-tier="t0"] { color:var(--hsl-slate-400); }
            .hsl-v2 .hsl-progress-pct[data-tier="t1"] { color:var(--hsl-blue); }
            .hsl-v2 .hsl-progress-pct[data-tier="t2"] { color:var(--hsl-emerald); }
            .hsl-v2 .hsl-progress-pct[data-tier="t3"] { color:var(--hsl-amber); }
            .hsl-v2 .hsl-progress-frac { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--hsl-slate-400); font-weight:700; font-variant-numeric:tabular-nums; }
            .hsl-v2 .hsl-progress-track { display:block; width:100%; min-width:0; margin-top:5px; height:6px; border-radius:999px; background:var(--hsl-slate-100); overflow:hidden; }
            .hsl-v2 .hsl-progress-fill { display:block; height:100%; border-radius:999px; transition:width .25s ease; }
            .hsl-v2 .hsl-progress-fill[data-tier="t0"] { background:#cbd5e1; }
            .hsl-v2 .hsl-progress-fill[data-tier="t1"] { background:linear-gradient(to right, #60a5fa, #2563eb); }
            .hsl-v2 .hsl-progress-fill[data-tier="t2"] { background:linear-gradient(to right, #34d399, #10b981); }
            .hsl-v2 .hsl-progress-fill[data-tier="t3"] { background:linear-gradient(to right, #fbbf24, #f59e0b); }
            .hsl-v2 .hsl-stack-cell { min-width:200px; }
            .hsl-v2 .hsl-stack-bar { display:flex; height:10px; border-radius:6px; overflow:hidden; background:#e5e7eb; }
            .hsl-v2 .hsl-stack-seg { height:100%; transition:flex-grow .25s ease; }
            .hsl-v2 .hsl-stack-seg[data-kind="reserved"] { background:#93c5fd; }
            .hsl-v2 .hsl-stack-seg[data-kind="deposit"] { background:#fbbf24; }
            .hsl-v2 .hsl-stack-seg[data-kind="full"] { background:#10b981; }
            .hsl-v2 .hsl-stack-seg[data-kind="remain"] { background:#e5e7eb; }
            .hsl-v2 .hsl-stack-legend { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:6px; font-size:11px; color:var(--hsl-slate-500); }
            .hsl-v2 .hsl-stack-chip { display:inline-flex; align-items:center; gap:4px; }
            .hsl-v2 .hsl-stack-chip-dot { width:8px; height:8px; border-radius:2px; }
            .hsl-v2 .hsl-stack-chip-dot[data-kind="reserved"] { background:#93c5fd; }
            .hsl-v2 .hsl-stack-chip-dot[data-kind="deposit"] { background:#fbbf24; }
            .hsl-v2 .hsl-stack-chip-dot[data-kind="full"] { background:#10b981; }
            .hsl-v2 .hsl-stack-chip-dot[data-kind="remain"] { background:#cbd5e1; }
            .hsl-v2 .hsl-stack-chip-num { font-weight:800; color:var(--hsl-slate-700); font-variant-numeric:tabular-nums; }
            .hsl-v2 .hsl-rank-1 td:first-child { box-shadow:inset 3px 0 0 #f59e0b; }
            .hsl-v2 .hsl-rank-2 td:first-child { box-shadow:inset 3px 0 0 #94a3b8; }
            .hsl-v2 .hsl-rank-3 td:first-child { box-shadow:inset 3px 0 0 #a16207; }
            .hsl-v2 .hsl-row-100 td:last-child { position:relative; }
            .hsl-v2 .hsl-medal { display:inline-flex; width:18px; height:18px; border-radius:50%; align-items:center; justify-content:center; font-size:10px; font-weight:900; color:#fff; margin-left:4px; }
            .hsl-v2 .hsl-medal[data-rank="1"] { background:#f59e0b; }
            .hsl-v2 .hsl-medal[data-rank="2"] { background:#94a3b8; }
            .hsl-v2 .hsl-medal[data-rank="3"] { background:#a16207; }
            .hsl-v2 .hsl-empty { padding:32px 20px; text-align:center; color:var(--hsl-slate-500); font-size:13px; background:var(--hsl-slate-50); border-radius:14px; border:1px dashed var(--hsl-slate-200); }
        </style>
    `;

    // Build period tabs HTML once
    const periodTabsHtml = window.renderHomeFilterTabs(activeId, 'window.switchHomeSalesListPeriod', 'home-sales-list', 'window.onHomeDateRangeChange');

    const exportButtonsHtml = isSuperAdmin
        ? `
            <button onclick="window.exportHomeSalesListReport()" class="hsl-toolbar-btn" title="导出 A4 横向报告 PDF">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>
                <span>A4 报告</span>
            </button>
            <button onclick="window.exportHomeSalesListLongImage()" class="hsl-toolbar-btn" title="预览长图（可截图分享）">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                <span>长图</span>
            </button>
            <button onclick="window.exportHomeSalesListExcel()" class="hsl-toolbar-btn" data-tone="primary" title="导出 Excel">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5v10.5"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/></svg>
                <span>Excel</span>
            </button>
        `
        : '';

    const sortResetBtn = window.homeSalesListSortKey
        ? `<button onclick="window.resetHomeSalesListSort()" class="hsl-toolbar-btn" data-tone="ghost" title="清除自定义排序">恢复默认顺序</button>`
        : '';

    if (!rows || rows.length === 0) {
        const emptyText = `${window.escapeHtml(periodLabel)} 范围暂无可展示的业务员销售数据。`;
        container.innerHTML = `
            <div class="hsl-v2">
                ${SCOPED_STYLE}
                <div class="hsl-toolbar">
                    <span class="hsl-toolbar-tip"><span class="hsl-toolbar-tip-dot"></span>切换周期或日期范围，业务员推进与冠军会同步变化</span>
                    <div class="hsl-toolbar-spacer"></div>
                    ${periodTabsHtml}
                </div>
                <div class="hsl-toolbar" style="margin-top:-6px;">
                    ${sortResetBtn}
                    <div class="hsl-toolbar-spacer"></div>
                    ${exportButtonsHtml}
                </div>
                <div class="hsl-empty">${emptyText}</div>
            </div>
        `;
        return;
    }

    const championName = String(meta.champion_name || '暂无');
    const championInitial = (championName.match(/[\u4e00-\u9fa5]/)?.[0]) || championName.charAt(0) || '?';
    const tierClass = (rate) => {
        const r = Number(rate || 0);
        if (r <= 0) return 't0';
        if (r >= 90) return 't3';
        if (r >= 60) return 't2';
        return 't1';
    };
    const avatarColor = (name) => {
        const palette = ['#2563eb', '#0891b2', '#059669', '#9333ea', '#ea580c', '#0284c7', '#7c3aed', '#db2777', '#0d9488', '#dc2626', '#65a30d', '#4f46e5'];
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return palette[h % palette.length];
    };
    const safeNum = (v) => Number(v || 0);
    const fmtMaybeFraction = (v) => safeNum(v).toFixed(2).replace(/\.00$/, '');

    container.innerHTML = `
        <div class="hsl-v2">
            ${SCOPED_STYLE}
            <div class="hsl-toolbar">
                <span class="hsl-toolbar-tip"><span class="hsl-toolbar-tip-dot"></span>切换周期或日期范围，业务员推进与冠军会同步变化</span>
                <div class="hsl-toolbar-spacer"></div>
                ${periodTabsHtml}
            </div>
            <div class="hsl-toolbar" style="margin-top:-6px;">
                ${sortResetBtn}
                <span class="hsl-toolbar-tip" title="${window.escapeHtml('该板块所有账号都可查看全部业务员信息')}" style="cursor:help;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    可见性说明
                </span>
                <div class="hsl-toolbar-spacer"></div>
                ${exportButtonsHtml}
            </div>
            <div class="hsl-champion">
                <div class="hsl-champion-icon">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                </div>
                <div class="hsl-champion-info">
                    <span class="hsl-champion-tag">${window.escapeHtml(championTitle)}</span>
                    <div class="hsl-champion-name">${window.escapeHtml(championName)}</div>
                    <div class="hsl-champion-desc">${championDescription}${isTotalChampion ? ' · 统计累计已发生收款的展位数' : ' · 首次收款发生在当前周期的新增企业'}</div>
                </div>
                <div class="hsl-champion-metric">
                    <span class="hsl-champion-metric-label">${window.escapeHtml(championMetricLabel)}</span>
                    <span class="hsl-champion-metric-value">${fmtCount(meta.champion_booth_count || 0)}</span>
                    <span class="hsl-champion-metric-note">单位：展位</span>
                </div>
            </div>
            <div class="hsl-table-wrap">
                <div class="hsl-table-scroll">
                    <table class="hsl-table">
                        <colgroup>
                            <col class="hsl-col-staff">
                            <col class="hsl-col-count">
                            <col class="hsl-col-count">
                            <col class="hsl-col-count">
                            <col class="hsl-col-count">
                            <col class="hsl-col-count">
                            <col class="hsl-col-progress">
                            <col class="hsl-col-money">
                            <col class="hsl-col-money">
                            <col class="hsl-col-progress">
                        </colgroup>
                        <thead>
                            <tr>
                                <th class="hsl-th-left">${window.renderHomeSalesListSortHeader('业务员', 'staff_name', 'left')}</th>
                                <th>${window.renderHomeSalesListSortHeader('目标', 'target_booths', 'right')}</th>
                                <th>${window.renderHomeSalesListSortHeader('预留', 'reserved_booth_count', 'right')}</th>
                                <th>${window.renderHomeSalesListSortHeader('定金', 'deposit_booth_count', 'right')}</th>
                                <th>${window.renderHomeSalesListSortHeader('全款', 'full_paid_booth_count', 'right')}</th>
                                <th>${window.renderHomeSalesListSortHeader('剩余', 'remaining_target', 'right')}</th>
                                <th class="hsl-th-left">${window.renderHomeSalesListSortHeader('完成比例', 'completion_rate', 'left')}</th>
                                <th>${window.renderHomeSalesListSortHeader('总应收', 'receivable_total', 'right')}</th>
                                <th>${window.renderHomeSalesListSortHeader('已收', 'received_total', 'right')}</th>
                                <th class="hsl-th-left">${window.renderHomeSalesListSortHeader('已收占比', 'collection_rate', 'left')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((row) => {
                                const completionRate = safeNum(row.completion_rate);
                                const collectionRate = safeNum(row.collection_rate);
                                const target = safeNum(row.target_booths);
                                const reserved = safeNum(row.reserved_booth_count);
                                const deposit = safeNum(row.deposit_booth_count);
                                const fullPaid = safeNum(row.full_paid_booth_count);
                                const remain = safeNum(row.remaining_target);
                                const compTier = tierClass(completionRate);
                                const collTier = tierClass(collectionRate);
                                const name = String(row.staff_name || '');
                                const initial = (name.match(/[\u4e00-\u9fa5]/)?.[0]) || name.charAt(0) || '?';
                                const avatarBg = avatarColor(name);
                                const isFullCollect = collectionRate >= 99.95;
                                return `
                                    <tr>
                                        <td class="hsl-th-left">
                                            <div class="hsl-staff">
                                                <div class="hsl-avatar" style="background:${avatarBg};">${window.escapeHtml(initial)}</div>
                                                <div class="hsl-staff-name">${window.escapeHtml(name)}</div>
                                            </div>
                                        </td>
                                        <td class="hsl-num hsl-num-strong">${fmtMaybeFraction(target)}</td>
                                        <td class="hsl-num" style="color:#2563eb;">${fmtMaybeFraction(reserved)}</td>
                                        <td class="hsl-num" style="color:#b45309;">${fmtMaybeFraction(deposit)}</td>
                                        <td class="hsl-num" style="color:#047857;">${fmtMaybeFraction(fullPaid)}</td>
                                        <td class="hsl-num hsl-num-mute">${fmtMaybeFraction(remain)}</td>
                                        <td class="hsl-progress-cell">
                                            <div class="hsl-progress-row">
                                                <span class="hsl-progress-pct" data-tier="${compTier}">${completionRate.toFixed(1).replace(/\.0$/, '')}%</span>
                                                <span class="hsl-progress-frac">${fmtMaybeFraction(reserved + deposit + fullPaid)}/${fmtMaybeFraction(target)}</span>
                                            </div>
                                            <div class="hsl-progress-track"><div class="hsl-progress-fill" data-tier="${compTier}" style="width:${Math.max(0, Math.min(completionRate, 100))}%"></div></div>
                                        </td>
                                        <td class="hsl-num hsl-money-receivable">${safeNum(row.receivable_total) > 0 ? fmtMoney(row.receivable_total) : '<span class="hsl-num-mute">¥0</span>'}</td>
                                        <td class="hsl-num hsl-money-received">${safeNum(row.received_total) > 0 ? fmtMoney(row.received_total) : '<span class="hsl-num-mute">¥0</span>'}</td>
                                        <td class="hsl-progress-cell">
                                            <div class="hsl-progress-row">
                                                <span class="hsl-progress-pct" data-tier="${collTier}">${collectionRate.toFixed(1).replace(/\.0$/, '')}%${isFullCollect ? ' ★' : ''}</span>
                                                <span class="hsl-progress-frac">${fmtMoney(row.received_total || 0)}</span>
                                            </div>
                                            <div class="hsl-progress-track"><div class="hsl-progress-fill" data-tier="${collTier}" style="width:${Math.max(0, Math.min(collectionRate, 100))}%"></div></div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                            <tr class="hsl-row-total">
                                <td class="hsl-th-left">
                                    <div class="hsl-staff">
                                        <div class="hsl-avatar" style="background:#0f172a;">总</div>
                                        <div class="hsl-staff-name">总计 <span class="hsl-num-mute" style="font-weight:600; margin-left:4px;">${rows.length} 人</span></div>
                                    </div>
                                </td>
                                <td class="hsl-num hsl-num-strong">${fmtCount(totals.target)}</td>
                                <td class="hsl-num" style="color:#2563eb;">${fmtCount(totals.reservedBooths)}</td>
                                <td class="hsl-num" style="color:#b45309;">${fmtCount(totals.depositBooths)}</td>
                                <td class="hsl-num" style="color:#047857;">${fmtCount(totals.fullPaidBooths)}</td>
                                <td class="hsl-num hsl-num-mute">${fmtCount(totals.remainingTarget)}</td>
                                <td class="hsl-progress-cell">
                                    <div class="hsl-progress-row">
                                        <span class="hsl-progress-pct" data-tier="${tierClass(totalCompletionRate)}">${fmtPercent(totalCompletionRate)}</span>
                                        <span class="hsl-progress-frac">${fmtCount(totalProgressBooths)}/${fmtCount(totals.target)}</span>
                                    </div>
                                    <div class="hsl-progress-track"><div class="hsl-progress-fill" data-tier="${tierClass(totalCompletionRate)}" style="width:${Math.max(0, Math.min(totalCompletionRate, 100))}%"></div></div>
                                </td>
                                <td class="hsl-num hsl-money-receivable">${fmtMoney(totals.receivable)}</td>
                                <td class="hsl-num hsl-money-received">${fmtMoney(totals.received)}</td>
                                <td class="hsl-progress-cell">
                                    <div class="hsl-progress-row">
                                        <span class="hsl-progress-pct" data-tier="${tierClass(totalCollectionRate)}">${fmtPercent(totalCollectionRate)}</span>
                                        <span class="hsl-progress-frac">${fmtMoney(totals.received)}</span>
                                    </div>
                                    <div class="hsl-progress-track"><div class="hsl-progress-fill" data-tier="${tierClass(totalCollectionRate)}" style="width:${Math.max(0, Math.min(totalCollectionRate, 100))}%"></div></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}


window.renderHomeRegionTable = function(regionOverview, isAdmin) {
    const container = document.getElementById('home-region-table');
    const note = document.getElementById('home-region-scope-note');
    if (!container || !note) return;

    note.innerText = isAdmin
        ? `当前显示全部业务员范围：企业 ${regionOverview.total_company_count || 0} 家，折合展位数 ${Number(regionOverview.total_booth_count || 0).toFixed(2).replace(/\.00$/, '')} 个。`
        : `当前仅显示本人名下企业：企业 ${regionOverview.total_company_count || 0} 家，折合展位数 ${Number(regionOverview.total_booth_count || 0).toFixed(2).replace(/\.00$/, '')} 个。`;

    if (!regionOverview.sections || regionOverview.sections.length === 0) {
        container.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm text-gray-500">当前范围暂无企业地区数据。</div>';
        return;
    }

    container.innerHTML = regionOverview.sections.map((section) => `
        <div class="border border-slate-200 rounded-3xl overflow-hidden">
            <div class="bg-gradient-to-r from-slate-50 to-white px-5 py-4 border-b border-slate-200">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <div class="text-lg font-black text-slate-800">${window.escapeHtml(section.title)}</div>
                        <div class="text-xs text-slate-500 mt-1">${window.escapeHtml(section.description || '')}</div>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div class="bg-white rounded-xl border border-slate-200 px-3 py-2"><div class="text-slate-400">企业数</div><div class="font-black text-slate-700 mt-1">${section.summary.company_count || 0}</div></div>
                        <div class="bg-white rounded-xl border border-slate-200 px-3 py-2"><div class="text-slate-400">展位数</div><div class="font-black text-slate-700 mt-1">${Number(section.summary.booth_count || 0).toFixed(2).replace(/\.00$/, '')}</div></div>
                        <div class="bg-white rounded-xl border border-slate-200 px-3 py-2"><div class="text-slate-400">企业占比</div><div class="font-black text-slate-700 mt-1 tabular-data">${Number(section.summary.company_ratio || 0).toFixed(1).replace(/\.0$/, '')}%</div></div>
                        <div class="bg-white rounded-xl border border-slate-200 px-3 py-2"><div class="text-slate-400">展位占比</div><div class="font-black text-slate-700 mt-1 tabular-data">${Number(section.summary.booth_ratio || 0).toFixed(1).replace(/\.0$/, '')}%</div></div>
                    </div>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-100 text-slate-600">
                        <tr>
                            <th class="text-left px-5 py-3 font-bold">地区单元</th>
                            <th class="text-right px-5 py-3 font-bold">企业数</th>
                            <th class="text-right px-5 py-3 font-bold">展位数</th>
                            <th class="text-right px-5 py-3 font-bold">企业占比</th>
                            <th class="text-right px-5 py-3 font-bold">展位占比</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${section.rows.map((row) => `
                            <tr>
                                <td class="px-5 py-3 font-bold text-slate-800">${window.escapeHtml(row.label)}</td>
                                <td class="px-5 py-3 text-right text-slate-700 tabular-data">${row.company_count || 0}</td>
                                <td class="px-5 py-3 text-right text-slate-700 tabular-data">${Number(row.booth_count || 0).toFixed(2).replace(/\.00$/, '')}</td>
                                <td class="px-5 py-3 text-right text-slate-700 font-bold tabular-data">${Number(row.company_ratio || 0).toFixed(1).replace(/\.0$/, '')}%</td>
                                <td class="px-5 py-3 text-right text-slate-700 font-bold tabular-data">${Number(row.booth_ratio || 0).toFixed(1).replace(/\.0$/, '')}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');
}

window.renderHomeRegionChart = function(regionOverview) {
    const container = document.getElementById('home-region-chart');
    if (!container) return;

    const pieItems = Array.isArray(regionOverview?.pie_items) ? regionOverview.pie_items : [];
    if (pieItems.length === 0) {
        container.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm text-gray-500">当前范围暂无已成交企业地区分布数据。</div>';
        return;
    }

    const colors = ['#2563eb', '#14b8a6', '#f97316', '#8b5cf6', '#e11d48', '#0f766e', '#ca8a04', '#334155', '#06b6d4', '#4f46e5', '#16a34a', '#f59e0b'];
    const total = pieItems.reduce((sum, item) => sum + Number(item.company_count || 0), 0);
    const radius = 68;
    const centerX = 150;
    const centerY = 100;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    let cumulativeRatio = 0;

    const circles = pieItems.map((item, index) => {
        const value = Number(item.company_count || 0);
        const ratio = total > 0 ? value / total : 0;
        const length = ratio * circumference;
        const circle = `
            <circle
                cx="${centerX}"
                cy="${centerY}"
                r="${radius}"
                fill="none"
                stroke="${colors[index % colors.length]}"
                stroke-width="26"
                stroke-dasharray="${length} ${circumference - length}"
                stroke-dashoffset="${-offset}"
                stroke-linecap="butt"
                transform="rotate(-90 ${centerX} ${centerY})"
            ></circle>
        `;
        offset += length;
        return circle;
    }).join('');

    const labels = pieItems.map((item, index) => {
        const value = Number(item.company_count || 0);
        const ratio = total > 0 ? value / total : 0;
        if (ratio <= 0) return '';

        const midRatio = cumulativeRatio + ratio / 2;
        cumulativeRatio += ratio;
        const angle = (midRatio * Math.PI * 2) - (Math.PI / 2);
        const lineStartX = centerX + Math.cos(angle) * (radius + 2);
        const lineStartY = centerY + Math.sin(angle) * (radius + 2);
        const lineMidX = centerX + Math.cos(angle) * (radius + 16);
        const lineMidY = centerY + Math.sin(angle) * (radius + 16);
        const isRightSide = Math.cos(angle) >= 0;
        const lineEndX = lineMidX + (isRightSide ? 20 : -20);
        const rawLabel = String(item.label || '');
        const shortLabel = rawLabel.length > 10 ? `${rawLabel.slice(0, 10)}…` : rawLabel;
        const pillWidth = Math.max(72, Math.min(140, 24 + (shortLabel.length * 16)));
        const pillHeight = 28;
        const pillX = isRightSide
            ? Math.min(lineEndX + 8, 320 - pillWidth - 8)
            : Math.max(lineEndX - pillWidth - 8, 8);
        const pillY = Math.max(8, Math.min(lineMidY - (pillHeight / 2), 240 - pillHeight - 8));
        const textX = pillX + (pillWidth / 2);
        const textY = pillY + (pillHeight / 2) + 1;
        const lineStopX = isRightSide ? pillX - 8 : pillX + pillWidth + 8;

        return `
            <path d="M ${lineStartX.toFixed(2)} ${lineStartY.toFixed(2)} L ${lineMidX.toFixed(2)} ${lineMidY.toFixed(2)} L ${lineEndX.toFixed(2)} ${lineMidY.toFixed(2)} L ${lineStopX.toFixed(2)} ${(pillY + (pillHeight / 2)).toFixed(2)}"
                fill="none"
                stroke="${colors[index % colors.length]}"
                stroke-width="1.5"
                stroke-linecap="round"></path>
            <rect
                x="${pillX.toFixed(2)}"
                y="${pillY.toFixed(2)}"
                width="${pillWidth.toFixed(2)}"
                height="${pillHeight}"
                rx="14"
                fill="white"
                fill-opacity="0.96"
                stroke="${colors[index % colors.length]}"
                stroke-opacity="0.25"
            ></rect>
            <text
                x="${textX.toFixed(2)}"
                y="${textY.toFixed(2)}"
                text-anchor="middle"
                dominant-baseline="middle"
                font-size="10"
                font-weight="700"
                fill="#334155"
            >${window.escapeHtml(shortLabel)}</text>
        `;
    }).join('');

    const legend = pieItems.map((item, index) => `
        <div class="flex items-start gap-3 bg-slate-50 rounded-2xl border border-slate-100 px-4 py-3">
            <span class="w-3 h-3 rounded-full mt-1 shrink-0" style="background:${colors[index % colors.length]}"></span>
            <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-3">
                    <span class="font-bold text-slate-800 truncate">${window.escapeHtml(item.label)}</span>
                    <span class="text-xs font-black text-slate-500">${Number(item.company_ratio || 0).toFixed(1).replace(/\.0$/, '')}%</span>
                </div>
                <div class="text-xs text-slate-500 mt-1">企业 ${item.company_count || 0} 家，展位 ${Number(item.booth_count || 0).toFixed(2).replace(/\.00$/, '')} 个</div>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="flex flex-col items-center">
            <div class="relative">
                <svg viewBox="0 0 320 240" class="w-[34rem] max-w-full h-80">
                    <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="26"></circle>
                    ${circles}
                    ${labels}
                    <text x="${centerX}" y="${centerY - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="#64748b">成交企业</text>
                    <text x="${centerX}" y="${centerY + 20}" text-anchor="middle" font-size="34" font-weight="900" fill="#1e293b">${total}</text>
                    <text x="${centerX}" y="${centerY + 48}" text-anchor="middle" font-size="12" font-weight="700" fill="#94a3b8">分布占比</text>
                </svg>
            </div>
            <div class="w-full space-y-3 mt-4">${legend}</div>
        </div>
    `;
}

window.switchHomeHallInnerTab = function(tabId) {
    window.activeHomeHallTab = tabId;
    window.renderHomeHallTable(window.homeDashboardData?.hall_overview || [], window.homeDashboardData?.is_admin);
}

window.renderHomeHallTable = function(halls, isAdmin) {
    const section = document.getElementById('home-hall-section');
    const container = document.getElementById('home-hall-table');
    if (!section || !container) return;

    if (!isAdmin) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    if (!halls || halls.length === 0) {
        container.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm text-gray-500">当前项目暂无馆别经营数据。可在「展务 → 展位地图」分配馆号后回到这里查看。</div>';
        return;
    }

    const activeId = window.homeHallTabDefinitions.some((tab) => tab.id === window.activeHomeHallTab)
        ? window.activeHomeHallTab
        : 'landing';
    window.activeHomeHallTab = activeId;
    const fmtCount = window.formatCompactCount;
    const fmtMoney = window.formatCurrency;
    const fmtPercent = window.formatCompactPercent;

    const totals = halls.reduce((acc, hall) => {
        acc.configuredStandard += Number(hall.configured_standard_booth_count || 0);
        acc.configuredGround += Number(hall.configured_ground_booth_count || 0);
        acc.receivedStandard += Number(hall.received_standard_booth_count || 0);
        acc.receivedGround += Number(hall.received_ground_booth_count || 0);
        acc.receivedBooths += Number(hall.received_booth_count || 0);
        acc.remainingUnsold += Number(hall.remaining_unsold_booth_count || 0);
        acc.receivedCompanies += Number(hall.received_company_count || 0);
        acc.configuredTotal += Number(hall.configured_total_booth_count || 0);
        acc.chargedBooths += Number(hall.charged_booth_count || 0);
        acc.receivableBoothFee += Number(hall.receivable_booth_fee || 0);
        acc.receivedBoothFee += Number(hall.received_booth_fee || 0);
        acc.freeBooths += Number(hall.free_booth_count || 0);
        acc.reservedBooths += Number(hall.reserved_booth_count || 0);
        acc.reservedOrders += Number(hall.reserved_order_count || 0);
        acc.depositBooths += Number(hall.deposit_booth_count || 0);
        acc.depositOrders += Number(hall.deposit_order_count || 0);
        acc.fullPaidBooths += Number(hall.full_paid_booth_count || 0);
        acc.fullPaidOrders += Number(hall.full_paid_order_count || 0);
        acc.landedBooths += Number(hall.landed_booth_count || 0);
        acc.landedOrders += Number(hall.landed_order_count || 0);
        acc.remainingUnlanded += Number(hall.remaining_unlanded_booth_count || 0);
        return acc;
    }, {
        configuredStandard: 0,
        configuredGround: 0,
        receivedStandard: 0,
        receivedGround: 0,
        receivedBooths: 0,
        remainingUnsold: 0,
        receivedCompanies: 0,
        configuredTotal: 0,
        chargedBooths: 0,
        receivableBoothFee: 0,
        receivedBoothFee: 0,
        freeBooths: 0,
        reservedBooths: 0,
        reservedOrders: 0,
        depositBooths: 0,
        depositOrders: 0,
        fullPaidBooths: 0,
        fullPaidOrders: 0,
        landedBooths: 0,
        landedOrders: 0,
        remainingUnlanded: 0
    });
    const totalReceivedRate = totals.configuredTotal > 0 ? (totals.receivedBooths / totals.configuredTotal) * 100 : 0;
    const totalCollectionRate = totals.receivableBoothFee > 0 ? (totals.receivedBoothFee / totals.receivableBoothFee) * 100 : 0;
    const totalChargedAvg = totals.chargedBooths > 0 ? (totals.receivableBoothFee / totals.chargedBooths) : 0;
    const totalOverallAvg = totals.configuredTotal > 0 ? (totals.receivableBoothFee / totals.configuredTotal) : 0;
    const totalUnreceivedFee = Math.max(0, totals.receivableBoothFee - totals.receivedBoothFee);
    const totalFullPaidRate = totals.configuredTotal > 0 ? (totals.fullPaidBooths / totals.configuredTotal) * 100 : 0;

    // 剩余未售比例 → 颜色：>60% 中性、30-60% 琥珀、<30% 翠绿
    const remainingClass = (hall) => {
        const total = Number(hall.configured_total_booth_count || 0);
        const remaining = Number(hall.remaining_unsold_booth_count || 0);
        if (total <= 0) return 'text-slate-500';
        const ratio = remaining / total;
        if (ratio >= 0.6) return 'text-slate-700';
        if (ratio >= 0.3) return 'text-amber-700';
        return 'text-emerald-600';
    };
    const totalRemainingClass = (() => {
        if (totals.configuredTotal <= 0) return 'text-slate-700';
        const ratio = totals.remainingUnsold / totals.configuredTotal;
        if (ratio >= 0.6) return 'text-slate-700';
        if (ratio >= 0.3) return 'text-amber-700';
        return 'text-emerald-600';
    })();

    // 收款比例迷你进度条（固定宽度对齐基线，百分比文本定宽，便于上下列对齐）
    const percentBar = (rate, opts = {}) => {
        const v = Math.max(0, Math.min(100, Number(rate || 0)));
        const onDark = opts.onDark === true;
        const barColor = v >= 80 ? 'bg-emerald-500' : v >= 40 ? 'bg-sky-500' : 'bg-amber-500';
        const trackColor = onDark ? 'bg-white/15' : 'bg-slate-200/80';
        const textColor = onDark ? 'text-white' : 'text-slate-700';
        return `
            <div class="inline-flex items-center gap-2 align-middle">
                <div class="w-20 h-2 rounded-full ${trackColor} overflow-hidden shrink-0">
                    <div class="${barColor} h-full rounded-full transition-all" style="width:${v.toFixed(1)}%"></div>
                </div>
                <span class="tabular-data inline-block w-12 text-right font-bold ${textColor}">${fmtPercent(rate)}</span>
            </div>
        `;
    };

    // 馆号列样式（sticky 固定 + 表头不换行）
    const thBase = 'px-3 py-2.5 font-bold whitespace-nowrap';
    const thFirst = `text-left ${thBase} sticky left-0 z-[2] bg-slate-100`;
    const thRight = `text-right ${thBase}`;
    const tdFirst = 'px-3 py-3 font-black text-slate-800 whitespace-nowrap sticky left-0 z-[1] bg-white';
    // 总计行：浅色汇总条，保留区分度但不压过正文
    const totalRowClass = 'bg-slate-100/90 shadow-[inset_0_1px_0_rgba(203,213,225,0.9),inset_0_2px_0_rgba(255,255,255,0.55)]';
    const tdTotal = 'px-3 py-3 text-right font-black text-[13px] tabular-data text-slate-900';
    const tdTotalFirst = 'px-3 py-3 font-black text-[13px] sticky left-0 z-[1] bg-slate-100 text-slate-950 tracking-wide whitespace-nowrap';

    const boothTable = `
        <div class="border border-slate-200 rounded-3xl overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-[13px]">
                    <thead class="bg-slate-100 text-slate-600">
                        <tr>
                            <th class="${thFirst}">馆号</th>
                            <th class="${thRight}">总计设置展位数</th>
                            <th class="${thRight}">设置标摊展位数</th>
                            <th class="${thRight}">设置光地展位数</th>
                            <th class="${thRight}">已收款标摊展位数</th>
                            <th class="${thRight}">已收款光地展位数</th>
                            <th class="${thRight}">已收款展位数占比</th>
                            <th class="${thRight}">剩余未售展位数</th>
                            <th class="${thRight}">已收款企业数（家）</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${halls.map((hall) => `
                            <tr>
                                <td class="${tdFirst}">${window.escapeHtml(hall.hall)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-800 tabular-data">${fmtCount(hall.configured_total_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-700 tabular-data">${fmtCount(hall.configured_standard_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-600 tabular-data">${fmtCount(hall.configured_ground_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-emerald-700 tabular-data">${fmtCount(hall.received_standard_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-emerald-600 tabular-data">${fmtCount(hall.received_ground_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-700">${percentBar(hall.received_booth_rate)}</td>
                                <td class="px-3 py-3 text-right font-bold ${remainingClass(hall)} tabular-data">${fmtCount(hall.remaining_unsold_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-700 tabular-data">${hall.received_company_count || 0}</td>
                            </tr>
                        `).join('')}
                        <tr class="${totalRowClass}">
                            <td class="${tdTotalFirst}">总计</td>
                            <td class="${tdTotal}">${fmtCount(totals.configuredTotal)}</td>
                            <td class="${tdTotal} text-slate-800">${fmtCount(totals.configuredStandard)}</td>
                            <td class="${tdTotal} text-slate-700">${fmtCount(totals.configuredGround)}</td>
                            <td class="${tdTotal} text-emerald-700">${fmtCount(totals.receivedStandard)}</td>
                            <td class="${tdTotal} text-emerald-700">${fmtCount(totals.receivedGround)}</td>
                            <td class="px-3 py-3 text-right">${percentBar(totalReceivedRate)}</td>
                            <td class="${tdTotal} ${(() => { const r = totals.configuredTotal > 0 ? totals.remainingUnsold / totals.configuredTotal : 0; if (r >= 0.6) return 'text-slate-700'; if (r >= 0.3) return 'text-amber-700'; return 'text-emerald-700'; })()}">${fmtCount(totals.remainingUnsold)}</td>
                            <td class="${tdTotal}">${totals.receivedCompanies}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const financeTable = `
        <div class="border border-slate-200 rounded-3xl overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-[13px]">
                    <thead class="bg-slate-100 text-slate-600">
                        <tr>
                            <th class="${thFirst}">馆号</th>
                            <th class="${thRight}">设置展位数</th>
                            <th class="${thRight}">收费展位数</th>
                            <th class="${thRight}">应收展位费</th>
                            <th class="${thRight}">已收展位费</th>
                            <th class="${thRight}">未收展位费</th>
                            <th class="${thRight}">收款比例</th>
                            <th class="${thRight}">免费展位数</th>
                            <th class="${thRight}">收费展位平均单价</th>
                            <th class="${thRight}">总体平均单价</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${halls.map((hall) => {
                            const unreceived = Math.max(0, Number(hall.receivable_booth_fee || 0) - Number(hall.received_booth_fee || 0));
                            const unreceivedClass = unreceived > 0 ? 'text-amber-700' : 'text-slate-400';
                            return `
                            <tr>
                                <td class="${tdFirst}">${window.escapeHtml(hall.hall)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-800 tabular-data">${fmtCount(hall.configured_total_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-700 tabular-data">${fmtCount(hall.charged_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-rose-700 tabular-data">${fmtMoney(hall.receivable_booth_fee)}</td>
                                <td class="px-3 py-3 text-right font-bold text-emerald-700 tabular-data">${fmtMoney(hall.received_booth_fee)}</td>
                                <td class="px-3 py-3 text-right font-bold ${unreceivedClass} tabular-data">${fmtMoney(unreceived)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-700">${percentBar(hall.collection_rate)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-600 tabular-data">${fmtCount(hall.free_booth_count)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-700 tabular-data">${fmtMoney(hall.charged_avg_unit_price)}</td>
                                <td class="px-3 py-3 text-right font-bold text-slate-600 tabular-data">${fmtMoney(hall.overall_avg_unit_price)}</td>
                            </tr>
                        `;}).join('')}
                        <tr class="${totalRowClass}">
                            <td class="${tdTotalFirst}">总计</td>
                            <td class="${tdTotal}">${fmtCount(totals.configuredTotal)}</td>
                            <td class="${tdTotal} text-slate-800">${fmtCount(totals.chargedBooths)}</td>
                            <td class="${tdTotal} text-rose-700">${fmtMoney(totals.receivableBoothFee)}</td>
                            <td class="${tdTotal} text-emerald-700">${fmtMoney(totals.receivedBoothFee)}</td>
                            <td class="${tdTotal} ${totalUnreceivedFee > 0 ? 'text-amber-700' : 'text-slate-500'}">${fmtMoney(totalUnreceivedFee)}</td>
                            <td class="px-3 py-3 text-right">${percentBar(totalCollectionRate)}</td>
                            <td class="${tdTotal} text-slate-700">${fmtCount(totals.freeBooths)}</td>
                            <td class="${tdTotal} text-slate-800">${fmtMoney(totalChargedAvg)}</td>
                            <td class="${tdTotal} text-slate-700">${fmtMoney(totalOverallAvg)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // 落位概况：按支付阶段拆分（预留 / 定金 / 全款）+ 已收/未收 展位费
    // 为了列间纵向对齐：展位数靠左边 定宽右对齐，“/N家”靠右边 定宽左对齐，中间不换行
    const stagePairCell = (booths, orders, opts = {}) => {
        const colorBooths = opts.colorBooths || 'text-slate-800';
        const colorOrders = opts.colorOrders || 'text-slate-500';
        return `
            <span class="inline-flex items-baseline gap-1 whitespace-nowrap tabular-data">
                <span class="inline-block w-14 text-right font-black ${colorBooths}">${fmtCount(booths)}</span>
                <span class="inline-block w-12 text-left text-[11px] font-bold ${colorOrders}">/ ${Number(orders || 0)}家</span>
            </span>
        `;
    };
    // 落位概况 tab：表头允许换行 + 列内边距收窄，争取一屏放下更多列
    const thLandingFirst = 'px-3 py-2 text-left font-bold whitespace-nowrap leading-tight align-bottom sticky left-0 z-[2] bg-slate-100';
    const thLanding = 'px-2 py-2 text-right font-bold leading-tight align-bottom whitespace-nowrap';
    const landingTable = `
        <div class="border border-slate-200 rounded-3xl overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full text-[13px]">
                    <thead class="bg-slate-100 text-slate-600">
                        <tr>
                            <th class="${thLandingFirst}">馆号</th>
                            <th class="${thLanding}">总计设置<br/>展位数</th>
                            <th class="${thLanding}">总计落位<br/>企业数（家）</th>
                            <th class="${thLanding}">预留<br/>展位 / 企业</th>
                            <th class="${thLanding}">定金<br/>展位 / 企业</th>
                            <th class="${thLanding}">全款<br/>展位 / 企业</th>
                            <th class="${thLanding}">未售<br/>展位数</th>
                            <th class="${thLanding}">全款占<br/>总设置进度</th>
                            <th class="${thLanding}">应收<br/>展位费</th>
                            <th class="${thLanding}">已收<br/>展位费</th>
                            <th class="${thLanding}">剩余未收<br/>展位费</th>
                            <th class="${thLanding}">已收占<br/>应收进度</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                        ${halls.map((hall) => {
                            const unreceived = Math.max(0, Number(hall.receivable_booth_fee || 0) - Number(hall.received_booth_fee || 0));
                            const unreceivedClass = unreceived > 0 ? 'text-amber-700' : 'text-slate-400';
                            const unsold = Number(hall.configured_total_booth_count || 0) - Number(hall.landed_booth_count || 0);
                            const unsoldClass = (() => {
                                const total = Number(hall.configured_total_booth_count || 0);
                                if (total <= 0) return 'text-slate-500';
                                const ratio = Math.max(0, unsold) / total;
                                if (ratio >= 0.6) return 'text-slate-700';
                                if (ratio >= 0.3) return 'text-amber-700';
                                return 'text-emerald-600';
                            })();
                            return `
                            <tr>
                                <td class="${tdFirst}">${window.escapeHtml(hall.hall)}</td>
                                <td class="px-2 py-3 text-right font-bold text-slate-800 tabular-data">${fmtCount(hall.configured_total_booth_count)}</td>
                                <td class="px-2 py-3 text-right font-bold text-slate-800 tabular-data">${Number(hall.landed_order_count || 0)}</td>
                                <td class="px-2 py-3 text-right">${stagePairCell(hall.reserved_booth_count, hall.reserved_order_count, { colorBooths: 'text-amber-700' })}</td>
                                <td class="px-2 py-3 text-right">${stagePairCell(hall.deposit_booth_count, hall.deposit_order_count, { colorBooths: 'text-sky-700' })}</td>
                                <td class="px-2 py-3 text-right">${stagePairCell(hall.full_paid_booth_count, hall.full_paid_order_count, { colorBooths: 'text-emerald-700' })}</td>
                                <td class="px-2 py-3 text-right font-bold ${unsoldClass} tabular-data">${fmtCount(Math.max(0, unsold))}</td>
                                <td class="px-2 py-3 text-right font-bold text-slate-700">${percentBar(hall.full_paid_booth_rate)}</td>
                                <td class="px-2 py-3 text-right font-bold text-rose-700 tabular-data">${fmtMoney(hall.receivable_booth_fee)}</td>
                                <td class="px-2 py-3 text-right font-bold text-emerald-700 tabular-data">${fmtMoney(hall.received_booth_fee)}</td>
                                <td class="px-2 py-3 text-right font-bold ${unreceivedClass} tabular-data">${fmtMoney(unreceived)}</td>
                                <td class="px-2 py-3 text-right font-bold text-slate-700">${percentBar(hall.collection_rate)}</td>
                            </tr>
                        `;}).join('')}
                        <tr class="${totalRowClass}">
                            <td class="${tdTotalFirst}">总计</td>
                            <td class="px-2 py-3 text-right font-black text-[13px] tabular-data text-slate-900">${fmtCount(totals.configuredTotal)}</td>
                            <td class="px-2 py-3 text-right font-black text-[13px] tabular-data text-slate-900">${totals.landedOrders}</td>
                            <td class="px-2 py-3 text-right">${stagePairCell(totals.reservedBooths, totals.reservedOrders, { colorBooths: 'text-amber-700' })}</td>
                            <td class="px-2 py-3 text-right">${stagePairCell(totals.depositBooths, totals.depositOrders, { colorBooths: 'text-sky-700' })}</td>
                            <td class="px-2 py-3 text-right">${stagePairCell(totals.fullPaidBooths, totals.fullPaidOrders, { colorBooths: 'text-emerald-700' })}</td>
                            <td class="px-2 py-3 text-right font-black text-[13px] tabular-data ${(() => { const total = totals.configuredTotal; if (total <= 0) return 'text-slate-700'; const ratio = totals.remainingUnlanded / total; if (ratio >= 0.6) return 'text-slate-700'; if (ratio >= 0.3) return 'text-amber-700'; return 'text-emerald-700'; })()}">${fmtCount(totals.remainingUnlanded)}</td>
                            <td class="px-2 py-3 text-right">${percentBar(totalFullPaidRate)}</td>
                            <td class="px-2 py-3 text-right font-black text-[13px] tabular-data text-rose-700">${fmtMoney(totals.receivableBoothFee)}</td>
                            <td class="px-2 py-3 text-right font-black text-[13px] tabular-data text-emerald-700">${fmtMoney(totals.receivedBoothFee)}</td>
                            <td class="px-2 py-3 text-right font-black text-[13px] tabular-data ${totalUnreceivedFee > 0 ? 'text-amber-700' : 'text-slate-500'}">${fmtMoney(totalUnreceivedFee)}</td>
                            <td class="px-2 py-3 text-right">${percentBar(totalCollectionRate)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-end gap-4 mb-4">
            <div class="flex flex-wrap gap-2">
                ${window.homeHallTabDefinitions.map((tab) => `
                    <button
                        onclick="window.switchHomeHallInnerTab('${tab.id}')"
                        class="px-3 py-1.5 rounded-full text-xs font-bold transition border ${tab.id === activeId
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white/80 text-slate-600 border-slate-200 hover:bg-slate-100'}"
                    >${tab.label}</button>
                `).join('')}
            </div>
        </div>
        ${activeId === 'booth' ? boothTable : activeId === 'landing' ? landingTable : financeTable}
    `;
}

window.renderHomeHallTableSkeleton = function() {
    const container = document.getElementById('home-hall-table');
    if (!container) return;
    const rowSkeleton = `
        <div class="grid grid-cols-[88px_repeat(8,minmax(0,1fr))] gap-3 px-3 py-3 border-t border-slate-100">
            ${Array.from({ length: 9 }).map((_, i) => `
                <div class="h-4 rounded bg-slate-100 ${i === 0 ? '' : 'justify-self-end w-3/4'}"></div>
            `).join('')}
        </div>
    `;
    container.innerHTML = `
        <div class="border border-slate-200 rounded-3xl overflow-hidden animate-pulse">
            <div class="bg-slate-100 px-3 py-2.5"><div class="h-4 w-32 bg-slate-200 rounded"></div></div>
            ${Array.from({ length: 5 }).map(() => rowSkeleton).join('')}
        </div>
    `;
};

window.loadHomeDashboard = async function() {
    const pid = document.getElementById('global-project-select')?.value;
    if (!pid) return;

    if (window.homeCountdownTimer) clearInterval(window.homeCountdownTimer);
    window.updateHomeProjectHero();
    if (!window.homeDashboardData) {
        window.renderHomeHallTableSkeleton();
    }
    window.homeCountdownTimer = setInterval(() => {
        if (document.getElementById('sec-home')?.classList.contains('active')) {
            window.updateHomeProjectHero();
        }
    }, 60000);

    try {
        let apiUrl = `/api/home-dashboard?projectId=${pid}`;
        const presetKey = window.detectHomePresetKey();
        if (!presetKey && window.homeFilterStartDate && window.homeFilterEndDate) {
            apiUrl += `&startDate=${encodeURIComponent(window.homeFilterStartDate)}&endDate=${encodeURIComponent(window.homeFilterEndDate)}`;
        }
        const res = await window.ensureApiSuccess(
            await window.apiFetch(apiUrl),
            '首页数据加载失败'
        );
        const data = await res.json();
        window.homeDashboardData = data;
        window.renderHomeTabs(data.is_admin);
        window.renderHomeProgressSummary(data.home_progress || {});
        window.renderHomeSalesSummary(data.sales_summary_periods || {});
        window.renderHomeSalesList(data.sales_list_periods || {}, data.sales_list_meta || {});
        window.renderHomeRegionTable(data.region_overview || {}, data.is_admin);
        window.renderHomeRegionChart(data.region_overview || {});
        window.renderHomeHallTable(data.hall_overview || [], data.is_admin);
    } catch (e) {
        window.showToast(e.message, 'error');
    }
}
