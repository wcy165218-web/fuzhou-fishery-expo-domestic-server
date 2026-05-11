@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0pull-vps-backup-to-windows-nas.ps1" %*
pause
