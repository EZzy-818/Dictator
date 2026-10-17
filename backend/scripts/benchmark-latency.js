// Latency benchmark for /api/process: short, medium and long recordings in English, Mandarin and
// Hindi at each refinement level, repeated. Speech is synthesized with OpenAI text-to-speech and
// encoded as WebM/Opus with ffmpeg, the format Chrome's MediaRecorder uploads.
//
// By default the backend runs inside this script on a local port (usage limits off), so the
// upload crosses only the loopback interface and the figures are server + OpenAI time. With
// --url it times any running backend instead; the server's stage breakdown is only available
// when that backend returns timings (EXPOSE_TIMINGS, on by default outside production).
//
// The browser stages (audio finalization, frontend display) are not part of this benchmark;
// the developer latency panel measures them. To summarize runs copied from the panel:
//   node scripts/benchmark-latency.js --from=en-5s.json --from=en-15s.json
//
// Usage: npm run benchmark:latency [-- --repeat=5 --languages=en,zh,hi --lengths=5,15,30
//        --levels=none,light,medium --url=http://localhost:3001 --out=eval/results/latency]
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { createApp } from '../src/app.js'
import { loadConfig, withoutUsageLimits } from '../src/config.js'
import { identifyAudio } from '../src/lib/audio.js'
import { audioDurationSeconds } from '../src/lib/duration.js'
import { describeRuns, groupBy } from '../eval/latency-stats.js'

dotenv.config({ quiet: true })

const SAMPLES_DIR = path.resolve(import.meta.dirname, '../.live-samples/latency')
const TTS_MODEL = 'gpt-4o-mini-tts'

// Dictation-style scripts, with fillers and a self-correction for refinement to work on.
// Their spoken length is measured from the synthesized audio and reported, not assumed.
const SCRIPTS = {
  en: {
    voice: 'alloy',
    5: 'Um, can we move the weekly team meeting to Thursday afternoon instead?',
    15: 'So, uh, quick update on the website project. The design is basically done, and the developers started on the checkout page this week. I think we should be ready for testing by the end of the month, um, as long as the payment work stays on track.',
    30: 'Okay, so here is where we are with the website project. Um, the design is basically finished, and the developers started building the checkout page on Monday, actually Tuesday. The payment integration is the riskiest part, so, uh, I want two people on it next week. If that goes well, we can start testing by the end of the month and launch in early June. Uh, marketing also asked for a short demo video, so maybe we can record one during the testing week. One more thing: the hosting bill went up a bit last month, so I will look into that before Friday. Let me know if you have any concerns.',
  },
  zh: {
    voice: 'nova',
    5: '嗯，我们这周的周会能不能改到周四下午？',
    15: '嗯，简单说一下网站项目的进度。设计基本上已经完成了，然后开发这周开始做结账页面。我觉得我们月底之前应该可以开始测试。',
    30: '好的，那个，我说一下网站项目现在的情况。设计基本上已经完成了，开发团队周一，不对，是周二开始做结账页面。呃，支付对接是风险最大的部分，所以我希望下周安排两个人专门负责。如果进展顺利的话，我们月底之前可以开始测试，六月初上线。大家有什么问题可以随时告诉我。',
  },
  hi: {
    voice: 'coral',
    5: 'उम्म, क्या हम इस हफ़्ते की टीम मीटिंग गुरुवार दोपहर को कर सकते हैं?',
    15: 'तो, वेबसाइट प्रोजेक्ट का छोटा सा अपडेट। डिज़ाइन लगभग पूरा हो गया है, और डेवलपर्स ने इस हफ़्ते चेकआउट पेज पर काम शुरू किया है। मुझे लगता है महीने के आख़िर तक हम टेस्टिंग शुरू कर सकते हैं।',
    30: 'ठीक है, तो वेबसाइट प्रोजेक्ट की अभी की स्थिति बताता हूँ। उम्म, डिज़ाइन लगभग पूरा हो चुका है, और डेवलपर्स ने सोमवार, नहीं मतलब मंगलवार को चेकआउट पेज बनाना शुरू किया। पेमेंट इंटीग्रेशन सबसे मुश्किल हिस्सा है, इसलिए मैं चाहता हूँ कि अगले हफ़्ते दो लोग सिर्फ़ उसी पर काम करें। अगर सब ठीक रहा तो महीने के आख़िर तक टेस्टिंग और जून की शुरुआत में लॉन्च हो सकता है।',
  },
}

const SERVER_STAGES = ['receiveMs', 'transcriptionMs', 'refinementMs', 'overheadMs', 'networkMs']
const PANEL_STAGES = ['finalization', 'setup', 'upload', 'network', 'roundTrip', 'transcription', 'refinement', 'overhead', 'display']

