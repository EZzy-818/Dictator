// Realtime transcription benchmark, Phase 1 of the realtime design (docs/realtime-benchmark.md):
// streaming gpt-live-transcribe against the corrected batch baseline (gpt-transcribe + the
// gpt-4o-transcribe name check with the number fix), on synthetic audio. Nothing in production
// changes: the realtime path is simulated here in this process.
//
// Stages, in this order and resumable (finished work is kept in <out>/<stage>.json):
//   validate  session settings accepted or rejected by the API (no audio), models listed
//   audio     synthesize missing recordings, build the ~60 s and ~120 s recordings by joining the
//             model-benchmark ones, convert everything to 24 kHz PCM
//   baseline  every recording through gpt-transcribe and the gpt-4o-transcribe name check at once,
//             as production does (accuracy of the baseline, and the name check reused below)
//   stream    every recording streamed at real time to each realtime configuration
//   e2e       Stop → final output, one recording at a time: the baseline's /api/process against
//             the realtime path with and without the name check, at None, Light and Medium
//   fallback  realtime failures (refused, dropped mid-recording, no final transcript) followed by
//             the batch fallback
//   quality   Light and Medium refinement of realtime transcripts against the baseline's
//   report    tables.md and summary.json
//
// Every API call's estimated cost is logged to <out>/costs.jsonl; the run stops before a call
// once the total passes --cap dollars.
//
// Usage: node scripts/benchmark-realtime.js [--stages=validate,report] [--out=.eval-runs/realtime]
//        [--cap=8] [--repeat=3] [--repeat-latency=5] [--repeat-long=1] [--concurrency=6]
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
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
import { compareFillers, scoreFidelity } from '../eval/fidelity.js'
import { summarize } from '../eval/latency-stats.js'
import { addNoise, readWav, writeWav } from '../eval/noise.js'
import { partialStability, streamPcm, transcriptionSession, wavFromPcm } from '../eval/realtime.js'

dotenv.config({ quiet: true })

const ROOT = path.resolve(import.meta.dirname, '..')
const run = promisify(execFile)

function option(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}
const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)

const STAGES = list(option('stages', 'validate,audio,baseline,stream,e2e,fallback,quality,report'))
const OUT = path.resolve(ROOT, option('out', '.eval-runs/realtime'))
const CAP = Number(option('cap', '8'))
const CONCURRENCY = Number(option('concurrency', '6'))
const REPEAT = Number(option('repeat', '3'))
const REPEAT_LATENCY = Number(option('repeat-latency', '5'))
const REPEAT_LONG = Number(option('repeat-long', '1'))
const E2E_CONFIG = option('e2e-config', 'R-low')
// How long the app would wait after Stop for a final transcript before using the batch path.
const FALLBACK_TIMEOUT_MS = Number(option('fallback-timeout', '3000'))

const MAIN = 'gpt-transcribe'
const CHECK = 'gpt-4o-transcribe'
const REFINER = 'gpt-4.1'
const TTS_MODEL = 'gpt-4o-mini-tts'
const LIVE = 'gpt-live-transcribe'
const WHISPER = 'gpt-realtime-whisper'
const NOISE = { voice: 'onyx', snr: 15 }
const LEVELS = ['none', 'light', 'medium']

// sets: which recordings each configuration streams; repeat: how many times.
const REALTIME_CONFIGS = [
  { name: 'R-low', model: LIVE, delay: 'low', repeat: REPEAT, sets: ['models', 'fidelity', 'fidelity-noisy', 'long'] },
  { name: 'R-minimal', model: LIVE, delay: 'minimal', repeat: 1, sets: ['models', 'fidelity', 'fidelity-noisy'] },
  { name: 'R-medium', model: LIVE, delay: 'medium', repeat: 1, sets: ['models', 'fidelity', 'fidelity-noisy'] },
  { name: 'R-whisper', model: WHISPER, delay: 'low', repeat: 1, sets: ['models'] },
].filter((c) => list(option('configs', 'R-low,R-minimal,R-medium,R-whisper')).includes(c.name))

// The production transcription settings for each model: prompt, and the language list where the
// model takes one (transcriptionParams decides, as in the app).
// gpt-realtime-whisper refuses a prompt as well as the language list, so it gets neither.
const sessionFor = (c) =>
  transcriptionSession({ model: c.model, ...(c.model === WHISPER ? {} : transcriptionParams(c.model)), ...(c.delay ? { delay: c.delay } : {}) })

// Estimated list prices in dollars: per minute of audio, or per million tokens.
const PER_MINUTE = { [MAIN]: 0.0045, [CHECK]: 0.006, [LIVE]: 0.017, [WHISPER]: 0.017, [TTS_MODEL]: 0.015 }
const PER_MTOK = { [REFINER]: { input: 2, cached: 0.5, output: 8 } }

function callCost({ kind, model, seconds, usage }) {
  if (kind === 'transcription' || kind === 'tts' || kind === 'realtime') return ((seconds ?? 0) / 60) * (PER_MINUTE[model] ?? 0)
  const price = PER_MTOK[model]
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
      return cost
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
        await record({ kind: 'response', model: body.model, ms: performance.now() - started, usage: response.usage })
        return response
      },
    },
  }
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  let next = 0
  let stop = null
  async function work() {
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, work))
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------- Recordings ----------

const MODEL_DIR = path.join(ROOT, '.eval-samples/synthetic/models')
const FIDELITY_DIR = path.join(ROOT, '.eval-samples/synthetic/name-check')
const LONG_DIR = path.join(ROOT, '.eval-samples/synthetic/realtime-long')
const PCM_DIR = path.join(OUT, 'pcm')
const MODEL_STYLE =
  'Speak like a person dictating a quick note: natural pace, relaxed and conversational. Say every filler word (um, uh, 嗯, 呃, उम्म, अं) as a short hesitation, exactly as written, and say every self-correction as written. Read Chinese in Mandarin, Hindi in Hindi and English words in English.'
const CASUAL =
  'Speak like a person dictating a quick note: relaxed and conversational. Say every filler word (um, uh, 嗯, 呃) clearly as a short hesitation, exactly as written. Read Chinese in Mandarin and English in English.'

// The long recordings join one language group's model recordings with half a second of silence,
// so their reference is the joined scripts. zh-30-a is left out: its recording is suspected of
// missing its last sentence. LONG_TARGETS: [label, at least, at most] seconds.
const LONG_TARGETS = [
  ['60', 50, 62],
  ['120', 95, 118],
]
const LONG_ORDER = ['30-a', '30-b', '30-c', '15-a', '15-b', '15-c', '5-a', '5-b', '5-c']
const GAP_SECONDS = 0.5

function joinCases(group, parts, label) {
  return {
    id: `${group}-${label}`,
    group,
    length: Number(label),
    voice: 'joined',
    script: parts.map((c) => c.script).join(' '),
    equiv: parts.flatMap((c) => c.equiv),
    entities: parts.flatMap((c) => c.entities),
    correction: null,
    parts: parts.map((c) => c.id),
  }
}

