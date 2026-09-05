import * as React from "react"

import { useRoute } from "@/lib/router"
import { useStore } from "@/lib/store"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { DialogsProvider } from "@/components/dialogs"
import { ToastProvider } from "@/components/toast"
import { Home } from "@/pages/home"
import { WorkDetail, WorkList } from "@/pages/work"
import { Log } from "@/pages/log"
import { Orgs } from "@/pages/orgs"
import { Reports } from "@/pages/reports"
import { Settings } from "@/pages/settings"

function Screen({ route }) {
  const [top, a] = route
  if (top === "work" && a) return <WorkDetail key={a} id={a} />
  if (top === "work") return <WorkList />
  if (top === "log") return <Log />
  if (top === "orgs") return <Orgs />
  if (top === "reports") return <Reports />
  if (top === "settings") return <Settings />
  return <Home />
}

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) { console.error(err) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col gap-3 rounded-xl border bg-card p-6 text-center shadow-sm">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">{String((this.state.err && this.state.err.message) || this.state.err)}</p>
        <div className="flex justify-center gap-2">
          <button className="rounded-md border px-3 py-1.5 text-sm" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const route = useRoute()
  useStore()
  return (
    <ToastProvider>
      <DialogsProvider>
        <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 64)", "--header-height": "calc(var(--spacing) * 12)" }}>
          <AppSidebar variant="inset" route={route} />
          <SidebarInset>
            <SiteHeader route={route} />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-1 flex-col p-4 md:p-6">
                  <ErrorBoundary key={route.join("/")}><Screen route={route} /></ErrorBoundary>
                </div>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </DialogsProvider>
    </ToastProvider>
  )
}
