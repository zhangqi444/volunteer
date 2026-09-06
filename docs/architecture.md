# Architecture

How the Volunteer Tracker is put together, and why. Read [AGENTS.md](../AGENTS.md)
for the rules; this document explains the structure those rules protect. Its
sibling [design.md](design.md) covers the visual and interaction design.

## One sentence

A static React site, served by GitHub Pages, whose only backend is the volunteer's
own Google Drive: sign in once per device, edit locally, mirror to one JSON file.

## The shape

```
                 ┌────────────────────────────────────────────┐
  content/       │  catalog.json  ──make_bundle.py──▶ public/content/bundle.json
  (repo, read-   │                                     fetched once at boot
   only content) └────────────────────────────────────────────┘
                                          │
  ┌───────────────────────────────────────▼───────────────────────────────────┐
  │  browser                                                                  │
  │   pages/*  ──use──▶  lib/engine.js (derived numbers, computed never stored)│
  │      │                        │                                           │
  │      ▼ writes                 ▼ reads                                     │
  │   lib/store.js  ── Store.s (one plain object) ── useSyncExternalStore ──▶ React
  │      │  commit(): localStorage first, synchronously                       │
  │      ▼  schedulePush(): 1.2 s debounce                                    │
  │   lib/drive.js  ── Google Identity Services token ── Drive REST           │
  └───────────────────────────────────────┬───────────────────────────────────┘
                                          ▼
                     Google Drive: volunteer-tracker-data.json (drive.file scope)
```

There is no server, no database and no account system beyond Google's. If a
feature seems to need one, it is the wrong feature.

## Layers

| Layer | Where | Responsibility |
|---|---|---|
| Content | `content/catalog.json` → `site/public/content/bundle.json` | Researched opportunities with sources. Built by `site/make_bundle.py`; CI fails if the committed bundle drifts. Loaded by `lib/content.js` into the `C` object. Never the volunteer's data. |
| Model | `lib/model.js` | What a valid dataset looks like (`emptyData`), how any JSON becomes one (`normalize`), sample data, CSV. Every record carries `at`; `deleted` holds tombstones. |
| Store | `lib/store.js` | The single mutable object `Store.s`, every write (`addEntry`, `deleteOrg`, …), `commit()`, `merge()`, and the Drive session states. `useStore()` subscribes React. |
| Drive | `lib/drive.js` | Token client, `ensureToken()` before every call, one 401 retry, `hasGrantedAllScopes`, find/create/update the file by `appProperties`, debounced save with an offline queue and a `pagehide` keepalive flush. Knows nothing about the data shape. |
| Engine | `lib/engine.js` | Every derived number: totals, per month, per organization, per work item, plans due. Pure functions over `Store.s`. Nothing here is persisted. |
| Rewards | `lib/rewards.js` | Effort points, levels, the badge catalogue with pinning, the reward shelf and claims. Mirrors isee's module. |
| Calendar out | `lib/calendar.js` | Google Calendar template links and `.ics` text for plans. No API, no extra scope. |
| Photos | `lib/photos.js` | Shrink in the browser, upload through `drive.js`, resolve a cached object URL for display. |
| Content helpers | `lib/content.js` | `fit(item, age)`, `currentAge()`, and `ensureFromCatalog()` which turns a catalog item into an organization + work item on first use. |
| Shell | `App.jsx`, `components/app-sidebar.jsx`, `site-header.jsx`, `nav-user.jsx` | Sidebar (drawer on phones), breadcrumb header, Drive status, theme. The gate (`pages/signin.jsx`) renders instead of the shell until a device has signed in. |
| Pages | `pages/*.jsx` | One file per route. Pages read through the engine and write through the store; they hold only view state (filters, month cursor). |
| Dialogs | `components/dialogs.jsx` | Every form (entry, organization, work item, memo, plan, confirm) behind `useDialogs()`. A form owns its draft, so opening a second dialog from inside it leaves the draft intact. |
| UI kit | `components/ui/*` | shadcn/ui components copied into the repo; `bits.jsx` holds the app's small shared pieces (`Pick`, `OrgChip`, `Stat`, `Empty`). |

## Data model

