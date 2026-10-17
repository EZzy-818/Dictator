// Milestone 7 accuracy evaluation against the real OpenAI API.
// Sends every recording in the evaluation set through POST /api/process, scores the
// raw transcript (WER for English, CER for Chinese, CER and mixed-token error rate
// for mixed speech) and runs the automatic refinement checks. Writes a JSON file and
// a Markdown report to eval/results/.
//
// Usage:
//   npm run eval                          synthetic samples (generated with OpenAI TTS on first run)
//   npm run eval -- --source=voice        your recordings in .eval-samples/voice/<id>.<ext>
//   npm run eval -- --language=auto       send every sample as Auto-detect (language-hint comparison)
//   npm run eval -- --only=en-normal-1,mixed-2
//   TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe npm run eval   compare another transcription model
import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { isSupportedLanguage } from '../src/lib/languages.js'
import { CASES, CATEGORIES } from '../eval/dataset.js'
import { aggregate, checkRefinement, missingTerms, scoreTranscript } from '../eval/metrics.js'
import { addNoise } from '../eval/noise.js'

dotenv.config({ quiet: true })

const ROOT = path.resolve(import.meta.dirname, '..')
const SAMPLES_DIR = path.join(ROOT, '.eval-samples')
const RESULTS_DIR = path.join(ROOT, 'eval/results')
const TTS_MODEL = 'gpt-4o-mini-tts'
const TTS_VOICES = ['alloy', 'nova', 'onyx', 'coral', 'echo', 'shimmer']
const AUDIO_TYPES = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', m4a: 'audio/mp4', wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac' }
const CHECK_LABELS = {
  correction: 'Self-correction handled',
  fillersRemoved: 'Fillers removed',
  languagePreserved: 'Languages preserved',
  termsKept: 'Names and terms kept',
  numbersKept: 'Numbers kept',
  negationsKept: 'Negations kept',
}

function option(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
}

const source = option('source') ?? 'synthetic'
const languageOverride = option('language')
const only = option('only')?.split(',')

if (!['synthetic', 'voice'].includes(source)) {
  console.error('--source must be synthetic or voice')
  process.exit(1)
}
if (languageOverride && !isSupportedLanguage(languageOverride)) {
  console.error('--language must be en, zh or auto')
  process.exit(1)
}

const config = loadConfig()
if (!config.openaiApiKey) {
  console.error('OPENAI_API_KEY is not set. The evaluation needs a real key.')
  process.exit(1)
}

const client = new OpenAI({ apiKey: config.openaiApiKey })
const app = createApp(config)

async function syntheticSample(testCase, index) {
  const file = path.join(SAMPLES_DIR, 'synthetic', `${testCase.id}.wav`)
  try {
    return { audio: await fs.readFile(file), file, type: 'audio/wav' }
  } catch {
    const voice = TTS_VOICES[index % TTS_VOICES.length]
    const speech = await client.audio.speech.create({ model: TTS_MODEL, voice, input: testCase.script, response_format: 'wav' })
    let audio = Buffer.from(await speech.arrayBuffer())
    if (testCase.noiseSnrDb !== undefined) audio = addNoise(audio, testCase.noiseSnrDb, index + 1)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, audio)
    return { audio, file, type: 'audio/wav' }
  }
}

async function voiceSample(testCase) {
  const dir = path.join(SAMPLES_DIR, 'voice')
  const names = await fs.readdir(dir).catch(() => [])
  const name = names.find((entry) => path.parse(entry).name === testCase.id)
  if (!name) return null
  const extension = path.extname(name).slice(1).toLowerCase()
  if (!AUDIO_TYPES[extension]) return null
  const file = path.join(dir, name)
  return { audio: await fs.readFile(file), file, type: AUDIO_TYPES[extension] }
}

const cases = CASES.filter((testCase) => !only || only.includes(testCase.id))
const results = []

console.log(`Source: ${source}. Transcription: ${config.transcriptionModel}. Refinement: ${config.refinementModel}.\n`)

