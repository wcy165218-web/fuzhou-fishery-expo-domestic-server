// ================= js/app.js =================
const LOGIN_MODULE_SRC = './js/auth.js?v=20260527-refrigerator-rental-subject-1';
let pendingLoginModuleLoad = null;

function loadLoginModuleOnce() {
    if (typeof window.handleLogin === 'function') {
        return Promise.resolve(true);
    }
    if (pendingLoginModuleLoad) {
        return pendingLoginModuleLoad;
    }
    pendingLoginModuleLoad = new Promise((resolve) => {
        const script = document.createElement('script');
        const separator = LOGIN_MODULE_SRC.includes('?') ? '&' : '?';
        const timeout = setTimeout(() => resolve(false), 8000);
        script.src = `${LOGIN_MODULE_SRC}${separator}retry=${Date.now()}`;
        script.onload = () => {
            clearTimeout(timeout);
            resolve(typeof window.handleLogin === 'function');
        };
        script.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
        };
        document.head.appendChild(script);
    }).finally(() => {
        pendingLoginModuleLoad = null;
    });
    return pendingLoginModuleLoad;
}

window.tryHandleLoginFromUi = async function() {
    if (typeof window.handleLogin === 'function') {
        return window.handleLogin();
    }
    if (typeof window.showToast === 'function') {
        window.showToast('登录模块正在重新加载，请稍候...', 'info');
    }
    const loaded = await loadLoginModuleOnce();
    if (loaded && typeof window.handleLogin === 'function') {
        return window.handleLogin();
    }
    if (typeof window.showToast === 'function') {
        window.showToast('登录模块加载失败，请刷新页面后重试', 'error');
    }
    console.warn('Login action skipped because auth.js is not ready.');
    return null;
};

const responsiveTableScrollTargets = new Set();
let responsiveTableRefreshFrame = 0;

function scheduleResponsiveTableRefresh() {
    if (responsiveTableRefreshFrame) return;
    responsiveTableRefreshFrame = window.requestAnimationFrame(() => {
        responsiveTableRefreshFrame = 0;
        window.refreshResponsiveTableScrollers?.();
    });
}

function getResponsiveTableScrollWidth(target) {
    return Number(target?.scrollWidth || 0);
}

