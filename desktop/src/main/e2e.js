import { app } from 'electron'

/**
 * Test hook, active only when the app is started with DICTATOR_E2E=1: reads commands from stdin
 * ("toggle", "copy-last", "clipboard", "quit") and prints every state change as a
 * DICTATOR_STATE line. Lets tests press the "hotkey" without synthesizing system key events.
 * Returns the function the main process calls with each new state.
 */
export function attachE2E({ controller, indicator, clipboard, getView }) {
  const print = (name, value) => process.stdout.write(`${name} ${JSON.stringify(value)}\n`)
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', async (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const command = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (command === 'toggle') controller.toggle()
      else if (command === 'copy-last') await controller.copyLast()
      else if (command === 'clipboard') print('DICTATOR_CLIPBOARD', await clipboard.readText())
      else if (command === 'view') print('DICTATOR_VIEW', getView())
      else if (command === 'quit') app.quit()
    }
  })
  print('DICTATOR_E2E_READY', { hotkeyOk: getView().hotkeyOk })
  return (state) => print('DICTATOR_STATE', { ...state, indicatorVisible: !indicator.isDestroyed() && indicator.isVisible() })
}
