# AGENTS.md — Volunteer Tracker

Read this before changing anything. It is the contract for agents and for humans,
and it is deliberately the same shape as `zhangqi444/isee/AGENTS.md`: the two
sites share one stack, one look, and one Google Drive contract.

## What this is

A static website for one volunteer's record of service. The volunteer is
**Sheila**, 9 years old (her age lives in Settings → Volunteer and advances by
itself); her parent signs in with their Google account. The site keeps
**organizations** she works with, **work items** (projects or commitments under an
organization, with a status and an optional target), **hours entries** logged
against an organization and optionally a work item, **memos** on each work item,
and **plans** on a calendar. A **catalog** of researched opportunities, filtered
by what fits her age, is where new work starts. Reports print for schools,
employers and verification letters.

Live at <https://qizhang.top/volunteer/> (the custom domain of `zhangqi444.github.io`;
also reachable at <https://zhangqi444.github.io/volunteer/>).

## Repository layout

```
content/
  catalog.json             the opportunity catalog: the only content the site teaches (see Content rules)
site/
  make_bundle.py           content/** → site/public/content/bundle.json (the app's only content input)
  index.html               Vite entry
  vite.config.js           injects the OAuth client id (from oauth.json) and the Google Identity script
  oauth.json               the Google OAuth client's public facts (no secrets)
  src/main.jsx             boot: store init, theme, render
  src/App.jsx              shell (sidebar + header) and the hash router
  src/lib/store.js         the store: localStorage first, Google Drive mirror, merge
  src/lib/drive.js         Google Sign-In + Drive file read/write
  src/lib/model.js         dataset shape, normalize(), sample data, CSV
  src/lib/engine.js        every derived number (totals, per-month, per-org, per-item, plans) — computed, never stored
  src/lib/content.js       loads the bundle; fit(item, age) decides Fits now / With an adult / From age N
  src/lib/format.js        fmtDate, fmtHours, todayISO, uid …
  src/lib/router.js        16 lines of hash routing
  src/components/ui/       shadcn/ui components, written into the repo (not a dependency)
  src/components/          app-sidebar, site-header, nav-user, dialogs (all forms), toast, bits
  src/pages/               signin, home, calendar, catalog, work (list + detail), log, orgs, reports, settings
  public/                  favicon, manifest, service worker
  test_*.cjs               three Playwright suites — see Testing
.github/workflows/pages.yml  build + deploy to GitHub Pages
docs/                      architecture.md (structure and why), design.md (look, feel, and why)
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
| Storage | **localStorage first, Google Drive as the mirror; sign-in required** | see below |
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
  mirror pushed on a 1.2 s debounce.
- **The gate**: sign-in is required. A device that has never signed in sees only the
  sign-in screen (`src/pages/signin.jsx`). Once signed in, the app opens offline and
  shows *Reconnect* when the hourly token lapses; nothing is lost meanwhile.
  Signing out clears the device (the file in Drive keeps everything), and a
  different Google account signing in on the same device starts from the file, never
  from the previous account's local copy (`owner` on the local dataset).
- **Merge** (`Store.merge`): per record, last write wins by `at`. `deleted` holds
  tombstones; a tombstone newer than a record beats the record on both sides, so a
  deletion on one device is not undone by another's copy. Goals and categories are
  last-write-wins as a block. A record only one side has is always kept.
- **Payload**: `schema: 4` — `organizations, workItems, entries, memos, plans,
  interests, badges, suggestions, deleted, goals, settings`. `plans` are calendar
  records (a plan turns into an hours entry through *Log hours* and keeps the
  `entryId`); `interests` is keyed by catalog item id, tombstoned as
  `interest:<id>`; `badges` maps milestone id → the time it was first earned
  (earliest wins on merge, tombstoned as `badge:<id>`); `suggestions` are links the
  owner dropped for the catalog. Entries carry `reflection` (her words) and
  `photos` (Drive file ids). Adding a slice means adding it to `normalize`,
  `merge`, `replaceAll` and `test_drive.cjs`.
- **Photos** are separate Drive files created by the app (`drive.file` covers them),
  tagged `appProperties.kind = photo` with the `entryId`, shrunk to 1600px JPEG in
  the browser first, shown from a session-cached object URL, and deleted best-effort
  when their entry or the photo is removed.
- **Session handling** lives in `src/lib/drive.js` and is the pattern isee copies:
  `ensureToken()` before every call, one 401 retry, `hasGrantedAllScopes`, a
  `pagehide` keepalive flush, an offline queue that retries on `online`. First
  grant uses `prompt: "consent"`, later ones `prompt: ""`.
- **Popups**: never call `requestAccessToken` without a click behind it.

## Data model

Milestones (`engine.milestones()`) are computed, then **pinned on first earning**
by `Store.pinBadges` and never recomputed away, the same rule as isee's badges.
Plans leave the app through `lib/calendar.js`: a Google Calendar template link per
plan (no API, no extra scope) and an `.ics` export for everything still planned.

Three layers exist in the data — organization → work item → hours entry — but the
volunteer never builds them by hand. **Logging starts from the catalog**:
`ensureFromCatalog(itemId)` (in `content.js`) creates the organization from the
catalog's own facts and a work item from the item on first use, linked by
`organization.catalogOrgId` and `workItem.catalogId`, and reuses them afterwards.
The catalog card's *Log hours* and *Plan it*, and the *From the catalog* picker
inside the Log hours and Plan dialogs, all go through it. The layers stay because
totals, reports and the calendar hang off them.

## Commands

```bash
cd site
npm ci
npm run dev        # local dev server (add http://localhost:5173 to the OAuth origins)
npm run build      # → site/dist   (the Pages build)
npm test           # all three Playwright suites, against the built dist/
python3 site/make_bundle.py   # rebuild bundle.json after editing content/**
```

`make_bundle.py` must be re-run and `site/public/content/bundle.json` committed
whenever `content/**` changes — CI fails the build if the committed bundle has drifted.

## Testing

| Suite | Covers |
|---|---|
| `test_e2e.cjs` | desktop + phone shells, drawer, first organization and entry, validation, persistence, breadcrumb, theme |
| `test_drive.cjs` | Google stubbed: the gate, sign in once, reload without a prompt, push, expiry + silent reconnect, merge with tombstones, sign out clears the device, sign in restores from Drive |
| `test_features.cjs` | sample data, dashboard chart, milestones, work items + memos, reflections + photos (fake Drive), log filters and sort, catalog fit filters + interest + Log hours/Plan it + suggestions, calendar (grid, Google Calendar link, .ics export, log hours from a plan, overdue, skipped), profile age, summary report + verification letters, settings |

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

## Content rules

- **Never invent a fact.** Every catalog item carries the source `url` and the
  `verified` date. Ages, times, fees and contact details come from that page (or
  its search summary when the page cannot be opened from the sandbox — say so in
  `note`) or are left out with "not stated". Confirming on the page before signing
  up is the volunteer's step, and the UI says so.
- **Scope**: the catalog holds only what Sheila can do at her age (with an adult
  where the source says so), from organizations the owner has pointed at (Seattle
  Humane, Seattle Children's). Teen-only programs are not listed; add them when she
  is old enough. Do not pad it with other organizations on your own initiative.
- Age rules are data: `ages: { min, max, withAdult, note }`. The catalog page
  computes the fit from the profile; never hard-code "9".
- Written for a parent and a nine-year-old reading together: short, concrete, no hype.

## Hard rules

1. **The volunteer's record is sacred.** Hours, memos and organizations are never
   dropped by a merge; deletions happen only through the UI, with a confirm, and
   are carried as tombstones so the other device agrees.
2. **No backend, no accounts, no third-party analytics.** The data belongs to the
   volunteer and stays in their browser and their Drive.
3. **Honest numbers.** Reports say hours are self-reported. Estimates are labelled.
4. Pushes go to `main` and deploy immediately; a red build is fixed before anything else.
