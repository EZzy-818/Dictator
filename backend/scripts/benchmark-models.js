// Model optimization benchmark (docs/model-benchmark.md): Baseline, A (faster transcription),
// B (faster refinement) and A+B, on the 36 recordings in eval/models-dataset.js.
//
// Stages, run in this order and resumable (finished calls are kept in <out>/<stage>.json):
//   audio       synthesize the recordings with text-to-speech (synthetic source only)
//   transcribe  transcription accuracy, before refinement, for each transcription model
//   refine      refinement quality on the reference transcripts, for each refinement model
//   e2e         full pipeline per configuration (refines the stage-1 transcripts)
//   latency     /api/process timings per configuration, backend in this process
//   browser     Stop → text displayed, in Chromium with the recording as its fake microphone
//               (needs the frontend served at --app-url, built for http://localhost:3001)
//   judge       blind LLM rubric scores for refine and e2e outputs (labelled as model-judged)
//   report      tables, review sheet and summary.json
//
// Every API call's estimated cost is logged to <out>/costs.jsonl. The run stops before a call
// once the total passes --cap dollars.
//
// Usage: node scripts/benchmark-models.js [--stages=transcribe,refine] [--source=synthetic|real]
//        [--out=.eval-runs/models] [--cap=12] [--only=en-5-a,zh-5-b] [--concurrency=4]
//        [--repeat-transcribe=3] [--repeat-refine=3] [--repeat-latency=5]
//        [--refiners=gpt-4.1,gpt-6-luna,gpt-5.4-mini] [--b=gpt-6-luna]
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { createApp } from '../src/app.js'
import { loadConfig, withoutUsageLimits } from '../src/config.js'
import { identifyAudio } from '../src/lib/audio.js'
import { audioDurationSeconds } from '../src/lib/duration.js'
import { transcribeAudio } from '../src/services/transcription.js'
import { refineTranscript } from '../src/services/refinement.js'
import { CASES, LATENCY_CASE_IDS } from '../eval/models-dataset.js'
import { buildTables } from '../eval/model-report.js'
import { readWav, writeWav } from '../eval/noise.js'

dotenv.config({ quiet: true })

const ROOT = path.resolve(import.meta.dirname, '..')

function option(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}
const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)

const STAGES = list(option('stages', 'audio,transcribe,refine,e2e,latency,judge,report'))
const SOURCE = option('source', 'synthetic')
const OUT = path.resolve(ROOT, option('out', `.eval-runs/models-${SOURCE}`))
const CAP = Number(option('cap', '12'))
const ONLY = option('only', null)
const CONCURRENCY = Number(option('concurrency', '4'))
const REPEAT = {
  transcribe: Number(option('repeat-transcribe', '3')),
  refine: Number(option('repeat-refine', '3')),
  latency: Number(option('repeat-latency', '5')),
  browser: Number(option('repeat-browser', '3')),
}
const APP_URL = option('app-url', 'http://localhost:4173')
const BROWSER_IDS = list(option('browser-ids', 'en-15-a,mixed-15-b'))

export const BASELINE_TRANSCRIBER = 'gpt-transcribe'
export const FAST_TRANSCRIBER = 'gpt-4o-mini-transcribe-2025-12-15'
export const NAME_CHECK = 'gpt-4o-transcribe'
export const BASELINE_REFINER = 'gpt-4.1'
const FAST_REFINER = option('b', 'gpt-6-luna')
const REFINERS = list(option('refiners', `${BASELINE_REFINER},gpt-6-luna,gpt-5.4-mini`))
const JUDGE = 'gpt-5.6-terra'
const TTS_MODEL = 'gpt-4o-mini-tts'

export const CONFIGS = [
  { name: 'Baseline', transcriber: BASELINE_TRANSCRIBER, refiner: BASELINE_REFINER },
  { name: 'A', transcriber: FAST_TRANSCRIBER, refiner: BASELINE_REFINER },
  { name: 'B', transcriber: BASELINE_TRANSCRIBER, refiner: FAST_REFINER },
  { name: 'A+B', transcriber: FAST_TRANSCRIBER, refiner: FAST_REFINER },
]

