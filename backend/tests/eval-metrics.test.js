import { describe, expect, it } from 'vitest'
import { CASES } from '../eval/dataset.js'
import {
  align,
  charTokens,
  checkRefinement,
  containsTerm,
  missingTerms,
  mixedTokens,
  normalizeText,
  removeFillers,
  scoreTranscript,
} from '../eval/metrics.js'
import { addNoise } from '../eval/noise.js'

const byId = (id) => CASES.find((testCase) => testCase.id === id)

describe('evaluation dataset', () => {
  it('has at least 30 samples and at least 5 per roadmap category', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30)
    const counts = {}
    for (const testCase of CASES) counts[testCase.category] = (counts[testCase.category] ?? 0) + 1
    expect(Object.keys(counts)).toHaveLength(6)
    for (const count of Object.values(counts)) expect(count).toBeGreaterThanOrEqual(5)
  })

  it('uses unique ids and supported metrics', () => {
    expect(new Set(CASES.map((testCase) => testCase.id)).size).toBe(CASES.length)
    for (const testCase of CASES) {
      expect(['wer', 'cer', 'mixed']).toContain(testCase.metric)
    }
  })

  it('scores every script as a perfect transcript of itself', () => {
    for (const testCase of CASES) {
      const scores = scoreTranscript(testCase, testCase.script)
      for (const score of Object.values(scores)) expect(score.errors).toBe(0)
      expect(missingTerms(testCase, testCase.script)).toEqual([])
    }
  })
})

describe('normalizeText', () => {
  it('folds case, full-width forms, punctuation and number commas', () => {
    expect(normalizeText('Hello, World! ＡＢＣ　１２３')).toBe('hello world abc 123')
    expect(normalizeText('The total is $1,250.')).toBe('the total is 1250')
    expect(normalizeText('我们用 PostgreSQL，好吗？')).toBe('我们用 postgresql 好吗')
  })

  it('keeps decimal points, times and apostrophes inside words', () => {
    expect(normalizeText('Version 1.31 at 3:00, don’t "quote".')).toBe("version 1.31 at 3:00 don't quote")
  })

  it('removes hesitation sounds only when asked', () => {
    expect(removeFillers(normalizeText('Um, I think, uh, yes.'))).toBe('i think yes')
    expect(removeFillers(normalizeText('嗯，我觉得，呃，可以。'))).toBe('我觉得 可以')
  })
})

describe('tokenizers', () => {
  it('splits Chinese into characters without spaces', () => {
    expect(charTokens('我们 用 abc')).toEqual(['我', '们', '用', 'a', 'b', 'c'])
  })

  it('splits mixed text into Chinese characters and Latin words', () => {
    expect(mixedTokens(normalizeText('这个backend应该用 Python 3.12'))).toEqual(['这', '个', 'backend', '应', '该', '用', 'python', '3.12'])
  })
})

describe('align', () => {
  it('counts substitutions, deletions and insertions', () => {
    const result = align(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])
    expect(result).toMatchObject({ S: 1, D: 0, I: 1, N: 4 })
    expect(align(['a', 'b', 'c'], ['a', 'c'])).toMatchObject({ S: 0, D: 1, I: 0, N: 3 })
  })
})

describe('scoreTranscript', () => {
  it('computes WER for English and ignores fillers in the main score', () => {
    const testCase = byId('en-corrections-1')
    const scores = scoreTranscript(testCase, 'I think we should start the migration tomorrow morning.')
    expect(scores.wer.errors).toBe(0)
    expect(scores.werStrict.D).toBe(2)
  })

  it('computes CER for Chinese', () => {
    const scores = scoreTranscript(byId('zh-normal-2'), '新的注册流程让用户更容易找到设置页。')
    expect(scores.cer).toMatchObject({ D: 1, N: 18 })
  })

  it('scores against the closest accepted form', () => {
    const scores = scoreTranscript(byId('en-corrections-2'), "Let's meet on Tuesday. Actually, no, Wednesday at 3 p.m.")
    expect(scores.wer.errors).toBe(0)
  })

  it('reports CER and mixed-token error rate for mixed speech', () => {
    const scores = scoreTranscript(byId('mixed-3'), '这个bug是因为API返回的Jason格式不对。')
    expect(scores.cer.errors).toBeGreaterThan(0)
    expect(scores.mer).toMatchObject({ S: 1, N: 15 })
  })
})

