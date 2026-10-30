@echo off
chcp 65001 >nul
title RevolverPoker - 打包手机版
pwsh -NoProfile -File "%~dp0scripts\package-mobile.ps1"
if errorlevel 1 echo 打包失败，请检查上方错误信息。
pause
