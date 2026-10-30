@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新版本。
  pause
  exit /b 1
)
if not exist "node_modules\three\build\three.module.js" (
  call npm.cmd ci --cache .cache\npm
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server/ensure-editor.js
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:3090/editor"
if errorlevel 1 (
  echo 无法自动打开浏览器，请手动访问 http://127.0.0.1:3090/editor
  pause
  exit /b 1
)
exit /b 0