let LONG_CASES = []
// --only=id,id limits every stage to those recordings (for trying the script out).
const ONLY = list(option('only', ''))
const RECORDINGS = () => [
  ...CASES.map((c) => ({ id: c.id, set: 'models', testCase: c, file: path.join(MODEL_DIR, `${c.id}.webm`) })),
  ...FIDELITY_CASES.map((c) => ({ id: c.id, set: 'fidelity', testCase: c, file: path.join(FIDELITY_DIR, `${c.id}.webm`) })),
  ...FIDELITY_CASES.map((c) => ({ id: `${c.id}~noisy`, set: 'fidelity-noisy', testCase: c, file: path.join(FIDELITY_DIR, `${c.id}-${NOISE.voice}-snr${NOISE.snr}.webm`) })),
  ...LONG_CASES.map((c) => ({ id: c.id, set: 'long', testCase: c, file: path.join(LONG_DIR, `${c.id}.webm`) })),
].filter((r) => !ONLY.length || ONLY.includes(r.id))

const durationOf = (buffer) => audioDurationSeconds(buffer, identifyAudio(buffer, 'audio/webm'))
const toWebm = (input, webm) => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', webm])

async function stageAudio(client, ledger) {
  await fs.mkdir(MODEL_DIR, { recursive: true })
  await fs.mkdir(FIDELITY_DIR, { recursive: true })
  await fs.mkdir(LONG_DIR, { recursive: true })
  await fs.mkdir(PCM_DIR, { recursive: true })
  // Synthesized exactly as the model and name-check benchmarks did, if they are not there yet.
  const speech = RECORDINGS().filter((r) => r.set !== 'long')
  await pool(speech, async (r, index) => {
    if (await fs.stat(r.file).catch(() => null)) return
    ledger.check()
    const voice = r.set === 'fidelity-noisy' ? NOISE.voice : r.testCase.voice
    const instructions = r.set === 'models' ? MODEL_STYLE : r.testCase.casual ? CASUAL : undefined
    const response = await client.audio.speech.create({ model: TTS_MODEL, voice, input: r.testCase.script, response_format: 'wav', ...(instructions ? { instructions } : {}) })
    let wav = writeWav(readWav(Buffer.from(await response.arrayBuffer())))
    if (r.set === 'fidelity-noisy') wav = addNoise(wav, NOISE.snr, index + 1)
    await fs.writeFile(`${r.file}.wav`, wav)
    await toWebm(`${r.file}.wav`, r.file)
    await fs.rm(`${r.file}.wav`)
    const seconds = await durationOf(await fs.readFile(r.file))
    await ledger.add({ stage: 'audio', kind: 'tts', model: TTS_MODEL, seconds })
    console.log(`audio ${r.id}: ${seconds?.toFixed(1)} s`)
  })
  await buildLongCases()
  // 24 kHz mono 16-bit PCM, what the browser's AudioWorklet would send.
  await pool(RECORDINGS(), async (r) => {
    const pcm = path.join(PCM_DIR, `${r.id}.pcm`)
    if ((await fs.stat(pcm).catch(() => null)) || !(await fs.stat(r.file).catch(() => null))) return
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', r.file, '-ac', '1', '-ar', '24000', '-f', 's16le', pcm])
  })
}

async function buildLongCases() {
  const file = path.join(OUT, 'long.json')
  const saved = JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null'))
  if (saved) {
    LONG_CASES = saved
    return
  }
  const byId = Object.fromEntries(CASES.map((c) => [c.id, c]))
  const cases = []
  for (const group of ['en', 'zh', 'hi', 'mixed']) {
    const pieces = []
    for (const suffix of LONG_ORDER) {
      const id = `${group}-${suffix}`
      if (id === 'zh-30-a') continue
      const buffer = await fs.readFile(path.join(MODEL_DIR, `${id}.webm`)).catch(() => null)
      if (buffer) pieces.push({ c: byId[id], seconds: await durationOf(buffer) })
    }
    for (const [label, atLeast, atMost] of LONG_TARGETS) {
      const parts = []
      let total = 0
      for (const piece of pieces) {
        if (total >= atLeast) break
        if (total + piece.seconds + GAP_SECONDS > atMost) continue
        parts.push(piece.c)
        total += piece.seconds + GAP_SECONDS
      }
      if (total < atLeast) {
        console.warn(`long ${group}-${label}: only ${total.toFixed(1)} s of recordings; skipped`)
        continue
      }
      const joined = joinCases(group, parts, label)
      const target = path.join(LONG_DIR, `${joined.id}.webm`)
      const inputs = parts.flatMap((c) => ['-i', path.join(MODEL_DIR, `${c.id}.webm`)])
      const filter = `${parts.map((_, i) => `[${i}:a]aresample=48000,apad=pad_dur=${GAP_SECONDS}[a${i}]`).join(';')};${parts.map((_, i) => `[a${i}]`).join('')}concat=n=${parts.length}:v=0:a=1[out]`
      await run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-ac', '1', '-c:a', 'libopus', '-b:a', '48k', target])
      cases.push(joined)
      console.log(`long ${joined.id}: ${(await durationOf(await fs.readFile(target)))?.toFixed(1)} s from ${parts.map((c) => c.id).join(' + ')}`)
    }
  }
  LONG_CASES = cases
  await fs.writeFile(file, JSON.stringify(cases, null, 1))
}

async function loadSamples() {
  const samples = {}
  for (const r of RECORDINGS()) {
    const buffer = await fs.readFile(r.file).catch(() => null)
    const pcm = await fs.readFile(path.join(PCM_DIR, `${r.id}.pcm`)).catch(() => null)
    if (!buffer || !pcm) continue
    const format = identifyAudio(buffer, 'audio/webm')
    samples[r.id] = { buffer, format, pcm, seconds: await audioDurationSeconds(buffer, format), r }
  }
  return samples
}

// ---------- validate ----------

// Each probe creates a short-lived session secret (no audio, no charge) and keeps what the API
// echoed back or why it refused. expect: what the design assumes.
const transcriptionProbe = (transcription, extra = {}) => ({ session: { type: 'transcription', audio: { input: { transcription, ...extra } } } })
const PROBES = [
  ['gpt-live-transcribe: production prompt, languages zh/en/hi, PCM 24 kHz, delay low', transcriptionProbe({ model: LIVE, ...transcriptionParams(LIVE), delay: 'low' }, { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: null }), 'accepted'],
  ...['minimal', 'low', 'medium', 'high', 'xhigh'].map((delay) => [`gpt-live-transcribe: delay ${delay}`, transcriptionProbe({ model: LIVE, delay }), 'accepted']),
  ['gpt-live-transcribe: delay "fast" (not a documented value)', transcriptionProbe({ model: LIVE, delay: 'fast' }), 'rejected'],
  ['gpt-live-transcribe: keywords', transcriptionProbe({ model: LIVE, keywords: ['Dictator', '纽约大学'] }), 'accepted'],
  ['gpt-live-transcribe: server VAD turn detection', transcriptionProbe({ model: LIVE }, { turn_detection: { type: 'server_vad' } }), 'rejected'],
  ['gpt-live-transcribe: semantic VAD turn detection', transcriptionProbe({ model: LIVE }, { turn_detection: { type: 'semantic_vad' } }), 'rejected'],
  ['gpt-live-transcribe: near-field noise reduction', transcriptionProbe({ model: LIVE }, { noise_reduction: { type: 'near_field' } }), 'accepted'],
  ['gpt-live-transcribe: PCM at 16 kHz', transcriptionProbe({ model: LIVE }, { format: { type: 'audio/pcm', rate: 16000 } }), 'rejected'],
  ['gpt-live-transcribe: G.711 µ-law', transcriptionProbe({ model: LIVE }, { format: { type: 'audio/pcmu' } }), 'accepted'],
  ['gpt-live-transcribe: logprobs', { session: { ...transcriptionProbe({ model: LIVE }).session, include: ['item.input_audio_transcription.logprobs'] } }, 'accepted'],
  ['gpt-realtime-whisper: languages zh/en/hi', transcriptionProbe({ model: WHISPER, languages: ['zh', 'en', 'hi'] }), 'rejected'],
  ['gpt-realtime-whisper: production prompt', transcriptionProbe({ model: WHISPER, ...transcriptionParams(WHISPER) }), 'rejected'],
  ['gpt-realtime-whisper: no prompt, no language, delay low', transcriptionProbe({ model: WHISPER, delay: 'low' }), 'accepted'],
  ['gpt-realtime-whisper: server VAD', transcriptionProbe({ model: WHISPER }, { turn_detection: { type: 'server_vad' } }), 'rejected'],
  ['gpt-4o-transcribe: realtime session with server VAD', transcriptionProbe({ model: CHECK }, { turn_detection: { type: 'server_vad' } }), 'accepted'],
]

