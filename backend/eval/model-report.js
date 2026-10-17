// Tables, review sheet and summary for scripts/benchmark-models.js. No I/O.

import { checkRefinementOutput, corpusRate, scoreTranscription, wilson } from './model-metrics.js'
import { GROUPS, ENTITY_TYPES } from './models-dataset.js'
import { groupBy, mean, summarize } from './latency-stats.js'

const pct = (value, digits = 1) => (value === null || value === undefined || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(digits)}%`)
const ms = (value) => (value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-US'))
const usd = (value) => `$${value.toFixed(value < 0.01 ? 4 : 3)}`

function table(header, rows) {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

// A proportion with its count and 95% Wilson interval.
function rate(successes, n) {
  if (!n) return { value: null, n: 0, text: '—' }
  const [low, high] = wilson(successes, n)
  return { value: successes / n, successes, n, low, high, text: `${pct(successes / n)} (${successes}/${n}, ${pct(low, 0)}–${pct(high, 0)})` }
}

function relative(value, baseline) {
  if (value === null || baseline === null || baseline === undefined) return '—'
  const abs = value - baseline
  const rel = baseline ? abs / baseline : null
  return `${abs >= 0 ? '+' : ''}${(abs * 100).toFixed(2)} pts${rel === null ? '' : ` (${rel >= 0 ? '+' : ''}${(rel * 100).toFixed(0)}% rel.)`}`
}

function count(rows, test) {
  return rows.filter(test).length
}

// Transcription accuracy per model and language group, with per-repeat spread.
function transcriptionSection({ cases, transcribe, models }) {
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]))
  const scored = transcribe
    .filter((row) => byId[row.id])
    .map((row) => {
      const c = byId[row.id]
      const text = row.text ?? ''
      return { ...row, group: c.group, length: c.length, score: scoreTranscription(c, text), primaryScore: row.primaryText ? scoreTranscription(c, row.primaryText) : null }
    })
  const transcribers = [models.baselineTranscriber, models.fastTranscriber]
  const summary = {}

  for (const model of transcribers) {
    const rows = scored.filter((r) => r.model === model)
    summary[model] = { groups: {}, failures: count(rows, (r) => r.error), samples: rows.length }
    for (const group of Object.keys(GROUPS)) {
      const groupRows = rows.filter((r) => r.group === group)
      const reps = [...groupBy(groupRows, (r) => r.rep).values()]
      const perRep = reps.map((repRows) => corpusRate(repRows.map((r) => r.score.primary)).rate)
      const verbatim = corpusRate(groupRows.map((r) => r.score.verbatim)).rate
      const lang = groupRows.reduce(
        (sum, r) => ({
          scripted: sum.scripted + r.score.language.scripted,
          preserved: sum.preserved + r.score.language.preserved,
          switches: sum.switches + r.score.language.switches,
          switchesKept: sum.switchesKept + r.score.language.switchesKept,
        }),
        { scripted: 0, preserved: 0, switches: 0, switchesKept: 0 },
      )
      const terms = groupRows.flatMap((r) => r.score.entities.filter((x) => x.type === 'term'))
      summary[model].groups[group] = {
        rate: corpusRate(groupRows.map((r) => r.score.primary)).rate,
        repMin: Math.min(...perRep),
        repMax: Math.max(...perRep),
        verbatim,
        mixed: group === 'mixed' ? corpusRate(groupRows.map((r) => r.score.mixed)).rate : null,
        preservation: lang.scripted ? lang.preserved / lang.scripted : null,
        switching: lang.switches ? lang.switchesKept / lang.switches : null,
        translated: rate(count(groupRows, (r) => r.score.language.translations.length > 0), groupRows.length),
        terms: rate(count(terms, (x) => x.kept), terms.length),
        primaryOnly: corpusRate(groupRows.filter((r) => r.primaryScore).map((r) => r.primaryScore.primary)).rate,
        n: groupRows.length,
      }
    }
    const entities = rows.flatMap((r) => r.score.entities)
    summary[model].entities = Object.fromEntries(ENTITY_TYPES.map((type) => {
      const typed = entities.filter((x) => x.type === type)
      return [type, rate(count(typed, (x) => !x.kept), typed.length)]
    }))
    summary[model].translatedAny = rate(count(rows, (r) => r.score.language.translations.length > 0), rows.length)
    const timing = (key) => summarize(rows.map((r) => r[key]))
    summary[model].timing = { total: timing('totalMs'), primary: timing('primaryMs'), nameCheck: timing('nameCheckMs') }
  }

  const [base, fast] = transcribers
  const unitName = { en: 'WER', zh: 'CER', hi: 'WER', mixed: 'CER' }
  const lines = []
  lines.push('## Transcription accuracy (before refinement)', '')
  lines.push(`Each model transcribed every recording ${Math.max(...scored.map((r) => r.rep), 0)} times with the production prompt and name check (\`${'gpt-4o-transcribe'}\`). Rates are corpus rates (total errors / total reference tokens) over all repeats; the range is the lowest and highest single-repeat rate. Fillers are ignored in the headline rate and kept in the verbatim rate.`, '')
  lines.push(
    table(
      ['Model', 'English WER', 'Chinese CER', 'Hindi WER', 'Mixed CER', 'Mixed token error', 'Unintended translation (any language)', 'Failures'],
      transcribers.map((model) => {
        const g = summary[model].groups
        const cell = (group) => `${pct(g[group].rate, 2)} (${pct(g[group].repMin, 1)}–${pct(g[group].repMax, 1)})`
        return [`\`${model}\``, cell('en'), cell('zh'), cell('hi'), cell('mixed'), pct(g.mixed.mixed, 2), summary[model].translatedAny.text, String(summary[model].failures)]
      }),
    ),
    '',
  )
  lines.push('Change of the faster candidate against the baseline (absolute, and relative to the baseline rate):', '')
  lines.push(
    table(
      ['Group', 'Metric', `\`${base}\``, `\`${fast}\``, 'Change', 'Verbatim (fillers kept): baseline → candidate', 'Before name merge: baseline → candidate'],
      Object.keys(GROUPS).map((group) => {
        const b = summary[base].groups[group]
        const f = summary[fast].groups[group]
        return [GROUPS[group], unitName[group], pct(b.rate, 2), pct(f.rate, 2), relative(f.rate, b.rate), `${pct(b.verbatim, 2)} → ${pct(f.verbatim, 2)}`, `${pct(b.primaryOnly, 2)} → ${pct(f.primaryOnly, 2)}`]
      }),
    ),
    '',
  )
  lines.push('### Mixed English–Mandarin', '')
  lines.push(
    table(
      ['Model', 'Mixed CER', 'Language preservation', 'Code-switching accuracy', 'Unintended translation (samples)', 'Technical terms kept'],
      transcribers.map((model) => {
        const m = summary[model].groups.mixed
        return [`\`${model}\``, pct(m.rate, 2), pct(m.preservation), pct(m.switching), m.translated.text, m.terms.text]
      }),
    ),
    '',
  )
  lines.push('### Entity errors (all languages)', '')
  lines.push(
    table(
      ['Model', ...ENTITY_TYPES.map((type) => `${type} missed`)],
      transcribers.map((model) => [`\`${model}\``, ...ENTITY_TYPES.map((type) => summary[model].entities[type].text)]),
    ),
    '',
  )
  lines.push('### Transcription call time (concurrent accuracy runs, not the latency benchmark)', '')
  lines.push(
    table(
      ['Model', 'Stage mean', 'Stage p50', 'Primary call p50', 'Name check p50'],
      transcribers.map((model) => {
        const t = summary[model].timing
        return [`\`${model}\``, ms(t.total?.mean), ms(t.total?.p50), ms(t.primary?.p50), ms(t.nameCheck?.p50)]
      }),
    ),
    '',
  )

  // Review material: translations, and spans both models got wrong the same way (check the audio).
  const review = ['## Transcription: unintended translations', '']
  for (const r of scored.filter((r) => r.score.language.translations.length)) {
    review.push(`- **${r.id}** · \`${r.model}\` #${r.rep}: ${r.score.language.translations.map((t) => `"${t.lost}" → "${t.added}"`).join('; ')}`)
    review.push(`  - said: ${byId[r.id].script}`, `  - heard: ${r.text}`)
  }
  review.push('', '## Transcription: check the audio', '', 'Spans where both models made the same error on repeat 1. The text-to-speech audio may not say exactly what the script says there; listen and correct the reference if so.', '')
  const checkAudio = []
  for (const c of cases) {
    const opsOf = (model) => {
      const row = scored.find((r) => r.model === model && r.id === c.id && r.rep === 1)
      return new Set((row?.score.primary.ops ?? []).map((op) => `${op.type} ${op.ref ?? '∅'} → ${op.hyp ?? '∅'}`))
    }
    const a = opsOf(base)
    const shared = [...opsOf(fast)].filter((op) => a.has(op))
    if (shared.length) {
      checkAudio.push(c.id)
      review.push(`- **${c.id}**: ${shared.join('; ')}`)
    }
  }
  if (!checkAudio.length) review.push('- none')
  review.push('')
  return { text: lines.join('\n'), review: review.join('\n'), summary, checkAudio }
}

