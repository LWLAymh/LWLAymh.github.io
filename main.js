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
  var themeConfig = cfg.theme || {};
  var themeKey = themeConfig.storageKey || 'lwl-theme';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    if (document.body) document.body.setAttribute('data-theme', t);
  }
  function currentTheme() {
    var saved = safeGet(themeKey);
    if (saved === 'dark' || saved === 'light') return saved;
    if (themeConfig.defaultTheme === 'dark' || themeConfig.defaultTheme === 'light') return themeConfig.defaultTheme;
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

  /* ---- 侧边栏开关 ---- */
  var sidebar = document.getElementById('sidebar');
  var sidebarOverlay = document.getElementById('sidebar-overlay');
  var sidebarToggle = document.getElementById('sidebar-toggle');
  var headerMenuToggle = document.getElementById('header-menu-toggle');
  var sidebarClose = document.getElementById('sidebar-close');
  var sidebarOpener = null;
  var pinnedToc = false;
  var modalOpen = false;
  var inertBefore = new Map();
  var wideScreen = window.matchMedia('(min-width: 1440px)');
  function focusableSidebar() {
    return Array.prototype.filter.call(sidebar.querySelectorAll('a[href], button, input, [tabindex="0"]'), function (el) {
      return !el.disabled && !el.closest('[inert]') && el.getClientRects().length;
    });
  }
  function setSidebar(open) {
    if (!sidebar) return;
    var modal = !!open && !pinnedToc;
    if (modal && !modalOpen) sidebarOpener = document.activeElement;
    sidebar.classList.toggle('open', modal);
    sidebar.classList.toggle('pinned-toc', pinnedToc);
    if (sidebarOverlay) sidebarOverlay.classList.toggle('open', modal);
    sidebar.inert = !(modal || pinnedToc);
    sidebar.setAttribute('aria-hidden', String(sidebar.inert));
    if (modal) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); }
    else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); }
    if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', String(modal || pinnedToc));
    if (headerMenuToggle) headerMenuToggle.setAttribute('aria-expanded', String(modal));
    document.body.classList.toggle('sidebar-modal-open', modal);
    if (modal && !modalOpen) {
      document.querySelectorAll('.site-header, .site-main, .site-footer, .sidebar-toggle, .back-top').forEach(function (el) {
        inertBefore.set(el, el.inert); el.inert = true;
      });
      (sidebarClose || sidebar).focus({ preventScroll: true });
    } else if (!modal && modalOpen) {
      inertBefore.forEach(function (value, el) { el.inert = value; });
      inertBefore.clear();
      if (sidebarOpener && sidebarOpener.isConnected && sidebarOpener.getClientRects().length) sidebarOpener.focus({ preventScroll: true });
    }
    modalOpen = modal;
  }
  function syncSidebarMode() {
    pinnedToc = !!(sidebar && wideScreen.matches && !document.documentElement.classList.contains('nav-collapsed') &&
      document.body.classList.contains('page-post') && sidebar.querySelectorAll('.toc-list a[href^="#"]').length);
    document.body.classList.toggle('has-pinned-toc', pinnedToc);
    setSidebar(modalOpen);
  }
  if (wideScreen.addEventListener) wideScreen.addEventListener('change', syncSidebarMode);
  if (sidebarToggle) sidebarToggle.addEventListener('click', function () { setSidebar(!modalOpen); });
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', function () { setSidebar(false); });
  if (sidebarClose) sidebarClose.addEventListener('click', function () { setSidebar(false); });
  if (headerMenuToggle) headerMenuToggle.addEventListener('click', function () { setSidebar(!modalOpen); });
  if (sidebar) sidebar.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    setSidebar(false);
    var href = link.getAttribute('href');
    if (href.charAt(0) === '#') {
      var target = document.getElementById(href.slice(1));
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!modalOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); setSidebar(false); }
    if (e.key === 'Tab') {
      var items = focusableSidebar();
      var first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    }
  });
  setSidebar(false);

  /* ---- 导航自适应：只有真实放不下一行时才收进侧边栏 ---- */
  var headerInner = document.querySelector('.header-inner');
  var siteBrand = document.querySelector('.site-brand');
  var siteNav = document.getElementById('site-nav');
  var themeToggle = document.getElementById('theme-toggle');
  var navMeasurePending = false;
  function syncAdaptiveNav() {
    navMeasurePending = false;
    if (!headerInner || !siteBrand || !siteNav || !themeToggle) return;
    document.documentElement.classList.add('nav-measuring');
    var style = window.getComputedStyle(headerInner);
    var available = headerInner.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    var required = siteBrand.offsetWidth + siteNav.scrollWidth + themeToggle.offsetWidth + 36;
    document.documentElement.classList.remove('nav-measuring');
    document.documentElement.classList.toggle('nav-collapsed', required > available);
    syncSidebarMode();
  }
  function scheduleAdaptiveNav() {
    if (navMeasurePending) return;
    navMeasurePending = true;
    requestAnimationFrame(syncAdaptiveNav);
  }
  if (headerInner && siteNav) {
    syncAdaptiveNav();
    if (window.ResizeObserver) new ResizeObserver(scheduleAdaptiveNav).observe(headerInner);
    else window.addEventListener('resize', scheduleAdaptiveNav, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleAdaptiveNav);
  }

  /* ---- 树形目录折叠 / 展开 ---- */
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('.toc-toggle');
    if (!toggle) return;
    var branch = toggle.closest('.toc-branch');
    if (!branch) return;
    var collapsed = branch.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    if (typeof measureSections === 'function') {
      measureSections();
      spy();
    }
  });

  /* ---- 目录滚动定位（scroll-spy，缓存位置 + rAF 节流） ---- */
  var tocSections = [];
  var measureSections = function () {
    tocSections.forEach(function (s) {
      s.top = s.el.offsetParent
        ? s.el.getBoundingClientRect().top + window.scrollY
        : Infinity;
    });
  };
  var spy = function () {
    var visible = tocSections.filter(function (s) { return s.el.offsetParent !== null; });
    if (!visible.length) return;
    var pos = window.scrollY + 120;
    var current = visible[0];
    for (var i = 0; i < visible.length; i++) {
      if (visible[i].top <= pos) current = visible[i];
      else break;
    }
    tocSections.forEach(function (s) { s.link.classList.remove('active'); });
    if (current) current.link.classList.add('active');
  };
  var tocLinks = document.querySelectorAll('.toc-list a');
  if (tocLinks.length) {
    tocLinks.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (a.getAttribute('href').charAt(0) === '#' && el) tocSections.push({ link: a, el: el, top: 0 });
    });
    measureSections();
    var measurementPending = false;
    function scheduleMeasurement() {
      if (measurementPending) return;
      measurementPending = true;
      requestAnimationFrame(function () { measurementPending = false; measureSections(); spy(); updateProgress(); });
    }
    window.addEventListener('resize', scheduleMeasurement, { passive: true });
    document.addEventListener('load', scheduleMeasurement, true);
    document.addEventListener('lwl:content-resized', scheduleMeasurement);
    document.addEventListener('lwl:decrypted', scheduleMeasurement);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMeasurement);
    var article = document.querySelector('.post');
    if (article && window.ResizeObserver) new ResizeObserver(scheduleMeasurement).observe(article);
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
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
