/* Persistence: localStorage first, synchronously; a JSON file in the user's own
 * Google Drive is the mirror, pushed on a 1.2 s debounce.
 * Sign-in is required once per device; after that the app opens offline and
 * reconnects silently when the hourly token lapses. Signing out clears the
 * device, so a second account never merges into the first one's file. */
import { useSyncExternalStore } from "react"
import { emptyData, normalize, INTEREST_STATUSES, ORG_COLORS, PLAN_STATUSES, SCHEMA, WORK_STATUSES } from "./model"
import { round2, todayISO, ts, uid } from "./format"
const str = (v) => String(v ?? "").trim()
import * as Drive from "./drive"

const KEY = "volunteer.v2"
const LEGACY_KEY = "vt:data"            // the first (vanilla) site's cache
const FILE = "volunteer-tracker-data.json"
const CLIENT_ID = (typeof window !== "undefined" && window.__OAUTH_CLIENT_ID__) || ""
export const DRIVE_ENABLED = typeof window !== "undefined" && !!window.__ENABLE_DRIVE__ && !!CLIENT_ID
const TOMBSTONE_DAYS = 120

function lsLoad() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalize(JSON.parse(raw))
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) return normalize(JSON.parse(legacy))
  } catch { /* fall through */ }
  return emptyData()
}
function lsSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode, quota */ } }

const listeners = new Set()
let version = 0
function emit() { version++; listeners.forEach((f) => f()) }
const now = () => new Date().toISOString()

