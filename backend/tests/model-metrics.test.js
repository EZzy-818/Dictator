import { describe, expect, it } from 'vitest'
import { CASES, LATENCY_CASE_IDS } from '../eval/models-dataset.js'
import {
  alignPairs,
  canonicalize,
  checkRefinementOutput,
  corpusRate,
  errorRate,
  languageScores,
  prepare,
  scoreTranscription,
  wilson,
} from '../eval/model-metrics.js'
import { normalizeText } from '../eval/metrics.js'
import { refinementParams, refineTranscript } from '../src/services/refinement.js'
import { fakeOpenAI } from './helpers.js'

const byId = Object.fromEntries(CASES.map((c) => [c.id, c]))

describe('model benchmark dataset', () => {
  it('has 36 unique cases, 9 per language group and 12 per length', () => {
    expect(CASES).toHaveLength(36)
    expect(new Set(CASES.map((c) => c.id)).size).toBe(36)
    for (const group of ['en', 'zh', 'hi', 'mixed']) expect(CASES.filter((c) => c.group === group)).toHaveLength(9)
    for (const length of [5, 15, 30]) expect(CASES.filter((c) => c.length === length)).toHaveLength(12)
    expect(LATENCY_CASE_IDS).toHaveLength(12)
  })

  it('has fillers and a self-correction in every language group', () => {
    for (const group of ['en', 'zh', 'hi', 'mixed']) {
      const cases = CASES.filter((c) => c.group === group)
      expect(cases.filter((c) => c.correction).length).toBeGreaterThanOrEqual(3)
      expect(cases.some((c) => /\b(um|uh)\b|嗯|呃|उम्म|अं/.test(c.script))).toBe(true)
    }
  })

  it('lists entities, replacements and expected texts that match the scripts', () => {
    for (const c of CASES) {
      for (const entity of c.entities) {
        // Every entity is in the expected refined text, so a correct refinement keeps it.
        expect(entity.forms.some((form) => normalizeText(c.expected).includes(normalizeText(form))), `${c.id}: ${entity.forms[0]}`).toBe(true)
      }
      if (c.correction) {
        expect(checkRefinementOutput(c, c.script, c.expected).correction, c.id).toBe(true)
        expect(checkRefinementOutput(c, c.script, c.script).correction, `${c.id} raw`).toBe(false)
      }
    }
  })

  it('scores every expected text as preserving meaning and language', () => {
    for (const c of CASES) {
      const check = checkRefinementOutput(c, c.script, c.expected)
      expect(check.meaningPreserved, `${c.id}: ${check.flags.join('; ')}`).toBe(true)
      expect(check.languagePreserved, c.id).toBe(true)
    }
  })

  it('scores every script as a perfect transcript of itself', () => {
    for (const c of CASES) {
      const score = scoreTranscription(c, c.script)
      expect(score.primary.errors, c.id).toBe(0)
      expect(score.language.translations, c.id).toEqual([])
      expect(score.entities.every((x) => x.kept), c.id).toBe(true)
    }
  })
})

describe('error rates', () => {
  it('counts substitutions, deletions and insertions in words', () => {
    const r = errorRate('the cat sat on the mat', 'the cat sit on mat today', 'word')
    expect(r.errors).toBe(3)
    expect(r.N).toBe(6)
    expect(r.rate).toBeCloseTo(3 / 6)
  })

  it('counts Chinese characters for CER and ignores punctuation', () => {
    const r = errorRate('我们周三上线。', '我们周二上线', 'char')
    expect([r.S, r.D, r.I, r.N]).toEqual([1, 0, 0, 6])
  })

  it('tokenizes Hindi by words after NFKC, so nukta spellings compare equal', () => {
    const precomposed = 'फ़ाइल भेजो'.normalize('NFC')
    const decomposed = 'फ़ाइल भेजो'
    expect(errorRate(precomposed, decomposed, 'word').errors).toBe(0)
    expect(errorRate('यह फ़ाइल मत भेजना।', 'यह फ़ाइल भेजना', 'word')).toMatchObject({ D: 1, N: 4 })
  })

  it('ignores fillers unless scoring verbatim', () => {
    expect(errorRate('um send it', 'send it', 'word').errors).toBe(0)
    expect(errorRate('um send it', 'send it', 'word', { fillers: true }).errors).toBe(1)
    expect(errorRate('उम्म, कल मीटिंग है', 'कल मीटिंग है', 'word').errors).toBe(0)
  })

  it('treats equivalent written forms as the same words', () => {
    const equiv = [['3 pm', 'three pm']]
    expect(canonicalize(normalizeText('Meet at three PM.'), equiv)).toBe('meet at 3 pm')
    expect(errorRate("Let's meet at three PM", "Let's meet at 3 PM", 'word', { equiv }).errors).toBe(0)
    expect(errorRate('明天下午三点开会', '明天下午3点开会', 'char', { equiv: [['三点', '3点']] }).errors).toBe(0)
  })

  it('aggregates over the corpus by token, not by sample', () => {
    expect(corpusRate([{ errors: 1, N: 10 }, { errors: 3, N: 30 }]).rate).toBeCloseTo(0.1)
  })

  it('aligns with matches included', () => {
    expect(alignPairs(['a', 'b'], ['a', 'c']).ops.map((op) => op.type)).toEqual(['M', 'S'])
  })
})

