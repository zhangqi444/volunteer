/* Hash router: works on GitHub Pages under a project subpath and inside the artifact. */
import { useEffect, useState } from "react"

const parse = () => (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean)

export function useRoute() {
  const [parts, set] = useState(parse)
  useEffect(() => {
    const on = () => { set(parse()); window.scrollTo(0, 0) }
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])
  return parts
}
export function go(path) { location.hash = path }
export function href(path) { return "#" + path }