async function stageValidate(apiKey) {
  const rows = []
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  for (const [name, body, expect] of PROBES) {
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', { method: 'POST', headers, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    // The secret itself is never kept.
    const result = res.ok ? 'accepted' : 'rejected'
    rows.push({ name, expect, result, status: res.status, echoed: json.session?.audio?.input ?? null, include: json.session?.include ?? null, error: json.error?.message ?? null, sent: body })
    console.log(`validate ${result === expect ? 'as expected' : 'UNEXPECTED'}: ${name} → ${result}${json.error ? ` (${json.error.message})` : ''}`)
  }
  const models = await (await fetch('https://api.openai.com/v1/models', { headers })).json().catch(() => ({}))
  const ids = new Set((models.data ?? []).map((m) => m.id))
  const listed = Object.fromEntries([LIVE, WHISPER, MAIN, CHECK, REFINER].map((m) => [m, ids.has(m)]))
  // The file endpoint, to confirm the realtime model cannot be used for batch transcription.
  const form = new FormData()
  form.append('model', LIVE)
  form.append('file', new Blob([wavFromPcm(Buffer.alloc(48_000))], { type: 'audio/wav' }), 'silence.wav')
  const batch = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: headers.Authorization }, body: form })
  const batchError = (await batch.json().catch(() => ({}))).error?.message ?? null
  await fs.writeFile(path.join(OUT, 'validate.json'), JSON.stringify({ time: new Date().toISOString(), probes: rows, listed, liveOnBatchEndpoint: { status: batch.status, error: batchError } }, null, 1))
  console.log('listed:', listed, '| gpt-live-transcribe on the file endpoint:', batch.status, batchError)
}

// ---------- baseline ----------

async function transcribeOnce(client, model, sample, { wav = false } = {}) {
  const file = wav ? await toFile(wavFromPcm(sample.pcm), 'recording.wav', { type: 'audio/wav' }) : await toFile(sample.buffer, `recording.${sample.format.extension}`, { type: sample.format.mimeType })
  const started = performance.now()
  try {
    const response = await client.audio.transcriptions.create({ file, model, response_format: 'json', ...transcriptionParams(model) }, { timeout: 60_000 })
    return { text: response.text, ms: performance.now() - started }
  } catch (err) {
    if (err.cap) throw err
    return { text: null, ms: performance.now() - started, error: String(err.status ?? err.name) }
  }
}