// Estimated list prices in dollars (OpenAI pricing page, October 2026). Transcription per minute
// of audio; text models per million tokens.
const PER_MINUTE = { 'gpt-transcribe': 0.0045, 'gpt-4o-mini-transcribe': 0.003, 'gpt-4o-transcribe': 0.006, 'gpt-4o-mini-tts': 0.015 }
const PER_MTOK = {
  'gpt-4.1': { input: 2, cached: 0.5, output: 8 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5 },
  'gpt-5.6-terra': { input: 2, cached: 0.2, output: 12 },
}
const baseModel = (model) => model.replace(/-\d{4}-\d{2}-\d{2}$/, '')

export function callCost({ kind, model, seconds, usage }) {
  const base = baseModel(model)
  if (kind === 'transcription' || kind === 'tts') return ((seconds ?? 0) / 60) * (PER_MINUTE[base] ?? 0)
  const price = PER_MTOK[base]
  if (!price || !usage) return 0
  const cached = usage.input_tokens_details?.cached_tokens ?? 0
  return ((usage.input_tokens - cached) * price.input + cached * price.cached + usage.output_tokens * price.output) / 1e6
}

// Cost ledger, persisted so a resumed run counts what was already spent.
async function openLedger() {
  const file = path.join(OUT, 'costs.jsonl')
  const previous = await fs.readFile(file, 'utf8').catch(() => '')
  let total = previous.split('\n').filter(Boolean).reduce((sum, line) => sum + JSON.parse(line).cost, 0)
  return {
    get total() {
      return total
    },
    check() {
      if (total >= CAP) throw Object.assign(new Error(`Spending cap of $${CAP} reached ($${total.toFixed(2)}).`), { cap: true })
    },
    async add(entry) {
      const cost = callCost(entry)
      total += cost
      await fs.appendFile(file, `${JSON.stringify({ time: new Date().toISOString(), stage: entry.stage, kind: entry.kind, model: entry.model, seconds: entry.seconds, usage: entry.usage, cost })}\n`)
    },
  }
}

// An OpenAI client that times and prices every call. meta (stage, audio seconds) can change
// between calls; calls collects this wrapper's calls in order.
function instrument(client, ledger, meta = {}) {
  const calls = []
  const record = async (entry) => {
    calls.push(entry)
    await ledger.add({ ...meta, ...entry })
  }
  const wrapped = {
    meta,
    calls,
    audio: {
      transcriptions: {
        async create(body, options) {
          ledger.check()
          const started = performance.now()
          try {
            const response = await client.audio.transcriptions.create(body, options)
            await record({ kind: 'transcription', model: body.model, seconds: meta.seconds, ms: performance.now() - started, text: response.text, ok: true })
            return response
          } catch (err) {
            // A stopped name check may still be billed, so it is counted.
            await record({ kind: 'transcription', model: body.model, seconds: meta.seconds, ms: performance.now() - started, ok: false, error: err.name })
            throw err
          }
        },
      },
    },
    responses: {
      async create(body, options) {
        ledger.check()
        const started = performance.now()
        const response = await client.responses.create(body, options)
        await record({ kind: 'response', model: body.model, ms: performance.now() - started, usage: response.usage })
        return response
      },
    },
  }
  return wrapped
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = []
  let next = 0
  let stop = null
  async function run() {
    while (next < items.length && !stop) {
      const index = next++
      try {
        results[index] = await worker(items[index], index)
      } catch (err) {
        if (err.cap) stop = err
        else throw err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  if (stop) throw stop
  return results
}

// Results of one stage, keyed so a resumed run skips what is done.
async function openStage(name) {
  const file = path.join(OUT, `${name}.json`)
  const rows = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '[]'))
  const done = new Set(rows.map((row) => row.key))
  let writing = Promise.resolve()
  return {
    rows,
    has: (key) => done.has(key),
    add(row) {
      rows.push(row)
      done.add(row.key)
      writing = writing.then(() => fs.writeFile(file, JSON.stringify(rows, null, 1)))
      return writing
    },
    flush: () => writing,
  }
}

const cases = ONLY ? CASES.filter((c) => list(ONLY).includes(c.id)) : CASES
const SAMPLE_DIR = path.join(ROOT, '.eval-samples', SOURCE, 'models')
const AUDIO_TYPES = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', m4a: 'audio/mp4', wav: 'audio/wav', mp3: 'audio/mpeg' }
const TTS_STYLE =
  'Speak like a person dictating a quick note: natural pace, relaxed and conversational. Say every filler word (um, uh, 嗯, 呃, उम्म, अं) as a short hesitation, exactly as written, and say every self-correction as written. Read Chinese in Mandarin, Hindi in Hindi and English words in English.'

// Your own recordings may come with a manifest of what was actually said:
// .eval-samples/real/models/manifest.json = [{ "id": "en-5-a", "reference": "..." }].
async function referenceOverrides() {
  if (SOURCE === 'synthetic') return {}
  const manifest = JSON.parse(await fs.readFile(path.join(SAMPLE_DIR, 'manifest.json'), 'utf8').catch(() => '[]'))
  return Object.fromEntries(manifest.map((entry) => [entry.id, entry.reference]))
}

async function findRecording(id) {
  for (const extension of Object.keys(AUDIO_TYPES)) {
    const file = path.join(SAMPLE_DIR, `${id}.${extension}`)
    const buffer = await fs.readFile(file).catch(() => null)
    if (buffer && !(SOURCE === 'synthetic' && extension === 'wav')) return { file, buffer, extension }
  }
  return null
}

async function stageAudio(client, ledger) {
  if (SOURCE !== 'synthetic') return
  await fs.mkdir(SAMPLE_DIR, { recursive: true })
  await pool(cases, async (c) => {
    if (await findRecording(c.id)) return
    ledger.check()
    const speech = await client.audio.speech.create({ model: TTS_MODEL, voice: c.voice, input: c.script, instructions: TTS_STYLE, response_format: 'wav' })
    const wav = path.join(SAMPLE_DIR, `${c.id}.wav`)
    const webm = path.join(SAMPLE_DIR, `${c.id}.webm`)
    await fs.writeFile(wav, Buffer.from(await speech.arrayBuffer()))
    // Chrome's MediaRecorder uploads WebM/Opus, so the API sees the same format as in the app.
    await promisify(execFile)('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', webm])
    const buffer = await fs.readFile(webm)
    const seconds = await audioDurationSeconds(buffer, identifyAudio(buffer, 'audio/webm'))
    await ledger.add({ stage: 'audio', kind: 'tts', model: TTS_MODEL, seconds })
    console.log(`audio ${c.id}: ${seconds?.toFixed(1)} s`)
  })
}

