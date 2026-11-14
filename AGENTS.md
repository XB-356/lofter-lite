# AGENTS.md

给在这个仓库里干活的 coding agent 的说明。先读这一页，再动手。

## 这是什么

LOFTER 第三方轻客户端。两层：

- 本地网页版：`server.js`（Node 原生 http）+ `public/`（原生 JS，无框架、无打包）
- Android APK：`android/`（WebView 壳 + `public/native-api.js` 桥接）

**没有依赖、没有构建步骤、没有 npm install**。Node.js ≥ 20。

## 命令

```bash
npm run dev            # 真实上游 + node --watch
npm run dev:mock       # 本地假数据（离线），改 UI 首选
npm test               # 离线测试（随机端口，不碰真实接口）
npm run test:live      # 真实上游联调，联网时手动跑
npm run check          # 语法 / JSON / 相对引用自检
npm run verify         # check + test
npm run cache:clear    # 清 data/cache 与 data/cache-mock
npm run desktop        # 打开 Windows 桌面启动器（不存在会先编译）
npm run desktop:test   # 桌面启动器无界面自检
```

提交前至少跑 `npm run verify`。涉及上游解析的改动，再跑一次 `npm run test:live`。

## 结构

```
server.js            路由 + 静态服务（+ mock 模式的 /mock/img 占位图）
lib/lofter.js        上游请求、限速、字段归一化、HTML 清洗
lib/cache.js         内存 + 磁盘两级缓存（TTL 按 mtime 判断）
lib/catalog.js       发现页分类与默认标签
dev/mock.js          假数据层，导出与 lib/lofter.js 一致（MOCK=1 时替代它）
dev/mock-data.js     假数据生成器：产出上游原始结构，仍走真实归一化
public/app.js        全部前端逻辑（路由、瀑布流、详情、评论、设置）
public/native-api.js APK 专用（Web bridge），网页版不生效
scripts/             启动器 / 自检 / 清缓存
desktop/src/Launcher.cs  Windows 桌面启动器（WinForms，C# 5，零依赖）
desktop/build.ps1    用系统自带 csc.exe 编译 exe（不需要 .NET SDK）
test/                node:test：server(HTTP) / lofter(归一化) / cache / live
```

## 约定

- 服务端、`lib/`、`dev/`、`test/` 用 **CommonJS**；`scripts/*.mjs` 用 **ESM**。不要混。
- 前端是 IIFE + 字符串模板，不加框架、不加依赖、不加构建步骤。
- 新增一个接口要同步四处：`server.js` 的 switch、`public/app.js` 的 `api()` 调用、`dev/mock.js` 的假实现、`test/server.test.js` 的断言。
- mock 层必须保持和 `lib/lofter.js` 相同的导出（`tagPosts` / `postDetail` / `blogHome` / `tagInfo` / `comments`），否则 `server.js` 的 `MOCK` 分支会挂。
- mock 的帖子 id 必须按标签区分（`postId()`），否则发现流轮流取多个标签时会把同号帖当成重复，页面上只剩 9 张卡。
- mock 与真实数据使用**不同缓存目录**（`data/cache-mock` / `data/cache`）。混用会让 mock 的假帖子被当成真实缓存返回。
- 测试必须离线、随机端口、独立临时缓存目录（`test/helpers.js` 已封装），不要连线上游。
- 每次改动单独一个 commit（一个 commit 一件事），**推送要等用户确认**，不要自作主张 push。
- `desktop/` 是 C#：只能写 **C# 5** 语法（系统自带 csc.exe 是 .NET Framework 4.x 的旧编译器），不要用字符串内插、`?.`、`nameof`、`=>` 表达式体成员等新语法。
- `desktop/src/Launcher.cs`、`desktop/build.ps1` 这类含中文的 `.cs` / `.ps1` **必须存成 UTF-8 with BOM**：csc 与 Windows PowerShell 5.1 默认按 ANSI(GBK) 读源码，没 BOM 会乱码甚至语法错误。

## 不要做

- 不要写任何需要登录态的请求（点赞/关注/评论只在 APK 的 native 桥里做）。
- 不要削弱 `sanitizeHtml`：它是安全边界，正文来自第三方 HTML。
- 不要在 `package.json` 里加依赖。这个项目的卖点之一就是零依赖。
- 不要把 `data/`、`dev-shots/` 提交进仓库（已 gitignore）。

## 已知坑

- 上游列表里偶尔混入 `null`（下架 / 风控 / 分页边界），`normalizePost` 已做空值保护，`map` 之后必须 `filter(Boolean)`，别再退回去。
- 视频帖的 `embed` 是 JSON 字符串，里面才有 mp4 地址。
- 图片链接要经过前端 `thumb()` 追加 `imageView&thumbnail=` 参数；mock 占位图忽略这些参数。
- Windows 上不要用 PowerShell `Start-Process` 起服务（本机环境变量里 `NO_PROXY`/`no_proxy` 重复会让它报错），用 `npm run dev` 或后台 job。同一个坑对 .NET Framework 的 `ProcessStartInfo.EnvironmentVariables` 也生效：一访问就抛 `ArgumentException`（已添加项。字典中的关键字:NO_PROXY），所以桌面启动器改用 `cmd /c set PORT=…&&set HOST=…&&"node.exe" server.js` 起服务，别改回去。cmd 套一层后要 `taskkill /PID <pid> /T /F` 整棵树收尸，只 Kill 父进程会留孤儿进程占着端口。
- 请求日志会打印所有非 `/api/` 路径；接口出错打印 `[api]` 行带状态码和耗时，排障先看它。
