// The Settings window in the real app: recording a shortcut with key events sent to the window,
// invalid combinations, Escape, Reset to Default, preferences surviving a restart, the refinement
// level shared with the menu bar, no dictation while recording a shortcut, and the window never
// quitting the app. Conflicts with other apps are covered by the unit tests (tests/preferences.test.js).
// No backend is needed.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { build, startApp } from './helpers.js'

let profile
let app

beforeAll(async () => {
  // Nothing listens on port 9; the server check fails quietly.
  await build('development', 'http://127.0.0.1:9')
})

afterEach(async () => {
  await app?.quit()
  if (profile) fs.rmSync(profile, { recursive: true, force: true })
  profile = null
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const key = (keyCode, modifiers = []) => `settings-key ${JSON.stringify({ type: 'keyDown', keyCode, modifiers })}`

/** The preferences, once they match (the current ones, or the next change). */
const prefs = (predicate = () => true) => app.ask('prefs', 'DICTATOR_PREFS', predicate)

/** Polls a Settings window command until its answer matches. */
async function until(command, name, predicate) {
  let last
  for (let i = 0; i < 50; i++) {
    last = await app.ask(command, name)
    if (predicate(last)) return last
    await sleep(100)
  }
  throw new Error(`${command} never matched. Last: ${JSON.stringify(last)}`)
}
const settingsText = (predicate) => until('settings-text', 'DICTATOR_SETTINGS_TEXT', (text) => typeof text === 'string' && predicate(text))
const windowState = () => app.ask('settings-window', 'DICTATOR_SETTINGS_WINDOW')

async function openSettings() {
  app.send('open-settings')
  await until('settings-window', 'DICTATOR_SETTINGS_WINDOW', (w) => w.loaded)
  await settingsText((text) => text.includes('Recording shortcut'))
}

// Starts the app with a fresh profile (or the current one, to test a restart) and opens Settings.
async function launch({ keepProfile = false } = {}) {
  if (!keepProfile) profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dictator-settings-e2e-'))
  app = startApp({ userData: profile })
  await app.waitFor('DICTATOR_E2E_READY')
  await openSettings()
}

async function record(keyCode, modifiers) {
  app.send('settings-click record')
  await prefs((p) => p.capture?.state === 'listening')
  app.send(key(keyCode, modifiers))
  return prefs((p) => p.capture?.state === 'captured' || Boolean(p.capture?.error))
}

describe('Settings window', () => {
  it('records ⌘⇧D, shows it in macOS notation, and makes it the global hotkey', async () => {
    await launch()
    app.send('settings-click record')
    await prefs((p) => p.capture?.state === 'listening')
    await settingsText((text) => text.includes('Press your new shortcut…'))
    app.send(key('D', ['meta', 'shift']))
    expect((await prefs((p) => p.capture?.state === 'captured')).capture).toEqual({ state: 'captured', accelerator: 'Shift+Command+D', label: '⇧⌘D' })
    await settingsText((text) => text.includes('⇧⌘D') && text.includes('Save Shortcut'))
    app.send('settings-click save')
    const saved = await prefs((p) => p.shortcut === 'Shift+Command+D' && p.capture === null)
    expect(saved).toMatchObject({ shortcutLabel: '⇧⌘D', shortcutOk: true, registered: true, message: { type: 'saved' } })
    // The menu bar shows it next to Start Recording.
    expect(await app.ask('view', 'DICTATOR_VIEW')).toMatchObject({ hotkey: 'Shift+Command+D', hotkeyOk: true })
    await settingsText((text) => text.includes('Shortcut changed to ⇧⌘D.'))
    // Saved for review in a failing run; the profile is removed afterwards.
    if (process.env.DICTATOR_SCREENSHOTS) {
      expect(await app.ask(`settings-screenshot ${path.join(process.env.DICTATOR_SCREENSHOTS, 'settings-saved.png')}`, 'DICTATOR_SCREENSHOT')).toBe(true)
    }
  })

  it('shows an inline error for an invalid combination and keeps the old shortcut', async () => {
    await launch()
    const rejected = await record('C', ['meta'])
    expect(rejected.capture).toMatchObject({ state: 'listening', error: '⌘C is a standard app shortcut. Add ⌃, ⌥ or ⇧.' })
    await settingsText((text) => text.includes('standard app shortcut') && text.includes('Press your new shortcut…'))
    app.send(key('D'))
    await prefs((p) => p.capture?.error?.includes('would block typing'))
    app.send(key('Escape'))
    expect(await prefs((p) => p.capture === null)).toMatchObject({ shortcut: 'Control+Alt+Space', shortcutOk: true, registered: true })
  })

  it('does not start a dictation when the hotkey is pressed while recording a shortcut', async () => {
    await launch()
    app.send('settings-click record')
    const listening = await prefs((p) => p.capture?.state === 'listening')
    // The hotkey is unregistered from the system while capturing.
    expect(listening.registered).toBe(false)
    app.send('press-hotkey')
    app.send(key('Space', ['control', 'alt']))
    await prefs((p) => p.capture?.state === 'captured')
    await sleep(500)
    expect(app.states()).toEqual([])
    app.send(key('Escape'))
    expect(await prefs((p) => p.capture === null)).toMatchObject({ registered: true })
    // Afterwards the hotkey starts a dictation again.
    app.send('press-hotkey')
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'starting')
  })

  it('cancels with Escape, and when the window closes', async () => {
    await launch()
    await record('K', ['control', 'alt'])
    app.send(key('Escape'))
    expect(await prefs((p) => p.capture === null)).toMatchObject({ shortcut: 'Control+Alt+Space', registered: true })
    await settingsText((text) => text.includes('⌃⌥Space') && text.includes('Record Shortcut'))
    app.send('settings-click record')
    await prefs((p) => p.capture?.state === 'listening')
    app.send('close-settings')
    expect(await prefs((p) => p.capture === null)).toMatchObject({ shortcut: 'Control+Alt+Space', registered: true })
  })

  it('keeps preferences across a restart, and resets to the default', async () => {
    await launch()
    await record('J', ['control', 'alt'])
    app.send(key('Return'))
    await prefs((p) => p.shortcut === 'Control+Alt+J' && p.registered)
    expect(await app.ask('settings-level medium', 'DICTATOR_CLICKED')).toBe(true)
    await prefs((p) => p.level === 'medium')

    await app.quit()
    await launch({ keepProfile: true })
    expect(await prefs()).toMatchObject({ shortcut: 'Control+Alt+J', shortcutOk: true, registered: true, level: 'medium' })
    await settingsText((text) => text.includes('⌃⌥J'))
    expect(await app.ask('settings-checked', 'DICTATOR_CHECKED')).toBe('medium')

    app.send('settings-click reset')
    expect(await prefs((p) => p.shortcut === 'Control+Alt+Space')).toMatchObject({ registered: true, shortcutOk: true })
    expect(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'))).toEqual({ refinementLevel: 'medium', hotkey: 'Control+Alt+Space', outputMode: 'copy' })
  })

  it('keeps the menu bar and the Settings window on the same refinement level', async () => {
    await launch()
    // Chosen in the menu bar: the same action the Refinement submenu calls.
    app.send('level none')
    await prefs((p) => p.level === 'none')
    await until('settings-checked', 'DICTATOR_CHECKED', (level) => level === 'none')
    // Chosen in Settings: the menu bar's view follows.
    app.send('settings-level medium')
    await prefs((p) => p.level === 'medium')
    expect(await app.ask('view', 'DICTATOR_VIEW')).toMatchObject({ level: 'medium' })
  })

  it('chooses the output behavior in Settings or the menu bar, explains it, and keeps it', async () => {
    await launch()
    expect(await prefs()).toMatchObject({ outputMode: 'copy' })
    await settingsText((text) => text.includes('Copy Only') && text.includes('Auto-Paste (experimental)') && text.includes('cannot tell whether that is the same field'))
    expect(await app.ask('settings-output-checked', 'DICTATOR_CHECKED')).toBe('copy')
    expect(await app.ask('settings-output paste', 'DICTATOR_CLICKED')).toBe(true)
    await prefs((p) => p.outputMode === 'paste')
    expect(await app.ask('view', 'DICTATOR_VIEW')).toMatchObject({ outputMode: 'paste' })
    // Not macOS here, so no Accessibility status, and Settings says Auto-Paste is unavailable.
    await settingsText((text) => text.includes('Auto-Paste is not available on this computer'))
    if (process.env.DICTATOR_SCREENSHOTS) {
      expect(await app.ask(`settings-screenshot ${path.join(process.env.DICTATOR_SCREENSHOTS, 'settings-output.png')}`, 'DICTATOR_SCREENSHOT')).toBe(true)
    }
    // Chosen in the menu bar: Settings follows.
    app.send('output copy')
    await until('settings-output-checked', 'DICTATOR_CHECKED', (mode) => mode === 'copy')
    app.send('output paste')
    await prefs((p) => p.outputMode === 'paste')
    await app.quit()
    await launch({ keepProfile: true })
    expect(await prefs()).toMatchObject({ outputMode: 'paste' })
    expect(await app.ask('settings-output-checked', 'DICTATOR_CHECKED')).toBe('paste')
  })

  it('opens one window, and closing it leaves the app running', async () => {
    await launch()
    app.send('open-settings')
    app.send('open-settings')
    await sleep(300)
    // The indicator and one Settings window.
    expect(await windowState()).toMatchObject({ open: true, windows: 2 })
    app.send('close-settings')
    await until('settings-window', 'DICTATOR_SETTINGS_WINDOW', (w) => !w.open)
    expect(await windowState()).toMatchObject({ open: false, windows: 1 })
    await sleep(500)
    expect(app.child.exitCode).toBe(null)
    // Still works from the menu bar, and Settings opens again.
    app.send('toggle')
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'starting')
    await openSettings()
    expect(await windowState()).toMatchObject({ open: true, windows: 2 })
  })
})
