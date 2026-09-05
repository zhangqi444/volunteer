/* The catalog: opportunities from content/catalog.json, built into public/content/bundle.json
 * by make_bundle.py and fetched once at boot. Nothing here is the volunteer's data. */
import { Store } from "./store"

export const C = { schema: 0, note: "", organizations: {}, items: [] }
export const KIND_LABEL = { "at-home": "At home", drive: "Donation drive", "on-site": "On site", program: "Program", event: "Event" }

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

/** How an item fits the volunteer: fits | adult | later | unknown, with a short label. */
export function fit(item, age = currentAge()) {
  const a = item.ages || {}
  if (age == null) return { key: "unknown", label: a.note || "Age not stated" }
  if (a.min != null && age < a.min) return { key: "later", label: `From age ${a.min}` }
  if (a.max != null && age > a.max) return { key: "past", label: `Up to age ${a.max}` }
  if (a.withAdult) return { key: "adult", label: "With an adult" }
  if (a.min == null && a.max == null) return { key: "unknown", label: "Age not stated" }
  return { key: "fits", label: "Fits now" }
}
