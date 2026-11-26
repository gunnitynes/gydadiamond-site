/* Admin for gydadiamond.net.
   Everything the site shows from data/*.json is edited here. "Publish" makes ONE commit to the GitHub repository
   through the sign-in service (service/worker.js, see service.js); GitHub Pages puts it live about a minute later.
   New pictures are resized in the browser before upload; press photos also keep the full-size original for download. */
(function () {
  'use strict';

  var FILES = ['site', 'about', 'work', 'videos', 'news', 'shows', 'films', 'photos'];
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  var offline = false;          // local test mode: reads ../data, never writes
  var D = {};                   // current data, per file
  var orig = {};                // published text, per file
  var sha = {};                 // blob sha of each published file
  var cal = [];                 // data/calendar.json (written by the calendar sync, read-only here)
  var uploads = {};             // repo path -> { blob, url }
  var removals = {};            // repo path -> true
  var loaded = false;
  var tab = 'front';
  var sel = {};                 // selected item per tab
  var otherAddr = [];           // menu items whose web address is being typed
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

  // ------------------------------------------------------------------ the sign-in service
  function call(method, path, body) {
    return SERVICE.call(method, path, body).catch(function (e) {
      if (e.status === 401) {
        SERVICE.forget();
        showSignin(loaded ? 'Please sign in again. Your changes are still here.' : '');
      }
      throw e;
    });
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1]); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }
  function getData() {
    if (!offline) return call('GET', '/data');
    var files = {};
    return Promise.all(FILES.concat(['calendar']).map(function (n) {
      return fetch('../data/' + n + '.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; })
        .then(function (t) { if (t != null) files[n] = { text: t, sha: 'local' }; });
    })).then(function () { return { files: files }; });
  }

  function loadAll() {
    $('#status').textContent = 'Loading…';
    return getData().then(function (res) {
      FILES.forEach(function (n) {
        var r = res.files[n] || { text: n === 'site' ? '{}\n' : '[]\n', sha: null };
        orig[n] = r.text;
        sha[n] = r.sha;
        D[n] = JSON.parse(r.text);
        orig[n] = text(n); // normalise formatting so "changed" only means real edits
      });
      var c = res.files.calendar;
      try { cal = c ? JSON.parse(c.text) : []; } catch (e) { cal = []; }
      uploads = {};
      removals = {};
      loaded = true;
      render();
      var days = res.expires ? Math.floor((new Date(res.expires.slice(0, 10)) - Date.now()) / 864e5) : 999;
      if (days < 30) toast('Please tell Gunnar: the website’s GitHub key runs out in ' + Math.max(0, days) + ' days.', true);
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
    var html = '<div class="tab-head"><div><h1>' + o.title + '</h1><p>' + o.intro + (window.innerWidth <= 860 && /^(news|shows)$/.test(o.name) ? ' <a href="post/">Quick post</a> is easier on a phone.' : '') + '</p></div><div class="acts">' +
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
    } else html += '<p class="blank">Choose something in the list to edit it,<br>or press “+ ' + o.addLabel + '”.</p>';
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
        if (window.innerWidth <= 860) $('.editor').scrollIntoView({ behavior: 'smooth' });
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
        if (first) first.focus({ preventScroll: window.innerWidth <= 860 });
        if (window.innerWidth <= 860) $('.editor').scrollIntoView();   // on a phone the form is below the list
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
      if (/^(date|end|category|section|page)$/.test(e.target.getAttribute('data-k') || '')) render();
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
          '<details' + (url || window.innerWidth <= 860 ? '' : ' open') + '><summary class="muted" style="cursor:pointer;margin-bottom:10px">How to set it up</summary><div class="info"><ol>' +
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
          call('POST', '/sync-calendar', {}).then(function () {
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
          { k: 'page', label: 'Page on this site', placeholder: 'leave empty for albums', help: 'Leave empty for a new album: it gets its own page as soon as it has a story or tracks. Only needed for tiles under “More work” (e.g. FILM).' },
          { k: 'hidden', label: 'Hide this one', type: 'check' },
          { k: 'buy', label: 'Bandcamp page (buy)', type: 'url', placeholder: 'https://gyda.bandcamp.com/album/…', help: 'Used by the Store page and the “Buy on Bandcamp” button.' },
          { k: 'player', label: 'Listen on', type: 'select', wide: true, options: [['', 'Automatic: TIDAL, or Bandcamp if it isn’t on TIDAL'], ['tidal', 'TIDAL'], ['bandcamp', 'Bandcamp'], ['none', 'No player: use the listen link below']],
            help: 'Where the music player on the album page comes from. The “Listen” button goes to the same place.' },
          { k: 'tidal', label: 'TIDAL player', type: 'url', placeholder: 'https://tidal.com/album/…', help: 'The album’s TIDAL address. Visitors without TIDAL hear 30-second previews.' },
          { k: 'bandcamp', label: 'Bandcamp player', placeholder: 'Paste the embed code from Bandcamp', help: 'On the album’s Bandcamp page: Share / Embed → choose any player → copy the code and paste it here. The album page then gets a player.' },
          { k: 'listen', label: 'Other listen link', type: 'url', placeholder: 'https://…', help: 'Only used when “Listen on” is set to No player, or for tiles under “More work”.' },
          { k: 'listen_label', label: 'Other listen link name', placeholder: 'Spotify' },
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

  TABS.videos = function () {
    var PAGES = [['Music-Video', 'Music videos'], ['With-Others', 'With others'], ['Instant-composition', 'Instant composition']];
    function pname(k) { return (PAGES.filter(function (p) { return p[0] === k; })[0] || [k, k])[1]; }
    listTab({
      name: 'videos', title: 'Videos', addLabel: 'Add a video', orderable: true,
      intro: 'YouTube videos for the Music videos, With others and Instant composition pages. Paste the YouTube address; the picture comes from YouTube by itself.',
      items: function () {
        var out = [];
        PAGES.forEach(function (p) { D.videos.forEach(function (v) { if (v.page === p[0]) out.push({ it: v }); }); });
        D.videos.forEach(function (v) { if (!PAGES.some(function (p) { return p[0] === v.page; })) out.push({ it: v }); });
        return out;
      },
      group: function (v) { return pname(v.page); },
      label: function (v) { return v.title; },
      sub: function (v) { return (v.by || '') + (v.hidden ? ' · hidden' : ''); },
      blank: function () { return { page: 'Music-Video', title: '', by: '', credits: '', youtube: '' }; },
      fields: function () {
        return [
          { k: 'title', label: 'Title', wide: true },
          { k: 'page', label: 'Page', type: 'select', options: PAGES, key: 'category' },
          { k: 'youtube', label: 'YouTube address', type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' },
          { k: 'by', label: 'Small line under the title', placeholder: 'e.g. Music by Jónsi & Gyða' },
          { k: 'credits', label: 'Credits', type: 'textarea', wide: true, help: 'One per line.' },
          { k: 'hidden', label: 'Hide this video', type: 'check' }
        ];
      }
    });
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

  // The photos are shown the way the website shows them: in columns, each photo going into the column that is
  // shortest so far (the same rule as renderPhotos in js/app.js). Hidden photos are not on the site, so they wait below.
  function photoCols() { return sel['photos:cols'] || (innerWidth <= 700 ? 2 : 3); }
  function masonry(grid, tiles, items, n) {
    var cols = [], h = [];
    for (var c = 0; c < n; c++) { var d = document.createElement('div'); d.className = 'pcol'; cols.push(d); h.push(0); }
    tiles.forEach(function (t, i) {
      var p = items[i], k = h.indexOf(Math.min.apply(null, h));
      h[k] += (p.width && p.height ? p.height / p.width : 1.25) + 0.12;
      cols[k].appendChild(t);
    });
    grid.replaceChildren.apply(grid, cols);
  }
  // put the shown photos back into the list in their new order; hidden ones keep their places
  function reorderShown(list, order) {
    var k = 0;
    for (var i = 0; i < list.length; i++) if (!list[i].hidden) list[i] = order[k++];
  }
  TABS.photos = function () {
    var list = D.photos, cur = sel.photos;
    if (cur && list.indexOf(cur) < 0) cur = sel.photos = null;
    var credits = [];
    list.forEach(function (p) { if (p.credit && credits.indexOf(p.credit) < 0) credits.push(p.credit); });
    var shown = list.filter(function (p) { return !p.hidden; }), hid = list.filter(function (p) { return p.hidden; });
    var ncols = photoCols();
    function tile(p) {
      var r = p.width && p.height ? ' style="aspect-ratio:' + p.width + '/' + p.height + '"' : '';
      return '<button class="ptile' + (p.hidden ? ' off' : '') + '" data-i="' + list.indexOf(p) + '"' + (p === cur ? ' aria-current="true"' : '') + '>' +
        '<img src="' + esc(img(p.src)) + '" alt="" loading="lazy" draggable="false"' + r + '><span>© ' + esc(p.credit || '—') +
        (p.caption ? ' · ' + esc(p.caption) : '') + '</span></button>';
    }
    var html = '<div class="tab-head"><div><h1>Photos</h1><p>Journalists can view these large and download the full-size file. ' +
      'Upload the full-resolution original: the site makes the small version by itself.</p></div></div>' +
      '<div class="drop" id="drop">Drop photos here, or <button class="link" data-act="addp">choose files</button>.<br><span class="muted">' +
      'New photos get the photographer credit of the selected photo, which you can change.</span></div>' +
      '<datalist id="credits">' + credits.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<div class="photos-wrap"><div class="photos-main">' +
      '<div class="as-site"><p class="muted drag-tip">This is how the photos page looks. Drag them into the order you want. ' +
      'On a phone or tablet: hold a photo for a moment, then drag.</p>' +
      '<div class="seg" role="group" aria-label="Show the page as on">' +
      '<button data-cols="3" aria-pressed="' + (ncols === 3) + '">On a computer</button>' +
      '<button data-cols="2" aria-pressed="' + (ncols === 2) + '">On a phone</button></div></div>' +
      '<div class="pgrid">' + shown.map(tile).join('') + '</div>' +
      (shown.length ? '' : '<p class="blank">No photos on the site yet.</p>') +
      (hid.length ? '<h3 class="hid-head">Hidden: not on the site</h3><div class="phidden">' + hid.map(tile).join('') + '</div>' : '') +
      '</div><div class="editor">';
    if (cur) {
      var at = shown.indexOf(cur);
      html += '<div class="ed-head"><h2>' + (cur.hidden ? 'Hidden photo' : 'Photo ' + (at + 1) + ' of ' + shown.length) + '</h2><div class="acts">' +
        (cur.hidden ? '' : '<button class="btn small" data-act="up"' + (at ? '' : ' disabled') + '>← Earlier</button>' +
        '<button class="btn small" data-act="down"' + (at < shown.length - 1 ? '' : ' disabled') + '>Later →</button>') +
        '<button class="btn small danger" data-act="del">Delete</button></div></div>' +
        '<img class="ed-img" src="' + esc(img(cur.src)) + '" alt=""' + (cur.width && cur.height ? ' width="' + cur.width + '" height="' + cur.height + '"' : '') + '>' +
        fieldsHTML(cur, [
          { k: 'credit', label: 'Photographer (credit)', list: 'credits' },
          { k: 'caption', label: 'Caption (optional)' },
          { k: 'hidden', label: 'Hide this photo', type: 'check' }
        ]) + '<p class="muted" style="margin-top:14px">Full size: ' + (cur.width ? cur.width + ' × ' + cur.height + ' px, ' : '') + (cur.bytes ? (cur.bytes / 1048576).toFixed(1) + ' MB' : '') +
        '</p><button class="btn small" data-act="hero">Use as front-page photo</button>';
    } else html += '<p class="blank">Click a photo to edit its credit, caption or hide it.</p>';
    html += '</div></div>';
    var p = $('#panel');
    p.innerHTML = html;
    var grid = $('.pgrid', p);
    masonry(grid, Array.prototype.slice.call(grid.children), shown, ncols);
    if (cur) bind($('.editor', p), cur, function () {
      var t = $('.ptile[aria-current="true"] span', p);
      if (t) t.textContent = '© ' + (cur.credit || '—') + (cur.caption ? ' · ' + cur.caption : '');
      if (!!cur.hidden !== (hid.indexOf(cur) >= 0)) render();   // hidden or shown again: it moves
    });
    arrange(grid, list, shown, ncols);
    p.addEventListener('click', function (e) {
      var c = e.target.closest('[data-cols]');
      if (c) { sel['photos:cols'] = +c.getAttribute('data-cols'); render(); return; }
      var t = e.target.closest('.ptile');
      if (t && arrange.justDropped) return;
      if (t) {
        sel.photos = list[+t.getAttribute('data-i')];
        render();
        if (window.innerWidth <= 1100) $('.editor').scrollIntoView({ behavior: 'smooth' });
        return;
      }
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
        var i = shown.indexOf(cur), j = act === 'up' ? i - 1 : i + 1;
        shown.splice(i, 1);
        shown.splice(j, 0, cur);
        reorderShown(list, shown);
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
  // Drag photos into a new order. Mouse: press and move. Touch: hold a moment, then move (a quick swipe still scrolls).
  // While a photo is held the columns are laid out again with it in its new place, so what you see is what the site will show.
  function arrange(grid, list, shown, ncols) {
    var tiles = Array.prototype.slice.call(grid.querySelectorAll('.ptile'));   // in the same order as shown
    var drag = null;
    function itemOf(t) { return list[+t.getAttribute('data-i')]; }
    function under(x, y) {
      var hit = null;
      tiles.forEach(function (t) {
        var r = t.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = t;
      });
      return hit;
    }
    grid.addEventListener('pointerdown', function (e) {
      var t = e.target.closest('.ptile');
      if (!t || e.button > 0 || drag) return;
      var touch = e.pointerType !== 'mouse';
      drag = { tile: t, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, touch: touch };
      if (touch) drag.timer = setTimeout(function () { if (drag && !drag.on) begin(drag.x, drag.y); }, 320);
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', end, true);
      document.addEventListener('pointercancel', cancel, true);
      document.addEventListener('keydown', key, true);
    });
    function begin(x, y) {
      var r = drag.tile.getBoundingClientRect();
      drag.on = true;
      drag.dx = x - r.left; drag.dy = y - r.top;
      drag.px = x; drag.py = y;
      drag.order = shown.slice();
      drag.last = drag.tile;
      drag.sy = scrollY;
      drag.ghost = drag.tile.cloneNode(true);
      drag.ghost.className = 'ptile lifted';
      drag.ghost.style.width = r.width + 'px';
      document.body.appendChild(drag.ghost);
      drag.tile.classList.add('gap');
      document.documentElement.classList.add('arranging');
      document.addEventListener('touchmove', still, { passive: false });   // the page must not scroll while a photo is held
      if (navigator.vibrate) navigator.vibrate(12);
      place(x, y);
    }
    function still(e) { e.preventDefault(); }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        var far = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
        if (drag.touch) { if (far > 10) stop(); return; }        // moved before holding: that's scrolling
        if (far < 6) return;
        begin(e.clientX, e.clientY);
      }
      e.preventDefault();
      drag.px = e.clientX; drag.py = e.clientY;
      place(e.clientX, e.clientY);
      scroll();
    }
    function place(x, y) {
      drag.ghost.style.transform = 'translate(' + (x - drag.dx) + 'px,' + (y - drag.dy) + 'px)';
      var over = under(x, y);
      if (over === drag.last) return;
      drag.last = over;                       // a photo only moves again once the finger reaches another photo
      if (!over || over === drag.tile) return;
      // Try the places around the photo it is over and keep the one that puts the empty spot under the pointer,
      // so the photo always lands where it is let go, even though the columns shift around it.
      var it = itemOf(drag.tile), base = drag.order.filter(function (p) { return p !== it; });
      var to = base.indexOf(itemOf(over)), best = null, bestD = Infinity;
      [0, 1, -1, 2, -2, 3, -3, 4].forEach(function (k) {
        var c = to + k;
        if (c < 0 || c > base.length || bestD === 0) return;
        drag.order = base.slice(); drag.order.splice(c, 0, it); lay();
        var r = drag.tile.getBoundingClientRect();
        var d = Math.max(r.left - x, 0, x - r.right) + Math.max(r.top - y, 0, y - r.bottom);
        if (d < bestD) { bestD = d; best = drag.order; }
      });
      drag.order = best; lay();
      drag.last = under(x, y);
    }
    function lay() {
      var byItem = drag.order.map(function (p) { return tiles[shown.indexOf(p)]; });
      masonry(grid, byItem, drag.order, ncols);
      if (scrollY !== drag.sy) window.scrollTo(scrollX, drag.sy);   // the browser must not shift the page as the columns change
    }
    function scroll() { // near the top or bottom of the window, the page scrolls along
      cancelAnimationFrame(drag.raf);
      var top = 130, bottom = innerHeight - 140;
      var v = drag.py < top ? drag.py - top : drag.py > bottom ? drag.py - bottom : 0;
      if (!v) return;
      drag.raf = requestAnimationFrame(function step() {
        if (!drag || !drag.on) return;
        window.scrollBy(0, Math.max(-24, Math.min(24, v / 3)));
        drag.sy = scrollY;
        place(drag.px, drag.py);
        drag.raf = requestAnimationFrame(step);
      });
    }
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) return stop();
      var order = drag.order, it = itemOf(drag.tile), top0 = drag.tile.getBoundingClientRect().top;
      stop();
      arrange.justDropped = true;
      setTimeout(function () { arrange.justDropped = false; }, 0);
      if (order.every(function (p, i) { return p === shown[i]; })) return;
      reorderShown(list, order);
      sel.photos = it;
      dirty();
      render();
      // the photo stays where it was let go, even when its editor opens above the columns
      var t = document.querySelector('.pgrid .ptile[data-i="' + list.indexOf(it) + '"]');
      if (t) window.scrollBy(0, t.getBoundingClientRect().top - top0);
    }
    function cancel() {
      if (!drag) return;
      var was = drag.on;
      stop();
      if (was) render();                                    // put the photos back where they were
    }
    function key(e) { if (e.key === 'Escape' && drag && drag.on) { e.preventDefault(); cancel(); } }
    function stop() {
      clearTimeout(drag.timer);
      cancelAnimationFrame(drag.raf);
      if (drag.ghost) drag.ghost.remove();
      drag.tile.classList.remove('gap');
      document.documentElement.classList.remove('arranging');
      document.removeEventListener('touchmove', still, { passive: false });
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('keydown', key, true);
      drag = null;
    }
  }
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
    // every page the menu can open: the fixed ones and each album's own page
    var pages = [['About', 'About'], ['Work', 'Work'], ['FILM', 'Film'], ['LIVE', 'Live'], ['PHOTOS', 'Photos'], ['NEWS', 'News'], ['CONTACT', 'Contact'], ['STORE', 'Store'],
      ['FULL-BIO', 'Full bio'], ['Music-Video', 'Music videos'], ['With-Others', 'With others'], ['Instant-composition', 'Instant composition']];
    D.work.forEach(function (w) {
      if (w.page && w.section !== 'More' && !pages.some(function (p) { return p[0] === w.page; })) pages.push([w.page, 'Album: ' + w.title]);
    });
    var known = function (href) { return pages.some(function (p) { return p[0] === href; }); };
    var isOther = function (m) { return !!m.href && !known(m.href) || otherAddr.indexOf(m) >= 0; };
    var pageOptions = function (m) {
      var opt = function (v, t, on) { return '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(t) + '</option>'; };
      return (m.href || isOther(m) ? '' : opt('', 'Choose a page…', true)) + pages.map(function (p) { return opt(p[0], p[1], !isOther(m) && p[0] === m.href); }).join('') + opt('*', 'Another web address…', isOther(m));
    };
    var fp = (s.hero_focus || '50% 50%');
    var html = '<div class="tab-head"><div><h1>Front page</h1><p>The big photo, the name and the menu. Click the big picture to choose which part stays in view on every screen, from phones to wide monitors.</p></div></div>' +
      '<div class="front-grid"><div><div class="card"><div class="focus-box" id="focus"><div class="frame"><img src="' + esc(img(s.hero)) + '" alt="" style="object-position:' + esc(fp) + '">' +
      '<div class="t">' + esc(s.name) + '</div></div></div><div class="focus-row"><div class="phone"><img src="' + esc(img(s.hero)) + '" alt="" style="object-position:' + esc(fp) + '"></div>' +
      '<p class="focus-tip">Left: a computer screen. Right: a phone. Click the big picture to choose what stays in view (now ' + esc(fp) + ').<br><br>' +
      '<button class="btn small" data-act="hero-up">Upload a new photo</button></p></div>' +
      '<p class="muted" style="margin:16px 0 6px">…or pick one of the photos:</p><div class="picker">' +
      D.photos.map(function (p, i) { return '<button data-pick="' + i + '" aria-pressed="' + (p.src === s.hero) + '"><img src="' + esc(img(p.src)) + '" alt="" loading="lazy"></button>'; }).join('') +
      '</div></div></div><div><div class="card" id="words">' + fieldsHTML(s, [
        { k: 'name', label: 'Name', wide: true },
        { k: 'tagline', label: 'Line under the name', wide: true },
        { k: 'show_next_show', label: 'Show the next concert on the front page', type: 'check', wide: true }
      ]) + '</div><div class="card"><h3>Menu</h3><p>Left: the word in the menu. Right: the page it opens. Use ↑ ↓ to reorder, ◐ to hide.</p><div class="rows" id="menu">' +
      s.menu.map(function (m, i) {
        return '<div class="row two' + (m.hidden ? ' off' : '') + '" data-row="' + i + '"><input type="text" data-k="label" value="' + esc(m.label) + '" aria-label="Label">' +
          '<select data-page aria-label="The page it opens">' + pageOptions(m) + '</select><span class="tools"><button data-m="up" title="Up">↑</button><button data-m="down" title="Down">↓</button>' +
          '<button data-m="hide" title="Hide / show">◐</button><button data-m="del" title="Remove">✕</button></span>' +
          (isOther(m) ? '<input type="url" class="addr" data-k="href" value="' + esc(m.href) + '" placeholder="https://…" aria-label="Web address">' : '') + '</div>';
      }).join('') + '</div><p style="margin:10px 0 0"><button class="btn small" data-m="add">+ Add menu item</button></p></div></div></div>';
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
      if (!e.target.hasAttribute('data-k')) return;
      s.menu[+e.target.closest('[data-row]').getAttribute('data-row')][e.target.getAttribute('data-k')] = e.target.value;
      dirty();
    });
    $('#menu').addEventListener('change', function (e) {
      var row = e.target.closest('[data-row]'), m = s.menu[+row.getAttribute('data-row')], v = e.target.value.trim();
      if (e.target.hasAttribute('data-page')) {
        otherAddr = otherAddr.filter(function (x) { return x !== m; });
        if (v === '*') { otherAddr.push(m); m.href = ''; } else m.href = v;
        dirty();
        render();
        if (v === '*') { var a = $('#menu [data-row="' + row.getAttribute('data-row') + '"] .addr'); if (a) a.focus(); }
      } else if (e.target.classList.contains('addr') && v && !/^(https?:|mailto:)/i.test(v) && !known(v)) {
        m.href = e.target.value = 'https://' + v;
        dirty();
      }
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
''; // every page is now edited in the admin
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
  var TAB_FILE = { videos: 'videos', about: 'about', work: 'work', front: 'site', news: 'news', live: 'shows', films: 'films', photos: 'photos', settings: 'site' };
  function render() {
    var p = $('#panel'), fresh = p.cloneNode(false);
    p.parentNode.replaceChild(fresh, p); // drop old listeners
    document.querySelectorAll('.tabs button').forEach(function (b) {
      var t = b.getAttribute('data-tab');
      b.setAttribute('aria-selected', t === tab);
      if (t === tab && b.parentNode.scrollWidth > b.parentNode.clientWidth) b.parentNode.scrollLeft = b.offsetLeft - b.parentNode.offsetLeft - (b.parentNode.clientWidth - b.offsetWidth) / 2;
      if (t === tab) $('#guide-link').href = 'guide/#' + tab;   // the guide opens at the page she is on
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

  var PREVIEW_PAGE = { videos: 'Music-Video.html', about: 'About.html', work: 'Work.html', front: '', news: 'NEWS.html', live: 'LIVE.html', films: 'FILM.html', photos: 'PHOTOS.html', settings: 'CONTACT.html' };
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
    // pictures go up one by one (big ones take a moment); then everything is saved in one go
    var adds = {}, body = { files: {}, shas: {}, adds: adds, dels: dels }, done = 0;
    files.forEach(function (f) { body.files[f] = text(f); body.shas[f] = sha[f]; });
    ups.reduce(function (chain, path) {
      return chain.then(function () {
        $('#status').textContent = 'Uploading pictures… ' + (++done) + ' of ' + ups.length;
        return blobToB64(uploads[path].blob).then(function (b64) {
          return call('POST', '/blob', { content: b64, encoding: 'base64' });
        }).then(function (b) { adds[path] = b.sha; });
      });
    }, Promise.resolve()).then(function () {
      $('#status').textContent = 'Saving…';
      return call('POST', '/publish', body);
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
    $('#newpass').hidden = true;
    $('#app').hidden = false;
    if (loaded) return dirty();      // signed in again in the middle of something
    loadAll().catch(function (e) { if (e.status !== 401) toast('Could not load: ' + e.message, true); });
  }
  function showSignin(err) {
    $('#app').hidden = true;
    $('#newpass').hidden = true;
    $('#signin').hidden = false;
    $('#signin-err').textContent = err || '';
    if (LOCAL) $('.local-only').hidden = false;
    $('#pass').value = '';
    $('#pass').focus();
  }
  function showNewpass(back) {       // back: where Cancel goes
    ['#app', '#signin'].forEach(function (x) { $(x).hidden = true; });
    $('#newpass').hidden = false;
    $('#newpass-form').reset();
    $('#newpass-err').textContent = '';
    $('#newpass-cancel').onclick = back;
    $('#new1').focus();
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
    var err = $('#signin-err'), b = $('#signin-form .btn');
    err.textContent = 'One moment…';
    b.disabled = true;
    SERVICE.login($('#pass').value).then(function () {
      $('#pass').value = '';
      err.textContent = '';
      start();
    }, function (x) { err.textContent = x.message; $('#pass').select(); }).then(function () { b.disabled = false; });
  });
  $('#forgot').addEventListener('click', function () { showNewpass(function () { showSignin(); }); });
  $('#change-pass').addEventListener('click', function () { showNewpass(start); });
  $('#newpass-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#newpass-err'), b = $('#newpass-form .btn'), pw = $('#new1').value;
    if (pw.length < 12) { err.textContent = 'Please make it at least 12 characters.'; return $('#new1').focus(); }
    if (pw !== $('#new2').value) { err.textContent = 'The two passwords are not the same.'; return $('#new2').select(); }
    err.textContent = 'One moment…';
    b.disabled = true;
    SERVICE.setPassword(pw, $('#code').value).then(function () {
      $('#newpass-form').reset();
      start();
      toast('Your new password is saved. Other devices have been signed out.');
    }).catch(function (x) { err.textContent = x.message; }).then(function () { b.disabled = false; });
  });
  $('#try-local').addEventListener('click', function () { offline = true; start(); });
  $('#signout').addEventListener('click', function () {
    if (changes() && !confirm('You have unpublished changes. Sign out and lose them?')) return;
    uploads = {}; removals = {};
    FILES.forEach(function (n) { if (orig[n]) D[n] = JSON.parse(orig[n]); });   // so the browser doesn't ask a second time
    (offline ? Promise.resolve() : SERVICE.logout()).then(function () { location.reload(); });
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

  var h = location.hash.slice(1);
  if (TABS[h]) tab = h;
  if (SERVICE.signedIn()) start(); else showSignin();
})();
