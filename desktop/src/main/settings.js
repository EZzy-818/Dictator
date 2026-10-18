import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_REFINEMENT_LEVEL, REFINEMENT_LEVEL_OPTIONS } from '@frontend/refinementLevels.js'

const LEVELS = REFINEMENT_LEVEL_OPTIONS.map((option) => option.value)

/**
 * The few choices the app remembers, in a JSON file in the app's data folder. A missing or
 * damaged file, or an unknown value, falls back to the default for that setting.
 * defaults: { refinementLevel, hotkey }; isValidHotkey checks a stored hotkey.
 */
export function createSettings(file, { defaults, isValidHotkey = () => true, fileSystem = fs } = {}) {
  const fallback = { refinementLevel: DEFAULT_REFINEMENT_LEVEL, ...defaults }

  function read() {
    let stored = {}
    try {
      stored = JSON.parse(fileSystem.readFileSync(file, 'utf8'))
    } catch {
      // First launch or a damaged file.
    }
    return {
      refinementLevel: LEVELS.includes(stored?.refinementLevel) ? stored.refinementLevel : fallback.refinementLevel,
      hotkey: typeof stored?.hotkey === 'string' && isValidHotkey(stored.hotkey) ? stored.hotkey : fallback.hotkey,
    }
  }

  let current = read()

  return {
    get: () => current,
    set(patch) {
      const next = { ...current, ...patch }
      if (!LEVELS.includes(next.refinementLevel) || !isValidHotkey(next.hotkey)) throw new Error('Invalid setting')
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
