import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_REFINEMENT_LEVEL, REFINEMENT_LEVEL_OPTIONS } from '@frontend/refinementLevels.js'

const LEVELS = REFINEMENT_LEVEL_OPTIONS.map((option) => option.value)
// What happens to the final text: copy it (the default), or copy it and paste it (experimental).
export const OUTPUT_MODES = ['copy', 'paste']

/**
 * The few choices the app remembers, in a JSON file in the app's data folder. A missing or
 * damaged file, or an unknown value, falls back to the default for that setting.
 * Only preferences are stored here, nothing sensitive.
 * defaults: { refinementLevel, hotkey, outputMode }; normalizeHotkey returns a stored hotkey in canonical form,
 * or null when it is not a valid shortcut.
 */
export function createSettings(file, { defaults, normalizeHotkey = (value) => value, fileSystem = fs } = {}) {
  const fallback = { refinementLevel: DEFAULT_REFINEMENT_LEVEL, outputMode: 'copy', ...defaults }

  function read() {
    let stored = {}
    try {
      stored = JSON.parse(fileSystem.readFileSync(file, 'utf8'))
    } catch {
      // First launch or a damaged file.
    }
    return {
      refinementLevel: LEVELS.includes(stored?.refinementLevel) ? stored.refinementLevel : fallback.refinementLevel,
      hotkey: (typeof stored?.hotkey === 'string' && normalizeHotkey(stored.hotkey)) || fallback.hotkey,
      outputMode: OUTPUT_MODES.includes(stored?.outputMode) ? stored.outputMode : fallback.outputMode,
    }
  }

  let current = read()

  return {
    get: () => current,
    set(patch) {
      const next = { ...current, ...patch }
      if (!LEVELS.includes(next.refinementLevel) || normalizeHotkey(next.hotkey) !== next.hotkey || !OUTPUT_MODES.includes(next.outputMode)) throw new Error('Invalid setting')
      current = next
      try {
        fileSystem.mkdirSync(path.dirname(file), { recursive: true })
        // Write then rename, so a crash mid-write never leaves half a file.
        fileSystem.writeFileSync(`${file}.tmp`, JSON.stringify(current, null, 2))
        fileSystem.renameSync(`${file}.tmp`, file)
      } catch {
        // Not saved; the choice still applies until the app quits.
      }
      return current
    },
  }
}