for (const testCase of cases) {
  const sample = source === 'synthetic' ? await syntheticSample(testCase, CASES.indexOf(testCase)) : await voiceSample(testCase)
  if (!sample) {
    console.log(`[${testCase.id}] no recording found, skipped`)
    results.push({ id: testCase.id, skipped: true })
    continue
  }

  const language = languageOverride ?? testCase.language
  const res = await request(app)
    .post('/api/process')
    .field('language', language)
    .attach('audio', sample.audio, { filename: path.basename(sample.file), contentType: sample.type })

  if (res.status !== 200) {
    console.log(`[${testCase.id}] HTTP ${res.status} ${res.body.code}`)
    results.push({ id: testCase.id, language, error: `HTTP ${res.status} ${res.body.code}` })
    continue
  }

  const raw = res.body.rawTranscript
  const refined = res.body.polishedTranscript
  const scores = scoreTranscript(testCase, raw)
  const refinement = refined === null ? null : checkRefinement(testCase, raw, refined)
  const main = testCase.metric === 'wer' ? scores.wer : scores.cer
  console.log(`[${testCase.id}] ${testCase.metric === 'wer' ? 'WER' : 'CER'} ${(main.rate * 100).toFixed(1)}%  ${raw}`)
  results.push({
    id: testCase.id,
    language,
    raw,
    refined,
    refinementStatus: res.body.refinementStatus,
    scores,
    missingTerms: missingTerms(testCase, raw),
    refinement,
  })
}

const percent = (value) => `${(value * 100).toFixed(1)}%`
const scored = results.filter((result) => result.scores)
const byCase = new Map(CASES.map((testCase) => [testCase.id, testCase]))

function summaryRow(label, unit, list) {
  const items = list.filter((result) => result.scores[unit])
  if (!items.length) return null
  const main = aggregate(items.map((result) => result.scores[unit]))
  const strict = aggregate(items.map((result) => result.scores[`${unit}Strict`]))
  return `| ${label} | ${unit.toUpperCase()} | ${main.samples} | ${percent(main.rate)} | ${main.S} / ${main.D} / ${main.I} / ${main.N} | ${percent(strict.rate)} |`
}

const groups = [
  ['English', 'wer', scored.filter((result) => byCase.get(result.id).metric === 'wer')],
  ['Chinese', 'cer', scored.filter((result) => byCase.get(result.id).metric === 'cer')],
  ['Mixed', 'cer', scored.filter((result) => byCase.get(result.id).metric === 'mixed')],
  ['Mixed', 'mer', scored.filter((result) => byCase.get(result.id).metric === 'mixed')],
]
const categoryRows = Object.entries(CATEGORIES).flatMap(([key, label]) => {
  const list = scored.filter((result) => byCase.get(result.id).category === key)
  const units = [...new Set(list.map((result) => (byCase.get(result.id).metric === 'wer' ? 'wer' : 'cer')))]
  return units.map((unit) => summaryRow(label, unit, list))
})

const refinedResults = scored.filter((result) => result.refinement)
const checkTotals = Object.keys(CHECK_LABELS).map((key) => {
  const applicable = refinedResults.filter((result) => result.refinement.checks[key] !== null)
  const passed = applicable.filter((result) => result.refinement.checks[key])
  return `| ${CHECK_LABELS[key]} | ${passed.length} / ${applicable.length} |`
})
const corrections = refinedResults.filter((result) => result.refinement.checks.correction !== null)
const correctionsPassed = corrections.filter((result) => result.refinement.checks.correction)
const valueChanges = refinedResults.filter(
  (result) => result.refinement.checks.numbersKept === false || result.refinement.checks.negationsKept === false,
)

function formatOps(ops) {
  if (!ops.length) return 'none'
  return ops
    .map((op) => (op.type === 'S' ? `S \`${op.ref}\`→\`${op.hyp}\`` : op.type === 'D' ? `D \`${op.ref}\`` : `I \`${op.hyp}\``))
    .join(', ')
}

