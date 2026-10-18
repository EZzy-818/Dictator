import { app } from 'electron'

function waitForLoad(win) {
  return new Promise((resolve) => {
    if (!win.webContents.isLoading()) resolve()
    else win.webContents.once('did-finish-load', resolve)
  })
}

function report(name, result) {
  process.stdout.write(`${name} ${JSON.stringify(result)}\n`)
  app.exit(0)
}

/**
 * --self-check: loads everything, calls the backend once, prints the result and quits.
 * Used by tests/integration to check development and packaged builds the same way.
 */
export async function runSelfCheck({ indicator, apiBaseUrl, checkServer }) {
  await waitForLoad(indicator)
  const renderer = await indicator.webContents.executeJavaScript(`({
    indicator: Boolean(document.querySelector('[data-indicator]')),
    bridge: typeof window.dictator === 'object',
    node: typeof require !== 'undefined' || typeof process !== 'undefined',
  })`)
  const server = await checkServer()
  report('DICTATOR_SELF_CHECK', {
    apiBaseUrl,
    packaged: app.isPackaged,
    visible: indicator.isVisible(),
    renderer,
    server: server.state,
    transcriptionModel: server.health?.transcriptionModel ?? null,
    error: server.error ?? null,
  })
}

/**
 * --record-test=MS: records MS milliseconds from the microphone in the hidden window, without
 * the backend, and prints what came back. Checks first-time permission and hidden recording on a
 * real Mac. events is the IPC event source wired in index.js.
 */
export async function runRecordTest({ indicator, durationMs, ensureAccess, events, sendCommand }) {
  await waitForLoad(indicator)
  await events.ready
  const accessBefore = await ensureAccess()
  if (accessBefore !== 'granted') return report('DICTATOR_RECORD_TEST', { access: accessBefore })
  const started = Date.now()
  const result = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ error: 'timeout' }), durationMs + 30_000)
    events.onError = (code) => {
      clearTimeout(timeout)
      resolve({ error: code })
    }
    events.onStarted = () => {
      events.startedAfterMs = Date.now() - started
      setTimeout(() => sendCommand({ type: 'stop' }), durationMs)
    }
    events.onRecording = (recording) => {
      clearTimeout(timeout)
      resolve({
        mimeType: recording.mimeType,
        bytes: recording.blob.size,
        durationMs: recording.durationMs,
        peak: recording.peak ?? null,
      })
    }
    sendCommand({ type: 'start', measure: true })
  })
  report('DICTATOR_RECORD_TEST', {
    access: accessBefore,
    startedAfterMs: events.startedAfterMs ?? null,
    visibleWhileRecording: indicator.isVisible(),
    ...result,
  })
}
