# 国内服务器发布工作流

这条流程用于国内 VPS 生产环境。目标是让三件事保持一致：

```text
本地 domestic-server-main
= github-domestic/main
= 服务器 /opt/expo-server 当前部署代码
```

## 1. 分支职责

- `main`：本地稳定主线，用于沉淀已确认稳定的业务代码。
- `domestic-server-main`：国内服务器生产线，跟踪 `github-domestic/main`。
- `codex/*`：临时开发分支，完成后合回对应主线。

生产服务器相关修改默认从 `domestic-server-main` 开始。

## 2. 标准上线流程

### 2.1 准备生产线

```bash
git switch domestic-server-main
git pull github-domestic main
git status
```

`git status` 必须干净。

### 2.2 建临时开发分支

```bash
git switch -c codex/your-change-name
```

完成修改后先本地检查：

```bash
npm run check
npm test
```

提交：

```bash
git add .
git commit -m "fix: describe the production change"
```

### 2.3 合回生产线

```bash
git switch domestic-server-main
git merge codex/your-change-name
```

### 2.4 用固定脚本上线

上线前只检查，不推送、不部署：

```bash
npm run release:domestic:check
```

确认通过后执行正式上线：

```bash
npm run release:domestic:deploy
```

这个命令会依次执行：

1. 确认当前在 `domestic-server-main`。
2. 确认工作区干净。
3. 拉取并比较 `github-domestic/main`。
4. 执行 `npm run check`。
5. 执行 `npm test`。
6. 推送当前提交到 `github-domestic/main`。
7. 执行 `npm run deploy:vps:check`。
8. 执行 `npm run deploy:vps:static`。
9. 执行 `npm run deploy:vps:server`。
10. 在服务器 `/opt/expo-server/REVISION` 写入本次部署 commit。

## 3. 上线后确认

```bash
npm run release:domestic:verify
```

这个命令会比较本地 `domestic-server-main`、`github-domestic/main`，并读取服务器：

```text
/opt/expo-server/REVISION
```

里面的 `revision=` 应该等于：

```bash
git rev-parse domestic-server-main
```

## 4. 同步回本地稳定主线

生产上线后，如果确认稳定，再同步回 `main`：

```bash
git switch main
git merge domestic-server-main
git push origin main
```

如果只想同步某几个提交，用：

```bash
git switch main
git cherry-pick <commit-id>
git push origin main
```

## 5. 回退原则

代码回退优先用 Git：

```bash
git switch domestic-server-main
git revert <bad-commit-id>
npm run release:domestic:deploy
```

数据库或上传文件出问题，优先使用部署前备份。服务端部署脚本会在部署前自动执行 SQLite 和文件存储备份，备份目录默认是：

```text
/var/backups/expo-server
```

更完整的备份和恢复说明见：

```text
docs/BACKUP-AND-RECOVERY.md
docs/WINDOWS-NAS-BACKUP.md
```

## 6. 禁止事项

- 不在服务器上直接手改 `/opt/expo-server` 里的源码。
- 不在工作区有未提交改动时部署。
- 不绕过 `domestic-server-main` 直接把本地 `main` 部署到生产。
- 不把生产 `.env.production`、SQLite 数据库、备份文件提交进 Git。
