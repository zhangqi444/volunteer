# Volunteer Tracker

A static website for one volunteer's record of service: the organizations they
work with, the **work items** (projects and commitments) under each, the hours
logged against them, and memos kept on each work item. Reports print for
schools, employers and verification letters.

There is no backend. Data is saved in the browser first and, once the volunteer
signs in with Google, mirrored to a JSON file the app creates in **their own
Google Drive**. Live at <https://zhangqi444.github.io/volunteer/>.

This project is the sibling of [`zhangqi444/isee`](https://github.com/zhangqi444/isee):
same stack, same shell, same theme tokens, same Drive contract, same test layout.
`AGENTS.md` is the contract; `CLAUDE.md` is the working agreement for agent sessions.

## Layout

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

## Publishing on GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main` that touches `site/`,
builds with `npm ci && npm run build` and publishes `site/dist`. Pages must be
set to **Source: GitHub Actions** (Settings → Pages). Every asset path is
relative (`base: './'`), so the same build works at a domain root or under
`user.github.io/volunteer/`.

## Google Drive

Scope is `https://www.googleapis.com/auth/drive.file`: non-sensitive, no Google
verification needed, and the app can only see the one file it created,
`volunteer-tracker-data.json`. The client id and the other public facts of the
OAuth client are in `site/oauth.json`. To set up your own:

1. In Google Cloud Console, enable the **Google Drive API**.
2. OAuth consent screen: *External*, add yourself as a test user, add the scope above.
3. Credentials → OAuth client ID → *Web application*; add your site's origin
   (for example `https://<user>.github.io`, no path) under Authorized JavaScript origins.
4. Put the client id in `site/oauth.json`.

The app works fully without signing in. With Drive connected, edits are pushed
about a second after they happen; two devices merge per record, last write wins,
and deletions are carried as tombstones so neither device resurrects the other's
deleted records. Sign-ins last an hour and reconnect silently.

## Data file

```json
{
  "schema": 2,
  "organizations": [{ "id": "…", "name": "Riverside Food Bank", "color": "#0f7a6b", "at": "2026-09-02T…" }],
  "workItems": [{ "id": "…", "orgId": "…", "title": "Saturday warehouse shifts", "status": "active", "targetHours": 40, "at": "…" }],
  "entries": [{ "id": "…", "date": "2026-09-02", "orgId": "…", "workItemId": "…", "activity": "Sorted donations", "hours": 3, "at": "…" }],
  "memos": [{ "id": "…", "workItemId": "…", "date": "2026-09-02", "text": "Sign in at the side entrance.", "at": "…" }],
  "deleted": { "<record id>": "<time it was deleted>" },
  "goals": { "yearly": 60, "at": "…" },
  "settings": { "categories": ["Community", "Education"], "at": "…" }
}
```

Files written by the first version of this site (no `at`, no `deleted`) load
unchanged; `normalize()` fills the gaps.
