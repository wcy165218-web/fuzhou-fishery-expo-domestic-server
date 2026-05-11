// ================= js/agents.js =================
window.allAgents = window.allAgents || [];
window.currentAgentFormMode = window.currentAgentFormMode || 'create';
window.currentEditingAgentId = window.currentEditingAgentId || 0;

window.populateAgentSalesOwnerSelect = async function(selectedName = '') {
    const wrap = document.getElementById('agent-form-sales-wrap');
    const select = document.getElementById('agent-form-sales');
    const isSuperAdmin = window.isSuperAdmin?.();
    if (!wrap || !select) return;
    if (!isSuperAdmin) {
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

window.normalizeAgentName = function(name) {
    return String(name || '').trim().replace(/[\s\u3000]+/g, '').toLowerCase();
}

window.canCreateAgent = function(user = window.currentUser) {
    return !!user && (window.isAdminUser?.(user) || window.normalizeUserRole?.(user.role) === 'user');
}

window.canManageAgent = function(agent, user = window.currentUser) {
    if (!user || !agent) return false;
    if (window.isSuperAdmin(user)) return true;
    return window.normalizeUserRole?.(user.role) === 'user' && agent.sales_name === user.name;
}

window.canViewAgentFinance = function(agent, user = window.currentUser) {
    if (!user || !agent) return false;
    if (window.isSuperAdmin(user)) return true;
    if (window.isAdminUser?.(user)) return true;
    return window.canManageAgent(agent, user);
}

window.canPrintAgentSettlement = function(agent, user = window.currentUser) {
    return window.canManageAgent(agent, user);
}

window.loadAgents = async function() {
    const pid = document.getElementById('global-project-select')?.value;
    if (!pid) return;
    const listDiv = document.getElementById('agent-list');
    if (!listDiv) return;
    const addBtn = document.getElementById('btn-add-agent');
    if (addBtn) addBtn.classList.toggle('hidden', !window.canCreateAgent());
    listDiv.innerHTML = '<p class="text-gray-400">加载中...</p>';
    try {
        const res = await window.apiFetch(`/api/agents?projectId=${encodeURIComponent(pid)}`);
        const data = await res.json();
        window.allAgents = Array.isArray(data) ? data : [];
        window.renderAgentList();
    } catch (e) {
        listDiv.innerHTML = '<p class="text-red-500 font-bold">加载失败</p>';
    }
}

window.renderAgentList = function() {
    const listDiv = document.getElementById('agent-list');
    if (!listDiv) return;
    const keyword = (document.getElementById('agent-search-name')?.value || '').trim().toLowerCase();
    const salesFilter = (document.getElementById('agent-filter-sales')?.value || '');
    let filtered = window.allAgents;
    if (keyword) filtered = filtered.filter(a => a.name.toLowerCase().includes(keyword));
    if (salesFilter) filtered = filtered.filter(a => a.sales_name === salesFilter);
    const salesNames = [...new Set(window.allAgents.map(a => a.sales_name).filter(Boolean))];
    const filterBar = `<div class="flex items-center gap-3 mb-4"><input type="text" id="agent-search-name" oninput="window.renderAgentList()" value="${window.escapeHtml(keyword)}" class="border border-slate-300 rounded px-3 py-1.5 text-sm w-48 bg-white" placeholder="搜索代理商名称..."><select id="agent-filter-sales" onchange="window.renderAgentList()" class="border border-slate-300 rounded px-3 py-1.5 text-sm bg-white"><option value="">全部业务员</option>${salesNames.map(s => `<option value="${window.escapeHtml(s)}" ${s === salesFilter ? 'selected' : ''}>${window.escapeHtml(s)}</option>`).join('')}</select><span class="text-xs text-slate-400">共 ${filtered.length} 条</span></div>`;
    const canCreate = window.canCreateAgent();
    if (window.allAgents.length === 0) {
        listDiv.innerHTML = canCreate
            ? '<p class="text-gray-400 italic">暂无代理商，点击右上角"新增代理商"添加。</p>'
            : '<p class="text-gray-400 italic">暂无代理商。</p>';
        return;
    }
    listDiv.innerHTML = filterBar + `
        <table class="w-full text-left text-sm">
            <thead>
                <tr class="border-b border-slate-200 bg-slate-50">
                    <th class="p-3 font-bold text-slate-600 w-12">#</th>
                    <th class="p-3 font-bold text-slate-600">代理商名称</th>
                    <th class="p-3 font-bold text-slate-600">录入业务员</th>
                    <th class="p-3 font-bold text-slate-600">录入日期</th>
                    <th class="p-3 font-bold text-slate-600 text-right w-64">操作</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map((agent, idx) => `
                    <tr class="border-b border-slate-100 hover:bg-blue-50/50" id="agent-row-${agent.id}">
                        <td class="p-3 text-slate-400 font-bold">${idx + 1}</td>
                        <td class="p-3 font-bold text-slate-800" id="agent-name-display-${agent.id}">${window.escapeHtml(agent.name)}</td>
                        <td class="p-3 text-slate-600 text-sm">${window.escapeHtml(agent.sales_name || '-')}</td>
                        <td class="p-3 text-slate-500 text-sm">${window.escapeHtml((agent.created_at || '').split(' ')[0] || '-')}</td>
                        <td class="p-3 text-right space-x-2">
                            ${window.canManageAgent(agent) ? `<button onclick="window.editAgentName(${agent.id})" class="btn-secondary px-3 py-1.5 text-xs">修改</button>` : ''}
                            ${window.canViewAgentFinance(agent) ? `<button onclick="window.openAgentFinance(${agent.id})" class="btn-soft-primary px-3 py-1.5 text-xs">财务</button>` : `<span class="text-xs text-slate-400">仅列表可见</span>`}
                            ${window.canManageAgent(agent) ? `<button onclick="window.deleteAgent(${agent.id})" class="btn-soft-danger px-3 py-1.5 text-xs">删除</button>` : ''}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

window.resetAgentFormModal = function() {
    const hiddenId = document.getElementById('agent-form-id');
    const input = document.getElementById('agent-form-name');
    const salesSelect = document.getElementById('agent-form-sales');
    const title = document.getElementById('agent-form-title');
    const subtitle = document.getElementById('agent-form-subtitle');
    const submitBtn = document.getElementById('btn-save-agent');
    if (hiddenId) hiddenId.value = '';
    if (input) input.value = '';
    if (salesSelect) salesSelect.innerHTML = '<option value="">请选择业务员</option>';
    if (title) title.innerText = '新增代理商';
    if (subtitle) subtitle.innerText = '录入代理商名称后即可纳入代理商库，后续返佣支出与财务统计都会基于这里的名称。';
    if (submitBtn) submitBtn.innerText = '确认保存';
    window.currentAgentFormMode = 'create';
    window.currentEditingAgentId = 0;
}

window.openAgentFormModal = async function({ mode = 'create', agent = null } = {}) {
    const modal = document.getElementById('agent-form-modal');
    const hiddenId = document.getElementById('agent-form-id');
    const input = document.getElementById('agent-form-name');
    const title = document.getElementById('agent-form-title');
    const subtitle = document.getElementById('agent-form-subtitle');
    const submitBtn = document.getElementById('btn-save-agent');
    if (!modal || !input) return;
    const isEdit = mode === 'edit' && agent;
    window.currentAgentFormMode = isEdit ? 'edit' : 'create';
    window.currentEditingAgentId = isEdit ? Number(agent.id || 0) : 0;
    if (hiddenId) hiddenId.value = isEdit ? String(agent.id || '') : '';
    if (input) input.value = isEdit ? String(agent.name || '') : '';
    if (title) title.innerText = isEdit ? '修改代理商名称' : '新增代理商';
    if (subtitle) subtitle.innerText = isEdit
        ? '修改后会同步影响当前项目下代理商名称引用、返佣记录和财务统计展示；超级管理员也可顺带调整归属业务员。'
        : '录入代理商名称后即可纳入代理商库，后续返佣支出与财务统计都会基于这里的名称。';
    if (submitBtn) submitBtn.innerText = isEdit ? '保存修改' : '确认保存';
    await window.populateAgentSalesOwnerSelect(isEdit ? String(agent.sales_name || '') : '');
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 0);
}

window.closeAgentFormModal = function() {
    window.resetAgentFormModal();
    window.closeModal('agent-form-modal');
}

window.showAddAgentDialog = function() {
    if (!window.canCreateAgent()) return window.showToast('权限不足：当前账号不可新增代理商', 'error');
    window.openAgentFormModal({ mode: 'create' });
}

window.addAgent = async function(name) {
    const pid = document.getElementById('global-project-select')?.value;
    if (!pid) throw new Error('请先选择项目');
    const salesName = document.getElementById('agent-form-sales')?.value?.trim() || '';
    const res = await window.apiFetch('/api/add-agent', {
        method: 'POST',
        body: JSON.stringify({ project_id: pid, name: name, sales_name: salesName })
    });
    await window.ensureApiSuccess(res, '添加失败');
    window.showToast('代理商添加成功！');
    await window.loadAgents();
}

window.editAgentName = function(agentId) {
    const agent = window.allAgents.find(a => a.id === agentId);
    if (!agent) return;
    if (!window.canManageAgent(agent)) return window.showToast('权限不足：仅可修改自己录入的代理', 'error');
    window.openAgentFormModal({ mode: 'edit', agent });
}

window.submitAgentForm = async function() {
    const input = document.getElementById('agent-form-name');
    const salesSelect = document.getElementById('agent-form-sales');
    const rawName = String(input?.value || '').trim();
    if (!rawName) return window.showToast('请输入代理商名称', 'error');
    const selectedSalesName = String(salesSelect?.value || '').trim();
    if (window.isSuperAdmin?.() && !selectedSalesName) return window.showToast('请选择代理商归属业务员', 'error');
    const normalizedName = window.normalizeAgentName(rawName);
    const editingId = Number(window.currentEditingAgentId || 0);
    const duplicate = window.allAgents.find((agent) => Number(agent.id) !== editingId && window.normalizeAgentName(agent.name) === normalizedName);
    if (duplicate) return window.showToast('该代理商名称已存在', 'error');

    try {
        await window.withButtonLoading('btn-save-agent', async () => {
            if (window.currentAgentFormMode === 'edit' && editingId) {
                const currentAgent = window.allAgents.find((agent) => Number(agent.id) === editingId);
                const agentNameUnchanged = currentAgent && String(currentAgent.name || '').trim() === rawName;
                const salesNameUnchanged = !window.isSuperAdmin?.() || String(currentAgent?.sales_name || '').trim() === selectedSalesName;
                if (agentNameUnchanged && salesNameUnchanged) {
                    window.closeAgentFormModal();
                    return;
                }
                const updates = { name: rawName };
                if (window.isSuperAdmin?.()) {
                    updates.sales_name = selectedSalesName;
                }
                await window.updateAgent(editingId, updates);
            } else {
                await window.addAgent(rawName);
            }
            window.closeAgentFormModal();
        });
    } catch (e) {
        window.showToast(e.message || '保存失败', 'error');
    }
}

window.updateAgent = async function(agentId, updates) {
    const res = await window.apiFetch('/api/update-agent', {
        method: 'POST',
        body: JSON.stringify({ id: agentId, ...updates })
    });
    await window.ensureApiSuccess(res, '更新失败');
    window.showToast('更新成功！');
    await window.loadAgents();
}

window.deleteAgent = async function(agentId) {
    const agent = window.allAgents.find(a => a.id === agentId);
    if (!agent) return;
    if (!window.canManageAgent(agent)) return window.showToast('权限不足：仅可删除自己录入的代理', 'error');
    if (!confirm(`确定删除代理商「${agent.name}」吗？`)) return;
    try {
        const res = await window.apiFetch('/api/delete-agent', {
            method: 'POST',
            body: JSON.stringify({ id: agentId })
        });
        await window.ensureApiSuccess(res, '删除失败');
        window.showToast('删除成功！');
        await window.loadAgents();
    } catch (e) {
        window.showToast(e.message || '删除失败', 'error');
    }
}

window.currentAgentFinanceData = null;
window.formatAgentBoothCount = function(value) {
    return Number(value || 0).toFixed(2).replace(/\.00$/, '');
};

window.openAgentFinance = async function(agentId) {
    const pid = document.getElementById('global-project-select')?.value;
    if (!pid) return window.showToast('请先选择项目', 'error');
    const agent = window.allAgents.find((item) => String(item.id) === String(agentId));
    if (agent && !window.canViewAgentFinance(agent)) return window.showToast('权限不足：仅可查看自己录入的代理财务', 'error');
    const contentDiv = document.getElementById('agent-finance-content');
    const summaryDiv = document.getElementById('agent-finance-summary');
    const titleEl = document.getElementById('agent-finance-title');
    const printBtn = document.getElementById('btn-print-agent-settlement');
    contentDiv.innerHTML = '<p class="text-gray-400">加载中...</p>';
    summaryDiv.innerHTML = '';
    document.getElementById('agent-finance-modal').classList.remove('hidden');
    try {
        const res = await window.apiFetch(`/api/agent-finance?agentId=${agentId}&projectId=${encodeURIComponent(pid)}`);
        const data = await res.json();
        window.currentAgentFinanceData = data;
        if (printBtn) printBtn.classList.toggle('hidden', !window.canPrintAgentSettlement(data.agent));
        titleEl.innerText = `代理商财务明细 — ${data.agent?.name || ''}`;
        if (!data.orders || data.orders.length === 0) {
            contentDiv.innerHTML = '<p class="text-gray-400 italic">该代理商暂无代招企业记录。</p>';
            summaryDiv.innerHTML = '';
            return;
        }
        contentDiv.innerHTML = `
            <table class="w-full text-left text-sm border-collapse">
                <thead>
                    <tr class="border-b-2 border-slate-300 bg-slate-50">
                        <th class="p-3 font-bold text-slate-600 w-12">序号</th>
                        <th class="p-3 font-bold text-slate-600">代招参展企业名称</th>
                        <th class="p-3 font-bold text-slate-600">展位号</th>
                        <th class="p-3 font-bold text-slate-600 text-right">展位数</th>
                        <th class="p-3 font-bold text-slate-600 text-right">应收展位费</th>
                        <th class="p-3 font-bold text-slate-600 text-right">返佣支出</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.orders.map((o, idx) => `
                        <tr class="border-b border-slate-100">
                            <td class="p-3 text-slate-400 font-bold">${idx + 1}</td>
                            <td class="p-3 font-bold text-slate-800">${window.escapeHtml(o.company_name)}</td>
                            <td class="p-3 text-slate-600">${window.escapeHtml(o.booth_id || '')}</td>
                            <td class="p-3 text-right tabular-data">${window.formatAgentBoothCount(o.booth_count)}</td>
                            <td class="p-3 text-right tabular-data">${window.formatCurrency(o.total_booth_fee)}</td>
                            <td class="p-3 text-right tabular-data text-purple-700">${window.formatCurrency(o.commission_amount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        summaryDiv.innerHTML = `
            <div class="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-4">
                <div class="text-center md:text-left">
                    <div class="text-xs text-slate-500">总计招展企业数</div>
                    <div class="mt-1 text-lg font-bold text-slate-800 tabular-data">${data.summary.total_companies}</div>
                </div>
                <div class="text-center md:text-left">
                    <div class="text-xs text-slate-500">总计招展展位数</div>
                    <div class="mt-1 text-lg font-bold text-slate-800 tabular-data">${window.formatAgentBoothCount(data.summary.total_booths)}</div>
                </div>
                <div class="text-center md:text-left">
                    <div class="text-xs text-slate-500">总计应收展位费</div>
                    <div class="mt-1 text-lg font-bold text-blue-700 tabular-data">${window.formatCurrency(data.summary.total_booth_fee)}</div>
                </div>
                <div class="text-center md:text-left">
                    <div class="text-xs text-slate-500">总计返佣支出</div>
                    <div class="mt-1 text-lg font-bold text-purple-700 tabular-data">${window.formatCurrency(data.summary.total_commission)}</div>
                </div>
            </div>
        `;
    } catch (e) {
        contentDiv.innerHTML = `<p class="text-red-500 font-bold">加载失败: ${e.message}</p>`;
    }
}

window.printAgentSettlement = function() {
    const data = window.currentAgentFinanceData;
    if (!window.canPrintAgentSettlement(data?.agent)) {
        return window.showToast('权限不足：当前账号不可打印代理结算单据', 'error');
    }
    if (!data || !data.orders || data.orders.length === 0) {
        return window.showToast('暂无数据可生成结算单', 'error');
    }
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const projectName = document.getElementById('global-project-select').options[document.getElementById('global-project-select').selectedIndex]?.text || '';
    const content = `
        <div class="text-center mb-6">
            <h2 class="text-2xl font-bold tracking-widest border-b-2 border-black pb-2 inline-block">代理结算单</h2>
        </div>
        <div class="flex justify-between text-sm mb-4 font-bold">
            <span>项目名称：${window.escapeHtml(projectName)}</span>
            <span>结算日期：${dateStr}</span>
        </div>
        <table class="w-full text-left border-collapse border border-black mb-4 text-sm">
            <tr>
                <th class="border border-black p-3 bg-gray-100 w-1/4">代理商名称</th>
                <td class="border border-black p-3 font-bold" colspan="3">${window.escapeHtml(data.agent?.name || '')}</td>
            </tr>
            <tr>
                <th class="border border-black p-3 bg-gray-100">业务员</th>
                <td class="border border-black p-3 font-bold" colspan="3">${window.escapeHtml(data.agent?.sales_name || '')}</td>
            </tr>
            <tr>
                <th class="border border-black p-3 bg-gray-100">总计返佣支出</th>
                <td class="border border-black p-3 font-bold text-xl text-red-600" colspan="3">${window.formatCurrency(data.summary.total_commission, '¥ ')}</td>
            </tr>
        </table>
        <h4 class="font-bold text-sm mb-2">代招企业明细</h4>
        <table class="w-full text-left border-collapse border border-black mb-6 text-sm">
            <thead>
                <tr class="bg-gray-100">
                    <th class="border border-black p-2 w-10">序号</th>
                    <th class="border border-black p-2">代招企业名称</th>
                    <th class="border border-black p-2">展位号</th>
                    <th class="border border-black p-2 text-right">展位数</th>
                    <th class="border border-black p-2 text-right">应收展位费</th>
                    <th class="border border-black p-2 text-right">返佣支出</th>
                </tr>
            </thead>
            <tbody>
                ${data.orders.map((o, idx) => `
                    <tr>
                        <td class="border border-black p-2 text-center">${idx + 1}</td>
                        <td class="border border-black p-2">${window.escapeHtml(o.company_name)}</td>
                        <td class="border border-black p-2">${window.escapeHtml(o.booth_id || '')}</td>
                        <td class="border border-black p-2 text-right">${window.formatAgentBoothCount(o.booth_count)}</td>
                        <td class="border border-black p-2 text-right">${window.formatCurrency(o.total_booth_fee)}</td>
                        <td class="border border-black p-2 text-right">${window.formatCurrency(o.commission_amount)}</td>
                    </tr>
                `).join('')}
                <tr class="bg-gray-100 font-bold">
                    <td class="border border-black p-2 text-center" colspan="2">合计 (${data.summary.total_companies} 家企业)</td>
                    <td class="border border-black p-2"></td>
                    <td class="border border-black p-2 text-right">${window.formatAgentBoothCount(data.summary.total_booths)}</td>
                    <td class="border border-black p-2 text-right">${window.formatCurrency(data.summary.total_booth_fee)}</td>
                    <td class="border border-black p-2 text-right">${window.formatCurrency(data.summary.total_commission)}</td>
                </tr>
            </tbody>
        </table>
    `;
    document.getElementById('print-content').innerHTML = content;
    document.getElementById('print-modal').classList.remove('hidden');
}

// Provide agent search for order entry and expense forms
window.getAgentOptions = function() {
    return (window.allAgents || []).map(a => a.name);
}

window.renderAgentDropdownOptions = function(names, pickerType) {
    return names.map((name) => `
        <button
            type="button"
            class="block w-full px-3 py-2 text-left text-sm font-medium hover:bg-blue-50"
            data-agent-picker="${window.escapeAttr(pickerType)}"
            data-agent-name="${window.escapeAttr(name)}"
        >${window.escapeHtml(name)}</button>
    `).join('');
}

window.ensureAgentsLoaded = async function() {
    const pid = document.getElementById('global-project-select')?.value;
    if (!pid) return;
    if (window.allAgents && window.allAgents.length > 0 && window._agentsLoadedForProject === pid) return;
    try {
        const res = await window.apiFetch(`/api/agents?projectId=${encodeURIComponent(pid)}`);
        const data = await res.json();
        window.allAgents = Array.isArray(data) ? data : [];
        window._agentsLoadedForProject = pid;
    } catch (e) {
        window.allAgents = [];
    }
}

// Agent search dropdown for order entry
window.filterAgentOptions = function() {
    const searchInput = document.getElementById('order-agent-search');
    const dropdown = document.getElementById('order-agent-dropdown');
    if (!searchInput || !dropdown) return;
    const query = searchInput.value.trim().toLowerCase();
    const agents = window.getAgentOptions();
    const filtered = query ? agents.filter(name => name.toLowerCase().includes(query)) : agents;
    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-gray-400 text-xs">无匹配代理商，请先在"代理商管理"中添加</div>';
    } else {
        dropdown.innerHTML = window.renderAgentDropdownOptions(filtered, 'order');
    }
    dropdown.classList.remove('hidden');
}

window.selectAgent = function(name) {
    const agentInput = document.getElementById('order-agent-name');
    const searchInput = document.getElementById('order-agent-search');
    const dropdown = document.getElementById('order-agent-dropdown');
    if (agentInput) agentInput.value = name;
    if (searchInput) searchInput.value = name;
    if (dropdown) dropdown.classList.add('hidden');
    window.refreshOrderOverview();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const agentOption = e.target.closest('[data-agent-picker][data-agent-name]');
    if (agentOption) {
        const pickerType = agentOption.getAttribute('data-agent-picker') || '';
        const name = agentOption.getAttribute('data-agent-name') || '';
        if (pickerType === 'order') window.selectAgent(name);
        if (pickerType === 'expense') window.selectExpenseAgent(name);
        if (pickerType === 'detail') window.selectDtAgent(name);
        return;
    }

    const dropdown = document.getElementById('order-agent-dropdown');
    const searchInput = document.getElementById('order-agent-search');
    if (dropdown && searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
    // Also close expense agent dropdown
    const expDropdown = document.getElementById('exp-agent-dropdown');
    const expSearch = document.getElementById('exp-agent-search');
    if (expDropdown && expSearch && !expSearch.contains(e.target) && !expDropdown.contains(e.target)) {
        expDropdown.classList.add('hidden');
    }
    // Also close detail agent dropdown
    const dtDropdown = document.getElementById('edit-dt-agent-dropdown');
    const dtSearch = document.getElementById('edit-dt-agent-search');
    if (dtDropdown && dtSearch && !dtSearch.contains(e.target) && !dtDropdown.contains(e.target)) {
        dtDropdown.classList.add('hidden');
    }
});

// Agent search for expense form (commission type)
window.filterExpenseAgentOptions = function() {
    const searchInput = document.getElementById('exp-agent-search');
    const dropdown = document.getElementById('exp-agent-dropdown');
    if (!searchInput || !dropdown) return;
    const query = searchInput.value.trim().toLowerCase();
    const agents = window.getAgentOptions();
    const filtered = query ? agents.filter(name => name.toLowerCase().includes(query)) : agents;
    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-gray-400 text-xs">无匹配代理商</div>';
    } else {
        dropdown.innerHTML = window.renderAgentDropdownOptions(filtered, 'expense');
    }
    dropdown.classList.remove('hidden');
}

window.selectExpenseAgent = function(name) {
    const payeeInput = document.getElementById('exp-payee');
    const searchInput = document.getElementById('exp-agent-search');
    const dropdown = document.getElementById('exp-agent-dropdown');
    if (payeeInput) payeeInput.value = name;
    if (searchInput) searchInput.value = name;
    if (dropdown) dropdown.classList.add('hidden');
}

// Agent search for detail edit mode
window.filterDtAgentOptions = function() {
    const searchInput = document.getElementById('edit-dt-agent-search');
    const dropdown = document.getElementById('edit-dt-agent-dropdown');
    if (!searchInput || !dropdown) return;
    const query = searchInput.value.trim().toLowerCase();
    const agents = window.getAgentOptions();
    const filtered = query ? agents.filter(name => name.toLowerCase().includes(query)) : agents;
    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-gray-400 text-xs">无匹配代理商</div>';
    } else {
        dropdown.innerHTML = window.renderAgentDropdownOptions(filtered, 'detail');
    }
    dropdown.classList.remove('hidden');
}

window.selectDtAgent = function(name) {
    const agentInput = document.getElementById('edit-dt-agent-name');
    const searchInput = document.getElementById('edit-dt-agent-search');
    const dropdown = document.getElementById('edit-dt-agent-dropdown');
    if (agentInput) agentInput.value = name;
    if (searchInput) searchInput.value = name;
    if (dropdown) dropdown.classList.add('hidden');
}
