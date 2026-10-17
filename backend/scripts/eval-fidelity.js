// Raw transcription fidelity benchmark against the real OpenAI API.
// Sends each sample in eval/fidelity-dataset.js straight to the transcription API under several
// language settings and prompts, and checks the raw text: were the spoken languages kept (no
// translation), were spoken fillers kept, and were fillers invented where none were said.
// Refinement is not involved. Writes eval/results/fidelity.json and fidelity.md.
//
// Usage:
//   npm run eval:fidelity                          every setting, 1 run per sample
//   npm run eval:fidelity -- --settings=app,auto   only these settings (names below)
//   npm run eval:fidelity -- --runs=3 --only=mix-postgres,en-fillers-spec
//   npm run eval:fidelity -- --voice=onyx --noise=15  every sample in another voice, with pink noise at 15 dB SNR
//   npm run eval:fidelity -- --out=fidelity-noisy         report name in eval/results/
//   npm run eval:fidelity -- --source=voice        your recordings in .eval-samples/fidelity-voice/<id>.<ext>
import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import OpenAI, { toFile } from 'openai'
import { loadConfig } from '../src/config.js'
import { TRANSCRIPTION_PROMPT, transcriptionParams } from '../src/services/transcription.js'
import { FIDELITY_CASES, FIDELITY_GROUPS } from '../eval/fidelity-dataset.js'
import { scoreFidelity } from '../eval/fidelity.js'
import { addNoise } from '../eval/noise.js'

dotenv.config({ quiet: true })

const ROOT = path.resolve(import.meta.dirname, '..')
const RESULTS_DIR = path.join(ROOT, 'eval/results')
const TTS_MODEL = 'gpt-4o-mini-tts'
const CASUAL =
  'Speak like a person dictating a quick note: relaxed and conversational. Say every filler word (um, uh, 嗯, 呃) clearly as a short hesitation, exactly as written. Read Chinese in Mandarin and English in English.'
const AUDIO_TYPES = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', m4a: 'audio/mp4', wav: 'audio/wav', mp3: 'audio/mpeg' }

const ALL = ['zh', 'en', 'hi']
// Prompt candidates that were measured and not adopted; see docs/transcription-fidelity.md.
const BILINGUAL_PROMPT =
  'Dictation that mixes English, Mandarin Chinese and Hindi, often in one sentence. Write each part in the language it was spoken in, including filler words like um, uh. 中英混说的口述：中文部分用简体中文写，英文部分保留英文，不要翻译，保留“嗯”“呃”等语气词。'

const config = loadConfig()
const model = config.transcriptionModel

// name: [label, model, params]
const SETTINGS = {
  app: [`App (${model}, zh+en+hi, app prompt)`, model, transcriptionParams(model)],
  'all-no-prompt': ['zh+en+hi, no prompt', 'gpt-transcribe', { languages: ALL }],
  auto: ['Auto (no languages, no prompt)', 'gpt-transcribe', {}],
  'auto-prompt': ['Auto (no languages), app prompt', 'gpt-transcribe', { prompt: TRANSCRIPTION_PROMPT }],
  en: ['English only, app prompt', 'gpt-transcribe', { languages: ['en'], prompt: TRANSCRIPTION_PROMPT }],
  zh: ['Mandarin only, app prompt', 'gpt-transcribe', { languages: ['zh'], prompt: TRANSCRIPTION_PROMPT }],
  hi: ['Hindi only, app prompt', 'gpt-transcribe', { languages: ['hi'], prompt: TRANSCRIPTION_PROMPT }],
  'bilingual-prompt': ['zh+en+hi, half-Chinese prompt (candidate)', 'gpt-transcribe', { languages: ALL, prompt: BILINGUAL_PROMPT }],
  keywords: ['zh+en+hi, app prompt, filler keywords (candidate)', 'gpt-transcribe', { ...transcriptionParams('gpt-transcribe'), keywords: ['um', 'uh', '嗯', '呃'] }],
  '4o': ['gpt-4o-transcribe, app prompt', 'gpt-4o-transcribe', { prompt: TRANSCRIPTION_PROMPT }],
  whisper: ['whisper-1, no prompt', 'whisper-1', {}],
}

function option(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
}

const settingNames = option('settings')?.split(',') ?? Object.keys(SETTINGS)
const runs = Number(option('runs') ?? 1)
const only = option('only')?.split(',')
const source = option('source') ?? 'synthetic'
const voiceOverride = option('voice')
const outName = option('out') ?? 'fidelity'
const noiseSnrDb = option('noise') === undefined ? undefined : Number(option('noise'))
for (const name of settingNames) {
  if (!SETTINGS[name]) {
    console.error(`Unknown setting "${name}". Choose from: ${Object.keys(SETTINGS).join(', ')}`)
    process.exit(1)
  }
}
if (!config.openaiApiKey) {
  console.error('OPENAI_API_KEY is not set. The benchmark needs a real key.')
  process.exit(1)
}

const client = new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 2 })

async function syntheticSample(testCase, index) {
  const voice = voiceOverride ?? testCase.voice
  const noise = noiseSnrDb === undefined ? '' : `-snr${noiseSnrDb}`
  const file = path.join(ROOT, '.eval-samples/fidelity', `${testCase.id}-${voice}${noise}.wav`)
  try {
    return { audio: await fs.readFile(file), name: path.basename(file), type: 'audio/wav' }
  } catch {
    const speech = await client.audio.speech.create({
      model: TTS_MODEL,
      voice,
      input: testCase.script,
      response_format: 'wav',
      ...(testCase.casual ? { instructions: CASUAL } : {}),
    })
    let audio = Buffer.from(await speech.arrayBuffer())
    if (noiseSnrDb !== undefined) audio = addNoise(audio, noiseSnrDb, index + 1)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, audio)
    return { audio, name: path.basename(file), type: 'audio/wav' }
  }
}

