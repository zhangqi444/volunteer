import * as React from "react"
import { Download, Printer } from "lucide-react"

import { entriesSorted, filterEntries, hoursByOrg, hoursByWorkItem, orgById, orgName, orgsSorted, sumHours, workItemTitle } from "@/lib/engine"
import { monthKey } from "@/lib/format"
import { fmtDate, fmtHours, plural, toISODate, todayISO } from "@/lib/format"
import { downloadFile } from "@/lib/model"
import { useStore } from "@/lib/store"
import { currentAge } from "@/lib/content"
import { cn } from "@/lib/utils"
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
  const [mode, setMode] = React.useState("summary")
  const { from, to } = rangeFor(preset, custom)
  const entries = filterEntries(entriesSorted("date", "asc"), { from, to, orgId })
  const total = sumHours(entries)
  const byOrg = hoursByOrg(entries)
  const byItem = hoursByWorkItem(entries)
  const period = from || to ? `${from ? fmtDate(from) : "Beginning"} – ${to ? fmtDate(to) : "today"}` : "All time"
  const who = name.trim() || store.s.settings.profile.name || store.name || ""
  const age = currentAge()

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden"><PageHeader title="Reports" description="A summary for schools, employers, or verification letters, or the monthly hours log an organization asks you to bring.">
        <Button variant="outline" onClick={() => downloadFile(`volunteer-hours-${from || "all"}-to-${to || "today"}.csv`, entriesCSV(entries), "text/csv")} disabled={!entries.length}><Download /> Export CSV</Button>
        <Button onClick={() => window.print()} data-testid="print"><Printer /> Print / Save PDF</Button>
      </PageHeader></div>

      <Card className="py-4 print:hidden">
        <CardContent className="grid gap-3 @lg/main:grid-cols-2 @5xl/main:grid-cols-5">
          <Field label="Period"><Pick value={preset} onChange={setPreset} options={PRESETS} testid="report-preset" /></Field>
          <Field label="From"><Input type="date" value={from} disabled={preset !== "custom"} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
          <Field label="To"><Input type="date" value={to} disabled={preset !== "custom"} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
          <Field label="Organization"><Pick value={orgId} onChange={setOrgId} options={orgsSorted().map((o) => ({ value: o.id, label: o.name }))} noneLabel="All organizations" testid="report-org" /></Field>
          <Field label="Volunteer name"><Input placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Format" className="@lg/main:col-span-2 @5xl/main:col-span-5"><Pick value={mode} onChange={setMode} options={[{ value: "summary", label: "Summary report" }, { value: "letters", label: "Verification letters (one page per organization)" }, { value: "timelog", label: "Monthly hours log (time in / out, signature per row)" }]} testid="report-mode" className="@5xl/main:w-96" /></Field>
        </CardContent>
      </Card>

      {mode === "timelog" ? (
        <>
          <style>{"@media print { @page { size: landscape; margin: 12mm } }"}</style>
          {(() => {
            // one sheet per organization per month, in the form's order: Date · Time In · Description · Time Out · Total Time · Signature
            const sheets = []
            for (const r of byOrg) {
              const months = [...new Set(entries.filter((e) => e.orgId === r.orgId).map((e) => monthKey(e.date)))].sort()
              for (const mk of months) sheets.push({ org: r, mk, rows: entries.filter((e) => e.orgId === r.orgId && monthKey(e.date) === mk) })
            }
            if (!sheets.length) return <Card><CardContent className="pt-2"><Empty>No entries in this period.</Empty></CardContent></Card>
            return sheets.map((sh, i) => {
              const [y, m] = sh.mk.split("-").map(Number)
              const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
              const org = orgById(sh.org.orgId)
              const blanks = Math.max(0, 12 - sh.rows.length)
              return (
                <Card key={sh.org.orgId + sh.mk} className={cn("print:border-0 print:shadow-none", i < sheets.length - 1 && "print:break-after-page")} data-testid="timelog">
                  <CardContent className="flex flex-col gap-4 pt-2 print:gap-2 print:p-0">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{sh.org.name}</div>
                        <h2 className="text-xl font-semibold tracking-wide">Community Service Hours Log</h2>
                      </div>
                      <div className="flex flex-wrap gap-6 text-sm">
                        <div><span className="text-muted-foreground">Name: </span><span className="border-foreground inline-block min-w-48 border-b font-medium">{who || "\u00a0"}</span></div>
                        <div><span className="text-muted-foreground">Month: </span><span className="border-foreground inline-block min-w-40 border-b font-medium">{label}</span></div>
                      </div>
                    </div>
                    <Table className="border">
                      <TableHeader><TableRow><TableHead className="border-r text-center">Date</TableHead><TableHead className="border-r text-center">Time In</TableHead><TableHead className="border-r text-center">Description of Activity</TableHead><TableHead className="border-r text-center">Time Out</TableHead><TableHead className="border-r text-center">Total Time</TableHead><TableHead className="text-center">Signature</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {sh.rows.map((e) => (
                          <TableRow key={e.id} className="h-11 print:h-8">
                            <TableCell className="border-r text-center whitespace-nowrap tabular-nums">{fmtDate(e.date, { month: "numeric", day: "numeric", year: "2-digit" })}</TableCell>
                            <TableCell className="border-r text-center tabular-nums">{e.start}</TableCell>
                            <TableCell className="border-r">{e.activity}</TableCell>
                            <TableCell className="border-r text-center tabular-nums">{e.end}</TableCell>
                            <TableCell className="border-r text-center tabular-nums">{fmtHours(e.hours)} h</TableCell>
                            <TableCell className="text-muted-foreground text-center text-xs">{e.signed ? "signed" : ""}</TableCell>
                          </TableRow>
                        ))}
                        {Array.from({ length: blanks }, (_, k) => <TableRow key={"b" + k} className="h-11 print:h-8"><TableCell className="border-r" /><TableCell className="border-r" /><TableCell className="border-r" /><TableCell className="border-r" /><TableCell className="border-r" /><TableCell /></TableRow>)}
                      </TableBody>
                    </Table>
                    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span>{org && (org.contactInfo || org.website) ? [org.contactInfo, org.website.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ") : ""}</span>
                      <span className="tabular-nums">This month: {fmtHours(sumHours(sh.rows))} h in {plural(sh.rows.length, "session")}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          })()}
        </>
      ) : mode === "letters" ? (
        byOrg.length ? byOrg.map((r, i) => (
          <Card key={r.orgId} className={cn("print:border-0 print:shadow-none", i < byOrg.length - 1 && "print:break-after-page")} data-testid="letter">
            <CardContent className="flex flex-col gap-5 pt-2">
              <div className="border-foreground flex flex-wrap items-start justify-between gap-3 border-b-2 pb-4">
                <div>
                  <h2 className="text-xl font-semibold">Volunteer Service Verification</h2>
                  <div className="text-muted-foreground">{r.name}</div>
                </div>
                <div className="text-muted-foreground text-right text-xs">
                  <div><b className="text-foreground">Period:</b> {period}</div>
                  <div><b className="text-foreground">Prepared:</b> {new Date().toLocaleDateString(undefined, { dateStyle: "long" })}</div>
                </div>
              </div>
              <p className="text-sm">This confirms that <b>{who || "the volunteer"}</b>{age != null ? ` (age ${age})` : ""} completed <b>{fmtHours(r.hours)} hours</b> of volunteer service with <b>{r.name}</b>{r.org && (r.org.contact || r.org.contactInfo) ? `, contact ${[r.org.contact, r.org.contactInfo].filter(Boolean).join(", ")}` : ""}, over {plural(r.count, "session")} as listed below.</p>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Activity</TableHead><TableHead>Supervisor</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
                <TableBody>{entries.filter((e) => e.orgId === r.orgId).map((e) => (
                  <TableRow key={e.id}><TableCell className="whitespace-nowrap tabular-nums">{fmtDate(e.date)}</TableCell><TableCell>{e.activity}{e.workItemId ? <div className="text-muted-foreground text-xs">{workItemTitle(e.workItemId)}</div> : null}</TableCell><TableCell>{e.supervisor}</TableCell><TableCell className="text-right tabular-nums">{fmtHours(e.hours)}</TableCell></TableRow>
                ))}</TableBody>
                <TableFooter><TableRow><TableCell colSpan={3}>Total</TableCell><TableCell className="text-right tabular-nums">{fmtHours(r.hours)}</TableCell></TableRow></TableFooter>
              </Table>
              <div className="mt-6 grid gap-8 @lg/main:grid-cols-2">
                <div className="flex flex-col gap-6">
                  <div className="border-foreground text-muted-foreground border-t pt-1 text-xs">Supervisor signature</div>
                  <div className="border-foreground text-muted-foreground border-t pt-1 text-xs">Printed name and title</div>
                </div>
                <div className="flex flex-col gap-6">
                  <div className="border-foreground text-muted-foreground border-t pt-1 text-xs">Date</div>
                  <div className="border-foreground text-muted-foreground border-t pt-1 text-xs">Parent or guardian signature</div>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">Prepared with Volunteer Tracker from the volunteer's own log. Hours are self-reported until signed above.</p>
            </CardContent>
          </Card>
        )) : <Card><CardContent className="pt-2"><Empty>No entries in this period, so there is nothing to verify yet.</Empty></CardContent></Card>
      ) : (

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
                      <TableCell>{e.activity}{e.notes ? <div className="text-muted-foreground text-xs">{e.notes}</div> : null}{e.reflection ? <div className="text-muted-foreground text-xs italic">“{e.reflection}”</div> : null}</TableCell>
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
      )}
    </div>
  )
}