async function loadSamples() {
  const samples = {}
  for (const c of cases) {
    const recording = await findRecording(c.id)
    if (!recording) continue
    const format = identifyAudio(recording.buffer, AUDIO_TYPES[recording.extension])
    samples[c.id] = { buffer: recording.buffer, format, seconds: await audioDurationSeconds(recording.buffer, format) }
  }
  return samples
}

async function stageTranscribe(client, ledger, samples) {
  const stage = await openStage('transcribe')
  const jobs = []
  for (let rep = 1; rep <= REPEAT.transcribe; rep++) {
    for (const c of cases) {
      for (const model of [BASELINE_TRANSCRIBER, FAST_TRANSCRIBER]) {
        const key = `${model}|${c.id}|${rep}`
        if (samples[c.id] && !stage.has(key)) jobs.push({ key, model, c, rep })
      }
    }
  }
  await pool(jobs, async ({ key, model, c, rep }) => {
    const sample = samples[c.id]
    const wrapped = instrument(client, ledger, { stage: 'transcribe', seconds: sample.seconds })
    const started = performance.now()
    let text = null
    let error = null
    try {
      text = await transcribeAudio({ client: wrapped, model, nameCheckModel: NAME_CHECK, audio: { buffer: sample.buffer, ...sample.format } })
    } catch (err) {
      if (err.cap) throw err
      error = err.code ?? err.name
    }
    const totalMs = performance.now() - started
    const primary = wrapped.calls.find((call) => call.model === model)
    const check = wrapped.calls.find((call) => call.model === NAME_CHECK)
    await stage.add({
      key,
      id: c.id,
      model,
      rep,
      seconds: sample.seconds,
      text,
      primaryText: primary?.text ?? null,
      nameCheckText: check?.text ?? null,
      error,
      totalMs,
      primaryMs: primary?.ms ?? null,
      nameCheckMs: check?.ms ?? null,
      nameCheckUsed: Boolean(check?.ok),
    })
    console.log(`transcribe ${model} ${c.id} #${rep}: ${Math.round(totalMs)} ms${error ? ` ${error}` : ''}  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

async function refineOnce(client, ledger, stageName, model, transcript, level) {
  const wrapped = instrument(client, ledger, { stage: stageName })
  const started = performance.now()
  let output = null
  let error = null
  try {
    output = await refineTranscript({ client: wrapped, model, transcript, level })
  } catch (err) {
    if (err.cap) throw err
    error = err.code ?? err.name
  }
  return { output, error, ms: performance.now() - started, calls: wrapped.calls.length, usage: wrapped.calls.map((call) => call.usage) }
}

async function stageRefine(client, ledger, references) {
  const stage = await openStage('refine')
  const jobs = []
  for (let rep = 1; rep <= REPEAT.refine; rep++) {
    for (const c of cases) {
      for (const level of ['light', 'medium']) {
        for (const model of REFINERS) {
          const key = `${model}|${c.id}|${level}|${rep}`
          if (!stage.has(key)) jobs.push({ key, model, c, level, rep })
        }
      }
    }
  }
  await pool(jobs, async ({ key, model, c, level, rep }) => {
    const input = references[c.id]
    const result = await refineOnce(client, ledger, 'refine', model, input, level)
    await stage.add({ key, id: c.id, model, level, rep, input, ...result })
    console.log(`refine ${model} ${level} ${c.id} #${rep}: ${Math.round(result.ms)} ms${result.error ? ` ${result.error}` : ''}  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

async function stageE2E(client, ledger) {
  const transcripts = await openStage('transcribe')
  const stage = await openStage('e2e')
  const jobs = []
  for (const config of CONFIGS) {
    for (const c of cases) {
      const row = transcripts.rows.find((r) => r.model === config.transcriber && r.id === c.id && r.rep === 1)
      if (!row) continue
      for (const level of ['none', 'light', 'medium']) {
        const key = `${config.name}|${c.id}|${level}`
        if (!stage.has(key)) jobs.push({ key, config, c, level, transcript: row.text, transcriptError: row.error })
      }
    }
  }
  await pool(jobs, async ({ key, config, c, level, transcript, transcriptError }) => {
    const base = { key, config: config.name, transcriber: config.transcriber, refiner: config.refiner, id: c.id, level, transcript }
    if (!transcript) return stage.add({ ...base, output: null, error: transcriptError ?? 'no_transcript' })
    const result = await refineOnce(client, ledger, 'e2e', config.refiner, transcript, level)
    await stage.add({ ...base, ...result })
    console.log(`e2e ${config.name} ${level} ${c.id}: ${result.error ?? 'ok'}  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

async function timeRequest(baseUrl, sample, level, requestId) {
  const form = new FormData()
  form.append('requestId', requestId)
  form.append('refinementLevel', level)
  form.append('audio', new Blob([sample.buffer], { type: sample.format.mimeType }), `recording.${sample.format.extension}`)
  const started = performance.now()
  const res = await fetch(`${baseUrl}/api/process`, { method: 'POST', body: form })
  const body = await res.json().catch(() => null)
  return { status: res.status, body, roundTripMs: performance.now() - started }
}

async function stageLatency(client, ledger, samples) {
  const stage = await openStage('latency')
  const config = { ...withoutUsageLimits(loadConfig()), exposeTimings: true }
  const wrapped = instrument(client, ledger, { stage: 'latency' })
  const servers = []
  const targets = {}
  for (const c of CONFIGS) {
    const app = createApp({ ...config, transcriptionModel: c.transcriber, refinementModel: c.refiner, nameCheckModel: NAME_CHECK }, { openai: wrapped, log: () => {} })
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })
    servers.push(server)
    targets[c.name] = `http://127.0.0.1:${server.address().port}`
  }
  const ids = LATENCY_CASE_IDS.filter((id) => samples[id] && cases.some((c) => c.id === id))
  try {
    if (!ids.length) return
    // One untimed request per configuration, so connection setup is not in the first timed run.
    if (!stage.rows.length) {
      for (const c of CONFIGS) {
        wrapped.meta.seconds = samples[ids[0]].seconds
        await timeRequest(targets[c.name], samples[ids[0]], 'light', `warmup-${c.name}`)
      }
    }
    // Repeats outermost and configurations innermost, so API speed drifting over the run
    // affects every configuration alike. None never calls the refiner, so only Baseline and A run it.
    for (let rep = 1; rep <= REPEAT.latency; rep++) {
      for (const id of ids) {
        for (const level of ['none', 'light', 'medium']) {
          for (const c of CONFIGS) {
            if (level === 'none' && c.refiner !== BASELINE_REFINER) continue
            const key = `${c.name}|${id}|${level}|${rep}`
            if (stage.has(key)) continue
            const sample = samples[id]
            wrapped.meta.seconds = sample.seconds
            const firstCall = wrapped.calls.length
            const { status, body, roundTripMs } = await timeRequest(targets[c.name], sample, level, `models-${c.name}-${id}-${level}-${rep}`)
            const calls = wrapped.calls.slice(firstCall)
            const t = body?.timings ?? {}
            const primary = calls.find((call) => call.model === c.transcriber)
            const check = calls.find((call) => call.model === NAME_CHECK)
            const refinement = calls.filter((call) => call.kind === 'response')
            await stage.add({
              key,
              config: c.name,
              id,
              level,
              rep,
              seconds: sample.seconds,
              ok: status === 200 && (level === 'none' || body?.refinementStatus === 'success'),
              status,
              code: body?.code,
              refinementStatus: body?.refinementStatus,
              roundTripMs,
              serverTotalMs: t.totalMs ?? null,
              transcriptionMs: t.transcriptionMs ?? null,
              refinementMs: t.refinementMs ?? null,
              receiveMs: t.receiveMs ?? null,
              overheadMs: t.overheadMs ?? null,
              primaryMs: primary?.ms ?? null,
              nameCheckMs: check?.ms ?? null,
              refinementCalls: refinement.length,
              cost: calls.reduce((sum, call) => sum + callCost({ ...call, seconds: call.kind === 'transcription' ? sample.seconds : undefined }), 0),
              raw: body?.rawTranscript ?? null,
              polished: body?.polishedTranscript ?? null,
            })
            console.log(`latency #${rep} ${id} ${level.padEnd(6)} ${c.name.padEnd(8)} ${Math.round(roundTripMs)} ms  transcription ${t.transcriptionMs ?? '—'}  refinement ${t.refinementMs ?? '—'}  ($${ledger.total.toFixed(3)})`)
          }
        }
      }
    }
  } finally {
    for (const server of servers) server.close()
    await stage.flush()
  }
}

// One browser per recording, because Chromium plays the fake microphone file once from launch.
// The backend for every configuration answers on port 3001 (the frontend's default API address);
// `current` picks which one serves the next recording.
async function stageBrowser(client, ledger, samples) {
  const require = createRequire(import.meta.url)
  const { chromium } = require('playwright')
  const stage = await openStage('browser')
  const config = { ...withoutUsageLimits(loadConfig()), exposeTimings: true, corsOrigins: [new URL(APP_URL).origin] }
  const wrapped = instrument(client, ledger, { stage: 'browser' })
  const apps = Object.fromEntries(
    CONFIGS.map((c) => [c.name, createApp({ ...config, transcriptionModel: c.transcriber, refinementModel: c.refiner, nameCheckModel: NAME_CHECK }, { openai: wrapped, log: () => {} })]),
  )
  let current = 'Baseline'
  const server = http.createServer((req, res) => apps[current](req, res))
  await new Promise((resolve) => server.listen(3001, '127.0.0.1', resolve))
  const wavDir = path.join(OUT, 'browser-wav')
  await fs.mkdir(wavDir, { recursive: true })
  try {
    for (let rep = 1; rep <= REPEAT.browser; rep++) {
      for (const id of BROWSER_IDS.filter((x) => samples[x])) {
        // Chromium needs a WAV with real chunk sizes, so the streamed TTS header is rewritten.
        const wavFile = path.join(wavDir, `${id}.wav`)
        const wav = readWav(await fs.readFile(path.join(SAMPLE_DIR, `${id}.wav`)))
        await fs.writeFile(wavFile, writeWav(wav))
        const durationMs = (wav.samples.length / wav.channels / wav.sampleRate) * 1000
        for (const level of ['none', 'light', 'medium']) {
          for (const c of CONFIGS) {
            if (level === 'none' && c.refiner !== BASELINE_REFINER) continue
            const key = `${c.name}|${id}|${level}|${rep}`
            if (stage.has(key)) continue
            current = c.name
            wrapped.meta.seconds = samples[id].seconds
            const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wavFile}%noloop`] })
            try {
              const context = await browser.newContext({ permissions: ['microphone', 'clipboard-read', 'clipboard-write'] })
              const page = await context.newPage()
              await page.goto(`${APP_URL}/?latency=1`)
              await page.getByRole('radio', { name: new RegExp(`^${level}`, 'i') }).first().check({ force: true })
              await page.getByRole('button', { name: 'Start Recording' }).click()
              await page.getByRole('button', { name: 'Stop Recording' }).waitFor()
              await page.waitForTimeout(durationMs + 800)
              await page.getByRole('button', { name: 'Stop Recording' }).click()
              await page.waitForFunction(() => ['completed', 'error'].includes(document.querySelector('main')?.dataset.state), null, { timeout: 120_000 })
              await page.getByRole('button', { name: 'Copy JSON' }).click()
              await page.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 5000 })
              const run = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).at(-1)
              const stageMs = Object.fromEntries(run.stages.map((s) => [s.key, s.ms]))
              await stage.add({ key, config: c.name, id, level, rep, ok: run.outcome === 'success', outcome: run.outcome, totalMs: run.totalMs, ...stageMs })
              console.log(`browser #${rep} ${id} ${level.padEnd(6)} ${c.name.padEnd(8)} ${Math.round(run.totalMs)} ms (${run.outcome})  ($${ledger.total.toFixed(3)})`)
            } finally {
              await browser.close()
            }
          }
        }
      }
    }
  } finally {
    server.close()
    await stage.flush()
  }
}

const JUDGE_INSTRUCTIONS = `You grade a voice-dictation editor. The speaker dictated speech; the editor turned a transcript of it into clean written text at a given level:
- Light: remove fillers, false starts and repetitions, resolve explicit self-corrections, fix grammar and punctuation. Keep the speaker's words otherwise.
- Medium: Light, plus edit for clarity and concision, keeping every point, detail and the speaker's degree of certainty.
Both levels must keep every language exactly as spoken (mixing English, Mandarin and Hindi is intentional; translating any part is an error) and must not add information.

You get WHAT WAS SAID (the verbatim reference), optionally a note on the self-correction, and EDITED TEXT. Judge EDITED TEXT against WHAT WAS SAID, not against any transcript. Be strict and literal; do not reward style you like.
- meaning_preserved: false if any fact, name, number, date, negation, condition, request, or the speaker's intent was lost, changed, or weakened/strengthened (e.g. a suggestion became a decision), or if a correction was resolved the wrong way.
- hallucination: true if EDITED TEXT states anything not supported by WHAT WAS SAID (new facts, names, numbers, reasons, answers to questions).
- correction_handled: only when a correction note is given: true if only the corrected version remains and it is right; otherwise null.
- unintended_translation: true if any word or clause was moved into another language or script.
- grammar, readability, filler_removal, concision: 1 (poor) to 5 (excellent) for the given level. For Light, concision means not over-editing: 5 when it removed only what Light allows.
Explain each problem in one short phrase in "problems" (empty if none).`

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meaning_preserved', 'hallucination', 'correction_handled', 'unintended_translation', 'grammar', 'readability', 'filler_removal', 'concision', 'problems'],
  properties: {
    meaning_preserved: { type: 'boolean' },
    hallucination: { type: 'boolean' },
    correction_handled: { type: ['boolean', 'null'] },
    unintended_translation: { type: 'boolean' },
    grammar: { type: 'integer', minimum: 1, maximum: 5 },
    readability: { type: 'integer', minimum: 1, maximum: 5 },
    filler_removal: { type: 'integer', minimum: 1, maximum: 5 },
    concision: { type: 'integer', minimum: 1, maximum: 5 },
    problems: { type: 'array', items: { type: 'string' } },
  },
}

async function stageJudge(client, ledger) {
  const refine = await openStage('refine')
  const e2e = await openStage('e2e')
  const stage = await openStage('judge')
  const byId = Object.fromEntries(CASES.map((c) => [c.id, c]))
  const items = [
    ...refine.rows.filter((r) => r.rep === 1 && r.output).map((r) => ({ key: `refine|${r.key}`, row: r })),
    ...e2e.rows.filter((r) => r.level !== 'none' && r.output).map((r) => ({ key: `e2e|${r.key}`, row: r })),
  ].filter((item) => !stage.has(item.key))
  // Shuffled, so no model's outputs arrive as a block.
  items.sort((a, b) => hash(a.key) - hash(b.key))
  const wrapped = instrument(client, ledger, { stage: 'judge' })
  await pool(items, async ({ key, row }) => {
    const c = byId[row.id]
    const note = c.correction ? `\nSELF-CORRECTION NOTE: the speaker retracted "${c.correction.retracted}"; the corrected version is "${c.correction.replacement[0]}".` : ''
    const response = await wrapped.responses.create({
      model: JUDGE,
      instructions: JUDGE_INSTRUCTIONS,
      input: `LEVEL: ${row.level}\nWHAT WAS SAID:\n${c.script}${note}\n\nEDITED TEXT:\n${row.output}`,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: 'grade', strict: true, schema: JUDGE_SCHEMA } },
      max_output_tokens: 2000,
      store: false,
    })
    let grade = null
    try {
      grade = JSON.parse(response.output_text)
    } catch {
      grade = null
    }
    await stage.add({ key, grade })
    console.log(`judge ${key}: ${grade ? (grade.meaning_preserved ? 'ok' : 'meaning') : 'unparsed'}  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

function hash(text) {
  let h = 2166136261
  for (const char of text) h = Math.imul(h ^ char.codePointAt(0), 16777619)
  return h >>> 0
}

async function stageReport(samples) {
  const load = async (name) => JSON.parse(await fs.readFile(path.join(OUT, `${name}.json`), 'utf8').catch(() => '[]'))
  const costs = (await fs.readFile(path.join(OUT, 'costs.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const { tables, review, summary } = buildTables({
    source: SOURCE,
    cases,
    samples: Object.fromEntries(Object.entries(samples).map(([id, s]) => [id, { seconds: s.seconds }])),
    transcribe: await load('transcribe'),
    refine: await load('refine'),
    e2e: await load('e2e'),
    latency: await load('latency'),
    browser: await load('browser'),
    judge: await load('judge'),
    costs,
    configs: CONFIGS,
    models: { baselineTranscriber: BASELINE_TRANSCRIBER, fastTranscriber: FAST_TRANSCRIBER, refiners: REFINERS, baselineRefiner: BASELINE_REFINER, fastRefiner: FAST_REFINER, judge: JUDGE },
  })
  await fs.writeFile(path.join(OUT, 'tables.md'), tables)
  await fs.writeFile(path.join(OUT, 'review.md'), review)
  await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1))
  console.log(tables)
  console.log(`\nWrote ${path.join(OUT, 'tables.md')}, review.md and summary.json`)
}

const config = loadConfig()
if (!config.openaiApiKey && STAGES.some((s) => s !== 'report')) {
  console.error('OPENAI_API_KEY is not set.')
  process.exit(1)
}
await fs.mkdir(OUT, { recursive: true })
const client = new OpenAI({ apiKey: config.openaiApiKey || 'unused' })
const ledger = await openLedger()
const overrides = await referenceOverrides()
const references = Object.fromEntries(cases.map((c) => [c.id, overrides[c.id] ?? c.script]))
if (Object.keys(overrides).length) {
  for (const c of cases) if (overrides[c.id]) c.script = overrides[c.id]
}

try {
  if (STAGES.includes('audio')) await stageAudio(client, ledger)
  const samples = await loadSamples()
  console.log(`Source: ${SOURCE}, ${Object.keys(samples).length} of ${cases.length} recordings found. Spent so far: $${ledger.total.toFixed(3)} of $${CAP}.`)
  if (STAGES.includes('transcribe')) await stageTranscribe(client, ledger, samples)
  if (STAGES.includes('refine')) await stageRefine(client, ledger, references)
  if (STAGES.includes('e2e')) await stageE2E(client, ledger)
  if (STAGES.includes('latency')) await stageLatency(client, ledger, samples)
  if (STAGES.includes('browser')) await stageBrowser(client, ledger, samples)
  if (STAGES.includes('judge')) await stageJudge(client, ledger)
  if (STAGES.includes('report')) await stageReport(samples)
} catch (err) {
  if (!err.cap) throw err
  console.error(`\n${err.message} Stopped; rerun with a higher --cap to continue where it stopped.`)
  process.exitCode = 2
}
console.log(`Total estimated spend: $${ledger.total.toFixed(3)}`)
