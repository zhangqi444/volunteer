/* The data model: what a valid dataset looks like, how a foreign JSON (Drive
 * file, backup, legacy cache) is coerced into one, sample data, CSV export.
 *
 * Every record carries `at` (ISO time of its last edit) so two devices can be
 * merged last-write-wins per record, and `deleted` holds tombstones so a
 * deletion on one device is not undone by the other's copy. */
import { isISODate, round2, todayISO, toISODate, uid } from "./format"

export const SCHEMA = 3
export const DEFAULT_CATEGORIES = ["Community", "Education", "Environment", "Health", "Animals", "Arts & Culture", "Disaster Relief", "Faith-based", "Other"]
export const ORG_COLORS = ["#0f7a6b", "#3b6fb6", "#7c3aed", "#c2417d", "#b4653a", "#9c6f16", "#2e7d5b", "#0891b2", "#64748b"]
export const WORK_STATUSES = ["active", "paused", "completed"]
/* This is Sheila's tracker (see AGENTS.md). A dataset that has never had a profile starts as her, 9 on 2026-09-05. */
export const DEFAULT_PROFILE = { name: "Sheila", age: 9, ageAsOf: "2026-09-05" }
export const PLAN_STATUSES = ["planned", "done", "skipped"]
export const INTEREST_STATUSES = ["interested", "applied", "joined", "passed"]

export function emptyData() {
  const now = new Date().toISOString()
  return {
    schema: SCHEMA,
    updatedAt: now,
    organizations: [],
    workItems: [],
    entries: [],
    memos: [],
    plans: [],
    interests: {},
    deleted: {},
    goals: { yearly: 50, at: "" },
    settings: { categories: DEFAULT_CATEGORIES.slice(), profile: { ...DEFAULT_PROFILE }, at: "" },
    theme: undefined,
  }
}

const str = (v) => String(v ?? "")
const stamp = (r, fallback) => (typeof r.at === "string" && r.at) || (typeof r.updatedAt === "string" && r.updatedAt) || r.createdAt || fallback

