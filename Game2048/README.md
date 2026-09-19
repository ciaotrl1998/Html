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

1. 用 Android Studio 打开本目录 `Game2048`
2. 等待 Gradle 同步完成
3. 菜单:`Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
4. 生成文件一般在:

`app/build/outputs/apk/debug/app-debug.apk`

把 APK 拷到手机安装后,桌面会多一个名为 **HTML游戏盒** 的图标。

## 工程说明

- 包名:`cn.linecode.game2048`
- 列表页:`MainActivity`,用系统目录选择器记住游戏目录
- 播放页:`GamePlayerActivity`,全屏 WebView 加载本地 HTML
