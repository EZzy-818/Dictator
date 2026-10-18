// Desktop acceptance on a real Mac: the real microphone, the real backend and the real clipboard.
// macOS text-to-speech (`say`) speaks each test sentence through the speakers while the app
// records, so turn the volume up and do not use headphones.
//
// Needs: a development build pointing at the backend to test (npm run build --prefix desktop -- --mode development,
// which uses http://localhost:3001 unless DICTATOR_API_BASE_URL is set), that backend running
// with a real OPENAI_API_KEY, and microphone access granted to Electron.
//
// Usage: node desktop/scripts/acceptance-mac.mjs [--levels=none,light,medium] [--cases=A,B] [--out=results.md]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const desktopRoot = path.resolve(import.meta.dirname, '..')
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const levels = arg('levels', 'none,light,medium').split(',')
const only = arg('cases', '')
const out = arg('out', '')

const CASES = [
  { id: 'A', name: 'English', voice: 'Samantha', text: 'I want to schedule a meeting on Monday, actually Wednesday at 3 PM.' },
  { id: 'B', name: 'Mandarin', voice: 'Tingting', text: '我想下周二开会，嗯，不对，下周三下午三点。' },
  { id: 'C', name: 'Mandarin + English', voice: 'Tingting', text: '我觉得这个项目我们应该用 MongoDB，啊不对，用 PostgreSQL 会更合适。' },
  { id: 'D', name: 'Hindi', voice: 'Lekha', text: 'मैं कल सुबह दस बजे ऑफिस जाऊंगा, उम, नहीं, ग्यारह बजे।' },
  { id: 'E', name: 'Hindi + English', voice: 'Lekha', text: 'कल की मीटिंग में हम deployment plan discuss करेंगे, और फिर budget finalize करेंगे।' },
].filter((c) => !only || only.split(',').includes(c.id))

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))))
  })
}

function startApp() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'dictator-acceptance-'))
  const child = spawn(require('electron'), ['.'], {
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
      if (!line.startsWith('DICTATOR_')) continue
      const space = line.indexOf(' ')
      const entry = { name: line.slice(0, space), value: JSON.parse(line.slice(space + 1)) }
      lines.push(entry)
      for (const w of [...waiters]) {
        if (!w.match(entry)) continue
        waiters.splice(waiters.indexOf(w), 1)
        w.resolve(entry.value)
      }
    }
  })
  child.stderr.on('data', () => {})
  const waitFor = (name, predicate = () => true, timeoutMs = 240_000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeoutMs)
      waiters.push({ match: (e) => e.name === name && predicate(e.value), resolve: (v) => (clearTimeout(timer), resolve(v)) })
    })
  const send = (text) => child.stdin.write(`${text}\n`)
  return { child, waitFor, send, quit: () => (send('quit'), setTimeout(() => child.kill(), 3000), fs.rmSync(userData, { recursive: true, force: true })) }
}

const app = startApp()
await app.waitFor('DICTATOR_E2E_READY', () => true, 30_000)
const results = []
for (const level of levels) {
  app.send(`level ${level}`)
  for (const testCase of CASES) {
    app.send('toggle')
    const started = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'recording' || s.phase === 'done')
    if (started.phase === 'done') {
      results.push({ ...testCase, level, outcome: started.outcome, message: started.message, clipboard: '' })
      continue
    }
    await new Promise((r) => setTimeout(r, 400))
    await run('say', ['-v', testCase.voice, testCase.text])
    await new Promise((r) => setTimeout(r, 600))
    const t0 = Date.now()
    app.send('toggle')
    const done = await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'done')
    const ms = Date.now() - t0
    app.send('clipboard')
    const clipboard = done.outcome === 'refined' || done.outcome === 'raw' ? await app.waitFor('DICTATOR_CLIPBOARD') : ''
    results.push({ ...testCase, level, outcome: done.outcome, message: done.message, clipboard, ms })
    console.log(`${testCase.id} ${testCase.name} [${level}] ${done.outcome} (${ms} ms): ${clipboard || done.message}`)
    // Let the result clear before the next press.
    await app.waitFor('DICTATOR_STATE', (s) => s.phase === 'idle' && !s.notice, 10_000).catch(() => {})
  }
}
app.quit()

const escape = (text) => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
const table = [
  '| Case | Level | Outcome | Stop → copied | Spoken | Clipboard |',
  '| --- | --- | --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.id}. ${r.name} | ${r.level} | ${r.outcome} | ${r.ms ? `${(r.ms / 1000).toFixed(1)} s` : ''} | ${escape(r.text)} | ${escape(r.clipboard || r.message)} |`),
].join('\n')
console.log(`\n${table}`)
if (out) fs.writeFileSync(out, `${table}\n`)
