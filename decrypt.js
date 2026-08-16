/* ==========================================================================
   加密文章解密（Web Crypto API，零依赖，AES-256-GCM）。
   密钥由用户输入的密码经 PBKDF2(200000 轮) 派生；
   GCM 认证：密码错误时 decrypt() 直接 reject，不存在「猜出明文」的可能。
   解密成功后注入内容并让 MathJax 重新排版公式。
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
    var salt = hexToBuf(root.dataset.salt);
    var iv = hexToBuf(root.dataset.iv);
    var cipher = b64ToBuf(root.dataset.cipher); // 密文尾部含 16 字节 GCM 认证标签
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = input.value;
    decrypt(pw).then(function (html) {
      input.value = '';
      error.hidden = true;
      content.innerHTML = html;
      content.hidden = false;
      prompt.hidden = true;
      if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise([content]).catch(function () {});
      }
      document.dispatchEvent(new CustomEvent('lwl:decrypted'));
    }).catch(function () {
      error.hidden = false;
      input.value = '';
      input.focus();
    });
  });
})();
