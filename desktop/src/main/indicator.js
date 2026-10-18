import path from 'node:path'
import { BrowserWindow } from 'electron'
import { secureWebPreferences } from './security.js'

const WIDTH = 240
const HEIGHT = 48

// The floating status window. It also hosts the recorder, so it is created at launch and kept
// loaded while hidden. Shown with showInactive() so it never takes focus from the user's app.
export function createIndicatorWindow() {
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

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }
  return win
}
