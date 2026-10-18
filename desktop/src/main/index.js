import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, ipcMain, powerMonitor } from 'electron'
import { API_BASE_URL, getHealth } from './api.js'
import { createController } from './controller.js'
import { createIndicatorWindow, hideIndicator, showIndicator } from './indicator.js'
import { isTrustedSender, parseRecorderError, parseRecording } from './ipc.js'
import { RECORDER_MESSAGES } from './messages.js'
import { ensureMicrophoneAccess, openMicrophoneSettings } from './microphone.js'
import { installPermissionHandlers } from './permissions.js'
import { isAppUrl } from './security.js'
import { runRecordTest, runSelfCheck } from './selftest.js'
import { createTray } from './tray.js'

const selfCheck = process.argv.includes('--self-check')
const recordTestMs = Number(process.argv.find((arg) => arg.startsWith('--record-test='))?.split('=')[1]) || 0
// Tests run with Chromium's fake microphone, which needs no macOS permission.
const fakeDevice = app.commandLine.hasSwitch('use-fake-device-for-media-stream')

const rendererUrl = process.env.ELECTRON_RENDERER_URL || pathToFileURL(path.join(import.meta.dirname, '../renderer/index.html')).href
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

// Messages from the indicator window, checked before anything acts on them.
function listenToRenderer(indicator, handlers) {
  let markReady
  const events = { ready: new Promise((resolve) => (markReady = resolve)) }
  const on = (channel, handler) =>
    ipcMain.on(channel, (event, payload) => {
      if (isTrustedSender(event, indicator, rendererUrl)) handler(payload)
    })
  on('renderer:ready', () => markReady())
  on('recorder:started', () => (events.onStarted ?? handlers.started)())
  on('recorder:error', (code) => (events.onError ?? handlers.error)(parseRecorderError(code, Object.keys(RECORDER_MESSAGES))))
  on('recorder:recording', (payload) => {
    const { recording, error } = parseRecording(payload)
    if (error) return (events.onError ?? handlers.error)('recording-failed')
    ;(events.onRecording ?? handlers.recording)(recording)
  })
  return events
}

app.whenReady().then(async () => {
  // No Dock icon or app switcher entry (LSUIElement does the same for the packaged app).
  app.dock?.hide()
  installPermissionHandlers(rendererUrl)
  const indicator = createIndicatorWindow()
  const sendCommand = (command) => !indicator.isDestroyed() && indicator.webContents.send('recorder:command', command)
  const ensureAccess = () => ensureMicrophoneAccess({ fakeDevice })

  if (selfCheck) return runSelfCheck({ indicator, apiBaseUrl: API_BASE_URL, checkServer })

  let view = { version: app.getVersion(), phase: 'idle', serverState: 'checking' }
  let tray

  const controller = createController({
    recorder: {
      start: ({ measure }) => sendCommand({ type: 'start', measure }),
      stop: () => sendCommand({ type: 'stop' }),
      cancel: () => sendCommand({ type: 'cancel' }),
    },
    microphone: { ensureAccess },
    // D1: no backend yet. Report the recording so it can be checked by hand.
    transcribe: async (recording) => {
      throw new Error(`Recorded ${(recording.blob.size / 1024).toFixed(0)} KB (${recording.mimeType}). Transcription arrives in D2.`)
    },
    copy: () => false,
    getLevel: () => 'light',
    onChange: (state) => {
      view = { version: view.version, serverState: view.serverState, ...state, message: state.notice ?? state.message }
      if (!indicator.isDestroyed()) indicator.webContents.send('indicator:state', state)
      if (state.phase === 'idle' && !state.notice) hideIndicator(indicator)
      else showIndicator(indicator)
      tray?.render(view)
    },
  })

  const events = listenToRenderer(indicator, {
    started: () => controller.recorderStarted(),
    error: (code) => controller.recorderFailed(code),
    recording: (recording) => controller.recordingReady(recording),
  })

  if (recordTestMs) return runRecordTest({ indicator, durationMs: recordTestMs, ensureAccess, events, sendCommand })

  tray = createTray({
    iconDir,
    actions: {
      toggle: () => controller.toggle(),
      openMicrophoneSettings: () => openMicrophoneSettings(),
      quit: () => app.quit(),
    },
  })
  tray.render(view)

  // Keep what was said when the Mac sleeps or locks mid-recording.
  powerMonitor.on('suspend', () => controller.interrupt())
  powerMonitor.on('lock-screen', () => controller.interrupt())
  // Checking early also wakes the backend, which sleeps when idle on Render's free plan.
  const refreshServer = async () => {
    view = { ...view, serverState: (await checkServer()).state }
    tray.render(view)
  }
  powerMonitor.on('resume', refreshServer)
  refreshServer()
})
