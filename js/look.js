/* The look of the site: colours, heading font and each page's photo. Saved in data/site.json as "look" and
   chosen in the admin's Look tab; used by the website (js/app.js) and by the admin, so both agree.
     look = { theme: 'oxblood', colors: { ink, ox, glow }, font: 'outfit',
              pages: { About: { photo, focus: '50% 25%', layout: 'behind', bright: 42, title, kicker }, … } } */
(function () {
  'use strict';
  // dark colour sets only: the site sets white text over photos everywhere
  var THEMES = {
    oxblood: { name: 'Oxblood', ink: '#130303', ox: '#470606', glow: '#e8b8a8' },
    night:   { name: 'Night',   ink: '#0b0b0f', ox: '#24242e', glow: '#cfc8ee' },
    sea:     { name: 'Deep sea', ink: '#050e13', ox: '#0f3644', glow: '#9fd6dc' },
    moss:    { name: 'Moss',    ink: '#0b100c', ox: '#22382a', glow: '#cddfb4' },
    umber:   { name: 'Umber',   ink: '#120c07', ox: '#4b2f17', glow: '#f2cc94' },
    stone:   { name: 'Stone',   ink: '#0f0f0f', ox: '#2e2e2e', glow: '#ffffff' }
  };
  var FONTS = {
    outfit:    { name: 'Outfit', css: '"Outfit", "Helvetica Neue", Arial, sans-serif' },
    jost:      { name: 'Jost', css: '"Jost", "Helvetica Neue", Arial, sans-serif' },
    raleway:   { name: 'Raleway', css: '"Raleway", "Helvetica Neue", Arial, sans-serif' },
    josefin:   { name: 'Josefin Sans', css: '"Josefin Sans", "Helvetica Neue", Arial, sans-serif' },
    cormorant: { name: 'Cormorant Garamond', css: '"Cormorant Garamond", Georgia, serif' },
    vollkorn:  { name: 'Vollkorn', css: '"Vollkorn", Georgia, serif' }
  };
  // what each page can look like; Contact keeps its own layout (photo on the right half) and only changes its photo
  var LAYOUTS = {
    behind: 'Behind the text, darkened',
    top: 'Big at the top, fading into the page',
    beside: 'Beside the text (right half)',
    faint: 'Faint, behind the whole page',
    none: 'No photo'
  };
  var BRIGHT = { behind: 42, top: 100, beside: 100, faint: 20, contact: 100 };   // starting brightness for each layout

  function rgb(hex) {
    var m = String(hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }
  function hex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join(''); }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  // white text has to stay readable: a background or frame that is too light is darkened until it is
  function darkEnough(c, max) { var k = 1; while (lum(c) > max && k > 0.05) { k -= 0.05; c = c.map(function (v) { return v * 0.95; }); } return c; }

  // the full set of colours from a look (the theme, then any colour she picked herself)
  function colors(look) {
    look = look || {};
    var t = THEMES[look.theme] || THEMES.oxblood, own = look.colors || {};
    var ink = darkEnough(rgb(own.ink) || rgb(t.ink), 0.09);
    var ox = darkEnough(rgb(own.ox) || rgb(t.ox), 0.22);
    var glow = rgb(own.glow) || rgb(t.glow);
    return {
      ink: hex(ink), ox: hex(ox), glow: hex(glow),
      deep: hex(mix(ink, ox, 0.35)), panel: hex(mix(ink, ox, 0.55)), dark: hex(ink.map(function (v) { return v * 0.55; })),
      inkRgb: ink.map(Math.round).join(','), oxRgb: ox.map(Math.round).join(','), darkRgb: ink.map(function (v) { return Math.round(v * 0.55); }).join(',')
    };
  }
  function applyTheme(root, look) {
    var c = colors(look), s = root.style, f = FONTS[(look || {}).font];
    s.setProperty('--ink', c.ink); s.setProperty('--ink-rgb', c.inkRgb);
    s.setProperty('--ox', c.ox); s.setProperty('--ox-rgb', c.oxRgb);
    s.setProperty('--ox-deep', c.deep); s.setProperty('--panel', c.panel);
    s.setProperty('--dark', c.dark); s.setProperty('--dark-rgb', c.darkRgb);
    s.setProperty('--glow', c.glow);
    if (f) s.setProperty('--display', f.css); else s.removeProperty('--display');
  }

  // one page's photo and words, applied to a page that is already on screen
  function applyPage(doc, p) {
    if (!p) return;
    var body = doc.body, main = doc.querySelector('.app-main'), bar = doc.querySelector('.topbar');
    var contact = body.getAttribute('data-view') === 'contact';
    var layout = contact ? 'contact' : (LAYOUTS[p.layout] ? p.layout : 'none');
    var show = p.photo && layout !== 'none';
    var bright = Math.max(0, Math.min(100, p.bright == null ? BRIGHT[layout] : +p.bright));
    doc.querySelectorAll('.app-bg, .page-hero').forEach(function (el) { if (!contact || !show) el.remove(); });
    body.classList.toggle('overlay', layout === 'behind' && show);
    body.classList.toggle('split', layout === 'beside' && show);
    if (main) main.classList.toggle('after-hero', (layout === 'top' || contact) && show);
    if (bar) bar.classList.toggle('on-photo', show && layout !== 'faint');
    if (show) {
      var el = doc.querySelector(layout === 'faint' ? '.app-bg' : '.page-hero');
      if (!el) {
        el = doc.createElement('div');
        el.className = layout === 'faint' ? 'app-bg' : 'page-hero';
        el.setAttribute('aria-hidden', 'true');
        if (layout === 'faint') body.insertBefore(el, body.firstChild); else body.insertBefore(el, main);
      }
      el.style.backgroundImage = "url('" + String(p.photo).replace(/'/g, '%27') + "')";
      if (p.focus) el.style.backgroundPosition = p.focus; else el.style.removeProperty('background-position');
      el.style.opacity = layout === 'faint' ? bright / 100 : '';
      el.style.filter = layout === 'top' || layout === 'beside' || layout === 'contact' ? (bright < 100 ? 'brightness(' + bright / 100 + ')' : '') : '';
      body.style.setProperty('--veil', layout === 'behind' ? (1 - bright / 100).toFixed(2) : '');
    }
    var t = doc.querySelector('.page-title'), k = doc.querySelector('.app-main > .kicker');
    if (t && p.title) t.textContent = p.title;
    if (k && p.kicker != null) k.textContent = p.kicker;
    if (p.title) doc.title = p.title + ' — Gyða Valtýsdóttir';
  }

  window.GYDA_LOOK = {
    THEMES: THEMES, FONTS: FONTS, LAYOUTS: LAYOUTS, BRIGHT: BRIGHT,
    colors: colors, applyTheme: applyTheme, applyPage: applyPage, rgb: rgb, hex: hex, lum: lum
  };
})();
