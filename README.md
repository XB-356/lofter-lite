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
test/                 node:test 测试（server / lofter / cache / live）
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
