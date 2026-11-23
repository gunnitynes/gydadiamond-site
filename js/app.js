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
    // normal browser caching (GitHub allows 10 minutes): pages open instantly when switching
    return fetch('data/' + name + '.json')
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
    var cur = '';
    var links = (site.menu || []).filter(function (m) { return !m.hidden; }).map(function (m) {
      if (here(m.href) || (view === 'album' && m.href === 'Work') || (view === 'bio' && m.href === 'About')) cur = m.label;
      return '<a href="' + esc(m.href) + '"' + (m.label === cur ? ' aria-current="page"' : '') + '>' + esc(m.label) + '</a>';
    }).join('');
    bar.innerHTML = '<a class="home" href="./"><span class="home-full">◆ Home</span><span class="home-short">Home</span></a><span class="here">' + esc(cur) + '</span>' +
      '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><span class="bars"></span></button>' +
      '<nav id="site-nav" aria-label="Main"><a class="nav-home" href="./">Home</a>' + links + '</nav>';
  }
  // phones: the Menu button opens the links as a full-screen panel
  function setMenu(open) {
    var bar = document.querySelector('.topbar');
    if (!bar) return;
    bar.classList.toggle('open', open);
    var b = bar.querySelector('.menu-btn');
    if (b) { b.setAttribute('aria-expanded', open); b.setAttribute('aria-label', open ? 'Close menu' : 'Menu'); }
    document.documentElement.classList.toggle('menu-open', open);
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('.menu-btn')) setMenu(!document.querySelector('.topbar.open'));
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  window.addEventListener('pageshow', function () { setMenu(false); });

  // ------------------------------------------------------------ live booking contact (LIVE header, CONTACT page)
  // Email addresses are stored scrambled ("enc:" + base64 of the address backwards) and only become
  // real mailto: links when a visitor clicks, so address-harvesting bots reading the pages find nothing.
  function unmail(v) {
    v = String(v || '');
    if (v.indexOf('enc:') !== 0) return v;
    try { return decodeURIComponent(escape(atob(v.slice(4)))).split('').reverse().join(''); } catch (e) { return ''; }
  }
  // <a data-mail="enc:…">: a click opens the mail app; data-reveal shows the address with a Copy button
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-mail]');
    if (a) {
      e.preventDefault();
      var addr = unmail(a.getAttribute('data-mail'));
      if (!addr) return;
      if (a.hasAttribute('data-reveal')) {
        var box = document.createElement('span');
        box.className = 'revealed';
        box.innerHTML = '<a href="mailto:' + esc(addr) + '">' + esc(addr) + '</a><button class="btn small copy-mail">Copy</button>';
        a.replaceWith(box);
        return;
      }
      location.href = 'mailto:' + addr;
    }
    var c = e.target.closest('.copy-mail');
    if (c) {
      var t = c.previousElementSibling.textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
        c.textContent = 'Copied ✓';
        setTimeout(function () { c.textContent = 'Copy'; }, 2000);
      }, function () { c.textContent = 'Select it to copy'; });
    }
  });
  function mailLink(enc, label, reveal, cls) {
    return enc ? '<a href="#" data-mail="' + esc(enc) + '"' + (reveal ? ' data-reveal' : '') + (cls ? ' class="' + cls + '"' : '') + '>' + label + '</a>' : '';
  }

  // ------------------------------------------------------------ live booking link (LIVE header)
  function renderBooking(site) {
    if (!site || !site.booking_email) return;
    document.querySelectorAll('[data-booking]').forEach(function (el) {
      el.innerHTML = mailLink(site.booking_email, 'Live booking contact', true);
    });
  }

  // ------------------------------------------------------------ CONTACT
  function renderContact(site) {
    var root = document.getElementById('app');
    site = site || {};
    var cards = [];
    if (site.email) cards.push(['', 'Gyða', '', mailLink(site.email, 'Show email', true, 'btn solid')]);
    if (site.booking_email) cards.push(['Live booking', esc(site.booking_name || 'Booking'), 'Concerts and festivals.', mailLink(site.booking_email, 'Show email', true, 'btn solid')]);
    cards.push(['Press', 'Press & photos', 'Photos are free to use with the photographer credited.',
      '<a class="btn" href="PHOTOS">Press photos →</a>' + (site.press_email && site.press_email !== site.email ? mailLink(site.press_email, 'Show email', true, 'btn') : '')]);
    var links = (site.links || []).filter(function (l) { return l.url; });
    root.innerHTML = '<div class="contact-grid">' + cards.map(function (c) {
      return '<section class="ccard' + (c[0] ? '' : ' short') + '">' + (c[0] ? '<p class="kicker">' + esc(c[0]) + '</p>' : '') + (c[1] ? '<h2>' + c[1] + '</h2>' : '') +
        (c[2] ? '<p>' + esc(c[2]) + '</p>' : '') + '<div class="acts">' + c[3] + '</div></section>';
    }).join('') + '</div>' +
      (links.length ? '<div class="follow">' + links.map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + ' ↗</a>';
      }).join('') + '</div>' : '');
  }

  // ------------------------------------------------------------ front page
  function renderFront(site) {
    var el = document.querySelector('.hero');
    if (!el || !site) return Promise.resolve();
    var img = el.querySelector('.hero-img');
    if (img && site.hero && img.getAttribute('src') !== site.hero) img.src = site.hero;
    if (img) {
      var f = String(site.hero_focus || '50% 50%').split(/\s+/);
      img.style.setProperty('--fx', f[0] || '50%');
      img.style.setProperty('--fy', f[1] || '50%');
    }
    var text = el.querySelector('.hero-text');
    var menu = (site.menu || []).filter(function (m) { return !m.hidden; }).map(function (m) {
      return '<a href="' + esc(m.href) + '">◆ ' + esc(String(m.label).toUpperCase()) + '<span class="end"> ◆</span></a>';
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
      // on phones the page title already says "Film", so the first heading reads as the page's description instead
      html += '<h2 class="section-label">' + (n === 0 ? '<span class="on-wide">' + esc(c[1]) + '</span><span class="on-phone">Films, documentaries and art</span>' : esc(c[1])) + '</h2><ul class="film-list">';
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
        // the booking link is already in the page header when one is set
        h += '<div class="no-shows"><p>No dates announced right now.</p>' + (site && !site.booking_email && site.email ?
          '<p>' + mailLink(site.email, 'Write about concerts') + '</p>' : '') + '</div>';
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

  // ------------------------------------------------------------ ABOUT, FULL BIO, ALBUMS
  function lines(t) { return String(t || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); }
  // "Title | https://…" → a link; plain lines stay text
  function linkLine(l) {
    var m = l.split(/\s+\|\s+/);
    return m[1] ? '<a href="' + esc(m[1]) + '"' + ext(m[1]) + '>' + esc(m[0]) + ' <span class="arr">↗</span></a>' : esc(m[0]);
  }
  function setHero(img) {
    var h = document.querySelector('.page-hero');
    if (h && img) h.style.backgroundImage = "url('" + img + "')";
  }
  // a paragraph that is just ◆ becomes a separator
  function proseD(t) {
    return prose(t).replace(/<p>\s*◆\s*<\/p>/g, '<p class="sep-d" aria-hidden="true">◆</p>');
  }
  function renderAbout(a) {
    a = a || {};
    setHero(a.photo);
    var root = document.getElementById('app');
    root.innerHTML = '<div class="longread lead-first">' + proseD(a.text) + '</div>' +
      '<p class="read-on"><a class="btn" href="FULL-BIO">Full bio →</a></p>';
  }
  function renderBio(a) {
    a = a || {};
    setHero(a.bio_photo);
    var root = document.getElementById('app'), h = '';
    String(a.bio || '').split(/^##\s+/m).forEach(function (sec) {
      sec = sec.trim();
      if (!sec) return;
      var ls = sec.split('\n'), title = ls.shift(), body = ls.map(function (l) { return l.trim(); }).filter(Boolean);
      h += '<section class="bio-sec"><h2 class="section-label">' + esc(title) + '</h2>';
      // one long line reads as a paragraph; several short lines as a list
      if (body.length === 1 && body[0].length > 120) h += '<p class="bio-para">' + esc(body[0]) + '</p>';
      else h += '<ul class="bio-list">' + body.map(function (l) {
        var m = l.split(/\s+—\s+/);
        return '<li><span>' + esc(m[0]) + '</span>' + (m[1] ? '<span class="yr">' + esc(m[1]) + '</span>' : '') + '</li>';
      }).join('') + '</ul>';
      h += '</section>';
    });
    root.innerHTML = h + '<p class="read-on"><a class="btn" href="About">← About</a></p>';
  }
  function renderAlbum(work) {
    var slug = document.body.getAttribute('data-slug');
    var albums = (work || []).filter(function (w) { return w.page && !w.hidden && w.section !== 'More'; });
    var w = albums.filter(function (x) { return x.page === slug; })[0] || (work || []).filter(function (x) { return x.page === slug; })[0];
    var root = document.getElementById('app');
    if (!w) { root.innerHTML = '<p class="empty">Not found.</p>'; return; }
    document.title = w.title + ' — Gyða Valtýsdóttir';
    var t = document.querySelector('.page-title'), k = document.querySelector('.app-main > .kicker');
    if (t) t.textContent = w.title;
    if (k) k.textContent = [w.kind || 'Album', w.year].filter(Boolean).join(' · ');
    var bg = document.querySelector('.app-bg');
    if (bg && w.background) bg.style.backgroundImage = "url('" + w.background + "')";
    var more = lines(w.more_links).map(function (l) { var m = l.split(/\s+\|\s+/); return m[1] ? '<a class="btn" href="' + esc(m[1]) + '"' + ext(m[1]) + '>' + esc(m[0]) + ' ↗</a>' : ''; }).join('');
    var h = '<div class="album-top">' +
      (w.image ? '<div class="album-cover"><img src="' + esc(w.image) + '" alt="' + esc(w.title) + ' cover"></div>' : '') +
      '<div class="album-info"><div class="longread">' + proseD(w.story || w.text) + '</div>' +
      '<div class="acts">' + (w.listen ? '<a class="btn solid" href="' + esc(w.listen) + '" target="_blank" rel="noopener">Listen' + (w.listen_label ? '<span class="on-wide"> · ' + esc(w.listen_label) + '</span>' : '') + ' ↗</a>' : '') + more + '</div></div></div>';
    var tracks = lines(w.tracks), credits = lines(w.credits);
    if (tracks.length || credits.length) {
      h += '<div class="album-cols">';
      if (tracks.length) h += '<section><h2 class="section-label">' + esc(w.tracks_label || 'Tracks') + '</h2><ol class="tracks">' +
        tracks.map(function (l) { return '<li>' + linkLine(l) + '</li>'; }).join('') + '</ol></section>';
      if (credits.length) h += '<section><h2 class="section-label">Credits</h2><ul class="credits">' +
        credits.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></section>';
      h += '</div>';
    }
    String(w.quotes || '').split(/\n\s*\n/).map(function (q) { return q.trim(); }).filter(Boolean).forEach(function (q) {
      var ls = q.split('\n'), src = /^[—–-]\s*/.test(ls[ls.length - 1]) && ls.length > 1 ? ls.pop().replace(/^[—–-]\s*/, '') : '';
      h += '<figure class="pull"><blockquote>“' + esc(ls.join(' ').replace(/^[“"]|[”"]$/g, '')) + '”</blockquote>' + (src ? '<figcaption>' + esc(src) + '</figcaption>' : '') + '</figure>';
    });
    var awards = lines(w.awards);
    if (awards.length) h += '<section><h2 class="section-label">Awards</h2><ul class="awards">' + awards.map(function (l) {
      var m = l.split(/\s+—\s+/);
      return '<li><span>' + esc(m[0]) + '</span>' + (m[1] ? '<b>' + esc(m[1]) + '</b>' : '') + '</li>';
    }).join('') + '</ul></section>';
    // the other albums, in Work order
    var i = albums.indexOf(w), prev = i > 0 ? albums[i - 1] : null, next = i >= 0 && i < albums.length - 1 ? albums[i + 1] : null;
    h += '<nav class="album-nav">' + (prev ? '<a href="' + esc(prev.page) + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
      '<a href="Work">All work</a>' + (next ? '<a href="' + esc(next.page) + '">' + esc(next.title) + ' →</a>' : '<span></span>') + '</nav>';
    root.innerHTML = h;
  }

  // ------------------------------------------------------------ WORK
  function renderWork(items) {
    var root = document.getElementById('app');
    var list = (items || []).filter(function (w) { return !w.hidden; });
    var albums = list.filter(function (w) { return w.section !== 'More'; });
    var more = list.filter(function (w) { return w.section === 'More'; });
    var h = '';
    if (albums.length) {
      h += '<h2 class="section-label"><span class="on-wide">Albums</span><span class="on-phone">Albums, scores &amp; collaborations</span></h2><div class="card-grid">' + albums.map(function (w, i) {
        var href = w.page || w.listen || '';
        // with an odd number of albums the newest one gets a wide row of its own
        return '<article class="wcard' + (i === 0 && albums.length % 2 ? ' lead' : '') + '">' + (href ? '<a class="stretch" href="' + esc(href) + '"' + ext(href) + ' aria-label="' + esc(w.title) + '"></a>' : '') +
          '<div class="pic">' + (w.image ? thumbImg(w.image, 'alt="' + esc(w.title) + ' cover" loading="lazy"') : '') + '</div>' +
          '<div class="txt"><div class="meta">' + (w.year ? '<b>' + esc(w.year) + '</b>' : '') + '<span>' + esc(w.kind || '') + '</span></div>' +
          '<h3>' + esc(w.title) + '</h3>' + (w.text ? '<p>' + esc(w.text) + '</p>' : '') +
          '<div class="acts">' + (w.page ? '<a class="btn" href="' + esc(w.page) + '"' + ext(w.page) + '>About the album →</a>' : '') +
          (w.listen ? '<a class="btn solid" href="' + esc(w.listen) + '" target="_blank" rel="noopener">Listen' + (w.listen_label ? '<span class="on-wide"> · ' + esc(w.listen_label) + '</span>' : '') + ' ↗</a>' : '') +
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
      document.documentElement.classList.add('overlay-open');
      reader.querySelector('.close').focus();
    }
    function close() { reader.hidden = true; document.body.style.overflow = ''; document.documentElement.classList.remove('overlay-open'); }
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
    // Photos go into columns one by one, each into the column that is shortest so far, so every column starts at the top
    var credit0 = '', ncols = 0;
    function colsFor() { return innerWidth <= 768 ? 2 : innerWidth <= 1100 ? 2 : 3; }
    function draw(credit) {
      credit0 = credit;
      ncols = colsFor();
      cur = list.filter(function (p) { return !credit || p.credit === credit; });
      var cols = [], heights = [];
      for (var c = 0; c < ncols; c++) { cols.push(''); heights.push(0); }
      cur.forEach(function (p, i) {
        var ratio = p.width && p.height ? ' width="' + p.width + '" height="' + p.height + '"' : '';
        var k = heights.indexOf(Math.min.apply(null, heights));
        heights[k] += (p.width && p.height ? p.height / p.width : 1.25) + 0.12;   // + room for the caption
        cols[k] += '<figure class="shot"><button class="open" data-i="' + i + '" aria-label="View larger">' +
          thumbImg(p.src, ratio.trim() + ' alt="Gyða Valtýsdóttir, photo by ' + esc(p.credit) + '" loading="lazy"') + '</button><figcaption><span>© ' + esc(p.credit) +
          (p.caption ? ' · ' + esc(p.caption) : '') + '</span><a href="' + esc(p.hires || p.src) + '" download>↓ Hi-res ' + mb(p.bytes) + '</a></figcaption></figure>';
      });
      grid.innerHTML = cols.map(function (h) { return '<div class="col">' + h + '</div>'; }).join('');
    }
    var rt;
    addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (colsFor() !== ncols) draw(credit0); }, 150);
    });
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
      document.documentElement.classList.add('overlay-open');
    }
    function close() { lb.hidden = true; document.body.style.overflow = ''; document.documentElement.classList.remove('overlay-open'); }
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

  // ------------------------------------------------------------ computers: the menu bar stays at the top,
  // slides away while scrolling down to read and comes back when scrolling up
  (function () {
    var last = 0, ticking = false;
    function update() {
      ticking = false;
      var bar = document.querySelector('.topbar');
      if (!bar || innerWidth <= 768) return;
      var y = scrollY;
      bar.classList.toggle('pinned', y > 10);
      if (y > 140 && y > last + 4) bar.classList.add('away');
      else if (y < last - 4 || y <= 140) bar.classList.remove('away');
      last = y;
    }
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  })();

  // ------------------------------------------------------------ faster page switching
  // Chrome prerenders the next page on hover (speculationrules in each page's head); for other browsers,
  // fetch it on hover / touch so it is already in the browser cache when clicked.
  (function () {
    var warmed = {};
    function warm(e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.origin !== location.origin || /admin|\.(jpe?g|png|pdf|zip)$/i.test(a.pathname)) return;
      var u = a.href.split('#')[0];
      if (warmed[u] || u === location.href.split('#')[0]) return;
      warmed[u] = 1;
      fetch(u).catch(function () {});
    }
    document.addEventListener('mouseover', warm, { passive: true });
    document.addEventListener('touchstart', warm, { passive: true });
  })();

  // ------------------------------------------------------------ go
  if (PREVIEW) {
    var f = document.createElement('div');
    f.className = 'preview-flag';
    f.textContent = 'Preview — not published yet';
    document.body.appendChild(f);
  }
  // start the page's data downloads now, alongside site.json (load() hands back the same request later)
  ({ about: ['about'], bio: ['about'], album: ['work'], work: ['work'], film: ['films'], news: ['news'], photos: ['photos'], live: ['shows', 'calendar'], front: ['shows', 'calendar'] }[view] || [])
    .forEach(function (n) { load(n); });
  load('site').then(function (site) {
    renderNav(site);
    renderBooking(site);
    if (view === 'front') return renderFront(site);
    if (view === 'work') return load('work').then(renderWork);
    if (view === 'about') return load('about').then(renderAbout);
    if (view === 'bio') return load('about').then(renderBio);
    if (view === 'album') return load('work').then(renderAlbum);
    if (view === 'film') return load('films').then(renderFilm);
    if (view === 'live') return renderLive(site);
    if (view === 'news') return load('news').then(renderNews);
    if (view === 'contact') return renderContact(site);
    if (view === 'photos') return load('photos').then(function (p) { renderPhotos(p, site); });
  });
})();
