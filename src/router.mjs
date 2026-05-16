import { handleAgentRoutes } from './routes/agents.mjs';
import { handleAuthRoutes } from './routes/auth.mjs';
import { handleBoothRoutes } from './routes/booths.mjs';
import { handleBoothMapRoutes } from './routes/booth-maps.mjs';
import { handleConfigRoutes } from './routes/config.mjs';
import { handleDashboardRoutes } from './routes/dashboard.mjs';
import { handleExhibitionRoutes } from './routes/exhibition.mjs';
import { handleExpenseRoutes } from './routes/expenses.mjs';
import { handleFileRoutes } from './routes/files.mjs';
import { handleOrderRoutes } from './routes/orders.mjs';
import { handlePaymentRoutes } from './routes/payments.mjs';
import { handleProjectRoutes } from './routes/projects.mjs';
import { handleStaffRoutes } from './routes/staff.mjs';

const exactPath = (paths) => {
    const pathSet = new Set(paths);
    return (pathname) => pathSet.has(pathname);
};

const pathStartsWith = (prefixes) => (pathname) => prefixes.some((prefix) => pathname.startsWith(prefix));

const matchBoothMapExactPath = exactPath([
    '/api/create-booth-map',
    '/api/update-booth-map',
    '/api/delete-booth-map',
    '/api/upload-booth-map-background',
    '/api/delete-booth-map-background',
    '/api/save-booth-map-items'
]);

const ROUTE_GROUPS = [
    {
        matches: (pathname) => pathname === '/api/upload' || pathname.startsWith('/api/file/'),
        handleRoute: handleFileRoutes
    },
    {
        matches: exactPath(['/api/login', '/api/change-password']),
        handleRoute: handleAuthRoutes
    },
    {
        matches: exactPath(['/api/projects', '/api/update-project']),
        handleRoute: handleProjectRoutes
    },
    {
        matches: exactPath([
            '/api/staff',
            '/api/delete-staff',
            '/api/update-staff-role',
            '/api/set-target',
            '/api/update-staff-order',
            '/api/update-staff-sales-ranking',
            '/api/reset-password'
        ]),
        handleRoute: handleStaffRoutes
    },
    {
        matches: exactPath([
            '/api/accounts',
            '/api/add-account',
            '/api/delete-account',
            '/api/erp-config',
            '/api/save-erp-config',
            '/api/erp-sync-preview',
            '/api/erp-sync',
            '/api/order-field-settings',
            '/api/save-order-field-settings',
            '/api/order-release-settings',
            '/api/order-import-preview',
            '/api/order-import',
            '/api/clear-project-rollout-data',
            '/api/industries',
            '/api/add-industry',
            '/api/delete-industry'
        ]),
        handleRoute: handleConfigRoutes
    },
    {
        matches: (pathname) => pathname === '/api/booth-maps'
            || pathname.startsWith('/api/booth-map')
            || matchBoothMapExactPath(pathname),
        handleRoute: handleBoothMapRoutes
    },
    {
        matches: exactPath([
            '/api/prices',
            '/api/booths',
            '/api/add-booth',
            '/api/edit-booth',
            '/api/update-booth-status',
            '/api/delete-booths',
            '/api/import-booths'
        ]),
        handleRoute: handleBoothRoutes
    },
    {
        matches: exactPath(['/api/agents', '/api/add-agent', '/api/update-agent', '/api/delete-agent', '/api/agent-finance']),
        handleRoute: handleAgentRoutes
    },
    {
        matches: pathStartsWith(['/api/exhibition/']),
        handleRoute: handleExhibitionRoutes
    },
    {
        matches: pathStartsWith(['/api/public/exhibitor-confirmations/', '/api/public/exhibitor-confirmation-banner/']),
        handleRoute: handleExhibitionRoutes
    },
    {
        matches: exactPath(['/api/expenses', '/api/add-expense', '/api/delete-expense']),
        handleRoute: handleExpenseRoutes
    },
    {
        matches: exactPath([
            '/api/orders',
            '/api/pending-orders',
            '/api/order-booth-changes',
            '/api/submit-order',
            '/api/update-customer-info',
            '/api/change-order-booth',
            '/api/reactivate-pending-order',
            '/api/handle-pending-order-payments',
            '/api/delete-pending-order',
            '/api/cancel-order'
        ]),
        handleRoute: handleOrderRoutes
    },
    {
        matches: exactPath([
            '/api/payments',
            '/api/add-payment',
            '/api/delete-payment',
            '/api/edit-payment',
            '/api/update-order-fees',
            '/api/resolve-overpayment'
        ]),
        handleRoute: handlePaymentRoutes
    },
    {
        matches: exactPath(['/api/order-dashboard-stats', '/api/home-dashboard']),
        handleRoute: handleDashboardRoutes
    }
];

export function getApiRouteHandler(pathname) {
    const normalizedPathname = String(pathname || '').trim();
    return ROUTE_GROUPS.find((routeGroup) => routeGroup.matches(normalizedPathname))?.handleRoute || null;
}

export async function dispatchApiRoutes(context) {
    const handleRoute = getApiRouteHandler(context?.url?.pathname);
    return handleRoute ? handleRoute(context) : null;
}
