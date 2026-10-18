import { contextBridge } from 'electron'

// The renderer's only way to reach the main process. D0 exposes nothing but the platform; the
// recorder commands arrive in D1, each as a named function, never a raw ipcRenderer.
contextBridge.exposeInMainWorld('dictator', {
  platform: process.platform,
})
