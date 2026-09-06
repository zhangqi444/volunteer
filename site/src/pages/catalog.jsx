import * as React from "react"
import { CalendarPlus, ClipboardList, ExternalLink, Lightbulb, Mail, MapPin, Plus, Send, Trash2 } from "lucide-react"

import { C, KIND_LABEL, catalogArea, catalogOrg, catalogTags, currentAge, ensureFromCatalog, fit, hasEmail, introEmail, staleApplications, workItemForCatalog } from "@/lib/content"
import { INTEREST_STATUSES } from "@/lib/model"
import { go } from "@/lib/router"
import { Store, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useDialogs } from "@/components/dialogs"
import { useToast } from "@/components/toast"
import { Empty, PageHeader, Pick } from "@/components/bits"
import { fmtDate } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/bits"

const FIT_VARIANT = { fits: "success", adult: "default", later: "outline", past: "outline", unknown: "secondary" }
const INTEREST_LABEL = { interested: "Interested", applied: "Applied", joined: "Joined", passed: "Passed" }

export function FitBadge({ item, age }) {
  const f = fit(item, age)
  return <Badge variant={FIT_VARIANT[f.key]} className={cn("max-w-full", f.key === "later" && "text-muted-foreground")} title={item.ages && item.ages.note} data-fit={f.key}>{f.label}</Badge>
}

