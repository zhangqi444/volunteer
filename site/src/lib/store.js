/* Persistence: localStorage first, synchronously; a JSON file in the user's own
 * Google Drive is the mirror, pushed on a 1.2 s debounce once they sign in.
 * The app is fully usable signed out. */
import { useSyncExternalStore } from "react"
import { emptyData, normalize, ORG_COLORS, SCHEMA, WORK_STATUSES } from "./model"
import { round2, ts, uid } from "./format"
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
      }).then(() => { if (Drive.hasSession()) this.resume() }).catch((e) => { this.lastError = e.message; this.setStatus("unavailable") })
    }
    return this.s
  },
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
      color: f.color || ORG_COLORS[this.s.organizations.length % ORG_COLORS.length], notes: f.notes || "", createdAt: now(), at: now() }
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
    this.commit()
  },
  org(id) { return this.s.organizations.find((o) => o.id === id) || null },

  addWorkItem(f) {
    const w = { id: uid(), orgId: f.orgId, title: f.title.trim(), description: f.description || "", status: WORK_STATUSES.includes(f.status) ? f.status : "active",
      startDate: f.startDate || "", targetHours: Math.max(0, round2(Number(f.targetHours) || 0)), createdAt: now(), at: now() }
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
    this.commit()
  },
  workItem(id) { return this.s.workItems.find((w) => w.id === id) || null },

  addEntry(f) {
    const e = { id: uid(), date: f.date, orgId: f.orgId, workItemId: f.workItemId || "", activity: f.activity.trim(), category: f.category || "",
      hours: round2(Number(f.hours)), supervisor: f.supervisor || "", notes: f.notes || "", createdAt: now(), at: now() }
    this.s.entries.push(e); this.commit(); return e
  },
  updateEntry(id, f) { const e = this.entry(id); if (!e) return; Object.assign(e, f, { activity: f.activity.trim(), hours: round2(Number(f.hours)), at: now() }); this.commit() },
  deleteEntry(id) { this.s.entries = this.s.entries.filter((e) => e.id !== id || (this.bury(e.id), false)); this.commit() },
  entry(id) { return this.s.entries.find((e) => e.id === id) || null },

  addMemo(f) { const m = { id: uid(), workItemId: f.workItemId, date: f.date, text: f.text.trim(), createdAt: now(), at: now() }; this.s.memos.push(m); this.commit(); return m },
  updateMemo(id, f) { const m = this.memo(id); if (!m) return; Object.assign(m, { date: f.date || m.date, text: f.text.trim(), at: now() }); this.commit() },
  deleteMemo(id) { this.s.memos = this.s.memos.filter((m) => m.id !== id || (this.bury(m.id), false)); this.commit() },
  memo(id) { return this.s.memos.find((m) => m.id === id) || null },

  setGoal(h) { this.s.goals = { yearly: Math.max(0, Number(h) || 0), at: now() }; this.commit() },
  setCategories(list) {
    const cats = [...new Set(list.map((c) => c.trim()).filter(Boolean))]
    this.s.settings = { categories: cats.length ? cats : emptyData().settings.categories, at: now() }; this.commit()
  },
  setTheme(t) { this.s.theme = t; lsSave(this.s); emit() },
  setDark(d) { if (this.dark !== d) { this.dark = d; emit() } },

  /** Import / sample / clear: everything not in `data` is buried so Drive does not bring it back. */
  replaceAll(data) {
    const keep = new Set([...data.organizations, ...data.workItems, ...data.entries, ...data.memos].map((r) => r.id))
    const deleted = { ...this.s.deleted }
    for (const r of [...this.s.organizations, ...this.s.workItems, ...this.s.entries, ...this.s.memos]) if (!keep.has(r.id)) deleted[r.id] = now()
    const t = now()
    for (const r of [...data.organizations, ...data.workItems, ...data.entries, ...data.memos]) r.at = t
    this.s = { ...data, deleted, theme: this.s.theme, goals: { ...data.goals, at: t }, settings: { ...data.settings, at: t } }
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
    this.setStatus("syncing")
    return this.pull().then(() => { this.lastSync = new Date(); this.setStatus("live") }).catch((e) => {
      this.lastError = e.message
      this.setStatus(e instanceof Drive.AuthError ? "expired" : "error")
    })
  },
  signOut() {
    Drive.signOut()
    this.email = this.name = this.picture = null
    this.setStatus("local")
  },
  payload() {
    const { theme, ...rest } = this.s
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
    const entries = mergeList(this.s.entries, remote.entries).map((e) => ({ ...e, orgId: orgIds.has(e.orgId) ? e.orgId : "", workItemId: itemIds.has(e.workItemId) ? e.workItemId : "" }))
    const memos = mergeList(this.s.memos, remote.memos).filter((m) => itemIds.has(m.workItemId))
    const goals = ts(remote.goals.at) > ts(this.s.goals.at) ? remote.goals : this.s.goals
    const settings = ts(remote.settings.at) > ts(this.s.settings.at) ? remote.settings : this.s.settings
    this.s = { ...this.s, organizations: orgs, workItems: items, entries, memos, deleted: dead, goals, settings, updatedAt: now() }
    this.pruneTombstones()
    lsSave(this.s); emit()
  },
}

/** Re-render on any store change. Returns the store itself. */
export function useStore() {
  useSyncExternalStore((fn) => Store.subscribe(fn), () => Store.snapshot(), () => Store.snapshot())
  return Store
}