describe('language scores', () => {
  const score = (ref, hyp) => languageScores(prepare(ref), prepare(hyp))

  it('is perfect for an identical mixed transcript', () => {
    const s = score('我觉得 we should 先把 login page 做完', '我觉得 we should 先把 login page 做完')
    expect(s.preserved).toBe(s.scripted)
    expect(s.switchesKept).toBe(s.switches)
    expect(s.switches).toBe(4)
    expect(s.translations).toEqual([])
  })

  it('detects an English clause written in Chinese', () => {
    const s = score('我觉得我们应该用 PostgreSQL because it handles relational data better', '我觉得我们应该用 PostgreSQL 因为它处理关系数据更好')
    expect(s.translations).toHaveLength(1)
    expect(s.translations[0].from).toBe('latin')
    expect(s.preserved).toBeLessThan(s.scripted)
  })

  it('does not call a misheard word in the same language a translation', () => {
    expect(score('send the invoice to Priya', 'send the invoice to Pria').translations).toEqual([])
  })

  it('detects a Devanagari word written in Latin letters', () => {
    const s = score('नया सर्वर बिल बढ़ गया', 'नया server bill बढ़ गया')
    expect(s.translations).toHaveLength(1)
    expect(s.translations[0].from).toBe('devanagari')
  })

  it('counts a switch as lost when one side changes language', () => {
    const s = score('这个 bug 我明天 fix', '这个错误我明天 fix')
    expect(s.switchesKept).toBeLessThan(s.switches)
  })
})

describe('refinement checks', () => {
  it('passes a correct correction and fails a kept retracted value', () => {
    const c = byId['en-5-b']
    expect(checkRefinementOutput(c, c.script, "Let's meet Wednesday at 3 PM.").correction).toBe(true)
    const wrong = checkRefinementOutput(c, c.script, "Let's meet Tuesday at 3 PM.")
    expect(wrong.correction).toBe(false)
    expect(wrong.meaningPreserved).toBe(false)
  })

  it('handles cross-language corrections', () => {
    const c = byId['mixed-5-b']
    expect(checkRefinementOutput(c, c.script, '我们用 PostgreSQL。').correction).toBe(true)
    expect(checkRefinementOutput(c, c.script, '我们用 MySQL 和 PostgreSQL。').correction).toBe(false)
  })

  it('flags lost negations and entities', () => {
    const c = byId['en-5-c']
    const check = checkRefinementOutput(c, c.script, 'Please merge the Redis migration.')
    expect(check.meaningPreserved).toBe(false)
    expect(check.entities.find((x) => x.type === 'negation').kept).toBe(false)
  })

  it('flags translation of an English clause', () => {
    const c = byId['mixed-15-a']
    const check = checkRefinementOutput(c, c.script, '我觉得我们应该用 PostgreSQL，因为它更擅长处理关系型数据，而且团队里大家都比较熟。')
    expect(check.languagePreserved).toBe(false)
    expect(check.meaningPreserved).toBe(false)
  })

  it('flags numbers that are not in the input, but not rewritten forms of the same number', () => {
    const c = byId['en-15-a']
    expect(checkRefinementOutput(c, c.script, c.expected).hallucinationSuspected).toBe(false)
    const added = checkRefinementOutput(c, c.script, c.expected.replace('twice', '3 times'))
    expect(added.hallucinationSuspected).toBe(true)
  })

  it('counts only entities the input contains', () => {
    const c = byId['en-5-a']
    const check = checkRefinementOutput(c, 'Send the invoice to Maria by Friday.', 'Send the invoice to Maria by Friday.')
    expect(check.entities.map((x) => x.name)).toEqual(['Friday'])
    expect(check.meaningPreserved).toBe(true)
  })

  it('notices fillers left in the output', () => {
    const c = byId['en-5-a']
    expect(checkRefinementOutput(c, c.script, c.script).fillersLeft).toBe(true)
    expect(checkRefinementOutput(c, c.script, c.expected).fillersLeft).toBe(false)
  })
})

describe('Wilson interval', () => {
  it('brackets the observed proportion', () => {
    const [low, high] = wilson(30, 36)
    expect(low).toBeLessThan(30 / 36)
    expect(high).toBeGreaterThan(30 / 36)
    expect(wilson(0, 0)).toEqual([null, null])
  })
})

describe('refinement parameters per model', () => {
  it('turns reasoning off for reasoning models and leaves gpt-4.1 as it was', () => {
    expect(refinementParams('gpt-4.1')).toEqual({})
    expect(refinementParams('gpt-4.1-mini')).toEqual({})
    expect(refinementParams('gpt-6-luna')).toEqual({ reasoning: { effort: 'none' } })
    expect(refinementParams('gpt-5.4-mini')).toEqual({ reasoning: { effort: 'none' } })
  })

  it('sends temperature 0 and the reasoning setting to the API', async () => {
    const openai = fakeOpenAI()
    await refineTranscript({ client: openai, model: 'gpt-6-luna', transcript: 'um hello world', level: 'light' })
    expect(openai.responses.create.mock.calls[0][0]).toMatchObject({ model: 'gpt-6-luna', temperature: 0, reasoning: { effort: 'none' } })
  })

  it('None returns the transcript byte for byte without a model call, for every model', async () => {
    for (const model of ['gpt-4.1', 'gpt-6-luna', 'gpt-5.4-mini']) {
      const openai = fakeOpenAI()
      for (const c of CASES) {
        expect(await refineTranscript({ client: openai, model, transcript: c.script, level: 'none' })).toBe(c.script)
      }
      expect(openai.responses.create).not.toHaveBeenCalled()
    }
  })
})

describe('symbols spelled out', () => {
  it('scores "1%" and "$600" as the spoken words', () => {
    expect(errorRate('the rate dropped to one percent', 'the rate dropped to 1%', 'word', { equiv: [['1', 'one']] }).errors).toBe(0)
    expect(errorRate('six hundred dollars per person', '$600 per person', 'word', { equiv: [['600', 'six hundred']] }).errors).toBe(0)
    expect(errorRate('预算增加百分之十五', '预算增加15%', 'char', { equiv: [['百分之十五', '15%']] }).errors).toBe(0)
  })
})
