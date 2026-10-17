import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { restoreSpokenNames } from '../src/lib/names.js'
import { NAME_CHECK_WAIT_MS } from '../src/services/transcription.js'
import { AUDIO_SAMPLES, createTestApp, fakeOpenAI } from './helpers.js'

// Pairs of real transcripts of the same synthetic audio: gpt-transcribe, then gpt-4o-transcribe.
const NYU = "嗯，你好，我的名字叫王宇辰, and I just graduated from New York University with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。"
const NYU_CHECK = '嗯你好，我的名字叫王宇晨,and I just graduated from 纽约大学 with a bachelor\'s degree in 计算机科学. So it\'s really nice for me to meet you today.我想要更多地了解你.'

describe('restoreSpokenNames', () => {
  it.each([
    // The reported sentence: 纽约大学 said in Mandarin inside an English clause.
    [NYU, NYU_CHECK, NYU.replace('New York University', '纽约大学')],
    ["I'm meeting Zhang老师 at 清华大学 tomorrow, so I'll be a little late for the call.", "I'm meeting 张老师 at 清华大学 tomorrow, so I'll be a little late for the call.", "I'm meeting 张老师 at 清华大学 tomorrow, so I'll be a little late for the call."],
    ['We flew from Shanghai to Beijing last week, but honestly I liked the hotel near Y10 better.', 'We flew from Shanghai to Beijing last week, but honestly I like the hotel near 外滩 better.', 'We flew from Shanghai to Beijing last week, but honestly I liked the hotel near 外滩 better.'],
    // The reverse: Seattle said in English inside a Chinese sentence, spaced like the transcript's other English.
    ['我朋友在 Google 工作，他下个月要搬到西雅图去。', '我朋友在Google工作，他下个月要搬到Seattle去。', '我朋友在 Google 工作，他下个月要搬到 Seattle 去。'],
    ['我朋友在Google工作，他下个月要搬到西雅图去。', '我朋友在Google工作，他下个月要搬到Seattle去。', '我朋友在Google工作，他下个月要搬到Seattle去。'],
    // An English phrase gpt-transcribe translated into Chinese.
    ['嗯，我觉得我们应该先 deploy 到 staging，然后再 push to production。', 'Um, 我觉得 we should 先 deploy 到 staging，然后再 push to production.', '嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。'],
  ])('restores %j', (transcript, check, expected) => {
    expect(restoreSpokenNames(transcript, check).text).toBe(expected)
  })

  it.each([
    // The check heard Seattle as 西雅图 between Chinese words: the mistake gpt-transcribe makes, not a name.
    ['我朋友在Google工作，他下个月要搬到Seattle去。', '我朋友在Google工作，他下个月要搬到西雅图去。'],
    // A translated sentence is not a name.
    [
      "and I just graduated from 纽约大学 with a degree. So it's really nice for me to meet you today. 我想要更多地了解你。",
      'and I just graduated from 纽约大学 with a degree. 所以很高兴今天见到你。我想要更多地了解你。',
    ],
    // A common word or a filler heard in the other language.
    ['这个方案我觉得可以，because 成本比较低。', '这个方案我觉得可以，因为成本比较低。'],
    ['Um, I think we should use PostgreSQL.', '嗯, I think we should use PostgreSQL.'],
    // Same language on both sides: a homophone, left as gpt-transcribe heard it.
    ['我的名字叫王宇辰, and I just graduated.', '我的名字叫王雨晨, and I just graduated.'],
    // Nothing shared around the span.
    ['New York University', '纽约大学'],
  ])('leaves %j alone', (transcript, check) => {
    expect(restoreSpokenNames(transcript, check)).toEqual({ text: transcript, swapped: 0 })
  })

  it('keeps the transcript when there is no check', () => {
    expect(restoreSpokenNames(NYU, null)).toEqual({ text: NYU, swapped: 0 })
  })

  it('changes nothing but the name, punctuation and spacing included', () => {
    const { text, swapped } = restoreSpokenNames(NYU, NYU_CHECK)
    expect(swapped).toBe(1)
    expect(text.replace('纽约大学', 'New York University')).toBe(NYU)
  })
})

describe('transcription with the name check', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const env = { NAME_CHECK_MODEL: 'gpt-4o-transcribe', EXPOSE_TIMINGS: 'false' }
  const post = (app) =>
    request(app).post('/api/process').field('refinementLevel', 'none').attach('audio', AUDIO_SAMPLES.webm, { filename: 'blob', contentType: 'audio/webm' })
  const byModel = (answers) => fakeOpenAI(async ({ model }) => answers[model]())

  it('runs both models on the same audio and puts the spoken name back', async () => {
    const openai = byModel({ 'gpt-transcribe': async () => ({ text: NYU }), 'gpt-4o-transcribe': async () => ({ text: NYU_CHECK }) })
    const { app } = createTestApp({ openai, env })
    const res = await post(app)

    expect(res.status).toBe(200)
    expect(res.body.rawTranscript).toBe(NYU.replace('New York University', '纽约大学'))
    expect(res.body.polishedTranscript).toBe(res.body.rawTranscript)
    const calls = openai.audio.transcriptions.create.mock.calls.map(([params]) => params)
    expect(calls.map((params) => params.model).sort()).toEqual(['gpt-4o-transcribe', 'gpt-transcribe'])
    // gpt-4o-transcribe takes no language list.
    expect(calls.find((params) => params.model === 'gpt-4o-transcribe').languages).toBeUndefined()
    expect(console.info.mock.calls.flat().join(' ')).not.toContain('纽约')
  })

  it('returns the main transcript when the name check fails', async () => {
    const openai = byModel({
      'gpt-transcribe': async () => ({ text: NYU }),
      'gpt-4o-transcribe': async () => {
        throw Object.assign(new Error('boom'), { status: 500 })
      },
    })
    const { app } = createTestApp({ openai, env })
    const res = await post(app)

    expect(res.status).toBe(200)
    expect(res.body.rawTranscript).toBe(NYU)
  })

  it('does not wait long for a slow name check', async () => {
    let signal
    const openai = fakeOpenAI(async ({ model }, options) => {
      if (model === 'gpt-transcribe') return { text: NYU }
      signal = options.signal
      return new Promise(() => {})
    })
    const { app } = createTestApp({ openai, env })
    const started = Date.now()
    const res = await post(app)

    expect(res.status).toBe(200)
    expect(res.body.rawTranscript).toBe(NYU)
    expect(Date.now() - started).toBeLessThan(NAME_CHECK_WAIT_MS + 1_000)
    expect(signal.aborted).toBe(true)
  })

  it('fails as before when the main transcription fails, whatever the name check says', async () => {
    const openai = byModel({
      'gpt-transcribe': async () => {
        throw Object.assign(new Error('boom'), { status: 500 })
      },
      'gpt-4o-transcribe': async () => ({ text: NYU_CHECK }),
    })
    const { app } = createTestApp({ openai, env })
    const res = await post(app)

    expect(res.status).toBe(502)
    expect(res.body.code).toBe('transcription_failed')
  })

  it('makes one request when the name check is off', async () => {
    const { app, openai } = createTestApp({ env: { NAME_CHECK_MODEL: '' } })
    await post(app)

    expect(openai.audio.transcriptions.create).toHaveBeenCalledTimes(1)
  })
})
