/* The app's forms live in dialogs: log hours, organization, work item, memo, and a confirm.
 * Pages open them through useDialogs(); a form keeps its own draft, so opening the
 * organization dialog from inside the entry form leaves that draft untouched. */
import * as React from "react"

import { Store, useStore } from "@/lib/store"
import { ORG_COLORS, WORK_STATUSES } from "@/lib/model"
import { planHours } from "@/lib/engine"
import { hoursWord, isISODate, todayISO } from "@/lib/format"
import { orgName, orgsSorted, sumHours, workItemById, workItemsForOrg, workItemStats, workItemTitle } from "@/lib/engine"
import { go } from "@/lib/router"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"
import { Field, Pick } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const Ctx = React.createContext(null)
export function useDialogs() { return React.useContext(Ctx) }

export function DialogsProvider({ children }) {
  const [entry, setEntry] = React.useState(null)
  const [org, setOrg] = React.useState(null)
  const [item, setItem] = React.useState(null)
  const [memo, setMemo] = React.useState(null)
  const [plan, setPlan] = React.useState(null)
  const [conf, setConf] = React.useState(null)
  const api = React.useMemo(() => ({
    openPlan: (o = {}) => setPlan({ ...o, key: Date.now() }),
    openEntry: (o = {}) => setEntry({ ...o, key: Date.now() }),
    openOrg: (o = {}) => setOrg({ ...o, key: Date.now() }),
    openWorkItem: (o = {}) => setItem({ ...o, key: Date.now() }),
    openMemo: (id) => setMemo({ id, key: Date.now() }),
    confirm: (o) => new Promise((resolve) => setConf({ ...o, resolve, key: Date.now() })),
  }), [])
  return (
    <Ctx.Provider value={api}>
      {children}
      {entry && <EntryDialog key={entry.key} init={entry} close={() => setEntry(null)} />}
      {item && <WorkItemDialog key={item.key} init={item} close={() => setItem(null)} />}
      {org && <OrgDialog key={org.key} init={org} close={() => setOrg(null)} />}
      {memo && <MemoDialog key={memo.key} init={memo} close={() => setMemo(null)} />}
      {plan && <PlanDialog key={plan.key} init={plan} close={() => setPlan(null)} />}
      {conf && <ConfirmDialog key={conf.key} init={conf} close={() => setConf(null)} />}
    </Ctx.Provider>
  )
}

