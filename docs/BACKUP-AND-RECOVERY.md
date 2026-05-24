# 备份、回滚与恢复 SOP

## 0. 国内服务器 SQLite 备份

国内服务器发布脚本会在部署前自动执行 `/opt/expo-server/scripts/backup-sqlite.sh`，默认备份目录为 `/var/backups/expo-server`。

可在本机部署配置文件 `~/.config/fuzhou-fishery-expo/deploy.vps.env` 中调整备份保留策略：

```bash
# 保留 7 天内备份，同时至少保留最近 3 份
VPS_BACKUP_RETENTION_DAYS=7
VPS_BACKUP_RETENTION_MIN_COUNT=3

# 备份目录总量超过 4096 MB 时，从最旧备份开始清理；0 表示不启用容量上限
VPS_BACKUP_MAX_TOTAL_MB=4096

# 默认仍备份上传文件；空间紧张且已有 NAS/对象存储副本时，可设为 0 只备份 SQLite
VPS_BACKUP_FILE_STORAGE=1
```

`VPS_BACKUP_FILE_STORAGE=0` 时仍会生成一个空的 `expo-files.tar.gz` 兼容恢复流程，但该备份不包含 `/var/expo-files` 上传文件。启用前必须确认文件存储已有其他可靠副本。

## 1. D1 数据库备份

### 1.1 手动备份（推荐在高风险操作前执行）

```bash
# 导出数据库到本地 SQL 文件
npx wrangler d1 export <your-d1-name> --output=backup-$(date +%Y%m%d-%H%M).sql
```

### 1.2 Cloudflare 自动快照

D1 提供自动时间点恢复（Time Travel），可回溯至过去 30 天内的任意秒级时间点。

```bash
# 查看可用的书签
npx wrangler d1 time-travel info <your-d1-name>

# 恢复到指定时间点（谨慎操作）
npx wrangler d1 time-travel restore <your-d1-name> --timestamp=2026-04-09T10:00:00Z
```

### 1.3 定期备份建议

| 场景 | 频率 | 方式 |
|------|------|------|
| 日常 | Cloudflare 自动 | Time Travel（30 天） |
| 大批量数据变更前 | 手动 | `wrangler d1 export` |
| 跑迁移脚本前 | 手动 | `wrangler d1 export` |

## 2. R2 存储备份

R2 存放合同 PDF 和展位图底图。

```bash
# 列出 bucket 内所有对象
npx wrangler r2 object list <your-r2-bucket>

# 下载单个文件
npx wrangler r2 object get <your-r2-bucket>/<key> --file=<local-path>
```

**建议**：重要合同文件在上传后，由业务侧保留本地副本。R2 目前无自动版本控制。

## 3. Worker 代码回滚

### 3.1 使用 Cloudflare 控制台

Cloudflare 控制台 → Workers & Pages → `<your-worker-name>` → Deployments → 选择历史版本 → Rollback

每次 `wrangler deploy` 会生成一个 deployment，控制台可一键回退。

### 3.2 使用 Git + 重新部署

```bash
# 回退到上一个已知正常的 commit
git log --oneline -10
git checkout <good-commit-hash>
npx wrangler deploy
```

## 4. 数据库迁移回滚

`migrations/` 目录下的迁移脚本是正式增量迁移，**没有自动回滚脚本**。

本地测试重置脚本位于 `db/local/`，不属于正式迁移链路，不能直接拿去当生产迁移执行。

### 回滚策略

1. **迁移前**：用 `wrangler d1 export` 备份当前数据库。
2. **迁移失败**：用 Time Travel 或备份文件恢复。
3. **手动回滚**：编写反向 SQL 并手动执行。

```bash
# 恢复备份文件
npx wrangler d1 execute <your-d1-name> --file=backup-20260409-1000.sql
```

## 5. 灾难恢复场景

### 5.1 CDN 不可用（Tailwind / JSZip）

**影响**：UI 样式丢失或导出功能不可用。数据接口不受影响。

**应急**：
- Tailwind CDN 是开发模式 JIT，后续应迁移为构建产物。
- JSZip 可下载到 `public/js/vendor/` 作为本地备份。

### 5.2 D1 数据丢失或损坏

1. 优先使用 Time Travel 恢复到最近正常时间点。
2. 若超出 30 天窗口，使用最近的手动备份 SQL 文件恢复。

### 5.3 R2 文件丢失

无自动恢复机制。依赖业务侧的本地文件副本。

## 6. 高风险操作检查清单

执行以下操作前，**必须先备份**：

- [ ] 执行新的迁移脚本（`wrangler d1 execute --file=migrations/...`）
- [ ] 批量删除或更新数据
- [ ] ERP 同步首次运行
- [ ] 清除项目数据（`clear-project-rollout-data`）
- [ ] 修改 Worker 绑定配置（`wrangler.toml`）
