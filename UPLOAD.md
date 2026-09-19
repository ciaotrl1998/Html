# 上传到 GitHub 并云端打包 APK

## 一、需要上传什么

仓库根目录必须长这样(注意 `.github` 是隐藏目录):

```
<仓库根>/
  .github/
    workflows/
      build-apk.yml        <- 云端打包工作流
  Game2048/                <- Android 工程
    settings.gradle
    build.gradle
    gradle.properties
    gradle/wrapper/gradle-wrapper.properties
    app/...
```

关键点:工作流里写的是 `working-directory: Game2048`,
所以 `Game2048` 必须是**仓库根目录下的一级文件夹**,不能多套一层。

---

## 二、手机上最稳的方式:网页逐个新建文件

GitHub 网页新建文件时,文件名里可以带 `/`,会自动创建目录。

1. 手机浏览器打开 github.com,登录
2. 右上角 `+` → `New repository`
   - Repository name:例如 `html-game-box`
   - 选 `Public`(Actions 免费额度足够;Private 也行)
   - 勾选 `Add a README file`
   - `Create repository`
3. 进入仓库,点 `Add file` → `Create new file`
4. 在文件名框里粘贴完整路径,例如:
   `.github/workflows/build-apk.yml`
   然后粘贴内容,点 `Commit changes`
5. 重复第 3-4 步,把下面所有文件的路径逐条填进去:

**工作流(1 个)**
```
.github/workflows/build-apk.yml
```

**工程配置(4 个)**
```
Game2048/settings.gradle
Game2048/build.gradle
Game2048/gradle.properties
Game2048/gradle/wrapper/gradle-wrapper.properties
```

**app 模块(3 个)**
```
Game2048/app/build.gradle
Game2048/app/proguard-rules.pro
Game2048/app/src/main/AndroidManifest.xml
```

**Java 源码(5 个)**
```
Game2048/app/src/main/java/cn/linecode/game2048/GameEntry.java
Game2048/app/src/main/java/cn/linecode/game2048/GameListAdapter.java
Game2048/app/src/main/java/cn/linecode/game2048/GamePlayerActivity.java
Game2048/app/src/main/java/cn/linecode/game2048/HtmlGameScanner.java
Game2048/app/src/main/java/cn/linecode/game2048/MainActivity.java
```

**资源文件(7 个)**
```
Game2048/app/src/main/res/drawable/bg_game_card.xml
Game2048/app/src/main/res/drawable/bg_game_icon.xml
Game2048/app/src/main/res/drawable/ic_launcher.xml
Game2048/app/src/main/res/layout/activity_main.xml
Game2048/app/src/main/res/layout/item_game.xml
Game2048/app/src/main/res/values/colors.xml
Game2048/app/src/main/res/values/strings.xml
Game2048/app/src/main/res/values/themes.xml
```

**内置的游戏页(1 个)**
```
Game2048/app/src/main/assets/index.html
```

内容直接打开本机 `模拟器游戏/Game2048/` 下对应文件复制即可。

---

## 三、一次传整个目录:Termux + git(更快)

如果嫌逐个建文件麻烦,用 Termux 一次把整个目录 push 上去:

```bash
pkg update && pkg upgrade -y
pkg install git -y

cd /storage/emulated/0/模拟器游戏

git init
git branch -M main
git add .
git commit -m "init html game box"

git remote add origin https://github.com/<你的用户名>/<仓库名>.git

# 需要凭据时,用户名填 GitHub 用户名,密码填 Personal Access Token
git push -u origin main
```

Token 获取:GitHub 网页 → 头像 → `Settings` → `Developer settings`
→ `Personal access tokens` → `Tokens (classic)` → `Generate new token (classic)`
→ 勾选 `repo` 和 `workflow` 两个权限 → 生成后复制保存(只显示一次)。

注意:上传前建议确认 `git add .` 有把 `.github` 和 `Game2048` 都加进去,
可用 `git status` 检查。

---

## 四、触发打包并下载

1. 文件都上传后,进入仓库 `Actions` 页
2. 左侧选 `Build APK`
3. 右侧 `Run workflow` → 绿色按钮确认
4. 等 2-5 分钟,出现绿色对勾表示成功
5. 点进这次运行,页面底部 `Artifacts` 里下载 `html-game-box-debug-apk`
6. 下载的是 zip,解压得到 `app-debug.apk`
7. 把 apk 传到手机,点开安装(首次需允许「安装未知应用」)

---

## 五、常见问题

- **Actions 里看不到工作流**:确认文件路径是 `.github/workflows/build-apk.yml`,
  且默认分支名和 workflow 里的 `branches` 一致(main 或 master)。
- **打包报 SDK 相关错误**:GitHub 的 ubuntu runner 预装了 Android SDK 且已接受许可,
  一般不会出错;若报错,看日志里的具体 SDK 组件名再补。
- **安装被拦截**:在系统设置里给文件管理器/浏览器开启「允许安装未知应用」。
- **想改游戏列表默认目录**:改 `MainActivity.java` 里的默认提示逻辑即可。
