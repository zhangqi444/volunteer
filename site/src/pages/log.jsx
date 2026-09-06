import * as React from "react"
import { ArrowDown, ArrowUp, Camera, Download, Plus } from "lucide-react"

import { entriesSorted, filterEntries, orgsSorted, sumHours, workItemTitle, workItemsForOrg, workItemsSorted } from "@/lib/engine"
import { fmtDate, fmtHours, hoursWord, plural, todayISO } from "@/lib/format"
import { downloadFile, toCSV } from "@/lib/model"
import { href } from "@/lib/router"
import { Store, useStore } from "@/lib/store"
import { useDialogs } from "@/components/dialogs"
import { Empty, OrgChip, PageHeader, Pick } from "@/components/bits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { orgName } from "@/lib/engine"

export function entriesCSV(entries) {
  return toCSV(entries.map((e) => [e.date, orgName(e.orgId), workItemTitle(e.workItemId), e.activity, e.category, e.hours, e.supervisor, e.notes, e.reflection]),
    ["Date", "Organization", "Work item", "Activity", "Category", "Hours", "Supervisor", "Notes", "Reflection"])
}

export function Log() {
  useStore()
  const { openEntry } = useDialogs()
  const [f, setF] = React.useState({ search: "", orgId: "", workItemId: "", category: "", from: "", to: "" })
  const [sort, setSort] = React.useState({ key: "date", dir: "desc" })
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v, ...(k === "orgId" ? { workItemId: "" } : {}) }))
  const entries = filterEntries(entriesSorted(sort.key, sort.dir), f)
  const total = sumHours(entries)
  const items = f.orgId ? workItemsForOrg(f.orgId) : workItemsSorted()
  const any = Object.values(f).some(Boolean)
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }))
  const Sort = ({ k, children, className }) => (
    <TableHead className={className}>
      <button type="button" className="inline-flex items-center gap-1 font-medium hover:underline" onClick={() => toggle(k)} data-sort={k}>
        {children}{sort.key === k ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
      </button>
    </TableHead>
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Hours log" description="Every shift, event, and task you've given your time to.">
        <Button variant="outline" onClick={() => downloadFile(`volunteer-hours-${todayISO()}.csv`, entriesCSV(entries), "text/csv")} disabled={!entries.length} data-testid="log-csv"><Download /> Export CSV</Button>
        <Button onClick={() => openEntry({ orgId: f.orgId, workItemId: f.workItemId })} data-testid="add-entry"><Plus /> Log hours</Button>
      </PageHeader>

      <Card className="py-4">
        <CardContent className="grid gap-3 @lg/main:grid-cols-3 @5xl/main:grid-cols-6">
          <Input type="search" placeholder="Search activity, notes…" value={f.search} onChange={(e) => set("search")(e.target.value)} aria-label="Search" data-testid="filter-search" />
          <Pick value={f.orgId} onChange={set("orgId")} options={orgsSorted().map((o) => ({ value: o.id, label: o.name }))} noneLabel="All organizations" testid="filter-org" />
          <Pick value={f.workItemId} onChange={set("workItemId")} options={items.map((w) => ({ value: w.id, label: w.title }))} noneLabel="All work items" disabled={!items.length} testid="filter-workitem" />
          <Pick value={f.category} onChange={set("category")} options={Store.s.settings.categories.map((c) => ({ value: c, label: c }))} noneLabel="All categories" testid="filter-category" />
          <Input type="date" value={f.from} onChange={(e) => set("from")(e.target.value)} aria-label="From" />
          <Input type="date" value={f.to} onChange={(e) => set("to")(e.target.value)} aria-label="To" />
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardContent className="flex flex-col gap-3">
          <div className="text-muted-foreground flex items-center justify-between text-sm tabular-nums">
            <span data-testid="log-summary">{plural(entries.length, "entry", "entries")} · {hoursWord(total)}</span>
            {any ? <Button variant="ghost" size="sm" onClick={() => setF({ search: "", orgId: "", workItemId: "", category: "", from: "", to: "" })} data-testid="filter-clear">Clear filters</Button> : null}
          </div>
          {entries.length ? (
            <Table data-testid="log-table">
              <TableHeader>
                <TableRow>
                  <Sort k="date">Date</Sort>
                  <Sort k="org">Organization</Sort>
                  <TableHead>Activity</TableHead>
                  <TableHead className="hidden @2xl/main:table-cell">Category</TableHead>
                  <Sort k="hours" className="text-right">Hours</Sort>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id} data-testid="log-row">
                    <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(e.date)}</TableCell>
                    <TableCell><OrgChip orgId={e.orgId} /></TableCell>
                    <TableCell className="min-w-[14rem]">
                      <div>{e.activity}</div>
                      {e.workItemId ? <a href={href(`/work/${e.workItemId}`)} className="text-primary text-xs hover:underline" data-testid="log-wi-tag">{workItemTitle(e.workItemId)}</a> : null}
                      {e.notes || e.supervisor ? <div className="text-muted-foreground text-xs">{[e.supervisor && `with ${e.supervisor}`, e.notes].filter(Boolean).join(" · ")}</div> : null}
                      {e.reflection ? <div className="text-muted-foreground text-xs italic">“{e.reflection}”</div> : null}
                      {e.photos.length ? <span className="text-muted-foreground inline-flex items-center gap-1 text-xs"><Camera className="size-3" /> {e.photos.length}</span> : null}
                    </TableCell>
                    <TableCell className="hidden @2xl/main:table-cell">{e.category ? <Badge variant="outline">{e.category}</Badge> : null}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtHours(e.hours)}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => openEntry({ id: e.id })} data-testid="edit-entry">Edit</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty action={<Button size="sm" onClick={() => openEntry()}><Plus /> Log hours</Button>}>{Store.s.entries.length ? "No entries match these filters." : "Nothing logged yet. Log your first hours to get started."}</Empty>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
