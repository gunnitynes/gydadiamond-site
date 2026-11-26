/* Edit mode: the website itself becomes the editor (opened with "Edit this page", only in a browser signed in to
   the admin). Words are typed where they are, pictures are changed by clicking them, things are dragged into order,
   and Publish saves everything in one go through the sign-in service, exactly like the admin.
   js/app.js draws the page from the objects kept here and marks what can be edited:
     data-ei = which thing (a news post, an album…), data-ef = which of its fields, data-ek = "block" (several lines) or "img". */
(function () {
  'use strict';
  var FILES = ['site', 'about', 'work', 'videos', 'news', 'shows', 'films', 'photos'];
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]local\b/.test(location.search);   // a test copy on this computer
  var DRAFT = 'gyda-edit:draft';
  var api, D = {}, orig = {}, sha = {}, cal = [], uploads = {}, removals = {};
  var reg = [], regMap = new Map();
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var key = document.body.getAttribute('data-page') || '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function text(n) { return JSON.stringify(D[n], null, 1) + '\n'; }
  function changed(n) { return D[n] !== undefined && text(n) !== orig[n]; }
  function changes() { return FILES.filter(changed).length + Object.keys(uploads).length + Object.keys(removals).length; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function stamp() { return todayISO().replace(/-/g, ''); }
  function slug(s) {
    return String(s || 'image').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ö/g, 'o')
      .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  }
  function toast(msg, bad) {
    var t = $('#ed-toast');
    t.textContent = msg;
    t.className = 'ed-toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.hidden = true; }, bad ? 8000 : 4000);
  }
  // emails are saved scrambled, as in the admin
  function encMail(v) { v = String(v || '').trim(); return v ? 'enc:' + btoa(unescape(encodeURIComponent(v.split('').reverse().join('')))) : ''; }
  function decMail(v) {
    v = String(v || '');
    if (v.indexOf('enc:') !== 0) return v;
    try { return decodeURIComponent(escape(atob(v.slice(4)))).split('').reverse().join(''); } catch (e) { return ''; }
  }

  // ------------------------------------------------------------------ which thing is which
  var ED = {
    id: function (item, file, list) {
      var r = regMap.get(item);
      if (!r) {
        r = { id: reg.length, item: item, file: file, list: list || (Array.isArray(D[file]) ? D[file] : null) };
        reg.push(r);
        regMap.set(item, r);
      }
      return r.id;
    },
    decorate: function (root) { decorate(root || document); }
  };
  function thing(el) { var e = el && el.closest('[data-ei]'); return e ? reg[+e.getAttribute('data-ei')] : null; }

  // ------------------------------------------------------------------ pictures (as in the admin)
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Could not read ' + file.name + ' as a picture. Use JPG or PNG.')); };
      im.src = URL.createObjectURL(file);
    });
  }
  function webCopy(file, max) {
    max = max || 2000;
    return loadImage(file).then(function (im) {
      var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res({ blob: b, width: w, height: h }); }, 'image/jpeg', 0.84); });
    });
  }
  function uniquePath(dir, base, ext) {
    var p = dir + '/' + stamp() + '-' + base + '.' + ext, i = 2;
    while (uploads[p]) p = dir + '/' + stamp() + '-' + base + '-' + (i++) + '.' + ext;
    return p;
  }
  function addUpload(path, blob) { uploads[path] = { blob: blob, url: URL.createObjectURL(blob) }; delete removals[path]; return path; }
  function thumbPath(path) { return 'images/t/' + path.slice(7).replace(/\.[a-z]+$/i, '.jpg'); }
  function uploadWebImage(file, base) {
    return webCopy(file).then(function (r) {
      var p = addUpload(uniquePath('images', slug(base || file.name), 'jpg'), r.blob);
      return webCopy(file, 720).then(function (t) { addUpload(thumbPath(p), t.blob); return p; });
    });
  }
  function pickFiles(multiple) {
    return new Promise(function (res) {
      var i = document.createElement('input');
      i.type = 'file'; i.accept = 'image/jpeg,image/png,image/webp,image/heic'; i.multiple = !!multiple;
      i.onchange = function () { res(Array.prototype.slice.call(i.files)); };
      i.click();
    });
  }
  function used(path) { return FILES.map(text).join('\n').indexOf('"' + path + '"') >= 0; }
  function dropFile(path) {
    if (!path || used(path)) return;
    if (/^images\/[^/]+$/.test(path)) dropFile(thumbPath(path));
    if (uploads[path]) { URL.revokeObjectURL(uploads[path].url); delete uploads[path]; return; }
    if (/^(images|press)\//.test(path)) removals[path] = true;
  }
  // new pictures are not on the website yet: show them from the browser's own copy
  function fixImages(root) {
    if (!Object.keys(uploads).length) return;
    root.querySelectorAll('img').forEach(function (im) {
      var s = im.getAttribute('src') || '';
      if (uploads[s]) im.src = uploads[s].url;
    });
    root.querySelectorAll('.page-hero, .app-bg').forEach(function (el) {
      var m = (el.style.backgroundImage || '').match(/url\(["']?([^"')]+)/);
      if (m && uploads[m[1]]) el.style.backgroundImage = "url('" + uploads[m[1]].url + "')";
    });
  }

  // ------------------------------------------------------------------ typing on the page
  var PLAIN = (function () { var d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; })();
  var PH = { title: 'Title', venue: 'Venue', note: 'A note', text: 'A sentence or two', caption: 'A caption', credit: 'Photographer', by: 'A line under the title',
    name: 'Name', tagline: 'A line under the name', press_intro: 'A line at the top of the page', kicker: 'A small line', label: 'Name', year: 'Year', kind: 'Album, EP…' };
  function decorate(root) {
    (root || document).querySelectorAll('[data-ef]:not([data-ed])').forEach(function (el) {
      var r = thing(el);
      if (!r) return;
      el.setAttribute('data-ed', '1');
      var kind = el.getAttribute('data-ek'), field = el.getAttribute('data-ef');
      if (kind === 'img') { el.classList.add('ed-img'); el.title = 'Click to change the picture'; return; }
      if (kind === 'block') { el.classList.add('ed-block'); el.title = 'Click to write'; return; }
      el.contentEditable = PLAIN ? 'plaintext-only' : 'true';
      el.spellcheck = true;
      el.classList.add('ed-text');
      el.setAttribute('data-ph', PH[field] || 'Write here');
      el.addEventListener('input', function () {
        r.item[field] = el.innerText.replace(/\n+/g, ' ').trim();
        if (!r.item[field] && field !== 'title') delete r.item[field];
        saved();
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        e.stopPropagation();   // the page's own keys (Escape closes, space opens…) stay out of the way
      });
      el.addEventListener('paste', function (e) {
        e.preventDefault();
        document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' '));
      });
    });
    fixImages(root || document);
    addButtons();
  }
  // several lines of text (a bio, a news post, a track list): it turns into a writing box right where it is
  function openBlock(el) {
    var r = thing(el), field = el.getAttribute('data-ef');
    if (!r || el.style.display === 'none') return;
    var ta = document.createElement('textarea');
    ta.className = 'ed-area';
    ta.value = r.item[field] || '';
    ta.placeholder = 'Write here. An empty line starts a new paragraph.';
    var cs = getComputedStyle(el);
    ta.style.font = cs.font; ta.style.textAlign = 'left'; ta.style.lineHeight = cs.lineHeight;
    ta.style.minHeight = Math.max(120, el.offsetHeight) + 'px';
    el.style.display = 'none';
    el.parentNode.insertBefore(ta, el.nextSibling);
    var help = document.createElement('p');
    help.className = 'ed-help';
    help.textContent = HELP[field] || 'An empty line starts a new paragraph. **bold** and *italic* work. Click outside the box when you are done.';
    ta.parentNode.insertBefore(help, ta.nextSibling);
    function grow() { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 4 + 'px'; }
    ta.addEventListener('input', function () { r.item[field] = ta.value; grow(); saved(); });
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') ta.blur(); });
    ta.addEventListener('blur', function () { redraw(); });
    grow();
    ta.focus();
  }
  var HELP = {
    bio: 'Each section starts with ## and its name (## Education). Under it, one thing per line; “Title — 2021” puts the year on the right.',
    tracks: 'One track per line. To link a track: Title | https://…',
    credits: 'One credit per line.',
    quotes: 'One quote per paragraph, with the source on its own last line starting with — (— The Guardian).',
    awards: 'One per line: Prize — what it was for.',
    text: 'An empty line starts a new paragraph; a line with just ◆ makes a small diamond. **bold** and *italic* work.',
    story: 'An empty line starts a new paragraph; a line with just ◆ makes a small diamond.'
  };

  // ------------------------------------------------------------------ changing a picture
  function pictureMenu(el, x, y) {
    var r = thing(el), field = el.getAttribute('data-ef');
    menu(x, y, [
      ['Upload a new picture', function () {
        pickFiles(false).then(function (fs) {
          if (!fs.length) return;
          busy('Preparing the picture…');
          return uploadWebImage(fs[0], r.item.title || r.item.venue || fs[0].name).then(function (p) {
            var old = r.item[field]; r.item[field] = p; dropFile(old); saved(); redraw();
          });
        }).catch(function (e) { toast(e.message, true); }).then(function () { busy(''); });
      }],
      ['Choose one of your photos', function () {
        photoPicker(function (src) { var old = r.item[field]; r.item[field] = src; dropFile(old); saved(); redraw(); });
      }],
      r.item[field] ? ['Remove the picture', function () { var old = r.item[field]; delete r.item[field]; dropFile(old); saved(); redraw(); }] : null
    ]);
  }
  function photoPicker(done, current) {
    var d = sheet('Choose a photo', '<div class="ed-picker">' + D.photos.map(function (p, i) {
      return '<button data-pick="' + i + '" aria-pressed="' + (p.src === current) + '"><img src="' + esc(uploads[p.src] ? uploads[p.src].url : p.src) + '" alt="" loading="lazy"></button>';
    }).join('') + '</div>');
    d.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      if (b) { closeSheet(); done(D.photos[+b.getAttribute('data-pick')].src); }
    });
  }

  // ------------------------------------------------------------------ small menus and the side panel
  function menu(x, y, items) {
    closeMenu();
    var m = document.createElement('div');
    m.className = 'ed-menu';
    items.filter(Boolean).forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = it[0];
      if (it[2]) b.className = it[2];
      b.addEventListener('click', function (e) { e.stopPropagation(); closeMenu(); it[1](); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
    m.style.top = Math.max(8, Math.min(innerHeight - h - 70, y)) + 'px';
    setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0);
    function outside(e) { if (!m.contains(e.target)) { closeMenu(); } }
    closeMenu.fn = function () { document.removeEventListener('pointerdown', outside, true); m.remove(); };
  }
  function closeMenu() { if (closeMenu.fn) { closeMenu.fn(); closeMenu.fn = null; } }
  function sheet(title, html) {
    closeSheet();
    var s = document.createElement('aside');
    s.className = 'ed-sheet';
    s.innerHTML = '<div class="ed-sheet-head"><h2>' + esc(title) + '</h2><button type="button" class="ed-x" aria-label="Close">Close ✕</button></div><div class="ed-sheet-body">' + html + '</div>';
    document.body.appendChild(s);
    s.querySelector('.ed-x').addEventListener('click', closeSheet);
    s.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') closeSheet(); });
    document.documentElement.classList.add('ed-sheet-open');
    return s;
  }
  function closeSheet() {
    var s = $('.ed-sheet');
    if (s) s.remove();
    document.documentElement.classList.remove('ed-sheet-open');
  }

  // the details that are not written on the page itself (a date, a link, a TIDAL address…)
  var VIDEO_PAGES = [['Music-Video', 'Music videos'], ['With-Others', 'With others'], ['Instant-composition', 'Instant composition']];
  var FIELDS = {
    news: [['title', 'Headline'], ['date', 'Date', 'date'], ['text', 'Text', 'textarea'], ['image', 'Picture', 'image'], ['link', 'Button link', 'url'], ['link_label', 'Button text'], ['hidden', 'Hide this post', 'check']],
    shows: [['venue', 'Venue or festival'], ['date', 'Date', 'date'], ['end', 'Last day (festivals only)', 'date'], ['city', 'City'], ['country', 'Country'], ['with', 'With (e.g. múm)'], ['note', 'Note'],
      ['link', 'Tickets or info link', 'url'], ['status', 'Status', 'select', [['', 'On'], ['soldout', 'Sold out'], ['cancelled', 'Cancelled']]], ['image', 'Poster', 'image'], ['hidden', 'Hide this show', 'check']],
    work: [['title', 'Title'], ['section', 'Where', 'select', [['Albums', 'Albums (big cover)'], ['More', 'More work (small tile)']]], ['year', 'Year'], ['kind', 'Small label'], ['image', 'Cover', 'image'], ['text', 'One or two sentences', 'textarea'],
      ['buy', 'Bandcamp page (buy)', 'url'], ['player', 'Listen on', 'select', [['', 'Automatic: TIDAL, or Bandcamp if it isn’t on TIDAL'], ['tidal', 'TIDAL'], ['bandcamp', 'Bandcamp'], ['none', 'No player: the listen link below']]],
      ['tidal', 'TIDAL address', 'url'], ['bandcamp', 'Bandcamp player (embed code)'], ['listen', 'Other listen link', 'url'], ['listen_label', 'Other listen link name'],
      ['story', 'Album page: the story', 'textarea'], ['tracks_label', 'Album page: heading for the list'], ['tracks', 'Album page: tracks', 'textarea'], ['credits', 'Album page: credits', 'textarea'],
      ['quotes', 'Album page: press quotes', 'textarea'], ['awards', 'Album page: awards', 'textarea'], ['more_links', 'Album page: extra buttons (Label | https://…)', 'textarea'],
      ['background', 'Album page: faint background picture', 'image'], ['page', 'Page on this site (leave empty for albums)'], ['hidden', 'Hide this one', 'check']],
    films: [['title', 'Title'], ['category', 'Type', 'select', [['Film', 'Film'], ['Documentary', 'Documentary'], ['Art', 'Art & installation']]], ['year', 'Year'], ['director', 'Director / artist'], ['role', 'My role'],
      ['text', 'Text shown when opened', 'textarea'], ['link', 'Link', 'url'], ['link_label', 'Link text'], ['image', 'Picture', 'image'], ['hidden', 'Hide this one', 'check']],
    videos: [['title', 'Title'], ['page', 'Page', 'select', VIDEO_PAGES], ['youtube', 'YouTube address', 'url'], ['by', 'Small line under the title'], ['credits', 'Credits (one per line)', 'textarea'], ['hidden', 'Hide this video', 'check']],
    photos: [['credit', 'Photographer (credit)'], ['caption', 'Caption'], ['hidden', 'Hide this photo', 'check']],
    links: [['label', 'Name'], ['url', 'Address', 'url']],
    contact: [['email', 'My own email', 'email'], ['booking_name', 'Booking agency or name'], ['booking_email', 'Live booking email', 'email'], ['press_email', 'Email for press', 'email'], ['press_intro', 'Line at the top of the Photos page', 'textarea']]
  };
  var NAMES = { news: 'post', shows: 'concert', work: 'album', films: 'film', videos: 'video', photos: 'photo', site: 'link' };
  function details(r, kind, title) {
    var fields = FIELDS[kind || (r.list && r.file === 'site' ? 'links' : r.file)] || [];
    var o = r.item;
    var html = '<div class="ed-fields">' + fields.map(function (f) {
      var k = f[0], v = o[k] == null ? '' : o[k], t = f[2];
      if (t === 'email') v = decMail(v);
      if (t === 'check') return '<label class="ed-check"><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '> ' + esc(f[1]) + '</label>';
      if (t === 'image') return '<div class="ed-f"><span>' + esc(f[1]) + '</span><div class="ed-imgrow">' + (v ? '<img src="' + esc(uploads[v] ? uploads[v].url : v) + '" alt="">' : '<em>No picture</em>') +
        '<button type="button" class="ed-btn" data-img="' + k + '">' + (v ? 'Change' : 'Add') + '</button>' + (v ? '<button type="button" class="ed-btn" data-noimg="' + k + '">Remove</button>' : '') + '</div></div>';
      var inner = t === 'textarea' ? '<textarea data-k="' + k + '" rows="5">' + esc(v) + '</textarea>'
        : t === 'select' ? '<select data-k="' + k + '">' + f[3].map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(v) === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'
        : '<input type="' + (t === 'email' ? 'email' : t || 'text') + '" data-k="' + k + '"' + (t === 'email' ? ' data-enc' : '') + ' value="' + esc(v) + '">';
      return '<label class="ed-f"><span>' + esc(f[1]) + '</span>' + inner + '</label>';
    }).join('') + '</div>';
    var s = sheet(title || 'Details', html);
    var t;
    s.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k');
      if (!k) return;
      var v = e.target.type === 'checkbox' ? e.target.checked : e.target.hasAttribute('data-enc') ? encMail(e.target.value) : e.target.value;
      if (v === '' || v === false) delete o[k]; else o[k] = v;
      saved();
      clearTimeout(t);
      t = setTimeout(redraw, 500);   // the page follows a moment later
    });
    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-img]'), nb = e.target.closest('[data-noimg]');
      if (b) {
        var k = b.getAttribute('data-img');
        menu(b.getBoundingClientRect().left, b.getBoundingClientRect().bottom + 4, [
          ['Upload a new picture', function () {
            pickFiles(false).then(function (fs) {
              if (!fs.length) return;
              busy('Preparing the picture…');
              return uploadWebImage(fs[0], o.title || o.venue || fs[0].name).then(function (p) { var old = o[k]; o[k] = p; dropFile(old); saved(); redraw(); details(r, kind, title); });
            }).catch(function (err) { toast(err.message, true); }).then(function () { busy(''); });
          }],
          ['Choose one of your photos', function () { photoPicker(function (src) { var old = o[k]; o[k] = src; dropFile(old); saved(); redraw(); details(r, kind, title); }); }]
        ]);
      }
      if (nb) { var k2 = nb.getAttribute('data-noimg'), old = o[k2]; delete o[k2]; dropFile(old); saved(); redraw(); details(r, kind, title); }
    });
    var first = s.querySelector('input, textarea, select');
    if (first && !matchMedia('(hover: none)').matches) first.focus();
  }

  // ------------------------------------------------------------------ the little tools on each thing: drag, details, hide, delete
  var tools = null, toolsFor = null;
  function orderable(r) { return r && r.list && ['work', 'videos', 'films', 'photos'].indexOf(r.file) >= 0 || (r && r.file === 'site' && r.list); }
  function showTools(el) {
    var r = thing(el);
    if (!r || !r.list || (dragging && dragging.on)) return;
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'ed-tools';
      document.body.appendChild(tools);
      tools.addEventListener('pointerdown', function (e) { var g = e.target.closest('[data-t="drag"]'); if (g) startDrag(e, toolsFor); });
      tools.addEventListener('click', function (e) {
        var b = e.target.closest('[data-t]');
        if (!b || !toolsFor) return;
        var t = b.getAttribute('data-t'), x = thing(toolsFor);
        if (t === 'details') details(x, null, 'Details of this ' + (NAMES[x.file] || 'item'));
        if (t === 'more') {
          var rr = b.getBoundingClientRect();
          menu(rr.left - 120, rr.bottom + 4, [
            [x.item.hidden ? 'Show it again' : 'Hide it (keep it for later)', function () {
              if (x.item.hidden) delete x.item.hidden; else x.item.hidden = true;
              saved(); redraw();
              toast(x.item.hidden ? 'Hidden. It is still in the admin, and Undo all brings it back.' : 'Shown again.');
            }],
            ['Delete', function () {
              if (!confirm('Delete this ' + (NAMES[x.file] || 'item') + '?')) return;
              x.list.splice(x.list.indexOf(x.item), 1);
              ['image', 'background', 'src', 'hires'].forEach(function (k) { if (x.item[k]) dropFile(x.item[k]); });
              saved(); redraw();
            }, 'danger']
          ]);
        }
      });
    }
    toolsFor = el;
    tools.innerHTML = (orderable(r) ? '<button type="button" data-t="drag" title="Drag to move" aria-label="Drag to move">⠿</button>' : '') +
      '<button type="button" data-t="details" title="Details">✎ Details</button><button type="button" data-t="more" title="More" aria-label="More">⋯</button>';
    placeTools();
    tools.hidden = false;
  }
  function placeTools() {
    if (!tools || !toolsFor || !document.contains(toolsFor)) { if (tools) tools.hidden = true; return; }
    var b = toolsFor.getBoundingClientRect();
    if (!b.width) b = toolsFor.parentNode.getBoundingClientRect();   // the open news post has no box of its own
    tools.style.top = Math.max(6, b.top + 6) + 'px';
    tools.style.left = Math.max(6, Math.min(innerWidth - tools.offsetWidth - 6, b.right - tools.offsetWidth - 6)) + 'px';
  }

  // dragging a thing to a new place among its own kind
  var dragging = null;
  function startDrag(e, el) {
    var r = thing(el);
    if (!r || !orderable(r)) return;
    e.preventDefault();
    var b = el.getBoundingClientRect();
    dragging = { r: r, el: el, id: e.pointerId, on: true, ghost: el.cloneNode(true), target: null, after: false };
    var g = dragging.ghost;
    g.removeAttribute('data-ei');
    g.className += ' ed-ghost';
    g.style.width = Math.min(b.width, 320) + 'px';
    document.body.appendChild(g);
    el.classList.add('ed-moving');
    tools.hidden = true;
    document.documentElement.classList.add('ed-dragging');
    function same(x) { return x && x.list === r.list && x.item !== r.item && (r.file !== 'work' || (x.item.section === 'More') === (r.item.section === 'More')); }
    function move(ev) {
      if (ev.pointerId !== dragging.id) return;
      ev.preventDefault();
      g.style.transform = 'translate(' + (ev.clientX + 12) + 'px,' + (ev.clientY + 12) + 'px)';
      var over = document.elementFromPoint(ev.clientX, ev.clientY), t = over && over.closest('[data-ei]'), x = thing(t);
      document.querySelectorAll('.ed-before, .ed-after').forEach(function (n) { n.classList.remove('ed-before', 'ed-after'); });
      dragging.target = null;
      if (t && same(x)) {
        var rr = t.getBoundingClientRect(), wide = rr.width > t.parentNode.getBoundingClientRect().width * 0.7;
        dragging.after = wide ? ev.clientY > rr.top + rr.height / 2 : ev.clientX > rr.left + rr.width / 2;
        t.classList.add(dragging.after ? 'ed-after' : 'ed-before');
        if (!wide) t.classList.add('ed-side');
        dragging.target = x;
      }
      edgeScroll(ev.clientY);
    }
    function up(ev) {
      if (ev.pointerId !== dragging.id) return;
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('touchmove', still, { passive: false });
      cancelAnimationFrame(edgeScroll.raf);
      g.remove();
      el.classList.remove('ed-moving');
      document.documentElement.classList.remove('ed-dragging');
      document.querySelectorAll('.ed-before, .ed-after').forEach(function (n) { n.classList.remove('ed-before', 'ed-after', 'ed-side'); });
      var d = dragging; dragging = null;
      if (ev.type === 'pointercancel' || !d.target) return;
      var list = r.list;
      list.splice(list.indexOf(r.item), 1);
      list.splice(list.indexOf(d.target.item) + (d.after ? 1 : 0), 0, r.item);
      saved();
      redraw();
    }
    function still(ev) { ev.preventDefault(); }
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('touchmove', still, { passive: false });
    move(e);
  }
  function edgeScroll(y) {
    cancelAnimationFrame(edgeScroll.raf);
    var v = y < 90 ? y - 90 : y > innerHeight - 110 ? y - (innerHeight - 110) : 0;
    if (!v) return;
    var sc = getComputedStyle(document.body).position === 'fixed' ? $('.app-main') : null;   // phones: About-style pages scroll inside
    edgeScroll.raf = requestAnimationFrame(function step() {
      if (!dragging) return;
      var d = Math.max(-20, Math.min(20, v / 3));
      if (sc) sc.scrollTop += d; else window.scrollBy(0, d);
      edgeScroll.raf = requestAnimationFrame(step);
    });
  }

  // ------------------------------------------------------------------ adding new things
  function addButtons() {
    if ($('.ed-add') || !$('#app')) return;
    var view = api.view, list = [];
    var slugAttr = document.body.getAttribute('data-slug') || '';
    if (view === 'news') list.push(['+ New post', function () { return add('news', { date: todayISO(), title: 'New post', text: '' }); }]);
    if (view === 'live') list.push(['+ New concert', function () { return add('shows', { venue: 'New concert', date: todayISO(), city: '', country: '' }); }]);
    if (view === 'work') list.push(['+ New album', function () { return add('work', { section: 'Albums', title: 'New album', year: String(new Date().getFullYear()), kind: 'Album' }); }]);
    if (view === 'film') list.push(['+ New film', function () { return add('films', { category: 'Film', title: 'New film', year: String(new Date().getFullYear()) }); }]);
    if (view === 'videos') list.push(['+ New video', function () { return add('videos', { page: slugAttr, title: 'New video', youtube: '' }, 'Paste the YouTube address, and the video appears on the page.'); }]);
    if (view === 'photos') list.push(['+ Add photos', addPhotos]);
    if (view === 'contact') list.push(['+ New link', function () { D.site.links = D.site.links || []; D.site.links.push({ label: 'New link', url: '' }); saved(); redraw(); details({ item: D.site.links[D.site.links.length - 1], file: 'site', list: D.site.links }, 'links', 'The new link'); }],
      ['Emails…', function () { details({ item: D.site, file: 'site' }, 'contact', 'Emails'); }]);
    if (!list.length) return;
    var bar = document.createElement('div');
    bar.className = 'ed-add';
    list.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ed-btn solid'; b.textContent = x[0];
      b.addEventListener('click', x[1]);
      bar.appendChild(b);
    });
    $('#app').parentNode.insertBefore(bar, $('#app'));
  }
  function add(file, blank, hint) {
    D[file].unshift(blank);
    saved();
    return redraw().then(function () {
      details({ item: blank, file: file, list: D[file] }, file, 'The new ' + NAMES[file]);
      if (hint) toast(hint);
    });
  }
  function addPhotos() {
    var credit = (D.photos[0] && D.photos[0].credit) || '';
    pickFiles(true).then(function (files) {
      files = files.filter(function (f) { if (f.size > 45 * 1048576) { toast(f.name + ' is too big (over 45 MB) and was skipped.', true); return false; } return true; });
      if (!files.length) return;
      busy('Preparing ' + files.length + ' photo' + (files.length === 1 ? '' : 's') + '…');
      var added = 0;
      return files.reduce(function (chain, f) {
        return chain.then(function () {
          return webCopy(f).then(function (r) {
            var base = slug(f.name), ext = (f.name.match(/\.([a-z0-9]+)$/i) || [, 'jpg'])[1].toLowerCase().replace('jpeg', 'jpg');
            var item = { src: addUpload(uniquePath('images', base, 'jpg'), r.blob), hires: addUpload(uniquePath('press', base, ext), f), width: r.width, height: r.height, bytes: f.size, credit: credit, caption: '' };
            D.photos.splice(added++, 0, item);
            return webCopy(f, 720).then(function (t) { addUpload(thumbPath(item.src), t.blob); });
          });
        });
      }, Promise.resolve()).then(function () {
        saved(); redraw();
        toast(added + ' photo' + (added === 1 ? '' : 's') + ' added at the start. Check the photographer’s name under each, then Publish.');
      });
    }).catch(function (e) { toast(e.message, true); }).then(function () { busy(''); });
  }

  // ------------------------------------------------------------------ the page's own photo (Look) and the front page photo
  var LK = window.GYDA_LOOK;
  function pagePhoto() {
    if (api.view === 'front') return frontPhoto();
    var look = D.site.look = D.site.look || {}; look.pages = look.pages || {};
    var p = look.pages[key] = look.pages[key] || { layout: 'none' };
    var contact = api.view === 'contact', layout = contact ? 'contact' : (LK.LAYOUTS[p.layout] ? p.layout : 'none');
    var bright = p.bright == null ? LK.BRIGHT[layout] : p.bright, fp = p.focus || '50% 50%';
    var s = sheet('The page’s photo', (contact ? '' : '<p class="ed-label">How the photo sits</p><div class="ed-layouts">' + Object.keys(LK.LAYOUTS).map(function (l) {
      return '<button type="button" data-layout="' + l + '" aria-pressed="' + (l === layout) + '">' + esc(LK.LAYOUTS[l]) + '</button>';
    }).join('') + '</div>') +
      (p.photo && layout !== 'none' ? '<p class="ed-label">Click the part that should always be seen</p><div class="ed-focus"><img src="' + esc(uploads[p.photo] ? uploads[p.photo].url : p.photo) + '" alt="" style="object-position:' + esc(fp) + '"><i style="left:' + esc(fp.split(' ')[0]) + ';top:' + esc(fp.split(' ')[1] || '50%') + '"></i></div>' +
        '<label class="ed-f"><span>Brightness · <b>' + bright + '</b></span><input type="range" min="0" max="100" data-bright value="' + bright + '"></label>' : '') +
      '<p class="ed-label">The photo</p><div class="ed-row"><button type="button" class="ed-btn" data-up>Upload a photo</button>' + (p.photo ? '<button type="button" class="ed-btn" data-none>No photo</button>' : '') + '</div>' +
      '<div class="ed-picker">' + D.photos.map(function (ph, i) { return '<button type="button" data-pick="' + i + '" aria-pressed="' + (ph.src === p.photo) + '"><img src="' + esc(uploads[ph.src] ? uploads[ph.src].url : ph.src) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>');
    function apply(again) {
      var copy = JSON.parse(JSON.stringify(p));
      if (copy.photo && uploads[copy.photo]) copy.photo = uploads[copy.photo].url;
      LK.applyPage(document, copy);
      saved();
      if (again) pagePhoto();
    }
    s.addEventListener('input', function (e) {
      if (e.target.hasAttribute('data-bright')) { p.bright = +e.target.value; e.target.previousElementSibling.querySelector('b').textContent = e.target.value; apply(); }
    });
    s.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-layout]'))) { p.layout = b.getAttribute('data-layout'); delete p.bright; return apply(true); }
      if ((b = e.target.closest('[data-pick]'))) { p.photo = D.photos[+b.getAttribute('data-pick')].src; if (layout === 'none') p.layout = 'behind'; return apply(true); }
      if (e.target.closest('[data-none]')) { var was = p.photo; delete p.photo; dropFile(was); return apply(true); }
      if (e.target.closest('[data-up]')) {
        pickFiles(false).then(function (fs) {
          if (!fs.length) return;
          busy('Preparing the photo…');
          return uploadWebImage(fs[0], 'page-' + key.toLowerCase()).then(function (path) { var was = p.photo; p.photo = path; if (p.layout === 'none') p.layout = 'behind'; dropFile(was); apply(true); });
        }).catch(function (err) { toast(err.message, true); }).then(function () { busy(''); });
        return;
      }
      var f = e.target.closest('.ed-focus');
      if (f) {
        var r = f.querySelector('img').getBoundingClientRect();
        var x = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100), y = Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 100);
        p.focus = x + '% ' + y + '%';
        f.querySelector('img').style.objectPosition = p.focus;
        f.querySelector('i').style.left = x + '%'; f.querySelector('i').style.top = y + '%';
        apply();
      }
    });
  }
  function frontPhoto() {
    var s0 = D.site, fp = s0.hero_focus || '50% 50%';
    var s = sheet('The front page photo', '<p class="ed-label">Click the part that should always be seen</p><div class="ed-focus"><img src="' + esc(uploads[s0.hero] ? uploads[s0.hero].url : s0.hero) + '" alt="" style="object-position:' + esc(fp) + '"><i style="left:' + esc(fp.split(' ')[0]) + ';top:' + esc(fp.split(' ')[1] || '50%') + '"></i></div>' +
      '<p class="ed-label">Another photo</p><div class="ed-row"><button type="button" class="ed-btn" data-up>Upload a photo</button></div><div class="ed-picker">' +
      D.photos.map(function (ph, i) { return '<button type="button" data-pick="' + i + '" aria-pressed="' + (ph.src === s0.hero) + '"><img src="' + esc(uploads[ph.src] ? uploads[ph.src].url : ph.src) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>');
    function apply(again) {
      var im = $('.hero-img');
      if (im) {
        im.src = uploads[s0.hero] ? uploads[s0.hero].url : s0.hero;
        var f = String(s0.hero_focus || '50% 50%').split(' ');
        im.style.setProperty('--fx', f[0]); im.style.setProperty('--fy', f[1] || '50%');
      }
      saved();
      if (again) frontPhoto();
    }
    s.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-pick]'))) { s0.hero = D.photos[+b.getAttribute('data-pick')].src; return apply(true); }
      if (e.target.closest('[data-up]')) {
        pickFiles(false).then(function (fs) {
          if (!fs.length) return;
          busy('Preparing the photo…');
          return webCopy(fs[0], 2600).then(function (r) {
            var was = s0.hero;
            s0.hero = addUpload(uniquePath('images', 'front-' + slug(fs[0].name), 'jpg'), r.blob);
            s0.hero_focus = '50% 40%';
            return webCopy(fs[0], 720).then(function (t) { addUpload(thumbPath(s0.hero), t.blob); dropFile(was); apply(true); });
          });
        }).catch(function (err) { toast(err.message, true); }).then(function () { busy(''); });
        return;
      }
      var f = e.target.closest('.ed-focus');
      if (f) {
        var r = f.querySelector('img').getBoundingClientRect();
        var x = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100), y = Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 100);
        s0.hero_focus = x + '% ' + y + '%';
        f.querySelector('img').style.objectPosition = s0.hero_focus;
        f.querySelector('i').style.left = x + '%'; f.querySelector('i').style.top = y + '%';
        apply();
      }
    });
  }
  // the page's title and the small line above it belong to the Look (album pages: the album's own title)
  function titles() {
    if (!key || api.view === 'album' || api.view === 'front') return;
    var look = D.site.look = D.site.look || {}; look.pages = look.pages || {};
    var p = look.pages[key] = look.pages[key] || {};
    var t = $('.page-title'), k = $('.app-main > .kicker');
    if (t) { if (p.title == null) p.title = t.textContent; t.setAttribute('data-ei', ED.id(p, 'site')); t.setAttribute('data-ef', 'title'); }
    if (k) { if (p.kicker == null) p.kicker = k.textContent; k.setAttribute('data-ei', ED.id(p, 'site')); k.setAttribute('data-ef', 'kicker'); }
  }

  // ------------------------------------------------------------------ drawing the page again
  function redraw() {
    var y = scrollY, m = $('.app-main'), my = m ? m.scrollTop : 0;
    var open = $('.reader:not([hidden]) .body[data-ei]'), openItem = open ? thing(open).item : null;
    closeMenu();
    if (tools) tools.hidden = true;
    return Promise.resolve(api.draw()).then(function () {
      titles();
      decorate(document);
      window.scrollTo(0, y);
      var m2 = $('.app-main'); if (m2 && my) m2.scrollTop = my;
      if (openItem) {   // a news post that was open stays open
        var c = document.querySelector('[data-n][data-ei="' + regMap.get(openItem).id + '"]');
        if (c) c.click();
      }
    });
  }

  // ------------------------------------------------------------------ the bar, saving, publishing
  function saved() {
    var n = changes();
    $('#ed-status').textContent = n ? n + ' change' + (n === 1 ? '' : 's') + ', not published yet' : 'Everything is published';
    $('#ed-publish').disabled = !n;
    $('#ed-undo').disabled = !n;
    // texts are kept in this browser, so a reload or another page carries on (new pictures are not: publish them first)
    try {
      if (n) localStorage.setItem(DRAFT, JSON.stringify({ base: sha, files: FILES.reduce(function (o, f) { if (changed(f)) o[f] = text(f); return o; }, {}), pics: Object.keys(uploads).length }));
      else localStorage.removeItem(DRAFT);
    } catch (e) { /* private browsing */ }
  }
  function busy(msg) { var b = $('#ed-busy'); b.textContent = msg; b.hidden = !msg; }
  function bar() {
    var b = document.createElement('div');
    b.className = 'ed-bar';
    b.innerHTML = '<span class="ed-mark">✎ Editing</span><span id="ed-status" class="ed-status"></span><span id="ed-busy" class="ed-busy" hidden></span>' +
      '<span class="ed-btns">' + (key || api.view === 'front' ? '<button type="button" class="ed-btn" id="ed-photo"><span class="ed-long">' + (api.view === 'front' ? 'Front ' : 'Page ') + '</span>photo</button>' : '') +
      '<a class="ed-btn ed-long" id="ed-admin" href="' + esc(document.body.getAttribute('data-admin') || 'admin/') + '">Admin</a><button type="button" class="ed-btn" id="ed-undo">Undo<span class="ed-long"> all</span></button>' +
      '<button type="button" class="ed-btn" id="ed-done">Done</button><button type="button" class="ed-btn solid" id="ed-publish">Publish</button></span>';
    document.body.appendChild(b);
    var t = document.createElement('div'); t.id = 'ed-toast'; t.className = 'ed-toast'; t.hidden = true; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    if ($('#ed-photo')) $('#ed-photo').addEventListener('click', pagePhoto);
    $('#ed-undo').addEventListener('click', function () {
      if (!confirm('Undo every change since the last Publish?')) return;
      Object.keys(uploads).forEach(function (p) { URL.revokeObjectURL(uploads[p].url); });
      uploads = {}; removals = {};
      FILES.forEach(function (n) { replace(n, JSON.parse(orig[n])); });
      saved(); closeSheet(); redraw();
    });
    $('#ed-done').addEventListener('click', function () {
      if (Object.keys(uploads).length && !confirm('Your new pictures are lost if you leave without publishing. Leave anyway?')) return;
      if (changes() && !Object.keys(uploads).length) toast('Your changes are kept in this browser until you publish or undo them.');
      leave(location.pathname + location.search.replace(/([?&])edit\b&?/, '$1').replace(/[?&]$/, '') + location.hash);
    });
    $('#ed-publish').addEventListener('click', publish);
  }
  function leave(url) { window.onbeforeunload = null; quiet = true; location.href = url; }
  var quiet = false;
  // keep the same objects (the page holds them), only their contents change
  function replace(n, v) {
    var o = D[n];
    if (Array.isArray(o)) { o.length = 0; Array.prototype.push.apply(o, v); }
    else { Object.keys(o).forEach(function (k) { delete o[k]; }); Object.assign(o, v); }
  }
  function publish() {
    var files = FILES.filter(changed), ups = Object.keys(uploads), dels = Object.keys(removals).filter(function (p) { return !used(p); });
    if (!files.length && !ups.length && !dels.length) return;
    if (LOCAL) { alert('Local test: Publish would save\n\n' + files.map(function (f) { return 'data/' + f + '.json'; }).concat(ups.map(function (p) { return '+ ' + p; })).concat(dels.map(function (p) { return '− ' + p; })).join('\n')); return; }
    var btn = $('#ed-publish'), adds = {}, body = { files: {}, shas: {}, adds: adds, dels: dels }, done = 0;
    btn.disabled = true; btn.textContent = 'Publishing…';
    files.forEach(function (f) { body.files[f] = text(f); body.shas[f] = sha[f]; });
    ups.reduce(function (chain, path) {
      return chain.then(function () {
        busy('Uploading pictures… ' + (++done) + ' of ' + ups.length);
        return new Promise(function (res, rej) {
          var fr = new FileReader();
          fr.onload = function () { res(String(fr.result).split(',')[1]); };
          fr.onerror = rej;
          fr.readAsDataURL(uploads[path].blob);
        }).then(function (b64) { return SERVICE.call('POST', '/blob', { content: b64, encoding: 'base64' }); }).then(function (b) { adds[path] = b.sha; });
      });
    }, Promise.resolve()).then(function () {
      busy('Saving…');
      return SERVICE.call('POST', '/publish', body);
    }).then(function () {
      return fetchData();
    }).then(function (res) {
      take(res, true);
      uploads = {}; removals = {};
      saved();
      toast('Published! Visitors see it in a minute or two.');
    }).catch(function (e) {
      toast('Not published: ' + (e.status === 401 ? 'please sign in again in the admin (your changes stay here).' : e.message), true);
    }).then(function () { busy(''); btn.textContent = 'Publish'; saved(); });
  }
  function fetchData() {
    if (!LOCAL) return SERVICE.call('GET', '/data');
    var files = {};
    return Promise.all(FILES.concat(['calendar']).map(function (n) {
      return fetch('data/' + n + '.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) { if (t != null) files[n] = { text: t, sha: 'local' }; });
    })).then(function () { return { files: files }; });
  }
  function take(res, keepObjects) {
    FILES.forEach(function (n) {
      var r = res.files[n] || { text: n === 'site' ? '{}\n' : '[]\n', sha: null }, v = JSON.parse(r.text);
      if (keepObjects && D[n]) replace(n, v); else D[n] = v;
      orig[n] = text(n);
      sha[n] = r.sha;
    });
    try { cal = res.files.calendar ? JSON.parse(res.files.calendar.text) : []; } catch (e) { cal = []; }
  }

  // ------------------------------------------------------------------ start
  function boot(a) {
    api = a;
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'css/edit.css?v=' + Date.now().toString(36);
    document.head.appendChild(css);
    document.documentElement.classList.add('editing');
    return fetchData().then(function (res) {
      take(res);
      // carry on with changes from before (another page, or a reload), if the website hasn't changed since
      try {
        var d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
        if (d && FILES.every(function (n) { return (d.base || {})[n] === sha[n]; })) {
          Object.keys(d.files).forEach(function (n) { if (D[n] !== undefined) D[n] = JSON.parse(d.files[n]); });
        } else if (d) localStorage.removeItem(DRAFT);
      } catch (e) { /* nothing kept */ }
      api.use({ site: D.site, about: D.about, work: D.work, videos: D.videos, news: D.news, shows: D.shows, films: D.films, photos: D.photos, calendar: cal });
      api.link(ED);
      bar();
      saved();
      // clicks on the words and pictures being edited don't open links or the page's own things
      window.addEventListener('click', function (e) {
        if (e.target.closest('.ed-bar, .ed-sheet, .ed-menu, .ed-tools, .ed-add')) return;
        var ef = e.target.closest('[data-ef]');
        if (ef && thing(ef)) {
          e.preventDefault();
          e.stopPropagation();
          var k = ef.getAttribute('data-ek');
          if (k === 'img') pictureMenu(ef, e.clientX, e.clientY);
          if (k === 'block') openBlock(ef);
          return;
        }
        var a = e.target.closest('a[href]');
        if (a && a.origin === location.origin && !/\/admin\//.test(a.pathname) && !a.hasAttribute('download') && a.target !== '_blank') {
          // other pages of the site open in edit mode too
          e.preventDefault();
          if (Object.keys(uploads).length && !confirm('Your new pictures are lost if you leave this page without publishing. Go anyway?')) return;
          leave(a.pathname + (a.search ? a.search + '&' : '?') + 'edit' + (LOCAL ? '&local' : '') + a.hash);
        }
      }, true);
      document.addEventListener('pointerover', function (e) {
        if (dragging) return;
        var it = e.target.closest('[data-ei]');
        if (it && thing(it) && thing(it).list) showTools(it);
      });
      addEventListener('scroll', placeTools, { passive: true, capture: true });
      addEventListener('resize', placeTools);
      window.addEventListener('beforeunload', function (e) {
        if (!quiet && Object.keys(uploads).length) { e.preventDefault(); e.returnValue = ''; }
      });
      new MutationObserver(function () { decorate(document); }).observe(document.body, { childList: true, subtree: true });
      return redraw();
    }).catch(function (e) {
      if (e.status === 401) {
        document.documentElement.classList.remove('editing');
        alert('Please sign in again in the admin first. Then press Edit this page again.');
        leave('admin/');
      }
      throw e;
    });
  }
  window.GYDA_EDIT = { boot: boot };
})();
