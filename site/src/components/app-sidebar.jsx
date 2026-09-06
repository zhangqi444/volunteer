import * as React from "react"
import { Award, BookOpen, Building2, CalendarDays, ClipboardList, Clock, FileText, HeartHandshake, LayoutDashboard, Plus, Settings as SettingsIcon } from "lucide-react"

import { activeWorkItems, upcomingPlans } from "@/lib/engine"
import { todayISO } from "@/lib/format"
import { recentBadges } from "@/lib/rewards"
import { go } from "@/lib/router"
import { useStore } from "@/lib/store"
import { useDialogs } from "@/components/dialogs"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/nav-user"

/** Navigates and closes the drawer on phones. */
function useNav() {
  const { isMobile, setOpenMobile } = useSidebar()
  return (path) => { go(path); if (isMobile) setOpenMobile(false) }
}

const NAV = [
  { path: "/", top: "", label: "Dashboard", icon: LayoutDashboard },
  { path: "/calendar", top: "calendar", label: "Calendar", icon: CalendarDays },
  { path: "/catalog", top: "catalog", label: "Catalog", icon: BookOpen },
  { path: "/work", top: "work", label: "Work items", icon: ClipboardList },
  { path: "/log", top: "log", label: "Hours log", icon: Clock },
  { path: "/rewards", top: "rewards", label: "Rewards", icon: Award },
  { path: "/orgs", top: "orgs", label: "Organizations", icon: Building2 },
  { path: "/reports", top: "reports", label: "Reports", icon: FileText },
  { path: "/settings", top: "settings", label: "Settings", icon: SettingsIcon },
]

export function AppSidebar({ route, ...props }) {
  useStore()
  const nav = useNav()
  const { isMobile, setOpenMobile } = useSidebar()
  const { openEntry } = useDialogs()
  const top = route[0] || ""
  const active = activeWorkItems().length
  const planned = upcomingPlans(todayISO(), 99).length
  const fresh = recentBadges(3).length

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <a href="#/" onClick={(e) => { e.preventDefault(); nav("/") }}>
                <HeartHandshake className="!size-5 text-primary" />
                <span className="text-base font-semibold tracking-tight">Volunteer Tracker</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Log hours"
                  onClick={() => { if (isMobile) setOpenMobile(false); openEntry() }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
                  data-testid="log-hours"
                >
                  <Plus className="shrink-0" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="font-medium">Log hours</span>
                    <span className="truncate text-xs opacity-80">a shift, an event, a task</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.path}>
                  <SidebarMenuButton tooltip={n.label} isActive={top === n.top} onClick={() => nav(n.path)}>
                    <n.icon />
                    <span>{n.label}</span>
                  </SidebarMenuButton>
                  {n.top === "work" && active ? <SidebarMenuBadge className="text-muted-foreground">{active}</SidebarMenuBadge> : null}
                  {n.top === "calendar" && planned ? <SidebarMenuBadge className="text-muted-foreground">{planned}</SidebarMenuBadge> : null}
                  {n.top === "rewards" && fresh ? <SidebarMenuBadge className="pointer-events-none" data-testid="rewards-new"><span className="bg-primary size-2 rounded-full" title={`${fresh} new badge${fresh === 1 ? "" : "s"}`} /></SidebarMenuBadge> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
