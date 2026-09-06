# Design

The look and feel of the Volunteer Tracker, and the reasons behind it. Companion
to [architecture.md](architecture.md). The rules that must not drift are in
[AGENTS.md](../AGENTS.md) under *UI conventions*; this document explains them.

## Who it is for

Sheila, 9, and the parent sitting next to her. The parent signs in and keeps the
record straight; Sheila should be able to read every screen. That means short
labels, concrete words, no hype, one obvious next action per screen, and numbers
that mean what they say. A page never makes a quiet month feel like failure.

## Principles

1. **The catalog is the front door.** Choosing something to do comes before
   recording it. Every catalog card can log hours or plan a date directly.
2. **One action per screen is primary.** Exactly one filled `primary` button per
   view; everything else is secondary, outline or ghost.
3. **Colour has one meaning each.**
   - *primary* (teal): the one thing to do now, and the volunteer's own marks.
   - *success* (green): done, logged, or a target reached.
   - *warning* (amber): waiting on you: a past plan not yet logged, a Drive session
     to reconnect, a paused item.
   - *destructive* (rust): only delete and sign out. Never a standing count that
     looks like an alarm.
   - a **dot** on a badge means "something new", never a number.
4. **Honest numbers.** A value with no data says "—", not 0. Totals are
   `tabular-nums`. Reports say hours are self-reported. Estimates are labelled.
5. **Always a way out.** Every page is reachable and escapable from the breadcrumb.
   The sidebar is a drawer on phones, so nothing may live only in the sidebar.
6. **Dark mode is a theme, not an inversion.** Every token has a dark value chosen
   for contrast, not computed.

## Theme

The tokens are the "Calm Scholar" set shared with isee, defined in
`site/src/index.css` as CSS variables and mapped into Tailwind v4 with `@theme inline`.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `background` | `#f4f7f6` | `#101614` | page |
| `card` | `#ffffff` | `#18201e` | cards, dialogs |
| `foreground` | `#16211f` | `#e6edea` | text |
| `muted-foreground` | `#5c6b68` | `#9daea9` | secondary text |
| `primary` | `#0f7a6b` | `#5fc7b2` | the one action, active nav, progress |
| `accent` | `#dcebe7` | `#1b322d` | hover and selected surfaces |
| `success` / `-soft` | `#2e7d5b` / `#ddeee4` | `#63be92` / `#172c22` | done, logged |
| `warning` / `-soft` | `#9c6f16` / `#f5ead2` | `#d8ae5c` / `#2b2415` | waiting on you |
| `destructive` | `#b4653a` | `#df9a6e` | delete, sign out |
| `border` | `#d8e0dd` | `#2a3532` | hairlines |
| `chart-1…5` | teal, blue, amber, rust, green | lighter versions | recharts series |
| `sidebar*` | `#edf2f0` family | `#0c1210` family | the sidebar surface |
| `radius` | `0.75rem` | | cards and controls |

Type is the device's own UI stack (`ui-sans-serif, system-ui, …`): no webfont
request, and the PWA is self-contained. Sizes: page title `text-2xl` semibold,
card title `text-base` semibold, body `text-sm`, captions `text-xs`, stat values
`text-2xl` to `text-3xl` in `tabular-nums`. Organization colours are a fixed palette
of nine (`ORG_COLORS` in `model.js`) that reads in both themes; they appear as a
dot in the organization chip and as a top border on organization and work-item cards.

## Layout

- **Shell**: shadcn's sidebar layout, `variant="inset"`. Sidebar 16rem, header
  3rem. The sidebar holds the brand, the one primary button (*Log hours*), the six
  routes with quiet counts (active work items, planned dates), and the account menu.
- **Header**: breadcrumb (home icon plus the last two crumbs on phones), the Drive
  status button (*Saved to Drive*, *Syncing…*, *Reconnect Drive*), the theme toggle.
- **Content**: `p-4 md:p-6` inside a `@container/main`. Grids use **container
  queries**, not viewport breakpoints (`@xl/main:grid-cols-2`,
  `@5xl/main:grid-cols-4`), so a card behaves the same in the inset and in a
  future narrower host. Cards that need their own breakpoints declare
  `@container/card`.
- **Phones**: the sidebar becomes a drawer that closes after navigation; tables
  scroll inside their own container; dialogs become full-width sheets with the
  primary action at the bottom; footers stack.

