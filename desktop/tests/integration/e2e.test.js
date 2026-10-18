// The whole dictation flow in the real app: "hotkey" presses (over the DICTATOR_E2E stdin hook),
// Chromium's fake microphone recording in the hidden window, the floating indicator, the real
// backend app with a fake OpenAI client, and the system clipboard. Needs backend dependencies.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { build, desktopRoot, electronBinary, onLinux } from './helpers.js'

const backendReady = fs.existsSync(path.resolve(desktopRoot, '../backend/node_modules/express'))
let server
let refineFails = false
let userData
let app

beforeAll(async () => {
  if (!backendReady) return
  const { createTestApp } = await import('../../../backend/tests/helpers.js')
  const openai = {
    audio: { transcriptions: { create: async () => ({ text: 'um I think we should use PostgreSQL 我觉得' }) } },
    responses: {
      create: async () => {
        if (refineFails) throw Object.assign(new Error('boom'), { status: 500 })
        await new Promise((resolve) => setTimeout(resolve, 400))
        return { status: 'completed', output_text: 'I think we should use PostgreSQL. 我觉得' }
      },
    },
  }
  ;({ app: server } = { app: createTestApp({ openai }).app.listen(0, '127.0.0.1') })
  await new Promise((resolve) => server.once('listening', resolve))
  await build('development', `http://127.0.0.1:${server.address().port}`)
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dictator-e2e-'))
})

afterEach(() => app?.quit())
afterAll(() => {
  server?.close()
  if (userData) fs.rmSync(userData, { recursive: true, force: true })
})

// Starts the app and returns helpers to send commands and wait for printed lines.
function start() {
  const args = ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  const [command, argv] = onLinux ? ['xvfb-run', ['-a', electronBinary, ...args, '--no-sandbox']] : [electronBinary, args]
  const child = spawn(command, argv, {
    cwd: desktopRoot,
    env: { ...process.env, ELECTRON_RENDERER_URL: '', DICTATOR_E2E: '1', DICTATOR_USER_DATA: userData },
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
  const waitFor = (name, predicate = () => true, timeoutMs = 30_000) => {
    const found = lines.find((entry) => entry.name === name && predicate(entry.value))
    if (found) return Promise.resolve(found.value)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}. Seen: ${JSON.stringify(lines)}`)), timeoutMs)
      waiters.push({ match: (entry) => entry.name === name && predicate(entry.value), resolve: (value) => (clearTimeout(timer), resolve(value)) })
    })
  }
  const send = (text) => child.stdin.write(`${text}\n`)
  const states = () => lines.filter((entry) => entry.name === 'DICTATOR_STATE').map((entry) => entry.value)
  const quit = () => {
    send('quit')
    setTimeout(() => child.kill('SIGKILL'), 3000)
  }
  return { send, waitFor, states, quit, child }
}

describe.skipIf(!backendReady)('dictation end to end', () => {
  it('press, speak, press: copies the refined text and shows each state', async () => {
    refineFails = false
    app = start()
    const ready = await app.waitFor('DICTATOR_E2E_READY')
    expect(ready.hotkeyOk).toBe(true)
    app.send('toggle')
    const recording = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'recording')
    expect(recording.indicatorVisible).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    app.send('toggle')
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'processing')
    // A press while transcribing is ignored with a notice.
    await new Promise((resolve) => setTimeout(resolve, 350))
    app.send('toggle')
    const done = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'done')
    expect(done).toMatchObject({ outcome: 'refined', message: 'Copied to clipboard', indicatorVisible: true })
    expect(app.states().some((s) => s.notice === 'Still transcribing. Please wait.')).toBe(true)
    app.send('clipboard')
    expect(await app.waitFor('DICTATOR_CLIPBOARD')).toBe('I think we should use PostgreSQL. 我觉得')
    // The indicator hides again after the result.
    const idle = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'idle' && !s.notice)
    expect(idle.indicatorVisible).toBe(false)
  })

  it('copies the raw transcript with a warning when refinement fails', async () => {
    refineFails = true
    app = start()
    await app.waitFor('DICTATOR_E2E_READY')
    app.send('toggle')
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'recording')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    app.send('toggle')
    const done = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'done')
    expect(done).toMatchObject({ outcome: 'raw', message: 'Copied raw transcript (refinement failed)' })
    app.send('clipboard')
    expect(await app.waitFor('DICTATOR_CLIPBOARD')).toBe('um I think we should use PostgreSQL 我觉得')
  })

  it('recovers from a recorder page crash mid-recording', async () => {
    refineFails = false
    app = start()
    await app.waitFor('DICTATOR_E2E_READY')
    app.send('toggle')
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'recording')
    app.send('crash-renderer')
    const failed = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'done')
    expect(failed).toMatchObject({ outcome: 'failed', code: 'recording-failed' })
    // The page reloads; the next dictation works.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    app.send('toggle')
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'recording' && s.startedAt)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    app.send('toggle')
    const done = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'done' && s.outcome === 'refined')
    expect(done.message).toBe('Copied to clipboard')
  })

  it('reports a too-short recording and copies nothing', async () => {
    app = start()
    await app.waitFor('DICTATOR_E2E_READY')
    app.send('toggle')
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'recording')
    await new Promise((resolve) => setTimeout(resolve, 320))
    app.send('toggle')
    const done = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'done')
    expect(done).toMatchObject({ outcome: 'failed', code: 'too-short' })
  })
})
