// Builds the desktop app, launches it with --self-check and checks the shared API client reaches
// the backend at the address injected at build time: in a development build, a production build
// and the packaged app. A local stub stands in for the backend, so no OpenAI key is needed.
//
// Set DICTATOR_SKIP_PACKAGED=1 to skip the packaging step (it downloads nothing but takes longer).
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const desktopRoot = path.resolve(import.meta.dirname, '../..')
const bin = (name) => path.join(desktopRoot, 'node_modules/.bin', name)
const electronBinary = require('electron')
const onLinux = process.platform === 'linux'

let server
let baseUrl
const requests = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push({ url: req.url, origin: req.headers.origin ?? null })
    if (req.url === '/api/health') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ status: 'ok', openaiConfigured: true, transcriptionModel: 'stub-model' }))
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => server?.close())

function build(mode, apiBaseUrl) {
  const env = { ...process.env }
  delete env.DICTATOR_API_BASE_URL
  if (apiBaseUrl !== undefined) env.DICTATOR_API_BASE_URL = apiBaseUrl
  return run(bin('electron-vite'), ['build', '--mode', mode], { cwd: desktopRoot, env })
}

// Launches the app and returns the self-check report it prints before quitting.
function selfCheck(command, args = []) {
  // Containers run as root without a display: Chromium needs --no-sandbox there, and a virtual
  // X server. macOS needs neither.
  const full = onLinux ? ['xvfb-run', ['-a', command, ...args, '--no-sandbox', '--self-check']] : [command, [...args, '--self-check']]
  return new Promise((resolve, reject) => {
    const child = spawn(full[0], full[1], { cwd: desktopRoot, env: { ...process.env, ELECTRON_RENDERER_URL: '' } })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000)
    child.on('close', () => {
      clearTimeout(timer)
      const line = output.split('\n').find((l) => l.startsWith('DICTATOR_SELF_CHECK '))
      if (!line) return reject(new Error(`No self-check report. Output:\n${output}`))
      resolve(JSON.parse(line.slice('DICTATOR_SELF_CHECK '.length)))
    })
  })
}

function expectHealthyReport(report, { packaged }) {
  expect(report).toMatchObject({
    apiBaseUrl: baseUrl,
    packaged,
    visible: false,
    renderer: { indicator: true, bridge: true, node: false },
    server: 'ready',
    transcriptionModel: 'stub-model',
  })
}

describe('desktop build and launch', () => {
  it('refuses a production build without a backend address', async () => {
    await expect(build('production', '')).rejects.toThrow(/DICTATOR_API_BASE_URL is not set/)
  })

  it('injects the local backend into a development build by default', async () => {
    await build('development')
    const main = fs.readFileSync(path.join(desktopRoot, 'out/main/index.js'), 'utf8')
    expect(main).toContain('"http://localhost:3001"')
  })

  it('injects the configured address into a production build', async () => {
    await build('production', 'https://dictator-api.example.test/')
    const main = fs.readFileSync(path.join(desktopRoot, 'out/main/index.js'), 'utf8')
    expect(main).toContain('"https://dictator-api.example.test"')
    expect(main).not.toContain('localhost:3001')
  })

  it('reaches the backend from a development build, without an Origin header', async () => {
    await build('development', baseUrl)
    requests.length = 0
    expectHealthyReport(await selfCheck(electronBinary, ['.']), { packaged: false })
    expect(requests).toEqual([{ url: '/api/health', origin: null }])
  })

  it('reaches the backend from a production build', async () => {
    await build('production', baseUrl)
    expectHealthyReport(await selfCheck(electronBinary, ['.']), { packaged: false })
  })

  it.skipIf(process.env.DICTATOR_SKIP_PACKAGED === '1')('reaches the backend from the packaged app', async () => {
    await build('production', baseUrl)
    await run(bin('electron-builder'), ['--dir', '--publish', 'never'], { cwd: desktopRoot, env: process.env, maxBuffer: 64 * 1024 * 1024 })
    const executable = onLinux
      ? path.join(desktopRoot, 'release/linux-unpacked', 'dictator-desktop')
      : path.join(desktopRoot, `release/mac${process.arch === 'arm64' ? '-arm64' : ''}/Dictator.app/Contents/MacOS/Dictator`)
    requests.length = 0
    expectHealthyReport(await selfCheck(executable), { packaged: true })
    expect(requests).toEqual([{ url: '/api/health', origin: null }])
  })
})
