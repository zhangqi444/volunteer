# AGENTS.md — Volunteer Tracker

Read this before changing anything. It is the contract for agents and for humans,
and it is deliberately the same shape as `zhangqi444/isee/AGENTS.md`: the two
sites share one stack, one look, and one Google Drive contract.

## What this is

A static website for one volunteer's record of service: **organizations** they
work with, **work items** (projects or commitments under an organization, with a
status and an optional target), **hours entries** logged against an organization
and optionally a work item, and **memos** kept on each work item. Reports print
for schools, employers and verification letters.

Live at <https://zhangqi444.github.io/volunteer/>.

## Repository layout

```
site/
  index.html               Vite entry
  vite.config.js           injects the OAuth client id (from oauth.json) and the Google Identity script
  oauth.json               the Google OAuth client's public facts (no secrets)
  src/main.jsx             boot: store init, theme, render
  src/App.jsx              shell (sidebar + header) and the hash router
  src/lib/store.js         the store: localStorage first, Google Drive mirror, merge
  src/lib/drive.js         Google Sign-In + Drive file read/write
  src/lib/model.js         dataset shape, normalize(), sample data, CSV
  src/lib/engine.js        every derived number (totals, per-month, per-org, per-item) — computed, never stored
  src/lib/format.js        fmtDate, fmtHours, todayISO, uid …
  src/lib/router.js        16 lines of hash routing
  src/components/ui/       shadcn/ui components, written into the repo (not a dependency)
  src/components/          app-sidebar, site-header, nav-user, dialogs (all forms), toast, bits
  src/pages/               home, work (list + detail), log, orgs, reports, settings
  public/                  favicon, manifest, service worker
  test_*.cjs               three Playwright suites — see Testing
.github/workflows/pages.yml  build + deploy to GitHub Pages
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 8**, `base: './'` | static output, works under `/volunteer/` |
| UI | **React 19** + **Tailwind v4** + **shadcn/ui** | components live in `src/components/ui/`, owned by the repo and editable |
| Icons / charts | **lucide-react**, **recharts 3** | |
| Font | the device's own UI stack | no webfont request |
| Router | hash routing in `src/lib/router.js` | GitHub Pages has no server-side rewrites |
| State | one plain object + `useSyncExternalStore` (`src/lib/store.js`) | no Redux, no context tree |
| Storage | **localStorage first, Google Drive as the mirror** | see below |
| Hosting | GitHub Pages via Actions | |

**No backend, ever.** No server, no database, no account system beyond Google's.

## The Google file system

- **Auth**: Google Identity Services token client, OAuth 2.0 implicit flow, scope
  `drive.file openid email profile`. `drive.file` is non-sensitive, so the consent
  screen stays in **Testing** with the owner as a test user. Client id in `site/oauth.json`.
- **Storage**: one file, `volunteer-tracker-data.json`, in the root of the user's
  Drive, tagged with `appProperties.app = volunteer-tracker` so it is found again
  after a rename or move. The app can only see files it created.
- **Order of truth**: localStorage is written first and synchronously; Drive is a
  mirror pushed on a 1.2 s debounce. The app is fully usable signed out.
- **Merge** (`Store.merge`): per record, last write wins by `at`. `deleted` holds
  tombstones; a tombstone newer than a record beats the record on both sides, so a
  deletion on one device is not undone by another's copy. Goals and categories are
  last-write-wins as a block. A record only one side has is always kept.
- **Payload**: `schema: 2` — `organizations, workItems, entries, memos, deleted,
  goals, settings`. Adding a slice means adding it to `normalize`, `merge`,
  `replaceAll` and `test_drive.cjs`.
- **Session handling** lives in `src/lib/drive.js` and is the pattern isee copies:
  `ensureToken()` before every call, one 401 retry, `hasGrantedAllScopes`, a
  `pagehide` keepalive flush, an offline queue that retries on `online`. First
  grant uses `prompt: "consent"`, later ones `prompt: ""`.
- **Popups**: never call `requestAccessToken` without a click behind it.

## Commands

```bash
cd site
npm ci
npm run dev        # local dev server (add http://localhost:5173 to the OAuth origins)
npm run build      # → site/dist   (the Pages build)
npm test           # all three Playwright suites, against the built dist/
```

## Testing

| Suite | Covers |
|---|---|
| `test_e2e.cjs` | desktop + phone shells, drawer, first organization and entry, validation, persistence, breadcrumb, theme |
| `test_drive.cjs` | Google stubbed: sign in once, reload without a prompt, push, merge with tombstones, expiry + silent reconnect, disconnect |
| `test_features.cjs` | sample data, dashboard chart, work items + memos, log filters and sort, reports, settings |

Rules: every feature gets checks in the suite it belongs to; a UI change that
breaks a selector means fixing the test's *assumption*, not deleting the check.
All three must pass before a commit.

## UI conventions

- shadcn/ui components only; if one is missing, add it to `src/components/ui/`
  rather than hand-rolling a div.
- Colour has one meaning each: **destructive** = delete, **warning/amber** =
  paused or expired, **success/green** = done or target reached, **primary** = the
  one action to take. Never a standing count that looks like an alarm.
- Every page is reachable and escapable from the breadcrumb; the sidebar is a
  drawer on phones, so nothing may live only there.
- Container queries (`@md/main:`) rather than viewport breakpoints inside the shell.
- Dark mode is a first-class theme, not an inversion. Tokens in `src/index.css`
  are the same "Calm Scholar" set as isee.
- Numbers use `tabular-nums`. Dates render through `fmtDate`. A value with no data
  says "—", not zero.

## Hard rules

1. **The volunteer's record is sacred.** Hours, memos and organizations are never
   dropped by a merge; deletions happen only through the UI, with a confirm, and
   are carried as tombstones so the other device agrees.
2. **No backend, no accounts, no third-party analytics.** The data belongs to the
   volunteer and stays in their browser and their Drive.
3. **Honest numbers.** Reports say hours are self-reported. Estimates are labelled.
4. Pushes go to `main` and deploy immediately; a red build is fixed before anything else.