function judgeIndex(judge) {
  return Object.fromEntries(judge.filter((j) => j.grade).map((j) => [j.key, j.grade]))
}

// Refinement quality per model and level on the reference transcripts.
function refinementSection({ cases, refine, judge, models }) {
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]))
  const grades = judgeIndex(judge)
  const rows = refine
    .filter((r) => byId[r.id])
    .map((r) => ({ ...r, c: byId[r.id], check: r.output ? checkRefinementOutput(byId[r.id], r.input, r.output) : null, grade: grades[`refine|${r.key}`] ?? null }))
  const summary = {}
  const lines = ['## Refinement quality (on the reference transcripts)', '']
  lines.push(
    'Every model refined the same 36 verbatim reference transcripts (fillers and corrections included) at Light and Medium, with the production prompt and retry logic. Deterministic checks run on every repeat; judge scores (blind, `gpt-5.6-terra`, labelled *judged*) on repeat 1 only. A refinement that failed (the production code refuses an output that translated a language twice) counts as a failure, not as a pass.',
    '',
  )
  for (const model of models.refiners) {
    summary[model] = {}
    for (const level of ['light', 'medium']) {
      const set = rows.filter((r) => r.model === model && r.level === level)
      const ok = set.filter((r) => r.check)
      const judged = ok.filter((r) => r.grade)
      const corrections = ok.filter((r) => r.c.correction)
      const entities = ok.flatMap((r) => r.check.entities)
      const repSets = [...groupBy(set, (r) => r.id).values()]
      summary[model][level] = {
        n: set.length,
        failed: count(set, (r) => !r.check),
        meaning: rate(count(ok, (r) => r.check.meaningPreserved), set.length),
        meaningJudged: rate(count(judged, (r) => r.check.meaningPreserved && r.grade.meaning_preserved), judged.length),
        correction: rate(count(corrections, (r) => r.check.correction), set.filter((r) => r.c.correction).length),
        correctionJudged: rate(count(judged.filter((r) => r.c.correction), (r) => r.grade.correction_handled === true && r.check.correction), judged.filter((r) => r.c.correction).length),
        hallucination: rate(count(ok, (r) => r.check.hallucinationSuspected), ok.length),
        hallucinationJudged: rate(count(judged, (r) => r.grade.hallucination || r.check.hallucinationSuspected), judged.length),
        entity: rate(count(entities, (x) => x.kept), entities.length),
        entityByType: Object.fromEntries(ENTITY_TYPES.map((type) => {
          const typed = entities.filter((x) => x.type === type)
          return [type, rate(count(typed, (x) => x.kept), typed.length)]
        })),
        language: rate(count(ok, (r) => r.check.languagePreserved), set.length),
        languageJudged: rate(count(judged, (r) => r.check.languagePreserved && !r.grade.unintended_translation), judged.length),
        fillersLeft: rate(count(ok, (r) => r.check.fillersLeft), ok.length),
        quality: Object.fromEntries(['grammar', 'readability', 'filler_removal', 'concision'].map((k) => [k, mean(judged.map((r) => r.grade[k]))])),
        consistent: rate(count(repSets, (reps) => new Set(reps.map((r) => r.output)).size === 1), repSets.length),
        lengthRatio: mean(ok.map((r) => r.check.lengthRatio)),
        timing: summarize(set.map((r) => r.ms)),
        retries: count(set, (r) => r.calls > 1),
      }
    }
  }
  for (const level of ['light', 'medium']) {
    lines.push(`### ${level === 'light' ? 'Light' : 'Medium'}`, '')
    lines.push(
      table(
        ['Model', 'Meaning preservation', 'Meaning (rules + judged)', 'Correction accuracy', 'Hallucination (numbers)', 'Hallucination (rules + judged)', 'Entity preservation', 'Language preservation', 'Failed'],
        models.refiners.map((model) => {
          const s = summary[model][level]
          return [`\`${model}\``, s.meaning.text, s.meaningJudged.text, s.correction.text, s.hallucination.text, s.hallucinationJudged.text, s.entity.text, s.language.text, String(s.failed)]
        }),
      ),
      '',
    )
    lines.push(
      table(
        ['Model', 'Grammar (judged)', 'Readability (judged)', 'Filler removal (judged)', 'Concision (judged)', 'Fillers left (rules)', 'Output / input length', 'Same output all repeats', 'Retried', 'Call p50 ms (concurrent)'],
        models.refiners.map((model) => {
          const s = summary[model][level]
          const q = s.quality
          const f = (v) => (v === null ? '—' : v.toFixed(2))
          return [`\`${model}\``, f(q.grammar), f(q.readability), f(q.filler_removal), f(q.concision), s.fillersLeft.text, s.lengthRatio?.toFixed(2) ?? '—', s.consistent.text, String(s.retries), ms(s.timing?.p50)]
        }),
      ),
      '',
    )
    lines.push(
      table(
        ['Model', ...ENTITY_TYPES.map((t) => `${t} kept`)],
        models.refiners.map((model) => [`\`${model}\``, ...ENTITY_TYPES.map((t) => summary[model][level].entityByType[t].text)]),
      ),
      '',
    )
  }

  const review = ['## Refinement: every rule failure', '']
  for (const r of rows.filter((r) => !r.check || !r.check.meaningPreserved || r.check.hallucinationSuspected)) {
    review.push(`- **${r.id}** · \`${r.model}\` · ${r.level} #${r.rep}: ${r.check ? r.check.flags.join('; ') : `failed (${r.error})`}`)
    review.push(`  - input: ${r.input}`, `  - output: ${r.output ?? '—'}`)
  }
  review.push('', '## Refinement: judge flags that rules missed (subjective, check them)', '')
  for (const r of rows.filter((r) => r.grade && r.check?.meaningPreserved && (!r.grade.meaning_preserved || r.grade.hallucination || r.grade.unintended_translation))) {
    review.push(`- **${r.id}** · \`${r.model}\` · ${r.level}: ${r.grade.problems.join('; ') || 'no reason given'}`)
    review.push(`  - input: ${r.input}`, `  - output: ${r.output}`)
  }
  review.push('', '## Refinement: random passing outputs to spot-check', '')
  for (const model of models.refiners) {
    const passing = rows.filter((r) => r.model === model && r.rep === 1 && r.check?.meaningPreserved && (!r.grade || r.grade.meaning_preserved))
    passing.sort((a, b) => hashKey(a.key) - hashKey(b.key))
    for (const r of passing.slice(0, 10)) {
      review.push(`- **${r.id}** · \`${model}\` · ${r.level}`, `  - input: ${r.input}`, `  - output: ${r.output}`)
    }
  }
  review.push('')
  return { text: lines.join('\n'), review: review.join('\n'), summary }
}

