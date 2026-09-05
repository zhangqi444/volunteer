import * as React from "react"
import { ExternalLink, Pencil, Plus } from "lucide-react"

import { entriesSorted, hoursByOrg, orgsSorted, workItemsForOrg } from "@/lib/engine"
import { fmtDate, fmtHours, plural } from "@/lib/format"
import { useStore } from "@/lib/store"
import { useDialogs } from "@/components/dialogs"
import { Empty, PageHeader } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export function Orgs() {
  useStore()
  const { openOrg, openEntry, openWorkItem } = useDialogs()
  const orgs = orgsSorted()
  const totals = new Map(hoursByOrg().map((r) => [r.orgId, r]))
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Organizations" description="The nonprofits, schools, and groups you work with.">
        <Button onClick={() => openOrg()} data-testid="add-org"><Plus /> Add organization</Button>
      </PageHeader>
      {orgs.length ? (
        <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3" data-testid="org-grid">
          {orgs.map((o) => {
            const t = totals.get(o.id) || { hours: 0, count: 0 }
            const last = entriesSorted().find((e) => e.orgId === o.id)
            const items = workItemsForOrg(o.id)
            return (
              <Card key={o.id} className="gap-3 border-t-4 py-4" style={{ borderTopColor: o.color }} data-testid="org-card">
                <CardHeader className="gap-1">
                  <CardTitle>{o.name}</CardTitle>
                  <CardDescription className="flex flex-col gap-0.5">
                    {o.contact || o.contactInfo ? <span>{[o.contact, o.contactInfo].filter(Boolean).join(" · ")}</span> : null}
                    {o.website ? <a href={o.website} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1 hover:underline">{o.website.replace(/^https?:\/\//, "")}<ExternalLink className="size-3" /></a> : null}
                    <span>{last ? `Last volunteered ${fmtDate(last.date)}` : "No hours logged yet"}</span>
                  </CardDescription>
                  {o.notes ? <p className="text-muted-foreground mt-1 text-sm">{o.notes}</p> : null}
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xl font-semibold tabular-nums">{fmtHours(t.hours)}</div><div className="text-muted-foreground text-xs">hours</div></div>
                  <div><div className="text-xl font-semibold tabular-nums">{t.count}</div><div className="text-muted-foreground text-xs">{t.count === 1 ? "entry" : "entries"}</div></div>
                  <div><div className="text-xl font-semibold tabular-nums">{items.length}</div><div className="text-muted-foreground text-xs">work {items.length === 1 ? "item" : "items"}</div></div>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEntry({ orgId: o.id })}><Plus /> Log hours</Button>
                  <Button size="sm" variant="ghost" onClick={() => openWorkItem({ orgId: o.id })}>New work item</Button>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => openOrg({ id: o.id })} data-testid="edit-org"><Pencil /> Edit</Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      ) : (
        <Empty action={<Button size="sm" onClick={() => openOrg()}><Plus /> Add organization</Button>}>No organizations yet. Add one so you can attribute your hours.</Empty>
      )}
    </div>
  )
}
