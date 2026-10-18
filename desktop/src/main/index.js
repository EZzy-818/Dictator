import path from 'node:path'
import fs from 'node:fs'
import { app, clipboard, globalShortcut, ipcMain, powerMonitor } from 'electron'
import { REFINEMENT_LEVEL_OPTIONS } from '@frontend/refinementLevels.js'
import { API_BASE_URL, getHealth, processAudio } from './api.js'
import { createAutoPaste } from './autoPaste.js'
import { createCopy } from './clipboard.js'
import { createController } from './controller.js'
import { attachE2E } from './e2e.js'
import { validateShortcut } from '../shared/shortcut.js'
import { DEFAULT_HOTKEY, createHotkey } from './hotkey.js'
import { createIndicatorWindow, hideIndicator, showIndicator } from './indicator.js'
import { isTrustedSender, parseRecorderError, parseRecording } from './ipc.js'
import { RECORDER_MESSAGES } from './messages.js'
import { createMacAutomation, openAccessibilitySettings } from './macAutomation.js'
import { ensureMicrophoneAccess, openMicrophoneSettings } from './microphone.js'
import { installPermissionHandlers } from './permissions.js'
import { OUTPUT_OPTIONS, createPreferences } from './preferences.js'
import { APP_URL, registerAppScheme, serveRenderer } from './protocol.js'
import { isAppUrl } from './security.js'
import { runRecordTest, runSelfCheck, runTranscribeTest } from './selftest.js'
import { createSettings } from './settings.js'
import { handleSettingsRequests } from './settingsIpc.js'
import { bringToFront, createSettingsWindow, createSettingsWindows } from './settingsWindow.js'
import { createTray } from './tray.js'

const selfCheck = process.argv.includes('--self-check')
const argValue = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const recordTestMs = Number(argValue('record-test')) || 0
const transcribeTestFile = argValue('transcribe-test')
// Tests run with Chromium's fake microphone, which needs no macOS permission.
const fakeDevice = app.commandLine.hasSwitch('use-fake-device-for-media-stream')

const rendererUrl = process.env.ELECTRON_RENDERER_URL || APP_URL
const settingsUrl = new URL('settings.html', rendererUrl).href
const iconDir = app.isPackaged ? process.resourcesPath : path.join(import.meta.dirname, '../../build')
// The Auto-Paste helper, compiled by scripts/build-helper.mjs (macOS only). Automated tests set
// DICTATOR_PASTE_HELPER (empty: no helper) so they never send ⌘V to whatever app is in front.
const testPasteHelper = process.env.DICTATOR_E2E === '1' && !app.isPackaged ? process.env.DICTATOR_PASTE_HELPER : undefined
const pasteHelper =
  testPasteHelper ?? (app.isPackaged ? path.join(process.resourcesPath, 'dictator-paste') : path.join(import.meta.dirname, '../../out-native/dictator-paste'))

// Tests keep their settings out of the real profile.
if (process.env.DICTATOR_E2E === '1' && process.env.DICTATOR_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.DICTATOR_USER_DATA)

registerAppScheme()

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

