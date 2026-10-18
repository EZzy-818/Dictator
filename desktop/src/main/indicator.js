import path from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { secureWebPreferences } from './security.js'

export const WIDTH = 360
export const HEIGHT = 72
const TOP_MARGIN = 8

// Top center of the work area (below the menu bar) of the display the pointer is on.
export function indicatorPosition(workArea) {
  return { x: Math.round(workArea.x + (workArea.width - WIDTH) / 2), y: workArea.y + TOP_MARGIN }
}

// The floating status window. It also hosts the recorder, so it is created at launch and kept
// loaded while hidden. Shown with showInactive() so it never takes focus from the user's app.
export function createIndicatorWindow(url) {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: secureWebPreferences(path.join(import.meta.dirname, '../preload/index.cjs')),
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Clicks pass through to whatever is underneath; the pill is display only.
  win.setIgnoreMouseEvents(true)

  win.loadURL(url)
  return win
}

export function showIndicator(win) {
  if (win.isDestroyed()) return
  if (!win.isVisible()) {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const { x, y } = indicatorPosition(display.workArea)
    win.setPosition(x, y)
    win.showInactive()
  }
}

export function hideIndicator(win) {
  if (!win.isDestroyed() && win.isVisible()) win.hide()
}
