# 2026-04-24 对话改动与上线版本汇总

## 概览

本次对话共落地 3 批变更，分别解决了以下问题：

1. 管理员角色无法新增代理。
2. 管理员浏览订单相关页面时，请求 `/api/staff?projectId=...` 返回 403。
3. 新增订单提交成功后，成交列表不会自动体现新订单，容易让用户误判“是否真的提交成功”。

本次所有变更均已完成测试并发布到线上。

线上 Worker 地址：

- https://fuzhou-fishery-expo.wcy165218.workers.dev

所有部署均执行了远端 D1 migration 检查，结果均为“无待执行 migration”。

---

## 批次一：管理员可新增代理

### 问题

代理新增接口只允许“超级管理员或业务员”，普通管理员被前后端同时拦截，导致管理员无法新增代理。

### 代码改动

后端：

- `src/routes/agents.mjs`
  - `canCreateAgent()` 从“仅超级管理员或业务员”调整为“管理员或业务员”。
  - `/api/add-agent` 的报错文案同步调整为“仅管理员或业务员可新增代理商”。

前端：

- `public/js/agents.js`
  - `window.canCreateAgent()` 从“超级管理员或业务员”调整为“管理员或业务员”。
  - 使代理商页面上的“新增代理商”按钮、弹窗入口与后端权限口径一致。

测试：

- `tests/agents-route.test.mjs`
  - 原“普通管理员不能新增代理”用例改为“普通管理员可以新增代理”。
  - 校验管理员新增代理时，默认归属业务员为当前管理员本人。

### 验证

执行过的验证包括：

- `node tests/agents-route.test.mjs`
- `node --check src/routes/agents.mjs && node --check public/js/agents.js`
- `npm test`

### 上线版本

- Worker Version ID: `953844cb-e052-4867-94f8-3e58c9c0ca13`

### 相关资产发布

- `public/js/agents.js`

---

## 批次二：管理员可读取员工列表，修复订单页 `/api/staff` 403

### 问题

订单页、成交列表、财务相关页面会复用员工列表接口 `/api/staff?projectId=...`。
但该 GET 接口被整体限制为“仅超级管理员可操作”，导致普通管理员浏览订单页面时持续出现 403。

### 代码改动

后端：

- `src/routes/staff.mjs`
  - `GET /api/staff` 从“仅超级管理员可访问”调整为“管理员可访问”。
  - `POST /api/staff`、`/api/delete-staff`、`/api/update-staff-role`、`/api/reset-password` 等写操作仍保持“仅超级管理员可操作”。
  - GET 接口报错文案调整为“仅管理员可操作”。

测试：

- `tests/staff-role-guards.test.mjs`
  - 新增 `testAdminCanReadStaffList()`：验证管理员可读取员工列表，并且角色字段会被规范化。
  - 新增 `testSalesCannotReadStaffList()`：验证普通业务员仍不能读取员工列表。

### 验证

执行过的验证包括：

- `node tests/staff-role-guards.test.mjs`
- `npm test`

### 上线版本

- Worker Version ID: `321aecca-134e-41a5-ab94-f365ac4ffcfe`

### 说明

这次变更没有新增静态资源发布，主要是 Worker 路由权限修复。

---

## 批次三：订单提交成功后的反馈与成交列表刷新优化

### 问题

订单录入成功后，页面只显示一条文字 toast。
如果用户随后点击“成交订单列表与财务管理”，因为该工作台标签已经加载过、且列表状态被缓存，用户经常看不到刚刚提交的订单，必须手动刷新页面，容易误判提交失败。

### 根因

前端工作台标签存在已加载状态缓存：

- 同一 `order-finance` 标签在切换回“成交列表”时，若 `loaded = true`，通常不会重新触发列表加载。
- 订单列表还会沿用已有分页、筛选、滚动快照，因此新订单不会自动出现在当前视图中。

### 代码改动

工作台标签能力：

- `public/js/auth.js`
  - 新增 `window.invalidateWorkbenchTabs()`。
  - 支持按 `tabIds`、`groupIds`、`sectionIds` 定向把标签标记为未加载。
  - 支持按需清空快照与滚动位置，确保用户下次进入该标签时走真实重载。

订单提交成功链路：

- `public/js/order.js`
  - 在 `window.submitOrderForm()` 成功分支中：
    - 将成交列表状态 `orderListState.page` 重置为第一页。
    - 将待确认列表状态 `pendingOrderListState.page` 重置为第一页。
    - 调用 `markOrderDashboardDirty()`，避免订单看板沿用旧统计。
    - 调用 `invalidateWorkbenchTabs({ groupIds: ['order-finance'], resetSnapshots: true })`，强制让“订单与财务管理”相关标签在下次打开时重载。
    - 在重置表单后，弹出一个可操作的成功弹层，而不再只是 toast。
  - 成功弹层展示：
    - 企业名称
    - 归属业务员
    - 展位摘要
    - 总应收
  - 成功弹层提供两个动作：
    - “查看成交列表”
    - “继续录入下一单”
  - 点击“查看成交列表”时，直接打开“订单与财务管理 · 成交订单列表与财务管理”，并利用前面的标签失效机制自动刷新。

测试：

- `tests/workbench-tabs.test.mjs`
  - 新增 `testExplicitInvalidationCanResetOrderFinanceTab()`。
  - 验证 `invalidateWorkbenchTabs()` 可以把 `order-finance` 标签标记为脏数据，并按要求清空快照和滚动位置。

样式构建产物：

- `public/assets/tailwind.css`
  - 由于发布流程会执行 `predeploy`，Tailwind 构建产物随本次前端改动一并更新。

### 验证

执行过的验证包括：

- `node tests/workbench-tabs.test.mjs`
- `node --check public/js/order.js && node --check public/js/auth.js && node --check public/js/api.js`
- `npm test`

### 上线版本

- Worker Version ID: `b4f7ea07-cb5a-49cf-a429-94dd14c9a7ad`

### 相关资产发布

- `public/js/auth.js`
- `public/js/order.js`
- `public/assets/tailwind.css`

---

## 本次对话涉及的文件汇总

后端文件：

- `src/routes/agents.mjs`
- `src/routes/staff.mjs`

前端文件：

- `public/js/agents.js`
- `public/js/auth.js`
- `public/js/order.js`
- `public/assets/tailwind.css`

测试文件：

- `tests/agents-route.test.mjs`
- `tests/staff-role-guards.test.mjs`
- `tests/workbench-tabs.test.mjs`

---

## 本次对话涉及的线上版本汇总

| 顺序 | 目的 | Worker Version ID | 结果 |
| --- | --- | --- | --- |
| 1 | 管理员可新增代理 | `953844cb-e052-4867-94f8-3e58c9c0ca13` | 已上线 |
| 2 | 管理员可读取员工列表，修复 `/api/staff` 403 | `321aecca-134e-41a5-ab94-f365ac4ffcfe` | 已上线 |
| 3 | 订单提交成功反馈与成交列表自动刷新优化 | `b4f7ea07-cb5a-49cf-a429-94dd14c9a7ad` | 已上线 |

---

## 补充说明

- 三次发布均执行了远端 D1 migration 检查，结果均为“`No migrations to apply!`”。
- 三次发布均同步了 VPS 静态资源。
- 本文档仅汇总本次对话中实际落地、测试并部署的改动，不包含对话中的分析性建议或未实施方案。