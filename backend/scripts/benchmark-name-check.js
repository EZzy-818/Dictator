// Name check benchmark (docs/name-check-benchmark.md): the name check with the number fix
// ("Fixed", the corrected baseline) against O2 (refinement alongside the name check), O4
// (gpt-4o-mini-transcribe as the name check) and O2+O4. Synthetic audio only.
//
// Recordings: the 36 in eval/models-dataset.js (from the model benchmark, reused as they are) and
// the 31 in eval/fidelity-dataset.js (the name samples the check exists for), clean and with
// onyx voice + pink noise at 15 dB SNR.
//
// Stages, in this order and resumable (finished calls are kept in <out>/<stage>.json):
//   audio    synthesize the fidelity recordings (the model recordings must already exist)
//   capture  every recording through gpt-transcribe, gpt-4o-transcribe and the mini snapshot at
//            once, as production does. Every configuration's raw transcript is computed from
//            these, so all of them see the same main transcript and only the name check differs.
//   e2e      for every recording a name check changed: refinement after the check (production)
//            against refinement alongside it (O2), at Light and Medium
//   latency  /api/process timings per configuration, backend in this process
//   browser  Stop → text displayed in Chromium, Light (needs the frontend at --app-url, built
//            for http://localhost:3001)
//   report   tables.md, review.md and summary.json
//
// Every API call's estimated cost is logged to <out>/costs.jsonl; the run stops before a call
// once the total passes --cap dollars.
//
// Usage: node scripts/benchmark-name-check.js [--stages=capture,report] [--out=.eval-runs/name-check]
//        [--cap=8] [--repeat-capture=3] [--repeat-latency=5] [--concurrency=4]
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import dotenv from 'dotenv'
import OpenAI, { toFile } from 'openai'
import { createApp } from '../src/app.js'
import { loadConfig, withoutUsageLimits } from '../src/config.js'
import { identifyAudio } from '../src/lib/audio.js'
import { audioDurationSeconds } from '../src/lib/duration.js'
import { applySwaps, restoreSpokenNames } from '../src/lib/names.js'
import { NAME_CHECK_WAIT_MS, transcriptionParams } from '../src/services/transcription.js'
import { refineTranscript } from '../src/services/refinement.js'
import { CASES, LATENCY_CASE_IDS } from '../eval/models-dataset.js'
import { FIDELITY_CASES } from '../eval/fidelity-dataset.js'
import { checkRefinementOutput, corpusRate, scoreTranscription, wilson } from '../eval/model-metrics.js'
import { compareTerms, scoreFidelity } from '../eval/fidelity.js'
import { summarize } from '../eval/latency-stats.js'
import { addNoise, readWav, writeWav } from '../eval/noise.js'

dotenv.config({ quiet: true })

const ROOT = path.resolve(import.meta.dirname, '..')

function option(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}
const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)

const STAGES = list(option('stages', 'audio,capture,e2e,latency,report'))
const OUT = path.resolve(ROOT, option('out', '.eval-runs/name-check'))
const CAP = Number(option('cap', '8'))
const CONCURRENCY = Number(option('concurrency', '4'))
const REPEAT_CAPTURE = Number(option('repeat-capture', '3'))
const REPEAT_LATENCY = Number(option('repeat-latency', '5'))
const REPEAT_BROWSER = Number(option('repeat-browser', '3'))
const APP_URL = option('app-url', 'http://localhost:4173')
const BROWSER_IDS = list(option('browser-ids', 'en-15-a,mixed-15-b'))
const BROWSER_CONFIGS = list(option('browser-configs', 'Fixed,O2+O4'))

const MAIN = 'gpt-transcribe'
const CHECK = 'gpt-4o-transcribe'
const MINI_CHECK = 'gpt-4o-mini-transcribe-2025-12-15'
const REFINER = 'gpt-4.1'
const TTS_MODEL = 'gpt-4o-mini-tts'
const NOISE = { voice: 'onyx', snr: 15 }

// Raw transcript configurations, computed from the captured transcripts.
const TRANSCRIPT_CONFIGS = [
  { name: 'Before fix', check: CHECK, merge: 'before' },
  { name: 'Fixed', check: CHECK, merge: 'fixed' },
  { name: 'O4', check: MINI_CHECK, merge: 'fixed' },
  { name: 'No check', check: null },
]
// Server configurations for latency. O2 and O2+O4 have the raw transcripts of Fixed and O4.
const SERVER_CONFIGS = [
  { name: 'Fixed', nameCheckModel: CHECK, overlap: false },
  { name: 'O2', nameCheckModel: CHECK, overlap: true },
  { name: 'O4', nameCheckModel: MINI_CHECK, overlap: false },
  { name: 'O2+O4', nameCheckModel: MINI_CHECK, overlap: true },
]

