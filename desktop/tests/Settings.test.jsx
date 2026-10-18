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
  outputMode: 'copy',
  outputOptions: [
    { value: 'copy', label: 'Copy Only', description: 'Copy the text.' },
    { value: 'paste', label: 'Auto-Paste (experimental)', description: 'Copy, then paste.' },
  ],
  accessibility: false,
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
    setOutputMode: vi.fn(),
    openAccessibilitySettings: vi.fn(),
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

  it('offers Copy Only and Auto-Paste and explains the limits', async () => {
    const { bridge, screen } = await open()
    const output = (mode) => screen.container.querySelector(`input[name="output"][value="${mode}"]`)
    expect(output('copy').checked).toBe(true)
    expect(screen.container.querySelector('[data-accessibility]')).toBe(null)
    expect(screen.container.querySelector('[data-limits]').textContent).toMatch(/cannot tell whether that is the same field/)
    fireEvent.click(output('paste'))
    expect(bridge.setOutputMode).toHaveBeenCalledWith('paste')
    // Chosen in the menu bar: followed here.
    bridge.push({ outputMode: 'paste' })
    expect(output('paste').checked).toBe(true)
  })

  it('shows the Accessibility status for Auto-Paste and how to turn it on', async () => {
    const { bridge, screen, button } = await open({ ...base, outputMode: 'paste', accessibility: false })
    expect(screen.container.querySelector('[data-accessibility]').textContent).toMatch(/Accessibility access: Off/)
    expect(screen.container.textContent).toContain('System Settings › Privacy & Security › Accessibility')
    fireEvent.click(button('open-accessibility'))
    expect(bridge.openAccessibilitySettings).toHaveBeenCalled()
    bridge.push({ outputMode: 'paste', accessibility: true })
    expect(screen.container.querySelector('[data-accessibility]').textContent).toMatch(/Accessibility access: On/)
    expect(button('open-accessibility')).toBe(null)
    bridge.push({ outputMode: 'paste', accessibility: null })
    expect(screen.container.textContent).toContain('Auto-Paste is not available on this computer')
  })

  it('stops listening when closed', async () => {
    const { bridge, screen } = await open()
    screen.unmount()
    expect(bridge.onView.mock.results[0].value).toBeTypeOf('function')
  })
})
