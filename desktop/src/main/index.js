import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import { API_BASE_URL, getHealth } from './api.js'
import { createIndicatorWindow } from './indicator.js'
import { installPermissionHandlers } from './permissions.js'
import { isAppUrl } from './security.js'
import { createTray } from './tray.js'

// Launch with --self-check to load everything, call the backend once, print the result and quit.
// Used by tests/integration to check development and packaged builds the same way.
const selfCheck = process.argv.includes('--self-check')

const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(path.join(import.meta.dirname, '../renderer/index.html')).href
const iconDir = app.isPackaged ? process.resourcesPath : path.join(import.meta.dirname, '../../build')

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// No window may open new windows, navigate away from the app's page, or embed web views.
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (navigation) => {
    if (!isAppUrl(navigation.url, rendererUrl)) navigation.preventDefault()
  })
  contents.on('will-attach-webview', (attach) => attach.preventDefault())
})

// A menu bar app keeps running with no windows open; it quits from the tray menu.
app.on('window-all-closed', () => {})

async function checkServer() {
  try {
    const health = await getHealth()
    return { state: health.openaiConfigured === false ? 'unconfigured' : 'ready', health }
  } catch (err) {
    return { state: 'unreachable', error: err.message }
  }
}

async function runSelfCheck(indicator) {
  await new Promise((resolve) => {
    if (!indicator.webContents.isLoading()) resolve()
    else indicator.webContents.once('did-finish-load', resolve)
  })
  const renderer = await indicator.webContents.executeJavaScript(`({
    indicator: Boolean(document.querySelector('[data-indicator]')),
    bridge: typeof window.dictator === 'object',
    node: typeof require !== 'undefined' || typeof process !== 'undefined',
  })`)
  const server = await checkServer()
  const result = {
    apiBaseUrl: API_BASE_URL,
    packaged: app.isPackaged,
    visible: indicator.isVisible(),
    renderer,
    server: server.state,
    transcriptionModel: server.health?.transcriptionModel ?? null,
    error: server.error ?? null,
  }
  process.stdout.write(`DICTATOR_SELF_CHECK ${JSON.stringify(result)}\n`)
  app.exit(0)
}

app.whenReady().then(async () => {
  // No Dock icon or app switcher entry (LSUIElement does the same for the packaged app).
  app.dock?.hide()
  installPermissionHandlers(rendererUrl)
  const indicator = createIndicatorWindow()

  if (selfCheck) return runSelfCheck(indicator)

  const tray = createTray({ iconDir })
  // Checking early also wakes the backend, which sleeps when idle on Render's free plan.
  const { state } = await checkServer()
  tray.setServerState(state)
})