function option(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : fallback
}
const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)
const fmt = (ms) => (ms === null || ms === undefined ? '—' : String(Math.round(ms)))

// Markdown table of one stats group per row.
function table(groups, stageKeys, labels) {
  const header = ['Group', 'Runs', 'Failed', 'Mean', 'p50', 'p95', 'Min', 'Max', ...stageKeys.map((key) => labels[key] ?? key)]
  const lines = [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`]
  for (const [name, stats] of groups) {
    const t = stats.total
    lines.push(
      `| ${[name, stats.runs, stats.failed, fmt(t?.mean), fmt(t?.p50), fmt(t?.p95), fmt(t?.min), fmt(t?.max), ...stageKeys.map((key) => fmt(stats.stages[key]))].join(' | ')} |`,
    )
  }
  return lines.join('\n')
}

// --from: summarize runs copied from the latency panel, one group per file.
async function summarizePanelFiles(files) {
  const groups = []
  for (const file of files) {
    const runs = JSON.parse(await fs.readFile(file, 'utf8'))
    const rows = runs.map((run) => ({
      ok: run.outcome !== 'failed' && Number.isFinite(run.totalMs),
      totalMs: run.totalMs,
      level: run.refinementLevel,
      ...Object.fromEntries(run.stages.map((stage) => [stage.key, stage.ms])),
    }))
    for (const [level, levelRows] of groupBy(rows, (row) => row.level)) {
      groups.push([`${path.parse(file).name} · ${level}`, describeRuns(levelRows, { totalKey: 'totalMs', stageKeys: PANEL_STAGES })])
    }
  }
  console.log('Total latency is Stop → polished text painted, in ms. Stage columns are means of successful runs.\n')
  console.log(table(groups, PANEL_STAGES, {}))
}

async function encodeWebm(wav, out) {
  await promisify(execFile)('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', out])
}

async function sample(client, language, seconds) {
  const file = path.join(SAMPLES_DIR, `${language}-${seconds}s.webm`)
  let audio = await fs.readFile(file).catch(() => null)
  if (!audio) {
    const { voice, [seconds]: input } = SCRIPTS[language]
    const speech = await client.audio.speech.create({ model: TTS_MODEL, voice, input, response_format: 'wav' })
    const wav = file.replace(/\.webm$/, '.wav')
    await fs.mkdir(SAMPLES_DIR, { recursive: true })
    await fs.writeFile(wav, Buffer.from(await speech.arrayBuffer()))
    await encodeWebm(wav, file)
    audio = await fs.readFile(file)
  }
  const duration = await audioDurationSeconds(audio, identifyAudio(audio, 'audio/webm'))
  return { audio, duration, bytes: audio.length }
}

async function timeRequest(baseUrl, { audio }, level, requestId) {
  const form = new FormData()
  form.append('requestId', requestId)
  form.append('refinementLevel', level)
  form.append('audio', new Blob([audio], { type: 'audio/webm;codecs=opus' }), 'recording.webm')
  const started = performance.now()
  let status = null
  let body = null
  try {
    const res = await fetch(`${baseUrl}/api/process`, { method: 'POST', body: form })
    status = res.status
    body = await res.json().catch(() => null)
  } catch {
    // Network failure: no status, no body.
  }
  const roundTripMs = performance.now() - started
  const timings = body?.timings ?? null
  const ok = status === 200
  return {
    ok,
    status,
    code: body?.code ?? (ok ? undefined : 'network_error'),
    refinementStatus: body?.refinementStatus,
    roundTripMs,
    serverTotalMs: timings?.totalMs ?? null,
    receiveMs: timings?.receiveMs ?? null,
    transcriptionMs: timings?.transcriptionMs ?? null,
    refinementMs: timings?.refinementMs ?? null,
    overheadMs: timings?.overheadMs ?? null,
    // The only cross-machine figure: a duration minus a duration, never two clocks' timestamps.
    networkMs: timings ? Math.max(0, roundTripMs - timings.totalMs) : null,
  }
}

const panelFiles = process.argv.filter((a) => a.startsWith('--from=')).map((a) => a.slice(7))
if (panelFiles.length) {
  await summarizePanelFiles(panelFiles)
  process.exit(0)
}

const repeat = Number(option('repeat', '5'))
const languages = list(option('languages', 'en,zh,hi'))
const lengths = list(option('lengths', '5,15,30')).map(Number)
const levels = list(option('levels', 'none,light,medium'))
const targetUrl = option('url', null)
const outBase = option('out', null)

const config = loadConfig()
if (!config.openaiApiKey) {
  console.error('OPENAI_API_KEY is not set. It is needed to synthesize the speech samples (and, locally, to run the backend).')
  process.exit(1)
}
const client = new OpenAI({ apiKey: config.openaiApiKey })

let server
let baseUrl = targetUrl?.replace(/\/+$/, '')
if (!baseUrl) {
  const app = createApp({ ...withoutUsageLimits(config), exposeTimings: true }, { log: () => {} })
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
}

const samples = {}
for (const language of languages) {
  for (const seconds of lengths) {
    samples[`${language}-${seconds}`] = await sample(client, language, seconds)
  }
}

const target = targetUrl ? baseUrl : `local backend (${baseUrl}, in-process)`
console.log(`Target: ${target}. Transcription: ${config.transcriptionModel}. Refinement: ${config.refinementModel}. Repeats: ${repeat}.`)
for (const [key, s] of Object.entries(samples)) console.log(`Sample ${key}s: ${s.duration?.toFixed(1)} s of audio, ${Math.round(s.bytes / 1024)} KB`)
console.log('')

// Repeats are the outer loop, so slow and fast periods of the API spread across every condition.
const runs = []
for (let rep = 1; rep <= repeat; rep++) {
  for (const language of languages) {
    for (const seconds of lengths) {
      for (const level of levels) {
        const s = samples[`${language}-${seconds}`]
        const requestId = `bench-${language}-${seconds}s-${level}-${rep}-${Date.now().toString(36)}`
        const run = { language, lengthTarget: seconds, audioSeconds: s.duration, level, rep, requestId, ...(await timeRequest(baseUrl, s, level, requestId)) }
        runs.push(run)
        const result = run.ok ? `${fmt(run.roundTripMs)} ms` : `failed (${run.status ?? 'no response'} ${run.code ?? ''})`
        console.log(
          `[${rep}/${repeat}] ${language} ${seconds}s ${level.padEnd(6)} ${result}  transcription ${fmt(run.transcriptionMs)}  refinement ${fmt(run.refinementMs)}  overhead ${fmt(run.overheadMs)}`,
        )
      }
    }
  }
}

server?.close()

const describe = (rows) => describeRuns(rows, { totalKey: 'roundTripMs', stageKeys: SERVER_STAGES })
const labels = { receiveMs: 'Upload (server receive)', transcriptionMs: 'Transcription', refinementMs: 'Refinement', overheadMs: 'Backend overhead', networkMs: 'Network ~' }
const sections = [
  ['Overall', [['All runs', describe(runs)]]],
  ['By refinement level', [...groupBy(runs, (r) => r.level)].map(([k, rows]) => [k, describe(rows)])],
  ['By recording length', [...groupBy(runs, (r) => `${r.lengthTarget}s`)].map(([k, rows]) => [k, describe(rows)])],
  ['By language', [...groupBy(runs, (r) => r.language)].map(([k, rows]) => [k, describe(rows)])],
  ['Every condition', [...groupBy(runs, (r) => `${r.language} ${r.lengthTarget}s ${r.level}`)].map(([k, rows]) => [k, describe(rows)])],
]

const sampleLines = Object.entries(samples).map(([key, s]) => `- ${key}s: ${s.duration?.toFixed(1)} s, ${Math.round(s.bytes / 1024)} KB WebM/Opus`)
const report = [
  '# Latency benchmark',
  '',
  `${new Date().toISOString()}. Target: ${target}. Transcription: \`${config.transcriptionModel}\`. Refinement: \`${config.refinementModel}\`. ${repeat} repeats per condition.`,
  '',
  'Synthetic speech (OpenAI text-to-speech, not a human voice). Mean to Max are the API round trip in ms: request sent → response read, as the caller sees it. Browser stages (audio finalization, frontend display) are not included; the developer panel measures those. Stage columns are means of successful runs, measured by the server; Network ~ is the round trip minus the server total, an estimate. p95 over 5 runs lies between the two slowest runs.',
  '',
  'Samples:',
  '',
  ...sampleLines,
  '',
  ...sections.flatMap(([title, groups]) => [`## ${title}`, '', table(groups, SERVER_STAGES, labels), '']),
].join('\n')

console.log(`\n${report}`)
if (outBase) {
  await fs.mkdir(path.dirname(outBase), { recursive: true })
  await fs.writeFile(`${outBase}.md`, `${report}\n`)
  await fs.writeFile(`${outBase}.json`, JSON.stringify({ target, transcriptionModel: config.transcriptionModel, refinementModel: config.refinementModel, repeat, runs }, null, 2))
  console.log(`Wrote ${outBase}.md and ${outBase}.json`)
}
