# gydadiamond.net

Gyða Valtýsdóttir's website. It started as a static rebuild of her Cargo 2 site (recovered from the
Internet Archive, January–April 2026) and is now partly data-driven, with an admin at **/admin/**.

## How it fits together
| Part | Where | Edited by |
|---|---|---|
| Front page (photo, name, menu, "next show") | `index.html` + `data/site.json` | admin → Front page |
| Work, FILM, LIVE, NEWS, PHOTOS | `Work.html`, `FILM.html` … + `data/work.json`, `films.json`, `shows.json`, `news.json`, `photos.json` | admin |
| Contact emails, press bio, links | `data/site.json` | admin → Contact & press |
| Shows from her calendar (optional) | `data/calendar.json` | `tools/sync_calendar.py`, run daily by `.github/workflows/sync-calendar.yml` |
| About, album pages, Contact, Store, Bio | `*.html` from the recovered Cargo pages | `_source/build.py` |

- `js/app.js` draws the data pages and the top menu from `data/*.json` in the browser, so an admin
  Publish is live after GitHub Pages redeploys (about a minute). No build step.
- LIVE splits shows into Upcoming / Past by today's date in the visitor's browser, so it never goes stale.
- `images/` holds web-sized pictures (max 2000 px); `press/` holds the full-size press photos for download.
  The Cargo originals are backed up outside the repo in `~/gydadiamond-site-originals`.
- `css/site.css` is Cargo's stylesheet (Vollkorn replaces Dolly Pro); `css/static.css` replaces Cargo's
  layout scripts; `css/app.css` styles the front page, top menu and data pages.

## The admin
`/admin/` signs in with a fine-grained GitHub token for this one repository
(Contents: read & write, Actions: read & write). Publish makes one commit with all the changes,
including uploaded pictures (resized in the browser; press photos also keep the original).
It refuses to publish if someone changed the same data file since the admin was opened.
"Preview" shows unpublished changes on the real pages (`?preview`).
On localhost there is a "try without a key" mode that never writes.

The repository it writes to is set at the top of `admin/admin.js` (`REPO`).

## Rebuilding the old pages
`python3 _source/build.py` regenerates every `.html` page (Cargo pages from `_source/allpages.json`,
plus the shells of the front page and the data pages). It does **not** touch `data/`.
`_source/make_data.py` was the one-time move of Cargo content into `data/`; don't run it again.

Local preview (serves `/About` like GitHub Pages does): `python3 _source/serve.py 8772`, then http://localhost:8772

## Hosting
GitHub Pages from the `main` branch, root folder. Until the Bluehost DNS is changed the site lives at
https://gunnitynes.github.io/gydadiamond-site/. After the DNS change, move `_source/CNAME.later` back to
`CNAME` at the root (it holds `gydadiamond.net`) and turn on Enforce HTTPS in the Pages settings.

DNS at Bluehost (nameservers set back to Bluehost's own):
- `A` records for `@`: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- `CNAME` for `www` → `<github-username>.github.io`
