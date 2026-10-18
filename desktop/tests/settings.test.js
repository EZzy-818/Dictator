import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettings } from '../src/main/settings.js'

let dir
let file
const options = { defaults: { hotkey: 'Control+Alt+Space' }, isValidHotkey: (value) => ['Control+Alt+Space', 'Control+Alt+D'].includes(value) }

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dictator-settings-'))
  file = path.join(dir, 'settings.json')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('createSettings', () => {
  it('starts with Light and the default hotkey', () => {
    expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'light', hotkey: 'Control+Alt+Space' })
  })

  it('saves choices and reads them back on the next launch', () => {
    createSettings(file, options).set({ refinementLevel: 'medium', hotkey: 'Control+Alt+D' })
    expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'medium', hotkey: 'Control+Alt+D' })
  })

  it('ignores a damaged file and unknown values', () => {
    fs.writeFileSync(file, '{not json')
    expect(createSettings(file, options).get().refinementLevel).toBe('light')
    fs.writeFileSync(file, JSON.stringify({ refinementLevel: 'heavy', hotkey: 'Command+Q' }))
    expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'light', hotkey: 'Control+Alt+Space' })
  })

  it('refuses invalid choices', () => {
    const settings = createSettings(file, options)
    expect(() => settings.set({ refinementLevel: 'heavy' })).toThrow()
    expect(settings.get().refinementLevel).toBe('light')
  })

  it('keeps a choice for the session when the file cannot be written', () => {
    const settings = createSettings(path.join(dir, 'missing', 'x', 'settings.json'), {
      ...options,
      fileSystem: { ...fs, readFileSync: fs.readFileSync, mkdirSync: () => {}, writeFileSync: () => { throw new Error('read-only') }, renameSync: fs.renameSync },
    })
    expect(settings.set({ refinementLevel: 'none' }).refinementLevel).toBe('none')
    expect(settings.get().refinementLevel).toBe('none')
  })
})
