import * as React from "react"
import { Check, HeartHandshake, Loader2, Moon, Sun } from "lucide-react"

import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** The gate: nothing in the app is reachable until Google has signed the volunteer in. */
export function SignIn() {
  const store = useStore()
  const busy = store.status === "connecting" || store.status === "syncing"
  const unavailable = store.status === "unavailable"
  return (
    <main className="from-accent/60 to-background flex min-h-svh items-center justify-center bg-gradient-to-br px-4 py-10" data-testid="signin">
      <div className="bg-card text-card-foreground w-full max-w-md rounded-2xl border p-8 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight"><HeartHandshake className="text-primary size-7" /> Volunteer Tracker</div>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => store.setTheme(store.dark ? "light" : "dark")} aria-label="Toggle theme">{store.dark ? <Sun /> : <Moon />}</Button>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Keep every hour you give.</h1>
        <p className="text-muted-foreground mt-2 text-sm">Log shifts, track hours per organization and work item, keep memos, and print reports for school, work, or awards.</p>
        <ul className="text-muted-foreground mt-5 flex flex-col gap-2 text-sm">
          {["Your data is a JSON file in your own Google Drive. Nothing is stored on a server.", "Access to Drive is limited to the one file this app creates.", "Works on any device you sign in from, and offline once signed in."].map((t) => (
            <li key={t} className="flex gap-2"><Check className="text-primary mt-0.5 size-4 shrink-0" /><span>{t}</span></li>
          ))}
        </ul>
        <Button variant="outline" size="lg" className="mt-6 w-full gap-3" disabled={!store.ready || busy || unavailable} onClick={() => store.signIn()} data-testid="signin-button">
          {busy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
          {store.status === "connecting" ? "Waiting for Google…" : store.status === "syncing" ? "Loading your data…" : !store.ready && !unavailable ? "Loading Google Sign-In…" : "Sign in with Google"}
        </Button>
        {(store.status === "error" || unavailable) && store.lastError ? <p role="alert" className="text-destructive mt-3 text-sm" data-testid="signin-error">{store.lastError}</p> : null}
        <p className="text-muted-foreground mt-4 text-center text-xs">Signing in opens a Google window asking permission to see your profile and to manage files this app creates in Drive.</p>
      </div>
    </main>
  )
}
