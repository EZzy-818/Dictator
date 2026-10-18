import { describe, expect, it, vi } from 'vitest'
import { buildMenuTemplate, trayTitle } from '../src/main/menu.js'

const actions = { toggle: vi.fn(), setLevel: vi.fn(), setHotkey: vi.fn(), copyLast: vi.fn(), openMicrophoneSettings: vi.fn(), quit: vi.fn() }
const levels = [
  { value: 'none', label: 'None', description: 'No changes' },
  { value: 'light', label: 'Light', description: 'Clean up filler words and grammar' },
  { value: 'medium', label: 'Medium', description: 'Improve clarity and conciseness' },
]
const labels = (template) => template.map((item) => item.label).filter(Boolean)

describe('buildMenuTemplate', () => {
  it('offers Start Recording when idle', () => {
    const template = buildMenuTemplate({ version: '0.1.0', phase: 'idle', serverState: 'ready' }, actions)
    expect(labels(template)).toEqual(['Dictator 0.1.0', 'Ready', 'Start Recording', 'Copy Last Transcript', 'Server: ready', 'Quit Dictator'])
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

describe('hotkey', () => {
  const hotkeys = [
    { accelerator: 'Control+Alt+Space', label: '⌃⌥Space' },
    { accelerator: 'Control+Alt+D', label: '⌃⌥D' },
  ]

  it('shows the hotkey next to Start Recording and lets the user pick another', () => {
    const template = buildMenuTemplate({ phase: 'idle', hotkey: 'Control+Alt+Space', hotkeyOk: true, hotkeys }, actions)
    expect(template.find((item) => item.label === 'Start Recording')).toMatchObject({ accelerator: 'Control+Alt+Space', registerAccelerator: false })
    const submenu = template.find((item) => item.label === 'Hotkey').submenu
    expect(submenu.map((item) => item.checked)).toEqual([true, false])
    submenu[1].click()
    expect(actions.setHotkey).toHaveBeenCalledWith('Control+Alt+D')
  })

  it('says when another app owns the hotkey', () => {
    const template = buildMenuTemplate({ phase: 'idle', hotkey: 'Control+Alt+Space', hotkeyOk: false, hotkeys }, actions)
    expect(labels(template).some((label) => label.startsWith('Hotkey unavailable'))).toBe(true)
    expect(template.find((item) => item.label === 'Start Recording').accelerator).toBeUndefined()
  })
})

describe('trayTitle', () => {
  it('marks recording and transcribing', () => {
    expect(trayTitle('recording')).toBe(' ●')
    expect(trayTitle('processing')).toBe(' …')
    expect(trayTitle('idle')).toBe('')
  })
})