function sampleSection(result) {
  const testCase = byCase.get(result.id)
  const lines = [`### ${result.id}`, '', `${CATEGORIES[testCase.category]}. Language option: \`${result.language ?? testCase.language}\`.`, '']
  lines.push(`- Script: ${testCase.script}`)
  if (result.skipped) return [...lines, '- Skipped: no recording.', ''].join('\n')
  if (result.error) return [...lines, `- Failed: ${result.error}`, ''].join('\n')
  lines.push(`- Raw transcript: ${result.raw}`)
  for (const [unit, label] of [['wer', 'WER'], ['cer', 'CER'], ['mer', 'Mixed-token error rate']]) {
    const score = result.scores[unit]
    if (!score) continue
    lines.push(`- ${label}: ${percent(score.rate)} (${score.errors} / ${score.N}; with fillers counted ${percent(result.scores[`${unit}Strict`].rate)}). Errors: ${formatOps(score.ops)}`)
  }
  if (result.missingTerms.length) lines.push(`- Terms missing from the raw transcript: ${result.missingTerms.join(', ')}`)
  if (!result.refinement) {
    lines.push(`- Refinement: ${result.refinementStatus}`)
  } else {
    lines.push(`- Refined: ${result.refined}`)
    if (testCase.refined?.expected) lines.push(`- Intended refinement: ${testCase.refined.expected}`)
    const checks = Object.entries(result.refinement.checks)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => `${CHECK_LABELS[key]} ${value ? 'yes' : '**no**'}`)
    lines.push(`- Automatic checks: ${checks.join(', ')}`)
    if (result.refinement.review.length) lines.push(`- For review: ${result.refinement.review.join('; ')}`)
  }
  return [...lines, ''].join('\n')
}

const report = [
  `# Accuracy evaluation: ${source} recordings`,
  '',
  `Run ${new Date().toISOString()}. Transcription model \`${config.transcriptionModel}\`, refinement model \`${config.refinementModel}\`.`,
  `Language option: ${languageOverride ? `\`${languageOverride}\` for every sample` : 'the one set for each sample'}.`,
  `${scored.length} of ${cases.length} samples transcribed${results.some((result) => result.skipped) ? `, ${results.filter((result) => result.skipped).length} without a recording` : ''}${results.some((result) => result.error) ? `, ${results.filter((result) => result.error).length} failed` : ''}.`,
  source === 'synthetic' ? '\nThe synthetic samples are OpenAI text-to-speech audio, not human speech. Noisy samples have pink noise mixed in.' : '',
  '',
  'Rates are corpus-level: total errors divided by total reference tokens. Hesitation sounds (um, uh, 嗯, 呃) are ignored on both sides; the last column counts them. See docs/evaluation.md for the normalization policy.',
  '',
  '## Transcription',
  '',
  '| Group | Metric | Samples | Rate | S / D / I / N | With fillers counted |',
  '| --- | --- | --- | --- | --- | --- |',
  ...groups.map(([label, unit, list]) => summaryRow(label, unit, list)).filter(Boolean),
  '',
  '| Category | Metric | Samples | Rate | S / D / I / N | With fillers counted |',
  '| --- | --- | --- | --- | --- | --- |',
  ...categoryRows.filter(Boolean),
  '',
  '## Refinement (automatic checks)',
  '',
  '| Check | Passed |',
  '| --- | --- |',
  ...checkTotals,
  '',
  `Explicit corrections handled: ${correctionsPassed.length} / ${corrections.length}. Samples with a changed number or negation: ${valueChanges.length}.`,
  '',
  'Meaning, invented facts and overall acceptability are reviewed by a person; see docs/evaluation.md.',
  '',
  '## Samples',
  '',
  ...results.map(sampleSection),
].join('\n')

await fs.mkdir(RESULTS_DIR, { recursive: true })
const name = [source, languageOverride, config.transcriptionModel !== 'gpt-4o-transcribe' && config.transcriptionModel].filter(Boolean).join('-')
await fs.writeFile(path.join(RESULTS_DIR, `${name}.json`), `${JSON.stringify({ source, languageOverride: languageOverride ?? null, transcriptionModel: config.transcriptionModel, refinementModel: config.refinementModel, results }, null, 2)}\n`)
await fs.writeFile(path.join(RESULTS_DIR, `${name}.md`), report)

console.log(`\n${groups.map(([label, unit, list]) => summaryRow(label, unit, list)).filter(Boolean).join('\n')}`)
console.log(`\nReport: eval/results/${name}.md`)
process.exit(results.some((result) => result.error) ? 1 : 0)
