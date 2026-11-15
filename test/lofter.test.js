'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const lofter = require('../lib/lofter');
const mock = require('../dev/mock');

// ---------------- 归一化 ----------------
test('normalizePost 遇到空条目返回 null，不再让整页崩掉', () => {
  assert.equal(lofter.normalizePost(null), null);
  assert.equal(lofter.normalizePost(undefined), null);
  assert.equal(lofter.normalizePost({}), null);
  assert.equal(lofter.normalizePost({ post: null }), null);
  assert.equal(lofter.normalizePost(0), null);
});

test('normalizePost 把原始字段映射成前端需要的结构', () => {
  const p = lofter.normalizePost({
    post: {
      id: 42,
      type: 2,
      title: '标题 &amp; 转义',
      digest: '<p>摘要<br>第二行</p>',
      tag: '摄影, 生活',
      publishTime: 1700000000000,
      permalink: 'abc123',
      firstImageUrl: JSON.stringify(['u1.jpg', 'u2.jpg']),
      firstImageWH: { w: 600, h: 800 },
      postCount: { favoriteCount: 5, responseCount: 2, reblogCount: 1, shareCount: 3, viewCount: 9, postHot: 33 },
      hot: 33,
      blogInfo: { blogId: 7, blogName: 'lenscape', blogNickName: '镜中人', bigAvaImg: 'a.png', selfIntro: 'hi' },
    },
  });

  assert.equal(p.id, 42);
  assert.equal(p.title, '标题 & 转义');
  assert.equal(p.digest, '摘要\n第二行');
  assert.deepEqual(p.tags, ['摄影', '生活']);
  // 取第二张缩略图当封面（原站就是这么给的）
  assert.equal(p.cover, 'u2.jpg');
  assert.equal(p.coverW, 600);
  assert.equal(p.coverH, 800);
  assert.equal(p.author.name, 'lenscape');
  assert.equal(p.author.nick, '镜中人');
  assert.equal(p.author.url, 'https://lenscape.lofter.com');
  assert.equal(p.author.id, 7);
  assert.equal(p.stats.like, 5);
  assert.equal(p.stats.comment, 2);
  assert.equal(p.hot, 33);
  assert.equal(p.ai, false);
  assert.equal(p.locked, false);
  assert.equal(p.url, 'https://lenscape.lofter.com/post/abc123');
});

test('normalizePost 标出 AI 标签与付费内容', () => {
  const ai = lofter.normalizePost({ post: { id: 1, tagList: ['摄影', 'AI绘画'] } });
  assert.equal(ai.ai, true);

  const locked = lofter.normalizePost({ post: { id: 2, tag: '摄影', payView: 1 } });
  assert.equal(locked.locked, true);
});

test('mock 数据里混入的 null / AI / 付费条目都会被过滤，且不报错', async () => {
  const page = await mock.tagPosts('摄影', { offset: 0 });
  assert.equal(page.posts.length, 9, '12 条原始数据 = 1 个 null + 1 篇 AI + 1 篇付费 被剔除后剩 9');
  for (const p of page.posts) {
    assert.ok(p.id);
    assert.equal(p.ai, false);
    assert.equal(p.locked, false);
  }
  assert.equal(page.nextOffset, 12);
  assert.equal(page.hasMore, true);
});

// ---------------- 文本清洗 ----------------
test('sanitizeHtml 清掉脚本、事件属性和危险协议', () => {
  const out = lofter.sanitizeHtml(
    [
      '<p>正常段落</p>',
      '<script>alert("xss")</script>',
      '<style>p{color:red}</style>',
      '<p onclick="steal()" onmouseover="x()">带事件属性</p>',
      '<a href="javascript:alert(1)">危险链接</a>',
      '<img src="data:image/png;base64,xx">',
      '<img src="track.gif" width="0">',
      '<iframe src="https://www.lofter.com/"></iframe>',
    ].join('')
  );

  assert.ok(out.includes('<p>正常段落</p>'));
  assert.ok(!/<script/i.test(out));
  assert.ok(!/<style/i.test(out));
  assert.ok(!/onclick/i.test(out));
  assert.ok(!/onmouseover/i.test(out));
  assert.ok(!/javascript:/i.test(out));
  assert.ok(!/data:image/i.test(out));
  assert.ok(!/track\.gif/i.test(out), '0 尺寸追踪像素应被删掉');
  assert.ok(!/<iframe/i.test(out));
  assert.ok(out.includes('查看嵌入内容'), 'iframe 退化成链接');
});