async function voiceSample(testCase) {
  const dir = path.join(ROOT, '.eval-samples/fidelity-voice')
  const name = (await fs.readdir(dir).catch(() => [])).find((entry) => path.parse(entry).name === testCase.id)
  const extension = name && path.extname(name).slice(1).toLowerCase()
  if (!AUDIO_TYPES[extension]) return null
  return { audio: await fs.readFile(path.join(dir, name)), name, type: AUDIO_TYPES[extension] }
}

async function transcribe(sample, settingModel, params) {
  const file = await toFile(sample.audio, sample.name, { type: sample.type })
  const response = await client.audio.transcriptions.create({ file, model: settingModel, response_format: 'json', ...params })
  return { text: response.text, detected: response.languages?.map((language) => language.code) ?? null }
}

// Runs tasks with a few requests in flight at once.
async function pool(tasks, size) {
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < tasks.length) {
        const index = next++
        results[index] = await tasks[index]()
      }
    }),
  )
  return results
}

const cases = FIDELITY_CASES.filter((testCase) => !only || only.includes(testCase.id))
const samples = {}
for (const testCase of cases) {
  samples[testCase.id] = source === 'voice' ? await voiceSample(testCase) : await syntheticSample(testCase, cases.indexOf(testCase))
}

const tasks = []
for (const name of settingNames) {
  const [, settingModel, params] = SETTINGS[name]
  for (const testCase of cases) {
    if (!samples[testCase.id]) continue
    for (let run = 1; run <= runs; run++) {
      tasks.push(async () => {
        try {
          const { text, detected } = await transcribe(samples[testCase.id], settingModel, params)
          return { setting: name, id: testCase.id, run, text, detected, ...scoreFidelity(testCase.script, text) }
        } catch (err) {
          return { setting: name, id: testCase.id, run, error: `${err.status ?? ''} ${err.message}`.trim() }
        }
      })
    }
  }
}

console.log(`Source: ${source}. ${cases.length} samples x ${settingNames.length} settings x ${runs} runs.\n`)
const results = await pool(tasks, 6)

const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(0)}%` : '–')
const summary = settingNames.map((name) => {
  const rows = results.filter((row) => row.setting === name && !row.error)
  const sum = (pick) => rows.reduce((total, row) => total + pick(row), 0)
  return {
    setting: name,
    label: SETTINGS[name][0],
    runs: rows.length,
    errors: results.filter((row) => row.setting === name && row.error).length,
    languagesPreserved: rows.filter((row) => row.languages.preserved).length,
    fillersKept: sum((row) => row.fillers.kept),
    fillersExpected: sum((row) => row.fillers.expected),
    fillersInvented: sum((row) => row.fillers.invented),
    verbatimErrors: sum((row) => row.verbatim.errors),
    verbatimTokens: sum((row) => row.verbatim.N),
  }
})

const lines = [
  '# Raw transcription fidelity',
  '',
  `Source: ${source === 'voice' ? 'your recordings' : `synthetic speech (OpenAI text-to-speech, not a human voice)${voiceOverride ? `, voice ${voiceOverride}` : ''}${noiseSnrDb === undefined ? '' : `, pink noise at ${noiseSnrDb} dB SNR`}`}. ${runs} runs per sample. Raw transcripts only; no refinement.`,
  '',
  '| Setting | Languages kept | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |',
  '| --- | --- | --- | --- | --- | --- |',
  ...summary.map(
    (row) =>
      `| ${row.label} | ${row.languagesPreserved}/${row.runs} | ${row.fillersKept}/${row.fillersExpected} (${pct(row.fillersKept, row.fillersExpected)}) | ${row.fillersInvented} | ${pct(row.verbatimErrors, row.verbatimTokens)} | ${row.errors} |`,
  ),
  '',
  'Languages kept: runs where every language spoken in the sample is still there (none translated away, none added). Fillers: um, uh, er, ah, hmm, "you know", 嗯, 呃 and Hindi fillers, counted per occurrence. Verbatim error rate: mixed-token error rate (one token per Chinese character or English word) with fillers counted.',
  '',
]
for (const testCase of cases) {
  lines.push(`## ${testCase.id} (${FIDELITY_GROUPS[testCase.group]})`, '', `Said: ${testCase.script}`, '')
  for (const row of results.filter((result) => result.id === testCase.id)) {
    if (row.error) {
      lines.push(`- ${row.setting} #${row.run}: request failed (${row.error})`)
      continue
    }
    const flags = [
      row.languages.preserved ? null : `languages lost: ${[...row.languages.lost, ...row.languages.added.map((l) => `+${l}`)].join(', ')}`,
      row.fillers.missed ? `${row.fillers.missed} filler(s) missed` : null,
      row.fillers.invented ? `${row.fillers.invented} filler(s) invented` : null,
    ].filter(Boolean)
    lines.push(`- ${row.setting} #${row.run}: ${row.text}${flags.length ? `  **[${flags.join('; ')}]**` : ''}`)
  }
  lines.push('')
}

await fs.mkdir(RESULTS_DIR, { recursive: true })
await fs.writeFile(path.join(RESULTS_DIR, `${outName}.json`), JSON.stringify({ source, runs, summary, results }, null, 2))
await fs.writeFile(path.join(RESULTS_DIR, `${outName}.md`), lines.join('\n'))
console.log(lines.slice(0, 6 + summary.length).join('\n'))
console.log(`\nReport: eval/results/${outName}.md`)
