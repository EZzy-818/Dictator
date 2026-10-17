// Detects refined text that dropped a language the speaker used, which is what translating
// one part of a mixed sentence looks like. Counts only; the text itself is never logged.

const HAN = /\p{Script=Han}/gu
const LATIN_WORDS = /\p{Script=Latin}+(?:'\p{Script=Latin}+)*/gu
const DEVANAGARI_WORDS = /[\p{Script=Devanagari}\p{M}]+/gu
// Fillers that refinement is meant to remove, so their removal never looks like a lost language.
const LATIN_FILLERS = new Set(['um', 'umm', 'uh', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm', 'like', 'so', 'you', 'know'])
const HAN_FILLERS = new Set(['嗯', '呃', '啊'])

export const LANGUAGE_NAMES = { han: 'Chinese', latin: 'English', devanagari: 'Hindi' }

// A language needs this many tokens in the transcript before its loss is judged.
const MIN_TOKENS = 3

export function scriptCounts(text) {
  const normalized = text.normalize('NFKC')
  const han = (normalized.match(HAN) ?? []).filter((char) => !HAN_FILLERS.has(char)).length
  const latin = (normalized.match(LATIN_WORDS) ?? []).filter((word) => !LATIN_FILLERS.has(word.toLowerCase())).length
  const devanagari = normalized.match(DEVANAGARI_WORDS)?.length ?? 0
  return { han, latin, devanagari }
}

/**
 * Names of the languages the refined text translated away: less than half of the language is left
 * while another language grew, by at least MIN_TOKENS, which is where the translated words went.
 * Removing fillers, resolving a correction and concision only shorten, so they never count.
 */
export function lostLanguages(transcript, refined) {
  const before = scriptCounts(transcript)
  const after = scriptCounts(refined)
  const scripts = Object.keys(before)
  const grew = scripts.filter((script) => after[script] >= before[script] + MIN_TOKENS)
  return scripts
    .filter((script) => before[script] >= MIN_TOKENS && after[script] < before[script] * 0.5)
    .filter((script) => grew.some((other) => other !== script))
    .map((script) => LANGUAGE_NAMES[script])
}

// Short English words that Light and Medium tend to swap for their Chinese or Hindi equivalent
// inside a mixed sentence ("…，because 成本低" becoming "…，因为成本低"). Too small for lostLanguages.
const WORD_EQUIVALENTS = {
  because: ['因为', 'क्योंकि'],
  so: ['所以', 'इसलिए'],
  but: ['但是', '但', 'लेकिन'],
  actually: ['其实', '实际上', 'असल में'],
  then: ['然后', 'फिर'],
  maybe: ['可能', '也许', 'शायद'],
  also: ['也', 'भी'],
  and: ['而且', '和', 'और'],
}

function occurrences(text, needle) {
  return text.split(needle).length - 1
}

/**
 * English words from the list above that the refined text has fewer of while one of their
 * equivalents became more frequent: a word-for-word translation, not a removal.
 */
export function translatedWords(transcript, refined) {
  const words = (text) => (text.normalize('NFKC').toLowerCase().match(LATIN_WORDS) ?? [])
  const before = words(transcript)
  const after = words(refined)
  return Object.entries(WORD_EQUIVALENTS)
    .filter(([word]) => after.filter((w) => w === word).length < before.filter((w) => w === word).length)
    .filter(([, equivalents]) => equivalents.some((other) => occurrences(refined, other) > occurrences(transcript, other)))
    .map(([word]) => word)
}
