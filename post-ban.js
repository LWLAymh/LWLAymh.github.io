/* 封禁状态由构建固定，浏览器只让重复报错逐行失真。 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.BlogBans = api;
    api.init(root, document);
  }
})(typeof window === 'undefined' ? this : window, function () {
  'use strict';

  function lockedRule(rules, category) {
    return rules.find(function (rule) {
      return category === rule.category || category.indexOf(rule.category + '/') === 0;
    }) || null;
  }

  /** 全部记录复用同一句报错，只显示剩余时间。 */
  function errorLines(endAt, timeText) {
    var retry = timeText === undefined
      ? remainingText(endAt - Date.now())
      : timeText;
    var normal = "ERROR: user 'LWLAymh' not found. The requested user record cannot be loaded. Retry in " + retry + '.';
    return [
      normal,
      normal.replace('found', 'founnd'),
      normal.replace('ERROR:', 'ERROR::'),
      normal.replace('user', 'usre').replace('Retry', 'Retrry'),
      normal,
      normal.replace('LWLAymh', 'LWLAymhh').replace('found.', 'found'),
      normal.replace('not found', 'not  found'),
      normal.replace('not found', 'not not found'),
      normal,
      normal.replace('ERROR', 'ERRRROR'),
      normal.replace('Retry', 'Reetry'),
      normal.replace("'LWLAymh'", "'LWLAymh"),
    ];
  }

  function remainingText(milliseconds) {
    var seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    var days = Math.floor(seconds / 86400);
    function pad(n) { return String(n).padStart(2, '0'); }
    return (days ? days + 'd ' : '') + pad(Math.floor(seconds / 3600) % 24) + ':' +
      pad(Math.floor(seconds / 60) % 60) + ':' + pad(seconds % 60);
  }

  function errorParts(endAt, variant, now, leadingError) {
    var marker = '__BAN_CLOCK__';
    var templates = errorLines(endAt, marker);
    var template = templates[variant % templates.length];
    if (leadingError && template.indexOf('ERROR') !== 0) {
      template = 'ERROR: ' + template.replace(/^(?:ERR0R|ER ROR|ERRRROR)\s*:?\s*/, '');
    }
    var parts = template.split(marker);
    return { prefix: parts[0], suffix: parts[1], time: remainingText(endAt - now) };
  }

  /** 每个倒计时独立暂停/失真；从绝对时间恢复，不累计扣秒误差。 */
  function countdownFrame(state, endAt, now, behavior, random) {
    random = random || Math.random;
    var clean = remainingText(endAt - now);
    if (endAt <= now) { state.until = 0; state.display = '00:00:00'; return state.display; }
    var second = Math.floor(now / 1000);
    if (state.second === second) return state.display;
    state.second = second;
    if (behavior !== 'steady' && state.until > now) return state.display;
    if (state.until) { state.until = 0; state.display = clean; return clean; }
    if (behavior === 'freeze' && state.display && random() < 0.18) {
      state.until = now + (3 + Math.floor(random() * 6)) * 1000;
      return state.display;
    }
    if (behavior === 'corrupt' && random() < 0.28) {
      var digits = [];
      for (var i = 0; i < clean.length; i++) if (/\d/.test(clean[i])) digits.push(i);
      var at = digits[Math.floor(random() * digits.length)];
      var glyphs = ['O', 'l', 'x', '?', '/', ';'];
      clean = clean.slice(0, at) + glyphs[Math.floor(random() * glyphs.length)] + clean.slice(at + 1);
    }
    state.display = clean;
    return clean;
  }

  var refresh = function () {};
  function init(win, doc) {
    var rules = (win.BLOG_CONFIG || {}).categoryBans || [];
    if (!rules.length) return;
    var clockStates = new WeakMap();
    refresh = function (scope) {
      var now = Date.now();
      var reduced = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      (scope || doc).querySelectorAll('[data-ban-locked]').forEach(function (node) {
        var rule = lockedRule(rules, node.getAttribute('data-ban-category'));
        if (!rule) return;
        // 这里只能保持封禁，绝不按访客时间移除封条、恢复正文或启用链接。
        node.classList.add('is-banned');
        if (node.getAttribute('data-ban-kind') === 'link') {
          node.setAttribute('aria-disabled', 'true');
          node.setAttribute('title', '暂时封禁');
        }
        node.querySelectorAll('[data-ban-clock="countdown"]').forEach(function (clock) {
          var state = clockStates.get(clock);
          if (!state) { state = {}; clockStates.set(clock, state); }
          var behavior = reduced ? 'steady' : clock.getAttribute('data-ban-clock-behavior');
          clock.textContent = countdownFrame(state, rule.endAt, now, behavior);
        });
      });
    };

    function preventBannedNavigation(event) {
      if (event.target.closest('[data-ban-kind="link"][data-ban-locked], [data-ban-kind="toc"][data-ban-locked] a, [data-ban-content][inert]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    doc.addEventListener('click', preventBannedNavigation, true);
    doc.addEventListener('auxclick', preventBannedNavigation, true);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) refresh(); });
    win.addEventListener('pageshow', function () { refresh(); });
    refresh();
    // 此计时器只控制装饰报错的变化，不决定封禁状态。
    win.setInterval(function () { if (!doc.hidden) refresh(); }, 1000);
  }

  return { lockedRule: lockedRule, errorLines: errorLines, errorParts: errorParts,
    remainingText: remainingText, countdownFrame: countdownFrame, init: init,
    refresh: function (scope) { refresh(scope); } };
});
