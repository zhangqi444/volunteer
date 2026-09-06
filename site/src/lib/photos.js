/* Photos on an entry: shrunk in the browser, stored in the volunteer's Drive next to
 * the data file (drive.file scope), shown from a session-cached object URL. */
import * as Drive from "./drive"
import { Store } from "./store"

const MAX_EDGE = 1600

/** Downscale to MAX_EDGE on the long side and re-encode as JPEG; falls back to the original when the browser cannot decode it. */
export async function shrink(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85))
    return blob || file
  } catch { return file }
}

export async function attachPhoto(entryId, file) {
  const entry = Store.entry(entryId)
  if (!entry) throw new Error("That entry no longer exists.")
  if (!Drive.isSignedIn()) throw new Error("Sign in to Google to store photos.")
  const blob = await shrink(file)
  const name = `volunteer-photo-${entry.date}-${Math.random().toString(36).slice(2, 7)}.jpg`
  const up = await Drive.uploadFile(blob, name, { entryId })
  Store.addPhoto(entryId, up)
  return up
}
export const photoUrl = (id) => Drive.fileUrl(id)
export const photoCount = () => Store.s.entries.reduce((n, e) => n + e.photos.length, 0)
