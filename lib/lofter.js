'use strict';
/**
 * LOFTER 公开数据层。
 *
 * 使用 LOFTER 自家 App 的公开 JSON 接口（无需登录即可读取公开内容），
 * 这里统一做三件事：限速请求、字段归一化、错误包装。
 * 只读取公开可见的内容，不做任何写入 / 登录态操作。
 */

const APP_UA = 'LOFTER-Android 7.6.12 (V2272A; Android 13; null) WIFI';
const PRODUCT = 'lofter-android-7.6.12';
const TAG_URL = `https://api.lofter.com/oldapi/tagPosts.api?product=${PRODUCT}`;
const DETAIL_URL = `https://api.lofter.com/oldapi/post/detail.api?product=${PRODUCT}`;
const BLOG_URL = 'https://api.lofter.com/v2.0/blogHomePage.api?product=lofter-iphone-10.0.0';
const POST_TYPES = '1,2,3,4,5,6';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 全局限速：同一时间只有一个上游请求，间隔 120ms，避免触发风控 ----
let chain = Promise.resolve();
let lastAt = 0;
function queue(fn) {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastAt + 120 - Date.now());
    if (wait) await sleep(wait);
    lastAt = Date.now();
    return fn();
  });
  // 即使失败也不阻塞后续队列
  chain = run.catch(() => {});
  return run;
}