function hashKey(text) {
  let h = 2166136261
  for (const char of text) h = Math.imul(h ^ char.codePointAt(0), 16777619)
  return h >>> 0
}

// The full pipeline per configuration, scored against what was said.
function e2eSection({ cases, e2e, judge, configs }) {
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]))
  const grades = judgeIndex(judge)
  const rows = e2e
    .filter((r) => byId[r.id])
    .map((r) => ({ ...r, c: byId[r.id], check: r.output ? checkRefinementOutput(byId[r.id], byId[r.id].script, r.output) : null, grade: grades[`e2e|${r.key}`] ?? null }))
  const summary = {}
  const lines = ['## End-to-end quality (transcription + refinement)', '']
  lines.push(
    'Repeat 1 of each transcription model was refined by each configuration\'s refiner, so Baseline and B (and A and A+B) refine the identical transcript and differ only in the refiner. Outputs are scored against what was said (the reference), so transcription errors that survive refinement count here. None returns the transcript as is.',
    '',
  )
  for (const config of configs) {
    summary[config.name] = {}
    for (const level of ['none', 'light', 'medium']) {
      const set = rows.filter((r) => r.config === config.name && r.level === level)
      const ok = set.filter((r) => r.check)
      const judged = ok.filter((r) => r.grade)
      summary[config.name][level] = {
        n: set.length,
        failed: count(set, (r) => !r.check),
        meaning: rate(count(ok, (r) => r.check.meaningPreserved), set.length),
        meaningJudged: rate(count(judged, (r) => r.check.meaningPreserved && r.grade.meaning_preserved), judged.length),
        correction: rate(count(ok.filter((r) => r.c.correction), (r) => r.check.correction), set.filter((r) => r.c.correction).length),
        hallucinationJudged: rate(count(judged, (r) => r.grade.hallucination || r.check.hallucinationSuspected), judged.length),
        hallucination: rate(count(ok, (r) => r.check.hallucinationSuspected), ok.length),
        translation: rate(count(ok, (r) => !r.check.languagePreserved || r.grade?.unintended_translation), ok.length),
        quality: mean(judged.map((r) => (r.grade.grammar + r.grade.readability + r.grade.filler_removal + r.grade.concision) / 4)),
        noneUnchanged: level === 'none' ? rate(count(set, (r) => r.output === r.transcript), set.length) : null,
      }
    }
  }
  for (const level of ['light', 'medium']) {
    lines.push(`### ${level === 'light' ? 'Light' : 'Medium'}`, '')
    lines.push(
      table(
        ['Config', 'Meaning preservation', 'Meaning (rules + judged)', 'Correction accuracy', 'Hallucination (rules + judged)', 'Unintended translation', 'Quality (judged, 1–5)', 'Failed'],
        configs.map((config) => {
          const s = summary[config.name][level]
          return [config.name, s.meaning.text, s.meaningJudged.text, s.correction.text, s.hallucinationJudged.text, s.translation.text, s.quality?.toFixed(2) ?? '—', String(s.failed)]
        }),
      ),
      '',
    )
  }
  lines.push(
    `None: output identical to the transcript in ${configs.map((c) => `${c.name} ${summary[c.name].none.noneUnchanged?.text ?? '—'}`).join(', ')}.`,
    '',
  )

  // Extra failures in A+B that neither A nor B alone has on the same recording and level.
  const failed = (name, id, level) => {
    const r = rows.find((x) => x.config === name && x.id === id && x.level === level)
    return !r?.check?.meaningPreserved || (r.grade && !r.grade.meaning_preserved)
  }
  const extra = []
  for (const level of ['light', 'medium']) {
    for (const c of cases) {
      if (failed('A+B', c.id, level) && !failed('A', c.id, level) && !failed('B', c.id, level)) {
        const r = rows.find((x) => x.config === 'A+B' && x.id === c.id && x.level === level)
        extra.push({ id: c.id, level, flags: r?.check?.flags ?? [], problems: r?.grade?.problems ?? [], output: r?.output, transcript: r?.transcript })
      }
    }
  }
  lines.push(`Failures in A+B that neither A nor B has on the same recording and level: **${extra.length}**.`, '')

  const review = ['## End to end: failures per configuration', '']
  for (const r of rows.filter((r) => r.level !== 'none' && (!r.check?.meaningPreserved || (r.grade && !r.grade.meaning_preserved)))) {
    review.push(`- **${r.id}** · ${r.config} · ${r.level}: ${[...(r.check?.flags ?? [`failed (${r.error})`]), ...(r.grade?.problems ?? []).map((p) => `judge: ${p}`)].join('; ')}`)
    review.push(`  - said: ${r.c.script}`, `  - transcript: ${r.transcript ?? '—'}`, `  - output: ${r.output ?? '—'}`)
  }
  review.push('', '## End to end: extra failures from combining A and B', '')
  for (const x of extra) review.push(`- **${x.id}** · ${x.level}: ${[...x.flags, ...x.problems].join('; ')}`, `  - transcript: ${x.transcript}`, `  - output: ${x.output}`)
  if (!extra.length) review.push('- none')
  review.push('')
  return { text: lines.join('\n'), review: review.join('\n'), summary, extra }
}

