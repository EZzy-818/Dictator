import { describe, expect, it, vi } from 'vitest'
import { SETTINGS_CHANNELS, handleSettingsRequests } from '../src/main/settingsIpc.js'

const appUrl = 'app://dictator/settings.html'

function setup() {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const webContents = {}
  const win = { webContents, isDestroyed: () => false }
  let open = win
  const preferences = {
    view: vi.fn(() => ({ shortcut: 'Control+Alt+Space' })),
    startCapture: vi.fn(),
    cancelCapture: vi.fn(),
    saveCapture: vi.fn(() => ({ ok: true })),
    resetShortcut: vi.fn(() => ({ ok: true })),
    setLevel: vi.fn(() => true),
  }
  const focusWindow = vi.fn()
  handleSettingsRequests({ ipcMain, getWindow: () => open, appUrl, preferences, focusWindow })
  const fromSettings = { sender: webContents, senderFrame: { url: appUrl } }
  const call = (channel, event = fromSettings, arg) => handlers.get(channel)(event, arg)
  return { handlers, preferences, focusWindow, call, fromSettings, close: () => (open = null) }
}

describe('Settings window requests', () => {
  it('offers only the settings channels, none of which takes a shortcut', () => {
    const { handlers } = setup()
    expect([...handlers.keys()]).toEqual(SETTINGS_CHANNELS)
    expect(SETTINGS_CHANNELS.some((channel) => /^settings:set-shortcut/.test(channel))).toBe(false)
  })

  it('answers the Settings window', () => {
    const { call, preferences, focusWindow } = setup()
    expect(call('settings:get')).toEqual({ shortcut: 'Control+Alt+Space' })
    expect(call('settings:capture-start')).toBe(null)
    // Key presses only reach a focused window.
    expect(focusWindow).toHaveBeenCalled()
    expect(call('settings:capture-save')).toEqual({ ok: true })
    call('settings:set-level', undefined, 'medium')
    expect(preferences.setLevel).toHaveBeenCalledWith('medium')
  })

  it('passes only strings on as levels', () => {
    const { call, preferences } = setup()
    call('settings:set-level', undefined, { value: 'medium' })
    expect(preferences.setLevel).toHaveBeenLastCalledWith('')
  })

  it('refuses other windows, other pages and a closed Settings window', () => {
    const { call, preferences, fromSettings, close } = setup()
    expect(() => call('settings:capture-start', { sender: {}, senderFrame: { url: appUrl } })).toThrow('Not allowed')
    expect(() => call('settings:reset-shortcut', { ...fromSettings, senderFrame: { url: 'https://example.com/' } })).toThrow('Not allowed')
    close()
    expect(() => call('settings:set-level', fromSettings, 'none')).toThrow('Not allowed')
    expect(preferences.startCapture).not.toHaveBeenCalled()
    expect(preferences.resetShortcut).not.toHaveBeenCalled()
    expect(preferences.setLevel).not.toHaveBeenCalled()
  })
})
