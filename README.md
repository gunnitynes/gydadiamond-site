# gydadiamond.net

Static rebuild of Gyda Valtysdottir's website, which used to run on Cargo 2.

All of the text and layout comes from the live site, recovered from the Internet Archive (latest
copies January–April 2026). The images were downloaded from Cargo's image server.

## Layout
- `*.html` — one file per page (`About.html` is served at `/About`, the same address as on Cargo)
- `images/` — web-sized images (full-size originals are kept outside this repo)
- `css/site.css` — the site's original Cargo stylesheet (fonts swapped for free ones: Karla, plus Vollkorn in place of Dolly Pro)
- `css/static.css`, `js/site.js` — layout rules and the PHOTOS slideshow that Cargo's own scripts used to provide
- `_source/` — the recovered page data and `build.py`, which generates the HTML pages from it

## Editing
Small text changes can be made directly in the `.html` files.
To regenerate every page from the recovered data: `python3 _source/build.py`
(note: this overwrites hand edits to the `.html` pages).

Local preview (serves `/About` like GitHub Pages does): `python3 _source/serve.py 8772`, then open http://localhost:8772

## Hosting
GitHub Pages from the `main` branch, root folder. The `CNAME` file holds the custom domain.

DNS at Bluehost (nameservers set back to Bluehost's own):
- `A` records for `@`: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- `CNAME` for `www` → `<github-username>.github.io`
