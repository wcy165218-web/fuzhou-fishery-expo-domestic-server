import { isAdminUser, isSuperAdmin, normalizeUserRole } from '../utils/auth.mjs';
import {
    getChinaTimestamp,
    NORMALIZED_AGENT_NAME_SQL,
    normalizeAgentName
} from '../utils/helpers.mjs';
import { errorResponse, internalErrorResponse } from '../utils/response.mjs';
import { readJsonBody } from '../utils/request.mjs';

function canCreateAgent(currentUser) {
    return isAdminUser(currentUser) || normalizeUserRole(currentUser?.role) === 'user';
}

function canManageAgent(currentUser, agent) {
    if (isSuperAdmin(currentUser)) return true;
    return normalizeUserRole(currentUser?.role) === 'user' && agent?.sales_name === currentUser?.name;
}

function canViewAgentFinance(currentUser, agent) {
    if (isSuperAdmin(currentUser)) return true;
    if (isAdminUser(currentUser)) return true;
    return normalizeUserRole(currentUser?.role) === 'user' && agent?.sales_name === currentUser?.name;
}

async function resolveAgentSalesName(env, currentUser, requestedSalesName) {
    const resolvedName = isSuperAdmin(currentUser)
        ? String(requestedSalesName || '').trim()
        : String(currentUser?.name || '').trim();
    if (!resolvedName) {
        return { error: '请选择代理商归属业务员' };
    }
    const staff = await env.DB.prepare('SELECT name FROM Staff WHERE name = ?').bind(resolvedName).first();
    if (!staff) {
        return { error: '代理商归属业务员不存在，请先在系统配置中创建账号' };
    }
    return { salesName: String(staff.name || '').trim() };
}

