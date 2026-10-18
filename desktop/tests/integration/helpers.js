import { execFile, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
export const desktopRoot = path.resolve(import.meta.dirname, '../..')
export const bin = (name) => path.join(desktopRoot, 'node_modules/.bin', name)
export const electronBinary = require('electron')
export const onLinux = process.platform === 'linux'

export function build(mode, apiBaseUrl) {
  const env = { ...process.env }
  delete env.DICTATOR_API_BASE_URL
  if (apiBaseUrl !== undefined) env.DICTATOR_API_BASE_URL = apiBaseUrl
  return run(bin('electron-vite'), ['build', '--mode', mode], { cwd: desktopRoot, env })
}

export function pack() {
  return run(bin('electron-builder'), ['--dir', '--publish', 'never'], { cwd: desktopRoot, env: process.env, maxBuffer: 64 * 1024 * 1024 })
}

// Launches the app and returns the report it prints before quitting (--self-check by default).
export function launch(command, args = [], { mode = '--self-check', report = 'DICTATOR_SELF_CHECK' } = {}) {
  // Containers run as root without a display: Chromium needs --no-sandbox there, and a virtual
  // X server. macOS needs neither.
  const full = onLinux ? ['xvfb-run', ['-a', command, ...args, '--no-sandbox', mode]] : [command, [...args, mode]]
  return new Promise((resolve, reject) => {
    const child = spawn(full[0], full[1], { cwd: desktopRoot, env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000)
    child.on('close', () => {
      clearTimeout(timer)
      const line = output.split('\n').find((l) => l.startsWith(`${report} `))
      if (!line) return reject(new Error(`No ${report} report. Output:\n${output}`))
      resolve(JSON.parse(line.slice(report.length + 1)))
    })
  })
}
