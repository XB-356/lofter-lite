'use strict';
/**
 * LOFTER Lite —— 极简第三方客户端
 * 只做三件事：读公开内容、缓存、渲染。没有广告位，也没有推广/周边/AI 入口。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const Cache = require('./lib/cache');
const { categories, defaultTags } = require('./lib/catalog');

// LOFTER_LITE_MOCK=1 → 用 dev/mock.js 的本地假数据，完全不碰外网（UI 联调 / 测试用）
const MOCK = process.env.LOFTER_LITE_MOCK === '1';
const dataSource = MOCK ? require('./dev/mock') : require('./lib/lofter');
const { tagPosts, tagRank, postDetail, blogHome, tagInfo, comments, searchTags, searchBlogs, searchPosts, UpstreamError } = dataSource;

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const PUB = path.join(__dirname, 'public');
// mock / 真实数据用各自的缓存目录，避免反过来互相污染（mock 的假帖子被当成真实缓存）
const cache = new Cache(
  process.env.LOFTER_LITE_CACHE_DIR
    ? path.resolve(process.env.LOFTER_LITE_CACHE_DIR)
    : path.join(__dirname, 'data', MOCK ? 'cache-mock' : 'cache')
);

const TTL = {
  tag: 3 * 60 * 1000,
  feed: 2 * 60 * 1000,
  post: 6 * 60 * 60 * 1000,
  blog: 5 * 60 * 1000,
  tagInfo: 60 * 60 * 1000,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
};

// ---------------- 工具 ----------------
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, headers);
  res.end(buf);
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  // 小响应直接 gzip
  if (body.length > 1024) {
    const gz = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gz.length;
    res.writeHead(status, headers);
    res.end(gz);
  } else {
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(status, headers);
    res.end(body);
  }
}

function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function decodeCursor(s) {
  try {
    const o = JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8'));
    if (o && typeof o.i === 'number' && o.offs && typeof o.offs === 'object') return o;
  } catch {}
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 热度分：互动量为主，发布时间做轻微加成 */
function heatScore(p) {
  const st = p.stats || {};
  const heat = (st.like || 0) + (st.comment || 0) * 3 + (st.reblog || 0) * 2 + (st.share || 0);
  const days = p.time ? (Date.now() - p.time) / 86400000 : 30;
  const fresh = Math.max(0, 7 - days) * 4;
  return Math.log10(heat + 1) * 100 + fresh;
}

