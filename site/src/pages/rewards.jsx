import * as React from "react"
import { Award, Building2, CalendarCheck, CalendarDays, Camera, Check, ClipboardCheck, Clock, Compass, Crown, Footprints, Gift, Lock, Medal, PenLine, Plus, StickyNote, Trash2, Trophy } from "lucide-react"

import { fmtDate } from "@/lib/format"
import { BADGES, BADGE_GROUPS, LEVELS, POINT_RULES, SUGGESTED, addReward, badgeCounts, badgeState, cancelClaim, claimReward, claims, markGiven, nextBadge, pointsBreakdown, recentBadges, removeReward, shelf, syncBadges, updateReward, wallet } from "@/lib/rewards"
import { go } from "@/lib/router"
import { Store, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"
import { Empty, PageHeader } from "@/components/bits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const ICONS = { Award, Building2, CalendarCheck, CalendarDays, Camera, ClipboardCheck, Clock, Compass, Crown, Footprints, Medal, PenLine, StickyNote, Trophy }
export function BadgeIcon({ name, className }) { const I = ICONS[name] || Award; return <I className={className} /> }

/** Keep pinned badges up to date whenever a page that shows them is open; announce new ones once. */
export function useBadgeSync() {
  const store = useStore()
  const toast = useToast()
  React.useEffect(() => {
    const fresh = syncBadges()
    if (fresh.length) toast(fresh.length === 1 ? `Badge earned: ${fresh[0].name}` : `${fresh.length} badges earned: ${fresh.map((b) => b.name).join(", ")}`)
  }, [store.snapshot()])
}

function Medallion({ b, size = 56 }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full border-2 transition-colors", b.done ? "border-primary/40 bg-primary/10 text-primary" : "border-dashed border-muted-foreground/25 bg-muted/40 text-muted-foreground/50")} style={{ width: size, height: size }}>
      {b.done ? <BadgeIcon name={b.icon} className="size-6" /> : <Lock className="size-4" />}
    </div>
  )
}

function BadgeCard({ b }) {
  return (
    <li className={cn("flex items-start gap-3 rounded-lg border p-3", b.done ? "bg-card" : "bg-muted/20")} data-testid="badge" data-done={b.done ? "1" : "0"} data-id={b.id}>
      <Medallion b={b} size={48} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("text-sm font-medium", !b.done && "text-muted-foreground")}>{b.name}</span>
          {b.done ? <span className="text-muted-foreground shrink-0 text-xs">{b.at ? fmtDate(b.at.slice(0, 10)) : "earned"}</span> : <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{Math.min(b.have, b.need)}/{b.need} {b.unit}</span>}
        </div>
        <span className="text-muted-foreground text-xs">{b.desc}</span>
        {!b.done ? <Progress value={b.pct} className="mt-0.5 h-1" /> : null}
      </div>
    </li>
  )
}