describe('terms', () => {
  it('matches Latin terms as whole words and Chinese terms anywhere', () => {
    expect(containsTerm('这个backend应该', 'backend')).toBe(true)
    expect(containsTerm('the PRice', 'PR')).toBe(false)
    expect(containsTerm('请提醒李娜', '李娜')).toBe(true)
  })

  it('lists terms missing from a transcript', () => {
    expect(missingTerms(byId('special-2'), 'Sarah Chen from Stripe asked us to upgrade Cubernetes to version 1.31 and enable OAuth.')).toEqual(['Kubernetes'])
  })
})

describe('checkRefinement', () => {
  it('passes a refinement that resolves the correction', () => {
    const testCase = byId('en-corrections-2')
    const { checks } = checkRefinement(testCase, "Let's meet on Tuesday, actually no, Wednesday at 3 PM.", "Let's meet on Wednesday at 3 PM.")
    expect(checks).toMatchObject({ correction: true, fillersRemoved: true, languagePreserved: true, termsKept: true, numbersKept: null })
  })

  it('lets a correction drop the term it replaced', () => {
    const raw = '我觉得我们应该用MongoDB，不对，还是PostgreSQL比较好，因为我们需要relational data。'
    const { checks } = checkRefinement(byId('mixed-5'), raw, '我觉得我们应该用 PostgreSQL，因为我们需要 relational data。')
    expect(checks).toMatchObject({ correction: true, termsKept: true })
  })

  it('fails a refinement that keeps the replaced value', () => {
    const { checks } = checkRefinement(byId('zh-corrections-5'), '我们需要三台新服务器，哦不，是四台新服务器。', '我们需要三台或四台新服务器。')
    expect(checks.correction).toBe(false)
  })

  it('flags changed numbers, lost negations, fillers and translation', () => {
    const testCase = byId('special-1')
    const raw = 'The invoice total is $1,250, and it is not due before March 15th, 2027.'
    const result = checkRefinement(testCase, raw, 'Um, the invoice total is $1,350, and it is due before March 15th, 2027.')
    expect(result.checks).toMatchObject({ numbersKept: false, negationsKept: false, fillersRemoved: false, termsKept: false })
    expect(result.review.join(' ')).toContain('1350')

    const translated = checkRefinement(byId('zh-normal-2'), '新的注册流程让用户更容易找到设置页面。', 'The new sign-up flow makes the settings page easier to find.')
    expect(translated.checks.languagePreserved).toBe(false)
  })
})

describe('addNoise', () => {
  function wav(samples) {
    const buffer = Buffer.alloc(44 + samples.length * 2)
    buffer.write('RIFF', 0, 'ascii')
    buffer.writeUInt32LE(36 + samples.length * 2, 4)
    buffer.write('WAVEfmt ', 8, 'ascii')
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22)
    buffer.writeUInt32LE(24000, 24)
    buffer.writeUInt32LE(48000, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36, 'ascii')
    // Streamed WAV placeholder size, as OpenAI text-to-speech can return.
    buffer.writeUInt32LE(0xffffffff, 40)
    samples.forEach((sample, i) => buffer.writeInt16LE(sample, 44 + i * 2))
    return buffer
  }

  it('mixes noise at roughly the requested signal-to-noise ratio, deterministically', () => {
    const tone = Array.from({ length: 24000 }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / 24000)))
    const noisy = addNoise(wav(tone), 10, 7)
    expect(noisy.readUInt32LE(40)).toBe(tone.length * 2)
    expect(addNoise(wav(tone), 10, 7).equals(noisy)).toBe(true)

    let signal = 0
    let noise = 0
    tone.forEach((sample, i) => {
      const difference = noisy.readInt16LE(44 + i * 2) - sample
      signal += sample * sample
      noise += difference * difference
    })
    const snr = 10 * Math.log10(signal / noise)
    expect(snr).toBeGreaterThan(9)
    expect(snr).toBeLessThan(11)
  })
})
