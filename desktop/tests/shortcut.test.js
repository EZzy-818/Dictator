import { describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUT, modifierLabel, shortcutFromKey, shortcutLabel, validateShortcut } from '../src/shared/shortcut.js'

const key = (code, mods = {}) => shortcutFromKey({ code, control: false, alt: false, shift: false, meta: false, ...mods })

describe('validateShortcut', () => {
  it('accepts the default and the old menu presets', () => {
    for (const accelerator of [DEFAULT_SHORTCUT, 'Control+Alt+D', 'Control+Shift+Space', 'Alt+Shift+D']) {
      expect(validateShortcut(accelerator)).toEqual({ ok: true, accelerator })
    }
  })

  it('puts modifiers in macOS order and accepts common spellings', () => {
    expect(validateShortcut('Command+Shift+d')).toEqual({ ok: true, accelerator: 'Shift+Command+D' })
    expect(validateShortcut('Cmd+Option+Ctrl+1')).toEqual({ ok: true, accelerator: 'Control+Alt+Command+1' })
    expect(validateShortcut('f13')).toEqual({ ok: true, accelerator: 'F13' })
  })

  it('rejects modifier-only, malformed and unsupported shortcuts', () => {
    expect(validateShortcut('Command+Shift').ok).toBe(false)
    expect(validateShortcut('Command+Shift').error).toMatch(/Add a letter/)
    for (const bad of ['', 'Command+D+E', 'Command+Command+D', 'Command+Tab', 'Control+Alt+F25', 'Super+D', 'Control+Alt+Escape', null, 42, `${'Shift+'.repeat(20)}D`]) {
      expect(validateShortcut(bad).ok).toBe(false)
    }
  })

  it('requires ⌘, ⌃ or ⌥ for letters, numbers and Space, but not for function keys', () => {
    expect(validateShortcut('D').error).toMatch(/would block typing/)
    expect(validateShortcut('Shift+5').error).toMatch(/would block typing/)
    expect(validateShortcut('Shift+Space').ok).toBe(false)
    expect(validateShortcut('F6').ok).toBe(true)
    expect(validateShortcut('Shift+F6').ok).toBe(true)
  })

  it('refuses standard app shortcuts and combinations macOS reserves', () => {
    expect(validateShortcut('Command+C').error).toMatch(/standard app shortcut/)
    expect(validateShortcut('Command+Q').ok).toBe(false)
    expect(validateShortcut('Command+Space').error).toBe('⌘Space is reserved by macOS for Spotlight.')
    expect(validateShortcut('Control+Space').error).toMatch(/input sources/)
    expect(validateShortcut('Shift+Command+4').error).toMatch(/screenshots/)
    expect(validateShortcut('Control+Command+Q').error).toMatch(/locking the screen/)
  })
})

describe('shortcutLabel', () => {
  it('uses macOS symbols in the order ⌃⌥⇧⌘', () => {
    expect(shortcutLabel('Control+Alt+Space')).toBe('⌃⌥Space')
    expect(shortcutLabel('Command+Shift+D')).toBe('⇧⌘D')
    expect(shortcutLabel('Control+Alt+Shift+Command+F5')).toBe('⌃⌥⇧⌘F5')
    expect(modifierLabel({ meta: true, shift: true })).toBe('⇧⌘')
  })
})

describe('shortcutFromKey', () => {
  it('turns ⌘⇧D into a shortcut using the physical key', () => {
    expect(key('KeyD', { meta: true, shift: true })).toEqual({ ok: true, accelerator: 'Shift+Command+D' })
    // ⌥D types ∂ and ⇧1 types !, but the key is still D and 1.
    expect(key('KeyD', { alt: true, control: true })).toEqual({ ok: true, accelerator: 'Control+Alt+D' })
    expect(key('Digit1', { control: true, shift: true })).toEqual({ ok: true, accelerator: 'Control+Shift+1' })
    expect(key('F8')).toEqual({ ok: true, accelerator: 'F8' })
    expect(key('Space', { control: true, alt: true })).toEqual({ ok: true, accelerator: 'Control+Alt+Space' })
  })

  it('waits while only modifiers are held', () => {
    for (const code of ['MetaLeft', 'MetaRight', 'ShiftLeft', 'ControlRight', 'AltLeft', 'CapsLock']) {
      expect(key(code, { meta: true })).toEqual({ modifiersOnly: true })
    }
  })

  it('cancels on Escape without modifiers', () => {
    expect(key('Escape')).toEqual({ cancel: true })
    expect(key('Escape', { meta: true }).ok).toBe(false)
  })

  it('rejects keys it does not support and letters without a modifier', () => {
    expect(key('Tab', { meta: true }).error).toMatch(/isn’t supported/)
    expect(key('BracketLeft', { control: true }).ok).toBe(false)
    expect(key('KeyD').error).toMatch(/would block typing/)
    expect(shortcutFromKey({}).ok).toBe(false)
  })
})
