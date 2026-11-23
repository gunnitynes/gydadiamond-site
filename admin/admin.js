/* Admin for gydadiamond.net.
   Everything the site shows from data/*.json is edited here. "Publish" makes ONE commit to the GitHub
   repository (through the GitHub API, with the key pasted at sign-in); GitHub Pages puts it live
   about a minute later. New pictures are resized in the browser before upload; press photos also keep
   the full-size original for download. */
(function () {
  'use strict';

  // ---- where the site lives on GitHub
  var REPO = { owner: 'gunnitynes', name: 'gydadiamond-site', branch: 'main' };
  // admin password: only a salted PBKDF2 hash is stored here, never the password itself
  // (to change it: python3 tools/set_admin_password.py)
  var PASS = { salt: '8fdbb42222829c551788c196403a9ecf', iter: 250000, hash: 'dbe7ed29e67c9794959b2cafd17216548fa1eae009cd794e2d4bf3195341aac1' };
  var FILES = ['site', 'about', 'work', 'news', 'shows', 'films', 'photos'];
  var API = 'https://api.github.com/repos/' + REPO.owner + '/' + REPO.name;
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  var token = '';
  var offline = false;          // local test mode: reads ../data, never writes
  var D = {};                   // current data, per file
  var orig = {};                // published text, per file
  var sha = {};                 // blob sha of each published file
  var cal = [];                 // data/calendar.json (written by the calendar sync, read-only here)
  var uploads = {};             // repo path -> { blob, url }
  var removals = {};            // repo path -> true
  var tab = 'front';
  var sel = {};                 // selected item per tab
  var $ = function (s, r) { return (r || document).querySelector(s); };

  // ------------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function text(name) { return JSON.stringify(D[name], null, 1) + '\n'; }
  function changed(name) { return D[name] !== undefined && text(name) !== orig[name]; }
  function changes() {
    var n = FILES.filter(changed).length;
    return n + Object.keys(uploads).length + Object.keys(removals).length;
  }
  function img(path) { return !path ? '' : uploads[path] ? uploads[path].url : /^https?:|^blob:/.test(path) ? path : '../' + path; }
  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, bad ? 7000 : 3500);
  }
  function slug(s) {
    return String(s || 'image').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
      .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  }
  function stamp() { var d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fmt(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return +p[2] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + p[0];
  }
  function uniquePath(dir, base, ext) {
    var p = dir + '/' + stamp() + '-' + base + '.' + ext, i = 2;
    while (uploads[p]) p = dir + '/' + stamp() + '-' + base + '-' + (i++) + '.' + ext;
    return p;
  }

  // ------------------------------------------------------------------ GitHub
  function gh(path, opts) {
    opts = opts || {};
    return fetch(path.indexOf('http') === 0 ? path : API + path, {
      method: opts.method || 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ('GitHub said ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function b64ToText(b64) {
    var bin = atob(b64.replace(/\n/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }
  function getFile(name) {
    if (offline) {
      return fetch('../data/' + name + '.json', { cache: 'no-store' }).then(function (r) {
        return r.ok ? r.text() : null;
      }).then(function (t) { return t == null ? null : { text: t, sha: 'local' }; });
    }
    return gh('/contents/data/' + name + '.json?ref=' + REPO.branch).then(function (j) {
      return { text: b64ToText(j.content), sha: j.sha };
    }, function (e) { if (e.status === 404) return null; throw e; });
  }

  function loadAll() {
    $('#status').textContent = 'Loading…';
    return Promise.all(FILES.concat(['calendar']).map(getFile)).then(function (res) {
      FILES.forEach(function (n, i) {
        var r = res[i] || { text: n === 'site' ? '{}\n' : '[]\n', sha: null };
        orig[n] = r.text;
        sha[n] = r.sha;
        D[n] = JSON.parse(r.text);
        orig[n] = text(n); // normalise formatting so "changed" only means real edits
      });
      var c = res[FILES.length];
      try { cal = c ? JSON.parse(c.text) : []; } catch (e) { cal = []; }
      uploads = {};
      removals = {};
      render();
    });
  }

  // ------------------------------------------------------------------ images
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Could not read ' + file.name + ' as a picture. Use JPG or PNG.')); };
      im.src = url;
    });
  }
  // a web-sized JPEG (max 2000px), like every picture already on the site
  function webCopy(file, max) {
    max = max || 2000;
    return loadImage(file).then(function (im) {
      var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      var g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      return new Promise(function (res) {
        c.toBlob(function (b) { res({ blob: b, width: w, height: h }); }, 'image/jpeg', 0.84);
      });
    });
  }
  function addUpload(path, blob) {
    uploads[path] = { blob: blob, url: URL.createObjectURL(blob) };
    delete removals[path];
    return path;
  }
  function pickFiles(multiple) {
    return new Promise(function (res) {
      var i = document.createElement('input');
      i.type = 'file';
      i.accept = 'image/jpeg,image/png,image/webp,image/heic';
      i.multiple = !!multiple;
      i.onchange = function () { res(Array.prototype.slice.call(i.files)); };
      i.click();
    });
  }
  function uploadWebImage(file, base) {
    return webCopy(file).then(function (r) {
      return withThumb(file, addUpload(uniquePath('images', slug(base || file.name), 'jpg'), r.blob));
    });
  }
  // the small preview the site's grids use (images/t/<same name>.jpg, 720px)
  function thumbPath(path) { return 'images/t/' + path.slice(7).replace(/\.[a-z]+$/i, '.jpg'); }
  function withThumb(file, path) {
    return webCopy(file, 720).then(function (t) { addUpload(thumbPath(path), t.blob); return path; });
  }
  // a file is only deleted if nothing in the data still points at it
  function used(path) {
    var all = FILES.map(text).join('\n');
    return all.indexOf('"' + path + '"') >= 0;
  }
  function dropFile(path) {
    if (!path || used(path)) return;
    if (/^images\/[^/]+$/.test(path)) dropFile(thumbPath(path));
    if (uploads[path]) { URL.revokeObjectURL(uploads[path].url); delete uploads[path]; return; }
    if (/^(images|press)\//.test(path)) removals[path] = true;
  }

  // email addresses are saved scrambled so bots reading the website can't harvest them (see js/app.js unmail)
  function encMail(v) {
    v = String(v || '').trim();
    return v ? 'enc:' + btoa(unescape(encodeURIComponent(v.split('').reverse().join('')))) : '';
  }
  function decMail(v) {
    v = String(v || '');
    if (v.indexOf('enc:') !== 0) return v;
    try { return decodeURIComponent(escape(atob(v.slice(4)))).split('').reverse().join(''); } catch (e) { return ''; }
  }

  // ------------------------------------------------------------------ form building
  // fields: [{k, label, type, help, wide, options, placeholder}]
  function fieldsHTML(obj, fields) {
    return '<div class="fields">' + fields.map(function (f) {
      var v = obj[f.k] == null ? '' : obj[f.k];
      if (f.type === 'email') v = decMail(v);
      var id = 'f-' + f.k;
      var inner;
      if (f.type === 'textarea') inner = '<textarea id="' + id + '" data-k="' + f.k + '" class="' + (f.tall ? 'tall' : '') + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
      else if (f.type === 'select') inner = '<select id="' + id + '" data-k="' + f.k + '">' + f.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
      else if (f.type === 'check') return '<label class="check f' + (f.wide ? ' wide' : '') + '"><input type="checkbox" data-k="' + f.k + '"' + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
      else if (f.type === 'image') {
        return '<div class="f' + (f.wide ? ' wide' : '') + '"><span>' + esc(f.label) + '</span><div class="imgfield"><div class="thumb">' +
          (v ? '<img src="' + esc(img(v)) + '" alt="">' : 'No picture') + '</div><div class="btns">' +
          '<button class="btn small" type="button" data-img="' + f.k + '">' + (v ? 'Change picture' : 'Add picture') + '</button>' +
          (v ? '<button class="btn small" type="button" data-noimg="' + f.k + '">Remove</button>' : '') + '</div></div>' +
          (f.help ? '<em>' + f.help + '</em>' : '') + '</div>';
      } else inner = '<input id="' + id + '" type="' + (f.type || 'text') + '" data-k="' + f.k + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '"' + (f.list ? ' list="' + f.list + '"' : '') + (f.type === 'email' ? ' data-enc' : '') + '>';
      return '<label class="f' + (f.wide ? ' wide' : '') + '" for="' + id + '"><span>' + esc(f.label) + '</span>' + inner + (f.help ? '<em>' + f.help + '</em>' : '') + '</label>';
    }).join('') + '</div>';
  }
  // live-bind inputs inside `root` to `obj`; `after` runs after each change
  function bind(root, obj, after) {
    root.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k');
      if (!k || e.target.closest('[data-row]')) return;
      obj[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.hasAttribute('data-enc') ? encMail(e.target.value) : e.target.value;
      if (e.target.type === 'checkbox' && !obj[k]) delete obj[k];
      dirty();
      if (after) after(k, e);
    });
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-img]'), nb = e.target.closest('[data-noimg]');
      if (b) {
        var k = b.getAttribute('data-img');
        pickFiles(false).then(function (fs) {
          if (!fs.length) return;
          b.disabled = true;
          b.textContent = 'Preparing…';
          var old = obj[k];
          return uploadWebImage(fs[0], obj.title || obj.venue || fs[0].name).then(function (p) {
            obj[k] = p;
            dropFile(old);
            dirty();
            render();
          });
        }).catch(function (err) { toast(err.message, true); render(); });
      }
      if (nb) {
        var key = nb.getAttribute('data-noimg'), was = obj[key];
        obj[key] = '';
        dropFile(was);
        dirty();
        render();
      }
    });
  }

  // ------------------------------------------------------------------ list + editor (news, shows, films)
  function listTab(o) {
    // o: {name, title, intro, items(), group(item), label(item), sub(item), thumb(item), fields, blank(), sort(list), orderable, extraTop}
    var list = D[o.name];
    var cur = sel[o.name];
    if (cur != null && list.indexOf(cur) < 0) cur = sel[o.name] = null;
    var q = (sel[o.name + ':q'] || '').toLowerCase();
    var shown = o.items ? o.items() : list.map(function (it) { return { it: it }; });
    if (q) shown = shown.filter(function (x) { return JSON.stringify(x.it).toLowerCase().indexOf(q) >= 0; });
    var html = '<div class="tab-head"><div><h1>' + o.title + '</h1><p>' + o.intro + '</p></div><div class="acts">' +
      '<button class="btn solid" data-act="add">+ ' + o.addLabel + '</button></div></div>' + (o.extraTop ? o.extraTop() : '') +
      '<div class="split"><div><input type="search" class="search" placeholder="Search…" value="' + esc(sel[o.name + ':q'] || '') + '"><div class="list">';
    var lastGroup = null, roList = shown.filter(function (x) { return x.readonly; });
    shown.forEach(function (x) {
      var g = o.group ? o.group(x.it, x) : null;
      if (g !== lastGroup && g) { html += '<div class="group">' + esc(g) + '</div>'; lastGroup = g; }
      var th = o.thumb ? o.thumb(x.it) : null;
      var idx = list.indexOf(x.it);
      html += '<button class="item' + (o.thumb ? '' : ' noimg') + (x.it.hidden ? ' off' : '') + '" data-i="' + idx + '"' +
        (x.it === cur ? ' aria-current="true"' : '') + (x.readonly ? ' data-ro="' + roList.indexOf(x) + '"' : '') + '>' +
        (o.thumb ? (th ? '<img src="' + esc(img(th)) + '" alt="" loading="lazy">' : '<span class="ph"></span>') : '') +
        '<span><b>' + esc(o.label(x.it) || '(untitled)') + '</b><small>' + (x.readonly ? '<span class="badge">From calendar · </span>' : '') +
        esc(o.sub(x.it)) + '</small></span></button>';
    });
    if (!shown.length) html += '<p class="muted">' + (q ? 'Nothing matches.' : 'Nothing here yet.') + '</p>';
    html += '</div></div><div class="editor">';
    if (cur) {
      var i = list.indexOf(cur);
      html += '<div class="ed-head"><h2>' + esc(o.label(cur) || 'New') + '</h2><div class="acts">' +
        (o.orderable ? '<button class="btn small" data-act="up"' + (i === 0 ? ' disabled' : '') + '>↑ Up</button><button class="btn small" data-act="down"' + (i === list.length - 1 ? ' disabled' : '') + '>↓ Down</button>' : '') +
        '<button class="btn small danger" data-act="del">Delete</button></div></div>' + fieldsHTML(cur, o.fields(cur)) +
        (o.foot ? o.foot(cur) : '');
    } else if (sel[o.name + ':ro']) {
      var r = sel[o.name + ':ro'];
      html += '<div class="ed-head"><h2>' + esc(r.venue) + '</h2></div><p class="info">This show comes from the calendar, so change it in the calendar itself. ' +
        'The website picks up calendar changes once a day, or straight away with “Sync now”.</p><p>' + esc(fmt(r.date)) + ' · ' + esc([r.city, r.country].filter(Boolean).join(', ')) +
        (r.note ? '<br>' + esc(r.note) : '') + (r.link ? '<br><a href="' + esc(r.link) + '" target="_blank">' + esc(r.link) + '</a>' : '') + '</p>';
    } else html += '<p class="blank">Choose something on the left to edit it,<br>or press “+ ' + o.addLabel + '”.</p>';
    html += '</div></div>';
    var p = $('#panel');
    p.innerHTML = html;
    if (cur) bind($('.editor', p), cur, function (k) {
      if (k === (o.titleKey || 'title')) $('.ed-head h2', p).textContent = o.label(cur) || 'New';
      var b = $('.item[aria-current="true"]', p);
      if (b) { $('b', b).textContent = o.label(cur) || '(untitled)'; $('small', b).textContent = o.sub(cur); }
    });
    $('.search', p).addEventListener('input', function (e) {
      sel[o.name + ':q'] = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var s = $('.search');
      s.focus();
      s.setSelectionRange(pos, pos);
    });
    p.addEventListener('click', function (e) {
      var it = e.target.closest('.item');
      if (it) {
        if (it.hasAttribute('data-ro')) {
          sel[o.name] = null;
          sel[o.name + ':ro'] = roList[+it.getAttribute('data-ro')].it;
        } else { sel[o.name] = list[+it.getAttribute('data-i')]; sel[o.name + ':ro'] = null; }
        render();
        if (window.innerWidth < 860) $('.editor').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'add') {
        var n = o.blank();
        if (o.addAtEnd) list.push(n); else list.unshift(n);
        sel[o.name] = n;
        sel[o.name + ':q'] = '';
        dirty();
        render();
        var first = $('.editor input, .editor textarea');
        if (first) first.focus();
      }
      if (act === 'del' && cur && confirm('Delete “' + (o.label(cur) || 'this') + '”?')) {
        list.splice(list.indexOf(cur), 1);
        o.fields(cur).forEach(function (f) { if (f.type === 'image') dropFile(cur[f.k]); });
        if (o.onDelete) o.onDelete(cur);
        sel[o.name] = null;
        dirty();
        render();
      }
      if (act === 'up' || act === 'down') {
        var i = list.indexOf(cur), j = act === 'up' ? i - 1 : i + 1;
        list.splice(i, 1);
        list.splice(j, 0, cur);
        dirty();
        render();
      }
      if (o.onAct) o.onAct(act, a);
    });
    // a new date can move the item in the list
    if (cur) $('.editor').addEventListener('change', function (e) {
      if (/^(date|end|category|section)$/.test(e.target.getAttribute('data-k') || '')) render();
    });
  }

  // ------------------------------------------------------------------ tabs
  var TABS = {};

  TABS.news = function () {
    listTab({
      name: 'news', title: 'News', addLabel: 'New post',
      intro: 'Newest posts appear first on the News page. Write the text as you would an email: leave an empty line between paragraphs, and links become clickable by themselves.',
      items: function () {
        return D.news.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (it) { return { it: it }; });
      },
      label: function (p) { return p.title; },
      sub: function (p) { return fmt(p.date) + (p.hidden ? ' · hidden' : ''); },
      thumb: function (p) { return p.image; },
      blank: function () { return { date: todayISO(), title: '', text: '', image: '', link: '', link_label: '' }; },
      fields: function () {
        return [
          { k: 'title', label: 'Headline', wide: true },
          { k: 'date', label: 'Date', type: 'date' },
          { k: 'hidden', label: 'Hide this post', type: 'check' },
          { k: 'text', label: 'Text', type: 'textarea', tall: true, wide: true, help: 'Empty line = new paragraph. **bold** and *italic* work.' },
          { k: 'image', label: 'Picture', type: 'image', wide: true },
          { k: 'link', label: 'Button link (optional)', type: 'url', placeholder: 'https://…' },
          { k: 'link_label', label: 'Button text', placeholder: 'e.g. Listen on Bandcamp' }
        ];
      }
    });
  };

  TABS.live = function () {
    var today = todayISO();
    var calSeen = {};
    D.shows.forEach(function (s) { calSeen[s.date + '|' + String(s.venue).toLowerCase()] = 1; });
    var fromCal = cal.filter(function (s) { return !calSeen[s.date + '|' + String(s.venue).toLowerCase()]; });
    listTab({
      name: 'shows', title: 'Live', addLabel: 'Add a show', titleKey: 'venue',
      intro: 'Shows move from “Upcoming” to “Past” by themselves the day after they happen — nothing to tidy up. The next show also appears on the front page.',
      extraTop: function () {
        var url = D.site.calendar_ics || '';
        return '<div class="card"><h3>Calendar sync <span class="muted" style="font-size:14px">· optional</span></h3>' +
          '<p>Put shows in a Google Calendar from your phone instead of typing them here. The website reads the calendar every morning; “Sync now” reads it straight away.</p>' +
          '<details' + (url ? '' : ' open') + '><summary class="muted" style="cursor:pointer;margin-bottom:10px">How to set it up</summary><div class="info"><ol>' +
          '<li>In Google Calendar on a computer, make a new calendar called <b>Gyða – shows</b>.</li>' +
          '<li>In its settings, tick <b>Make available to public</b>, then copy the <b>Public address in iCal format</b> (ends in <code>.ics</code>).</li>' +
          '<li>Paste it below and press Publish.</li>' +
          '<li>Each show is one all-day event. <b>Title</b> = venue (add “with múm” etc. in brackets, e.g. <i>Harpa (with múm)</i>). <b>Location</b> = city, country. Put the ticket link in the <b>description</b>. Write CANCELLED in the title if a show is cancelled.</li></ol></div></details>' +
          '<label class="f"><span>Calendar address (iCal)</span><input type="url" id="ics" value="' + esc(url) + '" placeholder="https://calendar.google.com/calendar/ical/…/public/basic.ics"></label>' +
          '<p style="margin:12px 0 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn small" data-act="sync"' + (url && !changed('site') ? '' : ' disabled') + '>Sync now</button>' +
          '<span class="muted">' + (cal.length ? cal.length + ' show' + (cal.length === 1 ? '' : 's') + ' from the calendar right now.' : url ? 'No shows found in the calendar yet.' : '') +
          (url && changed('site') ? ' Publish first, then sync.' : '') + '</span></p></div>';
      },
      items: function () {
        var all = D.shows.map(function (it) { return { it: it }; }).concat(fromCal.map(function (it) { return { it: it, readonly: true }; }));
        var up = all.filter(function (x) { return (x.it.end || x.it.date) >= today; }).sort(function (a, b) { return a.it.date < b.it.date ? -1 : 1; });
        var past = all.filter(function (x) { return (x.it.end || x.it.date) < today; }).sort(function (a, b) { return a.it.date < b.it.date ? 1 : -1; });
        up.forEach(function (x) { x.g = 'Upcoming'; });
        past.forEach(function (x) { x.g = 'Past · ' + x.it.date.slice(0, 4); });
        return up.concat(past);
      },
      group: function (it, x) { return x.g; },
      label: function (s) { return s.venue; },
      sub: function (s) { return fmt(s.date) + (s.city ? ' · ' + s.city : '') + (s.with ? ' · with ' + s.with : '') + (s.status === 'cancelled' ? ' · CANCELLED' : s.status === 'soldout' ? ' · sold out' : ''); },
      blank: function () { return { date: today, venue: '', city: '', country: '', with: '', note: '', link: '', status: '', image: '' }; },
      fields: function () {
        return [
          { k: 'venue', label: 'Venue or festival', wide: true, placeholder: 'e.g. Harpa, Eldborg' },
          { k: 'date', label: 'Date', type: 'date' },
          { k: 'end', label: 'Last day (festivals only)', type: 'date' },
          { k: 'city', label: 'City', placeholder: 'Reykjavík' },
          { k: 'country', label: 'Country', placeholder: 'IS' },
          { k: 'with', label: 'With', placeholder: 'e.g. múm', help: 'Shown as “with …”. Leave empty for solo shows.' },
          { k: 'note', label: 'Note', placeholder: 'e.g. + solo set, Ox release concert' },
          { k: 'link', label: 'Tickets or info link', type: 'url', placeholder: 'https://…' },
          { k: 'status', label: 'Status', type: 'select', options: [['', 'On'], ['soldout', 'Sold out'], ['cancelled', 'Cancelled']] },
          { k: 'image', label: 'Poster (optional)', type: 'image', wide: true },
          { k: 'hidden', label: 'Hide this show', type: 'check' }
        ];
      },
      onAct: function (act) {
        if (act === 'sync') {
          if (offline) return toast('Sync only works on the real site.');
          gh('/actions/workflows/sync-calendar.yml/dispatches', { method: 'POST', body: { ref: REPO.branch } }).then(function () {
            toast('Syncing the calendar… the shows appear on the site in a couple of minutes.');
          }, function (e) { toast('Could not start the sync: ' + e.message, true); });
        }
      }
    });
    var ics = $('#ics');
    if (ics) ics.addEventListener('input', function () { D.site.calendar_ics = ics.value.trim(); dirty(); });
  };

  TABS.work = function () {
    listTab({
      name: 'work', title: 'Work', addLabel: 'Add', orderable: true, addAtEnd: false,
      intro: 'Albums appear as big covers, “More work” as smaller tiles. Use ↑ ↓ to change the order.',
      items: function () {
        return D.work.filter(function (w) { return w.section !== 'More'; }).concat(D.work.filter(function (w) { return w.section === 'More'; }))
          .map(function (it) { return { it: it }; });
      },
      group: function (w) { return w.section === 'More' ? 'More work' : 'Albums'; },
      label: function (w) { return w.title; },
      sub: function (w) { return [w.year, w.kind].filter(Boolean).join(' · ') + (w.hidden ? ' · hidden' : ''); },
      thumb: function (w) { return w.image; },
      blank: function () { return { section: 'Albums', title: '', year: String(new Date().getFullYear()), kind: 'Album', image: '', text: '', page: '', listen: '', listen_label: '' }; },
      fields: function () {
        return [
          { k: 'title', label: 'Title', wide: true },
          { k: 'section', label: 'Where', type: 'select', options: [['Albums', 'Albums (big cover)'], ['More', 'More work (small tile)']], key: 'category' },
          { k: 'year', label: 'Year' },
          { k: 'kind', label: 'Small label', placeholder: 'Album, EP, Soundtrack…' },
          { k: 'image', label: 'Cover', type: 'image', wide: true },
          { k: 'text', label: 'One or two sentences', type: 'textarea', wide: true },
          { k: 'listen', label: 'Listen link', type: 'url', placeholder: 'Bandcamp, Spotify…' },
          { k: 'listen_label', label: 'Listen link name', placeholder: 'Bandcamp' },
          { k: 'page', label: 'Page on this site (optional)', placeholder: 'e.g. Ox', help: 'The page that “About the album →” opens. A full web address also works.' },
          { k: 'hidden', label: 'Hide this one', type: 'check' },
          { k: 'story', label: 'Album page: the story', type: 'textarea', tall: true, wide: true, help: 'Shown next to the cover on the album page. Empty line = new paragraph.' },
          { k: 'tracks_label', label: 'Album page: heading for the list', placeholder: 'Tracks' },
          { k: 'background', label: 'Album page: faint background picture', type: 'image' },
          { k: 'tracks', label: 'Album page: tracks', type: 'textarea', wide: true, help: 'One per line. To link a track to a video: Title | https://…' },
          { k: 'credits', label: 'Album page: credits', type: 'textarea', wide: true, help: 'One per line.' },
          { k: 'quotes', label: 'Album page: press quotes', type: 'textarea', wide: true, help: 'One quote per paragraph; put the source on its own last line starting with — (e.g. — Reykjavík Grapevine).' },
          { k: 'awards', label: 'Album page: awards', type: 'textarea', wide: true, help: 'One per line: Prize — what (e.g. Icelandic Music Awards — Album of the Year).' },
          { k: 'more_links', label: 'Album page: extra buttons', type: 'textarea', wide: true, help: 'One per line: Label | https://…' }
        ];
      }
    });
  };

  TABS.about = function () {
    var a = D.about;
    var p = $('#panel');
    p.innerHTML = '<div class="tab-head"><div><h1>About</h1><p>The About page and the Full bio page. Write as plain text: an empty line starts a new paragraph, ' +
      'and a line with just ◆ makes a small diamond divider. The first paragraph of About is shown larger.</p></div></div>' +
      '<div class="card" id="aboutf">' + fieldsHTML(a, [
        { k: 'photo', label: 'About: photo', type: 'image', wide: true },
        { k: 'text', label: 'About: text', type: 'textarea', tall: true, wide: true },
        { k: 'bio_photo', label: 'Full bio: photo', type: 'image', wide: true },
        { k: 'bio', label: 'Full bio: text', type: 'textarea', tall: true, wide: true,
          help: 'Start each section with ## and its name (e.g. ## Education). Under it, one item per line; “Title — 2021” puts the year on the right. A section with one long line shows as a paragraph.' }
      ]) + '</div>';
    bind($('#aboutf', p), a);
  };

  TABS.films = function () {
    listTab({
      name: 'films', title: 'Films', addLabel: 'Add a film', orderable: true, addAtEnd: false,
      intro: 'On the website each title opens to show its text, picture and link. They appear in the order below, grouped by type; use ↑ ↓ to move them.',
      items: function () {
        var order = ['Film', 'Documentary', 'Art'];
        D.films.forEach(function (f) { if (order.indexOf(f.category) < 0) order.push(f.category); });
        var out = [];
        order.forEach(function (c) { D.films.forEach(function (f) { if (f.category === c) out.push({ it: f }); }); });
        return out;
      },
      group: function (f) { return f.category === 'Art' ? 'Art & installation' : f.category; },
      label: function (f) { return f.title; },
      sub: function (f) { return [f.year, f.director].filter(Boolean).join(' · ') + (f.hidden ? ' · hidden' : ''); },
      thumb: function (f) { return f.image; },
      blank: function () { return { category: 'Film', title: '', year: String(new Date().getFullYear()), director: '', role: '', text: '', link: '', image: '' }; },
      fields: function () {
        return [
          { k: 'title', label: 'Title', wide: true },
          { k: 'category', label: 'Type', type: 'select', options: [['Film', 'Film'], ['Documentary', 'Documentary'], ['Art', 'Art & installation']] },
          { k: 'year', label: 'Year' },
          { k: 'director', label: 'Director / artist' },
          { k: 'role', label: 'My role', placeholder: 'Composer, cellist, theme song…' },
          { k: 'text', label: 'Text shown when opened', type: 'textarea', wide: true },
          { k: 'link', label: 'Link', type: 'url', placeholder: 'Spotify, IMDb, trailer…' },
          { k: 'link_label', label: 'Link text (optional)', placeholder: 'Chosen automatically if empty' },
          { k: 'image', label: 'Picture (optional)', type: 'image', wide: true },
          { k: 'hidden', label: 'Hide this one', type: 'check' }
        ];
      }
    });
  };

  TABS.photos = function () {
    var list = D.photos, cur = sel.photos;
    if (cur && list.indexOf(cur) < 0) cur = sel.photos = null;
    var credits = [];
    list.forEach(function (p) { if (p.credit && credits.indexOf(p.credit) < 0) credits.push(p.credit); });
    var html = '<div class="tab-head"><div><h1>Press photos</h1><p>Journalists can view these large and download the full-size file. ' +
      'Upload the full-resolution original: the site makes the small version by itself.</p></div></div>' +
      '<div class="drop" id="drop">Drop photos here, or <button class="link" data-act="addp">choose files</button>.<br><span class="muted">' +
      'New photos get the photographer credit of the photo selected below, which you can change.</span></div>' +
      '<datalist id="credits">' + credits.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<div class="split"><div class="pgrid">' + list.map(function (p, i) {
        return '<button class="ptile' + (p.hidden ? ' off' : '') + '" data-i="' + i + '"' + (p === cur ? ' aria-current="true"' : '') + '><img src="' + esc(img(p.src)) + '" alt="" loading="lazy"><span>' + esc(p.credit || '—') + '</span></button>';
      }).join('') + '</div><div class="editor">';
    if (cur) {
      var i = list.indexOf(cur);
      html += '<div class="ed-head"><h2>Photo ' + (i + 1) + ' of ' + list.length + '</h2><div class="acts"><button class="btn small" data-act="up"' + (i ? '' : ' disabled') + '>← Earlier</button>' +
        '<button class="btn small" data-act="down"' + (i < list.length - 1 ? '' : ' disabled') + '>Later →</button><button class="btn small danger" data-act="del">Delete</button></div></div>' +
        '<img src="' + esc(img(cur.src)) + '" alt="" style="max-width:100%;max-height:340px;display:block;margin-bottom:16px">' +
        fieldsHTML(cur, [
          { k: 'credit', label: 'Photographer (credit)', list: 'credits' },
          { k: 'caption', label: 'Caption (optional)' },
          { k: 'hidden', label: 'Hide this photo', type: 'check' }
        ]) + '<p class="muted" style="margin-top:14px">Full size: ' + (cur.width ? cur.width + ' × ' + cur.height + ' px, ' : '') + (cur.bytes ? (cur.bytes / 1048576).toFixed(1) + ' MB' : '') +
        '</p><button class="btn small" data-act="hero">Use as front-page photo</button>';
    } else html += '<p class="blank">Click a photo to edit its credit, move it or delete it.</p>';
    html += '</div></div>';
    var p = $('#panel');
    p.innerHTML = html;
    if (cur) bind($('.editor', p), cur, function () {
      var t = $('.ptile[aria-current="true"] span', p);
      if (t) t.textContent = cur.credit || '—';
    });
    p.addEventListener('click', function (e) {
      var t = e.target.closest('.ptile');
      if (t) { sel.photos = list[+t.getAttribute('data-i')]; render(); return; }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      var act = a.getAttribute('data-act');
      if (act === 'addp') pickFiles(true).then(addPhotos);
      if (act === 'del' && confirm('Delete this photo from the website?')) {
        list.splice(list.indexOf(cur), 1);
        dropFile(cur.src);
        dropFile(cur.hires);
        sel.photos = null;
        dirty();
        render();
      }
      if (act === 'up' || act === 'down') {
        var i = list.indexOf(cur), j = act === 'up' ? i - 1 : i + 1;
        list.splice(i, 1);
        list.splice(j, 0, cur);
        dirty();
        render();
      }
      if (act === 'hero') {
        D.site.hero = cur.src;
        dirty();
        toast('Front-page photo changed. Set where her face is on the Front page tab.');
      }
    });
    var drop = $('#drop');
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) {
      addPhotos(Array.prototype.filter.call(e.dataTransfer.files, function (f) { return /^image\//.test(f.type); }));
    });
  };
  function addPhotos(files) {
    if (!files || !files.length) return;
    var credit = (sel.photos && sel.photos.credit) || '';
    var big = files.filter(function (f) { return f.size > 45 * 1048576; });
    if (big.length) toast(big.map(function (f) { return f.name; }).join(', ') + ' is too big (over 45 MB) and was skipped.', true);
    files = files.filter(function (f) { return f.size <= 45 * 1048576; });
    $('#status').textContent = 'Preparing ' + files.length + ' photo' + (files.length === 1 ? '' : 's') + '…';
    var added = [];
    return files.reduce(function (chain, f) {
      return chain.then(function () {
        return webCopy(f).then(function (r) {
          var base = slug(f.name);
          var ext = (f.name.match(/\.([a-z0-9]+)$/i) || [, 'jpg'])[1].toLowerCase().replace('jpeg', 'jpg');
          var item = {
            src: addUpload(uniquePath('images', base, 'jpg'), r.blob),
            _file: f,
            hires: addUpload(uniquePath('press', base, ext), f),
            width: r.width, height: r.height, bytes: f.size, credit: credit, caption: ''
          };
          var file = item._file;
          delete item._file;
          D.photos.unshift(item);
          added.push(item);
          return withThumb(file, item.src);
        });
      });
    }, Promise.resolve()).then(function () {
      sel.photos = added[0] || null;
      dirty();
      render();
      if (added.length) toast(added.length + ' photo' + (added.length === 1 ? '' : 's') + ' added at the start. Check the credit, then Publish.');
    }, function (e) { toast(e.message, true); dirty(); render(); });
  }

  TABS.front = function () {
    var s = D.site;
    s.menu = s.menu || [];
    var fp = (s.hero_focus || '50% 50%');
    var html = '<div class="tab-head"><div><h1>Front page</h1><p>The big photo, the name and the menu. Click the photo where her face is: that spot stays in view on every screen, from phones to wide monitors.</p></div></div>' +
      '<div class="front-grid"><div><div class="card"><div class="focus-box" id="focus"><div class="frame"><img src="' + esc(img(s.hero)) + '" alt="" style="object-position:' + esc(fp) + '">' +
      '<div class="t">' + esc(s.name) + '</div></div></div><div class="focus-row"><div class="phone"><img src="' + esc(img(s.hero)) + '" alt="" style="object-position:' + esc(fp) + '"></div>' +
      '<p class="focus-tip">Left: a computer screen. Right: a phone. Click the big picture to choose what stays in view (now ' + esc(fp) + ').<br><br>' +
      '<button class="btn small" data-act="hero-up">Upload a new photo</button></p></div>' +
      '<p class="muted" style="margin:16px 0 6px">…or pick one of the press photos:</p><div class="picker">' +
      D.photos.map(function (p, i) { return '<button data-pick="' + i + '" aria-pressed="' + (p.src === s.hero) + '"><img src="' + esc(img(p.src)) + '" alt="" loading="lazy"></button>'; }).join('') +
      '</div></div></div><div><div class="card" id="words">' + fieldsHTML(s, [
        { k: 'name', label: 'Name', wide: true },
        { k: 'tagline', label: 'Line under the name', wide: true },
        { k: 'show_next_show', label: 'Show the next concert on the front page', type: 'check', wide: true }
      ]) + '</div><div class="card"><h3>Menu</h3><p>The words in the menu and the pages they open. Use ↑ ↓ to reorder, ◐ to hide.</p><div class="rows" id="menu">' +
      s.menu.map(function (m, i) {
        return '<div class="row two' + (m.hidden ? ' off' : '') + '" data-row="' + i + '"><input type="text" data-k="label" value="' + esc(m.label) + '" aria-label="Label">' +
          '<input type="text" data-k="href" value="' + esc(m.href) + '" aria-label="Page or link"><span class="tools"><button data-m="up" title="Up">↑</button><button data-m="down" title="Down">↓</button>' +
          '<button data-m="hide" title="Hide / show">◐</button><button data-m="del" title="Remove">✕</button></span></div>';
      }).join('') + '</div><p style="margin:10px 0 0"><button class="btn small" data-m="add">+ Add menu item</button></p>' +
      '<p class="muted" style="font-size:12.5px;margin-top:12px">Pages: About, Work, FILM, LIVE, PHOTOS, NEWS, CONTACT, STORE, FULL-BIO, Epicycle, Epicycle-II, Evolution, Ox. A full web address works too.</p></div></div></div>';
    var p = $('#panel');
    p.innerHTML = html;
    s.show_next_show = s.show_next_show !== false;
    $('#words input[data-k="show_next_show"]').checked = s.show_next_show;
    $('#words').addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k');
      if (!k) return;
      s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      if (k === 'name') $('#focus .t').textContent = s.name;
      dirty();
    });
    $('#focus').addEventListener('click', function (e) {
      var r = $('#focus .frame img').getBoundingClientRect();
      var x = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100);
      var y = Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 100);
      // object-position works on the part of the photo that is cut off; this is close enough to "keep this spot"
      s.hero_focus = x + '% ' + y + '%';
      p.querySelectorAll('#focus img, .phone img').forEach(function (im) { im.style.objectPosition = s.hero_focus; });
      $('.focus-tip').firstChild.textContent = 'Left: a computer screen. Right: a phone. Click the big picture to choose what stays in view (now ' + s.hero_focus + ').';
      dirty();
    });
    $('#menu').addEventListener('input', function (e) {
      var row = e.target.closest('[data-row]');
      s.menu[+row.getAttribute('data-row')][e.target.getAttribute('data-k')] = e.target.value;
      dirty();
    });
    p.addEventListener('click', function (e) {
      var pick = e.target.closest('[data-pick]');
      if (pick) { s.hero = D.photos[+pick.getAttribute('data-pick')].src; dirty(); render(); return; }
      var a = e.target.closest('[data-act="hero-up"]');
      if (a) {
        pickFiles(false).then(function (fs) {
          if (!fs.length) return;
          return webCopy(fs[0], 2600).then(function (r) {
            s.hero = addUpload(uniquePath('images', 'front-' + slug(fs[0].name), 'jpg'), r.blob);
            withThumb(fs[0], s.hero);
            s.hero_focus = '50% 40%';
            dirty();
            render();
          });
        }).catch(function (err) { toast(err.message, true); });
        return;
      }
      var m = e.target.closest('[data-m]');
      if (!m) return;
      var act = m.getAttribute('data-m');
      if (act === 'add') { s.menu.push({ label: 'New', href: '' }); dirty(); render(); return; }
      var i = +m.closest('[data-row]').getAttribute('data-row');
      if (act === 'up' && i > 0) s.menu.splice(i - 1, 0, s.menu.splice(i, 1)[0]);
      if (act === 'down' && i < s.menu.length - 1) s.menu.splice(i + 1, 0, s.menu.splice(i, 1)[0]);
      if (act === 'hide') { if (s.menu[i].hidden) delete s.menu[i].hidden; else s.menu[i].hidden = true; }
      if (act === 'del' && confirm('Remove “' + s.menu[i].label + '” from the menu?')) s.menu.splice(i, 1);
      dirty();
      render();
    });
  };

  TABS.settings = function () {
    var s = D.site;
    s.links = s.links || [];
    var html = '<div class="tab-head"><div><h1>Contact &amp; press</h1><p>Email addresses, the line on the Photos page and links.</p></div></div>' +
      '<div class="card" id="cset">' + fieldsHTML(s, [
        { k: 'email', label: 'My own email (Contact page)', type: 'email' },
        { k: 'booking_email', label: 'Live booking email', type: 'email', help: 'The “Live booking” link on the Live page and a card on the Contact page. Addresses are hidden from spam bots automatically.' },
        { k: 'booking_name', label: 'Booking agency or name', placeholder: 'Toutpartout' },
        { k: 'press_email', label: 'Email for press', type: 'email' },
        { k: 'press_intro', label: 'Line at the top of the Photos page', type: 'textarea', wide: true }
      ]) + '</div><div class="card"><h3>Links</h3><p>Bandcamp, Instagram and so on.</p><div class="rows" id="links">' +
      s.links.map(function (l, i) {
        return '<div class="row two" data-row="' + i + '"><input type="text" data-k="label" value="' + esc(l.label) + '" placeholder="Name"><input type="url" data-k="url" value="' + esc(l.url) + '" placeholder="https://…">' +
          '<span class="tools"><button data-l="del" title="Remove">✕</button></span></div>';
      }).join('') + '</div><p style="margin:10px 0 0"><button class="btn small" data-l="add">+ Add link</button></p></div>' +
      '<div class="card"><h3>The older pages</h3><p>Music videos, With others, Instant composition and Store are still the pages from the old Cargo site. ' +
      'Ask Gunnar if something there needs changing.</p></div>';
    var p = $('#panel');
    p.innerHTML = html;
    bind($('#cset'), s);
    $('#links').addEventListener('input', function (e) {
      var row = e.target.closest('[data-row]');
      s.links[+row.getAttribute('data-row')][e.target.getAttribute('data-k')] = e.target.value;
      dirty();
    });
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-l]');
      if (!b) return;
      if (b.getAttribute('data-l') === 'add') s.links.push({ label: '', url: '' });
      else s.links.splice(+b.closest('[data-row]').getAttribute('data-row'), 1);
      dirty();
      render();
    });
  };

  // ------------------------------------------------------------------ chrome
  var TAB_FILE = { about: 'about', work: 'work', front: 'site', news: 'news', live: 'shows', films: 'films', photos: 'photos', settings: 'site' };
  function render() {
    var p = $('#panel'), fresh = p.cloneNode(false);
    p.parentNode.replaceChild(fresh, p); // drop old listeners
    document.querySelectorAll('.tabs button').forEach(function (b) {
      var t = b.getAttribute('data-tab');
      b.setAttribute('aria-selected', t === tab);
      var dot = b.querySelector('.dot');
      var isDirty = changed(TAB_FILE[t]) || (t === 'live' && changed('site') && D.site.calendar_ics !== JSON.parse(orig.site).calendar_ics);
      if (isDirty && !dot) b.insertAdjacentHTML('beforeend', '<span class="dot" title="Unpublished changes"></span>');
      if (!isDirty && dot) dot.remove();
    });
    TABS[tab]();
    dirty(true);
  }
  function dirty(quiet) {
    var n = changes();
    var st = $('#status');
    st.className = 'status' + (n ? ' dirty' : '');
    st.textContent = offline ? (n ? n + ' change' + (n === 1 ? '' : 's') + ' (local test: Publish only shows what would be saved)' : 'Local test mode — nothing is saved')
      : n ? n + ' unpublished change' + (n === 1 ? '' : 's') + '. Preview, then Publish when ready.' : 'Everything is published.';
    $('#publish').disabled = !n;
    $('#discard').disabled = !n;
    $('#preview').disabled = false;
    if (!quiet) {
      document.querySelectorAll('.tabs button').forEach(function (b) {
        var t = b.getAttribute('data-tab');
        if (changed(TAB_FILE[t]) && !b.querySelector('.dot')) b.insertAdjacentHTML('beforeend', '<span class="dot" title="Unpublished changes"></span>');
      });
    }
  }

  var PREVIEW_PAGE = { about: 'About.html', work: 'Work.html', front: '', news: 'NEWS.html', live: 'LIVE.html', films: 'FILM.html', photos: 'PHOTOS.html', settings: 'CONTACT.html' };
  function preview() {
    // swap not-yet-uploaded pictures for their in-browser copies, then hand the drafts to the site
    try {
      FILES.concat(['calendar']).forEach(function (n) {
        var t = n === 'calendar' ? JSON.stringify(cal) : text(n);
        Object.keys(uploads).forEach(function (path) { t = t.split('"' + path + '"').join('"' + uploads[path].url + '"'); });
        localStorage.setItem('gyda-draft:' + n, t);
      });
    } catch (e) { return toast('Preview failed: ' + e.message, true); }
    window.open('../' + PREVIEW_PAGE[tab] + '?preview=' + Date.now(), 'gyda-preview');
  }

  function publish() {
    var files = FILES.filter(changed);
    var ups = Object.keys(uploads), dels = Object.keys(removals).filter(function (p) { return !used(p); });
    if (!files.length && !ups.length && !dels.length) return;
    if (offline) {
      alert('Local test mode — this is what Publish would save:\n\n' + files.map(function (f) { return 'data/' + f + '.json'; })
        .concat(ups.map(function (p) { return '+ ' + p; })).concat(dels.map(function (p) { return '− ' + p; })).join('\n'));
      return;
    }
    var btn = $('#publish');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    var head, baseTree;
    // 1. make sure nobody else changed the same files since this page was loaded
    Promise.all(files.map(function (f) {
      return getFile(f).then(function (r) {
        if ((r && r.sha) !== sha[f]) throw new Error('data/' + f + '.json was changed somewhere else since you opened the admin. Copy your text somewhere safe, reload the page and try again.');
      });
    })).then(function () {
      return gh('/git/ref/heads/' + REPO.branch);
    }).then(function (ref) {
      head = ref.object.sha;
      return gh('/git/commits/' + head);
    }).then(function (c) {
      baseTree = c.tree.sha;
      // 2. upload new pictures one by one (big ones take a moment)
      var tree = [], done = 0;
      return ups.reduce(function (chain, path) {
        return chain.then(function () {
          $('#status').textContent = 'Uploading pictures… ' + (++done) + ' of ' + ups.length;
          return blobToB64(uploads[path].blob).then(function (b64) {
            return gh('/git/blobs', { method: 'POST', body: { content: b64, encoding: 'base64' } });
          }).then(function (b) { tree.push({ path: path, mode: '100644', type: 'blob', sha: b.sha }); });
        });
      }, Promise.resolve()).then(function () {
        files.forEach(function (f) { tree.push({ path: 'data/' + f + '.json', mode: '100644', type: 'blob', content: text(f) }); });
        dels.forEach(function (p) { tree.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
        return tree;
      });
    }).then(function (tree) {
      $('#status').textContent = 'Saving…';
      return gh('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: tree } });
    }).then(function (t) {
      var what = files.map(function (f) { return { about: 'about', work: 'work', site: 'front page/settings', shows: 'live', news: 'news', films: 'films', photos: 'photos' }[f]; });
      if (ups.length) what.push(ups.length + ' picture' + (ups.length === 1 ? '' : 's'));
      return gh('/git/commits', { method: 'POST', body: { message: 'Admin: update ' + what.join(', '), tree: t.sha, parents: [head] } });
    }).then(function (c) {
      return gh('/git/refs/heads/' + REPO.branch, { method: 'PATCH', body: { sha: c.sha } });
    }).then(function () {
      return loadAll();
    }).then(function () {
      toast('Published! The website shows the changes in a minute or two (a browser that had the page open may need up to 10 minutes or a refresh).');
    }).catch(function (e) {
      toast('Not published: ' + e.message, true);
      dirty();
    }).then(function () { btn.textContent = 'Publish'; });
  }

  // ------------------------------------------------------------------ start
  function start() {
    $('#signin').hidden = true;
    $('#app').hidden = false;
    loadAll().catch(function (e) {
      if (e.status === 401 || e.status === 403 || e.status === 404) {
        localStorage.removeItem('gyda.key');
        showSignin('That key does not work for this website (' + e.message + ').');
      } else toast('Could not load: ' + e.message, true);
    });
  }
  function showSignin(err) {
    $('#app').hidden = true;
    $('#signin').hidden = false;
    $('#signin-err').textContent = err || '';
    document.querySelectorAll('.repo-name').forEach(function (n) { n.textContent = REPO.owner + '/' + REPO.name; });
    if (LOCAL) $('.local-only').hidden = false;
  }

  document.querySelector('.tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.getAttribute('data-tab');
    location.hash = tab;
    render();
    window.scrollTo(0, 0);
  });
  $('#signin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    token = $('#token').value.trim();
    $('#signin-err').textContent = 'Checking…';
    gh('').then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) throw new Error('This key can read the website but not change it. Give it “Contents: Read and write”.');
      localStorage.setItem('gyda.key', token);
      start();
    }).catch(function (err) {
      $('#signin-err').textContent = err.status === 401 ? 'GitHub did not accept that key. Check it was copied whole.' :
        err.status === 404 ? 'That key cannot see ' + REPO.owner + '/' + REPO.name + '. Check the repository was selected when making the key.' : err.message;
    });
  });
  $('#try-local').addEventListener('click', function () { offline = true; start(); });
  $('#signout').addEventListener('click', function () {
    if (changes() && !confirm('You have unpublished changes. Sign out and lose them?')) return;
    localStorage.removeItem('gyda.key');
    localStorage.removeItem('gyda.unlocked');
    location.reload();
  });
  $('#publish').addEventListener('click', publish);
  $('#preview').addEventListener('click', preview);
  $('#discard').addEventListener('click', function () {
    if (!confirm('Undo every change since the last Publish?')) return;
    Object.keys(uploads).forEach(function (p) { URL.revokeObjectURL(uploads[p].url); });
    FILES.forEach(function (n) { D[n] = JSON.parse(orig[n]); });
    uploads = {};
    removals = {};
    sel = {};
    render();
  });
  window.addEventListener('beforeunload', function (e) {
    if (changes()) { e.preventDefault(); e.returnValue = ''; }
  });

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function checkPass(pw) {
    var salt = new Uint8Array(PASS.salt.match(/../g).map(function (x) { return parseInt(x, 16); }));
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: PASS.iter }, k, 256);
    }).then(function (bits) { return hex(bits) === PASS.hash; });
  }
  function boot() {
    var h = location.hash.slice(1);
    if (TABS[h]) tab = h;
    token = localStorage.getItem('gyda.key') || '';
    if (token) start(); else showSignin();
  }
  $('#lock-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#lock-err');
    err.textContent = 'Checking…';
    checkPass($('#pass').value).then(function (ok) {
      if (!ok) { err.textContent = 'Wrong password.'; $('#pass').select(); return; }
      try { localStorage.setItem('gyda.unlocked', PASS.hash); } catch (x) { /* private mode: ask again next time */ }
      $('#lock').hidden = true;
      boot();
    });
  });
  var unlocked = false;
  try { unlocked = localStorage.getItem('gyda.unlocked') === PASS.hash; } catch (x) { /* ignore */ }
  if (unlocked) boot();
  else { $('#lock').hidden = false; $('#pass').focus(); }
})();
