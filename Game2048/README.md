# HTML 游戏盒

点桌面图标打开游戏列表,选择一个目录后自动扫描其中的 `.html` / `.htm` 游戏,点一项即可全屏启动。不经过系统浏览器,避免上下滑手势抢走操作。

## 使用

1. 安装并打开 **HTML游戏盒**
2. 点右上角 **选择游戏目录**
3. 选中存放 HTML 小游戏的文件夹,例如 `/storage/emulated/0/模拟器游戏`
4. 列表会显示该目录及最多 3 层子目录里的 HTML
5. 点游戏名全屏进入;返回键退出当前游戏,回到列表
6. **刷新** 可重新扫描目录

本 App 是纯本地启动器,不含任何内置游戏。

## 一键建立游戏服务器（2.4）

首页刷新按钮左侧新增 **建立服务器** 按钮，图标使用工程目录中的 `serve.png`。

1. 在首页正常选择 HTML 游戏目录，例如 `/storage/emulated/0/html`。
2. 点击 **建立服务器**。App 直接扫描这个已选目录及子文件夹，显示可用服务的游戏名称竖列；不需要再次选择目录。
3. 选择游戏，App 使用 APK 内置的 Node.js Mobile 在独立前台服务进程中启动该文件夹的入口。
4. 检测到实际 HTTP/HTTPS 监听成功后，显示“游戏名联机服务已启动”、本机与局域网地址。每个地址右侧都有 **复制** 按钮，复制包含端口的完整 URL。
5. 点击 **进入游戏**，在 App 内以本机服务器地址打开。另一台同 Wi-Fi／热点下的设备打开复制的局域网地址即可。
6. 返回首页、退出播放页或关闭地址弹窗不会停止服务器。可以在地址弹窗或常驻通知中点击 **停止服务器**；之后可重新启动或选择其他游戏。

游戏列表来自手机目录扫描，不是写死的古坊奇谭列表。会自动识别：

- `server.js`、`server.cjs`、`server.mjs`；
- `package.json` 的 `scripts.start`，如 `node backend.js`、`PORT=3000 node "src/my server.cjs"`、`node .`；
- 自定义 `htmlbox-server.json`，用于服务名、其他入口、参数和环境变量。

例：

```text
html/                         ← 首页所选目录
  2048.html
  古坊奇谭/
    index.html
    server.js                 ← 自动出现在服务器列表
    js/
    css/
  另一款游戏/
    index.html
    package.json              ← scripts.start = "node backend.cjs"
    backend.cjs
    node_modules/             ← 这款游戏需要的其他依赖
```

APK 内置 Node.js Mobile 18.20.4 与纯 JavaScript `ws`，因此古坊奇谭这类只依赖 Node 内置模块与 `ws` 的服务不需要安装 Termux。其他 Node 服务需要把自己的依赖放在同目录的 `node_modules` 中；依赖应能在 Android 的 Node.js Mobile 上运行，Windows 原生扩展、依赖子进程的 npm 开发服务器以及 Python／Java 服务不属于此运行时。

单个 HTML 文件并不等于服务器程序：列表只展示有实际可运行入口的文件夹。端口来自真实监听结果，端口占用、缺少依赖或入口异常会显示启动失败，避免出现假的“已启动”地址。只监听 `127.0.0.1` 的服务会标明仅能本机访问；要让队友连接，需要服务监听 `0.0.0.0` 或 `::`。

可选配置文件 `htmlbox-server.json` 示例：

```json
{
  "name": "我的联机游戏",
  "entry": "backend/server.cjs",
  "port": 8787,
  "args": ["--game", "coop"],
  "env": { "HOST": "0.0.0.0" }
}
```

`port` 会作为 `PORT` 环境变量传给服务，代码中固定写死的端口仍以实际监听为准。App 同时运行一个服务，停止后可切换其他游戏。

## 复制与粘贴

2.4 版使用 Android 系统 `ClipboardManager`：地址弹窗支持直接复制；WebView 提供 `navigator.clipboard.writeText()`／`readText()`，本地 HTML 与普通局域网页面都可使用。HTML 输入框恢复系统长按菜单，可以粘贴房号或地址、选择和复制文字。

