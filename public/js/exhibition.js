window.currentExhibitionPanel = window.currentExhibitionPanel || 'project-settings';
window.exhibitionRefrigeratorConfigs = Array.isArray(window.exhibitionRefrigeratorConfigs) ? window.exhibitionRefrigeratorConfigs : [];
window.exhibitionRefrigeratorRentals = Array.isArray(window.exhibitionRefrigeratorRentals) ? window.exhibitionRefrigeratorRentals : [];
window.exhibitionRefrigeratorTypeColumns = Array.isArray(window.exhibitionRefrigeratorTypeColumns) ? window.exhibitionRefrigeratorTypeColumns : [];
window.exhibitionRefrigeratorRentalTotals = window.exhibitionRefrigeratorRentalTotals || null;
window.exhibitionManagerStaff = Array.isArray(window.exhibitionManagerStaff) ? window.exhibitionManagerStaff : [];
window.exhibitionLintels = Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels : [];
window.exhibitionLintelFilters = (window.exhibitionLintelFilters && typeof window.exhibitionLintelFilters === 'object') ? window.exhibitionLintelFilters : {};
window.exhibitionSpecialDecorations = Array.isArray(window.exhibitionSpecialDecorations) ? window.exhibitionSpecialDecorations : [];
window.exhibitionSpecialDecorationMeta = (window.exhibitionSpecialDecorationMeta && typeof window.exhibitionSpecialDecorationMeta === 'object') ? window.exhibitionSpecialDecorationMeta : { total: 0, page: 1, pageSize: 20, totalPages: 1, hasMore: false, hall_options: [], sales_options: [], can_toggle: false };
window.exhibitionSpecialDecorationFilters = (window.exhibitionSpecialDecorationFilters && typeof window.exhibitionSpecialDecorationFilters === 'object') ? window.exhibitionSpecialDecorationFilters : {};
window.exhibitionConfirmationSettings = (window.exhibitionConfirmationSettings && typeof window.exhibitionConfirmationSettings === 'object') ? window.exhibitionConfirmationSettings : null;
window.selectedRefrigeratorRentalIds = Array.isArray(window.selectedRefrigeratorRentalIds) ? window.selectedRefrigeratorRentalIds : [];
window.selectedLintelKeys = Array.isArray(window.selectedLintelKeys) ? window.selectedLintelKeys : [];
window.selectedSpecialDecorationOrderIds = Array.isArray(window.selectedSpecialDecorationOrderIds) ? window.selectedSpecialDecorationOrderIds : [];
window.currentRefrigeratorConfigEditingId = Number(window.currentRefrigeratorConfigEditingId || 0);
window.currentRefrigeratorConfigImageKey = window.currentRefrigeratorConfigImageKey || '';
window.currentRefrigeratorConfigImageUrl = window.currentRefrigeratorConfigImageUrl || '';
window.currentRefrigeratorConfigLocalPreviewUrl = window.currentRefrigeratorConfigLocalPreviewUrl || '';
window.isRefrigeratorConfigEditorOpen = !!window.isRefrigeratorConfigEditorOpen;
window.currentRefrigeratorRentalEditingId = Number(window.currentRefrigeratorRentalEditingId || 0);
window.currentRefrigeratorRentalCompany = window.currentRefrigeratorRentalCompany || null;
window.currentRefrigeratorRentalMode = window.currentRefrigeratorRentalMode || 'booth';
window.currentRefrigeratorRentalVenueConfirmed = !!window.currentRefrigeratorRentalVenueConfirmed;
window.currentRefrigeratorRentalItems = Array.isArray(window.currentRefrigeratorRentalItems) ? window.currentRefrigeratorRentalItems : [];
window.currentRefrigeratorRentalDraft = (window.currentRefrigeratorRentalDraft && typeof window.currentRefrigeratorRentalDraft === 'object')
    ? window.currentRefrigeratorRentalDraft
    : { line_id: '', config_id: 0, quantity: '', payment_method: '' };
window.refrigeratorRentalDraftLineSeed = Number(window.refrigeratorRentalDraftLineSeed || 0);
window.currentRefrigeratorRentalCatalog = Array.isArray(window.currentRefrigeratorRentalCatalog) ? window.currentRefrigeratorRentalCatalog : [];
window.isRefrigeratorRentalEditorOpen = !!window.isRefrigeratorRentalEditorOpen;
window.currentLintelEditingKey = window.currentLintelEditingKey || '';
window.currentLintelEditingRecord = (window.currentLintelEditingRecord && typeof window.currentLintelEditingRecord === 'object')
    ? window.currentLintelEditingRecord
    : null;
window.isLintelEditorOpen = !!window.isLintelEditorOpen;
window.exhibitionCompanyOptions = Array.isArray(window.exhibitionCompanyOptions) ? window.exhibitionCompanyOptions : [];
window.exhibitionCompanySearchTimer = window.exhibitionCompanySearchTimer || 0;
window.currentRefrigeratorRentalSearch = window.currentRefrigeratorRentalSearch || '';
window.isRefrigeratorInventoryCollapsed = !!window.isRefrigeratorInventoryCollapsed;
window.specialDecorationSearchTimer = window.specialDecorationSearchTimer || 0;
window.exhibitorDirectoryItems = Array.isArray(window.exhibitorDirectoryItems) ? window.exhibitorDirectoryItems : [];
window.exhibitorDirectoryHallOptions = Array.isArray(window.exhibitorDirectoryHallOptions) ? window.exhibitorDirectoryHallOptions : [];
window.exhibitorDirectoryBoothTypeOptions = Array.isArray(window.exhibitorDirectoryBoothTypeOptions) ? window.exhibitorDirectoryBoothTypeOptions : [];
window.exhibitorDirectoryFilters = (window.exhibitorDirectoryFilters && typeof window.exhibitorDirectoryFilters === 'object') ? window.exhibitorDirectoryFilters : { search: '', hall: 'all', boothType: 'all', salesName: 'all', exhibitionStatus: 'all', basicStatus: 'all' };
window.exhibitorDirectorySearchTimer = window.exhibitorDirectorySearchTimer || 0;
window.exhibitorDirectoryLoaded = !!window.exhibitorDirectoryLoaded;
window.exhibitorDirectoryLoadedProjectId = Number(window.exhibitorDirectoryLoadedProjectId || 0);
window.selectedExhibitorDirectoryKeys = Array.isArray(window.selectedExhibitorDirectoryKeys) ? window.selectedExhibitorDirectoryKeys : [];

window.getSpecialDecorationTableColumnClassNames = function() {
    return {
        checkbox: 'w-12 px-2.5 py-2.5',
        sequence: 'w-14 px-2.5 py-2.5',
        status: 'w-24 px-2.5 py-2.5',
        hall: 'w-20 px-2.5 py-2.5',
        boothCode: 'w-24 px-2.5 py-2.5',
        area: 'w-20 px-2.5 py-2.5',
        companyName: 'w-[220px] px-2.5 py-2.5',
        salesName: 'w-28 px-2.5 py-2.5',
        action: 'w-24 px-2.5 py-2.5'
    };
};

window.getExhibitionProjectId = function() {
    return Number(document.getElementById('global-project-select')?.value || 0);
};

window.getExhibitionProjectName = function() {
    const projectSelect = document.getElementById('global-project-select');
    return projectSelect?.options?.[projectSelect.selectedIndex]?.text || '当前项目';
};

window.roundExhibitionCurrency = function(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return 0;
    return Number(amount.toFixed(2));
};

window.formatExhibitionCurrency = function(value) {
    return `¥${window.roundExhibitionCurrency(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

window.getRefrigeratorRentalItemsArray = function() {
    return Array.isArray(window.currentRefrigeratorRentalItems) ? window.currentRefrigeratorRentalItems : [];
};

window.normalizeRefrigeratorRentalMode = function(value) {
    return String(value || '').trim() === 'no_booth' ? 'no_booth' : 'booth';
};

window.createRefrigeratorRentalCompany = function(values = {}) {
    const rentalMode = window.normalizeRefrigeratorRentalMode(values.rental_mode || window.currentRefrigeratorRentalMode);
    const usageLocation = String(values.usage_location || '').trim();
    return {
        company_name: String(values.company_name || '').trim(),
        sales_name: String(values.sales_name || '').trim(),
        hall_names: rentalMode === 'no_booth' ? '' : String(values.hall_names || '').trim(),
        booth_numbers: rentalMode === 'no_booth' ? usageLocation : String(values.booth_numbers || '').trim(),
        usage_location: rentalMode === 'no_booth' ? usageLocation : '',
        rental_mode: rentalMode
    };
};

window.getCurrentRefrigeratorRentalMode = function() {
    return window.normalizeRefrigeratorRentalMode(window.currentRefrigeratorRentalCompany?.rental_mode || window.currentRefrigeratorRentalMode);
};

window.isNoBoothRefrigeratorRentalMode = function() {
    return window.getCurrentRefrigeratorRentalMode() === 'no_booth';
};

window.getCurrentRefrigeratorRentalCompanyData = function() {
    return window.currentRefrigeratorRentalCompany
        ? window.createRefrigeratorRentalCompany(window.currentRefrigeratorRentalCompany)
        : null;
};

window.hasReadyRefrigeratorRentalCompany = function() {
    const company = window.getCurrentRefrigeratorRentalCompanyData();
    if (!company?.company_name) return false;
    if (window.normalizeRefrigeratorRentalMode(company.rental_mode) === 'no_booth') return !!company.usage_location;
    return true;
};

window.resetRefrigeratorRentalSearchState = function(message = '输入企业名称后从结果中选择') {
    window.exhibitionCompanyOptions = [];
    const companyInput = document.getElementById('refrigerator-company-search-input');
    if (companyInput) companyInput.value = '';
    const companyResult = document.getElementById('refrigerator-company-search-results');
    if (companyResult) companyResult.innerHTML = `<div class="px-3 py-3 text-xs text-slate-400">${window.escapeHtml(message)}</div>`;
};

window.setRefrigeratorRentalMode = function(mode) {
    const normalizedMode = window.normalizeRefrigeratorRentalMode(mode);
    if (Number(window.currentRefrigeratorRentalEditingId || 0) > 0) return;
    window.currentRefrigeratorRentalMode = normalizedMode;
    window.currentRefrigeratorRentalCompany = normalizedMode === 'no_booth'
        ? window.createRefrigeratorRentalCompany({
            rental_mode: 'no_booth',
            sales_name: String(window.currentUser?.name || '').trim()
        })
        : null;
    window.resetRefrigeratorRentalSearchState(normalizedMode === 'no_booth' ? '无展位租赁无需搜索企业，直接在下方手动填写企业名称和使用地点' : '输入企业名称后从结果中选择');
    window.renderRefrigeratorRentalEditor();
};

window.updateNoBoothRefrigeratorRentalField = function(field, value) {
    if (!window.isNoBoothRefrigeratorRentalMode()) return;
    const current = window.getCurrentRefrigeratorRentalCompanyData() || window.createRefrigeratorRentalCompany({
        rental_mode: 'no_booth',
        sales_name: String(window.currentUser?.name || '').trim()
    });
    window.currentRefrigeratorRentalCompany = window.createRefrigeratorRentalCompany({
        ...current,
        rental_mode: 'no_booth',
        sales_name: String(window.currentUser?.name || current.sales_name || '').trim(),
        [field]: String(value || '').trim()
    });
    window.renderRefrigeratorCompanySummary();
    window.renderRefrigeratorRentalSummary();
};

window.createRefrigeratorRentalDraft = function(values = {}) {
    return {
        line_id: String(values.line_id || '').trim(),
        config_id: Number(values.config_id || 0),
        quantity: values.quantity === '' ? '' : String(values.quantity ?? ''),
        payment_method: String(values.payment_method || '').trim()
    };
};

window.resetRefrigeratorRentalDraft = function() {
    window.currentRefrigeratorRentalDraft = window.createRefrigeratorRentalDraft();
};

window.getCurrentRefrigeratorRentalDraft = function() {
    return window.createRefrigeratorRentalDraft(window.currentRefrigeratorRentalDraft);
};

window.createRefrigeratorRentalLineId = function() {
    window.refrigeratorRentalDraftLineSeed = Number(window.refrigeratorRentalDraftLineSeed || 0) + 1;
    return `rental-line-${Date.now()}-${window.refrigeratorRentalDraftLineSeed}`;
};

window.getRefrigeratorCatalogItemById = function(configId, configs = window.currentRefrigeratorRentalCatalog) {
    return (Array.isArray(configs) ? configs : []).find((item) => Number(item.id || 0) === Number(configId || 0)) || null;
};

window.getRefrigeratorRentalSelectedQuantityByConfig = function(configId, excludeLineId = '') {
    return window.getRefrigeratorRentalItemsArray().reduce((total, item) => {
        if (String(item.line_id || '') === String(excludeLineId || '')) return total;
        if (Number(item.config_id || 0) !== Number(configId || 0)) return total;
        return total + Number(item.quantity || 0);
    }, 0);
};

window.getRefrigeratorRentalTotals = function() {
    return window.getRefrigeratorRentalItemsArray().reduce((totals, item) => {
        const lineAmount = window.roundExhibitionCurrency(item.line_amount);
        if (item.payment_method === 'organizer') totals.organizer += lineAmount;
        if (item.payment_method === 'venue') totals.venue += lineAmount;
        totals.total += lineAmount;
        return totals;
    }, { organizer: 0, venue: 0, total: 0 });
};

window.getFilteredRefrigeratorCatalog = function(configs = window.exhibitionRefrigeratorConfigs) {
    return (Array.isArray(configs) ? configs : []).filter((config) => {
        const selectedQuantity = window.getRefrigeratorRentalSelectedQuantityByConfig(Number(config.id || 0));
        return Number(config.is_active || 0) || selectedQuantity > 0;
    });
};

window.refreshExhibitionAssetImages = async function(root = document) {
    const images = typeof root?.querySelectorAll === 'function'
        ? Array.from(root.querySelectorAll('[data-exhibition-image-url]'))
        : [];
    for (const image of images) {
        const assetUrl = String(image.dataset.exhibitionImageUrl || '').trim();
        if (!assetUrl || image.dataset.assetLoaded === '1') continue;
        image.dataset.assetLoaded = '1';
        const dataUrl = await window.getAuthorizedAssetDataUrl?.(assetUrl);
        if (dataUrl) {
            image.src = dataUrl;
            image.classList.remove('hidden');
            const shell = image.closest?.('[data-exhibition-image-shell]');
            shell?.querySelector?.('[data-exhibition-image-empty]')?.classList.add('hidden');
        }
    }
};

window.syncExhibitionOverlayLock = function() {
    document.body?.classList.toggle('overflow-hidden', !!window.isRefrigeratorConfigEditorOpen || !!window.isRefrigeratorRentalEditorOpen || !!window.isLintelEditorOpen);
};

window.getExhibitionManagerStaffList = function() {
    return (Array.isArray(window.exhibitionManagerStaff) ? window.exhibitionManagerStaff : []).filter((member) => window.normalizeUserRole?.(member.role) === 'exhibition_manager');
};

window.canConfirmSpecialDecorations = function(user = window.currentUser) {
    return !!user && (window.isSuperAdmin?.(user) || window.isExhibitionManager?.(user));
};

window.renderExhibitionManagerList = function() {
    const tbody = document.getElementById('exhibition-manager-list-tbody');
    if (!tbody) return;
    const managers = window.getExhibitionManagerStaffList();
    if (!managers.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">暂未新增展务管理人员</td></tr>';
        return;
    }
    tbody.innerHTML = managers.map((member) => {
        const memberName = String(member.name || '').trim();
        const memberNameJsLiteral = `'${window.escapeAttr(memberName).replace(/'/g, '&#39;')}'`;
        return `
        <tr class="border-b border-slate-200 hover:bg-slate-50 transition">
            <td class="p-3 font-bold text-slate-800">${window.escapeHtml(member.name || '')}</td>
            <td class="p-3"><span class="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">展务管理人员</span></td>
            <td class="p-3 text-slate-500">仅可见展务管理及其二级菜单</td>
            <td class="p-3 text-right">
                <div class="flex justify-end gap-2">
                    <button type="button" onclick="window.resetExhibitionManagerPassword(${memberNameJsLiteral})" class="btn-soft-amber px-3 py-1.5 text-xs">重置密码</button>
                    <button type="button" onclick="window.deleteExhibitionManager(${memberNameJsLiteral})" class="btn-soft-danger px-3 py-1.5 text-xs">删除</button>
                </div>
            </td>
        </tr>
    `;}).join('');
};

window.loadExhibitionManagers = async function() {
    const response = await window.apiFetch('/api/staff');
    const staff = await window.readApiJson(response, '加载展务管理人员失败', []);
    window.exhibitionManagerStaff = Array.isArray(staff) ? staff : [];
    window.renderExhibitionManagerList();
};

window.createExhibitionManager = async function() {
    const name = document.getElementById('exhibition-manager-name')?.value?.trim() || '';
    const role = document.getElementById('exhibition-manager-role')?.value || 'exhibition_manager';
    if (!name) {
        window.showToast('请输入展务管理人员姓名', 'error');
        return;
    }
    try {
        await window.withButtonLoading('btn-add-exhibition-manager', async () => {
            await window.ensureApiSuccess(
                await window.apiFetch('/api/staff', {
                    method: 'POST',
                    body: JSON.stringify({ name, role })
                }),
                '新增展务管理人员失败'
            );
            document.getElementById('exhibition-manager-name').value = '';
            window.showToast('展务管理人员已新增');
            await window.loadExhibitionManagers();
        });
    } catch (error) {
        window.showToast(error.message || '新增展务管理人员失败', 'error');
    }
};

window.resetExhibitionManagerPassword = async function(staffName) {
    if (!confirm(`确定要将展务管理人员【${staffName}】的密码重置为 123456 吗？`)) return;
    try {
        await window.ensureApiSuccess(
            await window.apiFetch('/api/reset-password', {
                method: 'POST',
                body: JSON.stringify({ staffName })
            }),
            '重置密码失败'
        );
        window.showToast(`已将【${staffName}】密码重置为 123456`);
    } catch (error) {
        window.showToast(error.message || '重置密码失败', 'error');
    }
};

window.deleteExhibitionManager = async function(staffName) {
    if (!confirm(`确定删除展务管理人员【${staffName}】吗？`)) return;
    try {
        await window.ensureApiSuccess(
            await window.apiFetch('/api/delete-staff', {
                method: 'POST',
                body: JSON.stringify({ staffName })
            }),
            '删除展务管理人员失败'
        );
        window.showToast('展务管理人员已删除');
        await window.loadExhibitionManagers();
    } catch (error) {
        window.showToast(error.message || '删除展务管理人员失败', 'error');
    }
};

window.fillConfirmationSettingsForm = function(settings = window.exhibitionConfirmationSettings) {
    const titleInput = document.getElementById('confirmation-settings-title-text');
    const ttlDaysInput = document.getElementById('confirmation-settings-ttl-days');
    const ttlHoursInput = document.getElementById('confirmation-settings-ttl-hours');
    const ttlMinutesInput = document.getElementById('confirmation-settings-ttl-minutes');
    const deadlineInput = document.getElementById('confirmation-settings-collection-deadline');
    const bannerInput = document.getElementById('confirmation-settings-banner-key');
    const previewImage = document.getElementById('confirmation-settings-banner-preview');
    const empty = document.getElementById('confirmation-settings-banner-empty');
    if (titleInput) titleInput.value = settings?.title_text || '请核对并确认参展信息';
    const totalMinutes = Number(settings?.link_ttl_minutes || 30);
    const ttlDays = Math.floor(totalMinutes / 1440);
    const ttlHours = Math.floor((totalMinutes % 1440) / 60);
    const ttlMinutes = totalMinutes % 60;
    if (ttlDaysInput) ttlDaysInput.value = ttlDays;
    if (ttlHoursInput) ttlHoursInput.value = ttlHours;
    if (ttlMinutesInput) ttlMinutesInput.value = ttlMinutes;
    if (deadlineInput) deadlineInput.value = String(settings?.collection_deadline_at || '').trim().slice(0, 16).replace(' ', 'T');
    if (bannerInput) bannerInput.value = settings?.banner_image_key || '';
    if (previewImage) {
        previewImage.src = settings?.banner_image_url || '';
        previewImage.classList.toggle('hidden', !settings?.banner_image_url);
    }
    if (empty) empty.classList.toggle('hidden', !!settings?.banner_image_url);
};