/** Compact dashboard card: level, balance, what is close, what was just earned. */
export function RewardsCard() {
  useBadgeSync()
  const w = wallet()
  const counts = badgeCounts()
  const recent = recentBadges(7).slice(0, 4)
  const next = nextBadge()
  const pending = claims().filter((c) => c.status === "claimed")
  if (!Store.s.entries.length) return null
  return (
    <Card className="gap-4" data-testid="rewards-card">
      <CardHeader>
        <CardDescription className="flex items-center gap-2"><Trophy className="size-4" /> Rewards</CardDescription>
        <CardTitle className="text-xl">Level {w.level.n} · {w.level.title}</CardTitle>
        <CardDescription className="tabular-nums">{counts.earned} of {counts.total} badges · <span data-testid="dash-balance">{w.balance}</span> points to spend</CardDescription>
        <CardAction><Button size="sm" variant="ghost" onClick={() => go("/rewards")}>Open <Gift /></Button></CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Progress value={w.level.pct} className="h-1.5" />
          <span className="text-muted-foreground text-xs tabular-nums">{w.level.next ? `${w.level.next.at - w.lifetime} points to Level ${w.level.next.n} · ${w.level.next.title}` : "Top level reached"}</span>
        </div>
        {recent.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">Just earned</span>
            <div className="flex flex-wrap gap-2" data-testid="badges-earned">
              {recent.map((b) => (
                <Tooltip key={b.id}>
                  <TooltipTrigger asChild><span data-id={b.id}><Medallion b={b} size={40} /></span></TooltipTrigger>
                  <TooltipContent>{b.name} — {b.desc}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        ) : null}
        {next ? (
          <div className="flex flex-col gap-1" data-testid="next-badge">
            <span className="text-muted-foreground text-xs">Closest badge</span>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{next.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{Math.min(next.have, next.need)}/{next.need} {next.unit}</span>
            </div>
            <Progress value={next.pct} className="h-1" />
            <span className="text-muted-foreground text-xs">{next.desc}</span>
          </div>
        ) : null}
        {pending.length ? <div className="text-warning text-xs" data-testid="pending-claims">{pending.length} reward{pending.length === 1 ? "" : "s"} claimed, waiting to be handed over</div> : null}
      </CardContent>
    </Card>
  )
}

function Shelf() {
  useStore()
  const toast = useToast()
  const w = wallet()
  const list = shelf()
  const cs = claims()
  const [name, setName] = React.useState("")
  const [cost, setCost] = React.useState(100)
  function add() { const t = name.trim(); if (!t) return; addReward(t, cost); setName(""); setCost(100); toast("Added to the shelf") }
  const suggestions = SUGGESTED.filter((sg) => !list.some((r) => r.name === sg.name))
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Reward shelf</CardTitle>
          <CardDescription>Points are earned for doing the work, not for how much of it. The parent sets what they buy; Sheila claims one when she has enough. Claiming never lowers her level.</CardDescription>
          <CardAction><Badge variant={w.balance ? "success" : "outline"} className="tabular-nums" data-testid="balance">{w.balance} to spend</Badge></CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {list.length ? (
            <ul className="divide-y rounded-md border">
              {list.map((r) => {
                const affordable = w.balance >= r.cost
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-testid="reward-item">
                    <Gift className={cn("size-4 shrink-0", affordable ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1 text-sm font-medium">{r.name}</span>
                    <Input type="number" min="5" step="5" value={r.cost} aria-label={`Cost of ${r.name}`} onChange={(e) => updateReward(r.id, { cost: Math.max(5, +e.target.value || 5) })} className="h-8 w-24 tabular-nums" />
                    <Button size="sm" disabled={!affordable} onClick={() => { claimReward(r); toast(`Claimed: ${r.name}`) }} data-testid="claim">{affordable ? "Claim" : `${r.cost - w.balance} short`}</Button>
                    <Button size="sm" variant="ghost" className="size-8 p-0" aria-label={`Remove ${r.name}`} onClick={() => removeReward(r.id)}><Trash2 /></Button>
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-muted-foreground text-sm">Nothing on the shelf yet. Add one below, or start from a suggestion.</p>}
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add() }} placeholder="Add a reward Sheila can work toward" className="h-9 min-w-48 flex-1" data-testid="reward-name" />
            <Input type="number" min="5" step="5" value={cost} onChange={(e) => setCost(+e.target.value || 0)} aria-label="Cost in points" className="h-9 w-24 tabular-nums" data-testid="reward-cost" />
            <Button variant="outline" onClick={add} data-testid="reward-add"><Plus /> Add</Button>
          </div>
          {suggestions.length ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((sg) => <Button key={sg.name} size="sm" variant="secondary" onClick={() => { addReward(sg.name, sg.cost); toast("Added to the shelf") }} data-testid="suggested-reward">{sg.name} · {sg.cost}</Button>)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cs.length ? (
        <Card>
          <CardHeader><CardTitle>Claimed</CardTitle><CardDescription>Mark a reward given once it has actually happened.</CardDescription></CardHeader>
          <CardContent>
            <ul className="divide-y" data-testid="claims">
              {cs.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm" data-status={c.status}>
                  <span className="min-w-0 flex-1"><span className="font-medium">{c.name}</span> <span className="text-muted-foreground tabular-nums">· {c.cost} points · {fmtDate((c.claimedAt || c.at).slice(0, 10))}</span></span>
                  {c.status === "given" ? <Badge variant="success"><Check className="size-3" /> given {c.givenAt ? fmtDate(c.givenAt.slice(0, 10)) : ""}</Badge> : (
                    <>
                      <Button size="sm" onClick={() => markGiven(c.id)} data-testid="mark-given"><Check /> Given</Button>
                      <Button size="sm" variant="ghost" onClick={() => cancelClaim(c.id)}>Cancel</Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export function Rewards() {
  useBadgeSync()
  const w = wallet()
  const counts = badgeCounts()
  const all = badgeState()
  const pb = pointsBreakdown()
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Rewards" description="Points for the doing, badges for the milestones, and a shelf of things to work toward." />
      <div className="grid gap-4 @3xl/main:grid-cols-[3fr_2fr]">
        <Card data-testid="level-card">
          <CardHeader>
            <CardDescription className="flex items-center gap-2"><Trophy className="size-4" /> Level</CardDescription>
            <CardTitle className="text-2xl">Level {w.level.n} · {w.level.title}</CardTitle>
            <CardDescription className="tabular-nums">{w.lifetime} points earned all time · {w.balance} to spend · {counts.earned} of {counts.total} badges</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Progress value={w.level.pct} className="h-2" />
            <span className="text-muted-foreground text-xs tabular-nums">{w.level.next ? `${w.level.next.at - w.lifetime} points to Level ${w.level.next.n} · ${w.level.next.title}` : "Top level reached"}</span>
            <ol className="text-muted-foreground mt-2 grid grid-cols-5 gap-1 text-xs tabular-nums">
              {LEVELS.map((l) => <li key={l.n} className={cn("rounded px-1.5 py-1", l.n === w.level.n && "bg-primary/10 text-primary font-medium", l.at <= w.lifetime && l.n !== w.level.n && "text-foreground")}>{l.n}. {l.title}<span className="block">{l.at}</span></li>)}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>How points are earned</CardTitle><CardDescription>Nothing here can go down.</CardDescription></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm" data-testid="points-breakdown">
              {pb.rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-1.5"><span>{r.label} <span className="text-muted-foreground text-xs">· {r.points} {r.unit}</span></span><span className="tabular-nums">{r.total}</span></li>)}
              <li className="flex items-center justify-between gap-3 py-1.5 font-medium"><span>Total</span><span className="tabular-nums" data-testid="points-total">{pb.total}</span></li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Shelf />

      {BADGE_GROUPS.map((g) => (
        <Card key={g}>
          <CardHeader><CardTitle>{g}</CardTitle><CardDescription>{all.filter((b) => b.group === g && b.done).length} of {all.filter((b) => b.group === g).length} earned</CardDescription></CardHeader>
          <CardContent><ul className="grid gap-2 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">{all.filter((b) => b.group === g).map((b) => <BadgeCard key={b.id} b={b} />)}</ul></CardContent>
        </Card>
      ))}
    </div>
  )
}
