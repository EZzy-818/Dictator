// Raw transcription fidelity: are the spoken languages kept, and are spoken fillers kept
// without inventing ones that were not said? Used by scripts/eval-fidelity.js.

import { align, mixedTokens, normalizeText } from './metrics.js'

// Fillers counted on their own. 那个 is left out: it is also an ordinary word ("that").
const EN_FILLER_WORDS = ['um', 'umm', 'uh', 'uhm', 'er', 'erm', 'ah', 'hmm']
const ZH_FILLER_CHARS = ['嗯', '呃']
const HI_FILLER_WORDS = ['उम्म', 'अं', 'हम्म']
// Spellings the models use for the same sound.
const FILLER_ALIASES = { umm: 'um', uhm: 'um', erm: 'er', 'उम': 'उम्म' }

const HAN = /\p{Script=Han}/gu
const DEVANAGARI_WORDS = /[\p{Script=Devanagari}]+/gu
const LATIN_WORDS = /[a-z]+(?:'[a-z]+)*/gi

/** Counts of each filler in the text, keyed by its canonical spelling. */
export function fillerCounts(text) {
  const counts = {}
  const add = (filler) => {
    const key = FILLER_ALIASES[filler] ?? filler
    counts[key] = (counts[key] ?? 0) + 1
  }
  const normalized = normalizeText(text)
  for (const word of normalized.split(' ')) {
    if (EN_FILLER_WORDS.includes(word) || HI_FILLER_WORDS.includes(word) || FILLER_ALIASES[word]) add(word)
  }
  for (const char of normalized) if (ZH_FILLER_CHARS.includes(char)) add(char)
  // "you know" is a filler phrase in English speech.
  for (const _ of normalized.matchAll(/(?<![a-z])you know(?![a-z])/g)) add('you know')
  return counts
}

/**
 * kept: fillers in the reference that the transcript also has.
 * missed: fillers in the reference the transcript left out.
 * invented: fillers in the transcript that the reference does not have.
 */
export function compareFillers(reference, transcript) {
  const expected = fillerCounts(reference)
  const actual = fillerCounts(transcript)
  let kept = 0
  let missed = 0
  let invented = 0
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const want = expected[key] ?? 0
    const got = actual[key] ?? 0
    kept += Math.min(want, got)
    missed += Math.max(0, want - got)
    invented += Math.max(0, got - want)
  }
  return { expected: kept + missed, kept, missed, invented }
}

/** How much of the text is in each script: Chinese characters, Latin words, Devanagari words. */
export function scriptCounts(text) {
  const normalized = text.normalize('NFKC')
  return {
    han: normalized.match(HAN)?.length ?? 0,
    latin: normalized.match(LATIN_WORDS)?.length ?? 0,
    devanagari: normalized.match(DEVANAGARI_WORDS)?.length ?? 0,
  }
}

const SCRIPT_NAMES = { han: 'Chinese', latin: 'English', devanagari: 'Hindi' }

/**
 * Whether each language spoken in the reference survived in the transcript. A script
 * counts as lost when the transcript keeps less than half of the reference's amount of it,
 * which is what translating that part into another language looks like.
 * Returns { preserved, lost: ['English', ...], added: [...] }.
 */
export function compareLanguages(reference, transcript) {
  const want = scriptCounts(reference)
  const got = scriptCounts(transcript)
  const lost = []
  const added = []
  for (const script of Object.keys(want)) {
    if (want[script] > 0 && got[script] < want[script] * 0.5) lost.push(SCRIPT_NAMES[script])
    // A few stray tokens are spelling (an English word written in Devanagari); more is a translation.
    if (want[script] === 0 && got[script] >= 3) added.push(SCRIPT_NAMES[script])
  }
  return { preserved: lost.length === 0 && added.length === 0, lost, added }
}

/** Mixed-token error rate with fillers counted, so dropped fillers count as errors. */
export function verbatimErrorRate(reference, transcript) {
  const result = align(mixedTokens(normalizeText(reference)), mixedTokens(normalizeText(transcript)))
  const errors = result.S + result.D + result.I
  return { ...result, errors, rate: result.N ? errors / result.N : 0 }
}

/**
 * Names and terms that must come back exactly as spoken, in the language they were said in
 * ("纽约大学" said in Mandarin inside an English sentence must not become "New York University").
 * Spaces are ignored. Returns { expected, kept, missing: [...] }.
 */
export function compareTerms(terms, transcript) {
  const compact = (text) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
  const missing = terms.filter((term) => !compact(transcript).includes(compact(term)))
  return { expected: terms.length, kept: terms.length - missing.length, missing }
}

export function scoreFidelity(reference, transcript, terms = []) {
  return {
    terms: compareTerms(terms, transcript),
    languages: compareLanguages(reference, transcript),
    fillers: compareFillers(reference, transcript),
    verbatim: verbatimErrorRate(reference, transcript),
  }
}
