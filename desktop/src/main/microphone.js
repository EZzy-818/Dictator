import { shell, systemPreferences } from 'electron'

const SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'

/**
 * Makes sure macOS lets the app use the microphone, asking the first time.
 * Returns 'granted', 'denied' or 'restricted'. Other platforms (tests on Linux) and runs with
 * Chromium's fake microphone, which never touches the real one, skip the check.
 */
export async function ensureMicrophoneAccess({ fakeDevice = false } = {}) {
  if (process.platform !== 'darwin' || fakeDevice) return 'granted'
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'not-determined') {
    return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied'
  }
  return status === 'granted' ? 'granted' : status === 'restricted' ? 'restricted' : 'denied'
}

export function openMicrophoneSettings() {
  return shell.openExternal(SETTINGS_URL)
}
