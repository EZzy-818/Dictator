import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { lostLanguages, translatedWords } from '../src/lib/languages.js'
import { LANGUAGE_GUIDANCE, REFINEMENT_SYSTEM_PROMPT, buildRefinementInstructions, keepLanguagesReminder } from '../src/prompts/refinement.js'
import { AUDIO_SAMPLES, createTestApp, fakeOpenAI } from './helpers.js'

const MIXED = '我觉得我们应该用 PostgreSQL，because it handles relational data better.'
const TRANSLATED = '我觉得我们应该用 PostgreSQL，因为它处理关系型数据更好。'

describe('lostLanguages', () => {
  it.each([
    // Translations: one language mostly gone while the other keeps its size or grows.
    [MIXED, TRANSLATED, ['English']],
    ['我们应该用 React for the frontend，然后用 Python for the backend.', '我们应该用 React 做前端，然后用 Python 做后端。', ['English']],
    ['这个 bug 其实挺难复现的，it only happens when two users log in at the same time.', 'This bug is hard to reproduce; it only happens when two users log in at the same time.', ['Chinese']],
    ['Please send the report to the finance team before Friday.', '请在周五之前把报告发给财务团队。', ['English']],
    ['मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।', 'I think we should have a meeting next week.', ['Hindi']],
  ])('flags %j -> %j', (raw, refined, lost) => {
    expect(lostLanguages(raw, refined)).toEqual(lost)
  })

  it.each([
    // Edits that keep every language.
    [MIXED, MIXED],
    ['Um, I think we should, uh, use PostgreSQL.', 'I think we should use PostgreSQL.'],
    ['嗯，那个，我觉得我们，呃，明天可以开始这个项目。', '我觉得我们明天可以开始这个项目。'],
    // Medium concision of monolingual speech.
    [
      'Um, I was thinking that maybe we could potentially have a meeting sometime on Tuesday, actually no, Wednesday at 3 PM, to sort of discuss the project progress.',
      "Let's meet Wednesday at 3 PM to discuss the project's progress.",
    ],
    // A correction that drops the corrected-away words.
    ['我们应该用 MongoDB，actually no, PostgreSQL is better.', '我们应该用 PostgreSQL，it is better.'],
    ['我们应该用 MongoDB，actually no, PostgreSQL is better.', '我们应该用 PostgreSQL。'],
    // Too little of a language to judge.
    ['嗯，我觉得 OK。', 'OK.'],
  ])('does not flag %j -> %j', (raw, refined) => {
    expect(lostLanguages(raw, refined)).toEqual([])
  })
})

describe('translatedWords', () => {
  it.each([
    ['我觉得我们应该用 PostgreSQL because it handles relational data better.', '我觉得我们应该用 PostgreSQL，因为 it handles relational data better.', ['because']],
    ['这个计划还行，but 时间有点紧，所以 maybe 下周再说。', '这个计划还行，但时间有点紧，所以 maybe 下周再说。', ['but']],
    ['他说 actually 这个 bug 已经修好了，so 我们可以 release 了。', '他说其实这个 bug 已经修好了，所以我们可以 release 了。', ['so', 'actually']],
  ])('finds the swapped words in %j', (raw, refined, words) => {
    expect(translatedWords(raw, refined).sort()).toEqual(words.sort())
  })

  it.each([
    // Removed, not translated.
    ['So, um, I think we should, uh, start.', 'I think we should start.'],
    // Kept.
    ['这个计划还行，but 时间有点紧。', '这个计划还行，but 时间有点紧。'],
    // The Chinese word was already there.
    ['所以我们 maybe 下周再说。', '所以我们下周再说。'],
  ])('finds none in %j -> %j', (raw, refined) => {
    expect(translatedWords(raw, refined)).toEqual([])
  })
})

