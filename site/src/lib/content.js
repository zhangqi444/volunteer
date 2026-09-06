/* The catalog: opportunities from content/catalog.json, built into public/content/bundle.json
 * by make_bundle.py and fetched once at boot. Nothing here is the volunteer's data. */
import { Store } from "./store"
import { todayISO } from "./format"

export const C = { schema: 0, note: "", organizations: {}, items: [] }
export const KIND_LABEL = { "at-home": "At home", drive: "Donation drive", "on-site": "On site", program: "Program", event: "Event", remote: "Online" }

export async function loadCatalog() {
  try {
    const res = await fetch("content/bundle.json", { cache: "no-cache" })
    if (!res.ok) throw new Error(res.status)
    const j = await res.json()
    Object.assign(C, j)
  } catch (e) { console.warn("catalog unavailable", e) }
  return C
}

export const catalogItem = (id) => C.items.find((i) => i.id === id) || null
export const catalogArea = (item) => (catalogOrg(item) || {}).area || ""

/** A first email to an organization, in the parent's voice, with the facts from the catalog filled in. */
export function introEmail(item) {
  const org = catalogOrg(item)
  const to = (org.contact && org.contact.email ? org.contact.email : "").split("·")[0].trim()
  const p = Store.s.settings.profile || {}
  const who = p.name || "my child"
  const age = currentAge()
  const body = [
    `Hello,`,
    ``,
    `I am writing about "${item.title}"${org.name ? ` at ${org.name}` : ""}, which we found on your website (${item.url}).`,
    ``,
    `${who}${age != null ? `, who is ${age},` : ""} would love to help, and I would be there alongside ${who === "my child" ? "them" : "her"}. Could you tell us how to start, whether there is anything to fill in first, and when you next need people?`,
    ``,
    `Thank you,`,
  ].join("\n")
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Volunteering: ${item.title}`)}&body=${encodeURIComponent(body)}`
}
export const hasEmail = (item) => Boolean((catalogOrg(item).contact || {}).email)

/** Marked "applied" and quiet for a while: worth a nudge. */
export function staleApplications(days = 14) {
  const cut = Date.now() - days * 86400e3
  return Object.entries(Store.s.interests)
    .filter(([id, v]) => v.status === "applied" && Date.parse(v.since || v.at) < cut && catalogItem(id))
    .map(([id, v]) => ({ item: catalogItem(id), since: v.since || v.at }))
    .sort((a, b) => a.since.localeCompare(b.since))
}

/** Adopt a catalog item: make sure its organization and a work item exist (created from the
 *  catalog's own facts on first use, linked by catalogOrgId / catalogId) so logging is one step. */
export function ensureFromCatalog(itemId) {
  const item = catalogItem(itemId)
  if (!item) return null
  const co = catalogOrg(item)
  let org = Store.s.organizations.find((o) => o.catalogOrgId === item.org) || Store.s.organizations.find((o) => o.name.toLowerCase() === co.name.toLowerCase())
  if (!org) {
    org = Store.addOrg({ name: co.name, website: co.url || "", contact: "", contactInfo: [co.contact && co.contact.email, co.contact && co.contact.phone].filter(Boolean).join(" · "), notes: [co.contact && co.contact.address, co.forms && co.forms.length ? `Forms: ${co.forms.map((f) => `${f.name} (${f.url})`).join("; ")}` : ""].filter(Boolean).join("\n"), catalogOrgId: item.org })
  } else if (!org.catalogOrgId) Store.updateOrg(org.id, { ...org, catalogOrgId: item.org })
  let wi = Store.s.workItems.find((w) => w.catalogId === item.id) || Store.s.workItems.find((w) => w.orgId === org.id && w.title.toLowerCase() === item.title.toLowerCase())
  if (!wi) wi = Store.addWorkItem({ orgId: org.id, title: item.title, description: item.summary, status: "active", startDate: todayISO(), targetHours: 0, catalogId: item.id })
  return { orgId: org.id, workItemId: wi.id, item }
}
export const workItemForCatalog = (itemId) => Store.s.workItems.find((w) => w.catalogId === itemId) || null
export const catalogOrg = (item) => (item && C.organizations[item.org]) || { name: "", url: "" }
export const catalogTags = () => [...new Set(C.items.flatMap((i) => i.tags || []))].sort()

/** The volunteer's age today, from the profile's age and the date it was recorded. */
export function currentAge() {
  const p = Store.s.settings.profile || {}
  if (!Number.isFinite(p.age) || !p.ageAsOf) return null
  const then = new Date(p.ageAsOf), now = new Date()
  let years = now.getFullYear() - then.getFullYear()
  if (now.getMonth() < then.getMonth() || (now.getMonth() === then.getMonth() && now.getDate() < then.getDate())) years--
  return p.age + Math.max(0, years)
}

/** How an item fits the volunteer: fits | adult | later | past | unknown, with a short label.
 *  Labels stay short (the long age note lives under Details); without a profile age the
 *  label still states the rule, so a badge never depends on who is looking. */
export function fit(item, age = currentAge()) {
  const a = item.ages || {}
  if (age != null && a.min != null && age < a.min) return { key: "later", label: `From age ${a.min}` }
  if (age != null && a.max != null && age > a.max) return { key: "past", label: `Up to age ${a.max}` }
  if (age == null && a.min != null) return { key: "unknown", label: `From age ${a.min}` }
  if (a.withAdult) return { key: "adult", label: "With an adult" }
  if (a.min == null && a.max == null) return { key: "unknown", label: "Age not stated" }
  return { key: "fits", label: "Fits now" }
}
