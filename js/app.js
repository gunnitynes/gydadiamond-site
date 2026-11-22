/* Renders the parts of the site that come from data/*.json, so changes made in /admin/
   show up without rebuilding anything:
     - the top menu on every page, and the whole front page
     - FILM, LIVE, NEWS and PHOTOS
   With ?preview in the address, the admin's unsaved drafts (localStorage) are shown instead. */
(function () {
  'use strict';
  var PREVIEW = /[?&]preview\b/.test(location.search);
  var view = document.body.getAttribute('data-view') || '';

  // Font try-out: add ?font=raleway (etc.) to any page address to see the headings in another font.
  // It sticks while browsing in that tab; ?font=off goes back to the normal one.
  var FONTS = {
    jost: ['Jost', 'Jost:wght@300;400'], josefin: ['Josefin Sans', 'Josefin+Sans:wght@300;400'],
    raleway: ['Raleway', 'Raleway:wght@300;400'], redhat: ['Red Hat Display', 'Red+Hat+Display:wght@300;400'],
    outfit: ['Outfit', 'Outfit:wght@300;400'], dmsans: ['DM Sans', 'DM+Sans:opsz,wght@9..40,300;9..40,400'],
    manrope: ['Manrope', 'Manrope:wght@300;400'], karla: ['Karla', 'Karla:wght@300;400'],
    syne: ['Syne', 'Syne:wght@400;500'], cormorant: ['Cormorant Garamond', 'Cormorant+Garamond:wght@300;400']
  };
  (function () {
    var m = location.search.match(/[?&]font=([a-z]+)/), f;
    try {
      if (m) { if (m[1] === 'off') sessionStorage.removeItem('gyda.font'); else sessionStorage.setItem('gyda.font', m[1]); }
      f = FONTS[sessionStorage.getItem('gyda.font')];
    } catch (e) { f = m && FONTS[m[1]]; }
    if (!f) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + f[1] + '&display=swap';
    document.head.appendChild(l);
    document.documentElement.style.setProperty('--display', '"' + f[0] + '", sans-serif');
  })();
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var cache = {};
  function load(name) { return cache[name] || (cache[name] = load1(name)); }
  function load1(name) {
    if (PREVIEW) {
      try {
        var d = localStorage.getItem('gyda-draft:' + name);
        if (d) return Promise.resolve(JSON.parse(d));
      } catch (e) { /* fall through to the published file */ }
    }
    return fetch('data/' + name + '.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Plain text with blank lines between paragraphs; links are made clickable; **bold** and *italic* work.
  function prose(text) {
    return String(text || '').trim().split(/\n\s*\n/).map(function (para) {
      var h = esc(para)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?]|$)/g, '$1<i>$2</i>')
        .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
        .replace(/\n/g, '<br>');
      return '<p>' + h + '</p>';
    }).join('');
  }
  // small preview (images/t/, 720px) for grids; falls back to the full picture if there is none
  function thumbImg(src, attrs) {
    var t = /^images\/[^/]+$/.test(src || '') ? 'images/t/' + src.slice(7).replace(/\.[a-z]+$/i, '.jpg') : src;
    return '<img src="' + esc(t) + '"' + (t !== src ? ' onerror="this.onerror=null;this.src=\'' + esc(src) + '\'"' : '') + ' ' + (attrs || '') + '>';
  }
  function ext(url) { return /^https?:/.test(url || '') ? ' target="_blank" rel="noopener"' : ''; }
  function parseDate(s) { var p = String(s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function fmtDay(s) { var d = parseDate(s); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function fmtLong(s) { var d = parseDate(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function here(href) {
    var path = location.pathname.replace(/\/$/, '/index').split('/').pop().replace(/\.html$/, '');
    return href.replace(/\.html$/, '').replace(/^\.\//, 'index').toLowerCase() === path.toLowerCase();
  }

  // ------------------------------------------------------------ shows (shared by LIVE and the front page)
  function allShows() {
    return Promise.all([load('shows'), load('calendar')]).then(function (r) {
      var list = (r[0] || []).slice(), seen = {};
      list.forEach(function (s) { seen[s.date + '|' + String(s.venue).toLowerCase()] = 1; });
      (r[1] || []).forEach(function (s) { if (!seen[s.date + '|' + String(s.venue).toLowerCase()]) list.push(s); });
      return list.filter(function (s) { return s && s.date && !s.hidden; })
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    });
  }
  function isUpcoming(s) { return parseDate(s.end || s.date) >= today(); }
  function place(s) { return [s.city, s.country].filter(Boolean).join(', '); }

  // ------------------------------------------------------------ top menu on every page but home
  function renderNav(site) {
    var bar = document.querySelector('.topbar');
    if (!bar || !site) return;
    var links = (site.menu || []).filter(function (m) { return !m.hidden; }).map(function (m) {
      return '<a href="' + esc(m.href) + '"' + (here(m.href) ? ' aria-current="page"' : '') + '>' + esc(m.label) + '</a>';
    }).join('');
    bar.innerHTML = '<a class="home" href="./">◆ ' + esc((site.short_name || 'GYDA')) + '</a><nav aria-label="Main">' + links + '</nav>';
  }

  // ------------------------------------------------------------ live booking contact (LIVE header, CONTACT page)
  function renderBooking(site) {
    if (!site || !site.booking_email) return;
    var m = '<a href="mailto:' + esc(site.booking_email) + '">' + esc(site.booking_email) + '</a>';
    var who = site.booking_name ? esc(site.booking_name) : '';
    document.querySelectorAll('[data-booking]').forEach(function (el) {
      el.innerHTML = 'Live booking' + (who ? ' · ' + who : '') + ' · ' + m;
    });
    document.querySelectorAll('[data-booking-contact]').forEach(function (el) {
      el.innerHTML = 'Live booking' + (who ? ' · ' + who : '') + '<br>' + m;
    });
  }

  // ------------------------------------------------------------ front page
  function renderFront(site) {
    var el = document.querySelector('.hero');
    if (!el || !site) return Promise.resolve();
    var img = el.querySelector('.hero-img');
    if (img && site.hero && img.getAttribute('src') !== site.hero) img.src = site.hero;
    if (img) img.style.objectPosition = site.hero_focus || '50% 50%';
    var text = el.querySelector('.hero-text');
    var menu = (site.menu || []).filter(function (m) { return !m.hidden; }).map(function (m) {
      return '<a href="' + esc(m.href) + '">◆ ' + esc(String(m.label).toUpperCase()) + ' ◆</a>';
    }).join('');
    text.innerHTML = '<h1>' + esc(site.name) + '</h1><p class="tagline">' + esc(site.tagline) + '</p>' +
      '<nav class="hero-menu" aria-label="Main">' + menu + '</nav>';
    if (site.show_next_show === false) return Promise.resolve();
    return allShows().then(function (shows) {
      var next = shows.filter(function (s) { return isUpcoming(s) && s.status !== 'cancelled'; })[0];
      if (!next) return;
      var a = document.createElement('a');
      a.className = 'next-show';
      a.href = 'LIVE';
      a.innerHTML = '<b>Next</b><span>' + esc(fmtDay(next.date)) + '</span><span>' + esc(next.venue) +
        (next.city ? ', ' + esc(next.city) : '') + '</span>';
      text.appendChild(a);
    });
  }

  // ------------------------------------------------------------ FILM
  function renderFilm(films) {
    var root = document.getElementById('app');
    var cats = [['Film', 'Film'], ['Documentary', 'Documentary'], ['Art', 'Art & installation']];
    var html = '';
    var known = cats.map(function (c) { return c[0]; });
    (films || []).forEach(function (f) { if (known.indexOf(f.category) < 0) { known.push(f.category); cats.push([f.category, f.category]); } });
    var n = 0;
    cats.forEach(function (c) {
      var items = (films || []).filter(function (f) { return f.category === c[0] && !f.hidden; });
      if (!items.length) return;
      html += '<h2 class="section-label">' + esc(c[1]) + '</h2><ul class="film-list">';
      items.forEach(function (f) {
        var id = 'film-' + (n++);
        var who = [f.director ? 'by ' + f.director : '', f.role].filter(Boolean).join(' · ');
        html += '<li class="film"><button aria-expanded="false" aria-controls="' + id + '">' +
          '<span class="yr">' + esc(f.year) + '</span>' +
          '<span class="ttl">' + esc(f.title) + '<span class="who">' + esc(who) + '</span></span>' +
          '<span class="plus" aria-hidden="true">+</span></button>' +
          '<div class="more" id="' + id + '"><div><div class="more-in">' +
          (f.image ? thumbImg(f.image, 'alt="" loading="lazy"') : '') +
          '<div><p class="role">' + esc(f.role || '') + (f.year ? ' · ' + esc(f.year) : '') + '</p>' +
          '<div class="prose">' + (f.text ? prose(f.text) : '<p>' + esc(f.director ? 'Directed by ' + f.director + '.' : '') + '</p>') + '</div>' +
          (f.link ? '<a class="btn" href="' + esc(f.link) + '"' + ext(f.link) + '>' + esc(f.link_label || linkName(f.link)) + ' ↗</a>' : '') +
          '</div></div></div></div></li>';
      });
      html += '</ul>';
    });
    root.innerHTML = html || '<p class="empty">Nothing here yet.</p>';
    root.addEventListener('click', function (e) {
      var b = e.target.closest('.film > button');
      if (!b) return;
      var li = b.parentNode, open = !li.classList.contains('open');
      li.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open);
    });
  }
  function linkName(url) {
    if (/spotify/.test(url)) return 'Listen on Spotify';
    if (/imdb/.test(url)) return 'IMDb';
    if (/youtube|youtu\.be|vimeo/.test(url)) return 'Watch';
    if (/bandcamp/.test(url)) return 'Bandcamp';
    return 'More';
  }

  // ------------------------------------------------------------ LIVE
  function icsFor(s) {
    var d = s.date.replace(/-/g, ''), e = parseDate(s.end || s.date);
    e.setDate(e.getDate() + 1);
    var end = e.getFullYear() + ('0' + (e.getMonth() + 1)).slice(-2) + ('0' + e.getDate()).slice(-2);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gydadiamond.net//live//EN', 'BEGIN:VEVENT',
      'UID:' + d + '-' + String(s.venue).replace(/\W+/g, '') + '@gydadiamond.net',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + end,
      'SUMMARY:Gyða Valtýsdóttir' + (s.with ? ' (with ' + s.with + ')' : '') + ' – ' + s.venue,
      'LOCATION:' + [s.venue, place(s)].filter(Boolean).join(', ').replace(/,/g, '\\,'),
      s.link ? 'URL:' + s.link : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }
  function renderLive(site) {
    var root = document.getElementById('app');
    return allShows().then(function (shows) {
      var up = shows.filter(isUpcoming);
      var past = shows.filter(function (s) { return !isUpcoming(s); }).reverse();
      var h = '<h2 class="section-label">Upcoming</h2>';
      if (up.length) {
        h += '<div class="shows-next">' + up.map(function (s) {
          var d = parseDate(s.date);
          var tags = '';
          if (s.with) tags += '<span class="tag' + (/múm/i.test(s.with) ? ' hot' : '') + '">with ' + esc(s.with) + '</span>';
          if (s.status === 'cancelled') tags += '<span class="tag hot">Cancelled</span>';
          if (s.status === 'soldout') tags += '<span class="tag hot">Sold out</span>';
          if (s.end && s.end !== s.date) tags += '<span class="tag">until ' + esc(fmtDay(s.end)) + '</span>';
          return '<article class="show-card"><div class="show-date"><span class="d">' + d.getDate() + '</span><span class="m">' +
            MONTHS[d.getMonth()] + '</span><span class="y">' + d.getFullYear() + '</span></div>' +
            '<div><h3>' + esc(s.venue) + '</h3><p class="place">' + esc(place(s)) + '</p>' +
            (s.note ? '<p class="place">' + esc(s.note) + '</p>' : '') +
            (tags ? '<div class="tags">' + tags + '</div>' : '') + '</div>' +
            '<div class="acts">' +
            (s.link && s.status !== 'cancelled' ? '<a class="btn solid" href="' + esc(s.link) + '"' + ext(s.link) + '>' + (s.status === 'soldout' ? 'Info' : 'Tickets') + ' ↗</a>' : '') +
            (s.status !== 'cancelled' ? '<a class="btn" href="' + icsFor(s) + '" download="gyda-' + esc(s.date) + '.ics">+ Calendar</a>' : '') +
            (s.image ? '<a href="' + esc(s.image) + '" target="_blank"><img class="poster" src="' + esc(s.image) + '" alt="Poster" loading="lazy"></a>' : '') +
            '</div></article>';
        }).join('') + '</div>';
      } else {
        var bm = (site && (site.booking_email || site.email)) || '';
        // the booking contact is already in the page header when one is set
        h += '<div class="no-shows"><p>No dates announced right now.</p>' + (site && site.booking_email ? '' :
          '<p>For concerts: <a href="mailto:' + esc(bm) + '">' + esc(bm) + '</a></p>') + '</div>';
      }
      if (past.length) {
        h += '<h2 class="section-label">Past</h2>';
        var years = {};
        past.forEach(function (s) { var y = s.date.slice(0, 4); (years[y] = years[y] || []).push(s); });
        Object.keys(years).sort().reverse().forEach(function (y, i) {
          var list = years[y];
          h += '<section class="year' + (i === 0 ? ' open' : '') + '"><button aria-expanded="' + (i === 0) + '">' + y +
            ' <small>' + list.length + (list.length === 1 ? ' concert' : ' concerts') + '</small></button><ol>' +
            list.map(function (s) {
              var what = s.link ? '<a href="' + esc(s.link) + '"' + ext(s.link) + '>' + esc(s.venue) + '</a>' : esc(s.venue);
              return '<li class="' + (s.status === 'cancelled' ? 'cancelled' : '') + '"><span class="when">' + esc(fmtDay(s.date)) + '</span>' +
                '<span class="what">' + what + (place(s) ? '<span class="sep">·</span>' + esc(place(s)) : '') +
                (s.note ? '<span class="sep">·</span><i>' + esc(s.note) + '</i>' : '') +
                (s.status === 'cancelled' ? ' <span class="tag">Cancelled</span>' : '') + '</span>' +
                '<span class="with">' + (s.with ? 'with ' + esc(s.with) : '') + '</span></li>';
            }).join('') + '</ol></section>';
        });
      }
      root.innerHTML = h;
      root.addEventListener('click', function (e) {
        var b = e.target.closest('.year > button');
        if (!b) return;
        var open = b.parentNode.classList.toggle('open');
        b.setAttribute('aria-expanded', open);
      });
    });
  }

  // ------------------------------------------------------------ WORK
  function renderWork(items) {
    var root = document.getElementById('app');
    var list = (items || []).filter(function (w) { return !w.hidden; });
    var albums = list.filter(function (w) { return w.section !== 'More'; });
    var more = list.filter(function (w) { return w.section === 'More'; });
    var h = '';
    if (albums.length) {
      h += '<h2 class="section-label">Albums</h2><div class="card-grid">' + albums.map(function (w, i) {
        var href = w.page || w.listen || '';
        // with an odd number of albums the newest one gets a wide row of its own
        return '<article class="wcard' + (i === 0 && albums.length % 2 ? ' lead' : '') + '">' + (href ? '<a class="stretch" href="' + esc(href) + '"' + ext(href) + ' aria-label="' + esc(w.title) + '"></a>' : '') +
          '<div class="pic">' + (w.image ? thumbImg(w.image, 'alt="' + esc(w.title) + ' cover" loading="lazy"') : '') + '</div>' +
          '<div class="txt"><div class="meta">' + (w.year ? '<b>' + esc(w.year) + '</b>' : '') + '<span>' + esc(w.kind || '') + '</span></div>' +
          '<h3>' + esc(w.title) + '</h3>' + (w.text ? '<p>' + esc(w.text) + '</p>' : '') +
          '<div class="acts">' + (w.page ? '<a class="btn" href="' + esc(w.page) + '"' + ext(w.page) + '>About the album →</a>' : '') +
          (w.listen ? '<a class="btn solid" href="' + esc(w.listen) + '" target="_blank" rel="noopener">Listen' + (w.listen_label ? ' · ' + esc(w.listen_label) : '') + ' ↗</a>' : '') +
          '</div></div></article>';
      }).join('') + '</div>';
    }
    if (more.length) {
      h += '<h2 class="section-label" style="margin-top:9rem">More work</h2><div class="card-grid small">' + more.map(function (w) {
        return '<a class="tile" href="' + esc(w.page || w.listen || '#') + '"' + ext(w.page || w.listen) + '>' +
          (w.image ? thumbImg(w.image, 'alt="" loading="lazy"') : '') +
          '<span><small>' + esc(w.kind || '') + '</small><b>' + esc(w.title) + '</b></span></a>';
      }).join('') + '</div>';
    }
    root.innerHTML = h || '<p class="empty">Nothing here yet.</p>';
  }

  // ------------------------------------------------------------ NEWS
  function plain(t) { return String(t || '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim(); }
  function renderNews(posts) {
    var root = document.getElementById('app');
    var list = (posts || []).filter(function (p) { return !p.hidden; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    if (!list.length) { root.innerHTML = '<p class="empty">No news yet.</p>'; return; }
    var first = list[0], rest = list.slice(1);
    var h = '<article class="feature" tabindex="0" data-n="0">' +
      (first.image ? '<div class="pic"><img src="' + esc(first.image) + '" alt=""></div>' : '') +
      '<div><div class="wcard"><div class="meta"><b>Latest</b><span>' + esc(fmtLong(first.date)) + '</span></div></div>' +
      '<h2>' + esc(first.title || '') + '</h2><p class="excerpt">' + esc(plain(first.text)) + '</p>' +
      '<span class="btn">Read →</span></div></article>';
    if (rest.length) {
      h += '<h2 class="section-label" style="margin-top:8rem">Earlier</h2><div class="card-grid three">' + rest.map(function (p, i) {
        return '<button class="wcard" data-n="' + (i + 1) + '"><div class="pic">' + (p.image ? thumbImg(p.image, 'alt="" loading="lazy"') : '') + '</div>' +
          '<div class="meta"><span>' + esc(fmtLong(p.date)) + '</span></div><h3>' + esc(p.title || '') + '</h3>' +
          '<p class="excerpt">' + esc(plain(p.text)) + '</p></button>';
      }).join('') + '</div>';
    }
    h += '<div class="reader" hidden role="dialog" aria-modal="true"><article><button class="close">Close ✕</button><div class="body"></div></article></div>';
    root.innerHTML = h;
    var reader = root.querySelector('.reader');
    function open(n) {
      var p = list[n];
      reader.querySelector('.body').innerHTML = (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '') +
        '<time datetime="' + esc(p.date) + '">' + esc(fmtLong(p.date)) + '</time><h2>' + esc(p.title || '') + '</h2>' +
        '<div class="prose">' + prose(p.text) + '</div>' +
        (p.link ? '<a class="btn solid" href="' + esc(p.link) + '"' + ext(p.link) + '>' + esc(p.link_label || 'More') + ' ↗</a>' : '');
      reader.hidden = false;
      reader.querySelector('article').scrollTop = 0;
      document.body.style.overflow = 'hidden';
      reader.querySelector('.close').focus();
    }
    function close() { reader.hidden = true; document.body.style.overflow = ''; }
    root.addEventListener('click', function (e) {
      var c = e.target.closest('[data-n]');
      if (c && !e.target.closest('.reader')) return open(+c.getAttribute('data-n'));
      if (e.target.closest('.close') || e.target === reader) close();
    });
    root.addEventListener('keydown', function (e) {
      var c = e.target.closest('.feature');
      if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(0); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !reader.hidden) close(); });
  }

  // ------------------------------------------------------------ PHOTOS (press)
  function mb(bytes) { return bytes ? (bytes / 1048576).toFixed(bytes > 10485760 ? 0 : 1) + ' MB' : ''; }
  function renderPhotos(photos, site) {
    var root = document.getElementById('app');
    var list = (photos || []).filter(function (p) { return !p.hidden; });
    var credits = [];
    list.forEach(function (p) { if (p.credit && credits.indexOf(p.credit) < 0) credits.push(p.credit); });
    root.innerHTML =
      ((site && site.press_intro) ? '<p class="press-intro">' + esc(site.press_intro) + '</p>' : '') +
      '<div class="chips" role="group" aria-label="Photographer"><button class="chip" aria-pressed="true" data-c="">All</button>' +
      credits.map(function (c) { return '<button class="chip" aria-pressed="false" data-c="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') +
      '</div><div class="grid"></div>' +
      '<div class="lightbox" hidden role="dialog" aria-label="Photo"><button class="lb-close">Close ✕</button>' +
      '<div class="stage"><img alt=""></div><button class="lb-btn lb-prev" aria-label="Previous">‹</button>' +
      '<button class="lb-btn lb-next" aria-label="Next">›</button><div class="bar"><span class="cap"></span><a class="btn solid dl" download>Download</a></div></div>';
    var grid = root.querySelector('.grid'), lb = root.querySelector('.lightbox'), cur = [], at = 0;
    function draw(credit) {
      cur = list.filter(function (p) { return !credit || p.credit === credit; });
      grid.innerHTML = cur.map(function (p, i) {
        var ratio = p.width && p.height ? ' width="' + p.width + '" height="' + p.height + '"' : '';
        return '<figure class="shot"><button class="open" data-i="' + i + '" aria-label="View larger">' +
          thumbImg(p.src, ratio.trim() + ' alt="Gyða Valtýsdóttir, photo by ' + esc(p.credit) + '" loading="lazy"') + '</button><figcaption><span>© ' + esc(p.credit) +
          (p.caption ? ' · ' + esc(p.caption) : '') + '</span><a href="' + esc(p.hires || p.src) + '" download>↓ Hi-res ' + mb(p.bytes) + '</a></figcaption></figure>';
      }).join('');
    }
    function show(i) {
      at = (i + cur.length) % cur.length;
      var p = cur[at];
      lb.querySelector('.stage img').src = p.src;
      lb.querySelector('.cap').textContent = '© ' + p.credit + (p.caption ? ' · ' + p.caption : '') +
        (p.width ? '  ·  ' + p.width + ' × ' + p.height + ' px' : '');
      var dl = lb.querySelector('.dl');
      dl.href = p.hires || p.src;
      dl.textContent = '↓ Download hi-res ' + mb(p.bytes);
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function close() { lb.hidden = true; document.body.style.overflow = ''; }
    root.addEventListener('click', function (e) {
      var t = e.target;
      var chip = t.closest('.chip');
      if (chip) {
        root.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === chip); });
        draw(chip.getAttribute('data-c'));
      }
      var o = t.closest('.shot .open');
      if (o) show(+o.getAttribute('data-i'));
      if (t.closest('.lb-prev')) show(at - 1);
      if (t.closest('.lb-next')) show(at + 1);
      if (t.closest('.lb-close') || t === lb || t.classList.contains('stage')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(at - 1);
      if (e.key === 'ArrowRight') show(at + 1);
    });
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) show(dx < 0 ? at + 1 : at - 1);
    });
    draw('');
  }

  // ------------------------------------------------------------ go
  if (PREVIEW) {
    var f = document.createElement('div');
    f.className = 'preview-flag';
    f.textContent = 'Preview — not published yet';
    document.body.appendChild(f);
  }
  // start the page's data downloads now, alongside site.json (load() hands back the same request later)
  ({ work: ['work'], film: ['films'], news: ['news'], photos: ['photos'], live: ['shows', 'calendar'], front: ['shows', 'calendar'] }[view] || [])
    .forEach(function (n) { load(n); });
  load('site').then(function (site) {
    renderNav(site);
    renderBooking(site);
    if (view === 'front') return renderFront(site);
    if (view === 'work') return load('work').then(renderWork);
    if (view === 'film') return load('films').then(renderFilm);
    if (view === 'live') return renderLive(site);
    if (view === 'news') return load('news').then(renderNews);
    if (view === 'photos') return load('photos').then(function (p) { renderPhotos(p, site); });
  });
})();
