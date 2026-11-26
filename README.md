# gydadiamond.net

Gyða Valtýsdóttir's website. It started as a static rebuild of her Cargo 2 site (recovered from the
Internet Archive, January–April 2026) and is now partly data-driven, with an admin at **/admin/**.

## How it fits together
| Part | Where | Edited by |
|---|---|---|
| Front page (photo, name, menu, "next show") | `index.html` + `data/site.json` | admin → Front page |
| Work, FILM, LIVE, NEWS, PHOTOS, CONTACT | `Work.html`, `FILM.html` … + `data/work.json`, `films.json`, `shows.json`, `news.json`, `photos.json`, `site.json` | admin |
| About, Full bio | `About.html`, `FULL-BIO.html` + `data/about.json` | admin → About |
| Album pages (Mother Pearl, Ox, Evolution, Epicycle, Epicycle II) | `Ox.html` … + the album's entry in `data/work.json` (matched by its `page`) | admin → Work |
| Contact emails, press bio, links | `data/site.json` | admin → Contact & press |
| Shows from her calendar (optional) | `data/calendar.json` | `tools/sync_calendar.py`, run daily by `.github/workflows/sync-calendar.yml` |
| Music videos, With others, Instant composition | `Music-Video.html` … + `data/videos.json` (each video's `page`) | admin → Videos |
| Store | `STORE.html`, built from the albums in `data/work.json` (`buy`) | admin → Work |

- `js/app.js` draws the data pages and the top menu from `data/*.json` in the browser, so an admin
  Publish is live after GitHub Pages redeploys (about a minute). No build step.
- LIVE splits shows into Upcoming / Past by today's date in the visitor's browser, so it never goes stale.
- `images/` holds web-sized pictures (max 2000 px); `press/` holds the full-size press photos for download.
  The Cargo originals are backed up outside the repo in `~/gydadiamond-site-originals`.
- `css/site.css` is Cargo's stylesheet (Vollkorn replaces Dolly Pro); `css/static.css` replaces Cargo's
  layout scripts; `css/app.css` styles the front page, top menu and data pages.

## The admin
`/admin/` signs in with a password. The password is checked by a small free service on Cloudflare (`service/`), which holds
the GitHub key and is the only thing that writes to this repository. It accepts changes to `data/*.json` and pictures in
`images/`, `images/t/` and `press/`, nothing else. Publish makes one commit with all the changes (press photos also keep the
original) and refuses if someone changed the same data file since the admin was opened.
"Preview" shows unpublished changes on the real pages (`?preview`). On localhost there is a "try without signing in" mode
that never writes.

- **Passwords**: Gyða chooses and changes it in the admin, with a 6-digit code from Gunnar's authenticator app. Nobody else
  can see it. Wrong tries lead to longer and longer pauses. A new password signs every other device out.
- **The service's address** is at the top of `admin/service.js` (`URL_LIVE`); `setup.mjs` fills it in.

In `service/` (run `npm install` once):
- `node setup.mjs` sets everything up, or continues where it stopped.
- `node setup.mjs key` replaces the GitHub key (fine-grained, this repository only, Contents and Actions: read and write).
- `node setup.mjs code` moves the codes to a new phone; the old phone's codes stop working.
- `npm test` and `node browser-test.mjs` test everything against a pretend GitHub.
- All the pauses can be lifted by changing `EPOCH` in `wrangler.jsonc` and running `npx wrangler deploy`.

## Quick post
`/admin/post/` is a phone page that adds one news post or one show (same password and service; drafts stay on the phone).
`node post-test.mjs` in `service/` tests it.

## The guide for Gyða
`/admin/guide/` is a step-by-step guide that opens straight away for anyone signed in to the admin; everyone else is asked
for the admin password. `admin/guide/guide.bin` is encrypted; the sign-in service gives the key to signed-in browsers only.
The readable source and the key are in `~/gydadiamond-guide` (not in this public repository); `node build.mjs` there makes
`guide.bin` again.

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

## Look, the page beside, History (Round 31)
- **Look tab** (admin): colours (dark sets + own colours, kept dark enough for white text), heading font (self-hosted in fonts/), and per page: photo, focus, layout (behind / top / beside / faint / none), brightness, title and small line. Saved in `data/site.json` → `look`; saved looks in `looks`. `js/look.js` is shared by the site and the admin; `_source/build.py` bakes the same look into the HTML, and the browser applies newer changes.
- **The page beside**: the admin shows the real page (`?preview&embed`, drafts in localStorage) in a frame that reloads as she types; Computer (1280×800) or Phone.
- **Drag to reorder**: albums, videos, films, the menu (⠿), photos.
- **Edit this page**: a button on the website for a browser signed in to the admin.
- **History**: `GET /history` and `GET /history/<sha>` in the service; a version comes back as unpublished changes, with deleted pictures put back from GitHub's own copies.

## Edit on the page (Round 32)
- Signed in to the admin in this browser, every page shows **✎ Edit this page**: the same page with `?edit`. `js/app.js` then loads `admin/service.js` and `js/edit.js` (+ `css/edit.css`), which fetch the data from the service and keep it in the objects the page is drawn from.
- In edit mode only, the renderers in app.js tag what can be edited: `data-ei` (which thing), `data-ef` (which field), `data-ek` (`block` = several lines, `img` = picture). Visitors' pages carry none of it.
- Typing changes the data at once; blocks open a writing box; pictures open a small menu; each thing has tools (drag ⠿, ✎ Details, ⋯ hide/delete); `+ New …` adds; **Page photo** edits the Look of that page. Publish is the same one-commit publish as the admin. Unpublished texts are kept in localStorage (`gyda-edit:draft`) and follow her from page to page.
- Local test: `/<page>?edit&local` with any `gyda.session` set reads `data/` and never writes. Test: `service/edit-test.mjs`.

