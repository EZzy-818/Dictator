// The global hotkey. Electron's globalShortcut uses the system hotkey API, so it needs no
// Accessibility or Input Monitoring permission, and it only listens: nothing is typed or pasted.
// Which shortcuts may be chosen is decided in src/shared/shortcut.js.

export { DEFAULT_SHORTCUT as DEFAULT_HOTKEY } from '../shared/shortcut.js'

/**
 * Keeps one hotkey registered.
 *   use(accelerator): registers the new one first and only then releases the old one, so it
 *     returns true with the new one active, or false with the old one still active (when another
 *     app or macOS owns the new one).
 *   suspend() / resume(): stop listening while the user records a new shortcut, then listen
 *     again. resume() returns false if the hotkey could not be taken back.
 */
export function createHotkey(globalShortcut, onPress) {
  let current = null
  let suspended = false

  function register(accelerator) {
    try {
      return globalShortcut.register(accelerator, onPress)
    } catch {
      return false
    }
  }

  const hotkey = {
    use(accelerator) {
      if (suspended) hotkey.resume()
      if (accelerator === current) return true
      if (!register(accelerator)) return false
      if (current) globalShortcut.unregister(current)
      current = accelerator
      return true
    },
    suspend() {
      if (!current || suspended) return
      globalShortcut.unregister(current)
      suspended = true
    },
    resume() {
      if (!suspended) return current !== null
      suspended = false
      if (!register(current)) current = null
      return current !== null
    },
    /** The registered accelerator, or null when there is none (or it is suspended). */
    current: () => (suspended ? null : current),
    isSuspended: () => suspended,
    release() {
      if (current && !suspended) globalShortcut.unregister(current)
      current = null
      suspended = false
    },
  }
  return hotkey
}
