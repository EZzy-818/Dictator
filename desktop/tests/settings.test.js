import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettings } from '../src/main/settings.js'
import { validateShortcut } from '../src/shared/shortcut.js'

let dir
let file
const options = {
  defaults: { hotkey: 'Control+Alt+Space' },
  normalizeHotkey: (value) => {
    const checked = validateShortcut(value)
    return checked.ok ? checked.accelerator : null
  },
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dictator-settings-'))
  file = path.join(dir, 'settings.json')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('createSettings', () => {
  it('starts with Light, the default hotkey and Copy Only', () => {
    expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'light', hotkey: 'Control+Alt+Space', outputMode: 'copy' })
  })

  it('saves choices and reads them back on the next launch', () => {
    createSettings(file, options).set({ refinementLevel: 'medium', hotkey: 'Control+Alt+D' })
    expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'medium', hotkey: 'Control+Alt+D', outputMode: 'copy' })
  })

  it('ignores a damaged file and unknown values', () => {
    fs.writeFileSync(file, '{not json')
    expect(createSettings(file, options).get().refinementLevel).toBe('light')
    fs.writeFileSync(file, JSON.stringify({ refinementLevel: 'heavy', hotkey: 'Command+Q' }))
    expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'light', hotkey: 'Control+Alt+Space', outputMode: 'copy' })
  })

  it('keeps a custom shortcut, stored in canonical form', () => {
    fs.writeFileSync(file, JSON.stringify({ refinementLevel: 'none', hotkey: 'Command+Shift+d' }))
    expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'none', hotkey: 'Shift+Command+D', outputMode: 'copy' })
  })

  it('recovers from settings of the wrong shape', () => {
    for (const content of ['null', '[]', '"text"', JSON.stringify({ hotkey: 42, refinementLevel: ['x'] }), JSON.stringify({ hotkey: 'Shift+D' })]) {
      fs.writeFileSync(file, content)
      expect(createSettings(file, options).get()).toEqual({ refinementLevel: 'light', hotkey: 'Control+Alt+Space', outputMode: 'copy' })
    }
  })

  it('saves the output behavior and ignores an unknown one', () => {
    createSettings(file, options).set({ outputMode: 'paste' })
    expect(createSettings(file, options).get().outputMode).toBe('paste')
    fs.writeFileSync(file, JSON.stringify({ outputMode: 'type' }))
    expect(createSettings(file, options).get().outputMode).toBe('copy')
    expect(() => createSettings(file, options).set({ outputMode: 'type' })).toThrow()
  })

  it('refuses invalid choices', () => {
    expect(() => createSettings(file, options).set({ hotkey: 'Command+C' })).toThrow()
    expect(() => createSettings(file, options).set({ hotkey: 'Command+Shift+D' })).toThrow()
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
