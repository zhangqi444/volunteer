import * as React from "react"
import { CalendarPlus, ClipboardPlus, ExternalLink } from "lucide-react"

import { C, KIND_LABEL, catalogOrg, catalogTags, currentAge, fit } from "@/lib/content"
import { orgsSorted } from "@/lib/engine"
import { INTEREST_STATUSES } from "@/lib/model"
import { go } from "@/lib/router"
import { Store, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useDialogs } from "@/components/dialogs"
import { useToast } from "@/components/toast"
import { Empty, PageHeader, Pick } from "@/components/bits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const FIT_VARIANT = { fits: "success", adult: "default", later: "outline", past: "outline", unknown: "secondary" }
const INTEREST_LABEL = { interested: "Interested", applied: "Applied", joined: "Joined", passed: "Passed" }

export function FitBadge({ item, age }) {
  const f = fit(item, age)
  return <Badge variant={FIT_VARIANT[f.key]} className={cn("max-w-full", f.key === "later" && "text-muted-foreground")} title={item.ages && item.ages.note} data-fit={f.key}>{f.label}</Badge>
}

function OpportunityCard({ item, age }) {
  const store = useStore()
  const toast = useToast()
  const { openPlan, openWorkItem } = useDialogs()
  const [open, setOpen] = React.useState(false)
  const org = catalogOrg(item)
  const interest = store.s.interests[item.id]
  const knownOrg = orgsSorted().find((o) => o.name.toLowerCase() === org.name.toLowerCase())
  return (
    <Card className="@container/card gap-3 py-4" data-testid="catalog-item" data-id={item.id}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="leading-snug">{item.title}</CardTitle>
          <div className="flex min-w-0 flex-wrap gap-1.5"><Badge variant="outline">{KIND_LABEL[item.kind] || item.kind}</Badge><FitBadge item={item} age={age} /></div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-2">
          <a href={org.url} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1 hover:underline">{org.name}<ExternalLink className="size-3" /></a>
          {item.location ? <span>· {item.location}</span> : null}
        </CardDescription>
        <p className="text-sm">{item.summary}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {open ? (
          <>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">{item.details.map((d) => <li key={d}>{d}</li>)}</ul>
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              {item.ages && item.ages.note ? <><dt className="text-muted-foreground">Ages</dt><dd>{item.ages.note}</dd></> : null}
              {item.commitment ? <><dt className="text-muted-foreground">Commitment</dt><dd>{item.commitment}</dd></> : null}
              {item.howTo ? <><dt className="text-muted-foreground">How to</dt><dd>{item.howTo}</dd></> : null}
              {org.contact ? <><dt className="text-muted-foreground">Contact</dt><dd>{[org.contact.email, org.contact.phone].filter(Boolean).join(" · ")}</dd></> : null}
            </dl>
            <div className="text-muted-foreground text-xs">Source: <a href={item.url} target="_blank" rel="noopener" className="hover:underline">{item.url.replace(/^https?:\/\/(www\.)?/, "")}</a> · checked {item.verified}. Confirm on the page before signing up.</div>
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          {item.tags.map((t) => <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>)}
          <Button variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={() => setOpen((o) => !o)} data-testid="catalog-more">{open ? "Less" : "Details"}</Button>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 @sm/card:flex-row @sm/card:items-center">
        <Pick value={interest ? interest.status : ""} onChange={(v) => { Store.setInterest(item.id, v); toast(v ? `Marked ${INTEREST_LABEL[v].toLowerCase()}` : "Interest cleared") }}
          options={INTEREST_STATUSES.map((s) => ({ value: s, label: INTEREST_LABEL[s] }))} noneLabel="Not marked" className="@sm/card:w-40" size="sm" testid="catalog-interest" />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1 @sm/card:flex-none" onClick={() => openPlan({ title: item.title, catalogId: item.id, orgId: knownOrg ? knownOrg.id : "", notes: item.howTo })} data-testid="catalog-plan"><CalendarPlus /> Plan it</Button>
          <Button size="sm" variant="ghost" className="flex-1 @sm/card:flex-none" onClick={() => openWorkItem({ title: item.title, description: item.summary, orgId: knownOrg ? knownOrg.id : "" })} data-testid="catalog-workitem"><ClipboardPlus /> Start work item</Button>
        </div>
      </CardFooter>
    </Card>
  )
}

export function Catalog() {
  const store = useStore()
  const age = currentAge()
  const name = store.s.settings.profile.name
  const [q, setQ] = React.useState("")
  const [org, setOrg] = React.useState("")
  const [kind, setKind] = React.useState("")
  const [fitF, setFitF] = React.useState(age == null ? "" : "now")
  const [tag, setTag] = React.useState("")
  const items = C.items.filter((i) => {
    const f = fit(i, age).key
    if (fitF === "now" && !(f === "fits" || f === "adult" || f === "unknown")) return false
    if (fitF === "later" && f !== "later") return false
    if (fitF === "marked" && !store.s.interests[i.id]) return false
    if (org && i.org !== org) return false
    if (kind && i.kind !== kind) return false
    if (tag && !i.tags.includes(tag)) return false
    if (q && !`${i.title} ${i.summary} ${i.details.join(" ")} ${catalogOrg(i).name} ${i.tags.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  })
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Catalog" description={age != null ? `Opportunities near Seattle, checked against ${name || "the volunteer"}'s age (${age}). Set the age in Settings if it changes.` : "Opportunities near Seattle. Set the volunteer's age in Settings to see which ones fit."}>
        <Button variant="outline" onClick={() => go("/settings")}>Profile</Button>
      </PageHeader>
      <Card className="py-4">
        <CardContent className="grid gap-3 @lg/main:grid-cols-3 @5xl/main:grid-cols-5">
          <Input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" data-testid="catalog-search" />
          <Pick value={fitF} onChange={setFitF} options={[{ value: "now", label: age != null ? "Fits now (incl. with an adult)" : "Fits now" }, { value: "later", label: "Later (age-gated)" }, { value: "marked", label: "Marked by me" }]} noneLabel="Everything" testid="catalog-fit" />
          <Pick value={org} onChange={setOrg} options={Object.entries(C.organizations).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, o]) => ({ value: id, label: o.name }))} noneLabel="All organizations" testid="catalog-org" />
          <Pick value={kind} onChange={setKind} options={Object.entries(KIND_LABEL).map(([v, l]) => ({ value: v, label: l }))} noneLabel="All kinds" testid="catalog-kind" />
          <Pick value={tag} onChange={setTag} options={catalogTags().map((t) => ({ value: t, label: t }))} noneLabel="All tags" />
        </CardContent>
      </Card>
      {C.items.length === 0 ? <Empty>The catalog could not be loaded.</Empty>
        : items.length ? <div className="grid gap-4 @3xl/main:grid-cols-2" data-testid="catalog-grid">{items.map((i) => <OpportunityCard key={i.id} item={i} age={age} />)}</div>
        : <Empty>Nothing matches these filters.</Empty>}
      {C.note ? <p className="text-muted-foreground text-xs">{C.note}</p> : null}
    </div>
  )
}
