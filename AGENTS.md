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
npm run apk            # 打 APK（Windows，手工最小 SDK 件，见下）
npm run apk -- -Debug  # 打调试包：debuggable + WebView 远程调试
npm run device -- status|install|webviews|inspect|logcat|shot|connect
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
android/build.ps1    Windows 打 APK：aapt → javac → d8 → zipalign → apksigner
scripts/device.mjs   真机联调：adb 装包 / 日志 / 截屏 / 检查可调试 WebView
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
- `desktop/src/Launcher.cs`、`desktop/build.ps1` 这类含中文的 `.cs` / `.ps1` **必须存成 UTF-8 with BOM**：csc 与 Windows PowerShell 5.1 默认按 ANSI(GBK) 读源码，没 BOM 会乱码甚至语法错误。同理，**不要用 `Get-Content`/`Set-Content` 改含中文的文件**（PS 5.1 默认按 GBK 解码，会把 UTF-8 中文写坏），要用 `[IO.File]::ReadAllText($p,[Text.UTF8Encoding]::new($false))` + `WriteAllText`。
- APK 的 WebView 调试只在 debug 包生效：`aapt --debug-mode` 写 `debuggable=true` + `MainActivity` 里按 `FLAG_DEBUGGABLE` 调 `setWebContentsDebuggingEnabled(true)`。release 包不要带这些。
- 「不想看」有三种，别混在一起：`blockedTags`（标签屏蔽）、`mutedBlogs`（**屏蔽用户**：只在这台设备上隐藏，不通知对方、不写账号）、`blockedBlogs`（**拉黑**：账号级黑名单的本地镜像，来自 `/api/sync-blocks`）。过滤统一走 `isBlockedPost()`，不要在渲染处各写一套；两个列表在 UI 上也必须是两个入口（`#/muted` / `#/blacklist`）。

## 不要做

- 不要写任何需要登录态的请求（点赞/关注/评论只在 APK 的 native 桥里做）。
- 不要削弱 `sanitizeHtml`：它是安全边界，正文来自第三方 HTML。
- 不要在 `package.json` 里加依赖。这个项目的卖点之一就是零依赖。
- 不要把 `data/`、`dev-shots/` 提交进仓库（已 gitignore）。

## 已知坑

- 上游列表里偶尔混入 `null`（下架 / 风控 / 分页边界），`normalizePost` 已做空值保护，`map` 之后必须 `filter(Boolean)`，别再退回去。**APK 里还有一份独立的归一化实现 `public/native-api.js`（`normPost` / `normDetail`），改解析逻辑要两边都改**，2026-11 真机就是在这里漏了空值保护，发现流直接报 `Cannot read properties of null`。
- APK 判登录态看 cookie：登录后实际的 cookie 名是 **`LOFTER_SESS`**（不是 `LOFTER_SESSION`），并且 `api.lofter.com` 和 `www.lofter.com` 两个域都写了登录 cookie。`Bridge.isLoggedIn()` 必须两个域、多个候选名都查，否则会出现「cookie 有会话、/api/me 能取到用户，但界面显示未登录」。
- 视频帖的 `embed` 是 JSON 字符串，里面才有 mp4 地址。
- **关注流时间线 `getTrackItemListWithShare.json` 的 `items[].type` 有语义**：`1` = 关注的人自己发的，`2` = 关注的人**推荐**的（`shareInfo.blogInfo` 是推荐人，`item.followed=false`）。「包含关注人的推荐」开关就是过滤 `type 2`；`native-api.js` 里映射成 `post.rec` / `post.recBy`。同一响应里的 `timelineBlogList` 各分组 `posts` 实测是空数组，别指望它给内容。
- **关注流不要一次翻到底**：LOFTER 的 `hasNext` 会持续为 true，旧实现进页面就翻到 526 条、页面高 21 万 px、十几秒才出内容。现在 `renderFollowFeed` 首屏只抓 `FIRST_PAGES = 3` 页，底部 `#sentinel` + IntersectionObserver 按需加载；`followCache.pages` 记录已抓页数，第一页用 `offset=0`、后续用 `cursor`。
- **账号的关注/粉丝/喜欢/收藏/推荐数字都在 usercounts 里**，别用 `deepFind` 猜键：`response.userStatistic.followingCount`（关注）、`response.counts[0].followerCount`（粉丝）、`response.userStatistic.favoritePostCount`（喜欢）、`subscribePostCount`（收藏，即收藏夹里的作品数）、`sharePostCount`（推荐）。`response.counts` 是**数组**（每个博客一份），不是对象。
- 账号级列表接口（都要登录 cookie）：
  - 关注：`GET https://api.lofter.com/v1.1/userfollowing.api?product=…&blogdomain=<自己的域名>&offset=&limit=20`
  - 粉丝：`GET https://api.lofter.com/v1.1/blogfollower.api?…` → 元素里 `following` 表示「对方是否关注我」
  - 喜欢 / 推荐：`GET https://api.lofter.com/v1.1/batchdata.api?product=…&supportposttypes=1,2,3,4,5,6&postdigestnew=1&returnData=1&blogdomain=…&offset=&limit=20&method=favorites|shares`（`favorites` = 喜欢，`shares` = 推荐；返回 `response.count` + `response.items[].post`）
  - 收藏夹：`GET https://api.lofter.com/newapi/subFolder/list.json?offset=0&postId=0&blogId=0&type=1` → `data.folders[]`；点进收藏夹用 `GET …/newapi/subFolder/getDetail.json?folderId=<id>&offset=&limit=20` → `data.posts[].postData`（**没有分页**，`offset` 永远是 -1，一次返回整个收藏夹）
  - `blogdomain` 必须是自己的真实域名（如 `xb-356.lofter.com`），用 `myDomain()` 取；猜错就返回空。
