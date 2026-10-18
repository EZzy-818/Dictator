// Sends a real Chromium recording through the desktop app's controller, shared API client and
// clipboard to the real backend app (backend/src/app.js) running locally with a fake OpenAI
// client. Checks the three outcomes: refined text copied, raw transcript copied when refinement
// fails, and clipboard untouched when transcription fails. Needs backend dependencies installed
// (npm install --prefix backend); skipped otherwise.
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, desktopRoot, electronBinary, launch } from './helpers.js'

const backendReady = fs.existsSync(path.resolve(desktopRoot, '../backend/node_modules/express'))
const fixture = path.resolve(desktopRoot, '../backend/tests/fixtures/chrome.webm')

let server
let behavior = 'ok'
const calls = []

beforeAll(async () => {
  if (!backendReady) return
  const { createTestApp } = await import('../../../backend/tests/helpers.js')
  const openai = {
    audio: {
      transcriptions: {
        create: async () => {
          calls.push('transcribe')
          if (behavior === 'transcription-fails') throw Object.assign(new Error('boom'), { status: 500 })
          return { text: behavior === 'mixed' ? '嗯 我们用 PostgreSQL, um, नमस्ते' : 'um so the meeting is on Monday' }
        },
      },
    },
    responses: {
      create: async () => {
        calls.push('refine')
        if (behavior === 'refinement-fails') throw Object.assign(new Error('boom'), { status: 500 })
        return { status: 'completed', output_text: behavior === 'mixed' ? '我们用 PostgreSQL，नमस्ते' : 'The meeting is on Monday.' }
      },
    },
  }
  const { app } = createTestApp({ openai })
  await new Promise((resolve) => (server = app.listen(0, '127.0.0.1', resolve)))
  await build('development', `http://127.0.0.1:${server.address().port}`)
})

afterAll(() => server?.close())

async function dictate(level, nextBehavior) {
  behavior = nextBehavior
  calls.length = 0
  return launch(electronBinary, ['.', `--level=${level}`], { mode: `--transcribe-test=${fixture}`, report: 'DICTATOR_TRANSCRIBE_TEST' })
}

describe.skipIf(!backendReady)('dictation through the real backend', () => {
  it('copies refined text at Light', async () => {
    const report = await dictate('light', 'ok')
    expect(report).toMatchObject({ outcome: 'refined', clipboard: 'The meeting is on Monday.', clipboardUntouched: false })
    expect(calls).toEqual(['transcribe', 'refine'])
  })

  it('copies the raw transcript at None without refining', async () => {
    const report = await dictate('none', 'ok')
    expect(report).toMatchObject({ outcome: 'refined', clipboard: 'um so the meeting is on Monday' })
    expect(calls).toEqual(['transcribe'])
  })

  it('refines at Medium and keeps mixed-language text intact', async () => {
    const report = await dictate('medium', 'mixed')
    expect(report).toMatchObject({ outcome: 'refined', clipboard: '我们用 PostgreSQL，नमस्ते' })
  })

  it('copies the raw transcript when refinement fails, as its own outcome', async () => {
    const report = await dictate('light', 'refinement-fails')
    expect(report).toMatchObject({
      outcome: 'raw',
      message: 'Copied raw transcript (refinement failed)',
      clipboard: 'um so the meeting is on Monday',
    })
  })

  it('leaves the clipboard untouched when transcription fails', async () => {
    const report = await dictate('light', 'transcription-fails')
    expect(report).toMatchObject({ outcome: 'failed', clipboardUntouched: true, clipboard: null })
    expect(report.message).toBeTruthy()
  })

  it('leaves the clipboard untouched when the server cannot be reached', async () => {
    const port = server.address().port
    await new Promise((resolve) => server.close(resolve))
    try {
      const report = await dictate('light', 'ok')
      expect(report).toMatchObject({ outcome: 'failed', code: 'network_error', clipboardUntouched: true })
    } finally {
      const { createTestApp } = await import('../../../backend/tests/helpers.js')
      await new Promise((resolve) => (server = createTestApp().app.listen(port, '127.0.0.1', resolve)))
    }
  })
})
