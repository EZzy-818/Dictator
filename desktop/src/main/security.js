// Security settings for every window, kept free of Electron imports so they can be unit tested.

// The renderer gets no Node.js, no Electron APIs and no network (see the CSP in index.html).
export function secureWebPreferences(preload) {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    webviewTag: false,
    spellcheck: false,
    // The indicator window records while hidden; throttling would stall MediaRecorder and timers.
    backgroundThrottling: false,
  }
}

/**
 * Whether a renderer may use a browser permission. Only microphone audio, and only for the app's
 * own page; camera, notifications, location and everything else are refused.
 * details.mediaTypes is only present on permission requests, not on permission checks.
 */
export function isPermissionAllowed({ permission, requestingUrl, mediaTypes, appUrl }) {
  if (!isAppUrl(requestingUrl, appUrl)) return false
  if (permission !== 'media') return false
  if (mediaTypes === undefined) return true
  return mediaTypes.length > 0 && mediaTypes.every((type) => type === 'audio')
}

/** True when url is the app's own page: same file, or same dev server origin. */
export function isAppUrl(url, appUrl) {
  if (!url || !appUrl) return false
  try {
    const a = new URL(url)
    const b = new URL(appUrl)
    if (a.protocol === 'file:') return b.protocol === 'file:' && a.pathname === b.pathname
    return a.origin === b.origin
  } catch {
    return false
  }
}