- 对应的路由是 `/api/relation?type=following|fans&offset=`、`/api/favorites`（喜欢）、`/api/shares`（推荐）、`/api/collections`（收藏夹）、`/api/collection-posts?folderId=…&offset=`，页面是 `#/relation?type=…`、`#/favorites`、`#/shares`、`#/collections`、`#/collection/<folderId>`；Web 版没有这些接口，进入时按 `NATIVE` 拦一下并提示用 APK。
- 订阅标签的缩略图缓存要**落盘**（`localStorage['lofterTagCards']`，键是标签名 + `seenAt`）：只放内存的话，每次冷启动都要等 31 个标签各自请求 `/api/tag`（week → new → hot 三次兜底），用户看到的就是「点了才出图」。改动 `fetchTagCard` / `renderTagGrid` 时保住 `hydrateTagCards()` 和 `persistTagCards()`。
- 帖子 `postView.type`：`1` 文字、`2` 图片、`4` 视频。**视频帖没有 `image` / `firstImageUrl`**，封面只在 `videoPostView.videoInfo.video_img_url`（或 `video_first_img`），时长在 `videoInfo.duration`（秒），宽高是字符串 `img_width` / `img_height`。
- 瀑布流卡片现在整张可点（`cardEl` 绑了 click → `#/post/...`），长按 520ms 弹「不想看这条？」。改这两处注意：长按命中后要置 `suppressTapUntil`，否则松手会立刻跳详情；`card-save` 是 button、封面是 a，都要在处理器里排除。
- 图片链接要经过前端 `thumb()` 追加 `imageView&thumbnail=` 参数；mock 占位图忽略这些参数。
- Windows 上不要用 PowerShell `Start-Process` 起服务（本机环境变量里 `NO_PROXY`/`no_proxy` 重复会让它报错），用 `npm run dev` 或后台 job。同一个坑对 .NET Framework 的 `ProcessStartInfo.EnvironmentVariables` 也生效：一访问就抛 `ArgumentException`（已添加项。字典中的关键字:NO_PROXY），所以桌面启动器改用 `cmd /c set PORT=…&&set HOST=…&&"node.exe" server.js` 起服务，别改回去。cmd 套一层后要 `taskkill /PID <pid> /T /F` 整棵树收尸，只 Kill 父进程会留孤儿进程占着端口。
- **`build-tools\*\apksigner.bat` / `d8.bat` 在只装了最小 SDK 件时会静默失败**：它们靠 `tools\lib\find_java.bat` 找 java，没有就 `goto :EOF` 直接退出且退出码 0。所以 `android/build.ps1` 直接 `java -jar lib\apksigner.jar` / `java -cp lib\d8.jar com.android.tools.r8.D8`，不要改回调 bat。
- JDK 的 `javapath` 只有 java/javac，没有 `keytool`：`android/build.ps1` 会自己找 JDK 主目录（JAVA_HOME 或 `C:\Program Files\Java\jdk-*`）。
- 真机装包报 `INSTALL_FAILED_USER_RESTRICTED` 是 vivo 的「USB 调试（安全设置）」没开（要登录 vivo 帐号）；绕开办法是 `adb push` 到 `/sdcard/Download/` 后手机上手动安装。
- **点赞接口是 POST 表单，不是 GET**：`POST https://api.lofter.com/v1.1/like.api?product=…`，body 是 `liketype=like|unlike&postid=…&blogid=…&scene=note`。老写法（GET + `like=1`）上游现在只回 `meta.status=4101 发生错误，请重新尝试`；已经喜欢过的作品再发 `liketype=like` 会回 `4102 参数异常`（当成已喜欢处理，别弹错）。详情接口 `oldapi/post/detail.api` 的响应里带 `liked` / `shared` / `subscribed` / `followed`，`normDetail` 把它们透传成 `post.liked` / `post.followed`，用来点亮「已喜欢」和「已关注」。
- **写接口（like.api 等）必须带「设备指纹」`portrait`，否则永远 4102 参数异常**：这不是「已经点过赞」，是上游风控在要指纹。官方客户端的做法是——表单里加 `portrait`（一个 `alg=none` 的 JWT，载荷 `{imei,androidId,oaid,mac,phone}`，base64url 编码），请求头再加 `x-device` / `lofproduct` / `market` / `deviceid` / `androidid` / `portrait`。`public/native-api.js` 里是 `DEVICE_PORTRAIT` + `WRITE_HEADERS` 两个常量，改点赞/关注/分享这类写请求时带上它们。缺了会表现为「本地按钮亮了、账号里没变化」。连续发写请求还会触发 4071「请滑动滑块进行身份验证」，这时提示用户过一会儿再试。
- 订阅标签页是**大卡片**：标题 + 更新数 badge + 3 张缩略图（不要再加大图）。缩略图靠 `IntersectionObserver`（`rootMargin: 700px`）滚到眼前才拉，并发 3 个任务，结果落盘 `localStorage['lofterTagCards']`；纯文字标签（`/api/tag` 返回的帖子全是 `type:1`、没有 `cover`，`/api/taginfo` 的 `cover` 也是空）没有图可显示，用很淡的同色系占位块，别留三个白洞。
- **LOFTER 不提供「标签下共有多少作品」**：`oldapi/tagPosts.api` 的 `response` 只有 `{type, updateTime, items, topPostIds, offset}`，话题页 `__initialize_data__.tagInfo` 只有 `{tagName, joinedNum, tagViewCount, lastUpdateTime, imageUrl}`。所以标签卡副标题不要显示 `N 件作品`（那是拿第一页条数冒充的）；现在是「置顶作品标题/摘要」，纯文字标签显示 `N 人关注 · M 次浏览`，两样都没有就把这一行收起（`.tag-big-sub:empty`）。
- 推荐流里的视频帖：列表接口不带时长、`firstImageWH` 也可能缺，`cardEl` 对 `type 3/4` 默认按 16:9 摆（别再退回 0.78 的竖条），`fillVideoDurations()` 会对缺时长的视频卡补一次 `/api/post` 拿 `embed.duration`，按帖子 id 缓存在内存里，瀑布流重排后重贴角标。`normDetail` 里 `dur` 有 `video.duration` 兜底。
- 帖子详情的「屏蔽」按钮 = 打开「不想看这条？」面板（作者 + 当前作品的标签都能选），不要在详情页直接 `muteBlog`；在详情页里屏蔽成功后要 `closeSheet(); back();`（这条内容已经不该看了）。
- 详情页的「分享」在 APK 里走**系统分享面板**（`api('/api/share')` → `Bridge.share(title, url)` 用 `Intent.ACTION_SEND`），不要再 `openExternal` 把人丢进浏览器；WebView 里没有 `navigator.share`，网页版兜底是复制链接 + toast。
- 「查看全部 N 条回复」要先按 id 去重：`commentEl` 已经把 `c.l2` 的前两条渲染进 `.cmt-replies` 了，再整份 append 接口结果就会重复。做法是收集 `list.querySelectorAll('.cmt')` 的 id，只插没出现过的。
- 返回上一页要回到原来的滑动位置：路由层统一处理（`saveScroll()` 滚动时记录 `currentRoute` → `scrollPos`，`render()` 的 `finally` 调 `restoreScroll(id, y)`），因为内容是异步加载的，`restoreScroll` 每 100ms 追一轮直到高度够、最多 20 轮；恢复期间 `restoringScroll` 为 true，`saveScroll()` 直接返回（否则会把目标值覆盖成 0）；用户 `touchstart`/`wheel` 一动手就停止恢复。不要在视图函数里各写一套 `window.scrollTo`，也别往 `viewHome` 里加恢复逻辑。
- 关注页大卡片上方的多图缩略条是**横向滑动**：`.big-thumb-strip` 用 flex + `overflow-x: auto`，每张 `.thumb-wrap` 宽 `77.3%`（下一张露出一截提示可滑），图片按原比例、`max-height: 420px`，最后一张右下角标 `+N`；取图参数用 `thumb(src, 720)`（320 的图放到 240px 宽会被放大约 2 倍，很糊）。3 宫格、`61.8%` 宽横滑都是试过被用户否掉的版本，别再改回去。
- 标签页会过滤命中「标签屏蔽 / 屏蔽用户」的作品：如果一个标签下的作品全被过滤，页面本来会只剩空白。`viewTag` 现在会先最多多翻 3 页（上游 `hasMore` 可能一直为 true，必须有上限），仍然为空时显示「已屏蔽 #xxx…到我的 → 标签屏蔽取消」或「都被屏蔽标签或屏蔽用户过滤掉了」，改这段别把兜底删掉。另外：过滤后页面可能比屏幕还短，sentinel 一直停在视口里，`IntersectionObserver` 只会在「进入」时触发一次，会卡住不再加载——所以 `load()` 的 `finally` 里还要看一眼 `sentinelInView()`，还在视野里就 60ms 后接着拉（`pumped` 上限 40 轮），这个自动续拉别删。
- **本客户端没有「发布作品」入口**：LOFTER 没有开放第三方发布接口，`https://www.lofter.com/post/create` 在非官方 App 里只会渲染官网落地页（「下载APP」/「登录/注册」），自家假编辑器又只能存草稿再手动粘贴。所以我的页不提供发布入口，`viewCompose` / `composeDraft` / `Bridge.openEditor` 都已删除；`LoginActivity` 只留给登录用。
- **风控 4071 要滑块验证**：点赞/关注被风控时上游回 `meta.status=4071「请滑动滑块进行身份验证」`（响应体里没有链接，别指望跳 URL）。验证码在 `https://captcha.lofter.com`：`GET /captcha/get?type=jigsaw` 拿 `{data:{id,bg,front}}`（bg 是 320x160 的 jpeg base64，front 是 82px 宽、160 高的 png 拼图块），用户拖动后 `POST /captcha/check`——请求体是 **AES-CBC/PKCS5 加密的 `{id,type:"jigsaw",data:{xPos}}`**，头部 `X-Encseckey` 是 **RSA(公钥) 加密的 `"key-iv"`**（key/iv 是各 16 位随机串），**响应体也是 AES 加密的**，要用同一对 key/iv 解。这些加解密在 `android/src/com/lofterlite/Bridge.java` 的 `captchaGet` / `captchaCheck` 里做（Java 侧有 javax.crypto，别试图在 JS 里用 WebCrypto 硬扛二进制响应）。前端 `app.js` 的 `openCaptcha()` 负责滑块 UI、`withCaptcha(fn)` 负责「验证通过后把原操作重试一次」；`likePost` / `followBlog` 遇到 4071 会抛带 `needCaptcha` 标记的错误，新增加的写操作也要走同样的包装。
- **「合集」不是「收藏夹」**：合集是作者给自己作品分的专栏，收藏夹是账号收藏。合集接口是 `POST /v1.1/postCollection.api`：列表 `method=getCollectionList&blogdomain=<name>.lofter.com&offset&limit`，详情 `method=getCollectionDetail&blogid=&collectionid=&offset=&order=1`（返回 `response.collection` + `response.items[].post`）；帖子详情里 `response.posts[0].post.collectionId` 非 0 表示属于某个合集。页面是 `#/blog-collections/<博主名>` 与 `#/collection/<博主名>/<blogId>/<合集id>`，路由里按 `parts.length >= 4` 和收藏夹的 `#/collection/<folderId>` 区分。
- **评论正文里可能带图片**：上游 `content` 里是 `<img>` HTML（表情包/图片评论），之前整段转义成文字。现在 `richComment()` 只保留 http(s) 的图片并渲染成 `.emote`（大图用 `.emote.cmt-img` 限宽限高），其余标签照旧剥掉；`lib/lofter.js` 与 `public/native-api.js` 两份实现要同步改。
- 时间戳：`post.publishTime` → `post.time`，`post.modifyTime` → `post.edited`（`modifyTime=0` 表示没改过）。详情页显示「发布于 yyyy-mm-dd」，改过的再加「· 编辑于 …」；关注页大卡片底部用 `since(post.time)` 显示相对时间。
- 请求日志会打印所有非 `/api/` 路径；接口出错打印 `[api]` 行带状态码和耗时，排障先看它。
