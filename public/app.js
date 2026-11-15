/* LOFTER Lite —— 只留内容的第三方客户端（无广告 / 无会员 / 无周边 / 无 AI 推荐位） */
(() => {
  'use strict';

  // ================= 工具 =================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万';
    return String(n);
  };
  const since = (ts) => {
    if (!ts) return '';
    const d = Date.now() - ts;
    if (d < 60e3) return '刚刚';
    if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前';
    if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前';
    if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + ' 天前';
    const t = new Date(ts);
    return `${t.getMonth() + 1}月${t.getDate()}日`;
  };
  function thumb(url, w = 480, h = 0) {
    if (!url) return '';
    const size = w + 'x' + (h || 0);
    if (/[?&]thumbnail=/.test(url)) return url.replace(/([?&]thumbnail=)[^&]*/, '$1' + size);
    return url + (url.includes('?') ? '&' : '?') + 'imageView&thumbnail=' + size + '&quality=90';
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ================= 运行环境（浏览器 / APK） =================
  const NATIVE = !!window.Native;
  const nativeApi = window.__nativeApi || null;
  let loginState = null, loginStateAt = 0;
  async function checkLogin(force) {
    if (!nativeApi) return false;
    if (!force && loginState !== null && Date.now() - loginStateAt < 90e3) return loginState;
    try {
      loginState = nativeApi.checkLogin ? await nativeApi.checkLogin() : nativeApi.loggedIn();
    } catch (e) {
      loginState = false;
    }
    loginStateAt = Date.now();
    return loginState;
  }
  function openExternal(url) {
    if (!url) return toast('没有找到链接');
    if (NATIVE && nativeApi) nativeApi.openUrl(url);
    else window.open(url, '_blank', 'noopener');
  }
  async function syncAccount() {
    if (!nativeApi) return null;
    if (!(await checkLogin())) return null;
    let profile = null, tags = null, profileError = '';
    try { profile = await api('/api/me'); } catch (e) { profileError = e.message || '资料读取失败'; }
    try {
      const arr = await api('/api/subscribed');
      if (Array.isArray(arr)) tags = arr;
    } catch (e) {}
    if (profile) {
      store.settings.profile = profile;
      store.settings.profileError = '';
    } else if (profileError) {
      store.settings.profileError = profileError;
    }
    if (tags && tags.length) {
      const changed = tags.join(',') !== (store.settings.subscribedTags || []).join(',');
      store.settings.subscribedTags = tags;
      if (changed) feedCaches['/'] = { posts: [], cursor: null, loading: false, done: false };
    }
    store.settings.accountSyncAt = Date.now();
    store.saveSettings();
    return { profile: profile || store.settings.profile, tags: tags || store.settings.subscribedTags, error: profileError };
  }

  window.__loginChanged = async (v) => {
    const ok = await checkLogin(true);
    if (ok) {
      const acc = await syncAccount();
      toast(acc && acc.profile ? '已登录：' + acc.profile.nick : '已登录 LOFTER');
    } else {
      store.settings.profile = null;
      store.settings.subscribedTags = [];
      store.saveSettings();
      toast('还没有登录成功，可以再试一次');
    }
    render();
  };

  // ================= 图标 =================
  const P = {
    home: '<path d="M3.5 10.7 12 3.4l8.5 7.3V20a1 1 0 0 1-1 1h-4.6v-5.6H9.1V21H4.5a1 1 0 0 1-1-1z"/>',
    compass: '<circle cx="12" cy="12" r="8.6"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z"/>',
    search: '<circle cx="11" cy="11" r="6.8"/><path d="m16.2 16.2 4.3 4.3"/>',
    user: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.6 20.4c0-3.8 3.4-5.9 7.4-5.9s7.4 2.1 7.4 5.9"/>',
    back: '<path d="m14.8 5.6-6.4 6.4 6.4 6.4"/>',
    refresh: '<path d="M20.4 12a8.4 8.4 0 1 1-2.5-6"/><path d="M20.6 3.6v5.6h-5.6"/>',
    moon: '<path d="M20.6 13.4A8.6 8.6 0 1 1 10.6 3.4a6.7 6.7 0 0 0 10 10z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
    heart: '<path d="M12 20.3S4.3 15.6 4.3 10.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 7.7 3.2c0 5.4-7.7 10.1-7.7 10.1z"/>',
    bookmark: '<path d="M6.4 3.6h11.2v17l-5.6-3.8-5.6 3.8z"/>',
    bookmarkFill: '<path d="M6.4 3.6h11.2v17l-5.6-3.8-5.6 3.8z" fill="currentColor" stroke="none"/>',
    external: '<path d="M13.4 4.2h6.4v6.4"/><path d="m20 4-8.6 8.6"/><path d="M10.4 5.4H5.6a1.4 1.4 0 0 0-1.4 1.4v11.6a1.4 1.4 0 0 0 1.4 1.4H17a1.4 1.4 0 0 0 1.4-1.4v-4.8"/>',
    export: '<path d="M12 15.2V4.4"/><path d="m7.6 8.8 4.4-4.4 4.4 4.4"/><path d="M5.4 15.4v3.2a1.4 1.4 0 0 0 1.4 1.4h10.4a1.4 1.4 0 0 0 1.4-1.4v-3.2"/>',
    import: '<path d="M12 4.4v10.8"/><path d="m7.6 10.8 4.4 4.4 4.4-4.4"/><path d="M5.4 15.4v3.2a1.4 1.4 0 0 0 1.4 1.4h10.4a1.4 1.4 0 0 0 1.4-1.4v-3.2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    fire: '<path d="M12 2.8s5.4 4 5.4 9.2a5.4 5.4 0 0 1-10.8 0c0-1.9.9-3.1.9-3.1s-2.9 1.8-2.9 5.4a7.4 7.4 0 0 0 14.8 0c0-6.2-7.4-11.5-7.4-11.5z"/>',
    tag: '<path d="M4 4h6.6l9.6 9.6a1.6 1.6 0 0 1 0 2.3l-4.3 4.3a1.6 1.6 0 0 1-2.3 0L4 10.6z"/><circle cx="8.2" cy="8.2" r="1.3"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3 1.8"/>',
    palette: '<path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.2 0 2-.8 2-1.9 0-1.5-1.2-1.7-1.2-2.8 0-.9.7-1.6 1.7-1.6h1.9c2 0 3.6-1.6 3.6-3.6 0-4-3.6-7.3-8-7.3z"/><circle cx="7.4" cy="10.4" r="1"/><circle cx="9.6" cy="6.8" r="1"/><circle cx="14.2" cy="6.6" r="1"/><circle cx="17" cy="9.4" r="1"/>',
    trash: '<path d="M4.6 6.8h14.8"/><path d="M9.4 6.8V4.6h5.2v2.2"/><path d="M6.6 6.8 7.4 20a.9.9 0 0 0 .9.8h7.4a.9.9 0 0 0 .9-.8l.8-13.2"/>',
    info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4"/><circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none"/>',
    grid: '<rect x="3.6" y="3.6" width="7" height="7" rx="1.6"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.6"/><rect x="3.6" y="13.4" width="7" height="7" rx="1.6"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.6"/>',
    play: '<path d="M8 5.6 18.4 12 8 18.4z" fill="currentColor" stroke="none"/>',
    chevron: '<path d="m9.4 5.8 6.4 6.2-6.4 6.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.6 4.4 4.3L19 6.9"/>',
    share: '<circle cx="6.2" cy="12" r="2.4"/><circle cx="17.6" cy="5.8" r="2.4"/><circle cx="17.6" cy="18.2" r="2.4"/><path d="m8.4 10.9 7-3.9M8.4 13.1l7 3.9"/>',
    filter: '<path d="M3.6 5.4h16.8l-6.6 7.6v6.2l-3.6 1.8v-8z"/>',
    shield: '<path d="M12 3.2 19.4 6v5.6c0 4.3-3 7.6-7.4 9.2-4.4-1.6-7.4-4.9-7.4-9.2V6z"/>',
    eye: '<path d="M2.6 12S5.9 6.2 12 6.2 21.4 12 21.4 12 18.1 17.8 12 17.8 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
  };
  const icon = (name, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

  // ================= 本地存储 =================
  const LS = 'lofter-lite:';
  function loadLS(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(LS + key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }
  const saveLS = (key, v) => {
    try {
      localStorage.setItem(LS + key, JSON.stringify(v));
    } catch {}
  };

  const store = {
    settings: Object.assign({
      theme: 'auto', tags: [], reduceMotion: false,
      feedMode: 'recommend', onlyTag: '', blockedTags: [], blockedBlogs: [], mutedBlogs: [],
      profile: null, subscribedTags: [], accountSyncAt: 0, tagSeen: {}, followRecommend: true,
    }, loadLS('settings', {})),
    saved: loadLS('saved', []),
    history: loadLS('history', []),
    recentTags: loadLS('recentTags', []),
    saveSettings() { saveLS('settings', this.settings); },
    saveSaved() { saveLS('saved', this.saved); },
    saveHistory() { saveLS('history', this.history); },
    saveRecent() { saveLS('recentTags', this.recentTags); },
    isSaved(id) { return this.saved.some((p) => String(p.id) === String(id)); },
    toggleSave(post) {
      const i = this.saved.findIndex((p) => String(p.id) === String(post.id));
      if (i >= 0) { this.saved.splice(i, 1); toast('已取消收藏'); }
      else {
        this.saved.unshift({
          id: post.id, blogId: post.author?.id,
          title: post.title || post.digest?.slice(0, 30) || (post.tags?.[0] ? '#' + post.tags[0] : '图片帖'),
          cover: post.cover, author: post.author?.nick, time: Date.now(),
        });
        toast('已收藏');
      }
      this.saved = this.saved.slice(0, 300);
      this.saveSaved();
      return this.isSaved(post.id);
    },
    addHistory(post) {
      this.history = this.history.filter((p) => String(p.id) !== String(post.id));
      this.history.unshift({
        id: post.id, blogId: post.author?.id,
        title: post.title || post.digest?.slice(0, 30) || (post.tags?.[0] ? '#' + post.tags[0] : '图片帖'),
        cover: post.cover, author: post.author?.nick, time: Date.now(),
      });
      this.history = this.history.slice(0, 120);
      this.saveHistory();
    },
    addRecentTag(tag) {
      this.recentTags = [tag, ...this.recentTags.filter((t) => t !== tag)].slice(0, 10);
      this.saveRecent();
    },
  };

  // ================= 主题 =================
  function applyTheme() {
    const t = store.settings.theme || 'auto';
    document.documentElement.dataset.theme = t;
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (NATIVE) { try { Native.setDark(dark); } catch (e) {} }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      meta.setAttribute('content', dark ? '#0e0f11' : '#f4f4f6');
    }
  }

  // ================= API =================
  async function api(path, params = {}) {
    if (nativeApi) return nativeApi.handle(path, params);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    let res;
    try {
      res = await fetch(path + (qs.toString() ? '?' + qs : ''), { headers: { Accept: 'application/json' } });
    } catch {
      throw new Error('连不上本地服务，确认后台的 start.sh 还在运行');
    }
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) throw new Error(body?.error || `请求失败 (${res.status})`);
    return body;
  }

  // ================= 全局 UI =================
  const headerEl = $('#header');
  let viewEl = $('#view');
  const tabbarEl = $('#tabbar');
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }
  function setHeader(html, opts = {}) {
    headerEl.innerHTML = html;
    headerEl.classList.toggle('flat', !!opts.flat);
    headerEl.classList.remove('scrolled');
  }

  const TABS = [
    { id: 'feed', label: '推荐', icon: 'home', href: '#/' },
    { id: 'following', label: '关注', icon: 'heart', href: '#/following' },
    { id: 'search', label: '搜索', icon: 'search', href: '#/search' },
    { id: 'me', label: '我的', icon: 'user', href: '#/me' },
  ];
  function setTab(active) {
    if (!active) { tabbarEl.hidden = true; document.body.classList.add('immersive'); return; }
    tabbarEl.hidden = false;
    document.body.classList.remove('immersive');
    tabbarEl.innerHTML = TABS.map((t) =>
      `<a class="tab ${t.id === active ? 'active' : ''}" href="${t.href}">${icon(t.icon)}<span>${t.label}</span></a>`
    ).join('');
  }

  // ================= 瀑布流 =================
  class Masonry {
    constructor(root, cols = 2) {
      this.root = root;
      this.cols = cols;
      this.nodes = [];
      this.build();
    }
    build() {
      this.root.innerHTML = '';
      this.colsEl = [];
      this.heights = [];
      for (let i = 0; i < this.cols; i++) {
        const c = document.createElement('div');
        c.className = 'col';
        this.root.appendChild(c);
        this.colsEl.push(c);
        this.heights.push(0);
      }
    }
    reset() { this.build(); }
    add(node) {
      const i = this.heights.indexOf(Math.min(...this.heights));
      this.colsEl[i].appendChild(node);
      this.heights[i] = this.colsEl[i].offsetHeight;
    }
  }

  // 长按弹出「不想看这条？」后短时间内不要再触发卡片点击跳转
  let suppressTapUntil = 0;

  function cardEl(post) {
    // 缩略图比例做钳制：特长图（1:5）和横图（5:1）都裁到适合瀑布流的比例
    // 视频帖经常拿不到 firstImageWH：按 16:9 横放，别用 0.78 把横屏视频裁成竖条
    const isVideo = post.type === 3 || post.type === 4 || !!post.dur;
    const natural = post.coverW && post.coverH ? post.coverW / post.coverH : (isVideo ? 16 / 9 : 0.78);
    const ratio = Math.min(1.9, Math.max(0.62, natural));
    const cover = post.cover ? thumb(post.cover, natural < 0.45 ? 340 : 480) : '';
    const saved = store.isSaved(post.id);
    const el = document.createElement('article');
    el.className = 'card' + (cover ? '' : ' text-only');
    el.dataset.id = post.id;

    const media = cover
      ? `<a class="card-media" href="#/post/${post.author.id}/${post.id}">
           <img src="${esc(cover)}" alt="" loading="lazy" style="aspect-ratio:${ratio.toFixed(4)};object-fit:cover;object-position:center" data-aspect data-shape="${natural > 2 ? 'wide' : natural < 0.55 ? 'tall' : ''}">
           ${isVideo ? `<span class="play"><span>${icon('play')}</span></span>` : ''}
           ${isVideo && post.dur ? `<span class="dur">${fmtDur(post.dur)}</span>` : ''}
         </a>`
      : '';

    const title = post.title ? `<h3 class="card-title">${esc(post.title)}</h3>` : '';
    const text = post.digest ? `<p class="card-text">${esc(post.digest)}</p>` : '';
    const tags = (post.tags || []).slice(0, 2).map((t) => `<span class="mini-tag">#${esc(t)}</span>`).join('');
    const likes = post.stats?.like ? `<span class="stat">${icon('heart')}${num(post.stats.like)}</span>` : '';

    el.innerHTML = `
      ${media}
      <div class="card-body">
        ${title}${text}
        ${tags ? `<div class="card-tags">${tags}</div>` : ''}
        <div class="card-foot">
          <img class="ava" src="${esc(post.author.avatar || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <span class="nick">${esc(post.author.nick)}</span>
          ${likes}
        </div>
      </div>
      <button class="card-save ${saved ? 'on' : ''}" data-save="${post.id}" aria-label="收藏">${icon(saved ? 'bookmarkFill' : 'bookmark')}</button>`;
    // 整张卡片都能点进详情（封面外的标题/正文/标签/作者栏都算），收藏按钮和链接除外
    el.addEventListener('click', (e) => {
      if (Date.now() < suppressTapUntil) return;
      if (e.target.closest('a, button')) return;
      location.hash = `#/post/${post.author.id}/${post.id}`;
    });
    return el;
  }

  function fmtDur(sec) {
    const s = Number(sec) || 0;
    if (!s) return '';
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  // 推荐流里的视频帖，列表接口不带时长：只对还没时长的视频卡补一次详情（最多 4 张），拿到就贴角标。
  // 时长按帖子 id 记在内存里：瀑布流重排会重建卡片，重排后要能立刻贴回角标，不能靠元素本身。
  const videoDurCache = new Map();
  const videoDurPending = new Set();
  function applyVideoDurations() {
    for (const c of document.querySelectorAll('#masonry .card')) {
      const media = c.querySelector('.card-media');
      if (!media || !media.querySelector('.play') || media.querySelector('.dur')) continue;
      const sec = videoDurCache.get(c.dataset.id);
      if (!sec) continue;
      const tag = document.createElement('span');
      tag.className = 'dur';
      tag.textContent = fmtDur(sec);
      media.appendChild(tag);
    }
  }
  async function fillVideoDurations() {
    if (!nativeApi) return;
    applyVideoDurations();
    const cards = [...document.querySelectorAll('#masonry .card')]
      .filter((c) => {
        const media = c.querySelector('.card-media');
        return media && media.querySelector('.play') && !media.querySelector('.dur')
          && !videoDurCache.has(c.dataset.id) && !videoDurPending.has(c.dataset.id);
      })
      .slice(0, 4);
    for (const c of cards) {
      const media = c.querySelector('.card-media');
      const hit = (media.getAttribute('href') || '').match(/#\/post\/([^/]+)\/(\d+)/);
      if (!hit) continue;
      videoDurPending.add(c.dataset.id);
      try {
        const detail = await api('/api/post', { blogId: hit[1], postId: hit[2] });
        if (detail && detail.dur) {
          videoDurCache.set(c.dataset.id, detail.dur);
          applyVideoDurations();
        }
      } catch (e) {
      } finally {
        videoDurPending.delete(c.dataset.id);
      }
    }
  }

  function bigCardEl(post, isRec) {
    const natural = post.coverW && post.coverH ? post.coverW / post.coverH : 0.78;
    const ratio = Math.min(1.8, Math.max(0.7, natural));
    const cover = post.cover ? thumb(post.cover, 780) : '';
    const isVideo = post.type === 3 || post.type === 4 || !!post.dur;
    const el = document.createElement('article');
    el.className = 'big-card';
    el.innerHTML = `
      ${(post.thumbs && post.thumbs.length >= 2)
        ? `<a class="big-thumb-strip" href="#/post/${post.originBlogId || post.author.id}/${post.id}">
            ${post.thumbs.slice(0, 6).map((src, i, arr) => `<span class="thumb-wrap"><img src="${esc(thumb(src, 720))}" alt="" loading="lazy" data-aspect>${i === arr.length - 1 && post.photoCount > arr.length ? `<b class="thumb-more">+${post.photoCount - arr.length}</b>` : ''}</span>`).join('')}
          </a>`
        : cover ? `<a class="big-cover" href="#/post/${post.originBlogId || post.author.id}/${post.id}">
            <img src="${esc(cover)}" style="aspect-ratio:${ratio.toFixed(3)}" loading="lazy" data-aspect>
            ${isVideo ? `<span class="play"><span>${icon('play')}</span></span>` : ''}
            ${post.dur ? `<span class="dur">${fmtDur(post.dur)}</span>` : ''}
          </a>` : ''}
      ${post.photoCount > 1 && !isVideo && !(post.thumbs && post.thumbs.length >= 2) ? `<span class="multi-badge">${post.photoCount} 图</span>` : ''}
      ${post.rec || isRec ? `<span class="rec-badge">${post.recBy ? esc(post.recBy) + ' 推荐' : '推荐'}</span>` : ''}
      <div class="big-body">
        ${post.title ? `<h3 class="big-title">${esc(post.title)}</h3>` : ''}
        ${post.digest ? `<p class="big-text">${esc(post.digest)}</p>` : ''}
        ${post.tags && post.tags.length ? `<div class="card-tags">${post.tags.slice(0, 8).map((t) => `<a class="mini-tag" href="#/tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        <div class="big-foot">
          <a class="big-author" href="#/blog/${encodeURIComponent(post.author.name)}">
            <img class="ava" src="${esc(post.author.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span>${esc(post.author.nick)}</span>
          </a>
          <span style="flex:1"></span>
          ${post.stats && post.stats.like ? `<span class="stat">${icon('heart')}${num(post.stats.like)}</span>` : ''}
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      location.hash = `#/post/${post.originBlogId || post.author.id}/${post.id}`;
    });
    return el;
  }

  function bindImages(root) {
    $$('img[data-aspect]', root).forEach((img) => {
      if (img.complete && img.naturalWidth) img.classList.add('loaded');
      else img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      img.addEventListener('error', () => { img.style.opacity = '1'; img.style.background = 'var(--bg-soft)'; }, { once: true });
    });
  }

  function skeletonEl(h) {
    const el = document.createElement('div');
    el.className = 'skeleton';
    el.innerHTML = `<div class="sk-img" style="height:${h}px"></div>
      <div class="sk-line"></div><div class="sk-line w80"></div><div class="sk-line w60"></div>
      <div style="height:12px"></div>`;
    return el;
  }

  function appendSkeletons(m, n = 6) {
    const hs = [150, 210, 120, 180, 240, 130];
    for (let i = 0; i < n; i++) m.add(skeletonEl(hs[i % hs.length]));
  }

  function emptyEl(text, retry) {
    return `<div class="empty"><div class="big">🍃</div><p>${esc(text)}</p>${retry ? '<button class="retry">重新加载</button>' : ''}</div>`;
  }

  // ================= 收藏按钮（事件委托到 document，避免视图重建后失效） =================
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-save]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.dataset.save;
    const pool = [...(feedCaches['/']?.posts || []), ...(feedCaches['/hot']?.posts || []), ...(currentFeedExtra || [])];
    const post = pool.find((p) => String(p.id) === String(id));
    if (!post) return;
    const on = store.toggleSave(post);
    $$(`[data-save="${id}"]`).forEach((b) => {
      b.classList.toggle('on', on);
      b.innerHTML = icon(on ? 'bookmarkFill' : 'bookmark');
    });
  });

  // ================= 路由 =================
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  let currentRoute = '/';
  let navId = 0;
  const scrollPos = new Map();
  let currentFeedExtra = [];
  const feedCaches = {
    '/': { posts: [], cursor: null, loading: false, done: false },
    '/hot': { posts: [], cursor: null, loading: false, done: false },
  };

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    const q = new URLSearchParams(queryPart || '');
    return { path: '/' + parts.join('/'), parts, q };
  }
  function nav(hash) { location.hash = hash; }
  function back() {
    if (history.length > 1) history.back();
    else nav('#/');
  }

  // 恢复滚动位置时写回 scrollPos 会把目标值覆盖成 0，所以恢复期间不记
  let restoringScroll = false;
  function saveScroll() {
    if (restoringScroll) return;
    scrollPos.set(currentRoute, window.scrollY);
  }

  // 从详情/列表返回时把原来的滑动位置还回去。页面内容是异步加载的，
  // 高度会一直变，所以按 100ms 重试，直到滚到目标位置或高度够了；
  // 用户一动手就把滚动权交还，别跟手指抢。
  function restoreScroll(id, y) {
    if (id !== navId) return;
    const target = y || 0;
    if (!target) { window.scrollTo(0, 0); return; }
    restoringScroll = true;
    let tries = 0;
    let timer = 0;
    const stop = () => {
      restoringScroll = false;
      clearTimeout(timer);
      window.removeEventListener('touchstart', stop, true);
      window.removeEventListener('wheel', stop, true);
    };
    window.addEventListener('touchstart', stop, true);
    window.addEventListener('wheel', stop, true);
    const tick = () => {
      if (id !== navId || !restoringScroll) return stop();
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(target, max));
      tries += 1;
      if (max >= target - 4 || tries >= 20) return stop();
      timer = setTimeout(tick, 100);
    };
    tick();
  }

  window.addEventListener('hashchange', () => {
    saveScroll();
    render();
  });

  let scrollTick = 0;
  window.addEventListener('scroll', () => {
    saveScroll();
    if (scrollTick) return;
    scrollTick = requestAnimationFrame(() => {
      scrollTick = 0;
      headerEl.classList.toggle('scrolled', window.scrollY > 4);
    });
  }, { passive: true });

  document.addEventListener('visibilitychange', () => { if (document.hidden) saveScroll(); });

  // ================= 页面：推荐 / 热门 =================
  // ================= 首页（推荐 / 关注 / 只看标签） =================
  function feedTags(onlyTag) {
    if (onlyTag) return [onlyTag];
    const custom = store.settings.tags || [];
    const subs = store.settings.subscribedTags || [];
    return [...new Set([...custom, ...subs])].slice(0, 20);
  }

  function getCache(key) {
    if (!feedCaches[key]) feedCaches[key] = { posts: [], cursor: null, offset: 0, loading: false, done: false, emptyRuns: 0 };
    return feedCaches[key];
  }
  function resetCache(key) {
    const c = getCache(key);
    c.posts = []; c.cursor = null; c.offset = 0; c.done = false; c.emptyRuns = 0;
  }
  function blockedBlogList() {
    return (store.settings.blockedBlogs || []).map((b) => (typeof b === 'string' ? { name: b, nick: b } : b));
  }
  // 本机屏蔽的用户（mute）：只隐藏内容，不写账号、不通知对方
  function mutedBlogList() {
    return (store.settings.mutedBlogs || []).map((b) => (typeof b === 'string' ? { name: b, nick: b } : b));
  }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isBlockedPost(p) {
    const b = store.settings.blockedTags || [];
    if (b.length && (p.tags || []).some((t) => b.indexOf(t) >= 0)) return true;
    const a = p.author || {};
    const mb = mutedBlogList();
    if (mb.length && (a.name || a.nick)) {
      if (mb.some((x) => (a.name && x.name === a.name) || (a.nick && (x.nick === a.nick || x.name === a.nick)))) return true;
    }
    const bb = blockedBlogList();
    if (bb.length) {
      const name = a.name;
      const nick = a.nick;
      if (bb.some((x) => x.name === name || x.name === nick || x.nick === nick)) return true;
    }
    return false;
  }
  function findPost(id) {
    const pools = Object.values(feedCaches).map((c) => c.posts).concat([currentFeedExtra]);
    for (const pool of pools) {
      const p = (pool || []).find((x) => String(x.id) === String(id));
      if (p) return p;
    }
    return null;
  }
  function blockTag(tag) {
    if (!tag) return;
    const list = store.settings.blockedTags || [];
    if (list.indexOf(tag) >= 0) { toast('已经屏蔽过 #' + tag); return; }
    list.push(tag);
    store.settings.blockedTags = list;
    store.saveSettings();
    toast('已屏蔽 #' + tag);
    $$('.card').forEach((c) => {
      const p = findPost(c.dataset.id);
      if (p && (p.tags || []).indexOf(tag) >= 0) c.remove();
    });
    // 在详情页里屏蔽当前作品的标签 → 这条应该看不见了，退回上一页
    if ((location.hash || '').indexOf('#/post/') === 0) { closeSheet(); back(); }
  }
  function confirmBlock(tag) {
    if (confirm('屏蔽 #' + tag + '？\n之后带这个标签的内容会自动隐藏。')) blockTag(tag);
  }
  // 屏蔽用户：本机隐藏 TA 的内容。和「拉黑」（账号黑名单）是两件事。
  function muteBlog(ref, silent) {
    if (!ref) return false;
    const a = typeof ref === 'string' ? { name: ref, nick: ref } : ref;
    if (!a.name) return false;
    const list = mutedBlogList();
    if (list.some((b) => b.name === a.name)) {
      if (!silent) toast('已经屏蔽过 @' + (a.nick || a.name));
      return false;
    }
    list.unshift({ name: a.name, nick: a.nick || a.name, avatar: a.avatar || '', time: Date.now() });
    store.settings.mutedBlogs = list;
    store.saveSettings();
    if (!silent) toast('已屏蔽 @' + (a.nick || a.name) + '（仅本机）');
    $$('.card').forEach((c) => {
      const p = findPost(c.dataset.id);
      if (p && isBlockedPost(p)) c.remove();
    });
    // 在详情页屏蔽作者后，这条内容也不该再显示
    if ((location.hash || '').indexOf('#/post/') === 0) { closeSheet(); back(); }
    return true;
  }
  function unmuteBlog(name) {
    store.settings.mutedBlogs = mutedBlogList().filter((b) => b.name !== name);
    store.saveSettings();
  }
  function blogRefOf(post) {
    const a = (post && post.author) || {};
    if (!a.name) return null;
    return { name: a.name, nick: a.nick || a.name, avatar: a.avatar || '' };
  }
  let sheetPost = null;
  function openBlockSheet(post) {
    sheetPost = post;
    const tags = (post.tags || []).slice(0, 10);
    const ref = blogRefOf(post);
    const muted = ref && mutedBlogList().some((b) => b.name === ref.name);
    openSheet(`
      <h3>不想看这条？</h3>
      <p class="hint">屏蔽标签后，推荐、话题、关注流里带这个标签的内容都会自动隐藏。</p>
      <div class="chips">${tags.map((t) => `<button class="chip" data-block="${esc(t)}">屏蔽 #${esc(t)}</button>`).join('')}</div>
      ${ref ? `<div class="blk-sec-title">不想看这个人？</div>
        <p class="hint">只是这台手机上隐藏 TA 的内容，不会通知对方、也不会改动账号。拉黑（账号黑名单）请去「我的 → 拉黑名单」。</p>
        <button class="btn ${muted ? 'muted-on' : ''}" data-mute-blog="${esc(ref.name)}" style="width:100%">${muted ? '已屏蔽 @' + esc(ref.nick) + ' · 点此取消' : '屏蔽 @' + esc(ref.nick)}</button>` : ''}
      <div class="actions">
        ${tags[0] ? `<button class="btn" data-only="${esc(tags[0])}">只看 #${esc(tags[0])}</button>` : ''}
        <button class="btn ghost" data-close>取消</button>
      </div>`);
  }
  function setOnlyTag(tag) {
    store.settings.onlyTag = tag || '';
    if (tag) store.settings.feedMode = 'recommend';
    store.saveSettings();
    closeSheet();
    toast(tag ? '只看 #' + tag : '已取消只看');
    if ((location.hash || '#/') === '#/') { render(); window.scrollTo(0, 0); }
    else nav('#/');
  }
  async function openOnlySheet() {
    let all = [];
    try { all = (await api('/api/catalog')).categories.flatMap((c) => c.tags); } catch (e) {}
    const tags = [...new Set([...(store.settings.tags || []), ...(store.recentTags || []), ...all])].filter(Boolean).slice(0, 30);
    openSheet(`
      <h3>只看某个标签</h3>
      <p class="hint">推荐流只显示这个标签下的最新内容，随时可以取消。</p>
      <div class="search-box" style="background:var(--bg-soft)">
        ${icon('tag')}<input id="only-input" placeholder="输入标签，回车确认" maxlength="20">
      </div>
      <div class="chips" style="margin-top:14px">
        ${tags.map((t) => `<button class="chip sm" data-only-choose="${esc(t)}">#${esc(t)}</button>`).join('')}
      </div>
      ${store.settings.onlyTag ? '<div class="actions"><button class="btn ghost" data-only-clear>取消只看</button></div>' : ''}`);
    const input = $('#only-input');
    if (input) input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = input.value.trim();
      if (v) setOnlyTag(v);
    });
  }

  function loginCard() {
    return `<div class="login-card">
      <div class="lc-icon">${icon('user')}</div>
      <h3>登录后查看关注流</h3>
      <p>只读取你关注的人发布的公开作品，不会点赞、评论或发布内容。</p>
      <button class="btn primary" id="do-login">${icon('external')} 登录 LOFTER</button>
      <div class="lc-tip">${NATIVE ? 'QQ 登录会显示二维码，用手机 QQ 扫码即可；也可以直接用手机号验证码登录。' : '网页版不支持登录，请安装 APK 使用。'}</div>
      <div class="lc-tip">${NATIVE ? '登录态保存在本机，可随时在「我的」里退出。' : ''}</div>
      ${NATIVE ? '<button class="link-btn" id="recheck-login">已经登录了但还显示这个？点我重新检测</button>' : ''}
    </div>`;
  }

  async function viewHome() {
    setTab('feed');
    const onlyTag = store.settings.onlyTag || '';

    // 冷启动时把账号订阅标签同步进来（6 小时内不重复拉）
    if (nativeApi) {
      try {
        if (await checkLogin() && Date.now() - (store.settings.accountSyncAt || 0) > 6 * 3600e3) {
          await syncAccount();
        }
      } catch (e) {}
    }

    const key = onlyTag ? '/only:' + onlyTag : '/';
    const cache = getCache(key);

    setHeader(`
      <div class="brand"><b>LOFTER</b><span>v5.7</span></div>
      <div class="spacer"></div>
      <button class="icon-btn ${onlyTag ? 'accent' : ''}" id="btn-only" aria-label="只看标签">${icon('filter')}</button>
      <button class="icon-btn" id="btn-theme" aria-label="切换主题">${icon('moon')}</button>
      <button class="icon-btn" id="btn-refresh" aria-label="刷新">${icon('refresh')}</button>`);
    $('#btn-theme')?.addEventListener('click', toggleTheme);
    $('#btn-refresh')?.addEventListener('click', () => { resetCache(key); toast('已刷新'); render(); });
    $('#btn-only')?.addEventListener('click', openOnlySheet);

    viewEl.innerHTML = `
      ${onlyTag ? `<div class="onlybar"><span>只看 <b>#${esc(onlyTag)}</b></span><button id="clear-only">取消</button></div>` : ''}
      <div class="feed">
        <div class="pull-hint" id="pull">下拉刷新</div>
        <div class="masonry" id="masonry"></div>
        <div class="load-more" id="loadmore"></div>
        <div id="sentinel" style="height:1px"></div>
      </div>`;
    $('#clear-only')?.addEventListener('click', () => setOnlyTag(''));

    const m = new Masonry($('#masonry'), colsFor());
    const token = navId;
    bindImages(viewEl);

    const paint = () => {
      m.reset();
      for (const p of cache.posts) m.add(cardEl(p));
      bindImages(viewEl);
      $('#loadmore').innerHTML = cache.done ? '已经到底啦 · 休息一下' : '';
      setTimeout(fillVideoDurations, 120);
    };

    if (cache.posts.length) {
      paint();
    } else {
      appendSkeletons(m, 6);
    }

    let fetching = false;
    async function loadMore(first = false) {
      if (fetching || cache.loading || cache.done) return;
      fetching = true;
      cache.loading = true;
      if (!first && $('#loadmore')) $('#loadmore').innerHTML = '<span class="spinner"></span>加载中';
      try {
        const params = {};
        const tags = feedTags(onlyTag);
        if (tags.length) params.tags = tags.join(',');
        if (cache.cursor) params.cursor = cache.cursor;
        const data = await api('/api/feed', params);
        if (token !== navId) return;
        const seen = new Set(cache.posts.map((p) => p.id));
        const fresh = (data.posts || []).filter((p) => !seen.has(p.id));
        const allowed = fresh.filter((p) => !isBlockedPost(p));
        const hidden = fresh.length - allowed.length;
        cache.posts.push(...allowed);
        cache.cursor = data.cursor;
        cache.failed = false;
        cache.emptyRuns = allowed.length ? 0 : (cache.emptyRuns || 0) + 1;
        if (!data.posts || !data.posts.length || cache.emptyRuns >= 3) cache.done = true;
        if (hidden) toast('已屏蔽 ' + hidden + ' 条内容');
        if (allowed.length && $('#masonry').querySelector('.skeleton')) m.reset();
        for (const p of allowed) m.add(cardEl(p));
        bindImages(viewEl);
        setTimeout(fillVideoDurations, 120);
        if ($('#loadmore')) $('#loadmore').innerHTML = cache.done ? '已经到底啦 · 休息一下' : '';
      } catch (err) {
        if (token !== navId) return;
        if (!cache.posts.length) {
          viewEl.innerHTML = `<div class="feed">${emptyEl(err.message || '加载失败，稍后再试', true)}</div>`;
          $('#view .retry')?.addEventListener('click', () => { resetCache(key); render(); });
        } else {
          cache.failed = true;
          if ($('#loadmore')) {
            $('#loadmore').innerHTML = `<button id="retry-more" class="retry-inline">加载失败：${esc(err.message || '网络异常')}，点此重试</button>`;
            $('#retry-more')?.addEventListener('click', () => loadMore(false));
          }
        }
      } finally {
        cache.loading = false;
        fetching = false;
        if (token === navId && !cache.failed && $('#loadmore')) $('#loadmore').innerHTML = cache.done ? '已经到底啦 · 休息一下' : '';
      }
    }

    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) loadMore();
    }, { rootMargin: '700px 0px' });
    io.observe($('#sentinel'));

    if (!cache.posts.length) loadMore(true);

    let startY = 0, pulling = false;
    const onStart = (e) => {
      if (window.scrollY > 0) return;
      startY = e.touches[0].clientY;
      pulling = true;
    };
    const onMove = (e) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      const hint = $('#pull');
      if (hint) hint.classList.toggle('on', dy > 40);
    };
    const onEnd = (e) => {
      if (!pulling) return;
      const dy = (e.changedTouches?.[0]?.clientY || 0) - startY;
      pulling = false;
      $('#pull')?.classList.remove('on');
      if (dy > 70 && window.scrollY <= 0) {
        resetCache(key);
        m.reset();
        appendSkeletons(m, 6);
        loadMore(true);
      }
    };
    viewEl.addEventListener('touchstart', onStart, { passive: true });
    viewEl.addEventListener('touchmove', onMove, { passive: true });
    viewEl.addEventListener('touchend', onEnd, { passive: true });

    const killOnRouteChange = () => {
      if (token !== navId) io.disconnect();
      else setTimeout(killOnRouteChange, 300);
    };
    setTimeout(killOnRouteChange, 300);
  }

  function colsFor() {
    const w = window.innerWidth;
    if (w >= 1100) return 4;
    if (w >= 760) return 3;
    return 2;
  }

  function effectiveTheme() {
    const t = store.settings.theme || 'auto';
    if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return t;
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }
  function setTheme(t) {
    store.settings.theme = t;
    store.saveSettings();
    applyTheme();
    toast(t === 'auto' ? '跟随系统' : t === 'dark' ? '夜间模式' : '日间模式');
    const b = $('#btn-theme');
    if (b) b.innerHTML = icon(effectiveTheme() === 'dark' ? 'sun' : 'moon');
    const v = $('#theme-val');
    if (v) v.textContent = themeLabel();
  }

  // ================= 底部面板 =================
  const sheetEl = $('#sheet');
  function openSheet(html) {
    $('.sheet', sheetEl).innerHTML = `<div class="grab"></div>${html}`;
    sheetEl.hidden = false;
  }
  function closeSheet() { sheetEl.hidden = true; }
  sheetEl.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-theme-opt]');
    if (opt) { setTheme(opt.dataset.themeOpt); closeSheet(); return; }
    const blk = e.target.closest('[data-block]');
    if (blk) { blockTag(blk.dataset.block); closeSheet(); return; }
    const muteBtn = e.target.closest('[data-mute-blog]');
    if (muteBtn) {
      const ref = blogRefOf(sheetPost);
      const name = (ref && ref.name) || muteBtn.dataset.muteBlog;
      if (mutedBlogList().some((x) => x.name === name)) {
        unmuteBlog(name);
        toast('已取消屏蔽 @' + name);
      } else {
        muteBlog(ref || name, false);
      }
      closeSheet();
      if ((location.hash || '') === '#/muted') viewMuted();
      return;
    }
    const choose = e.target.closest('[data-only-choose]');
    if (choose) { setOnlyTag(choose.dataset.onlyChoose); return; }
    const onlyBtn = e.target.closest('[data-only]');
    if (onlyBtn) { setOnlyTag(onlyBtn.dataset.only); return; }
    if (e.target.closest('[data-only-clear]')) { setOnlyTag(''); return; }
    if (e.target.closest('.sheet-mask') || e.target.closest('[data-close]')) closeSheet();
  });

  // 长按卡片 / 标签 → 快捷屏蔽
  let pressTimer = 0, pressMoved = false;
  document.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.card');
    const chip = e.target.closest('[data-tag-block]');
    if (!card && !chip) return;
    pressMoved = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (pressMoved) return;
      suppressTapUntil = Date.now() + 800;
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
      if (chip) {
        confirmBlock(chip.dataset.tagBlock);
      } else {
        const p = findPost(card.dataset.id);
        if (p) openBlockSheet(p);
      }
    }, 520);
  }, { passive: true });
  document.addEventListener('touchmove', () => { pressMoved = true; clearTimeout(pressTimer); }, { passive: true });
  document.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    suppressTapUntil = Date.now() + 800;
    const p = findPost(card.dataset.id);
    if (p) openBlockSheet(p);
  });

  // ================= 页面：标签 =================
  async function viewTag(name, sort = 'new') {
    store.settings.tagSeen = Object.assign({}, store.settings.tagSeen || {}, { [name]: Date.now() });
    store.saveSettings();
    setTab('feed');
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title"># ${esc(name)}</div>
      <div class="spacer"></div>
      <button class="icon-btn" id="btn-block-tag" aria-label="屏蔽标签">${icon('shield')}</button>
      <button class="icon-btn" id="btn-refresh" aria-label="刷新">${icon('refresh')}</button>
    `);
    $('#btn-back').addEventListener('click', back);
    $('#btn-refresh').addEventListener('click', () => render());
    $('#btn-block-tag')?.addEventListener('click', () => {
      if (confirm('屏蔽 #' + name + '？\n之后带这个标签的内容会从首页隐藏。')) { blockTag(name); back(); }
    });
    currentFeedExtra = [];

    viewEl.innerHTML = `
      <div class="page-head">
        <div class="tag-hero">
          <img class="cover" id="tag-cover" alt="" style="visibility:hidden">
          <div class="meta">
            <div class="n" id="tag-sub">正在读取…</div>
            <div class="sub">按发布时间浏览公开内容</div>
          </div>
        </div>
        <div class="seg" id="seg">
          <button data-sort="new" class="${sort === 'new' ? 'on' : ''}">最新</button>
          <button data-sort="hot" class="${sort === 'hot' ? 'on' : ''}">热门</button>
        </div>
      </div>
      <div class="feed">
        <div class="masonry" id="masonry"></div>
        <div class="load-more" id="loadmore"></div>
        <div id="sentinel" style="height:1px"></div>
      </div>`;

    api('/api/taginfo', { name }).then((info) => {
      if (info.cover) {
        const img = $('#tag-cover');
        if (img) { img.src = thumb(info.cover, 200); img.style.visibility = 'visible'; }
      }
      const sub = $('#tag-sub');
      if (sub) sub.textContent = info.followers ? `${num(info.followers)} 人关注 · ${num(info.views)} 次浏览` : '';
    }).catch(() => {});

    $('#seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]');
      if (b && b.dataset.sort !== sort) {
        store.addRecentTag(name);
        nav(`#/tag/${encodeURIComponent(name)}?sort=${b.dataset.sort}`);
      }
    });

    const m = new Masonry($('#masonry'), colsFor());
    appendSkeletons(m, 6);

    let offset = 0, loading = false, done = false;
    let shown = 0, emptyPages = 0, pumped = 0;
    const token = navId;

    // 作品被「标签屏蔽 / 屏蔽用户」过滤掉以后只剩几张卡时，页面比屏幕还短，
    // sentinel 一直停在视口里，IntersectionObserver 不会再次触发 —— 会卡住不再加载。
    // 所以每轮加载完再看一眼：还在视野里就自己接着拉下一页。
    function sentinelInView() {
      const el = $('#sentinel');
      if (!el) return false;
      return el.getBoundingClientRect().top < window.innerHeight + 700;
    }

    async function load() {
      if (loading || done) return;
      loading = true;
      $('#loadmore').innerHTML = '<span class="spinner"></span>加载中';
      try {
        const data = await api('/api/tag', { name, offset, sort });
        if (token !== navId) return;
        $('#masonry').querySelectorAll('.skeleton').forEach((s) => s.remove());
        if (!data.posts.length) {
          done = true;
          if (!offset && !shown) {
            viewEl.innerHTML = `<div class="page-head"><div class="tag-hero"><div class="meta"><div class="n">#${esc(name)}</div></div></div></div>${emptyEl('这个话题下暂时没有公开内容', false)}`;
            return;
          }
        } else {
          currentFeedExtra.push(...data.posts);
          if (currentFeedExtra.length > 200) currentFeedExtra = currentFeedExtra.slice(-200);
          for (const p of data.posts) if (!isBlockedPost(p)) { m.add(cardEl(p)); shown++; }
          bindImages(viewEl);
          offset = data.nextOffset;
        }
        // 作品全被「标签屏蔽 / 屏蔽用户」过滤掉时页面会剩下空白：先把后面几页翻完，
        // 翻完还是空的就给一句说明，别让用户对着空页面以为卡住了
        if (!shown) {
          // 只多翻 3 页：上游可能一直回 hasMore=true，不能无限刷；
          // 后续几页由 finally 里的「还在视野里就接着拉」负责，别在这里递归
          if (!done && emptyPages < 3) { emptyPages++; return; }
          done = true;
          const blocked = (store.settings.blockedTags || []).indexOf(name) >= 0;
          viewEl.querySelector('.masonry').innerHTML = blocked
            ? emptyEl(`已屏蔽 #${name}，这个标签下的作品不会显示。到「我的 → 标签屏蔽」里可以取消。`, false)
            : emptyEl('这个标签下的作品都被屏蔽标签或屏蔽用户过滤掉了', false);
          $('#loadmore').innerHTML = '';
          return;
        }
        $('#loadmore').innerHTML = done ? (offset ? '已经到底啦 · 休息一下' : '') : '';
      } catch (err) {
        if (token !== navId) return;
        if (!offset) viewEl.querySelector('.masonry').innerHTML = emptyEl(err.message, true);
        else toast('加载失败：' + err.message);
      } finally {
        loading = false;
        if (!done && token === navId && pumped++ < 40 && sentinelInView()) setTimeout(load, 60);
      }
    }

    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) load(); }, { rootMargin: '700px 0px' });
    io.observe($('#sentinel'));
    load();
    store.addRecentTag(name);
  }

  // ================= 页面：博主 =================
  async function viewBlog(name) {
    setTab(null);
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">${esc(name)}</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);

    viewEl.innerHTML = `<div class="feed"><div class="masonry" id="masonry"></div><div class="load-more" id="loadmore"></div><div id="sentinel"></div></div>`;
    const m = new Masonry($('#masonry'), colsFor());
    appendSkeletons(m, 6);

    let offset = 0, loading = false, done = false, first = true;
    const token = navId;

    async function load() {
      if (loading || done) return;
      loading = true;
      try {
        const data = await api('/api/blog', { name, offset });
        if (token !== navId) return;
        if (first) {
          first = false;
          const b = data.blog;
          headerEl.innerHTML = `
            <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
            <div class="spacer"></div>
            <button class="icon-btn" id="btn-follow-blog" aria-label="关注">${icon('user')}</button>
            <button class="icon-btn" id="btn-mute-blog" aria-label="屏蔽该用户">${icon('shield')}</button>
            <button class="icon-btn" id="btn-open-blog" aria-label="在 LOFTER 打开">${icon('external')}</button>`;
          $('#btn-back').addEventListener('click', back);
          $('#btn-open-blog').addEventListener('click', () => openExternal(b.url));
          if (mutedBlogList().some((x) => x.name === b.name)) $('#btn-mute-blog').classList.add('accent');
          $('#btn-mute-blog')?.addEventListener('click', () => {
            const ref = { name: b.name, nick: b.nick, avatar: b.avatar };
            const on = mutedBlogList().some((x) => x.name === ref.name);
            if (on) {
              unmuteBlog(ref.name);
              $('#btn-mute-blog').classList.remove('accent');
              toast('已取消屏蔽 @' + (ref.nick || ref.name));
            } else if (confirm('屏蔽 @' + (b.nick || b.name) + '？\n只在这台手机上隐藏 TA 的内容，不影响账号、不通知对方。')) {
              muteBlog(ref, false);
              $('#btn-mute-blog').classList.add('accent');
            }
          });
          let following = false;
          $('#btn-follow-blog')?.addEventListener('click', async () => {
            try {
              await api('/api/follow-blog', { blogId: b.id, domain: b.name, follow: following ? '0' : '1' });
              following = !following;
              $('#btn-follow-blog').classList.toggle('accent', following);
              toast(following ? '已关注' : '已取消关注');
            } catch (e) { toast(e.message); }
          });
          const head = document.createElement('div');
          head.className = 'page-head';
          head.innerHTML = `
            <div class="tag-hero">
              <img class="cover" src="${esc(b.avatar)}" alt="" style="border-radius:50%">
              <div class="meta"><h1 style="font-size:19px">${esc(b.nick)}</h1>
              <div class="sub">${esc(b.intro || b.name)}</div></div>
            </div>`;
          viewEl.insertBefore(head, viewEl.firstChild);
        }
        $('#masonry').querySelectorAll('.skeleton').forEach((s) => s.remove());
        if (!data.posts.length) { done = true; if (!offset) $('#loadmore').textContent = '这位博主还没有公开作品'; }
        else { for (const p of data.posts) if (!isBlockedPost(p)) m.add(cardEl(p)); bindImages(viewEl); offset = data.nextOffset; currentFeedExtra.push(...data.posts); }
        $('#loadmore').textContent = done ? '' : '';
      } catch (err) {
        if (token !== navId) return;
        if (!offset) viewEl.querySelector('.masonry').innerHTML = emptyEl(err.message, false);
      } finally { loading = false; }
    }
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) load(); }, { rootMargin: '700px 0px' });
    io.observe($('#sentinel'));
    load();
  }

  // ================= 页面：关注 / 粉丝列表 =================
  function relRowEl(u) {
    const el = document.createElement('a');
    el.className = 'rel-row';
    el.href = '#/blog/' + encodeURIComponent(u.name || '');
    el.innerHTML = `
      ${u.avatar
        ? `<img class="rel-ava" src="${esc(thumb(u.avatar, 160))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
        : `<div class="rel-ava rel-ava-ph">${icon('user')}</div>`}
      <div class="rel-main">
        <div class="rel-nick">${esc(u.nick || u.name || 'LOFTER 用户')}</div>
        <div class="rel-sub">@${esc(u.name || '')}${u.intro ? ' · ' + esc(u.intro) : ''}</div>
      </div>
      ${u.followers ? `<span class="rel-count">${num(u.followers)} 粉丝</span>` : ''}`;
    return el;
  }

  async function viewRelation(kind) {
    setTab('me');
    const isFans = kind === 'fans';
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">${isFans ? '粉丝' : '关注'}</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    viewEl.innerHTML = `
      <div class="channels" id="rel-tabs">
        <button class="ch ${isFans ? '' : 'on'}" data-rel="following">关注</button>
        <button class="ch ${isFans ? 'on' : ''}" data-rel="fans">粉丝</button>
      </div>
      <div id="rel-body"></div>`;
    $('#rel-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rel]');
      if (!b) return;
      const next = b.dataset.rel;
      if ((next === 'fans') === isFans) return;
      location.hash = '#/relation?type=' + next;
    });
    const body = $('#rel-body');
    if (!NATIVE) {
      body.innerHTML = emptyEl('关注 / 粉丝列表需要先在 App 内登录 LOFTER', false);
      return;
    }
    const list = document.createElement('div');
    list.className = 'rel-list';
    body.appendChild(list);
    const sentinel = document.createElement('div');
    sentinel.id = 'sentinel';
    sentinel.style.height = '1px';
    body.appendChild(sentinel);

    const token = navId;
    let offset = 0, done = false, loading = false;
    for (let i = 0; i < 8; i++) list.appendChild(skeletonEl(64));

    async function load() {
      if (loading || done || token !== navId) return;
      loading = true;
      try {
        const d = await api('/api/relation', { type: kind, offset });
        if (token !== navId) return;
        list.querySelectorAll('.skeleton').forEach((n) => n.remove());
        const arr = d.list || [];
        if (!arr.length && !offset) {
          list.innerHTML = `<div class="empty"><div class="big">🍃</div><p>${isFans ? '还没有粉丝' : '还没有关注任何人'}</p></div>`;
        }
        for (const u of arr) list.appendChild(relRowEl(u));
        offset = d.next != null ? d.next : -1;
        done = !d.hasMore || offset < 0;
      } catch (err) {
        if (token !== navId) return;
        list.querySelectorAll('.skeleton').forEach((n) => n.remove());
        if (!offset) {
          body.innerHTML = emptyEl(err.message || '列表加载失败', true);
          body.querySelector('.retry')?.addEventListener('click', () => render());
        } else {
          toast(err.message || '加载失败');
        }
        done = true;
      } finally {
        loading = false;
      }
    }

    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) load(); }, { rootMargin: '600px 0px' });
    io.observe(sentinel);
    load();
  }

  // ================= 页面：账号收藏 =================
  // 账号作品列表：喜欢（红心）/ 推荐（转发出去的作品）
  const ACCOUNT_LIST_META = {
    likes: { title: '喜欢', path: '/api/favorites', empty: '账号里还没有喜欢过作品', unit: '件喜欢' },
    shares: { title: '推荐', path: '/api/shares', empty: '账号里还没有推荐过作品', unit: '件推荐' },
  };

  async function viewAccountPosts(kind) {
    const meta = ACCOUNT_LIST_META[kind] || ACCOUNT_LIST_META.likes;
    setTab('me');
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">${meta.title}</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    if (!NATIVE) {
      viewEl.innerHTML = `<div style="padding:16px">${emptyEl('账号的' + meta.title + '需要先在 App 内登录 LOFTER', false)}</div>`;
      return;
    }
    viewEl.innerHTML = `<div class="feed"><div class="masonry" id="masonry"></div><div class="load-more" id="loadmore"></div><div id="sentinel" style="height:1px"></div></div>`;
    const m = new Masonry($('#masonry'), colsFor());
    appendSkeletons(m, 6);
    const token = navId;
    let offset = 0, done = false, loading = false, total = 0;

    async function load() {
      if (loading || done || token !== navId) return;
      loading = true;
      try {
        const d = await api(meta.path, { offset });
        if (token !== navId) return;
        $('#masonry').querySelectorAll('.skeleton').forEach((n) => n.remove());
        total = d.count || total;
        const posts = (d.posts || []).filter((p) => !isBlockedPost(p));
        if (!posts.length) {
          done = true;
          if (!offset) $('#masonry').innerHTML = `<div class="empty"><div class="big">🍃</div><p>${meta.empty}</p></div>`;
        } else {
          for (const p of posts) m.add(cardEl(p));
          bindImages(viewEl);
          currentFeedExtra.push(...posts);
        }
        if (d.hasMore && d.nextOffset >= 0 && d.nextOffset !== offset) offset = d.nextOffset;
        else done = true;
        const more = $('#loadmore');
        if (more) more.textContent = done ? (total ? '共 ' + num(total) + ' ' + meta.unit : '') : '已显示 ' + offset + ' ' + meta.unit + ' · 继续下拉加载更多';
      } catch (err) {
        if (token !== navId) return;
        $('#masonry').querySelectorAll('.skeleton').forEach((n) => n.remove());
        if (!offset) {
          viewEl.innerHTML = `<div style="padding:16px">${emptyEl(err.message || meta.title + '加载失败', true)}</div>`;
          viewEl.querySelector('.retry')?.addEventListener('click', () => render());
        } else {
          toast(err.message || '加载失败');
        }
        done = true;
      } finally {
        loading = false;
      }
    }

    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) load(); }, { rootMargin: '700px 0px' });
    io.observe($('#sentinel'));
    load();
  }

  // 收藏夹列表 → 收藏夹内的作品
  async function viewCollections() {
    setTab('me');
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">收藏</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    if (!NATIVE) {
      viewEl.innerHTML = `<div style="padding:16px">${emptyEl('账号收藏需要先在 App 内登录 LOFTER', false)}</div>`;
      return;
    }
    viewEl.innerHTML = `<div style="padding:14px 0 30px"><div class="load-more"><span class="spinner"></span>读取收藏夹</div></div>`;
    const token = navId;
    let data;
    try {
      data = await api('/api/collections');
    } catch (err) {
      if (token !== navId) return;
      viewEl.innerHTML = `<div style="padding:16px">${emptyEl(err.message || '收藏夹读取失败', true)}</div>`;
      viewEl.querySelector('.retry')?.addEventListener('click', () => render());
      return;
    }
    if (token !== navId) return;
    const folders = (data.folders || []).filter((f) => f.postCount > 0 || f.isDefault);
    if (!folders.length) {
      viewEl.innerHTML = `<div style="padding:16px">${emptyEl('账号里还没有收藏夹', false)}</div>`;
      return;
    }
    viewEl.innerHTML = `
      <div class="list-card" style="margin-top:14px">
        ${folders.map((f) => `
          <a class="list-row fav-folder" href="#/collection/${f.id}">
            ${f.cover
              ? `<img class="fav-folder-cover" src="${esc(thumb(f.cover, 200))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
              : `<span class="fav-folder-cover fav-folder-ph">${icon('bookmark')}</span>`}
            <div class="fav-folder-main">
              <div class="fav-folder-name">${esc(f.name)}${f.isDefault ? '<span class="fav-folder-tag">默认</span>' : ''}</div>
              <div class="fav-folder-sub">${f.postCount} 件作品${f.description ? ' · ' + esc(f.description) : ''}</div>
            </div>
            <span class="val">${icon('chevron')}</span>
          </a>`).join('')}
      </div>
      <div class="load-more" style="padding-top:14px">共 ${num(data.total || 0)} 件收藏</div>`;
  }

  async function viewCollection(folderId) {
    setTab('me');
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">收藏夹</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    if (!NATIVE) {
      viewEl.innerHTML = `<div style="padding:16px">${emptyEl('账号收藏需要先在 App 内登录 LOFTER', false)}</div>`;
      return;
    }
    viewEl.innerHTML = `<div class="feed"><div class="masonry" id="masonry"></div><div class="load-more" id="loadmore"></div><div id="sentinel" style="height:1px"></div></div>`;
    const m = new Masonry($('#masonry'), colsFor());
    appendSkeletons(m, 6);
    const token = navId;
    let offset = 0, done = false, loading = false, folder = null;

    async function load() {
      if (loading || done || token !== navId) return;
      loading = true;
      try {
        const d = await api('/api/collection-posts', { folderId, offset });
        if (token !== navId) return;
        $('#masonry').querySelectorAll('.skeleton').forEach((n) => n.remove());
        if (d.folder && !folder) {
          folder = d.folder;
          const title = $('.h-title');
          if (title) title.textContent = folder.name || '收藏夹';
        }
        const posts = (d.posts || []).filter((p) => !isBlockedPost(p));
        if (!posts.length) {
          done = true;
          if (!offset) $('#masonry').innerHTML = `<div class="empty"><div class="big">🔖</div><p>这个收藏夹还是空的</p></div>`;
        } else {
          for (const p of posts) m.add(cardEl(p));
          bindImages(viewEl);
          currentFeedExtra.push(...posts);
        }
        if (d.hasMore && d.nextOffset >= 0 && d.nextOffset !== offset) offset = d.nextOffset;
        else done = true;
        const more = $('#loadmore');
        if (more) more.textContent = done ? (folder && folder.postCount ? '共 ' + num(folder.postCount) + ' 件收藏' : '') : '已显示 ' + offset + ' 件 · 继续下拉加载更多';
      } catch (err) {
        if (token !== navId) return;
        $('#masonry').querySelectorAll('.skeleton').forEach((n) => n.remove());
        if (!offset) {
          viewEl.innerHTML = `<div style="padding:16px">${emptyEl(err.message || '收藏夹加载失败', true)}</div>`;
          viewEl.querySelector('.retry')?.addEventListener('click', () => render());
        } else {
          toast(err.message || '加载失败');
        }
        done = true;
      } finally {
        loading = false;
      }
    }

    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) load(); }, { rootMargin: '700px 0px' });
    io.observe($('#sentinel'));
    load();
  }

  // ================= 页面：帖子详情 =================
  async function viewPost(blogId, postId) {
    setTab(null);
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="spacer"></div>
      <button class="icon-btn" id="btn-save" aria-label="收藏">${icon('bookmark')}</button>
      <button class="icon-btn" id="btn-open" aria-label="在 LOFTER 打开">${icon('external')}</button>
    `);
    $('#btn-back').addEventListener('click', back);

    viewEl.innerHTML = `<div class="post-article" style="padding-top:20px">
      <div class="sk-line" style="height:22px;width:70%"></div>
      <div class="sk-line" style="height:14px;width:100%;margin-top:16px"></div>
      <div class="sk-line" style="height:14px;width:92%"></div>
      <div class="sk-line" style="height:14px;width:80%"></div>
      <div class="sk-img" style="height:220px;border-radius:12px;margin-top:20px"></div>
    </div>`;

    const token = navId;
    let post;
    try {
      post = await api('/api/post', { blogId, postId });
    } catch (err) {
      if (token !== navId) return;
      viewEl.innerHTML = `<div style="padding-top:24px">${emptyEl(err.message || '这篇内容暂时看不到', true)}</div>`;
      $('#view .retry')?.addEventListener('click', () => render());
      return;
    }
    if (token !== navId) return;

    store.addHistory(post);
    const saved = store.isSaved(post.id);
    $('#btn-save').innerHTML = icon(saved ? 'bookmarkFill' : 'bookmark');
    $('#btn-save').classList.toggle('accent', saved);
    $('#btn-save').onclick = () => {
      const on = store.toggleSave(post);
      $('#btn-save').innerHTML = icon(on ? 'bookmarkFill' : 'bookmark');
      $('#btn-save').classList.toggle('accent', on);
    };
    $('#btn-open').onclick = () => openExternal(post.url);

    const imgs = [];
    const photoHtml = (post.photos || []).map((p, i) => {
      imgs.push({ url: p.url, w: p.w, h: p.h });
      const ratio = p.w && p.h ? (p.w / p.h) : 0.75;
      return `<img src="${esc(thumb(p.thumb || p.url, 780))}" data-idx="${i}" alt="" loading="lazy"
        style="aspect-ratio:${ratio.toFixed(4)}" onload="this.classList.add('ok')">`;
    }).join('');

    viewEl.innerHTML = `
      <div class="post-view">
        <div class="post-head">
          <a href="#/blog/${encodeURIComponent(post.author.name)}">
            <img class="ava" src="${esc(post.author.avatar)}" alt="" onerror="this.style.visibility='hidden'">
          </a>
          <div class="who">
            <b>${esc(post.author.nick)}</b>
            <span>${since(post.time)}${post.ipLocation ? ' · ' + esc(post.ipLocation) : ''}</span>
          </div>
        </div>
        <article class="post-article">
          ${post.title ? `<h1 class="post-title">${esc(post.title)}</h1>` : ''}
          ${post.caption ? `<div class="post-caption">${post.caption}</div>` : ''}
          ${post.video ? `<div class="video-box"><video controls playsinline preload="metadata"
              poster="${esc(post.video.poster)}" src="${esc(post.video.url)}"
              style="aspect-ratio:${post.video.w && post.video.h ? (post.video.w / post.video.h).toFixed(4) : '1.3333'}"></video></div>` : ''}
          ${photoHtml ? `<div class="photo-list">${photoHtml}</div>` : ''}
          ${post.content ? `<div class="post-content">${post.content}</div>` : ''}
          ${post.tags?.length ? `<div class="post-tags">${post.tags.map((t) => `<a class="mini-tag" data-tag-block="${esc(t)}" href="#/tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
          <div class="post-stats">
            <div>${icon('heart')}${num(post.stats.like)} 喜欢</div>
            <div>${icon('share')}${num(post.stats.reblog)} 推荐</div>
            <div>${icon('tag')}${num(post.stats.comment)} 评论</div>
          </div>
          <div class="act-bar">
            <button class="act" id="act-like">${icon('heart')}<span>喜欢</span></button>
            <button class="act" id="act-follow">${icon('user')}<span>关注</span></button>
            <button class="act" id="act-share">${icon('share')}<span>分享</span></button>
            <button class="act" id="act-mute">${icon('shield')}<span>屏蔽</span></button>
          </div>
          <button class="orig-btn" id="orig-open">
            <span class="orig-ico">${icon('external')}</span>
            <span class="orig-txt">在 LOFTER 打开原文</span>
            <span class="orig-arr">${icon('chevron')}</span>
          </button>
          <section class="cmt-sec" id="comments">
            <div class="cmt-head"><span class="cmt-title">评论</span><span class="cmt-count">${num(post.stats.comment)}</span></div>
            <div class="cmt-compose"><input class="cmt-input" maxlength="500" placeholder="写评论…"><button class="cmt-send">发送</button></div>
            <div id="cmt-body"><div class="load-more"><span class="spinner"></span>评论加载中</div></div>
            <div class="cmt-compose"><input class="cmt-input" maxlength="500" placeholder="写评论…"><button class="cmt-send">发送</button></div>
          </section>
          <div class="post-end">— 内容版权归原作者所有 —</div>
        </article>
      </div>`;

    $('#orig-open').onclick = () => openExternal(post.url);

    // 正文内图片收集
    $$('.post-content img, .post-caption img').forEach((img) => {
      if (!img.getAttribute('src')) return;
      img.dataset.idx = String(imgs.length);
      img.loading = 'lazy';
      imgs.push({ url: img.getAttribute('src'), w: 0, h: 0 });
      img.style.cursor = 'zoom-in';
    });

    viewEl.addEventListener('click', (e) => {
      const img = e.target.closest('img[data-idx]');
      if (!img) return;
      e.preventDefault();
      openLightbox(imgs, Number(img.dataset.idx) || 0);
    });

    // 详情页的滚动位置也由全局 restoreScroll 处理（从评论返回时能回到原处）
    let liked = !!post.liked, following = false;
    if (post.author && mutedBlogList().some((x) => x.name === post.author.name)) {
      $('#act-mute')?.classList.add('on');
      const s = $('#act-mute')?.querySelector('span');
      if (s) s.textContent = '已屏蔽';
    }
    const likeBtn = $('#act-like');
    if (liked && likeBtn) {
      likeBtn.classList.add('on');
      const s = likeBtn.querySelector('span');
      if (s) s.textContent = '已喜欢';
    }
    likeBtn?.addEventListener('click', async () => {
      try {
        await api('/api/like', { blogId: post.author.id, postId: post.id, like: liked ? '0' : '1' });
        liked = !liked;
        likeBtn.classList.toggle('on', liked);
        likeBtn.querySelector('span').textContent = liked ? '已喜欢' : '喜欢';
        post.stats.like += liked ? 1 : -1;
        toast(liked ? '已喜欢' : '已取消');
      } catch (e) { toast(e.message); }
    });
    $('#act-follow')?.addEventListener('click', async () => {
      try {
        await api('/api/follow-blog', { blogId: post.author.id, domain: post.author.name, follow: following ? '0' : '1' });
        following = !following;
        $('#act-follow').classList.toggle('on', following);
        $('#act-follow span').textContent = following ? '已关注' : '关注';
        toast(following ? '已关注' : '已取消关注');
      } catch (e) { toast(e.message); }
    });
    $('#act-share')?.addEventListener('click', async () => {
      const title = post.title || post.author.nick || 'LOFTER 作品';
      const url = post.url || post.permalink || '';
      // APK：走系统分享面板（Bridge.share），别再把用户丢进浏览器
      if (nativeApi) {
        try { await api('/api/share', { title, url }); return; } catch (e) {}
      }
      if (navigator.share) { navigator.share({ title, url }).catch(() => {}); return; }
      try {
        await navigator.clipboard.writeText(url);
        toast('链接已复制');
      } catch (e) {
        openExternal(url);
      }
    });
    // 详情页的「屏蔽」= 打开「不想看这条？」：可屏蔽作者，也可屏蔽作品里的标签
    const muteAct = $('#act-mute');
    $('#act-mute')?.addEventListener('click', () => openBlockSheet(post));
    let replyTarget = null;

    async function sendComment(btn) {
      const input = btn.parentElement.querySelector('.cmt-input');
      const text = (input.value || '').trim();
      if (!text) return;
      btn.disabled = true; btn.textContent = '发送中';
      try {
        await api('/api/comment-add', {
          blogId: post.author.id,
          postId: post.id,
          content: text,
          parentId: replyTarget ? replyTarget.id : '',
        });
        input.value = '';
        const body = $('#cmt-body');
        const mine = document.createElement('div');
        mine.className = 'cmt';
        mine.innerHTML = `<img class="cmt-ava" src="${esc((store.settings.profile || {}).avatar || '')}" alt="" onerror="this.style.visibility='hidden'"><div class="cmt-main"><div class="cmt-who"><b>我</b><span>刚刚</span></div><div class="cmt-text">${esc(text)}</div></div>`;
        if (replyTarget) {
          const box = document.getElementById('cmt-' + replyTarget.id);
          const list = box && box.querySelector('.cmt-replies');
          if (list) list.appendChild(mine); else if (box) box.querySelector('.cmt-main').appendChild(mine);
        } else {
          body.insertBefore(mine, body.firstChild);
        }
        replyTarget = null;
        document.querySelectorAll('.cmt-input').forEach((i) => { i.placeholder = '写评论…'; });
        toast('评论已发送');
      } catch (e) { toast(e.message); }
      finally { btn.disabled = false; btn.textContent = '发送'; }
    }

    document.querySelectorAll('.cmt-send').forEach((btn) => {
      btn.addEventListener('click', () => sendComment(btn));
    });

    const bodyEl = document.getElementById('cmt-body');
    bodyEl?.addEventListener('click', async (e) => {
      const more = e.target.closest('.cmt-more-reply');
      if (more) {
        const cid = more.dataset.cid;
        more.disabled = true; more.textContent = '加载中…';
        try {
          const d = await api('/api/replies', { blogId: post.author.id, postId: post.id, commentId: cid, offset: 0 });
          const box = document.getElementById('cmt-' + cid);
          const list = box && box.querySelector('.cmt-replies');
          if (list) {
            // 面板里已经渲染过前两条回复，这里按 id 去重，否则展开「全部回复」会把前两条又插一遍
            const shown = new Set([...list.querySelectorAll('.cmt')].map((n) => n.id));
            more.remove();
            const html = (d.list || [])
              .filter((r) => !shown.has('cmt-' + r.id))
              .map((r) => commentEl(r, cid))
              .join('');
            list.insertAdjacentHTML('beforeend', html);
          }
        } catch (err) {
          more.disabled = false; more.textContent = err.message || '加载失败';
        }
      }
      const rep = e.target.closest('.cmt-reply-btn');
      if (rep) {
        replyTarget = { id: rep.dataset.parent, nick: rep.dataset.nick };
        const inputs = document.querySelectorAll('.cmt-input');
        inputs.forEach((i) => { i.placeholder = '回复 @' + rep.dataset.nick; });
        if (inputs[0]) { inputs[0].value = ''; inputs[0].focus(); inputs[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }
    });

    loadComments(post);
  }

  // ================= 评论 =================
  function commentEl(c, parentId) {
    const pid = parentId || c.id;
    const kids = c.l2 || [];
    const replies = kids.slice(0, 2).map((r) => commentEl(r, pid)).join('');
    const rest = c.l2Count > Math.min(2, kids.length);
    const more = rest
      ? `<button class="cmt-more-reply" data-cid="${c.id}" data-nick="${esc(c.author.nick)}">查看全部 ${c.l2Count} 条回复</button>`
      : '';
    return `<div class="cmt" id="cmt-${c.id}">
      <img class="cmt-ava" src="${esc(c.author.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="cmt-main">
        <div class="cmt-who"><b>${esc(c.author.nick)}</b><span>${since(c.time)}${c.ip ? ' · ' + esc(c.ip) : ''}</span></div>
        <div class="cmt-text">${c.content}</div>
        <div class="cmt-foot">
          ${c.likes ? `<span>♡ ${num(c.likes)}</span>` : ''}
          <button class="cmt-reply-btn" data-parent="${pid}" data-cid="${c.id}" data-nick="${esc(c.author.nick)}">回复</button>
        </div>
        ${replies || more ? `<div class="cmt-replies">${replies}${more}</div>` : ''}
      </div>
    </div>`;
  }

  function loadComments(post) {
    const body = document.getElementById('cmt-body');
    if (!body) return;
    let offset = 0, loading = false, done = false;

    async function fetchPage(first) {
      if (loading || done) return;
      loading = true;
      try {
        const data = await api('/api/comments', { blogId: post.author.id, postId: post.id, offset });
        if (!document.getElementById('cmt-body')) return;
        if (first) {
          body.innerHTML = '';
          if (data.hot && data.hot.length) {
            const hot = document.createElement('div');
            hot.className = 'cmt-hot';
            hot.innerHTML = `<div class="cmt-label">热门评论</div>${data.hot.map(commentEl).join('')}`;
            body.appendChild(hot);
          }
          const list = document.createElement('div');
          list.id = 'cmt-list';
          body.appendChild(list);
          const more = document.createElement('button');
          more.className = 'cmt-more-btn';
          more.id = 'cmt-more';
          more.textContent = '加载更多评论';
          more.addEventListener('click', () => fetchPage(false));
          body.appendChild(more);
        }
        const list = document.getElementById('cmt-list');
        if (list && data.list.length) list.insertAdjacentHTML('beforeend', data.list.map(commentEl).join(''));
        offset = data.next;
        if (offset < 0 || !data.list.length) {
          done = true;
          document.getElementById('cmt-more')?.remove();
        }
        if (first && !(data.hot || []).length && !data.list.length) {
          body.innerHTML = '<div class="cmt-empty">还没有评论，去 LOFTER 抢个沙发</div>';
        }
      } catch (err) {
        if (body) body.innerHTML = `<div class="cmt-empty">${esc(err.message || '评论加载失败')}</div>`;
      } finally {
        loading = false;
      }
    }
    fetchPage(true);
  }

  // ================= 图片查看器 =================
  const lightbox = $('#lightbox');
  const lbTrack = $('.lb-track', lightbox);
  let lbImgs = [];
  function openLightbox(images, index = 0) {
    lbImgs = images.filter((i) => i.url);
    if (!lbImgs.length) return;
    lbTrack.innerHTML = lbImgs.map((img) =>
      `<div class="lb-slide"><img src="${esc(img.url)}" alt=""></div>`).join('');
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      lbTrack.scrollLeft = Math.max(0, index) * lbTrack.clientWidth;
      updateLbCount();
    });
  }
  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
    lbTrack.innerHTML = '';
  }
  function updateLbCount() {
    const i = Math.round(lbTrack.scrollLeft / (lbTrack.clientWidth || 1));
    $('.lb-count', lightbox).textContent = lbImgs.length > 1 ? `${i + 1} / ${lbImgs.length}` : '';
  }
  lbTrack.addEventListener('scroll', () => {
    clearTimeout(lbTrack._t);
    lbTrack._t = setTimeout(updateLbCount, 80);
  }, { passive: true });
  lightbox.addEventListener('click', (e) => {
    if (e.target.closest('.lb-slide img')) return;
    closeLightbox();
  });
  $('.lb-close', lightbox).addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });

  // ================= 页面：发现 =================
  async function viewDiscover() {
    setTab('discover');
    setHeader(`<div class="h-title">发现</div><div class="spacer"></div><button class="icon-btn" id="btn-theme" aria-label="主题">${icon('moon')}</button>`);
    $('#btn-theme').addEventListener('click', toggleTheme);

    viewEl.innerHTML = `<div style="padding-top:6px"><div class="load-more"><span class="spinner"></span></div></div>`;
    let catalog;
    try {
      catalog = await api('/api/catalog');
    } catch (err) {
      viewEl.innerHTML = emptyEl('加载失败：' + err.message, false);
      return;
    }

    const recent = store.recentTags;
    viewEl.innerHTML = `
      <div style="padding-top:6px">
        <div class="discover-hero" id="hot-entry">
          <h2>今天看点什么</h2>
          <p>来自各路标签的公开内容，没有推荐算法投喂</p>
          <div class="go">${icon('fire')} 逛逛热门</div>
        </div>
        ${recent.length ? `<div class="sec"><div class="sec-head"><h3>最近浏览</h3><span class="more" id="clear-recent">清空</span></div>
          <div class="chips">${recent.map((t) => `<a class="chip sm" href="#/tag/${encodeURIComponent(t)}"># ${esc(t)}</a>`).join('')}</div></div>` : ''}
        ${catalog.categories.map((c) => `
          <div class="sec">
            <div class="sec-head"><span class="emoji">${c.icon}</span><h3>${esc(c.name)}</h3></div>
            <div class="chips">
              ${c.tags.map((t) => `<a class="chip" href="#/tag/${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}
            </div>
          </div>`).join('')}
        <div style="height:20px"></div>
      </div>`;

    $('#hot-entry').addEventListener('click', () => nav('#/hot'));
    $('#clear-recent')?.addEventListener('click', () => {
      store.recentTags = []; store.saveRecent(); toast('已清空'); viewDiscover();
    });
  }

  // ================= 页面：关注（动态 / 订阅标签） =================
  let followTab = 'feed';
  const followCache = { items: [], seen: new Set(), cursor: '0,0,0', loading: false, done: false };
  const tagCardCache = new Map();
  const TAG_CARD_TTL = 10 * 60 * 1000;
  const TAG_CARD_KEY = 'lofterTagCards';

  // 缩略图缓存落盘：下次打开 App 直接拿上次的图，不用等接口（用户反馈「要点进标签页才有图」）
  function hydrateTagCards() {
    try {
      const raw = JSON.parse(localStorage.getItem(TAG_CARD_KEY) || '{}');
      const now = Date.now();
      Object.keys(raw).forEach((tag) => {
        const row = raw[tag];
        if (!row || !Array.isArray(row.covers) || !row.covers.length) return;
        tagCardCache.set(tag + '|' + (row.seenAt || 0), {
          v: { covers: row.covers.slice(0, 3), updates: row.updates || 0, sampled: row.sampled || 0, info: row.info || null, top: row.top || null },
          exp: now + TAG_CARD_TTL,
        });
      });
    } catch (e) {}
  }
  let tagCardSaveTimer = 0;
  function persistTagCards() {
    clearTimeout(tagCardSaveTimer);
    tagCardSaveTimer = setTimeout(() => {
      const out = {};
      tagCardCache.forEach((hit, key) => {
        if (!hit || !hit.v) return;
        const tag = key.slice(0, key.lastIndexOf('|'));
        const seenAt = Number(key.slice(key.lastIndexOf('|') + 1)) || 0;
        out[tag] = { covers: (hit.v.covers || []).slice(0, 3), updates: hit.v.updates || 0, sampled: hit.v.sampled || 0, info: hit.v.info || null, top: hit.v.top || null, seenAt };
      });
      try { localStorage.setItem(TAG_CARD_KEY, JSON.stringify(out)); } catch (e) {}
    }, 500);
  }
  hydrateTagCards();

  async function viewFollowing() {
    setTab('following');
    setHeader(`
      <div class="h-title">关注</div><div class="spacer"></div>
      <button class="icon-btn" id="btn-sync" aria-label="同步">${icon('refresh')}</button>
    `);
    $('#btn-sync').addEventListener('click', async () => {
      tagCardCache.clear();
      if (followTab === 'feed') resetFollowCache();
      await syncAccount();
      tagCardCache.clear();
      render();
    });

    const logged = await checkLogin();
    if (!logged) {
      viewEl.innerHTML = `<div class="login-card">
        <div class="lc-icon">${icon('heart')}</div>
        <h3>登录后查看关注</h3>
        <p>登录 LOFTER 后，这里会显示关注人的动态和账号订阅的标签。</p>
        <button class="btn primary" id="do-login">${icon('external')} 登录 LOFTER</button>
        <div class="lc-tip">${NATIVE ? '登录一次即可，之后会记住。' : '网页版不支持登录，请用 APK。'}</div>
      </div>`;
      $('#do-login')?.addEventListener('click', () => {
        if (nativeApi) nativeApi.login();
        else toast('请在 APK 内登录');
      });
      return;
    }

    viewEl.innerHTML = `
      <div class="channels" id="follow-tabs">
        <button class="ch ${followTab === 'feed' ? 'on' : ''}" data-ftab="feed">动态</button>
        <button class="ch ${followTab === 'tags' ? 'on' : ''}" data-ftab="tags">订阅标签</button>
      </div>
      <div id="follow-body"></div>`;

    $('#follow-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ftab]');
      if (!b || b.dataset.ftab === followTab) return;
      followTab = b.dataset.ftab;
      render();
    });

    if (followTab === 'feed') renderFollowFeed();
    else renderTagGrid();

    const body = $('#follow-body');
    let sx = 0, sy = 0, tracking = false;
    body.addEventListener('touchstart', (e) => {
      if (e.target.closest('.big-thumb-strip')) { tracking = false; return; }
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; tracking = true;
    }, { passive: true });
    body.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const next = dx < 0 ? 'tags' : 'feed';
      if (next !== followTab) { followTab = next; render(); }
    }, { passive: true });
  }

  function resetFollowCache() {
    followCache.items = [];
    followCache.seen = new Set();
    followCache.cursor = '0,0,0';
    followCache.loading = false;
    followCache.done = false;
    followCache.pages = 0;
  }

  async function ensureRecPool() {
    if (followCache.recPosts && followCache.recPosts.length) return;
    try {
      const d = await api('/api/feed', {});
      followCache.recPosts = (d.posts || []).slice();
    } catch (e) {
      followCache.recPosts = [];
    }
  }

  function renderFollowFeed() {
    const body = $('#follow-body');
    const recOn = store.settings.followRecommend !== false;
    body.innerHTML = `
      <div class="follow-opt"><span>包含关注人的推荐</span><button class="switch ${recOn ? 'on' : ''}" id="toggle-rec" aria-label="推荐内容"></button></div>
      <div class="feed-list" id="feed-list"></div>
      <div class="load-more" id="loadmore"></div>
      <div id="sentinel" style="height:1px"></div>`;

    $('#toggle-rec').addEventListener('click', () => {
      store.settings.followRecommend = !recOn;
      store.saveSettings();
      render();
    });

    const list = $('#feed-list');
    const token = navId;

    const paint = () => {
      followCache.items.sort((a, b) => (b.p.time || 0) - (a.p.time || 0));
      list.innerHTML = '';
      let shown = 0;
      for (const it of followCache.items) {
        if (it.p.rec && !recOn) continue;
        list.appendChild(bigCardEl(it.p, false));
        shown++;
      }
      bindImages(list);
      if (!shown && followCache.done) {
        list.innerHTML = '<div class="empty"><div class="big">🍃</div><p>关注的人最近没有新动态</p></div>';
      }
    };

    if (followCache.items.length) paint();
    else for (let i = 0; i < 3; i++) list.appendChild(skeletonEl(200));

    function appendPosts(posts) {
      let added = 0;
      for (const p of posts || []) {
        const id = String(p.id);
        if (followCache.seen.has(id) || isBlockedPost(p)) continue;
        followCache.seen.add(id);
        followCache.items.push({ p });
        added++;
      }
      return added;
    }

    async function fetchPage() {
      if (followCache.loading || followCache.done) return 0;
      followCache.loading = true;
      try {
        const params = followCache.pages ? { cursor: followCache.cursor } : { offset: 0 };
        const data = await api('/api/follow', params);
        if (token !== navId) return 0;
        const added = appendPosts(data.posts);
        followCache.cursor = data.cursor || followCache.cursor;
        followCache.done = !!data.done;
        followCache.total = data.total || followCache.total || 0;
        followCache.pages = (followCache.pages || 0) + 1;
        return added;
      } finally {
        followCache.loading = false;
      }
    }

    function paintCount() {
      const el = $('#loadmore');
      if (!el) return;
      if (followCache.done) { el.textContent = followCache.items.length ? '' : ''; return; }
      el.textContent = '已显示 ' + followCache.items.length + ' 条 · 继续下拉加载更多';
    }

    // 首屏只抓 3 页（约 45 条），剩下的滚到底再按需加载，避免一次几百条把页面撑爆
    const FIRST_PAGES = 3;

    async function loadInitial() {
      try {
        for (let i = 0; i < FIRST_PAGES && !followCache.done; i++) {
          const added = await fetchPage();
          if (token !== navId) return;
          if (!added && followCache.done) break;
        }
        if (token !== navId) return;
        $('#feed-list').querySelectorAll('.skeleton').forEach((n) => n.remove());
        paint();
        paintCount();
      } catch (err) {
        if (token !== navId) return;
        if (!followCache.items.length) {
          body.innerHTML = emptyEl(err.message || '关注动态加载失败', true);
          $('#follow-body .retry')?.addEventListener('click', () => { resetFollowCache(); render(); });
        } else {
          $('#loadmore').innerHTML = `<button id="retry-more" class="retry-inline">加载失败：${esc(err.message || '网络异常')}，点此重试</button>`;
          $('#retry-more')?.addEventListener('click', () => loadInitial());
        }
      }
    }

    async function loadMore() {
      if (followCache.loading || followCache.done) return;
      try {
        const added = await fetchPage();
        if (token !== navId) return;
        if (added) paint();
        paintCount();
      } catch (err) {
        if (token !== navId) return;
        $('#loadmore').innerHTML = `<button id="retry-more" class="retry-inline">加载失败：${esc(err.message || '网络异常')}，点此重试</button>`;
        $('#retry-more')?.addEventListener('click', () => loadMore());
      }
    }

    if (!followCache.items.length) {
      loadInitial();
    } else {
      if (followCache.done) paintCount(); else paintCount();
    }

    const io = new IntersectionObserver((en) => {
      if (en.some((x) => x.isIntersecting)) loadMore();
    }, { rootMargin: '800px 0px' });
    io.observe($('#sentinel'));

    const kill = () => { if (token !== navId) io.disconnect(); else setTimeout(kill, 300); };
    setTimeout(kill, 300);
  }

  const followDetailCache = new Map();

  async function enrichFollowThumbs(posts) {
    const targets = (posts || []).filter((p) => p && p.id && p.originBlogId).slice(0, 8);
    let idx = 0;
    async function worker() {
      while (idx < targets.length) {
        const p = targets[idx++];
        const key = p.originBlogId + ':' + p.id;
        let d = followDetailCache.get(key);
        if (!d) {
          try {
            d = await api('/api/post', { blogId: p.originBlogId, postId: p.id });
            if (followDetailCache.size > 400) followDetailCache.clear();
            followDetailCache.set(key, d);
          } catch (e) { continue; }
        }
        if (d.tags && d.tags.length) p.tags = d.tags;
        const ph = (d.photos || []).map((x) => x.thumb || x.url).filter(Boolean);
        if (ph.length) {
          p.thumbs = ph.slice(0, 3);
          p.photoCount = ph.length;
          if (!p.cover) p.cover = ph[0];
        }
        if (d.title && !p.title) p.title = d.title;
        if (d.digest && !p.digest) p.digest = d.digest;
      }
    }
    await Promise.all([worker(), worker(), worker()]);
  }

  async function fetchTagCard(tag, seenAt) {
    const key = tag + '|' + (seenAt || 0);
    const hit = tagCardCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.v;
    let posts = [];
    const pull = async (sort) => {
      try {
        const more = (await api('/api/tag', { name: tag, offset: 0, sort })).posts || [];
        const seen = new Set(posts.map((p) => String(p.id)));
        for (const p of more) if (!seen.has(String(p.id))) posts.push(p);
      } catch (e) {}
    };
    await pull('week');
    if (posts.filter((p) => p.cover).length < 3) await pull('new');
    if (posts.filter((p) => p.cover).length < 3) await pull('hot');
    const allowed = posts.filter((p) => !isBlockedPost(p));
    const withCover = allowed.filter((p) => p.cover);
    let covers = withCover.slice(0, 3).map((p) => p.cover);
    let info = null;
    // 纯文字标签（比如「原创文学」）列表里一张封面都没有，退回话题页头图，别留个空卡
    if (!covers.length) {
      try {
        const ti = await api('/api/taginfo', { name: tag });
        if (ti) {
          if (ti.cover) covers = [ti.cover];
          info = { followers: ti.followers || 0, views: ti.views || 0 };
        }
      } catch (e) {}
    }
    const since = seenAt || (Date.now() - 7 * 86400000);
    const updates = allowed.filter((p) => (p.time || 0) > since).length;
    const topPost = withCover[0] || allowed[0] || null;
    const v = {
      covers,
      updates,
      sampled: allowed.length,
      info,
      top: topPost ? {
        title: topPost.title || '',
        digest: topPost.digest || '',
        time: topPost.time || 0,
        cover: topPost.cover || '',
        coverW: topPost.coverW || 0,
        coverH: topPost.coverH || 0,
      } : null,
    };
    tagCardCache.set(key, { v, exp: Date.now() + TAG_CARD_TTL });
    persistTagCards();
    return v;
  }

  function tagHue(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % 360;
    return h;
  }

  function tagSubText(v) {
    // LOFTER 没有「标签内作品总数」这种字段（tagPosts 只有 items/offset，话题页也没有），
    // 所以不要拿第一页的条数冒充总数：有标题就显示标题，纯文字标签显示关注/浏览数。
    if (!v) return '正在读取…';
    const top = v.top || {};
    if (top.title || top.digest) return top.title || top.digest;
    if (v.info && v.info.followers) return num(v.info.followers) + ' 人关注 · ' + num(v.info.views) + ' 次浏览';
    return '';
  }

  function fillTagCard(el, v) {
    const badge = el.querySelector('.tag-badge');
    if (badge) {
      badge.textContent = v && v.updates > 0 ? (v.updates >= 12 ? '12+' : v.updates) + ' 更新' : '暂无更新';
      badge.classList.toggle('has', !!(v && v.updates > 0));
      badge.classList.toggle('zero', !(v && v.updates > 0));
    }
    const sub = el.querySelector('.tag-big-sub');
    if (sub) sub.textContent = tagSubText(v);
    const strip = el.querySelector('.tag-thumbs');
    if (!strip) return;
    const hue = tagHue(el.dataset.tag);
    const covers = ((v && v.covers) || []).filter(Boolean).slice(0, 3);
    const slots = [0, 1, 2].map((i) => {
      if (covers[i]) {
        return `<span class="tag-thumb"><img src="${esc(thumb(covers[i], 320))}" alt="" loading="lazy" onerror="this.parentNode.classList.add('empty');this.remove()"></span>`;
      }
      // 纯文字标签（没有任何配图）用同色系占位块，别留三个白洞
      return `<span class="tag-thumb empty" style="--h:${hue}"><b>#</b></span>`;
    }).join('');
    strip.innerHTML = slots;
  }

  // 大卡片 + 滚到眼前才拉数据（和关注流一样的节奏），冷启动先用缓存里的图铺满
  async function renderTagGrid() {
    const body = $('#follow-body');
    let tags = store.settings.subscribedTags || [];
    if (!tags.length) {
      const acc = await syncAccount();
      tags = (acc && acc.tags) || store.settings.subscribedTags || [];
    }
    if (!tags.length) {
      body.innerHTML = `<div class="empty"><div class="big">🏷</div>
        <p>没有读到订阅标签，去 LOFTER 订阅几个话题，再点右上角刷新。</p></div>`;
      return;
    }

    const seenMap = store.settings.tagSeen || {};
    body.innerHTML = `<div class="tag-grid-head">共 ${tags.length} 个订阅标签</div>
      <div class="tag-list">${tags.map((t) => `
        <article class="tag-big" data-tag="${esc(t)}">
          <a class="tag-big-link" href="#/tag/${encodeURIComponent(t)}">
            <div class="tag-big-head">
              <b>#${esc(t)}</b>
              <span class="tag-badge">…</span>
            </div>
            <p class="tag-big-sub">正在读取…</p>
            <div class="tag-thumbs">
              ${[0, 1, 2].map(() => `<span class="tag-thumb empty" style="--h:${tagHue(t)}"><b>#</b></span>`).join('')}
            </div>
          </a>
        </article>`).join('')}</div>`;

    const cards = [...body.querySelectorAll('.tag-big')];
    const token = navId;

    // 先用缓存同步铺一遍，避免首屏全是占位
    cards.forEach((el) => {
      const hit = tagCardCache.get(el.dataset.tag + '|' + (seenMap[el.dataset.tag] || 0));
      if (hit && hit.exp > Date.now()) fillTagCard(el, hit.v);
    });

    const queue = [];
    let running = 0;
    const MAX = 3;
    const pump = () => {
      while (running < MAX && queue.length) {
        const el = queue.shift();
        running++;
        const tag = el.dataset.tag;
        fetchTagCard(tag, seenMap[tag])
          .then((meta) => { if (token === navId) fillTagCard(el, meta); })
          .catch(() => {})
          .then(() => { running--; pump(); });
      }
    };

    if (!('IntersectionObserver' in window)) {
      queue.push(...cards);
      pump();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        queue.push(en.target);
      });
      pump();
    }, { rootMargin: '700px 0px' });
    cards.forEach((el) => io.observe(el));
  }

  // ================= 页面：搜索 =================
  async function viewSearch(initial = '') {
    setTab('search');
    setHeader(`<div class="h-title">搜索</div><div class="spacer"></div>`);
    const recent = store.recentTags;
    viewEl.innerHTML = `
      <div class="search-wrap">
        <div class="search-box">
          ${icon('search')}
          <input id="q" type="search" placeholder="搜索标签，比如「摄影」「原神」" value="${esc(initial)}" enterkeyhint="search" autocomplete="off">
          <button class="clear" id="clear" hidden>✕</button>
        </div>
      </div>
      <div class="search-body" id="results">
        ${recent.length ? `<div class="recent-head"><span>最近搜索</span><button id="clear-tags">清空</button></div>
          <div class="chips">${recent.map((t) => `<a class="chip sm" href="#/tag/${encodeURIComponent(t)}"># ${esc(t)}</a>`).join('')}</div>` : ''}
        <div class="search-tip">输入关键词后，可以直接进入对应的话题。#标签 是 LOFTER 内容的主要入口。</div>
      </div>`;
    const input = $('#q');
    const results = $('#results');
    const clearBtn = $('#clear');
    let timer = 0;

    function renderResults(q) {
      if (!q) return;
      results.innerHTML = `
        <a class="result-row" href="#/tag/${encodeURIComponent(q)}">
          <span class="hash">#</span><span>${esc(q)}</span>
          <span class="arr">进入话题 ${icon('chevron')}</span>
        </a>
        <div id="sug"></div>`;
      api('/api/search', { q }).then((data) => {
        const sug = $('#sug');
        if (!sug || !data.tags?.length) return;
        sug.innerHTML = `<div class="recent-head" style="margin-top:18px"><span>相关标签</span></div>` +
          data.tags.filter((t) => t !== q).map((t) =>
            `<a class="result-row" href="#/tag/${encodeURIComponent(t)}"><span class="hash">#</span>${esc(t)}<span class="arr">${icon('chevron')}</span></a>`).join('');
      }).catch(() => {});
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn.hidden = !q;
      clearTimeout(timer);
      timer = setTimeout(() => renderResults(q), 220);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) { store.addRecentTag(q); nav('#/tag/' + encodeURIComponent(q)); }
      }
    });
    clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.hidden = true; input.focus(); renderResults(''); viewSearch(); });
    $('#clear-tags')?.addEventListener('click', () => { store.recentTags = []; store.saveRecent(); viewSearch(); });
    if (initial) { renderResults(initial); }
    setTimeout(() => { if (!initial) input.focus(); }, 120);
  }

  // ================= 页面：我的 =================
  async function viewMe() {
    setTab('me');
    setHeader(`<div class="h-title">我的</div><div class="spacer"></div>`);
    const tags = store.settings.tags;
    const logged = await checkLogin();
    // 老版本缓存下来的 profile 没有 likes/collections/shares 字段，认出来就重新拉一次
    const staleProfile = !store.settings.profile || !store.settings.profile.counts
      || store.settings.profile.counts.likes === undefined;
    if (logged && (staleProfile || Date.now() - (store.settings.accountSyncAt || 0) > 5 * 60e3)) {
      await syncAccount();
    }
    const profile = store.settings.profile;
    const profileError = store.settings.profileError || '';
    const subCount = (store.settings.subscribedTags || []).length;
    const counts = (profile && profile.counts) || {};

    const meta = [];
    if (profile && profile.name) meta.push('@' + profile.name);
    if (counts.followers) meta.push(num(counts.followers) + ' 粉丝');
    if (counts.following) meta.push(num(counts.following) + ' 关注');

    const head = logged
      ? `<div class="me-profile">
          ${profile && profile.avatar
            ? `<img class="me-avatar" src="${esc(thumb(profile.avatar, 200))}" alt="" onerror="this.style.visibility='hidden'">`
            : `<div class="me-avatar me-avatar-ph">${icon('user')}</div>`}
          <div class="me-profile-main">
            <h2>${esc((profile && profile.nick) || 'LOFTER 用户')}</h2>
            <p>${esc(meta.join(' · ') || 'LOFTER 已登录')}</p>
            ${profile && profile.intro ? `<p class="me-intro">${esc(profile.intro)}</p>` : ''}
          </div>
          <button class="acc-btn" id="switch-acc">切换</button>
        </div>`
      : `<div class="me-head">
          <div class="me-ava">L</div>
          <div>
            <h2>本地用户</h2>
            <p>${NATIVE ? '登录后可看关注流、同步订阅标签' : '网页版不支持登录，请用 APK'}</p>
          </div>
          ${NATIVE ? '<button class="acc-btn" id="acc-btn">登录</button>' : ''}
        </div>`;

    viewEl.innerHTML = `
      ${head}
      ${logged && !profile && profileError ? `<div class="profile-error">
        <span>账号资料读取失败：${esc(profileError)}</span>
        <button id="retry-profile">重试</button>
      </div>` : ''}
      <div class="me-stats">
        ${logged ? `
        <a href="#/relation?type=following"><b>${num(counts.following || 0)}</b><span>关注</span></a>
        <a href="#/relation?type=fans"><b>${num(counts.followers || 0)}</b><span>粉丝</span></a>
        <a href="#/favorites"><b>${num(counts.likes || 0)}</b><span>喜欢</span></a>
        <a href="#/collections"><b>${num(counts.collections || 0)}</b><span>收藏</span></a>
        <a href="#/shares"><b>${num(counts.shares || 0)}</b><span>推荐</span></a>` : `
        <div><b>${store.saved.length}</b><span>本机收藏</span></div>
        <div><b>${store.history.length}</b><span>浏览</span></div>`}
      </div>
      <div class="list-card">
        ${logged ? `<a class="list-row" href="#/favorites">${icon('heart')}喜欢<span class="val">${num(counts.likes || 0)} ${icon('chevron')}</span></a>` : ''}
        ${logged ? `<a class="list-row" href="#/collections">${icon('bookmark')}收藏<span class="val">${num(counts.collections || 0)} ${icon('chevron')}</span></a>` : ''}
        ${logged ? `<a class="list-row" href="#/shares">${icon('share')}推荐作品<span class="val">${num(counts.shares || 0)} ${icon('chevron')}</span></a>` : ''}
        <a class="list-row" href="#/saved">${icon('bookmark')}本机收藏<span class="val">${store.saved.length} ${icon('chevron')}</span></a>
        <a class="list-row" href="#/history">${icon('clock')}浏览历史<span class="val">${store.history.length} ${icon('chevron')}</span></a>
      </div>
      <div class="list-card">
        <a class="list-row" href="#/tags">${icon('tag')}兴趣标签<span class="val">${tags.length ? esc(tags.slice(0, 3).join(' · ')) : '使用默认推荐'} ${icon('chevron')}</span></a>
        <a class="list-row" href="#/blocked">${icon('shield')}标签屏蔽<span class="val">${(store.settings.blockedTags || []).length} 个 ${icon('chevron')}</span></a>
        <a class="list-row" href="#/muted">${icon('user')}屏蔽用户<span class="val">${mutedBlogList().length} 位 ${icon('chevron')}</span></a>
        <a class="list-row" href="#/blacklist">${icon('shield')}拉黑名单<span class="val">${blockedBlogList().length} 位 ${icon('chevron')}</span></a>
        <a class="list-row" href="#/block-io">${icon('export')}导入 / 导出屏蔽<span class="val">${icon('chevron')}</span></a>
        <button class="list-row" id="theme-row">${icon('palette')}外观<span class="val" id="theme-val">${themeLabel()}</span></button>
        <button class="list-row" id="clear-cache">${icon('trash')}<span class="danger">清除本地记录</span><span class="val"></span></button>
      </div>
      <div class="list-card">
        <a class="list-row" href="#/diag">${icon('info')}诊断信息<span class="val">${icon('chevron')}</span></a>
        <a class="list-row" href="#/about">${icon('info')}关于 LOFTER Lite<span class="val">v5.7 ${icon('chevron')}</span></a>
      </div>
      ${logged ? '<button class="me-logout" id="logout-btn">退出登录</button>' : ''}
      <div style="text-align:center;color:var(--sub);font-size:11px;padding:6px 0 26px">内容来自 LOFTER 公开接口 · 非官方客户端</div>`;

    $('#retry-profile')?.addEventListener('click', async () => {
      store.settings.accountSyncAt = 0;
      await syncAccount();
      render();
    });
    $('#switch-acc')?.addEventListener('click', () => {
      if (!confirm('切换账号会退出当前登录，继续吗？')) return;
      loginState = null;
      if (nativeApi && nativeApi.switchAccount) nativeApi.switchAccount();
      else if (nativeApi) { nativeApi.logout(); setTimeout(() => nativeApi.login(), 500); }
    });
    $('#logout-btn')?.addEventListener('click', () => {
      if (confirm('退出 LOFTER 登录？')) nativeApi.logout();
    });
    $('#acc-btn')?.addEventListener('click', () => { if (nativeApi) nativeApi.login(); });
    $('#theme-row').addEventListener('click', openThemeSheet);
    $('#clear-cache').addEventListener('click', () => {
      if (!confirm('清除本机的收藏、历史与兴趣设置？')) return;
      store.saved = []; store.history = []; store.recentTags = [];
      store.saveSaved(); store.saveHistory(); store.saveRecent();
      feedCaches['/'] = { posts: [], cursor: null, loading: false, done: false };
      toast('已清除');
      viewMe();
    });
  }

  const themeLabel = () => ({ auto: '跟随系统', light: '日间', dark: '夜间' }[store.settings.theme] || '跟随系统');
  function openThemeSheet() {
    const cur = store.settings.theme || 'auto';
    const opts = [['auto', '跟随系统', '跟着手机的深色模式走'], ['light', '日间', '始终浅色'], ['dark', '夜间', '始终深色']];
    openSheet(`
      <h3>外观</h3><p class="hint">界面的明暗风格，只影响这个客户端。</p>
      <div class="list-card" style="margin:0;box-shadow:none;border:1px solid var(--line)">
        ${opts.map(([v, label, desc]) => `
          <button class="list-row" data-theme-opt="${v}" style="align-items:flex-start">
            <div style="flex:1;text-align:left">
              <div>${label}</div>
              <div style="font-size:11.5px;color:var(--sub);margin-top:1px">${desc}</div>
            </div>
            <span class="val" style="color:var(--accent)">${cur === v ? icon('check') : ''}</span>
          </button>`).join('')}
      </div>
      <div class="actions"><button class="btn ghost" data-close>关闭</button></div>`);
  }

  // ================= 页面：收藏 / 历史 =================
  function viewList(kind) {
    setTab(null);
    const isSaved = kind === 'saved';
    const list = isSaved ? store.saved : store.history;
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">${isSaved ? '我的收藏' : '浏览历史'}</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    viewEl.innerHTML = list.length ? `<div class="list-card" style="margin-top:14px">${list.map((p) => `
      <div class="saved-item">
        <a href="#/post/${p.blogId}/${p.id}" style="display:flex;gap:10px;align-items:center;flex:1;min-width:0">
          ${p.cover
            ? `<img src="${esc(thumb(p.cover, 120))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
            : `<span class="saved-ph">${esc((p.author || 'L').slice(0, 1))}</span>`}
          <div class="t"><b>${esc(p.title)}</b><span>${esc(p.author || '')} · ${since(p.time)}</span></div>
        </a>
        ${isSaved ? `<button class="del" data-remove="${p.id}">移除</button>` : ''}
      </div>`).join('')}</div>` : `<div class="empty"><div class="big">${isSaved ? '🔖' : '🕘'}</div><p>${isSaved ? '还没有收藏，看到喜欢的内容点右上角书签' : '还没有浏览记录'}</p></div>`;

    viewEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (!b) return;
      store.saved = store.saved.filter((x) => String(x.id) !== b.dataset.remove);
      store.saveSaved();
      render();
    });
  }

  // ================= 页面：兴趣标签 =================
  async function viewTagsSetting() {
    setTab(null);
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">兴趣标签</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);

    let catalog;
    try { catalog = await api('/api/catalog'); } catch { catalog = { categories: [] }; }
    const selected = new Set(store.settings.tags);
    const subs = store.settings.subscribedTags || [];

    viewEl.innerHTML = `
      <div style="padding:10px 16px 0">
        <p style="color:var(--sub);font-size:12.5px;line-height:1.7;margin:0 0 14px">
          推荐会混合你勾选的兴趣标签，以及账号里订阅的标签。不选就用默认的泛兴趣组合。
        </p>
        ${subs.length ? `<div class="sec" style="margin-left:0;margin-right:0">
          <div class="sec-head"><span class="emoji">📡</span><h3>账号订阅</h3><span class="more" id="sync-subs">重新同步</span></div>
          <div class="chips">${subs.map((t) => `<button class="chip ${selected.has(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        </div>` : ''}
        ${catalog.categories.map((c) => `
          <div class="sec" style="margin-left:0;margin-right:0">
            <div class="sec-head"><span class="emoji">${c.icon}</span><h3>${c.name}</h3></div>
            <div class="chips">${c.tags.map((t) => `<button class="chip ${selected.has(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          </div>`).join('')}
        <div class="sec" style="margin-left:0;margin-right:0">
          <div class="sec-head"><h3>自定义</h3></div>
          <div class="search-box" style="background:var(--bg-soft)">
            ${icon('tag')}
            <input id="custom" placeholder="输入任意标签，回车添加" maxlength="20">
          </div>
          <div class="chips" style="margin-top:10px" id="custom-list">
            ${[...selected].filter((t) => !catalog.categories.some((c) => c.tags.includes(t))).map((t) => `<button class="chip on" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div style="height:86px"></div>
      <div style="position:sticky;bottom:0;padding:12px 16px calc(16px + var(--safe-b));background:linear-gradient(transparent,var(--bg) 30%)">
        <button class="btn primary" id="save-tags" style="width:100%">保存并刷新推荐</button>
      </div>`;

    viewEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]');
      if (!b) return;
      const t = b.dataset.tag;
      if (selected.has(t)) { selected.delete(t); b.classList.remove('on'); }
      else { selected.add(t); b.classList.add('on'); }
    });
    const custom = $('#custom');
    custom.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = custom.value.trim();
      if (!v) return;
      selected.add(v);
      const b = document.createElement('button');
      b.className = 'chip on';
      b.dataset.tag = v;
      b.textContent = v;
      $('#custom-list').appendChild(b);
      custom.value = '';
    });
    $('#sync-subs')?.addEventListener('click', async () => {
      const acc = await syncAccount();
      toast(acc && acc.tags && acc.tags.length ? '已同步 ' + acc.tags.length + ' 个订阅标签' : '没有读到订阅标签');
      viewTagsSetting();
    });
    $('#save-tags').addEventListener('click', () => {
      store.settings.tags = [...selected];
      store.saveSettings();
      feedCaches['/'] = { posts: [], cursor: null, loading: false, done: false };
      toast(selected.size ? '已保存，推荐已刷新' : '已恢复默认推荐');
      nav('#/');
    });
  }

  // ================= 页面：标签屏蔽 =================
  function viewBlocked() {
    setTab(null);
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">标签屏蔽</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    const list = store.settings.blockedTags || [];
    viewEl.innerHTML = `
      <div style="padding:14px 16px 40px">
        <p style="color:var(--sub);font-size:12.5px;line-height:1.7;margin:0 0 14px">
          屏蔽后，推荐、话题、关注流里带这些标签的内容会自动隐藏。长按任意卡片或标签也能快速屏蔽。
        </p>
        <button class="btn" id="blk-sync" style="width:100%;margin-bottom:12px">${icon('refresh')} 从账号同步黑名单与标签</button>
        <div class="search-box" style="background:var(--bg-soft)">
          ${icon('shield')}
          <input id="blk-input" placeholder="输入要屏蔽的标签，回车添加" maxlength="20">
        </div>
        <div class="chips" style="margin-top:16px" id="blk-list">
          ${list.length ? list.map((t) => `<button class="chip on" data-unblock="${esc(t)}">#${esc(t)} ✕</button>`).join('') : '<div class="cmt-empty" style="padding:24px 0">还没有屏蔽任何标签</div>'}
        </div>
        <div class="blk-sec-title">屏蔽用户与拉黑</div>
        <a class="list-row" href="#/muted">${icon('user')}屏蔽用户<span class="val">${mutedBlogList().length} 位 ${icon('chevron')}</span></a>
        <a class="list-row" href="#/blacklist">${icon('shield')}拉黑名单<span class="val">${blockedBlogList().length} 位 ${icon('chevron')}</span></a>
        <a class="list-row" href="#/block-io">${icon('export')}导入 / 导出屏蔽<span class="val">${icon('chevron')}</span></a>
        ${store.settings.lastSyncInfo ? `<p class="blk-sync-info">${esc(store.settings.lastSyncInfo)}</p>` : ''}
      </div>`;
    bindBlockSync(viewBlocked);
    const input = $('#blk-input');
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = input.value.trim();
      if (!v) return;
      blockTag(v);
      viewBlocked();
    });
    $('#blk-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-unblock]');
      if (!b) return;
      const t = b.dataset.unblock;
      store.settings.blockedTags = (store.settings.blockedTags || []).filter((x) => x !== t);
      store.saveSettings();
      toast('已取消屏蔽 #' + t);
      viewBlocked();
    });
  }

  // 账号黑名单同步（标签 + 博主），两个页面共用
  function bindBlockSync(reload) {
    const btn = $('#blk-sync');
    btn?.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '同步中…';
      try {
        const d = await api('/api/sync-blocks', {});
        const tags = new Set(store.settings.blockedTags || []);
        (d.tags || []).forEach((t) => tags.add(t));
        store.settings.blockedTags = [...tags];
        const bmap = new Map(blockedBlogList().map((b) => [b.name, b]));
        (d.blogs || []).forEach((b) => {
          if (!b || !b.name) return;
          bmap.set(b.name, Object.assign({}, bmap.get(b.name) || {}, b));
        });
        store.settings.blockedBlogs = [...bmap.values()];
        const err = (d.errors || [])[0];
        store.settings.lastSyncInfo = `同步结果：${(d.tags || []).length} 个标签、${(d.blogs || []).length} 位博主`
          + (err ? `；${err}` : '')
          + (d.keys ? `（字段：${Object.keys(d.keys).map((k) => k + '=' + d.keys[k].join('/')).join('，')}）` : '');
        store.saveSettings();
        toast(`同步完成：${(d.tags || []).length} 个标签、${(d.blogs || []).length} 位博主`);
        reload();
      } catch (e) {
        toast('同步失败：' + e.message);
        btn.disabled = false;
        btn.innerHTML = `${icon('refresh')} 从账号同步黑名单与标签`;
      }
    });
  }

  // ================= 页面：屏蔽用户（本机，不打扰对方） =================
  function viewMuted() {
    setTab(null);
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">屏蔽用户</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    const list = mutedBlogList();
    viewEl.innerHTML = `
      <div style="padding:14px 16px 40px" id="muted-wrap">
        <p style="color:var(--sub);font-size:12.5px;line-height:1.7;margin:0 0 14px">
          屏蔽只作用于<span style="color:var(--text)">这台设备</span>：推荐、话题、关注流里 TA 的作品会自动隐藏，不会通知对方，也不会改动你的 LOFTER 账号。
          想真正拉黑（账号黑名单）请用<a href="#/blacklist" style="color:var(--accent)">「拉黑名单」</a>。
        </p>
        <div class="search-box" style="background:var(--bg-soft)">
          ${icon('user')}
          <input id="muted-input" placeholder="输入博主域名，回车添加" maxlength="64">
        </div>
        <div style="margin-top:16px" id="muted-list">
          ${list.length ? list.map((b) => `<div class="blk-blog">
            <a class="blk-ava" href="#/blog/${encodeURIComponent(b.name)}" aria-label="查看主页">
              <img src="${esc(b.avatar || '')}" alt="" onerror="this.style.visibility='hidden'">
            </a>
            <a class="blk-info" href="#/blog/${encodeURIComponent(b.name)}">
              <b>${esc(b.nick || b.name)}</b><i>@${esc(b.name)}${b.time ? ' · ' + fmtDate(b.time) : ''}</i>
            </a>
            <button class="blk-del" data-unmute-blog="${esc(b.name)}" aria-label="取消屏蔽">✕</button>
          </div>`).join('') : '<div class="cmt-empty" style="padding:24px 0">还没有屏蔽任何用户</div>'}
        </div>
      </div>`;
    const wrap = $('#muted-wrap');
    const input = $('#muted-input');
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = input.value.trim();
      if (!v) return;
      const name = v.replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '').split('/')[0];
      if (!name) return;
      muteBlog({ name, nick: name }, false);
      viewMuted();
    });
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-unmute-blog]');
      if (!btn) return;
      const n = btn.dataset.unmuteBlog;
      unmuteBlog(n);
      toast('已取消屏蔽 @' + n);
      viewMuted();
    });
  }

  // ================= 页面：拉黑名单（账号级黑名单） =================
  function viewBlacklist() {
    setTab(null);
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">拉黑名单</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    const list = blockedBlogList();
    viewEl.innerHTML = `
      <div style="padding:14px 16px 40px" id="blk-blog-wrap">
        <p style="color:var(--sub);font-size:12.5px;line-height:1.7;margin:0 0 14px">
          这里是<span style="color:var(--text)">账号级黑名单</span>（来自 LOFTER 账号，会同步到其它客户端）。
          只是不想在某台手机看到某个人，请用<a href="#/muted" style="color:var(--accent)">「屏蔽用户」</a>。
        </p>
        <button class="btn" id="blk-sync" style="width:100%;margin-bottom:12px">${icon('refresh')} 从账号同步黑名单与标签</button>
        <div class="search-box" style="background:var(--bg-soft)">
          ${icon('user')}
          <input id="blk-blog-input" placeholder="输入博主域名，回车加入本机名单" maxlength="64">
        </div>
        <p style="color:var(--sub);font-size:11.5px;line-height:1.6;margin:8px 0 0">在这里手动添加只记在本机；要真正拉黑对方，请在 LOFTER 官方客户端或网页里操作。</p>
        <div style="margin-top:12px" id="blk-blog-list">
          ${list.length ? list.map((b) => `<div class="blk-blog">
            <a class="blk-ava" href="#/blog/${encodeURIComponent(b.name)}" aria-label="查看主页">
              <img src="${esc(b.avatar || '')}" alt="" onerror="this.style.visibility='hidden'">
            </a>
            <a class="blk-info" href="#/blog/${encodeURIComponent(b.name)}">
              <b>${esc(b.nick || b.name)}</b><i>@${esc(b.name)}${b.time ? ' · ' + fmtDate(b.time) : ''}</i>
            </a>
            <button class="blk-del" data-unblock-blog="${esc(b.name)}" aria-label="移出黑名单">✕</button>
          </div>`).join('') : '<div class="cmt-empty" style="padding:16px 0">还没有拉黑任何博主</div>'}
        </div>
        ${store.settings.lastSyncInfo ? `<p class="blk-sync-info">${esc(store.settings.lastSyncInfo)}</p>` : ''}
      </div>`;
    bindBlockSync(viewBlacklist);
    const wrap = $('#blk-blog-wrap');
    const blogInput = $('#blk-blog-input');
    blogInput?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = blogInput.value.trim();
      if (!v) return;
      const list = blockedBlogList();
      if (!list.some((b) => b.name === v)) list.push({ name: v, nick: v, time: Date.now() });
      store.settings.blockedBlogs = list;
      store.saveSettings();
      toast('已加入黑名单：' + v);
      viewBlacklist();
    });
    wrap.addEventListener('click', (e) => {
      const bb = e.target.closest('[data-unblock-blog]');
      if (!bb) return;
      const n = bb.dataset.unblockBlog;
      store.settings.blockedBlogs = blockedBlogList().filter((x) => x.name !== n);
      store.saveSettings();
      toast('已移出黑名单：' + n);
      viewBlacklist();
    });
  }

  // ================= 页面：导入 / 导出屏蔽 =================
  // 三种「不想看」名单（标签屏蔽 / 屏蔽用户 / 拉黑名单）都存本机，换机就丢，
  // 所以给一个纯文本的 JSON 导入导出：复制出去记着，或者粘回来恢复。
  function blockSnapshot() {
    return {
      app: 'lofter-lite',
      version: 1,
      exportedAt: new Date().toISOString(),
      blockedTags: (store.settings.blockedTags || []).slice(),
      mutedBlogs: mutedBlogList(),
      blockedBlogs: blockedBlogList(),
    };
  }

  function viewBlockIO() {
    setTab(null);
    setHeader(`
      <button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">导入 / 导出屏蔽</div>
      <div class="spacer"></div>
    `);
    $('#btn-back').addEventListener('click', back);
    const snap = blockSnapshot();
    const text = JSON.stringify(snap, null, 2);
    viewEl.innerHTML = `
      <div style="padding:14px 16px 40px" id="bio-wrap">
        <p style="color:var(--sub);font-size:12.5px;line-height:1.7;margin:0 0 12px">
          标签屏蔽、屏蔽用户、拉黑名单都只存在这台设备上。换手机或重装前，
          把下面这段复制出去存好；换好之后再粘回来点「导入」就能恢复。
        </p>
        <div class="bio-stats">现在有 <b>${snap.blockedTags.length}</b> 个标签屏蔽 · <b>${snap.mutedBlogs.length}</b> 位屏蔽用户 · <b>${snap.blockedBlogs.length}</b> 位拉黑</div>
        <textarea id="bio-text" spellcheck="false">${esc(text)}</textarea>
        <div class="bio-actions">
          <button class="btn" id="bio-copy">${icon('export')} 复制全部</button>
          <button class="btn ghost" id="bio-file">${icon('import')} 从文件读取</button>
        </div>
        <div class="bio-actions">
          <button class="btn" id="bio-import">${icon('check')} 导入文本框里的名单</button>
        </div>
        <input type="file" id="bio-file-input" accept=".json,application/json,text/plain" hidden>
        <p style="color:var(--sub);font-size:11.5px;line-height:1.6;margin:14px 0 0">
          导入是「合并」：已有的不会删，重复的会自动跳过。导入后可以在上面的三个列表里逐条取消。
        </p>
      </div>`;
    const area = $('#bio-text');

    $('#bio-copy').addEventListener('click', async () => {
      const body = area.value;
      try {
        if (nativeApi && nativeApi.copy) nativeApi.copy(body);
        else if (navigator.clipboard) await navigator.clipboard.writeText(body);
        else throw new Error('没有剪贴板');
        toast('已复制，存到安全的地方吧');
      } catch (e) {
        toast('复制失败，长按文本框手动全选复制');
      }
    });

    $('#bio-file').addEventListener('click', () => $('#bio-file-input').click());
    $('#bio-file-input').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const t = await f.text();
        area.value = t;
        toast('已读入文件，确认无误后点「导入」');
      } catch (err) {
        toast('读文件失败：' + err.message);
      }
    });

    $('#bio-import').addEventListener('click', () => {
      let data;
      try {
        data = JSON.parse(area.value);
      } catch (e) {
        toast('不是合法的 JSON，先点「复制全部」看看格式');
        return;
      }
      if (!data || typeof data !== 'object') return toast('内容不是名单对象');
      const tags = Array.isArray(data.blockedTags) ? data.blockedTags : [];
      const muted = Array.isArray(data.mutedBlogs) ? data.mutedBlogs : [];
      const black = Array.isArray(data.blockedBlogs) ? data.blockedBlogs : [];
      if (!tags.length && !muted.length && !black.length) return toast('这份名单里没有可导入的内容');
      if (!confirm(`导入：${tags.length} 个标签屏蔽、${muted.length} 位屏蔽用户、${black.length} 位拉黑？\n（合并到现有名单，不会删除已有的）`)) return;

      const normName = (x) => {
        if (!x) return null;
        if (typeof x === 'string') return { name: x.trim(), nick: x.trim() };
        const name = String(x.name || '').trim();
        if (!name) return null;
        return { name, nick: String(x.nick || name), avatar: x.avatar || '', time: x.time || Date.now() };
      };

      const tagSet = new Set((store.settings.blockedTags || []).map(String));
      let addTags = 0;
      for (const t of tags) {
        const v = String(t || '').replace(/^#/, '').trim();
        if (!v || tagSet.has(v)) continue;
        tagSet.add(v);
        addTags++;
      }
      store.settings.blockedTags = [...tagSet];

      const mergeBlogs = (current, incoming) => {
        const map = new Map(current.map((b) => [b.name, b]));
        let added = 0;
        for (const raw of incoming) {
          const b = normName(raw);
          if (!b || map.has(b.name)) continue;
          map.set(b.name, b);
          added++;
        }
        return { list: [...map.values()], added };
      };
      const m = mergeBlogs(mutedBlogList(), muted);
      store.settings.mutedBlogs = m.list;
      const b = mergeBlogs(blockedBlogList(), black);
      store.settings.blockedBlogs = b.list;

      store.saveSettings();
      toast(`已导入：标签 ${addTags} 个 · 屏蔽用户 ${m.added} 位 · 拉黑 ${b.added} 位`);
      viewBlockIO();
    });
  }

  // ================= 页面：诊断 =================
  async function viewDiag() {
    setTab(null);
    setHeader(`<button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button>
      <div class="h-title">诊断信息</div><div class="spacer"></div>
      <button class="icon-btn" id="btn-refresh" aria-label="刷新">${icon('refresh')}</button>`);
    $('#btn-back').addEventListener('click', back);
    viewEl.innerHTML = `<div class="diag"><div class="load-more"><span class="spinner"></span>正在检查…</div></div>`;
    async function run() {
      let data;
      try {
        data = await api('/api/diag');
      } catch (e) {
        data = { error: e.message };
      }
      let saved = '';
      if (NATIVE) {
        try { saved = Native.writeDiag(JSON.stringify(data, null, 2)); } catch (e) {}
      }
      viewEl.innerHTML = `<div class="diag">
        ${saved ? `<p class="diag-tip" style="color:var(--accent)">已写入 ${esc(saved)}</p>` : ''}
        <pre id="diag-text">${esc(JSON.stringify(data, null, 2))}</pre>
        <p class="diag-tip">把这段文字或 Download/lofter-lite-diag.json 发给开发者。</p>
      </div>`;
    }
    $('#btn-refresh').addEventListener('click', run);
    run();
  }

  // ================= 页面：关于 =================
  function viewAbout() {
    setTab(null);
    setHeader(`<button class="icon-btn" id="btn-back" aria-label="返回">${icon('back')}</button><div class="h-title">关于</div><div class="spacer"></div>`);
    $('#btn-back').addEventListener('click', back);
    viewEl.innerHTML = `
      <div style="padding:24px 22px;line-height:1.9;font-size:13.5px;color:var(--text-2)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
          <img src="icon.svg" width="52" height="52" style="border-radius:14px">
          <div><div style="font-size:19px;font-weight:800;color:var(--text)">LOFTER Lite</div>
          <div style="font-size:12px;color:var(--sub)">v5.7 · 本地运行的极简客户端</div></div>
        </div>
        <p><b style="color:var(--text)">它是什么</b><br>
        一个只保留「看内容」这件事的 LOFTER 第三方界面。首页推荐、标签、博主主页、图文详情都在，广告位、会员、周边商城、AI 创作入口这类模块一个都没有。</p>
        <p><b style="color:var(--text)">数据从哪来</b><br>
        通过 LOFTER 的公开接口读取公开内容，不需要登录。收藏、浏览历史、兴趣标签只存在这台手机的浏览器里，不会上传。</p>
        <p><b style="color:var(--text)">注意</b><br>
        非官方客户端，内容版权归原作者所有。如果接口调整导致某页打不开，重启服务即可；接口失效时请以官方 App 为准。</p>
        <p style="color:var(--sub);font-size:12px;margin-top:22px">把本页添加到主屏幕，就能像 App 一样全屏打开。</p>
      </div>`;
  }

  // ================= 路由分发 =================
  async function render() {
    const id = ++navId;
    closeSheet();
    // 每次渲染换一个干净的容器，旧视图上的监听器随之释放
    const fresh = viewEl.cloneNode(false);
    viewEl.replaceWith(fresh);
    viewEl = fresh;

    const { path, parts, q } = parseHash();
    currentRoute = path + (q.toString() ? '?' + q : '');
    document.body.classList.remove('immersive');
    const routeY = scrollPos.get(currentRoute) || 0;

    try {
      if (path === '/' || path === '') return await viewHome({});
      if (path === '/hot') { nav('#/'); return; }
      if (path === '/discover') { nav('#/'); return; }
      if (path === '/search') return await viewSearch(q.get('q') || '');
      if (path === '/following') return await viewFollowing();
      if (path === '/me') return viewMe();
      if (path === '/saved') return viewList('saved');
      if (path === '/history') return viewList('history');
      if (path === '/tags') return await viewTagsSetting();
      if (path === '/blocked') return viewBlocked();
      if (path === '/muted') return viewMuted();
      if (path === '/blacklist') return viewBlacklist();
      if (path === '/block-io') return viewBlockIO();
      if (path === '/relation') return await viewRelation(q.get('type') === 'fans' ? 'fans' : 'following');
      if (path === '/favorites') return await viewAccountPosts('likes');
      if (path === '/shares') return await viewAccountPosts('shares');
      if (path === '/collections') return await viewCollections();
      if (parts[0] === 'collection' && parts[1]) return await viewCollection(Number(parts[1]) || 0);
      if (path === '/about') return viewAbout();
      if (path === '/diag') return viewDiag();
      if (parts[0] === 'tag' && parts[1]) return await viewTag(parts[1], q.get('sort') === 'hot' ? 'hot' : 'new');
      if (parts[0] === 'blog' && parts[1]) return await viewBlog(parts[1]);
      if (parts[0] === 'post' && parts[1] && parts[2]) return await viewPost(parts[1], parts[2]);
      nav('#/');
    } catch (err) {
      console.error(err);
      if (id === navId) viewEl.innerHTML = emptyEl(err.message || '出错了', true);
    } finally {
      // 视图函数返回时内容可能还在陆续进，restoreScroll 会继续追几轮
      restoreScroll(id, routeY);
    }
  }

  // 自动诊断：写入 Download/lofter-lite-diag.json
  window.__autoDiag = async () => {
    if (!nativeApi) return;
    try {
      const data = await api('/api/diag');
      try { window.Native.writeDiag(JSON.stringify(data, null, 2)); } catch (e) {}
    } catch (e) {}
  };

  // 初始化
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  render();

  // Service Worker（仅浏览器/PWA 模式）
  if (!NATIVE && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
