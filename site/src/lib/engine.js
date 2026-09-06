/* Everything derived from the dataset is computed here, never stored. */
import { Store } from "./store"
import { monthKey, pad, round2 } from "./format"

const S = () => Store.s

export const orgById = (id) => S().organizations.find((o) => o.id === id) || null
export const orgName = (id) => { const o = orgById(id); return o ? o.name : "Unknown organization" }
export const orgColor = (id) => { const o = orgById(id); return o ? o.color : "#64748b" }
export const orgsSorted = () => S().organizations.slice().sort((a, b) => a.name.localeCompare(b.name))

export const workItemById = (id) => S().workItems.find((w) => w.id === id) || null
export const workItemTitle = (id) => { const w = workItemById(id); return w ? w.title : "" }
const RANK = { active: 0, paused: 1, completed: 2 }
export const workItemsSorted = () => S().workItems.slice().sort((a, b) => (RANK[a.status] - RANK[b.status]) || a.title.localeCompare(b.title))
export const workItemsForOrg = (orgId) => workItemsSorted().filter((w) => w.orgId === orgId)
export const activeWorkItems = () => workItemsSorted().filter((w) => w.status === "active")

export const sumHours = (entries) => round2(entries.reduce((s, e) => s + e.hours, 0))

export function entriesSorted(sortKey = "date", dir = "desc") {
  const sign = dir === "asc" ? 1 : -1
  const name = (e) => orgName(e.orgId).toLowerCase()
  return S().entries.slice().sort((a, b) => {
    let r = 0
    if (sortKey === "hours") r = a.hours - b.hours
    else if (sortKey === "org") r = name(a).localeCompare(name(b))
    else r = a.date.localeCompare(b.date)
    if (r === 0) r = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    return r * sign
  })
}
/** Hours implied by a time-in / time-out pair, or null when either is missing. */
export function spanHours(start, end) {
  if (!start || !end) return null
  const [a, b] = [start, end].map((t) => { const [h, m] = t.split(":").map(Number); return h + m / 60 })
  return b > a ? round2(b - a) : null
}
export const unsignedEntries = () => S().entries.filter((e) => !e.signed)
export function filterEntries(entries, { search = "", orgId = "", workItemId = "", category = "", from = "", to = "", signed = "" } = {}) {
  const q = search.trim().toLowerCase()
  return entries.filter((e) => {
    if (orgId && e.orgId !== orgId) return false
    if (signed === "unsigned" && e.signed) return false
    if (signed === "signed" && !e.signed) return false
    if (workItemId && e.workItemId !== workItemId) return false
    if (category && e.category !== category) return false
    if (from && e.date < from) return false
    if (to && e.date > to) return false
    if (q && !`${e.activity} ${e.notes} ${e.supervisor} ${e.category} ${orgName(e.orgId)} ${workItemTitle(e.workItemId)}`.toLowerCase().includes(q)) return false
    return true
  })
}
export const entriesForWorkItem = (id) => entriesSorted().filter((e) => e.workItemId === id)

export function hoursByMonth(months = 12, ref = new Date()) {
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleString(undefined, { month: "short" }), year: d.getFullYear(), hours: 0, count: 0 })
  }
  const idx = new Map(out.map((m, i) => [m.key, i]))
  for (const e of S().entries) { const i = idx.get(monthKey(e.date)); if (i !== undefined) { out[i].hours = round2(out[i].hours + e.hours); out[i].count++ } }
  return out
}
export function hoursByOrg(entries = S().entries) {
  const map = new Map()
  for (const e of entries) { const c = map.get(e.orgId) || { orgId: e.orgId, hours: 0, count: 0 }; c.hours = round2(c.hours + e.hours); c.count++; map.set(e.orgId, c) }
  return [...map.values()].map((r) => ({ ...r, org: orgById(r.orgId), name: orgName(r.orgId) })).sort((a, b) => b.hours - a.hours)
}
export function hoursByWorkItem(entries = S().entries) {
  const map = new Map()
  for (const e of entries) {
    if (!e.workItemId) continue
    const c = map.get(e.workItemId) || { workItemId: e.workItemId, hours: 0, count: 0 }; c.hours = round2(c.hours + e.hours); c.count++; map.set(e.workItemId, c)
  }
  return [...map.values()].map((r) => ({ ...r, item: workItemById(r.workItemId) })).filter((r) => r.item).sort((a, b) => b.hours - a.hours)
}
export function workItemStats(id) {
  const entries = S().entries.filter((e) => e.workItemId === id)
  const dates = entries.map((e) => e.date).sort()
  const w = workItemById(id)
  const hours = sumHours(entries)
  const pct = w && w.targetHours > 0 ? Math.min(100, (hours / w.targetHours) * 100) : null
  return { hours, count: entries.length, last: dates[dates.length - 1] || "", memos: S().memos.filter((m) => m.workItemId === id).length, pct }
}
export const memosFor = (id) => S().memos.filter((m) => m.workItemId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

/* ---- plans ---- */
export const plansSorted = () => S().plans.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.start || "").localeCompare(b.start || "") || a.createdAt.localeCompare(b.createdAt))
export const plansOn = (iso) => plansSorted().filter((p) => p.date === iso)
export function upcomingPlans(from, limit = 6) { return plansSorted().filter((p) => p.status === "planned" && p.date >= from).slice(0, limit) }
export function overduePlans(today) { return plansSorted().filter((p) => p.status === "planned" && p.date < today) }
export function plannedHours(from, to) { return sumHours(S().plans.filter((p) => p.status === "planned" && p.date >= from && p.date <= to)) }
/** Hours a plan implies: explicit hours, else the start–end span. */
export function planHours(p) {
  if (p.hours) return p.hours
  if (p.start && p.end) { const [a, b] = [p.start, p.end].map((t) => { const [h, m] = t.split(":").map(Number); return h + m / 60 }); return b > a ? round2(b - a) : 0 }
  return 0
}

export function stats(now = new Date()) {
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`, y = String(now.getFullYear())
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1), pk = `${pm.getFullYear()}-${pad(pm.getMonth() + 1)}`
  const e = S().entries
  const year = e.filter((x) => x.date.startsWith(y))
  return {
    total: sumHours(e), count: e.length,
    month: sumHours(e.filter((x) => x.date.startsWith(ym))), prevMonth: sumHours(e.filter((x) => x.date.startsWith(pk))),
    year: sumHours(year), yearCount: year.length,
    orgs: S().organizations.length, activeOrgs: new Set(year.map((x) => x.orgId)).size,
    goal: S().goals.yearly,
  }
}
