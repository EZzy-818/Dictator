import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { sharedResolve } from './electron.vite.config.mjs'

export default defineConfig({
  plugins: [react()],
  resolve: sharedResolve,
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/*.test.{js,jsx}'], environment: 'jsdom' },
      },
      {
        extends: true,
        // Builds the app and launches Electron, so slower than the unit tests.
        test: { name: 'integration', include: ['tests/integration/*.test.js'], environment: 'node', testTimeout: 180_000, hookTimeout: 180_000 },
      },
    ],
  },
})
