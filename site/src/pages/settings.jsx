import * as React from "react"
import { Cloud, Download, ExternalLink, LogOut, RefreshCw, Upload } from "lucide-react"

import { normalize, sampleData, emptyData, downloadFile } from "@/lib/model"
import { todayISO } from "@/lib/format"
import { DRIVE_ENABLED, Store, useStore } from "@/lib/store"
import { useDialogs } from "@/components/dialogs"
import { useToast } from "@/components/toast"
import { Field, PageHeader } from "@/components/bits"
import { STATUS_LABEL } from "@/components/nav-user"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function Settings() {
  const store = useStore()
  const toast = useToast()
  const { confirm } = useDialogs()
  const [goal, setGoal] = React.useState(String(store.s.goals.yearly))
  const [cats, setCats] = React.useState(store.s.settings.categories.join("\n"))
  const fileRef = React.useRef()
  const theme = store.s.theme || "system"
  const status = DRIVE_ENABLED ? store.status : "unavailable"
  const live = status === "live" || status === "syncing"

  async function importFile(ev) {
    const file = ev.target.files[0]; ev.target.value = ""
    if (!file) return
    try {
      const incoming = normalize(JSON.parse(await file.text()))
      const ok = await confirm({ title: "Replace your data?", message: `The backup has ${incoming.entries.length} entries, ${incoming.workItems.length} work items and ${incoming.organizations.length} organizations. It replaces everything here and in Google Drive.`, okLabel: "Import" })
      if (!ok) return
      Store.replaceAll(incoming); setGoal(String(Store.s.goals.yearly)); setCats(Store.s.settings.categories.join("\n")); toast("Backup imported")
    } catch (e) { toast(e.message || "Could not read that file.", { error: true }) }
  }
  async function loadSample() {
    if (store.s.entries.length || store.s.organizations.length) {
      if (!(await confirm({ title: "Load sample data?", message: "This replaces your current entries, work items and organizations with sample data.", okLabel: "Replace" }))) return
    }
    Store.replaceAll(sampleData()); setGoal(String(Store.s.goals.yearly)); toast("Sample data loaded")
  }
  async function clearAll() {
    if (!(await confirm({ title: "Delete all data?", message: "Every entry, work item, memo and organization is removed, here and from the file in your Google Drive. Export a backup first if you might want it later." }))) return
    Store.replaceAll(emptyData()); toast("All data deleted")
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Goal, categories, appearance, and your data." />
      <div className="grid gap-4 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Yearly goal</CardTitle><CardDescription>Progress shows on the dashboard for the current calendar year.</CardDescription></CardHeader>
          <CardContent>
            <Field label="Hours per year">
              <Input type="number" min="0" step="1" value={goal} onChange={(e) => setGoal(e.target.value)} onBlur={() => { if (Number(goal) !== store.s.goals.yearly) { Store.setGoal(goal); toast("Goal updated") } }} data-testid="setting-goal" className="max-w-40" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Dark mode is its own theme, not an inversion.</CardDescription></CardHeader>
          <CardContent>
            <RadioGroup value={theme} onValueChange={(v) => store.setTheme(v === "system" ? undefined : v)} className="flex flex-wrap gap-4" data-testid="setting-theme">
              {[["system", "Match system"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => (
                <div key={v} className="flex items-center gap-2"><RadioGroupItem value={v} id={`theme-${v}`} /><Label htmlFor={`theme-${v}`}>{l}</Label></div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Categories</CardTitle><CardDescription>One per line. Offered when logging hours.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea rows={6} value={cats} onChange={(e) => setCats(e.target.value)} data-testid="setting-categories" />
            <Button variant="secondary" className="self-start" onClick={() => { Store.setCategories(cats.split("\n")); setCats(Store.s.settings.categories.join("\n")); toast("Categories saved") }}>Save categories</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google Drive</CardTitle>
            <CardDescription>{STATUS_LABEL[status]}{live && store.email ? ` · ${store.email}` : ""}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">Your data is saved in this browser first. Sign in with Google to keep a copy in <code>volunteer-tracker-data.json</code> in your Drive, so it follows you to other devices. The app only sees the one file it creates.</p>
            <div className="flex flex-wrap gap-2">
              {DRIVE_ENABLED && !live ? <Button onClick={() => store.signIn()} disabled={status === "connecting"} data-testid="settings-signin"><Cloud /> {status === "expired" ? "Reconnect Google Drive" : "Save to Google Drive"}</Button> : null}
              {live ? <Button variant="secondary" onClick={() => store.push().then(() => toast("Saved to Drive")).catch((e) => toast(e.message, { error: true }))} data-testid="sync-now"><RefreshCw /> Sync now</Button> : null}
              {live && store.fileLink() ? <Button variant="outline" asChild><a href={store.fileLink()} target="_blank" rel="noopener"><ExternalLink /> Open file in Drive</a></Button> : null}
              {live ? <Button variant="ghost" onClick={() => store.signOut()}><LogOut /> Disconnect</Button> : null}
            </div>
            {status === "error" && store.lastError ? <p className="text-destructive text-xs">{store.lastError}</p> : null}
          </CardContent>
        </Card>

        <Card className="@3xl/main:col-span-2">
          <CardHeader><CardTitle>Your data</CardTitle><CardDescription>Backups, sample data, and a clean slate.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => downloadFile(`volunteer-tracker-backup-${todayISO()}.json`, JSON.stringify(Store.payload(), null, 2), "application/json")} data-testid="data-export"><Download /> Export backup (JSON)</Button>
            <Button variant="secondary" onClick={() => fileRef.current.click()} data-testid="data-import"><Upload /> Import backup</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} data-testid="data-import-input" />
            <Button variant="secondary" onClick={loadSample} data-testid="data-sample">Load sample data</Button>
            <Button variant="destructive" className="ml-auto" onClick={clearAll} data-testid="data-clear">Delete all data</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