// ---------------- API ----------------
async function handleFeed(q, res) {
  const tags = String(q.get('tags') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const list = tags.length ? tags : defaultTags;
  const sort = q.get('sort') === 'hot' ? 'hot' : 'week';
  const cursor = decodeCursor(q.get('cursor')) || { i: 0, offs: {}, types: {} };

  const state = {
    i: cursor.i || 0,
    offs: { ...(cursor.offs || {}) },
    types: { ...(cursor.types || {}) },
  };
  const out = [];
  const seen = new Set();
  let guard = 0;

  // 默认取「周榜」：近 7 天里热度高的内容；周榜翻完再回落到最新
  while (guard < 3) {
    const tag = list[state.i % list.length];
    const type = state.types[tag] || sort;
    const offset = state.offs[tag] || 0;
    guard++;
    try {
      let page = await cachedTag(tag, offset, type);
      if (!page.posts.length && type === 'week') {
        state.types[tag] = 'new';
        page = await cachedTag(tag, 0, 'new');
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

  // 热度优先：点赞/评论/推荐加权，7 天内的新内容给一点新鲜度加成
  out.sort((a, b) => heatScore(b) - heatScore(a));

  json(res, 200, {
    posts: out.slice(0, 24),
    cursor: encodeCursor(state),
    tags: list,
  });
}

async function cachedTag(tag, offset, sort) {
  const key = `tag:${sort}:${tag}:${offset}`;
  const hit = cache.get(key, TTL.tag);
  if (hit) return hit;
  const page = await tagPosts(tag, { offset, sort });
  cache.set(key, page, TTL.tag);
  return page;
}

async function handleTag(q, res) {
  const name = String(q.get('name') || '').trim();
  if (!name) return json(res, 400, { error: '缺少标签名' });
  const offset = Math.max(0, Number(q.get('offset')) || 0);
  const sort = q.get('sort') === 'hot' ? 'hot' : 'new';

  const key = `tag:${sort}:${name}:${offset}`;
  let page = cache.get(key, TTL.tag);
  if (!page) {
    page = await tagPosts(name, { offset, sort });
    cache.set(key, page, TTL.tag);
  }
  json(res, 200, { tag: name, sort, ...page });
}

async function handleTagInfo(q, res) {
  const name = String(q.get('name') || '').trim();
  if (!name) return json(res, 400, { error: '缺少标签名' });
  const key = `taginfo:${name}`;
  let info = cache.get(key, TTL.tagInfo);
  if (!info) {
    info = (await tagInfo(name)) || { name, cover: '', followers: 0, views: 0 };
    cache.set(key, info, TTL.tagInfo);
  }
  json(res, 200, info);
}

async function handlePost(q, res) {
  const blogId = Number(q.get('blogId'));
  const postId = Number(q.get('postId'));
  if (!blogId || !postId) return json(res, 400, { error: '缺少 blogId / postId' });
  const key = `post:${blogId}:${postId}`;
  let post = cache.get(key, TTL.post);
  if (!post) {
    post = await postDetail(blogId, postId);
    cache.set(key, post, TTL.post);
  }
  json(res, 200, post);
}

async function handleBlog(q, res) {
  const name = String(q.get('name') || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) return json(res, 400, { error: '博主名不合法' });
  const offset = Math.max(0, Number(q.get('offset')) || 0);
  const key = `blog:${name}:${offset}`;
  let page = cache.get(key, TTL.blog);
  if (!page) {
    page = await blogHome(name, { offset });
    cache.set(key, page, TTL.blog);
  }
  json(res, 200, page);
}

async function handleComments(q, res) {
  const blogId = Number(q.get('blogId'));
  const postId = Number(q.get('postId'));
  if (!blogId || !postId) return json(res, 400, { error: '缺少 blogId / postId' });
  const offset = Math.max(0, Number(q.get('offset')) || 0);
  const key = `comments:${blogId}:${postId}:${offset}`;
  let data = cache.get(key, 5 * 60 * 1000);
  if (!data) {
    data = await comments(blogId, postId, offset);
    cache.set(key, data, 5 * 60 * 1000);
  }
  json(res, 200, data);
}

function handleFollow(q, res) {
  return json(res, 401, { error: '关注流需要在 LOFTER Lite App 内登录后查看' });
}

function handleSearch(q, res) {
  const raw = String(q.get('q') || '').trim().slice(0, 40);
  if (!raw) return json(res, 200, { tags: [], q: '' });
  const lower = raw.toLowerCase();
  const matched = [];
  for (const c of categories) {
    for (const t of c.tags) {
      if (t.toLowerCase().includes(lower) && !matched.includes(t)) matched.push(t);
    }
  }
  json(res, 200, { q: raw, tags: matched.slice(0, 12) });
}

// ---------------- mock 占位图 ----------------
/** mock 模式下的图片占位符：/mock/img/600x800?seed=xxx → 现场生成 SVG，离线也有图可看 */
function serveMockImage(res, u) {
  const m = /^\/mock\/img\/(\d{1,4})x(\d{1,4})\/?$/.exec(u.pathname);
  if (!m) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
  const w = Math.min(2000, Math.max(16, Number(m[1])));
  const h = Math.min(2000, Math.max(16, Number(m[2])));
  const seed = u.searchParams.get('seed') || '';
  let hue = 0;
  for (let i = 0; i < seed.length; i++) hue = (hue * 31 + seed.charCodeAt(i)) % 360;
  const c1 = `hsl(${hue} 46% 64%)`;
  const c2 = `hsl(${(hue + 40) % 360} 42% 40%)`;
  const fontSize = Math.max(12, Math.round(Math.min(w, h) * 0.12));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>`,
    `</linearGradient></defs>`,
    `<rect width="100%" height="100%" fill="url(#g)"/>`,
    `<text x="${w / 2}" y="${h / 2 + fontSize / 3}" fill="rgba(255,255,255,.85)"`,
    ` font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" text-anchor="middle">`,
    `${w}×${h}</text></svg>`,
  ].join('');
  send(res, 200, svg, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
}

// ---------------- 静态文件 ----------------
const sendFile = (res, filePath, req) => {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(filePath).toLowerCase();
    const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=600',
      ETag: etag,
    };
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => send(res, 500, 'Read Error'));
    res.writeHead(200, headers);
    stream.pipe(res);
  });
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(PUB, rel));
  if (!filePath.startsWith(PUB)) return send(res, 403, 'Forbidden');
  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) return sendFile(res, filePath, req);
    // SPA 回退
    return sendFile(res, path.join(PUB, 'index.html'), req);
  });
}

