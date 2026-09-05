import React from "react"
import ReactDOM from "react-dom/client"

import "./index.css"
import App from "./App"
import { Store } from "./lib/store"
import { loadCatalog } from "./lib/content"

/* Theme: saved choice > host's data-theme > OS. */
function applyTheme() {
  const pref = Store.s && Store.s.theme
  const host = document.documentElement.getAttribute("data-theme")
  const sys = matchMedia("(prefers-color-scheme: dark)").matches
  const dark = pref ? pref === "dark" : host ? host === "dark" : sys
  document.documentElement.classList.toggle("dark", dark)
  Store.setDark(dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", dark ? "#101614" : "#0F7A6B")
}

Store.init()
applyTheme()
Store.subscribe(applyTheme)
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme)
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })

loadCatalog().then(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
