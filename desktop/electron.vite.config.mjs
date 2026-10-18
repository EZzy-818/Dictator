import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'electron-vite'
import { resolveApiBaseUrl } from './config.mjs'

const desktopRoot = import.meta.dirname
const repoRoot = path.resolve(desktopRoot, '..')

// The web app's source, imported directly rather than copied (see docs/desktop.md).
export const sharedAlias = { '@frontend': path.resolve(repoRoot, 'frontend/src') }

// Shared files live in frontend/, which may have its own node_modules. Without dedupe they would
// get a second copy of React from there, and hooks would fail with "Invalid hook call".
export const sharedResolve = { alias: sharedAlias, dedupe: ['react', 'react-dom'] }

export default defineConfig(({ command, mode }) => {
  const production = command === 'build' && mode === 'production'
  const env = loadEnv(mode, desktopRoot, 'DICTATOR_')
  const apiBaseUrl = resolveApiBaseUrl(process.env.DICTATOR_API_BASE_URL ?? env.DICTATOR_API_BASE_URL, { production })

  return {
    main: {
      resolve: sharedResolve,
      // The shared API client reads its address from this Vite variable, as it does on the web.
      define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl) },
    },
    preload: {
      build: {
        // Sandboxed preload scripts must be CommonJS.
        rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
      },
    },
    renderer: {
      resolve: sharedResolve,
      plugins: [react()],
      // The dev server may read the shared frontend files, nothing else outside desktop/.
      server: { fs: { allow: [desktopRoot, path.resolve(repoRoot, 'frontend/src')] } },
    },
  }
})