async function stageBaseline(client, ledger, samples) {
  const stage = await openStage('baseline')
  const jobs = []
  for (let rep = 1; rep <= REPEAT; rep++) {
    for (const r of RECORDINGS()) {
      const key = `${r.id}|${rep}`
      if (samples[r.id] && !stage.has(key)) jobs.push({ key, r, rep })
    }
  }
  await pool(jobs, async ({ key, r, rep }) => {
    const sample = samples[r.id]
    const wrapped = instrument(client, ledger, { stage: 'baseline', seconds: sample.seconds })
    const [main, check] = await Promise.all([MAIN, CHECK].map((model) => transcribeOnce(wrapped, model, sample)))
    await stage.add({ key, id: r.id, set: r.set, rep, seconds: sample.seconds, main, check })
    console.log(`baseline ${r.id} #${rep}: ${Math.round(main.ms)} / ${Math.round(check.ms)} ms  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

// ---------- stream ----------

// Streams one recording; the audio sent is charged as it would be billed, whatever happens.
async function streamOnce({ apiKey, ledger, stage, config, sample, ...options }) {
  ledger.check()
  const result = await streamPcm({ pcm: sample.pcm, session: sessionFor(config), apiKey, completeTimeoutMs: 60_000, ...options })
  const sent = result.stopMs !== null ? result.audioMs : options.dropAtMs ?? 0
  const cost = await ledger.add({ stage, kind: 'realtime', model: config.model, seconds: result.connectMs === null ? 0 : sent / 1000 })
  return { ...result, cost }
}

const slim = (stream) => ({
  ok: stream.ok,
  error: stream.error,
  audioMs: stream.audioMs,
  connectMs: stream.connectMs,
  readyMs: stream.readyMs,
  firstDeltaMs: stream.firstDeltaMs,
  finalMs: stream.finalMs,
  items: stream.committed.length,
  finalText: stream.finalText,
  stability: partialStability(stream),
  deltas: stream.deltas.map((d) => [Math.round(d.ms), d.text]),
  usage: stream.usage,
  events: stream.events,
  cost: stream.cost,
})

async function stageStream(apiKey, ledger, samples) {
  const stage = await openStage('stream')
  const jobs = []
  for (const config of REALTIME_CONFIGS) {
    for (let rep = 1; rep <= config.repeat; rep++) {
      for (const r of RECORDINGS().filter((x) => config.sets.includes(x.set))) {
        const key = `${config.name}|${r.id}|${rep}`
        if (samples[r.id] && !stage.has(key)) jobs.push({ key, config, r, rep })
      }
    }
  }
  console.log(`stream: ${jobs.length} recordings to stream, ${Math.round(jobs.reduce((s, j) => s + samples[j.r.id].seconds, 0) / 60)} minutes of audio, ${CONCURRENCY} at a time`)
  await pool(jobs, async ({ key, config, r, rep }) => {
    const stream = await streamOnce({ apiKey, ledger, stage: 'stream', config, sample: samples[r.id] })
    await stage.add({ key, config: config.name, id: r.id, set: r.set, rep, seconds: samples[r.id].seconds, ...slim(stream) })
    console.log(`stream ${config.name} ${r.id} #${rep}: ${stream.ok ? `final ${Math.round(stream.finalMs)} ms after Stop` : stream.error}  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

// ---------- e2e ----------

async function timeRequest(baseUrl, sample, level, requestId) {
  const form = new FormData()
  form.append('requestId', requestId)
  form.append('refinementLevel', level)
  form.append('audio', new Blob([sample.buffer], { type: sample.format.mimeType }), `recording.${sample.format.extension}`)
  const started = performance.now()
  const res = await fetch(`${baseUrl}/api/process`, { method: 'POST', body: form })
  const body = await res.json().catch(() => null)
  return { status: res.status, body, ms: performance.now() - started }
}

// Settles with when it settled, in ms after `from`, and its value or error.
const timed = (promise, from) => promise.then(
  (value) => ({ value, at: performance.now() - from }),
  (error) => ({ error, at: performance.now() - from }),
)

/**
 * The proposed realtime path for one recording and level, timed from Stop:
 * the name check (gpt-4o-transcribe on the WAV of the streamed PCM) starts at Stop; refinement
 * starts on the final realtime transcript; the check is waited for at most NAME_CHECK_WAIT_MS
 * after the transcript, as in production. Two outputs come from the same calls:
 *   alone      no name check: the transcript (None) or its refinement
 *   withCheck  the name check applied: at None the text is final only once the check is done or
 *              timed out; at Light and Medium the swap is made in the refined text (O2), or the
 *              changed transcript is refined again
 */
async function realtimeE2E({ client, apiKey, ledger, config, sample, level }) {
  const wrapped = instrument(client, ledger, { stage: 'e2e', seconds: sample.seconds })
  let stopAt = null
  let check = null
  const stream = await streamOnce({
    apiKey,
    ledger,
    stage: 'e2e',
    config,
    sample,
    onStop: () => {
      stopAt = performance.now()
      check = timed(transcribeOnce(wrapped, CHECK, sample, { wav: true }), stopAt)
    },
  })
  const base = { stream: slim(stream) }
  if (!stream.ok) return { ...base, ok: false }
  const finalAt = performance.now() - stopAt
  const refine = (transcript) => refineTranscript({ client: wrapped, model: REFINER, transcript, level })
  const refined = level === 'none' ? null : timed(refine(stream.finalText), stopAt)
  const deadline = finalAt + NAME_CHECK_WAIT_MS
  const second = await Promise.race([check, sleep(deadline - (performance.now() - stopAt)).then(() => null)])
  const checkUsable = second?.value?.text ? second : null
  const checkReadyAt = Math.min(Math.max(second?.at ?? deadline, finalAt), deadline)
  const restored = restoreSpokenNames(stream.finalText, checkUsable?.value.text ?? null)
  const out = { ...base, ok: true, finalAt, checkAt: (await check).at, checkUsed: Boolean(checkUsable), swapped: restored.swapped, raw: restored.text }
  if (level === 'none') return { ...out, alone: stream.finalText, aloneAt: finalAt, withCheck: restored.text, withCheckAt: checkReadyAt }
  const r = await refined
  if (r.error) return { ...out, ok: false, error: `refinement: ${r.error.code ?? r.error.message}` }
  out.alone = r.value
  out.aloneAt = r.at
  if (!restored.swapped) return { ...out, withCheck: r.value, withCheckAt: Math.max(r.at, checkReadyAt), refinedTwice: false }
  const placed = applySwaps(r.value, restored.swaps)
  if (placed !== null) return { ...out, withCheck: placed, withCheckAt: Math.max(r.at, checkReadyAt), refinedTwice: false }
  const again = await timed(refine(restored.text), stopAt)
  return { ...out, withCheck: again.value ?? null, withCheckAt: again.at, refinedTwice: true }
}

async function startBaselineServer(client, ledger) {
  const base = { ...withoutUsageLimits(loadConfig()), exposeTimings: true }
  const wrapped = instrument(client, ledger, { stage: 'e2e' })
  // The corrected production baseline: the name check with the number fix, refinement after it.
  const app = createApp({ ...base, transcriptionModel: MAIN, refinementModel: REFINER, nameCheckModel: CHECK, nameCheckOverlap: false }, { openai: wrapped, log: () => {} })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  return { server, wrapped, url: `http://127.0.0.1:${server.address().port}` }
}

async function baselineE2E(target, sample, level, requestId) {
  target.wrapped.meta.seconds = sample.seconds
  const first = target.wrapped.calls.length
  const { status, body, ms } = await timeRequest(target.url, sample, level, requestId)
  const calls = target.wrapped.calls.slice(first)
  const t = body?.timings ?? {}
  return {
    ok: status === 200 && (level === 'none' || body?.refinementStatus === 'success'),
    status,
    finalAt: ms,
    transcriptionMs: t.transcriptionMs ?? null,
    refinementMs: t.refinementMs ?? null,
    mainMs: calls.find((c) => c.model === MAIN)?.ms ?? null,
    checkMs: calls.find((c) => c.model === CHECK)?.ms ?? null,
    raw: body?.rawTranscript ?? null,
    output: body?.polishedTranscript ?? null,
    cost: calls.reduce((sum, c) => sum + callCost({ ...c, seconds: c.kind === 'transcription' ? sample.seconds : undefined }), 0),
  }
}

async function stageE2E(client, apiKey, ledger, samples) {
  const stage = await openStage('e2e')
  const config = REALTIME_CONFIGS.find((c) => c.name === E2E_CONFIG) ?? { name: E2E_CONFIG, model: LIVE, delay: E2E_CONFIG.replace(/^R-/, '') }
  const target = await startBaselineServer(client, ledger)
  const jobs = []
  for (let rep = 1; rep <= REPEAT_LATENCY; rep++) {
    for (const id of LATENCY_CASE_IDS) for (const level of LEVELS) jobs.push({ id, level, rep })
    if (rep <= REPEAT_LONG) for (const c of LONG_CASES) jobs.push({ id: c.id, level: 'light', rep })
  }
  try {
    for (const { id, level, rep } of jobs) {
      const sample = samples[id]
      if (!sample) continue
      // Alternating which path goes first spreads any drift in API speed over both.
      const order = rep % 2 ? ['Baseline', 'Realtime'] : ['Realtime', 'Baseline']
      for (const path_ of order) {
        const key = `${path_}|${id}|${level}|${rep}`
        if (stage.has(key)) continue
        ledger.check()
        const result =
          path_ === 'Baseline'
            ? await baselineE2E(target, sample, level, `rt-baseline-${id}-${level}-${rep}`)
            : await realtimeE2E({ client, apiKey, ledger, config, sample, level })
        await stage.add({ key, path: path_, config: path_ === 'Baseline' ? 'Baseline' : config.name, id, level, rep, seconds: sample.seconds, ...result })
        const shown = path_ === 'Baseline' ? `${Math.round(result.finalAt)} ms` : result.ok ? `${Math.round(result.withCheckAt)} ms with check, ${Math.round(result.aloneAt)} ms without` : result.error ?? result.stream?.error
        console.log(`e2e #${rep} ${id} ${level.padEnd(6)} ${path_.padEnd(8)} ${shown}  ($${ledger.total.toFixed(3)})`)
      }
    }
  } finally {
    target.server.close()
    await stage.flush()
  }
}

// ---------- fallback ----------

// Each mode breaks the realtime path one way; the batch request then starts when the app would
// notice: at Stop for a socket that never opened or dropped, FALLBACK_TIMEOUT_MS after Stop when
// no final transcript arrives.
const FALLBACK_MODES = [
  { name: 'refused', label: 'Connection refused at Record', options: { url: 'ws://127.0.0.1:9' } },
  { name: 'dropped', label: 'Connection lost halfway through', options: (sample) => ({ dropAtMs: (sample.pcm.length / 48) / 2 }) },
  { name: 'stalled', label: 'No final transcript after Stop', options: { commit: false, completeTimeoutMs: FALLBACK_TIMEOUT_MS } },
]

async function stageFallback(client, apiKey, ledger, samples) {
  const stage = await openStage('fallback')
  const config = REALTIME_CONFIGS.find((c) => c.name === E2E_CONFIG) ?? REALTIME_CONFIGS[0]
  const target = await startBaselineServer(client, ledger)
  try {
    for (const mode of FALLBACK_MODES) {
      for (const id of LATENCY_CASE_IDS) {
        const key = `${mode.name}|${id}`
        const sample = samples[id]
        if (!sample || stage.has(key)) continue
        ledger.check()
        const options = typeof mode.options === 'function' ? mode.options(sample) : mode.options
        const started = performance.now()
        const stream = await streamOnce({ apiKey, ledger, stage: 'fallback', config, sample, ...options })
        // The user keeps talking until the end of the recording whatever happened to the socket.
        const audioEnd = started + (stream.readyMs ?? stream.connectMs ?? 0) + sample.pcm.length / 48
        if (stream.stopMs === null) await sleep(Math.max(0, audioEnd - performance.now()))
        const noticedAfterStop = stream.stopMs === null ? 0 : performance.now() - (started + stream.stopMs)
        const batch = await baselineE2E(target, sample, 'light', `rt-fallback-${mode.name}-${id}`)
        await stage.add({
          key,
          mode: mode.name,
          id,
          seconds: sample.seconds,
          realtimeError: stream.error,
          realtimeOk: stream.ok,
          noticedAfterStop,
          finalAt: noticedAfterStop + batch.finalAt,
          ok: batch.ok,
          realtimeCost: stream.cost,
          batchCost: batch.cost,
          output: batch.output,
        })
        console.log(`fallback ${mode.name} ${id}: ${stream.error} → batch ${batch.ok ? 'ok' : 'failed'}, ${Math.round(noticedAfterStop + batch.finalAt)} ms after Stop  ($${ledger.total.toFixed(3)})`)
      }
    }
  } finally {
    target.server.close()
    await stage.flush()
  }
}

// ---------- quality ----------

// The name check reused from the baseline capture of the same recording and repeat: usable when
// it would have arrived within NAME_CHECK_WAIT_MS of the realtime transcript (both timed from Stop).
function withCheck(streamRow, baselineRow) {
  if (!streamRow?.finalText) return null
  const check = baselineRow?.check
  const usable = check?.text && check.ms <= streamRow.finalMs + NAME_CHECK_WAIT_MS ? check.text : null
  return restoreSpokenNames(streamRow.finalText, usable)
}

async function stageQuality(client, ledger) {
  const stage = await openStage('quality')
  const streams = await openStage('stream')
  const baseline = await openStage('baseline')
  const key = (row) => `${row.id}|${row.rep}`
  const baseBy = Object.fromEntries(baseline.rows.map((row) => [key(row), row]))
  const jobs = []
  for (const row of streams.rows.filter((r) => r.config === E2E_CONFIG && r.set === 'models' && r.rep === 1 && r.finalText)) {
    const b = baseBy[key(row)]
    const inputs = {
      Baseline: b?.main?.text ? restoreSpokenNames(b.main.text, b.check?.text && b.check.ms - b.main.ms <= NAME_CHECK_WAIT_MS ? b.check.text : null).text : null,
      [`${E2E_CONFIG} + check`]: withCheck(row, b)?.text ?? null,
      [E2E_CONFIG]: row.finalText,
    }
    for (const [config, input] of Object.entries(inputs)) {
      for (const level of ['light', 'medium']) {
        const k = `${config}|${row.id}|${level}`
        if (input && !stage.has(k)) jobs.push({ key: k, config, id: row.id, level, input })
      }
    }
  }
  await pool(jobs, async (job) => {
    ledger.check()
    const wrapped = instrument(client, ledger, { stage: 'quality' })
    const output = await refineTranscript({ client: wrapped, model: REFINER, transcript: job.input, level: job.level }).catch(() => null)
    await stage.add({ ...job, output })
    console.log(`quality ${job.config} ${job.level} ${job.id}: ${output ? 'ok' : 'failed'}  ($${ledger.total.toFixed(3)})`)
  })
  await stage.flush()
}

// ---------- Report ----------

const pct = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(digits)}%`)
const ms = (value) => (value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-US'))
const usd = (value) => `$${value.toFixed(4)}`
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
function rate(successes, n) {
  if (!n) return '—'
  const [low, high] = wilson(successes, n)
  return `${pct(successes / n)} (${successes}/${n}, ${pct(low, 0)}–${pct(high, 0)})`
}
const LEVEL_NAME = { none: 'None', light: 'Light', medium: 'Medium' }
const ENTITY_TYPES = ['name', 'term', 'number', 'date', 'negation']
const lengthBucket = (seconds) => (seconds < 10 ? '~5 s' : seconds < 20 ? '~15 s' : seconds < 40 ? '~30 s' : seconds < 80 ? '~60 s' : '~120 s')

function validateSection(validate) {
  if (!validate) return []
  const lines = ['## API validation (no audio)', '', `Session settings sent to \`POST /v1/realtime/client_secrets\` on ${validate.time}; "accepted" means the API created the session with that setting.`, '']
  lines.push(table(['Setting', 'Design assumes', 'API', 'Detail'], validate.probes.map((p) => [p.name, p.expect, p.result === p.expect ? p.result : `**${p.result}**`, p.error ?? ''])), '')
  lines.push(`Models listed by \`/v1/models\`: ${Object.entries(validate.listed).map(([m, ok]) => `\`${m}\` ${ok ? 'yes' : '**no**'}`).join(', ')}. \`gpt-live-transcribe\` on the file endpoint: HTTP ${validate.liveOnBatchEndpoint.status}${validate.liveOnBatchEndpoint.error ? ` (${validate.liveOnBatchEndpoint.error})` : ''}.`, '')
  return lines
}

