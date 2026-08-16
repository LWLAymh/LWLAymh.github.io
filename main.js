/* ==========================================================================
   全局脚本：主题切换、头像/背景/签名轮换、阅读进度条、客户端搜索、
   侧边栏与目录定位、回到顶部。
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.BLOG_CONFIG || {};

  /* ---- localStorage 安全封装（隐私模式可能抛异常） ---- */
  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  /* ---- 主题 ---- */
  var themeKey = 'lwl-theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    if (document.body) document.body.setAttribute('data-theme', t);
  }
  function currentTheme() {
    var saved = safeGet(themeKey);
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(currentTheme());

  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      safeSet(themeKey, next);
      // 让 Waline 等第三方组件同步主题
      document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
    });
  }

  /* ---- 头像 / 背景 / 签名轮换（接口） ---- */
  function pick(list) {
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  if (cfg.avatar) {
    var av = cfg.avatar.url || pick(cfg.avatar.list);
    if (av) {
      document.querySelectorAll('[data-avatar]').forEach(function (img) { img.src = av; });
    }
  }

  if (cfg.background) {
    var bg = cfg.background.url || pick(cfg.background.list);
    if (bg) {
      document.body.classList.add('has-bg');
      document.body.style.setProperty('--bg-image', 'url(' + JSON.stringify(bg) + ')');
      var ov = typeof cfg.background.overlay === 'number' ? cfg.background.overlay : 0.8;
      document.body.style.setProperty('--bg-overlay', Math.round(ov * 100) + '%');
    }
  }

  if (cfg.signature) {
    var sig = cfg.signature.text || pick(cfg.signature.list);
    var sigEl = document.getElementById('footer-signature');
    if (sig && sigEl) sigEl.textContent = sig;
  }

  /* ---- 阅读进度条 ---- */
  var bar = document.getElementById('progress-bar');
  var updateProgress = function () {
    if (!bar) return;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var p = max > 0 ? (h.scrollTop / max) * 100 : 0;
    bar.style.width = p + '%';
  };
  if (bar) {
    window.addEventListener('scroll', scheduleScrollWork, { passive: true });
    updateProgress();
  }

  /* ---- 客户端搜索（首次聚焦/输入时才拉取索引） ---- */
  var input = document.getElementById('search-input');
  if (input) {
    var results = document.getElementById('search-results');
    var data = null;
    var dataPromise = null;
    var hitLinks = [];
    var activeIndex = -1;
    var searchTimer = null;

    function esc(s) {
      return s.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function highlight(text, q) {
      var i = text.toLowerCase().indexOf(q.toLowerCase());
      if (i < 0) return esc(text);
      return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    }

    function loadData() {
      if (!dataPromise) {
        dataPromise = fetch('/search.json')
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function (json) { data = json; })
          .catch(function () { dataPromise = null; });
      }
      return dataPromise;
    }

    function closeResults() {
      results.classList.remove('open');
      results.innerHTML = '';
      hitLinks = [];
      activeIndex = -1;
    }

    function setActive(next) {
      if (!hitLinks.length) return;
      if (activeIndex >= 0) hitLinks[activeIndex].classList.remove('active');
      activeIndex = (next + hitLinks.length) % hitLinks.length;
      hitLinks[activeIndex].classList.add('active');
      if (hitLinks[activeIndex].scrollIntoView) {
        hitLinks[activeIndex].scrollIntoView({ block: 'nearest' });
      }
    }

    function renderResults(q) {
      if (!q || !data) { closeResults(); return; }
      var ql = q.toLowerCase();
      var hits = data.filter(function (p) {
        var hay = (p.title + ' ' + (p.category || '') + ' ' + p.excerpt + ' ' + p.text).toLowerCase();
        return hay.indexOf(ql) >= 0;
      }).slice(0, 12);

      results.innerHTML = hits.map(function (p) {
        var catStr = p.category ? esc(p.category) : '';
        return '<a class="search-item" href="' + p.url + '">' +
          '<div class="s-title">' + highlight(p.title, q) + '</div>' +
          '<div class="s-meta">' + esc(p.date) + (catStr ? ' · ' + catStr : '') + '</div>' +
          '<div class="s-excerpt">' + highlight(p.excerpt, q) + '</div>' +
          '</a>';
      }).join('') || '<div class="search-item">无匹配结果</div>';
      results.classList.add('open');
      hitLinks = Array.prototype.slice.call(results.querySelectorAll('a.search-item'));
      activeIndex = -1;
    }

    input.addEventListener('focus', function () {
      if (!data) loadData();
    });

    input.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var q = input.value.trim();
      if (!q) { closeResults(); return; }
      searchTimer = setTimeout(function () {
        if (data) { renderResults(input.value.trim()); return; }
        loadData().then(function () { renderResults(input.value.trim()); });
      }, 150);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
      else if (e.key === 'Enter') {
        var cur = hitLinks[activeIndex];
        if (cur) { e.preventDefault(); window.location.href = cur.getAttribute('href'); }
      } else if (e.key === 'Escape') { closeResults(); }
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.hero-search')) closeResults();
    });
  }

  /* ---- 侧边栏开关 ---- */
  var sidebar = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebar-overlay');
  var sidebarToggle = document.getElementById('sidebar-toggle');
  function setSidebar(open) {
    if (sidebar) sidebar.classList.toggle('open', open);
    if (sidebarOverlay) sidebarOverlay.classList.toggle('open', open);
    if (sidebar) sidebar.setAttribute('aria-hidden', String(!open));
  }
  if (sidebarToggle) sidebarToggle.addEventListener('click', function () {
    setSidebar(!sidebar.classList.contains('open'));
  });
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', function () { setSidebar(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setSidebar(false);
  });

  /* ---- 目录滚动定位（scroll-spy，缓存位置 + rAF 节流） ---- */
  var tocSections = [];
  var measureSections = function () {
    tocSections.forEach(function (s) {
      s.top = s.el.getBoundingClientRect().top + window.scrollY;
    });
  };
  var spy = function () {
    if (!tocSections.length) return;
    var pos = window.scrollY + 120;
    var current = tocSections[0];
    for (var i = 0; i < tocSections.length; i++) {
      if (tocSections[i].top <= pos) current = tocSections[i];
      else break;
    }
    tocSections.forEach(function (s) { s.link.classList.remove('active'); });
    if (current) current.link.classList.add('active');
  };
  var tocLinks = document.querySelectorAll('.toc-list a');
  if (tocLinks.length) {
    tocLinks.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) tocSections.push({ link: a, el: el, top: 0 });
    });
    measureSections();
    window.addEventListener('resize', measureSections, { passive: true });
    window.addEventListener('scroll', scheduleScrollWork, { passive: true });
    spy();
  }

  /* ---- 回到顶部 ---- */
  var backTop = document.getElementById('back-top');
  var updateBackTop = function () {
    if (!backTop) return;
    if (window.scrollY > 400) backTop.classList.add('show');
    else backTop.classList.remove('show');
  };
  if (backTop) {
    window.addEventListener('scroll', scheduleScrollWork, { passive: true });
    updateBackTop();
    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* 滚动处理统一走 rAF：进度条写宽、scroll-spy、回顶按钮共用一个回调，
     避免同一帧里读布局/写样式交叉造成 layout thrash。 */
  var scrollPending = false;
  function scheduleScrollWork() {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(function () {
      updateProgress();
      spy();
      updateBackTop();
      scrollPending = false;
    });
  }
})();
