import { MESSAGES, recorderMessage } from './messages.js'

// How long each result stays on screen before the indicator hides.
export const RESULT_MS = { refined: 1500, raw: 4000, failed: 5000, copy_failed: 6000, notice: 1500 }
// Presses closer together than this are one press (key repeat, a double tap).
export const DEBOUNCE_MS = 300
// After this long transcribing, say the server may be waking up (Render's free plan sleeps).
export const SLOW_MS = 10_000

/**
 * The dictation state machine. It owns no Electron objects; everything it touches is passed in,
 * so it can be tested on its own.
 *
 * phase: idle → starting → recording → processing → done → idle
 * outcome (when done): 'refined' | 'raw' | 'failed' | 'copy_failed'
 *   refined: final text copied. raw: refinement failed, raw transcript copied.
 *   failed: nothing copied, clipboard untouched. copy_failed: transcript ready, clipboard refused.
 *
 * deps:
 *   recorder: { start({ measure }), stop(), cancel() }  commands to the renderer
 *   microphone: { ensureAccess() }  → 'granted' | 'denied' | 'restricted'
 *   transcribe(recording, level) → { rawTranscript, polishedTranscript, refinementStatus }
 *   copy(text) → Promise<true> when the clipboard now holds text
 *   getLevel() → 'none' | 'light' | 'medium'
 *   onChange(state)  called with every new state
 *   now, setTimeout, clearTimeout  injectable for tests
 */
export function createController({
  recorder,
  microphone,
  transcribe,
  copy,
  getLevel,
  onChange = () => {},
  now = Date.now,
  setTimeout: setTimer = globalThis.setTimeout,
  clearTimeout: clearTimer = globalThis.clearTimeout,
}) {
  let state = { phase: 'idle' }
  let session = 0
  let lastPressAt = -Infinity
  let lastTranscript = null
  let resultTimer = null
  let slowTimer = null
  let noticeTimer = null

  function set(next) {
    state = next
    onChange(state)
  }

  function clearTimers() {
    clearTimer(resultTimer)
    clearTimer(slowTimer)
    clearTimer(noticeTimer)
    resultTimer = slowTimer = noticeTimer = null
  }

  function finish(outcome, message, extra = {}) {
    clearTimers()
    const id = session
    set({ phase: 'done', outcome, message, ...extra })
    resultTimer = setTimer(() => {
      if (id === session && state.phase === 'done') set({ phase: 'idle' })
    }, RESULT_MS[outcome])
  }

  // A short message over the current state, without changing the phase.
  function notice(message) {
    clearTimer(noticeTimer)
    onChange({ ...state, notice: message })
    noticeTimer = setTimer(() => onChange(state), RESULT_MS.notice)
  }

  async function begin() {
    clearTimers()
    const id = ++session
    set({ phase: 'starting', message: MESSAGES.starting, level: getLevel() })
    let access
    try {
      access = await microphone.ensureAccess()
    } catch {
      access = 'denied'
    }
    if (id !== session || state.phase !== 'starting') return
    if (access !== 'granted') {
      return finish('failed', recorderMessage('permission-denied'), { code: 'permission-denied' })
    }
    recorder.start({ measure: false })
  }

  function startProcessing() {
    clearTimers()
    set({ ...state, phase: 'processing', message: MESSAGES.transcribing })
    const id = session
    slowTimer = setTimer(() => {
      if (id === session && state.phase === 'processing') set({ ...state, message: MESSAGES.slow })
    }, SLOW_MS)
  }

  return {
    getState: () => state,
    getLastTranscript: () => lastTranscript,

    /** The hotkey or the tray item: start, stop, or ignore while busy. */
    toggle() {
      const at = now()
      if (at - lastPressAt < DEBOUNCE_MS) return
      lastPressAt = at
      switch (state.phase) {
        case 'idle':
        case 'done':
          return begin()
        case 'starting':
          // Pressed again before the microphone started: treat it as never mind.
          session++
          recorder.cancel()
          clearTimers()
          return set({ phase: 'idle' })
        case 'recording':
          recorder.stop()
          return startProcessing()
        case 'processing':
          return notice(MESSAGES.busy)
      }
    },

    /** Sleep, screen lock or quit: keep what was said, drop a recording that had not started. */
    interrupt() {
      if (state.phase === 'recording') {
        recorder.stop()
        startProcessing()
      } else if (state.phase === 'starting') {
        session++
        recorder.cancel()
        clearTimers()
        set({ phase: 'idle' })
      }
    },

    recorderStarted() {
      if (state.phase === 'starting') set({ ...state, phase: 'recording', message: MESSAGES.recording, startedAt: now() })
      // A recorder that started after it was no longer wanted is stopped and its audio dropped.
      else if (state.phase !== 'recording') recorder.cancel()
    },

    recorderFailed(code) {
      if (state.phase === 'starting' || state.phase === 'recording' || state.phase === 'processing') {
        finish('failed', recorderMessage(code), { code })
      }
    },

    async recordingReady(recording) {
      // The 2-minute limit stops the recorder on its own, without a second press.
      if (state.phase === 'recording') startProcessing()
      if (state.phase !== 'processing') return
      const id = session
      const level = state.level ?? getLevel()
      let data
      try {
        data = await transcribe(recording, level)
      } catch (err) {
        if (id === session) finish('failed', err?.message || 'Transcription failed. Please try again.', { code: err?.code })
        return
      }
      if (id !== session) return
      const raw = typeof data?.rawTranscript === 'string' ? data.rawTranscript : ''
      const refined = data?.refinementStatus !== 'failed' && typeof data?.polishedTranscript === 'string'
      const text = refined ? data.polishedTranscript : raw
      if (!text.trim()) return finish('failed', MESSAGES.noSpeech, { code: 'no_speech' })
      lastTranscript = text
      const copied = await copy(text)
      if (id !== session) return
      if (!copied) return finish('copy_failed', MESSAGES.copyFailed, { code: 'clipboard' })
      finish(refined ? 'refined' : 'raw', refined ? MESSAGES.copied : MESSAGES.copiedRaw, { level })
    },

    /** Tray item: copy the last transcript again, for example after a clipboard failure. */
    async copyLast() {
      if (!lastTranscript) return false
      const ok = await copy(lastTranscript)
      notice(ok ? MESSAGES.recopied : MESSAGES.copyFailed)
      return ok
    },
  }
}