function streamingSection(streams) {
  const lines = ['## Streaming behaviour', '']
  lines.push(`Every recording streamed at real time in 100 ms frames, committed once at Stop. Final = Stop → completed transcript. Partials: the deltas joined, against the final text. ${CONCURRENCY} streams ran at once.`, '')
  const summary = {}
  const header = ['Config', 'Streams', 'Failed', 'Connect + ready p50', 'First partial p50 (after speech start)', 'Final p50', 'Final p95', 'Final max', 'Partials equal final', 'Partial revision (chars)', 'Final shown before Stop', 'Items per stream > 1']
  const body = REALTIME_CONFIGS.map((c) => {
    const rs = streams.filter((s) => s.config === c.name)
    const ok = rs.filter((s) => s.ok)
    const st = ok.map((s) => s.stability).filter(Boolean)
    const final = summarize(ok.map((s) => s.finalMs))
    const revision = st.reduce((sum, s) => sum + s.revision, 0) / (st.length || 1)
    summary[c.name] = { n: rs.length, failed: rs.length - ok.length, final, revision, matches: [st.filter((s) => s.matchesFinal).length, st.length], shown: st.reduce((sum, s) => sum + s.shownAtStop, 0) / (st.length || 1), errors: rs.filter((s) => !s.ok).map((s) => `${s.id} #${s.rep}: ${s.error}`) }
    return [c.name, rs.length, rs.length - ok.length, ms(summarize(ok.map((s) => s.readyMs))?.p50), ms(summarize(ok.map((s) => s.firstDeltaMs))?.p50), ms(final?.p50), ms(final?.p95), ms(final?.max), rate(...summary[c.name].matches), pct(revision, 2), pct(summary[c.name].shown, 0), ok.filter((s) => s.items > 1).length]
  })
  lines.push(table(header, body), '')
  const failures = Object.values(summary).flatMap((s) => s.errors)
  if (failures.length) lines.push(`Failures: ${failures.join('; ')}.`, '')

  lines.push('### Final transcript latency by recording length', '')
  const buckets = ['~5 s', '~15 s', '~30 s', '~60 s', '~120 s']
  const lbody = REALTIME_CONFIGS.map((c) => {
    const ok = streams.filter((s) => s.config === c.name && s.ok)
    return [c.name, ...buckets.map((b) => {
      const s = summarize(ok.filter((x) => lengthBucket(x.seconds) === b).map((x) => x.finalMs))
      return s ? `${ms(s.p50)} / ${ms(s.p95)} (${s.count})` : '—'
    })]
  })
  lines.push(table(['Config', ...buckets.map((b) => `${b} p50 / p95 (n)`)], lbody), '')
  const over = streams.filter((s) => s.ok && s.finalMs > FALLBACK_TIMEOUT_MS)
  lines.push(`Finals slower than the ${FALLBACK_TIMEOUT_MS} ms fallback timeout (each would have run the batch path too, paying twice): ${over.length}/${streams.filter((s) => s.ok).length}.`, '')
  const usage = streams.flatMap((s) => s.usage ?? [])
  if (usage.length) lines.push(`Usage reported in completed events (first example): \`${JSON.stringify(usage[0])}\`.`, '')
  return { lines, summary }
}