const PER_MINUTE = { 'gpt-transcribe': 0.0045, 'gpt-4o-mini-transcribe': 0.003, 'gpt-4o-transcribe': 0.006, 'gpt-4o-mini-tts': 0.015 }
const PER_MTOK = { 'gpt-4.1': { input: 2, cached: 0.5, output: 8 } }

function callCost({ kind, model, seconds, usage }) {
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  if (kind === 'transcription' || kind === 'tts') return ((seconds ?? 0) / 60) * (PER_MINUTE[base] ?? 0)
  const price = PER_MTOK[base]
  if (!price || !usage) return 0
  const cached = usage.input_tokens_details?.cached_tokens ?? 0
  return ((usage.input_tokens - cached) * price.input + cached * price.cached + usage.output_tokens * price.output) / 1e6
}

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
      await fs.appendFile(file, `${JSON.stringify({ time: new Date().toISOString(), stage: entry.stage, kind: entry.kind, model: entry.model, seconds: entry.seconds, cost })}\n`)
    },
  }
}

// An OpenAI client that times and prices every call; calls collects them in order.
function instrument(client, ledger, meta = {}) {
  const calls = []
  const record = async (entry) => {
    calls.push(entry)
    await ledger.add({ ...meta, ...entry })
  }
  return {
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
            await record({ kind: 'transcription', model: body.model, seconds: meta.seconds, ms: performance.now() - started, ok: false })
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
        await record({ kind: 'response', model: body.model, ms: performance.now() - started, usage: response.usage, input: body.input })
        return response
      },
    },
  }
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  let next = 0
  let stop = null
  async function run() {
    while (next < items.length && !stop) {
      const index = next++
      try {
        await worker(items[index], index)
      } catch (err) {
        if (err.cap) stop = err
        else throw err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  if (stop) throw stop
}

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

// Every recording: { id, set: models | fidelity | fidelity-noisy, testCase, file }.
const MODEL_DIR = path.join(ROOT, '.eval-samples/synthetic/models')
const FIDELITY_DIR = path.join(ROOT, '.eval-samples/synthetic/name-check')
const CASUAL =
  'Speak like a person dictating a quick note: relaxed and conversational. Say every filler word (um, uh, 嗯, 呃) clearly as a short hesitation, exactly as written. Read Chinese in Mandarin and English in English.'
const RECORDINGS = [
  ...CASES.map((c) => ({ id: c.id, set: 'models', testCase: c, file: path.join(MODEL_DIR, `${c.id}.webm`) })),
  ...FIDELITY_CASES.map((c) => ({ id: c.id, set: 'fidelity', testCase: c, file: path.join(FIDELITY_DIR, `${c.id}.webm`) })),
  ...FIDELITY_CASES.map((c) => ({ id: `${c.id}~noisy`, set: 'fidelity-noisy', testCase: c, file: path.join(FIDELITY_DIR, `${c.id}-${NOISE.voice}-snr${NOISE.snr}.webm`) })),
]

async function stageAudio(client, ledger) {
  await fs.mkdir(FIDELITY_DIR, { recursive: true })
  const toWebm = async (wavBuffer, webm) => {
    const wav = `${webm}.wav`
    await fs.writeFile(wav, wavBuffer)
    // Chrome's MediaRecorder uploads WebM/Opus, so the API sees the same format as in the app.
    await promisify(execFile)('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', webm])
    await fs.rm(wav)
  }
  await pool(
    RECORDINGS.filter((r) => r.set !== 'models'),
    async (r, index) => {
      if (await fs.stat(r.file).catch(() => null)) return
      ledger.check()
      const voice = r.set === 'fidelity-noisy' ? NOISE.voice : r.testCase.voice
      const speech = await client.audio.speech.create({ model: TTS_MODEL, voice, input: r.testCase.script, response_format: 'wav', ...(r.testCase.casual ? { instructions: CASUAL } : {}) })
      // The streamed WAV header has no real sizes; rewriting it lets the noise code read it.
      let wav = writeWav(readWav(Buffer.from(await speech.arrayBuffer())))
      if (r.set === 'fidelity-noisy') wav = addNoise(wav, NOISE.snr, index + 1)
      await toWebm(wav, r.file)
      const seconds = await durationOf(await fs.readFile(r.file))
      await ledger.add({ stage: 'audio', kind: 'tts', model: TTS_MODEL, seconds })
      console.log(`audio ${r.id}: ${seconds?.toFixed(1)} s`)
    },
  )
}

const durationOf = (buffer) => audioDurationSeconds(buffer, identifyAudio(buffer, 'audio/webm'))

async function loadSamples() {
  const samples = {}
  for (const r of RECORDINGS) {
    const buffer = await fs.readFile(r.file).catch(() => null)
    if (!buffer) continue
    const format = identifyAudio(buffer, 'audio/webm')
    samples[r.id] = { buffer, format, seconds: await audioDurationSeconds(buffer, format) }
  }
  return samples
}

async function transcribeOnce(client, model, sample) {
  const file = await toFile(sample.buffer, `recording.${sample.format.extension}`, { type: sample.format.mimeType })
  const started = performance.now()
  try {
    const response = await client.audio.transcriptions.create({ file, model, response_format: 'json', ...transcriptionParams(model) }, { timeout: 45_000 })
    return { text: response.text, ms: performance.now() - started }
  } catch (err) {
    if (err.cap) throw err
    return { text: null, ms: performance.now() - started, error: err.status ?? err.name }
  }
}

async function stageCapture(client, ledger, samples) {
  const stage = await openStage('capture')
  const jobs = []
  for (let rep = 1; rep <= REPEAT_CAPTURE; rep++) {
    for (const r of RECORDINGS) {
      const key = `${r.id}|${rep}`
      if (samples[r.id] && !stage.has(key)) jobs.push({ key, r, rep })
    }
  }
  await pool(jobs, async ({ key, r, rep }) => {
    const sample = samples[r.id]
    const wrapped = instrument(client, ledger, { stage: 'capture', seconds: sample.seconds })
    const [main, check, mini] = await Promise.all([MAIN, CHECK, MINI_CHECK].map((model) => transcribeOnce(wrapped, model, sample)))
    await stage.add({ key, id: r.id, set: r.set, rep, seconds: sample.seconds, main, [CHECK]: check, [MINI_CHECK]: mini })
    console.log(`capture ${r.id} #${rep}: ${Math.round(main.ms)} / ${Math.round(check.ms)} / ${Math.round(mini.ms)} ms  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

// The name check as it was on main before the number fix, for the "Before fix" column.
async function loadBeforeFix() {
  const file = path.join(OUT, 'names-before-fix.mjs')
  const source = (await promisify(execFile)('git', ['show', '914a73e:backend/src/lib/names.js'], { cwd: ROOT })).stdout
  await fs.writeFile(file, source)
  return (await import(file)).restoreSpokenNames
}

// The raw transcript a configuration returns for one captured row, as the server would: the
// check is used only if it came back within NAME_CHECK_WAIT_MS of the main transcript.
function rawFor(config, row, before) {
  if (!row.main.text) return { text: null, swapped: 0, swaps: [] }
  if (!config.check) return { text: row.main.text, swapped: 0, swaps: [] }
  const check = row[config.check]
  const usable = check?.text && check.ms - row.main.ms <= NAME_CHECK_WAIT_MS ? check.text : null
  const result = config.merge === 'before' ? before(row.main.text, usable) : restoreSpokenNames(row.main.text, usable)
  return { swaps: [], ...result }
}

async function stageE2E(client, ledger, before) {
  const capture = await openStage('capture')
  const stage = await openStage('e2e')
  const jobs = []
  for (const row of capture.rows.filter((r) => r.rep === 1 && r.set !== 'fidelity-noisy')) {
    for (const config of TRANSCRIPT_CONFIGS.filter((c) => c.merge === 'fixed')) {
      const restored = rawFor(config, row, before)
      if (!restored.swapped) continue
      for (const level of ['light', 'medium']) {
        const key = `${config.name}|${row.id}|${level}`
        if (!stage.has(key)) jobs.push({ key, config, row, level, restored })
      }
    }
  }
  await pool(jobs, async ({ key, config, row, level, restored }) => {
    // refineTranscript turns every error into its own, so the cap is checked here.
    ledger.check()
    const wrapped = instrument(client, ledger, { stage: 'e2e' })
    const refine = (transcript) => refineTranscript({ client: wrapped, model: REFINER, transcript, level }).catch(() => null)
    // Production order: refine the transcript the name check changed.
    const sequential = await refine(restored.text)
    // O2: refine the main transcript, then make the same swaps in the result.
    const alongside = await refine(row.main.text)
    const placed = alongside === null ? null : applySwaps(alongside, restored.swaps)
    const overlap = placed ?? (await refine(restored.text))
    await stage.add({ key, config: config.name, id: row.id, set: row.set, level, main: row.main.text, raw: restored.text, swaps: restored.swaps, sequential, alongside, placed: placed !== null, overlap })
    console.log(`e2e ${config.name} ${level} ${row.id}: ${placed !== null ? 'placed' : 'refined again'}  ($${ledger.total.toFixed(3)})`)
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

const serverConfig = (base, c) => ({ ...base, transcriptionModel: MAIN, refinementModel: REFINER, nameCheckModel: c.nameCheckModel, nameCheckOverlap: c.overlap })

async function stageLatency(client, ledger, samples) {
  const stage = await openStage('latency')
  const base = { ...withoutUsageLimits(loadConfig()), exposeTimings: true }
  const wrapped = instrument(client, ledger, { stage: 'latency' })
  const servers = []
  const targets = {}
  for (const c of SERVER_CONFIGS) {
    const app = createApp(serverConfig(base, c), { openai: wrapped, log: () => {} })
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })
    servers.push(server)
    targets[c.name] = `http://127.0.0.1:${server.address().port}`
  }
  const ids = LATENCY_CASE_IDS.filter((id) => samples[id])
  try {
    if (!ids.length) return
    if (!stage.rows.length) {
      for (const c of SERVER_CONFIGS) {
        wrapped.meta.seconds = samples[ids[0]].seconds
        await timeRequest(targets[c.name], samples[ids[0]], 'light', `warmup-${c.name}`)
      }
    }
    // Repeats outermost and configurations innermost, so API speed drifting over the run affects
    // every configuration alike. At None there is no refinement to overlap with, so O2 is Fixed.
    for (let rep = 1; rep <= REPEAT_LATENCY; rep++) {
      for (const id of ids) {
        for (const level of ['none', 'light', 'medium']) {
          for (const c of SERVER_CONFIGS) {
            if (level === 'none' && c.overlap) continue
            const key = `${c.name}|${id}|${level}|${rep}`
            if (stage.has(key)) continue
            ledger.check()
            const sample = samples[id]
            wrapped.meta.seconds = sample.seconds
            const firstCall = wrapped.calls.length
            const { status, body, roundTripMs } = await timeRequest(targets[c.name], sample, level, `namecheck-${c.name}-${id}-${level}-${rep}`.replace(/\+/g, '_'))
            const calls = wrapped.calls.slice(firstCall)
            const t = body?.timings ?? {}
            const primary = calls.find((call) => call.model === MAIN)
            const check = calls.find((call) => call.model === c.nameCheckModel)
            await stage.add({
              key,
              config: c.name,
              id,
              level,
              rep,
              seconds: sample.seconds,
              ok: status === 200 && (level === 'none' || body?.refinementStatus === 'success'),
              status,
              roundTripMs,
              serverTotalMs: t.totalMs ?? null,
              transcriptionMs: t.transcriptionMs ?? null,
              refinementMs: t.refinementMs ?? null,
              primaryMs: primary?.ms ?? null,
              nameCheckMs: check?.ms ?? null,
              refinementCalls: calls.filter((call) => call.kind === 'response').length,
              swapped: Boolean(primary?.text && body?.rawTranscript && body.rawTranscript !== primary.text),
              cost: calls.reduce((sum, call) => sum + callCost({ ...call, seconds: call.kind === 'transcription' ? sample.seconds : undefined }), 0),
              raw: body?.rawTranscript ?? null,
              polished: body?.polishedTranscript ?? null,
            })
            console.log(`latency #${rep} ${id} ${level.padEnd(6)} ${c.name.padEnd(6)} ${Math.round(roundTripMs)} ms  ($${ledger.total.toFixed(3)})`)
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
async function stageBrowser(client, ledger, samples) {
  const require = createRequire(import.meta.url)
  const { chromium } = require('playwright')
  const stage = await openStage('browser')
  const base = { ...withoutUsageLimits(loadConfig()), exposeTimings: true, corsOrigins: [new URL(APP_URL).origin] }
  const wrapped = instrument(client, ledger, { stage: 'browser' })
  const configs = SERVER_CONFIGS.filter((c) => BROWSER_CONFIGS.includes(c.name))
  const apps = Object.fromEntries(configs.map((c) => [c.name, createApp(serverConfig(base, c), { openai: wrapped, log: () => {} })]))
  let current = configs[0].name
  const server = http.createServer((req, res) => apps[current](req, res))
  await new Promise((resolve) => server.listen(3001, '127.0.0.1', resolve))
  const wavDir = path.join(OUT, 'browser-wav')
  await fs.mkdir(wavDir, { recursive: true })
  try {
    for (let rep = 1; rep <= REPEAT_BROWSER; rep++) {
      for (const id of BROWSER_IDS.filter((x) => samples[x])) {
        const wavFile = path.join(wavDir, `${id}.wav`)
        await promisify(execFile)('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(MODEL_DIR, `${id}.webm`), '-ac', '1', '-ar', '48000', wavFile])
        const durationMs = samples[id].seconds * 1000
        for (const c of configs) {
          const key = `${c.name}|${id}|light|${rep}`
          if (stage.has(key)) continue
          current = c.name
          wrapped.meta.seconds = samples[id].seconds
          const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wavFile}%noloop`] })
          try {
            const context = await browser.newContext({ permissions: ['microphone', 'clipboard-read', 'clipboard-write'] })
            const page = await context.newPage()
            await page.goto(`${APP_URL}/?latency=1`)
            await page.getByRole('radio', { name: /^light/i }).first().check({ force: true })
            await page.getByRole('button', { name: 'Start Recording' }).click()
            await page.getByRole('button', { name: 'Stop Recording' }).waitFor()
            await page.waitForTimeout(durationMs + 800)
            await page.getByRole('button', { name: 'Stop Recording' }).click()
            await page.waitForFunction(() => ['completed', 'error'].includes(document.querySelector('main')?.dataset.state), null, { timeout: 120_000 })
            await page.getByRole('button', { name: 'Copy JSON' }).click()
            await page.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 5000 })
            const run = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).at(-1)
            await stage.add({ key, config: c.name, id, level: 'light', rep, ok: run.outcome === 'success', totalMs: run.totalMs })
            console.log(`browser #${rep} ${id} ${c.name.padEnd(6)} ${Math.round(run.totalMs)} ms (${run.outcome})  ($${ledger.total.toFixed(3)})`)
          } finally {
            await browser.close()
          }
        }
      }
    }
  } finally {
    server.close()
    await stage.flush()
  }
}

// ---------- Report ----------

const pct = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(digits)}%`)
const msText = (value) => (value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-US'))
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
function rate(successes, n) {
  if (!n) return '—'
  const [low, high] = wilson(successes, n)
  return `${pct(successes / n)} (${successes}/${n}, ${pct(low, 0)}–${pct(high, 0)})`
}
const UNIT = { en: 'WER', zh: 'CER', hi: 'WER', mixed: 'CER' }
const ENTITY_TYPES = ['name', 'term', 'number', 'date', 'negation']

// Whether a configuration's change to the main transcript helped, hurt or did neither, by the
// recording's own error rate against what was said.
function errorOf(r, text) {
  if (r.set === 'models') return scoreTranscription(r.testCase, text).primary.rate
  return scoreFidelity(r.testCase.script, text, r.testCase.terms).verbatim.rate
}
function effectOf(r, main, raw) {
  if (raw === main) return null
  const before = errorOf(r, main)
  const after = errorOf(r, raw)
  // Names kept as spoken decide for the name samples, whatever the error rate says.
  if (r.set !== 'models' && r.testCase.terms?.length) {
    const kept = (text) => compareTerms(r.testCase.terms, text).kept
    if (kept(raw) !== kept(main)) return kept(raw) > kept(main) ? 'helpful' : 'harmful'
  }
  return after < before - 1e-9 ? 'helpful' : after > before + 1e-9 ? 'harmful' : 'neutral'
}

function transcriptRows(capture, before) {
  const byId = Object.fromEntries(RECORDINGS.map((r) => [r.id, r]))
  return capture.flatMap((row) =>
    TRANSCRIPT_CONFIGS.map((config) => {
      const r = byId[row.id]
      const restored = rawFor(config, row, before)
      return { config: config.name, r, rep: row.rep, main: row.main.text, raw: restored.text, swapped: restored.swapped, effect: restored.text ? effectOf(r, row.main.text, restored.text) : null }
    }),
  )
}

function accuracySection(rows) {
  const lines = ['## Transcription accuracy (raw transcript)', '']
  lines.push('Every configuration starts from the same `gpt-transcribe` transcript of each recording and repeat; only the name check differs. O2 returns the same raw transcript as Fixed, and O2+O4 the same as O4. Rates are corpus rates over all repeats, fillers ignored.', '')
  const configs = TRANSCRIPT_CONFIGS.map((c) => c.name)
  const models = rows.filter((x) => x.r.set === 'models' && x.raw !== null)
  const summary = {}
  const header = ['Config', 'English WER', 'Mandarin CER', 'Hindi WER', 'Mixed CER', 'Code-switching kept', 'Recordings with a translation', ...ENTITY_TYPES.map((t) => `${t[0].toUpperCase()}${t.slice(1)}s missed`)]
  const body = configs.map((name) => {
    const rs = models.filter((x) => x.config === name)
    const scores = rs.map((x) => ({ ...x, score: scoreTranscription(x.r.testCase, x.raw) }))
    const group = (g) => scores.filter((x) => x.r.testCase.group === g)
    const lang = scores.reduce((s, x) => ({ switches: s.switches + x.score.language.switches, kept: s.kept + x.score.language.switchesKept }), { switches: 0, kept: 0 })
    const entities = scores.flatMap((x) => x.score.entities)
    const s = {
      en: corpusRate(group('en').map((x) => x.score.primary)).rate,
      zh: corpusRate(group('zh').map((x) => x.score.primary)).rate,
      hi: corpusRate(group('hi').map((x) => x.score.primary)).rate,
      mixed: corpusRate(group('mixed').map((x) => x.score.mixed)).rate,
      switching: lang.switches ? lang.kept / lang.switches : null,
      translated: [scores.filter((x) => x.score.language.translations.length).length, scores.length],
      missed: Object.fromEntries(ENTITY_TYPES.map((t) => [t, [entities.filter((e) => e.type === t && !e.kept).length, entities.filter((e) => e.type === t).length]])),
    }
    summary[name] = { models: s }
    return [name, pct(s.en, 2), pct(s.zh, 2), pct(s.hi, 2), pct(s.mixed, 2), pct(s.switching), rate(...s.translated), ...ENTITY_TYPES.map((t) => rate(...s.missed[t]))]
  })
  lines.push('### The 36 model-benchmark recordings', '', table(header, body), '')

  for (const set of ['fidelity', 'fidelity-noisy']) {
    const fr = rows.filter((x) => x.r.set === set && x.raw !== null)
    lines.push(`### The 31 name-check recordings, ${set === 'fidelity' ? 'clean' : `${NOISE.voice} voice, pink noise at ${NOISE.snr} dB SNR`}`, '')
    const fbody = configs.map((name) => {
      const rs = fr.filter((x) => x.config === name).map((x) => ({ ...x, score: scoreFidelity(x.r.testCase.script, x.raw, x.r.testCase.terms) }))
      const terms = rs.reduce((s, x) => ({ kept: s.kept + x.score.terms.kept, expected: s.expected + x.score.terms.expected }), { kept: 0, expected: 0 })
      const verbatim = rs.reduce((s, x) => ({ errors: s.errors + x.score.verbatim.errors, N: s.N + x.score.verbatim.N }), { errors: 0, N: 0 })
      const languages = rs.filter((x) => x.score.languages.preserved).length
      summary[name][set] = { namesKept: [terms.kept, terms.expected], languagesKept: [languages, rs.length], verbatim: verbatim.N ? verbatim.errors / verbatim.N : null }
      return [name, `${terms.kept}/${terms.expected}`, `${languages}/${rs.length}`, pct(verbatim.N ? verbatim.errors / verbatim.N : null)]
    })
    lines.push(table(['Config', 'Names kept as spoken', 'Languages kept', 'Mixed token error'], fbody), '')
  }

  lines.push('### What each name check changed', '')
  lines.push('A change is helpful when it lowers the recording\'s error rate against what was said (or keeps more names as spoken), harmful when it raises it, neutral otherwise. Every change is listed in review.md.', '')
  const sets = [['models', '36 recordings'], ['fidelity', 'name recordings, clean'], ['fidelity-noisy', 'name recordings, noisy']]
  const cbody = configs.filter((name) => name !== 'No check').flatMap((name) =>
    sets.map(([set, label]) => {
      const rs = rows.filter((x) => x.config === name && x.r.set === set && x.raw !== null)
      const changed = rs.filter((x) => x.effect)
      const n = (effect) => changed.filter((x) => x.effect === effect).length
      summary[name].changes = { ...(summary[name].changes ?? {}), [set]: { transcripts: rs.length, changed: changed.length, helpful: n('helpful'), harmful: n('harmful'), neutral: n('neutral') } }
      return [name, label, `${changed.length}/${rs.length}`, n('helpful'), n('harmful'), n('neutral')]
    }),
  )
  lines.push(table(['Config', 'Recordings', 'Transcripts changed', 'Helpful', 'Harmful', 'Neutral'], cbody), '')
  return { lines, summary }
}

function e2eSection(e2e, byId) {
  const lines = ['## Refinement alongside the name check (O2)', '']
  lines.push('For every recording (repeat 1) where the name check changed the transcript, Light and Medium were refined in both orders: after the check (as production does) and alongside it, with the swap made in the refined text, or the changed transcript refined again when the name was not there exactly once. When the check changes nothing, both orders refine the same text, so they are not run.', '')
  const body = ['Fixed', 'O4'].map((name) => {
    const rs = e2e.filter((x) => x.config === name)
    const placed = rs.filter((x) => x.placed).length
    const same = rs.filter((x) => x.sequential !== null && x.sequential === x.overlap).length
    const meaning = (key) =>
      rs.filter((x) => {
        const r = byId[x.id]
        if (!x[key]) return false
        if (r.set === 'models') return checkRefinementOutput(r.testCase, x.raw, x[key]).meaningPreserved
        return compareTerms(r.testCase.terms ?? [], x[key]).kept === compareTerms(r.testCase.terms ?? [], x.raw).kept
      }).length
    return [name === 'Fixed' ? 'O2 (with gpt-4o-transcribe)' : 'O2+O4 (with mini)', rs.length, `${placed}/${rs.length}`, `${same}/${rs.length}`, `${meaning('sequential')}/${rs.length}`, `${meaning('overlap')}/${rs.length}`]
  })
  lines.push(table(['Config', 'Outputs', 'Swap placed in refined text', 'Identical to refining after the check', 'Meaning kept, after the check', 'Meaning kept, alongside'], body), '')
  lines.push('Meaning kept: for the 36 recordings, the rule-based check from the model benchmark (entities, correction, languages, no new numbers) against the changed raw transcript; for the name recordings, every name the raw transcript kept as spoken is still there.', '')
  return lines
}

function latencySection(latency) {
  const lines = ['## Latency', '']
  lines.push(`\`/api/process\` round trip in ms, backend in this process (loopback HTTP), container → OpenAI. ${REPEAT_LATENCY} repeats × ${LATENCY_CASE_IDS.length} recordings per row, configurations interleaved. Extra wait: how much longer the transcription stage took than the main \`gpt-transcribe\` call. At None there is no refinement to overlap with, so O2 and O2+O4 are the same as Fixed and O4.`, '')
  const summary = {}
  const header = ['Level', 'Config', 'p50', 'p95', 'Mean', 'p50 change vs Fixed', 'p95 change vs Fixed', 'Main call p50', 'Check call p50', 'Extra wait p50 / p95', 'Refinement stage p50', 'Refined twice', 'Failed']
  const body = []
  for (const level of ['none', 'light', 'medium']) {
    const base = summarize(latency.filter((x) => x.ok && x.config === 'Fixed' && x.level === level).map((x) => x.roundTripMs))
    for (const c of SERVER_CONFIGS) {
      const rs = latency.filter((x) => x.config === c.name && x.level === level)
      if (!rs.length) continue
      const ok = rs.filter((x) => x.ok)
      const rt = summarize(ok.map((x) => x.roundTripMs))
      const wait = summarize(ok.filter((x) => !c.overlap || level === 'none').map((x) => Math.max(0, x.transcriptionMs - x.primaryMs)))
      const twice = ok.filter((x) => x.refinementCalls > 1).length
      summary[`${c.name}|${level}`] = { roundTrip: rt, wait, twice, n: rs.length }
      const change = (key) => (base && rt ? `${Math.round(base[key] - rt[key]) >= 0 ? '−' : '+'}${Math.abs(Math.round(base[key] - rt[key]))} ms (${pct(Math.abs(base[key] - rt[key]) / base[key], 0)})` : '—')
      body.push([
        level === 'none' ? 'None' : level === 'light' ? 'Light' : 'Medium',
        c.name,
        msText(rt?.p50),
        msText(rt?.p95),
        msText(rt?.mean),
        c.name === 'Fixed' ? '—' : change('p50'),
        c.name === 'Fixed' ? '—' : change('p95'),
        msText(summarize(ok.map((x) => x.primaryMs))?.p50),
        msText(summarize(ok.map((x) => x.nameCheckMs))?.p50),
        wait ? `${msText(wait.p50)} / ${msText(wait.p95)}` : 'hidden',
        msText(summarize(ok.map((x) => x.refinementMs))?.p50),
        level === 'none' ? '—' : `${twice}/${ok.length}`,
        rs.length - ok.length,
      ])
    }
  }
  lines.push(table(header, body), '')
  lines.push('A minus sign is faster than Fixed. "Refined twice" counts requests that needed a second refinement call, for any reason: a swap that could not be placed in the refined text (O2) or the language retry in refinement.js (any configuration).', '')
  return { lines, summary }
}

function browserSection(browser) {
  if (!browser.length) return []
  const lines = ['## Stop → text displayed (browser, Light)', '']
  lines.push(`Production frontend build in headless Chromium with the recording as its fake microphone, total from the \`?latency=1\` panel. ${BROWSER_IDS.join(', ')} × ${REPEAT_BROWSER} repeats; a sanity check, not a precise number.`, '')
  const body = BROWSER_CONFIGS.map((name) => {
    const s = summarize(browser.filter((x) => x.config === name && x.ok).map((x) => x.totalMs))
    return [name, msText(s?.p50), msText(s?.p95), msText(s?.mean), s?.count ?? 0]
  })
  lines.push(table(['Config', 'p50', 'p95', 'Mean', 'Runs'], body), '')
  return lines
}

function reviewSheet(rows, e2e) {
  const lines = ['# Name check benchmark: every change the name check made', '', 'Synthetic speech (OpenAI text-to-speech). Main = gpt-transcribe as returned; Raw = after the name check.', '']
  for (const name of ['Before fix', 'Fixed', 'O4']) {
    lines.push(`## ${name}`, '')
    for (const x of rows.filter((y) => y.config === name && y.effect)) {
      lines.push(`- **${x.effect}** ${x.r.id} #${x.rep}`, `  - Said: ${x.r.testCase.script}`, `  - Main: ${x.main}`, `  - Raw: ${x.raw}`)
    }
    lines.push('')
  }
  lines.push('## Refinement after vs alongside the name check', '')
  for (const x of e2e) {
    lines.push(`- ${x.config} ${x.level} ${x.id}: swaps ${x.swaps.map((s) => `"${s.from}" → "${s.to}"`).join(', ')}; ${x.placed ? 'placed' : 'refined again'}${x.sequential === x.overlap ? ', identical' : ''}`)
    if (x.sequential !== x.overlap) lines.push(`  - After: ${x.sequential}`, `  - Alongside: ${x.overlap}`)
  }
  return lines.join('\n')
}

async function stageReport(before) {
  const load = async (name) => JSON.parse(await fs.readFile(path.join(OUT, `${name}.json`), 'utf8').catch(() => '[]'))
  const costs = (await fs.readFile(path.join(OUT, 'costs.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const capture = await load('capture')
  const e2e = await load('e2e')
  const latency = await load('latency')
  const browser = await load('browser')
  const byId = Object.fromEntries(RECORDINGS.map((r) => [r.id, r]))
  const rows = transcriptRows(capture, before)
  const accuracy = accuracySection(rows)
  const lat = latencySection(latency)
  const byStage = {}
  for (const c of costs) byStage[c.stage] = (byStage[c.stage] ?? 0) + c.cost
  const total = costs.reduce((sum, c) => sum + c.cost, 0)
  const failures = capture.flatMap((row) => [MAIN, CHECK, MINI_CHECK].filter((m) => !(m === MAIN ? row.main : row[m])?.text).map((m) => `${row.id} #${row.rep} ${m}`))
  const tables = [
    '# Name check benchmark',
    '',
    `Synthetic speech (OpenAI \`${TTS_MODEL}\`), not human recordings. Main transcription \`${MAIN}\`, refinement \`${REFINER}\`. Fixed is the corrected baseline (the name check with the number fix); "Before fix" is production before it. O4 uses \`${MINI_CHECK}\` as the name check. ${REPEAT_CAPTURE} repeats per recording.`,
    '',
    ...accuracy.lines,
    ...e2eSection(e2e, byId),
    ...lat.lines,
    ...browserSection(browser),
    '## Cost',
    '',
    `Estimated from list prices: $${total.toFixed(2)} (${Object.entries(byStage).map(([stage, cost]) => `${stage} $${cost.toFixed(2)}`).join(', ')}), against a $${CAP} cap.`,
    '',
    failures.length ? `Failed transcription calls (left out of the rates): ${failures.join(', ')}.` : 'No transcription call failed.',
    '',
  ].join('\n')
  await fs.writeFile(path.join(OUT, 'tables.md'), tables)
  await fs.writeFile(path.join(OUT, 'review.md'), reviewSheet(rows, e2e))
  await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify({ accuracy: accuracy.summary, latency: lat.summary, cost: { total, byStage } }, null, 1))
  console.log(tables)
}

const config = loadConfig()
if (!config.openaiApiKey && STAGES.some((s) => s !== 'report')) {
  console.error('OPENAI_API_KEY is not set.')
  process.exit(1)
}
await fs.mkdir(OUT, { recursive: true })
const client = new OpenAI({ apiKey: config.openaiApiKey || 'unused' })
const ledger = await openLedger()
const before = await loadBeforeFix()

try {
  if (STAGES.includes('audio')) await stageAudio(client, ledger)
  const samples = await loadSamples()
  console.log(`${Object.keys(samples).length} of ${RECORDINGS.length} recordings found. Spent so far: $${ledger.total.toFixed(3)} of $${CAP}.`)
  if (STAGES.includes('capture')) await stageCapture(client, ledger, samples)
  if (STAGES.includes('e2e')) await stageE2E(client, ledger, before)
  if (STAGES.includes('latency')) await stageLatency(client, ledger, samples)
  if (STAGES.includes('browser')) await stageBrowser(client, ledger, samples)
  if (STAGES.includes('report')) await stageReport(before)
} catch (err) {
  if (!err.cap) throw err
  console.error(`\n${err.message} Stopped; rerun with a higher --cap to continue where it stopped.`)
  process.exitCode = 2
}
console.log(`Total estimated spend: $${ledger.total.toFixed(3)}`)
