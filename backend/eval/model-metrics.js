// Scoring for the model optimization benchmark (docs/model-benchmark.md). Builds on the
// Milestone 7 normalization in metrics.js and the production language checks in languages.js.

import { charTokens, containsAny, containsTerm, mixedTokens, normalizeText, removeFillers, wordTokens } from './metrics.js'
import { lostLanguages, scriptCounts, translatedWords } from '../src/lib/languages.js'

const HAN = /\p{Script=Han}/u
const LATIN = /\p{Script=Latin}/u
const DEVANAGARI = /\p{Script=Devanagari}/u
const HI_FILLERS = new Set(['उम्म', 'अं', 'हम्म', 'उम'])
const LATIN_AT_EDGE = /^[\p{Script=Latin}\d]|[\p{Script=Latin}\d]$/u

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// normalizeText drops % and $ as punctuation, which would make "1%" and "one percent" differ by a
// word. Spelling the symbols out first makes them compare as the spoken words.
export function normalize(text) {
  return normalizeText(text.replace(/\$\s?(\d[\d,]*(?:\.\d+)?)/g, '$1 dollars').replace(/(\d)\s?[%％]/g, '$1 percent'))
}

// Rewrites every alternative written form in an `equiv` group to the group's first form, so
// "three PM" and "3 PM" score the same. Works on normalized text; longer forms are replaced first.
export function canonicalize(normalized, equiv = []) {
  const pairs = equiv
    .flatMap((group) => {
      const canonical = normalize(group[0])
      return group.slice(1).map((form) => [normalize(form), canonical])
    })
    .filter(([form, canonical]) => form && form !== canonical)
    .sort((a, b) => b[0].length - a[0].length)
  let text = normalized
  for (const [form, canonical] of pairs) {
    const start = LATIN_AT_EDGE.test(form[0]) ? '(?<![\\p{Script=Latin}\\d])' : ''
    const end = LATIN_AT_EDGE.test(form.at(-1)) ? '(?![\\p{Script=Latin}\\d])' : ''
    text = text.replace(new RegExp(`${start}${escapeRegExp(form)}${end}`, 'gu'), canonical)
  }
  return text
}

// Hindi hesitation sounds, which metrics.js does not know, are removed along with the others.
function withoutFillers(normalized) {
  return removeFillers(normalized)
    .split(' ')
    .filter((word) => word && !HI_FILLERS.has(word))
    .join(' ')
}

// Hindi spelling variants that writers and models use interchangeably: the nukta (फ़ाइल / फाइल)
// and chandrabindu written as anusvara (जाएँगे / जाएंगे). Both are folded so they are not errors.
export function foldHindi(text) {
  return text.replace(/\u093C/g, '').replace(/\u0901/g, '\u0902')
}

export function prepare(text, equiv, { fillers = false } = {}) {
  const normalized = foldHindi(canonicalize(normalize(text), equiv))
  return fillers ? normalized : withoutFillers(normalized)
}

// Levenshtein alignment with equal costs that also returns the matches, so every reference token
// can be followed to what the hypothesis has in its place.
export function alignPairs(reference, hypothesis) {
  const rows = reference.length + 1
  const cols = hypothesis.length + 1
  const cost = Array.from({ length: rows }, (_, i) => Int32Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const same = reference[i - 1] === hypothesis[j - 1]
      cost[i][j] = Math.min(cost[i - 1][j - 1] + (same ? 0 : 1), cost[i - 1][j] + 1, cost[i][j - 1] + 1)
    }
  }
  const ops = []
  let i = reference.length
  let j = hypothesis.length
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && reference[i - 1] === hypothesis[j - 1]
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (same ? 0 : 1)) {
      ops.push({ type: same ? 'M' : 'S', ref: reference[i - 1], hyp: hypothesis[j - 1] })
      i--
      j--
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      ops.push({ type: 'D', ref: reference[i - 1] })
      i--
    } else {
      ops.push({ type: 'I', hyp: hypothesis[j - 1] })
      j--
    }
  }
  ops.reverse()
  const count = (type) => ops.filter((op) => op.type === type).length
  return { S: count('S'), D: count('D'), I: count('I'), N: reference.length, ops }
}

// The writing system of a token: han, latin or devanagari. Digits and anything else are neutral
// (null), because a number is the same in every language.
export function scriptOf(token) {
  if (!token) return null
  if (HAN.test(token)) return 'han'
  if (DEVANAGARI.test(token)) return 'devanagari'
  if (LATIN.test(token)) return 'latin'
  return null
}

