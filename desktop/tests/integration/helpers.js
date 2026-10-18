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

// Compiles the Auto-Paste helper first (macOS only; packaging copies it into the app).
export async function pack() {
  await run(process.execPath, [path.join(desktopRoot, 'scripts/build-helper.mjs')], { cwd: desktopRoot })
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

// Starts the app with the DICTATOR_E2E stdin hook (src/main/e2e.js) and a fake microphone, and
// returns helpers to send commands and wait for printed lines. userData keeps its settings apart.
// DICTATOR_PASTE_HELPER is empty so Auto-Paste is unavailable: a test never sends ⌘V to the
// app in front on a real Mac.
export function startApp({ userData }) {
  const args = ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  const [command, argv] = onLinux ? ['xvfb-run', ['-a', electronBinary, ...args, '--no-sandbox']] : [electronBinary, args]
  const child = spawn(command, argv, {
    cwd: desktopRoot,
    env: { ...process.env, ELECTRON_RENDERER_URL: '', DICTATOR_E2E: '1', DICTATOR_USER_DATA: userData, DICTATOR_PASTE_HELPER: '' },
  })
  const lines = []
  const waiters = []
  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i)
      buffer = buffer.slice(i + 1)
      const space = line.indexOf(' ')
      if (!line.startsWith('DICTATOR_')) continue
      const entry = { name: line.slice(0, space), value: JSON.parse(line.slice(space + 1)) }
      lines.push(entry)
      waiters.filter((w) => w.match(entry)).forEach((w) => w.resolve(entry.value))
    }
  })
  // Resolves with the first line called name that matches, among lines from index `from` on.
  const waitFor = (name, predicate = () => true, timeoutMs = 30_000, from = 0) => {
    const found = lines.slice(from).find((entry) => entry.name === name && predicate(entry.value))
    if (found) return Promise.resolve(found.value)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}. Seen: ${JSON.stringify(lines.slice(-20))}`)), timeoutMs)
      waiters.push({ match: (entry) => entry.name === name && predicate(entry.value), resolve: (value) => (clearTimeout(timer), resolve(value)) })
    })
  }
  const send = (text) => child.stdin.write(`${text}\n`)
  // Sends a command and waits for a line printed after it.
  const ask = (command, name, predicate, timeoutMs) => {
    const from = lines.length
    send(command)
    return waitFor(name, predicate, timeoutMs, from)
  }
  const states = () => lines.filter((entry) => entry.name === 'DICTATOR_STATE').map((entry) => entry.value)
  // Resolves once the app has exited, so its profile folder can be removed.
  const quit = () => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    const exited = new Promise((resolve) => child.once('exit', resolve))
    send('quit')
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
    return exited.then(() => clearTimeout(timer))
  }
  return { send, ask, waitFor, states, quit, child }
}