export const Store = {
  s: null,
  status: "local",        // local | connecting | syncing | live | expired | error | unavailable
  ready: false,           // Google Identity script loaded, sign-in can be requested
  email: null, name: null, picture: null,
  lastError: null, lastSync: null,
  dark: false,

  init() {
    this.s = lsLoad()
    this.pruneTombstones()
    if (DRIVE_ENABLED) {
      Drive.init({
        clientId: CLIENT_ID, fileName: FILE,
        onState: (st, detail) => this.onDriveState(st, detail),
        onSaved: () => { this.lastSync = new Date() },
      }).then(() => { this.ready = true; emit(); if (Drive.hasSession()) this.resume() }).catch((e) => { this.lastError = e.message; this.setStatus("unavailable") })
      const p = Drive.getProfile()
      if (p) { this.email = p.email; this.name = p.name; this.picture = p.picture }
    }
    return this.s
  },
  /** Signed in on this device at some point: the app is usable, even while the token is expired. */
  hasSession() { return DRIVE_ENABLED && Drive.hasSession() },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  snapshot() { return version },
  setStatus(v) { if (this.status !== v) { this.status = v; emit() } },

  /* ---- writes: save locally, notify, mirror ---- */
  commit() { this.s.updatedAt = now(); lsSave(this.s); emit(); this.schedulePush() },
  bury(id) { this.s.deleted[id] = now() },
  pruneTombstones() {
    const cutoff = Date.now() - TOMBSTONE_DAYS * 86400e3
    for (const k of Object.keys(this.s.deleted)) if (ts(this.s.deleted[k]) < cutoff) delete this.s.deleted[k]
  },

  addOrg(f) {
    const o = { id: uid(), name: f.name.trim(), contact: f.contact || "", contactInfo: f.contactInfo || "", website: f.website || "",
      color: f.color || ORG_COLORS[this.s.organizations.length % ORG_COLORS.length], notes: f.notes || "", catalogOrgId: f.catalogOrgId || "", createdAt: now(), at: now() }
    this.s.organizations.push(o); this.commit(); return o
  },
  updateOrg(id, f) { const o = this.org(id); if (!o) return; Object.assign(o, f, { name: f.name.trim(), at: now() }); this.commit() },
  /** Deletes the organization and everything under it: work items, memos, hours. */
  deleteOrg(id) {
    const itemIds = new Set(this.s.workItems.filter((w) => w.orgId === id).map((w) => w.id))
    this.s.organizations = this.s.organizations.filter((o) => o.id !== id || (this.bury(o.id), false))
    this.s.workItems = this.s.workItems.filter((w) => !itemIds.has(w.id) || (this.bury(w.id), false))
    this.s.memos = this.s.memos.filter((m) => !itemIds.has(m.workItemId) || (this.bury(m.id), false))
    this.s.entries = this.s.entries.filter((e) => e.orgId !== id || (this.bury(e.id), false))
    this.s.plans.forEach((p) => { if (p.orgId === id) { p.orgId = ""; p.workItemId = ""; p.at = now() } })
    this.commit()
  },
  org(id) { return this.s.organizations.find((o) => o.id === id) || null },

  addWorkItem(f) {
    const w = { id: uid(), orgId: f.orgId, title: f.title.trim(), description: f.description || "", status: WORK_STATUSES.includes(f.status) ? f.status : "active",
      startDate: f.startDate || "", targetHours: Math.max(0, round2(Number(f.targetHours) || 0)), catalogId: f.catalogId || "", createdAt: now(), at: now() }
    this.s.workItems.push(w); this.commit(); return w
  },
  updateWorkItem(id, f) {
    const w = this.workItem(id); if (!w) return
    const orgChanged = f.orgId && f.orgId !== w.orgId
    Object.assign(w, f, { title: f.title.trim(), targetHours: Math.max(0, round2(Number(f.targetHours) || 0)), at: now() })
    if (orgChanged) this.s.entries.forEach((e) => { if (e.workItemId === id) { e.orgId = w.orgId; e.at = now() } })
    this.commit()
  },
  setWorkItemStatus(id, status) { const w = this.workItem(id); if (w && WORK_STATUSES.includes(status)) { w.status = status; w.at = now(); this.commit() } },
  /** Deletes the item and its memos. Logged hours are kept, unlinked. */
  deleteWorkItem(id) {
    this.s.workItems = this.s.workItems.filter((w) => w.id !== id || (this.bury(w.id), false))
    this.s.memos = this.s.memos.filter((m) => m.workItemId !== id || (this.bury(m.id), false))
    this.s.entries.forEach((e) => { if (e.workItemId === id) { e.workItemId = ""; e.at = now() } })
    this.s.plans.forEach((p) => { if (p.workItemId === id) { p.workItemId = ""; p.at = now() } })
    this.commit()
  },
  workItem(id) { return this.s.workItems.find((w) => w.id === id) || null },

  addEntry(f) {
    const e = { id: uid(), date: f.date, orgId: f.orgId, workItemId: f.workItemId || "", activity: f.activity.trim(), category: f.category || "",
      hours: round2(Number(f.hours)), start: f.start || "", end: f.end || "", signed: !!f.signed, supervisor: f.supervisor || "", notes: f.notes || "", reflection: f.reflection || "", photos: [], createdAt: now(), at: now() }
    this.s.entries.push(e); this.commit(); return e
  },
  updateEntry(id, f) { const e = this.entry(id); if (!e) return; Object.assign(e, f, { activity: f.activity.trim(), hours: round2(Number(f.hours)), at: now() }); this.commit() },
  deleteEntry(id) {
    const e = this.entry(id)
    if (e && e.photos.length) Drive.deleteFiles(e.photos.map((p) => p.id))   // best effort; the record goes regardless
    this.s.entries = this.s.entries.filter((x) => x.id !== id || (this.bury(x.id), false)); this.commit()
  },
  setSigned(id, signed) { const e = this.entry(id); if (!e) return; e.signed = !!signed; e.at = now(); this.commit() },
  setReflection(id, text) { const e = this.entry(id); if (!e) return; e.reflection = String(text || "").trim(); e.at = now(); this.commit() },
  addPhoto(entryId, photo) { const e = this.entry(entryId); if (!e) return; e.photos = [...e.photos, { id: photo.id, name: photo.name || "", at: now() }]; e.at = now(); this.commit() },
  removePhoto(entryId, photoId) {
    const e = this.entry(entryId); if (!e) return
    e.photos = e.photos.filter((p) => p.id !== photoId); e.at = now(); this.commit()
    Drive.deleteFiles([photoId])
  },

  /* --- milestones: pinned on first earning, never recomputed away --- */
  pinBadges(ids) {
    const fresh = ids.filter((id) => !this.s.badges[id])
    if (!fresh.length) return []
    for (const id of fresh) this.s.badges[id] = now()
    this.commit()
    return fresh
  },

  /* --- reward shelf: keyed rows, "item:<id>" and "claim:<id>" --- */
  setReward(key, fn) {
    const cur = this.s.rewards[key] || {}
    const next = fn(cur) || cur
    this.s.rewards[key] = { ...next, at: now() }
    this.commit()
  },

  /* --- catalog suggestions --- */
  addSuggestion(f) { const x = { id: uid(), url: (f.url || "").trim(), note: (f.note || "").trim(), status: "open", createdAt: now(), at: now() }; this.s.suggestions.push(x); this.commit(); return x },
  setSuggestionStatus(id, status) { const x = this.s.suggestions.find((s) => s.id === id); if (x) { x.status = status; x.at = now(); this.commit() } },
  deleteSuggestion(id) { this.s.suggestions = this.s.suggestions.filter((x) => x.id !== id || (this.bury(x.id), false)); this.commit() },
  entry(id) { return this.s.entries.find((e) => e.id === id) || null },

  addMemo(f) { const m = { id: uid(), workItemId: f.workItemId, date: f.date, text: f.text.trim(), createdAt: now(), at: now() }; this.s.memos.push(m); this.commit(); return m },
  updateMemo(id, f) { const m = this.memo(id); if (!m) return; Object.assign(m, { date: f.date || m.date, text: f.text.trim(), at: now() }); this.commit() },
  deleteMemo(id) { this.s.memos = this.s.memos.filter((m) => m.id !== id || (this.bury(m.id), false)); this.commit() },
  memo(id) { return this.s.memos.find((m) => m.id === id) || null },

  /* --- plans (the calendar) --- */
  addPlan(f) {
    const p = { id: uid(), date: f.date, start: f.start || "", end: f.end || "", hours: Math.max(0, round2(Number(f.hours) || 0)), title: f.title.trim(),
      orgId: f.orgId || "", workItemId: f.workItemId || "", catalogId: f.catalogId || "", notes: f.notes || "", status: "planned", entryId: "", createdAt: now(), at: now() }
    this.s.plans.push(p); this.commit(); return p
  },
  updatePlan(id, f) { const p = this.plan(id); if (!p) return; Object.assign(p, f, { title: (f.title ?? p.title).trim(), hours: Math.max(0, round2(Number(f.hours ?? p.hours) || 0)), at: now() }); this.commit() },
  setPlanStatus(id, status, entryId) { const p = this.plan(id); if (p && PLAN_STATUSES.includes(status)) { p.status = status; if (entryId !== undefined) p.entryId = entryId; p.at = now(); this.commit() } },
  deletePlan(id) { this.s.plans = this.s.plans.filter((p) => p.id !== id || (this.bury(p.id), false)); this.commit() },
  plan(id) { return this.s.plans.find((p) => p.id === id) || null },

  /* --- catalog interest --- */
  setInterest(catalogId, status, note) {
    if (!status) { if (this.s.interests[catalogId]) { delete this.s.interests[catalogId]; this.bury("interest:" + catalogId); this.commit() } return }
    if (!INTEREST_STATUSES.includes(status)) return
    const cur = this.s.interests[catalogId] || {}
    // `since` tracks when this status was reached, so "applied three weeks ago" stays true when a note is edited.
    this.s.interests[catalogId] = { status, note: note !== undefined ? note : (cur.note || ""), since: cur.status === status && cur.since ? cur.since : now(), at: now() }
    this.commit()
  },

  setProfile(p) {
    const age = Number(p.age)
    this.s.settings = { ...this.s.settings, profile: { name: str(p.name), age: Number.isInteger(age) && age >= 0 ? age : null, ageAsOf: Number.isInteger(age) && age >= 0 ? (p.ageAsOf || todayISO()) : "" }, at: now() }
    this.commit()
  },
  setGoal(h) { this.s.goals = { yearly: Math.max(0, Number(h) || 0), at: now() }; this.commit() },
  setCategories(list) {
    const cats = [...new Set(list.map((c) => c.trim()).filter(Boolean))]
    this.s.settings = { ...this.s.settings, categories: cats.length ? cats : emptyData().settings.categories, at: now() }; this.commit()
  },
  setTheme(t) { this.s.theme = t; lsSave(this.s); emit() },
  setDark(d) { if (this.dark !== d) { this.dark = d; emit() } },

  /** Import / sample / clear: everything not in `data` is buried so Drive does not bring it back. */
  replaceAll(data) {
    const keep = new Set([...data.organizations, ...data.workItems, ...data.entries, ...data.memos, ...data.plans, ...data.suggestions].map((r) => r.id))
    const gone = this.s.entries.filter((e) => !keep.has(e.id)).flatMap((e) => e.photos.map((p) => p.id))
    if (gone.length) Drive.deleteFiles(gone)                 // their entries are leaving; do not strand the files in Drive
    const deleted = { ...this.s.deleted }
    for (const r of [...this.s.organizations, ...this.s.workItems, ...this.s.entries, ...this.s.memos, ...this.s.plans, ...this.s.suggestions]) if (!keep.has(r.id)) deleted[r.id] = now()
    for (const k of Object.keys(this.s.badges)) if (!data.badges[k]) deleted["badge:" + k] = now()
    for (const k of Object.keys(this.s.rewards)) if (!data.rewards[k]) deleted["reward:" + k] = now()
    for (const k of Object.keys(this.s.interests)) if (!data.interests[k]) deleted["interest:" + k] = now()
    const t = now()
    for (const r of [...data.organizations, ...data.workItems, ...data.entries, ...data.memos, ...data.plans, ...data.suggestions]) r.at = t
    for (const k of Object.keys(data.interests)) data.interests[k].at = t
    for (const k of Object.keys(data.rewards)) data.rewards[k].at = t
    this.s = { ...data, deleted, theme: this.s.theme, owner: this.s.owner, goals: { ...data.goals, at: t }, settings: { ...data.settings, at: t } }
    this.commit()
  },

  /* ---- Google Drive ---- */
  onDriveState(st, detail) {
    if (st === "saving") this.setStatus("syncing")
    else if (st === "saved") { this.lastSync = new Date(); this.setStatus("live") }
    else if (st === "auth") { this.lastError = detail; this.setStatus("expired") }
    else if (st === "error" || st === "offline") { this.lastError = detail; this.setStatus("error") }
  },
  signIn() {
    if (!DRIVE_ENABLED || !Drive.available()) { this.setStatus("unavailable"); return Promise.resolve() }
    this.setStatus("connecting")
    return Drive.signIn().then((p) => this.afterAuth(p)).catch((e) => {
      this.lastError = e.message
      this.setStatus(e.code === "popup_closed" && Drive.hasSession() ? "expired" : e.code === "access_denied" ? "error" : Drive.hasSession() ? "expired" : "local")
    })
  },
  /** Boot: reconnect silently if the stored token is still inside its hour; otherwise show "reconnect". */
  resume() {
    return Drive.restoreSession().then((p) => { if (p) return this.afterAuth(p); this.setStatus("expired") })
  },
  afterAuth(p) {
    this.email = p.email; this.name = p.name; this.picture = p.picture
    // A different Google account on this device: its data must not merge into this one's file.
    if (this.s.owner && this.s.owner !== p.email) { this.s = { ...emptyData(), theme: this.s.theme }; lsSave(this.s); emit() }
    this.s.owner = p.email; lsSave(this.s)
    this.setStatus("syncing")
    return this.pull().then(() => { this.lastSync = new Date(); this.setStatus("live") }).catch((e) => {
      this.lastError = e.message
      this.setStatus(e instanceof Drive.AuthError ? "expired" : "error")
    })
  },
  signOut() {
    Drive.signOut()
    this.email = this.name = this.picture = null
    this.s = { ...emptyData(), theme: this.s.theme }     // the device is cleared; the file in Drive keeps everything
    lsSave(this.s)
    this.setStatus("local")
  },
  payload() {
    const { theme, owner, ...rest } = this.s
    return { ...rest, schema: SCHEMA, savedAt: now() }
  },
  pull() {
    return Drive.load().then((r) => {
      if (r && r.data) this.merge(r.data)
      return Drive.save(this.payload())          // seed the file, or write the merged result back
    })
  },
  push() { return Drive.save(this.payload()).then(() => { this.lastSync = new Date(); this.setStatus("live") }) },
  schedulePush() {
    if (!DRIVE_ENABLED || !Drive.isSignedIn()) return
    Drive.scheduleSave(this.payload())
  },
  flush() { return Drive.flush() },
  fileLink() { const f = Drive.getFile(); return f ? f.webViewLink : "" },
  hasPending() { return Drive.hasPending() },

  /** Per record: last write wins by `at`; a tombstone newer than the record wins over both. Never loses a record only one side has. */
  merge(remoteRaw) {
    let remote
    try { remote = normalize(remoteRaw) } catch { return }
    const dead = { ...remote.deleted, ...this.s.deleted }
    for (const k of Object.keys(remote.deleted)) if (ts(remote.deleted[k]) > ts(dead[k])) dead[k] = remote.deleted[k]
    const alive = (r) => !dead[r.id] || ts(dead[r.id]) < ts(r.at)
    const mergeList = (local, rem) => {
      const byId = new Map(local.map((r) => [r.id, r]))
      for (const r of rem) { const l = byId.get(r.id); if (!l || ts(r.at) > ts(l.at)) byId.set(r.id, r) }
      return [...byId.values()].filter(alive)
    }
    const orgs = mergeList(this.s.organizations, remote.organizations)
    const orgIds = new Set(orgs.map((o) => o.id))
    const items = mergeList(this.s.workItems, remote.workItems).filter((w) => orgIds.has(w.orgId))
    const itemIds = new Set(items.map((w) => w.id))
    const localPhotos = new Map(this.s.entries.map((e) => [e.id, e.photos]))
    const remotePhotos = new Map(remote.entries.map((e) => [e.id, e.photos]))
    const entries = mergeList(this.s.entries, remote.entries).map((e) => {
      // A photo added on either device stays, whichever side won the rest of the record.
      const seen = new Set(), photos = []
      for (const p of [...(localPhotos.get(e.id) || []), ...(remotePhotos.get(e.id) || [])]) if (!seen.has(p.id)) { seen.add(p.id); photos.push(p) }
      return { ...e, photos, orgId: orgIds.has(e.orgId) ? e.orgId : "", workItemId: itemIds.has(e.workItemId) ? e.workItemId : "" }
    })
    const memos = mergeList(this.s.memos, remote.memos).filter((m) => itemIds.has(m.workItemId))
    const plans = mergeList(this.s.plans, remote.plans).map((p) => ({ ...p, orgId: orgIds.has(p.orgId) ? p.orgId : "", workItemId: itemIds.has(p.workItemId) ? p.workItemId : "" }))
    const suggestions = mergeList(this.s.suggestions, remote.suggestions)
    const badges = { ...this.s.badges }
    for (const k of Object.keys(remote.badges)) if (!badges[k] || ts(remote.badges[k]) < ts(badges[k])) badges[k] = remote.badges[k]   // earliest earning wins
    for (const k of Object.keys(badges)) { const d = dead["badge:" + k]; if (d && ts(d) >= ts(badges[k])) delete badges[k] }
    const rewards = { ...this.s.rewards }
    for (const k of Object.keys(remote.rewards)) { const r = remote.rewards[k], l = rewards[k]; if (!l || ts(r.at) > ts(l.at)) rewards[k] = r }
    for (const k of Object.keys(rewards)) { const d = dead["reward:" + k]; if (d && ts(d) >= ts(rewards[k].at)) delete rewards[k] }
    const interests = { ...this.s.interests }
    for (const k of Object.keys(remote.interests)) { const r = remote.interests[k], l = interests[k]; if (!l || ts(r.at) > ts(l.at)) interests[k] = r }
    for (const k of Object.keys(interests)) { const d = dead["interest:" + k]; if (d && ts(d) >= ts(interests[k].at)) delete interests[k] }
    const goals = ts(remote.goals.at) > ts(this.s.goals.at) ? remote.goals : this.s.goals
    const settings = ts(remote.settings.at) > ts(this.s.settings.at) ? remote.settings : this.s.settings
    this.s = { ...this.s, organizations: orgs, workItems: items, entries, memos, plans, interests, badges, rewards, suggestions, deleted: dead, goals, settings, updatedAt: now() }
    this.pruneTombstones()
    lsSave(this.s); emit()
  },
}

/** Re-render on any store change. Returns the store itself. */
export function useStore() {
  useSyncExternalStore((fn) => Store.subscribe(fn), () => Store.snapshot(), () => Store.snapshot())
  return Store
}
