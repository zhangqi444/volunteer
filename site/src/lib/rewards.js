/* Points, levels, badges and the reward shelf. Same shape as isee's rewards:
 * points are earned for doing the work, badges are computed from the record and
 * PINNED the first time they are earned (Store.s.badges) so nothing is ever taken
 * away, and a parent-curated shelf lets Sheila claim rewards with points that
 * never cost a level. No streaks that punish a missed week, no leaderboard. */
import { Store } from "./store"
import { monthKey, round2, ts, uid } from "./format"
import { sumHours } from "./engine"

/* ---------- points: for the doing, not for being good at it ---------- */
export const POINT_RULES = [
  { id: "hours", label: "Each hour of volunteering", points: 10, unit: "per hour" },
  { id: "reflection", label: "Writing how it went", points: 5, unit: "per entry" },
  { id: "photo", label: "Keeping a photo of the day", points: 5, unit: "per entry" },
  { id: "plan", label: "Planning it first, then doing it", points: 5, unit: "per plan carried out" },
  { id: "memo", label: "A memo on a work item", points: 2, unit: "per memo" },
]
export function pointsBreakdown(entries = Store.s.entries) {
  const s = Store.s
  const hours = sumHours(entries)
  const rows = [
    { ...POINT_RULES[0], count: hours, total: Math.round(hours * 10) },
    { ...POINT_RULES[1], count: entries.filter((e) => e.reflection).length, total: entries.filter((e) => e.reflection).length * 5 },
    { ...POINT_RULES[2], count: entries.filter((e) => e.photos.length).length, total: entries.filter((e) => e.photos.length).length * 5 },
    { ...POINT_RULES[3], count: s.plans.filter((p) => p.status === "done").length, total: s.plans.filter((p) => p.status === "done").length * 5 },
    { ...POINT_RULES[4], count: s.memos.length, total: s.memos.length * 2 },
  ]
  return { rows, total: rows.reduce((n, r) => n + r.total, 0) }
}
export const effortPoints = () => pointsBreakdown().total
/** Points earned by one entry, for the "you earned" toast. */
export function entryPoints(e) { return Math.round(e.hours * 10) + (e.reflection ? 5 : 0) + (e.photos.length ? 5 : 0) }

/* ---------- levels ---------- */
export const LEVELS = [
  { n: 1, title: "Starter", at: 0 },
  { n: 2, title: "Helper", at: 50 },
  { n: 3, title: "Regular", at: 120 },
  { n: 4, title: "Steady", at: 220 },
  { n: 5, title: "Dependable", at: 350 },
  { n: 6, title: "Strong", at: 500 },
  { n: 7, title: "Skilled", at: 700 },
  { n: 8, title: "Seasoned", at: 950 },
  { n: 9, title: "Standout", at: 1250 },
  { n: 10, title: "Star", at: 1600 },
]
/** Level from lifetime points. Spending on rewards never costs a level. */
export function levelOf(points) {
  let i = 0
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].at) i = k
  const cur = LEVELS[i], next = LEVELS[i + 1] || null
  const span = next ? next.at - cur.at : 1
  return { ...cur, next, into: points - cur.at, span, pct: next ? Math.min(100, Math.round(((points - cur.at) / span) * 100)) : 100 }
}

