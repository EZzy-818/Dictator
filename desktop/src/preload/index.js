import { contextBridge, ipcRenderer } from 'electron'

function subscribe(channel, callback) {
  const listener = (event, value) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// The renderer's only way to reach the main process: a few named functions, never ipcRenderer
// itself. The main process checks the sender and every payload (src/main/ipc.js).
contextBridge.exposeInMainWorld('dictator', {
  platform: process.platform,
  /** Commands from the main process: { type: 'start' | 'stop' | 'cancel' }. */
  onCommand: (callback) => subscribe('recorder:command', callback),
  /** What the indicator should show (see src/main/controller.js). */
  onState: (callback) => subscribe('indicator:state', callback),
  ready: () => ipcRenderer.send('renderer:ready'),
  reportStarted: () => ipcRenderer.send('recorder:started'),
  reportError: (code) => ipcRenderer.send('recorder:error', code),
  /** { bytes: ArrayBuffer, mimeType, durationMs, peak? } */
  submitRecording: (recording) => ipcRenderer.send('recorder:recording', recording),
})
