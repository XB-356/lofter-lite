# LOFTER Lite

一个更轻的 LOFTER 客户端：打开就是内容，没有广告、没有商城、没有开屏。

> 非官方项目，与 LOFTER 官方无关；内容与版权归 LOFTER 及原作者所有。

有两种用法：

- **Android APK**——可以登录自己的账号，能点赞、关注、评论、保存图片，也有滑块验证兜底
- **本地网页版**——在自己电脑上起一个本地服务，用浏览器打开，只读公开内容，不用登录

## 它能做什么

| | |
| --- | --- |
| 刷内容 | 推荐流瀑布流（视频帖带封面与时长，多图帖有缩略预览）；关注流分「动态 / 订阅标签」，包含关注人的推荐可开关 |
| 看标签 | 订阅标签是大卡片 + 三张缩略图，缩略图缓存在本机，下次打开立刻有图 |
| 看作品 | 多图与视频播放、发布 / 编辑时间、所属合集（可「上一篇 / 下一篇」翻）、正文安全清理 |
| 看评论 | 评论与楼中楼，可按「热门 / 最新」切换；图片评论单独占一行、点开看大图；划线评会先显示被划住的原文；`[更新求踢]` 这类官方功能评论自动隐藏 |
| 搜内容 | 标签、用户、作品三类结果，作品结果直接显示成作品卡片 |
| 自己的号 | 关注 / 粉丝 / 喜欢 / 收藏 / 推荐都能点进去看列表；点赞、关注、评论、分享（APK 走系统分享面板） |
| 存图 | 图片查看器可保存原图到相册，保存按钮在右下角；系统返回键先关查看器 |
| 少看不想看的 | 「我的 → 屏蔽」里统一管：标签屏蔽、关键词屏蔽、屏蔽用户（只在这台设备隐藏）、拉黑名单；可导入导出 JSON；设置里能开关「隐藏粮票 / 付费作品」 |
| 顺手的小事 | 复制 LOFTER 作品链接再打开 App 会自动跳转；返回上一页回到原滑动位置；深色模式；本机收藏与浏览历史 |

**这里没有的**：发布作品（官方没开放第三方发布接口）、私信、会员、广告。需要这些请用官方 App。

## 用起来

### 手机（APK）

装你自己打的包就行（见下面「开发者 → 构建 APK」）。登录用 LOFTER 账号，登录态由系统浏览器组件保存，随时可在「我的 → 退出登录」清掉。

### 电脑（网页版）

零依赖，Node.js ≥ 20 即可，不需要 `npm install`：

```bash
node server.js
# 打开 http://127.0.0.1:8787
```

网页版只读公开内容。想在手机浏览器上试前端改动，用 `npm run dev:lan` 后手机连同一 WiFi 打开局域网地址即可。

## 你的数据

屏蔽名单、本机收藏、浏览历史、标签缩略图缓存都只存在**这台设备**上，不会上传到任何服务器。APK 的登录 Cookie 由系统 WebView 管理，退出登录即清。仓库里不包含任何 Cookie、签名密钥或构建产物。

## 常见问题

- **页面空白 / 加载不出来**：先下拉刷新；大概率是上游接口临时抽风。
- **点赞、关注提示「滑动验证」**：LOFTER 的风控，拖对拼图就能继续，属于上游限制。
- **点赞后账号里没变化**：会被风控拦下，过一会儿再试。
- **我的页 IP 属地怎么来的**：LOFTER 没有账号级 IP 字段，这里显示的是你最近一篇作品的属地。
- **换手机了名单还在吗**：名单只在本机，先在「我的 → 屏蔽 → 导入 / 导出」里备份，再到新设备导入。

## 开发者

更细的约定、已知坑都在 [`AGENTS.md`](AGENTS.md)，动手前先读那一页。

### 命令

```bash
npm run dev            # 真实上游 + 改文件自动重启
npm run dev:mock       # 本地假数据，完全离线，改 UI 首选
npm run dev:lan        # 监听 0.0.0.0，手机连同一 WiFi 直接看
npm test               # 离线测试（随机端口，不碰真实接口）
npm run test:live      # 真实上游联调，联网时手动跑
npm run verify         # check + test，提交前跑
npm run cache:clear    # 清 data/cache 与 data/cache-mock
npm run desktop        # Windows 桌面启动器（点两下起测试端）
npm run apk            # 打 APK；加 -- -Debug 出可调试包
npm run device -- status|install|webviews|inspect|logcat|shot|connect
```

调试开关（详细表格见 AGENTS.md）：`PORT` / `HOST`、`LOFTER_LITE_MOCK=1`、`MOCK_FAIL=1`、`MOCK_EMPTY=1`、`MOCK_DELAY=800`、`LOFTER_LITE_CACHE_DIR`。mock 模式的图片是服务端现生成的 SVG，假数据里故意混了空条目、AI 标签、付费内容与脏 HTML，用来验证过滤和清洗。

### 结构

```
server.js              路由 + 静态服务（mock 模式还负责占位图）
lib/lofter.js          上游请求、限速、字段归一化、HTML 清洗
lib/cache.js           内存 + 磁盘两级缓存
public/app.js          全部前端逻辑，原生 JS，无框架无打包
public/native-api.js   APK 专用桥接，网页版不生效
dev/                   mock 假数据层（导出与 lib/lofter.js 一致）
scripts/               启动器 / 自检 / 清缓存 / 真机联调
desktop/               Windows 桌面启动器（C# 5 + 系统自带 csc.exe）
android/               APK 壳工程与 build.ps1
test/                  node:test：HTTP 端到端 / 归一化 / 缓存 / 真实上游
```

### 构建 APK

需要 JDK 17+，以及 Android SDK 的三个最小件（约 130MB，不用装 Android Studio）：

```
<SDK>\platform-tools\        adb
<SDK>\build-tools\29.0.3\    aapt / zipalign / apksigner / lib\d8.jar
<SDK>\platforms\android-23\android.jar
```

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

### 真机联调

```bash
npm run device -- status     # 设备型号、系统、已装版本、本地 APK 时间
npm run device -- install    # 装最新 debug 包
npm run device -- webviews   # 检查 WebView 是否可远程调试
npm run device -- inspect    # 打开 chrome://inspect
npm run device -- logcat     # 页面控制台 / WebView / 崩溃日志
npm run device -- shot       # 截屏到 dev-shots/
```

手机端前置：开发者选项 → USB 调试。vivo 机型装包报 `INSTALL_FAILED_USER_RESTRICTED` 时，需登录 vivo 账号并打开「USB 调试（安全设置）」，或用 `adb push` 到手机里手动装。
