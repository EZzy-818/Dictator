// The global hotkey. Electron's globalShortcut uses the system hotkey API, so it needs no
// Accessibility or Input Monitoring permission, and it only listens: nothing is typed or pasted.

// A few choices that avoid Spotlight (⌘Space) and input-source switching (⌃Space).
export const HOTKEY_OPTIONS = [
  { accelerator: 'Control+Alt+Space', label: '⌃⌥Space' },
  { accelerator: 'Control+Alt+D', label: '⌃⌥D' },
  { accelerator: 'Control+Shift+Space', label: '⌃⇧Space' },
  { accelerator: 'Alt+Shift+D', label: '⌥⇧D' },
]

export const DEFAULT_HOTKEY = HOTKEY_OPTIONS[0].accelerator

export const isKnownHotkey = (accelerator) => HOTKEY_OPTIONS.some((option) => option.accelerator === accelerator)

export const hotkeyLabel = (accelerator) => HOTKEY_OPTIONS.find((option) => option.accelerator === accelerator)?.label ?? accelerator

/**
 * Keeps one hotkey registered. use(accelerator) swaps to a new one and returns true, or returns
 * false and keeps none when another app already owns it.
 */
export function createHotkey(globalShortcut, onPress) {
  let current = null
  return {
    use(accelerator) {
      if (current) globalShortcut.unregister(current)
      current = null
      let ok = false
      try {
        ok = globalShortcut.register(accelerator, onPress)
      } catch {
        ok = false
      }
      if (ok) current = accelerator
      return ok
    },
    current: () => current,
    release() {
      if (current) globalShortcut.unregister(current)
      current = null
    },
  }
}
