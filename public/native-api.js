/* APK 模式：通过原生桥直接访问 LOFTER 接口（带登录 Cookie，等价于服务端逻辑） */
(() => {
  const N = window.Native;
  if (!N) return;

  const APP_UA = 'LOFTER-Android 8.3.50 (V2272A; Android 13; null) WIFI';
  const PRODUCT = 'lofter-android-8.3.50';
  const TAG_URL = 'https://api.lofter.com/oldapi/tagPosts.api?product=' + PRODUCT;
  const DETAIL_URL = 'https://api.lofter.com/oldapi/post/detail.api?product=' + PRODUCT;
  const BLOG_URL = 'https://api.lofter.com/v2.0/blogHomePage.api?product=lofter-iphone-10.0.0';
  const POST_TYPES = '1,2,3,4,5,6';

  // 写操作（点赞/关注/评论/分享）上游要校验「设备指纹」：缺 portrait 会一直回
  // meta.status=4102 参数异常（2026-11 真机逐个试出来的，官方客户端就是带这个头 + 表单字段）。
  // 值照官方客户端的格式拼：一个 alg=none 的 JWT，载荷是设备/手机号等字段。
  function b64u(s) {
    try { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    catch (e) { return ''; }
  }
  const DEVICE_PORTRAIT = (() => {
    const payload = { imei: '3451efd56bgg6h47', androidId: '3451efd56bgg6h47', oaid: '32b4d2c348650842', mac: '02:00:00:00:00:00', phone: '15934867293' };
    return b64u(JSON.stringify({ alg: 'none', typ: 'JWT' })) + '.' + b64u(JSON.stringify(payload)) + '.';
  })();
  const WRITE_HEADERS = {
    'User-Agent': 'LOFTER-Android 8.0.12 (23127PN0CC; Android 14; null) WIFI',
    Accept: '*/*',
    lofproduct: 'lofter-android-8.0.12',
    market: 'vivo',
    deviceid: '3451efd56bgg6h47',
    androidid: '3451efd56bgg6h47',
    'x-device': 'qv+Dz73SObtbEFG7P0Gq12HkjzNb+iOK6KHWTPKHBTEZu26C6MJOMukkAG7dETo2',
    portrait: DEVICE_PORTRAIT,
  };

  // ---------------- 原生请求 ----------------
  const pending = new Map();
  let seq = 0;

  window.__nativeChunk = function (id, i, total, part) {
    const p = pending.get(id);
    if (!p) return;
    p.parts[i] = part;
  };
  window.__nativeDone = function (id, status) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    const text = p.parts.join('');
    if (status < 0) return p.reject(new Error('网络请求失败，检查一下网络'));
    if (status >= 400) return p.reject(new Error('LOFTER 返回了 ' + status));
    p.resolve(text);
  };

  function req(url, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const id = 'r' + (++seq);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('请求超时'));
      }, 30000);
      pending.set(id, { parts: [], resolve, reject, timer });
      try {
        N.http(id, url, opts.method || 'GET', opts.body || '', opts.headers ? JSON.stringify(opts.headers) : '');
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async function callApi(url, form, headers) {
    const text = await req(url, {
      method: 'POST',
      body: new URLSearchParams(form).toString(),
      headers: Object.assign({ 'User-Agent': APP_UA, Accept: '*/*' }, headers || {}),
    });
    let doc;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      throw new Error('LOFTER 返回了异常内容');
    }
    const meta = doc.meta || {};
    if (meta.status && meta.status !== 200) throw new Error(meta.msg || ('LOFTER 错误 ' + meta.status));
    return doc.response || {};
  }

  // ---------------- 文本处理 ----------------
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeEntities(s) {
    return String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] != null ? ENTITIES[e.toLowerCase()] : m;
    });
  }
  function stripHtml(html) {
    if (!html) return '';
    return decodeEntities(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ''))
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function sanitizeHtml(html) {
    if (!html) return '';
    let s = String(html);
    s = s.replace(/<\s*(script|style|noscript|form|input|button|textarea|select)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    s = s.replace(/<\s*(script|style|noscript|form|input|button|textarea|select|link|meta)[^>]*\/?\s*>/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/(href|src)\s*=\s*("|')\s*(javascript|data):[^"']*\2/gi, '$1="#"');
    s = s.replace(/<iframe[^>]*src\s*=\s*("|')([^"']+)\1[^>]*>[\s\S]*?<\/iframe>/gi,
      (_, q, src) => '<p class="embed"><a href="' + src + '" target="_blank" rel="noopener noreferrer">查看嵌入内容 ↗</a></p>');
    s = s.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/<img[^>]*width\s*=\s*["']?0["']?[^>]*>/gi, '');
    s = s.replace(/<p[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\u00a0|\s)*<\/p>/gi, '');
    s = s.replace(/^(\s*<br\s*\/?>\s*)+/i, '');
    return s.trim();
  }
  function parseArr(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  }
  const AI_RE = /^(ai|aigc|ai绘画|ai生成|ai创作|ai作图|midjourney|stable\s*diffusion|chatgpt)$/i;
  function isAiTag(t) {
    const s = String(t || '').trim();
    return AI_RE.test(s) || /^(ai|aigc)[·\-—_ ]?(绘画|生成|创作|作图|图片)$/i.test(s);
  }

  // ---------------- 归一化 ----------------
  function findBlogInfo(obj, depth) {
    depth = depth || 0;
    if (!obj || typeof obj !== 'object' || depth > 5) return null;
    if (obj.blogNickName || obj.blogName) return obj;
    for (const k of ['blogInfo', 'blog', 'author', 'publisher', 'publisherMainBlogInfo', 'postData', 'postView', 'item', 'data']) {
      const r = findBlogInfo(obj[k], depth + 1);
      if (r) return r;
    }
    return null;
  }

  function normAuthor(p) {
    const b = p.blogInfo || p.publisherMainBlogInfo || p.blog || findBlogInfo(p) || {};
    return {
      id: b.blogId || p.blogId || 0,
      name: b.blogName || b.domainName || '',
      nick: b.blogNickName || b.nickName || b.blogName || 'LOFTER 用户',
      avatar: b.bigAvaImg || b.avatar || b.headImg || b.blogAvatar || b.bigAvatar || '',
      intro: b.selfIntro || '',
      url: b.blogName ? 'https://' + b.blogName + '.lofter.com' : '',
    };
  }
  function normStats(p) {
    const c = p.postCount || {};
    return {
      like: c.favoriteCount || 0, comment: c.responseCount || 0, reblog: c.reblogCount || 0,
      share: c.shareCount || 0, view: c.viewCount || 0, hot: c.postHot || p.hot || 0,
    };
  }
  function normPost(entry) {
    if (!entry) return null;
    let post = entry.post || entry;
    if (!post || !post.id) return null;
    if (post && post.postView) {
      const outer = post;
      post = Object.assign({}, outer, outer.postView);
      delete post.postView;
    }
    const author = normAuthor(post);
    const rawTags = Array.isArray(post.tagList) ? post.tagList
      : String(post.tag || '').split(',').map((x) => x.trim()).filter(Boolean);
    // 上游 tagList 里偶尔夹 undefined / 空串，直接 map 会渲染出 #undefined
    const tags = rawTags.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
    const ppv = post.photoPostView || {};
    // 视频帖（type 4）没有 image/firstImageUrl，封面只在 videoPostView.videoInfo 里
    const vi = (post.videoPostView && post.videoPostView.videoInfo) || post.videoInfo || {};
    const firsts = parseArr(post.firstImageUrl).length ? parseArr(post.firstImageUrl) : parseArr(ppv.firstImageUrl);
    const links = parseArr(post.photoLinks).length ? parseArr(post.photoLinks) : parseArr(ppv.photoLinks);
    const first = links.filter(Boolean)[0] || ppv.firstImage || {};
    const photos = links.map((x) => (x && (x.middle || x.small || x.orign || x.url)) || '').filter(Boolean);
    let cover = firsts[1] || firsts[0] || first.orign || first.middle || post.firstSmallImageUrl || ppv.firstImage && (ppv.firstImage.orign || ppv.firstImage.url) || photos[0] || '';
    if (!cover) {
      const im = post.image || post.firstImage || post.cover || post.coverUrl;
      cover = Array.isArray(im) ? im[0] : (typeof im === 'string' ? im : '');
    }
    // 视频帖的封面（拿不到 image/firstImageUrl 时兜底）
    if (!cover) cover = vi.video_img_url || vi.video_first_img || '';
    if (Array.isArray(cover)) cover = cover[0];
    if (cover && typeof cover === 'object') cover = cover.url || cover.image || cover.orign || '';
    const dur = Number(vi.duration) || 0;
    const pcRaw = post.photoCount || (post.photoPostView && post.photoPostView.photoCount);
    const pc = pcRaw && typeof pcRaw === 'object'
      ? (pcRaw.photoCount || pcRaw.count || 0)
      : (Number(pcRaw) || 0);
    const wh = post.firstImageWH || {};
    return {
      id: post.id, type: post.type,
      title: decodeEntities(post.title || ''),
      digest: stripHtml(post.digest || post.caption || (post.photoPostView && post.photoPostView.caption) || post.content || '').slice(0, 400),
      tags, ai: tags.some(isAiTag),
      time: post.publishTime || post.createTime || 0,
      edited: Number(post.modifyTime) || 0,
      author, stats: normStats(post), cover,
      thumbs: photos.slice(0, 6),
      photoCount: pc || photos.length,
      coverW: wh.w || first.ow || Number(vi.img_width) || 0, coverH: wh.h || first.oh || Number(vi.img_height) || 0,
      permalink: post.permalink || '',
      url: post.blogPageUrl || (author.name && post.permalink ? 'https://' + author.name + '.lofter.com/post/' + post.permalink : ''),
      originBlogId: post.blogId || author.id || 0,
      hot: post.hot || 0, wordCount: post.wordCount || post.totalWordCount || 0,
      dur,
      // 付费 / 会员限定：是否隐藏交给前端设置（hideLocked）决定
      locked: !!(post.payView || post.needPay || post.fansVipPost),
      // 草稿 / 定时发布 / 待审核：不对外可见
      draft: post.isPublished === false
        || !!post.isDraft
        || Number(post.queuePostType) > 0
        || !(post.publishTime || post.createTime),
      // 审核中（作者自己能看，别人看不到）
      audit: post.auditing === true || post.newVersionAuditing === true,
    };
  }
  function normDetail(entry) {
    if (!entry) return null;
    const post = entry.post || entry;
    const base = normPost(post);
    if (!base) return null;
    const tags = base.tags;
    const photos = parseArr(post.photoLinks).filter(Boolean).map((p) => ({
      url: p.orign || p.orignWithTag || p.raw || p.middle || p.small || '',
      thumb: p.middle || p.small || p.orign || '',
      w: p.ow || p.rw || 0, h: p.oh || p.rh || 0,
    })).filter((p) => p.url);

    let content = sanitizeHtml(post.content || '');
    let caption = sanitizeHtml(post.caption || '');
    const capText = stripHtml(caption);
    if (content && stripHtml(content) === capText) content = '';
    if (capText && capText === String(post.title || '').trim()) caption = '';

    let video = null;
    if (post.embed) {
      try {
        const e = typeof post.embed === 'string' ? JSON.parse(post.embed) : post.embed;
        let u = e.video_down_url || e.originUrl || e.flashurl || '';
        if (!u && e.ext) u = atob(e.ext);
        if (/^https?:\/\//.test(u)) {
          video = { url: u, poster: e.video_img_url || e.video_first_img || '',
            w: Number(e.video_width) || 0, h: Number(e.video_height) || 0, duration: Number(e.duration) || 0 };
        }
      } catch (err) {}
    }
    return Object.assign({}, base, {
      tags, ai: tags.some(isAiTag), content, caption, photos, video,
      // 列表接口可能没带 videoPostView，时长就靠详情里的 embed.duration 兜底
      dur: (video && video.duration) || base.dur || 0,
      wordCount: post.wordCount || post.totalWordCount || 0,
      ipLocation: post.ipLocation || '',
      // 详情响应里带用户状态：liked / shared / subscribed / followed
      // followed 用来让详情页的「关注」按钮一进来就显示「已关注」
      liked: !!(entry.liked || post.liked),
      followed: !!(entry.followed || post.followed),
      // 作品所属合集（0 = 不在任何合集里），详情页据此显示「合集」入口
      collectionId: Number(post.collectionId) || 0,
    });
  }

  // ---------------- 接口 ----------------
  async function tagPosts(tag, offset, sort) {
    const resp = await callApi(TAG_URL, { method: 'newTagSearch', tag, offset: offset || 0, limit: 20, type: sort || 'new' });
    const items = resp.items || [];
    return {
      posts: items.map(normPost).filter(Boolean).filter((p) => !p.ai && !p.draft && !p.audit),
      nextOffset: typeof resp.offset === 'number' ? resp.offset : (offset || 0) + items.length,
      hasMore: items.length > 0,
    };
  }

  async function postDetail(blogId, postId) {
    try {
      const resp = await callApi(DETAIL_URL, {
        targetblogid: String(blogId), blogId: String(blogId), postid: String(postId),
        supportposttypes: POST_TYPES, offset: 0, requestType: 1, postdigestnew: 1, checkpwd: 1, needgetpoststat: 1,
      });
      const entry = (resp.posts || [])[0];
      if (!entry) throw new Error('这篇内容暂时不可见（可能已删除、设为私密或受限）');
      const detail = normDetail(entry);
      if (!detail) throw new Error('这篇内容暂时不可见（可能已删除、设为私密或受限）');
      return detail;
    } catch (e) {
      if (/不可见/.test(e.message)) throw e;
      throw new Error('这篇内容暂时不可见（可能已删除、设为私密或受限）');
    }
  }

  // 评论正文：LOFTER 里评论可以带图（表情包/图片评论），content 里就是 <img> HTML。
  // 其它标签一律去掉、文本转义，只把 http(s) 的图片留下来当 .emote 渲染。
  function richComment(html) {
    const srcs = [];
    const staged = String(html || '').replace(/<img\b[^>]*>/gi, (m) => {
      const src = (m.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
      if (!/^https?:\/\//i.test(src)) return '';
      srcs.push(src);
      return '\u0000' + (srcs.length - 1) + '\u0000';
    });
    // 先解 HTML 实体再转义，否则评论里的 &nbsp; / &amp; 会原样显示成「&nbsp;」这种字面量
    let out = escText(decodeEntities(staged.replace(/<br\s*\/?>/gi, '\n'))).replace(/\n/g, '<br>');
    out = out.replace(/\u0000(\d+)\u0000/g, (m, i) => (srcs[Number(i)]
      ? '<img class="emote cmt-img" src="' + escText(srcs[Number(i)]) + '" alt="">'
      : ''));
    return out;
  }

  // 图片评论：content 里只有「[图片]」这种占位文字，真正的图在 images[]（orign 是原图地址）。
  function commentPic(src) {
    const u = String(src || '');
    if (!/^https?:\/\//i.test(u)) return '';
    const sized = /[?&]thumbnail=/.test(u)
      ? u
      : u + (u.indexOf('?') >= 0 ? '&' : '?') + 'imageView&thumbnail=720x0&quality=90';
    return '<img class="emote cmt-img" src="' + escText(sized) + '" alt="">';
  }

  // 官方 App 的「功能型评论」：整条只有 [更新求踢] 这类方括号标记，没有实际内容
  const OFFICIAL_CMT_RE = /^(\[[^\]\s]{1,12}\][\s　]*)+$/;

  // 划线评：用户选中正文某段文字后发的评论，上游会把选中的原文带回来（实测字段就是 quote）
  function quoteOf(c) {
    const q = c.quote || c.quoteContent || c.quoteText || c.targetContent
      || c.highlightContent || c.originContent || c.markContent || '';
    return String(q || '').trim();
  }

  function plainText(html) {
    return String(html || '').replace(/<[^>]*>/g, '').replace(/&\w+;/g, ' ').trim();
  }

  function normComment(c) {
    if (!c) return null;
    const b = c.publisherBlogInfo || {};
    let content = richComment(c.content || '');
    (c.emotes || []).forEach((em) => {
      if (em.name && em.url) content = content.split(escText(em.name)).join('<img class="emote" src="' + escText(em.url) + '" alt="">');
    });
    const pics = (c.images || []).map((im) => (im && (im.orign || im.raw || im.url)) || '').filter(Boolean);
    let pi = 0;
    content = content.replace(/\[图片\]/g, () => (pi < pics.length ? commentPic(pics[pi++]) : ''));
    if (pi < pics.length) content += pics.slice(pi).map(commentPic).join('');
    // 只有 [更新求踢] 这类官方功能评论、又没有配图，就别显示了
    if (!pics.length && OFFICIAL_CMT_RE.test(plainText(c.content))) return null;
    return {
      id: c.id,
      author: { name: b.blogName || '', nick: b.blogNickName || 'LOFTER 用户', avatar: b.bigAvaImg || '' },
      content,
      quote: quoteOf(c),
      time: c.publishTime || 0,
      likes: c.likeCount || 0,
      ip: c.ipLocation || '',
      l2Count: c.l2Count || 0,
      l2: (c.l2Comments || []).map(normComment).filter(Boolean),
    };
  }
  function escText(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function comments(blogId, postId, offset) {
    const url = 'https://www.lofter.com/comment/l1/page.json?postId=' + postId + '&blogId=' + blogId + '&offset=' + (offset || 0);
    const text = await req(url, { headers: { Referer: 'https://www.lofter.com/' } });
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error('评论加载失败'); }
    if (doc.code !== 0) throw new Error(doc.msg || '评论加载失败');
    const data = doc.data || {};
    return {
      list: (data.list || []).map(normComment),
      hot: (data.hotList || []).map(normComment),
      next: typeof data.offset === 'number' ? data.offset : -1,
      total: data.total || 0,
    };
  }

  // 作品属地在上游是个 JSON 字符串：{"country":"中国","province":"福建","shorten":"闽"}
  function ipProvince(raw) {
    if (!raw) return '';
    if (typeof raw === 'object') return raw.province || raw.country || '';
    const s = String(raw).trim();
    if (s.charAt(0) !== '{') return s.slice(0, 20);
    try {
      const o = JSON.parse(s);
      return o.province || o.country || '';
    } catch (e) {
      return '';
    }
  }

  async function blogHome(name, offset, limit) {
    const resp = await callApi(BLOG_URL, {
      blogdomain: name + '.lofter.com', method: 'getPostLists', limit: limit || 20, offset: offset || 0,
      checkpwd: 1, supportposttypes: POST_TYPES, postdigestnew: 1, needgetpoststat: 1,
    });
    const posts = (resp.posts || []).map(normPost).filter(Boolean).filter((p) => !p.ai && !p.draft && !p.audit);
    // topPost 是博主自己置顶的那篇（形状和 posts[] 元素一样，里面还套一层 .post）
    const pinned = resp.topPost ? normPost(resp.topPost) : null;
    const bi = resp.blogInfo || (resp.posts && resp.posts[0] && resp.posts[0].post && resp.posts[0].post.blogInfo) || {};
    const firstRaw = (resp.posts && resp.posts[0] && resp.posts[0].post) || (resp.topPost && resp.topPost.post) || {};
    return {
      blog: { name: bi.blogName || name, nick: bi.blogNickName || name, avatar: bi.bigAvaImg || '', intro: bi.selfIntro || '', id: bi.blogId || 0, url: 'https://' + name + '.lofter.com' },
      posts,
      pinned: pinned && !pinned.ai && !pinned.locked ? pinned : null,
      // 账号没有「IP 属地」字段，借最近一篇作品的属地顶上（和作品页里显示的同一个来源）
      ip: ipProvince(firstRaw.ipLocation),
      nextOffset: typeof resp.offset === 'number' ? resp.offset : (offset || 0) + posts.length,
      hasMore: posts.length > 0,
    };
  }

  const tagInfoCache = new Map();
  async function tagInfo(name) {
    const key = 'ti:' + name;
    const hit = tagInfoCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.v;
    try {
      const html = await req('https://www.lofter.com/front/blog/tag/' + encodeURIComponent(name), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) Chrome/124 Mobile Safari/537.36', Accept: 'text/html' },
      });
      const key2 = 'window.__initialize_data__ = ';
      const start = html.indexOf(key2);
      if (start < 0) return null;
      const end = html.indexOf('</script>', start);
      const raw = html.slice(start + key2.length, end).replace(/;$/, '').trim();
      const data = JSON.parse(raw);
      const t = data.tagInfo || (data.tagInfoData && data.tagInfoData.tagInfo) || {};
      const v = { name: t.tagName || name, cover: t.imageUrl || '', followers: t.joinedNum || 0, views: t.tagViewCount || 0 };
      tagInfoCache.set(key, { v, exp: Date.now() + 3600e3 });
      return v;
    } catch (e) {
      return null;
    }
  }

  // ---------------- 缓存与聚合 ----------------
  const cache = new Map();
  function cached(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.p;
    const p = Promise.resolve().then(fn);
    cache.set(key, { p, exp: Date.now() + ttl });
    p.catch(() => {
      const cur = cache.get(key);
      if (cur && cur.p === p) cache.delete(key);
    });
    return p;
  }

  const CATALOG = {
    categories: [
      { name: '摄影', icon: '📷', tags: ['摄影', '人像摄影', '胶片摄影', '街拍', '风光摄影', '猫咪', '宠物摄影'] },
      { name: '绘画', icon: '🎨', tags: ['绘画', '手绘', '插画', '水彩', '板绘', '速写', '原创绘画'] },
      { name: '同人', icon: '✨', tags: ['同人', '原神', '崩坏星穹铁道', '第五人格', '明日方舟', '光与夜之恋', '排球少年', '咒术回战'] },
      { name: '文字', icon: '📖', tags: ['原创文学', '短篇', '诗歌', '随笔', '读书', '电影', '书摘'] },
      { name: '生活', icon: '🌿', tags: ['生活', '日常', '美食', '旅行', '穿搭', '手账', '植物', '家居'] },
      { name: '设计', icon: '🖋', tags: ['设计', '字体', '排版', '海报', '平面设计'] },
      { name: '手写', icon: '✍️', tags: ['手写', '练字', '钢笔', 'brushlettering'] },
      { name: '次元', icon: '🎮', tags: ['cosplay', '手办', '模玩', '动漫', '游戏'] },
    ],
    defaultTags: ['摄影', '绘画', '同人', '生活', '原创文学', '设计', '手写', '美食', '旅行', '猫咪'],
  };
  const DEFAULT_TAGS = CATALOG.defaultTags;

  function decodeCursor(s) {
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
      if (o && typeof o.i === 'number' && o.offs) return o;
    } catch (e) {}
    try {
      const o = JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')));
      if (o && typeof o.i === 'number' && o.offs) return o;
    } catch (e) {}
    return null;
  }
  function encodeCursor(o) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function heatScore(p) {
    const s = p.stats || {};
    const heat = (s.like || 0) + (s.comment || 0) * 3 + (s.reblog || 0) * 2 + (s.share || 0);
    const days = p.time ? (Date.now() - p.time) / 86400000 : 30;
    return Math.log10(heat + 1) * 100 + Math.max(0, 7 - days) * 4;
  }

  async function feed(params) {
    const tags = String(params.tags || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
    const list = tags.length ? tags : DEFAULT_TAGS;
    const sort = params.sort === 'hot' ? 'hot' : 'week';
    const st = decodeCursor(params.cursor) || { i: 0, offs: {}, types: {} };
    const state = {
      i: st.i || 0,
      offs: Object.assign({}, st.offs || {}),
      types: Object.assign({}, st.types || {}),
    };
    const out = [];
    const seen = new Set();
    let guard = 0;
    while (guard < 3) {
      const tag = list[state.i % list.length];
      const type = state.types[tag] || sort;
      const offset = state.offs[tag] || 0;
      guard++;
      try {
        let page = await cached('tag:' + type + ':' + tag + ':' + offset, 120e3, () => tagPosts(tag, offset, type));
        if (!page.posts.length && type === 'week') {
          state.types[tag] = 'new';
          page = await cached('tag:new:' + tag + ':0', 120e3, () => tagPosts(tag, 0, 'new'));
          state.offs[tag] = page.nextOffset;
        } else {
          state.offs[tag] = page.nextOffset;
        }
        state.i++;
        for (const p of page.posts) {
          if (seen.has(p.id) || p.ai) continue;
          seen.add(p.id);
          out.push(p);
        }
        if (out.length >= 20) break;
      } catch (e) {
        state.i++;
        if (guard >= 3) throw e;
      }
    }
    out.sort((a, b) => heatScore(b) - heatScore(a));
    return { posts: out.slice(0, 24), cursor: encodeCursor(state), tags: list };
  }

  // ---------------- 登录态 ----------------
  async function probeLogin() {
    try {
      const text = await req('https://api.lofter.com/v1.1/usercounts.api?product=' + PRODUCT, {
        method: 'POST',
        body: '',
        headers: { 'User-Agent': APP_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const j = JSON.parse(text);
      return !!(j.meta && j.meta.status === 200);
    } catch (e) {
      return false;
    }
  }

  // ---------------- 账号资料 / 订阅标签 ----------------
  const ME_INFO_BASE = 'https://api.lofter.com/v1.1/meInfo.api?product=' + PRODUCT;
  const BLOG_INFO_BASE = 'https://api.lofter.com/v1.1/blogInfoManage.api?product=' + PRODUCT;
  const USERCOUNTS_BASE = 'https://api.lofter.com/v1.1/usercounts.api?product=' + PRODUCT;
  const FAV_TAGS_URL = 'https://api.lofter.com/newtag/getFavoriteTags.json?product=' + PRODUCT + '&limit=100';
  const postEmpty = (url) => req(url, {
    method: 'POST',
    body: '',
    headers: { 'User-Agent': APP_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  let myDomainCache = '';

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return '';
  }

  /** 在未知结构的 JSON 里按 key 名找第一个非空值 */
  function deepFind(obj, keys, depth) {
    depth = depth || 0;
    if (!obj || typeof obj !== 'object' || depth > 4) return '';
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null && v !== '' && typeof v !== 'object') return v;
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === 'object') {
        const r = deepFind(v, keys, depth + 1);
        if (r !== '' && r !== null && r !== undefined) return r;
      }
    }
    return '';
  }

  function envelopeOk(j) {
    return (j && j.meta && j.meta.status === 200) || (j && j.code === 0);
  }
  function envelopeData(j) {
    return (j && j.response) || (j && j.data) || {};
  }

  async function fetchEnvelope(url) {
    try {
      const j = JSON.parse(await postEmpty(url));
      if (!envelopeOk(j)) return { error: (j.meta && j.meta.msg) || j.msg || '登录已失效' };
      return { data: envelopeData(j) };
    } catch (e) {
      return { error: e.message };
    }
  }

  function blogEntity(r) {
    return r.blogInfo || r.userInfo || r.meInfo || r.blog || r;
  }

  async function myDomain() {
    if (myDomainCache) return myDomainCache;
    const tries = [
      BLOG_INFO_BASE + '&optype=blogdata',
      ME_INFO_BASE,
      BLOG_INFO_BASE,
      USERCOUNTS_BASE,
    ];
    for (const url of tries) {
      const r = await fetchEnvelope(url);
      if (!r.data) continue;
      const d = deepFind(blogEntity(r.data), ['blogName', 'blogDomain', 'domain']);
      if (d) { myDomainCache = d; return d; }
    }
    return '';
  }

  async function getProfile() {
    const domain = await myDomain();
    const host = domain && /\.lofter\.com$/.test(domain) ? domain : (domain ? domain + '.lofter.com' : '');
    const urls = [
      BLOG_INFO_BASE + '&optype=blogdata',
      ME_INFO_BASE + (host ? '&blogdomain=' + encodeURIComponent(host) + '&portrait=1' : ''),
      ME_INFO_BASE,
      BLOG_INFO_BASE,
      USERCOUNTS_BASE,
    ];
    let lastErr = '';
    for (const url of urls) {
      const r = await fetchEnvelope(url);
      if (!r.data) { lastErr = r.error || lastErr; continue; }
      const b = blogEntity(r.data);
      const nick = deepFind(b, ['blogNickName', 'nickName', 'nickname', 'userName']);
      const name = deepFind(b, ['blogName', 'blogDomain', 'domain']);
      const avatar = deepFind(b, ['bigAvaImg', 'bigAvatar', 'avatar', 'headImg', 'avatarImg']);
      if (nick || name || avatar) {
        let counts = {};
        try {
          const ur = await fetchEnvelope(USERCOUNTS_BASE);
          if (ur.data) counts = ur.data;
        } catch (e) {}
        // usercounts 的真实结构：response.userStatistic 里是 followingCount / favoritePostCount，
        // response.counts 是「每个博客一份」的数组（数组元素里有 followerCount / followingCount）
        const stat = (counts && counts.userStatistic) || {};
        const blogCounts = counts && Array.isArray(counts.counts) ? (counts.counts[0] || {}) : ((counts && counts.counts) || {});
        return {
          nick: nick || name || 'LOFTER 用户',
          name,
          avatar,
          intro: deepFind(b, ['selfIntro', 'intro', 'description']),
          // 个人主页要显示「IP 属地」和「LOFTER ID」，这两个字段在 blogdata / meInfo 里不总是同一层
          ip: deepFind(b, ['ipLocation', 'ipRegion', 'ipArea', 'ip']) || '',
          id: deepFind(b, ['blogId', 'id']),
          counts: {
            following: Number(stat.followingCount || blogCounts.followingCount || deepFind(counts, ['followCount', 'follows', 'following', 'attentionCount']) || 0),
            followers: Number(blogCounts.followerCount || stat.followerCount || deepFind(counts, ['fansCount', 'followers', 'fans', 'followerCount']) || 0),
            // LOFTER 把「喜欢」和「收藏」分开：喜欢是红心列表（favoritePostCount），
            // 收藏是收藏夹里的作品数（subscribePostCount），推荐是转发出去的作品数（sharePostCount）。
            likes: Number(stat.favoritePostCount || 0),
            collections: Number(stat.subscribePostCount || 0),
            shares: Number(stat.sharePostCount || 0),
            favorites: Number(stat.favoritePostCount || 0),
          },
        };
      }
      lastErr = '资料字段未识别: ' + Object.keys(b).slice(0, 8).join(',');
    }
    throw new Error(lastErr || '资料读取失败');
  }

  function collectTags(d, out) {
    const arrays = [d.favoriteTags, d.tags, d.subscribeTags, d.recommendTags, d.recentVisitTags];
    arrays.forEach((list, idx) => {
      if (!Array.isArray(list)) return;
      const explicit = idx <= 2;
      list.forEach((t) => {
        if (!t) return;
        if (typeof t === 'string') { if (explicit) out.push(t); return; }
        const name = t.name || t.tagName || t.tag || t.tagNameStr;
        const sub = t.subscribe === true || t.subscribed === true || t.isSubscribe === true
          || t.subscribe === 1 || t.isSubscribe === 1;
        if (name && (explicit || sub)) out.push(name);
      });
    });
  }

  async function getSubscribedTags() {
    const out = [];
    const uniq = new Set();
    // page=1 会一次返回全部订阅标签（实测 30 个）
    try {
      const j = JSON.parse(await postEmpty(FAV_TAGS_URL + '&offset=0&page=1'));
      if (j && j.code === 0 && j.data) collectTags(j.data, out);
      for (const n of out) uniq.add(n);
    } catch (e) {}
    if (uniq.size) return [...uniq];

    let offset = 0;
    for (let page = 0; page < 30; page++) {
      let j;
      try {
        j = JSON.parse(await postEmpty(FAV_TAGS_URL + '&offset=' + offset));
      } catch (e) { break; }
      if (!j || j.code !== 0 || !j.data) break;
      const before = uniq.size;
      collectTags(j.data, out);
      for (const n of out) uniq.add(n);
      const added = uniq.size - before;
      const next = typeof j.data.offset === 'number' ? j.data.offset : -1;
      if (!added) break;
      offset = next > offset ? next : offset + 10;
    }
    if (!uniq.size) {
      try {
        const j = JSON.parse(await postEmpty('https://api.lofter.com/newtag/favoriteTagTop.json?product=' + PRODUCT));
        if (j.code === 0 && j.data) collectTags(j.data, out);
      } catch (e) {}
      for (const n of out) uniq.add(n);
    }
    return [...uniq];
  }

  // ---------------- 关注流（官方时间线） ----------------
  const TIMELINE_SHARE_URL = 'https://api.lofter.com/timeline/app/getTrackItemListWithShare.json?product=' + PRODUCT;

  function normTimelineGroupPost(p2, g) {
    const bi = g.blogInfo || g;
    const author = {
      id: bi.blogId || g.blogId || p2.blogId || 0,
      name: bi.blogName || g.blogName || '',
      nick: deepFind(bi, ['blogNickName', 'nickName']) || bi.blogName || g.blogName || 'LOFTER 用户',
      avatar: deepFind(bi, ['bigAvaImg', 'bigAvatar', 'avatar']) || '',
      intro: bi.selfIntro || '',
      url: (bi.blogName || g.blogName) ? 'https://' + (bi.blogName || g.blogName) + '.lofter.com' : '',
    };
    const rawTags2 = Array.isArray(p2.tagList) ? p2.tagList
      : String(p2.tag || '').split(',').map((x) => x.trim()).filter(Boolean);
    const tags2 = rawTags2.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
    const isRec = !!(
      p2.citeParentPostId || p2.citeRootPostId || p2.reblog || p2.isReblog
      || (p2.blogId && author.id && String(p2.blogId) !== String(author.id))
    );
    return {
      rec: isRec,
      thumbs: [],
      photoCount: Number(p2.photoCount || 0) || 0,
      originBlogId: p2.blogId || bi.blogId || 0,
      id: p2.postId || p2.id,
      type: p2.type,
      title: decodeEntities(p2.title || ''),
      digest: stripHtml(p2.digest || p2.content || '').slice(0, 400),
      tags: tags2,
      ai: tags2.some(isAiTag),
      time: p2.publishTime || 0,
      edited: Number(p2.modifyTime) || 0,
      author,
      stats: { like: 0, comment: 0, reblog: 0, share: 0, view: 0, hot: 0 },
      cover: p2.image || p2.firstImage || p2.cover || '',
      coverW: 0,
      coverH: 0,
      permalink: p2.permalink || '',
      url: author.name && p2.permalink ? 'https://' + author.name + '.lofter.com/post/' + p2.permalink : '',
      hot: 0,
      wordCount: 0,
      locked: false,
    };
  }

  async function followFeed(cursor) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const [po, so, sh] = String(cursor || '0,0,0').split(',').map((n) => Number(n) || 0);
    const url = TIMELINE_SHARE_URL + '&publishOffset=' + po + '&shareOffset=' + so + '&showOffset=' + sh;
    const text = await req(url, { headers: { 'User-Agent': APP_UA, Accept: 'application/json' } });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('关注流返回了异常内容'); }
    if (!j || j.code !== 0 || !j.data) throw new Error((j && j.msg) || '关注流读取失败');
    const d = j.data;
    const posts = [];
    let debug = null;
    for (const it of d.items || []) {
      if (!it) continue;
      if (!debug) {
        const bi = findBlogInfo(it);
        debug = {
          itemKeys: Object.keys(it),
          postDataKeys: it.postData ? Object.keys(it.postData) : [],
          postViewKeys: it.postData && it.postData.postView ? Object.keys(it.postData.postView) : [],
          blogInfo: bi ? Object.keys(bi).slice(0, 24) : null,
        };
      }
      const t = it.type;
      if (t === 1 || t === 2 || t === 5) {
        const pv = (it.postData && (it.postData.postView || it.postData)) || it.postView || it.post || it.postData;
        if (pv && (pv.id || pv.postId)) {
          const merged = Object.assign({}, it.postData || {}, pv || {});
          if (!merged.blogInfo) merged.blogInfo = it.blogInfo || pv.blogInfo || findBlogInfo(it) || null;
          const n = normPost(merged);
          if (n && n.id) {
            // item.type：1 = 关注的人自己发的，2 = 关注的人推荐的（shareInfo 里是推荐人）
            n.rec = t === 2 || !!it.shareInfo;
            const sbi = it.shareInfo && it.shareInfo.blogInfo;
            if (sbi) n.recBy = sbi.blogNickName || sbi.blogName || '';
            posts.push(n);
          }
        }
      }
    }
    for (const g of d.timelineBlogList || []) {
      if (!g || !Array.isArray(g.posts)) continue;
      for (const p2 of g.posts) posts.push(normTimelineGroupPost(p2, g));
    }
    const seen = new Set();
    const merged = posts.filter((p) => {
      if (!p || !p.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return !p.ai && !p.draft && !p.audit;
    });
    merged.sort((a, b) => (b.time || 0) - (a.time || 0));
    return {
      posts: merged,
      cursor: [d.publishOffset || 0, d.shareOffset || 0, d.showOffset || 0].join(','),
      done: !d.hasNext,
      total: merged.length,
      groups: (d.items || []).length,
      sample: d.items && d.items[0] ? JSON.stringify(d.items[0]).slice(0, 2500) : '',
      authorDebug: debug,
      keys: [],
      postKeys: [],
    };
  }

  // ---------------- 关注 / 粉丝列表 ----------------
  const RELATION_URLS = {
    following: 'https://api.lofter.com/v1.1/userfollowing.api?product=' + PRODUCT,
    fans: 'https://api.lofter.com/v1.1/blogfollower.api?product=' + PRODUCT,
  };

  async function relationList(type, offset) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const kind = type === 'fans' ? 'fans' : 'following';
    const domain = await myDomain();
    const host = domain && /\.lofter\.com$/.test(domain) ? domain : (domain ? domain + '.lofter.com' : '');
    if (!host) throw new Error('没读到账号域名，先点右上角刷新试试');
    const off = Number(offset) || 0;
    const url = RELATION_URLS[kind] + '&blogdomain=' + encodeURIComponent(host) + '&offset=' + off + '&limit=20';
    const text = await req(url, { headers: { 'User-Agent': APP_UA, Accept: 'application/json' } });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('列表返回了异常内容'); }
    const meta = j.meta || {};
    if (meta.status && meta.status !== 200) throw new Error(meta.msg || '列表读取失败');
    const arr = (j.response || []).filter(Boolean);
    const list = arr.map((it) => {
      const bi = it.blogInfo || {};
      return {
        id: bi.blogId || it.blogId || 0,
        name: bi.blogName || '',
        nick: bi.blogNickName || bi.blogName || 'LOFTER 用户',
        avatar: bi.bigAvaImg || '',
        intro: bi.selfIntro || '',
        followers: Number(it.follower || 0) || 0,
        following: it.following === undefined ? null : !!it.following,
        time: it.followTime || 0,
      };
    }).filter((x) => x.name);
    return { list, next: list.length >= 20 ? off + arr.length : -1, hasMore: arr.length >= 20, type: kind };
  }

  // ---------------- 账号作品列表：喜欢 / 推荐 ----------------
  const BATCH_URL = 'https://api.lofter.com/v1.1/batchdata.api?product=' + PRODUCT
    + '&supportposttypes=1,2,3,4,5,6&postdigestnew=1&returnData=1';

  // method=favorites 是「喜欢」（红心），method=shares 是「推荐」（转发出去的作品）
  async function accountPosts(method, offset) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const domain = await myDomain();
    const host = domain && /\.lofter\.com$/.test(domain) ? domain : (domain ? domain + '.lofter.com' : '');
    if (!host) throw new Error('没读到账号域名，先点右上角刷新试试');
    const off = Number(offset) || 0;
    const url = BATCH_URL + '&method=' + method + '&blogdomain=' + encodeURIComponent(host) + '&offset=' + off + '&limit=20';
    const text = await req(url, { headers: { 'User-Agent': APP_UA, Accept: 'application/json' } });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('列表返回了异常内容'); }
    const meta = j.meta || {};
    if (meta.status && meta.status !== 200) throw new Error(meta.msg || '列表读取失败');
    const d = j.response || {};
    const items = (d.items || []).filter(Boolean);
    const posts = items.map(normPost).filter(Boolean).filter((p) => !p.ai && !p.draft && !p.audit);
    return {
      posts,
      count: Number(d.count) || 0,
      nextOffset: posts.length ? off + items.length : -1,
      hasMore: items.length >= 20,
    };
  }

  const favoritePosts = (offset) => accountPosts('favorites', offset);
  const sharedPosts = (offset) => accountPosts('shares', offset);

  // ---------------- 账号收藏夹（收藏） ----------------
  const FOLDER_LIST_URL = 'https://api.lofter.com/newapi/subFolder/list.json?offset=0&postId=0&blogId=0&type=1';
  const FOLDER_DETAIL_URL = 'https://api.lofter.com/newapi/subFolder/getDetail.json';

  async function collectionFolders() {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const text = await req(FOLDER_LIST_URL, { headers: { 'User-Agent': APP_UA, Accept: 'application/json' } });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('收藏夹返回了异常内容'); }
    if (j && j.code !== 0) throw new Error(j.msg || '收藏夹读取失败');
    const d = j.data || {};
    const folders = (d.folders || []).filter(Boolean).map((f) => ({
      id: Number(f.id) || 0,
      name: f.name || '未命名收藏夹',
      cover: f.coverUrl || '',
      postCount: Number(f.postCount) || 0,
      description: f.description || '',
      isDefault: !!f.isDefault,
    })).filter((f) => f.id);
    return { folders, total: folders.reduce((s, f) => s + f.postCount, 0) };
  }

  async function collectionPosts(folderId, offset) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const id = Number(folderId) || 0;
    if (!id) throw new Error('收藏夹参数不对');
    const off = Number(offset) || 0;
    const url = FOLDER_DETAIL_URL + '?folderId=' + id + '&offset=' + off + '&limit=20';
    const text = await req(url, { headers: { 'User-Agent': APP_UA, Accept: 'application/json' } });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('收藏夹返回了异常内容'); }
    if (!j || j.code !== 0) throw new Error((j && j.msg) || '收藏夹读取失败');
    const d = j.data || {};
    const folder = d.folder ? { id: Number(d.folder.id) || id, name: d.folder.name || '收藏夹', postCount: Number(d.folder.postCount) || 0 } : null;
    const posts = [];
    for (const it of d.posts || []) {
      if (!it) continue;
      const pd = it.postData || it;
      const pv = pd.postView || pd;
      if (!pv || !(pv.id || pv.postId)) continue;
      const merged = Object.assign({}, pd, pv);
      if (!merged.blogInfo) merged.blogInfo = pd.blogInfo || it.blogInfo || null;
      const n = normPost(merged);
      if (n && n.id) posts.push(n);
    }
    const clean = posts.filter((p) => !p.ai && !p.draft && !p.audit);
    return {
      posts: clean,
      folder,
      nextOffset: clean.length ? off + (d.posts || []).length : -1,
      hasMore: (d.posts || []).length >= 20,
    };
  }

  // ---------------- 合集（专栏）----------------
  // 和「收藏夹」不是一回事：合集是作者自己给作品分组的专栏。
  // 列表：POST /v1.1/postCollection.api method=getCollectionList&blogdomain=…
  // 详情：POST /v1.1/postCollection.api method=getCollectionDetail&blogid=&collectionid=&offset=&order=1
  const COLLECTION_URL = 'https://api.lofter.com/v1.1/postCollection.api?product=' + PRODUCT;
  const COLLECTION_HEADERS = { 'User-Agent': APP_UA, Accept: '*/*' };

  function normCollection(c) {
    if (!c) return null;
    return {
      id: Number(c.id) || 0,
      blogId: Number(c.blogId) || 0,
      name: c.name || '未命名合集',
      desc: c.description || '',
      cover: c.coverUrl || '',
      postCount: Number(c.postCount) || 0,
      tags: c.tags ? String(c.tags).split(',').filter(Boolean) : [],
      time: Number(c.lastPublishTime) || Number(c.createTime) || 0,
    };
  }

  async function blogCollections(blogName, offset) {
    const name = String(blogName || '').replace(/\s/g, '');
    if (!name) throw new Error('缺少博主');
    const off = Number(offset) || 0;
    const form = {
      blogdomain: name + '.lofter.com',
      method: 'getCollectionList',
      offset: String(off),
      limit: '20',
    };
    const text = await req(COLLECTION_URL, {
      method: 'POST',
      body: new URLSearchParams(form).toString(),
      headers: COLLECTION_HEADERS,
    });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('合集返回了异常内容'); }
    const status = (j.meta && j.meta.status) || j.code;
    if (status && status !== 200 && status !== 0) throw new Error((j.meta && j.meta.msg) || '合集读取失败');
    const resp = j.response || {};
    const list = (resp.collections || []).map(normCollection).filter((c) => c && c.id);
    return {
      collections: list,
      next: list.length >= 20 ? off + list.length : -1,
      hasMore: list.length >= 20,
    };
  }

  async function collectionDetail(blogName, blogId, collectionId, offset) {
    const cid = Number(collectionId) || 0;
    if (!cid) throw new Error('合集参数不对');
    const off = Number(offset) || 0;
    const form = {
      blogdomain: String(blogName || '').replace(/\s/g, '') + '.lofter.com',
      method: 'getCollectionDetail',
      blogid: String(blogId || 0),
      collectionid: String(cid),
      offset: String(off),
      order: '1',
    };
    const text = await req(COLLECTION_URL, {
      method: 'POST',
      body: new URLSearchParams(form).toString(),
      headers: COLLECTION_HEADERS,
    });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('合集返回了异常内容'); }
    const status = (j.meta && j.meta.status) || j.code;
    if (status && status !== 200 && status !== 0) throw new Error((j.meta && j.meta.msg) || '合集读取失败');
    const resp = j.response || {};
    const collection = normCollection(resp.collection);
    const items = resp.items || resp.posts || [];
    const posts = [];
    for (const it of items) {
      if (!it) continue;
      const pv = it.post || it.postView || it;
      const n = normPost(pv);
      if (n && n.id) posts.push(n);
    }
    const clean = posts.filter((p) => !p.ai && !p.draft && !p.audit);
    const nextOffset = typeof resp.offset === 'number' ? resp.offset : (items.length ? off + items.length : -1);
    return {
      collection: collection || { id: cid, blogId: Number(blogId) || 0, name: '合集', postCount: 0 },
      posts: clean,
      nextOffset,
      hasMore: nextOffset >= 0 && items.length > 0,
    };
  }

  async function replies(blogId, postId, commentId, offset) {
    const base = 'https://www.lofter.com/comment/l2/page.json?postId=' + postId
      + '&blogId=' + blogId + '&offset=' + (offset || 0) + '&product=' + PRODUCT;
    const variants = [
      base + '&commentId=' + commentId,
      base + '&parentId=' + commentId,
      base + '&id=' + commentId,
    ];
    let lastMsg = '回复加载失败';
    for (const url of variants) {
      let doc;
      try {
        const text = await req(url, { headers: { Referer: 'https://www.lofter.com/' } });
        doc = JSON.parse(text);
      } catch (e) { continue; }
      if (doc && doc.code === 0) {
        const d = doc.data || {};
        return {
          list: (d.list || []).map(normComment),
          next: typeof d.offset === 'number' ? d.offset : -1,
        };
      }
      lastMsg = (doc && doc.msg) || lastMsg;
    }
    throw new Error(lastMsg);
  }

  async function syncBlocks() {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const base = 'https://api.lofter.com/v1.1/';
    const out = { blogs: [], tags: [], keys: {}, errors: [] };
    const tries = [
      { key: 'blogs', url: base + 'blacklistmanage.api?product=' + PRODUCT + '&optype=get&offset=0&limit=100' },
      { key: 'tags', url: base + 'forbidtagsmanage.api?product=' + PRODUCT + '&optype=get' },
    ];
    for (const t of tries) {
      try {
        const text = await req(t.url, { headers: { 'User-Agent': APP_UA, Accept: 'application/json' } });
        const j = JSON.parse(text);
        if (j && j.meta && j.meta.status !== 200) {
          out.errors.push(t.key + ': ' + (j.meta.msg || j.meta.desc || j.meta.status));
          continue;
        }
        const d = (j && (j.response || j.data)) || {};
        out.keys[t.key] = Object.keys(d);
        const arr = d.blogs || d.list || d.items || d.blackList || d.tags || d.blackTags || [];
        for (const it of arr) {
          if (t.key === 'blogs') {
            if (!it) continue;
            const b = it.blogInfo || it;
            const n = b.blogName || it.blogName || it.domain;
            if (!n) continue;
            out.blogs.push({
              name: n,
              nick: b.blogNickName || b.nickName || n,
              avatar: b.bigAvaImg || b.avatar || b.headImg || '',
              time: Number(it.time || it.blackTime || it.createTime || b.blackTime || 0) || 0,
            });
          } else {
            const n = typeof it === 'string' ? it : (it.tagName || it.name || it.tag);
            if (n) out.tags.push(n);
          }
        }
      } catch (e) { out.errors.push(t.key + ': ' + e.message); }
    }
    const bm = new Map();
    for (const b of out.blogs) if (b && b.name && !bm.has(b.name)) bm.set(b.name, b);
    out.blogs = [...bm.values()];
    out.tags = [...new Set(out.tags)];
    return out;
  }

  // 用 blogId 反查博客基本信息（本机屏蔽列表里只有 ID 的条目靠它补名字）
  async function blogBriefById(blogId) {
    const id = Number(blogId) || 0;
    if (!id) throw new Error('缺少 blogId');
    const text = await req('https://api.lofter.com/v2.0/blogHomePage.api?product=' + PRODUCT
      + '&targetblogid=' + id + '&method=getBlogInfoDetail&checkpwd=1&returnData=1', {
      headers: { 'User-Agent': APP_UA, Accept: 'application/json' },
    });
    const j = JSON.parse(text);
    const bi = (j && j.response && (j.response.blogInfo || j.response)) || {};
    if (!bi.blogName) throw new Error('这个用户查不到主页');
    return {
      id,
      name: bi.blogName,
      nick: bi.blogNickName || bi.blogName,
      avatar: bi.bigAvaImg || bi.avatarBoxImage || '',
      intro: bi.selfIntro || '',
    };
  }

  // 回读详情里的 liked：上游有时对点赞回 200 却没真正写进账号，
  // 只有详情里的 liked 才算数（否则会出现「本地亮了、退出重进又变回未喜欢」）
  async function likedState(blogId, postId) {
    const resp = await callApi(DETAIL_URL, {
      targetblogid: String(blogId), blogId: String(blogId), postid: String(postId),
      supportposttypes: POST_TYPES, offset: 0, requestType: 1, postdigestnew: 1, checkpwd: 1, needgetpoststat: 1,
    });
    const entry = (resp.posts || [])[0];
    if (!entry) return null;
    return !!(entry.liked || (entry.post && entry.post.liked));
  }

  // 点赞：必须 POST 表单，参数是 liketype=like|unlike + postid + blogid + scene
  // （GET + like=1 的老写法上游只回 4101，2026-11 真机确认）
  // ---------------- 滑块验证（风控 4071） ----------------
  // 桥里没有通用的「任意方法 + 回调」入口，这里复用 http 那套 id 分片回调，
  // 直接调 Bridge 暴露的 captchaGet / captchaCheck。
  function nativeCall(method, args) {
    return new Promise((resolve, reject) => {
      const fn = N && N[method];
      if (typeof fn !== 'function') return reject(new Error('当前客户端版本不支持验证码'));
      const id = 'c' + (++seq);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('验证码请求超时'));
      }, 30000);
      pending.set(id, { parts: [], resolve, reject, timer });
      try {
        fn.apply(N, [id].concat(args || []));
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async function captchaChallenge() {
    const text = await nativeCall('captchaGet', []);
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error('验证码返回异常'); }
    if (doc.__error) throw new Error('获取验证码失败（' + doc.__error + '）');
    if (doc.code !== 0 || !doc.data || !doc.data.id) throw new Error(doc.msg || '获取验证码失败');
    return doc.data; // { id, type, bg, front }
  }

  async function captchaVerify(challengeId, xPos) {
    const text = await nativeCall('captchaCheck', [String(challengeId), Math.round(xPos)]);
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error('验证失败，请重试'); }
    if (doc.__error) throw new Error('验证失败（' + doc.__error + '）');
    const ok = !!(doc.data && doc.data.success) || doc.code === 0;
    if (!ok) throw new Error((doc.data && doc.data.msg) || doc.msg || '验证没通过，重新拖一次');
    return true;
  }

  async function likePost(blogId, postId, like) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const url = 'https://api.lofter.com/v1.1/like.api?product=' + PRODUCT;
    const form = {
      liketype: like ? 'like' : 'unlike',
      postid: String(postId),
      blogid: String(blogId),
      scene: 'note',
      portrait: DEVICE_PORTRAIT,
    };
    const text = await req(url, {
      method: 'POST',
      body: new URLSearchParams(form).toString(),
      headers: WRITE_HEADERS,
    });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('点赞返回异常'); }
    const meta = (j && j.meta) || {};
    const ok = !!(j && (meta.status === 200 || j.code === 0));
    if (ok) return { ok: true };
    if (meta.status === 4071) {
      const err = new Error('LOFTER 要求人机验证');
      err.needCaptcha = true;
      throw err;
    }
    // 4102「参数异常」：可能是已经处于目标状态（重复点赞/取消），也可能真的没成功。
    // 用详情里的 liked 判断，别把失败当成功（曾经就是这么静默丢点赞的）。
    if (meta.status === 4102) {
      let actual = null;
      try { actual = await likedState(blogId, postId); } catch (e) { actual = null; }
      if (actual === !!like) return { ok: true, already: true };
      throw new Error(like
        ? 'LOFTER 没有接受这次喜欢（可能被限制）'
        : 'LOFTER 没有接受取消喜欢（可能被限制）');
    }
    throw new Error(meta.msg || (j && j.msg) || '点赞失败');
  }

  // APK：弹系统分享面板（Bridge.share 里走 Intent.ACTION_SEND），不要把人丢进浏览器
  function sharePost(title, url) {
    if (!url) throw new Error('没有可分享的链接');
    try {
      if (window.Native && window.Native.share) {
        window.Native.share(String(title || ''), String(url));
        return { ok: true };
      }
    } catch (e) {}
    try {
      if (window.Native && window.Native.copy) {
        window.Native.copy(String(url));
        return { ok: true, copied: true };
      }
    } catch (e) {}
    throw new Error('当前环境不支持分享');
  }

  // ---- 搜索（/newsearch/* 系列：返回 {msg, code, data}，和别的接口不是一套结构）----
  async function searchJson(path, params) {
    const qs = new URLSearchParams(Object.assign({ product: PRODUCT }, params)).toString();
    const text = await req('https://api.lofter.com' + path + '?' + qs, {
      headers: { 'User-Agent': APP_UA, Accept: '*/*' },
    });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('搜索返回异常'); }
    if (j.code !== 0) throw new Error(j.msg || '搜索失败');
    return j.data || {};
  }

  async function searchTags(key, offset) {
    const k = String(key || '').trim();
    if (!k) return { list: [], next: 0, hasMore: false };
    const d = await searchJson('/newsearch/tag.json', { key: k, offset: Number(offset) || 0 });
    return {
      list: (d.tags || []).map((t) => ({ name: t.tagName || '', count: Number(t.joinCount) || 0, cover: t.imageUrl || '' })).filter((t) => t.name),
      next: Number(d.offset) || 0,
      hasMore: Number(d.offset) > 0,
    };
  }

  async function searchBlogs(key, offset) {
    const k = String(key || '').trim();
    if (!k) return { list: [], next: 0, hasMore: false };
    const d = await searchJson('/newsearch/blog.json', { key: k, offset: Number(offset) || 0 });
    return {
      list: (d.blogs || []).map((b) => {
        const bi = b.blogInfo || b;
        return {
          id: bi.blogId,
          name: bi.blogName || '',
          nick: bi.blogNickName || bi.blogName || '',
          avatar: bi.bigAvaImg || '',
          intro: bi.selfIntro || '',
        };
      }).filter((b) => b.name),
      next: Number(d.offset) || 0,
      hasMore: Number(d.offset) > 0,
    };
  }

  async function searchPosts(key, offset) {
    const k = String(key || '').trim();
    if (!k) return { list: [], total: 0, next: 0, hasMore: false };
    const d = await searchJson('/newsearch/post.json', { key: k, offset: Number(offset) || 0 });
    return {
      list: (d.posts || []).map((p) => normPost(p.post || p)).filter(Boolean),
      total: Number(d.totalCount) || 0,
      next: Number(d.offset) || 0,
      hasMore: Number(d.offset) > 0,
    };
  }

  // ---- 写进账号：屏蔽（不想看 TA 的动态）/ 屏蔽标签 / 拉黑 ----
  async function writeAccount(url, form, what) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const text = await req(url, {
      method: 'POST',
      body: new URLSearchParams(form).toString(),
      headers: Object.assign({}, WRITE_HEADERS, { 'Content-Type': 'application/x-www-form-urlencoded' }),
    });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error(what + '返回异常'); }
    const meta = (j && j.meta) || {};
    if (meta.status === 4071) {
      const err = new Error('LOFTER 认为操作太快，需要先完成人机验证');
      err.needCaptcha = true;
      throw err;
    }
    const ok = (meta.status === 200) || (j && j.code === 0);
    if (!ok) throw new Error(meta.msg || (j && j.msg) || (what + '失败'));
    return { ok: true };
  }

  function shieldBlogAccount(blogId, on) {
    return writeAccount('https://api.lofter.com/timeline/manage.json?product=' + PRODUCT,
      { op: on ? 'shield' : 'show', blogId: String(blogId) }, '同步屏蔽');
  }

  function shieldTagAccount(tag, on) {
    return writeAccount('https://api.lofter.com/v1.1/forbidtagsmanage.api?product=' + PRODUCT,
      { optype: on ? 'add' : 'del', tag: String(tag) }, '同步标签屏蔽');
  }

  function blockBlogAccount(blogId, on) {
    return writeAccount('https://api.lofter.com/v1.1/blacklistmanage.api?product=' + PRODUCT,
      { optype: on ? 'add' : 'del', targetblogid: String(blogId) }, '同步拉黑');
  }

  // 标签订阅：写的是账号数据（会同步到官方 App / 网页端）
  async function subscribeTagAccount(tag, on) {
    const r = await writeAccount('https://api.lofter.com/v1.1/subscribetag.api?product=' + PRODUCT,
      { optype: on ? 'add' : 'del', tag: String(tag), id: '0' }, on ? '订阅标签' : '取消订阅标签');
    cache.delete('subscribed'); // 订阅列表变了，下次重新拉
    return r;
  }

  async function tagConfig(tag) {
    const text = await req('https://api.lofter.com/v1.1/newTag.api?product=' + PRODUCT, {
      method: 'POST',
      body: new URLSearchParams({ tag: String(tag), method: 'newTagConfig' }).toString(),
      headers: Object.assign({}, WRITE_HEADERS, { 'Content-Type': 'application/x-www-form-urlencoded' }),
    });
    let j = {};
    try { j = JSON.parse(text); } catch (e) { j = {}; }
    const r = (j && j.response) || {};
    return { favorited: r.favorited === true, image: (r.tagConfig && r.tagConfig.image) || '' };
  }

  async function favoriteTags() {
    const out = [];
    let offset = 0;
    for (let i = 0; i < 8; i++) {
      const text = await req('https://api.lofter.com/newtag/getFavoriteTags.json?offset=' + offset + '&limit=10&withPost=1', {
        headers: { 'User-Agent': APP_UA, Accept: 'application/json' },
      });
      let j = {};
      try { j = JSON.parse(text); } catch (e) { break; }
      const d = (j && j.data) || {};
      const list = d.favoriteTags || [];
      list.forEach((t) => {
        if (t && t.name) out.push({ name: t.name, image: t.image || '', unread: Number(t.unreadCount) || 0 });
      });
      const next = Number(d.offset);
      if (!list.length || !Number.isFinite(next) || next <= offset) break;
      offset = next;
    }
    return { list: out };
  }

  async function followBlog(blogId, domain, follow) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const url = 'https://api.lofter.com/v1.1/follow.api?product=' + PRODUCT
      + (follow ? '' : '&followtype=unfollow')
      + '&targetblogid=' + encodeURIComponent(blogId)
      + '&blogdomain=' + encodeURIComponent(domain + '.lofter.com');
    const text = await req(url, { headers: { 'User-Agent': APP_UA, Accept: 'application/json' } });
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('关注返回异常'); }
    const ok = !!(j && ((j.meta && j.meta.status === 200) || j.code === 0));
    if (j && j.meta && j.meta.status === 4071) {
      const err = new Error('LOFTER 要求人机验证');
      err.needCaptcha = true;
      throw err;
    }
    if (!ok) throw new Error((j && j.meta && j.meta.msg) || (j && j.msg) || '关注失败');
    return { ok };
  }

  async function addComment(blogId, postId, content, parentId) {
    if (!(await probeLogin())) throw new Error('请先登录 LOFTER');
    const form = {
      postId: String(postId),
      blogId: String(blogId),
      content,
      product: PRODUCT,
    };
    if (parentId) { form.parentId = String(parentId); form.replyToId = String(parentId); }
    const j = await callApi('https://www.lofter.com/comment/add.json?product=' + PRODUCT, form);
    const ok = !!(j && (j.meta && j.meta.status === 200 || j.code === 0));
    if (!ok) throw new Error((j && j.meta && j.meta.msg) || (j && j.msg) || '评论失败');
    return { ok };
  }

  async function diag() {
    const out = {};
    try { out.cookie = window.Native.cookieSummary ? window.Native.cookieSummary() : '(无)'; } catch (e) { out.cookie = '读取失败'; }
    try { out.cookieLogged = N.isLoggedIn(); } catch (e) { out.cookieLogged = false; }
    out.probe = await probeLogin();
    out.domain = await myDomain();
    try { const p = await getProfile(); out.profile = p; } catch (e) { out.profileError = e.message; }
    try {
      const f = await followFeed(0);
      out.followCount = f.posts.length;
      out.followKeys = f.keys || [];
      out.followPostKeys = f.postKeys || [];
      out.followAuthorDebug = f.authorDebug || null;
      out.followSample = (f.sample || '').slice(0, 1200);
    } catch (e) { out.followError = e.message; }
    try {
      const t = await getSubscribedTags();
      out.tagCount = t.length;
      out.tags = t.slice(0, 12);
    } catch (e) { out.tagError = e.message; }
    try {
      const j = JSON.parse(await postEmpty(FAV_TAGS_URL + '&offset=0'));
      const d = j.data || {};
      out.tagRaw = {
        code: j.code,
        offset: d.offset,
        keys: Object.keys(d),
        fav: (d.favoriteTags || []).length,
        rec: (d.recommendTags || []).length,
      };
    } catch (e) { out.tagRawError = e.message; }
    try {
      out.tagPages = [];
      let off = 0;
      for (let i = 0; i < 5; i++) {
        const j = JSON.parse(await postEmpty(FAV_TAGS_URL + '&offset=' + off));
        const d = j.data || {};
        out.tagPages.push({ offset: off, fav: (d.favoriteTags || []).length, next: d.offset });
        const next = typeof d.offset === 'number' ? d.offset : -1;
        if (next <= off) break;
        off = next;
      }
    } catch (e) { out.tagPagesError = e.message; }
    try {
      out.tagProbe = [];
      for (const off of [0, 10, 20, 30]) {
        const j = JSON.parse(await postEmpty(FAV_TAGS_URL + '&offset=' + off));
        const d = j.data || {};
        const fav = d.favoriteTags || [];
        out.tagProbe.push({
          off,
          fav: fav.length,
          next: d.offset,
          first: fav[0] ? (fav[0].name || fav[0]) : '',
        });
      }
    } catch (e) { out.tagProbeError = e.message; }
    try {
      out.tagPageProbe = [];
      for (const q of ['&offset=0&page=1', '&offset=0&page=2', '&offset=0&all=1']) {
        const j = JSON.parse(await postEmpty(FAV_TAGS_URL + q));
        const d = j.data || {};
        out.tagPageProbe.push({ q, fav: (d.favoriteTags || []).length, next: d.offset });
      }
    } catch (e) { out.tagPageProbeError = e.message; }
    return out;
  }

  const routes = {
    '/api/feed': (p) => feed(p),
    '/api/tag': (p) => cached('tag:' + (p.sort || 'new') + ':' + p.name + ':' + (p.offset || 0), 120e3,
      () => tagPosts(p.name, Number(p.offset) || 0, p.sort)).then((page) => Object.assign({ tag: p.name, sort: p.sort || 'new' }, page)),
    '/api/taginfo': (p) => tagInfo(p.name),
    '/api/post': (p) => postDetail(p.blogId, p.postId),
    '/api/comments': (p) => comments(p.blogId, p.postId, Number(p.offset) || 0),
    '/api/follow': (p) => followFeed(p.cursor || '0,0,0'),
    '/api/relation': (p) => relationList(p.type, Number(p.offset) || 0),
    '/api/favorites': (p) => favoritePosts(Number(p.offset) || 0),
    '/api/shares': (p) => sharedPosts(Number(p.offset) || 0),
    '/api/collections': () => collectionFolders(),
    '/api/collection-posts': (p) => collectionPosts(p.folderId, Number(p.offset) || 0),
    '/api/blog-collections': (p) => blogCollections(p.name, Number(p.offset) || 0),
    '/api/collection': (p) => collectionDetail(p.name, p.blogId, p.collectionId, Number(p.offset) || 0),
    '/api/like': (p) => likePost(p.blogId, p.postId, p.like === '1'),
    '/api/captcha': () => captchaChallenge(),
    '/api/captcha-check': (p) => captchaVerify(p.challengeId, Number(p.x) || 0),
    '/api/share': (p) => sharePost(p.title, p.url),
    '/api/follow-blog': (p) => followBlog(p.blogId, p.domain, p.follow === '1'),
    '/api/comment-add': (p) => addComment(p.blogId, p.postId, p.content, p.parentId),
    '/api/replies': (p) => replies(p.blogId, p.postId, p.commentId, Number(p.offset) || 0),
    '/api/sync-blocks': () => syncBlocks(),
    '/api/blog-brief': (p) => blogBriefById(p.id),
    '/api/search-tags': (p) => searchTags(p.q, p.offset),
    '/api/search-blogs': (p) => searchBlogs(p.q, p.offset),
    '/api/search-posts': (p) => searchPosts(p.q, p.offset),
    '/api/account-shield-blog': (p) => shieldBlogAccount(p.blogId, p.on === '1'),
    '/api/account-shield-tag': (p) => shieldTagAccount(p.tag, p.on === '1'),
    '/api/account-block-blog': (p) => blockBlogAccount(p.blogId, p.on === '1'),
    '/api/me': () => cached('me', 5 * 60e3, getProfile),
    '/api/subscribed': () => cached('subscribed', 10 * 60e3, getSubscribedTags),
    '/api/tag-config': (p) => tagConfig(p.tag),
    '/api/subscribe-tag': (p) => subscribeTagAccount(p.tag, p.on === '1'),
    '/api/favorite-tags': () => favoriteTags(),
    '/api/diag': () => diag(),
    '/api/blog': (p) => blogHome(p.name, Number(p.offset) || 0),
    '/api/catalog': () => CATALOG,
    '/api/search': (p) => {
      const raw = String(p.q || '').trim().toLowerCase();
      const tags = [];
      if (raw) {
        CATALOG.categories.forEach((c) => c.tags.forEach((t) => {
          if (t.toLowerCase().includes(raw) && tags.indexOf(t) < 0) tags.push(t);
        }));
      }
      return { q: p.q || '', tags: tags.slice(0, 12) };
    },
  };

  // 保存图片：走原生 Bridge.saveImage，成功返回相册里的路径（下载与写相册都在 Java 侧做，
  // 网页版没法直接写相册，app.js 会退化成 <a download> 或提示长按）。
  function saveImage(url, name) {
    return new Promise((resolve, reject) => {
      if (!N.saveImage) return reject(new Error('当前版本不支持保存图片'));
      const id = 'i' + (++seq);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('保存超时'));
      }, 60000);
      pending.set(id, {
        parts: [],
        resolve: (text) => resolve({ ok: true, path: text }),
        reject,
        timer,
      });
      try {
        N.saveImage(id, url, name || '');
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  // 读剪贴板：拿系统剪贴板的纯文本，用来识别「复制了 LOFTER 作品链接」
  function readClipboard() {
    return new Promise((resolve, reject) => {
      if (!N.readClipboard) return reject(new Error('当前版本不支持读剪贴板'));
      const id = 'c' + (++seq);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('读剪贴板超时'));
      }, 8000);
      pending.set(id, {
        parts: [],
        resolve: (text) => resolve(String(text || '')),
        reject,
        timer,
      });
      try {
        N.readClipboard(id);
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  window.__nativeApi = {
    loggedIn: function () { return N.isLoggedIn(); },
    checkLogin: probeLogin,
    handle: function (path, params) {
      const fn = routes[path];
      if (!fn) return Promise.reject(new Error('接口不存在'));
      return Promise.resolve().then(() => fn(params || {}));
    },
    login: function () { N.login(); },
    copy: function (text) { if (N.copy) N.copy(String(text)); },
    saveImage,
    readClipboard,
    switchAccount: function () {
      if (N.relogin) N.relogin();
      else { N.logout(); N.login(); }
    },
    logout: function () { N.logout(); },
    openUrl: function (url) { N.openUrl(url); },
    platform: function () { try { return N.platform(); } catch (e) { return 'android'; } },
  };
})();
