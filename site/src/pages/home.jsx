import * as React from "react"
import { ArrowRight, Plus } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { activeWorkItems, entriesSorted, hoursByMonth, hoursByOrg, orgColor, orgName, stats, workItemStats } from "@/lib/engine"
import { fmtDate, fmtHours, fmtShort, hoursWord, plural } from "@/lib/format"
import { go, href } from "@/lib/router"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useDialogs } from "@/components/dialogs"
import { Empty, OrgChip, Stat } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { UpNextCard } from "@/pages/calendar"

const chartConfig = { hours: { label: "Hours", color: "var(--chart-1)" } }

export function Home() {
  const store = useStore()
  const { openEntry } = useDialogs()
  const s = stats()
  const now = new Date()
  const hour = now.getHours()
  const first = (store.s.settings.profile.name || store.name || "").split(" ")[0]
  const diff = s.month - s.prevMonth
  const pct = s.goal > 0 ? Math.min(100, (s.year / s.goal) * 100) : 0
  const months = hoursByMonth(12)
  const anyMonth = months.some((m) => m.hours > 0)
  const byOrg = hoursByOrg()
  const active = activeWorkItems()
  const recent = entriesSorted().slice(0, 6)

  return (
    <div className="flex flex-col gap-4 @container/home">
      <Card className="from-primary/5 to-card bg-gradient-to-t" data-testid="today">
        <CardHeader>
          <CardDescription>{hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}{first ? `, ${first}` : ""}</CardDescription>
          <CardTitle className="text-xl">{s.count ? `You've given ${hoursWord(s.total)} so far.` : "Ready to log your first hours?"}</CardTitle>
          <CardDescription className="tabular-nums">
            {s.goal > 0 ? (s.year >= s.goal ? `${now.getFullYear()} goal reached: ${fmtHours(s.year)} of ${fmtHours(s.goal)} h` : `${fmtHours(s.year)} of ${fmtHours(s.goal)} h toward this year's goal · ${fmtHours(s.goal - s.year)} to go`) : "No yearly goal set"}
          </CardDescription>
          <CardAction><Button onClick={() => openEntry()} data-testid="continue"><Plus /> Log hours</Button></CardAction>
        </CardHeader>
        {s.goal > 0 && (
          <CardContent>
            <Progress value={pct} className={cn("h-1.5", s.year >= s.goal && "[&>[data-slot=progress-indicator]]:bg-success")} aria-label="Yearly goal progress" />
          </CardContent>
        )}
      </Card>

      <UpNextCard />

      <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <Stat label="Total hours" value={fmtHours(s.total)} sub={`across ${plural(s.count, "entry", "entries")}`} testid="stat-total" />
        <Stat label="This month" value={fmtHours(s.month)} sub={s.prevMonth || s.month ? `${diff >= 0 ? "+" : "−"}${fmtHours(Math.abs(diff))} vs last month` : now.toLocaleDateString(undefined, { month: "long" })} testid="stat-month" />
        <Stat label="This year" value={fmtHours(s.year)} sub={`${plural(s.yearCount, "entry", "entries")} in ${now.getFullYear()}`} testid="stat-year" />
        <Stat label="Organizations" value={String(s.orgs)} sub={`${s.activeOrgs} active this year`} testid="stat-orgs" />
      </div>

      <div className="grid gap-4 @3xl/main:grid-cols-2">
        <Card className="@container/card">
          <CardHeader>
            <CardTitle>Hours by month</CardTitle>
            <CardDescription>Last 12 months</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {anyMonth ? (
              <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full" data-testid="month-chart">
                <BarChart data={months} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(_, p) => p && p[0] ? `${p[0].payload.label} ${p[0].payload.year} · ${plural(p[0].payload.count, "entry", "entries")}` : ""} formatter={(v) => [`${fmtHours(v)} h`, "Hours"]} />} />
                  <Bar dataKey="hours" fill="var(--color-hours)" radius={4} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            ) : <Empty>No hours logged in the last 12 months.</Empty>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hours by organization</CardTitle>
            <CardDescription>All time</CardDescription>
          </CardHeader>
          <CardContent>
            {byOrg.length ? (
              <ul className="flex flex-col gap-3" data-testid="org-bars">
                {byOrg.slice(0, 8).map((r) => (
                  <li key={r.orgId} className="grid grid-cols-[minmax(0,1.3fr)_2fr_auto] items-center gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: orgColor(r.orgId) }} /><span className="truncate" title={r.name}>{r.name}</span></span>
                    <div className="bg-muted h-2 overflow-hidden rounded-full"><div className="h-full rounded-full" style={{ width: `${(r.hours / byOrg[0].hours) * 100}%`, background: orgColor(r.orgId) }} /></div>
                    <span className="text-muted-foreground min-w-12 text-right tabular-nums">{fmtHours(r.hours)} h</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>Log hours to see how your time is split.</Empty>}
          </CardContent>
        </Card>
      </div>

      {store.s.workItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active work items</CardTitle>
            <CardDescription>Progress toward each item's target</CardDescription>
            <CardAction><Button variant="ghost" size="sm" onClick={() => go("/work")}>View all <ArrowRight /></Button></CardAction>
          </CardHeader>
          <CardContent>
            {active.length ? (
              <ul className="flex flex-col gap-3" data-testid="dash-workitems">
                {active.slice(0, 6).map((w) => {
                  const st = workItemStats(w.id)
                  return (
                    <li key={w.id} className="grid items-center gap-x-3 gap-y-1 text-sm @md/main:grid-cols-[minmax(0,2fr)_3fr_auto]">
                      <a href={href(`/work/${w.id}`)} className="min-w-0 hover:underline">
                        <span className="block truncate font-medium">{w.title}</span>
                        <span className="text-muted-foreground block truncate text-xs">{orgName(w.orgId)}{st.last ? ` · last ${fmtShort(st.last)}` : ""}</span>
                      </a>
                      <Progress value={st.pct ?? 0} className={cn("h-2", st.pct >= 100 && "[&>[data-slot=progress-indicator]]:bg-success")} aria-label={w.targetHours ? `${fmtHours(st.hours)} of ${fmtHours(w.targetHours)} hours` : "No target set"} />
                      <span className="text-muted-foreground text-right text-xs tabular-nums">{fmtHours(st.hours)}{w.targetHours ? ` / ${fmtHours(w.targetHours)}` : ""} h</span>
                    </li>
                  )
                })}
              </ul>
            ) : <Empty>No active work items.</Empty>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardAction><Button variant="ghost" size="sm" onClick={() => go("/log")}>View all <ArrowRight /></Button></CardAction>
        </CardHeader>
        <CardContent>
          {recent.length ? (
            <Table data-testid="recent">
              <TableBody>
                {recent.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => openEntry({ id: e.id })}>
                    <TableCell className="whitespace-nowrap tabular-nums">{fmtDate(e.date)}</TableCell>
                    <TableCell><OrgChip orgId={e.orgId} /></TableCell>
                    <TableCell className="max-w-[40ch] truncate">{e.activity}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtHours(e.hours)} h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <Empty action={<Button size="sm" onClick={() => openEntry()}><Plus /> Log hours</Button>}>Nothing logged yet.</Empty>}
        </CardContent>
      </Card>
    </div>
  )
}
