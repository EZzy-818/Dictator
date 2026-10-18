import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { shell, systemPreferences } from 'electron'

const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
// One call never waits longer than this; a hung app is treated as a failure, not retried.
const CALL_TIMEOUT_MS = 4000

/**
 * Runs one command of the dictator-paste helper (native/paste-helper.swift) and parses its JSON
 * line. run(file, args) → Promise<stdout> is injectable for tests.
 */
export function createHelperRunner(helperPath, run = execHelper) {
  return async (...args) => JSON.parse((await run(helperPath, args.map(String))).trim())
}

function execHelper(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: CALL_TIMEOUT_MS, maxBuffer: 64 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)))
  })
}

/**
 * The automation object autoPaste.js expects. The macOS calls (frontmost app, focused element,
 * ⌘V) are made by the helper, which the build compiles from native/paste-helper.swift; Electron
 * has no API for them. Unsupported (nothing ever runs) off macOS or when the helper is missing.
 * isTrusted() asks macOS whether Dictator has Accessibility access, without showing a prompt.
 */
export function createMacAutomation({ helperPath, platform = process.platform, exists = fs.existsSync, run = createHelperRunner(helperPath) }) {
  const supported = platform === 'darwin' && exists(helperPath)
  return {
    isSupported: () => supported,
    isTrusted: () => supported && systemPreferences.isTrustedAccessibilityClient(false),
    frontmostApp: async () => (await run('front')).front,
    inspect: (pid) => run('inspect', pid),
    sendPaste: ({ pid, expectedChars }) => run('paste', pid, ...(expectedChars === null ? [] : [expectedChars])),
  }
}

/**
 * From Settings or the menu bar: asks macOS to list Dictator under Accessibility (macOS's own
 * prompt, which also offers to open System Settings) and opens that pane. Turning it on is up to
 * the user.
 */
export function openAccessibilitySettings() {
  if (process.platform !== 'darwin') return
  systemPreferences.isTrustedAccessibilityClient(true)
  return shell.openExternal(ACCESSIBILITY_SETTINGS_URL)
}
