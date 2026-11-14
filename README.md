# LOFTER Lite

LOFTER 第三方轻客户端，包含本地网页版和 Android APK（WebView 壳）。

> 非官方项目，仅用于学习与个人使用。内容版权归 LOFTER 及原作者所有。

## 功能

- 推荐流：按热度与时效综合排序，支持仅看某个标签
- 关注流：官方时间线接口，按发布时间倒序，支持关注人转发的推荐内容开关
- 订阅标签：单列展示，每行 3 张作品缩略图 + 更新数量，更新数排除已屏蔽内容
- 搜索、话题、博主主页、帖子详情与评论（含楼中楼展开与回复）
- 点赞、关注、评论、分享
- 标签屏蔽、屏蔽用户（只在本机隐藏某人）与拉黑名单（账号级黑名单，支持从账号同步）
- 收藏、浏览历史、深色模式
- 内置作品编辑器（草稿 + 打开发布页）

## 目录

```
public/          前端（原生 JS）
lib/             数据抓取与归一化
server.js        本地网页版服务（端口 8787）
android/         Android 壳工程与构建脚本
```

## 本地运行网页版

零依赖：不需要 `npm install`，Node.js ≥ 20 即可。

```bash
node server.js
# http://127.0.0.1:8787
```

## 开发与调试

```bash
npm run dev            # 真实上游 + 改文件自动重启
npm run dev:mock       # 本地假数据，完全离线，随便点不心疼
npm run dev:lan        # 监听 0.0.0.0，手机连同一 WiFi 直接打开
npm run dev:open       # mock 模式 + 自动打开浏览器

npm test               # 单元 + 端到端冒烟（离线、随机端口，不碰真实接口）
npm run test:live      # 真实上游联调（联网后手动跑；上游改协议时这里最先红）
npm run check          # 语法 / JSON / 相对引用自检（没有构建步骤，防手滑）
npm run cache:clear    # 清 data/cache 与 data/cache-mock
npm run verify         # check + test，提交前跑这个
```

### 桌面启动器（Windows）

不想敲命令的话，双击仓库根目录的 **`启动测试端.cmd`**（或 `npm run desktop`）打开一个窗口，勾选「Mock 假数据 / 真实上游」「局域网可访问」「改文件自动重启」，填端口，点「启动」，再点「打开浏览器」即可。日志实时打印在窗口下半部分，启动状态显示在上方，设置会记住下次打开时的选择。

```bash
npm run desktop         # 打开窗口（exe 不存在会先用系统自带 csc.exe 编译）
npm run desktop:build   # 只编译：desktop/LOFTER-Lite-Launcher.exe
npm run desktop:test    # 无界面自检：随机端口起 mock 服务，ping 通打印 SELF-TEST OK
npm run desktop -- --headless --mock --port 8899   # 无界面常驻，等价 npm run dev:mock
```

零依赖：用 Windows 自带的 `.NET Framework 4.x` 编译器（`csc.exe`）编译 WinForms 程序，不需要装 .NET SDK / Visual Studio。exe 不进仓库（`.gitignore` 里已排除），换机器/改完源码首次运行会自动重编译。

### 调试开关

| 变量 | 作用 |
| --- | --- |
| `PORT` / `HOST` | 端口（默认 8787）/ 监听地址（默认 127.0.0.1，`0.0.0.0` = 局域网可访问） |
| `LOFTER_LITE_MOCK=1` | 同 `--mock`：改用 `dev/mock.js` 的本地假数据 |
| `MOCK_FAIL=1` | 所有接口返回 502，用来看错误态 |
| `MOCK_EMPTY=1` | 所有列表返回空，用来看空状态 |
| `MOCK_DELAY=800` | 每个接口人为延迟 800ms，用来看加载态 |
| `LOFTER_LITE_CACHE_DIR` | 覆盖缓存目录（测试用临时目录） |

mock 模式的图片是 `server.js` 现场生成的 SVG 占位图（`/mock/img/600x800?seed=x`），所以完全离线也能看到完整 masonry 排版。假数据里**故意**混入了空条目、AI 标签、付费内容、脏 HTML（`<script>` / `onclick` / `javascript:`），用来验证过滤与清洗逻辑。

### 开发目录

```
dev/mock.js           本地假数据层（导出与 lib/lofter.js 完全一致）
dev/mock-data.js      假数据生成器（产出上游原始结构，仍走真实归一化代码路径）
scripts/dev.mjs       开发启动器（--mock / --lan / --port / --open / --no-watch）
scripts/check.mjs     零依赖自检
scripts/cache-clear.mjs
scripts/desktop.mjs   桌面启动器入口（必要时先编译 exe，再打开窗口）
scripts/device.mjs    真机联调：装 APK / 看日志 / 截屏 / 检查可调试 WebView
desktop/src/Launcher.cs  WinForms 启动器源码（C# 5，零依赖）
desktop/build.ps1     用系统 csc.exe 编译 exe
android/build.ps1     Windows 下打 APK（aapt/javac/d8/zipalign/apksigner，不装 Studio）
test/                 node:test 测试（server / lofter / cache / live）
```

## 构建 APK

需要 JDK 17+ 和 Android SDK 的三个最小件（不需要 Android Studio，总共约 130MB）：

```
<SDK>\platform-tools\                     adb（真机调试也要用）
<SDK>\build-tools\29.0.3\                 aapt / zipalign / apksigner / lib\d8.jar
<SDK>\platforms\android-23\android.jar
```

直链下载（解压到 `D:\Android\sdk` 即可，或设置 `ANDROID_HOME` 指向别处）：

```text
https://dl.google.com/android/repository/platform-tools-latest-windows.zip
https://dl.google.com/android/repository/build-tools_r29.0.3-windows.zip
https://dl.google.com/android/repository/platform-23_r03.zip
```

打包（任选其一）：

```bash
npm run apk                      # 正式包，产物 android/build/lofter-lite.apk
npm run apk -- -Debug            # 调试包，产物 android/build/lofter-lite-debug.apk
```

`-Debug` 会在 manifest 写 `android:debuggable=true`，并让 `MainActivity` 打开 `WebView.setWebContentsDebuggingEnabled(true)`，这样才能用电脑 Chrome 的 `chrome://inspect` 调试 APK 里的页面。正式包不带这些。

签名用 `android/lofter.jks`（首次自动生成，已 gitignore），不包含在仓库中。

## 真机联调（在电脑上操作/调试手机）

```bash
npm run device -- status      # 设备型号、系统版本、是否已装 App、本地 APK 时间
npm run device -- install     # 装最新的 debug 包
npm run device -- webviews    # 看 WebView 是否可远程调试
npm run device -- inspect     # 打开 Chrome 的 chrome://inspect
npm run device -- logcat      # 只看页面控制台/WebView/崩溃日志
npm run device -- shot        # 手机截屏到 dev-shots/
npm run device -- connect 192.168.1.23:5555   # 无线调试
```

手机端前置条件：开发者选项 → USB 调试；vivo 机型装 APK 需要登录 vivo 帐号后打开「USB 调试（安全设置）」，否则会报 `INSTALL_FAILED_USER_RESTRICTED`（可用 `adb push` 到手机手动安装绕过）。

想只调网页、不碰 APK：`npm run dev:mock -- --lan` 后手机浏览器打开局域网地址即可，前端改动不用重新打包。

## 说明

- 所有接口均来自 LOFTER 公开客户端，仅做只读浏览与账号本人操作。
- 仓库不包含任何账号 Cookie、签名密钥或构建产物。
- 发布功能受限于官方未开放第三方发布接口，编辑器会复制内容并打开官方发布页。