test('stripHtml 保留换行并解码实体', () => {
  assert.equal(lofter.stripHtml('<p>第一段</p><p>第二段 &amp; 结尾</p>'), '第一段\n第二段 & 结尾');
  assert.equal(lofter.stripHtml(''), '');
  assert.equal(lofter.stripHtml('<br><br><br>'), '');
});

test('normalizeComment 转义正文、替换表情、保留换行', () => {
  const c = lofter.normalizeComment({
    id: 9,
    content: '<b>hi</b> [笑]\n第二行',
    emotes: [{ name: '[笑]', url: 'https://e/1.png' }],
    publishTime: 1700000000000,
    likeCount: 3,
    ipLocation: '浙江',
    l2Count: 1,
    l2Comments: [{ id: 10, content: '回复' }],
    publisherBlogInfo: { blogName: 'lenscape', blogNickName: '镜中人', bigAvaImg: 'a.png' },
  });

  assert.equal(c.author.nick, '镜中人');
  assert.ok(c.content.includes('&lt;b&gt;hi&lt;/b&gt;'), 'HTML 被转义');
  assert.ok(c.content.includes('<img class="emote" src="https://e/1.png"'));
  assert.ok(c.content.includes('<br>'));
  assert.equal(c.ip, '浙江');
  assert.equal(c.l2.length, 1);
  assert.equal(c.l2[0].content, '回复');
  assert.equal(lofter.normalizeComment(null), null);
});

test('normalizeComment 过滤官方功能评论，保留划线评的原文', () => {
  const official = lofter.normalizeComment({ id: 1, content: '[更新求踢]' });
  assert.equal(official, null, '[更新求踢] 这类只有标记的评论不显示');
  const multi = lofter.normalizeComment({ id: 2, content: '[更新求踢] [催更]' });
  assert.equal(multi, null, '多个标记连在一起也算功能评论');
  const real = lofter.normalizeComment({ id: 3, content: '更新求踢！写得太好了' });
  assert.ok(real, '带正文的评论要保留');

  const quoted = lofter.normalizeComment({
    id: 4,
    content: '这段好',
    quoteContent: '当月光落在旧城墙上的时候',
    publisherBlogInfo: { blogName: 'x', blogNickName: 'X' },
  });
  assert.equal(quoted.quote, '当月光落在旧城墙上的时候');
});

test('normalizePost 标出草稿，blogHome 不返回草稿', async () => {
  const draft = lofter.normalizePost({ post: { id: 1, title: '草稿', isPublished: false, publishTime: 0 } });
  assert.equal(draft.draft, true);
  const normal = lofter.normalizePost({ post: { id: 2, title: '正常', publishTime: 1700000000000 } });
  assert.equal(normal.draft, false);

  const home = await mock.blogHome('lenscape', { offset: 0 });
  assert.ok(home.posts.length > 0);
  assert.ok(home.posts.every((p) => !p.draft), '草稿不该出现在主页列表里');
});

test('mock 详情页正文在经过 sanitizeHtml 后是安全的', async () => {
  const detail = await mock.postDetail(5, 900001);
  assert.ok(detail.content.length > 0);
  assert.ok(!/<script/i.test(detail.content));
  assert.ok(!/onclick/i.test(detail.content));
  assert.ok(!/javascript:/i.test(detail.content));
  assert.equal(detail.photos.length, 3);
  assert.ok(detail.hasImgInContent);
  assert.equal(detail.locked, false);
});
