import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REFINEMENT_LEVEL_OPTIONS } from '@frontend/refinementLevels.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHotkey } from '../src/main/hotkey.js'
import { createPreferences } from '../src/main/preferences.js'
import { createSettings } from '../src/main/settings.js'
import { buildMenuTemplate } from '../src/main/menu.js'
import { validateShortcut } from '../src/shared/shortcut.js'
import { fakeShortcuts } from './fakes.js'

let dir
let file
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dictator-prefs-'))
  file = path.join(dir, 'settings.json')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const normalizeHotkey = (value) => {
  const checked = validateShortcut(value)
  return checked.ok ? checked.accelerator : null
}

// The main process's wiring (src/main/index.js) with fakes for globalShortcut and the dictation.
function launch({ taken = [], shortcuts = fakeShortcuts(taken) } = {}) {
  const settings = createSettings(file, { defaults: { hotkey: 'Control+Alt+Space' }, normalizeHotkey })
  const toggle = vi.fn()
  const views = []
  let preferences
  const hotkey = createHotkey(shortcuts, () => {
    if (!preferences.isCapturing()) toggle()
  })
  preferences = createPreferences({ settings, hotkey, levels: REFINEMENT_LEVEL_OPTIONS, onChange: (view) => views.push(view) })
  preferences.start()
  const press = (accelerator) => shortcuts.registered.get(accelerator)?.()
  const key = (code, mods = {}, type = 'keyDown') => preferences.captureKey({ type, code, control: false, alt: false, shift: false, meta: false, ...mods })
  const last = () => views.at(-1)
  return { preferences, shortcuts, toggle, press, key, last, views, settings }
}

