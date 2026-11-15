'use strict';
/**
 * 假数据生成器：只产出「上游原始结构」（带 post / blogInfo / firstImageUrl 等字段），
 * 归一化仍然交给 lib/lofter.js —— 这样 mock 模式也会真实跑一遍线上代码路径。
 *
 * 刻意混入的东西：
 *   - 每页 1 个 null 条目（线上真的会出现，曾导致整页 502）
 *   - 每页 1 篇 AI 标签、1 篇付费锁定（应被过滤掉）
 *   - 正文里带 <script> / on* 属性 / javascript: 链接 / iframe（应被 sanitizeHtml 清掉）
 */

const RATIOS = [
  [600, 800],
  [800, 600],
  [900, 900],
  [700, 1050],
  [1080, 608],
  [608, 1080],
];

const AUTHORS = [
  { name: 'lenscape', nick: '镜中人', intro: '只拍光落在墙上的样子' },
  { name: 'inkfeather', nick: '墨羽', intro: '写点不押韵的东西' },
  { name: 'grayroom', nick: '灰房间', intro: '室内、静物、旧物' },
  { name: 'mountainline', nick: '山线', intro: '徒步与远山' },
  { name: 'nightbakery', nick: '夜航面包房', intro: '晚上十点开始揉面' },
  { name: 'cartoonghost', nick: '漫画幽灵', intro: '每天画一格' },
  { name: 'deskplant', nick: '桌面植物', intro: '桌面、植物、杂物' },
  { name: 'slowstreet', nick: '慢街', intro: '走路拍街' },
];

const TITLES = [
  '午后的窗台',
  '一些没发表的草稿',
  '把秋天装进玻璃瓶',
  '下雨天的第三杯咖啡',
  '拍到了很好的光',
  '关于整理的碎碎念',
  '周末去了海边',
  '深夜的一点构图笔记',
  '镜头里的旧街区',
  '试着把颜色调冷一点',
  '写在三月的备忘录里',
  '一只不太配合的模特',
  '记录下这个安静的下午',
  '手绘练习：第七天',
  '面包出炉前的十分钟',
  '在山上待了两天',
  '翻到了去年的胶卷',
  '窗外的树换了颜色',
  '关于留白的几种练习',
  '街角那家店又开门了',
];

const PARAGRAPHS = [
  '这段时间一直在做同一件事的重复练习，慢慢能感觉到一点点变化。',
  '光线比想象中重要，等了大概四十分钟才等到想要的色温。',
  '整理的时候翻出不少之前没发的照片，一并放在这里。',
  '比起拍到什么，最近更在意按下快门之前的那个判断。',
  '文字部分写得比较仓促，先记录下来，之后再改。',
  '如果一定要说有什么心得，大概是：少一点，再少一点。',
];