// Each Han character and each word in another script is one token.
export function scriptTokens(normalized) {
  return mixedTokens(normalized)
}

/**
 * Language behaviour of a transcript against its reference, on script tokens.
 *   preservation: reference tokens (in a script) whose aligned token is in the same script.
 *     A deleted token is not preserved.
 *   switches: language switch points in the reference (adjacent tokens in different scripts)
 *     whose two sides both land on tokens of the same two scripts, in order.
 *   translations: spans where at least 2 reference tokens in one script were removed or replaced
 *     while the hypothesis put at least 1 token of another script in the same place.
 */
export function languageScores(reference, hypothesis) {
  const { ops } = alignPairs(scriptTokens(reference), scriptTokens(hypothesis))

  let scripted = 0
  let preserved = 0
  const refToHyp = []
  for (const op of ops) {
    if (op.type === 'I') continue
    const script = scriptOf(op.ref)
    refToHyp.push(op.type === 'D' ? null : op.hyp)
    if (!script) continue
    scripted++
    if (op.type !== 'D' && scriptOf(op.hyp) === script) preserved++
  }

  const refTokens = ops.filter((op) => op.type !== 'I').map((op) => op.ref)
  let switches = 0
  let switchesKept = 0
  for (let k = 0; k + 1 < refTokens.length; k++) {
    const left = scriptOf(refTokens[k])
    const right = scriptOf(refTokens[k + 1])
    if (!left || !right || left === right) continue
    switches++
    if (scriptOf(refToHyp[k]) === left && scriptOf(refToHyp[k + 1]) === right) switchesKept++
  }

  // A run is a stretch of reference tokens in one script that were all deleted or replaced by
  // another script; insertions inside it are collected. Anything else ends the run.
  const translations = []
  let run = null
  const flush = () => {
    if (run && run.lost.length >= 2 && run.added.length >= 1) {
      translations.push({ from: run.script, lost: run.lost.join(' '), added: run.added.join(' ') })
    }
    run = null
  }
  for (const op of ops) {
    const refScript = scriptOf(op.ref)
    const hypScript = scriptOf(op.hyp)
    const lost = refScript && (op.type === 'D' || (op.type === 'S' && hypScript !== refScript))
    if (lost) {
      if (run && run.script !== refScript) flush()
      run ??= { script: refScript, lost: [], added: [] }
      run.lost.push(op.ref)
      if (hypScript) run.added.push(op.hyp)
    } else if (op.type === 'I' && run && (!hypScript || hypScript !== run.script)) {
      if (hypScript) run.added.push(op.hyp)
    } else {
      flush()
    }
  }
  flush()

  return { scripted, preserved, switches, switchesKept, translations }
}

const UNITS = { word: wordTokens, char: charTokens, mixed: mixedTokens }

// Error rate in one unit. fillers: true keeps hesitation sounds (verbatim scoring).
export function errorRate(reference, hypothesis, unit, { equiv = [], fillers = false } = {}) {
  const tokenize = UNITS[unit]
  const result = alignPairs(tokenize(prepare(reference, equiv, { fillers })), tokenize(prepare(hypothesis, equiv, { fillers })))
  const errors = result.S + result.D + result.I
  return { S: result.S, D: result.D, I: result.I, N: result.N, errors, rate: result.N ? errors / result.N : 0, ops: result.ops.filter((op) => op.type !== 'M') }
}

// The headline unit per language group: WER for English and Hindi, CER for Mandarin and mixed.
export const PRIMARY_UNIT = { en: 'word', hi: 'word', zh: 'char', mixed: 'char' }

export function entityResults(testCase, text) {
  return testCase.entities.map((entity) => ({ type: entity.type, name: entity.forms[0], kept: containsAny(text, entity.forms) }))
}

/** All transcription scores for one transcript of one case. */
export function scoreTranscription(testCase, hypothesis) {
  const { equiv } = testCase
  const unit = PRIMARY_UNIT[testCase.group]
  const primary = errorRate(testCase.script, hypothesis, unit, { equiv })
  const verbatim = errorRate(testCase.script, hypothesis, unit, { equiv, fillers: true })
  const mixed = testCase.group === 'mixed' ? errorRate(testCase.script, hypothesis, 'mixed', { equiv }) : null
  const language = languageScores(prepare(testCase.script, equiv), prepare(hypothesis, equiv))
  return { unit, primary, verbatim, mixed, language, entities: entityResults(testCase, hypothesis) }
}

