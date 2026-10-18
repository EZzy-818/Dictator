import { vi } from 'vitest'

// Electron's globalShortcut, with some accelerators already owned by "another app".
export function fakeShortcuts(taken = []) {
  const registered = new Map()
  return {
    registered,
    taken,
    register: vi.fn((accelerator, fn) => {
      if (taken.includes(accelerator) || registered.has(accelerator)) return false
      registered.set(accelerator, fn)
      return true
    }),
    unregister: vi.fn((accelerator) => registered.delete(accelerator)),
  }
}
