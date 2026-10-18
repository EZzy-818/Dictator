import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_HOTKEY, createHotkey, hotkeyLabel, isKnownHotkey } from '../src/main/hotkey.js'

function fakeShortcuts(taken = []) {
  const registered = new Map()
  return {
    registered,
    register: vi.fn((accelerator, fn) => {
      if (taken.includes(accelerator)) return false
      registered.set(accelerator, fn)
      return true
    }),
    unregister: vi.fn((accelerator) => registered.delete(accelerator)),
  }
}

describe('hotkey', () => {
  it('defaults to Control+Option+Space', () => {
    expect(DEFAULT_HOTKEY).toBe('Control+Alt+Space')
    expect(hotkeyLabel(DEFAULT_HOTKEY)).toBe('⌃⌥Space')
    expect(isKnownHotkey('Command+Q')).toBe(false)
  })

  it('registers one hotkey that calls back on press', () => {
    const shortcuts = fakeShortcuts()
    const onPress = vi.fn()
    const hotkey = createHotkey(shortcuts, onPress)
    expect(hotkey.use('Control+Alt+Space')).toBe(true)
    shortcuts.registered.get('Control+Alt+Space')()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('swaps hotkeys, releasing the old one', () => {
    const shortcuts = fakeShortcuts()
    const hotkey = createHotkey(shortcuts, vi.fn())
    hotkey.use('Control+Alt+Space')
    hotkey.use('Control+Alt+D')
    expect([...shortcuts.registered.keys()]).toEqual(['Control+Alt+D'])
    hotkey.release()
    expect(shortcuts.registered.size).toBe(0)
  })

  it('reports a hotkey another app owns', () => {
    const hotkey = createHotkey(fakeShortcuts(['Control+Alt+Space']), vi.fn())
    expect(hotkey.use('Control+Alt+Space')).toBe(false)
    expect(hotkey.current()).toBe(null)
  })
})