function Shell({ title, description, onClose, children, footer, testid, className }) {
  const [open, setOpen] = React.useState(true)
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setTimeout(onClose, 150) } }}>
      <DialogContent className={cn("sm:max-w-xl", className)} data-testid={testid}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer}
      </DialogContent>
    </Dialog>
  )
}
function ErrorLine({ msg }) { return msg ? <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm" data-testid="form-error">{msg}</p> : null }

/* ---------- log hours ---------- */
function EntryDialog({ init, close }) {
  useStore()
  const toast = useToast()
  const { openOrg, confirm } = useDialogs()
  const e = init.id ? Store.entry(init.id) : null
  const plan = init.planId ? Store.plan(init.planId) : null
  const firstOrg = init.workItemId ? (workItemById(init.workItemId) || {}).orgId : init.orgId
  const [f, setF] = React.useState({
    date: e ? e.date : plan ? (plan.date > todayISO() ? todayISO() : plan.date) : todayISO(),
    hours: e ? String(e.hours) : plan && planHours(plan) ? String(planHours(plan)) : "",
    orgId: e ? e.orgId : plan ? plan.orgId : firstOrg || "",
    workItemId: e ? e.workItemId : plan ? plan.workItemId : init.workItemId || "",
    activity: e ? e.activity : plan ? plan.title : "", category: e ? e.category : "",
    supervisor: e ? e.supervisor : "", notes: e ? e.notes : plan ? plan.notes : "",
  })
  const [err, setErr] = React.useState("")
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  const items = f.orgId ? workItemsForOrg(f.orgId).filter((w) => w.status !== "completed" || w.id === f.workItemId) : []
  const cats = Store.s.settings.categories

  function submit(ev) {
    ev.preventDefault()
    const hours = parseFloat(f.hours)
    if (!isISODate(f.date)) return setErr("Please enter a valid date.")
    if (f.date > todayISO()) return setErr("The date can't be in the future.")
    if (!(hours > 0)) return setErr("Hours must be greater than zero.")
    if (hours > 24) return setErr("A single entry can't exceed 24 hours. Split it across days.")
    if (!f.orgId) return setErr("Choose an organization, or create a new one.")
    if (!f.activity.trim()) return setErr("Describe what you did.")
    const fields = { ...f, hours, activity: f.activity.trim(), supervisor: f.supervisor.trim(), notes: f.notes.trim() }
    if (e) { Store.updateEntry(e.id, fields); toast("Entry updated") }
    else {
      const n = Store.addEntry(fields)
      if (plan) Store.setPlanStatus(plan.id, "done", n.id)
      toast(plan ? `Logged ${hoursWord(hours)} · plan marked done` : `Logged ${hoursWord(hours)}`)
    }
    close()
  }
  async function del() {
    if (await confirm({ title: "Delete this entry?", message: "This removes the logged hours permanently." })) { Store.deleteEntry(e.id); toast("Entry deleted"); close() }
  }
  return (
    <Shell title={e ? "Edit entry" : "Log hours"} onClose={close} testid="entry-dialog">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Date" required><Input type="date" value={f.date} max={todayISO()} onChange={(ev) => set("date")(ev.target.value)} data-testid="entry-date" /></Field>
        <Field label="Hours" required><Input type="number" min="0.25" step="0.25" placeholder="2.5" value={f.hours} onChange={(ev) => set("hours")(ev.target.value)} data-testid="entry-hours" autoFocus={Boolean(f.orgId)} /></Field>
        <Field label="Organization" required className="sm:col-span-2" hint={orgsSorted().length ? "" : "No organizations yet. Use New to add the one you volunteered with."}>
          <div className="flex gap-2">
            <Pick value={f.orgId} onChange={(v) => setF((s) => ({ ...s, orgId: v, workItemId: "" }))} options={orgsSorted().map((o) => ({ value: o.id, label: o.name }))} placeholder="Select an organization" emptyLabel="No organizations yet" testid="entry-org" />
            <Button type="button" variant="outline" onClick={() => openOrg({ onCreated: (id) => setF((s) => ({ ...s, orgId: id, workItemId: "" })) })} data-testid="entry-new-org">New</Button>
          </div>
        </Field>
        <Field label="Work item" className="sm:col-span-2" hint={!f.orgId ? "Pick the organization first." : !items.length ? "This organization has no active work items yet; that's fine, it's optional." : ""}>
          <Pick value={f.workItemId} onChange={set("workItemId")} options={items.map((w) => ({ value: w.id, label: w.title }))} noneLabel="None" disabled={!items.length} testid="entry-workitem" />
        </Field>
        <Field label="Activity" required className="sm:col-span-2"><Input placeholder="e.g. Sorted donations at food bank" maxLength={120} value={f.activity} onChange={(ev) => set("activity")(ev.target.value)} data-testid="entry-activity" /></Field>
        <Field label="Category"><Pick value={f.category} onChange={set("category")} options={cats.map((c) => ({ value: c, label: c }))} noneLabel="None" testid="entry-category" /></Field>
        <Field label="Supervisor / contact"><Input placeholder="Optional" maxLength={80} value={f.supervisor} onChange={(ev) => set("supervisor")(ev.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} placeholder="What did you do? Who did it help?" value={f.notes} onChange={(ev) => set("notes")(ev.target.value)} /></Field>
        <div className="sm:col-span-2"><ErrorLine msg={err} /></div>
        <DialogFooter className="sm:col-span-2 sm:justify-between">
          <div>{e ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={del}>Delete</Button> : null}</div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" data-testid="entry-save">Save</Button>
          </div>
        </DialogFooter>
      </form>
    </Shell>
  )
}

/* ---------- organization ---------- */
function OrgDialog({ init, close }) {
  useStore()
  const toast = useToast()
  const { confirm } = useDialogs()
  const o = init.id ? Store.org(init.id) : null
  const [f, setF] = React.useState({
    name: o ? o.name : "", contact: o ? o.contact : "", contactInfo: o ? o.contactInfo : "", website: o ? o.website : "",
    color: o ? o.color : ORG_COLORS[Store.s.organizations.length % ORG_COLORS.length], notes: o ? o.notes : "",
  })
  const [err, setErr] = React.useState("")
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }))
  function submit(ev) {
    ev.preventDefault()
    const fields = { ...f, name: f.name.trim(), contact: f.contact.trim(), contactInfo: f.contactInfo.trim(), website: f.website.trim(), notes: f.notes.trim() }
    if (!fields.name) return setErr("Give the organization a name.")
    if (fields.website && !/^https?:\/\//i.test(fields.website)) fields.website = "https://" + fields.website
    if (Store.s.organizations.some((x) => x.id !== (o && o.id) && x.name.toLowerCase() === fields.name.toLowerCase())) return setErr("An organization with that name already exists.")
    if (o) { Store.updateOrg(o.id, fields); toast("Organization updated") }
    else { const n = Store.addOrg(fields); toast("Organization added"); if (init.onCreated) init.onCreated(n.id) }
    close()
  }
  async function del() {
    const entries = Store.s.entries.filter((e) => e.orgId === o.id), items = Store.s.workItems.filter((w) => w.orgId === o.id)
    const ok = await confirm({
      title: `Delete ${o.name}?`,
      message: entries.length || items.length
        ? `This also deletes ${items.length} work ${items.length === 1 ? "item" : "items"} and ${entries.length} logged ${entries.length === 1 ? "entry" : "entries"} (${hoursWord(sumHours(entries))}).`
        : "This organization has nothing logged against it.",
    })
    if (ok) { Store.deleteOrg(o.id); toast("Organization deleted"); close() }
  }
  return (
    <Shell title={o ? "Edit organization" : "Add organization"} onClose={close} testid="org-dialog">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Name" required className="sm:col-span-2"><Input maxLength={80} placeholder="e.g. Riverside Food Bank" value={f.name} onChange={set("name")} data-testid="org-name" autoFocus /></Field>
        <Field label="Contact person"><Input maxLength={80} placeholder="Optional" value={f.contact} onChange={set("contact")} data-testid="org-contact" /></Field>
        <Field label="Email or phone"><Input maxLength={120} placeholder="Optional" value={f.contactInfo} onChange={set("contactInfo")} /></Field>
        <Field label="Website"><Input type="url" placeholder="https://" value={f.website} onChange={set("website")} /></Field>
        <Field label="Color">
          <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2 py-1">
            {ORG_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === f.color} aria-label={c} onClick={() => setF((s) => ({ ...s, color: c }))}
                className={cn("size-7 rounded-full border-2 transition", c === f.color ? "border-foreground ring-2 ring-background ring-inset" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
        <div className="sm:col-span-2"><ErrorLine msg={err} /></div>
        <DialogFooter className="sm:col-span-2 sm:justify-between">
          <div>{o ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={del} data-testid="org-delete">Delete</Button> : null}</div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" data-testid="org-save">Save</Button>
          </div>
        </DialogFooter>
      </form>
    </Shell>
  )
}

/* ---------- work item ---------- */
function WorkItemDialog({ init, close }) {
  useStore()
  const toast = useToast()
  const { openOrg, confirm } = useDialogs()
  const w = init.id ? Store.workItem(init.id) : null
  const [f, setF] = React.useState({
    title: w ? w.title : init.title || "", orgId: w ? w.orgId : init.orgId || "", status: w ? w.status : "active", startDate: w ? w.startDate : todayISO(),
    targetHours: w && w.targetHours ? String(w.targetHours) : "", description: w ? w.description : init.description || "",
  })
  const [err, setErr] = React.useState("")
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  function submit(ev) {
    ev.preventDefault()
    const fields = { ...f, title: f.title.trim(), description: f.description.trim() }
    if (!fields.title) return setErr("Give the work item a title.")
    if (!fields.orgId) return setErr("Choose an organization, or create a new one.")
    if (fields.startDate && !isISODate(fields.startDate)) return setErr("The start date isn't valid.")
    if (fields.targetHours && !(Number(fields.targetHours) >= 0)) return setErr("Target hours must be a positive number.")
    if (w) { Store.updateWorkItem(w.id, fields); toast("Work item updated"); close() }
    else { const n = Store.addWorkItem(fields); toast("Work item created"); close(); go(`/work/${n.id}`) }
  }
  async function del() {
    const st = workItemStats(w.id)
    const ok = await confirm({
      title: `Delete "${w.title}"?`,
      message: `${st.memos ? `Its ${st.memos} ${st.memos === 1 ? "memo is" : "memos are"} deleted. ` : ""}${st.count ? `The ${st.count} logged ${st.count === 1 ? "entry" : "entries"} (${hoursWord(st.hours)}) stay in your hours log, no longer linked to a work item.` : "No hours are logged against it."}`,
    })
    if (ok) { Store.deleteWorkItem(w.id); toast("Work item deleted"); close(); if (location.hash.includes(w.id)) go("/work") }
  }
  return (
    <Shell title={w ? "Edit work item" : "New work item"} onClose={close} testid="wi-dialog">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Title" required className="sm:col-span-2"><Input maxLength={100} placeholder="e.g. Saturday warehouse shifts" value={f.title} onChange={(ev) => set("title")(ev.target.value)} data-testid="wi-title" autoFocus /></Field>
        <Field label="Organization" required className="sm:col-span-2">
          <div className="flex gap-2">
            <Pick value={f.orgId} onChange={set("orgId")} options={orgsSorted().map((o) => ({ value: o.id, label: o.name }))} placeholder="Select an organization" emptyLabel="No organizations yet" testid="wi-org" />
            <Button type="button" variant="outline" onClick={() => openOrg({ onCreated: (id) => set("orgId")(id) })}>New</Button>
          </div>
        </Field>
        <Field label="Status"><Pick value={f.status} onChange={set("status")} options={WORK_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} testid="wi-status" /></Field>
        <Field label="Start date"><Input type="date" value={f.startDate} onChange={(ev) => set("startDate")(ev.target.value)} /></Field>
        <Field label="Target hours" className="sm:col-span-2"><Input type="number" min="0" step="0.5" placeholder="Optional" value={f.targetHours} onChange={(ev) => set("targetHours")(ev.target.value)} data-testid="wi-target" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea rows={3} placeholder="What is this work? What's the goal?" value={f.description} onChange={(ev) => set("description")(ev.target.value)} data-testid="wi-description" /></Field>
        <div className="sm:col-span-2"><ErrorLine msg={err} /></div>
        <DialogFooter className="sm:col-span-2 sm:justify-between">
          <div>{w ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={del} data-testid="wi-delete">Delete</Button> : null}</div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" data-testid="wi-save">Save</Button>
          </div>
        </DialogFooter>
      </form>
    </Shell>
  )
}

/* ---------- memo (edit) ---------- */
function MemoDialog({ init, close }) {
  const toast = useToast()
  const { confirm } = useDialogs()
  const m = Store.memo(init.id)
  const [f, setF] = React.useState({ date: m ? m.date : todayISO(), text: m ? m.text : "" })
  const [err, setErr] = React.useState("")
  if (!m) return null
  function submit(ev) {
    ev.preventDefault()
    if (!f.text.trim()) return setErr("A memo can't be empty.")
    Store.updateMemo(m.id, f); toast("Memo updated"); close()
  }
  async function del() { if (await confirm({ title: "Delete this memo?", message: "This can't be undone." })) { Store.deleteMemo(m.id); toast("Memo deleted"); close() } }
  return (
    <Shell title="Edit memo" onClose={close} testid="memo-dialog" className="sm:max-w-md">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Date"><Input type="date" value={f.date} max={todayISO()} onChange={(ev) => setF((s) => ({ ...s, date: ev.target.value }))} /></Field>
        <Field label="Memo" required><Textarea rows={5} value={f.text} onChange={(ev) => setF((s) => ({ ...s, text: ev.target.value }))} data-testid="memo-edit-text" autoFocus /></Field>
        <ErrorLine msg={err} />
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={del} data-testid="memo-delete">Delete</Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" data-testid="memo-save">Save</Button>
          </div>
        </DialogFooter>
      </form>
    </Shell>
  )
}

/* ---------- plan (the calendar) ---------- */
function PlanDialog({ init, close }) {
  useStore()
  const toast = useToast()
  const { openOrg, confirm } = useDialogs()
  const p = init.id ? Store.plan(init.id) : null
  const [f, setF] = React.useState({
    date: p ? p.date : init.date || todayISO(), start: p ? p.start : init.start || "", end: p ? p.end : init.end || "", hours: p && p.hours ? String(p.hours) : init.hours ? String(init.hours) : "",
    title: p ? p.title : init.title || "", orgId: p ? p.orgId : init.orgId || "", workItemId: p ? p.workItemId : init.workItemId || "",
    notes: p ? p.notes : init.notes || "", catalogId: p ? p.catalogId : init.catalogId || "",
  })
  const [err, setErr] = React.useState("")
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  const items = f.orgId ? workItemsForOrg(f.orgId).filter((w) => w.status !== "completed" || w.id === f.workItemId) : []
  function submit(ev) {
    ev.preventDefault()
    if (!isISODate(f.date)) return setErr("Please enter a valid date.")
    if (!f.title.trim()) return setErr("Give the plan a title, like the activity you'll log afterwards.")
    if (f.start && f.end && f.end <= f.start) return setErr("The end time must be after the start time.")
    if (f.hours && !(Number(f.hours) > 0)) return setErr("Hours must be greater than zero, or leave it empty.")
    const fields = { ...f, title: f.title.trim(), notes: f.notes.trim() }
    if (p) { Store.updatePlan(p.id, fields); toast("Plan updated") } else { Store.addPlan(fields); toast("Added to the calendar") }
    close()
  }
  async function del() { if (await confirm({ title: "Remove this plan?", message: "Logged hours are not affected." })) { Store.deletePlan(p.id); toast("Plan removed"); close() } }
  return (
    <Shell title={p ? "Edit plan" : "Plan volunteer work"} onClose={close} testid="plan-dialog">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Title" required className="sm:col-span-2"><Input maxLength={120} placeholder="e.g. Saturday warehouse shift" value={f.title} onChange={(ev) => set("title")(ev.target.value)} data-testid="plan-title" autoFocus /></Field>
        <Field label="Date" required><Input type="date" value={f.date} onChange={(ev) => set("date")(ev.target.value)} data-testid="plan-date" /></Field>
        <Field label="Hours" hint="Or set start and end times."><Input type="number" min="0.25" step="0.25" placeholder="e.g. 3" value={f.hours} onChange={(ev) => set("hours")(ev.target.value)} data-testid="plan-hours" /></Field>
        <Field label="Start"><Input type="time" value={f.start} onChange={(ev) => set("start")(ev.target.value)} /></Field>
        <Field label="End"><Input type="time" value={f.end} onChange={(ev) => set("end")(ev.target.value)} /></Field>
        <Field label="Organization" className="sm:col-span-2">
          <div className="flex gap-2">
            <Pick value={f.orgId} onChange={(v) => setF((s) => ({ ...s, orgId: v, workItemId: "" }))} options={orgsSorted().map((o) => ({ value: o.id, label: o.name }))} noneLabel="Not decided yet" testid="plan-org" />
            <Button type="button" variant="outline" onClick={() => openOrg({ onCreated: (id) => setF((s) => ({ ...s, orgId: id, workItemId: "" })) })}>New</Button>
          </div>
        </Field>
        <Field label="Work item" className="sm:col-span-2"><Pick value={f.workItemId} onChange={set("workItemId")} options={items.map((w) => ({ value: w.id, label: w.title }))} noneLabel="None" disabled={!items.length} testid="plan-workitem" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} placeholder="Where to meet, what to bring…" value={f.notes} onChange={(ev) => set("notes")(ev.target.value)} /></Field>
        <div className="sm:col-span-2"><ErrorLine msg={err} /></div>
        <DialogFooter className="sm:col-span-2 sm:justify-between">
          <div>{p ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={del} data-testid="plan-delete">Remove</Button> : null}</div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="submit" data-testid="plan-save">Save</Button>
          </div>
        </DialogFooter>
      </form>
    </Shell>
  )
}

/* ---------- confirm ---------- */
function ConfirmDialog({ init, close }) {
  const done = (ok) => { init.resolve(ok); close() }
  return (
    <Shell title={init.title || "Are you sure?"} description={init.message} onClose={() => init.resolve(false)} testid="confirm-dialog" className="sm:max-w-md">
      <DialogFooter>
        <Button variant="ghost" onClick={() => done(false)}>Cancel</Button>
        <Button variant={init.destructive === false ? "default" : "destructive"} onClick={() => done(true)} data-testid="confirm-ok">{init.okLabel || "Delete"}</Button>
      </DialogFooter>
    </Shell>
  )
}
