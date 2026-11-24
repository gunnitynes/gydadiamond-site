/* Opens the guide: guide.bin is encrypted with the admin password (AES-GCM, key from PBKDF2). */
(function () {
  'use strict';
  var SALT = 'c86a485a9e4c8e9c6d73cea768fa3aac';   // must match GUIDE_SALT in ../admin.js
  var $ = function (s) { return document.querySelector(s); };
  function bytes(h) { return new Uint8Array(h.match(/../g).map(function (x) { return parseInt(x, 16); })); }
  function hex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function derive(pw) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(SALT), iterations: 250000 }, k, 256);
    }).then(hex);
  }
  var file;
  function load() { return file || (file = fetch('guide.bin', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('load'); return r.arrayBuffer(); }).catch(function (e) { file = null; throw e; })); }
  function open(key) {
    return load().then(function (buf) {
      return crypto.subtle.importKey('raw', bytes(key), 'AES-GCM', false, ['decrypt']).then(function (k) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, k, new Uint8Array(buf, 12));
      });
    }).then(function (plain) {
      $('#lock').hidden = true;
      var g = $('#guide');
      g.innerHTML = '<a id="top"></a>' + new TextDecoder().decode(plain);
      g.hidden = false;
      jump();
    });
  }
  function jump() {
    var el = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (el) setTimeout(function () { el.scrollIntoView(); }, 60);
  }
  function ask() { $('#lock').hidden = false; $('#pw').focus(); }
  $('#f').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#err').textContent = 'One moment…';
    derive($('#pw').value).then(function (key) {
      return open(key).then(function () { try { localStorage.setItem('gyda.guide', key); } catch (x) { /* private mode */ } });
    }).catch(function (x) {
      $('#err').textContent = x && x.message === 'load' ? 'The guide could not be loaded. Check your internet and try again.' : 'Wrong password.';
      $('#pw').select();
    });
  });
  // pictures open large; a tap or Escape closes them
  document.addEventListener('click', function (e) {
    if (e.target.matches('#guide img')) { $('#zoom img').src = e.target.src; $('#zoom').hidden = false; }
    else if (e.target.closest('#zoom')) $('#zoom').hidden = true;
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('#zoom').hidden = true; });
  addEventListener('scroll', function () { $('#totop').hidden = scrollY < 700; }, { passive: true });
  addEventListener('hashchange', jump);
  var key = '';
  try { key = localStorage.getItem('gyda.guide') || ''; } catch (x) { /* ignore */ }
  if (/^[0-9a-f]{64}$/.test(key)) open(key).catch(ask); else ask();
})();
