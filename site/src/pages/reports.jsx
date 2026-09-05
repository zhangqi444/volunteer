import * as React from "react"
import { Download, Printer } from "lucide-react"

import { entriesSorted, filterEntries, hoursByOrg, hoursByWorkItem, orgName, orgsSorted, sumHours, workItemTitle } from "@/lib/engine"
import { fmtDate, fmtHours, plural, toISODate, todayISO } from "@/lib/format"
import { downloadFile } from "@/lib/model"
import { useStore } from "@/lib/store"
import { Empty, Field, PageHeader, Pick } from "@/components/bits"
import { entriesCSV } from "@/pages/log"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PRESETS = [
  { value: "ytd", label: "Year to date" }, { value: "last-year", label: "Last year" }, { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" }, { value: "custom", label: "Custom range" },
]
function rangeFor(preset, custom) {
  const now = new Date(), y = now.getFullYear()
  if (preset === "ytd") return { from: `${y}-01-01`, to: todayISO() }
  if (preset === "last-year") return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
  if (preset === "12m") return { from: toISODate(new Date(y, now.getMonth() - 11, 1)), to: todayISO() }
  if (preset === "custom") return custom
  return { from: "", to: "" }
}

export function Reports() {
  const store = useStore()
  const [preset, setPreset] = React.useState("ytd")
  const [custom, setCustom] = React.useState({ from: "", to: "" })
  const [orgId, setOrgId] = React.useState("")
  const [name, setName] = React.useState("")
  const { from, to } = rangeFor(preset, custom)
  const entries = filterEntries(entriesSorted("date", "asc"), { from, to, orgId })
  const total = sumHours(entries)
  const byOrg = hoursByOrg(entries)
  const byItem = hoursByWorkItem(entries)
  const period = from || to ? `${from ? fmtDate(from) : "Beginning"} – ${to ? fmtDate(to) : "today"}` : "All time"
  const who = name.trim() || store.name || ""

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Reports" description="A summary for schools, employers, or verification letters.">
        <Button variant="outline" onClick={() => downloadFile(`volunteer-hours-${from || "all"}-to-${to || "today"}.csv`, entriesCSV(entries), "text/csv")} disabled={!entries.length}><Download /> Export CSV</Button>
        <Button onClick={() => window.print()} data-testid="print"><Printer /> Print / Save PDF</Button>
      </PageHeader>

      <Card className="py-4 print:hidden">
        <CardContent className="grid gap-3 @lg/main:grid-cols-2 @5xl/main:grid-cols-5">
          <Field label="Period"><Pick value={preset} onChange={setPreset} options={PRESETS} testid="report-preset" /></Field>
          <Field label="From"><Input type="date" value={from} disabled={preset !== "custom"} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
          <Field label="To"><Input type="date" value={to} disabled={preset !== "custom"} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
          <Field label="Organization"><Pick value={orgId} onChange={setOrgId} options={orgsSorted().map((o) => ({ value: o.id, label: o.name }))} noneLabel="All organizations" testid="report-org" /></Field>
          <Field label="Volunteer name"><Input placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </CardContent>
      </Card>

      <Card className="print:border-0 print:shadow-none" data-testid="report">
        <CardContent className="flex flex-col gap-5 pt-2">
          <div className="border-foreground flex flex-wrap items-start justify-between gap-3 border-b-2 pb-4">
            <div>
              <h2 className="text-xl font-semibold">Volunteer Hours Report</h2>
              {who ? <div className="text-muted-foreground">{who}</div> : null}
            </div>
            <div className="text-muted-foreground text-right text-xs">
              <div><b className="text-foreground">Period:</b> {period}</div>
              {orgId ? <div><b className="text-foreground">Organization:</b> {orgName(orgId)}</div> : null}
              <div><b className="text-foreground">Generated:</b> {new Date().toLocaleDateString(undefined, { dateStyle: "long" })}</div>
            </div>
          </div>
          <div className="grid gap-3 @lg/main:grid-cols-3">
            {[[fmtHours(total), "total hours"], [entries.length, plural(entries.length, "entry", "entries").replace(/^\d+ /, "")], [byOrg.length, byOrg.length === 1 ? "organization" : "organizations"]].map(([v, l]) => (
              <div key={l} className="bg-muted rounded-md px-4 py-3"><div className="text-2xl font-semibold tabular-nums">{v}</div><div className="text-muted-foreground text-xs">{l}</div></div>
            ))}
          </div>
          {entries.length ? (
            <>
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Hours by organization</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Organization</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
                  <TableBody>{byOrg.map((r) => <TableRow key={r.orgId}><TableCell>{r.name}</TableCell><TableCell className="text-muted-foreground">{r.org ? [r.org.contact, r.org.contactInfo].filter(Boolean).join(" · ") : ""}</TableCell><TableCell className="text-right tabular-nums">{r.count}</TableCell><TableCell className="text-right tabular-nums">{fmtHours(r.hours)}</TableCell></TableRow>)}</TableBody>
                  <TableFooter><TableRow><TableCell colSpan={3}>Total</TableCell><TableCell className="text-right tabular-nums">{fmtHours(total)}</TableCell></TableRow></TableFooter>
                </Table>
              </section>
              {byItem.length ? (
                <section>
                  <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Hours by work item</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead>Work item</TableHead><TableHead>Organization</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Entries</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
                    <TableBody>{byItem.map((r) => <TableRow key={r.workItemId}><TableCell>{r.item.title}</TableCell><TableCell>{orgName(r.item.orgId)}</TableCell><TableCell className="capitalize">{r.item.status}</TableCell><TableCell className="text-right tabular-nums">{r.count}</TableCell><TableCell className="text-right tabular-nums">{fmtHours(r.hours)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </section>
              ) : null}
              <section>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Detailed log</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Organization</TableHead><TableHead>Activity</TableHead><TableHead>Supervisor</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
                  <TableBody>{entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(e.date)}</TableCell>
                      <TableCell>{orgName(e.orgId)}{e.workItemId ? <div className="text-muted-foreground text-xs">{workItemTitle(e.workItemId)}</div> : null}</TableCell>
                      <TableCell>{e.activity}{e.notes ? <div className="text-muted-foreground text-xs">{e.notes}</div> : null}</TableCell>
                      <TableCell>{e.supervisor}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtHours(e.hours)}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </section>
              <div className="mt-6 grid gap-8 @lg/main:grid-cols-2">
                <div className="border-foreground text-muted-foreground border-t pt-1 text-xs">Volunteer signature &amp; date</div>
                <div className="border-foreground text-muted-foreground border-t pt-1 text-xs">Supervisor signature &amp; date</div>
              </div>
            </>
          ) : <Empty>No entries in this period.</Empty>}
          <p className="text-muted-foreground text-xs">Generated by Volunteer Tracker. Hours are self-reported by the volunteer.</p>
        </CardContent>
      </Card>
    </div>
  )
}