## Components

shadcn/ui only, copied into `src/components/ui/` and edited in place. When one is
missing, it is added there rather than hand-rolled. App-level pieces live in
`components/bits.jsx`:

- `Pick`: a select that allows "none" (Radix forbids an empty item value) and
  renders the platform's own `<select>` on touch devices, where the custom dropdown
  was unreliable inside a dialog on iOS. The native version has no vertical padding
  and 16px text so iOS neither clips the label nor zooms the page.
- `OrgChip`: dot + name, truncating. `StatusBadge`: active / paused / completed.
- `Stat`: label, big tabular number, one-line caption. `Empty`: dashed box with a
  sentence and, when there is one, the action that fixes it.
- `PageHeader`: title, one-line description, and the page's actions on the right.

## Screens

| Screen | Job | Notes |
|---|---|---|
| Sign in | The gate | Brand, one headline, three reassurances about Drive, the Google button. Disabled with a reason until Google Identity Services has loaded. |
| Dashboard | What's up next and how it's going | Greeting by profile name; yearly goal progress; *Up next* (plans, with past ones to log in amber); stat tiles; hours by month (recharts, one series); hours by organization (bars in organization colours); active work items with target progress; recent activity. |
| Catalog | Choose something to do | Filters (search, fit, organization, kind, tag). Each card: title, kind, fit badge, organization link, summary, tags, *Details* (sources, ages, how-to, contact, check date), interest picker, **Log hours**, **Plan it**, and a link to its work item once one exists. |
| Calendar | Plan ahead | Monday-first month grid with plans as chips (teal planned, green done, amber past-unlogged, struck-through skipped); day panel; *Past plans to log*; *Coming up*. Double-click a day to plan on it. |
| Work items | Track a commitment | Cards with organization colour, status, totals, target progress. Detail: stats, target bar, the tracker table, and memos with a compose box (Ctrl+Enter saves). |
| Hours log | The record | Filters, sortable table, work-item tag under the activity, CSV export. |
| Organizations | Who she works with | Cards with contact, website, last date, totals, and shortcuts to log or start an item. |
| Rewards | Something to work toward | Level card with the ten levels, how points are earned (a table that can only grow), the shelf with suggested rewards and claims to mark given, and the badges in four groups: Hours, Habits, Projects, Story. |
| Reports | Something to hand over | Two formats: the summary (tiles, by organization, by work item, detailed log with reflections) and **verification letters**, one printed page per organization with the hours listed, a confirmation sentence naming the volunteer and age, and supervisor, printed-name, date and parent signature lines. Print styles hide everything else. |
| Settings | Profile, goal, categories, theme, Drive, data | Age is stored with the date it was set and advances by itself. |

## Motion and states

- Dialogs fade and scale in 200 ms; the toast slides up from the bottom and holds
  2.6 s (5 s for errors). Chart bars do not animate, so screenshots are stable and
  the chart reads the same for people who turn motion off (`prefers-reduced-motion`
  is honoured globally).
- Saving is quiet: the header flips *Syncing…* → *Saved to Drive*; there is no toast
  for a successful sync. Toasts confirm the volunteer's own actions ("Logged 2.5
  hours · plan marked done") and report errors.
- Every empty state says what would fill it and offers the button that does.
- **After logging, one question**: "How did it go?" with a textarea in her words and a
  photo button, skippable in one tap. Reflections render in italics under the entry
  wherever it appears; photos as small square thumbnails, in a grid on the work item.
- **Rewards** follow isee: a level line on the dashboard, medallions for earned
  badges and dashed locked ones with a thin progress bar, a shelf where the parent
  writes what points buy. The toast names a badge once, the moment it is pinned; the
  sidebar shows a dot for new badges, never a number. Nothing counts down or nags.
- **Leaving the app**: a plan's calendar icon opens Google Calendar prefilled; the
  `.ics` button hands the calendar file to whatever app the device uses.

## Writing

Sentence case everywhere, including buttons. Dates render through `fmtDate`
("Sep 5, 2026", "Sat, Sep 5" in tight spots). Hours are "2.5 h" in tables and
"2.5 hours" in sentences. No exclamation marks, no streaks that punish a missed
week, no leaderboard. Catalog copy is written so a parent and a nine-year-old can
read it together, and every fact in it has a source.