function OpportunityCard({ item, age }) {
  const store = useStore()
  const toast = useToast()
  const { openPlan, openEntry } = useDialogs()
  const [open, setOpen] = React.useState(false)
  const org = catalogOrg(item)
  const interest = store.s.interests[item.id]
  const wi = workItemForCatalog(item.id)
  const logHours = () => { const r = ensureFromCatalog(item.id); openEntry({ catalogId: item.id, orgId: r.orgId, workItemId: r.workItemId, activity: item.title }) }
  const planIt = () => { const r = ensureFromCatalog(item.id); openPlan({ catalogId: item.id, orgId: r.orgId, workItemId: r.workItemId, title: item.title, notes: item.howTo }) }
  return (
    <Card className="@container/card gap-3 py-4" data-testid="catalog-item" data-id={item.id}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="leading-snug">{item.title}</CardTitle>
          <div className="flex min-w-0 flex-wrap gap-1.5"><Badge variant="outline">{KIND_LABEL[item.kind] || item.kind}</Badge><FitBadge item={item} age={age} /></div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-2">
          <a href={org.url} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1 hover:underline">{org.name}<ExternalLink className="size-3" /></a>
          {catalogArea(item) ? <span className="inline-flex items-center gap-1">· <MapPin className="size-3" />{catalogArea(item)}</span> : null}
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
              {org.contact ? <><dt className="text-muted-foreground">Contact</dt><dd>{[org.contact.email, org.contact.phone].filter(Boolean).join(" · ")}{org.contact.address ? <div>{org.contact.address}</div> : null}</dd></> : null}
              {org.forms && org.forms.length ? <><dt className="text-muted-foreground">Forms</dt><dd>{org.forms.map((f) => <div key={f.url}><a href={f.url} target="_blank" rel="noopener" className="text-primary hover:underline" data-testid="catalog-form">{f.name}</a>{f.note ? <span className="text-muted-foreground"> · {f.note}</span> : null}</div>)}</dd></> : null}
            </dl>
            <div className="text-muted-foreground text-xs">Source: <a href={item.url} target="_blank" rel="noopener" className="hover:underline">{item.url.replace(/^https?:\/\/(www\.)?/, "")}</a> · checked {item.verified}. Confirm on the page before signing up.</div>
          </>
        ) : null}
        {interest && (interest.status === "interested" || interest.status === "applied") ? (
          <div className="bg-accent/50 flex flex-col gap-2 rounded-md border px-3 py-2" data-testid="next-step">
            <div className="text-xs font-medium">{interest.status === "interested" ? "Next step" : `Applied ${fmtDate((interest.since || interest.at).slice(0, 10))} — waiting to hear back`}</div>
            {item.howTo ? <p className="text-muted-foreground text-xs">{item.howTo}</p> : null}
            <div className="flex flex-wrap gap-2">
              {hasEmail(item) ? <Button size="sm" variant="secondary" asChild data-testid="catalog-email"><a href={introEmail(item)}><Mail /> {interest.status === "applied" ? "Follow up" : "Write to them"}</a></Button> : null}
              {interest.status === "interested" ? <Button size="sm" variant="ghost" onClick={() => { Store.setInterest(item.id, "applied"); toast("Marked applied") }} data-testid="mark-applied">I've asked them</Button> : null}
              {interest.status === "applied" ? <Button size="sm" variant="ghost" onClick={() => { Store.setInterest(item.id, "joined"); toast("Marked joined") }} data-testid="mark-joined">They said yes</Button> : null}
            </div>
          </div>
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
          <Button size="sm" className="flex-1 @sm/card:flex-none" onClick={logHours} data-testid="catalog-log"><Plus /> Log hours</Button>
          <Button size="sm" variant="secondary" className="flex-1 @sm/card:flex-none" onClick={planIt} data-testid="catalog-plan"><CalendarPlus /> Plan it</Button>
          {wi ? <Button size="sm" variant="ghost" className="flex-1 @sm/card:flex-none" onClick={() => go(`/work/${wi.id}`)} data-testid="catalog-workitem"><ClipboardList /> Work item</Button> : null}
        </div>
      </CardFooter>
    </Card>
  )
}

const REPO = "https://github.com/zhangqi444/volunteer"
function issueUrl(sg) {
  const q = new URLSearchParams({ title: `Catalog: ${sg.url || sg.note.slice(0, 60)}`, body: `Please add this to the catalog with its source and age rules.\n\nURL: ${sg.url || "(none)"}\n\nNote: ${sg.note || "(none)"}\n\nSuggested from the app on ${sg.createdAt.slice(0, 10)}.`, labels: "catalog" })
  return `${REPO}/issues/new?${q}`
}

/** A place to drop links found on the phone; each one can be sent on as a GitHub issue so it reaches the next session. */
export function SuggestCard() {
  const store = useStore()
  const toast = useToast()
  const [url, setUrl] = React.useState("")
  const [note, setNote] = React.useState("")
  const open = store.s.suggestions.filter((x) => x.status === "open").sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  function submit(ev) {
    ev.preventDefault()
    if (!url.trim() && !note.trim()) return
    Store.addSuggestion({ url: url.trim(), note: note.trim() }); setUrl(""); setNote(""); toast("Saved to your suggestions")
  }
  return (
    <Card data-testid="suggest">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Lightbulb className="text-primary size-4" /> Suggest an entry</CardTitle>
        <CardDescription>Found something Sheila could do? Drop the link here. It is kept with your data; send it on as a GitHub issue and it gets added with its source and age rules.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={submit} className="grid gap-3 @lg/main:grid-cols-[2fr_3fr_auto] @lg/main:items-end">
          <Field label="Link"><Input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} data-testid="suggest-url" /></Field>
          <Field label="Note"><Input placeholder="What is it, and why it fits" value={note} onChange={(e) => setNote(e.target.value)} data-testid="suggest-note" /></Field>
          <Button type="submit" variant="secondary" disabled={!url.trim() && !note.trim()} data-testid="suggest-save">Save</Button>
        </form>
        {open.length ? (
          <ul className="divide-y" data-testid="suggestions">
            {open.map((sg) => (
              <li key={sg.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  {sg.url ? <a href={sg.url} target="_blank" rel="noopener" className="text-primary block truncate hover:underline">{sg.url.replace(/^https?:\/\/(www\.)?/, "")}</a> : null}
                  {sg.note ? <div className="text-muted-foreground">{sg.note}</div> : null}
                </div>
                <Button size="sm" variant="outline" asChild><a href={issueUrl(sg)} target="_blank" rel="noopener" data-testid="suggest-issue"><Send /> Send as issue</a></Button>
                <Button size="sm" variant="ghost" onClick={() => { Store.setSuggestionStatus(sg.id, "done"); toast("Marked done") }}>Done</Button>
                <Button size="sm" variant="ghost" className="size-8 p-0" aria-label="Remove" onClick={() => Store.deleteSuggestion(sg.id)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
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
  const [area, setArea] = React.useState("")
  const areas = [...new Set(C.items.map((i) => catalogArea(i)).filter(Boolean))].sort()
  const items = C.items.filter((i) => {
    const f = fit(i, age).key
    if (fitF === "now" && !(f === "fits" || f === "adult" || f === "unknown")) return false
    if (fitF === "later" && f !== "later") return false
    if (fitF === "marked" && !store.s.interests[i.id]) return false
    if (org && i.org !== org) return false
    if (kind && i.kind !== kind) return false
    if (tag && !i.tags.includes(tag)) return false
    if (area && catalogArea(i) !== area) return false
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
          <Pick value={area} onChange={setArea} options={areas.map((a) => ({ value: a, label: a }))} noneLabel="Anywhere" testid="catalog-area" />
        </CardContent>
      </Card>
      {C.items.length === 0 ? <Empty>The catalog could not be loaded.</Empty>
        : items.length ? <div className="grid gap-4 @3xl/main:grid-cols-2" data-testid="catalog-grid">{items.map((i) => <OpportunityCard key={i.id} item={i} age={age} />)}</div>
        : <Empty>Nothing matches these filters.</Empty>}
      <SuggestCard />
      {C.note ? <p className="text-muted-foreground text-xs">{C.note}</p> : null}
    </div>
  )
}
