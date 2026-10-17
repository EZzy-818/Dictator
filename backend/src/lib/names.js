// Puts names back in the language they were spoken in. gpt-transcribe tends to write a name in
// the language of the sentence around it: 纽约大学 said in Mandarin inside an English sentence
// comes back as "New York University", Seattle said in English inside a Chinese sentence as 西雅图.
// gpt-4o-transcribe keeps such names far more often, but drops or translates whole clauses more
// often, so its transcript is not used as is. Where the two transcripts of the same audio agree on
// the words around a short span and differ only in that span being English in one and Chinese in
// the other, the second transcript's span is taken, unless it is the one that matches the language
// around it. Everything else stays exactly as gpt-transcribe wrote it.

const TOKEN = /\p{Script=Han}|[\p{Script=Latin}\d]+(?:'[\p{Script=Latin}]+)*/gu
const HAN = /^\p{Script=Han}$/u
const SPACED_LATIN = /\p{Script=Han} [\p{Script=Latin}\d]|[\p{Script=Latin}\d] \p{Script=Han}/u

// A swapped span is a name or term, never a sentence: at most this many English words and Chinese
// characters on the two sides.
const MAX_LATIN_WORDS = 4
const MAX_HAN_CHARS = 8
// Words around the span both transcripts must share, on each side, so the span is the same place.
const ANCHOR = 2

// Ordinary words both models sometimes translate on their own (because ↔ 因为). A span made only of
// these is a translation of speech, not a name, and is left alone.
const COMMON_WORDS = new Set(
  'a an the and or but so because then also maybe actually just very really to of in on at for with from is are was were be it this that i you we he she they my your our their me us him her them not no yes ok okay'.split(' '),
)

// Fillers are often heard as either language (um as 嗯); swapping one for the other restores no name.
const FILLERS = new Set(['um', 'umm', 'uh', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm', '嗯', '呃', '啊'])

// A number is not a name. The two models often write the same amount differently (百分之十五 and
// 15%, 十号 and 10号), and the symbol or unit beside the digits is not part of the span, so taking
// the second transcript's version can drop it and change the amount ("15" for 15%). A word that also
// has letters, like Y10 for a misheard 外滩, is not a number.
const NUMBER = /^\d+$/u

function tokens(text) {
  return [...text.matchAll(TOKEN)].map((match) => ({
    key: match[0].toLowerCase(),
    han: HAN.test(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }))
}

// Longest common subsequence of token keys, as index pairs.
function matches(a, b) {
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i].key === b[j].key ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const pairs = []
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i].key === b[j].key) pairs.push([i++, j++])
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++
    else j++
  }
  return pairs
}

function isName(span) {
  if (span.length === 0 || span.every((token) => FILLERS.has(token.key))) return false
  if (span.some((token) => NUMBER.test(token.key))) return false
  if (span.every((token) => token.han)) return span.length <= MAX_HAN_CHARS
  if (span.some((token) => token.han)) return false
  return span.length <= MAX_LATIN_WORDS && !span.every((token) => COMMON_WORDS.has(token.key))
}

/**
 * transcript: gpt-transcribe's text. second: gpt-4o-transcribe's text of the same audio.
 * Returns { text, swapped, swaps } where swapped counts the names taken from the second transcript
 * and swaps lists them as { from: gpt-transcribe's words, to: the second transcript's }.
 */
export function restoreSpokenNames(transcript, second) {
  if (!second) return { text: transcript, swapped: 0, swaps: [] }
  const a = tokens(transcript)
  const b = tokens(second)
  const pairs = matches(a, b)

  // Matched tokens in a row, in both transcripts, ending at pair k (backwards) or starting at it.
  const runBack = (k) => {
    let n = 1
    while (k - n >= 0 && pairs[k - n][0] === pairs[k][0] - n && pairs[k - n][1] === pairs[k][1] - n) n++
    return n
  }
  const runForward = (k) => {
    let n = 1
    while (k + n < pairs.length && pairs[k + n][0] === pairs[k][0] + n && pairs[k + n][1] === pairs[k][1] + n) n++
    return n
  }

  const swaps = []
  for (let k = 0; k + 1 < pairs.length; k++) {
    const [ai, bi] = pairs[k]
    const [aNext, bNext] = pairs[k + 1]
    const spanA = a.slice(ai + 1, aNext)
    const spanB = b.slice(bi + 1, bNext)
    if (!isName(spanA) || !isName(spanB) || spanA[0].han === spanB[0].han) continue
    // Enough shared words on each side, or the whole rest of the text when the span is near an end.
    const enoughBefore = runBack(k) >= ANCHOR || runBack(k) === ai + 1
    const enoughAfter = runForward(k + 1) >= ANCHOR || runForward(k + 1) === a.length - aNext
    if (!enoughBefore || !enoughAfter) continue
    // gpt-4o-transcribe makes the same mistake now and then: Seattle in 搬到…去 as 西雅图. A span
    // that would match the language on both sides of it is that mistake, not the spoken name.
    if (a[ai].han === spanB[0].han && a[aNext].han === spanB[0].han) continue
    const start = spanA[0].start
    const end = spanA.at(-1).end
    const name = second.slice(spanB[0].start, spanB.at(-1).end)
    swaps.push({ start, end, from: transcript.slice(start, end), to: name, text: spaced(transcript, start, end, name) })
  }

  if (swaps.length === 0) return { text: transcript, swapped: 0, swaps: [] }
  let text = ''
  let cursor = 0
  for (const swap of swaps) {
    text += transcript.slice(cursor, swap.start) + swap.text
    cursor = swap.end
  }
  return { text: text + transcript.slice(cursor), swapped: swaps.length, swaps: swaps.map(({ from, to }) => ({ from, to })) }
}

// An English name between Chinese characters gets the spacing the text gives its other English
// words there ("先 deploy 到"), and none if it gives none.
function spaced(text, start, end, name) {
  if (HAN.test(name[0]) || !SPACED_LATIN.test(text)) return name
  const before = /\p{Script=Han}$/u.test(text.slice(0, start)) ? ' ' : ''
  const after = /^\p{Script=Han}/u.test(text.slice(end)) ? ' ' : ''
  return `${before}${name}${after}`
}

// Where `from` appears in text as a whole word (any Chinese characters, or English words not part
// of a longer word), or -1. Returns -2 when it appears more than once.
function findOnce(text, from) {
  const latin = /[\p{Script=Latin}\d]/u
  const found = []
  for (let at = text.indexOf(from); at !== -1; at = text.indexOf(from, at + 1)) {
    const whole = HAN.test(from[0]) || (!latin.test(text[at - 1] ?? '') && !latin.test(text[at + from.length] ?? ''))
    if (whole) found.push(at)
  }
  return found.length === 1 ? found[0] : found.length ? -2 : -1
}

/**
 * Makes the same swaps in another text made from the transcript, such as its refined version.
 * swaps: from restoreSpokenNames. Returns null when a name gpt-transcribe wrote is not in the text
 * exactly once, so the swap cannot be placed for certain.
 */
export function applySwaps(text, swaps) {
  let result = text
  for (const { from, to } of swaps) {
    const at = findOnce(result, from)
    if (at < 0) return null
    result = result.slice(0, at) + spaced(result, at, at + from.length, to) + result.slice(at + from.length)
  }
  return result
}
