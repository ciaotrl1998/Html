@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or later is required. Install Node.js, then try again.
  pause
  exit /b 1
)
if not exist "node_modules\three\build\three.module.js" (
  echo Installing game dependencies...
  call npm.cmd ci --cache .cache\npm
  if errorlevel 1 (
    echo Installation failed. Check your connection, then try again.
    pause
    exit /b 1
  )
)
title RevolverPoker - 游戏服务器
echo 游戏服务将在此 CMD 窗口运行，请保持窗口开启。
echo 启动成功后，直接双击同目录的 index.html 进入游戏。
echo 按 Ctrl+C 或关闭此窗口可停止服务器。
node server/index.js
set "gameExitCode=%errorlevel%"
pause
exit /b %gameExitCode%
