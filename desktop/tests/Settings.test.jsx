import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Settings from '../src/renderer/Settings.jsx'

const levels = [
  { value: 'none', label: 'None', description: 'No changes' },
  { value: 'light', label: 'Light', description: 'Clean up filler words and grammar' },
  { value: 'medium', label: 'Medium', description: 'Improve clarity and conciseness' },
]
const base = {
  shortcut: 'Control+Alt+Space',
  shortcutLabel: '⌃⌥Space',
  shortcutOk: true,
  defaultShortcut: 'Control+Alt+Space',
  defaultLabel: '⌃⌥Space',
  capture: null,
  message: null,
  level: 'light',
  levels,
}

function fakeBridge(initial = base) {
  let listener
  return {
    getView: vi.fn(async () => initial),
    onView: vi.fn((fn) => {
      listener = fn
      return () => (listener = null)
    }),
    push: (view) => act(() => listener({ ...base, ...view })),
    startCapture: vi.fn(),
    cancelCapture: vi.fn(),
    saveCapture: vi.fn(),
    resetShortcut: vi.fn(),
    setLevel: vi.fn(),
  }
}

const radio = (screen, level) => screen.container.querySelector(`input[value="${level}"]`)

async function open(initial) {
  const bridge = fakeBridge(initial)
  const screen = render(<Settings bridge={bridge} />)
  await act(async () => {})
  const field = () => screen.container.querySelector('[data-shortcut]').textContent
  const button = (action) => screen.container.querySelector(`[data-action="${action}"]`)
  return { bridge, screen, field, button }
}

describe('Settings window', () => {
  it('shows the current shortcut and level', async () => {
    const { field, screen, button } = await open()
    expect(field()).toBe('⌃⌥Space')
    expect(radio(screen, 'light').checked).toBe(true)
    expect(button('reset').disabled).toBe(true)
    expect(button('reset').textContent).toBe('Reset to Default (⌃⌥Space)')
  })

  it('walks through recording a shortcut', async () => {
    const { bridge, field, button, screen } = await open()
    fireEvent.click(button('record'))
    expect(bridge.startCapture).toHaveBeenCalled()
    bridge.push({ capture: { state: 'listening', modifiers: '' } })
    expect(field()).toBe('Press your new shortcut…')
    expect(button('save').disabled).toBe(true)
    bridge.push({ capture: { state: 'listening', modifiers: '⇧⌘' } })
    expect(field()).toBe('⇧⌘…')
    bridge.push({ capture: { state: 'captured', accelerator: 'Shift+Command+D', label: '⇧⌘D' } })
    expect(field()).toBe('⇧⌘D')
    fireEvent.click(button('save'))
    expect(bridge.saveCapture).toHaveBeenCalled()
    bridge.push({ shortcut: 'Shift+Command+D', shortcutLabel: '⇧⌘D', message: { type: 'saved', text: 'Shortcut changed to ⇧⌘D.' } })
    expect(field()).toBe('⇧⌘D')
    expect(screen.container.textContent).toContain('Shortcut changed to ⇧⌘D.')
    expect(button('reset').disabled).toBe(false)
  })

  it('shows capture errors and registration errors inline', async () => {
    const { bridge, screen, button } = await open()
    bridge.push({ capture: { state: 'listening', modifiers: '', error: '⌘C is a standard app shortcut. Add ⌃, ⌥ or ⇧.' } })
    expect(screen.getByRole('alert').textContent).toBe('⌘C is a standard app shortcut. Add ⌃, ⌥ or ⇧.')
    fireEvent.click(button('cancel'))
    expect(bridge.cancelCapture).toHaveBeenCalled()
    bridge.push({ message: { type: 'error', text: '⇧⌘D is unavailable. Your shortcut is still ⌃⌥Space.' } })
    expect(screen.getByRole('alert').textContent).toMatch(/still ⌃⌥Space/)
  })

  it('marks a shortcut that could not be registered and lets the user reset it', async () => {
    const { button, screen } = await open({ ...base, shortcut: 'Control+Alt+K', shortcutLabel: '⌃⌥K', shortcutOk: false })
    expect(screen.container.querySelector('[data-shortcut]').className).toContain('unavailable')
    expect(button('reset').disabled).toBe(false)
  })

  it('resets to default', async () => {
    const { bridge, button } = await open({ ...base, shortcut: 'Control+Alt+K', shortcutLabel: '⌃⌥K' })
    fireEvent.click(button('reset'))
    expect(bridge.resetShortcut).toHaveBeenCalled()
  })

  it('saves a level when chosen and follows changes made in the menu bar', async () => {
    const { bridge, screen } = await open()
    fireEvent.click(radio(screen, 'medium'))
    expect(bridge.setLevel).toHaveBeenCalledWith('medium')
    bridge.push({ level: 'none' })
    expect(radio(screen, 'none').checked).toBe(true)
  })

  it('stops listening when closed', async () => {
    const { bridge, screen } = await open()
    screen.unmount()
    expect(bridge.onView.mock.results[0].value).toBeTypeOf('function')
  })
})
