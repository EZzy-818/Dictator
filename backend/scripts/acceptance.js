// Milestone 8 local acceptance tests A to E, run in a real browser against the running app.
// Speech for each test is synthesized with OpenAI text-to-speech and played into Chromium's
// fake microphone, so the browser records it with MediaRecorder exactly as it would a voice.
//
// Needs: the app running with a real OPENAI_API_KEY (npm run dev from the repository root),
// Playwright with Chromium (npm install -g playwright), and network access to OpenAI.
//
// Usage: npm run test:acceptance [-- --url=http://localhost:5173]
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { readWav, writeWav } from '../eval/noise.js'

dotenv.config({ quiet: true })

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('Playwright is not installed. Install it with: npm install -g playwright (and set NODE_PATH=$(npm root -g)).')
  process.exit(1)
}

const SAMPLES_DIR = path.resolve(import.meta.dirname, '../.live-samples/acceptance')
const APP_URL = process.argv.find((arg) => arg.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:5173'
const TTS_MODEL = 'gpt-4o-mini-tts'
const HAN = /\p{Script=Han}/u

const has = (text, ...terms) => terms.some((term) => text.toLowerCase().includes(term.toLowerCase()))

const TESTS = [
  {
    name: 'A. English',
    id: 'test-a',
    voice: 'alloy',
    speech: 'I want to schedule a meeting on Monday, actually Wednesday at 3 PM.',
    expected: 'I want to schedule a meeting on Wednesday at 3 PM.',
    check: ({ polished }) => has(polished, 'Wednesday') && has(polished, '3 PM', '3 p.m.', '3PM', 'three PM') && !has(polished, 'Monday'),
  },
  {
    name: 'B. Mandarin',
    id: 'test-b',
    voice: 'nova',
    speech: '我想下周二开会，嗯，不对，下周三下午三点。',
    expected: '我想下周三下午三点开会。',
    check: ({ polished }) => has(polished, '周三') && has(polished, '三点', '3点') && has(polished, '开会') && !has(polished, '周二', '嗯'),
  },
  {
    name: 'C. Mixed-language',
    id: 'test-c',
    voice: 'coral',
    speech: '我觉得这个项目我们应该用 MongoDB，啊不对，用 PostgreSQL 会更合适。',
    expected: '我觉得这个项目用 PostgreSQL 会更合适。',
    check: ({ polished }) => has(polished, 'PostgreSQL') && !has(polished, 'MongoDB', '不对') && HAN.test(polished),
    copy: '我觉得这个项目用 PostgreSQL 会更合适，backend 先用 Node.js（v22）。「已确认」✅',
  },
  {
    name: 'D. English-only clip',
    id: 'test-d-en',
    voice: 'echo',
    speech: 'The quarterly report is ready, so please review it before Friday.',
    expected: 'English transcript, no Chinese characters',
    check: ({ raw }) => !HAN.test(raw) && has(raw, 'quarterly report', 'Friday'),
  },
  {
    name: 'D. Mandarin-only clip',
    id: 'test-d-zh',
    voice: 'shimmer',
    speech: '季度报告已经准备好了，请大家在周五之前看一下。',
    expected: 'Chinese transcript, not translated',
    check: ({ raw }) => (raw.match(/\p{Script=Han}/gu)?.length ?? 0) >= 10 && !/[a-z]{3,}/i.test(raw),
  },
]

// Chromium needs a WAV with real chunk sizes, so the streamed TTS header is rewritten.
async function sample(client, test) {
  const file = path.join(SAMPLES_DIR, `${test.id}.wav`)
  let audio
  try {
    audio = await fs.readFile(file)
  } catch {
    const speech = await client.audio.speech.create({ model: TTS_MODEL, voice: test.voice, input: test.speech, response_format: 'wav' })
    audio = writeWav(readWav(Buffer.from(await speech.arrayBuffer())))
    await fs.mkdir(SAMPLES_DIR, { recursive: true })
    await fs.writeFile(file, audio)
  }
  const wav = readWav(audio)
  return { file, durationMs: (wav.samples.length / wav.channels / wav.sampleRate) * 1000 }
}

async function runTest(test, recording) {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${recording.file}%noloop`],
  })
  try {
    const context = await browser.newContext({ permissions: ['microphone', 'clipboard-read', 'clipboard-write'] })
    const page = await context.newPage()
    await page.goto(APP_URL)
    await page.getByRole('button', { name: 'Start Recording' }).click()
    await page.getByRole('button', { name: 'Stop Recording' }).waitFor()
    await page.waitForTimeout(recording.durationMs + 1000)
    await page.getByRole('button', { name: 'Stop Recording' }).click()
    await page.waitForFunction(() => ['completed', 'error'].includes(document.querySelector('main')?.dataset.state), null, { timeout: 180_000 })

    const state = await page.locator('main').getAttribute('data-state')
    const result = { state, alerts: await page.getByRole('alert').allTextContents(), raw: '', polished: '' }
    if (state === 'completed') {
      result.raw = await page.getByLabel('Raw transcript').inputValue()
      result.polished = await page.getByLabel('Polished text').inputValue()
    }
    await page.screenshot({ path: path.join(SAMPLES_DIR, `${test.id}.png`), fullPage: true })

    if (test.copy && state === 'completed') {
      await page.getByLabel('Polished text').fill(test.copy)
      await page.getByRole('button', { name: 'Copy', exact: true }).click()
      await page.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 5000 })
      result.clipboard = await page.evaluate(() => navigator.clipboard.readText())
    }
    return result
  } finally {
    await browser.close()
  }
}

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set. It is needed to synthesize the test speech.')
  process.exit(1)
}

const client = new OpenAI()
let failures = 0
console.log(`App: ${APP_URL}\n`)

for (const test of TESTS) {
  const recording = await sample(client, test)
  const result = await runTest(test, recording)
  const passed = result.state === 'completed' && test.check(result)
  if (!passed) failures++
  console.log(`## ${test.name}: ${passed ? 'PASS' : 'FAIL'}`)
  console.log(`spoken:   ${test.speech}`)
  console.log(`expected: ${test.expected}`)
  if (result.state !== 'completed') console.log(`state:    ${result.state} ${JSON.stringify(result.alerts)}`)
  console.log(`raw:      ${result.raw}`)
  console.log(`polished: ${result.polished}`)

  if (test.copy) {
    const copied = result.clipboard === test.copy
    if (!copied) failures++
    console.log(`\n## E. Copy edited mixed text: ${copied ? 'PASS' : 'FAIL'}`)
    console.log(`edited:    ${test.copy}`)
    console.log(`clipboard: ${result.clipboard ?? '(nothing copied)'}`)
  }
  console.log()
}

console.log(failures ? `${failures} check(s) failed.` : 'All acceptance checks passed.')
console.log(`Screenshots: ${SAMPLES_DIR}`)
process.exit(failures ? 1 : 0)
