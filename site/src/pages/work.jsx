import * as React from "react"
import { ArrowLeft, Pencil, Plus } from "lucide-react"

import { entriesForWorkItem, memosFor, orgById, orgColor, orgName, orgsSorted, workItemById, workItemStats, workItemsSorted } from "@/lib/engine"
import { fmtDate, fmtHours, fmtShort, hoursWord, plural, todayISO } from "@/lib/format"
import { WORK_STATUSES } from "@/lib/model"
import { go, href } from "@/lib/router"
import { Store, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { catalogItem } from "@/lib/content"
import { useDialogs } from "@/components/dialogs"
import { useToast } from "@/components/toast"
import { Empty, OrgChip, PageHeader, Pick, Stat, StatusBadge } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

function ItemCard({ w }) {
  const st = workItemStats(w.id)
  return (
    <a href={href(`/work/${w.id}`)} className="group block focus-visible:outline-none" data-testid="wi-card">
      <Card className="h-full gap-3 border-t-4 py-4 transition group-hover:border-primary group-focus-visible:ring-2" style={{ borderTopColor: orgColor(w.orgId) }}>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="leading-snug">{w.title}</CardTitle>
            <StatusBadge status={w.status} />
          </div>
          <OrgChip orgId={w.orgId} className="self-start" />
          {w.description ? <CardDescription className="line-clamp-2">{w.description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
            <span><b className="text-foreground font-semibold">{fmtHours(st.hours)}</b> h</span>
            <span><b className="text-foreground font-semibold">{st.count}</b> {st.count === 1 ? "entry" : "entries"}</span>
            <span><b className="text-foreground font-semibold">{st.memos}</b> {st.memos === 1 ? "memo" : "memos"}</span>
            {st.last ? <span>last {fmtShort(st.last)}</span> : null}
          </div>
          {w.targetHours ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
              <Progress value={st.pct} className={cn("h-1.5 flex-1", st.pct >= 100 && "[&>[data-slot=progress-indicator]]:bg-success")} />
              <span>{Math.round(st.pct)}% of {fmtHours(w.targetHours)} h</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </a>
  )
}

export function WorkList() {
  useStore()
  const { openWorkItem } = useDialogs()
  const [q, setQ] = React.useState("")
  const [org, setOrg] = React.useState("")
  const [status, setStatus] = React.useState("active")
  const items = workItemsSorted().filter((w) =>
    (!org || w.orgId === org) && (!status || w.status === status) &&
    (!q || `${w.title} ${w.description} ${orgName(w.orgId)}`.toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Work items" description="Projects and commitments you're volunteering on. Track hours and keep memos for each.">
        <Button onClick={() => openWorkItem({ orgId: org })} data-testid="add-workitem"><Plus /> New work item</Button>
      </PageHeader>
      <Card className="py-4">
        <CardContent className="grid gap-3 @lg/main:grid-cols-3">
          <Input type="search" placeholder="Search title, description…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" data-testid="wi-search" />
          <Pick value={org} onChange={setOrg} options={orgsSorted().map((o) => ({ value: o.id, label: o.name }))} noneLabel="All organizations" testid="wi-filter-org" />
          <Pick value={status} onChange={setStatus} options={WORK_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} noneLabel="All statuses" testid="wi-filter-status" />
        </CardContent>
      </Card>
      {items.length ? (
        <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3" data-testid="wi-grid">{items.map((w) => <ItemCard key={w.id} w={w} />)}</div>
      ) : (
        <Empty action={<Button size="sm" onClick={() => openWorkItem({ orgId: org })}><Plus /> New work item</Button>}>
          {Store.s.workItems.length ? "No work items match these filters." : "No work items yet. Create one to start tracking a project."}
        </Empty>
      )}
    </div>
  )
}

export function WorkDetail({ id }) {
  useStore()
  const toast = useToast()
  const { openEntry, openWorkItem, openMemo } = useDialogs()
  const [text, setText] = React.useState("")
  const [date, setDate] = React.useState(todayISO())
  const w = workItemById(id)
  if (!w) return <Empty action={<Button variant="outline" onClick={() => go("/work")}><ArrowLeft /> All work items</Button>}>This work item no longer exists.</Empty>
  const st = workItemStats(id)
  const entries = entriesForWorkItem(id)
  const memos = memosFor(id)
  const org = orgById(w.orgId)

  function addMemo(ev) {
    ev.preventDefault()
    if (!text.trim()) return
    Store.addMemo({ workItemId: id, text, date: date || todayISO() })
    setText(""); toast("Memo added")
  }

  return (
    <div className="flex flex-col gap-4" data-testid="wi-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <OrgChip orgId={w.orgId} />
            <StatusBadge status={w.status} />
            {w.startDate ? <span className="text-muted-foreground text-xs">since {fmtDate(w.startDate)}</span> : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{w.title}</h1>
          {w.description ? <p className="text-muted-foreground mt-1 max-w-prose text-sm">{w.description}</p> : null}
          {w.catalogId && catalogItem(w.catalogId) ? <p className="text-muted-foreground mt-1 text-xs" data-testid="wi-catalog">From the catalog · <a href={catalogItem(w.catalogId).url} target="_blank" rel="noopener" className="text-primary hover:underline">source page</a></p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pick value={w.status} onChange={(v) => { Store.setWorkItemStatus(id, v); toast(`Marked ${v}`) }} options={WORK_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} className="w-auto" size="sm" testid="wi-status-pick" />
          <Button variant="outline" size="sm" onClick={() => openWorkItem({ id })} data-testid="wi-edit"><Pencil /> Edit</Button>
          <Button size="sm" onClick={() => openEntry({ workItemId: id })} data-testid="wi-log"><Plus /> Log hours</Button>
        </div>
      </div>

      <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <Stat label="Hours tracked" value={fmtHours(st.hours)} sub={w.targetHours ? `${Math.round(st.pct)}% of ${fmtHours(w.targetHours)} h target` : "no target set"} testid="wi-hours" />
        <Stat label="Entries" value={String(st.count)} sub={st.last ? `last on ${fmtDate(st.last)}` : "nothing logged yet"} />
        <Stat label="Memos" value={String(memos.length)} sub={memos.length ? `latest ${fmtDate(memos[0].date)}` : "none yet"} />
        <Stat label="Contact" value={<span className="text-lg">{org && org.contact ? org.contact : "—"}</span>} sub={org && org.contactInfo ? org.contactInfo : ""} />
      </div>

      {w.targetHours ? (
        <Card className="py-4"><CardContent className="flex items-center gap-4">
          <Progress value={st.pct} className={cn("h-2.5 flex-1", st.pct >= 100 && "[&>[data-slot=progress-indicator]]:bg-success")} aria-label="Target progress" />
          <span className="text-muted-foreground shrink-0 text-sm tabular-nums">{fmtHours(st.hours)} / {fmtHours(w.targetHours)} h{st.hours >= w.targetHours ? " · target reached" : ` · ${fmtHours(w.targetHours - st.hours)} to go`}</span>
        </CardContent></Card>
      ) : null}

      <div className="grid gap-4 @3xl/main:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Work tracker</CardTitle>
            <CardDescription className="tabular-nums">{hoursWord(st.hours)} in {plural(st.count, "entry", "entries")}</CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length ? (
              <Table data-testid="wi-tracker">
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Activity</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => openEntry({ id: e.id })}>
                      <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(e.date)}</TableCell>
                      <TableCell>{e.activity}{e.notes || e.supervisor ? <div className="text-muted-foreground text-xs">{[e.supervisor && `with ${e.supervisor}`, e.notes].filter(Boolean).join(" · ")}</div> : null}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtHours(e.hours)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter><TableRow><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right tabular-nums">{fmtHours(st.hours)}</TableCell></TableRow></TableFooter>
              </Table>
            ) : <Empty action={<Button size="sm" onClick={() => openEntry({ workItemId: id })}><Plus /> Log hours</Button>}>No hours tracked against this item yet.</Empty>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Memos</CardTitle>
            <CardDescription>Notes, contacts, reminders</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={addMemo} className="flex flex-col gap-2" data-testid="memo-compose">
              <Textarea rows={3} placeholder="Write a memo… (Ctrl+Enter to save)" value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form.requestSubmit() } }} data-testid="memo-input" />
              <div className="flex items-center justify-end gap-2">
                <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="w-auto" aria-label="Memo date" />
                <Button type="submit" size="sm" disabled={!text.trim()} data-testid="memo-add">Add memo</Button>
              </div>
            </form>
            {memos.length ? (
              <ul className="flex flex-col gap-2">
                {memos.map((m) => (
                  <li key={m.id} className="bg-muted/60 rounded-md border-l-2 border-primary px-3 py-2" data-testid="memo">
                    <div className="text-muted-foreground flex items-center justify-between text-xs">
                      <span className="tabular-nums">{fmtDate(m.date)}</span>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => openMemo(m.id)} data-testid="memo-edit">Edit</Button>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap" data-testid="memo-text">{m.text}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted-foreground py-2 text-center text-sm">No memos yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