export async function handleAgentRoutes({
    request,
    env,
    url,
    currentUser,
    corsHeaders
}) {
    // GET /api/agents?projectId=xxx
    if (url.pathname === '/api/agents' && request.method === 'GET') {
        try {
            const projectId = url.searchParams.get('projectId');
            if (!projectId) return errorResponse('缺少 projectId', 400, corsHeaders);
            const results = await env.DB.prepare(
                'SELECT * FROM Agents WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5000'
            ).bind(projectId).all();
            return new Response(JSON.stringify(results.results), { headers: corsHeaders });
        } catch (error) {
            console.error('Fetch agents failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    // POST /api/add-agent
    if (url.pathname === '/api/add-agent' && request.method === 'POST') {
        try {
            if (!canCreateAgent(currentUser)) return errorResponse('权限不足：仅管理员或业务员可新增代理商', 403, corsHeaders);
            const body = await readJsonBody(request, corsHeaders);
            if (body instanceof Response) return body;
            const { project_id, name, sales_name } = body;
            const safeName = String(name || '').trim();
            const normalizedName = normalizeAgentName(safeName);
            if (!project_id || !safeName) return errorResponse('项目ID和代理商名称为必填', 400, corsHeaders);
            const salesResolve = await resolveAgentSalesName(env, currentUser, sales_name);
            if (salesResolve.error) return errorResponse(salesResolve.error, 400, corsHeaders);
            const existing = await env.DB.prepare(
                `SELECT id FROM Agents WHERE project_id = ? AND ${NORMALIZED_AGENT_NAME_SQL} = ? AND deleted_at IS NULL`
            ).bind(project_id, normalizedName).first();
            if (existing) return errorResponse('该代理商名称已存在', 409, corsHeaders);
            // Check for soft-deleted agent with same name — reactivate instead of inserting to avoid UNIQUE constraint violation
            const softDeleted = await env.DB.prepare(
                `SELECT id FROM Agents WHERE project_id = ? AND ${NORMALIZED_AGENT_NAME_SQL} = ? AND deleted_at IS NOT NULL`
            ).bind(project_id, normalizedName).first();
            if (softDeleted) {
                await env.DB.prepare(
                    'UPDATE Agents SET name = ?, sales_name = ?, deleted_at = NULL, deleted_by = NULL WHERE id = ?'
                ).bind(safeName, salesResolve.salesName, softDeleted.id).run();
            } else {
                await env.DB.prepare(
                    'INSERT INTO Agents (project_id, name, sales_name, created_at) VALUES (?, ?, ?, ?)'
                ).bind(project_id, safeName, salesResolve.salesName, getChinaTimestamp()).run();
            }
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } catch (error) {
            console.error('Add agent failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    // POST /api/update-agent
    if (url.pathname === '/api/update-agent' && request.method === 'POST') {
        try {
            const body = await readJsonBody(request, corsHeaders);
            if (body instanceof Response) return body;
            const { id, name, sales_name } = body;
            if (!id) return errorResponse('缺少代理商ID', 400, corsHeaders);
            const agent = await env.DB.prepare(
                'SELECT * FROM Agents WHERE id = ? AND deleted_at IS NULL'
            ).bind(id).first();
            if (!agent) return errorResponse('代理商不存在', 404, corsHeaders);
            if (!canManageAgent(currentUser, agent)) return errorResponse('权限不足：仅超级管理员或录入该代理的业务员可修改', 403, corsHeaders);
            const statements = [];
            if (name !== undefined && name.trim()) {
                const safeName = String(name || '').trim();
                const normalizedName = normalizeAgentName(safeName);
                const dup = await env.DB.prepare(
                    `SELECT id FROM Agents WHERE project_id = ? AND ${NORMALIZED_AGENT_NAME_SQL} = ? AND deleted_at IS NULL AND id != ?`
                ).bind(agent.project_id, normalizedName, id).first();
                if (dup) return errorResponse('该代理商名称已存在', 409, corsHeaders);
                const oldName = agent.name;
                const newName = safeName;
                statements.push(
                    env.DB.prepare('UPDATE Agents SET name = ? WHERE id = ?').bind(newName, id),
                    env.DB.prepare('UPDATE Orders SET agent_name = ? WHERE project_id = ? AND agent_name = ? AND is_agent = 1').bind(newName, agent.project_id, oldName),
                    env.DB.prepare('UPDATE Expenses SET payee_name = ? WHERE project_id = ? AND payee_name = ? AND expense_type = ? AND deleted_at IS NULL').bind(newName, agent.project_id, oldName, '返佣支出')
                );
            }
            if (sales_name !== undefined) {
                if (!isSuperAdmin(currentUser)) return errorResponse('权限不足：仅超级管理员可调整代理商归属业务员', 403, corsHeaders);
                const salesResolve = await resolveAgentSalesName(env, currentUser, sales_name);
                if (salesResolve.error) return errorResponse(salesResolve.error, 400, corsHeaders);
                statements.push(
                    env.DB.prepare('UPDATE Agents SET sales_name = ? WHERE id = ?').bind(salesResolve.salesName, id)
                );
            }
            if (statements.length > 0) await env.DB.batch(statements);
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } catch (error) {
            console.error('Update agent failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    // POST /api/delete-agent
    if (url.pathname === '/api/delete-agent' && request.method === 'POST') {
        try {
            const body = await readJsonBody(request, corsHeaders);
            if (body instanceof Response) return body;
            const { id } = body;
            if (!id) return errorResponse('缺少代理商ID', 400, corsHeaders);
            const agent = await env.DB.prepare(
                'SELECT * FROM Agents WHERE id = ? AND deleted_at IS NULL'
            ).bind(id).first();
            if (!agent) return errorResponse('代理商不存在', 404, corsHeaders);
            if (!canManageAgent(currentUser, agent)) return errorResponse('权限不足：仅超级管理员或录入该代理的业务员可删除', 403, corsHeaders);
            await env.DB.prepare(
                'UPDATE Agents SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL'
            ).bind(getChinaTimestamp(), String(currentUser.name || ''), id).run();
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } catch (error) {
            console.error('Delete agent failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    // GET /api/agent-finance?agentId=xxx&projectId=xxx
    if (url.pathname === '/api/agent-finance' && request.method === 'GET') {
        try {
            const agentId = Number(url.searchParams.get('agentId') || 0);
            const projectId = Number(url.searchParams.get('projectId') || 0);
            if (!agentId || !projectId) return errorResponse('缺少参数', 400, corsHeaders);
            const agent = await env.DB.prepare(
                'SELECT * FROM Agents WHERE id = ? AND project_id = ? AND deleted_at IS NULL'
            ).bind(agentId, projectId).first();
            if (!agent) return errorResponse('代理商不存在', 404, corsHeaders);
            if (!canViewAgentFinance(currentUser, agent)) return errorResponse('权限不足：仅超级管理员、管理员或该代理的录入业务员可查看', 403, corsHeaders);

            const financeOrders = await env.DB.prepare(
                `SELECT o.id, o.company_name, o.total_booth_fee, o.total_amount, o.paid_amount, o.booth_id, o.area, o.status,
                        COALESCE(ec.commission_amount, 0) AS commission_amount,
                        ec.latest_commission_at
                 FROM Orders o
                 LEFT JOIN (
                    SELECT order_id,
                           SUM(COALESCE(amount, 0)) AS commission_amount,
                           MAX(created_at) AS latest_commission_at
                    FROM Expenses
                    WHERE project_id = ?
                      AND expense_type = '返佣支出'
                      AND payee_name = ?
                      AND deleted_at IS NULL
                    GROUP BY order_id
                 ) ec ON ec.order_id = o.id
                 WHERE o.project_id = ?
                   AND o.is_agent = 1
                   AND o.agent_name = ?
                   AND o.status NOT IN ('待确认', '已退订', '已作废')
                 ORDER BY CASE WHEN ec.latest_commission_at IS NULL THEN 1 ELSE 0 END ASC,
                          ec.latest_commission_at DESC,
                          o.id DESC`
            ).bind(projectId, agent.name, projectId, agent.name).all();

            const orderList = (financeOrders.results || []).map((o) => {
                const boothCount = Number((Number(o.area || 0) / 9).toFixed(2));
                return {
                    ...o,
                    booth_count: boothCount,
                    commission_amount: Number(o.commission_amount || 0)
                };
            });

            const totalBoothFee = orderList.reduce((s, o) => s + Number(o.total_booth_fee || 0), 0);
            const totalCommission = orderList.reduce((s, o) => s + Number(o.commission_amount || 0), 0);
            const totalBooths = Number(orderList.reduce((s, o) => s + Number(o.booth_count || 0), 0).toFixed(2));

            return new Response(JSON.stringify({
                agent,
                orders: orderList,
                summary: {
                    total_companies: orderList.length,
                    total_booths: totalBooths,
                    total_booth_fee: totalBoothFee,
                    total_commission: totalCommission
                }
            }), { headers: corsHeaders });
        } catch (error) {
            console.error('Agent finance failed:', error);
            return internalErrorResponse(corsHeaders);
        }
    }

    return null;
}