function latencySection({ latency, configs, samples, cases }) {
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]))
  const lines = ['## Latency', '']
  if (!latency.length) return { text: '', summary: {} }
  const reps = Math.max(...latency.map((r) => r.rep))
  lines.push(
    `Environment: this cloud container → OpenAI, backend running in the benchmark process (loopback HTTP, usage limits off), synthetic WebM/Opus recordings, sequential requests. ${new Set(latency.map((r) => r.id)).size} recordings (one per language and length) × ${reps} repeats per configuration and level, interleaved. Times are the /api/process round trip in ms; the stage columns are the server's own timings. Not comparable with timings from the live site, which add the user's network, Vercel and Render.`,
    '',
  )
  const summary = {}
  const ok = latency.filter((r) => r.ok)
  for (const level of ['none', 'light', 'medium']) {
    summary[level] = {}
    const base = summarize(ok.filter((r) => r.config === 'Baseline' && r.level === level).map((r) => r.roundTripMs))
    const levelRows = configs
      .filter((c) => ok.some((r) => r.config === c.name && r.level === level))
      .map((c) => {
        const set = latency.filter((r) => r.config === c.name && r.level === level)
        const good = set.filter((r) => r.ok)
        const total = summarize(good.map((r) => r.roundTripMs))
        const stats = {
          total,
          failed: set.length - good.length,
          transcription: mean(good.map((r) => r.transcriptionMs)),
          refinement: mean(good.map((r) => r.refinementMs)),
          server: mean(good.map((r) => r.serverTotalMs)),
          primary: mean(good.map((r) => r.primaryMs)),
          nameCheck: mean(good.map((r) => r.nameCheckMs)),
          cost: mean(set.map((r) => r.cost)),
          savedP50: base && total ? base.p50 - total.p50 : null,
          savedMean: base && total ? base.mean - total.mean : null,
        }
        summary[level][c.name] = stats
        return [
          c.name,
          String(good.length),
          String(stats.failed),
          ms(total?.mean),
          ms(total?.p50),
          ms(total?.p95),
          ms(total?.min),
          ms(total?.max),
          c.name === 'Baseline' ? '—' : `${ms(stats.savedP50)} ms (${pct(base ? stats.savedP50 / base.p50 : null, 0)})`,
          ms(stats.transcription),
          ms(stats.primary),
          ms(stats.nameCheck),
          ms(stats.refinement),
          ms(stats.server),
          usd(stats.cost),
        ]
      })
    lines.push(`### ${level[0].toUpperCase()}${level.slice(1)}`, '')
    lines.push(
      table(['Config', 'Runs', 'Failed', 'Mean', 'p50', 'p95', 'Min', 'Max', 'Saved at p50', 'Transcription stage', 'Primary call', 'Name check call', 'Refinement stage', 'Server total', 'API cost / recording'], levelRows),
      '',
    )
  }
  lines.push('### By recording length (Light and Medium together, p50 ms)', '')
  const lengths = [5, 15, 30]
  lines.push(
    table(
      ['Config', ...lengths.map((l) => `~${l} s`)],
      configs.map((c) => [c.name, ...lengths.map((l) => ms(summarize(ok.filter((r) => r.config === c.name && r.level !== 'none' && byId[r.id]?.length === l).map((r) => r.roundTripMs))?.p50))]),
    ),
    '',
  )
  const seconds = Object.values(samples).map((s) => s.seconds)
  lines.push(`Recording lengths: ${Math.min(...seconds).toFixed(1)}–${Math.max(...seconds).toFixed(1)} s.`, '')
  return { text: lines.join('\n'), summary }
}

