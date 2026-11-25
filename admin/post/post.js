/* Quick post: adds ONE news post or ONE show, from a phone. It signs in and publishes like the admin (../service.js).
   It only ever adds its own post to the newest version of the list, so it can't overwrite something else. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var KEYS = {
    news: ['date', 'title', 'text', 'image', 'link', 'link_label'],
    shows: ['date', 'venue', 'city', 'country', 'with', 'note', 'link', 'status', 'image']
  };
  var PAGE = { news: 'NEWS.html', shows: 'LIVE.html' };
  var kind = 'news';          // what is being written
  var item = null;            // the post in the preview
  var pic = null;             // { full: Blob, thumb: Blob, path, shas } of the news picture
  var posted = null;          // the last published post, for "Take it back"
  var past = [];              // earlier shows, for suggestions

  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ð/g, 'd').replace(/þ/g, 'th')
      .replace(/æ/g, 'ae').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'news';
  }
  function show(name) {
    all('main').forEach(function (m) { m.hidden = m.id !== name; });
    window.scrollTo(0, 0);
  }
  function err(where, msg) { $('#' + where + ' .err').textContent = msg || ''; }
  function field(k) { return $('#' + kind + ' [data-k="' + k + '"]'); }

  // ---------------------------------------------------------------- the draft stays on this phone until it is published
  function keep(name) { return 'gyda.post.' + name; }
  function readDraft(k) { try { return JSON.parse(localStorage.getItem(keep(k))) || null; } catch (e) { return null; } }
  function saveDraft() {
    var d = {};
    all('#' + kind + ' [data-k]').forEach(function (f) { d[f.getAttribute('data-k')] = f.value; });
    try { localStorage.setItem(keep(kind), JSON.stringify(d)); } catch (e) { /* not kept */ }
  }
  function written(k) {
    var d = readDraft(k);
    return !!d && Object.keys(d).some(function (x) { return x !== 'date' && d[x]; });
  }
  function store(mode) { // pictures are too big for localStorage
    return new Promise(function (res, rej) {
      var r = indexedDB.open('gyda-post', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('pics'); };
      r.onerror = function () { rej(r.error); };
      r.onsuccess = function () { res(r.result.transaction('pics', mode).objectStore('pics')); };
    });
  }
  function savePic() {
    return store('readwrite').then(function (s) { if (pic) s.put({ full: pic.full, thumb: pic.thumb, path: pic.path }, 'news'); else s.delete('news'); }).catch(function () { /* not kept */ });
  }
  function loadPic() {
    return store('readonly').then(function (s) {
      return new Promise(function (res) { var g = s.get('news'); g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); }; });
    }).catch(function () { return null; });
  }
  function clearDraft(k) {
    try { localStorage.removeItem(keep(k)); } catch (e) { /* ignore */ }
    if (k === 'news') { pic = null; showPic(); return savePic(); }
    return Promise.resolve();
  }

  // ---------------------------------------------------------------- home
  function home() {
    [['news', 'A headline, a text, a picture'], ['shows', 'A venue and a date']].forEach(function (x) {
      $('[data-go="' + x[0] + '"] span').textContent = written(x[0]) ? 'Continue where you stopped' : x[1];
    });
    if (!written('news')) loadPic().then(function (p) { if (p) $('[data-go="news"] span').textContent = 'Continue where you stopped'; });
    show('home');
  }
  function write(k) {
    kind = k;
    var d = readDraft(k) || {};
    all('#' + k + ' [data-k]').forEach(function (f) { f.value = d[f.getAttribute('data-k')] || ''; });
    if (k === 'news') {
      if (!field('date').value) field('date').value = today();
      linkLabel();
      if (!pic) loadPic().then(function (p) { if (p && !pic) { pic = p; showPic(); } });
    } else $('#shows details').open = !!(d.end || d.note);
    err(k);
    show(k);
  }
  function linkLabel() { $('#news .iflink').hidden = !$('#news [data-k="link"]').value.trim(); }

  // ---------------------------------------------------------------- the picture: the same sizes as the admin makes
  function copyOf(im, max) {
    var k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k);
    c.height = Math.round(im.naturalHeight * k);
    var g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(im, 0, 0, c.width, c.height);
    return new Promise(function (res, rej) { c.toBlob(function (b) { if (b) res(b); else rej(new Error('That picture could not be read.')); }, 'image/jpeg', 0.84); });
  }
  function takePic(file) {
    var url = URL.createObjectURL(file), im = new Image();
    err('news', 'Preparing the picture…');
    im.onload = function () {
      Promise.all([copyOf(im, 2000), copyOf(im, 720)]).then(function (b) {
        URL.revokeObjectURL(url);
        pic = { full: b[0], thumb: b[1], path: null };
        err('news');
        showPic();
        return savePic();
      }).catch(function (e) { err('news', e.message); });
    };
    im.onerror = function () { err('news', 'That picture could not be read. Try a JPG, or take a screenshot of it.'); };
    im.src = url;
  }
  function showPic() {
    var im = $('#news .pic img');
    if (im.src) URL.revokeObjectURL(im.src);
    im.hidden = !pic;
    if (pic) im.src = URL.createObjectURL(pic.full); else im.removeAttribute('src');
    $('#news .pick span').textContent = pic ? 'Change the picture' : '+ Add a picture';
    $('#news .nopic').hidden = !pic;
  }

  // ---------------------------------------------------------------- preview: the real page, with the new post in it
  function build() {
    var o = {}, v = function (k) { var f = field(k); return f ? f.value.trim() : ''; };
    KEYS[kind].forEach(function (k) { o[k] = v(k); });
    if (o.link && !/^[a-z]+:/i.test(o.link)) o.link = 'https://' + o.link;
    if (o.link && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(o.link)) throw new Error('That link doesn’t look right. Copy it again from the browser.');
    if (kind === 'news') {
      if (!o.title) throw new Error('Please write a headline.');
      if (!o.date) o.date = today();
      if (!o.link) o.link_label = '';
      if (pic) {
        if (!pic.path) pic.path = 'images/' + today().replace(/-/g, '') + '-' + slug(o.title) + '-' + Math.random().toString(36).slice(2, 6) + '.jpg';
        o.image = pic.path;
      }
    } else {
      if (!o.venue) throw new Error('Please write the venue.');
      if (!o.date) throw new Error('Please choose the date.');
      var end = v('end');
      if (end && end < o.date) throw new Error('The last day is before the first.');
      if (end && end > o.date) o.end = end;
    }
    return o;
  }
  var drafted = [];
  function undraft() { drafted.forEach(function (n) { try { localStorage.removeItem('gyda-draft:' + n); } catch (e) { /* ignore */ } }); drafted = []; }
  function preview() {
    try { item = build(); } catch (e) { return err(kind, e.message); }
    saveDraft();
    if (kind === 'news') savePic();
    var b = $('#' + kind + ' .big');
    b.disabled = true;
    err(kind, '');
    // no sign-in needed for this part: the published texts are public
    return fetch('../../data/' + kind + '.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () {
      throw new Error('No connection. Your text is kept; try again in a moment.');
    }).then(function (list) {
      var mine = JSON.parse(JSON.stringify(item)), f = $('#preview iframe');
      if (pic && mine.image === pic.path) mine.image = URL.createObjectURL(pic.full);
      localStorage.setItem('gyda-draft:' + kind, JSON.stringify([mine].concat(list)));
      drafted = [kind];
      f.onload = function () { if (f.src && f.src !== 'about:blank') find(f, 40); };
      f.src = '../../' + PAGE[kind] + '?preview=' + Date.now();
      err('preview', kind === 'shows' && (item.end || item.date) < today() ? 'This date has passed, so it goes under “Past”.' : '');
      show('preview');
    }).catch(function (e) { err(kind, e.message); }).then(function () { b.disabled = false; });
  }
  function find(f, tries) { // bring the new post into view
    var d = f.contentDocument, want = kind === 'news' ? item.title : item.venue, hit = null;
    if (!d) return;
    all('#app *', d).forEach(function (e) { if (!hit && e.offsetParent && e.textContent.trim().indexOf(want) === 0 && e.textContent.trim().length < want.length + 40) hit = e; });
    if (hit) {
      d.documentElement.style.scrollBehavior = 'auto';
      if (kind === 'shows' || hit.getBoundingClientRect().top > f.clientHeight - 40) hit.scrollIntoView({ block: 'center' });
    } else if (tries) setTimeout(function () { find(f, tries - 1); }, 150);
  }

  // ---------------------------------------------------------------- publish
  function b64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }
  function text(list) { return JSON.stringify(list, null, 1) + '\n'; }
  function at(list, it) { // where this exact post is in the list
    for (var i = 0; i < list.length; i++) if (Object.keys(it).every(function (k) { return (list[i][k] || '') === it[k]; })) return i;
    return -1;
  }
  // reads the newest list, changes it, and saves; if someone saved in between, it starts over with theirs
  function save(k, change, tries) {
    return SERVICE.call('GET', '/data').then(function (d) {
      var body = change(JSON.parse(d.files[k].text), d.files);
      if (!body) return;
      body.files = {}; body.files[k] = text(body.list); delete body.list;
      body.shas = {}; body.shas[k] = d.files[k].sha;
      return SERVICE.call('POST', '/publish', body);
    }).catch(function (e) {
      if (e.status === 409 && tries > 1) return save(k, change, tries - 1);
      throw e;
    });
  }
  function upload(p) {
    if (p.shas) return Promise.resolve(p.shas);
    var up = function (blob) { return b64(blob).then(function (c) { return SERVICE.call('POST', '/blob', { content: c, encoding: 'base64' }); }); };
    return up(p.full).then(function (a) { return up(p.thumb).then(function (b) { return (p.shas = [a.sha, b.sha]); }); });
  }
  function thumb(path) { return 'images/t/' + path.slice(7); }
  function publish() {
    var b = $('#publish'), k = kind, it = item, p = it.image && pic && pic.path === it.image ? pic : null;
    b.disabled = true;
    b.textContent = 'Publishing…';
    err('preview');
    return (p ? upload(p) : Promise.resolve(null)).then(function (shas) {
      return save(k, function (list) {
        if (at(list, it) >= 0) return null;         // an earlier try got through after all
        list.unshift(it);
        var adds = {};
        if (shas) { adds[it.image] = shas[0]; adds[thumb(it.image)] = shas[1]; }
        return { list: list, adds: adds };
      }, 3);
    }).then(function () {
      posted = { kind: k, item: it };
      undraft();
      clearDraft(k);
      done();
    }).catch(function (e) { failed('preview', e); }).then(function () { b.disabled = false; b.textContent = 'Publish'; });
  }
  function failed(where, e) {
    if (e.status === 401) { SERVICE.forget(); signin('Please sign in again. Your post is kept.', where); } else err(where, e.message);
  }
  function link(k) { return new URL('../../' + PAGE[k], location.href).href; }
  function done() {
    var k = posted.kind, mine = posted;
    $('#done h1').textContent = posted.item.title || posted.item.venue;
    $('#done .state').textContent = 'It is on its way to the website. That takes a minute or two.';
    $('#see').href = link(k);
    $('#share').hidden = !navigator.share;
    $('#undo').disabled = false;
    $('#undo').hidden = false;
    err('done');
    show('done');
    var end = Date.now() + 5 * 60e3;
    (function look() { // say so when it is really there
      if (posted !== mine || Date.now() > end) return;
      setTimeout(function () {
        if (posted !== mine) return;
        fetch('../../data/' + k + '.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (list) {
          if (posted !== mine) return;
          if (at(list, mine.item) >= 0) $('#done .state').textContent = 'It is on the website now.'; else look();
        }).catch(look);
      }, 5000);
    })();
  }
  function undo() {
    var it = posted.item, k = posted.kind;
    if (!confirm('Take “' + (it.title || it.venue) + '” off the website?')) return;
    var b = $('#undo');
    b.disabled = true;
    err('done');
    save(k, function (list, files) {
      var i = at(list, it);
      if (i < 0) throw new Error('It has been changed or removed since. Look in the admin.');
      list.splice(i, 1);
      var rest = text(list) + Object.keys(files).filter(function (n) { return n !== k; }).map(function (n) { return files[n].text; }).join('');
      return { list: list, dels: it.image && rest.indexOf('"' + it.image + '"') < 0 ? [it.image, thumb(it.image)] : [] };
    }, 3).then(function () {
      posted = null;
      b.hidden = true;
      $('#done .state').textContent = 'Taken back. It disappears from the website in a minute or two.';
    }).catch(function (e) { b.disabled = false; failed('done', e); });
  }

  // ---------------------------------------------------------------- sign in
  var after = 'home';
  function signin(msg, back) {
    after = back || 'home';
    err('signin', msg);
    $('#pass').value = '';
    show('signin');
  }
  $('#signin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('#signin .big');
    b.disabled = true;
    err('signin', 'One moment…');
    SERVICE.login($('#pass').value).then(function () {
      $('#pass').value = '';
      err('signin');
      if (after === 'home') home(); else { err(after); show(after); }
    }, function (x) { err('signin', x.message); $('#pass').select(); }).then(function () { b.disabled = false; });
  });

  // ---------------------------------------------------------------- buttons
  all('[data-go]').forEach(function (b) { b.addEventListener('click', function () { write(b.getAttribute('data-go')); }); });
  all('[data-back]').forEach(function (b) { b.addEventListener('click', home); });
  all('[data-clear]').forEach(function (b) {
    b.addEventListener('click', function () { if (confirm('Clear everything you wrote here?')) clearDraft(kind).then(function () { write(kind); }); });
  });
  $('[data-home]').addEventListener('click', function () { posted = null; home(); });
  $('[data-edit]').addEventListener('click', function () { undraft(); $('#preview iframe').src = 'about:blank'; show(kind); });
  ['news', 'shows'].forEach(function (k) {
    $('#' + k + ' form').addEventListener('submit', function (e) { e.preventDefault(); preview(); });
    $('#' + k + ' form').addEventListener('input', function (e) { if (e.target.hasAttribute('data-k')) saveDraft(); if (k === 'news') linkLabel(); err(k); });
  });
  $('#news .pick input').addEventListener('change', function (e) { if (e.target.files[0]) takePic(e.target.files[0]); e.target.value = ''; });
  $('#news .nopic').addEventListener('click', function () { pic = null; showPic(); savePic(); });
  $('#publish').addEventListener('click', publish);
  $('#undo').addEventListener('click', undo);
  $('#share').addEventListener('click', function () { if (posted) navigator.share({ title: posted.item.title || posted.item.venue, url: link(posted.kind) }).catch(function () { /* closed */ }); });

  // suggestions from earlier shows; choosing a known venue fills in its city
  fetch('../../data/shows.json').then(function (r) { return r.json(); }).then(function (list) {
    past = list;
    [['venues', 'venue'], ['cities', 'city'], ['countries', 'country'], ['withs', 'with']].forEach(function (x) {
      var seen = {};
      list.forEach(function (s) { if (s[x[1]] && !seen[s[x[1]]]) { seen[s[x[1]]] = 1; var o = document.createElement('option'); o.value = s[x[1]]; $('#' + x[0]).appendChild(o); } });
    });
  }).catch(function () { /* no suggestions then */ });
  function fill(from, to) {
    $('#shows [data-k="' + from + '"]').addEventListener('change', function (e) {
      var v = e.target.value.trim().toLowerCase(), s = past.filter(function (x) { return v && String(x[from]).toLowerCase() === v; })[0];
      if (!s) return;
      to.forEach(function (k) { var f = $('#shows [data-k="' + k + '"]'); if (!f.value) f.value = s[k] || ''; });
      saveDraft();
    });
  }
  fill('venue', ['city', 'country']);
  fill('city', ['country']);

  undraft();
  if (SERVICE.signedIn()) home(); else signin();
})();