// Raw transcripts of every configuration, per recording and repeat.
function transcriptRows(baseline, streams) {
  const recordings = Object.fromEntries(RECORDINGS().map((r) => [r.id, r]))
  const baseBy = Object.fromEntries(baseline.map((row) => [`${row.id}|${row.rep}`, row]))
  const rows = []
  for (const b of baseline) {
    const r = recordings[b.id]
    if (!r || !b.main?.text) continue
    const usable = b.check?.text && b.check.ms - b.main.ms <= NAME_CHECK_WAIT_MS ? b.check.text : null
    rows.push({ config: 'Baseline', r, rep: b.rep, raw: restoreSpokenNames(b.main.text, usable).text })
  }
  for (const s of streams) {
    const r = recordings[s.id]
    if (!r || !s.finalText) continue
    rows.push({ config: s.config, r, rep: s.rep, raw: s.finalText })
    if (s.config === E2E_CONFIG) rows.push({ config: `${s.config} + check`, r, rep: s.rep, raw: withCheck(s, baseBy[`${s.id}|${s.rep}`]).text })
  }
  return rows
}

function accuracySection(rows) {
  const configs = ['Baseline', ...REALTIME_CONFIGS.flatMap((c) => (c.name === E2E_CONFIG ? [c.name, `${c.name} + check`] : [c.name]))]
  const lines = ['## Transcription accuracy (raw transcript, before refinement)', '']
  lines.push(`Corpus rates over all repeats, fillers ignored. Baseline is production with the number fix: \`${MAIN}\` with the \`${CHECK}\` name check. "+ check" applies the same name check (the baseline's \`${CHECK}\` transcript of the same recording and repeat) to the realtime transcript. Configurations other than ${E2E_CONFIG} ran once.`, '')
  const summary = {}
  for (const sets of [['models'], ['long']]) {
    const rs = rows.filter((x) => sets.includes(x.r.set))
    if (!rs.length) continue
    const header = ['Config', 'English WER', 'Mandarin CER', 'Hindi WER', 'Mixed CER', 'Verbatim (fillers kept)', 'Code-switching kept', 'Recordings with a translation', ...ENTITY_TYPES.map((t) => `${t}s missed`)]
    const body = []
    for (const name of configs) {
      const scores = rs.filter((x) => x.config === name).map((x) => ({ ...x, score: scoreTranscription(x.r.testCase, x.raw) }))
      if (!scores.length) continue
      const group = (g) => scores.filter((x) => x.r.testCase.group === g)
      const lang = scores.reduce((s, x) => ({ switches: s.switches + x.score.language.switches, kept: s.kept + x.score.language.switchesKept }), { switches: 0, kept: 0 })
      const entities = scores.flatMap((x) => x.score.entities)
      const s = {
        en: corpusRate(group('en').map((x) => x.score.primary)).rate,
        zh: corpusRate(group('zh').map((x) => x.score.primary)).rate,
        hi: corpusRate(group('hi').map((x) => x.score.primary)).rate,
        mixed: corpusRate(group('mixed').map((x) => x.score.mixed)).rate,
        verbatim: corpusRate(scores.map((x) => x.score.verbatim)).rate,
        switching: lang.switches ? lang.kept / lang.switches : null,
        translated: [scores.filter((x) => x.score.language.translations.length).length, scores.length],
        missed: Object.fromEntries(ENTITY_TYPES.map((t) => [t, [entities.filter((e) => e.type === t && !e.kept).length, entities.filter((e) => e.type === t).length]])),
      }
      summary[`${name}|${sets[0]}`] = s
      body.push([name, pct(s.en, 2), pct(s.zh, 2), pct(s.hi, 2), pct(s.mixed, 2), pct(s.verbatim, 2), pct(s.switching), rate(...s.translated), ...ENTITY_TYPES.map((t) => `${s.missed[t][0]}/${s.missed[t][1]}`)])
    }
    lines.push(sets[0] === 'models' ? '### The 36 model-benchmark recordings (5–30 s)' : '### Long recordings (~60 s and ~120 s, joined from the model recordings)', '', table(header, body), '')
  }
  for (const set of ['fidelity', 'fidelity-noisy']) {
    const rs = rows.filter((x) => x.r.set === set)
    if (!rs.length) continue
    lines.push(`### The 31 name recordings, ${set === 'fidelity' ? 'clean' : `${NOISE.voice} voice, pink noise at ${NOISE.snr} dB SNR`}`, '')
    const body = []
    for (const name of configs) {
      const scored = rs.filter((x) => x.config === name).map((x) => ({ ...x, score: scoreFidelity(x.r.testCase.script, x.raw, x.r.testCase.terms) }))
      if (!scored.length) continue
      const terms = scored.reduce((s, x) => ({ kept: s.kept + x.score.terms.kept, expected: s.expected + x.score.terms.expected }), { kept: 0, expected: 0 })
      const verbatim = scored.reduce((s, x) => ({ errors: s.errors + x.score.verbatim.errors, N: s.N + x.score.verbatim.N }), { errors: 0, N: 0 })
      const fillers = scored.map((x) => compareFillers(x.r.testCase.script, x.raw)).reduce((s, f) => ({ expected: s.expected + f.expected, kept: s.kept + f.kept }), { expected: 0, kept: 0 })
      const languages = scored.filter((x) => x.score.languages.preserved).length
      const reps = new Set(scored.map((x) => x.rep)).size
      summary[`${name}|${set}`] = { namesKept: [terms.kept, terms.expected], reps, languagesKept: [languages, scored.length], fillers: [fillers.kept, fillers.expected] }
      body.push([name, reps, `${terms.kept}/${terms.expected}`, `${(terms.kept / reps).toFixed(1)}/${terms.expected / reps}`, `${languages}/${scored.length}`, `${fillers.kept}/${fillers.expected}`, pct(verbatim.N ? verbatim.errors / verbatim.N : null)])
    }
    lines.push(table(['Config', 'Repeats', 'Names kept as spoken (all repeats)', 'Per repeat', 'Languages kept', 'Fillers kept', 'Mixed token error'], body), '')
  }
  return { lines, summary }
}