Android 没有供普通应用申请的 `READ_CLIPBOARD`／`WRITE_CLIPBOARD` 权限，不需要额外剪贴板授权；读取遵循系统的前台应用限制。前台服务器另声明网络、前台服务、通知与唤醒锁权限，以便切换游戏界面后继续运行。

## 联机 HTML 游戏

2.3 版开始允许 WebView 使用网络和 Wi-Fi 状态，以支持 WebSocket、WebRTC DataChannel
及普通网页联机。游戏仍可从本地 `file://` 地址运行；局域网游戏使用的 `http://`、
`ws://` 地址也允许加载。

对于使用二维码配对的游戏，播放器会处理 HTML 的 `<input type="file">`：

- 带 `capture` 的图片输入会直接打开系统相机；
- 普通图片输入会打开系统图片选择器，并同时提供拍照入口；
- 相机照片只写入应用缓存，通过临时 `content://` 地址交给当前游戏读取。

联机能力由手机上的“Android System WebView”提供。安装新版 APK 后如仍提示浏览器不支持
WebRTC，请在应用商店更新 Android System WebView 或 Chrome。修改清单权限后必须重新安装
2.3 版 APK，旧 APK 不会自动获得新增网络权限。

## 建议的游戏目录结构

```
模拟器游戏/
  2048.html
  其他游戏.html
  某游戏文件夹/
    index.html
```

单文件 HTML 最稳妥。如果游戏还依赖同目录的 js/css/图片,请尽量放在同一文件夹,启动器会优先用真实文件路径打开。

## 用 Android Studio 打包 APK

### 2.4.1 安装包体积优化

默认只构建 `arm64-v8a` 手机安装包，并对 APK 内的 Node.js 原生库启用压缩，避免一个 APK 同时携带三份运行时。服务器和剪贴板功能使用同一套源码。

本机 Debug 构建实测：原通用包为 `157,004,016` 字节，2.4.1 ARM64 压缩包为 `20,892,083` 字节，约从 157.0 MB 降到 20.9 MB，下载体积减少 86.7%（MB 按十进制计算）。

GitHub 的下载产物 `html-game-box-debug-apk` 是 ARM64 手机包。模拟器测试单独使用 `-PhtmlboxAbi=x86_64`，输出到 `app/build-x86_64/`，不会覆盖手机 APK。需要构建旧式 ARM32 设备时可以使用 `-PhtmlboxAbi=armeabi-v7a`，输出到 `app/build-armeabi-v7a/`。

原生库在安装时解压，APK 下载体积的缩小幅度不等于安装后占用的缩小幅度。

1. 用 Android Studio 打开本目录 `Game2048`
2. 等待 Gradle 同步完成
3. 首次在 `Game2048/server-runtime` 执行 `npm ci --omit=optional --ignore-scripts`，然后在 `Game2048` 执行 `node scripts/prepare-server-runtime.js`；SDK 中安装 NDK `26.1.10909125` 与 CMake `3.22.1`。
4. 菜单:`Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
5. 生成文件一般在:

`app/build/outputs/apk/debug/app-debug.apk`

把 APK 拷到手机安装后,桌面会多一个名为 **HTML游戏盒** 的图标。

## 工程说明

- 包名:`cn.linecode.game2048`
- 列表页:`MainActivity`,用系统目录选择器记住游戏目录
- 播放页:`GamePlayerActivity`,全屏 WebView 加载本地 HTML
- 服务扫描:`ServerScanner`,递归扫描首页已选游戏目录
- 服务器:`GameServerService`,在独立 `:game_server` 进程中运行 Node.js Mobile
- 地址弹窗:`ServerUiController`,复制 URL、进入游戏与停止服务
- 剪贴板:`GameClipboard` 与 `server-runtime/clipboard.js`

GitHub Actions 已加入运行时下载、依赖准备、压缩 ARM64 手机包构建与独立 x86_64 Android 模拟器回归。构建不需要打包具体游戏源码；把 `Game2048/serve.png` 和本目录的新源码一同提交即可。
