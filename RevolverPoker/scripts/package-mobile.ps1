#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$pokerRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $PSScriptRoot 'sync-client-vendor.js')
if ($LASTEXITCODE -ne 0) { throw '同步游戏引擎失败，请先在项目目录执行 npm ci。' }

$pokerCache = [System.IO.Path]::GetFullPath((Join-Path $pokerRoot '.cache'))
$pokerTemporary = Join-Path $pokerCache ('mobile-package-' + [guid]::NewGuid().ToString('N'))
$pokerStaging = Join-Path $pokerTemporary 'RevolverPoker'
$pokerArchive = Join-Path $pokerCache 'RevolverPoker-mobile.zip'
New-Item -ItemType Directory -Path $pokerStaging -Force | Out-Null
try {
    foreach ($pokerPart in @('client', 'server', 'shared', 'scripts', 'index.html', 'package.json', 'package-lock.json', 'README.md', '启动游戏.cmd', '打开场景编辑器.cmd', '打包手机版.cmd')) {
        Copy-Item -LiteralPath (Join-Path $pokerRoot $pokerPart) -Destination $pokerStaging -Recurse
    }
    New-Item -ItemType Directory -Path (Join-Path $pokerStaging 'node_modules') | Out-Null
    Copy-Item -LiteralPath (Join-Path $pokerRoot 'node_modules/ws') -Destination (Join-Path $pokerStaging 'node_modules') -Recurse
    $pokerTemporaryZip = Join-Path $pokerTemporary 'mobile.zip'
    Compress-Archive -LiteralPath $pokerStaging -DestinationPath $pokerTemporaryZip

    # Validate the actual ZIP, including an exact match with the editor save.
    $pokerZip = [System.IO.Compression.ZipFile]::OpenRead($pokerTemporaryZip)
    try {
        foreach ($pokerRequired in @('index.html', 'client/scene.js', 'client/scene-layout.js', 'client/boot.js', 'client/frame-clock.js', 'client/render-budget.js', 'client/mesh-batching.js', 'client/chip-slider.js', 'client/bet-sizing.js', 'client/card-artwork.js', 'client/assets/cards/back.png', 'client/assets/cards/display.png', 'client/assets/cards/manifest.json', 'client/vendor/BufferGeometryUtils.js', 'client/vendor/three.module.min.js', 'client/vendor/three.core.min.js', 'client/vendor/THREE-LICENSE.txt', 'server/index.js', 'node_modules/ws/package.json')) {
            if (-not $pokerZip.GetEntry('RevolverPoker/' + $pokerRequired)) { throw ('游戏包缺少文件：' + $pokerRequired) }
        }
        foreach ($pokerCard in 0..51) {
            $pokerCardName = 'RevolverPoker/client/assets/cards/{0:D2}.png' -f $pokerCard
            if (-not $pokerZip.GetEntry($pokerCardName)) { throw ('游戏包缺少固定牌面：' + $pokerCardName) }
        }
        $pokerLayoutStream = $pokerZip.GetEntry('RevolverPoker/client/scene-layout.js').Open()
        try { $pokerPackedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($pokerLayoutStream)) }
        finally { $pokerLayoutStream.Dispose() }
        $pokerCurrentHash = (Get-FileHash -LiteralPath (Join-Path $pokerRoot 'client/scene-layout.js') -Algorithm SHA256).Hash
        if ($pokerPackedHash -ne $pokerCurrentHash) { throw '打包期间场景发生了变化，请保存后重新打包。' }
    }
    finally { $pokerZip.Dispose() }
    Move-Item -LiteralPath $pokerTemporaryZip -Destination $pokerArchive -Force
    Write-Host ('已生成手机游戏包（已核对保存的场景）：' + $pokerArchive)
}
finally {
    # Only remove the unique staging directory created by this invocation.
    $pokerResolvedTemporary = [System.IO.Path]::GetFullPath($pokerTemporary)
    if ([System.IO.Path]::GetDirectoryName($pokerResolvedTemporary) -ne $pokerCache -or
        -not [System.IO.Path]::GetFileName($pokerResolvedTemporary).StartsWith('mobile-package-')) {
        throw '临时目录不在预期缓存目录内，已取消清理。'
    }
    Remove-Item -LiteralPath $pokerResolvedTemporary -Recurse -Force
}
