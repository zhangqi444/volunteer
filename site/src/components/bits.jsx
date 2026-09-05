/* Small shared pieces: org chip, status badge, stat tile, empty state, page header, a Select that allows "none". */
import * as React from "react"
import { cn } from "@/lib/utils"
import { orgColor, orgName } from "@/lib/engine"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function OrgChip({ orgId, className }) {
  return (
    <span className={cn("bg-secondary text-secondary-foreground inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-xs font-medium", className)} data-testid="org-chip">
      <span className="size-2 shrink-0 rounded-full" style={{ background: orgColor(orgId) }} />
      <span className="truncate">{orgName(orgId)}</span>
    </span>
  )
}

export function StatusBadge({ status, className }) {
  const v = status === "active" ? "default" : status === "paused" ? "warning" : "secondary"
  return <Badge variant={v} className={cn("capitalize", className)} data-testid="status">{status}</Badge>
}

export function Stat({ label, value, sub, testid }) {
  return (
    <Card className="@container/card gap-1 py-4" data-testid={testid}>
      <CardHeader className="gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
      </CardHeader>
    </Card>
  )
}

export function Empty({ children, action, className }) {
  return (
    <div className={cn("text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center text-sm", className)}>
      <div>{children}</div>
      {action}
    </div>
  )
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

const NONE = "__none__"
/** Select with an optional "none" choice (Radix forbids an empty-string item value). */
export function Pick({ value, onChange, options, placeholder = "Choose…", noneLabel = null, className, disabled, testid, size }) {
  return (
    <Select value={value ? value : noneLabel !== null ? NONE : undefined} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)} data-testid={testid} size={size}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {noneLabel !== null && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function Field({ label, children, hint, className, required }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="text-muted-foreground font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  )
}