/* ---------- helpers over the record ---------- */
const S = () => Store.s
const totalHours = () => sumHours(S().entries)
const orgsUsed = () => new Set(S().entries.map((e) => e.orgId).filter(Boolean)).size
const itemsDone = () => S().workItems.filter((w) => w.status === "completed").length
const plansDone = () => S().plans.filter((p) => p.status === "done").length
const reflections = () => S().entries.filter((e) => e.reflection).length
const photos = () => S().entries.filter((e) => e.photos.length).length
const catalogTried = () => new Set(S().workItems.filter((w) => w.catalogId && S().entries.some((e) => e.workItemId === w.id)).map((w) => w.catalogId)).size
function monthsInARow() {
  const keys = [...new Set(S().entries.map((e) => monthKey(e.date)))].sort()
  let run = 0, best = 0
  for (let i = 0; i < keys.length; i++) {
    const [y, m] = keys[i].split("-").map(Number), prev = i ? keys[i - 1].split("-").map(Number) : null
    run = prev && (y * 12 + m) - (prev[0] * 12 + prev[1]) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}
const activeDays = () => new Set(S().entries.map((e) => e.date)).size

/* ---------- badge catalogue ----------
 * `have`/`need` drive the progress bar; a badge is earned when have >= need.
 * Tiers are separate badges so an earned one is never replaced by a bigger one. */
const T = (id, name, desc, icon, group, need, get, unit) => ({ id, name, desc, icon, group, need, get, unit })
export const BADGES = [
  T("first-entry", "First hours", "Log your first hours", "Footprints", "Hours", 1, () => S().entries.length, "entry"),
  T("hours-5", "Five hours", "Five hours given", "Clock", "Hours", 5, totalHours, "h"),
  T("hours-10", "Ten hours", "Ten hours given", "Clock", "Hours", 10, totalHours, "h"),
  T("hours-25", "Twenty-five hours", "A full day's worth, spread out", "Clock", "Hours", 25, totalHours, "h"),
  T("hours-50", "Fifty hours", "Fifty hours given", "Medal", "Hours", 50, totalHours, "h"),
  T("hours-100", "A hundred hours", "A hundred hours given", "Trophy", "Hours", 100, totalHours, "h"),
  T("hours-250", "Two hundred and fifty", "Two hundred and fifty hours", "Crown", "Hours", 250, totalHours, "h"),
  T("days-10", "Ten days out", "Volunteer on ten different days", "CalendarDays", "Habits", 10, activeDays, "days"),
  T("days-30", "Thirty days out", "Thirty different days", "CalendarDays", "Habits", 30, activeDays, "days"),
  T("three-months", "Three months in a row", "Hours in three consecutive months", "CalendarCheck", "Habits", 3, monthsInARow, "months"),
  T("six-months", "Half a year", "Hours in six consecutive months", "CalendarCheck", "Habits", 6, monthsInARow, "months"),
  T("first-plan-done", "Planned it, did it", "Turn a calendar plan into logged hours", "CalendarCheck", "Habits", 1, plansDone, "plan"),
  T("plans-5", "Keeps her word", "Five plans carried out", "CalendarCheck", "Habits", 5, plansDone, "plans"),
  T("two-orgs", "Two organizations", "Hours with two different organizations", "Building2", "Projects", 2, orgsUsed, "orgs"),
  T("work-item-done", "Seen it through", "Complete a work item", "ClipboardCheck", "Projects", 1, itemsDone, "item"),
  T("items-3", "Three seen through", "Complete three work items", "ClipboardCheck", "Projects", 3, itemsDone, "items"),
  T("catalog-3", "Explorer", "Try three things from the catalog", "Compass", "Projects", 3, catalogTried, "activities"),
  T("first-memo", "First memo", "Keep a note on a work item", "StickyNote", "Story", 1, () => S().memos.length, "memo"),
  T("first-reflection", "In her own words", "Write how a day went", "PenLine", "Story", 1, reflections, "reflection"),
  T("reflections-10", "Storyteller", "Ten reflections written", "PenLine", "Story", 10, reflections, "reflections"),
  T("first-photo", "First photo", "Keep a picture of the day", "Camera", "Story", 1, photos, "photo"),
  T("photos-10", "Scrapbook", "Ten days with a photo", "Camera", "Story", 10, photos, "photos"),
]
export const BADGE_GROUPS = ["Hours", "Habits", "Projects", "Story"]
const BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]))