/** Coerce arbitrary JSON into a dataset. Throws when it is not even an object. */
export function normalize(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("This is not a Volunteer Tracker data file.")
  const out = emptyData()
  const fileAt = typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString()

  const orgs = Array.isArray(raw.organizations) ? raw.organizations : []
  out.organizations = orgs
    .filter((o) => o && typeof o === "object" && str(o.name).trim())
    .map((o, i) => ({
      id: str(o.id || uid()), name: str(o.name).trim(), contact: str(o.contact), contactInfo: str(o.contactInfo), website: str(o.website),
      color: ORG_COLORS.includes(o.color) ? o.color : ORG_COLORS[i % ORG_COLORS.length], notes: str(o.notes),
      createdAt: o.createdAt || fileAt, at: stamp(o, fileAt),
    }))
  const orgIds = new Set(out.organizations.map((o) => o.id))

  const items = Array.isArray(raw.workItems) ? raw.workItems : []
  out.workItems = items
    .filter((w) => w && typeof w === "object" && str(w.title).trim() && orgIds.has(str(w.orgId)))
    .map((w) => ({
      id: str(w.id || uid()), orgId: str(w.orgId), title: str(w.title).trim(), description: str(w.description),
      status: WORK_STATUSES.includes(w.status) ? w.status : "active", startDate: isISODate(w.startDate) ? w.startDate : "",
      targetHours: Math.max(0, round2(Number(w.targetHours) || 0)), createdAt: w.createdAt || fileAt, at: stamp(w, fileAt),
    }))
  const itemIds = new Set(out.workItems.map((w) => w.id))

  const entries = Array.isArray(raw.entries) ? raw.entries : []
  out.entries = entries
    .filter((e) => e && typeof e === "object" && isISODate(e.date))
    .map((e) => ({
      id: str(e.id || uid()), date: e.date, orgId: orgIds.has(str(e.orgId)) ? str(e.orgId) : "",
      workItemId: itemIds.has(str(e.workItemId)) ? str(e.workItemId) : "", activity: str(e.activity).trim() || "Volunteer work",
      category: str(e.category), hours: Math.max(0, round2(Number(e.hours) || 0)), supervisor: str(e.supervisor), notes: str(e.notes),
      createdAt: e.createdAt || fileAt, at: stamp(e, fileAt),
    }))
    .filter((e) => e.hours > 0)

  const memos = Array.isArray(raw.memos) ? raw.memos : []
  out.memos = memos
    .filter((m) => m && typeof m === "object" && itemIds.has(str(m.workItemId)) && str(m.text).trim())
    .map((m) => ({
      id: str(m.id || uid()), workItemId: str(m.workItemId), date: isISODate(m.date) ? m.date : (str(m.createdAt).slice(0, 10) || todayISO()),
      text: str(m.text).trim(), createdAt: m.createdAt || fileAt, at: stamp(m, fileAt),
    }))

  const plans = Array.isArray(raw.plans) ? raw.plans : []
  out.plans = plans
    .filter((p) => p && typeof p === "object" && isISODate(p.date) && str(p.title).trim())
    .map((p) => ({
      id: str(p.id || uid()), date: p.date, start: /^\d{2}:\d{2}$/.test(p.start) ? p.start : "", end: /^\d{2}:\d{2}$/.test(p.end) ? p.end : "",
      hours: Math.max(0, round2(Number(p.hours) || 0)), title: str(p.title).trim(),
      orgId: orgIds.has(str(p.orgId)) ? str(p.orgId) : "", workItemId: itemIds.has(str(p.workItemId)) ? str(p.workItemId) : "",
      catalogId: str(p.catalogId), notes: str(p.notes), status: PLAN_STATUSES.includes(p.status) ? p.status : "planned",
      entryId: str(p.entryId), createdAt: p.createdAt || fileAt, at: stamp(p, fileAt),
    }))

  if (raw.interests && typeof raw.interests === "object") {
    for (const k of Object.keys(raw.interests)) {
      const v = raw.interests[k]
      if (v && typeof v === "object" && INTEREST_STATUSES.includes(v.status)) out.interests[k] = { status: v.status, note: str(v.note), at: stamp(v, fileAt) }
    }
  }

  if (raw.deleted && typeof raw.deleted === "object") {
    for (const k of Object.keys(raw.deleted)) if (typeof raw.deleted[k] === "string") out.deleted[k] = raw.deleted[k]
  }
  const yearly = Number(raw.goals && raw.goals.yearly)
  out.goals = { yearly: Number.isFinite(yearly) && yearly >= 0 ? yearly : 50, at: (raw.goals && typeof raw.goals.at === "string" && raw.goals.at) || (raw.goals ? fileAt : "") }
  const cats = raw.settings && Array.isArray(raw.settings.categories) ? raw.settings.categories : null
  const prof = raw.settings && raw.settings.profile && typeof raw.settings.profile === "object" ? raw.settings.profile : null
  const age = prof ? Number(prof.age) : NaN
  out.settings = {
    categories: cats && cats.length ? [...new Set(cats.map((c) => str(c).trim()).filter(Boolean))] : DEFAULT_CATEGORIES.slice(),
    profile: prof ? { name: str(prof.name).trim(), age: Number.isInteger(age) && age >= 0 && age < 120 ? age : null, ageAsOf: isISODate(prof.ageAsOf) ? prof.ageAsOf : "" } : { ...DEFAULT_PROFILE },
    at: (raw.settings && typeof raw.settings.at === "string" && raw.settings.at) || (cats ? fileAt : ""),
  }
  out.theme = raw.theme === "light" || raw.theme === "dark" ? raw.theme : undefined
  if (typeof raw.owner === "string" && raw.owner) out.owner = raw.owner
  out.updatedAt = fileAt
  return out
}

