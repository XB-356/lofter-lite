# LOFTER Lite

LOFTER 第三方轻客户端，包含本地网页版和 Android APK（WebView 壳）。

> 非官方项目，仅用于学习与个人使用。内容版权归 LOFTER 及原作者所有。

## 功能

- 推荐流：按热度与时效综合排序，支持仅看某个标签
- 关注流：官方时间线接口，按发布时间倒序，支持关注人转发的推荐内容开关
- 订阅标签：单列展示，每行 3 张作品缩略图 + 更新数量，更新数排除已屏蔽内容
- 搜索、话题、博主主页、帖子详情与评论（含楼中楼展开与回复）
- 点赞、关注、评论、分享
- 标签屏蔽与博主黑名单，支持从账号同步
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

```bash
node server.js
# http://127.0.0.1:8787
```

## 构建 APK

需要 JDK、Android SDK（platform 23、build-tools 29.0.3）以及 `android/tools/r8.jar`。

```bash
cd android
./build.sh
```

产物：`android/build/lofter-lite.apk`。

签名使用本地 keystore，不包含在仓库中。

## 说明

- 所有接口均来自 LOFTER 公开客户端，仅做只读浏览与账号本人操作。
- 仓库不包含任何账号 Cookie、签名密钥或构建产物。
- 发布功能受限于官方未开放第三方发布接口，编辑器会复制内容并打开官方发布页。
