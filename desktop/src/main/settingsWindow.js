import path from 'node:path'
import { BrowserWindow, app, nativeTheme } from 'electron'
import { secureWebPreferences } from './security.js'

export const SETTINGS_WIDTH = 520
export const SETTINGS_HEIGHT = 760

/**
 * Makes a window the frontmost one. A menu bar app is not the active app when its menu is used
 * (or when another app has focus), so it has to activate itself first.
 */
export function bringToFront(win) {
  app.focus({ steal: true })
  win.show()
  win.focus()
}

/**
 * Keeps at most one Settings window. open() brings the existing one forward (activate) or creates
 * it with create(); a closed window is forgotten, and closing it never quits the app (the
 * window-all-closed handler in index.js keeps the menu bar app running).
 */
export function createSettingsWindows(create, { activate = (win) => (win.show(), win.focus()) } = {}) {
  let win = null
  const live = () => (win && !win.isDestroyed() ? win : null)
  return {
    open() {
      const existing = live()
      if (existing) {
        activate(existing)
        return existing
      }
      win = create()
      win.on('closed', () => (win = null))
      return win
    },
    get: live,
    close: () => live()?.close(),
  }
}

/**
 * The Settings window: a small fixed-size preferences window on the app's own page, sandboxed
 * like the indicator, with its own preload that exposes only the settings functions.
 * onKey(event, input): every key event before the page sees it (used while recording a shortcut).
 * onLeave(): the window lost focus or closed. onFocus(): it came to the front (for example back
 * from System Settings, so the Accessibility status is read again).
 */
export function createSettingsWindow({ url, onKey, onLeave, onFocus = () => {} }) {
  const win = new BrowserWindow({
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    useContentSize: true,
    show: false,
    title: 'Dictator Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Matches the page background, so opening it does not flash white in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ececec',
    webPreferences: { ...secureWebPreferences(path.join(import.meta.dirname, '../preload/settings.cjs')), backgroundThrottling: true },
  })
  win.webContents.on('before-input-event', onKey)
  win.on('blur', onLeave)
  win.on('focus', onFocus)
  win.on('closed', onLeave)
  win.once('ready-to-show', () => bringToFront(win))
  win.loadURL(url)
  return win
}
