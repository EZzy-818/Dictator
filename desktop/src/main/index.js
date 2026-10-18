import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { app, clipboard, ipcMain, powerMonitor } from 'electron'
import { REFINEMENT_LEVEL_OPTIONS } from '@frontend/refinementLevels.js'
import { API_BASE_URL, getHealth, processAudio } from './api.js'
import { createCopy } from './clipboard.js'
import { createController } from './controller.js'
import { createIndicatorWindow, hideIndicator, showIndicator } from './indicator.js'
import { isTrustedSender, parseRecorderError, parseRecording } from './ipc.js'
import { RECORDER_MESSAGES } from './messages.js'
import { ensureMicrophoneAccess, openMicrophoneSettings } from './microphone.js'
import { installPermissionHandlers } from './permissions.js'
import { isAppUrl } from './security.js'
import { runRecordTest, runSelfCheck, runTranscribeTest } from './selftest.js'
import { createSettings } from './settings.js'
import { createTray } from './tray.js'

const selfCheck = process.argv.includes('--self-check')
const argValue = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const recordTestMs = Number(argValue('record-test')) || 0
const transcribeTestFile = argValue('transcribe-test')
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

  const settings = createSettings(path.join(app.getPath('userData'), 'settings.json'), {
    defaults: { hotkey: 'Control+Alt+Space' },
  })
  // The same request the web app makes: batch transcription, then refinement at the chosen level.
  const transcribe = (recording, level) => processAudio(recording, level)
  const copy = createCopy(clipboard)

  if (transcribeTestFile) {
    const level = argValue('level') ?? settings.get().refinementLevel
    return runTranscribeTest({ file: transcribeTestFile, level, transcribe, copy, clipboard, createController, fileSystem: fs })
  }

  let view = {
    version: app.getVersion(),
    phase: 'idle',
    serverState: 'checking',
    levels: REFINEMENT_LEVEL_OPTIONS,
    level: settings.get().refinementLevel,
    hasLastTranscript: false,
  }
  let tray
  let controller
  const renderView = (patch) => {
    view = { ...view, ...patch }
    tray?.render(view)
  }

  controller = createController({
    recorder: {
      start: ({ measure }) => sendCommand({ type: 'start', measure }),
      stop: () => sendCommand({ type: 'stop' }),
      cancel: () => sendCommand({ type: 'cancel' }),
    },
    microphone: { ensureAccess },
    transcribe,
    copy,
    getLevel: () => settings.get().refinementLevel,
    onChange: (state) => {
      if (!indicator.isDestroyed()) indicator.webContents.send('indicator:state', state)
      if (state.phase === 'idle' && !state.notice) hideIndicator(indicator)
      else showIndicator(indicator)
      renderView({
        phase: state.phase,
        outcome: state.outcome,
        code: state.code,
        message: state.notice ?? state.message,
        hasLastTranscript: Boolean(controller?.getLastTranscript()),
      })
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
      setLevel: (level) => renderView({ level: settings.set({ refinementLevel: level }).refinementLevel }),
      copyLast: () => controller.copyLast(),
      openMicrophoneSettings: () => openMicrophoneSettings(),
      quit: () => app.quit(),
    },
  })
  tray.render(view)

  // Keep what was said when the Mac sleeps or locks mid-recording.
  powerMonitor.on('suspend', () => controller.interrupt())
  powerMonitor.on('lock-screen', () => controller.interrupt())
  // Checking early also wakes the backend, which sleeps when idle on Render's free plan.
  const refreshServer = async () => renderView({ serverState: (await checkServer()).state })
  powerMonitor.on('resume', refreshServer)
  refreshServer()
})
