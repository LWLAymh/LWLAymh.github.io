/* Keep source and retry controls available when the CDN or a diagram fails. */
(function () {
  'use strict';
  var records = [], library = null, running = false, requested = false, serial = 0;
  function load() {
    if (window.mermaid) return Promise.resolve();
    if (!library) library = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      script.onload = function () { if (window.mermaid) resolve(); else reject(new Error('mermaid unavailable')); };
      script.onerror = function () { script.remove(); reject(new Error('mermaid download')); };
      document.head.appendChild(script);
    }).catch(function (error) { library = null; throw error; });
    return library;
  }
  function collect() {
    document.querySelectorAll('pre code.language-mermaid').forEach(function (code) {
      if (code.closest('.mermaid-source')) return;
      var pre = code.parentNode;
      var original = pre.parentNode.classList.contains('code-block') ? pre.parentNode : pre;
      var container = document.createElement('div'); container.className = 'mermaid-block';
      var diagram = document.createElement('div'); diagram.id = 'blog-diagram-' + (++serial); diagram.className = 'mermaid';
      var source = document.createElement('details'); source.className = 'mermaid-source'; source.open = true;
      var summary = document.createElement('summary'); summary.textContent = '图表源码'; source.appendChild(summary);
      var status = document.createElement('p'); status.className = 'mermaid-status'; status.setAttribute('role', 'status');
      var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试图表'; retry.hidden = true;
      retry.addEventListener('click', render);
      original.parentNode.insertBefore(container, original);
      source.appendChild(original);
      container.appendChild(diagram); container.appendChild(status); container.appendChild(retry); container.appendChild(source);
      records.push({ diagram: diagram, source: source, text: code.textContent, status: status, retry: retry });
    });
  }
  function failed(record, message) {
    record.diagram.hidden = true; record.source.open = true;
    record.status.textContent = message; record.retry.hidden = false;
  }
  async function render() {
    collect();
    if (!records.length) return;
    if (running) { requested = true; return; }
    running = true;
    do {
      requested = false;
      records.forEach(function (r) { r.retry.hidden = true; r.status.textContent = '正在绘制图表…'; });
      try {
        await load();
        window.mermaid.initialize({ startOnLoad: false, theme: document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'default' });
        for (var record of records) {
          record.diagram.hidden = false;
          record.diagram.removeAttribute('data-processed');
          record.diagram.textContent = record.text;
          try {
            await window.mermaid.run({ querySelector: '#' + record.diagram.id });
            record.status.textContent = ''; record.source.open = false;
          } catch (error) { failed(record, '图表渲染失败，源码已保留。'); }
        }
      } catch (error) { records.forEach(function (r) { failed(r, '图表加载失败，源码已保留，请重试。'); }); }
      document.dispatchEvent(new CustomEvent('lwl:content-resized'));
    } while (requested);
    running = false;
  }
  render();
  document.addEventListener('lwl:decrypted', render);
  document.addEventListener('themechange', render);
})();