describe('recording a new shortcut', () => {
  it('captures ⌘⇧D, shows it in macOS notation, and uses it once confirmed', () => {
    const app = launch()
    app.preferences.startCapture()
    expect(app.last().capture).toEqual({ state: 'listening', modifiers: '' })
    app.key('MetaLeft', { meta: true })
    app.key('ShiftLeft', { meta: true, shift: true })
    expect(app.last().capture).toEqual({ state: 'listening', modifiers: '⇧⌘' })
    app.key('KeyD', { meta: true, shift: true })
    expect(app.last().capture).toEqual({ state: 'captured', accelerator: 'Shift+Command+D', label: '⇧⌘D' })
    // Nothing changes until it is confirmed.
    expect(app.settings.get().hotkey).toBe('Control+Alt+Space')
    expect(app.preferences.saveCapture()).toEqual({ ok: true })
    expect([...app.shortcuts.registered.keys()]).toEqual(['Shift+Command+D'])
    expect(app.last()).toMatchObject({ shortcut: 'Shift+Command+D', shortcutLabel: '⇧⌘D', shortcutOk: true, capture: null, message: { type: 'saved' } })
    app.press('Shift+Command+D')
    expect(app.toggle).toHaveBeenCalledTimes(1)
  })

  it('confirms with Return, and a new combination replaces the captured one', () => {
    const app = launch()
    app.preferences.startCapture()
    app.key('KeyD', { control: true, alt: true })
    app.key('KeyK', { control: true, alt: true })
    expect(app.last().capture.label).toBe('⌃⌥K')
    app.key('Enter')
    expect(app.last()).toMatchObject({ shortcut: 'Control+Alt+K', capture: null })
  })

  it('rejects an invalid combination inline and keeps listening', () => {
    const app = launch()
    app.preferences.startCapture()
    app.key('KeyD')
    expect(app.last().capture).toMatchObject({ state: 'listening', error: expect.stringMatching(/would block typing/) })
    app.key('KeyC', { meta: true })
    expect(app.last().capture.error).toMatch(/standard app shortcut/)
    app.key('Space', { meta: true })
    expect(app.last().capture.error).toMatch(/Spotlight/)
    app.key('Tab', { control: true })
    expect(app.last().capture.error).toMatch(/isn’t supported/)
    // Releasing modifier keys alone never becomes a shortcut.
    app.key('MetaLeft', { meta: true })
    app.key('MetaLeft', {}, 'keyUp')
    expect(app.last().capture.state).toBe('listening')
    expect(app.preferences.saveCapture().ok).toBe(false)
    expect(app.settings.get().hotkey).toBe('Control+Alt+Space')
  })

  it('refuses an invalid shortcut sent directly, keeping the old one', () => {
    const app = launch()
    expect(app.preferences.setShortcut('Command+V').ok).toBe(false)
    expect(app.preferences.setShortcut('Shift').ok).toBe(false)
    expect(app.preferences.setShortcut({ toString: () => 'Control+Alt+D' }).ok).toBe(false)
    expect([...app.shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
    expect(app.last().message.type).toBe('error')
  })
})

describe('conflicts', () => {
  it('keeps the old shortcut working when the new one is owned by another app', () => {
    const app = launch({ taken: ['Shift+Command+D'] })
    app.preferences.startCapture()
    app.key('KeyD', { meta: true, shift: true })
    const result = app.preferences.saveCapture()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('⇧⌘D is unavailable. macOS or another app may already use it. Your shortcut is still ⌃⌥Space.')
    expect(app.last()).toMatchObject({ shortcut: 'Control+Alt+Space', shortcutOk: true, capture: null, message: { type: 'error', text: result.error } })
    expect([...app.shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
    expect(app.settings.get().hotkey).toBe('Control+Alt+Space')
    app.press('Control+Alt+Space')
    expect(app.toggle).toHaveBeenCalledTimes(1)
  })

  it('reports a saved shortcut another app took while Dictator was closed, without overwriting it', () => {
    fs.writeFileSync(file, JSON.stringify({ hotkey: 'Control+Alt+K', refinementLevel: 'light' }))
    const app = launch({ taken: ['Control+Alt+K'] })
    expect(app.last()).toMatchObject({ shortcut: 'Control+Alt+K', shortcutOk: false, message: { type: 'error' } })
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).hotkey).toBe('Control+Alt+K')
    // A new shortcut can still be chosen.
    expect(app.preferences.setShortcut('Control+Alt+J').ok).toBe(true)
    expect(app.last().shortcutOk).toBe(true)
  })
})

describe('cancelling', () => {
  it('cancels with Escape and listens to the old shortcut again', () => {
    const app = launch()
    app.preferences.startCapture()
    app.key('KeyD', { meta: true, shift: true })
    app.key('Escape')
    expect(app.last()).toMatchObject({ capture: null, shortcut: 'Control+Alt+Space', shortcutOk: true })
    expect([...app.shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
    expect(app.settings.get().hotkey).toBe('Control+Alt+Space')
  })

  it('cancels when the window loses focus or closes', () => {
    const app = launch()
    app.preferences.startCapture()
    app.preferences.cancelCapture()
    expect(app.preferences.isCapturing()).toBe(false)
    expect([...app.shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
    // Cancelling again, when not capturing, changes nothing.
    const count = app.views.length
    app.preferences.cancelCapture()
    expect(app.views.length).toBe(count)
  })
})

describe('reset to default', () => {
  it('goes back to ⌃⌥Space', () => {
    const app = launch()
    app.preferences.setShortcut('Control+Alt+K')
    expect(app.preferences.resetShortcut()).toEqual({ ok: true })
    expect(app.last()).toMatchObject({ shortcut: 'Control+Alt+Space', shortcutOk: true })
    expect([...app.shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
  })

  it('keeps the working shortcut when the default is unavailable', () => {
    fs.writeFileSync(file, JSON.stringify({ hotkey: 'Control+Alt+K' }))
    const app = launch({ taken: ['Control+Alt+Space'] })
    const result = app.preferences.resetShortcut()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/⌃⌥Space is unavailable.*still ⌃⌥K/)
    expect(app.last()).toMatchObject({ shortcut: 'Control+Alt+K', shortcutOk: true })
  })

  it('ends a capture in progress', () => {
    const app = launch()
    app.preferences.setShortcut('Control+Alt+K')
    app.preferences.startCapture()
    app.preferences.resetShortcut()
    expect(app.preferences.isCapturing()).toBe(false)
    expect([...app.shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
  })
})

describe('persistence', () => {
  it('keeps the shortcut and level across restarts', () => {
    const first = launch()
    first.preferences.setShortcut('Shift+Command+D')
    first.preferences.setLevel('medium')
    const second = launch()
    expect(second.last()).toMatchObject({ shortcut: 'Shift+Command+D', shortcutOk: true, level: 'medium' })
    expect([...second.shortcuts.registered.keys()]).toEqual(['Shift+Command+D'])
  })

  it('starts with the default after a damaged or unsupported saved shortcut', () => {
    fs.writeFileSync(file, JSON.stringify({ hotkey: 'Command+Q', refinementLevel: 'medium' }))
    expect(launch().last()).toMatchObject({ shortcut: 'Control+Alt+Space', shortcutOk: true, level: 'medium' })
    fs.writeFileSync(file, '{"hotkey": ')
    expect(launch().last()).toMatchObject({ shortcut: 'Control+Alt+Space', level: 'light' })
  })

  it('stores only the two preferences', () => {
    launch().preferences.setShortcut('Control+Alt+K')
    expect(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).sort()).toEqual(['hotkey', 'refinementLevel'])
  })
})

describe('refinement level', () => {
  it('keeps the menu bar and the Settings window in sync', () => {
    const app = launch()
    const actions = { toggle() {}, copyLast() {}, openMicrophoneSettings() {}, openSettings() {}, quit() {}, setLevel: (level) => app.preferences.setLevel(level) }
    const menuLevel = () => {
      const view = { phase: 'idle', levels: REFINEMENT_LEVEL_OPTIONS, level: app.last().level }
      return buildMenuTemplate(view, actions).find((item) => item.label === 'Refinement').submenu
    }
    // Chosen in the menu bar: the Settings window gets the new level.
    menuLevel()[2].click()
    expect(app.last().level).toBe('medium')
    // Chosen in Settings: the menu shows it checked.
    app.preferences.setLevel('none')
    expect(menuLevel().map((item) => item.checked)).toEqual([true, false, false])
    expect(app.settings.get().refinementLevel).toBe('none')
  })

  it('refuses unknown levels', () => {
    const app = launch()
    expect(app.preferences.setLevel('heavy')).toBe(false)
    expect(app.preferences.setLevel(undefined)).toBe(false)
    expect(app.settings.get().refinementLevel).toBe('light')
  })
})

describe('no dictation while recording a shortcut', () => {
  it('pressing the current shortcut during capture captures it instead of starting a recording', () => {
    const app = launch()
    app.preferences.startCapture()
    // The hotkey is not registered while capturing, so the system never delivers it.
    expect(app.shortcuts.registered.size).toBe(0)
    expect(app.last().shortcutOk).toBe(true)
    app.key('Space', { control: true, alt: true })
    expect(app.toggle).not.toHaveBeenCalled()
    expect(app.last().capture.label).toBe('⌃⌥Space')
    app.preferences.saveCapture()
    app.press('Control+Alt+Space')
    expect(app.toggle).toHaveBeenCalledTimes(1)
  })

  it('ignores a hotkey callback that arrives during capture', () => {
    const shortcuts = fakeShortcuts()
    const app = launch({ shortcuts })
    const callback = shortcuts.registered.get('Control+Alt+Space')
    app.preferences.startCapture()
    callback()
    expect(app.toggle).not.toHaveBeenCalled()
  })

  it('ignores key events when not capturing, and malformed events', () => {
    const app = launch()
    const count = app.views.length
    app.key('KeyD', { meta: true, shift: true })
    app.preferences.startCapture()
    app.preferences.captureKey(null)
    app.preferences.captureKey({ type: 'char', code: 'KeyD', meta: true })
    expect(app.views.length).toBe(count + 1)
  })
})