function hasFillers(text) {
  const normalized = normalizeText(text)
  return withoutFillers(normalized) !== normalized.split(' ').filter(Boolean).join(' ')
}

function numbersIn(normalized) {
  return normalized.match(/\d+(?:[.:]\d+)?/g) ?? []
}

function multisetDifference(from, remove) {
  const left = [...from]
  for (const item of remove) {
    const index = left.indexOf(item)
    if (index !== -1) left.splice(index, 1)
  }
  return left
}

// Capitalized Latin words that are not at the start of a sentence: names and terms. A new one
// in refined text is a possible hallucination for a person to look at.
function properWords(text) {
  return [...text.matchAll(/(?<![.!?。！？]\s*|^\s*)\b[A-Z][\p{L}\d]*/gu)].map((m) => m[0])
}

/**
 * Deterministic refinement checks for one output. `input` is what the refiner was given (the
 * reference transcript in the refinement stage, a model transcript end to end); `testCase` says
 * what the speaker meant. Each check is true, false or null (does not apply).
 */
export function checkRefinementOutput(testCase, input, output) {
  const { equiv } = testCase
  const flags = []

  // Entities the input contains must survive. End to end, an entity the transcriber lost is a
  // transcription error, so it is counted there and not again here.
  const inputEntities = testCase.entities.filter((entity) => containsAny(input, entity.forms))
  const entities = inputEntities.map((entity) => ({ type: entity.type, name: entity.forms[0], kept: containsAny(output, entity.forms) }))
  for (const entity of entities.filter((x) => !x.kept)) flags.push(`lost ${entity.type}: ${entity.name}`)

  let correction = null
  if (testCase.correction) {
    const replaced = containsAny(output, testCase.correction.replacement)
    const kept = testCase.correction.drop.filter((term) => containsTerm(output, term))
    correction = replaced && kept.length === 0
    if (!replaced) flags.push(`correction: missing ${testCase.correction.replacement[0]}`)
    if (kept.length) flags.push(`correction: kept retracted ${kept.join(', ')}`)
  }

  const lost = lostLanguages(input, output)
  const words = translatedWords(input, output)
  const before = scriptCounts(input)
  const after = scriptCounts(output)
  const vanished = Object.keys(before).filter((script) => before[script] >= 2 && after[script] === 0)
  // Clause-level translations too small for lostLanguages, found by aligning input and output.
  const spans = languageScores(prepare(input, equiv), prepare(output, equiv)).translations
  const languagePreserved = lost.length === 0 && words.length === 0 && vanished.length === 0 && spans.length === 0
  if (lost.length) flags.push(`translated: ${lost.join(', ')}`)
  for (const span of spans) flags.push(`translated span: "${span.lost}" → "${span.added}"`)
  if (words.length) flags.push(`translated words: ${words.join(', ')}`)
  if (vanished.length && !lost.length) flags.push(`script gone: ${vanished.join(', ')}`)

  const inputNumbers = numbersIn(prepare(input, equiv, { fillers: true }))
  const outputNumbers = numbersIn(prepare(output, equiv, { fillers: true }))
  const newNumbers = multisetDifference(outputNumbers, inputNumbers)
  if (newNumbers.length) flags.push(`new numbers: ${newNumbers.join(', ')}`)
  const inputWords = new Set((input.match(/[\p{Script=Latin}\d]+/gu) ?? []).map((w) => w.toLowerCase()))
  const newProper = [...new Set(properWords(output).filter((word) => !inputWords.has(word.toLowerCase())))]
  if (newProper.length) flags.push(`new capitalized words: ${newProper.join(', ')}`)

  const fillersLeft = hasFillers(output)
  const meaningPreserved = entities.every((x) => x.kept) && correction !== false && languagePreserved && newNumbers.length === 0

  return {
    meaningPreserved,
    correction,
    languagePreserved,
    hallucinationSuspected: newNumbers.length > 0,
    entities,
    fillersLeft,
    lengthRatio: input.length ? output.length / input.length : null,
    flags,
  }
}

// Wilson score interval for a proportion, as [low, high].
export function wilson(successes, n, z = 1.96) {
  if (!n) return [null, null]
  const p = successes / n
  const denominator = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

// Corpus rate from per-sample error counts: total errors over total reference tokens.
export function corpusRate(scores) {
  const total = scores.reduce((sum, s) => ({ errors: sum.errors + s.errors, N: sum.N + s.N }), { errors: 0, N: 0 })
  return { ...total, rate: total.N ? total.errors / total.N : null, samples: scores.length }
}
