/* Talks to the sign-in service (service/worker.js). Shared by the admin and the guide. */
(function () {
  'use strict';
  var URL_LIVE = 'https://gyda-admin.gunnitynes.workers.dev';   // the service's address, filled in by service/setup.mjs
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var SALT = '4c7d0da5ec776ae1f37a188d62c85b31', ITER = 600000;
  // the password used before this service: its hash is public in the repository's history, so it can't be used again
  var OLD = { salt: '8fdbb42222829c551788c196403a9ecf', iter: 250000, hash: 'dbe7ed29e67c9794959b2cafd17216548fa1eae009cd794e2d4bf3195341aac1' };

  function stretch(pw, salt, iter) {
    var bytes = new Uint8Array(salt.match(/../g).map(function (x) { return parseInt(x, 16); }));
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations: iter }, k, 256);
    }).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  var memory = '';               // for browsers that don't let the page remember anything
  function token() { try { return localStorage.getItem('gyda.session') || memory; } catch (e) { return memory; } }
  function keep(t) {
    memory = t || '';
    try { if (t) localStorage.setItem('gyda.session', t); else localStorage.removeItem('gyda.session'); } catch (e) { /* private mode */ }
  }
  // the old key and password marks are not needed any more
  try { ['gyda.key', 'gyda.unlocked', 'gyda.guide'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* private mode */ }

  var S = window.SERVICE = {
    signedIn: function () { return !!token(); },
    forget: function () { keep(''); },
    call: function (method, path, body) {
      var url = LOCAL ? 'http://127.0.0.1:8787' : URL_LIVE;
      if (!url) return Promise.reject(new Error('The sign-in service is not connected yet.'));
      var h = {};
      if (token()) h.Authorization = 'Bearer ' + token();
      if (body !== undefined) h['Content-Type'] = 'application/json';
      return fetch(url + path, { method: method, headers: h, cache: 'no-store', body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
        .catch(function () { throw new Error('No connection. Check your internet and try again.'); })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok) return j;
            var e = new Error(j.error || ('The sign-in service said ' + r.status + '.'));
            e.status = r.status;
            throw e;
          });
        });
    },
    login: function (pw) {
      return stretch(pw, SALT, ITER).then(function (p) { return S.call('POST', '/login', { p: p }); }).then(function (j) { keep(j.token); });
    },
    setPassword: function (pw, code) {
      return stretch(pw, OLD.salt, OLD.iter).then(function (h) {
        if (h === OLD.hash) throw new Error('That is the old password. Please choose a new one.');
        return stretch(pw, SALT, ITER);
      }).then(function (p) { return S.call('POST', '/password', { p: p, code: code }); }).then(function (j) { keep(j.token); });
    },
    logout: function () {
      var done = function () { keep(''); };
      return S.call('POST', '/logout', {}).then(done, done);
    }
  };
})();
