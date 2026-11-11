(function () {
  'use strict';
  var article = document.querySelector('.post');
  if (!article) return;
  var notice = document.createElement('div');
  notice.className = 'reading-notice sr-only';
  notice.setAttribute('role', 'status');
  article.appendChild(notice);

  function copy(text, button) {
    var label = button.textContent;
    var result = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text) : Promise.reject(new Error('clipboard unavailable'));
    result.then(function () { button.textContent = '已复制'; notice.textContent = '已复制到剪贴板'; })
      .catch(function () { button.textContent = '请手动复制'; notice.textContent = '无法访问剪贴板，请选择内容手动复制。'; })
      .then(function () { setTimeout(function () { button.textContent = label; }, 1800); });
  }
  function button(label, className, action) {
    var el = document.createElement('button');
    el.type = 'button'; el.className = className; el.textContent = label;
    el.addEventListener('click', action);
    return el;
  }
  var dialog = null, imageOpener = null;
  function openImage(img, opener) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'image-dialog';
      dialog.setAttribute('aria-label', '查看图片');
      var close = button('关闭 ×', 'image-close', function () { dialog.close(); });
      var preview = document.createElement('img');
      dialog.appendChild(close); dialog.appendChild(preview);
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', function () {
        document.body.classList.remove('image-modal-open');
        if (imageOpener && imageOpener.isConnected) imageOpener.focus({ preventScroll: true });
      });
      document.body.appendChild(dialog);
    }
    imageOpener = opener;
    dialog.querySelector('img').src = img.currentSrc || img.src;
    dialog.querySelector('img').alt = img.alt || '文章图片';
    dialog.showModal();
    document.body.classList.add('image-modal-open');
  }
  function enhance() {
    article.querySelectorAll('.post-content pre > code').forEach(function (code) {
      var pre = code.parentNode;
      if (pre.dataset.readingReady) return;
      pre.dataset.readingReady = '1';
      var wrap = document.createElement('div'); wrap.className = 'code-block';
      pre.parentNode.insertBefore(wrap, pre); wrap.appendChild(pre);
      wrap.insertBefore(button('复制代码', 'code-copy', function (event) { copy(code.textContent, event.currentTarget); }), pre);
    });
    article.querySelectorAll('.post-content h1[id], .post-content h2[id], .post-content h3[id], .post-content h4[id], .post-content h5[id], .post-content h6[id]').forEach(function (heading) {
      if (heading.querySelector('.heading-copy')) return;
      var control = button('#', 'heading-copy', function (event) {
        var url = new URL(window.location.href); url.hash = heading.id;
        copy(url.href, event.currentTarget);
      });
      control.setAttribute('aria-label', '复制章节链接：' + heading.textContent);
      control.title = '复制章节链接';
      heading.appendChild(control);
    });
    if (typeof HTMLDialogElement !== 'undefined') article.querySelectorAll('.post-content img').forEach(function (img) {
      if (img.closest('a, button, .mermaid')) return;
      var control = button('', 'image-zoom', function () { openImage(img, control); });
      control.setAttribute('aria-label', '放大图片：' + (img.alt || '文章图片'));
      img.parentNode.insertBefore(control, img); control.appendChild(img);
    });
    document.dispatchEvent(new CustomEvent('lwl:content-resized'));
  }
  enhance();
  document.addEventListener('lwl:decrypted', enhance);

  // Persist only section IDs and offsets; never persist decrypted article content.
  if (document.getElementById('encrypted') || article.querySelector('.post-ban-body.is-banned')) return;
  var headings = Array.prototype.slice.call(article.querySelectorAll('.post-content [id^="toc-"]'));
  if (!headings.length) return;
  var storageKey = 'lwl-reading-positions', positions = {}, page = window.location.pathname;
  try { positions = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (error) {}
  if (!positions || typeof positions !== 'object' || Array.isArray(positions)) positions = {};
  var previous = positions[page];
  if (!window.location.hash && previous && typeof previous.id === 'string' && document.getElementById(previous.id)) {
    var resume = button('继续上次阅读', 'reading-resume', function () {
      resume.remove();
      var target = document.getElementById(previous.id);
      var next = headings[headings.indexOf(target) + 1];
      var sectionHeight = (next || article).getBoundingClientRect()[next ? 'top' : 'bottom'] - target.getBoundingClientRect().top;
      var offset = Number.isFinite(previous.offset) ? Math.max(0, Math.min(previous.offset, sectionHeight - 1)) : 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset - 110, behavior: 'instant' });
      target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true });
    });
    article.querySelector('.post-header').appendChild(resume);
  }
  var changed = false;
  window.addEventListener('scroll', function () { changed = true; }, { passive: true });
  function save() {
    if (!changed) return;
    try {
      var latest = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (latest && typeof latest === 'object' && !Array.isArray(latest)) positions = latest;
      var last = headings[0];
      headings.forEach(function (heading) { if (heading.getBoundingClientRect().top <= 120) last = heading; });
      if (window.scrollY < 300 || article.getBoundingClientRect().bottom <= window.innerHeight + 80) delete positions[page];
      else positions[page] = { id: last.id, offset: Math.max(0, 110 - last.getBoundingClientRect().top), at: Date.now() };
      var keys = Object.keys(positions).sort(function (a, b) { return ((positions[b] || {}).at || 0) - ((positions[a] || {}).at || 0); });
      keys.slice(50).forEach(function (key) { delete positions[key]; });
      localStorage.setItem(storageKey, JSON.stringify(positions));
      changed = false;
    } catch (error) {}
  }
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
})();
