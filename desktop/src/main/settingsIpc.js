import { isTrustedSender } from './ipc.js'

// Requests the Settings window may make, each answered by the main process. Nothing here takes a
// shortcut from the page: a new shortcut only comes from key presses the main process captured.
export const SETTINGS_CHANNELS = [
  'settings:get',
  'settings:capture-start',
  'settings:capture-cancel',
  'settings:capture-save',
  'settings:reset-shortcut',
  'settings:set-level',
  'settings:set-output',
  'settings:open-accessibility',
]

/**
 * Answers the Settings window's requests. Requests from any other window or page are refused,
 * and the level and output mode are checked by preferences.
 * ipcMain: Electron's ipcMain; getWindow() → the Settings window or null; focusWindow() brings
 * it forward when a capture starts.
 */
export function handleSettingsRequests({ ipcMain, getWindow, appUrl, preferences, focusWindow = () => {} }) {
  const actions = {
    'settings:get': () => preferences.view(),
    'settings:capture-start': () => {
      focusWindow()
      preferences.startCapture()
    },
    'settings:capture-cancel': () => preferences.cancelCapture(),
    'settings:capture-save': () => preferences.saveCapture(),
    'settings:reset-shortcut': () => preferences.resetShortcut(),
    'settings:set-level': (level) => preferences.setLevel(typeof level === 'string' ? level : ''),
    'settings:set-output': (mode) => preferences.setOutputMode(typeof mode === 'string' ? mode : ''),
    'settings:open-accessibility': () => preferences.openAccessibilitySettings(),
  }
  for (const channel of SETTINGS_CHANNELS) {
    ipcMain.handle(channel, (event, arg) => {
      if (!isTrustedSender(event, getWindow(), appUrl)) throw new Error('Not allowed')
      // Results are plain data; undefined becomes null so every reply is cloneable.
      return actions[channel](arg) ?? null
    })
  }
}
