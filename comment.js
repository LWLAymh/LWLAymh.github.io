/* ==========================================================================
   评论系统（Waline）：
   - 注册用户：通过 Waline 的第三方登录（GitHub 等）评论。
   - 匿名用户：按 Alice/Bob/Carol/... 顺序分配代号，存于 localStorage，
     同一浏览器重复评论沿用同一代号（顺序为“本机首次访客”递增）。
   在 config.js 的 comment.serverURL 填写你的 Waline 服务地址后生效。
   ========================================================================== */
(function () {
  'use strict';

  var cfg = (window.BLOG_CONFIG && window.BLOG_CONFIG.comment) || {};
  var el = document.getElementById('waline');
  if (!el) return;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  // 未配置 serverURL 时给出提示，而不是报错
  if (!cfg.serverURL || /your-/.test(cfg.serverURL)) {
    el.innerHTML = '<p class="empty">评论系统尚未配置 —— 在 <code>config.js</code> 的 ' +
      '<code>comment.serverURL</code> 填入你的 Waline 服务地址即可。</p>';
    return;
  }

  var NAMES = cfg.anonymousNames || ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
  var NAME_KEY = 'lwl-anon-name';
  var SEQ_KEY = 'lwl-anon-seq';

  // 匿名代号：顺序发放（本机维度），已分配过的浏览器沿用旧代号
  var anon = safeGet(NAME_KEY);
  if (!anon) {
    var seq = parseInt(safeGet(SEQ_KEY) || '0', 10);
    if (!isFinite(seq) || seq < 0) seq = 0;
    anon = NAMES[seq % NAMES.length];
    safeSet(NAME_KEY, anon);
    safeSet(SEQ_KEY, String(seq + 1));
  }

  var started = false;
  var scriptFailed = false;
  var walineInstance = null;
  var nickTimer = null;

  function fillNickname() {
    var input = document.querySelector('.wl-nick');
    if (input && !input.value) input.value = anon;
  }

  function startNickPoll() {
    var tries = 0;
    clearInterval(nickTimer);
    nickTimer = setInterval(function () {
      fillNickname();
      if (++tries > 40) clearInterval(nickTimer);
    }, 250);
  }

  /** 只允许初始化一次；返回是否已完成初始化。 */
  function initWaline() {
    if (started) return true;
    if (!window.Waline) return false;
    started = true;

    walineInstance = Waline.init({
      el: '#waline',
      serverURL: cfg.serverURL,
      path: location.pathname,    // 按当前文章 URL 存储/读取评论
      lang: 'zh-CN',
      dark: document.body.getAttribute('data-theme') === 'dark',
      login: 'enable',            // 允许第三方登录（注册用户）
      requiredMeta: ['nick'],     // 昵称必填（匿名用户会预填代号）
      pageview: true,
    });
    startNickPoll();
    return true;
  }

  // 手动切换主题时同步 Waline 的暗色模式
  document.addEventListener('themechange', function (e) {
    if (walineInstance && typeof walineInstance.update === 'function') {
      try {
        walineInstance.update({ dark: e.detail === 'dark' });
      } catch (err) {}
    }
  });

  function load(src, onload, onerror) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = onload;
    s.onerror = onerror;
    document.head.appendChild(s);
  }

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/vendor/waline/waline.css';
  document.head.appendChild(css);

  var tries = 0;
  load(
    '/vendor/waline/waline.umd.js',
    function () { initWaline(); },
    function () { scriptFailed = true; el.innerHTML = '<p class="empty">评论组件加载失败，请检查网络后刷新重试。</p>'; }
  );

  // 兜底轮询：脚本 onload 之后调用是 no-op（started 已置位），不会重复初始化
  var poll = setInterval(function () {
    if (scriptFailed) { clearInterval(poll); return; }
    if (initWaline() || ++tries > 40) {
      clearInterval(poll);
      if (!started && !scriptFailed) {
        el.innerHTML = '<p class="empty">评论组件加载超时，请检查网络后刷新重试。</p>';
      }
    }
  }, 250);
})();
