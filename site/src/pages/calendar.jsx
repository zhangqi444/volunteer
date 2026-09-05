import * as React from "react"
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Pencil, X } from "lucide-react"

import { orgName, overduePlans, planHours, plansSorted, upcomingPlans, workItemTitle } from "@/lib/engine"
import { fmtDate, fmtHours, pad, todayISO, toISODate } from "@/lib/format"
import { catalogItem } from "@/lib/content"
import { Store, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useDialogs } from "@/components/dialogs"
import { useToast } from "@/components/toast"
import { Empty, OrgChip, PageHeader } from "@/components/bits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function PlanRow({ p, compact }) {
  const { openEntry, openPlan } = useDialogs()
  const toast = useToast()
  const done = p.status === "done", skipped = p.status === "skipped"
  const h = planHours(p)
  return (
    <li className={cn("flex flex-wrap items-center gap-2 py-2", (done || skipped) && "opacity-70")} data-testid="plan-row" data-status={p.status}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium", skipped && "line-through")}>{p.title}</span>
          {done ? <Badge variant="success"><Check className="size-3" /> logged</Badge> : skipped ? <Badge variant="secondary">skipped</Badge> : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs tabular-nums">
          {!compact ? <span>{fmtDate(p.date, { weekday: "short", month: "short", day: "numeric" })}</span> : null}
          {p.start ? <span><Clock className="mr-0.5 inline size-3" />{p.start}{p.end ? `–${p.end}` : ""}</span> : null}
          {h ? <span>{fmtHours(h)} h</span> : null}
          {p.orgId ? <OrgChip orgId={p.orgId} /> : null}
          {p.workItemId ? <span>· {workItemTitle(p.workItemId)}</span> : null}
          {p.catalogId && catalogItem(p.catalogId) ? <span>· from the catalog</span> : null}
        </div>
        {p.notes ? <div className="text-muted-foreground mt-0.5 text-xs">{p.notes}</div> : null}
      </div>
      {!done && !skipped ? (
        <div className="flex shrink-0 gap-1">
          <Button size="sm" onClick={() => openEntry({ planId: p.id })} data-testid="plan-log"><Check /> Log hours</Button>
          <Button size="sm" variant="ghost" className="size-8 p-0" aria-label="Edit plan" onClick={() => openPlan({ id: p.id })}><Pencil /></Button>
          <Button size="sm" variant="ghost" className="size-8 p-0" aria-label="Mark skipped" onClick={() => { Store.setPlanStatus(p.id, "skipped"); toast("Marked skipped") }} data-testid="plan-skip"><X /></Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => openPlan({ id: p.id })}>Edit</Button>
      )}
    </li>
  )
}

export function UpNextCard({ limit = 4 }) {
  useStore()
  const today = todayISO()
  const up = upcomingPlans(today, limit)
  const late = overduePlans(today)
  return (
    <Card data-testid="up-next">
      <CardHeader>
        <CardTitle>Up next</CardTitle>
        <CardDescription>{up.length ? `${up.length} planned` : "Nothing planned yet"}{late.length ? ` · ${late.length} past ${late.length === 1 ? "plan" : "plans"} to log` : ""}</CardDescription>
      </CardHeader>
      <CardContent>
        {up.length || late.length ? <ul className="divide-y">{[...late, ...up].slice(0, limit + late.length).map((p) => <PlanRow key={p.id} p={p} />)}</ul>
          : <Empty>Plan work from the Calendar or the Catalog and it shows up here.</Empty>}
      </CardContent>
    </Card>
  )
}

