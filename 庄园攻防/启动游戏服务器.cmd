@echo off
chcp 65001 >nul
setlocal
title 庄园攻防 - 游戏服务器

pushd "%~dp0"
if errorlevel 1 goto directory_error

where node >nul 2>&1
if errorlevel 1 goto node_error

node -e "require.resolve('ws')" >nul 2>&1
if errorlevel 1 (
    where npm >nul 2>&1
    if errorlevel 1 goto npm_error
    echo 正在安装游戏服务器依赖，请稍候……
    call npm install --omit=dev
    if errorlevel 1 goto install_error
)

if not defined PORT set "PORT=8787"
echo 正在启动庄园攻防游戏服务器……
echo 启动成功后，在浏览器打开：http://127.0.0.1:%PORT%
echo 局域网联机请使用下方服务器输出的局域网地址。
echo 请保持此窗口开启，按 Ctrl+C 或关闭窗口可停止服务器。
echo.
node server.js
set "SERVER_EXIT_CODE=%ERRORLEVEL%"
if not "%SERVER_EXIT_CODE%"=="0" (
    echo.
    echo 服务器启动失败或异常退出，请查看上方错误信息。
    echo 如果提示 EADDRINUSE，说明端口 %PORT% 已被占用。
)
popd
pause
exit /b %SERVER_EXIT_CODE%

:node_error
echo 未找到 Node.js。请先安装 Node.js LTS，安装完成后重新打开此脚本。
echo 下载地址：https://nodejs.org/
goto failure

:npm_error
echo 未找到 npm。请重新安装包含 npm 的 Node.js LTS 后再试。
goto failure

:install_error
echo 依赖安装失败，请检查上方错误信息和网络连接后重试。
goto failure

:directory_error
echo 无法进入游戏目录，请检查脚本所在路径是否可用。
pause
exit /b 1

:failure
popd
pause
exit /b 1
