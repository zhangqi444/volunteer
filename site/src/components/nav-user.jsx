import * as React from "react"
import { Cloud, CloudOff, ExternalLink, HardDrive, LogOut, MonitorSmartphone, Moon, MoreVertical, RefreshCw, Sun } from "lucide-react"

import { DRIVE_ENABLED, useStore } from "@/lib/store"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"

export const STATUS_LABEL = {
  local: "Not signed in",
  connecting: "Connecting to Google…",
  syncing: "Syncing with Drive…",
  live: "Saved to Google Drive",
  expired: "Drive session expired — reconnect",
  error: "Drive sync failed",
  unavailable: "Drive unavailable here",
}

function Who({ name, picture, status }) {
  return (
    <>
      <Avatar className="h-8 w-8 rounded-lg">
        {picture ? <AvatarImage src={picture} alt="" referrerPolicy="no-referrer" /> : null}
        <AvatarFallback className="rounded-lg bg-primary/15 text-primary font-semibold">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="text-muted-foreground truncate text-xs">{STATUS_LABEL[status]}</span>
      </div>
    </>
  )
}

export function NavUser() {
  const store = useStore()
  const { isMobile } = useSidebar()
  const status = DRIVE_ENABLED ? store.status : "local"
  const live = status === "live" || status === "syncing"
  const name = (live || status === "expired") && (store.name || store.email) ? (store.name || store.email) : "Volunteer"
  const theme = store.s.theme || "system"
  const busy = status === "connecting" || status === "syncing"
  const link = store.fileLink()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" data-testid="nav-user">
              <Who name={name} picture={live ? store.picture : ""} status={status} />
              <MoreVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm"><Who name={name} picture={live ? store.picture : ""} status={status} /></div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {DRIVE_ENABLED ? (
                live ? (
                  <>
                    <DropdownMenuItem onSelect={() => store.push().catch(() => store.setStatus("error"))}><RefreshCw /> Sync now</DropdownMenuItem>
                    {link ? <DropdownMenuItem onSelect={() => window.open(link, "_blank", "noopener")}><ExternalLink /> Open file in Drive</DropdownMenuItem> : null}
                    <DropdownMenuItem onSelect={() => store.signOut()}><LogOut /> Sign out</DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onSelect={() => store.signIn()} disabled={busy}>
                    {status === "error" ? <CloudOff /> : <Cloud />}
                    {status === "error" ? "Retry Google Drive" : status === "expired" ? "Reconnect Google Drive" : "Sign in with Google"}
                  </DropdownMenuItem>
                )
              ) : (
                <DropdownMenuItem disabled><HardDrive /> Drive is not configured</DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs">Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => store.setTheme(v === "system" ? undefined : v)}>
              <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><MonitorSmartphone /> System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
