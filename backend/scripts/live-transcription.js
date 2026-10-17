// Live smoke test for POST /api/process (transcription + refinement) against the real OpenAI API.
// Needs OPENAI_API_KEY and network access. Speech samples are synthesized with
// OpenAI text-to-speech, so they are clean studio-like audio, not real recordings.
//
// Usage: npm run test:live
import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { loadConfig, withoutUsageLimits } from '../src/config.js'

dotenv.config({ quiet: true })

const SAMPLES_DIR = path.resolve(import.meta.dirname, '../.live-samples')
const TTS_MODEL = 'gpt-4o-mini-tts'

const SAMPLES = [
  { name: 'english', script: "Let's meet on Wednesday at 3 PM to review the React and PostgreSQL migration." },
  { name: 'mandarin', script: '我们下周三下午三点开会，讨论数据库迁移的问题。' },
  { name: 'mixed', script: '我觉得这个 backend 应该用 Python，但是 frontend 还是用 React 比较好。' },
  // gpt-4o-transcribe with no language wrote the English sentences of these in Chinese.
  { name: 'mixed-english-led', script: 'Okay so the main problem is the API latency. 我看了一下监控，平均响应时间大概是八百毫秒，which is way too slow for our users.' },
  { name: 'mixed-sentences', script: '我跟客户聊了一下，他们说 they are not happy with the current timeline, and they want us to deliver by the end of November. 所以我们得重新排一下优先级。' },
]

async function ensureSample(client, sample) {
  const file = path.join(SAMPLES_DIR, `${sample.name}.wav`)
  try {
    return await fs.readFile(file)
  } catch {
    const speech = await client.audio.speech.create({
      model: TTS_MODEL,
      voice: 'alloy',
      input: sample.script,
      response_format: 'wav',
    })
    const audio = Buffer.from(await speech.arrayBuffer())
    await fs.mkdir(SAMPLES_DIR, { recursive: true })
    await fs.writeFile(file, audio)
    return audio
  }
}

// These runs send many requests in a row with your own key, so the public usage limits are off.
const config = withoutUsageLimits(loadConfig())
if (!config.openaiApiKey) {
  console.error('OPENAI_API_KEY is not set. Live tests need a real key.')
  process.exit(1)
}

const client = new OpenAI({ apiKey: config.openaiApiKey })
const app = createApp(config, { log: () => {} })
let failures = 0

console.log(`Transcription model: ${config.transcriptionModel}, refinement model: ${config.refinementModel}\n`)

for (const sample of SAMPLES) {
  const audio = await ensureSample(client, sample)
  console.log(`[${sample.name}] script:     ${sample.script}`)

  const res = await request(app)
    .post('/api/process')
    .attach('audio', audio, { filename: `${sample.name}.wav`, contentType: 'audio/wav' })

  if (res.status === 200) {
    console.log(`[${sample.name}] raw:        ${res.body.rawTranscript}`)
    console.log(`[${sample.name}] polished:   ${res.body.polishedTranscript} (${res.body.refinementStatus})`)
    if (res.body.refinementStatus !== 'success') failures++
  } else {
    failures++
    console.log(`[${sample.name}] HTTP ${res.status} ${res.body.code}: ${res.body.error}`)
  }
  console.log()
}

process.exit(failures ? 1 : 0)
