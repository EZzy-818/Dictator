import { describe, expect, it, vi } from 'vitest'
import { checkTarget, createAutoPaste, isEditable } from '../src/main/autoPaste.js'

const notes = { pid: 42, bundleId: 'com.apple.Notes', name: 'Notes' }
const field = { pid: 42, role: 'AXTextArea', subrole: null, settable: true, chars: 10, selection: { location: 10, length: 0 } }
const facts = (patch = {}) => ({ trusted: true, secureInput: false, front: { ...notes }, focused: { ...field }, ...patch })

function fakeAutomation(overrides = {}) {
  return {
    isSupported: vi.fn(() => true),
    isTrusted: vi.fn(() => true),
    frontmostApp: vi.fn(async () => notes),
    inspect: vi.fn(async () => facts()),
    sendPaste: vi.fn(async () => ({ posted: true, confirmed: true })),
    ...overrides,
  }
}

const setup = (overrides) => {
  const automation = fakeAutomation(overrides)
  return { automation, autoPaste: createAutoPaste({ automation, selfPid: 7 }) }
}

describe('Auto-Paste', () => {
  it('records the frontmost app at the start', async () => {
    const { autoPaste } = setup()
    expect(await autoPaste.captureTarget()).toEqual(notes)
  })

  it('sends one ⌘V to the same app and reports it pasted when the field grew by the text', async () => {
    const { autoPaste, automation } = setup()
    expect(await autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'pasted' })
    expect(automation.sendPaste).toHaveBeenCalledTimes(1)
    expect(automation.sendPaste).toHaveBeenCalledWith({ pid: 42, expectedChars: 16 })
  })

  it('says "attempted", not "pasted", when the paste could not be confirmed', async () => {
    const { autoPaste } = setup({ sendPaste: vi.fn(async () => ({ posted: true, confirmed: false })) })
    expect(await autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'attempted' })
  })

  it('expects selected text to be replaced', () => {
    const selected = facts({ focused: { ...field, selection: { location: 2, length: 4 } } })
    expect(checkTarget(selected, notes, 'Hi')).toEqual({ ok: true, expectedChars: 8 })
    expect(checkTarget(facts({ focused: { ...field, chars: null } }), notes, 'Hi')).toEqual({ ok: true, expectedChars: null })
  })

  it('does not paste without Accessibility access', async () => {
    const { autoPaste, automation } = setup({ isTrusted: vi.fn(() => false) })
    expect(await autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'accessibility' })
    expect(automation.inspect).not.toHaveBeenCalled()
    expect(automation.sendPaste).not.toHaveBeenCalled()
    // The helper's own check (the permission macOS applies to it) counts too.
    const helper = setup({ inspect: vi.fn(async () => facts({ trusted: false, focused: null })) })
    expect(await helper.autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'accessibility' })
    expect(helper.automation.sendPaste).not.toHaveBeenCalled()
  })

  it('does not paste when another app is in front', async () => {
    for (const front of [{ pid: 99, bundleId: 'com.google.Chrome' }, { pid: 42, bundleId: 'com.other' }, null]) {
      const { autoPaste, automation } = setup({ inspect: vi.fn(async () => facts({ front })) })
      expect(await autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'app-changed' })
      expect(automation.sendPaste).not.toHaveBeenCalled()
    }
  })

  it('never pastes into a password field or while secure input is on', async () => {
    for (const patch of [
      { secureInput: true },
      { focused: { ...field, role: 'AXTextField', subrole: 'AXSecureTextField' } },
      { focused: { ...field, role: 'AXSecureTextField' } },
    ]) {
      const { autoPaste, automation } = setup({ inspect: vi.fn(async () => facts(patch)) })
      expect(await autoPaste.paste('hunter2', notes)).toEqual({ delivery: 'skipped', reason: 'secure' })
      expect(automation.sendPaste).not.toHaveBeenCalled()
    }
  })

  it('does not paste without a text field that belongs to that app', async () => {
    for (const focused of [null, { ...field, role: 'AXButton', settable: false, chars: null }, { ...field, role: 'AXWebArea', settable: false }, { ...field, pid: 5 }]) {
      const { autoPaste, automation } = setup({ inspect: vi.fn(async () => facts({ focused })) })
      expect(await autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'no-target' })
      expect(automation.sendPaste).not.toHaveBeenCalled()
    }
  })

  it('recognizes text fields by role, or by a settable value with a length', () => {
    expect(isEditable({ role: 'AXTextField' })).toBe(true)
    expect(isEditable({ role: 'AXComboBox' })).toBe(true)
    expect(isEditable({ role: 'AXGroup', settable: true, chars: 3 })).toBe(true)
    expect(isEditable({ role: 'AXSlider', settable: true, chars: null })).toBe(false)
    expect(isEditable(null)).toBe(false)
  })

  it('skips when the app could not be read, or was Dictator itself', async () => {
    const { autoPaste, automation } = setup()
    expect(await autoPaste.paste('Hello.', null)).toEqual({ delivery: 'skipped', reason: 'no-app' })
    expect(await autoPaste.paste('Hello.', { pid: 7, bundleId: 'com.ezzy818.dictator' })).toEqual({ delivery: 'skipped', reason: 'self' })
    expect(automation.sendPaste).not.toHaveBeenCalled()
    const failing = setup({ frontmostApp: vi.fn(async () => Promise.reject(new Error('timeout'))) })
    expect(await failing.autoPaste.captureTarget()).toBe(null)
  })

  it('does nothing where it is not supported', async () => {
    const { autoPaste, automation } = setup({ isSupported: vi.fn(() => false) })
    expect(await autoPaste.captureTarget()).toBe(null)
    expect(await autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'unsupported' })
    expect(automation.frontmostApp).not.toHaveBeenCalled()
  })

  it('passes on the reason when the last check before ⌘V fails', async () => {
    const { autoPaste } = setup({ sendPaste: vi.fn(async () => ({ posted: false, reason: 'app-changed' })) })
    expect(await autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'app-changed' })
    const odd = setup({ sendPaste: vi.fn(async () => ({ posted: false, reason: 'something' })) })
    expect(await odd.autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'failed' })
  })

  it('treats a failed check as a skip, and a failed ⌘V call as an attempt it never repeats', async () => {
    const inspectFails = setup({ inspect: vi.fn(async () => Promise.reject(new Error('timeout'))) })
    expect(await inspectFails.autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'skipped', reason: 'failed' })
    expect(inspectFails.automation.sendPaste).not.toHaveBeenCalled()
    const pasteFails = setup({ sendPaste: vi.fn(async () => Promise.reject(new Error('timeout'))) })
    expect(await pasteFails.autoPaste.paste('Hello.', notes)).toEqual({ delivery: 'attempted', reason: 'failed' })
    expect(pasteFails.automation.sendPaste).toHaveBeenCalledTimes(1)
  })
})
