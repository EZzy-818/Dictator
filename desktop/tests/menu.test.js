import { describe, expect, it, vi } from 'vitest'
import { buildMenuTemplate, trayTitle } from '../src/main/menu.js'

const actions = { toggle: vi.fn(), setLevel: vi.fn(), copyLast: vi.fn(), openMicrophoneSettings: vi.fn(), openSettings: vi.fn(), quit: vi.fn() }
const levels = [
  { value: 'none', label: 'None', description: 'No changes' },
  { value: 'light', label: 'Light', description: 'Clean up filler words and grammar' },
  { value: 'medium', label: 'Medium', description: 'Improve clarity and conciseness' },
]
const labels = (template) => template.map((item) => item.label).filter(Boolean)

describe('buildMenuTemplate', () => {
  it('offers Start Recording when idle', () => {
    const template = buildMenuTemplate({ version: '0.1.0', phase: 'idle', serverState: 'ready' }, actions)
    expect(labels(template)).toEqual(['Dictator 0.1.0', 'Ready', 'Start Recording', 'Copy Last Transcript', 'Server: ready', 'Settings…', 'Quit Dictator'])
  })

  it('offers Stop Recording while recording and nothing while busy', () => {
    expect(labels(buildMenuTemplate({ phase: 'recording' }, actions))).toContain('Stop Recording')
    const busy = buildMenuTemplate({ phase: 'processing' }, actions).find((item) => item.label === 'Start Recording')
    expect(busy.enabled).toBe(false)
  })

  it('shows the result and a way to the microphone settings after a denial', () => {
    const template = buildMenuTemplate({ phase: 'done', message: 'Microphone access is off.', code: 'permission-denied' }, actions)
    expect(labels(template)).toContain('Microphone access is off.')
    expect(labels(template)).toContain('Open Microphone Settings…')
  })
})

describe('levels and copy', () => {
  it('lists the three levels with the current one checked', () => {
    const template = buildMenuTemplate({ phase: 'idle', levels, level: 'medium' }, actions)
    const submenu = template.find((item) => item.label === 'Refinement').submenu
    expect(submenu.map((item) => item.checked)).toEqual([false, false, true])
    submenu[0].click()
    expect(actions.setLevel).toHaveBeenCalledWith('none')
  })

  it('enables Copy Last Transcript only when there is one', () => {
    const find = (view) => buildMenuTemplate(view, actions).find((item) => item.label === 'Copy Last Transcript')
    expect(find({ phase: 'idle' }).enabled).toBe(false)
    expect(find({ phase: 'idle', hasLastTranscript: true }).enabled).toBe(true)
  })
})

describe('hotkey and settings', () => {
  it('shows the hotkey next to Start Recording, including a custom one', () => {
    const template = buildMenuTemplate({ phase: 'idle', hotkey: 'Shift+Command+D', hotkeyOk: true }, actions)
    expect(template.find((item) => item.label === 'Start Recording')).toMatchObject({ accelerator: 'Shift+Command+D', registerAccelerator: false })
    // The hotkey is chosen in Settings now, not from a fixed list in the menu.
    expect(labels(template)).not.toContain('Hotkey')
  })

  it('says when another app owns the hotkey and points to Settings', () => {
    const template = buildMenuTemplate({ phase: 'idle', hotkey: 'Control+Alt+Space', hotkeyOk: false }, actions)
    expect(labels(template)).toContain('Hotkey unavailable: another app uses it. Choose another in Settings.')
    expect(template.find((item) => item.label === 'Start Recording').accelerator).toBeUndefined()
  })

  it('opens Settings from the menu, in every phase', () => {
    for (const phase of ['idle', 'recording', 'processing']) {
      const item = buildMenuTemplate({ phase }, actions).find((entry) => entry.label === 'Settings…')
      expect(item.enabled).not.toBe(false)
      item.click()
    }
    expect(actions.openSettings).toHaveBeenCalledTimes(3)
  })
})

describe('output behavior', () => {
  const outputOptions = [
    { value: 'copy', label: 'Copy Only' },
    { value: 'paste', label: 'Auto-Paste (experimental)' },
  ]
  it('offers Copy Only and Auto-Paste with the current one checked', () => {
    const setOutputMode = vi.fn()
    const template = buildMenuTemplate({ phase: 'idle', outputOptions, outputMode: 'copy' }, { ...actions, setOutputMode })
    const submenu = template.find((item) => item.label === 'Output').submenu
    expect(submenu.map((item) => [item.label, item.checked])).toEqual([['Copy Only', true], ['Auto-Paste (experimental)', false]])
    submenu[1].click()
    expect(setOutputMode).toHaveBeenCalledWith('paste')
  })

  it('points to the Accessibility settings when a paste was skipped for lack of access', () => {
    const openAccessibilitySettings = vi.fn()
    const template = buildMenuTemplate({ phase: 'done', code: 'accessibility', message: 'Copied to clipboard. Not pasted.' }, { ...actions, openAccessibilitySettings })
    template.find((item) => item.label === 'Open Accessibility Settings…').click()
    expect(openAccessibilitySettings).toHaveBeenCalled()
    expect(labels(buildMenuTemplate({ phase: 'done', code: 'no-target' }, actions))).not.toContain('Open Accessibility Settings…')
  })
})

describe('trayTitle', () => {
  it('marks recording and transcribing', () => {
    expect(trayTitle('recording')).toBe(' ●')
    expect(trayTitle('processing')).toBe(' …')
    expect(trayTitle('idle')).toBe('')
  })
})