// Stop → text displayed, from the developer latency panel in a real browser.
function browserSection({ browser = [], configs }) {
  if (!browser.length) return ''
  const reps = Math.max(...browser.map((r) => r.rep))
  const ids = [...new Set(browser.map((r) => r.id))]
  const lines = ['## End-to-end latency in the browser (Stop → text displayed)', '']
  lines.push(
    `Production frontend build served locally in headless Chromium, the recording played into its fake microphone, backend in the benchmark process. ${ids.join(' and ')} × ${reps} repeats per configuration and level, a fresh browser each time. Total is the panel's Stop → painted text; the browser stages (audio finalization, frontend display) do not depend on the models.`,
    '',
  )
  const rows = []
  for (const level of ['none', 'light', 'medium']) {
    const base = summarize(browser.filter((r) => r.ok && r.config === 'Baseline' && r.level === level).map((r) => r.totalMs))
    for (const c of configs) {
      const set = browser.filter((r) => r.config === c.name && r.level === level)
      if (!set.length) continue
      const good = set.filter((r) => r.ok)
      const t = summarize(good.map((r) => r.totalMs))
      rows.push([
        level,
        c.name,
        String(good.length),
        String(set.length - good.length),
        ms(t?.mean),
        ms(t?.p50),
        ms(t?.p95),
        ms(t?.min),
        ms(t?.max),
        c.name === 'Baseline' || !base || !t ? '—' : `${ms(base.p50 - t.p50)} ms (${pct((base.p50 - t.p50) / base.p50, 0)})`,
        ms(mean(good.map((r) => r.finalization))),
        ms(mean(good.map((r) => r.transcription))),
        ms(mean(good.map((r) => r.refinement))),
        ms(mean(good.map((r) => r.display))),
      ])
    }
  }
  lines.push(table(['Level', 'Config', 'Runs', 'Failed', 'Mean', 'p50', 'p95', 'Min', 'Max', 'Saved at p50', 'Finalization', 'Transcription', 'Refinement', 'Display'], rows), '')
  return lines.join('\n')
}