describe('refinement keeps the languages spoken', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const refine = (app, body) => request(app).post('/api/refine').send(body)
  const answers = (...texts) => {
    const queue = [...texts]
    return fakeOpenAI(undefined, async () => ({ status: 'completed', output_text: queue.shift() }))
  }

  it('tells the model that code-switching is intentional and never to translate', () => {
    expect(REFINEMENT_SYSTEM_PROMPT).toContain('Mixing languages within a sentence is intentional, not an error to correct.')
    expect(REFINEMENT_SYSTEM_PROMPT).not.toContain('For English speech, produce natural English.')
    expect(LANGUAGE_GUIDANCE).toContain('never "fix" it by translating one part into the other language')
    for (const level of ['light', 'medium']) expect(buildRefinementInstructions(level)).toContain(LANGUAGE_GUIDANCE)
  })

  it.each(['light', 'medium'])('returns a %s result that keeps both languages after one call', async (level) => {
    const kept = '我们应该用 React for the frontend，然后用 Python for the backend。'
    const { app, openai } = createTestApp({ openai: answers(kept) })
    const res = await refine(app, { transcript: '嗯，我们应该用 React for the frontend，然后用 Python for the backend.', refinementLevel: level })

    expect(res.status).toBe(200)
    expect(res.body.polishedTranscript).toBe(kept)
    expect(openai.responses.create).toHaveBeenCalledTimes(1)
  })

  it('asks again, naming the language, when the first answer translated part of the speech', async () => {
    const { app, openai } = createTestApp({ openai: answers(TRANSLATED, MIXED) })
    const res = await refine(app, { transcript: MIXED, refinementLevel: 'medium' })

    expect(res.status).toBe(200)
    expect(res.body.polishedTranscript).toBe(MIXED)
    expect(openai.responses.create).toHaveBeenCalledTimes(2)
    const [first, second] = openai.responses.create.mock.calls.map(([params]) => params)
    expect(first.instructions).toBe(buildRefinementInstructions('medium'))
    expect(second.instructions).toBe(buildRefinementInstructions('medium', { keepLanguages: ['English'], keepWords: ['because'] }))
    expect(second.instructions).toContain(keepLanguagesReminder(['English'], ['because']))
    expect(second.input).toBe(first.input)
  })

  it('asks again, naming the word, when the first answer translated one English word', async () => {
    const raw = '这个计划还行，but 时间有点紧。'
    const { app, openai } = createTestApp({ openai: answers('这个计划还行，但时间有点紧。', raw) })
    const res = await refine(app, { transcript: raw, refinementLevel: 'medium' })

    expect(res.body.polishedTranscript).toBe(raw)
    const second = openai.responses.create.mock.calls[1][0]
    expect(second.instructions).toBe(buildRefinementInstructions('medium', { keepWords: ['but'] }))
    expect(second.instructions).toContain('translated the English word "but"')
  })

  it('accepts a second answer that swaps one word again rather than failing', async () => {
    const raw = '这个计划还行，but 时间有点紧。'
    const swapped = '这个计划还行，但时间有点紧。'
    const { app, openai } = createTestApp({ openai: answers(swapped, swapped) })
    const res = await refine(app, { transcript: raw, refinementLevel: 'light' })

    expect(res.status).toBe(200)
    expect(res.body.polishedTranscript).toBe(swapped)
    expect(openai.responses.create).toHaveBeenCalledTimes(2)
  })

  it('does not return a translation when the second answer translates too', async () => {
    const { app, openai } = createTestApp({ openai: answers(TRANSLATED, TRANSLATED) })
    const res = await refine(app, { transcript: MIXED, refinementLevel: 'light' })

    expect(res.status).toBe(502)
    expect(res.body.code).toBe('refinement_changed_language')
    expect(res.body.error).toMatch(/another language/)
    expect(openai.responses.create).toHaveBeenCalledTimes(2)
  })

  it('keeps the raw transcript in /api/process when refinement keeps translating', async () => {
    const openai = answers(TRANSLATED, TRANSLATED)
    openai.audio.transcriptions.create.mockImplementation(async () => ({ text: MIXED }))
    const { app } = createTestApp({ openai })
    const res = await request(app).post('/api/process').attach('audio', AUDIO_SAMPLES.webm, { filename: 'blob', contentType: 'audio/webm' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ rawTranscript: MIXED, polishedTranscript: null, refinementStatus: 'failed' })
  })

  it('logs which language was lost, never the text', async () => {
    const { app } = createTestApp({ openai: answers(TRANSLATED, MIXED) })
    await refine(app, { transcript: MIXED, refinementLevel: 'light' })

    const logged = console.warn.mock.calls.flat().join(' ')
    expect(logged).toContain('English')
    expect(logged).not.toContain('PostgreSQL')
  })
})
