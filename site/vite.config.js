import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const oauth = JSON.parse(fs.readFileSync(path.join(ROOT, 'oauth.json'), 'utf8'))

/** Wires the Drive/OAuth config into the page: the public client id from
 *  oauth.json, the Google Identity script, and the PWA manifest + worker. */
function volunteerTarget() {
  return {
    name: 'volunteer-target',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: 'window.__ENABLE_DRIVE__=true;window.__OAUTH_CLIENT_ID__=' + JSON.stringify(oauth.client_id) + ';',
          injectTo: 'head',
        },
        { tag: 'script', attrs: { src: 'https://accounts.google.com/gsi/client', async: true }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'manifest', href: 'manifest.webmanifest' }, injectTo: 'head' },
        {
          tag: 'script',
          children: 'if("serviceWorker" in navigator)addEventListener("load",function(){navigator.serviceWorker.register("sw.js")});',
          injectTo: 'body',
        },
      ]
    },
  }
}

export default defineConfig({
  root: ROOT,
  base: './',
  resolve: { alias: { '@': path.join(ROOT, 'src') } },
  plugins: [react(), tailwindcss(), volunteerTarget()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, reportCompressedSize: true },
})