/* ---------- CSV ---------- */
function csvEscape(v) { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export function toCSV(rows, header) {
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n"
}
export function downloadFile(name, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------- sample data ---------- */
export function sampleData() {
  const d = emptyData()
  const now = new Date(), iso = now.toISOString()
  const ago = (months, day) => toISODate(new Date(now.getFullYear(), now.getMonth() - months, Math.min(day, 28)))
  const rec = (o) => ({ ...o, createdAt: iso, at: iso })
  d.organizations = [
    { id: "org-food", name: "Riverside Food Bank", contact: "Maria Lopez", contactInfo: "volunteer@riversidefoodbank.org", website: "https://example.org", color: "#0f7a6b", notes: "Saturday morning shifts, warehouse entrance on 3rd St." },
    { id: "org-lib", name: "Public Library Literacy Program", contact: "Dev Patel", contactInfo: "(555) 010-2244", website: "", color: "#3b6fb6", notes: "Weekly reading buddies with 2nd graders." },
    { id: "org-park", name: "Friends of Cedar Park", contact: "", contactInfo: "", website: "", color: "#2e7d5b", notes: "" },
  ].map(rec)
  d.workItems = [
    { id: "wi-pantry", orgId: "org-food", title: "Saturday warehouse shifts", description: "Recurring 3-hour shifts sorting donations and packing weekend meal boxes.", status: "active", startDate: ago(9, 1), targetHours: 40 },
    { id: "wi-mobile", orgId: "org-food", title: "Mobile pantry distributions", description: "Monthly pop-up distribution at the community center parking lot.", status: "active", startDate: ago(6, 1), targetHours: 0 },
    { id: "wi-reading", orgId: "org-lib", title: "Reading buddies (2nd grade)", description: "Paired reading with the same student each week during the school year.", status: "active", startDate: ago(8, 15), targetHours: 20 },
    { id: "wi-trail", orgId: "org-park", title: "Spring trail restoration", description: "Litter cleanup, invasive removal, and replanting along the creek trail.", status: "completed", startDate: ago(7, 1), targetHours: 10 },
  ].map(rec)
  d.memos = [
    { workItemId: "wi-pantry", date: ago(8, 13), text: "Team lead is Maria. Sign in at the side entrance; gloves are in the bin by the loading dock." },
    { workItemId: "wi-pantry", date: ago(1, 5), text: "Asked about a verification letter for school. Maria can sign the printed report at the end of the month." },
    { workItemId: "wi-reading", date: ago(7, 18), text: "Paired with J. Loves dinosaur books. Try the 'Danny and the Dinosaur' series next week." },
    { workItemId: "wi-reading", date: ago(3, 7), text: "J. read a full chapter book aloud for the first time. Dev suggested moving to level 3 readers." },
    { workItemId: "wi-trail", date: ago(2, 9), text: "Planting day wrapped up the project. 40 saplings in, all litter bags collected. Ask about fall maintenance." },
  ].map((m) => rec({ ...m, id: uid() }))
  const link = { "Sorted and shelved donations": "wi-pantry", "Packed weekend meal boxes": "wi-pantry", "Mobile pantry distribution": "wi-mobile", "Reading buddies session": "wi-reading", "Spring trail cleanup": "wi-trail", "Native plant garden weeding": "wi-trail", "Tree planting day": "wi-trail" }
  d.entries = [
    [ago(9, 6), "org-food", "Sorted and shelved donations", "Community", 3, "Maria Lopez", ""],
    [ago(8, 13), "org-food", "Packed weekend meal boxes", "Community", 3.5, "Maria Lopez", "Packed 120 boxes with a team of six."],
    [ago(8, 20), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
    [ago(7, 4), "org-park", "Spring trail cleanup", "Environment", 4, "", "Collected 14 bags of litter along the creek trail."],
    [ago(7, 18), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
    [ago(6, 8), "org-food", "Mobile pantry distribution", "Community", 4, "Maria Lopez", "Served about 90 families."],
    [ago(5, 2), "org-lib", "Summer reading kickoff event", "Education", 5, "Dev Patel", "Registration table and craft station."],
    [ago(5, 16), "org-park", "Native plant garden weeding", "Environment", 2.5, "", ""],
    [ago(4, 11), "org-food", "Sorted and shelved donations", "Community", 3, "Maria Lopez", ""],
    [ago(3, 7), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
    [ago(3, 21), "org-food", "Packed weekend meal boxes", "Community", 3.5, "Maria Lopez", ""],
    [ago(2, 9), "org-park", "Tree planting day", "Environment", 5, "", "Planted 40 saplings with the neighborhood association."],
    [ago(1, 5), "org-food", "Mobile pantry distribution", "Community", 4, "Maria Lopez", ""],
    [ago(1, 19), "org-lib", "Reading buddies session", "Education", 1.5, "Dev Patel", ""],
    [ago(0, Math.max(1, now.getDate() - 3)), "org-food", "Sorted and shelved donations", "Community", 3, "Maria Lopez", ""],
  ].map(([date, orgId, activity, category, hours, supervisor, notes]) => rec({ id: uid(), date, orgId, workItemId: link[activity] || "", activity, category, hours, supervisor, notes }))
  d.goals = { yearly: 60, at: iso }
  d.settings.profile = { name: "Sheila", age: 9, ageAsOf: toISODate(now) }
  d.settings.at = iso
  d.updatedAt = iso
  return d
}
