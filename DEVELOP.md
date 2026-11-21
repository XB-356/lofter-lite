# LOFTER Lite · 开发说明

给想改代码、自己打包的人。用户向的说明见 [README.md](README.md)。

**没有依赖、没有构建步骤、没有 `npm install`**，Node.js ≥ 20。

动手前请先读 [`AGENTS.md`](AGENTS.md)：约定和已知坑都在那里，能省掉很多返工。

## 命令

```bash
npm run dev            # 真实上游 + 改文件自动重启
npm run dev:mock       # 本地假数据，完全离线，改 UI 首选
npm run dev:lan        # 监听 0.0.0.0，手机连同一 WiFi 直接看
npm test               # 离线测试（随机端口，不碰真实接口）
npm run test:live      # 真实上游联调，联网时手动跑
npm run verify         # check + test，提交前跑这个
npm run cache:clear    # 清 data/cache 与 data/cache-mock
npm run desktop        # Windows 桌面启动器（点两下起测试端）
npm run apk            # 打 APK；`npm run apk -- -Debug` 出可调试包
npm run device -- status|install|webviews|inspect|logcat|shot|connect
```

调试开关（详细表格见 AGENTS.md）：`PORT` / `HOST`、`LOFTER_LITE_MOCK=1`、`MOCK_FAIL=1`、`MOCK_EMPTY=1`、`MOCK_DELAY=800`、`LOFTER_LITE_CACHE_DIR`。mock 模式的图片是服务端现生成的 SVG；假数据里故意混了空条目、AI 标签、付费内容与脏 HTML，用来验证过滤和清洗。

## 结构

```
server.js              路由 + 静态服务（mock 模式还负责占位图）
lib/lofter.js          上游请求、限速、字段归一化、HTML 清洗
lib/cache.js           内存 + 磁盘两级缓存
lib/catalog.js         发现页分类与默认标签
public/app.js          全部前端逻辑（原生 JS，无框架无打包）
public/native-api.js   APK 专用桥接，网页版不生效
dev/                   mock 假数据层（导出与 lib/lofter.js 一致）
scripts/               启动器 / 自检 / 清缓存 / 真机联调
desktop/               Windows 桌面启动器（C# 5 + 系统自带 csc.exe）
android/               APK 壳工程与 build.ps1
test/                  node:test：HTTP 端到端 / 归一化 / 缓存 / 真实上游
```

## 构建 APK

需要 JDK 17+，以及 Android SDK 的三个最小件（约 130MB，不用装 Android Studio）：

```
<SDK>\platform-tools\        adb
<SDK>\build-tools\29.0.3\    aapt / zipalign / apksigner / lib\d8.jar
<SDK>\platforms\android-23\android.jar
```

直链：

```text
https://dl.google.com/android/repository/platform-tools-latest-windows.zip
https://dl.google.com/android/repository/build-tools_r29.0.3-windows.zip
https://dl.google.com/android/repository/platform-23_r03.zip
```

解压到 `D:\Android\sdk`（或设置 `ANDROID_HOME`）后：

```bash
npm run apk             # 正式包：android/build/lofter-lite.apk
npm run apk -- -Debug   # 调试包：debuggable + WebView 远程调试
```

签名用 `android/lofter.jks`（首次自动生成，已 gitignore）。

版本号三处要一起改：`package.json` 的 `version`、`android/AndroidManifest.xml` 的 `versionCode/versionName`、`public/app.js` 的 `APP_VERSION`。

## 真机联调

```bash
npm run device -- status     # 设备型号、系统、已装版本、本地 APK 时间
npm run device -- install    # 装最新 debug 包
npm run device -- webviews   # 检查 WebView 是否可远程调试
npm run device -- inspect    # 打开 chrome://inspect
npm run device -- logcat     # 页面控制台 / WebView / 崩溃日志
npm run device -- shot       # 截屏到 dev-shots/
```

手机端前置：开发者选项 → USB 调试。vivo 机型装包报 `INSTALL_FAILED_USER_RESTRICTED` 时，需登录 vivo 账号并打开「USB 调试（安全设置）」，或用 `adb push` 到手机里手动装。

## 发版

```bash
npm run verify
npm run apk                                     # 出正式包
gh release create v1.0.1 android/build/lofter-lite.apk \
  --title "LOFTER Lite 1.0.1" --notes "更新说明"
```

APK 不进仓库（`.gitignore` 已排除），只作为 Release 附件。
