import { describe, expect, it, vi } from 'vitest'
import { buildMenuTemplate, trayTitle } from '../src/main/menu.js'

const actions = { toggle: vi.fn(), openMicrophoneSettings: vi.fn(), quit: vi.fn() }
const labels = (template) => template.map((item) => item.label).filter(Boolean)

describe('buildMenuTemplate', () => {
  it('offers Start Recording when idle', () => {
    const template = buildMenuTemplate({ version: '0.1.0', phase: 'idle', serverState: 'ready' }, actions)
    expect(labels(template)).toEqual(['Dictator 0.1.0', 'Ready', 'Start Recording', 'Server: ready', 'Quit Dictator'])
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

describe('trayTitle', () => {
  it('marks recording and transcribing', () => {
    expect(trayTitle('recording')).toBe(' ●')
    expect(trayTitle('processing')).toBe(' …')
    expect(trayTitle('idle')).toBe('')
  })
})
