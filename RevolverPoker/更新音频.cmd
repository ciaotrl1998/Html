@echo off
setlocal
chcp 65001 >nul
title RevolverPoker - 更新音频
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 22 或更新版本，再双击本程序。
  pause
  exit /b 1
)

echo 正在将 client\assets\audio 中的音效更新到游戏……
node "%~dp0scripts\build-audio-bank.js"
set "audioExitCode=%errorlevel%"
if not "%audioExitCode%"=="0" (
  echo.
  echo 更新失败，请检查上方错误信息及 client\assets\audio 中的 WAV 文件。
  echo 修正后重新双击本程序即可。
  pause
  exit /b %audioExitCode%
)

echo.
echo 音频更新完成，已同步游戏音效和四段全下语音！
echo 已打开的游戏请刷新页面，无需重启服务器；仍是旧声音时可按 Ctrl+F5。
echo 手机版请重新打包并导入游戏盒。
pause
exit /b 0
