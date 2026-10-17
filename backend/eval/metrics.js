// Scoring for the Milestone 7 accuracy evaluation. The normalization policy is
// documented in docs/evaluation.md; keep the two in sync.

const EN_FILLERS = new Set(['um', 'umm', 'uh', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm'])
const ZH_FILLERS = ['嗯', '呃']
const CJK = /[\p{Script=Han}]/u
const CJK_ALL = /\p{Script=Han}/gu
const LATIN_WORDS = /[a-z0-9]+(?:['.][a-z0-9]+)*/gi
const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' })

// 1. NFKC (full-width letters, digits and punctuation become their usual forms).
// 2. Lowercase. 3. Curly apostrophes become straight ones.
// 4. Commas inside numbers are dropped (1,250 -> 1250), and dotted abbreviations
//    are joined (p.m. -> pm).
// 5. Punctuation and symbols become spaces, except a decimal point or colon between
//    digits (1.31, 3:00) and an apostrophe inside a word (don't).
// 6. Whitespace is collapsed.
export function normalizeText(text) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/(?<![a-z])([a-z])\.([a-z])\.?(?![a-z])/g, '$1$2')
    .replace(/[\p{P}\p{S}]/gu, (char, offset, whole) => {
      const before = whole[offset - 1] ?? ''
      const after = whole[offset + 1] ?? ''
      if ((char === '.' || char === ':') && /\d/.test(before) && /\d/.test(after)) return char
      if (char === "'" && /\p{L}/u.test(before) && /\p{L}/u.test(after)) return char
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
}

// Hesitation sounds are not meaningful words, and transcription models usually
// leave them out, so the main scores ignore them on both sides.
export function removeFillers(normalized) {
  let text = normalized
  for (const filler of ZH_FILLERS) text = text.replaceAll(filler, ' ')
  return text
    .split(' ')
    .filter((word) => word && !EN_FILLERS.has(word))
    .join(' ')
}

export function wordTokens(normalized) {
  return normalized ? normalized.split(' ') : []
}

// Characters, with spaces removed, segmented as Unicode grapheme clusters.
export function charTokens(normalized) {
  return Array.from(graphemes.segment(normalized.replace(/ /g, '')), (part) => part.segment)
}

// Each Chinese character is one token and each run of Latin letters or digits is one token.
export function mixedTokens(normalized) {
  const tokens = []
  for (const word of wordTokens(normalized)) {
    let latin = ''
    for (const { segment } of graphemes.segment(word)) {
      if (CJK.test(segment)) {
        if (latin) tokens.push(latin)
        latin = ''
        tokens.push(segment)
      } else {
        latin += segment
      }
    }
    if (latin) tokens.push(latin)
  }
  return tokens
}

// Levenshtein alignment with equal costs. Returns the counts and the list of errors.
export function align(reference, hypothesis) {
  const rows = reference.length + 1
  const cols = hypothesis.length + 1
  const cost = Array.from({ length: rows }, (_, i) => {
    const row = Array.from({ length: cols }, () => 0)
    row[0] = i
    return row
  })
  for (let j = 0; j < cols; j++) cost[0][j] = j
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
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)) {
      if (reference[i - 1] !== hypothesis[j - 1]) ops.push({ type: 'S', ref: reference[i - 1], hyp: hypothesis[j - 1] })
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

const TOKENIZERS = { wer: wordTokens, cer: charTokens, mer: mixedTokens }

function scoreOne(reference, hypothesis, unit, { fillers }) {
  const prepare = (text) => (fillers ? normalizeText(text) : removeFillers(normalizeText(text)))
  const tokenize = TOKENIZERS[unit]
  const result = align(tokenize(prepare(reference)), tokenize(prepare(hypothesis)))
  const errors = result.S + result.D + result.I
  return { ...result, errors, rate: result.N ? errors / result.N : 0 }
}

// Scores against the script and its accepted alternatives and keeps the closest.
export function scoreTranscript(testCase, hypothesis) {
  const references = [testCase.script, ...(testCase.accept ?? [])]
  const units = testCase.metric === 'mixed' ? ['cer', 'mer'] : [testCase.metric]
  const scores = {}
  for (const unit of units) {
    for (const fillers of [false, true]) {
      const key = fillers ? `${unit}Strict` : unit
      const candidates = references.map((reference) => ({ reference, ...scoreOne(reference, hypothesis, unit, { fillers }) }))
      scores[key] = candidates.reduce((best, next) => (next.errors < best.errors ? next : best))
    }
  }
  return scores
}

// Corpus-level rate: total errors over total reference tokens.
export function aggregate(scores) {
  const total = { S: 0, D: 0, I: 0, N: 0 }
  for (const score of scores) {
    for (const key of Object.keys(total)) total[key] += score[key]
  }
  const errors = total.S + total.D + total.I
  return { ...total, errors, rate: total.N ? errors / total.N : 0, samples: scores.length }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function prepareForMatch(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
}

// A term that starts or ends with a Latin letter or digit must not continue a longer
// Latin word or number there (PR does not match PRice); Chinese characters match anywhere.
export function containsTerm(text, term) {
  const haystack = prepareForMatch(text)
  const needle = prepareForMatch(term).trim()
  const start = /^[a-z0-9]/.test(needle) ? '(?<![a-z0-9])' : ''
  const end = /[a-z0-9]$/.test(needle) ? '(?![a-z0-9])' : ''
  return new RegExp(`${start}${escapeRegExp(needle)}${end}`).test(haystack)
}

export function containsAny(text, alternatives) {
  return alternatives.some((term) => containsTerm(text, term))
}

// Terms the transcript should contain that it does not.
export function missingTerms(testCase, text) {
  return (testCase.terms ?? []).filter((alternatives) => !containsAny(text, alternatives)).map((alternatives) => alternatives[0])
}

function numbers(text) {
  return (text.normalize('NFKC').replace(/(?<=\d),(?=\d)/g, '').match(/\d+(?:\.\d+)?/g) ?? []).sort()
}

function multisetDifference(from, remove) {
  const left = [...from]
  for (const item of remove) {
    const index = left.indexOf(item)
    if (index !== -1) left.splice(index, 1)
  }
  return left
}

const EN_NEGATION = /\b(?:not|no|never|none|nothing|nobody)\b|n't\b/gi
const ZH_NEGATION = /[不没别未无]/g

function negations(text) {
  const normalized = prepareForMatch(text)
  return (normalized.match(EN_NEGATION)?.length ?? 0) + (normalized.match(ZH_NEGATION)?.length ?? 0)
}

function dominantLanguage(text) {
  const normalized = prepareForMatch(text)
  const han = normalized.match(CJK_ALL)?.length ?? 0
  const latin = normalized.match(/[a-z]+/g)?.length ?? 0
  if (!han && !latin) return 'none'
  return han >= latin ? 'zh' : 'en'
}

function hasFillers(text) {
  const normalized = normalizeText(text)
  return ZH_FILLERS.some((filler) => normalized.includes(filler)) || wordTokens(normalized).some((word) => EN_FILLERS.has(word))
}

// Automatic checks of the refinement checklist. Each is true (pass), false (fail)
// or null (does not apply). Meaning, hallucination and overall acceptability
// still need a person; the "review" notes point at what to look at.
export function checkRefinement(testCase, raw, refined) {
  const checks = {}
  const review = []

  if (testCase.correction) {
    const include = testCase.refined?.include ?? []
    const exclude = testCase.refined?.exclude ?? []
    const correctionApplies = include.length || exclude.length
    checks.correction = correctionApplies
      ? include.every((alternatives) => containsAny(refined, alternatives)) && !exclude.some((term) => containsTerm(refined, term))
      : null
  } else {
    checks.correction = null
  }

  checks.fillersRemoved = !hasFillers(refined)

  const rawLanguage = dominantLanguage(raw)
  const refinedLanguage = dominantLanguage(refined)
  const rawHan = prepareForMatch(raw).match(CJK_ALL)?.length ?? 0
  const refinedHan = prepareForMatch(refined).match(CJK_ALL)?.length ?? 0
  checks.languagePreserved = rawLanguage === refinedLanguage && !(rawHan >= 4 && refinedHan === 0)

  const termsInRaw = (testCase.terms ?? []).filter((alternatives) => containsAny(raw, alternatives))
  const termsLost = termsInRaw.filter((alternatives) => !containsAny(refined, alternatives)).map((alternatives) => alternatives[0])
  checks.termsKept = termsInRaw.length ? termsLost.length === 0 : null
  if (termsLost.length) review.push(`terms lost: ${termsLost.join(', ')}`)

  const rawNumbers = numbers(raw)
  const refinedNumbers = numbers(refined)
  const added = multisetDifference(refinedNumbers, rawNumbers)
  if (testCase.correction) {
    checks.numbersKept = null
  } else {
    const lost = multisetDifference(rawNumbers, refinedNumbers)
    checks.numbersKept = lost.length === 0 && added.length === 0
    if (lost.length) review.push(`numbers lost: ${lost.join(', ')}`)
    checks.negationsKept = negations(raw) === negations(refined)
  }
  if (added.length) review.push(`numbers not in the raw transcript: ${added.join(', ')}`)
  checks.negationsKept ??= null

  const rawWords = new Set((prepareForMatch(raw).match(LATIN_WORDS) ?? []).map((word) => word.toLowerCase()))
  const newWords = [...new Set((prepareForMatch(refined).match(LATIN_WORDS) ?? []).filter((word) => !rawWords.has(word) && !/^\d/.test(word)))]
  if (newWords.length) review.push(`words not in the raw transcript: ${newWords.join(', ')}`)

  return { checks, review }
}