export function Calendar() {
  useStore()
  const { openPlan } = useDialogs()
  const today = todayISO()
  const [cursor, setCursor] = React.useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selected, setSelected] = React.useState(today)
  const first = new Date(cursor.y, cursor.m, 1)
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7                       // Monday-first grid
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`)
  while (cells.length % 7) cells.push(null)
  const monthKey = `${cursor.y}-${pad(cursor.m + 1)}`
  const byDay = new Map()
  for (const p of plansSorted()) { if (p.date.startsWith(monthKey)) { if (!byDay.has(p.date)) byDay.set(p.date, []); byDay.get(p.date).push(p) } }
  const monthPlans = plansSorted().filter((p) => p.date.startsWith(monthKey))
  const plannedH = monthPlans.filter((p) => p.status === "planned").reduce((s, p) => s + planHours(p), 0)
  const dayPlans = plansSorted().filter((p) => p.date === selected)
  const late = overduePlans(today)
  const shift = (n) => setCursor((c) => { const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Calendar" description="Plan shifts and projects ahead, then log the hours when they happen.">
        <Button onClick={() => openPlan({ date: selected })} data-testid="add-plan"><CalendarPlus /> Plan work</Button>
      </PageHeader>

      <div className="grid gap-4 @3xl/main:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</CardTitle>
              <CardDescription className="tabular-nums">{monthPlans.length ? `${monthPlans.length} ${monthPlans.length === 1 ? "plan" : "plans"}${plannedH ? ` · ${fmtHours(plannedH)} h still planned` : ""}` : "No plans this month"}</CardDescription>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)} aria-label="Previous month" data-testid="cal-prev"><ChevronLeft /></Button>
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today) }}>Today</Button>
              <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)} aria-label="Next month" data-testid="cal-next"><ChevronRight /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{DOW.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1" data-testid="cal-grid">
              {cells.map((iso, i) => {
                if (!iso) return <div key={i} />
                const ps = byDay.get(iso) || []
                const isToday = iso === today, isSel = iso === selected
                return (
                  <button key={iso} type="button" onClick={() => setSelected(iso)} onDoubleClick={() => openPlan({ date: iso })} data-date={iso}
                    className={cn("flex min-h-16 flex-col items-start gap-1 rounded-md border p-1.5 text-left text-xs transition hover:bg-accent @lg/main:min-h-20", isSel && "ring-2 ring-primary", isToday && "bg-primary/5 border-primary/40")}>
                    <span className={cn("tabular-nums", isToday && "text-primary font-semibold")}>{Number(iso.slice(8))}</span>
                    {ps.slice(0, 2).map((p) => (
                      <span key={p.id} className={cn("w-full truncate rounded px-1 py-0.5", p.status === "done" ? "bg-success-soft text-success" : p.status === "skipped" ? "bg-muted text-muted-foreground line-through" : iso < today ? "bg-warning-soft text-warning" : "bg-primary/10 text-primary")} title={p.title}>{p.title}</span>
                    ))}
                    {ps.length > 2 ? <span className="text-muted-foreground">+{ps.length - 2}</span> : null}
                  </button>
                )
              })}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">Click a day to see it; double-click to plan something on it.</p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{fmtDate(selected, { weekday: "long", month: "long", day: "numeric" })}</CardTitle>
              <CardDescription>{dayPlans.length ? `${dayPlans.length} ${dayPlans.length === 1 ? "plan" : "plans"}` : "Nothing planned"}</CardDescription>
            </CardHeader>
            <CardContent>
              {dayPlans.length ? <ul className="divide-y" data-testid="day-plans">{dayPlans.map((p) => <PlanRow key={p.id} p={p} compact />)}</ul>
                : <Button variant="outline" size="sm" onClick={() => openPlan({ date: selected })}><CalendarPlus /> Plan work on this day</Button>}
            </CardContent>
          </Card>
          {late.length ? (
            <Card className="border-warning/50">
              <CardHeader><CardTitle>Past plans to log</CardTitle><CardDescription>Log the hours, or mark them skipped.</CardDescription></CardHeader>
              <CardContent><ul className="divide-y" data-testid="overdue-plans">{late.map((p) => <PlanRow key={p.id} p={p} />)}</ul></CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Coming up</CardTitle></CardHeader>
            <CardContent>
              {upcomingPlans(today, 8).length ? <ul className="divide-y">{upcomingPlans(today, 8).map((p) => <PlanRow key={p.id} p={p} />)}</ul> : <Empty>Nothing planned ahead.</Empty>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
