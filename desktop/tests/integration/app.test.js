// Builds the desktop app, launches it with --self-check and checks the shared API client reaches
// the backend at the address injected at build time: in a development build, a production build
// and the packaged app. A local stub stands in for the backend, so no OpenAI key is needed.
//
// Set DICTATOR_SKIP_PACKAGED=1 to skip the packaging step (it downloads nothing but takes longer).
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, desktopRoot, electronBinary, launch, onLinux, pack } from './helpers.js'

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
    expectHealthyReport(await launch(electronBinary, ['.']), { packaged: false })
    expect(requests).toEqual([{ url: '/api/health', origin: null }])
  })

  it('records in the hidden window with a fake microphone', async () => {
    // Uses the development build from the previous test. Chromium's fake device plays a beep.
    const report = await launch(electronBinary, ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], {
      mode: '--record-test=1500',
      report: 'DICTATOR_RECORD_TEST',
    })
    expect(report).toMatchObject({ access: 'granted', visibleWhileRecording: false, mimeType: 'audio/webm;codecs=opus' })
    expect(report.bytes).toBeGreaterThan(1000)
    expect(report.durationMs).toBeGreaterThanOrEqual(1400)
    expect(report.peak).toBeGreaterThan(0.01)
  })

  it('reaches the backend from a production build', async () => {
    await build('production', baseUrl)
    expectHealthyReport(await launch(electronBinary, ['.']), { packaged: false })
  })

  it.skipIf(process.env.DICTATOR_SKIP_PACKAGED === '1')('reaches the backend from the packaged app', async () => {
    await build('production', baseUrl)
    await pack()
    const executable = onLinux
      ? path.join(desktopRoot, 'release/linux-unpacked', 'dictator-desktop')
      : path.join(desktopRoot, `release/mac${process.arch === 'arm64' ? '-arm64' : ''}/Dictator.app/Contents/MacOS/Dictator`)
    requests.length = 0
    expectHealthyReport(await launch(executable), { packaged: true })
    expect(requests).toEqual([{ url: '/api/health', origin: null }])
  })
})
