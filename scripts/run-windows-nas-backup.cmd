@echo off
setlocal
pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
  echo Cannot open script folder: %~dp0
  echo If the script is on a NAS path, copy it to C:\ExpoBackupTools first.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\pull-vps-backup-to-windows-nas.ps1" %*
set BACKUP_EXIT_CODE=%ERRORLEVEL%
popd
pause
exit /b %BACKUP_EXIT_CODE%