// ---------------- 路由 ----------------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = u;
  const q = u.searchParams;

  if (!pathname.startsWith('/api/') || q.get('log')) {
    console.log(`[req] ${req.method} ${pathname} ua=${String(req.headers['user-agent'] || '').slice(0, 60)}`);
  }

  // 本地服务，只允许同源读取
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (pathname.startsWith('/api/')) {
    const started = Date.now();
    try {
      switch (pathname) {
        case '/api/feed':
          return await handleFeed(q, res);
        case '/api/tag':
          return await handleTag(q, res);
        case '/api/taginfo':
          return await handleTagInfo(q, res);
        case '/api/post':
          return await handlePost(q, res);
        case '/api/blog':
          return await handleBlog(q, res);
        case '/api/search':
          return handleSearch(q, res);
        case '/api/search-tags': {
          const key = String(q.get('q') || '').trim();
          if (!key) return json(res, 400, { error: '缺少搜索关键词' });
          return json(res, 200, await searchTags(key, Number(q.get('offset')) || 0));
        }
        case '/api/search-blogs': {
          const key = String(q.get('q') || '').trim();
          if (!key) return json(res, 400, { error: '缺少搜索关键词' });
          return json(res, 200, await searchBlogs(key, Number(q.get('offset')) || 0));
        }
        case '/api/search-posts': {
          const key = String(q.get('q') || '').trim();
          if (!key) return json(res, 400, { error: '缺少搜索关键词' });
          return json(res, 200, await searchPosts(key, Number(q.get('offset')) || 0));
        }
        case '/api/tag-rank': {
          const tag = String(q.get('tag') || '').trim();
          if (!tag) return json(res, 400, { error: '缺少标签' });
          return json(res, 200, await tagRank(tag, {
            offset: Number(q.get('offset')) || 0,
            type: q.get('type') || 'total',
            range: Number(q.get('range')) || 0,
            postTypes: q.get('postTypes') === null ? '' : String(q.get('postTypes')),
            recentDay: Number(q.get('recentDay')) || 0,
          }));
        }
        case '/api/comments':
          return await handleComments(q, res);
        case '/api/follow':
          return handleFollow(q, res);
        case '/api/catalog':
          return json(res, 200, { categories, defaultTags });
        case '/api/ping':
          return json(res, 200, { ok: true, ms: Date.now() - started });
        default:
          return json(res, 404, { error: '接口不存在' });
      }
    } catch (err) {
      const status = err instanceof UpstreamError && err.status ? err.status : 502;
      const msg = err && err.message ? err.message : '网络异常';
      console.error(`[api] ${pathname} ${status} ${msg} ${Date.now() - started}ms`);
      return json(res, status, { error: msg });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed');
  }
  if (MOCK && pathname.startsWith('/mock/img/')) {
    return serveMockImage(res, u);
  }
  return serveStatic(req, res, pathname);
});

function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(`http://${ni.address}:${port}`);
    }
  }
  return out;
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。换一个端口：PORT=8790 npm run dev`);
    console.error('（npm test 用随机端口，不受影响）');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const actualPort = addr && typeof addr === 'object' ? addr.port : PORT;
  const loopback = HOST === '0.0.0.0' || HOST === '::' || HOST === '';
  const shownHost = loopback ? '127.0.0.1' : HOST;
  console.log(`LOFTER Lite 已启动: http://${shownHost}:${actualPort}${PORT === 0 ? '  (随机端口)' : ''}`);
  if (MOCK) {
    console.log('[mock] 使用 dev/mock.js 的本地假数据，不会访问 LOFTER；MOCK_FAIL=1 / MOCK_EMPTY=1 / MOCK_DELAY=800 可切错误态、空态、慢速');
  }
  if (loopback) {
    const lan = lanUrls(actualPort);
    if (lan.length) console.log(`[lan] 同一局域网可用：${lan.join('  ')}`);
  }
  console.log(`（手机浏览器打开这个地址，或添加到主屏幕）`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
