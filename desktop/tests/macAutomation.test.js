import { describe, expect, it, vi } from 'vitest'

const systemPreferences = { isTrustedAccessibilityClient: vi.fn(() => true) }
vi.mock('electron', () => ({ shell: { openExternal: vi.fn() }, systemPreferences }))
const { createHelperRunner, createMacAutomation } = await import('../src/main/macAutomation.js')

describe('macOS automation', () => {
  it('runs the helper with its command and parses the JSON line', async () => {
    const run = vi.fn(async () => '{"posted":true,"confirmed":true}\n')
    const helper = createHelperRunner('/Resources/dictator-paste', run)
    expect(await helper('paste', 42, 16)).toEqual({ posted: true, confirmed: true })
    expect(run).toHaveBeenCalledWith('/Resources/dictator-paste', ['paste', '42', '16'])
  })

  it('maps the Auto-Paste calls onto helper commands', async () => {
    const run = vi.fn(async (command) => (command === 'front' ? { front: { pid: 3, bundleId: 'com.apple.TextEdit' } } : { ok: true }))
    const automation = createMacAutomation({ helperPath: '/x', platform: 'darwin', exists: () => true, run })
    expect(automation.isSupported()).toBe(true)
    expect(automation.isTrusted()).toBe(true)
    // Checked without a prompt.
    expect(systemPreferences.isTrustedAccessibilityClient).toHaveBeenCalledWith(false)
    expect(await automation.frontmostApp()).toEqual({ pid: 3, bundleId: 'com.apple.TextEdit' })
    await automation.inspect(3)
    await automation.sendPaste({ pid: 3, expectedChars: 20 })
    await automation.sendPaste({ pid: 3, expectedChars: null })
    expect(run.mock.calls).toEqual([['front'], ['inspect', 3], ['paste', 3, 20], ['paste', 3]])
  })

  it('is unsupported off macOS or without the helper, and then never runs it', () => {
    const run = vi.fn()
    for (const options of [{ platform: 'linux', exists: () => true }, { platform: 'darwin', exists: () => false }]) {
      const automation = createMacAutomation({ helperPath: '/x', run, ...options })
      expect(automation.isSupported()).toBe(false)
      expect(automation.isTrusted()).toBe(false)
    }
    expect(run).not.toHaveBeenCalled()
  })
})