function costSection(costs) {
  const byStage = [...groupBy(costs, (c) => c.stage)].map(([stage, rows]) => [stage, String(rows.length), usd(rows.reduce((s, r) => s + r.cost, 0))])
  const byModel = [...groupBy(costs, (c) => c.model)].map(([model, rows]) => [`\`${model}\``, String(rows.length), usd(rows.reduce((s, r) => s + r.cost, 0))])
  const total = costs.reduce((s, r) => s + r.cost, 0)
  return {
    text: ['## API spend (estimated from list prices)', '', table(['Stage', 'Calls', 'Cost'], byStage), '', table(['Model', 'Calls', 'Cost'], byModel), '', `Total: **${usd(total)}**.`, ''].join('\n'),
    total,
  }
}

export function buildTables(input) {
  const transcription = transcriptionSection(input)
  const refinement = refinementSection(input)
  const e2e = e2eSection(input)
  const latency = latencySection(input)
  const browser = browserSection(input)
  const cost = costSection(input.costs)
  const header = `# Model benchmark tables\n\nSource: **${input.source}** recordings${input.source === 'synthetic' ? ' (OpenAI text-to-speech reading the scripts; the reference is the script text)' : ''}. Generated ${new Date().toISOString()}.\n`
  return {
    tables: [header, latency.text, browser, transcription.text, refinement.text, e2e.text, cost.text].join('\n'),
    review: ['# Human review sheet', '', `Source: ${input.source}.`, '', transcription.review, refinement.review, e2e.review].join('\n'),
    summary: { transcription: transcription.summary, checkAudio: transcription.checkAudio, refinement: refinement.summary, e2e: e2e.summary, extraFailures: e2e.extra, latency: latency.summary, cost: cost.total },
  }
}