window.loadConfirmationSettings = async function() {
    if (!window.isSuperAdmin?.()) return;
    const projectId = window.getExhibitionProjectId();
    if (!projectId) return;
    try {
        const data = await window.readApiJson(
            await window.apiFetch(`/api/exhibition/confirmation-settings?projectId=${encodeURIComponent(projectId)}`),
            '加载展商确认链接设置失败',
            null
        );
        window.exhibitionConfirmationSettings = data || null;
        window.fillConfirmationSettingsForm();
    } catch (error) {
        window.showToast(error.message || '加载展商确认链接设置失败', 'error');
    }
};

window.normalizeConfirmationDeadlineInput = function(value) {
    const text = String(value || '').trim().replace('T', ' ');
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return '';
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || '00'}`;
};

window.uploadConfirmationBanner = async function(input) {
    if (!window.isSuperAdmin?.()) {
        window.showToast('仅超级管理员可上传确认页头图', 'error');
        return;
    }
    const file = input?.files?.[0];
    if (!file) return;
    const projectId = window.getExhibitionProjectId();
    const formData = new FormData();
    formData.append('project_id', String(projectId));
    formData.append('file', file);
    try {
        const data = await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/confirmation-banner-upload', { method: 'POST', body: formData }),
            '上传确认页头图失败',
            {}
        );
        const nextSettings = {
            ...(window.exhibitionConfirmationSettings || {}),
            banner_image_key: data.fileKey || '',
            banner_image_url: data.image_url || ''
        };
        window.exhibitionConfirmationSettings = nextSettings;
        window.fillConfirmationSettingsForm(nextSettings);
        window.showToast('确认页头图已上传，请保存设置');
    } catch (error) {
        window.showToast(error.message || '上传确认页头图失败', 'error');
    } finally {
        if (input) input.value = '';
    }
};

window.saveConfirmationSettings = async function() {
    if (!window.isSuperAdmin?.()) {
        window.showToast('仅超级管理员可保存确认链接设置', 'error');
        return;
    }
    const projectId = window.getExhibitionProjectId();
    const titleText = document.getElementById('confirmation-settings-title-text')?.value?.trim() || '';
    const ttlDays = Math.max(0, Math.floor(Number(document.getElementById('confirmation-settings-ttl-days')?.value || 0)));
    const ttlHours = Math.max(0, Math.floor(Number(document.getElementById('confirmation-settings-ttl-hours')?.value || 0)));
    const ttlMinutePart = Math.max(0, Math.floor(Number(document.getElementById('confirmation-settings-ttl-minutes')?.value || 0)));
    const ttlMinutes = (ttlDays * 1440) + (ttlHours * 60) + ttlMinutePart;
    if (ttlMinutes < 1) {
        window.showToast('链接有效时间至少为 1 分钟', 'error');
        return;
    }
    const collectionDeadlineAt = document.getElementById('confirmation-settings-collection-deadline')?.value?.trim() || '';
    const normalizedCollectionDeadlineAt = window.normalizeConfirmationDeadlineInput(collectionDeadlineAt);
    if (!normalizedCollectionDeadlineAt) {
        window.showToast('请先设置“信息收集截止时间”，否则展商填写页无法显示截止倒计时', 'error');
        return;
    }
    const bannerImageKey = document.getElementById('confirmation-settings-banner-key')?.value?.trim() || '';
    await window.withButtonLoading('btn-save-confirmation-settings', async () => {
        const data = await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/confirmation-settings', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: projectId,
                    title_text: titleText,
                    link_ttl_minutes: ttlMinutes,
                    collection_deadline_at: collectionDeadlineAt,
                    banner_image_key: bannerImageKey
                })
            }),
            '保存确认链接设置失败',
            {}
        );
        const savedSettings = data.settings || {};
        if (String(savedSettings.collection_deadline_at || '') !== normalizedCollectionDeadlineAt) {
            throw new Error(`保存校验失败：服务器保存的截止时间为 ${savedSettings.collection_deadline_display || savedSettings.collection_deadline_at || '-'}，不是你刚输入的 ${normalizedCollectionDeadlineAt}`);
        }
        window.exhibitionConfirmationSettings = savedSettings || window.exhibitionConfirmationSettings;
        window.fillConfirmationSettingsForm();
        window.showToast(`展商确认链接设置已保存：${savedSettings.collection_deadline_display || savedSettings.collection_deadline_at}`);
    });
};

window.getSelectedRefrigeratorRentalIds = function() {
    return Array.from(new Set((Array.isArray(window.selectedRefrigeratorRentalIds) ? window.selectedRefrigeratorRentalIds : []).map((id) => Number(id || 0)).filter((id) => Number.isInteger(id) && id > 0)));
};

window.clearSelectedRefrigeratorRentals = function() {
    window.selectedRefrigeratorRentalIds = [];
};

window.toggleRefrigeratorRentalSelection = function(rentalId, checked) {
    const normalizedId = Number(rentalId || 0);
    if (!normalizedId) return;
    const current = new Set(window.getSelectedRefrigeratorRentalIds());
    if (checked) current.add(normalizedId);
    else current.delete(normalizedId);
    window.selectedRefrigeratorRentalIds = [...current];
    window.renderRefrigeratorRentalTable();
};

window.toggleAllRefrigeratorRentalSelections = function(checked) {
    window.selectedRefrigeratorRentalIds = checked
        ? (Array.isArray(window.exhibitionRefrigeratorRentals) ? window.exhibitionRefrigeratorRentals : []).map((row) => Number(row.id || 0)).filter((id) => id > 0)
        : [];
    window.renderRefrigeratorRentalTable();
};

window.isConfirmedRefrigeratorRental = function(rental) {
    return Number(rental?.venue_confirmed || 0) === 1;
};

window.submitRefrigeratorRentalConfirmation = async function(rentalIds, confirmed) {
    const ids = Array.isArray(rentalIds) ? rentalIds : [rentalIds];
    const normalizedIds = ids.map((id) => Number(id || 0)).filter((id) => Number.isInteger(id) && id > 0);
    if (!normalizedIds.length) {
        window.showToast('请先选择租赁记录', 'error');
        return;
    }
    try {
        await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/refrigerator-rental-confirmation', {
                method: 'POST',
                body: JSON.stringify({ rental_ids: normalizedIds, confirmed: confirmed ? 1 : 0 })
            }),
            confirmed ? '批量确认失败' : '批量驳回失败',
            {}
        );
        if (normalizedIds.includes(Number(window.currentRefrigeratorRentalEditingId || 0))) {
            window.closeRefrigeratorRentalEditor();
            window.currentRefrigeratorRentalEditingId = 0;
            window.currentRefrigeratorRentalVenueConfirmed = false;
        }
        window.clearSelectedRefrigeratorRentals();
        await Promise.all([
            window.loadRefrigeratorConfigs({ force: true }),
            window.loadRefrigeratorRentalList({ force: true })
        ]);
        window.showToast(confirmed ? '主场确认状态已更新为已确认' : '主场确认状态已驳回为未确认');
    } catch (error) {
        window.showToast(error.message || (confirmed ? '确认失败' : '驳回失败'), 'error');
    }
};

window.toggleSingleRefrigeratorRentalConfirmation = async function(rentalId, confirmed) {
    const actionText = confirmed ? '确认' : '驳回';
    if (!confirm(`确定要${actionText}这条冰柜租赁记录吗？`)) return;
    await window.submitRefrigeratorRentalConfirmation([Number(rentalId || 0)], confirmed);
};

window.toggleBatchRefrigeratorRentalConfirmation = async function(confirmed) {
    const selectedIds = window.getSelectedRefrigeratorRentalIds();
    if (!selectedIds.length) {
        window.showToast('请先勾选要处理的租赁记录', 'error');
        return;
    }
    const actionText = confirmed ? '批量确认' : '批量驳回';
    if (!confirm(`确定要${actionText}已勾选的 ${selectedIds.length} 条冰柜租赁记录吗？`)) return;
    await window.submitRefrigeratorRentalConfirmation(selectedIds, confirmed);
};

window.renderExhibitionPanels = function() {
    const panelKeys = ['project-settings', 'exhibitor-directory', 'refrigerator-rentals', 'equipment', 'lintel', 'special-decoration'];
    const nextPanelKey = window.resolveExhibitionPanelKey?.(window.currentExhibitionPanel);
    if (nextPanelKey !== 'project-settings' && window.isRefrigeratorConfigEditorOpen) {
        window.closeRefrigeratorConfigEditor();
    }
    if (nextPanelKey !== 'refrigerator-rentals' && window.isRefrigeratorRentalEditorOpen) {
        window.closeRefrigeratorRentalEditor();
    }
    if (nextPanelKey !== 'lintel' && window.isLintelEditorOpen) {
        window.closeLintelEditor();
    }
    window.currentExhibitionPanel = nextPanelKey;
    const exportButton = document.getElementById('btn-export-refrigerator-rentals');
    if (exportButton) exportButton.classList.toggle('hidden', !window.canManageExhibitionModule?.());
    panelKeys.forEach((panelKey) => {
        const panel = document.getElementById(`exhibition-panel-${panelKey}`);
        if (panel) panel.classList.toggle('hidden', panelKey !== nextPanelKey);
    });
    window.initResponsiveTableScrollers?.(document.getElementById('sec-exhibition') || document);
    window.refreshResponsiveTableScrollers?.();
};

window.openExhibitionPanel = function(panelKey, options = {}) {
    window.currentExhibitionPanel = window.resolveExhibitionPanelKey?.(panelKey);
    window.renderExhibitionPanels();
    if (options.skipLoad) return;
    window.renderNav?.();
};

window.loadExhibitionPanel = async function(panelKey, options = {}) {
    window.currentExhibitionPanel = window.resolveExhibitionPanelKey?.(panelKey);
    window.renderExhibitionPanels();
    if (window.currentExhibitionPanel === 'project-settings') {
        await Promise.all([
            window.loadRefrigeratorConfigs({ force: !!options.force }),
            window.loadExhibitionManagers(),
            window.loadConfirmationSettings()
        ]);
        return;
    }
    if (window.currentExhibitionPanel === 'refrigerator-rentals') {
        await Promise.all([
            window.loadRefrigeratorConfigs({ force: !!options.force }),
            window.loadRefrigeratorRentalList({ force: !!options.force })
        ]);
        return;
    }
    if (window.currentExhibitionPanel === 'lintel') {
        await window.loadLintelList({ force: !!options.force });
        return;
    }
    if (window.currentExhibitionPanel === 'special-decoration') {
        await window.loadSpecialDecorationList({ force: !!options.force });
        return;
    }
    if (window.currentExhibitionPanel === 'exhibitor-directory') {
        await window.loadExhibitorDirectory({ force: !!options.force });
        return;
    }
    window.renderNav?.();
};

window.setRefrigeratorConfigPreview = async function(assetUrl = '') {
    const previewCard = document.getElementById('refrigerator-config-image-preview-card');
    const previewImage = document.getElementById('refrigerator-config-image-preview');
    const emptyState = document.getElementById('refrigerator-config-image-empty');
    if (!previewCard || !previewImage || !emptyState) return;

    if (window.currentRefrigeratorConfigLocalPreviewUrl) {
        URL.revokeObjectURL(window.currentRefrigeratorConfigLocalPreviewUrl);
        window.currentRefrigeratorConfigLocalPreviewUrl = '';
    }

    if (!assetUrl) {
        previewCard.classList.remove('hidden');
        previewImage.classList.add('hidden');
        previewImage.src = '';
        emptyState.classList.remove('hidden');
        return;
    }

    previewCard.classList.remove('hidden');
    emptyState.classList.add('hidden');
    previewImage.classList.remove('hidden');
    if (/^blob:|^data:/i.test(assetUrl)) {
        previewImage.src = assetUrl;
        return;
    }
    const dataUrl = await window.getAuthorizedAssetDataUrl?.(assetUrl);
    if (dataUrl) {
        previewImage.src = dataUrl;
    } else {
        previewImage.classList.add('hidden');
        emptyState.classList.remove('hidden');
    }
};

window.previewRefrigeratorConfigLocalImage = function(input) {
    const file = input?.files?.[0];
    if (!file) {
        window.setRefrigeratorConfigPreview(window.currentRefrigeratorConfigImageUrl || '');
        return;
    }
    if (window.currentRefrigeratorConfigLocalPreviewUrl) {
        URL.revokeObjectURL(window.currentRefrigeratorConfigLocalPreviewUrl);
    }
    window.currentRefrigeratorConfigLocalPreviewUrl = URL.createObjectURL(file);
    window.setRefrigeratorConfigPreview(window.currentRefrigeratorConfigLocalPreviewUrl);
};

window.resetRefrigeratorConfigForm = function() {
    window.currentRefrigeratorConfigEditingId = 0;
    window.currentRefrigeratorConfigImageKey = '';
    window.currentRefrigeratorConfigImageUrl = '';
    const fieldIds = [
        'refrigerator-config-id',
        'refrigerator-config-style',
        'refrigerator-config-spec',
        'refrigerator-config-unit-price',
        'refrigerator-config-stock',
        'refrigerator-config-display-order'
    ];
    fieldIds.forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (field) field.value = '';
    });
    const activeField = document.getElementById('refrigerator-config-active');
    if (activeField) activeField.checked = true;
    const fileField = document.getElementById('refrigerator-config-image-file');
    if (fileField) fileField.value = '';
    const title = document.getElementById('refrigerator-config-form-title');
    if (title) title.innerText = '新增冰柜样式';
    const mode = document.getElementById('refrigerator-config-editor-mode');
    if (mode) mode.innerText = '填写基础样式、价格、库存和启停状态，保存后会立即纳入冰柜样式清单。';
    window.setRefrigeratorConfigPreview('');
};

window.renderRefrigeratorConfigEditor = function() {
    const editor = document.getElementById('refrigerator-config-editor');
    const mode = document.getElementById('refrigerator-config-editor-mode');
    if (!editor) return;
    editor.classList.toggle('hidden', !window.isRefrigeratorConfigEditorOpen);
    window.syncExhibitionOverlayLock();
    if (!window.isRefrigeratorConfigEditorOpen) return;
    if (mode) {
        mode.innerText = Number(window.currentRefrigeratorConfigEditingId || 0) > 0
            ? '当前正在编辑已有冰柜样式；保存后，冰柜样式清单会立即更新。'
            : '填写基础样式、价格、库存和启停状态，保存后会立即纳入冰柜样式清单。';
    }
};

window.openNewRefrigeratorConfigEditor = function() {
    window.resetRefrigeratorConfigForm();
    window.isRefrigeratorConfigEditorOpen = true;
    window.renderRefrigeratorConfigEditor();
};

window.closeRefrigeratorConfigEditor = function() {
    window.isRefrigeratorConfigEditorOpen = false;
    window.renderRefrigeratorConfigEditor();
    window.resetRefrigeratorConfigForm();
};

window.editRefrigeratorConfig = function(configId) {
    const config = (window.exhibitionRefrigeratorConfigs || []).find((item) => Number(item.id || 0) === Number(configId || 0));
    if (!config) {
        window.showToast('未找到冰柜配置', 'error');
        return;
    }
    window.currentRefrigeratorConfigEditingId = Number(config.id || 0);
    window.currentRefrigeratorConfigImageKey = String(config.image_key || '').trim();
    window.currentRefrigeratorConfigImageUrl = String(config.image_url || '').trim();
    document.getElementById('refrigerator-config-id').value = window.currentRefrigeratorConfigEditingId;
    document.getElementById('refrigerator-config-style').value = config.style_name || '';
    document.getElementById('refrigerator-config-spec').value = config.spec || '';
    document.getElementById('refrigerator-config-unit-price').value = window.roundExhibitionCurrency(config.unit_price);
    document.getElementById('refrigerator-config-stock').value = Number(config.stock_quantity || 0);
    document.getElementById('refrigerator-config-display-order').value = Number(config.display_order || 0);
    document.getElementById('refrigerator-config-active').checked = Number(config.is_active || 0) === 1;
    const fileField = document.getElementById('refrigerator-config-image-file');
    if (fileField) fileField.value = '';
    const title = document.getElementById('refrigerator-config-form-title');
    if (title) title.innerText = `编辑冰柜样式 · ${config.style_name || ''}`;
    window.setRefrigeratorConfigPreview(window.currentRefrigeratorConfigImageUrl || '');
    window.isRefrigeratorConfigEditorOpen = true;
    window.renderRefrigeratorConfigEditor();
};

window.buildRefrigeratorConfigListRowHtml = function(config, options = {}) {
    const configId = Number(config.id || 0);
    const stockQuantity = Number(config.stock_quantity || 0);
    const rentedQuantity = Number(config.rented_quantity || 0);
    const availableQuantity = Number(config.available_quantity || 0);
    const includeActions = options.includeActions !== false;
    const textCellClass = options.textCellClass || 'p-3 min-w-[220px] align-top';
    const actionCellHtml = includeActions
        ? `
                    <td class="p-3 text-right">
                        <div class="flex justify-end gap-2">
                            <button type="button" onclick="window.editRefrigeratorConfig(${configId})" class="btn-secondary px-3 py-2 text-xs">编辑</button>
                            <button type="button" onclick="window.deleteRefrigeratorConfig(${configId})" class="btn-soft-danger px-3 py-2 text-xs">删除</button>
                        </div>
                    </td>`
        : '';
    return `
                <tr class="border-b align-top">
                    <td class="${textCellClass}">
                        <div class="font-bold text-slate-900">${window.escapeHtml(config.style_name || '')}</div>
                        <div class="mt-1 text-xs text-slate-500 leading-5">${window.escapeHtml(config.spec || '')}</div>
                    </td>
                    <td class="p-3 text-sm font-bold text-slate-700">${window.formatExhibitionCurrency(config.unit_price)}</td>
                    <td class="p-3 text-sm text-slate-700">${stockQuantity}</td>
                    <td class="p-3 text-sm text-slate-700">${rentedQuantity}</td>
                    <td class="p-3 text-sm font-bold ${availableQuantity > 0 ? 'text-emerald-700' : 'text-rose-600'}">${availableQuantity}</td>
                    <td class="p-3"><span class="${Number(config.is_active || 0) === 1 ? 'badge-success' : 'badge-neutral'}">${Number(config.is_active || 0) === 1 ? '启用中' : '已停用'}</span></td>${actionCellHtml}
                </tr>
            `;
};

window.renderRefrigeratorConfigList = function() {
    const tbody = document.getElementById('refrigerator-config-list');
    const readonlyTbody = document.getElementById('refrigerator-config-list-rental-readonly');
    const configs = window.exhibitionRefrigeratorConfigs;
    if (tbody) {
        tbody.innerHTML = window.renderHtmlCollection(
            configs,
            (config) => window.buildRefrigeratorConfigListRowHtml(config, { includeActions: true }),
            '<tr><td colspan="7" class="p-5 text-center text-sm text-slate-400">当前项目还没有配置冰柜样式</td></tr>'
        );
        window.refreshExhibitionAssetImages(tbody).catch(() => {});
    }
    if (readonlyTbody) {
        readonlyTbody.innerHTML = window.renderHtmlCollection(
            configs,
            (config) => window.buildRefrigeratorConfigListRowHtml(config, { includeActions: false, textCellClass: 'p-3 min-w-[220px] align-top' }),
            '<tr><td colspan="6" class="p-5 text-center text-sm text-slate-400">当前项目还没有配置冰柜样式</td></tr>'
        );
        window.refreshExhibitionAssetImages(readonlyTbody).catch(() => {});
    }
};

window.renderRefrigeratorInventoryStatus = function() {
    const content = document.getElementById('refrigerator-inventory-status-content');
    const button = document.getElementById('btn-toggle-refrigerator-inventory');
    if (content) content.classList.toggle('hidden', !!window.isRefrigeratorInventoryCollapsed);
    if (button) button.innerText = window.isRefrigeratorInventoryCollapsed ? '展开库存状态' : '收起库存状态';
};

window.toggleRefrigeratorInventoryStatus = function() {
    window.isRefrigeratorInventoryCollapsed = !window.isRefrigeratorInventoryCollapsed;
    window.renderRefrigeratorInventoryStatus();
};

window.getRefrigeratorRentalTableTotals = function(rows = window.exhibitionRefrigeratorRentals, typeColumns = window.exhibitionRefrigeratorTypeColumns) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const normalizedTypeColumns = Array.isArray(typeColumns) ? typeColumns : [];
    const totals = {
        item_counts: {},
        organizer_payment_total: 0,
        venue_payment_total: 0
    };
    normalizedTypeColumns.forEach((column) => {
        totals.item_counts[column] = 0;
    });
    normalizedRows.forEach((row) => {
        normalizedTypeColumns.forEach((column) => {
            totals.item_counts[column] = Number(totals.item_counts[column] || 0) + Number(row.item_counts?.[column] || 0);
        });
        totals.organizer_payment_total += Number(row.organizer_payment_total || 0);
        totals.venue_payment_total += Number(row.venue_payment_total || 0);
    });
    totals.organizer_payment_total = window.roundExhibitionCurrency(totals.organizer_payment_total);
    totals.venue_payment_total = window.roundExhibitionCurrency(totals.venue_payment_total);
    return totals;
};

window.loadRefrigeratorConfigs = async function() {
    const projectId = window.getExhibitionProjectId();
    if (!projectId) return;
    const response = await window.apiFetch(`/api/exhibition/refrigerator-configs?projectId=${projectId}`);
    window.exhibitionRefrigeratorConfigs = await window.readApiJson(response, '加载冰柜配置失败', []);
    window.renderRefrigeratorConfigList();
    window.renderRefrigeratorInventoryStatus();
    if (!window.currentRefrigeratorRentalEditingId) {
        window.currentRefrigeratorRentalCatalog = window.getFilteredRefrigeratorCatalog(window.exhibitionRefrigeratorConfigs);
        window.renderRefrigeratorRentalCatalog();
    }
};

window.saveRefrigeratorConfig = async function() {
    const projectId = window.getExhibitionProjectId();
    if (!projectId) {
        window.showToast('请先选择项目', 'error');
        return;
    }
    const styleName = document.getElementById('refrigerator-config-style')?.value?.trim();
    const spec = document.getElementById('refrigerator-config-spec')?.value?.trim();
    const unitPrice = Number(document.getElementById('refrigerator-config-unit-price')?.value || 0);
    const stockQuantity = Number(document.getElementById('refrigerator-config-stock')?.value || 0);
    const displayOrder = Number(document.getElementById('refrigerator-config-display-order')?.value || 0);
    const isActive = document.getElementById('refrigerator-config-active')?.checked ? 1 : 0;
    if (!styleName || !spec) {
        window.showToast('请完整填写冰柜样式名称和规格', 'error');
        return;
    }
    const saveButton = document.getElementById('btn-save-refrigerator-config');
    const originalText = saveButton?.innerHTML || '';
    await window.withButtonLoading('btn-save-refrigerator-config', async () => {
        let imageKey = window.currentRefrigeratorConfigImageKey || '';
        const file = document.getElementById('refrigerator-config-image-file')?.files?.[0];
        if (file) {
            const uploadId = window.createContractUploadId?.() || `${Date.now()}`;
            const formData = new FormData();
            formData.append('file', file, String(file.name || 'refrigerator.png'));
            formData.append('uploadId', uploadId);
            const uploadData = await window.readApiSuccessJson(
                await window.apiFetch('/api/exhibition/refrigerator-image-upload', { method: 'POST', body: formData }),
                '上传冰柜图示失败',
                {}
            );
            imageKey = String(uploadData.fileKey || '').trim();
            window.currentRefrigeratorConfigImageKey = imageKey;
            window.currentRefrigeratorConfigImageUrl = String(uploadData.fileUrl || '').trim();
            if (window.currentRefrigeratorConfigImageUrl) {
                window.revokeAuthorizedAssetUrl?.(window.currentRefrigeratorConfigImageUrl);
            }
        }

        await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/refrigerator-configs', {
                method: 'POST',
                body: JSON.stringify({
                    id: window.currentRefrigeratorConfigEditingId || 0,
                    project_id: projectId,
                    style_name: styleName,
                    spec,
                    unit_price: unitPrice,
                    stock_quantity: stockQuantity,
                    display_order: displayOrder,
                    is_active: isActive,
                    image_key: imageKey
                })
            }),
            '保存冰柜配置失败',
            {}
        );
        window.showToast('冰柜配置已保存');
        window.closeRefrigeratorConfigEditor();
        await window.loadRefrigeratorConfigs({ force: true });
    }, originalText);
};

window.deleteRefrigeratorConfig = async function(configId) {
    const config = (window.exhibitionRefrigeratorConfigs || []).find((item) => Number(item.id || 0) === Number(configId || 0));
    if (!config) {
        window.showToast('未找到冰柜配置', 'error');
        return;
    }
    if (!confirm(`确定删除冰柜样式【${config.style_name || ''}】吗？`)) return;
    try {
        await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/delete-refrigerator-config', {
                method: 'POST',
                body: JSON.stringify({
                    id: Number(configId || 0),
                    project_id: window.getExhibitionProjectId()
                })
            }),
            '删除冰柜配置失败',
            {}
        );
        if (Number(window.currentRefrigeratorConfigEditingId || 0) === Number(configId || 0)) {
            window.closeRefrigeratorConfigEditor();
        }
        await window.loadRefrigeratorConfigs({ force: true });
        window.showToast('冰柜样式已删除');
    } catch (error) {
        window.showToast(error.message || '删除冰柜配置失败', 'error');
    }
};

window.renderRefrigeratorRentalTable = function() {
    const container = document.getElementById('refrigerator-rental-table-wrap');
    if (!container) return;
    const typeColumns = Array.isArray(window.exhibitionRefrigeratorTypeColumns) ? window.exhibitionRefrigeratorTypeColumns : [];
    const rows = Array.isArray(window.exhibitionRefrigeratorRentals) ? window.exhibitionRefrigeratorRentals : [];
    const totals = window.getRefrigeratorRentalTableTotals(rows, typeColumns);
    const canConfirm = !!window.canConfirmExhibitionRentals?.();
    const selectedIds = new Set(window.getSelectedRefrigeratorRentalIds());
    const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(Number(row.id || 0)));
    const baseFooterColspan = canConfirm ? 7 : 6;
    if (!rows.length) {
        container.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400">当前项目还没有冰柜租赁记录</div>';
        return;
    }
    container.innerHTML = `
        <div class="space-y-4">
            ${canConfirm ? `
                <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div class="text-xs font-bold text-slate-500">当前已勾选 ${selectedIds.size} 条租赁记录，可直接批量确认或批量驳回。</div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" onclick="window.toggleBatchRefrigeratorRentalConfirmation(true)" class="btn-primary px-4 py-2 text-sm">批量确认</button>
                        <button type="button" onclick="window.toggleBatchRefrigeratorRentalConfirmation(false)" class="btn-soft-amber px-4 py-2 text-sm">批量驳回</button>
                    </div>
                </div>
            ` : ''}
        <div class="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table class="min-w-full text-sm text-left whitespace-nowrap">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                        ${canConfirm ? `<th class="px-4 py-3 font-bold text-center"><input type="checkbox" ${allSelected ? 'checked' : ''} onchange="window.toggleAllRefrigeratorRentalSelections(this.checked)" class="accent-slate-900"></th>` : ''}
                        <th class="px-4 py-3 font-bold">序号</th>
                        <th class="px-4 py-3 font-bold">企业名称</th>
                        <th class="px-4 py-3 font-bold">主场确认状态</th>
                        <th class="px-4 py-3 font-bold">馆号</th>
                        <th class="px-4 py-3 font-bold">展位号 / 使用地点</th>
                        <th class="px-4 py-3 font-bold">业务员</th>
                        ${typeColumns.map((column) => `<th class="px-4 py-3 font-bold text-center">${window.escapeHtml(column)}数量</th>`).join('')}
                        <th class="px-4 py-3 font-bold text-right">组委会付款金额</th>
                        <th class="px-4 py-3 font-bold text-right">企业直接付至主场金额</th>
                        <th class="px-4 py-3 font-bold text-right">操作</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 bg-white">
                    ${rows.map((row) => {
                        const confirmed = window.isConfirmedRefrigeratorRental(row);
                        const rowId = Number(row.id || 0);
                        const isSelected = selectedIds.has(rowId);
                        return `
                        <tr class="align-top">
                            ${canConfirm ? `<td class="px-4 py-3 text-center"><input type="checkbox" ${isSelected ? 'checked' : ''} onchange="window.toggleRefrigeratorRentalSelection(${rowId}, this.checked)" class="accent-slate-900"></td>` : ''}
                            <td class="px-4 py-3 font-bold text-slate-500">${Number(row.sequence || 0)}</td>
                            <td class="px-4 py-3">
                                <div class="font-bold text-slate-900">${window.escapeHtml(row.company_name || '')}</div>
                                <div class="mt-1 text-xs text-slate-400">更新于 ${window.escapeHtml(row.updated_at || '-')}</div>
                            </td>
                            <td class="px-4 py-3 text-slate-700">
                                <span class="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${window.escapeHtml(row.venue_confirmation_status || (confirmed ? '已确认' : '未确认'))}</span>
                            </td>
                            <td class="px-4 py-3 text-slate-700">${window.escapeHtml(row.hall_names || '-')}</td>
                            <td class="px-4 py-3 text-slate-700">${window.escapeHtml(row.usage_location || row.booth_numbers || '-')}</td>
                            <td class="px-4 py-3 text-slate-700">${window.escapeHtml(row.sales_name || '-')}</td>
                            ${typeColumns.map((column) => `<td class="px-4 py-3 text-center font-bold text-slate-700">${Number(row.item_counts?.[column] || 0)}</td>`).join('')}
                            <td class="px-4 py-3 text-right font-bold text-sky-700">${window.formatExhibitionCurrency(row.organizer_payment_total)}</td>
                            <td class="px-4 py-3 text-right font-bold text-amber-700">${window.formatExhibitionCurrency(row.venue_payment_total)}</td>
                            <td class="px-4 py-3 text-right">
                                <div class="flex justify-end gap-2">
                                    <button type="button" onclick="window.loadRefrigeratorRentalDetail(${rowId})" class="${confirmed ? 'btn-outline opacity-50 cursor-not-allowed' : 'btn-secondary'} px-3 py-2 text-xs" ${confirmed ? 'disabled' : ''}>${confirmed ? '已确认锁定' : '编辑'}</button>
                                    ${canConfirm ? `<button type="button" onclick="window.toggleSingleRefrigeratorRentalConfirmation(${rowId}, ${confirmed ? 'false' : 'true'})" class="${confirmed ? 'btn-soft-amber' : 'btn-primary'} px-3 py-2 text-xs">${confirmed ? '驳回' : '确认'}</button>` : ''}
                                    <button type="button" onclick="window.deleteRefrigeratorRental(${rowId})" class="${confirmed ? 'btn-outline opacity-50 cursor-not-allowed' : 'btn-soft-danger'} px-3 py-2 text-xs" ${confirmed ? 'disabled' : ''}>删除</button>
                                </div>
                            </td>
                        </tr>
                    `;}).join('')}
                </tbody>
                <tfoot class="border-t border-slate-200 bg-slate-50 text-slate-700">
                    <tr>
                        <td class="px-4 py-3 font-black text-slate-900" colspan="${baseFooterColspan}">当前列表总计</td>
                        ${typeColumns.map((column) => `<td class="px-4 py-3 text-center font-black text-slate-900">${Number(totals.item_counts?.[column] || 0)}</td>`).join('')}
                        <td class="px-4 py-3 text-right font-black text-sky-700">${window.formatExhibitionCurrency(totals.organizer_payment_total)}</td>
                        <td class="px-4 py-3 text-right font-black text-amber-700">${window.formatExhibitionCurrency(totals.venue_payment_total)}</td>
                        <td class="px-4 py-3 text-right text-xs text-slate-400">-</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        </div>
    `;
};

window.loadRefrigeratorRentalList = async function() {
    const projectId = window.getExhibitionProjectId();
    if (!projectId) return;
    const search = String(window.currentRefrigeratorRentalSearch || '').trim();
    const params = new URLSearchParams({ projectId: String(projectId) });
    if (search) params.set('search', search);
    const data = await window.readApiJson(
        await window.apiFetch(`/api/exhibition/refrigerator-rentals?${params.toString()}`),
        '加载冰柜租赁列表失败',
        { items: [], type_columns: [] }
    );
    window.exhibitionRefrigeratorRentals = Array.isArray(data?.items) ? data.items : [];
    window.exhibitionRefrigeratorTypeColumns = Array.isArray(data?.type_columns) ? data.type_columns : [];
    const availableIds = new Set(window.exhibitionRefrigeratorRentals.map((row) => Number(row.id || 0)).filter((id) => id > 0));
    window.selectedRefrigeratorRentalIds = window.getSelectedRefrigeratorRentalIds().filter((id) => availableIds.has(id));
    window.exhibitionRefrigeratorRentalTotals = window.getRefrigeratorRentalTableTotals(window.exhibitionRefrigeratorRentals, window.exhibitionRefrigeratorTypeColumns);
    window.renderRefrigeratorRentalTable();
};

window.reloadRefrigeratorRentalListFromSearch = function() {
    window.currentRefrigeratorRentalSearch = document.getElementById('refrigerator-rental-search')?.value?.trim() || '';
    window.loadRefrigeratorRentalList({ force: true }).catch((error) => {
        window.showToast(error.message || '加载冰柜租赁列表失败', 'error');
    });
};

window.renderRefrigeratorCompanySummary = function() {
    const container = document.getElementById('refrigerator-selected-company-summary');
    if (!container) return;
    const company = window.getCurrentRefrigeratorRentalCompanyData();
    const isNoBoothMode = window.isNoBoothRefrigeratorRentalMode();
    if (!company?.company_name) {
        container.innerHTML = isNoBoothMode
            ? '<div class="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-6 text-sm text-emerald-700">当前为无展位租赁，请手动填写企业名称和冰柜使用地点。保存整单前，下方会实时显示你填写的主体信息。</div>'
            : '<div class="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-sm text-amber-700">先在上方蓝色搜索区输入企业名称，再从搜索结果中点击企业。这里显示的是已选企业信息，不是输入框。</div>';
        return;
    }
    if (isNoBoothMode) {
        container.innerHTML = `
            <div class="grid gap-3 md:grid-cols-4">
                <div class="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                    <div class="text-xs font-bold tracking-wide text-emerald-500">企业名称</div>
                    <div class="mt-2 text-sm font-black text-slate-900 leading-6">${window.escapeHtml(company.company_name || '')}</div>
                </div>
                <div class="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                    <div class="text-xs font-bold tracking-wide text-emerald-500">冰柜使用地点</div>
                    <div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(company.usage_location || '-')}</div>
                </div>
                <div class="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                    <div class="text-xs font-bold tracking-wide text-emerald-500">租赁类型</div>
                    <div class="mt-2 text-sm font-black text-slate-900">无展位租赁</div>
                </div>
                <div class="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                    <div class="text-xs font-bold tracking-wide text-emerald-500">业务员</div>
                    <div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(company.sales_name || window.currentUser?.name || '-')}</div>
                </div>
            </div>
        `;
        return;
    }
    container.innerHTML = `
        <div class="grid gap-3 md:grid-cols-4">
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div class="text-xs font-bold tracking-wide text-slate-400">企业名称</div>
                <div class="mt-2 text-sm font-black text-slate-900 leading-6">${window.escapeHtml(company.company_name || '')}</div>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div class="text-xs font-bold tracking-wide text-slate-400">馆号</div>
                <div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(company.hall_names || '-')}</div>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div class="text-xs font-bold tracking-wide text-slate-400">展位号</div>
                <div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(company.booth_numbers || '-')}</div>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div class="text-xs font-bold tracking-wide text-slate-400">业务员</div>
                <div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(company.sales_name || '-')}</div>
            </div>
        </div>
    `;
};

window.renderRefrigeratorCompanyResults = function() {
    const container = document.getElementById('refrigerator-company-search-results');
    if (!container) return;
    const items = Array.isArray(window.exhibitionCompanyOptions) ? window.exhibitionCompanyOptions : [];
    if (!items.length) {
        container.innerHTML = '<div class="px-3 py-3 text-xs text-slate-400">没有匹配企业</div>';
        return;
    }
    container.innerHTML = items.map((item, index) => `
        <button type="button" class="w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0" onclick="window.selectExhibitionCompanyOption(${index})">
            <div class="font-bold text-slate-900">${window.escapeHtml(item.company_name || '')}</div>
            <div class="mt-1 text-xs text-slate-500 leading-5">馆号：${window.escapeHtml(item.hall_names || '-')} · 展位号：${window.escapeHtml(item.booth_numbers || '-')} · 业务员：${window.escapeHtml(item.sales_name || '-')}</div>
            ${Number(item.existing_rental_id || 0) > 0 ? '<div class="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">该企业已有冰柜租赁，点击直接进入明细</div>' : ''}
        </button>
    `).join('');
};

window.scheduleExhibitionCompanySearch = function() {
    if (window.currentRefrigeratorRentalEditingId || window.isNoBoothRefrigeratorRentalMode()) return;
    if (window.exhibitionCompanySearchTimer) {
        clearTimeout(window.exhibitionCompanySearchTimer);
    }
    window.exhibitionCompanySearchTimer = setTimeout(() => {
        window.searchExhibitionCompanies().catch((error) => {
            window.showToast(error.message || '搜索企业失败', 'error');
        });
    }, 220);
};

window.searchExhibitionCompanies = async function() {
    if (window.currentRefrigeratorRentalEditingId || window.isNoBoothRefrigeratorRentalMode()) return;
    const projectId = window.getExhibitionProjectId();
    if (!projectId) return;
    const keyword = document.getElementById('refrigerator-company-search-input')?.value?.trim() || '';
    const container = document.getElementById('refrigerator-company-search-results');
    if (!keyword) {
        window.exhibitionCompanyOptions = [];
        if (container) container.innerHTML = '<div class="px-3 py-3 text-xs text-slate-400">输入企业名称后从结果中选择</div>';
        return;
    }
    const params = new URLSearchParams({ projectId: String(projectId), search: keyword });
    window.exhibitionCompanyOptions = await window.readApiJson(
        await window.apiFetch(`/api/exhibition/company-options?${params.toString()}`),
        '搜索企业失败',
        []
    );
    window.renderRefrigeratorCompanyResults();
};

window.selectExhibitionCompanyOption = async function(index) {
    const option = window.exhibitionCompanyOptions?.[Number(index || 0)];
    if (!option) return;
    if (Number(option.existing_rental_id || 0) > 0 && Number(option.existing_rental_id || 0) !== Number(window.currentRefrigeratorRentalEditingId || 0)) {
        window.showToast('该企业已有冰柜租赁记录，已直接进入该企业明细', 'warning');
        await window.loadRefrigeratorRentalDetail(Number(option.existing_rental_id || 0));
        return;
    }
    window.currentRefrigeratorRentalMode = 'booth';
    window.currentRefrigeratorRentalCompany = window.createRefrigeratorRentalCompany({ ...option, rental_mode: 'booth' });
    window.renderRefrigeratorCompanySummary();
    document.getElementById('refrigerator-company-search-results').innerHTML = '<div class="px-3 py-3 text-xs text-slate-400">企业已选定，如需更换可继续搜索</div>';
};

window.renderRefrigeratorRentalCatalog = function() {
    const container = document.getElementById('refrigerator-rental-catalog');
    if (!container) return;
    const catalog = Array.isArray(window.currentRefrigeratorRentalCatalog) ? window.currentRefrigeratorRentalCatalog : [];
    if (!catalog.length) {
        container.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-400">当前项目还没有可租赁的冰柜样式，请先在“展务项目设置”里配置。</div>';
        return;
    }
    const draft = window.getCurrentRefrigeratorRentalDraft();
    const selectedConfig = window.getRefrigeratorCatalogItemById(draft.config_id, catalog);
    const selectedOtherQuantity = selectedConfig
        ? window.getRefrigeratorRentalSelectedQuantityByConfig(draft.config_id, draft.line_id)
        : 0;
    const remainingQuantity = selectedConfig
        ? Math.max(Number(selectedConfig.available_quantity || 0) - selectedOtherQuantity, 0)
        : 0;
    const quantityValue = window.escapeAttr(String(draft.quantity || ''));
    const isEditingLine = !!draft.line_id;
    container.innerHTML = `
        <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_160px_150px_190px_auto] xl:items-end">
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-2">冰柜类型</label>
                    <select id="refrigerator-rental-line-config" onchange="window.handleRefrigeratorRentalDraftConfigChange(this.value)" class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold">
                        <option value="">请选择冰柜类型</option>
                        ${catalog.map((config) => {
                            const configId = Number(config.id || 0);
                            const availableQuantity = Number(config.available_quantity || 0);
                            const selectedQuantity = window.getRefrigeratorRentalSelectedQuantityByConfig(configId, draft.line_id);
                            const remaining = Math.max(availableQuantity - selectedQuantity, 0);
                            const optionLabel = `${String(config.style_name || '').trim()} / ${String(config.spec || '').trim()} / 剩余${remaining}台`;
                            return `<option value="${configId}" ${configId === Number(draft.config_id || 0) ? 'selected' : ''}>${window.escapeHtml(optionLabel)}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-2">单价</label>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900">${selectedConfig ? window.formatExhibitionCurrency(selectedConfig.unit_price) : '自动带出'}</div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-2">数量</label>
                    <input id="refrigerator-rental-line-quantity" type="number" min="0" step="1" value="${quantityValue}" oninput="window.handleRefrigeratorRentalDraftQuantityChange(this.value)" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold tabular-data" placeholder="0">
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-2">付款方式</label>
                    <select id="refrigerator-rental-line-payment" onchange="window.handleRefrigeratorRentalDraftPaymentChange(this.value)" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold">
                        <option value="">请选择</option>
                        <option value="organizer" ${draft.payment_method === 'organizer' ? 'selected' : ''}>组委会付款</option>
                        <option value="venue" ${draft.payment_method === 'venue' ? 'selected' : ''}>企业直接付至主场</option>
                    </select>
                </div>
                <div class="flex flex-wrap gap-2 xl:justify-end">
                    <button type="button" onclick="window.saveRefrigeratorRentalLineItem()" class="btn-primary px-4 py-3 text-sm shadow-sm whitespace-nowrap">${isEditingLine ? '保存修改' : '保存小项'}</button>
                    ${isEditingLine ? '<button type="button" onclick="window.cancelRefrigeratorRentalLineEdit()" class="btn-secondary px-4 py-3 text-sm whitespace-nowrap">取消编辑</button>' : ''}
                </div>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
                ${selectedConfig
                    ? `当前选择的【${window.escapeHtml(selectedConfig.style_name || '')}】单价为 ${window.formatExhibitionCurrency(selectedConfig.unit_price)}，本行保存前可再分配 ${remainingQuantity} 台；同一款冰柜可按不同付款方式分别新增多行。`
                    : '先从下拉框中选择冰柜类型，系统会自动带出单价。支持同一款冰柜按不同付款方式分别保存多行明细。'}
            </div>
        </div>
    `;
};

window.renderRefrigeratorRentalSummary = function() {
    const container = document.getElementById('refrigerator-rental-summary');
    const saveButton = document.getElementById('btn-save-refrigerator-rental');
    if (!container || !saveButton) return;
    const items = window.getRefrigeratorRentalItemsArray();
    const totals = window.getRefrigeratorRentalTotals();
    saveButton.disabled = !window.hasReadyRefrigeratorRentalCompany() || items.length === 0;
    saveButton.classList.toggle('opacity-60', saveButton.disabled);
    if (!items.length) {
        container.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-400">尚未加入任何冰柜明细。先在上方选择数量与付款方式，再点“保存小项”。</div>';
        return;
    }
    container.innerHTML = `
        <div class="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full text-sm text-left">
                    <thead class="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <tr>
                            <th class="px-4 py-3 font-bold text-center">序号</th>
                            <th class="px-4 py-3 font-bold">样式名称</th>
                            <th class="px-4 py-3 font-bold">规格</th>
                            <th class="px-4 py-3 font-bold text-right">单价</th>
                            <th class="px-4 py-3 font-bold text-center">数量</th>
                            <th class="px-4 py-3 font-bold">付款方式</th>
                            <th class="px-4 py-3 font-bold text-right">小计</th>
                            <th class="px-4 py-3 font-bold text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200 bg-white">
                        ${items.map((item, index) => `
                            <tr>
                                <td class="px-4 py-3 text-center font-bold text-slate-500">${index + 1}</td>
                                <td class="px-4 py-3 font-bold text-slate-900">${window.escapeHtml(item.style_name || '')}</td>
                                <td class="px-4 py-3 text-slate-500">${window.escapeHtml(item.spec || '')}</td>
                                <td class="px-4 py-3 text-right font-bold text-slate-700">${window.formatExhibitionCurrency(item.unit_price)}</td>
                                <td class="px-4 py-3 text-center font-bold text-slate-700">${Number(item.quantity || 0)}</td>
                                <td class="px-4 py-3 text-slate-700">${item.payment_method === 'organizer' ? '组委会付款' : '企业直接付至主场'}</td>
                                <td class="px-4 py-3 text-right font-bold text-slate-900">${window.formatExhibitionCurrency(item.line_amount)}</td>
                                <td class="px-4 py-3 text-right">
                                    <div class="flex justify-end gap-2">
                                        <button type="button" onclick="window.editRefrigeratorRentalLineItem('${window.escapeAttr(item.line_id || '')}')" class="btn-secondary px-3 py-2 text-xs">编辑</button>
                                        <button type="button" onclick="window.removeRefrigeratorRentalLineItem('${window.escapeAttr(item.line_id || '')}')" class="btn-secondary px-3 py-2 text-xs">删除</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="grid gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-3">
                <div class="rounded-2xl bg-white px-4 py-3 border border-slate-200">
                    <div class="text-xs font-bold tracking-wide text-slate-400">组委会付款金额</div>
                    <div class="mt-2 text-lg font-black text-sky-700">${window.formatExhibitionCurrency(totals.organizer)}</div>
                </div>
                <div class="rounded-2xl bg-white px-4 py-3 border border-slate-200">
                    <div class="text-xs font-bold tracking-wide text-slate-400">企业直接付至主场金额</div>
                    <div class="mt-2 text-lg font-black text-amber-700">${window.formatExhibitionCurrency(totals.venue)}</div>
                </div>
                <div class="rounded-2xl bg-slate-900 px-4 py-3 border border-slate-900">
                    <div class="text-xs font-bold tracking-wide text-slate-300">总计应收款</div>
                    <div class="mt-2 text-lg font-black text-white">${window.formatExhibitionCurrency(totals.total)}</div>
                </div>
            </div>
        </div>
    `;
};

window.renderRefrigeratorRentalEditor = function() {
    const editor = document.getElementById('refrigerator-rental-editor');
    const title = document.getElementById('refrigerator-rental-editor-title');
    const mode = document.getElementById('refrigerator-rental-editor-mode');
    const companyInput = document.getElementById('refrigerator-company-search-input');
    const companyTip = document.getElementById('refrigerator-company-lock-tip');
    const normalModeButton = document.getElementById('btn-refrigerator-rental-mode-booth');
    const noBoothModeButton = document.getElementById('btn-refrigerator-rental-mode-no-booth');
    const searchShell = document.getElementById('refrigerator-company-search-shell');
    const searchResults = document.getElementById('refrigerator-company-search-results');
    const manualShell = document.getElementById('refrigerator-company-manual-shell');
    const manualCompanyInput = document.getElementById('refrigerator-manual-company-name');
    const manualLocationInput = document.getElementById('refrigerator-manual-usage-location');
    const summaryTitle = document.getElementById('refrigerator-selected-company-shell-title');
    const summaryHint = document.getElementById('refrigerator-selected-company-shell-hint');
    if (!editor || !title || !mode || !companyInput || !companyTip || !normalModeButton || !noBoothModeButton || !searchShell || !searchResults || !manualShell || !manualCompanyInput || !manualLocationInput || !summaryTitle || !summaryHint) return;
    editor.classList.toggle('hidden', !window.isRefrigeratorRentalEditorOpen);
    window.syncExhibitionOverlayLock();
    if (!window.isRefrigeratorRentalEditorOpen) return;

    const isEditing = Number(window.currentRefrigeratorRentalEditingId || 0) > 0;
    const isNoBoothMode = window.isNoBoothRefrigeratorRentalMode();
    const company = window.getCurrentRefrigeratorRentalCompanyData();
    const saveButton = document.getElementById('btn-save-refrigerator-rental');
    title.innerText = isEditing ? `冰柜租赁明细 · ${window.currentRefrigeratorRentalCompany?.company_name || ''}` : '新增冰柜租赁';
    mode.innerText = isEditing
        ? (isNoBoothMode
            ? '当前正在编辑无展位租赁记录；企业名称和使用地点可继续手动调整，冰柜明细与付款方式保持按行保存。'
            : '当前正在编辑已存在的企业租赁记录；企业主体、馆号、展位号和归属业务员保持与订单聚合结果一致。')
        : (isNoBoothMode
            ? '当前为无展位租赁模式。无需从参展列表搜索企业，直接手动填写企业名称和冰柜使用地点，再按行添加冰柜明细即可。'
            : '先在蓝色搜索区输入并选中一个企业，再按行选择冰柜类型、填写数量和付款方式后保存。企业若已经存在租赁记录，会自动转到该企业明细修改。');
    companyInput.disabled = isEditing || isNoBoothMode;
    companyInput.placeholder = isNoBoothMode ? '无展位租赁模式下无需搜索企业' : '输入企业名称后，从结果中选择';
    companyTip.classList.toggle('hidden', !(isEditing && !isNoBoothMode));
    companyTip.innerText = '当前为已存在企业租赁记录编辑态，企业主体不可切换。';
    normalModeButton.disabled = isEditing;
    noBoothModeButton.disabled = isEditing;
    normalModeButton.className = window.getCurrentRefrigeratorRentalMode() === 'booth'
        ? 'btn-primary px-4 py-2.5 text-sm shadow-sm'
        : 'btn-secondary px-4 py-2.5 text-sm';
    noBoothModeButton.className = isNoBoothMode
        ? 'btn-primary px-4 py-2.5 text-sm shadow-sm'
        : 'btn-secondary px-4 py-2.5 text-sm';
    searchShell.classList.toggle('hidden', isNoBoothMode);
    searchResults.classList.toggle('hidden', isNoBoothMode);
    manualShell.classList.toggle('hidden', !isNoBoothMode);
    summaryTitle.innerText = isNoBoothMode ? '当前保存主体信息' : '已选企业信息';
    summaryHint.innerText = isNoBoothMode
        ? '这里展示的是你手动填写后将随整单一起保存的主体信息。'
        : '这里展示的是已选企业信息；真正的搜索输入框在上方蓝色区域。';
    if (saveButton) {
        saveButton.disabled = !!window.currentRefrigeratorRentalVenueConfirmed;
        saveButton.classList.toggle('opacity-60', !!window.currentRefrigeratorRentalVenueConfirmed);
        saveButton.title = window.currentRefrigeratorRentalVenueConfirmed ? '已确认租赁需先驳回后再修改' : '';
    }
    if (isEditing || !isNoBoothMode) companyInput.value = company?.company_name || '';
    manualCompanyInput.value = isNoBoothMode ? (company?.company_name || '') : '';
    manualLocationInput.value = isNoBoothMode ? (company?.usage_location || '') : '';
    window.renderRefrigeratorCompanySummary();
    window.renderRefrigeratorRentalCatalog();
    window.renderRefrigeratorRentalSummary();
};

window.openNewRefrigeratorRental = async function() {
    window.currentRefrigeratorRentalEditingId = 0;
    window.currentRefrigeratorRentalCompany = null;
    window.currentRefrigeratorRentalMode = 'booth';
    window.currentRefrigeratorRentalItems = [];
    window.resetRefrigeratorRentalDraft();
    window.currentRefrigeratorRentalCatalog = window.getFilteredRefrigeratorCatalog(window.exhibitionRefrigeratorConfigs);
    window.resetRefrigeratorRentalSearchState();
    window.isRefrigeratorRentalEditorOpen = true;
    window.renderRefrigeratorRentalEditor();
};

window.closeRefrigeratorRentalEditor = function() {
    window.isRefrigeratorRentalEditorOpen = false;
    window.renderRefrigeratorRentalEditor();
};

window.handleRefrigeratorRentalEditorKeydown = function(event) {
    if (!window.isRefrigeratorRentalEditorOpen) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        window.closeRefrigeratorRentalEditor();
    }
};

window.addEventListener('keydown', window.handleRefrigeratorRentalEditorKeydown);

window.handleRefrigeratorConfigEditorKeydown = function(event) {
    if (!window.isRefrigeratorConfigEditorOpen) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        window.closeRefrigeratorConfigEditor();
    }
};

window.addEventListener('keydown', window.handleRefrigeratorConfigEditorKeydown);

window.handleRefrigeratorRentalDraftConfigChange = function(value) {
    window.currentRefrigeratorRentalDraft = {
        ...window.getCurrentRefrigeratorRentalDraft(),
        config_id: Number(value || 0)
    };
    window.renderRefrigeratorRentalCatalog();
};

window.handleRefrigeratorRentalDraftQuantityChange = function(value) {
    window.currentRefrigeratorRentalDraft = {
        ...window.getCurrentRefrigeratorRentalDraft(),
        quantity: String(value ?? '')
    };
};

window.handleRefrigeratorRentalDraftPaymentChange = function(value) {
    window.currentRefrigeratorRentalDraft = {
        ...window.getCurrentRefrigeratorRentalDraft(),
        payment_method: String(value || '').trim()
    };
};

window.editRefrigeratorRentalLineItem = function(lineId) {
    const item = window.getRefrigeratorRentalItemsArray().find((entry) => String(entry.line_id || '') === String(lineId || ''));
    if (!item) {
        window.showToast('未找到冰柜明细', 'error');
        return;
    }
    window.currentRefrigeratorRentalDraft = window.createRefrigeratorRentalDraft({
        line_id: item.line_id,
        config_id: item.config_id,
        quantity: item.quantity,
        payment_method: item.payment_method
    });
    window.renderRefrigeratorRentalCatalog();
};

window.cancelRefrigeratorRentalLineEdit = function() {
    window.resetRefrigeratorRentalDraft();
    window.renderRefrigeratorRentalCatalog();
};

window.saveRefrigeratorRentalLineItem = function() {
    const draft = window.getCurrentRefrigeratorRentalDraft();
    const catalogItem = window.getRefrigeratorCatalogItemById(draft.config_id);
    if (!catalogItem) {
        window.showToast('请选择冰柜类型', 'error');
        return;
    }
    if (!window.hasReadyRefrigeratorRentalCompany()) {
        window.showToast(window.isNoBoothRefrigeratorRentalMode() ? '请先填写企业名称和冰柜使用地点' : '请先选择企业', 'error');
        return;
    }
    const quantity = Number(draft.quantity || 0);
    const paymentMethod = draft.payment_method || '';
    if (!Number.isInteger(quantity) || quantity <= 0) {
        window.showToast('请输入大于 0 的租赁数量', 'error');
        return;
    }
    if (!paymentMethod) {
        window.showToast('请选择付款方式', 'error');
        return;
    }
    const selectedOtherQuantity = window.getRefrigeratorRentalSelectedQuantityByConfig(Number(catalogItem.id || 0), draft.line_id);
    if (quantity + selectedOtherQuantity > Number(catalogItem.available_quantity || 0)) {
        window.showToast(`【${catalogItem.style_name || ''}】库存不足，仅剩 ${catalogItem.available_quantity} 台可租`, 'error');
        return;
    }
    const nextLineId = draft.line_id || window.createRefrigeratorRentalLineId();
    const nextItem = {
        line_id: nextLineId,
        config_id: Number(catalogItem.id || 0),
        style_name: String(catalogItem.style_name || '').trim(),
        spec: String(catalogItem.spec || '').trim(),
        image_key: String(catalogItem.image_key || '').trim(),
        unit_price: window.roundExhibitionCurrency(catalogItem.unit_price),
        quantity,
        payment_method: paymentMethod,
        line_amount: window.roundExhibitionCurrency(Number(catalogItem.unit_price || 0) * quantity)
    };
    if (draft.line_id) {
        window.currentRefrigeratorRentalItems = window.getRefrigeratorRentalItemsArray().map((item) => (
            String(item.line_id || '') === String(draft.line_id || '') ? nextItem : item
        ));
    } else {
        window.currentRefrigeratorRentalItems = [...window.getRefrigeratorRentalItemsArray(), nextItem];
    }
    window.resetRefrigeratorRentalDraft();
    window.renderRefrigeratorRentalCatalog();
    window.renderRefrigeratorRentalSummary();
    window.showToast(draft.line_id ? '冰柜小项已更新' : '冰柜小项已加入明细');
};

window.removeRefrigeratorRentalLineItem = function(lineId) {
    window.currentRefrigeratorRentalItems = window.getRefrigeratorRentalItemsArray().filter((item) => String(item.line_id || '') !== String(lineId || ''));
    if (String(window.getCurrentRefrigeratorRentalDraft().line_id || '') === String(lineId || '')) {
        window.resetRefrigeratorRentalDraft();
    }
    window.renderRefrigeratorRentalCatalog();
    window.renderRefrigeratorRentalSummary();
};

window.loadRefrigeratorRentalDetail = async function(rentalId) {
    const data = await window.readApiJson(
        await window.apiFetch(`/api/exhibition/refrigerator-rental-detail?rentalId=${Number(rentalId || 0)}`),
        '加载冰柜租赁明细失败',
        {}
    );
    const rental = data?.rental || {};
    window.currentRefrigeratorRentalEditingId = Number(rental.id || 0);
    window.currentRefrigeratorRentalVenueConfirmed = Number(rental.venue_confirmed || 0) === 1;
    window.currentRefrigeratorRentalMode = window.normalizeRefrigeratorRentalMode(rental.rental_mode);
    window.currentRefrigeratorRentalCompany = window.createRefrigeratorRentalCompany({
        company_name: String(rental.company_name || '').trim(),
        sales_name: String(rental.sales_name || '').trim(),
        hall_names: String(rental.hall_names || '').trim(),
        booth_numbers: String(rental.booth_numbers || '').trim(),
        usage_location: String(rental.usage_location || '').trim(),
        rental_mode: rental.rental_mode
    });
    window.currentRefrigeratorRentalItems = [];
    (Array.isArray(data?.selected_items) ? data.selected_items : []).forEach((item) => {
        window.currentRefrigeratorRentalItems.push({
            line_id: Number(item.id || 0) > 0 ? `existing-${Number(item.id || 0)}` : window.createRefrigeratorRentalLineId(),
            config_id: Number(item.config_id || 0),
            style_name: String(item.style_name || '').trim(),
            spec: String(item.spec || '').trim(),
            image_key: String(item.image_key || '').trim(),
            unit_price: window.roundExhibitionCurrency(item.unit_price),
            quantity: Number(item.quantity || 0),
            payment_method: String(item.payment_method || '').trim(),
            line_amount: window.roundExhibitionCurrency(item.line_amount)
        });
    });
    window.resetRefrigeratorRentalDraft();
    window.currentRefrigeratorRentalCatalog = window.getFilteredRefrigeratorCatalog(Array.isArray(data?.configs) ? data.configs : []);
    window.isRefrigeratorRentalEditorOpen = true;
    window.renderRefrigeratorRentalEditor();
};

window.deleteRefrigeratorRental = async function(rentalId) {
    const rental = (window.exhibitionRefrigeratorRentals || []).find((item) => Number(item.id || 0) === Number(rentalId || 0));
    if (!rental) {
        window.showToast('未找到冰柜租赁记录', 'error');
        return;
    }
    if (window.isConfirmedRefrigeratorRental(rental)) {
        window.showToast('该租赁记录已被主场确认，需先驳回后才能删除', 'error');
        return;
    }
    if (!confirm(`确定删除企业【${rental.company_name || ''}】的整单冰柜租赁记录吗？`)) return;
    try {
        await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/delete-refrigerator-rental', {
                method: 'POST',
                body: JSON.stringify({ rental_id: Number(rentalId || 0) })
            }),
            '删除冰柜租赁失败',
            {}
        );
        if (Number(window.currentRefrigeratorRentalEditingId || 0) === Number(rentalId || 0)) {
            window.closeRefrigeratorRentalEditor();
            window.currentRefrigeratorRentalEditingId = 0;
            window.currentRefrigeratorRentalCompany = null;
            window.currentRefrigeratorRentalVenueConfirmed = false;
            window.currentRefrigeratorRentalItems = [];
            window.resetRefrigeratorRentalDraft();
        }
        await Promise.all([
            window.loadRefrigeratorConfigs({ force: true }),
            window.loadRefrigeratorRentalList({ force: true })
        ]);
        window.showToast('冰柜租赁已删除');
    } catch (error) {
        window.showToast(error.message || '删除冰柜租赁失败', 'error');
    }
};

window.submitRefrigeratorRental = async function() {
    const projectId = window.getExhibitionProjectId();
    if (!projectId) {
        window.showToast('请先选择项目', 'error');
        return;
    }
    const company = window.getCurrentRefrigeratorRentalCompanyData();
    if (window.currentRefrigeratorRentalVenueConfirmed) {
        window.showToast('该租赁记录已被主场确认，需先驳回后才能修改', 'error');
        return;
    }
    if (!company?.company_name) {
        window.showToast(window.isNoBoothRefrigeratorRentalMode() ? '请先填写企业名称' : '请先选择企业', 'error');
        return;
    }
    if (window.isNoBoothRefrigeratorRentalMode() && !company.usage_location) {
        window.showToast('请先填写冰柜使用地点', 'error');
        return;
    }
    const items = window.getRefrigeratorRentalItemsArray().map((item) => ({
        config_id: Number(item.config_id || 0),
        quantity: Number(item.quantity || 0),
        payment_method: String(item.payment_method || '').trim()
    }));
    if (!items.length) {
        window.showToast('请至少添加一项冰柜租赁', 'error');
        return;
    }
    const saveButton = document.getElementById('btn-save-refrigerator-rental');
    const originalText = saveButton?.innerHTML || '';
    await window.withButtonLoading('btn-save-refrigerator-rental', async () => {
        const data = await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/refrigerator-rentals', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: projectId,
                    rental_id: Number(window.currentRefrigeratorRentalEditingId || 0),
                    company_name: company.company_name,
                    rental_mode: window.getCurrentRefrigeratorRentalMode(),
                    usage_location: company.usage_location || '',
                    items
                })
            }),
            '保存冰柜租赁失败',
            {}
        );
        window.showToast('冰柜租赁已保存');
        window.closeRefrigeratorRentalEditor();
        await Promise.all([
            window.loadRefrigeratorConfigs({ force: true }),
            window.loadRefrigeratorRentalList({ force: true })
        ]);
        if (Number(data?.rental_id || 0) > 0) {
            window.currentRefrigeratorRentalEditingId = Number(data.rental_id || 0);
        }
        window.resetRefrigeratorRentalDraft();
    }, originalText);
};

window.exportRefrigeratorRentals = async function() {
    const projectId = window.getExhibitionProjectId();
    if (!projectId) {
        window.showToast('请先选择项目', 'error');
        return;
    }
    const params = new URLSearchParams({ projectId: String(projectId) });
    const search = String(window.currentRefrigeratorRentalSearch || '').trim();
    if (search) params.set('search', search);
    const response = await window.apiFetch(`/api/exhibition/refrigerator-rentals-export?${params.toString()}`);
    if (!response.ok) {
        let message = '导出失败';
        try {
            const data = await response.clone().json();
            if (data?.error) message = data.error;
        } catch (error) {
            const text = await response.text().catch(() => '');
            if (text) message = text;
        }
        throw new Error(message);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `冰柜租赁管理-${window.getExhibitionProjectName()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
};

window.createDefaultSpecialDecorationFilters = function() {
    return {
        search: '',
        hall: 'all',
        status: 'all',
        salesName: 'all',
        page: 1
    };
};

window.normalizeSpecialDecorationFilters = function(filters = {}) {
    const source = filters && typeof filters === 'object' ? filters : {};
    const normalizedStatus = String(source.status || '').trim();
    const page = Number(source.page || 1);
    return {
        search: String(source.search || '').trim(),
        hall: String(source.hall || '').trim() || 'all',
        status: ['all', 'reported', 'unreported'].includes(normalizedStatus) ? normalizedStatus : 'all',
        salesName: String(source.salesName || '').trim() || 'all',
        page: Number.isInteger(page) && page > 0 ? page : 1
    };
};

window.getSpecialDecorationFilters = function() {
    window.exhibitionSpecialDecorationFilters = window.normalizeSpecialDecorationFilters(window.exhibitionSpecialDecorationFilters);
    return window.exhibitionSpecialDecorationFilters;
};

window.getSelectedSpecialDecorationOrderIds = function() {
    return Array.from(new Set((Array.isArray(window.selectedSpecialDecorationOrderIds) ? window.selectedSpecialDecorationOrderIds : [])
        .map((id) => Number(id || 0))
        .filter((id) => Number.isInteger(id) && id > 0)));
};

window.clearSelectedSpecialDecorations = function() {
    window.selectedSpecialDecorationOrderIds = [];
};

window.getSpecialDecorationRowByOrderId = function(orderId) {
    const normalizedId = Number(orderId || 0);
    return (Array.isArray(window.exhibitionSpecialDecorations) ? window.exhibitionSpecialDecorations : []).find((row) => Number(row.order_id || 0) === normalizedId) || null;
};

window.syncSpecialDecorationFilterControls = function() {
    const filters = window.getSpecialDecorationFilters();
    const searchInput = document.getElementById('special-decoration-filter-search');
    const hallSelect = document.getElementById('special-decoration-filter-hall');
    const statusSelect = document.getElementById('special-decoration-filter-status');
    const salesSelect = document.getElementById('special-decoration-filter-sales-name');
    const meta = window.exhibitionSpecialDecorationMeta || {};
    const hallOptions = Array.isArray(meta.hall_options) ? meta.hall_options : [];
    const salesOptions = Array.isArray(meta.sales_options) ? meta.sales_options : [];
    if (searchInput && searchInput.value !== filters.search) searchInput.value = filters.search;
    if (hallSelect) {
        hallSelect.innerHTML = ['<option value="all">全部馆号</option>', ...hallOptions.map((hall) => `<option value="${window.escapeAttr(hall)}">${window.escapeHtml(hall)}</option>`)].join('');
        if (filters.hall !== 'all' && !hallOptions.includes(filters.hall)) {
            window.exhibitionSpecialDecorationFilters = { ...filters, hall: 'all' };
        }
        hallSelect.value = window.getSpecialDecorationFilters().hall || 'all';
    }
    if (statusSelect) statusSelect.value = filters.status || 'all';
    if (salesSelect) {
        salesSelect.innerHTML = ['<option value="all">全部业务员</option>', ...salesOptions.map((salesName) => `<option value="${window.escapeAttr(salesName)}">${window.escapeHtml(salesName)}</option>`)].join('');
        if (filters.salesName !== 'all' && !salesOptions.includes(filters.salesName)) {
            window.exhibitionSpecialDecorationFilters = { ...window.getSpecialDecorationFilters(), salesName: 'all' };
        }
        salesSelect.value = window.getSpecialDecorationFilters().salesName || 'all';
    }
};

window.renderSpecialDecorationToolbar = function() {
    const summary = document.getElementById('special-decoration-selection-summary');
    const actionWrap = document.getElementById('special-decoration-action-wrap');
    const batchConfirmButton = document.getElementById('btn-special-decoration-batch-confirm');
    const batchWithdrawButton = document.getElementById('btn-special-decoration-batch-withdraw');
    const meta = window.exhibitionSpecialDecorationMeta || {};
    const canToggle = !!meta.can_toggle && window.canConfirmSpecialDecorations?.();
    const selectedCount = window.getSelectedSpecialDecorationOrderIds().length;
    if (summary) {
        const total = Number(meta.total || 0);
        summary.innerText = total === 0
            ? '当前没有光地企业'
            : `共 ${total} 家光地企业${selectedCount > 0 ? `，已勾选 ${selectedCount} 家` : ''}`;
    }
    if (actionWrap) actionWrap.classList.toggle('hidden', !canToggle);
    [batchConfirmButton, batchWithdrawButton].forEach((button) => {
        if (!button) return;
        button.disabled = !canToggle || selectedCount === 0;
        button.classList.toggle('opacity-60', !canToggle || selectedCount === 0);
    });
};

window.loadSpecialDecorationList = async function(options = {}) {
    const projectId = window.getExhibitionProjectId();
    if (!projectId) return;
    const filters = window.getSpecialDecorationFilters();
    const params = new URLSearchParams({ projectId: String(projectId), page: String(filters.page || 1) });
    if (filters.search) params.set('search', filters.search);
    if (filters.hall && filters.hall !== 'all') params.set('hall', filters.hall);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.salesName && filters.salesName !== 'all') params.set('salesName', filters.salesName);
    const data = await window.readApiJson(
        await window.apiFetch(`/api/exhibition/special-decorations?${params.toString()}`),
        '加载特装管理列表失败',
        { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1, hasMore: false, hall_options: [], sales_options: [], can_toggle: false }
    );
    window.exhibitionSpecialDecorations = Array.isArray(data?.items) ? data.items : [];
    window.exhibitionSpecialDecorationMeta = {
        total: Number(data?.total || 0),
        page: Number(data?.page || 1),
        pageSize: Number(data?.pageSize || 20),
        totalPages: Number(data?.totalPages || 1),
        hasMore: !!data?.hasMore,
        hall_options: Array.isArray(data?.hall_options) ? data.hall_options : [],
        sales_options: Array.isArray(data?.sales_options) ? data.sales_options : [],
        can_toggle: !!data?.can_toggle
    };
    window.exhibitionSpecialDecorationFilters = window.normalizeSpecialDecorationFilters({ ...filters, page: window.exhibitionSpecialDecorationMeta.page });
    const validIds = new Set(window.exhibitionSpecialDecorations.map((item) => Number(item.order_id || 0)).filter((id) => id > 0));
    window.selectedSpecialDecorationOrderIds = window.getSelectedSpecialDecorationOrderIds().filter((id) => validIds.has(id));
    window.syncSpecialDecorationFilterControls();
    window.renderSpecialDecorationTable();
    window.renderSpecialDecorationPagination();
    if (!options.silent) window.renderNav?.();
};

window.reloadSpecialDecorationListFromFilters = function() {
    window.loadSpecialDecorationList({ force: true, silent: true }).catch((error) => {
        window.showToast(error.message || '加载特装管理列表失败', 'error');
    });
};

window.setSpecialDecorationFilters = function(nextFilters = {}, options = {}) {
    window.exhibitionSpecialDecorationFilters = window.normalizeSpecialDecorationFilters({
        ...window.getSpecialDecorationFilters(),
        ...(nextFilters && typeof nextFilters === 'object' ? nextFilters : {})
    });
    window.clearSelectedSpecialDecorations();
    window.syncSpecialDecorationFilterControls();
    if (options.debounce) {
        clearTimeout(window.specialDecorationSearchTimer);
        window.specialDecorationSearchTimer = setTimeout(() => window.reloadSpecialDecorationListFromFilters(), 260);
        return;
    }
    window.reloadSpecialDecorationListFromFilters();
};

window.updateSpecialDecorationFilter = function(field, value) {
    window.setSpecialDecorationFilters({ page: 1, [field]: value }, { debounce: field === 'search' });
};

window.resetSpecialDecorationFilters = function() {
    window.setSpecialDecorationFilters(window.createDefaultSpecialDecorationFilters());
};

window.goSpecialDecorationPage = function(page) {
    window.setSpecialDecorationFilters({ page: Number(page || 1) });
};

window.toggleSpecialDecorationSelection = function(orderId, checked) {
    const normalizedId = Number(orderId || 0);
    if (!normalizedId) return;
    const row = window.getSpecialDecorationRowByOrderId(normalizedId);
    if (!row?.can_toggle) return;
    const selected = new Set(window.getSelectedSpecialDecorationOrderIds());
    if (checked) selected.add(normalizedId);
    else selected.delete(normalizedId);
    window.selectedSpecialDecorationOrderIds = [...selected];
    window.renderSpecialDecorationTable();
};

window.toggleAllSpecialDecorationSelections = function(checked) {
    const selected = new Set(window.getSelectedSpecialDecorationOrderIds());
    const selectableIds = (Array.isArray(window.exhibitionSpecialDecorations) ? window.exhibitionSpecialDecorations : [])
        .filter((row) => row?.can_toggle)
        .map((row) => Number(row.order_id || 0))
        .filter((id) => id > 0);
    if (checked) selectableIds.forEach((id) => selected.add(id));
    else selectableIds.forEach((id) => selected.delete(id));
    window.selectedSpecialDecorationOrderIds = [...selected];
    window.renderSpecialDecorationTable();
};

window.renderSpecialDecorationTable = function() {
    const container = document.getElementById('special-decoration-table-wrap');
    if (!container) return;
    const rows = Array.isArray(window.exhibitionSpecialDecorations) ? window.exhibitionSpecialDecorations : [];
    const selectedIds = new Set(window.getSelectedSpecialDecorationOrderIds());
    const selectableRows = rows.filter((row) => row?.can_toggle);
    const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(Number(row.order_id || 0)));
    const columnClassNames = window.getSpecialDecorationTableColumnClassNames();
    window.renderSpecialDecorationToolbar();
    if (!rows.length) {
        container.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400">当前筛选条件下没有光地企业</div>';
        return;
    }
    container.innerHTML = `
        <div class="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table class="min-w-full w-full table-fixed text-sm text-left">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                        <th class="${columnClassNames.checkbox} font-bold text-center"><input type="checkbox" ${allSelected ? 'checked' : ''} ${selectableRows.length ? '' : 'disabled'} onchange="window.toggleAllSpecialDecorationSelections(this.checked)" class="accent-slate-900"></th>
                        <th class="${columnClassNames.sequence} font-bold">序号</th>
                        <th class="${columnClassNames.status} font-bold text-center">报图状态</th>
                        <th class="${columnClassNames.hall} font-bold">馆号</th>
                        <th class="${columnClassNames.boothCode} font-bold">展位号</th>
                        <th class="${columnClassNames.area} font-bold text-right">面积</th>
                        <th class="${columnClassNames.companyName} font-bold">企业名</th>
                        <th class="${columnClassNames.salesName} font-bold">业务员姓名</th>
                        <th class="${columnClassNames.action} font-bold sticky right-0 bg-slate-50 z-10 text-right">操作</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 bg-white">
                    ${rows.map((row) => {
                        const orderId = Number(row.order_id || 0);
                        const reported = Number(row.reported || 0) === 1;
                        const statusClass = reported ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
                        const buttonLabel = reported ? '撤销报图' : '确认报图';
                        const buttonClass = row.can_toggle ? (reported ? 'btn-soft-amber' : 'btn-primary') : 'btn-secondary opacity-60 cursor-not-allowed';
                        const areaText = Number(row.area || 0) > 0 ? `${Number(row.area || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ㎡` : '-';
                        return `
                            <tr class="align-top">
                                <td class="${columnClassNames.checkbox} text-center align-middle"><input type="checkbox" ${selectedIds.has(orderId) ? 'checked' : ''} ${row.can_toggle ? '' : 'disabled'} onchange="window.toggleSpecialDecorationSelection(${orderId}, this.checked)" class="accent-slate-900"></td>
                                <td class="${columnClassNames.sequence} align-middle font-bold text-slate-500">${Number(row.sequence || 0)}</td>
                                <td class="${columnClassNames.status} align-middle text-center"><span class="inline-flex min-w-[64px] justify-center rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}">${window.escapeHtml(row.report_status || (reported ? '已报图' : '未报图'))}</span></td>
                                <td class="${columnClassNames.hall} align-middle whitespace-normal break-words font-bold text-slate-700">${window.escapeHtml(row.hall || '-')}</td>
                                <td class="${columnClassNames.boothCode} align-middle whitespace-normal break-words font-black text-slate-900">${window.escapeHtml(row.booth_code || '-')}</td>
                                <td class="${columnClassNames.area} align-middle text-right font-bold text-slate-700">${window.escapeHtml(areaText)}</td>
                                <td class="${columnClassNames.companyName} align-middle whitespace-normal break-words font-bold text-slate-900">${window.escapeHtml(row.company_name || '-')}</td>
                                <td class="${columnClassNames.salesName} align-middle whitespace-normal break-words text-slate-700">${window.escapeHtml(row.sales_name || '-')}</td>
                                <td class="${columnClassNames.action} align-middle sticky right-0 bg-white text-right">
                                    <button type="button" onclick="window.toggleSingleSpecialDecorationReport(${orderId}, ${reported ? 'false' : 'true'})" class="${buttonClass} px-2.5 py-1.5 text-xs" ${row.can_toggle ? '' : 'disabled'} title="${window.escapeAttr(row.lock_reason || '')}">${row.can_toggle ? buttonLabel : '只读'}</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
};

window.renderSpecialDecorationPagination = function() {
    const container = document.getElementById('special-decoration-pagination');
    if (!container) return;
    const meta = window.exhibitionSpecialDecorationMeta || {};
    const page = Number(meta.page || 1);
    const totalPages = Math.max(Number(meta.totalPages || 1), 1);
    const total = Number(meta.total || 0);
    const pageSize = Number(meta.pageSize || 20);
    const start = total === 0 ? 0 : ((page - 1) * pageSize + 1);
    const end = Math.min(page * pageSize, total);
    container.innerHTML = `
        <div class="text-xs font-bold text-slate-500">第 ${page} / ${totalPages} 页 · 显示 ${start}-${end} / ${total}</div>
        <div class="flex items-center gap-2">
            <button type="button" onclick="window.goSpecialDecorationPage(${page - 1})" class="btn-secondary px-3 py-1.5 text-xs ${page <= 1 ? 'opacity-60 cursor-not-allowed' : ''}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <button type="button" onclick="window.goSpecialDecorationPage(${page + 1})" class="btn-secondary px-3 py-1.5 text-xs ${page >= totalPages ? 'opacity-60 cursor-not-allowed' : ''}" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
    `;
};

window.submitSpecialDecorationReport = async function(orderIds, reported) {
    const normalizedIds = (Array.isArray(orderIds) ? orderIds : [orderIds]).map((id) => Number(id || 0)).filter((id) => Number.isInteger(id) && id > 0);
    if (!normalizedIds.length) {
        window.showToast('请先勾选光地企业', 'error');
        return;
    }
    await window.readApiSuccessJson(
        await window.apiFetch('/api/exhibition/special-decoration-report-status', {
            method: 'POST',
            body: JSON.stringify({
                project_id: window.getExhibitionProjectId(),
                order_ids: normalizedIds,
                reported: reported ? 1 : 0
            })
        }),
        reported ? '确认报图失败' : '撤销报图失败',
        {}
    );
    window.clearSelectedSpecialDecorations();
    await window.loadSpecialDecorationList({ force: true, silent: true });
    if (typeof window.refreshBoothMapRuntime === 'function') {
        await window.refreshBoothMapRuntime({ silent: true, force: true });
    }
    window.showToast(reported ? '已确认报图' : '已撤销报图');
};

window.toggleSingleSpecialDecorationReport = async function(orderId, reported) {
    const row = window.getSpecialDecorationRowByOrderId(orderId);
    if (!row) {
        window.showToast('未找到光地企业记录', 'error');
        return;
    }
    if (!row.can_toggle) {
        window.showToast(row.lock_reason || '当前账号无确认权限', 'warning');
        return;
    }
    const actionText = reported ? '确认报图' : '撤销报图';
    if (!confirm(`确定要${actionText}【${row.company_name || row.booth_code || '-'}】吗？`)) return;
    await window.submitSpecialDecorationReport([Number(row.order_id || 0)], reported);
};

window.toggleBatchSpecialDecorationReport = async function(reported) {
    const selectedIds = window.getSelectedSpecialDecorationOrderIds();
    if (!selectedIds.length) {
        window.showToast('请先勾选光地企业', 'error');
        return;
    }
    const actionText = reported ? '批量确认报图' : '批量撤销报图';
    if (!confirm(`确定要${actionText}已勾选的 ${selectedIds.length} 家光地企业吗？`)) return;
    await window.submitSpecialDecorationReport(selectedIds, reported);
};

window.getLintelCompositeKey = function(orderId, boothCode) {
    return `${Number(orderId || 0)}::${String(boothCode || '').trim().toUpperCase()}`;
};

window.getSelectedLintelKeys = function() {
    return Array.from(new Set((Array.isArray(window.selectedLintelKeys) ? window.selectedLintelKeys : []).map((key) => String(key || '').trim()).filter(Boolean)));
};

window.getLintelRowByKey = function(key) {
    return (Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels : []).find((item) => String(item.key || '') === String(key || '').trim()) || null;
};

window.createDefaultLintelFilters = function() {
    return {
        businessStatus: 'all',
        exhibitionStatus: 'all',
        hall: 'all',
        salesName: 'all',
        keyword: ''
    };
};

window.normalizeLintelFilters = function(filters = {}) {
    const source = filters && typeof filters === 'object' ? filters : {};
    const normalizeStatus = (value) => {
        const normalized = String(value || '').trim();
        return normalized === 'confirmed' || normalized === 'unconfirmed' ? normalized : 'all';
    };
    return {
        businessStatus: normalizeStatus(source.businessStatus),
        exhibitionStatus: normalizeStatus(source.exhibitionStatus),
        hall: String(source.hall || '').trim() || 'all',
        salesName: String(source.salesName || '').trim() || 'all',
        keyword: String(source.keyword || '').trim()
    };
};

window.exhibitionLintelFilters = window.normalizeLintelFilters(window.exhibitionLintelFilters);

window.getLintelFilters = function() {
    if (!window.exhibitionLintelFilters || typeof window.exhibitionLintelFilters !== 'object') {
        window.exhibitionLintelFilters = window.createDefaultLintelFilters();
    }
    return window.exhibitionLintelFilters;
};

window.syncLintelHallFilterOptions = function() {
    const hallSelect = document.getElementById('lintel-filter-hall');
    if (!hallSelect) return;
    const filters = window.getLintelFilters();
    const halls = [...new Set((Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels : [])
        .map((item) => String(item.hall || '').trim())
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    hallSelect.innerHTML = [
        '<option value="all">全部馆号</option>',
        ...halls.map((hall) => `<option value="${window.escapeAttr(hall)}">${window.escapeHtml(hall)}</option>`)
    ].join('');
    if (filters.hall !== 'all' && !halls.includes(filters.hall)) {
        window.exhibitionLintelFilters = {
            ...filters,
            hall: 'all'
        };
    }
    hallSelect.value = window.getLintelFilters().hall || 'all';
};

window.syncLintelSalesFilterOptions = function() {
    const salesSelect = document.getElementById('lintel-filter-sales-name');
    if (!salesSelect) return;
    const filters = window.getLintelFilters();
    const salesNames = [...new Set((Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels : [])
        .map((item) => String(item.sales_name || '').trim())
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }));
    salesSelect.innerHTML = [
        '<option value="all">全部业务员</option>',
        ...salesNames.map((salesName) => `<option value="${window.escapeAttr(salesName)}">${window.escapeHtml(salesName)}</option>`)
    ].join('');
    if (filters.salesName !== 'all' && !salesNames.includes(filters.salesName)) {
        window.exhibitionLintelFilters = {
            ...filters,
            salesName: 'all'
        };
    }
    salesSelect.value = window.getLintelFilters().salesName || 'all';
};

window.syncLintelFilterControls = function() {
    const filters = window.getLintelFilters();
    const businessSelect = document.getElementById('lintel-filter-business-status');
    const exhibitionSelect = document.getElementById('lintel-filter-exhibition-status');
    const salesSelect = document.getElementById('lintel-filter-sales-name');
    const keywordInput = document.getElementById('lintel-filter-keyword');
    if (businessSelect) businessSelect.value = filters.businessStatus || 'all';
    if (exhibitionSelect) exhibitionSelect.value = filters.exhibitionStatus || 'all';
    window.syncLintelHallFilterOptions();
    window.syncLintelSalesFilterOptions();
    if (salesSelect) salesSelect.value = window.getLintelFilters().salesName || 'all';
    if (keywordInput && keywordInput.value !== (filters.keyword || '')) keywordInput.value = filters.keyword || '';
};

window.matchesLintelConfirmationFilter = function(value, filterValue) {
    if (filterValue === 'confirmed') return Number(value || 0) === 1;
    if (filterValue === 'unconfirmed') return Number(value || 0) !== 1;
    return true;
};

window.getFilteredLintelRows = function() {
    const filters = window.getLintelFilters();
    const keyword = String(filters.keyword || '').trim().toUpperCase();
    return (Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels : []).filter((row) => {
        if (!window.matchesLintelConfirmationFilter(row.business_confirmed, filters.businessStatus)) return false;
        if (!window.matchesLintelConfirmationFilter(row.exhibition_confirmed, filters.exhibitionStatus)) return false;
        if (filters.hall !== 'all' && String(row.hall || '').trim() !== filters.hall) return false;
        if (filters.salesName !== 'all' && String(row.sales_name || '').trim() !== filters.salesName) return false;
        if (!keyword) return true;
        const searchableText = [row.booth_code, row.company_name].map((value) => String(value || '').trim().toUpperCase()).join(' ');
        return searchableText.includes(keyword);
    });
};

window.setLintelFilters = function(nextFilters = {}) {
    window.exhibitionLintelFilters = window.normalizeLintelFilters({
        ...window.getLintelFilters(),
        ...(nextFilters && typeof nextFilters === 'object' ? nextFilters : {})
    });
    window.clearSelectedLintels();
    window.syncLintelFilterControls();
    window.renderLintelTable();
};

window.updateLintelBusinessFilter = function(value) {
    window.setLintelFilters({ businessStatus: value });
};

window.updateLintelExhibitionFilter = function(value) {
    window.setLintelFilters({ exhibitionStatus: value });
};

window.updateLintelHallFilter = function(value) {
    window.setLintelFilters({ hall: value });
};

window.updateLintelSalesNameFilter = function(value) {
    window.setLintelFilters({ salesName: value });
};

window.updateLintelKeywordFilter = function(value) {
    window.setLintelFilters({ keyword: value });
};

window.clearSelectedLintels = function() {
    window.selectedLintelKeys = [];
};

window.toggleLintelSelection = function(key, checked) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const current = new Set(window.getSelectedLintelKeys());
    if (checked) current.add(normalizedKey);
    else current.delete(normalizedKey);
    window.selectedLintelKeys = [...current];
    window.renderLintelTable();
};

window.toggleAllLintelSelections = function(checked) {
    const current = new Set(window.getSelectedLintelKeys());
    const filteredKeys = window.getFilteredLintelRows().map((item) => String(item.key || '').trim()).filter(Boolean);
    if (checked) filteredKeys.forEach((key) => current.add(key));
    else filteredKeys.forEach((key) => current.delete(key));
    window.selectedLintelKeys = [...current];
    window.renderLintelTable();
};

window.renderLintelToolbar = function() {
    const summary = document.getElementById('lintel-selection-summary');
    const batchConfirmButton = document.getElementById('btn-lintel-batch-confirm');
    const batchWithdrawButton = document.getElementById('btn-lintel-batch-withdraw');
    const exportButton = document.getElementById('btn-export-lintels');
    const selectedCount = window.getSelectedLintelKeys().length;
    const totalCount = Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels.length : 0;
    const filteredCount = window.getFilteredLintelRows().length;
    if (summary) {
        summary.innerText = totalCount === 0
            ? '当前没有楣板条目'
            : `共 ${totalCount} 条，筛选后 ${filteredCount} 条${selectedCount > 0 ? `，已勾选 ${selectedCount} 条` : ''}`;
    }
    [batchConfirmButton, batchWithdrawButton].forEach((button) => {
        if (!button) return;
        button.disabled = selectedCount === 0;
        button.classList.toggle('opacity-60', selectedCount === 0);
    });
    if (exportButton) exportButton.classList.toggle('hidden', !window.isSuperAdmin?.());
};

window.loadLintelList = async function() {
    const projectId = window.getExhibitionProjectId();
    if (!projectId) return;
    const data = await window.readApiJson(
        await window.apiFetch(`/api/exhibition/lintels?projectId=${projectId}`),
        '加载楣板列表失败',
        { items: [] }
    );
    window.exhibitionLintels = Array.isArray(data?.items) ? data.items : [];
    const validKeys = new Set(window.exhibitionLintels.map((item) => String(item.key || '').trim()).filter(Boolean));
    window.selectedLintelKeys = window.getSelectedLintelKeys().filter((key) => validKeys.has(key));
    if (window.currentLintelEditingKey && !validKeys.has(window.currentLintelEditingKey)) {
        window.closeLintelEditor();
    }
    window.syncLintelFilterControls();
    window.renderLintelTable();
};

window.renderLintelTable = function() {
    const container = document.getElementById('lintel-table-wrap');
    if (!container) return;
    const allRows = Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels : [];
    const rows = window.getFilteredLintelRows();
    const selectedKeys = new Set(window.getSelectedLintelKeys());
    const allSelected = rows.length > 0 && rows.every((item) => selectedKeys.has(String(item.key || '').trim()));
    window.renderLintelToolbar();
    if (!allRows.length) {
        container.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400">当前项目还没有符合条件的楣板记录</div>';
        return;
    }
    if (!rows.length) {
        container.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400">当前筛选条件下没有匹配的楣板记录</div>';
        return;
    }
    container.innerHTML = `
        <div class="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table class="min-w-[1450px] w-full text-sm text-left whitespace-nowrap">
                <thead class="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                        <th class="px-4 py-3 font-bold text-center"><input type="checkbox" ${allSelected ? 'checked' : ''} onchange="window.toggleAllLintelSelections(this.checked)" class="accent-slate-900"></th>
                        <th class="px-4 py-3 font-bold">序号</th>
                        <th class="px-3 py-3 font-bold text-center min-w-[84px]">业务确认</th>
                        <th class="px-3 py-3 font-bold text-center min-w-[84px]">展务确认</th>
                        <th class="px-4 py-3 font-bold">展位号</th>
                        <th class="px-4 py-3 font-bold">企业名称</th>
                        <th class="px-4 py-3 font-bold">中文楣板名</th>
                        <th class="px-4 py-3 font-bold">英文楣板名</th>
                        <th class="px-4 py-3 font-bold">备注</th>
                        <th class="px-4 py-3 font-bold">业务员</th>
                        <th class="px-4 py-3 font-bold sticky right-0 bg-slate-50 z-10 text-right">操作</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 bg-white">
                    ${rows.map((row) => {
                        const rowKey = String(row.key || '').trim();
                        const rowKeyJsLiteral = `'${window.escapeAttr(rowKey).replace(/'/g, '&#39;')}'`;
                        const businessStatusLabel = Number(row.business_confirmed || 0) === 1 ? '已确认' : '未确认';
                        const exhibitionStatusLabel = Number(row.exhibition_confirmed || 0) === 1 ? '已确认' : '未确认';
                        const businessButtonLabel = Number(row.business_confirmed || 0) === 1
                            ? (String(row.business_confirm_source || '') === 'exhibitor' ? '展商已确认' : '撤回')
                            : '确认';
                        const exhibitionButtonLabel = Number(row.exhibition_confirmed || 0) === 1 ? '撤回展务确认' : '展务确认';
                        const businessDisabledReason = String(row.business_lock_reason || '').trim();
                        const exhibitionDisabledReason = String(row.exhibition_lock_reason || '').trim();
                        const editDisabledReason = Number(row.exhibition_confirmed || 0) === 1
                            ? '展务已确认，请联系展务组修改'
                            : (Number(row.business_confirmed || 0) === 1 ? '业务已确认，撤回后才可编辑' : businessDisabledReason);
                        return `
                            <tr class="align-top">
                                <td class="px-4 py-3 text-center align-middle"><input type="checkbox" ${selectedKeys.has(rowKey) ? 'checked' : ''} onchange="window.toggleLintelSelection(${rowKeyJsLiteral}, this.checked)" class="accent-slate-900"></td>
                                <td class="px-4 py-3 align-middle font-bold text-slate-500">${Number(row.sequence || 0)}</td>
                                <td class="px-3 py-3 align-middle text-center"><span title="${window.escapeAttr(row.business_confirm_status || '未确认')}" class="inline-flex min-w-[64px] justify-center rounded-full px-2 py-1 text-[10px] font-bold ${Number(row.business_confirmed || 0) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">${businessStatusLabel}</span></td>
                                <td class="px-3 py-3 align-middle text-center"><span title="${window.escapeAttr(row.exhibition_confirm_status || '未确认')}" class="inline-flex min-w-[64px] justify-center rounded-full px-2 py-1 text-[10px] font-bold ${Number(row.exhibition_confirmed || 0) === 1 ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}">${exhibitionStatusLabel}</span></td>
                                <td class="px-4 py-3 align-middle">
                                    <div class="font-bold text-slate-900">${window.escapeHtml(row.booth_code || '-')}</div>
                                    <div class="mt-1 text-[11px] font-semibold text-slate-500">${window.escapeHtml(row.hall || row.booth_type_label || '-')}</div>
                                </td>
                                <td class="px-4 py-3 align-middle whitespace-normal break-words text-slate-900 font-bold">${window.escapeHtml(row.company_name || '-')}</td>
                                <td class="px-4 py-3 align-middle text-slate-900 font-bold whitespace-normal break-words">${window.escapeHtml(row.name_zh || '-')}</td>
                                <td class="px-4 py-3 align-middle text-slate-700 whitespace-normal break-words">${window.escapeHtml(row.name_en || '-')}</td>
                                <td class="px-4 py-3 align-middle text-slate-700 whitespace-normal break-words">${window.escapeHtml(row.remark || '-')}</td>
                                <td class="px-4 py-3 align-middle text-slate-700">${window.escapeHtml(row.sales_name || '-')}</td>
                                <td class="px-4 py-3 align-middle sticky right-0 bg-white text-right">
                                    <div class="flex justify-end gap-2">
                                        <button type="button" onclick="window.toggleLintelBusinessConfirmation(${rowKeyJsLiteral}, ${Number(row.business_confirmed || 0) === 1 ? 'false' : 'true'})" class="${row.can_business_toggle ? (Number(row.business_confirmed || 0) === 1 ? 'btn-soft-amber' : 'btn-primary') : 'btn-secondary opacity-60 cursor-not-allowed'} px-3 py-2 text-xs" ${row.can_business_toggle ? '' : 'disabled'} title="${window.escapeAttr(businessDisabledReason || '')}">${businessButtonLabel}</button>
                                        <button type="button" onclick="window.openLintelEditor(${rowKeyJsLiteral})" class="${row.can_edit ? 'btn-secondary' : 'btn-secondary opacity-60 cursor-not-allowed'} px-3 py-2 text-xs" ${row.can_edit ? '' : 'disabled'} title="${window.escapeAttr(editDisabledReason || '')}">编辑</button>
                                        ${(window.isSuperAdmin?.() || window.isExhibitionManager?.()) ? `<button type="button" onclick="window.toggleLintelExhibitionConfirmation(${rowKeyJsLiteral}, ${Number(row.exhibition_confirmed || 0) === 1 ? 'false' : 'true'})" class="${row.can_exhibition_toggle ? (Number(row.exhibition_confirmed || 0) === 1 ? 'btn-soft-amber' : 'btn-secondary') : 'btn-secondary opacity-60 cursor-not-allowed'} px-3 py-2 text-xs" ${row.can_exhibition_toggle ? '' : 'disabled'} title="${window.escapeAttr(exhibitionDisabledReason || '')}">${exhibitionButtonLabel}</button>` : ''}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
};

window.fillLintelEditorFields = function(row) {
    const title = document.getElementById('lintel-editor-title');
    const boothCodeEl = document.getElementById('lintel-editor-booth-code');
    const salesNameEl = document.getElementById('lintel-editor-sales-name');
    const nameZhField = document.getElementById('lintel-name-zh');
    const nameEnField = document.getElementById('lintel-name-en');
    const remarkField = document.getElementById('lintel-remark');
    if (title) title.innerText = `编辑楣板信息 · ${row?.booth_code || '-'}`;
    if (boothCodeEl) boothCodeEl.innerText = row?.booth_code || '-';
    if (salesNameEl) salesNameEl.innerText = row?.sales_name || '-';
    if (nameZhField) nameZhField.value = row?.name_zh || '';
    if (nameEnField) nameEnField.value = row?.name_en || '';
    if (remarkField) remarkField.value = row?.remark || '';
};

window.renderLintelEditor = function() {
    const editor = document.getElementById('lintel-editor');
    if (!editor) return;
    editor.classList.toggle('hidden', !window.isLintelEditorOpen);
    window.syncExhibitionOverlayLock();
    if (!window.isLintelEditorOpen) return;
    window.fillLintelEditorFields(window.currentLintelEditingRecord || null);
};

window.openLintelEditor = function(key) {
    const row = window.getLintelRowByKey(key);
    if (!row) {
        window.showToast('未找到楣板条目', 'error');
        return;
    }
    if (!row.can_edit) {
        window.showToast(row.business_lock_reason || '当前楣板条目暂不可编辑', 'warning');
        return;
    }
    window.currentLintelEditingKey = String(row.key || '');
    window.currentLintelEditingRecord = { ...row };
    window.isLintelEditorOpen = true;
    window.renderLintelEditor();
};

window.closeLintelEditor = function() {
    window.isLintelEditorOpen = false;
    window.currentLintelEditingKey = '';
    window.currentLintelEditingRecord = null;
    window.renderLintelEditor();
};

window.handleLintelEditorKeydown = function(event) {
    if (!window.isLintelEditorOpen) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        window.closeLintelEditor();
    }
};

window.addEventListener('keydown', window.handleLintelEditorKeydown);

window.saveLintelChanges = async function() {
    const row = window.currentLintelEditingRecord || window.getLintelRowByKey(window.currentLintelEditingKey);
    if (!row) {
        window.showToast('未找到楣板条目', 'error');
        return;
    }
    const projectId = window.getExhibitionProjectId();
    const nameZh = document.getElementById('lintel-name-zh')?.value?.trim() || '';
    const nameEn = document.getElementById('lintel-name-en')?.value?.trim() || '';
    const remark = document.getElementById('lintel-remark')?.value?.trim() || '';
    await window.withButtonLoading('btn-save-lintel', async () => {
        await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/lintel-save', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: projectId,
                    order_id: Number(row.order_id || 0),
                    booth_code: row.booth_code || '',
                    name_zh: nameZh,
                    name_en: nameEn,
                    remark
                })
            }),
            '保存楣板信息失败',
            {}
        );
        window.showToast('楣板信息已保存');
        window.closeLintelEditor();
        await window.loadLintelList({ force: true });
    });
};

window.submitLintelBusinessConfirmation = async function(rows, confirmed) {
    const normalizedRows = (Array.isArray(rows) ? rows : []).filter(Boolean);
    if (!normalizedRows.length) {
        window.showToast('请先选择楣板条目', 'error');
        return;
    }
    const projectId = window.getExhibitionProjectId();
    await window.readApiSuccessJson(
        await window.apiFetch('/api/exhibition/lintel-business-confirmation', {
            method: 'POST',
            body: JSON.stringify({
                project_id: projectId,
                confirmed: confirmed ? 1 : 0,
                items: normalizedRows.map((row) => ({
                    order_id: Number(row.order_id || 0),
                    booth_code: row.booth_code || ''
                }))
            })
        }),
        confirmed ? '批量确认楣板失败' : '批量撤回楣板失败',
        {}
    );
    window.clearSelectedLintels();
    if (window.isLintelEditorOpen) window.closeLintelEditor();
    await window.loadLintelList({ force: true });
    window.showToast(confirmed ? '楣板业务确认已完成' : '楣板业务确认已撤回');
};

window.toggleLintelBusinessConfirmation = async function(key, confirmed) {
    const row = window.getLintelRowByKey(key);
    if (!row) {
        window.showToast('未找到楣板条目', 'error');
        return;
    }
    if (!row.can_business_toggle) {
        window.showToast(row.business_lock_reason || '当前楣板条目暂不可操作', 'warning');
        return;
    }
    const actionText = confirmed ? '确认' : '撤回';
    if (!confirm(`确定要${actionText}展位【${row.booth_code || '-'}】的业务楣板状态吗？`)) return;
    await window.submitLintelBusinessConfirmation([row], confirmed);
};

window.toggleBatchLintelBusinessConfirmation = async function(confirmed) {
    const selectedRows = window.getSelectedLintelKeys().map((key) => window.getLintelRowByKey(key)).filter(Boolean);
    if (!selectedRows.length) {
        window.showToast('请先勾选楣板条目', 'error');
        return;
    }
    const actionText = confirmed ? '批量确认' : '批量撤回';
    if (!confirm(`确定要${actionText}已勾选的 ${selectedRows.length} 条楣板记录吗？`)) return;
    await window.submitLintelBusinessConfirmation(selectedRows, confirmed);
};

window.toggleLintelExhibitionConfirmation = async function(key, confirmed) {
    const row = window.getLintelRowByKey(key);
    if (!row) {
        window.showToast('未找到楣板条目', 'error');
        return;
    }
    if (!window.isSuperAdmin?.() && !window.isExhibitionManager?.()) {
        window.showToast('仅超级管理员或展务管理人员可展务确认楣板', 'error');
        return;
    }
    if (!row.can_exhibition_toggle) {
        window.showToast(row.exhibition_lock_reason || '当前楣板条目暂不可展务确认', 'warning');
        return;
    }
    const actionText = confirmed ? '展务确认' : '撤回展务确认';
    if (!confirm(`确定要${actionText}展位【${row.booth_code || '-'}】的楣板记录吗？`)) return;
    const projectId = window.getExhibitionProjectId();
    await window.readApiSuccessJson(
        await window.apiFetch('/api/exhibition/lintel-exhibition-confirmation', {
            method: 'POST',
            body: JSON.stringify({
                project_id: projectId,
                confirmed: confirmed ? 1 : 0,
                items: [{ order_id: Number(row.order_id || 0), booth_code: row.booth_code || '' }]
            })
        }),
        confirmed ? '展务确认失败' : '撤回展务确认失败',
        {}
    );
    window.clearSelectedLintels();
    if (window.isLintelEditorOpen) window.closeLintelEditor();
    await window.loadLintelList({ force: true });
    window.showToast(confirmed ? '展务确认已完成' : '展务确认已撤回');
};

window.exportLintelList = function() {
    if (!window.isSuperAdmin?.()) {
        window.showToast('仅超级管理员可导出楣板列表', 'error');
        return;
    }
    const rows = Array.isArray(window.exhibitionLintels) ? window.exhibitionLintels : [];
    if (!rows.length) {
        window.showToast('当前没有可导出的楣板记录', 'warning');
        return;
    }
    const headerCells = ['序号', '业务确认状态', '展务确认状态', '展位号', '中文楣板名', '英文楣板名', '备注', '业务员'];
    const bodyRows = rows.map((row) => `
        <tr>
            <td>${window.escapeHtml(String(row.sequence || ''))}</td>
            <td>${window.escapeHtml(row.business_confirm_status || '未确认')}</td>
            <td>${window.escapeHtml(row.exhibition_confirm_status || '未确认')}</td>
            <td>${window.escapeHtml(row.booth_code || '')}</td>
            <td>${window.escapeHtml(row.name_zh || '')}</td>
            <td>${window.escapeHtml(row.name_en || '')}</td>
            <td>${window.escapeHtml(row.remark || '')}</td>
            <td>${window.escapeHtml(row.sales_name || '')}</td>
        </tr>
    `).join('');
    const workbook = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headerCells.map((cell) => `<th>${window.escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
    const blob = new Blob([`\ufeff${workbook}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `楣板管理-${window.getExhibitionProjectName()}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
};

// ===================== 参展商名录 =====================

window.normalizeExhibitorDirectoryFilters = function(filters = {}) {
    const source = (filters && typeof filters === 'object') ? filters : {};
    return {
        search: String(source.search || '').trim(),
        hall: String(source.hall || 'all').trim() || 'all',
        boothType: String(source.boothType || 'all').trim() || 'all',
        salesName: String(source.salesName || 'all').trim() || 'all',
        exhibitionStatus: String(source.exhibitionStatus || 'all').trim() || 'all',
        basicStatus: String(source.basicStatus || 'all').trim() || 'all'
    };
};

window.getExhibitorDirectoryFilters = function() {
    window.exhibitorDirectoryFilters = window.normalizeExhibitorDirectoryFilters(window.exhibitorDirectoryFilters || {});
    return window.exhibitorDirectoryFilters;
};

window.applyExhibitorDirectoryFilters = function() {
    const filters = window.getExhibitorDirectoryFilters();
    const searchKey = filters.search.toLowerCase();
    return (window.exhibitorDirectoryItems || []).filter((row) => {
        if (filters.hall !== 'all' && String(row.hall || '') !== filters.hall) return false;
        if (filters.boothType !== 'all' && String(row.booth_type || '') !== filters.boothType) return false;
        if (filters.salesName !== 'all' && String(row.sales_name || '') !== filters.salesName) return false;
        if (filters.exhibitionStatus !== 'all' && String(row.exhibition_status || '') !== filters.exhibitionStatus) return false;
        if (filters.basicStatus !== 'all' && String(row.basic_info_status || '') !== filters.basicStatus) return false;
        if (searchKey) {
            const haystack = `${String(row.company_name || '').toLowerCase()} ${String(row.booth_code || '').toLowerCase()}`;
            if (!haystack.includes(searchKey)) return false;
        }
        return true;
    });
};

window.formatExhibitorArea = function(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0';
    if (Number.isInteger(amount)) return String(amount);
    return amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

window.getExhibitorDirectoryRowByKey = function(key) {
    const [orderIdText, boothCode = ''] = String(key || '').split('::');
    const orderId = Number(orderIdText || 0);
    return (Array.isArray(window.exhibitorDirectoryItems) ? window.exhibitorDirectoryItems : []).find((row) => {
        return Number(row.order_id || 0) === orderId && String(row.booth_code || '') === String(boothCode || '');
    }) || null;
};

window.getSelectedExhibitorDirectoryKeySet = function() {
    return new Set((Array.isArray(window.selectedExhibitorDirectoryKeys) ? window.selectedExhibitorDirectoryKeys : []).map((key) => String(key || '')).filter(Boolean));
};

window.setSelectedExhibitorDirectoryKeys = function(keys = []) {
    window.selectedExhibitorDirectoryKeys = Array.from(new Set((Array.isArray(keys) ? keys : []).map((key) => String(key || '')).filter(Boolean)));
};

window.updateExhibitorDirectorySelectionSummary = function(visibleRows = window.applyExhibitorDirectoryFilters()) {
    const rows = Array.isArray(visibleRows) ? visibleRows : [];
    const selectedSet = window.getSelectedExhibitorDirectoryKeySet();
    const selectedVisibleCount = rows.filter((row) => selectedSet.has(`${Number(row.order_id || 0)}::${String(row.booth_code || '')}`)).length;
    const summary = document.getElementById('exhibitor-directory-summary');
    if (summary) summary.textContent = `共 ${rows.length} 条 / 总计 ${(window.exhibitorDirectoryItems || []).length} 条 / 已选 ${selectedSet.size} 条`;
    const selectAll = document.getElementById('exhibitor-directory-select-all');
    if (selectAll) {
        selectAll.checked = rows.length > 0 && selectedVisibleCount === rows.length;
        selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < rows.length;
    }
};

window.toggleExhibitorDirectoryRowSelection = function(key, checked) {
    const selectedSet = window.getSelectedExhibitorDirectoryKeySet();
    const normalizedKey = String(key || '').trim();
    if (checked) selectedSet.add(normalizedKey);
    else selectedSet.delete(normalizedKey);
    window.setSelectedExhibitorDirectoryKeys([...selectedSet]);
    window.updateExhibitorDirectorySelectionSummary();
};

window.toggleAllVisibleExhibitorDirectoryRows = function(checked) {
    const selectedSet = window.getSelectedExhibitorDirectoryKeySet();
    window.applyExhibitorDirectoryFilters().forEach((row) => {
        const key = `${Number(row.order_id || 0)}::${String(row.booth_code || '')}`;
        if (checked) selectedSet.add(key);
        else selectedSet.delete(key);
    });
    window.setSelectedExhibitorDirectoryKeys([...selectedSet]);
    window.renderExhibitorDirectoryTable();
};

window.renderExhibitorDirectoryFilterOptions = function() {
    const hallSelect = document.getElementById('exhibitor-directory-filter-hall');
    if (hallSelect) {
        const current = window.getExhibitorDirectoryFilters().hall;
        const halls = window.exhibitorDirectoryHallOptions || [];
        hallSelect.innerHTML = ['<option value="all">全部馆号</option>']
            .concat(halls.map((hall) => `<option value="${window.escapeHtml(hall)}">${window.escapeHtml(hall)}</option>`))
            .join('');
        hallSelect.value = halls.includes(current) ? current : 'all';
        if (hallSelect.value !== current) window.exhibitorDirectoryFilters.hall = hallSelect.value;
    }
    const typeSelect = document.getElementById('exhibitor-directory-filter-booth-type');
    if (typeSelect) {
        const current = window.getExhibitorDirectoryFilters().boothType;
        const types = window.exhibitorDirectoryBoothTypeOptions || [];
        typeSelect.innerHTML = ['<option value="all">全部展位类型</option>']
            .concat(types.map((type) => `<option value="${window.escapeHtml(type)}">${window.escapeHtml(type)}</option>`))
            .join('');
        typeSelect.value = types.includes(current) ? current : 'all';
        if (typeSelect.value !== current) window.exhibitorDirectoryFilters.boothType = typeSelect.value;
    }
    const searchInput = document.getElementById('exhibitor-directory-filter-search');
    if (searchInput && document.activeElement !== searchInput) {
        searchInput.value = window.getExhibitorDirectoryFilters().search;
    }
    const salesSelect = document.getElementById('exhibitor-directory-filter-sales');
    if (salesSelect) {
        const current = window.getExhibitorDirectoryFilters().salesName;
        const salesNames = Array.from(new Set((window.exhibitorDirectoryItems || []).map((row) => String(row.sales_name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));
        salesSelect.innerHTML = ['<option value="all">全部业务员</option>'].concat(salesNames.map((name) => `<option value="${window.escapeHtml(name)}">${window.escapeHtml(name)}</option>`)).join('');
        salesSelect.value = salesNames.includes(current) ? current : 'all';
        if (salesSelect.value !== current) window.exhibitorDirectoryFilters.salesName = salesSelect.value;
    }
    const exhibitionSelect = document.getElementById('exhibitor-directory-filter-exhibition-status');
    if (exhibitionSelect) {
        const current = window.getExhibitorDirectoryFilters().exhibitionStatus;
        const statuses = Array.from(new Set((window.exhibitorDirectoryItems || []).map((row) => String(row.exhibition_status || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));
        exhibitionSelect.innerHTML = ['<option value="all">全部展务状态</option>'].concat(statuses.map((status) => `<option value="${window.escapeHtml(status)}">${window.escapeHtml(status)}</option>`)).join('');
        exhibitionSelect.value = statuses.includes(current) ? current : 'all';
        if (exhibitionSelect.value !== current) window.exhibitorDirectoryFilters.exhibitionStatus = exhibitionSelect.value;
    }
    const basicSelect = document.getElementById('exhibitor-directory-filter-basic-status');
    if (basicSelect) {
        const current = window.getExhibitorDirectoryFilters().basicStatus;
        const statusMap = new Map();
        (window.exhibitorDirectoryItems || []).forEach((row) => {
            const value = String(row.basic_info_status || '').trim();
            if (value) statusMap.set(value, String(row.basic_info_status_label || value).trim());
        });
        const statuses = [...statusMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'zh-Hans-CN', { numeric: true }));
        basicSelect.innerHTML = ['<option value="all">全部基本信息状态</option>'].concat(statuses.map(([value, label]) => `<option value="${window.escapeHtml(value)}">${window.escapeHtml(label)}</option>`)).join('');
        basicSelect.value = statusMap.has(current) ? current : 'all';
        if (basicSelect.value !== current) window.exhibitorDirectoryFilters.basicStatus = basicSelect.value;
    }
};

window.renderExhibitorDirectoryTable = function() {
    const tbody = document.getElementById('exhibitor-directory-tbody');
    if (!tbody) return;
    const filtered = window.applyExhibitorDirectoryFilters();
    const selectedSet = window.getSelectedExhibitorDirectoryKeySet();
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="px-4 py-8 text-center text-sm text-slate-400">暂无符合条件的参展商记录</td></tr>';
    } else {
        tbody.innerHTML = filtered.map((row, index) => {
            const rowKey = `${Number(row.order_id || 0)}::${String(row.booth_code || '')}`;
            const rowKeyLiteral = `'${window.escapeAttr(rowKey).replace(/'/g, '&#39;')}'`;
            const infoConfirmed = String(row.basic_info_status || '') === 'exhibitor_confirmed';
            const collectionClosed = row.confirmation_collection_closed === true || Number(row.confirmation_collection_closed || 0) === 1;
            const statusKind = String(row.exhibition_status_kind || '');
            const statusClass = statusKind === 'confirmed' || statusKind === 'reported'
                ? 'bg-emerald-50 text-emerald-700'
                : (statusKind === 'pending_exhibition' ? 'bg-sky-50 text-sky-700' : (statusKind === 'unconfirmed' || statusKind === 'unreported' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'));
            return `
            <tr class="hover:bg-slate-50">
                <td class="px-4 py-2.5"><input type="checkbox" class="h-4 w-4 accent-slate-900" ${selectedSet.has(rowKey) ? 'checked' : ''} onchange="window.toggleExhibitorDirectoryRowSelection(${rowKeyLiteral}, this.checked)"></td>
                <td class="px-4 py-2.5 text-slate-500">${index + 1}</td>
                <td class="px-4 py-2.5 font-bold">${window.escapeHtml(row.hall || '-')}</td>
                <td class="px-4 py-2.5 font-mono">${window.escapeHtml(row.booth_code || '-')}</td>
                <td class="px-4 py-2.5"><span class="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass}">${window.escapeHtml(row.exhibition_status || '-')}</span></td>
                <td class="px-4 py-2.5"><span class="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${infoConfirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}">${window.escapeHtml(row.basic_info_status_label || '-')}</span></td>
                <td class="px-4 py-2.5"><button type="button" onclick="window.viewExhibitorConfirmationOverview(${rowKeyLiteral})" class="font-bold text-slate-900 hover:text-sky-700 hover:underline">${window.escapeHtml(row.company_name || '-')}</button></td>
                <td class="px-4 py-2.5 text-right tabular-nums">${window.escapeHtml(window.formatExhibitorArea(row.area))}</td>
                <td class="px-4 py-2.5">${window.escapeHtml(row.booth_type || '-')}</td>
                <td class="px-4 py-2.5">${window.escapeHtml(row.sales_name || '-')}</td>
                <td class="px-4 py-2.5 text-right">
                    <div class="flex justify-end gap-2">
                        <button type="button" onclick="window.${(infoConfirmed && !collectionClosed) ? 'reopenExhibitorConfirmation' : 'shareExhibitorConfirmation'}(${rowKeyLiteral})" class="${(infoConfirmed && !collectionClosed) ? 'btn-soft-amber' : 'btn-primary'} px-3 py-2 text-xs">${collectionClosed ? '查看确认链接' : (infoConfirmed ? '申请编辑信息' : '分享确认链接')}</button>
                    </div>
                </td>
            </tr>
        `;}).join('');
    }
    window.updateExhibitorDirectorySelectionSummary(filtered);
};

window.renderExhibitorDirectoryAll = function() {
    window.renderExhibitorDirectoryFilterOptions();
    window.renderExhibitorDirectoryTable();
    window.initResponsiveTableScrollers?.(document.getElementById('exhibition-panel-exhibitor-directory') || document);
    window.refreshResponsiveTableScrollers?.();
};

window.loadExhibitorDirectory = async function(options = {}) {
    const projectId = window.getExhibitionProjectId();
    const tbody = document.getElementById('exhibitor-directory-tbody');
    if (!projectId) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="px-4 py-8 text-center text-sm text-slate-400">请先在顶部选择项目</td></tr>';
        window.exhibitorDirectoryItems = [];
        window.selectedExhibitorDirectoryKeys = [];
        window.exhibitorDirectoryHallOptions = [];
        window.exhibitorDirectoryBoothTypeOptions = [];
        window.exhibitorDirectoryLoaded = false;
        window.exhibitorDirectoryLoadedProjectId = 0;
        window.renderExhibitorDirectoryAll();
        return;
    }
    const cachedProjectId = Number(window.exhibitorDirectoryLoadedProjectId || 0);
    if (!options.force && window.exhibitorDirectoryLoaded && cachedProjectId === projectId) {
        window.renderExhibitorDirectoryAll();
        return;
    }
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="px-4 py-8 text-center text-sm text-slate-400">加载中…</td></tr>';
    try {
        const response = await window.apiFetch(`/api/exhibition/exhibitor-directory?projectId=${encodeURIComponent(projectId)}`);
        if (!response.ok) {
            const data = await response.clone().json().catch(() => ({}));
            throw new Error(data?.error || '加载参展商名录失败');
        }
        const data = await response.json();
        window.exhibitorDirectoryItems = Array.isArray(data?.items) ? data.items : [];
        const availableKeys = new Set(window.exhibitorDirectoryItems.map((row) => `${Number(row.order_id || 0)}::${String(row.booth_code || '')}`));
        window.setSelectedExhibitorDirectoryKeys(window.selectedExhibitorDirectoryKeys.filter((key) => availableKeys.has(key)));
        window.exhibitorDirectoryHallOptions = Array.isArray(data?.hall_options) ? data.hall_options : [];
        window.exhibitorDirectoryBoothTypeOptions = Array.isArray(data?.booth_type_options) ? data.booth_type_options : [];
        window.exhibitorDirectoryLoaded = true;
        window.exhibitorDirectoryLoadedProjectId = projectId;
        window.renderExhibitorDirectoryAll();
    } catch (error) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="px-4 py-8 text-center text-sm text-red-500">${window.escapeHtml(error.message || '加载失败')}</td></tr>`;
        window.showToast?.(error.message || '加载参展商名录失败', 'error');
    }
};

window.updateExhibitorDirectoryFilter = function(field, value) {
    const filters = window.getExhibitorDirectoryFilters();
    if (field === 'search') {
        filters.search = String(value || '').trim();
        clearTimeout(window.exhibitorDirectorySearchTimer);
        window.exhibitorDirectorySearchTimer = setTimeout(() => {
            window.renderExhibitorDirectoryTable();
        }, 200);
        return;
    }
    if (field === 'hall') {
        filters.hall = String(value || 'all').trim() || 'all';
    } else if (field === 'boothType') {
        filters.boothType = String(value || 'all').trim() || 'all';
    } else if (field === 'salesName') {
        filters.salesName = String(value || 'all').trim() || 'all';
    } else if (field === 'exhibitionStatus') {
        filters.exhibitionStatus = String(value || 'all').trim() || 'all';
    } else if (field === 'basicStatus') {
        filters.basicStatus = String(value || 'all').trim() || 'all';
    }
    window.renderExhibitorDirectoryTable();
};

window.resetExhibitorDirectoryFilters = function() {
    window.exhibitorDirectoryFilters = { search: '', hall: 'all', boothType: 'all', salesName: 'all', exhibitionStatus: 'all', basicStatus: 'all' };
    const searchInput = document.getElementById('exhibitor-directory-filter-search');
    if (searchInput) searchInput.value = '';
    window.renderExhibitorDirectoryAll();
};

window.copyTextToClipboard = async function(text) {
    const content = String(text || '');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.className = 'fixed left-[-9999px] top-[-9999px]';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
};

window.ensureExhibitorShareModal = function() {
    let modal = document.getElementById('exhibitor-confirmation-share-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'exhibitor-confirmation-share-modal';
    modal.className = 'hidden fixed inset-0 z-[99] bg-black/60 p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="flex h-full w-full items-center justify-center" onclick="if(event.target === this){window.closeExhibitorShareModal();}">
            <div class="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <div class="text-xs font-bold tracking-[0.2em] text-slate-400">分享确认链接</div>
                        <h3 id="exhibitor-confirmation-share-title" class="mt-2 text-xl font-black text-slate-900">确认链接已生成</h3>
                    </div>
                    <button type="button" onclick="window.closeExhibitorShareModal()" class="btn-secondary px-4 py-2 text-sm">关闭</button>
                </div>
                <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div class="mb-2 text-xs font-bold text-slate-500">复制给展商负责人的完整话术</div>
                    <textarea id="exhibitor-confirmation-share-message" readonly wrap="soft" class="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900" style="min-height:320px;max-height:50vh;font-size:14px;font-weight:600;line-height:1.85;overflow-y:auto;white-space:pre-wrap;word-break:break-all;"></textarea>
                </div>
	                <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
	                    <div class="text-xs font-bold text-slate-500">信息收集截止时间</div>
	                    <div id="exhibitor-confirmation-share-expiry" class="mt-1 text-sm font-black text-slate-900">-</div>
	                </div>
                <div id="exhibitor-confirmation-share-copy-state" class="mt-4 hidden rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">已复制到剪贴板，可以直接粘贴到微信。</div>
                <div class="mt-5 flex flex-wrap justify-end gap-3">
                    <button id="btn-copy-exhibitor-confirmation-share" type="button" onclick="window.copyCurrentExhibitorShareMessage()" class="btn-primary px-5 py-3 text-sm shadow-sm">一键复制</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
};

window.closeExhibitorShareModal = function() {
    document.getElementById('exhibitor-confirmation-share-modal')?.classList.add('hidden');
};

window.showExhibitorShareModal = function({ companyName = '', message = '', collectionClosed = false, collectionDeadlineAt = '', collectionDeadlineDisplay = '' } = {}) {
    const modal = window.ensureExhibitorShareModal();
    const title = document.getElementById('exhibitor-confirmation-share-title');
    const textarea = document.getElementById('exhibitor-confirmation-share-message');
    const expiry = document.getElementById('exhibitor-confirmation-share-expiry');
    const copyState = document.getElementById('exhibitor-confirmation-share-copy-state');
    if (title) title.innerText = `${companyName || '展商'} · 确认链接`;
    if (textarea) textarea.value = message || '';
    if (expiry) {
        const deadlineText = collectionDeadlineDisplay || collectionDeadlineAt || '未设置截止时间';
        expiry.innerText = collectionClosed
            ? `信息收集已截止，仅可查看（截止时间：${deadlineText}）`
            : deadlineText;
    }
    if (copyState) copyState.classList.add('hidden');
    modal.classList.remove('hidden');
};

window.copyCurrentExhibitorShareMessage = async function() {
    const textarea = document.getElementById('exhibitor-confirmation-share-message');
    const content = textarea?.value || '';
    if (!content) {
        window.showToast('没有可复制的分享话术', 'error');
        return;
    }
    try {
        await window.copyTextToClipboard(content);
        document.getElementById('exhibitor-confirmation-share-copy-state')?.classList.remove('hidden');
        window.showToast('分享话术已复制');
    } catch (error) {
        window.showToast(error.message || '复制失败，请手动复制', 'error');
    }
};

window.shareExhibitorConfirmation = async function(key) {
    const row = window.getExhibitorDirectoryRowByKey(key);
    if (!row) {
        window.showToast('未找到参展商记录', 'error');
        return;
    }
    try {
        const data = await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/exhibitor-confirmation-link', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: window.getExhibitionProjectId(),
                    order_id: Number(row.order_id || 0)
                })
            }),
            '生成确认链接失败',
            {}
        );
	        window.showExhibitorShareModal({
	            companyName: row.company_name || '',
	            message: data.link?.message || data.link?.url || '',
            collectionClosed: data.link?.collection_closed === true,
            collectionDeadlineAt: data.link?.collection_deadline_at || '',
            collectionDeadlineDisplay: data.link?.collection_deadline_display || ''
	        });
    } catch (error) {
        window.showToast(error.message || '生成确认链接失败', 'error');
    }
};

window.reopenExhibitorConfirmation = async function(key) {
    const row = window.getExhibitorDirectoryRowByKey(key);
    if (!row) {
        window.showToast('未找到参展商记录', 'error');
        return;
    }
    if (!confirm(`确定为【${row.company_name || '-'}】申请重新编辑确认信息吗？\n确认后原确认状态会失效，需展商重新提交。`)) return;
    try {
        const data = await window.readApiSuccessJson(
            await window.apiFetch('/api/exhibition/exhibitor-confirmation-reopen', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: window.getExhibitionProjectId(),
                    order_id: Number(row.order_id || 0)
                })
            }),
            '申请编辑信息失败',
            {}
        );
        await window.loadExhibitorDirectory({ force: true });
	        window.showExhibitorShareModal({
	            companyName: row.company_name || '',
	            message: data.link?.message || data.link?.url || '',
            collectionClosed: data.link?.collection_closed === true,
            collectionDeadlineAt: data.link?.collection_deadline_at || '',
            collectionDeadlineDisplay: data.link?.collection_deadline_display || ''
	        });
    } catch (error) {
        window.showToast(error.message || '申请编辑信息失败', 'error');
    }
};

window.ensureExhibitorConfirmationOverviewModal = function() {
    let modal = document.getElementById('exhibitor-confirmation-overview-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'exhibitor-confirmation-overview-modal';
    modal.className = 'hidden fixed inset-0 z-[98] bg-black/60 p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="flex h-full w-full items-center justify-center" onclick="if(event.target === this){window.closeExhibitorConfirmationOverview();}">
            <div class="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
                <div class="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <div class="text-xs font-bold tracking-[0.2em] text-slate-400">展商确认信息</div>
                        <h3 id="exhibitor-confirmation-overview-title" class="mt-2 text-xl font-black text-slate-900">确认信息概览</h3>
                    </div>
                    <button type="button" onclick="window.closeExhibitorConfirmationOverview()" class="btn-secondary px-4 py-2 text-sm">关闭</button>
                </div>
                <div id="exhibitor-confirmation-overview-body"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
};

window.closeExhibitorConfirmationOverview = function() {
    document.getElementById('exhibitor-confirmation-overview-modal')?.classList.add('hidden');
};

window.renderExhibitorConfirmationOverview = function(data) {
    const title = document.getElementById('exhibitor-confirmation-overview-title');
    const body = document.getElementById('exhibitor-confirmation-overview-body');
    if (!body) return;
    const order = data?.order || {};
    const boothRows = Array.isArray(data?.booth_rows) ? data.booth_rows : [];
    const lintels = Array.isArray(data?.lintels) ? data.lintels : [];
    const events = Array.isArray(data?.events) ? data.events : [];
    if (title) title.innerText = `${order.company_name || '-'} · 确认信息概览`;
    body.innerHTML = `
        <div class="grid gap-4 md:grid-cols-3">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div class="text-xs font-bold text-slate-500">企业名称</div><div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(order.company_name || '-')}</div></div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div class="text-xs font-bold text-slate-500">业务员</div><div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(order.sales_name || '-')}</div></div>
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div class="text-xs font-bold text-slate-500">提交时间</div><div class="mt-2 text-sm font-black text-slate-900">${window.escapeHtml(order.submitted_at || '-')}</div></div>
        </div>
        <div class="mt-4 rounded-2xl border border-slate-200">
            <div class="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900">展位信息</div>
            <div class="divide-y divide-slate-100">
                ${boothRows.map((row) => `<div class="grid gap-3 px-4 py-3 text-sm md:grid-cols-4"><span>馆号：<b>${window.escapeHtml(row.hall || '-')}</b></span><span>展位号：<b>${window.escapeHtml(row.booth_code || '-')}</b></span><span>类型：<b>${window.escapeHtml(row.booth_type_label || row.booth_type || '-')}</b></span><span>面积：<b>${Number(row.area || 0).toFixed(2)}㎡</b></span></div>`).join('') || '<div class="px-4 py-4 text-sm text-slate-400">暂无展位信息</div>'}
            </div>
        </div>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div class="rounded-2xl border border-slate-200 p-4"><div class="text-xs font-bold text-slate-500">详细展品</div><div class="mt-2 whitespace-pre-wrap text-sm font-bold text-slate-900">${window.escapeHtml(order.main_business || '-')}</div></div>
            <div class="rounded-2xl border border-slate-200 p-4"><div class="text-xs font-bold text-slate-500">企业简介或产品亮点</div><div class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">${window.escapeHtml(order.profile || '-')}</div></div>
        </div>
        <div class="mt-4 rounded-2xl border border-slate-200">
            <div class="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900">楣板信息</div>
            <div class="divide-y divide-slate-100">
                ${lintels.map((lintel) => `<div class="grid gap-3 px-4 py-3 text-sm md:grid-cols-4"><span>展位：<b>${window.escapeHtml(lintel.booth_code || '-')}</b></span><span>中文：<b>${window.escapeHtml(lintel.name_zh || '-')}</b></span><span>英文：<b>${window.escapeHtml(lintel.name_en || '-')}</b></span><span>状态：<b>${Number(lintel.exhibition_confirmed || 0) === 1 ? '展务已确认' : (Number(lintel.business_confirmed || 0) === 1 ? '待展务确认' : '未确认')}</b></span></div>`).join('') || '<div class="px-4 py-4 text-sm text-slate-400">该订单无楣板确认项</div>'}
            </div>
        </div>
        <details class="mt-4 rounded-2xl border border-slate-200">
            <summary class="cursor-pointer border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900">修改日志（默认折叠）</summary>
            <div class="divide-y divide-slate-100">
                ${events.map((event) => {
                    const diffs = Array.isArray(event.diffs) ? event.diffs : [];
                    return `<div class="px-4 py-3">
                        <div class="text-sm font-black text-slate-900">${window.escapeHtml(event.event_label || '提交确认')} · ${window.escapeHtml(event.created_at || '-')}</div>
                        <div class="mt-2 space-y-2">${diffs.length ? diffs.map((diff) => `<div class="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-700"><b>${window.escapeHtml(diff.field_label || '')}</b><br>旧：${window.escapeHtml(diff.old_value || '空')}<br>新：${window.escapeHtml(diff.new_value || '空')}</div>`).join('') : '<div class="text-xs font-bold text-slate-400">无字段变化</div>'}</div>
                    </div>`;
                }).join('') || '<div class="px-4 py-4 text-sm text-slate-400">暂无提交日志</div>'}
            </div>
        </details>
    `;
};

window.viewExhibitorConfirmationOverview = async function(key) {
    const row = window.getExhibitorDirectoryRowByKey(key);
    if (!row) {
        window.showToast('未找到参展商记录', 'error');
        return;
    }
    const modal = window.ensureExhibitorConfirmationOverviewModal();
    modal.classList.remove('hidden');
    const body = document.getElementById('exhibitor-confirmation-overview-body');
    if (body) body.innerHTML = '<div class="px-4 py-8 text-center text-sm text-slate-400">加载中…</div>';
    try {
        const data = await window.readApiJson(
            await window.apiFetch(`/api/exhibition/exhibitor-confirmation-overview?projectId=${encodeURIComponent(window.getExhibitionProjectId())}&orderId=${encodeURIComponent(Number(row.order_id || 0))}`),
            '加载确认信息失败',
            null
        );
        window.renderExhibitorConfirmationOverview(data);
    } catch (error) {
        if (body) body.innerHTML = `<div class="px-4 py-8 text-center text-sm text-red-500">${window.escapeHtml(error.message || '加载失败')}</div>`;
    }
};

window.exportExhibitorDirectoryExcel = async function() {
    const rows = window.applyExhibitorDirectoryFilters();
    if (!rows.length) {
        window.showToast?.('当前没有可导出的参展商名单', 'error');
        return;
    }
    try {
        const XLSX = await window.ensureXLSXLoaded();
        const headers = ['序号', '馆号', '展位号', '展务状态', '基本信息确认状态', '企业名', '面积(㎡)', '展位类型', '业务员姓名', '提交时间'];
        const sheetRows = [headers];
        rows.forEach((row, index) => {
            sheetRows.push([
                index + 1,
                row.hall || '',
                row.booth_code || '',
                row.exhibition_status || '',
                row.basic_info_status_label || '',
                row.company_name || '',
                Number(row.area || 0),
                row.booth_type || '',
                row.sales_name || '',
                row.submitted_at || ''
            ]);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
        const boothColIndex = headers.indexOf('展位号');
        for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: boothColIndex });
            const value = sheetRows[rowIndex][boothColIndex];
            worksheet[cellAddress] = {
                t: 's',
                v: value == null ? '' : String(value),
                z: '@'
            };
        }
        worksheet['!cols'] = [
            { wch: 6 },
            { wch: 10 },
            { wch: 16 },
            { wch: 18 },
            { wch: 20 },
            { wch: 34 },
            { wch: 10 },
            { wch: 14 },
            { wch: 14 },
            { wch: 20 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '筹展名单');
        const fileName = `筹展管理名单-${window.getExhibitionProjectName()}-${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName, { compression: true });
        window.showToast?.(`已导出 ${rows.length} 条筹展名单`);
    } catch (error) {
        window.showToast?.(`导出失败: ${error.message || error}`, 'error');
    }
};

window.exportExhibitorDirectory = async function() {
    const selectedSet = window.getSelectedExhibitorDirectoryKeySet();
    const selectedRows = (window.exhibitorDirectoryItems || []).filter((row) => selectedSet.has(`${Number(row.order_id || 0)}::${String(row.booth_code || '')}`));
    if (selectedRows.length === 0) {
        window.showToast?.('请先勾选要导出分享链接的展商', 'error');
        return;
    }
    try {
        const XLSX = await window.ensureXLSXLoaded();
        const linkCache = new Map();
	        const headers = ['序号', '馆号', '展位号', '企业名', '分享链接话术', '信息收集截止时间'];
        const sheetRows = [headers];
        for (let index = 0; index < selectedRows.length; index += 1) {
            const row = selectedRows[index];
            const orderId = Number(row.order_id || 0);
            if (!linkCache.has(orderId)) {
                const data = await window.readApiSuccessJson(
                    await window.apiFetch('/api/exhibition/exhibitor-confirmation-link', {
                        method: 'POST',
                        body: JSON.stringify({
                            project_id: window.getExhibitionProjectId(),
                            order_id: orderId
                        })
                    }),
                    `生成【${row.company_name || '-'}】分享链接失败`,
                    {}
                );
                linkCache.set(orderId, data.link || {});
            }
            const link = linkCache.get(orderId) || {};
            sheetRows.push([
                index + 1,
                row.hall || '',
                row.booth_code || '',
                row.company_name || '',
                link.message || link.url || '',
                link.collection_deadline_display || link.collection_deadline_at || ''
            ]);
        }
        const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
        const boothColIndex = headers.indexOf('展位号');
        for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: boothColIndex });
            const value = sheetRows[rowIndex][boothColIndex];
            worksheet[cellAddress] = {
                t: 's',
                v: value == null ? '' : String(value),
                z: '@'
            };
        }
        worksheet['!cols'] = [
            { wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 32 }, { wch: 90 }, { wch: 20 }
        ];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '分享链接');
        const fileName = `展商确认分享链接-${window.getExhibitionProjectName()}-${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName, { compression: true });
        window.showToast?.(`已导出 ${selectedRows.length} 条分享链接`);
    } catch (error) {
        window.showToast?.(`导出失败: ${error.message || error}`, 'error');
    }
};
