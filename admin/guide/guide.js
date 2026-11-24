/* Opens the guide for anyone signed in to the admin in this browser; everyone else is asked for the admin password.
   guide.bin = salt (16 bytes, the admin password's) + iv (12) + AES-GCM data. Its key comes from the admin password's
   hash, which the admin keeps in localStorage as gyda.unlocked. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  function hex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  var file;
  function load() { return file || (file = fetch('guide.bin', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('load'); return r.arrayBuffer(); }).catch(function (e) { file = null; throw e; })); }
  function hashOf(pw) {
    return load().then(function (buf) {
      return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
        return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(buf, 0, 16), iterations: 250000 }, k, 256);
      });
    }).then(hex);
  }
  function open(hash) {
    return load().then(function (buf) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode('guide:' + hash)).then(function (raw) {
        return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      }).then(function (k) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 16, 12) }, k, new Uint8Array(buf, 28));
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
    hashOf($('#pw').value).then(function (hash) {
      return open(hash).then(function () { try { localStorage.setItem('gyda.unlocked', hash); } catch (x) { /* private mode */ } });
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
  var hash = '';
  try { localStorage.removeItem('gyda.guide'); hash = localStorage.getItem('gyda.unlocked') || ''; } catch (x) { /* ignore */ }
  if (/^[0-9a-f]{64}$/.test(hash)) open(hash).catch(function (x) {
    ask();
    if (x && x.message === 'load') $('#err').textContent = 'The guide could not be loaded. Check your internet and reload the page.';
  }); else ask();
})();
