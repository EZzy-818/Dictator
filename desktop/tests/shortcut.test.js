import { describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUT, MODIFIERS_ONLY, modifierLabel, shortcutFromKey, shortcutLabel, validateShortcut } from '../src/shared/shortcut.js'

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

  it('rejects only modifier-only and malformed shortcuts', () => {
    expect(validateShortcut('Command+Shift')).toEqual({ ok: false, error: MODIFIERS_ONLY })
    for (const bad of ['', 'Command+D+E', 'Command+Command+D', 'Control+Alt+F25', 'Super+D', 'Hyper', null, 42, `${'Shift+'.repeat(20)}D`]) {
      expect(validateShortcut(bad).ok).toBe(false)
    }
  })

  it('accepts a single key, letting the user decide, and warns that it stops typing', () => {
    expect(validateShortcut('D')).toEqual({ ok: true, accelerator: 'D', warning: 'While Dictator runs, D starts dictation everywhere and no longer types.' })
    expect(validateShortcut('Shift+5')).toMatchObject({ ok: true, accelerator: 'Shift+5', warning: expect.stringMatching(/no longer types/) })
    expect(validateShortcut('Space')).toMatchObject({ ok: true, warning: expect.any(String) })
    // Keys that don't type need no warning.
    expect(validateShortcut('F6')).toEqual({ ok: true, accelerator: 'F6' })
    expect(validateShortcut('F13')).toEqual({ ok: true, accelerator: 'F13' })
    expect(validateShortcut('Home')).toEqual({ ok: true, accelerator: 'Home' })
  })

  it('accepts ⌘ shortcuts and combinations macOS uses, with a warning', () => {
    expect(validateShortcut('Command+C')).toMatchObject({ ok: true, accelerator: 'Command+C', warning: expect.stringMatching(/usual action/) })
    expect(validateShortcut('Command+Space')).toMatchObject({ ok: true, warning: 'macOS uses ⌘Space for Spotlight, so it may never reach Dictator.' })
    expect(validateShortcut('Command+Tab')).toMatchObject({ ok: true, warning: expect.stringMatching(/switching apps/) })
    expect(validateShortcut('Control+Space').warning).toMatch(/input sources/)
  })

  it('accepts punctuation, arrows, editing keys and the keypad', () => {
    for (const [given, accelerator] of [
      ['Control+[', 'Control+['],
      ['Alt+Return', 'Alt+Return'],
      ['Alt+Enter', 'Alt+Return'],
      ['Control+Escape', 'Control+Escape'],
      ['Up', 'Up'],
      ['Command+Backspace', 'Command+Backspace'],
      ['num5', 'num5'],
      ['Control+/', 'Control+/'],
      ['F24', 'F24'],
    ]) {
      expect(validateShortcut(given)).toMatchObject({ ok: true, accelerator })
    }
  })
})

describe('shortcutLabel', () => {
  it('uses macOS symbols in the order ⌃⌥⇧⌘', () => {
    expect(shortcutLabel('Control+Alt+Space')).toBe('⌃⌥Space')
    expect(shortcutLabel('Command+Shift+D')).toBe('⇧⌘D')
    expect(shortcutLabel('Control+Alt+Shift+Command+F5')).toBe('⌃⌥⇧⌘F5')
    expect(modifierLabel({ meta: true, shift: true })).toBe('⇧⌘')
    expect(shortcutLabel('Alt+Return')).toBe('⌥↩')
    expect(shortcutLabel('Up')).toBe('↑')
    expect(shortcutLabel('num5')).toBe('Keypad 5')
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
    expect(key('Escape', { meta: true })).toEqual({ ok: true, accelerator: 'Command+Escape' })
  })

  it('turns any supported key into a shortcut, alone or with modifiers', () => {
    expect(key('KeyD')).toMatchObject({ ok: true, accelerator: 'D', warning: expect.any(String) })
    expect(key('Tab', { meta: true })).toMatchObject({ ok: true, accelerator: 'Command+Tab' })
    expect(key('BracketLeft', { control: true })).toEqual({ ok: true, accelerator: 'Control+[' })
    expect(key('ArrowUp')).toMatchObject({ ok: true, accelerator: 'Up' })
    expect(key('Numpad7')).toMatchObject({ ok: true, accelerator: 'num7' })
    expect(key('Enter', { alt: true })).toEqual({ ok: true, accelerator: 'Alt+Return' })
  })

  it('rejects keys macOS hotkeys cannot use', () => {
    expect(key('AudioVolumeUp').error).toMatch(/can’t use that key/)
    expect(key('IntlBackslash').ok).toBe(false)
    expect(shortcutFromKey({}).ok).toBe(false)
  })
})
