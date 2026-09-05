import * as React from "react"
import { Cloud, CloudOff, Home as HomeIcon, Loader2, Moon, Sun } from "lucide-react"

import { workItemById } from "@/lib/engine"
import { go } from "@/lib/router"
import { DRIVE_ENABLED, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { STATUS_LABEL } from "@/components/nav-user"

const LABEL = { work: "Work items", log: "Hours log", orgs: "Organizations", reports: "Reports", settings: "Settings" }

/** Breadcrumb trail for the current hash route: every crumb is a real link, so there is always a way out. */
function crumbs(route) {
  const [top, a] = route
  const out = [{ label: "Dashboard", path: "/" }]
  if (LABEL[top]) out.push({ label: LABEL[top], path: "/" + top })
  if (top === "work" && a) { const w = workItemById(a); out.push({ label: w ? w.title : "Work item", path: `/work/${a}` }) }
  return out
}

export function SiteHeader({ route }) {
  const store = useStore()
  const trail = crumbs(route)
  const status = DRIVE_ENABLED ? store.status : null
  const isDark = store.dark
  const busy = status === "connecting" || status === "syncing"
  const act = () => (status === "live" ? store.signOut() : store.signIn())
  const icon = busy ? <Loader2 className="animate-spin" /> : status === "error" ? <CloudOff className="text-destructive" /> : <Cloud className={cn(status === "live" && "text-success", status === "expired" && "text-warning")} />

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b backdrop-blur print:hidden">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {trail.map((cr, i) => {
              const last = i === trail.length - 1
              const hideOnMobile = trail.length > 2 && i < trail.length - 2
              const nav = (e) => { e.preventDefault(); go(cr.path) }
              return (
                <React.Fragment key={cr.path}>
                  {i > 0 && <BreadcrumbSeparator className={cn(hideOnMobile && i > 1 && "hidden md:block")} />}
                  {i === 0 && hideOnMobile && (
                    <BreadcrumbItem className="md:hidden">
                      <BreadcrumbLink href="#/" onClick={nav} aria-label="Dashboard" data-testid="crumb-home"><HomeIcon className="size-4" /></BreadcrumbLink>
                    </BreadcrumbItem>
                  )}
                  <BreadcrumbItem className={cn(hideOnMobile && "hidden md:inline-flex")}>
                    {last ? <BreadcrumbPage className="max-w-[40vw] truncate font-medium">{cr.label}</BreadcrumbPage> : <BreadcrumbLink href={"#" + cr.path} onClick={nav}>{cr.label}</BreadcrumbLink>}
                  </BreadcrumbItem>
                </React.Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-1.5">
          {status && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={status === "live" ? "secondary" : "outline"} size="sm" className="hidden gap-2 sm:inline-flex" disabled={busy} onClick={act} data-testid="drive-button">
                  {icon}
                  {status === "live" ? "Saved to Drive" : status === "connecting" ? "Connecting…" : status === "syncing" ? "Syncing…" : status === "error" ? "Retry Drive" : status === "expired" ? "Reconnect Drive" : status === "unavailable" ? "Drive unavailable" : "Save to Drive"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {status === "live"
                  ? `Your data is mirrored to volunteer-tracker-data.json in your Google Drive${store.email ? " (" + store.email + ")" : ""}. Click to disconnect.`
                  : status === "error" ? (store.lastError || "Google Drive could not be reached.")
                  : status === "expired" ? "Google sign-ins last an hour. Click to reconnect; no consent screen this time, and everything on this device is safe meanwhile."
                  : status === "unavailable" ? (store.lastError || "Google Sign-In did not load.")
                  : "Sign in with Google to keep a copy of your data in a file this app creates in your Drive."}
              </TooltipContent>
            </Tooltip>
          )}
          {status && (
            <Button variant="ghost" size="icon" className="size-8 sm:hidden" aria-label={STATUS_LABEL[status]} disabled={busy} onClick={act}>{icon}</Button>
          )}
          <Button variant="ghost" size="icon" className="size-8" onClick={() => store.setTheme(isDark ? "light" : "dark")} aria-label="Toggle theme" data-testid="theme-toggle">
            {isDark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </div>
    </header>
  )
}