function e2eSection(e2e) {
  const lines = ['## Stop → final output', '']
  lines.push(`One recording at a time, everything in this process. Baseline: the \`/api/process\` round trip on loopback (upload included). Realtime (${E2E_CONFIG}): Stop → the output the app would show as final and copyable. "+ check": the \`${CHECK}\` name check started at Stop on the streamed audio (WAV), waited for at most ${NAME_CHECK_WAIT_MS} ms after the transcript, refinement alongside it (O2); at None the text is final once the check is back. "no check": refinement straight on the realtime transcript. Neither path includes the browser ↔ server hop, so the realtime figures leave out the relay the design adds (one round trip for the commit and the result). ${REPEAT_LATENCY} repeats × ${LATENCY_CASE_IDS.length} recordings per row.`, '')
  const summary = {}
  const header = ['Level', 'Path', 'Runs', 'Failed', 'p50', 'p95', 'Mean', 'Saved at p50', 'Saved at p95', 'Transcript ready p50', 'Check ready p50', 'Refined twice']
  const body = []
  for (const level of LEVELS) {
    const rows = e2e.filter((x) => x.level === level && LATENCY_CASE_IDS.includes(x.id))
    const base = rows.filter((x) => x.path === 'Baseline')
    const rt = rows.filter((x) => x.path === 'Realtime')
    const b = summarize(base.filter((x) => x.ok).map((x) => x.finalAt))
    const entries = [
      ['Baseline (batch + check)', base, (x) => x.finalAt],
      [`${E2E_CONFIG} + check`, rt, (x) => x.withCheckAt],
      [`${E2E_CONFIG}, no check`, rt, (x) => x.aloneAt],
    ]
    for (const [name, set, value] of entries) {
      const ok = set.filter((x) => x.ok)
      const s = summarize(ok.map(value))
      summary[`${name}|${level}`] = s
      const saved = (k) => (b && s && name !== entries[0][0] ? `${ms(b[k] - s[k])} ms (${pct((b[k] - s[k]) / b[k], 0)})` : '—')
      body.push([LEVEL_NAME[level], name, set.length, set.length - ok.length, ms(s?.p50), ms(s?.p95), ms(s?.mean), saved('p50'), saved('p95'), ms(summarize(ok.map((x) => (x.path === 'Baseline' ? x.transcriptionMs : x.finalAt)))?.p50), ms(summarize(ok.map((x) => (x.path === 'Baseline' ? x.checkMs : x.checkAt)))?.p50), level === 'none' || name.endsWith('no check') ? '—' : x2(ok)])
    }
  }
  lines.push(table(header, body), '')
  lines.push('Transcript ready: for the baseline, the server\'s transcription stage (main transcript plus the name-check wait); for realtime, Stop → completed transcript. Check ready: the name-check call (baseline, from the upload) or Stop → check back (realtime).', '')
  const long = e2e.filter((x) => !LATENCY_CASE_IDS.includes(x.id))
  if (long.length) {
    lines.push('### Long recordings (Light)', '')
    const lbody = long.filter((x) => x.path === 'Baseline').map((x) => {
      const rt = long.find((y) => y.path === 'Realtime' && y.id === x.id && y.rep === x.rep)
      return [x.id, `${x.seconds.toFixed(0)} s`, x.ok ? ms(x.finalAt) : 'failed', rt?.ok ? ms(rt.withCheckAt) : rt?.error ?? rt?.stream?.error ?? '—', rt?.ok ? ms(rt.aloneAt) : '—', rt?.ok ? ms(rt.finalAt) : '—']
    })
    lines.push(table(['Recording', 'Length', 'Baseline', `${E2E_CONFIG} + check`, `${E2E_CONFIG}, no check`, 'Realtime transcript ready'], lbody), '')
  }
  const swaps = e2e.filter((x) => x.path === 'Realtime' && x.ok)
  lines.push(`Name check on the realtime path: back within the wait in ${swaps.filter((x) => x.checkUsed).length}/${swaps.length} runs; it changed the transcript in ${swaps.filter((x) => x.swapped).length}.`, '')
  return { lines, summary }
}
const x2 = (ok) => `${ok.filter((x) => x.refinedTwice || (x.refinementCalls ?? 0) > 1).length}/${ok.length}`

function fallbackSection(fallback, e2e) {
  if (!fallback.length) return { lines: [], summary: {} }
  const lines = ['## Fallback to the batch path', '']
  lines.push(`Each failure was injected on the ${LATENCY_CASE_IDS.length} latency recordings at Light; the batch request (\`/api/process\`, unchanged) starts when the app would notice: at Stop, or ${FALLBACK_TIMEOUT_MS} ms after it when no final transcript arrives. Extra latency is against the baseline's p50 for the same recording at Light. Extra cost is the realtime audio billed before the failure.`, '')
  const baseP50 = (id) => summarize(e2e.filter((x) => x.path === 'Baseline' && x.level === 'light' && x.id === id && x.ok).map((x) => x.finalAt))?.p50 ?? null
  const summary = {}
  const body = FALLBACK_MODES.map((mode) => {
    const rs = fallback.filter((x) => x.mode === mode.name)
    const ok = rs.filter((x) => x.ok && x.output)
    const extra = ok.map((x) => (baseP50(x.id) === null ? null : x.finalAt - baseP50(x.id))).filter((v) => v !== null)
    const s = { n: rs.length, ok: ok.length, final: summarize(ok.map((x) => x.finalAt)), extra: summarize(extra), realtimeCost: rs.reduce((sum, x) => sum + x.realtimeCost, 0) / (rs.length || 1), batchCost: rs.reduce((sum, x) => sum + x.batchCost, 0) / (rs.length || 1), errors: [...new Set(rs.map((x) => x.realtimeError))] }
    summary[mode.name] = s
    return [mode.label, `${ok.length}/${rs.length}`, s.errors.join(', '), ms(s.final?.p50), ms(s.final?.p95), ms(s.extra?.p50), usd(s.realtimeCost), usd(s.batchCost)]
  })
  lines.push(table(['Failure', 'Text delivered', 'Realtime error seen', 'Stop → final p50', 'p95', 'Extra vs baseline p50', 'Realtime cost wasted / recording', 'Batch cost / recording'], body), '')
  lines.push('Duplicate processing: in every mode the realtime path produced no transcript, so refinement ran once (on the batch transcript). The case that would refine twice is a final transcript arriving after the fallback has started; its frequency is the "slower than the fallback timeout" count under Streaming behaviour.', '')
  return { lines, summary }
}

