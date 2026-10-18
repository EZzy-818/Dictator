import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_HOTKEY, createHotkey } from '../src/main/hotkey.js'
import { fakeShortcuts } from './fakes.js'

describe('hotkey', () => {
  it('defaults to Control+Option+Space', () => {
    expect(DEFAULT_HOTKEY).toBe('Control+Alt+Space')
  })

  it('registers one hotkey that calls back on press', () => {
    const shortcuts = fakeShortcuts()
    const onPress = vi.fn()
    const hotkey = createHotkey(shortcuts, onPress)
    expect(hotkey.use('Control+Alt+Space')).toBe(true)
    shortcuts.registered.get('Control+Alt+Space')()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('swaps hotkeys, registering the new one before releasing the old one', () => {
    const shortcuts = fakeShortcuts()
    const hotkey = createHotkey(shortcuts, vi.fn())
    hotkey.use('Control+Alt+Space')
    hotkey.use('Control+Alt+D')
    expect([...shortcuts.registered.keys()]).toEqual(['Control+Alt+D'])
    expect(shortcuts.register.mock.invocationCallOrder[1]).toBeLessThan(shortcuts.unregister.mock.invocationCallOrder[0])
    hotkey.release()
    expect(shortcuts.registered.size).toBe(0)
  })

  it('keeps the old hotkey when another app owns the new one', () => {
    const shortcuts = fakeShortcuts(['Control+Alt+D'])
    const hotkey = createHotkey(shortcuts, vi.fn())
    hotkey.use('Control+Alt+Space')
    expect(hotkey.use('Control+Alt+D')).toBe(false)
    expect(hotkey.current()).toBe('Control+Alt+Space')
    expect([...shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
  })

  it('reports a first hotkey another app owns', () => {
    const hotkey = createHotkey(fakeShortcuts(['Control+Alt+Space']), vi.fn())
    expect(hotkey.use('Control+Alt+Space')).toBe(false)
    expect(hotkey.current()).toBe(null)
  })

  it('treats a throwing register (a malformed accelerator) as unavailable', () => {
    const hotkey = createHotkey({ register: () => { throw new Error('bad') }, unregister: vi.fn() }, vi.fn())
    expect(hotkey.use('Nonsense')).toBe(false)
  })

  it('stops listening while suspended and listens again on resume', () => {
    const shortcuts = fakeShortcuts()
    const hotkey = createHotkey(shortcuts, vi.fn())
    hotkey.use('Control+Alt+Space')
    hotkey.suspend()
    expect(shortcuts.registered.size).toBe(0)
    expect(hotkey.current()).toBe(null)
    expect(hotkey.isSuspended()).toBe(true)
    expect(hotkey.resume()).toBe(true)
    expect([...shortcuts.registered.keys()]).toEqual(['Control+Alt+Space'])
  })

  it('reports a hotkey taken by another app while suspended', () => {
    const shortcuts = fakeShortcuts()
    const hotkey = createHotkey(shortcuts, vi.fn())
    hotkey.use('Control+Alt+Space')
    hotkey.suspend()
    shortcuts.taken.push('Control+Alt+Space')
    expect(hotkey.resume()).toBe(false)
    expect(hotkey.current()).toBe(null)
  })

  it('resumes the old hotkey before switching from a suspended one', () => {
    const shortcuts = fakeShortcuts(['Control+Alt+D'])
    const hotkey = createHotkey(shortcuts, vi.fn())
    hotkey.use('Control+Alt+Space')
    hotkey.suspend()
    expect(hotkey.use('Control+Alt+D')).toBe(false)
    expect(hotkey.current()).toBe('Control+Alt+Space')
  })
})