async function upstream(url, { method = 'GET', form, timeout = 15000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      const res = await queue(() =>
        fetch(url, {
          method,
          headers: {
            'User-Agent': APP_UA,
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            Accept: '*/*',
          },
          body: form ? new URLSearchParams(form).toString() : undefined,
          signal: ctrl.signal,
        })
      );
      clearTimeout(timer);
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new UpstreamError(`HTTP ${res.status}`, res.status);
      let doc;
      try {
        doc = JSON.parse(text);
      } catch {
        throw new UpstreamError('LOFTER 返回了非 JSON 内容', 502);
      }
      const meta = doc.meta || {};
      if (meta.status && meta.status !== 200) {
        throw new UpstreamError(meta.msg || `LOFTER 错误 ${meta.status}`, 502, meta.status);
      }
      return doc.response || {};
    } catch (err) {
      lastErr = err;
      // 业务错误不重试
      if (err instanceof UpstreamError && err.code && err.code !== 429) break;
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr;
}

class UpstreamError extends Error {
  constructor(message, status = 502, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------------- 文本处理 ----------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 清掉脚本、事件属性、javascript: 协议；iframe 退化为链接。正文保留基础排版。 */
function sanitizeHtml(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<\s*(script|style|noscript|form|input|button|textarea|select)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(script|style|noscript|form|input|button|textarea|select|link|meta)[^>]*\/?\s*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/(href|src)\s*=\s*("|')\s*(javascript|data):[^"']*\2/gi, '$1="#"');
  s = s.replace(/<iframe[^>]*src\s*=\s*("|')([^"']+)\1[^>]*>[\s\S]*?<\/iframe>/gi,
    (_, q, src) => `<p class="embed"><a href="${src}" target="_blank" rel="noopener noreferrer">查看嵌入内容 ↗</a></p>`);
  s = s.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  // 去掉 0 尺寸的追踪像素
  s = s.replace(/<img[^>]*width\s*=\s*["']?0["']?[^>]*>/gi, '');
  // 去掉只有换行/空格的空段落，避免正文开头出现大片空白
  s = s.replace(/<p[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\u00a0|\s)*<\/p>/gi, '');
  s = s.replace(/^(?:\s*<br\s*\/?>\s*)+/i, '');
  return s.trim();
}

function parseJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const AI_TAG_RE = /^(ai|aigc|ai绘画|ai生成|ai创作|ai作图|midjourney|stable\s*diffusion|chatgpt)$/i;
function isAiTag(tag) {
  const t = String(tag || '').trim();
  return AI_TAG_RE.test(t) || /^(ai|aigc)[·\-—_ ]?(绘画|生成|创作|作图|图片)$/i.test(t);
}

// ---------------- 归一化 ----------------
function normalizeAuthor(post) {
  const b = post.blogInfo || post.publisherMainBlogInfo || {};
  const blogName = b.blogName || '';
  return {
    id: b.blogId || post.blogId || 0,
    name: blogName,
    nick: b.blogNickName || blogName || 'LOFTER 用户',
    avatar: b.bigAvaImg || b.avatar || '',
    intro: b.selfIntro || '',
    url: blogName ? `https://${blogName}.lofter.com` : '',
  };
}

function normalizeStats(post) {
  const c = post.postCount || {};
  return {
    like: c.favoriteCount ?? 0,
    comment: c.responseCount ?? 0,
    reblog: c.reblogCount ?? 0,
    share: c.shareCount ?? 0,
    view: c.viewCount ?? 0,
    hot: c.postHot ?? post.hot ?? 0,
  };
}

function normalizePost(entry) {
  // 上游 items / posts 里偶尔混入 null（下架、风控、分页边界），整批不要因此崩掉
  if (!entry) return null;
  const post = entry.post || entry;
  if (!post || !post.id) return null;
  const author = normalizeAuthor(post);
  const tagList = Array.isArray(post.tagList)
    ? post.tagList
    : String(post.tag || '').split(',').map((t) => t.trim()).filter(Boolean);
  const firsts = parseJsonArray(post.firstImageUrl);
  const photoLinks = parseJsonArray(post.photoLinks);
  const first = photoLinks[0] || {};
  const cover = firsts[1] || firsts[0] || first.orign || first.middle || post.firstSmallImageUrl || '';
  const wh = post.firstImageWH || {};
  return {
    id: post.id,
    type: post.type,
    title: decodeEntities(post.title || ''),
    digest: stripHtml(post.digest || post.caption || '').slice(0, 400),
    tags: tagList,
    ai: tagList.some(isAiTag),
    time: post.publishTime || post.createTime || 0,
    author,
    stats: normalizeStats(post),
    cover,
    coverW: wh.w || first.ow || 0,
    coverH: wh.h || first.oh || 0,
    permalink: post.permalink || '',
    url: post.blogPageUrl || (author.name && post.permalink
      ? `https://${author.name}.lofter.com/post/${post.permalink}`
      : ''),
    hot: post.hot || 0,
    wordCount: post.wordCount || post.totalWordCount || 0,
    // 付费 / 会员限定内容在第三方界面里读不到，直接不展示
    locked: !!(post.payView || post.needPay || post.fansVipPost),
  };
}

function normalizeDetail(entry) {
  const post = entry.post || entry;
  const base = normalizePost(post);
  const tagList = Array.isArray(post.tagList)
    ? post.tagList
    : String(post.tag || '').split(',').map((t) => t.trim()).filter(Boolean);
  const photos = parseJsonArray(post.photoLinks).map((p) => ({
    url: p.orign || p.orignWithTag || p.raw || p.middle || p.small || '',
    thumb: p.middle || p.small || p.orign || '',
    w: p.ow || p.rw || 0,
    h: p.oh || p.rh || 0,
  })).filter((p) => p.url);

  let content = sanitizeHtml(post.content || '');
  let caption = sanitizeHtml(post.caption || '');

  // 视频帖：embed 里藏着可直接播放的 mp4 和封面
  let video = null;
  if (post.embed) {
    try {
      const e = typeof post.embed === 'string' ? JSON.parse(post.embed) : post.embed;
      let url = e.video_down_url || e.originUrl || e.flashurl || '';
      if (!url && e.ext) url = Buffer.from(String(e.ext), 'base64').toString('utf8');
      if (/^https?:\/\//.test(url)) {
        video = {
          url,
          poster: e.video_img_url || e.video_first_img || '',
          w: Number(e.video_width) || 0,
          h: Number(e.video_height) || 0,
          duration: Number(e.duration) || 0,
        };
      }
    } catch {}
  }
  // 图片帖的 content 往往只是 caption 的重复，去掉一份
  const capText = stripHtml(caption);
  if (content && stripHtml(content) === capText) content = '';
  if (capText && capText === String(post.title || '').trim()) caption = '';
  const hasImg = /<img/i.test(content);
  return {
    ...base,
    tags: tagList,
    ai: tagList.some(isAiTag),
    content,
    caption,
    hasImgInContent: hasImg,
    photos,
    video,
    wordCount: post.wordCount || post.totalWordCount || 0,
    ipLocation: post.ipLocation || '',
    isLongText: (post.wordCount || 0) > 0,
  };
}

// ---------------- 对外接口 ----------------
async function tagPosts(tag, { offset = 0, sort = 'new', limit = 20 } = {}) {
  const resp = await upstream(TAG_URL, {
    method: 'POST',
    form: { method: 'newTagSearch', tag, offset, limit, type: sort },
  });
  const items = resp.items || [];
  return {
    posts: items.map(normalizePost).filter(Boolean).filter((p) => !p.ai && !p.locked),
    nextOffset: typeof resp.offset === 'number' ? resp.offset : offset + items.length,
    hasMore: items.length > 0,
  };
}

async function postDetail(blogId, postId) {
  let resp;
  try {
    resp = await upstream(DETAIL_URL, {
    method: 'POST',
    form: {
      targetblogid: String(blogId),
      blogId: String(blogId),
      postid: String(postId),
      supportposttypes: POST_TYPES,
      offset: 0,
      requestType: 1,
      postdigestnew: 1,
      checkpwd: 1,
      needgetpoststat: 1,
    },
  });
  } catch (err) {
    if (err instanceof UpstreamError && (err.code === 4200 || /封禁|注销|私密|不可见|权限/.test(err.message))) {
      throw new UpstreamError('这篇内容暂时不可见（可能已删除、设为私密或受限）', 404);
    }
    throw err;
  }
  const entry = (resp.posts || []).find(Boolean);
  if (!entry) throw new UpstreamError('这篇内容不可见（可能已删除或设为私密）', 404);
  return normalizeDetail(entry);
}

async function blogHome(name, { offset = 0 } = {}) {
  const resp = await upstream(BLOG_URL, {
    method: 'POST',
    form: {
      blogdomain: `${name}.lofter.com`,
      method: 'getPostLists',
      limit: 20,
      offset,
      checkpwd: 1,
      supportposttypes: POST_TYPES,
      postdigestnew: 1,
      needgetpoststat: 1,
    },
  });
  const posts = (resp.posts || []).map(normalizePost).filter(Boolean).filter((p) => !p.ai && !p.locked);
  const blogInfo = resp.blogInfo || (resp.posts && resp.posts[0] && resp.posts[0].post.blogInfo) || {};
  return {
    blog: {
      name: blogInfo.blogName || name,
      nick: blogInfo.blogNickName || name,
      avatar: blogInfo.bigAvaImg || '',
      intro: blogInfo.selfIntro || '',
      id: blogInfo.blogId || 0,
      url: `https://${name}.lofter.com`,
    },
    posts,
    nextOffset: typeof resp.offset === 'number' ? resp.offset : offset + posts.length,
    hasMore: posts.length > 0,
  };
}

/** 标签页 SSR 里的标签信息（封面、关注数）。仅在打开标签页时按需拉取。 */
async function tagInfo(tag) {
  const url = `https://www.lofter.com/front/blog/tag/${encodeURIComponent(tag)}`;
  const res = await queue(() =>
    fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
        Accept: 'text/html',
      },
    })
  );
  const html = await res.text();
  const key = 'window.__initialize_data__ = ';
  const start = html.indexOf(key);
  if (start < 0) return null;
  const end = html.indexOf('</script>', start);
  if (end < 0) return null;
  let raw = html.slice(start + key.length, end).trim().replace(/;$/, '');
  try {
    const data = JSON.parse(raw);
    const t = data.tagInfo || (data.tagInfoData && data.tagInfoData.tagInfo) || data.tagInfoData?.tagInfo || {};
    return {
      name: t.tagName || tag,
      cover: t.imageUrl || '',
      followers: t.joinedNum || 0,
      views: t.tagViewCount || 0,
    };
  } catch {
    return null;
  }
}

function escText(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizeComment(c) {
  if (!c) return null;
  const b = c.publisherBlogInfo || {};
  let content = escText(c.content || '');
  for (const em of c.emotes || []) {
    if (em.name && em.url) content = content.split(escText(em.name)).join(`<img class="emote" src="${em.url}" alt="">`);
  }
  content = content.replace(/\n/g, '<br>');
  return {
    id: c.id,
    author: { name: b.blogName || '', nick: b.blogNickName || 'LOFTER 用户', avatar: b.bigAvaImg || '' },
    content,
    time: c.publishTime || 0,
    likes: c.likeCount || 0,
    ip: c.ipLocation || '',
    l2Count: c.l2Count || 0,
    l2: (c.l2Comments || []).map(normalizeComment).filter(Boolean),
  };
}

async function comments(blogId, postId, offset = 0) {
  const url = `https://www.lofter.com/comment/l1/page.json?postId=${postId}&blogId=${blogId}&offset=${offset}`;
  const res = await queue(() =>
    fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
        Referer: 'https://www.lofter.com/',
        Accept: 'application/json, text/plain, */*',
      },
    })
  );
  const text = await res.text();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new UpstreamError('评论加载失败', 502);
  }
  if (doc.code !== 0) throw new UpstreamError(doc.msg || '评论加载失败', 502);
  const data = doc.data || {};
  return {
    list: (data.list || []).map(normalizeComment).filter(Boolean),
    hot: (data.hotList || []).map(normalizeComment).filter(Boolean),
    next: typeof data.offset === 'number' ? data.offset : -1,
  };
}

module.exports = {
  tagPosts,
  comments,
  postDetail,
  blogHome,
  tagInfo,
  normalizePost,
  normalizeDetail,
  normalizeComment,
  stripHtml,
  sanitizeHtml,
  UpstreamError,
};
