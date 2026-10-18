import fs from 'node:fs'
import { BrowserWindow, app } from 'electron'

/**
 * Test hook, active only when the app is started with DICTATOR_E2E=1: reads commands from stdin
 * and prints every state change as a DICTATOR_STATE line and every preference change as a
 * DICTATOR_PREFS line. Lets tests press the "hotkey" and use the Settings window without
 * synthesizing system key events. Commands:
 *   toggle, copy-last, clipboard, view, level <none|light|medium>, output <copy|paste>,
 *   crash-renderer, quit
 *   press-hotkey                what the global hotkey does when pressed
 *   prefs                       print the preferences and whether the shortcut is registered
 *   open-settings, close-settings, settings-window
 *   settings-click <action>     click the Settings button with that data-action
 *   settings-level <level>      click that level's radio button
 *   settings-output <mode>      click that output behavior's radio button
 *   settings-checked            print the level checked in the Settings window
 *   settings-output-checked     print the output behavior checked there
 *   settings-key <json>         send a key event to the Settings window (webContents.sendInputEvent)
 *   settings-text               print the Settings window's text
 *   settings-screenshot <file>  save the Settings window's page as a PNG
 * Returns { onState, onPrefs } for the main process to call.
 */
export function attachE2E({ controller, indicator, clipboard, getView, setLevel, preferences, settingsWindows, hotkey }) {
  const print = (name, value) => process.stdout.write(`${name} ${JSON.stringify(value)}\n`)
  const printPrefs = (prefs) => print('DICTATOR_PREFS', { ...prefs, registered: hotkey.isRegistered(prefs.shortcut) })
  const inSettings = (script) => settingsWindows.get()?.webContents.executeJavaScript(script)
  const commands = {
    toggle: () => controller.toggle(),
    'copy-last': () => controller.copyLast(),
    clipboard: async () => print('DICTATOR_CLIPBOARD', await clipboard.readText()),
    view: () => print('DICTATOR_VIEW', getView()),
    level: (value) => setLevel(value),
    output: (value) => preferences.setOutputMode(value),
    'crash-renderer': () => indicator.webContents.forcefullyCrashRenderer(),
    quit: () => app.quit(),
    'press-hotkey': () => hotkey.press(),
    prefs: () => printPrefs(preferences.view()),
    'open-settings': () => settingsWindows.open(),
    'close-settings': () => settingsWindows.close(),
    'settings-window': () => {
      const win = settingsWindows.get()
      print('DICTATOR_SETTINGS_WINDOW', {
        open: Boolean(win),
        visible: Boolean(win?.isVisible()),
        loaded: Boolean(win && !win.webContents.isLoading()),
        windows: BrowserWindow.getAllWindows().length,
      })
    },
    'settings-click': async (action) => {
      if (!/^[\w-]+$/.test(action)) return
      print('DICTATOR_CLICKED', await inSettings(`(() => { const b = document.querySelector('[data-action="${action}"]'); if (b && !b.disabled) b.click(); return Boolean(b && !b.disabled) })()`))
    },
    'settings-level': async (level) => {
      if (!/^\w+$/.test(level)) return
      print('DICTATOR_CLICKED', await inSettings(`(() => { const r = document.querySelector('input[value="${level}"]'); r?.click(); return Boolean(r) })()`))
    },
    'settings-output': async (mode) => {
      if (!/^\w+$/.test(mode)) return
      print('DICTATOR_CLICKED', await inSettings(`(() => { const r = document.querySelector('input[name="output"][value="${mode}"]'); r?.click(); return Boolean(r) })()`))
    },
    'settings-checked': async () => print('DICTATOR_CHECKED', await inSettings(`document.querySelector('input[name="level"]:checked')?.value ?? null`)),
    'settings-output-checked': async () => print('DICTATOR_CHECKED', await inSettings(`document.querySelector('input[name="output"]:checked')?.value ?? null`)),
    'settings-key': (json) => settingsWindows.get()?.webContents.sendInputEvent(JSON.parse(json)),
    'settings-screenshot': async (file) => {
      const image = await settingsWindows.get()?.webContents.capturePage()
      if (image) fs.writeFileSync(file, image.toPNG())
      print('DICTATOR_SCREENSHOT', Boolean(image))
    },
    'settings-text': async () => print('DICTATOR_SETTINGS_TEXT', await inSettings(`document.querySelector('[data-settings]')?.innerText ?? ''`)),
  }

  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', async (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      const space = line.indexOf(' ')
      const [name, arg] = space < 0 ? [line, ''] : [line.slice(0, space), line.slice(space + 1)]
      if (Object.hasOwn(commands, name)) await commands[name](arg)
    }
  })
  print('DICTATOR_E2E_READY', { hotkeyOk: getView().hotkeyOk })
  return {
    onState: (state) => print('DICTATOR_STATE', { ...state, indicatorVisible: !indicator.isDestroyed() && indicator.isVisible() }),
    onPrefs: printPrefs,
  }
}
