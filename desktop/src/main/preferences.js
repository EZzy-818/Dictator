import { DEFAULT_SHORTCUT, modifierLabel, shortcutFromKey, shortcutLabel, validateShortcut } from '../shared/shortcut.js'

// A capture nobody finishes (the window left open in the background, a combination macOS keeps
// for itself) ends on its own after this long without a key press, so the hotkey is never left off.
export const CAPTURE_IDLE_MS = 30_000

/**
 * The recording shortcut and refinement level, shared by the menu bar, the Settings window and
 * the hotkey. It owns no Electron objects, so it can be tested on its own. Every change from the
 * Settings window goes through here and is checked here.
 *
 * deps:
 *   settings: createSettings(...) (src/main/settings.js)
 *   hotkey: createHotkey(...) (src/main/hotkey.js)
 *   levels: [{ value, label, description }]
 *   onChange(view)  called after every change, with view() below
 *   setTimeout, clearTimeout  injectable for tests
 *
 * Recording a new shortcut ("capture"): startCapture() stops the hotkey listening, so pressing
 * the current shortcut does not start a dictation. Key presses in the Settings window go to
 * captureKey() instead of the page. saveCapture() switches to the captured shortcut only if it
 * can be registered; cancelCapture() (Escape, closing or leaving the window, or CAPTURE_IDLE_MS
 * without a key press) puts the old one back.
 */
export function createPreferences({
  settings,
  hotkey,
  levels,
  onChange = () => {},
  setTimeout: setTimer = globalThis.setTimeout,
  clearTimeout: clearTimer = globalThis.clearTimeout,
}) {
  // capture: null | { state: 'listening', modifiers, error? } | { state: 'captured', accelerator, label }
  let capture = null
  // The result of the last change, shown under the shortcut: { type: 'error' | 'saved', text }.
  let message = null
  let idleTimer = null

  const shortcut = () => settings.get().hotkey

  function view() {
    const current = shortcut()
    return {
      shortcut: current,
      shortcutLabel: shortcutLabel(current),
      shortcutOk: hotkey.current() === current || (capture !== null && hotkey.isSuspended()),
      defaultShortcut: DEFAULT_SHORTCUT,
      defaultLabel: shortcutLabel(DEFAULT_SHORTCUT),
      capture,
      message,
      level: settings.get().refinementLevel,
      levels,
    }
  }

  const changed = () => onChange(view())

  function endCapture() {
    clearTimer(idleTimer)
    idleTimer = null
    if (!capture) return
    capture = null
    hotkey.resume()
  }

  function restartIdleTimer() {
    clearTimer(idleTimer)
    idleTimer = setTimer(() => {
      if (!capture) return
      endCapture()
      changed()
    }, CAPTURE_IDLE_MS)
  }

  /** Validates, registers and saves a shortcut. Returns { ok, error? }; on failure nothing changes. */
  function setShortcut(accelerator) {
    const before = shortcut()
    const checked = validateShortcut(accelerator)
    if (!checked.ok) {
      message = { type: 'error', text: checked.error }
      changed()
      return { ok: false, error: checked.error }
    }
    if (!hotkey.use(checked.accelerator)) {
      const label = shortcutLabel(checked.accelerator)
      const keep = hotkey.current() === before ? ` Your shortcut is still ${shortcutLabel(before)}.` : ''
      const error = `${label} is unavailable. macOS or another app may already use it.${keep}`
      message = { type: 'error', text: error }
      changed()
      return { ok: false, error }
    }
    settings.set({ hotkey: checked.accelerator })
    message = checked.accelerator === before ? null : { type: 'saved', text: `Shortcut changed to ${shortcutLabel(checked.accelerator)}.` }
    changed()
    return { ok: true }
  }

  return {
    view,

    /** At launch: registers the saved shortcut. Returns false when another app owns it. */
    start() {
      const ok = hotkey.use(shortcut())
      if (!ok) message = { type: 'error', text: `${shortcutLabel(shortcut())} is unavailable. macOS or another app may already use it. Record a different shortcut.` }
      changed()
      return ok
    },

    isCapturing: () => capture !== null,

    startCapture() {
      if (capture) return
      hotkey.suspend()
      capture = { state: 'listening', modifiers: '' }
      message = null
      restartIdleTimer()
      changed()
    },

    cancelCapture() {
      if (!capture) return
      endCapture()
      changed()
    },

    /** A key event from the Settings window while capturing (Electron's before-input-event input). */
    captureKey(input) {
      if (!capture || !input || typeof input !== 'object') return
      if (input.type !== 'keyDown' && input.type !== 'keyUp') return
      restartIdleTimer()
      const result = shortcutFromKey(input)
      if (input.type === 'keyUp' || input.isAutoRepeat) {
        // Releasing a modifier updates the keys shown while still listening.
        if (result.modifiersOnly && capture.state === 'listening') {
          capture = { ...capture, modifiers: modifierLabel(input) }
          changed()
        }
        return
      }
      if (result.cancel) return this.cancelCapture()
      if (result.modifiersOnly) {
        if (capture.state === 'listening') capture = { ...capture, modifiers: modifierLabel(input) }
      } else if (input.code === 'Enter' && capture.state === 'captured' && !modifierLabel(input)) {
        return this.saveCapture()
      } else if (result.ok) {
        capture = { state: 'captured', accelerator: result.accelerator, label: shortcutLabel(result.accelerator) }
      } else {
        capture = { state: 'listening', modifiers: '', error: result.error }
      }
      changed()
    },

    /** Confirms the captured shortcut. The old one stays active if the new one can't be registered. */
    saveCapture() {
      if (capture?.state !== 'captured') return { ok: false, error: 'No shortcut was recorded.' }
      const { accelerator } = capture
      endCapture()
      return setShortcut(accelerator)
    },

    setShortcut(accelerator) {
      endCapture()
      return setShortcut(accelerator)
    },

    resetShortcut() {
      endCapture()
      return setShortcut(DEFAULT_SHORTCUT)
    },

    /** From the menu bar or the Settings window. Returns false for an unknown level. */
    setLevel(level) {
      if (!levels.some((option) => option.value === level)) return false
      settings.set({ refinementLevel: level })
      changed()
      return true
    },
  }
}
