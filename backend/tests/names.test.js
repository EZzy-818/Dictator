import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { applySwaps, restoreSpokenNames } from '../src/lib/names.js'
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
    expect(restoreSpokenNames(transcript, check)).toEqual({ text: transcript, swapped: 0, swaps: [] })
  })

  // Numbers, amounts and dates the two models write differently are left as gpt-transcribe wrote
  // them: swapping in the digits drops the symbol or unit beside them and changes the meaning.
  it.each([
    // Percentages, from the model benchmark (zh-30-c, mixed-30-a): the check's "15%" became "15".
    ['今天的会议主要讨论了三件事：第一，下个季度的预算增加百分之十五；第二，招聘计划从五个人调整到七个人。', '今天的会议主要讨论了三件事：第一，下个季度的预算增加15%，第二，招聘计划从五个人调整到七个人。'],
    ['backend 由 Alex 负责，frontend 由小王负责，如果 error rate 超过百分之二就直接 rollback，不要等。', 'backend由Alex负责，frontend由小王负责，如果error rate超过2%就直接rollback，不要等。'],
    // Numbers and amounts.
    ['请把合同发给李娜，金额是两万五千元，记得抄送财务部。', '请把合同发给李娜，金额是25,000元，记得抄送财务部。'],
    ['我们下个月要招两个 senior engineers，one for backend.', '我们下个月要招2个senior engineers，one for backend.'],
    ['The latency is about 八百毫秒 on average, which is way too slow.', 'The latency is about 800毫秒 on average, which is way too slow.'],
    // Currency.
    ['这个 plan 每个月要五美元，我觉得太贵了。', '这个plan每个月要$5，我觉得太贵了。'],
    ['这个 plan 每个月要五十块钱，我觉得太贵了。', '这个plan每个月要50块钱，我觉得太贵了。'],
    // Dates and times.
    ['付款时间是下个月十号，记得抄送财务部。', '付款时间是下个月10号，记得抄送财务部。'],
    ['迁移窗口定在凌晨两点到四点，预计影响不超过十分钟。', '迁移窗口定在凌晨2点到4点，预计影响不超过10分钟。'],
    ["Let's move the launch to 三月十五号, after the review.", "Let's move the launch to 3月15号, after the review."],
    ['我们 Friday 晚上十点开始 deploy，预计 downtime 不超过 fifteen minutes。', '我们Friday晚上10点开始deploy，预计downtime不超过fifteen minutes。'],
  ])('keeps the number in %j', (transcript, check) => {
    expect(restoreSpokenNames(transcript, check)).toEqual({ text: transcript, swapped: 0, swaps: [] })
  })

  it.each([
    // A name next to a number is still restored, and the number is kept as gpt-transcribe wrote it.
    [
      '我明年想去纽约大学读研究生，学费大概是五万美元。',
      '我明年想去New York University读研究生，学费大概是5万美元。',
      '我明年想去New York University读研究生，学费大概是五万美元。',
    ],
    [
      "I'm meeting Zhang老师 at three, and the budget is 百分之十 higher.",
      "I'm meeting 张老师 at three, and the budget is 10% higher.",
      "I'm meeting 张老师 at three, and the budget is 百分之十 higher.",
    ],
    // From the model benchmark (mixed-15-a): an English word gpt-transcribe translated, with no number nearby.
    [
      '我觉得我们应该用 PostgreSQL，因为它处理关系型数据更好，而且团队里大家都比较熟。',
      '我觉得我们应该用PostgreSQL，因为它处理关系型数据更好，而且team里大家都比较熟。',
      '我觉得我们应该用 PostgreSQL，因为它处理关系型数据更好，而且 team 里大家都比较熟。',
    ],
  ])('restores the name but not the number in %j', (transcript, check, expected) => {
    expect(restoreSpokenNames(transcript, check).text).toBe(expected)
  })

  it('keeps the transcript when there is no check', () => {
    expect(restoreSpokenNames(NYU, null)).toEqual({ text: NYU, swapped: 0, swaps: [] })
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

describe('applySwaps', () => {
  const swaps = [{ from: 'New York University', to: '纽约大学' }]

  it('makes the same swap in the refined text', () => {
    expect(applySwaps('I just graduated from New York University with a bachelor degree.', swaps)).toBe('I just graduated from 纽约大学 with a bachelor degree.')
    expect(applySwaps('我觉得我们应该用 PostgreSQL，而且团队里大家都比较熟。', [{ from: '团队', to: 'team' }])).toBe('我觉得我们应该用 PostgreSQL，而且 team 里大家都比较熟。')
  })

  it('gives up when the name is not there exactly once', () => {
    expect(applySwaps('I just graduated with a bachelor degree.', swaps)).toBeNull()
    expect(applySwaps('New York University, yes, New York University.', swaps)).toBeNull()
    // Part of a longer word is not the name.
    expect(applySwaps('Alexander will review it.', [{ from: 'Alex', to: '小王' }])).toBeNull()
  })
})

describe('refinement alongside the name check', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  const NYU_FIXED = NYU.replace('New York University', '纽约大学')
  const post = (app, level = 'light') =>
    request(app).post('/api/process').field('refinementLevel', level).attach('audio', AUDIO_SAMPLES.webm, { filename: 'blob', contentType: 'audio/webm' })
  const transcripts = (main, check) => async ({ model }) => ({ text: model === 'gpt-transcribe' ? main : check })
  // Refines by returning the transcript it was given, unless edit says otherwise.
  const echo = (edit = (text) => text) =>
    async ({ input }) => ({ status: 'completed', output_text: edit(input.match(/<transcript>\n?([\s\S]*?)\n?<\/transcript>/)[1]) })
  const app = (openai, overlap = 'true') => createTestApp({ openai, env: { NAME_CHECK_MODEL: 'gpt-4o-transcribe', NAME_CHECK_OVERLAP: overlap, EXPOSE_TIMINGS: 'false' } }).app

  it('is off by default: refinement waits for the name check and refines the changed transcript', async () => {
    const openai = fakeOpenAI(transcripts(NYU, NYU_CHECK), echo())
    const res = await post(app(openai, ''))

    expect(res.body.rawTranscript).toBe(NYU_FIXED)
    expect(res.body.polishedTranscript).toBe(NYU_FIXED)
    expect(openai.responses.create).toHaveBeenCalledTimes(1)
  })

  it('uses the refined main transcript when the name check changes nothing', async () => {
    const openai = fakeOpenAI(transcripts(NYU, NYU), echo((text) => `${text} (refined)`))
    const res = await post(app(openai))

    expect(res.body.rawTranscript).toBe(NYU)
    expect(res.body.polishedTranscript).toBe(`${NYU} (refined)`)
    expect(openai.responses.create).toHaveBeenCalledTimes(1)
  })

  it('puts the name into the refined text', async () => {
    const openai = fakeOpenAI(transcripts(NYU, NYU_CHECK), echo((text) => text.replace('嗯，你好，', '你好，')))
    const res = await post(app(openai))

    expect(res.body.rawTranscript).toBe(NYU_FIXED)
    expect(res.body.polishedTranscript).toBe(NYU_FIXED.replace('嗯，你好，', '你好，'))
    expect(openai.responses.create).toHaveBeenCalledTimes(1)
  })

  it('refines the changed transcript again when the name cannot be placed', async () => {
    const openai = fakeOpenAI(transcripts(NYU, NYU_CHECK), echo((text) => text.replace('New York University', 'NYU')))
    const res = await post(app(openai))

    expect(res.body.rawTranscript).toBe(NYU_FIXED)
    expect(res.body.polishedTranscript).toBe(NYU_FIXED)
    expect(openai.responses.create).toHaveBeenCalledTimes(2)
  })

  it('keeps the changed raw transcript when refinement fails', async () => {
    const openai = fakeOpenAI(transcripts(NYU, NYU_CHECK), async () => {
      throw Object.assign(new Error('boom'), { status: 500 })
    })
    const res = await post(app(openai))

    expect(res.status).toBe(200)
    expect(res.body.rawTranscript).toBe(NYU_FIXED)
    expect(res.body.polishedTranscript).toBeNull()
    expect(res.body.refinementStatus).toBe('failed')
  })

  it('still waits for the name check at None', async () => {
    const openai = fakeOpenAI(transcripts(NYU, NYU_CHECK))
    const res = await post(app(openai), 'none')

    expect(res.body.rawTranscript).toBe(NYU_FIXED)
    expect(res.body.polishedTranscript).toBe(NYU_FIXED)
    expect(openai.responses.create).not.toHaveBeenCalled()
  })
})

// Regression cases from the name check benchmark (eval/results/name-check-report.md). Each pair is
// gpt-transcribe's text and the check's text of the same synthetic recording, or a close variant.
describe('name check regressions', () => {
  it.each([
    // Numbers: the same value written as numerals in one transcript and digits in the other stays
    // exactly as gpt-transcribe wrote it, units and percent signs included.
    ['如果 error rate 超过百分之二就直接 roll back，不要等。', '如果error rate超过2%就直接roll back，不要等。'],
    ['我们 Thursday，actually no，Friday 晚上十点开始 deploy。', '我们Thursday，actually no，Friday晚上10点开始deploy。'],
    ['会议改到十点半，在三楼的会议室。', '会议改到10:30，在3楼的会议室。'],
    ['The server costs about 两千块 a month, so we should cut it.', 'The server costs about 2000块 a month, so we should cut it.'],
    ['我们订单表等到双十一之后再迁。', '我们订单表等到双11之后再迁。'],
    // Hindi is written in Devanagari, which the check does not compare, so it never changes Hindi.
    ['हम चार लोगों को हायर करेंगे, PostgreSQL use करेंगे।', 'हम 4 लोगों को हायर करेंगे, PostgreSQL use करेंगे।'],
    ['मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।', 'मुझे लगता है कि हमें अगले हफ़्ते मीटिंग करनी चाहिए।'],
    // An English name said in English inside Chinese stays English when the check writes it in Chinese.
    ['backend 由 Alex 负责，frontend 由小王负责。', 'backend由亚历克斯负责，frontend由小王负责。'],
    // A homophone in the same script is not a language swap (刘阳 vs 刘洋).
    ['刘阳会在周五之前把会议纪要发给大家。', '刘洋会在周五之前把会议纪要发给大家。'],
  ])('leaves %j as gpt-transcribe wrote it', (transcript, check) => {
    expect(restoreSpokenNames(transcript, check)).toEqual({ text: transcript, swapped: 0, swaps: [] })
  })

  it.each([
    // Proper names said in Mandarin inside English.
    ['We flew from Shanghai to Beijing last week, but honestly, I liked the hotel near Wutan better.', 'We flew from Shanghai to Beijing last week, but honestly I liked the hotel near 外滩 better.', 'We flew from Shanghai to Beijing last week, but honestly, I liked the hotel near 外滩 better.'],
    ['My friend just started at Tencent, and she says the Weixin team is really busy right now.', 'My friend just started at 腾讯, and she says the 微信 team is really busy right now.', 'My friend just started at 腾讯, and she says the 微信 team is really busy right now.'],
    ['嗯，你好，我的名字叫王宇辰, and I just graduated from New York大学 with a bachelor degree.', '嗯你好，我的名字叫王宇辰,and I just graduated from 纽约大学 with a bachelor degree.', '嗯，你好，我的名字叫王宇辰, and I just graduated from 纽约大学 with a bachelor degree.'],
    // Code-switching: English words gpt-transcribe heard or wrote in Chinese, and the reverse.
    ["Don't push down main branch, 先开PR.", "Don't push 到 main branch，先开 PR。", "Don't push 到 main branch, 先开PR."],
    ['我觉得我们应该用 PostgreSQL，因为它处理关系型数据更好，而且团队里大家都比较熟。', '我觉得我们应该用PostgreSQL，因为它处理关系型数据更好，而且team里大家都比较熟。', '我觉得我们应该用 PostgreSQL，因为它处理关系型数据更好，而且 team 里大家都比较熟。'],
    // A name and a number in one sentence: the name is restored, the number is not touched.
    ['我朋友在 Google 工作，他下个月十号要搬到西雅图去。', '我朋友在Google工作，他下个月10号要搬到Seattle去。', '我朋友在 Google 工作，他下个月十号要搬到 Seattle 去。'],
  ])('restores %j', (transcript, check, expected) => {
    expect(restoreSpokenNames(transcript, check).text).toBe(expected)
  })

  it('reports each swap so it can be repeated in the refined text', () => {
    const { swaps } = restoreSpokenNames('My friend just started at Tencent, and she says the Weixin team is really busy.', 'My friend just started at 腾讯, and she says the 微信 team is really busy.')
    expect(swaps).toEqual([
      { from: 'Tencent', to: '腾讯' },
      { from: 'Weixin', to: '微信' },
    ])
  })
})

describe('second refinement pass alongside the name check', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  const COMPANY = 'My friend just started at Tencent, and she says the Weixin team is really busy right now.'
  const COMPANY_CHECK = 'My friend just started at 腾讯, and she says the 微信 team is really busy right now.'
  const TEAM = '我觉得我们应该用 PostgreSQL，而且团队里大家都比较熟。'
  const TEAM_CHECK = '我觉得我们应该用PostgreSQL，而且team里大家都比较熟。'
  const post = (app, level) =>
    request(app).post('/api/process').field('refinementLevel', level).attach('audio', AUDIO_SAMPLES.webm, { filename: 'blob', contentType: 'audio/webm' })
  const transcripts = (main, check) => async ({ model }) => ({ text: model === 'gpt-transcribe' ? main : check })
  const inputOf = (body) => body.input.match(/<transcript>\n?([\s\S]*?)\n?<\/transcript>/)[1]
  const app = (openai) => createTestApp({ openai, env: { NAME_CHECK_MODEL: 'gpt-4o-transcribe', NAME_CHECK_OVERLAP: 'true', EXPOSE_TIMINGS: 'false' } }).app

  it.each(['light', 'medium'])('places a code-switched word in the refined text at %s', async (level) => {
    const openai = fakeOpenAI(transcripts(TEAM, TEAM_CHECK), async (body) => ({ status: 'completed', output_text: inputOf(body).replace('而且', '并且') }))
    const res = await post(app(openai), level)

    expect(res.body.rawTranscript).toBe('我觉得我们应该用 PostgreSQL，而且 team 里大家都比较熟。')
    expect(res.body.polishedTranscript).toBe('我觉得我们应该用 PostgreSQL，并且 team 里大家都比较熟。')
    expect(openai.responses.create).toHaveBeenCalledTimes(1)
  })

  it('places every swap when there are several', async () => {
    const openai = fakeOpenAI(transcripts(COMPANY, COMPANY_CHECK), async (body) => ({ status: 'completed', output_text: inputOf(body).replace(' right now', '') }))
    const res = await post(app(openai), 'light')

    expect(res.body.polishedTranscript).toBe('My friend just started at 腾讯, and she says the 微信 team is really busy.')
    expect(openai.responses.create).toHaveBeenCalledTimes(1)
  })

  it('refines again when one of several swaps cannot be placed', async () => {
    // The first pass dropped Weixin, so 微信 has nowhere to go: the changed transcript is refined.
    const openai = fakeOpenAI(transcripts(COMPANY, COMPANY_CHECK), async (body) => ({ status: 'completed', output_text: inputOf(body).replace('the Weixin team', 'the team') }))
    const res = await post(app(openai), 'medium')

    expect(res.body.rawTranscript).toBe(COMPANY_CHECK)
    expect(res.body.polishedTranscript).toBe(COMPANY_CHECK)
    expect(openai.responses.create).toHaveBeenCalledTimes(2)
    expect(inputOf(openai.responses.create.mock.calls[1][0])).toBe(COMPANY_CHECK)
  })

  it('refines again when the name appears more than once in the refined text', async () => {
    const openai = fakeOpenAI(transcripts(COMPANY, COMPANY_CHECK), async (body) => ({ status: 'completed', output_text: `${inputOf(body)} Tencent!` }))
    const res = await post(app(openai), 'light')

    expect(res.body.polishedTranscript).toBe(`${COMPANY_CHECK} Tencent!`)
    expect(openai.responses.create).toHaveBeenCalledTimes(2)
  })

  it('refines the changed transcript when the first pass fails', async () => {
    let calls = 0
    const openai = fakeOpenAI(transcripts(COMPANY, COMPANY_CHECK), async (body) => {
      if (calls++ === 0) throw Object.assign(new Error('boom'), { status: 500 })
      return { status: 'completed', output_text: inputOf(body) }
    })
    const res = await post(app(openai), 'light')

    expect(res.body.refinementStatus).toBe('success')
    expect(res.body.polishedTranscript).toBe(COMPANY_CHECK)
  })

  it('reports a refinement failure when the second pass fails too, keeping the changed raw transcript', async () => {
    let calls = 0
    const openai = fakeOpenAI(transcripts(COMPANY, COMPANY_CHECK), async (body) => {
      if (calls++ === 0) return { status: 'completed', output_text: inputOf(body).replace('the Weixin team', 'the team') }
      throw Object.assign(new Error('boom'), { status: 500 })
    })
    const res = await post(app(openai), 'light')

    expect(res.status).toBe(200)
    expect(res.body.rawTranscript).toBe(COMPANY_CHECK)
    expect(res.body.polishedTranscript).toBeNull()
    expect(res.body.refinementStatus).toBe('failed')
  })

  it('never refines twice when the check changes nothing', async () => {
    const openai = fakeOpenAI(transcripts('会议改到十点半。', '会议改到10:30。'), async (body) => ({ status: 'completed', output_text: inputOf(body) }))
    const res = await post(app(openai), 'medium')

    expect(res.body.rawTranscript).toBe('会议改到十点半。')
    expect(res.body.polishedTranscript).toBe('会议改到十点半。')
    expect(openai.responses.create).toHaveBeenCalledTimes(1)
  })
})
