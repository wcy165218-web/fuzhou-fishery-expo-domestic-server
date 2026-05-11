# Windows + NAS 自动备份说明

这个备份方案适合当前的国内服务器版：

- VPS 上运行 Node.js + SQLite。
- 数据库在 `/opt/expo-server/data/exhibition.sqlite`。
- 合同 PDF、展位图图片、上传文件在 `/var/expo-files`。
- VPS 每次会先生成完整备份，再由 Windows 公司电脑下载到 NAS。

## 备份里有什么

每次成功后，NAS 会多一个按时间命名的文件夹，例如：

```text
Z:\ExpoBackups\fuzhou-fishery-expo\20260511-233000\
  exhibition.sqlite
  expo-files.tar.gz
  manifest.txt
  backup.log
```

- `exhibition.sqlite`：订单、展位、展位图配置、收款、项目、账号等数据库数据。
- `expo-files.tar.gz`：合同 PDF、展位图图片、上传文件。
- `manifest.txt`：本次备份的摘要，里面应有 `sqlite_integrity=ok`。
- `backup.log`：VPS 备份过程日志。

## 第一次准备

### 1. 确认 NAS 盘符

在 Windows 文件资源管理器里确认 NAS 已经映射成固定盘符，例如：

```text
Z:
```

建议备份目录：

```text
Z:\ExpoBackups\fuzhou-fishery-expo
```

如果你的 NAS 不是 `Z:`，后面运行脚本时把路径改成你的实际盘符。

如果后面要用「任务计划程序」并勾选「不管用户是否登录都要运行」，更推荐使用 NAS 的 UNC 路径，而不是映射盘符。例如：

```text
\\NAS名称\共享文件夹\ExpoBackups\fuzhou-fishery-expo
```

原因是 Windows 的定时任务有时看不到 `Z:` 这种登录后才映射出来的盘符。

### 2. 准备 SSH key

Windows 电脑需要能用 SSH key 登录 VPS。

默认脚本会找这个文件：

```text
C:\Users\你的Windows用户名\.ssh\id_ed25519_expo_vps
```

如果你的 key 放在别的位置，运行脚本时要传 `-KeyPath`。

### 3. 复制脚本到 Windows

把这两个文件复制到 Windows 同一个文件夹里，例如：

```text
C:\ExpoBackupTools\
  pull-vps-backup-to-windows-nas.ps1
  run-windows-nas-backup.cmd
```

文件来自本仓库：

```text
scripts\pull-vps-backup-to-windows-nas.ps1
scripts\run-windows-nas-backup.cmd
```

## 手动测试

双击：

```text
run-windows-nas-backup.cmd
```

如果你的 NAS 不是 `Z:`，不要双击，改用 PowerShell 运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ExpoBackupTools\pull-vps-backup-to-windows-nas.ps1" -NasRoot "你的NAS盘符:\ExpoBackups\fuzhou-fishery-expo"
```

成功后检查 NAS 目录里是否出现新的时间文件夹。

## 设置每天自动备份

1. 打开 Windows「任务计划程序」。
2. 点击「创建基本任务」。
3. 名称填写：`展会系统 VPS 备份到 NAS`。
4. 触发器选择：每天。
5. 时间建议：晚上 23:30。
6. 操作选择：启动程序。
7. 程序或脚本填写：

```text
powershell.exe
```

8. 添加参数填写：

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\ExpoBackupTools\pull-vps-backup-to-windows-nas.ps1" -NasRoot "Z:\ExpoBackups\fuzhou-fishery-expo"
```

如果任务计划程序要在用户未登录时运行，建议把 `Z:\...` 改成你的 NAS UNC 路径，例如：

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\ExpoBackupTools\pull-vps-backup-to-windows-nas.ps1" -NasRoot "\\NAS名称\共享文件夹\ExpoBackups\fuzhou-fishery-expo"
```

9. 完成后，右键这个任务，选择「属性」：
   - 勾选「不管用户是否登录都要运行」。
   - 勾选「错过计划启动后尽快运行」。
   - 条件里可以勾选「只有在网络可用时才启动」。

## 常见问题

### 1. NAS 没有新增文件夹

先看日志：

```text
Z:\ExpoBackups\fuzhou-fishery-expo\_logs\
```

每次运行都会生成一个日志文件。

### 2. 提示找不到 SSH key

把 key 放到：

```text
C:\Users\你的Windows用户名\.ssh\id_ed25519_expo_vps
```

或者运行时传实际路径：

```powershell
-KeyPath "D:\keys\id_ed25519_expo_vps"
```

### 3. 提示找不到 ssh 或 scp

Windows 10/11 通常自带 OpenSSH。若没有，在「设置」里安装「OpenSSH Client」。

### 4. 备份会不会删生产数据

不会。脚本只做三件事：

1. 让 VPS 生成备份。
2. 把最新备份下载到 NAS。
3. 删除 NAS 上超过保留天数的旧备份文件夹。

默认只清理 NAS 上超过 90 天、且名字像 `20260511-233000` 的备份目录。
