import { contextBridge, ipcRenderer } from 'electron'

// The Settings window's only way to reach the main process. It can read the preferences, start
// and stop recording a shortcut, and choose a level; the main process checks every request
// (src/main/settingsIpc.js). The shortcut itself is captured by the main process, not sent from here.
contextBridge.exposeInMainWorld('dictatorSettings', {
  getView: () => ipcRenderer.invoke('settings:get'),
  /** Every change, from this window, the menu bar or the hotkey. Returns an unsubscribe function. */
  onView: (callback) => {
    const listener = (event, view) => callback(view)
    ipcRenderer.on('settings:view', listener)
    return () => ipcRenderer.removeListener('settings:view', listener)
  },
  startCapture: () => ipcRenderer.invoke('settings:capture-start'),
  cancelCapture: () => ipcRenderer.invoke('settings:capture-cancel'),
  saveCapture: () => ipcRenderer.invoke('settings:capture-save'),
  resetShortcut: () => ipcRenderer.invoke('settings:reset-shortcut'),
  setLevel: (level) => ipcRenderer.invoke('settings:set-level', level),
})
