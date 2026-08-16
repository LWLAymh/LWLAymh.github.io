/* ==========================================================================
   Mermaid 图（Typora ```mermaid 代码块）。
   只有文章出现 mermaid 代码块时本脚本才会被引入；按需从 CDN 加载 mermaid，
   把 <pre><code class="language-mermaid"> 转成图表。
   ========================================================================== */
(function () {
  'use strict';

  var selector = 'pre code.language-mermaid';
  var loading = false;
  var loaded = false;

  function render() {
    var blocks = document.querySelectorAll(selector);
    if (!blocks.length) return;

    function run() {
      if (!window.mermaid) return;
      try {
        var dark = document.body.getAttribute('data-theme') === 'dark';
        mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
        Array.prototype.forEach.call(blocks, function (code) {
          var pre = code.parentNode;
          var div = document.createElement('div');
          div.className = 'mermaid';
          div.textContent = code.textContent;
          pre.parentNode.replaceChild(div, pre);
        });
        mermaid.run({ querySelector: '.mermaid' }).catch(function () {});
      } catch (e) {}
    }

    if (window.mermaid) { run(); return; }
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    s.onload = function () { loaded = true; run(); };
    s.onerror = function () {
      var els = document.querySelectorAll(selector);
      Array.prototype.forEach.call(els, function (code) {
        var pre = code.parentNode;
        var p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'Mermaid 图表加载失败，请检查网络。';
        pre.parentNode.replaceChild(p, pre);
      });
    };
    document.head.appendChild(s);
  }

  render();

  // 加密文章解密后再渲染一次
  document.addEventListener('lwl:decrypted', render);
})();
