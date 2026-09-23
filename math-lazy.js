/* ========================================================================== 
   超长数学文章：只排版视口附近的公式块，避免 MathJax 一次处理数千个公式
   阻塞主线程。页面会提前约两屏排版，滚动到内容时通常已经完成。
   ========================================================================== */
(function () {
  'use strict';

  window.LWL_LAZY_MATH = true;

  var queued = [];
  var running = false;
  var observed = new WeakSet();
  var selector = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,figcaption';
  var mathRe = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/;

  function hasNestedCandidate(el) {
    return !!el.querySelector(selector);
  }

  function enqueue(el) {
    if (!el || el.dataset.mathReady === '1' || el.dataset.mathQueued === '1') return;
    el.dataset.mathQueued = '1';
    queued.push(el);
    drain();
  }

  function drain() {
    if (running || !queued.length || !window.MathJax || !MathJax.typesetPromise) return;
    running = true;
    var el = queued.shift();
    MathJax.typesetPromise([el]).then(function () {
      el.dataset.mathReady = '1';
    }).catch(function () {
      el.dataset.mathFailed = '1';
    }).then(function () {
      delete el.dataset.mathQueued;
      running = false;
      drain();
    });
  }

  function collect(root) {
    var blocks = Array.prototype.slice.call(root.querySelectorAll(selector)).filter(function (el) {
      return !hasNestedCandidate(el) && mathRe.test(el.textContent || '');
    });

    if (!blocks.length && mathRe.test(root.textContent || '')) blocks = [root];
    return blocks;
  }

  function observeRoot(root) {
    if (!root || observed.has(root)) return;
    observed.add(root);

    MathJax.startup.promise.then(function () {
      var blocks = collect(root);
      if (!('IntersectionObserver' in window)) {
        blocks.forEach(enqueue);
        return;
      }
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          enqueue(entry.target);
        });
      }, { rootMargin: '1200px 0px' });
      blocks.forEach(function (el) { observer.observe(el); });
    }).catch(function () {});
  }

  function start() {
    document.querySelectorAll('.post-content').forEach(observeRoot);
    var encrypted = document.getElementById('enc-content');
    if (encrypted && !encrypted.hidden) observeRoot(encrypted);
  }

  document.addEventListener('lwl:decrypted', function () {
    observeRoot(document.getElementById('enc-content'));
  });
  start();
})();
