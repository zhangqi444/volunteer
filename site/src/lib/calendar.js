/* Getting plans out of the app and onto a real calendar: a Google Calendar
 * "add event" link per plan (no API, no extra scope), and iCalendar text for
 * one plan or for everything still planned. */
import { orgName, planHours, workItemTitle } from "./engine"

const pad = (n) => String(n).padStart(2, "0")
const compact = (iso, time) => iso.replace(/-/g, "") + (time ? `T${time.replace(":", "")}00` : "")

/** Start/end for a plan: its times when set, else a block sized from its hours (default 2 h) starting at 10:00. */
export function planWindow(p) {
  const hours = planHours(p) || 2
  const start = p.start || "10:00"
  let end = p.end
  if (!end) {
    const [h, m] = start.split(":").map(Number)
    const total = h * 60 + m + Math.round(hours * 60)
    end = `${pad(Math.min(23, Math.floor(total / 60)))}:${pad(total % 60)}`
  }
  return { start, end }
}
export function planDescription(p) {
  const bits = []
  if (p.orgId) bits.push(orgName(p.orgId))
  if (p.workItemId) bits.push(workItemTitle(p.workItemId))
  if (p.notes) bits.push(p.notes)
  bits.push("Planned in Volunteer Tracker.")
  return bits.join("\n")
}

export function googleCalendarUrl(p) {
  const { start, end } = planWindow(p)
  const q = new URLSearchParams({
    action: "TEMPLATE", text: p.title, dates: `${compact(p.date, start)}/${compact(p.date, end)}`,
    details: planDescription(p), location: p.orgId ? orgName(p.orgId) : "",
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
const stampNow = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** iCalendar text for a list of plans (floating local times, so they land at the right hour wherever the calendar lives). */
export function icsFor(plans, { name = "Volunteer Tracker" } = {}) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Volunteer Tracker//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`]
  for (const p of plans) {
    const { start, end } = planWindow(p)
    lines.push("BEGIN:VEVENT", `UID:${p.id}@volunteer-tracker`, `DTSTAMP:${stampNow()}`,
      `DTSTART:${compact(p.date, start)}`, `DTEND:${compact(p.date, end)}`,
      `SUMMARY:${esc(p.title)}`, `DESCRIPTION:${esc(planDescription(p))}`)
    if (p.orgId) lines.push(`LOCATION:${esc(orgName(p.orgId))}`)
    lines.push(`STATUS:${p.status === "skipped" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n") + "\r\n"
}
