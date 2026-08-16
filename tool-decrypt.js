/* ==========================================================================
   加密工具解锁（Web Crypto API，零依赖，AES-256-GCM）。
   和文章加密一致：PBKDF2(200000 轮) + AES-256-GCM；
   解密后的内容里可能包含 <style> / <script>，会先插入 HTML，
   再重建脚本标签执行（innerHTML 不会自动执行脚本）。
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('encrypted');
  if (!root) return;

  var form = document.getElementById('enc-form');
  var input = document.getElementById('enc-input');
  var error = document.getElementById('enc-error');
  var content = document.getElementById('enc-content');
  var prompt = document.getElementById('enc-prompt');

  function hexToBuf(h) {
    return new Uint8Array(h.match(/.{2}/g).map(function (b) { return parseInt(b, 16); }));
  }
  function b64ToBuf(b) {
    var s = atob(b);
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function decrypt(password) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('unsupported'));
    var salt = hexToBuf(root.dataset.salt);
    var iv = hexToBuf(root.dataset.iv);
    var cipher = b64ToBuf(root.dataset.cipher);
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (km) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' },
          km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
        );
      })
      .then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, key, cipher);
      })
      .then(function (pt) { return new TextDecoder().decode(pt); });
  }

  /** 把解密后的 HTML 拆成「无脚本 HTML」和「脚本标签列表」。 */
  function splitScripts(html) {
    var scripts = [];
    var clean = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (m, attrs, code) {
      scripts.push({ attrs: attrs.trim(), code: code });
      return '';
    });
    return { html: clean, scripts: scripts };
  }

  /** innerHTML 插入的脚本不会执行，这里重建标签逐个执行。 */
  function runScripts(container, scripts) {
    scripts.forEach(function (s) {
      var el = document.createElement('script');
      var srcMatch = s.attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      if (srcMatch) {
        el.src = srcMatch[1] || srcMatch[2] || srcMatch[3] || '';
      } else {
        el.text = s.code;
      }
      container.appendChild(el);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = input.value;
    error.hidden = true;
    decrypt(pw).then(function (payload) {
      input.value = '';
      error.hidden = true;
      var split = splitScripts(payload);
      content.innerHTML = split.html;
      content.hidden = false;
      prompt.hidden = true;
      runScripts(content, split.scripts);

      if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise([content]).catch(function () {});
      }
      document.dispatchEvent(new CustomEvent('lwl:decrypted'));
    }).catch(function (err) {
      if (err && err.message === 'unsupported') {
        error.textContent = '当前环境不支持 Web Crypto（需要 https 或 localhost）。';
      } else {
        error.textContent = '密码错误，请重试';
      }
      error.hidden = false;
      input.value = '';
      input.focus();
    });
  });
})();
