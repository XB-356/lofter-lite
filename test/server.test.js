'use strict';
/**
 * 端到端冒烟测试：真的起一个 server.js 子进程（随机端口 + mock 数据），
 * 用 HTTP 把页面和接口都走一遍。不联网。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ROOT, startServer, get } = require('./helpers');

let srv;

test.before(async () => {
  srv = await startServer();
});

test.after(async () => {
  if (srv) await srv.close();
});

test('/api/ping 通', async () => {
  const { status, body } = await get(srv.base, '/api/ping');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('/api/catalog 返回分类与默认标签', async () => {
  const { status, body } = await get(srv.base, '/api/catalog');
  assert.equal(status, 200);
  assert.equal(body.categories.length, 8);
  assert.ok(body.defaultTags.includes('摄影'));
});

test('/api/feed 在 mock 数据下能出图（曾因上游 null 条目整页 502）', async () => {
  const { status, body } = await get(srv.base, '/api/feed');
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(Array.isArray(body.posts));
  assert.ok(body.posts.length >= 12, `期望至少 12 条，实际 ${body.posts.length}`);
  assert.ok(typeof body.cursor === 'string' && body.cursor.length > 0);
  assert.equal(body.tags.length, 10);
  for (const p of body.posts) {
    assert.ok(p.id, '每篇都要有 id');
    assert.equal(p.ai, false);
    assert.equal(p.locked, false);
    assert.ok(p.author && typeof p.author.nick === 'string');
    assert.ok(p.stats && typeof p.stats.like === 'number');
  }
});

test('/api/feed 支持翻页 cursor', async () => {
  const first = await get(srv.base, '/api/feed');
  const second = await get(srv.base, `/api/feed?cursor=${encodeURIComponent(first.body.cursor)}`);
  assert.equal(second.status, 200);
  assert.ok(second.body.posts.length > 0);
  assert.notEqual(second.body.cursor, first.body.cursor);
});

test('/api/tag 返回分页信息', async () => {
  const { status, body } = await get(srv.base, '/api/tag?name=' + encodeURIComponent('摄影') + '&sort=week');
  assert.equal(status, 200);
  assert.equal(body.tag, '摄影');
  assert.equal(body.posts.length, 9);
  assert.equal(body.nextOffset, 12);
  assert.equal(body.hasMore, true);
});

test('/api/tag 缺参数时 400', async () => {
  const { status, body } = await get(srv.base, '/api/tag');
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('/api/taginfo 返回标签信息', async () => {
  const { status, body } = await get(srv.base, '/api/taginfo?name=' + encodeURIComponent('摄影'));
  assert.equal(status, 200);
  assert.equal(body.name, '摄影');
  assert.ok(body.followers > 0);
  assert.ok(body.cover.startsWith('/mock/img/'));
});

test('/api/post 详情里的脏 HTML 已被清洗', async () => {
  const { status, body } = await get(srv.base, '/api/post?blogId=5&postId=900001');
  assert.equal(status, 200);
  assert.equal(body.id, 900001);
  assert.ok(body.content.includes('<strong>'));
  assert.ok(!/<script/i.test(body.content));
  assert.ok(!/onclick/i.test(body.content));
  assert.ok(!/javascript:/i.test(body.content));
  assert.equal(body.photos.length, 3);
  assert.ok(body.title);
  assert.ok(body.author.nick);
});

test('/api/post 参数缺失或非法时 400', async () => {
  assert.equal((await get(srv.base, '/api/post')).status, 400);
  assert.equal((await get(srv.base, '/api/post?blogId=5&postId=0')).status, 400);
});

test('/api/post 不可见内容返回 404 + 可读文案', async () => {
  const { status, body } = await get(srv.base, '/api/post?blogId=5&postId=291');
  assert.equal(status, 404);
  assert.match(body.error, /不可见/);
});

test('/api/blog 返回博主信息与作品列表', async () => {
  const { status, body } = await get(srv.base, '/api/blog?name=lenscape');
  assert.equal(status, 200);
  assert.equal(body.blog.name, 'lenscape');
  assert.ok(body.blog.nick);
  assert.equal(body.posts.length, 10, '12 条里剔掉 1 篇 AI + 1 篇付费');
});

test('/api/blog 博主名不合法时 400', async () => {
  const { status } = await get(srv.base, '/api/blog?name=' + encodeURIComponent('../../etc/passwd'));
  assert.equal(status, 400);
});

test('/api/comments 返回评论且正文已转义', async () => {
  const { status, body } = await get(srv.base, '/api/comments?blogId=5&postId=900001');
  assert.equal(status, 200);
  assert.equal(body.list.length, 6);
  assert.equal(body.hot.length, 1);
  assert.equal(body.next, 1);
  assert.ok(body.list[0].author.nick);
  assert.ok(!/<script/i.test(body.list[0].content));
});

test('/api/search 命中分类里的标签', async () => {
  const { status, body } = await get(srv.base, '/api/search?q=' + encodeURIComponent('摄'));
  assert.equal(status, 200);
  assert.ok(body.tags.includes('摄影'));
});

test('/api/search 空查询返回空结果而不是报错', async () => {
  const { status, body } = await get(srv.base, '/api/search?q=');
  assert.equal(status, 200);
  assert.deepEqual(body.tags, []);
});

test('/api/follow 在 Web 端明确要求用 App', async () => {
  const { status, body } = await get(srv.base, '/api/follow');
  assert.equal(status, 401);
  assert.match(body.error, /App/);
});

test('未知接口 404', async () => {
  const { status, body } = await get(srv.base, '/api/nope');
  assert.equal(status, 404);
  assert.ok(body.error);
});

test('首页静态资源可访问', async () => {
  const html = await get(srv.base, '/');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.ok(html.text.includes('id="app"'));

  const js = await get(srv.base, '/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);

  const css = await get(srv.base, '/style.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
});

test('未知前端路由回退到 index.html（SPA）', async () => {
  const { status, text } = await get(srv.base, '/some/deep/route');
  assert.equal(status, 200);
  assert.ok(text.includes('id="app"'));
});

test('mock 模式下占位图是本地生成的 SVG', async () => {
  const { status, headers, text } = await get(srv.base, '/mock/img/600x800?seed=abc');
  assert.equal(status, 200);
  assert.match(headers.get('content-type'), /image\/svg\+xml/);
  assert.ok(text.includes('<svg'));
  assert.ok(text.includes('600×800'));
});

test('非 GET 请求 405', async () => {
  const { status } = await get(srv.base, '/', { method: 'POST' });
  assert.equal(status, 405);
});

test('路径穿越被挡住（403，不泄露文件）', async () => {
  const { status, text } = await get(srv.base, '/..%2f..%2fpackage.json');
  assert.equal(status, 403);
  assert.ok(!text.includes('"name"'));
});

test('MOCK_FAIL=1 时接口返回 502 + 错误文案', async () => {
  const bad = await startServer({ env: { MOCK_FAIL: '1' } });
  try {
    const { status, body } = await get(bad.base, '/api/tag?name=' + encodeURIComponent('摄影'));
    assert.equal(status, 502);
    assert.match(body.error, /模拟上游故障/);
  } finally {
    await bad.close();
  }
});

test('端口被占用时给出可操作的提示', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lofter-lite-dup-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(srv.port),
      HOST: '127.0.0.1',
      LOFTER_LITE_MOCK: '1',
      LOFTER_LITE_CACHE_DIR: cacheDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (b) => {
    out += b.toString();
  });
  child.stderr.on('data', (b) => {
    out += b.toString();
  });
  const code = await new Promise((res) => child.on('exit', res));
  fs.rmSync(cacheDir, { recursive: true, force: true });

  assert.equal(code, 1);
  assert.match(out, /已被占用/);
  assert.match(out, /PORT=/);
});