function hash(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 占位图由 server.js 在 mock 模式下现场生成 SVG，不依赖外网 */
function img(w, h, seed) {
  return `/mock/img/${w}x${h}?seed=${encodeURIComponent(seed)}`;
}

function authorFor(name) {
  return AUTHORS[hash(name) % AUTHORS.length];
}

function rawPost(id, tag, { ai = false, locked = false, ratio } = {}) {
  const h = hash(`${id}:${tag}`);
  const author = AUTHORS[h % AUTHORS.length];
  const [w, oh] = ratio || RATIOS[h % RATIOS.length];
  const title = TITLES[h % TITLES.length];
  const cover = img(w, oh, id);
  const photo = { orign: cover, middle: img(w, oh, `m${id}`), ow: w, oh };

  return {
    id,
    type: 2,
    blogId: 500000 + (h % 1000),
    title: `${title} · ${tag}`,
    digest: `<p>${PARAGRAPHS[h % PARAGRAPHS.length]}</p><p>&amp; 一些 &lt;标签&gt; 转义测试</p>`,
    tag: [tag, ai ? 'AI绘画' : '原创'].join(','),
    tagList: ai ? [tag, 'AI绘画'] : [tag, '原创'],
    publishTime: 1750000000000 - (h % 40) * 3600 * 1000,
    permalink: `mock${id}`,
    blogPageUrl: `https://${author.name}.lofter.com/post/mock${id}`,
    firstImageUrl: JSON.stringify([cover, cover]),
    firstImageWH: { w, h: oh },
    photoLinks: JSON.stringify([photo]),
    postCount: {
      favoriteCount: 10 + (h % 900),
      responseCount: h % 60,
      reblogCount: h % 40,
      shareCount: h % 25,
      viewCount: 100 + (h % 9000),
      postHot: 20 + (h % 700),
    },
    hot: 20 + (h % 700),
    wordCount: 200 + (h % 1500),
    blogInfo: {
      blogId: 500000 + (h % 1000),
      blogName: author.name,
      blogNickName: author.nick,
      bigAvaImg: img(96, 96, author.name),
      selfIntro: author.intro,
    },
    payView: locked ? 1 : 0,
  };
}

function rawDetail(id, tag) {
  const base = rawPost(id, tag, { ratio: RATIOS[hash(`d${id}`) % RATIOS.length] });
  const h = hash(id);
  const extra = [img(720, 480, `d1${id}`), img(720, 900, `d2${id}`), img(720, 480, `d3${id}`)];
  const paras = [0, 1, 2].map((i) => `<p>${PARAGRAPHS[(h + i) % PARAGRAPHS.length]}</p>`).join('');
  return {
    ...base,
    // 正文：正常排版 + 图片 + 几处典型的脏 HTML（归一化时会被清净）
    content: [
      paras,
      `<p><img src="${extra[0]}" alt=""></p>`,
      '<p>这一段故意带 <strong>行内标签</strong> 和换行<br>看看排版是否正常。</p>',
      '<script>alert("xss should be stripped")</script>',
      '<p onclick="alert(\'onclick\')">带事件属性的段落，属性应被清掉。</p>',
      '<p><a href="javascript:alert(1)">javascript 协议的链接会被替换成 #</a></p>',
      '<iframe src="https://www.lofter.com/"></iframe>',
      `<p><img src="${extra[1]}" alt=""></p>`,
      `<p><img src="${extra[2]}" alt=""></p>`,
    ].join(''),
    caption: '<p>一段图注：原文在这里 &amp; 也做转义测试。</p>',
    ipLocation: '浙江',
    photoLinks: JSON.stringify([
      { orign: extra[0], middle: extra[0], ow: 720, oh: 480 },
      { orign: extra[1], middle: extra[1], ow: 720, oh: 900 },
      { orign: extra[2], middle: extra[2], ow: 720, oh: 480 },
    ]),
  };
}

function rawComment(id, { hot = false, official = false, quote = false } = {}) {
  const h = hash(`c${id}`);
  const author = AUTHORS[h % AUTHORS.length];
  if (official) {
    // 官方 App 的「功能型评论」：整条只有方括号标记，应当被过滤掉
    return {
      id,
      content: '[更新求踢]',
      publishTime: 1750000000000 - (h % 200) * 60000,
      likeCount: 0,
      ipLocation: '浙江',
      publisherBlogInfo: { blogName: author.name, blogNickName: author.nick, bigAvaImg: img(96, 96, author.name) },
    };
  }
  if (quote) {
    // 划线评：选中正文某段后发的评论，上游会带被选中的原文
    return {
      id,
      content: '这句写得太好了，我一口气读了三条街。',
      quoteContent: '当月光落在旧城墙上的时候，整条街都安静了下来。',
      publishTime: 1750000000000 - (h % 200) * 60000,
      likeCount: 12,
      ipLocation: '上海',
      publisherBlogInfo: { blogName: author.name, blogNickName: author.nick, bigAvaImg: img(96, 96, author.name) },
    };
  }
  return {
    id,
    content: hot ? `这是热评 #${id}：很喜欢这组图，色调很安静。` : `评论 ${id}：第 ${h % 30} 次来看更新了。\n第二行测试换行。`,
    emotes: [{ name: '[笑]', url: img(48, 48, `emote${id}`) }],
    publishTime: 1750000000000 - (h % 200) * 60000,
    likeCount: hot ? 100 + (h % 400) : h % 60,
    ipLocation: ['浙江', '北京', '上海', '广东'][h % 4],
    l2Count: h % 3,
    l2Comments:
      h % 3 === 0
        ? []
        : [
            {
              id: id * 10 + 1,
              content: '回复：同感！',
              publishTime: 1750000000000 - (h % 100) * 60000,
              publisherBlogInfo: { blogName: AUTHORS[(h + 1) % AUTHORS.length].name, blogNickName: AUTHORS[(h + 1) % AUTHORS.length].nick, bigAvaImg: img(96, 96, 'reply') },
            },
          ],
    publisherBlogInfo: {
      blogName: author.name,
      blogNickName: author.nick,
      bigAvaImg: img(96, 96, author.name),
    },
  };
}

module.exports = { RATIOS, AUTHORS, TITLES, hash, img, authorFor, rawPost, rawDetail, rawComment };
