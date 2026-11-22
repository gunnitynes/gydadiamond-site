#!/usr/bin/env python3
"""Rebuild gydadiamond.net as a static site from the recovered Cargo 2 data.

Inputs (all in _source/):
  allpages.json   every page's content + layout settings, pulled from the Wayback Machine
  backdrops.json  each page's background image and effect type
  site.css        the site's own Cargo stylesheet
Images live in ../images/ (web-sized copies; full-size originals are kept outside the repo).

Run:  python3 _source/build.py      (writes the .html files at the repo root)
"""
import glob, html, json, os, re, urllib.parse

SRC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SRC)
pages = json.load(open(os.path.join(SRC, 'allpages.json')))
backdrops = json.load(open(os.path.join(SRC, 'backdrops.json')))
site = json.load(open(os.path.join(ROOT, 'data', 'site.json')))

# Pages drawn by js/app.js from data/*.json (edited in /admin/), with their background photo
APP_PAGES = {
    'Work':   ('work',   'Work',  'Albums, scores & collaborations', ''),
    'FILM':   ('film',   'Film',  'Films, documentaries and art', 'images/b784a330-MIHKEL-cover.jpg'),
    'LIVE':   ('live',   'Live',  'Concerts', 'images/576e7e30-ata_kam-7.jpg'),
    'NEWS':   ('news',   'News',  'From Gyða', ''),
    'PHOTOS': ('photos', 'Photos', 'Press photos', ''),
}

SKIP = {'Running-on-Cargo'}

# cache-busting: asset links get ?v=<hash of the asset files>, so browsers fetch new CSS/JS after a change
import hashlib
V = hashlib.sha1(b''.join(open(os.path.join(ROOT, f), 'rb').read() for f in
                          ['css/static.css', 'css/app.css', 'js/app.js', 'js/site.js', '_source/site.css'])).hexdigest()[:8]
HOME = 'Front-page'


def local_image(url):
    """Map a freight.cargo.site URL to the local web copy in images/."""
    parts = url.split('/')
    h8, name = parts[6][:8], urllib.parse.unquote(parts[7])
    stem = os.path.splitext(name)[0]
    hits = glob.glob(os.path.join(ROOT, 'images', f'{glob.escape(h8)}-{glob.escape(stem)}.*'))
    if not hits:
        raise SystemExit(f'missing image for {url}')
    return 'images/' + urllib.parse.quote(os.path.basename(hits[0]))


def rewrite_img(m):
    tag = m.group(0)
    attrs = dict(re.findall(r'([a-z_-]+)="([^"]*)"', tag))
    src = local_image(attrs['data-src'])
    w, h = attrs.get('width_o') or attrs.get('width'), attrs.get('height_o') or attrs.get('height')
    style = f' style="width:{attrs["data-scale"]}%"' if attrs.get('data-scale') and attrs['data-scale'] != '100' else ''
    return f'<img src="{src}" width="{w}" height="{h}" alt="" loading="lazy" decoding="async"{style}>'


def rewrite_gallery(m):
    data = json.loads(urllib.parse.unquote(html.unescape(m.group(1))))
    opts = data.get('data', {})
    inner = m.group(2)
    imgs = [re.sub(r'\sdata-scale="[^"]*"', '', t) for t in re.findall(r'<img [^>]*>', inner)]
    speed = float(opts.get('autoplaySpeed', 3))
    auto = 'true' if opts.get('autoplay') else 'false'
    slides = ''.join(f'<div class="slide{" on" if i == 0 else ""}">{im}</div>' for i, im in enumerate(imgs))
    return (f'<div class="slideshow" data-autoplay="{auto}" data-speed="{speed}">'
            f'<div class="slides">{slides}</div>'
            '<button class="arrow prev" aria-label="Previous image">&#8249;</button>'
            '<button class="arrow next" aria-label="Next image">&#8250;</button>'
            f'<div class="count">1 / {len(imgs)}</div></div>')


def rewrite_grid_row(m):
    tag = m.group(0)
    pad = re.search(r'grid-pad="([^"]*)"', tag)
    pad = pad.group(1) if pad and pad.group(1) else '0'
    return tag[:-1] + f' style="--pad:{pad}rem">'


