(function () {
  'use strict';
  var input = document.getElementById('search-input');
  if (!input || !window.BlogSearch) return;
  var results = document.getElementById('search-results');
  var status = document.getElementById('search-status');
  var index = null, pending = null, timer, active = -1, links = [], generation = 0;

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function highlight(text, query) {
    var at = text.toLowerCase().indexOf(query.toLowerCase());
    return at < 0 ? esc(text) : esc(text.slice(0, at)) + '<mark>' + esc(text.slice(at, at + query.length)) + '</mark>' + esc(text.slice(at + query.length));
  }
  function show() {
    results.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
  }
  function close() {
    generation++;
    clearTimeout(timer);
    results.classList.remove('open');
    results.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    input.removeAttribute('aria-busy');
    status.textContent = '';
    links = []; active = -1;
  }
  function load() {
    if (!pending) {
      pending = fetch('/search.json').then(function (r) {
        if (!r.ok) throw new Error('search');
        return r.json();
      }).then(function (posts) { index = window.BlogSearch.prepare(posts); })
        .catch(function (error) { pending = null; throw error; });
    }
    return pending;
  }
  function render(query) {
    var hits = window.BlogSearch.find(index, query);
    results.innerHTML = hits.map(function (hit, i) {
      var p = hit.post;
      return '<a id="search-hit-' + i + '" role="option" aria-selected="false" class="search-item' + (p.banned ? ' is-banned' : '') + '" data-ban-kind="link"' +
        (p.banned ? ' data-ban-locked aria-disabled="true"' : '') +
        ' data-ban-category="' + esc(p.category || '') + '" href="' + esc(hit.url) + '">' +
        '<div class="s-title">' + highlight(p.title, query) + '</div>' +
        '<div class="s-meta">' + esc(p.date) + (p.category ? ' · ' + esc(p.category) : '') + (hit.section ? ' · ' + esc(hit.section) : '') + '</div>' +
        '<div class="s-excerpt">' + highlight(hit.snippet, query) + '</div></a>';
    }).join('') || '<div class="search-item">无匹配结果</div>';
    if (window.BlogBans) window.BlogBans.refresh(results);
    links = Array.prototype.slice.call(results.querySelectorAll('a.search-item'));
    active = -1;
    input.removeAttribute('aria-activedescendant');
    status.textContent = hits.length ? '显示 ' + hits.length + ' 条结果，可用上下方向键选择。' : '无匹配结果';
    show();
  }
  function search() {
    var query = input.value.trim();
    var version = ++generation;
    if (!query) { close(); return; }
    if (index) { render(query); return; }
    input.setAttribute('aria-busy', 'true');
    status.textContent = '正在加载搜索索引';
    results.innerHTML = '<div class="search-item">正在加载…</div>';
    show();
    load().then(function () {
      if (version !== generation) return;
      input.removeAttribute('aria-busy');
      render(input.value.trim());
    }).catch(function () {
      if (version !== generation) return;
      input.removeAttribute('aria-busy');
      results.innerHTML = '<div class="search-item">搜索加载失败。<button type="button" data-search-retry>重试</button></div>';
      status.textContent = '搜索加载失败，可重试。';
    });
  }
  input.addEventListener('focus', function () {
    if (input.value.trim()) search();
    else if (!index) load().catch(function () {});
  });
  input.addEventListener('input', function () {
    close();
    if (input.value.trim()) timer = setTimeout(search, 150);
  });
  results.addEventListener('click', function (event) {
    if (event.target.closest('[data-search-retry]')) search();
  });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { close(); return; }
    if (event.key === 'Enter' && links[active]) { event.preventDefault(); links[active].click(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!links.length) return;
    event.preventDefault();
    if (active >= 0) { links[active].classList.remove('active'); links[active].setAttribute('aria-selected', 'false'); }
    active = active < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[active].classList.add('active');
    links[active].setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', links[active].id);
    links[active].scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('click', function (event) { if (!event.target.closest('.hero-search')) close(); });
  document.addEventListener('focusin', function (event) { if (!event.target.closest('.hero-search')) close(); });
})();