function initResponsiveTableScroller(target) {
    if (!target || target.dataset.responsiveScrollReady === '1') return;
    target.dataset.responsiveScrollReady = '1';
    responsiveTableScrollTargets.add(target);

    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '0');
    if (!target.hasAttribute('aria-label')) {
        target.setAttribute('aria-label', `${target.dataset.scrollLabel || '表格'}，可左右滚动查看更多列`);
    }

    const control = document.createElement('div');
    control.className = 'responsive-table-scroll-control';

    const label = document.createElement('div');
    label.className = 'responsive-table-scroll-label';
    label.textContent = '拖动横条查看更多列';

    const proxy = document.createElement('div');
    proxy.className = 'responsive-table-scroll-proxy';
    proxy.tabIndex = 0;
    proxy.setAttribute('aria-label', target.dataset.scrollLabel || '表格横向滚动条');

    const spacer = document.createElement('div');
    spacer.className = 'responsive-table-scroll-spacer';
    proxy.appendChild(spacer);

    const proxyWrap = document.createElement('div');
    proxyWrap.className = 'responsive-table-scroll-proxy-wrap';

    const visualTrack = document.createElement('div');
    visualTrack.className = 'responsive-table-scroll-track';
    visualTrack.setAttribute('aria-hidden', 'true');

    const visualThumb = document.createElement('div');
    visualThumb.className = 'responsive-table-scroll-thumb';
    visualTrack.appendChild(visualThumb);
    proxyWrap.appendChild(proxy);
    proxyWrap.appendChild(visualTrack);

    control.appendChild(label);
    control.appendChild(proxyWrap);
    target.parentNode?.insertBefore(control, target);

    let dragging = false;
    let dragThumbOffset = 0;

    const updateVisualThumb = () => {
        const scrollWidth = getResponsiveTableScrollWidth(target);
        const targetWidth = Number(target.clientWidth || 0);
        const trackWidth = Number(visualTrack.clientWidth || 0);
        if (scrollWidth <= 0 || targetWidth <= 0 || trackWidth <= 0) return;
        const targetMax = Math.max(0, scrollWidth - targetWidth);
        const thumbWidth = targetMax > 0
            ? Math.max(44, Math.min(trackWidth, Math.round(trackWidth * (targetWidth / scrollWidth))))
            : trackWidth;
        const travel = Math.max(0, trackWidth - thumbWidth);
        const left = targetMax > 0 ? Math.round((target.scrollLeft / targetMax) * travel) : 0;
        visualThumb.style.width = `${thumbWidth}px`;
        visualThumb.style.transform = `translateX(${left}px)`;
    };

    const syncProxyFromTarget = () => {
        const targetMax = Math.max(0, target.scrollWidth - target.clientWidth);
        const proxyMax = Math.max(0, proxy.scrollWidth - proxy.clientWidth);
        if (targetMax > 0 && proxyMax > 0) {
            proxy.scrollLeft = (target.scrollLeft / targetMax) * proxyMax;
        }
        updateVisualThumb();
    };

    const setTargetScrollFromTrack = (clientX, thumbOffset = 0) => {
        const rect = visualTrack.getBoundingClientRect();
        const targetMax = Math.max(0, target.scrollWidth - target.clientWidth);
        const thumbWidth = Number(visualThumb.offsetWidth || 0);
        const travel = Math.max(1, Number(visualTrack.clientWidth || 0) - thumbWidth);
        const localX = Number(clientX || 0) - rect.left - thumbOffset;
        target.scrollLeft = Math.max(0, Math.min(targetMax, (localX / travel) * targetMax));
        syncProxyFromTarget();
    };

    const refresh = () => {
        const section = target.closest('.page-section');
        if (section && !section.classList.contains('active')) {
            control.classList.remove('is-visible');
            return;
        }

        const targetWidth = Number(target.clientWidth || 0);
        if (targetWidth <= 0) {
            control.classList.remove('is-visible');
            return;
        }

        const scrollWidth = getResponsiveTableScrollWidth(target);
        spacer.style.width = `${scrollWidth}px`;
        const isScrollable = scrollWidth > targetWidth + 2;
        control.classList.toggle('is-visible', isScrollable);
        target.classList.toggle('has-responsive-scroll-control', isScrollable);

        if (!isScrollable) {
            target.scrollLeft = 0;
            proxy.scrollLeft = 0;
            return;
        }

        syncProxyFromTarget();
        updateVisualThumb();
    };

    target.__refreshResponsiveTableScroller = refresh;
    target.addEventListener('scroll', syncProxyFromTarget, { passive: true });
    const onDragMove = (event) => {
        if (!dragging) return;
        setTargetScrollFromTrack(event.clientX, dragThumbOffset);
        if (event.cancelable) event.preventDefault();
    };
    const stopDragging = (event) => {
        if (!dragging) return;
        dragging = false;
        visualThumb.classList.remove('is-dragging');
        try { visualTrack.releasePointerCapture?.(event.pointerId); } catch (error) {}
    };

    visualTrack.addEventListener('pointerdown', (event) => {
        if (!control.classList.contains('is-visible')) return;
        const thumbRect = visualThumb.getBoundingClientRect();
        dragThumbOffset = event.target === visualThumb
            ? Math.max(0, Math.min(Number(visualThumb.offsetWidth || 0), event.clientX - thumbRect.left))
            : Number(visualThumb.offsetWidth || 0) / 2;
        dragging = true;
        visualThumb.classList.add('is-dragging');
        visualTrack.setPointerCapture?.(event.pointerId);
        setTargetScrollFromTrack(event.clientX, dragThumbOffset);
        event.preventDefault();
    });
    visualTrack.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointermove', onDragMove, { passive: false });
    visualTrack.addEventListener('pointerup', stopDragging);
    visualTrack.addEventListener('pointercancel', stopDragging);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    proxy.addEventListener('keydown', (event) => {
        const targetMax = Math.max(0, target.scrollWidth - target.clientWidth);
        if (targetMax <= 0) return;
        const step = Math.max(80, Math.round(target.clientWidth * 0.18));
        if (event.key === 'ArrowLeft') {
            target.scrollLeft = Math.max(0, target.scrollLeft - step);
        } else if (event.key === 'ArrowRight') {
            target.scrollLeft = Math.min(targetMax, target.scrollLeft + step);
        } else {
            return;
        }
        syncProxyFromTarget();
        event.preventDefault();
    });

    if ('ResizeObserver' in window) {
        const resizeObserver = new ResizeObserver(() => scheduleResponsiveTableRefresh());
        resizeObserver.observe(target);
        const table = target.querySelector('table');
        if (table) resizeObserver.observe(table);
    }

    const mutationObserver = new MutationObserver(() => scheduleResponsiveTableRefresh());
    mutationObserver.observe(target, { childList: true, subtree: true, attributes: true });

    refresh();
}

window.refreshResponsiveTableScrollers = function() {
    responsiveTableScrollTargets.forEach((target) => {
        target.__refreshResponsiveTableScroller?.();
    });
}

window.initResponsiveTableScrollers = function(root = document) {
    root.querySelectorAll?.('[data-responsive-table-scroll]').forEach((target) => initResponsiveTableScroller(target));
    window.refreshResponsiveTableScrollers();
}

function installResponsiveTableRefreshHooks() {
    if (window.__responsiveTableRefreshHooksInstalled) return;
    window.__responsiveTableRefreshHooksInstalled = true;
    window.addEventListener('resize', scheduleResponsiveTableRefresh, { passive: true });
    const bodyObserver = new MutationObserver(() => scheduleResponsiveTableRefresh());
    bodyObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
}

document.addEventListener('DOMContentLoaded', () => {
    // 绑定基础事件
    document.getElementById('nav-change-pass')?.addEventListener('click', () => window.openPasswordModal?.());
    document.getElementById('logout-btn')?.addEventListener('click', () => window.handleLogout?.());
    window.initResponsiveTableScrollers?.();
    installResponsiveTableRefreshHooks();

    // 启动时统一走共享认证恢复逻辑，避免各处各自解析缓存用户。
    const savedUser = window.getCurrentAuthUser?.();
    if (savedUser) {
        if (typeof window.enterMainView === 'function') {
            Promise.resolve(window.enterMainView()).catch((error) => {
                console.error('Auth bootstrap failed:', error);
                window.showToast?.(error.message || '页面初始化失败，请刷新后重试', 'error');
            });
            return;
        }
        console.warn('Auth bootstrap is unavailable, skipped auto enterMainView.');
        if (typeof window.showToast === 'function') {
            window.showToast('页面初始化不完整，请刷新页面后重试', 'error');
        }
    }
});
