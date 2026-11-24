/* Opens the guide for anyone signed in to the admin; everyone else is asked for the admin password.
   guide.bin = iv (12 bytes) + AES-GCM data. Its key comes from the sign-in service (service/worker.js). */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  function bytes(h) { return new Uint8Array(h.match(/../g).map(function (x) { return parseInt(x, 16); })); }
  var file;
  function load() { return file || (file = fetch('guide.bin', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('load'); return r.arrayBuffer(); }).catch(function (e) { file = null; throw e; })); }
  function open() {
    return Promise.all([SERVICE.call('GET', '/guide-key'), load()]).then(function (r) {
      return crypto.subtle.importKey('raw', bytes(r[0].key), 'AES-GCM', false, ['decrypt']).then(function (k) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(r[1], 0, 12) }, k, new Uint8Array(r[1], 12));
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
  function why(x) {
    if (x.status === 401) { SERVICE.forget(); return ''; }
    return x.message === 'load' ? 'The guide could not be loaded. Check your internet and try again.' : x.message || 'The guide could not be opened. Tell Gunnar.';
  }
  $('#f').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#err').textContent = 'One moment…';
    SERVICE.login($('#pw').value).then(open).catch(function (x) { $('#err').textContent = why(x); $('#pw').select(); });
  });
  // pictures open large; a tap or Escape closes them
  document.addEventListener('click', function (e) {
    if (e.target.matches('#guide img')) { $('#zoom img').src = e.target.src; $('#zoom').hidden = false; }
    else if (e.target.closest('#zoom')) $('#zoom').hidden = true;
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('#zoom').hidden = true; });
  addEventListener('scroll', function () { $('#totop').hidden = scrollY < 700; }, { passive: true });
  addEventListener('hashchange', jump);
  if (SERVICE.signedIn()) open().catch(function (x) { ask(); $('#err').textContent = why(x); }); else ask();
})();
