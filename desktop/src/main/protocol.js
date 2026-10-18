import fs from 'node:fs/promises'
import path from 'node:path'
import { protocol } from 'electron'

// The app page is served from app://dictator/ instead of file://, so file:// pages need no
// extra privileges (the GrantFileProtocolExtraPrivileges fuse is off) and the page has a real,
// secure origin of its own.
export const APP_SCHEME = 'app'
export const APP_HOST = 'dictator'
export const APP_URL = `${APP_SCHEME}://${APP_HOST}/index.html`

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

/** The file under root that an app:// path names, or null when it would leave root. */
export function resolveInside(root, pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const relative = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^\/+/, '')
  const file = path.resolve(root, relative)
  return file.startsWith(path.resolve(root) + path.sep) ? file : null
}

// Must run before the app is ready.
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

/** Serves the built renderer folder at app://dictator/. Anything else is a 404. */
export function serveRenderer(root) {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    const file = url.host === APP_HOST ? resolveInside(root, url.pathname) : null
    const type = file && TYPES[path.extname(file)]
    if (!type) return new Response('Not found', { status: 404 })
    try {
      return new Response(await fs.readFile(file), { headers: { 'Content-Type': type } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
