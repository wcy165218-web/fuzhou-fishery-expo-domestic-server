# 福州渔博会展位销售与财务管理系统

> 当前代码线标记：**国内服务器版**。
>
> 该版本面向国内 VPS / 阿里云部署，生产运行形态为 **Node.js + SQLite + 本地文件存储 + PM2 + Nginx**。Cloudflare Workers、D1、R2 配置仍保留为迁移前版本、冻结旧入口和必要回滚参考，默认生产入口以 `https://expo.chinafife.com` 的 VPS 服务为准。

展会业务系统，覆盖项目配置、展位库、订单录入、收款与费用、代理商、展位图以及 ERP 收款同步等流程。

这个仓库更适合作为业务项目源码和协作文档使用，而不是对外开放的产品介绍页。如果要公开到 GitHub，建议先做一次仓库脱敏，避免把生产环境信息、运维信息和真实凭证一起暴露出去。

## 功能概览

- 项目、展位、价格、行业字典、收款账户等基础配置
- 订单录入、订单列表、付款进度、费用修正、超收处理
- 首页经营看板，支持按业务员、馆别等维度查看数据
- 展位图上传、编辑、展位状态联动
- 代理商信息维护与财务统计
- ERP 收款同步、去重、防超收、只读导入流水
- 定时释放超期待确认订单

## 技术架构

### 国内服务器版生产架构

- Runtime: Node.js
- Database: SQLite
- Storage: VPS 本地文件存储
- Process: PM2
- Web: Nginx + HTTPS

### Cloudflare 历史架构

- Runtime: Cloudflare Workers
- Database: Cloudflare D1
- Storage: Cloudflare R2
- Frontend: HTML + Tailwind CSS + Vanilla JavaScript
- Test: Node.js 内置脚本测试

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化本地测试库

```bash
npm run db:init:local
```

这一步会重建本地 D1 测试数据，供本地联调使用。`db/local/` 里的脚本仅用于本地测试，不应直接用于预览或生产环境。

### 3. 启动开发环境

```bash
npm run dev -- --port 8788
```

打开：

```text
http://127.0.0.1:8788
```

### 4. 基础检查

```bash
npm run check
npm test
```

## 常用命令

```bash
npm run build:styles      # 生成前端样式
npm run dev               # 本地 Wrangler 开发环境
npm run dev:preview       # 本地页面 + Cloudflare preview 资源
npm run dev:remote        # 远程联调
npm run deploy:cf         # 仅发布 Worker
npm run deploy:vps:check  # 检查 VPS 静态与 Node 服务发布配置
npm run deploy:vps:static # 仅同步静态资源到 VPS
npm run deploy:vps:server # 同步 Node 服务并重载 PM2
npm run backup:sqlite     # 在 Node/SQLite 服务器上备份数据库和文件存储
npm run deploy            # Worker + VPS 静态资源一起发布
```

`scripts/deploy-vps-static.sh` 和 `scripts/deploy-vps-server.sh` 支持在本地 `.deploy.vps.env` 里配置多台发布目标。新机器可先复制 `.deploy.vps.env.example`：

```bash
cp .deploy.vps.env.example .deploy.vps.env

VPS_DEPLOY_TARGETS="aliyun"
VPS_TARGET_ALIYUN_HOST=8.136.49.187
VPS_TARGET_ALIYUN_PORT=22
VPS_TARGET_ALIYUN_USER=admin
VPS_TARGET_ALIYUN_SSH_KEY=~/.ssh/id_ed25519_expo_vps
VPS_TARGET_ALIYUN_STATIC_PATH=/var/www/expo-static/
VPS_TARGET_ALIYUN_SERVER_PATH=/opt/expo-server
VPS_TARGET_ALIYUN_FILE_STORAGE_ROOT=/var/expo-files
VPS_TARGET_ALIYUN_BACKUP_PATH=/var/backups/expo-server
VPS_TARGET_ALIYUN_REMOTE_ENV_FILE=/opt/expo-server/.env.production
VPS_TARGET_ALIYUN_PM2_APP_NAME=expo-server
```

静态脚本会逐台检查和同步；远端没有 `rsync` 时会自动改用 tar 流同步。服务端脚本会同步 Node 文件、运行 `npm ci --omit=dev`，并通过 PM2 启动或重载 `expo-server`。

## 部署与配置

项目当前依赖以下 Cloudflare 绑定名：

- `DB`: D1 数据库
- `BUCKET`: R2 存储桶
- `ASSETS`: 静态资源

推荐流程：

1. 按 [wrangler.toml.example](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/wrangler.toml.example) 准备绑定配置。
2. 在 Cloudflare 上配置运行时密钥，例如 `JWT_SECRET`，以及 ERP 配置加密所需的 `ERP_CONFIG_SECRET`。
3. 如需限制跨域来源，可配置 `ALLOWED_ORIGINS`。
4. 正式数据库变更统一放在 [migrations/README.md](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/migrations/README.md) 对应的 `migrations/` 目录。

相关文档：

- [Cloudflare 一次性配置清单](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/docs/CLOUDFLARE-SETUP.md)
- [本地测试说明](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/docs/LOCAL-TESTING.md)
- [ERP 同步说明](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/docs/ERP-SYNC.md)
- [协作工作流](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/docs/WORKFLOW.md)
- [项目接管说明](/Users/wangchuanyi/Downloads/fuzhou-fishery-expo-main/docs/PROJECT-TAKEOVER.md)

## 目录结构

```text
.
├── _worker.js            # Worker 入口
├── src/
│   ├── routes/           # API 路由
│   ├── services/         # 业务服务
│   └── utils/            # 鉴权、请求、响应、加密等工具
├── public/               # 前端页面与静态资源
├── migrations/           # 正式 D1 迁移
├── db/local/             # 本地重置/测试 SQL
├── docs/                 # 项目说明与运维文档
└── tests/                # 回归测试
```

## 安全说明

公开的 `README` 或源码仓库本身，不会直接让别人“进入后台”。真正决定能不能访问后台的是部署后的系统地址、账号密码、JWT 签名密钥、数据库里的用户状态，以及你有没有把真实凭证提交进仓库。

当前代码里已经做了几层基础保护：

- 除 `/api/login` 外，其余 API 默认都要求携带 JWT
- JWT 依赖 `JWT_SECRET` 签名，服务端没有密钥就无法伪造合法登录态
- 改密码、改角色后会递增 `token_index`，旧 token 会失效
- 登录失败达到阈值后会临时锁定账号
- 响应里带了 CSP、`X-Frame-Options`、`nosniff` 等安全头
- CORS 可通过 `ALLOWED_ORIGINS` 收敛允许来源

真正需要重点保护的是：

- Cloudflare Secret，例如 `JWT_SECRET`、`ERP_CONFIG_SECRET`
- ERP 会话 Cookie / JSESSIONID
- 生产环境员工账号和密码
- VPS / SSH / 部署脚本中的真实服务器信息
- 数据库导出、备份文件、生产合同文件链接

如果任何公开可访问的环境仍在使用默认测试口令、共享管理员账号，或者仓库里曾提交过真实密钥，建议立即轮换密码和 Secret。

## 维护约定

- 生产数据库改动写入 `migrations/`
- 本地重置脚本写入 `db/local/`
- 新功能优先补充回归测试
- 对外公开仓库前，先检查 `README`、`docs/`、部署脚本和配置文件是否包含真实敏感信息
