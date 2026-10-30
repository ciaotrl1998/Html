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
call npm.cmd start
set "gameExitCode=%errorlevel%"
pause
exit /b %gameExitCode%
