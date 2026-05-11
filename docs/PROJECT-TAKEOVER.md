# 🎪 福州渔业博览会展位销售管理系统 — 完整接管手册

> **版本**: 2026-04-15  
> **项目名**: `fuzhou-fishery-expo`  
> **技术栈**: Cloudflare Workers + D1 + R2 | Vanilla JS + Tailwind CSS  
> **仓库**: GitHub → Cloudflare Pages/Workers 自动部署

---

## 目录

1. [架构总览](#1-架构总览)
2. [目录结构详解](#2-目录结构详解)
3. [Cloudflare 资源绑定](#3-cloudflare-资源绑定)
4. [数据库 (D1) 完整表结构](#4-数据库-d1-完整表结构)
5. [R2 对象存储](#5-r2-对象存储)
6. [后端 API 完整清单](#6-后端-api-完整清单)
7. [后端路由与服务层详解](#7-后端路由与服务层详解)
8. [前端模块详解](#8-前端模块详解)
9. [认证与权限体系](#9-认证与权限体系)
10. [核心业务流程](#10-核心业务流程)
11. [ERP 同步机制](#11-erp-同步机制)
12. [定时任务 (Cron)](#12-定时任务-cron)
13. [测试体系](#13-测试体系)
14. [本地开发与调试](#14-本地开发与调试)
15. [数据库迁移操作指南](#15-数据库迁移操作指南)
16. [部署与发布](#16-部署与发布)
17. [GitHub 推送流程](#17-github-推送流程)
18. [常用运维操作](#18-常用运维操作)
19. [安全机制](#19-安全机制)
20. [已知约束与技术债务](#20-已知约束与技术债务)

---

## 1. 架构总览

```
┌──────────────┐     HTTPS      ┌────────────────────────────────────┐
│   浏览器      │ ──────────────▶│   Cloudflare Workers (_worker.js)  │
│  (Vanilla JS) │ ◀─────────────│                                    │
└──────────────┘                │  ┌─────────┐  ┌────────┐  ┌─────┐ │
                                │  │ Router   │  │Services│  │Utils│ │
                                │  │ (12路由) │→│ (8服务) │→│(6个)│ │
                                │  └─────────┘  └────────┘  └─────┘ │
                                │        │           │               │
                                │        ▼           ▼               │
                                │  ┌──────────┐  ┌────────┐         │
                                │  │ D1 (SQL) │  │R2 (OSS)│         │
                                │  │20张数据表│  │合同/图片│         │
                                │  └──────────┘  └────────┘         │
                                └────────────────────────────────────┘
                                         │
                                    Cron (每15分钟)
                                         │
                                         ▼
                                  自动释放过期预留订单
```

### 核心特征

| 特性 | 说明 |
|------|------|
| **运行时** | Cloudflare Workers (V8 Engine), 无 Node.js |
| **数据库** | Cloudflare D1 (SQLite 语法, 云端分布式) |
| **对象存储** | Cloudflare R2 (S3 兼容) |
| **前端** | 单页应用, index.html + 10个JS模块, 零框架 |
| **样式** | Tailwind CSS 3 (CDN + 本地构建) |
| **认证** | JWT (HS256, 12小时过期) |
| **外部集成** | ERP 支付流水同步 |
| **定时任务** | Cron Trigger 每15分钟 |

---

## 2. 目录结构详解

```
fuzhou-fishery-expo-main/
├── _worker.js                 # 🔴 Worker 入口 (fetch + scheduled handler)
├── erp-sync-core.mjs          # ERP 同步核心算法 (独立于 Worker 运行时)
├── package.json               # 脚本定义 & 依赖
├── wrangler.toml              # 🔴 生产环境配置 (D1/R2 绑定)
├── wrangler.preview.toml      # 预览环境配置 (remote=true)
├── wrangler.toml.example      # 配置模板 (占位符)
├── tailwind.config.mjs        # Tailwind 配置
│
├── public/                    # 📁 静态资源 (由 Cloudflare Assets 托管)
│   ├── index.html             # 单页应用主页
│   ├── assets/tailwind.css    # 编译后的 Tailwind CSS
│   └── js/
│       ├── app.js             # 应用入口 (DOMContentLoaded)
│       ├── api.js             # API 客户端 & 全局状态
│       ├── auth.js            # 登录/导航/权限
│       ├── config.js          # 系统设置 UI
│       ├── booth.js           # 展位库存 UI
│       ├── booth-map.js       # 展位图编辑器 (SVG 画布)
│       ├── order.js           # 订单录入 & 展位选择器
│       ├── finance.js         # 收款/超收/费用 UI
│       ├── home.js            # 首页仪表板
│       └── agents.js          # 代理商管理 UI
│
├── src/                       # 📁 后端源码
│   ├── router.mjs             # 路由分发器 (12个处理链)
│   ├── routes/                # 12 个路由模块
│   │   ├── auth.mjs           # 登录/改密
│   │   ├── projects.mjs       # 项目 CRUD
│   │   ├── staff.mjs          # 员工管理
│   │   ├── config.mjs         # 系统配置/ERP/导入
│   │   ├── booths.mjs         # 展位管理
│   │   ├── booth-maps.mjs     # 展位图 CRUD
│   │   ├── orders.mjs         # 订单管理 (最复杂)
│   │   ├── payments.mjs       # 收款管理
│   │   ├── expenses.mjs       # 支出/返佣
│   │   ├── agents.mjs         # 代理商 CRUD
│   │   ├── files.mjs          # 文件上传/下载 (R2)
│   │   └── dashboard.mjs      # 统计分析
│   │
│   ├── services/              # 8 个业务服务
│   │   ├── booth-locks.mjs    # 展位锁 (防并发)
│   │   ├── booth-map-view.mjs # 展位图运行时渲染
│   │   ├── booth-sync.mjs     # 展位状态同步
│   │   ├── erp.mjs            # ERP 集成
│   │   ├── order-fields.mjs   # 订单字段配置
│   │   ├── order-import.mjs   # CSV 批量导入
│   │   ├── order-release.mjs  # 订单自动释放
│   │   └── overpayment.mjs    # 超收检测
│   │
│   └── utils/                 # 6 个工具模块
│       ├── auth.mjs           # 权限判断
│       ├── booth-map.mjs      # 展位号/馆号处理
│       ├── crypto.mjs         # JWT/密码/加密
│       ├── helpers.mjs        # 通用工具函数
│       ├── request.mjs        # 请求解析/限制
│       └── response.mjs       # 响应构建/CORS/CSP
│
├── migrations/                # 📁 生产DB迁移 (7个迁移文件)
├── db/local/                  # 本地测试初始化 SQL
├── tests/                     # 📁 13 个测试套件 (3071行)
├── docs/                      # 📁 14 个文档
├── backups/                   # 数据库备份
└── styles/tailwind.css        # Tailwind 源文件
```

---

## 3. Cloudflare 资源绑定

### 生产环境 (`wrangler.toml`)

| 绑定名 | 类型 | 资源 | 说明 |
|--------|------|------|------|
| `DB` | D1 Database | `<your-d1-name>` | 真实 `database_id` 建议只保留在本地私有配置 |
| `BUCKET` | R2 Bucket | `<your-r2-bucket>` | 合同文件 & 展位图底图 |
| `ASSETS` | Static Assets | `./public` 目录 | 静态资源托管 |

### 环境变量 (需在 Cloudflare Dashboard 设置)

| 变量名 | 用途 |
|--------|------|
| `JWT_SECRET` | JWT 签名密钥 (HS256) |
| `ERP_CONFIG_SECRET` | ERP Cookie / 敏感 ERP 配置加密密钥 (AES-GCM) |
| `ALLOWED_ORIGINS` | CORS 允许的源 (逗号分隔) |

### Worker 配置

```toml
name = "fuzhou-fishery-expo"
main = "./_worker.js"
compatibility_date = "2026-03-20"

[triggers]
crons = ["*/15 * * * *"]       # 每15分钟执行 scheduled()

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = ["/api/*"]  # /api/* 路径交由 Worker 处理
```

### 预览环境 (`wrangler.preview.toml`)

- Worker 名称: `fuzhou-fishery-expo-preview`
- D1 和 R2 均标记 `remote = true`，使用真实云端资源

---

## 4. 数据库 (D1) 完整表结构

### 4.1 核心业务表

#### `Projects` — 展会项目

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL | 项目名称 |
| year | INTEGER | | 年份 |
| start_date | TEXT | | 开展日期 |
| end_date | TEXT | | 闭展日期 |

#### `Staff` — 员工

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | |
| name | TEXT | NOT NULL UNIQUE | 登录名 |
| password | TEXT | NOT NULL | PBKDF2 哈希 |
| role | TEXT | DEFAULT 'user' | `admin` 或 `user` |
| target | REAL | DEFAULT 0 | 销售目标 (展位数) |
| display_order | INTEGER | DEFAULT 0 | 显示排序 |
| exclude_from_sales_ranking | INTEGER | DEFAULT 0 | 排名排除 |
| token_index | INTEGER | DEFAULT 0 | 每次改密/改角色+1, 旧令牌失效 |

#### `Booths` — 展位库存

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| row_id | INTEGER | PK AUTOINCREMENT | |
| id | TEXT | NOT NULL | 展位号 (如 1A01) |
| project_id | INTEGER | NOT NULL | |
| hall | TEXT | NOT NULL | 展馆 (如 1号馆) |
| type | TEXT | NOT NULL | 标摊/豪标/光地 |
| area | REAL | DEFAULT 0 | 面积㎡ |
| price_unit | TEXT | | 单价单位 |
| base_price | REAL | DEFAULT 0 | 底价 |
| status | TEXT | DEFAULT '可售' | 运行时状态 |
| width_m | REAL | DEFAULT 0 | 宽度(米) |
| height_m | REAL | DEFAULT 0 | 高度(米) |
| opening_type | TEXT | | 开口方向 |
| booth_map_id | INTEGER | | 所属展位图 |
| source | TEXT | DEFAULT 'manual' | manual/map-managed |
| | | UNIQUE(id, project_id) | |

#### `Orders` — 订单

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | INTEGER | NOT NULL | |
| company_name | TEXT | NOT NULL | 参展企业 |
| credit_code | TEXT | | 统一信用代码 |
| no_code_checked | INTEGER | DEFAULT 0 | 无代码标记 |
| category | TEXT | | 行业分类 |
| main_business | TEXT | | 主营业务 |
| is_agent | INTEGER | DEFAULT 0 | 是否代理 |
| agent_name | TEXT | | 代理商名 |
| contact_person | TEXT | NOT NULL | 联系人 |
| phone | TEXT | NOT NULL | 电话 |
| region | TEXT | | 地区 |
| booth_id | TEXT | NOT NULL | 展位号(逗号分隔多个) |
| area | REAL | DEFAULT 0 | 总面积 |
| price_unit | TEXT | | 单价单位 |
| unit_price | REAL | DEFAULT 0 | 单价 |
| total_booth_fee | REAL | DEFAULT 0 | 展位费 |
| discount_reason | TEXT | | 折扣原因 |
| other_income | REAL | DEFAULT 0 | 其他费用总额 |
| fees_json | TEXT | DEFAULT '[]' | 费用明细 JSON |
| profile | TEXT | | 备注 |
| total_amount | REAL | DEFAULT 0 | 应收总额 |
| paid_amount | REAL | DEFAULT 0 | 已收金额 |
| contract_url | TEXT | | 合同文件 R2 key |
| booth_display_name | TEXT | | 展位简称 |
| sales_name | TEXT | NOT NULL | 业务员 |
| status | TEXT | DEFAULT '正常' | 正常/已退订/已作废/待确认 |
| reserved_release_due_at | TEXT | | 预留释放截止时间 |
| pending_at | TEXT | | 转为待确认的时间 |
| pending_source | TEXT | | 待确认来源 |
| pending_reason | TEXT | | 待确认原因 |
| pending_release_snapshot_json | TEXT | | 释放时的快照 |
| pending_payment_resolution_status | TEXT | DEFAULT '' | 待确认收款处理状态 |
| pending_payment_handling_method | TEXT | | 收款处理方式 |
| pending_payment_handling_note | TEXT | | 处理备注 |
| pending_payment_handled_by | TEXT | | 处理人 |
| pending_payment_handled_at | TEXT | | 处理时间 |
| deleted_at | TEXT | | 软删除时间 |
| deleted_by | TEXT | | 删除人 |
| created_at | TEXT | NOT NULL | 创建时间(东八区) |

#### `Payments` — 收款记录

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | INTEGER | NOT NULL | |
| order_id | INTEGER | NOT NULL | |
| amount | REAL | DEFAULT 0 | 金额 |
| payment_time | TEXT | NOT NULL | 收款时间 |
| payer_name | TEXT | | 付款人 |
| bank_name | TEXT | | 银行 |
| remarks | TEXT | | 备注 |
| source | TEXT | DEFAULT 'MANUAL' | MANUAL 或 ERP |
| erp_record_id | TEXT | | ERP 流水号 (唯一) |
| raw_payload | TEXT | | ERP 原始数据 |
| deleted_at | TEXT | | 软删除 |
| deleted_by | TEXT | | |

#### `Expenses` — 支出/返佣

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | INTEGER | NOT NULL | |
| order_id | INTEGER | NOT NULL | |
| expense_type | TEXT | DEFAULT '其他代付' | 返佣/其他代付 |
| payee_name | TEXT | NOT NULL | 收款方 |
| payee_channel | TEXT | | 渠道 |
| payee_bank | TEXT | | 银行 |
| payee_account | TEXT | | 账号 |
| amount | REAL | DEFAULT 0 | 金额 |
| applicant | TEXT | | 申请人 |
| reason | TEXT | NOT NULL | 原因 |
| created_at | TEXT | | |
| deleted_at | TEXT | | 软删除 |
| deleted_by | TEXT | | |

### 4.2 展位图相关表

#### `BoothMaps` — 展位图

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | INTEGER | NOT NULL | |
| name | TEXT | NOT NULL | 图名 |
| background_image_key | TEXT | | R2 底图 key |
| scale_pixels_per_meter | REAL | DEFAULT 0 | 像素/米缩放因子 |
| default_stroke_width | REAL | DEFAULT 2 | 默认线宽 |
| canvas_width | REAL | DEFAULT 1600 | 画布宽 |
| canvas_height | REAL | DEFAULT 900 | 画布高 |
| viewport_x/y | REAL | DEFAULT 0 | 视口偏移 |
| viewport_zoom | REAL | DEFAULT 1 | 缩放 |
| calibration_json | TEXT | DEFAULT '{}' | 标定数据 |
| display_config_json | TEXT | DEFAULT '{}' | 显示配置 |
| created_at / updated_at | TEXT | | |

#### `BoothMapItems` — 展位图项 (单个展位的形状)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | INTEGER | NOT NULL | |
| map_id | INTEGER | NOT NULL | 所属展位图 |
| booth_code | TEXT | NOT NULL | 展位号 |
| hall | TEXT | NOT NULL | 展馆 |
| booth_type | TEXT | NOT NULL | 展位类型 |
| opening_type | TEXT | | 开口方向 |
| width_m / height_m | REAL | DEFAULT 0 | 尺寸(米) |
| area | REAL | DEFAULT 0 | 面积 |
| x / y | REAL | DEFAULT 0 | 画布坐标 |
| rotation | REAL | DEFAULT 0 | 旋转角度 |
| stroke_width | REAL | DEFAULT 2 | 线宽 |
| shape_type | TEXT | DEFAULT 'rect' | rect/polygon |
| points_json | TEXT | DEFAULT '[]' | 多边形顶点 |
| label_style_json | TEXT | DEFAULT '{}' | 标签样式 |
| z_index | INTEGER | DEFAULT 0 | 层级 |
| hidden | INTEGER | DEFAULT 0 | 隐藏 |
| | | UNIQUE(project_id, booth_code) | |

### 4.3 配置/系统表

#### `Accounts` — 收款账户
| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| project_id | INTEGER | |
| account_name | TEXT | 账户名称 |
| bank_name | TEXT | 银行名 |
| account_no | TEXT | 账号 |

#### `Industries` — 行业分类
| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| project_id | INTEGER | |
| industry_name | TEXT | 行业名 UNIQUE(project_id, industry_name) |

#### `Prices` — 展位单价配置
| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| project_id | INTEGER | |
| booth_type | TEXT | 标摊/豪标/光地 UNIQUE(project_id, booth_type) |
| price | REAL | 单价 |

#### `Agents` — 代理商
| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| project_id | INTEGER | |
| name | TEXT | 代理商名 UNIQUE(project_id, name) |
| sales_name | TEXT | 所属业务员 |
| created_at | TEXT | |
| deleted_at / deleted_by | TEXT | 软删除 |

#### `ProjectErpConfigs` — ERP 同步配置
| 列名 | 类型 | 说明 |
|------|------|------|
| project_id | INTEGER PK | |
| enabled | INTEGER | 是否启用 |
| endpoint_url | TEXT | ERP 接口地址 |
| water_id | TEXT | 流水单类型 ID |
| session_cookie | TEXT | 认证 Cookie (AES-GCM 加密) |
| expected_project_name | TEXT | 期望的项目名 |
| use_mock / mock_payload | | 测试模拟 |
| last_sync_at / last_sync_summary | TEXT | 上次同步信息 |

#### `ProjectOrderFieldSettings` — 订单字段开关
| 列名 | 类型 | 说明 |
|------|------|------|
| project_id | INTEGER | PK(project_id, field_key) |
| field_key | TEXT | 字段标识 |
| enabled / required | INTEGER | 启用/必填 |

#### `ProjectOrderReleaseSettings` — 自动释放配置
| 列名 | 类型 | 说明 |
|------|------|------|
| project_id | INTEGER PK | |
| release_after_minutes | INTEGER | 未付款自动释放分钟数 |

#### `OrderOverpaymentIssues` — 超收问题
| 列名 | 类型 | 说明 |
|------|------|------|
| order_id | INTEGER PK | |
| project_id | INTEGER | |
| overpaid_amount | REAL | 超收金额 |
| status | TEXT | pending/resolved_by_*/exchange_rate/on_hold |
| reason / note | TEXT | |
| handled_by / handled_at | TEXT | 处理信息 |

#### `OrderBoothChanges` — 展位变更记录
| 列名 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| order_id / project_id | INTEGER | |
| old/new_booth_id | TEXT | 新旧展位号 |
| old/new_area | REAL | 新旧面积 |
| booth_delta_count | REAL | 展位数变化 |
| old/new_total_amount | REAL | 金额变化 |
| changed_by / reason / changed_at | TEXT | 审计信息 |

#### `BoothLocks` — 展位锁 (防并发)
| 列名 | 类型 | 说明 |
|------|------|------|
| row_id | INTEGER PK | |
| project_id | INTEGER | |
| booth_id | TEXT | UNIQUE(project_id, booth_id) |
| lock_token | TEXT | UUID |
| expires_at / created_at | TEXT | 30秒 TTL |

#### `LoginAttempts` — 登录限制
| 列名 | 类型 | 说明 |
|------|------|------|
| attempt_key | TEXT PK | |
| username / ip_address | TEXT | |
| failed_count | INTEGER | 最多5次 |
| last_failed_at / locked_until | TEXT | 锁定15分钟 |

#### `WriteRateLimits` — 写入速率限制
| 列名 | 类型 | 说明 |
|------|------|------|
| rate_key | TEXT PK | |
| request_count | INTEGER | 60秒内最多30次 |
| window_start | TEXT | |

### 4.4 关键索引

```sql
-- 订单查询
idx_orders_project_status_created_at     (project_id, status, created_at)
idx_orders_project_booth_status_created_at (project_id, booth_id, status, created_at)
idx_orders_project_sales_created_at      (project_id, sales_name, created_at)
idx_orders_project_status_release_due    (project_id, status, reserved_release_due_at)
idx_orders_project_pending_at            (project_id, pending_at)

-- 收款
idx_payments_order_deleted_time          (order_id, deleted_at, payment_time)
idx_payments_project_deleted_order       (project_id, deleted_at, order_id)
idx_payments_erp_record_id              (erp_record_id) UNIQUE

-- 展位
idx_booths_project_hall_id               (project_id, hall, id)
idx_booths_project_booth_map_id          (project_id, booth_map_id)

-- 展位图
idx_booth_map_items_project_map_z_index  (project_id, map_id, z_index)
idx_booth_map_items_project_map_booth_code (project_id, map_id, booth_code)

-- 其他
idx_booth_locks_project_expires_at       (project_id, expires_at)
idx_expenses_order_deleted_created_at    (order_id, deleted_at, created_at)
```

---

## 5. R2 对象存储

| Bucket | 绑定名 | 用途 |
|--------|--------|------|
| `<your-r2-bucket>` | `BUCKET` | 合同 PDF + 展位图底图 |

### 文件路径约定

| 类型 | Key 格式 | 大小限制 |
|------|----------|----------|
| 合同文件 | `contracts/{uploadId}.pdf` | 5MB (前端) / 6MB (后端) |
| 展位图底图 | `booth-maps/{mapId}/{name}.{jpg\|png}` | 10MB |

### R2 操作接口

- **上传**: `POST /api/upload` (JSON Base64 或 multipart/form-data)
- **下载**: `GET /api/file/{fileKey}` (需登录, 权限检查)
- **展位图底图**: `POST /api/upload-booth-map-background`
- **删除底图**: `POST /api/delete-booth-map-background`

---

## 6. 后端 API 完整清单

### 认证

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/login` | 公开 | 登录 |
| POST | `/api/change-password` | 已登录 | 改密码 |

### 文件

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/upload` | 已登录 | 上传合同 |
| GET | `/api/file/{key}` | admin/订单所属 | 下载文件 |

### 项目管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/projects` | 已登录 | 项目列表 |
| POST | `/api/projects` | 超级管理员 | 新建项目 |
| POST | `/api/update-project` | 超级管理员 | 更新项目 |

### 员工管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/staff` | 已登录 | 员工列表 |
| POST | `/api/staff` | 超级管理员 | 添加员工 |
| POST | `/api/delete-staff` | 超级管理员 | 删除员工 |
| POST | `/api/update-staff-role` | 超级管理员 | 改角色 |
| POST | `/api/set-target` | 超级管理员 | 设目标 |
| POST | `/api/update-staff-order` | 超级管理员 | 调排序 |
| POST | `/api/update-staff-sales-ranking` | 超级管理员 | 排名开关 |
| POST | `/api/reset-password` | 超级管理员 | 重置密码 |

### 系统配置

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/accounts` | 已登录 | 收款账户列表 |
| POST | `/api/add-account` | 超级管理员 | 添加账户 |
| POST | `/api/delete-account` | 超级管理员 | 删除账户 |
| GET | `/api/industries` | 已登录 | 行业列表 |
| POST | `/api/add-industry` | 超级管理员 | 添加行业 |
| POST | `/api/delete-industry` | 超级管理员 | 删除行业 |
| GET | `/api/erp-config` | 超级管理员 | ERP 配置 |
| POST | `/api/save-erp-config` | 超级管理员 | 保存 ERP 配置 |
| GET | `/api/order-field-settings` | 超级管理员 | 字段设置 |
| POST | `/api/save-order-field-settings` | 超级管理员 | 保存字段设置 |
| GET | `/api/order-release-settings` | 超级管理员 | 释放设置 |
| POST | `/api/order-release-settings` | 超级管理员 | 保存释放设置 |
| POST | `/api/order-import-preview` | 超级管理员 | 导入预检 |
| POST | `/api/order-import` | 超级管理员 | 执行导入 |
| POST | `/api/erp-sync-preview` | 超级管理员 | ERP 同步预览 |
| POST | `/api/erp-sync` | 超级管理员 | 执行 ERP 同步 |

### 展位价格

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/prices` | 已登录 | 价格表 |
| POST | `/api/prices` | 超级管理员 | 设定价格 |

### 展位管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/booths` | 已登录 | 展位列表 (含运行时状态) |
| POST | `/api/edit-booth` | 超级管理员 | 编辑展位 |
| POST | `/api/update-booth-status` | 超级管理员 | 改状态 |
| POST | `/api/delete-booths` | 超级管理员 | 删除 |

### 展位图

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/booth-maps` | 已登录 | 展位图列表 |
| POST | `/api/create-booth-map` | 超级管理员 | 新建图 |
| POST | `/api/update-booth-map` | 超级管理员 | 更新属性 |
| POST | `/api/delete-booth-map` | 超级管理员 | 删除图 (级联) |
| GET | `/api/booth-map-detail` | 已登录 | 图详情 |
| GET | `/api/booth-map-runtime-view` | 已登录 | 实时视图 |
| POST | `/api/upload-booth-map-background` | 超级管理员 | 上传底图 |
| POST | `/api/save-booth-map-items` | 超级管理员 | 保存展位项 |
| POST | `/api/delete-booth-map-background` | 超级管理员 | 删除底图 |

### 订单

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/orders` | 已登录 | 分页订单 (非admin只看自己) |
| GET | `/api/pending-orders` | 已登录 | 待确认订单 |
| POST | `/api/submit-order` | 已登录 | 提交订单 |
| POST | `/api/update-customer-info` | 订单所属/admin | 修改客户信息 |
| POST | `/api/change-order-booth` | 订单所属/admin | 换展位 |
| POST | `/api/reactivate-pending-order` | 超级管理员 | 重新选位 |
| POST | `/api/handle-pending-order-payments` | 超级管理员 | 处理待确认收款 |
| POST | `/api/delete-pending-order` | 超级管理员 | 删除待确认 |
| POST | `/api/cancel-order` | 订单所属/admin | 退订 |

### 收款

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/payments` | 订单所属/admin | 收款列表 |
| POST | `/api/add-payment` | 订单所属/admin | 添加收款 |
| POST | `/api/delete-payment` | 订单所属/admin | 删除 (ERP不可删) |
| POST | `/api/edit-payment` | 订单所属/admin | 编辑 (ERP不可改) |
| POST | `/api/update-order-fees` | 订单所属/admin | 调整费用 |
| POST | `/api/resolve-overpayment` | 订单所属/admin | 处理超收 |

### 支出

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/expenses` | 订单所属/admin | 支出列表 |
| POST | `/api/add-expense` | 订单所属/admin | 添加支出 |
| POST | `/api/delete-expense` | 订单所属/admin | 删除支出 |

### 代理商

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/agents` | 已登录 | 代理商列表 |
| POST | `/api/add-agent` | admin/业务员 | 添加 |
| POST | `/api/update-agent` | admin/录入者 | 更新 |
| POST | `/api/delete-agent` | admin/录入者 | 软删除 |
| GET | `/api/agent-finance` | admin/录入者 | 财务统计 |

### 仪表板

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/order-dashboard-stats` | 已登录 | 订单统计 |
| GET | `/api/home-dashboard` | 已登录 | 首页数据 |

---

## 7. 后端路由与服务层详解

### 7.1 请求处理链

```
浏览器请求
  │
  ▼
_worker.js fetch()
  ├── 静态资源? → env.ASSETS.fetch() + 安全头
  ├── OPTIONS? → CORS 预检响应
  ├── 非 /api/ ? → 转发 ASSETS
  │
  ▼ /api/* 路径
  ├── 检查请求体大小 (Content-Length)
  ├── /api/login? → 直接路由
  ├── JWT 验证 → 解码 token → 查 Staff 表验证 token_index
  ├── 30秒认证缓存 (Map, lowercase key)
  ├── POST? → checkWriteRateLimit (60秒30次)
  │
  ▼
router.mjs → dispatchApiRoutes()
  │ 依次调用12个路由处理器, 第一个返回非null的响应生效
  ├── 1. handleFileRoutes
  ├── 2. handleAuthRoutes
  ├── 3. handleProjectRoutes
  ├── 4. handleStaffRoutes
  ├── 5. handleConfigRoutes
  ├── 6. handleBoothMapRoutes
  ├── 7. handleBoothRoutes
  ├── 8. handleAgentRoutes
  ├── 9. handleExpenseRoutes
  ├── 10. handleOrderRoutes
  ├── 11. handlePaymentRoutes
  └── 12. handleDashboardRoutes
       │
       ▼ 无匹配
      404 Not Found
```

### 7.2 服务层交互图

```
routes/orders.mjs ──────┬──▶ services/booth-locks.mjs    (获锁/释锁)
                        ├──▶ services/booth-sync.mjs     (同步展位状态)
                        ├──▶ services/order-release.mjs  (释放/预留)
                        └──▶ services/overpayment.mjs    (超收检测)

routes/config.mjs ──────┬──▶ services/erp.mjs            (ERP 同步)
                        ├──▶ services/order-import.mjs   (CSV 导入)
                        └──▶ services/order-fields.mjs   (字段配置)

routes/booth-maps.mjs ──┬──▶ services/booth-map-view.mjs (运行时渲染)
                        └──▶ services/booth-sync.mjs     (状态同步)

routes/payments.mjs ────┬──▶ services/overpayment.mjs    (超收)
                        └──▶ services/booth-sync.mjs     (展位状态)

_worker.js (cron) ──────▶ services/order-release.mjs    (自动释放)
```

### 7.3 关键服务说明

| 服务 | 核心职责 |
|------|---------|
| **booth-locks** | 30秒 TTL 的分布式锁, 防止并发展位操作, 80条分块 SQL |
| **booth-map-view** | 展位图运行时状态推导: locked > full_paid > deposit > reserved > available |
| **booth-sync** | 同步展位的 DB 状态字段, 40条一组批量更新 |
| **erp** | ERP 流水抓取, Cookie 加密存储, 多关键词搜索降级 |
| **order-import** | CSV 解析 (逗号/制表符), 130+ 表头别名, 最多300行, 展位锁保护 |
| **order-release** | 预留→待确认→可重分配, 快照审计, Cron 批量释放 |
| **overpayment** | 原子性增减 paid_amount, 超付记录状态机 |
| **order-fields** | 14个订单字段的启用/必填配置 |

---

## 8. 前端模块详解

### 8.1 模块依赖关系

```
index.html
  └─ 加载顺序 (全局 window 对象共享状态):
     1. api.js     ← 全局状态 & API 工具
     2. auth.js    ← 导航 & 权限
     3. config.js  ← 系统设置
     4. booth.js   ← 展位库
     5. booth-map.js ← 展位图编辑器
     6. order.js   ← 订单录入
     7. finance.js ← 财务管理
     8. home.js    ← 数据看板
     9. agents.js  ← 代理商
     10. app.js    ← 入口 (DOMContentLoaded)
```

### 8.2 全局状态 (`api.js`)

```javascript
currentUser        // 当前登录用户
allProjects        // 项目列表缓存
allBooths          // 展位列表缓存
allOrders          // 订单列表缓存
globalPrices       // 价格表
currentBoothMap    // 当前编辑的展位图
projectStaffCache  // 员工列表缓存 (按项目)
orderListState     // 订单分页状态 {page, pageSize, total}
```

### 8.3 前端页面结构

| 页面 ID | 功能 | 对应 JS |
|---------|------|---------|
| `#sec-home` | 首页仪表板 (销售目标/排名/趋势) | home.js |
| `#sec-agents` | 代理商管理 | agents.js |
| `#sec-order-entry` | 订单录入表单 | order.js |
| `#sec-order-list` | 成交订单列表 | order.js + finance.js |
| `#sec-pending-orders` | 待确认订单列表 | order.js + finance.js |
| `#sec-booth-map` | 展位图编辑器 (SVG) | booth-map.js |
| `#sec-booth` | 展位库存表 | booth.js |
| `#sec-config` | 系统设置 (4个子面板) | config.js |

### 8.4 关键 UI 模式

- **SPA 导航**: `openSection(sectionId)` 切换 `.page-section.active`
- **API 调用**: `fetchWithAuth(url, options)` 自动附加 JWT
- **权限控制**: `isSuperAdmin()`, `canManageOrder()` 控制 UI 元素显示
- **展位图**: SVG 画布 + 鼠标事件 + 缩放/平移 + 多边形绘制
- **状态管理**: 全局变量 + DOM 直接操作, 无框架

---

## 9. 认证与权限体系

### 9.1 角色定义

| 角色 | 标识 | 说明 |
|------|------|------|
| **超级管理员** | name='admin' && role='admin' | 全部权限 |
| **普通管理员** | role='admin' (非admin用户) | 受限管理权 |
| **业务员** | role='user' | 仅操作自己的订单/代理 |

### 9.2 权限矩阵

| 操作 | 超级管理员 | 管普通管理员 | 业务员 |
|------|-----------|-------------|--------|
| 系统配置 | ✅ | ❌ | ❌ |
| 员工管理 | ✅ | ❌ | ❌ |
| 展位图编辑 | ✅ | ❌ | ❌ |
| ERP同步/导入 | ✅ | ❌ | ❌ |
| 全局订单查看 | ✅ | ✅ | ❌ (仅自己) |
| 订单录入 | ✅ | ✅ | ✅ |
| 修改自己订单 | ✅ | ✅ | ✅ |
| 修改他人订单 | ✅ | ✅ | ❌ |
| 添加代理商 | ✅ | ❌ | ✅ |
| 代理商财务 | ✅ | ✅ | ✅(仅自己的) |

### 9.3 JWT 流程

```
登录 → hashPassword 验证 → signJWT({name, role}, secret, 12h)
  │
请求 → Authorization: Bearer <token>
  │
验证 → verifyJWT → 查 Staff.token_index → 30秒缓存
  │
改密/改角色 → token_index++ → 旧 JWT 失效
```

### 9.4 安全措施

- 登录失败5次 → 锁定15分钟
- POST请求 → 60秒30次写入限制
- 请求体大小限制 (256KB JSON / 9MB 合同 / 11MB 底图)
- CSP 头 (仅允许 self + cdnjs.cloudflare.com)
- CORS 动态源检查
- 默认密码强制修改提示

---

## 10. 核心业务流程

### 10.1 订单生命周期

```
                      ┌─────────────────────────────────┐
                      │        提交订单                   │
                      │  (booth-locks → 展位锁 → 创建)   │
                      └───────────┬─────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │         正常 (活跃)           │
                    │  booth 状态 = reserved       │
                    │  reserved_release_due_at 设置 │
                    └────┬────────┬────────┬───────┘
                         │        │        │
                    收款  │   无收款│   主动退│
                         │   超时  │   订   │
                         ▼        ▼        ▼
                   ┌─────────┐  ┌──────────┐  ┌────────┐
                   │ 定金/全款 │  │  待确认   │  │ 已退订  │
                   │ deposit/ │  │ (pending) │  │        │
                   │full_paid │  │ 展位释放  │  │ 展位释放│
                   └─────────┘  └─────┬────┘  └────────┘
                                      │
                              ┌───────┴──────┐
                              │              │
                              ▼              ▼
                        重新选位         已作废
                       (reactivate)    (删除)
```

### 10.2 展位状态推导

```javascript
// 优先级: locked > full_paid > deposit > reserved > available
if (booth.status === 'locked')           → locked (手动锁定)
if (activeOrders 中有全款)               → full_paid (绿色)
if (activeOrders 中有定金)               → deposit (蓝色)
if (activeOrders 中有预留)               → reserved (黄色)
else                                    → available (可售)
```

### 10.3 展位图工作流

```
创建展位图 → 设置画布/缩放 → 上传底图(可选)
    │
    ▼
添加展位项 (矩形/多边形) → 设置编号/类型/面积/开口
    │
    ▼
保存 → 自动同步到 Booths 表 (source='map-managed')
    │
    ▼
运行时视图: 叠加订单状态、公司名、释放倒计时
```

### 10.4 收款与超收

```
添加收款 → 检查不超过应收 → applyOrderPaidAmountDelta (原子性)
    │
    ▼
同步展位状态 → refreshOrderOverpaymentIssues
    │
    ├── 未超收 → 正常
    ├── 超收 → 创建 OrderOverpaymentIssues (pending)
    │     │
    │     ├── 汇率差处理 → 自动添加费用项, 调整应收金额
    │     └── 暂挂处理 → 记录说明, 保留超收标记
```

---

## 11. ERP 同步机制

### 同步流程

```
管理员配置 ERP 连接 (endpoint, cookie, project_name)
    │
    ▼
预览: buildErpPreviewResult()
    ├── fetchErpPayload() → 分页抓取 (100条/页, 最多50页)
    ├── normalizeErpRow() → 标准化字段
    ├── buildErpSyncPlan() → 匹配本地订单
    │   ├── 过滤: 非closed状态, 项目不匹配, 退款
    │   ├── 匹配: 按企业名对应本地订单
    │   └── 检测: 重复ERP ID, 超收预警
    │
    ▼
执行同步: 插入 Payments (source='ERP')
    ├── 更新 Orders.paid_amount
    └── 刷新超收检测
```

### ERP 加密

- Session Cookie 使用 AES-GCM 加密存储 (前缀 `erpenc_v1$`)
- 读取时自动解密
- 旧版明文 Cookie 自动迁移为加密格式

---

## 12. 定时任务 (Cron)

```toml
[triggers]
crons = ["*/15 * * * *"]  # 每15分钟
```

**执行逻辑** (`_worker.js` → `scheduled()`):

1. 调用 `expireOverdueReservedOrders(env)`
2. 查询所有项目的 `ProjectOrderReleaseSettings`
3. 找出 `release_after_minutes` 已到期 且 `paid_amount = 0` 的正常订单
4. 执行 `releaseOrderToPending()`:
   - 保存释放快照 (JSON)
   - 清空展位相关字段 (booth_id, area, price_unit 等)
   - 设置 status = '待确认'
   - 同步展位状态 (释放展位)

---

## 13. 测试体系

### 测试命令

```bash
npm test               # 运行全部13个测试套件
npm run check          # 语法检查 (所有 JS/MJS 文件)
```

### 测试套件清单

| 文件 | 行数 | 覆盖范围 |
|------|------|---------|
| `route-main-chain.test.mjs` | 1052 | 主路由链完整测试 |
| `route-regressions.test.mjs` | 463 | 回归测试 |
| `agents-route.test.mjs` | 264 | 代理商路由 |
| `agent-integrity.test.mjs` | 218 | 代理商数据完整性 |
| `erp-sync-core.test.mjs` | 196 | ERP 同步算法 |
| `order-import.test.mjs` | 148 | 订单导入 |
| `request-guards.test.mjs` | 148 | 请求守卫 |
| `dashboard-source-data.test.mjs` | 138 | 仪表板数据源 |
| `booth-locks.test.mjs` | 134 | 展位锁 |
| `write-rate-limit.test.mjs` | 120 | 写入限流 |
| `booth-rules.test.mjs` | 82 | 展位规则 |
| `order-list-helpers.test.mjs` | 60 | 订单列表辅助 |
| `index-layout.test.mjs` | 48 | 首页布局 |

### 测试模式

- 使用 Node.js 内建 `node:test` 模块
- 通过 mock DB/env 对象模拟 D1
- 测试路由处理器的请求→响应映射
- 测试业务逻辑函数的输入→输出

---

## 14. 本地开发与调试

### 环境准备

```bash
# 安装依赖
npm install

# 初始化本地 D1 数据库 (SQLite)
npm run db:init:local

# 构建 Tailwind CSS
npm run build:styles
```

### 启动开发服务器

```bash
# 本地 D1 + 本地 R2 (推荐日常开发)
npm run dev -- --port 8788

# 预览模式 (使用远程 D1/R2)
npm run dev:preview

# 远程数据模式
npm run dev:remote
```

### 测试账号

本地测试账号由 [db/local/20260320-1200-local-test-bootstrap.sql](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/db/local/20260320-1200-local-test-bootstrap.sql) 初始化。

如果仓库要公开，建议不要在文档里重复展开测试口令；需要时只在本地查看该脚本。

### 本地测试数据

初始化后包含:
- 1个项目: "Local Demo Expo 2026"
- 2个本地测试员工
- 2个收款账户
- 3个行业分类
- 3个价格设置
- 1个展位图 + 4个展位
- 3个订单 + 2笔收款

### 重置数据库

```bash
# 重新初始化 (会清除所有本地数据)
npm run db:init:local
```

> **注意**: D1 本地数据存储在 `.wrangler/` 目录中。如果遇到 schema 问题, 可以删除该目录后重新初始化。

---

## 15. 数据库迁移操作指南

### 迁移文件规范

- **位置**: `migrations/` 目录
- **命名**: `YYYYMMDD-HHMM-变更说明.sql`
- **内容**: 仅限生产 DDL/DML, 需记录目的和回滚方案
- **原则**: 一个需求 = 一个 SQL 文件

### 创建新迁移

```bash
# 1. 创建迁移文件
touch migrations/20260416-0900-描述.sql

# 2. 编写 SQL (参考 db/templates/migration-template.sql)

# 3. 本地测试: 将 SQL 追加到 bootstrap 或手动执行

# 4. 应用到生产 D1:
npx wrangler d1 execute <your-d1-name> --file=migrations/20260416-0900-描述.sql
```

### 应用迁移到生产

```bash
# 查看当前 D1 数据库
npx wrangler d1 list

# 执行迁移 (生产)
npx wrangler d1 execute <your-d1-name> --file=migrations/XXXXXX.sql

# 执行迁移 (预览/远程)
npx wrangler d1 execute <your-d1-name> --file=migrations/XXXXXX.sql --remote
```

### 已执行的迁移历史

| 日期 | 文件 | 变更 |
|------|------|------|
| 2026-03-23 | erp-payment-sync | ProjectErpConfigs表; Payments加source/erp字段 |
| 2026-03-25 | login-rate-limit | LoginAttempts表 |
| 2026-03-31 | order-overpayment | OrderOverpaymentIssues表 |
| 2026-03-31 | staff-order-field-settings | Staff加display_order; ProjectOrderFieldSettings表 |
| 2026-04-01 | order-booth-changes | OrderBoothChanges表 |
| 2026-04-04 | staff-token-index | Staff加token_index |
| 2026-04-06 | booth-maps | BoothMaps/BoothMapItems表; Booths加map字段 |
| 2026-04-06 | booth-map-default-stroke | BoothMaps加default_stroke_width |
| 2026-04-06 | booth-map-display-config | BoothMaps加display_config_json |
| 2026-04-07 | write-rate-limit | WriteRateLimits表 |
| 2026-04-09 | performance-indexes | 添加多个查询索引 |
| 2026-04-09 | booth-locks | BoothLocks表 |
| 2026-04-11 | pending-orders-release | Orders加pending/release字段; ProjectOrderReleaseSettings表 |
| 2026-04-13 | agents | Agents表; Expenses加expense_type |

---

## 16. 部署与发布

### 自动部署

GitHub push → Cloudflare 自动构建并部署 Worker

### 手动部署

```bash
# 部署到生产
npm run deploy
# 等同于: npx wrangler deploy
```

### 部署检查清单

1. `npm run check` — 语法检查通过
2. `npm test` — 全部测试通过
3. `npm run dev -- --port 8788` — 本地功能验证
4. 确认 `wrangler.toml` 中的 D1/R2 绑定正确
5. 确认环境变量 (`JWT_SECRET`, `ERP_CONFIG_SECRET`) 已设置

---

## 17. GitHub 推送流程

### 标准工作流

```bash
# 1. 确认当前分支
git branch

# 2. 查看变更
git status
git diff

# 3. 语法检查 + 测试
npm run check && npm test

# 4. 暂存 + 提交
git add .
git commit -m "feat: 描述变更内容"

# 5. 推送
git push origin main
```

### 提交前检查清单 (参考 `docs/PRE-COMMIT-FINAL-CHECKLIST.md`)

- [ ] `npm run check` 通过
- [ ] `npm test` 全部通过
- [ ] 本地 `npm run dev` 功能验证
- [ ] 如有 DB 变更, 迁移文件已创建
- [ ] 如有 Tailwind 变更, 已运行 `npm run build:styles`
- [ ] 不含敏感信息 (密钥、Cookie)

---

## 18. 常用运维操作

### D1 数据库操作

```bash
# 列出所有 D1 数据库
npx wrangler d1 list

# 执行查询 (生产)
npx wrangler d1 execute <your-d1-name> --command="SELECT COUNT(*) FROM Orders"

# 执行查询 (本地)
npx wrangler d1 execute <your-d1-name> --command="SELECT * FROM Staff" --local

# 导出数据 (备份)
npx wrangler d1 export <your-d1-name> --output=backups/<your-d1-name>-$(date +%Y%m%d).sql

# 导入数据
npx wrangler d1 execute <your-d1-name> --file=backups/xxx.sql
```

### R2 存储操作

```bash
# 列出 R2 bucket 内容
npx wrangler r2 object list <your-r2-bucket>

# 上传文件
npx wrangler r2 object put <your-r2-bucket>/path/file.pdf --file=local-file.pdf

# 下载文件
npx wrangler r2 object get <your-r2-bucket>/path/file.pdf --file=output.pdf

# 删除文件
npx wrangler r2 object delete <your-r2-bucket>/path/file.pdf
```

### Worker 日志

```bash
# 实时查看 Worker 日志
npx wrangler tail

# 查看 Cron 执行日志
npx wrangler tail --format=json | grep scheduled
```

### Tailwind CSS 构建

```bash
# 编译样式
npm run build:styles
# 输出: public/assets/tailwind.css
```

---

## 19. 安全机制

| 机制 | 实现 |
|------|------|
| **密码哈希** | PBKDF2-SHA256 (100000次迭代) |
| **JWT** | HS256, 12小时过期, token_index 失效控制 |
| **登录保护** | 5次失败锁定15分钟 |
| **写入限流** | 60秒30次POST上限 |
| **请求体限制** | JSON 256KB / 合同 9MB / 底图 11MB |
| **CSP** | 限制脚本源 (self + cdnjs.cloudflare.com) |
| **CORS** | 动态源白名单 (ALLOWED_ORIGINS) |
| **ERP Cookie** | AES-GCM 加密存储 |
| **文件验证** | 扩展名 + MIME 类型双重检查 |
| **展位并发** | BoothLocks 30秒TTL + UUID token |
| **SQL 分块** | IN 语句80条分块, 批量更新40条分组 |

---

## 20. 已知约束与技术债务

### 技术约束

| 约束 | 说明 |
|------|------|
| **D1 不支持事务** | 使用分块 batch + 条件 SQL 模拟原子性 |
| **Workers 无状态** | 认证缓存仅限单次请求的30秒内 |
| **无 ORM** | 直接拼接 SQL, 需注意参数绑定防注入 |
| **前端无框架** | 全局状态 + DOM 操作, 维护成本随复杂度增长 |
| **单 Worker 实例** | 所有 API + 静态资源由同一个 Worker 处理 |
| **无文件版本管理** | R2 文件无版本控制, 覆盖不可回滚 |

### API 冻结规则

在重构期间以下内容不可变:
- 路由路径和 HTTP 方法
- 权限边界
- 错误码和消息文本
- 查询参数和 JSON 字段名

### 数据库命名约定

- 表名: PascalCase (`OrderBoothChanges`)
- 列名: snake_case (`paid_amount`)
- 时间字段: 东八区字符串 (`YYYY-MM-DD HH:MM:SS`)
- 软删除: `deleted_at` + `deleted_by`
- 布尔: INTEGER (0/1)
- 金额: REAL (2位小数)

### SQL 分块约定

| 操作 | 分块大小 | 原因 |
|------|---------|------|
| `WHERE IN (?)` 查询 | 80条 | D1 SQL 参数限制 |
| `batch()` 批量写入 | 40条 | D1 batch 大小限制 |
| 展位图保存 | 250个 items | API payload 大小限制 |

---

## 附录: 快速参考卡

### npm 脚本速查

```bash
npm run dev              # 本地开发 (本地 D1/R2)
npm run dev:preview      # 预览 (远程 D1/R2)
npm run dev:remote       # 远程测试
npm run check            # 语法检查
npm test                 # 运行测试
npm run build:styles     # 构建 Tailwind
npm run db:init:local    # 初始化本地DB
npm run deploy           # 部署生产
```

### 文件修改速查

| 要改什么 | 改哪里 |
|---------|--------|
| 新增 API 端点 | `src/routes/*.mjs` + `src/router.mjs` |
| 修改业务逻辑 | `src/services/*.mjs` |
| 修改前端 UI | `public/js/*.js` + `public/index.html` |
| 修改数据库 schema | 新建 `migrations/*.sql` |
| 修改样式 | `styles/tailwind.css` → `npm run build:styles` |
| 修改认证/授权 | `src/utils/auth.mjs` + `src/utils/crypto.mjs` |
| 修改请求/响应格式 | `src/utils/request.mjs` + `src/utils/response.mjs` |
| 修改 Worker 配置 | `wrangler.toml` |
| 修改 Cloudflare 绑定 | `wrangler.toml` + Cloudflare Dashboard |

### D1 表速查 (20张)

**核心业务**: Projects, Staff, Booths, Orders, Payments, Expenses, Agents  
**展位图**: BoothMaps, BoothMapItems, BoothLocks  
**配置**: Accounts, Industries, Prices, ProjectErpConfigs, ProjectOrderFieldSettings, ProjectOrderReleaseSettings  
**系统**: LoginAttempts, WriteRateLimits  
**审计**: OrderBoothChanges, OrderOverpaymentIssues