/** Live state of every badge: earned (with the date it was pinned) and progress toward the rest. */
export function badgeState() {
  const earned = S().badges || {}
  return BADGES.map((b) => {
    let have = 0
    try { have = b.get() || 0 } catch { have = 0 }
    const pinned = earned[b.id]
    return { ...b, have: round2(have), done: !!pinned || have >= b.need, at: pinned || null, pct: Math.min(100, Math.round((have / b.need) * 100)) }
  })
}
/** Pin anything newly earned. Returns the badges earned by this call. */
export function syncBadges() {
  const ids = badgeState().filter((b) => !S().badges[b.id] && b.have >= b.need).map((b) => b.id)
  if (ids.length) Store.pinBadges(ids)
  return ids.map((id) => BY_ID[id])
}
export function recentBadges(days = 3) {
  const cut = Date.now() - days * 86400000
  return badgeState().filter((b) => b.at && ts(b.at) >= cut).sort((a, b) => ts(b.at) - ts(a.at))
}
/** What is closest to being earned, for the dashboard nudge. */
export function nextBadge() {
  const open = badgeState().filter((b) => !b.done && b.have > 0)
  open.sort((a, b) => b.pct - a.pct || a.need - b.need)
  return open[0] || badgeState().find((b) => !b.done) || null
}
export function badgeCounts() { const all = badgeState(); return { earned: all.filter((b) => b.done).length, total: all.length } }

/* ---------- the reward shelf ----------
 * Slice `rewards`, one key per row: "item:<id>" is a reward the parent put on the
 * shelf, "claim:<id>" is Sheila claiming one. Points are spent at claim time; a
 * claim can be cancelled, which puts them back. */
export const SUGGESTED = [
  { name: "Pick Friday's movie", cost: 60 },
  { name: "Boba on the way home", cost: 80 },
  { name: "Choose Saturday's dinner", cost: 100 },
  { name: "An extra hour of screen time", cost: 120 },
  { name: "A new book she picks herself", cost: 200 },
  { name: "A day out — her choice where", cost: 400 },
]
const rows = () => S().rewards || {}
export function shelf() {
  return Object.keys(rows()).filter((k) => k.startsWith("item:") && !rows()[k].removed)
    .map((k) => ({ id: k.slice(5), key: k, ...rows()[k] }))
    .sort((a, b) => a.cost - b.cost)
}
export function claims() {
  return Object.keys(rows()).filter((k) => k.startsWith("claim:"))
    .map((k) => ({ id: k.slice(6), key: k, ...rows()[k] }))
    .filter((c) => c.status !== "cancelled")
    .sort((a, b) => ts(b.at) - ts(a.at))
}
export function spent() { return claims().reduce((n, c) => n + (c.cost || 0), 0) }
/** Lifetime points fix the level; the balance is what is left after claims. */
export function wallet() {
  const lifetime = effortPoints()
  const used = spent()
  return { lifetime, spent: used, balance: Math.max(0, lifetime - used), level: levelOf(lifetime) }
}
export function addReward(name, cost) {
  const id = uid()
  Store.setReward("item:" + id, () => ({ name: String(name).slice(0, 80), cost: Math.max(5, Math.round(cost) || 50) }))
  return id
}
export function updateReward(id, patch) { Store.setReward("item:" + id, (cur) => ({ ...cur, ...patch })) }
export function removeReward(id) { Store.setReward("item:" + id, (cur) => ({ ...cur, removed: true })) }
export function claimReward(item) {
  if (wallet().balance < item.cost) return null
  const id = uid()
  Store.setReward("claim:" + id, () => ({ rewardId: item.id, name: item.name, cost: item.cost, status: "claimed", claimedAt: new Date().toISOString() }))
  return id
}
export function markGiven(id) { Store.setReward("claim:" + id, (cur) => ({ ...cur, status: "given", givenAt: new Date().toISOString() })) }
export function cancelClaim(id) { Store.setReward("claim:" + id, (cur) => ({ ...cur, status: "cancelled" })) }