function qualitySection(quality) {
  if (!quality.length) return { lines: [], summary: {} }
  const lines = ['## Refinement quality (end to end)', '']
  lines.push(`Repeat 1 of the 36 model recordings, refined at Light and Medium with the production refiner (\`${REFINER}\`). Rule-based checks against what was said (the reference), as in the model benchmark: entities kept, the self-correction resolved, no language translated, no new numbers. Transcription errors that survive refinement count here.`, '')
  const byId = Object.fromEntries(CASES.map((c) => [c.id, c]))
  const summary = {}
  const configs = [...new Set(quality.map((x) => x.config))]
  const body = []
  for (const level of ['light', 'medium']) {
    for (const config of configs) {
      const rs = quality.filter((x) => x.config === config && x.level === level)
      const checks = rs.filter((x) => x.output).map((x) => ({ c: byId[x.id], check: checkRefinementOutput(byId[x.id], byId[x.id].script, x.output) }))
      const corrections = checks.filter((x) => x.c.correction)
      const s = {
        meaning: [checks.filter((x) => x.check.meaningPreserved).length, rs.length],
        correction: [corrections.filter((x) => x.check.correction).length, corrections.length],
        translation: [checks.filter((x) => !x.check.languagePreserved).length, checks.length],
        numbers: [checks.filter((x) => x.check.hallucinationSuspected).length, checks.length],
        failed: rs.length - checks.length,
      }
      summary[`${config}|${level}`] = s
      body.push([LEVEL_NAME[level], config, rate(...s.meaning), rate(...s.correction), rate(...s.translation), rate(...s.numbers), s.failed])
    }
  }
  lines.push(table(['Level', 'Transcript from', 'Meaning preserved', 'Correction accuracy', 'Unintended translation', 'New numbers', 'Failed'], body), '')
  return { lines, summary }
}

function costSection(costs, e2e) {
  const lines = ['## Cost', '']
  const byStage = {}
  for (const c of costs) byStage[c.stage] = (byStage[c.stage] ?? 0) + c.cost
  const total = costs.reduce((sum, c) => sum + c.cost, 0)
  lines.push(`Benchmark spend, estimated from list prices: **$${total.toFixed(2)}** of the $${CAP} cap (${Object.entries(byStage).map(([stage, cost]) => `${stage} $${cost.toFixed(2)}`).join(', ')}).`, '')
  // Ongoing cost per recording from the measured e2e runs (same recordings for both paths).
  const per = (rows, pick) => (rows.length ? rows.reduce((s, x) => s + pick(x), 0) / rows.length : null)
  const body = LEVELS.map((level) => {
    const rows = e2e.filter((x) => x.level === level && LATENCY_CASE_IDS.includes(x.id))
    const base = per(rows.filter((x) => x.path === 'Baseline' && x.ok), (x) => x.cost)
    const rtRows = rows.filter((x) => x.path === 'Realtime' && x.ok)
    const seconds = per(rtRows, (x) => x.seconds)
    const live = seconds === null ? null : (seconds / 60) * PER_MINUTE[LIVE]
    const check = seconds === null ? null : (seconds / 60) * PER_MINUTE[CHECK]
    const refine = level === 'none' || base === null || seconds === null ? 0 : base - (seconds / 60) * (PER_MINUTE[MAIN] + PER_MINUTE[CHECK])
    return [LEVEL_NAME[level], base === null ? '—' : usd(base), live === null ? '—' : usd(live + check + refine), live === null ? '—' : usd(live + refine)]
  })
  lines.push(`Per recording (the ${LATENCY_CASE_IDS.length} latency recordings, mean length ${(per(e2e.filter((x) => LATENCY_CASE_IDS.includes(x.id)), (x) => x.seconds) ?? 0).toFixed(1)} s), list prices: ${Object.entries(PER_MINUTE).map(([m, p]) => `\`${m}\` $${p}/min`).join(', ')}, \`${REFINER}\` $2 / $8 per million tokens.`, '')
  lines.push(table(['Level', 'Baseline', `${E2E_CONFIG} + check`, `${E2E_CONFIG}, no check`], body), '')
  return { lines, total, byStage }
}

async function stageReport() {
  const load = async (name) => JSON.parse(await fs.readFile(path.join(OUT, `${name}.json`), 'utf8').catch(() => '[]'))
  const validate = JSON.parse(await fs.readFile(path.join(OUT, 'validate.json'), 'utf8').catch(() => 'null'))
  const costs = (await fs.readFile(path.join(OUT, 'costs.jsonl'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const [baseline, streams, e2e, fallback, quality] = await Promise.all(['baseline', 'stream', 'e2e', 'fallback', 'quality'].map(load))
  const streaming = streamingSection(streams)
  const accuracy = accuracySection(transcriptRows(baseline, streams))
  const latency = e2eSection(e2e)
  const fb = fallbackSection(fallback, e2e)
  const q = qualitySection(quality)
  const cost = costSection(costs, e2e)
  const tables = [
    '# Realtime transcription benchmark (Phase 1)',
    '',
    `Synthetic speech (OpenAI \`${TTS_MODEL}\`), not human recordings. Realtime: ${REALTIME_CONFIGS.map((c) => `${c.name} = \`${c.model}\`${c.delay ? ` delay ${c.delay}` : ''}`).join(', ')}. Baseline: \`${MAIN}\` + \`${CHECK}\` name check (number fix), refinement \`${REFINER}\`. Generated ${new Date().toISOString()}.`,
    '',
    ...validateSection(validate),
    ...streaming.lines,
    ...latency.lines,
    ...accuracy.lines,
    ...q.lines,
    ...fb.lines,
    ...cost.lines,
  ].join('\n')
  await fs.writeFile(path.join(OUT, 'tables.md'), tables)
  await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify({ streaming: streaming.summary, latency: latency.summary, accuracy: accuracy.summary, quality: q.summary, fallback: fb.summary, cost: { total: cost.total, byStage: cost.byStage } }, null, 1))
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

try {
  if (STAGES.includes('validate')) await stageValidate(config.openaiApiKey)
  if (STAGES.includes('audio')) await stageAudio(client, ledger)
  else await buildLongCases()
  const samples = await loadSamples()
  console.log(`${Object.keys(samples).length} of ${RECORDINGS().length} recordings ready. Spent so far: $${ledger.total.toFixed(3)} of $${CAP}.`)
  if (STAGES.includes('baseline')) await stageBaseline(client, ledger, samples)
  if (STAGES.includes('stream')) await stageStream(config.openaiApiKey, ledger, samples)
  if (STAGES.includes('e2e')) await stageE2E(client, config.openaiApiKey, ledger, samples)
  if (STAGES.includes('fallback')) await stageFallback(client, config.openaiApiKey, ledger, samples)
  if (STAGES.includes('quality')) await stageQuality(client, ledger)
  if (STAGES.includes('report')) await stageReport()
} catch (err) {
  if (!err.cap) throw err
  console.error(`\n${err.message} Stopped; rerun with a higher --cap to continue where it stopped.`)
  process.exitCode = 2
}
console.log(`Total estimated spend: $${ledger.total.toFixed(3)}`)
