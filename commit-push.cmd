@echo off
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0commit-push.ps1" %*
