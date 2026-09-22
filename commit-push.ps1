# 提交并推送当前仓库的所有改动
# 用法:
#   .\commit-push.ps1 "提交说明"
#   不传说明时使用时间戳作为默认说明
param([string]$Message = "")

Set-Location -LiteralPath $PSScriptRoot

$changes = git status --porcelain
if ($LASTEXITCODE -ne 0) { Write-Error "git status 失败"; exit 1 }
if (-not $changes) {
  Write-Host "没有需要提交的改动。"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "更新 " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
}

git add -A
if ($LASTEXITCODE -ne 0) { Write-Error "git add 失败"; exit 1 }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Error "git commit 失败"; exit 1 }

git push
if ($LASTEXITCODE -ne 0) { Write-Error "git push 失败"; exit 1 }

Write-Host "已提交并推送: $Message"
