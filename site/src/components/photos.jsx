/* Photo strip for an entry: thumbnails from Drive, add from camera or library, remove. */
import * as React from "react"
import { Camera, Loader2, X } from "lucide-react"

import { attachPhoto, photoUrl } from "@/lib/photos"
import { Store, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast"
import { Button } from "@/components/ui/button"

export function Photo({ id, alt, className, onClick }) {
  const [url, setUrl] = React.useState(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => { let live = true; photoUrl(id).then((u) => { if (live) setUrl(u) }).catch(() => { if (live) setFailed(true) }); return () => { live = false } }, [id])
  if (failed) return <div className={cn("bg-muted text-muted-foreground flex items-center justify-center rounded-md text-xs", className)}>offline</div>
  if (!url) return <div className={cn("bg-muted animate-pulse rounded-md", className)} />
  return <img src={url} alt={alt || ""} className={cn("rounded-md object-cover", className)} onClick={onClick} data-testid="photo" />
}

export function PhotoStrip({ entryId, compact = false }) {
  useStore()
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)
  const input = React.useRef()
  const entry = Store.entry(entryId)
  if (!entry) return null
  async function add(ev) {
    const files = [...ev.target.files]; ev.target.value = ""
    if (!files.length) return
    setBusy(true)
    try { for (const f of files) await attachPhoto(entryId, f); toast(files.length === 1 ? "Photo saved to Drive" : `${files.length} photos saved to Drive`) }
    catch (e) { toast(e.message || "Could not save the photo.", { error: true }) }
    finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="photo-strip">
      {entry.photos.map((p) => (
        <div key={p.id} className="group relative">
          <Photo id={p.id} alt={p.name} className={compact ? "size-14" : "size-20"} />
          <button type="button" aria-label="Remove photo" onClick={() => { Store.removePhoto(entryId, p.id); toast("Photo removed") }}
            className="bg-background/90 text-foreground absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border shadow-sm group-hover:flex group-focus-within:flex" data-testid="photo-remove"><X className="size-3" /></button>
        </div>
      ))}
      <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => input.current.click()} disabled={busy} data-testid="photo-add">
        {busy ? <Loader2 className="animate-spin" /> : <Camera />} {entry.photos.length ? "Add" : "Add a photo"}
      </Button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={add} data-testid="photo-input" />
    </div>
  )
}
