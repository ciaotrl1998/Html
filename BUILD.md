# 打包 APK 的几种方式

本工程没有附带 Gradle Wrapper 的二进制文件(`gradle-wrapper.jar` 是二进制,无法用文本方式生成),
所以下面给了几条不依赖本机 Wrapper 的路径。

## 方案一:云端自动打包(手机就能完成,推荐)

不用电脑,靠 GitHub Actions 在云端编译。已在仓库加入工作流:
`.github/workflows/build-apk.yml`

步骤:

1. 在 GitHub 新建一个仓库(网页版即可,不需要电脑)
2. 把 `模拟器游戏` 目录整体上传到仓库,确保包含:
   - `Game2048/`
   - `.github/workflows/build-apk.yml`
3. 上传后进入仓库的 `Actions` 页
4. 选 `Build APK` → `Run workflow`
5. 跑完点进这次运行,在页面底部 `Artifacts` 下载 `html-game-box-debug-apk`
6. 解压得到 `app-debug.apk`,传到手机安装

推送代码触发(可选,手机上用 Termux 也能做):

```bash
git init
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git add .
git commit -m "init"
git push -u origin main
```

## 方案二:电脑上的 Android Studio

1. Android Studio 打开 `Game2048` 目录
2. 首次会提示同步,同意后自动补全 Gradle Wrapper
3. `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
4. 产物在 `Game2048/app/build/outputs/apk/debug/app-debug.apk`

## 方案三:手机上的 Termux 本机编译

可行但不轻松,主要卡点是 SDK 的 `aapt2` 是针对 Linux x86_64 编译的,
在 Android arm64 上不能直接执行,通常需要额外绕行手段,且占用空间较大(约 2-3 GB)。

大致流程(仅供参考,未在本环境验证):

```bash
pkg update && pkg upgrade
pkg install openjdk-17 gradle git unzip
# 下载 Android commandline-tools,然后用 sdkmanager 装:
#   platforms;android-34   build-tools;34.0.0   platform-tools
# 再设置 ANDROID_HOME / ANDROID_SDK_ROOT
cd Game2048
gradle assembleDebug
```

注意:如果 `aapt2` 报架构不兼容,需要自行寻找 arm64 可用的 `aapt2` 替代,
这部分属于 Termux 环境的已知坑,不是本工程能解决的。

## 方案四:手机上的 Android IDE 类应用

例如 AIDE 这类可以在手机上直接编译 Android 工程的应用。
优点是界面友好,缺点是对较新的 AGP / AndroidX 支持有限,
本工程用的是 AGP 8.2.2 + AndroidX,可能需要降级配置才能通过,不一定一次成功。

## 结论

- 想省事、且接受用 GitHub:走 **方案一**
- 有电脑:走 **方案二**,最稳
- 只想用手机、不想依赖外网平台:可以试 **方案三**,但要接受折腾