const SERVER_RETRIES = 3
const SERVER_RETRY_MS = 15_000

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
  const events = {
    // Replaced when the page reloads after a crash, so commands wait for the new page.
    resetReady() {
      events.ready = new Promise((resolve) => (markReady = resolve))
    },
  }
  events.resetReady()
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
  serveRenderer(path.join(import.meta.dirname, '../renderer'))
  installPermissionHandlers(rendererUrl)
  const indicator = createIndicatorWindow(rendererUrl)
  const sendCommand = (command) => !indicator.isDestroyed() && indicator.webContents.send('recorder:command', command)
  const ensureAccess = () => ensureMicrophoneAccess({ fakeDevice })

  if (selfCheck) return runSelfCheck({ indicator, apiBaseUrl: API_BASE_URL, checkServer, settingsUrl })

  const settings = createSettings(path.join(app.getPath('userData'), 'settings.json'), {
    defaults: { hotkey: DEFAULT_HOTKEY },
    // A damaged or unsupported saved shortcut falls back to the default.
    normalizeHotkey: (value) => {
      const checked = validateShortcut(value)
      return checked.ok ? checked.accelerator : null
    },
  })
  // The same request the web app makes: batch transcription, then refinement at the chosen level.
  const transcribe = (recording, level) => processAudio(recording, level)
  const copy = createCopy(clipboard)
  const automation = createMacAutomation({ helperPath: pasteHelper })
  const accessibility = { isSupported: automation.isSupported, isTrusted: automation.isTrusted, open: openAccessibilitySettings }

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
    hotkey: settings.get().hotkey,
    hotkeyOk: false,
    outputOptions: OUTPUT_OPTIONS,
    outputMode: settings.get().outputMode,
  }
  let tray
  let controller
  let onStateForTests
  let onPrefsForTests
  let refreshServer = async () => {}
  const events = listenToRenderer(indicator, {
    started: () => controller.recorderStarted(),
    error: (code) => controller.recorderFailed(code),
    recording: (recording) => controller.recordingReady(recording),
  })

  const renderView = (patch) => {
    view = { ...view, ...patch }
    tray?.render(view)
  }

  controller = createController({
    recorder: {
      // A press right after launch waits for the recorder page to finish loading.
      start: () => events.ready.then(() => controller.getState().phase === 'starting' && sendCommand({ type: 'start' })),
      stop: () => sendCommand({ type: 'stop' }),
      cancel: () => sendCommand({ type: 'cancel' }),
    },
    microphone: { ensureAccess },
    transcribe,
    copy,
    getLevel: () => settings.get().refinementLevel,
    getOutputMode: () => settings.get().outputMode,
    autoPaste: createAutoPaste({ automation, selfPid: process.pid }),
    onChange: (state) => {
      if (!indicator.isDestroyed()) indicator.webContents.send('indicator:state', state)
      if (state.phase === 'idle' && !state.notice) hideIndicator(indicator)
      else showIndicator(indicator)
      onStateForTests?.(state)
      // A failed request rechecks the server; a successful one proves it is up.
      if (state.phase === 'done' && state.code === 'network_error') refreshServer()
      if (state.phase === 'done' && (state.outcome === 'refined' || state.outcome === 'raw')) view.serverState = 'ready'
      renderView({
        phase: state.phase,
        outcome: state.outcome,
        code: state.code,
        message: state.notice ?? state.message,
        hasLastTranscript: Boolean(controller?.getLastTranscript()),
      })
    },
  })

  if (recordTestMs) return runRecordTest({ indicator, durationMs: recordTestMs, ensureAccess, events, sendCommand })

  let preferences
  // The hotkey is suspended while a new shortcut is being recorded; the check is a second guard.
  const onHotkey = () => {
    if (!preferences.isCapturing()) controller.toggle()
  }
  const hotkey = createHotkey(globalShortcut, onHotkey)
  app.on('will-quit', () => hotkey.release())

  // One Settings window at most. Key presses go to the shortcut recorder, not the page, while it
  // listens, so menu shortcuts like ⌘Q or ⌘W are captured instead of acting.
  const settingsWindows = createSettingsWindows(() =>
    createSettingsWindow({
      url: settingsUrl,
      onKey: (event, input) => {
        if (!preferences.isCapturing()) return
        event.preventDefault()
        preferences.captureKey(input)
      },
      onLeave: () => preferences.cancelCapture(),
      onFocus: () => preferences.refresh(),
    }),
    { activate: bringToFront },
  )

  preferences = createPreferences({
    settings,
    hotkey,
    levels: REFINEMENT_LEVEL_OPTIONS,
    accessibility,
    // Keeps the menu bar and the Settings window showing the same shortcut, level and output.
    onChange: (prefs) => {
      renderView({ hotkey: prefs.shortcut, hotkeyOk: prefs.shortcutOk, level: prefs.level, outputMode: prefs.outputMode })
      onPrefsForTests?.(prefs)
      const win = settingsWindows.get()
      if (win && !win.webContents.isDestroyed()) win.webContents.send('settings:view', prefs)
    },
  })
  handleSettingsRequests({
    ipcMain,
    getWindow: settingsWindows.get,
    appUrl: settingsUrl,
    preferences,
    // Key presses only reach a focused window, and leaving it ends the capture.
    focusWindow: () => settingsWindows.get() && bringToFront(settingsWindows.get()),
  })

  tray = createTray({
    iconDir,
    actions: {
      toggle: () => controller.toggle(),
      setLevel: (level) => preferences.setLevel(level),
      setOutputMode: (mode) => preferences.setOutputMode(mode),
      copyLast: () => controller.copyLast(),
      openMicrophoneSettings: () => openMicrophoneSettings(),
      openAccessibilitySettings: () => preferences.openAccessibilitySettings(),
      // Opening Settings leaves any dictation in progress alone.
      openSettings: () => settingsWindows.open(),
      quit: () => app.quit(),
    },
  })
  preferences.start()

  // Tests drive the app over stdin when DICTATOR_E2E=1 (see src/main/e2e.js). Never in the
  // packaged app.
  if (process.env.DICTATOR_E2E === '1' && !app.isPackaged) {
    ;({ onState: onStateForTests, onPrefs: onPrefsForTests } = attachE2E({
      controller,
      indicator,
      clipboard,
      getView: () => view,
      setLevel: (level) => preferences.setLevel(level),
      preferences,
      settingsWindows,
      hotkey: { press: onHotkey, isRegistered: (accelerator) => globalShortcut.isRegistered(accelerator) },
    }))
  }

  // Keep what was said when the Mac sleeps or locks mid-recording.
  powerMonitor.on('suspend', () => controller.interrupt())
  powerMonitor.on('lock-screen', () => controller.interrupt())
  // Checking early also wakes the backend, which sleeps when idle on Render's free plan.
  // A cold start can outlast one health check, so an unreachable server is retried a few times
  // (showing "checking") before the menu says so.
  let retry
  refreshServer = async (attemptsLeft = SERVER_RETRIES) => {
    clearTimeout(retry)
    const { state } = await checkServer()
    if (state === 'unreachable' && attemptsLeft > 0) {
      renderView({ serverState: 'checking' })
      retry = setTimeout(() => refreshServer(attemptsLeft - 1), SERVER_RETRY_MS)
      return
    }
    renderView({ serverState: state })
  }

  // A crashed recorder page is reloaded; a dictation it was part of ends with an error.
  indicator.webContents.on('render-process-gone', () => {
    events.resetReady()
    controller.rendererLost()
    if (!indicator.isDestroyed()) indicator.webContents.reload()
  })
  // Release the microphone if the app quits mid-recording.
  app.on('before-quit', () => sendCommand({ type: 'cancel' }))
  powerMonitor.on('resume', () => refreshServer())
  refreshServer()
})
