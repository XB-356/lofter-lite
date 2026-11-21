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
    // 和真实上游对齐：付费/粮票作品照常返回，是否隐藏由前端的 hideLocked 设置决定
    posts: items.map(lofter.normalizePost).filter(Boolean).filter((p) => !p.ai && !p.draft),
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
    // i === 1 这条做成草稿（没有发布时间），用来验证「我的页不显示草稿」
    const raw = data.rawPost(postId(`blog:${name}`, offset + i), '摄影', { ai: i === 3, locked: i === 4 });
    if (i === 1) {
      raw.isPublished = false;
      raw.publishTime = 0;
    }
    items.push({ post: raw });
  }
  const posts = items.map(lofter.normalizePost).filter(Boolean).filter((p) => !p.ai && !p.draft);
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

async function searchTags(key, offset = 0) {
  await gate();
  const tag = String(key || '').trim();
  if (!tag) return { list: [], next: 0, hasMore: false };
  const list = [
    { name: tag, count: 12000, cover: data.img(1200, 675, tag) },
    { name: tag + '同人', count: 3400, cover: data.img(1200, 675, tag + '1') },
    { name: tag + '原创', count: 980, cover: data.img(1200, 675, tag + '2') },
  ];
  return { list: offset === 0 ? list : [], next: 0, hasMore: false };
}

async function searchBlogs(key, offset = 0) {
  await gate();
  const name = String(key || '').trim();
  if (!name) return { list: [], next: 0, hasMore: false };
  const list = ['a', 'b'].map((s) => ({
    id: 500000 + s.charCodeAt(0),
    name: name + s,
    nick: name + '·' + s.toUpperCase(),
    avatar: data.img(96, 96, name + s),
    intro: '写点不押韵的东西',
  }));
  return { list: offset === 0 ? list : [], next: 0, hasMore: false };
}

async function searchPosts(key, offset = 0) {
  await gate();
  const tag = String(key || '').trim();
  if (!tag) return { list: [], total: 0, next: 0, hasMore: false };
  const sized = [[900, 900], [1200, 800], [600, 900]];
  const posts = [0, 1, 2]
    .map((i) => lofter.normalizePost(data.rawPost(910000 + i, tag, { ratio: sized[i % sized.length] })))
    .filter(Boolean);
  return { list: offset === 0 ? posts : [], total: posts.length, next: 0, hasMore: false };
}

// 榜单：mock 里就是「热门」排序 + 按筛选条件裁一刀，够前端联调用
async function tagRank(tag, { offset = 0, type = 'total', range = 0, postTypes = '', recentDay = 0, ym = '' } = {}) {
  const r = await tagPosts(tag, { offset, sort: 'hot' });
  let posts = r.posts.slice();
  if (String(postTypes) === '1') posts = posts.filter((p) => p.type !== 2);
  if (String(postTypes) === '2') posts = posts.filter((p) => p.type === 2);
  if (Number(recentDay) > 0) {
    // mock 的作品时间是固定的历史日期，直接按天过滤会全空；
    // 只在还有结果时才应用，保证界面联调时能看到「筛选后仍有内容」的样子
    const since = Date.now() - Number(recentDay) * 86400e3;
    const kept = posts.filter((p) => (p.time || 0) >= since);
    if (kept.length) posts = kept;
  }
  const ymText = /^\d{4}-\d{2}$/.test(String(ym || '')) ? String(ym) : '';
  if (ymText) {
    const kept = posts.filter((p) => {
      const d = new Date(Number(p.time) || 0);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === ymText;
    });
    if (kept.length) posts = kept;
  }
  const ranked = posts.map((p, i) => Object.assign({}, p, { hot: (p.hot || 0) + (posts.length - i) * 10 }));
  return {
    posts: ranked, nextOffset: r.nextOffset, hasMore: r.hasMore,
    type: ymText ? 'total' : type, range: Number(range) || 0, postTypes, recentDay: Number(recentDay) || 0, ym: ymText,
  };
}

module.exports = {
  tagPosts,
  tagRank,
  comments,
  postDetail,
  blogHome,
  tagInfo,
  searchTags,
  searchBlogs,
  searchPosts,
  normalizePost: lofter.normalizePost,
  normalizeDetail: lofter.normalizeDetail,
  normalizeComment: lofter.normalizeComment,
  stripHtml: lofter.stripHtml,
  sanitizeHtml: lofter.sanitizeHtml,
  UpstreamError: lofter.UpstreamError,
  mock: true,
};