def rewrite_iframe(m):
    tag = m.group(0)
    w = re.search(r'width="(\d+)', tag)
    h = re.search(r'height="(\d+)', tag)
    ratio = f'{w.group(1)}/{h.group(1)}' if w and h else '16/9'
    tag = re.sub(r'\s(width|height|style)="[^"]*"', '', tag)
    if 'allowfullscreen' not in tag:
        tag = tag.replace('<iframe', '<iframe allowfullscreen', 1)
    tag = tag.replace('<iframe', '<iframe loading="lazy"', 1)
    return f'<div class="embed" style="aspect-ratio:{ratio}">{tag}'


def convert(content):
    c = content
    # slideshow galleries (the imgs inside are converted afterwards)
    c = re.sub(r'<div class="image-gallery" data-gallery="([^"]+)">(.*?)</div>', rewrite_gallery, c, flags=re.S)
    c = re.sub(r'<img [^>]*data-src="[^"]+"[^>]*/?>', rewrite_img, c)
    c = re.sub(r'<div [^>]*grid-row="[^"]*"[^>]*>', rewrite_grid_row, c)
    c = re.sub(r'<iframe[^>]*>', rewrite_iframe, c)
    c = c.replace('</iframe>', '</iframe></div>')
    # the hand-spaced "H O M E ... W O R K ➤" row at the bottom of About wrapped onto two lines
    c = re.sub(r'<div grid-row[^>]*>\s*<div grid-col[^>]*><div style="text-align: left"><b>[^<]*<a href="Front-page"[^>]*>H O M E.*?</div>\s*</div>\s*$',
               '<p class="next-page"><a href="Work">W O R K&nbsp;➤</a></p>', c.rstrip().removesuffix('<br>').rstrip(), flags=re.S)
    c = c.replace(' rel="history"', '')
    c = re.sub(r'href="Front-page"', 'href="./"', c)
    # external links open in a new tab, like most of them already did
    c = re.sub(r'<a href="(https?://[^"]+)"(?![^>]*target=)', r'<a href="\1" target="_blank" rel="noopener"', c)
    return c


def local_css(page):
    css = (page.get('page_options') or {}).get('local_css', '') or ''
    pid = str(page['id'])
    # Cargo scoped page styles with [local-style] on an element above <body>; we put it on <body> itself
    css = css.replace(f'[local-style="{pid}"] body', f'body[local-style="{pid}"]')
    # "initial" is Cargo's marker for "not set on this page, use the site default"
    return re.sub(r'\s*[a-z-]+:\s*initial\s*(/\*[^*]*\*/)?\s*;', '', css)


HEAD = """<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,200..700&family=Karla:ital,wght@0,400;0,700;1,400;1,700&family=Vollkorn:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">"""


def topbar(key, on_photo=False):
    """The menu along the top of every page except home (js/app.js refreshes it from data/site.json)."""
    links = ''.join(
        f'<a href="{html.escape(m["href"])}"{" aria-current=\"page\"" if m["href"] == key else ""}>{html.escape(m["label"])}</a>'
        for m in site['menu'] if not m.get('hidden'))
    cls = 'topbar on-photo' if on_photo else 'topbar'
    return f'<header class="{cls}"><a class="home" href="./">◆ GYDA</a><nav aria-label="Main">{links}</nav></header>'


def front_html():
    menu = ''.join(f'<a href="{html.escape(m["href"])}">◆ {html.escape(m["label"].upper())} ◆</a>'
                   for m in site['menu'] if not m.get('hidden'))
    return f'''<!doctype html>
<html lang="en" class="app-root">
<head>
{HEAD}
<title>Gyða Valtýsdóttir</title>
<meta name="description" content="Gyða Valtýsdóttir: cellist, composer, producer. Music, films, concerts and press photos.">
<meta property="og:title" content="Gyða Valtýsdóttir">
<meta property="og:image" content="https://gydadiamond.net/{html.escape(site['hero'])}">
<link rel="stylesheet" href="css/app.css?v={V}">
</head>
<body class="front" data-view="front">
<main class="hero">
<img class="hero-img" src="{html.escape(site['hero'])}" alt="Gyða Valtýsdóttir" style="object-position:{html.escape(site.get('hero_focus', '50% 50%'))}">
<div class="hero-text">
<h1>{html.escape(site['name'])}</h1>
<p class="tagline">{html.escape(site['tagline'])}</p>
<nav class="hero-menu" aria-label="Main">{menu}</nav>
</div>
</main>
<script src="js/app.js?v={V}" defer></script>
</body>
</html>
'''


