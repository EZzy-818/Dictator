/**
 * Returns copy(text) for the controller: writes to the system clipboard and reads it back, so a
 * write that silently failed (another app holding the pasteboard) is reported, not assumed.
 * Electron's clipboard is asynchronous (W3C style) since Electron 44; older sync methods work too.
 * Only writes, and never restores what was there before. Pasting (Auto-Paste) is autoPaste.js.
 */
export function createCopy(clipboard) {
  return async (text) => {
    try {
      await clipboard.writeText(text)
      return (await clipboard.readText()) === text
    } catch {
      return false
    }
  }
}
