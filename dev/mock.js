'use strict';
/**
 * 本地假数据层（开发/测试用），导出与 lib/lofter.js 完全一致的接口。
 * server.js 在 LOFTER_LITE_MOCK=1 时会 require 这个文件替代真实上游。
 *
 * 环境变量：
 *   MOCK_DELAY=800   每次「请求」人为延迟，用来看加载骨架屏
 *   MOCK_FAIL=1      所有接口抛 502，用来看错误态
 *   MOCK_EMPTY=1     所有列表返回空，用来看空状态
 *
 * 数据本身是确定性的（同一个 id 永远同一篇），不会因为刷新而跳动。
 */

const lofter = require('../lib/lofter');
const data = require('./mock-data');

const DELAY = Math.max(0, Number(process.env.MOCK_DELAY || 0)) || 0;
const FAIL = process.env.MOCK_FAIL || '';
const EMPTY = process.env.MOCK_EMPTY === '1';

const PAGE = 12; // 每页条数（比线上 20 少，方便把分页/无限滚动测出来）
const TOTAL = 120; // 总共造这么多篇

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gate() {
  if (DELAY) await sleep(DELAY);
  if (FAIL) throw new lofter.UpstreamError(`模拟上游故障（MOCK_FAIL=${FAIL}）`, 502);
}

/** 生成一页原始条目：每 4 篇混 1 篇 AI、每 5 篇混 1 篇付费，每 6 条混 1 个 null（线上真的会有） */
function page(tag, offset) {
  const items = [];
  for (let i = 0; i < PAGE; i++) {
    const idx = offset + i;
    if (idx >= TOTAL) break;
    const id = postId(tag, idx);
    if (i === 5) {
      items.push(null); // 用来验证 normalizePost 的空值保护
      continue;
    }
    items.push({
      post: data.rawPost(id, tag, { ai: i === 3, locked: i === 4 }),
      liked: false,
      normalBlog: {},
    });
  }
  return items;
}

/**
 * 帖子 id 必须按标签分开，否则发现流（多个标签轮流取）会把不同标签的同号帖当成重复。
 * 900000 + 标签序号 * 1000 + 页内序号，稳定且唯一。
 */
function postId(tag, idx) {
  return 900000 + (data.hash(tag) % 400) * 1000 + idx;
}

async function tagPosts(tag, { offset = 0, sort = 'new', limit = PAGE } = {}) {
  await gate();
  if (EMPTY) return { posts: [], nextOffset: offset, hasMore: false };
  const items = page(tag, offset);
  return {
    posts: items.map(lofter.normalizePost).filter(Boolean).filter((p) => !p.ai && !p.locked),
    nextOffset: offset + items.length,
    hasMore: offset + items.length < TOTAL,
  };
}

async function postDetail(blogId, postId) {
  await gate();
  const id = Number(postId);
  // 约 1% 的帖子模拟「已删除 / 私密」，方便验证 404 文案与返回键行为
  if (!id || id % 97 === 0) throw new lofter.UpstreamError('这篇内容不可见（可能已删除或设为私密）', 404);
  return lofter.normalizeDetail({ post: data.rawDetail(id, '摄影') });
}

async function blogHome(name, { offset = 0 } = {}) {
  await gate();
  if (EMPTY) {
    return { blog: { name, nick: name, avatar: '', intro: '', id: 0, url: `https://${name}.lofter.com` }, posts: [], nextOffset: offset, hasMore: false };
  }
  const items = [];
  for (let i = 0; i < PAGE && offset + i < TOTAL; i++) {
    items.push({ post: data.rawPost(postId(`blog:${name}`, offset + i), '摄影', { ai: i === 3, locked: i === 4 }) });
  }
  const posts = items.map(lofter.normalizePost).filter(Boolean).filter((p) => !p.ai && !p.locked);
  const author = data.authorFor(name);
  return {
    blog: {
      name,
      nick: author.nick,
      avatar: data.img(96, 96, author.name),
      intro: author.intro,
      id: 500000,
      url: `https://${name}.lofter.com`,
    },
    posts,
    // 和真实数据对齐：置顶作品 + 最近一篇作品的 IP 属地（他人主页要用）
    pinned: offset === 0 && posts[0] ? posts[0] : null,
    ip: offset === 0 ? '浙江' : '',
    nextOffset: offset + items.length,
    hasMore: offset + items.length < TOTAL,
  };
}

async function tagInfo(tag) {
  await gate();
  if (EMPTY) return { name: tag, cover: '', followers: 0, views: 0 };
  const h = data.hash(tag);
  return {
    name: tag,
    cover: data.img(1200, 675, tag),
    followers: 12000 + (h % 9000),
    views: 90000 + (h % 90000),
  };
}

async function comments(blogId, postId, offset = 0) {
  await gate();
  if (EMPTY) return { list: [], hot: [], next: -1 };
  const base = Number(postId) || 1;
  const start = offset * 6;
  const list = [];
  for (let i = 0; i < 6; i++) list.push(data.rawComment(base * 100 + start + i));
  // 第二页塞一条「官方功能评论」和一条「划线评」，方便离线验证这两条过滤/渲染逻辑
  if (offset === 1) {
    list.push(data.rawComment(base * 100 + 501, { official: true }));
    list.push(data.rawComment(base * 100 + 502, { quote: true }));
  }
  const next = start + 6 >= 18 ? -1 : offset + 1;
  const hot = offset === 0 ? [data.rawComment(base * 100 + 999, { hot: true })] : [];
  return {
    list: list.map(lofter.normalizeComment).filter(Boolean),
    hot: hot.map(lofter.normalizeComment).filter(Boolean),
    next,
  };
}

module.exports = {
  tagPosts,
  comments,
  postDetail,
  blogHome,
  tagInfo,
  normalizePost: lofter.normalizePost,
  normalizeDetail: lofter.normalizeDetail,
  normalizeComment: lofter.normalizeComment,
  stripHtml: lofter.stripHtml,
  sanitizeHtml: lofter.sanitizeHtml,
  UpstreamError: lofter.UpstreamError,
  mock: true,
};