def app_html(key):
    view, title, kicker, bg = APP_PAGES[key]
    bg_div = f'<div class="app-bg" style="background-image:url(\'{bg}\')"></div>' if bg else ''
    return f'''<!doctype html>
<html lang="en" class="app-root">
<head>
{HEAD}
<title>{title} — Gyða Valtýsdóttir</title>
<meta name="description" content="Gyða Valtýsdóttir — {html.escape(kicker.lower())}.">
<link rel="stylesheet" href="css/app.css?v={V}">
</head>
<body class="app" data-view="{view}">
{bg_div}
{topbar(key)}
<main class="app-main">
<p class="kicker">{html.escape(kicker)}</p>
<h1 class="page-title">{title}</h1>
<div id="app"><noscript><p>This page needs JavaScript.</p></noscript></div>
</main>
<script src="js/app.js?v={V}" defer></script>
</body>
</html>
'''


def page_html(key, page):
    pid = str(page['id'])
    title = 'GYDA' if key == HOME else f'{page["title_no_html"]} — GYDA'
    bd = backdrops.get(key)
    lo = (page.get('page_options') or {}).get('local_layout_options') or {}
    classes = ['home' if key == HOME else 'subpage']
    pos = str(lo.get('content_position') or 'center_cover')
    classes.append('pos-' + pos.split('_')[0])
    if pos.endswith('_cover') or lo.get('full_height'):
        classes.append('cover')
    backdrop = ''
    if bd:
        bg = bd['data'].get('bg_color') or 'transparent'
        img = local_image(bd['url'])
        side = ''
        # a solid-coloured column on one side: show the photo in the space beside it, not hidden under it
        if lo.get('page_container_bgcolor') and lo.get('content_width') and pos.startswith('left'):
            side = f';left:{lo["content_width"]}%;width:auto'
        backdrop = (f'<div class="backdrop backdrop-{bd["path"]}" style="background-color:{bg}{side}">'
                    f'<div class="backdrop-image" style="background-image:url(\'{img}\')"></div></div>')
    desc = re.sub(r'\s+', ' ', html.unescape(page.get('content_no_html') or '')).strip()[:155]
    return f'''<!doctype html>
<html lang="en" data-predefined-style="true" data-css-preset="true">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:title" content="{html.escape(title)}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,200..700&family=Karla:ital,wght@0,400;0,700;1,400;1,700&family=Vollkorn:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/site.css?v={V}">
<link rel="stylesheet" href="css/static.css?v={V}">
<link rel="stylesheet" href="css/app.css?v={V}">
<style>
{local_css(page)}
</style>
</head>
<body local-style="{pid}" class="{' '.join(classes)}">
{backdrop}
{topbar(key, bool(bd))}
<div class="page">
<div class="container">
<div class="container_width">
<div class="page_background"></div>
<div class="page_content content_padding">
<bodycopy>
{convert(page['content'])}
</bodycopy>
</div>
</div>
</div>
</div>
<script src="js/site.js?v={V}" defer></script>
<script src="js/app.js?v={V}" defer></script>
</body>
</html>
'''


def main():
    written = []
    for key, page in pages.items():
        if key in SKIP:
            continue
        out = front_html() if key == HOME else app_html(key) if key in APP_PAGES else page_html(key, page)
        name = 'index.html' if key == HOME else f'{key}.html'
        open(os.path.join(ROOT, name), 'w').write(out)
        written.append(name)
        if key == HOME:  # old links to /Front-page keep working
            open(os.path.join(ROOT, 'Front-page.html'), 'w').write(out)
    # Cargo's stylesheet, with its font names pointed at the free fonts we load
    css = open(os.path.join(SRC, 'site.css')).read()
    css = css.replace('"Dolly Pro", Icons', '"Vollkorn", Georgia, serif').replace('Karla, Icons', 'Karla, sans-serif')
    css = css.replace(', "Sans Serif", Icons', '')
    css = re.sub(r'url\(https://static\.cargo\.site[^)]*\)', 'none', css)
    os.makedirs(os.path.join(ROOT, 'css'), exist_ok=True)
    open(os.path.join(ROOT, 'css', 'site.css'), 'w').write(css)
    print('wrote', len(written), 'pages:', ', '.join(sorted(written)))


if __name__ == '__main__':
    main()
