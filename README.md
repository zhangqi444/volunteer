# Volunteer Tracker

A static website for one volunteer's record of service: the organizations they
work with, the **work items** (projects and commitments) under each, the hours
logged against them, and memos kept on each work item. Reports print for
schools, employers and verification letters.

It is built for Sheila (9); the catalog checks each opportunity against her age.
There is no backend. You sign in with Google, and the app keeps your data in a
JSON file it creates in **your own Google Drive**, with a copy cached in the
browser so it opens offline. Live at <https://qizhang.top/volunteer/>.

This project is the sibling of [`zhangqi444/isee`](https://github.com/zhangqi444/isee):
same stack, same shell, same theme tokens, same Drive contract, same test layout.
`AGENTS.md` is the contract; `CLAUDE.md` is the working agreement for agent sessions.

## What it does

- **Catalog**: researched opportunities around Seattle (Seattle Humane youth projects, Seattle Children's, food banks, trail work parties, home baking and knitting). Each carries its source URL and check date, and shows *Fits now*, *With an adult*, or *From age N* against the volunteer's age. Mark interest, *Plan it*, or *Start work item*.
- **Calendar**: plan shifts and projects ahead; *Log hours* turns a plan into an entry, past plans wait under *Past plans to log* until logged or skipped; the dashboard shows what is up next.
- **Work items, hours log, organizations, reports, settings** as before.

## Layout

    content/catalog.json      the opportunity catalog (source of truth; every item has a source URL)
    site/make_bundle.py       content/** → site/public/content/bundle.json
    site/index.html           Vite entry
    site/vite.config.js       injects the OAuth client id (oauth.json) and the Google Identity script
    site/src/main.jsx         boot: store, theme, render
    site/src/App.jsx          shell (sidebar + header) and the hash router
    site/src/lib/             store (localStorage + Drive + merge), drive, model, engine, format, router
    site/src/components/ui/   shadcn/ui components, copied into the repo
    site/src/components/      app-sidebar, site-header, nav-user, dialogs, toast, bits
    site/src/pages/           home, work, log, orgs, reports, settings
    site/public/              favicon, manifest, service worker
    site/test_*.cjs           Playwright suites: e2e, drive, features
    .github/workflows/pages.yml  build + deploy to GitHub Pages

## Build

    cd site
    npm ci
    npm run dev       # http://localhost:5173 — add it to the OAuth client's origins for Drive locally
    npm run build     # → site/dist
    npm test          # the three Playwright suites, against dist/ (needs Chromium)
    python3 site/make_bundle.py   # after editing content/catalog.json; commit the bundle

## Publishing on GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main` that touches `site/`
or `content/`, rebuilds the bundle and fails if it differs from the committed
one, builds with `npm ci && npm run build` and publishes `site/dist`. Pages must be
set to **Source: GitHub Actions** (Settings → Pages). With *Deploy from a branch*
GitHub runs Jekyll over the repo root instead and serves this README as the home
page, even though the Actions deploy also succeeds. Every asset path is
relative (`base: './'`), so the same build works at a domain root or under
`user.github.io/volunteer/`.

## Google Drive

Scope is `https://www.googleapis.com/auth/drive.file`: non-sensitive, no Google
verification needed, and the app can only see the one file it created,
`volunteer-tracker-data.json`. The client id and the other public facts of the
OAuth client are in `site/oauth.json`. To set up your own:

1. In Google Cloud Console, enable the **Google Drive API**.
2. OAuth consent screen: *External*, add yourself as a test user, add the scope above.
3. Credentials → OAuth client ID → *Web application*; add every origin the site is
   served from (`https://qizhang.top` and `https://zhangqi444.github.io`, no path)
   under Authorized JavaScript origins.
4. Put the client id in `site/oauth.json`.

Sign-in is required once per device. Edits are pushed about a second after they
happen; two devices merge per record, last write wins, and deletions are carried
as tombstones so neither device resurrects the other's deleted records. Sign-ins
last an hour and reconnect silently; the app stays usable offline meanwhile.
Signing out clears the device, and the file in Drive keeps everything.

## Data file

```json
{
  "schema": 3,
  "organizations": [{ "id": "…", "name": "Riverside Food Bank", "color": "#0f7a6b", "at": "2026-09-02T…" }],
  "workItems": [{ "id": "…", "orgId": "…", "title": "Saturday warehouse shifts", "status": "active", "targetHours": 40, "at": "…" }],
  "entries": [{ "id": "…", "date": "2026-09-02", "orgId": "…", "workItemId": "…", "activity": "Sorted donations", "hours": 3, "at": "…" }],
  "memos": [{ "id": "…", "workItemId": "…", "date": "2026-09-02", "text": "Sign in at the side entrance.", "at": "…" }],
  "plans": [{ "id": "…", "date": "2026-09-13", "title": "No-sew cat blankets", "hours": 2, "status": "planned", "catalogId": "sh-cat-blankets", "at": "…" }],
  "interests": { "sh-cat-blankets": { "status": "interested", "note": "", "at": "…" } },
  "deleted": { "<record id>": "<time it was deleted>" },
  "goals": { "yearly": 60, "at": "…" },
  "settings": { "categories": ["Community", "Education"], "profile": { "name": "Sheila", "age": 9, "ageAsOf": "2026-09-05" }, "at": "…" }
}
```

Files written by the first version of this site (no `at`, no `deleted`) load
unchanged; `normalize()` fills the gaps.
