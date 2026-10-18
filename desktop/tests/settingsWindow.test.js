import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: {}, nativeTheme: {} }))
const { createSettingsWindows } = await import('../src/main/settingsWindow.js')

function fakeWindow() {
  const listeners = {}
  return {
    destroyed: false,
    show: vi.fn(),
    focus: vi.fn(),
    on: (name, fn) => (listeners[name] = fn),
    isDestroyed() {
      return this.destroyed
    },
    close() {
      this.destroyed = true
      listeners.closed?.()
    },
  }
}

describe('Settings window', () => {
  it('opens one window and focuses it when opened again', () => {
    const create = vi.fn(fakeWindow)
    const windows = createSettingsWindows(create)
    const first = windows.open()
    const second = windows.open()
    expect(second).toBe(first)
    expect(create).toHaveBeenCalledTimes(1)
    expect(first.show).toHaveBeenCalled()
    expect(first.focus).toHaveBeenCalled()
  })

  it('brings an existing window forward with the given activate function', () => {
    const activate = vi.fn()
    const windows = createSettingsWindows(fakeWindow, { activate })
    const win = windows.open()
    expect(activate).not.toHaveBeenCalled()
    windows.open()
    expect(activate).toHaveBeenCalledWith(win)
  })

  it('forgets a closed window and opens a fresh one next time', () => {
    const create = vi.fn(fakeWindow)
    const windows = createSettingsWindows(create)
    windows.open()
    windows.close()
    expect(windows.get()).toBe(null)
    windows.open()
    expect(create).toHaveBeenCalledTimes(2)
    // Closing when nothing is open is fine.
    windows.close()
    windows.close()
  })
})
