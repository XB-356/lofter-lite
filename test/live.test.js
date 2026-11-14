'use strict';
/**
 * 真实上游联调测试（默认不跑，联网后手动执行）：
 *   npm run test:live
 *
 * 用途：LOFTER 改接口 / 字段改名 / 开始要登录态时，这里会最先红。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const lofter = require('../lib/lofter');

const LIVE = { timeout: 40000 };

test('真实上游 · 标签流能拉到归一化后的内容', LIVE, async () => {
  const page = await lofter.tagPosts('摄影', { offset: 0, sort: 'hot' });
  assert.ok(Array.isArray(page.posts));
  assert.ok(page.posts.length > 0, '标签流为空，上游可能改协议或限制了访问');
  for (const p of page.posts) {
    assert.ok(p.id, '缺少 id');
    assert.ok(typeof p.title === 'string');
    assert.ok(p.author && typeof p.author.nick === 'string');
    assert.ok(p.stats && typeof p.stats.like === 'number');
  }
  console.log(`  标签「摄影」拿到 ${page.posts.length} 篇，例如：${page.posts[0].title || '(无标题)'}`);
});

test('真实上游 · 详情页能拿到正文或图片', LIVE, async () => {
  const page = await lofter.tagPosts('摄影', { offset: 0, sort: 'new' });
  const first = page.posts[0];
  assert.ok(first, '没有可用于测试的帖子');

  const detail = await lofter.postDetail(first.author.id, first.id);
  assert.equal(detail.id, first.id);
  assert.ok(detail.content.length > 0 || detail.photos.length > 0, '正文和图片都为空');
  console.log(`  详情 ${first.id}: 正文 ${detail.content.length} 字 / 图片 ${detail.photos.length} 张`);
});

test('真实上游 · 标签信息（封面 / 关注数）', LIVE, async () => {
  const info = await lofter.tagInfo('摄影');
  assert.ok(info, '标签页 SSR 结构可能变了');
  assert.equal(info.name, '摄影');
  assert.ok(typeof info.followers === 'number');
});

test('真实上游 · 博主主页能跟上分页', LIVE, async () => {
  const page = await lofter.tagPosts('摄影', { offset: 0 });
  const first = page.posts.find((p) => p.author.name);
  assert.ok(first, '没有带博主名的帖子');

  const home = await lofter.blogHome(first.author.name, { offset: 0 });
  assert.equal(home.blog.name, first.author.name);
  assert.ok(home.posts.length > 0);
  console.log(`  博主 ${first.author.name}: ${home.posts.length} 篇，hasMore=${home.hasMore}`);
});