```
organization ──< workItem ──< entry
      │              │  └──< memo
      │              └──< plan (a plan becomes an entry through Log hours; keeps entryId)
      └──────────────────< plan
catalog item ─(catalogOrgId / catalogId)─ organization / workItem   ← created on first use
interests[catalogId] = { status, note, at }
badges[badgeId] = firstEarnedAt              computed by rewards.badgeState(), pinned once
rewards["item:<id>"|"claim:<id>"]            the reward shelf and its claims (points are computed, never stored)
suggestions[] = { url, note, status }        links dropped for the catalog
entry.reflection, entry.photos[] = { id }    photos are separate Drive files (kind = photo)
goals { yearly, at }      settings { categories, profile { name, age, ageAsOf }, at }
deleted { id: deletedAt } tombstones, pruned after 120 days
```

Three layers exist because totals, reports and the calendar hang off them, but
the volunteer never builds them by hand: **logging starts from the catalog**.
`ensureFromCatalog(itemId)` creates the organization from the catalog's facts and a
work item from the item the first time either is needed, and reuses them after.

Every record has `id`, `createdAt` and `at` (last edit). `normalize()` accepts any
older shape, including files written by the first vanilla version of the site, and
fills the gaps; the payload declares `schema: 5`.

## Order of truth

1. A write mutates `Store.s`, stamps `at`, saves to `localStorage` **synchronously**,
   emits to React, and schedules a Drive push.
2. Drive is a **mirror**: pushed on a 1.2 s debounce so a burst of edits is one
   upload; pulled on sign-in and on reconnect.
3. On pull, `merge(remote)` runs **per record, last write wins by `at`**. A
   tombstone newer than a record beats the record on both sides, so a deletion on
   one device is not undone by the other. A record only one side has is kept.
   Goals and settings are last-write-wins as a block.
4. `replaceAll()` (import, sample data, delete all) buries every current record not
   in the new data, so Drive cannot resurrect them.

## Sessions and the gate

- A device that has never signed in sees only `pages/signin.jsx`. Google Identity
  Services opens its popup from that click; browsers block popups with no gesture,
  so nothing is ever requested on load.
- After sign-in the session (`token`, `profile`, `granted`, `file`) lives in
  `localStorage["volunteer.drive"]`. Tokens last an hour; `ensureToken()` refreshes
  silently with `prompt: ""`. When that fails the header shows *Reconnect* and the
  app keeps working from the local copy.
- `signOut()` revokes the token and **clears the device** (dataset and session).
  The dataset carries `owner` (the account email); if a different account signs in on
  the same device its local copy is discarded before the pull, so one account never
  merges into another's file.

## Build and deploy

- Vite 8 with `base: './'` so the same build works at a domain root or under
  `/volunteer/`. `vite.config.js` injects the public OAuth client id from
  `site/oauth.json` and the Google Identity script.
- `.github/workflows/pages.yml`: rebuild the bundle and fail on drift, `npm ci`,
  `npm run build`, `configure-pages` (with `enablement`), upload `site/dist`,
  `deploy-pages`. Pages **must** be on the GitHub Actions source; in branch mode
  Jekyll serves the README instead.
- `public/sw.js`: offline shell. Hashed assets are cached on first fetch;
  `index.html` is network-first so a new deploy shows up on the next visit.

## Testing

Three Playwright suites run against the built `dist/` served under `/volunteer/`
with Google stubbed (`test_helpers.cjs`: fake Identity Services that records every
prompt, fake Drive with one file). `test_e2e.cjs` covers the shells on desktop and a
touch-emulated phone; `test_drive.cjs` the whole session cycle including merge and
tombstones; `test_features.cjs` the catalog, calendar, work items, memos, log,
reports and settings. Selectors are `data-testid`; a UI change that breaks one means
fixing the test's assumption, never deleting the check.

## Relationship to isee

This repo and `zhangqi444/isee` share the stack, the shell, the theme tokens, the
store pattern, the test layout and the docs layout on purpose. The one deliberate
difference: isee is usable signed out with Drive as an opt-in mirror; this site
gates on sign-in (the owner's choice). isee's docs name this repo's `drive.js` as the
session-handling pattern to copy.
