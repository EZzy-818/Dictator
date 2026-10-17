import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { loadConfig } from '../src/config.js'
import { cleanRequestId, createTiming } from '../src/lib/timing.js'
import { AUDIO_SAMPLES, createTestApp, fakeOpenAI } from './helpers.js'

// A clock that only moves when the test says so.
function fakeClock(start = 1000) {
  let time = start
  return { now: () => time, advance: (ms) => (time += ms) }
}

describe('createTiming', () => {
  it('measures each stage and puts the rest of the total in overhead', async () => {
    const clock = fakeClock()
    const timing = createTiming({ now: clock.now })

    clock.advance(40)
    timing.record('receive', timing.elapsed())
    clock.advance(5)
    await timing.measure('transcription', async () => clock.advance(1450))
    await timing.measure('refinement', async () => clock.advance(920))
    clock.advance(3)

    expect(timing.summary()).toEqual({
      requestId: timing.requestId,
      totalMs: 2418,
      receiveMs: 40,
      receiveStatus: 'success',
      transcriptionMs: 1450,
      transcriptionStatus: 'success',
      refinementMs: 920,
      refinementStatus: 'success',
      overheadMs: 8,
    })
  })

  it('reports a skipped stage as 0 ms', () => {
    const timing = createTiming({ now: fakeClock().now })
    timing.skip('refinement')
    expect(timing.summary()).toMatchObject({ refinementMs: 0, refinementStatus: 'skipped' })
  })

  it('records a failed stage with its duration and passes the error on', async () => {
    const clock = fakeClock()
    const timing = createTiming({ now: clock.now })
    const error = new Error('boom')

    await expect(
      timing.measure('transcription', async () => {
        clock.advance(300)
        throw error
      }),
    ).rejects.toBe(error)

    expect(timing.summary()).toMatchObject({
      transcriptionMs: 300,
      transcriptionStatus: 'failed',
      refinementMs: null,
      refinementStatus: 'not_run',
    })
  })

  it('freezes the summary so the response and the log agree', () => {
    const clock = fakeClock()
    const timing = createTiming({ now: clock.now })
    clock.advance(10)
    const first = timing.summary()
    clock.advance(500)
    expect(timing.summary()).toBe(first)
    expect(first.totalMs).toBe(10)
  })

  it('rounds to a tenth of a millisecond', () => {
    const clock = fakeClock()
    const timing = createTiming({ now: clock.now })
    clock.advance(12.3456)
    expect(timing.summary().totalMs).toBe(12.3)
  })

  it('keeps a valid browser request ID and replaces anything else', () => {
    const timing = createTiming()
    const serverId = timing.requestId
    expect(cleanRequestId(serverId)).toBe(serverId)

    timing.setRequestId('<script>')
    expect(timing.requestId).toBe(serverId)
    timing.setRequestId(undefined)
    expect(timing.requestId).toBe(serverId)
    timing.setRequestId('a'.repeat(65))
    expect(timing.requestId).toBe(serverId)

    timing.setRequestId('rec-1234abcd')
    expect(timing.requestId).toBe('rec-1234abcd')
  })
})

describe('timings in /api/process', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function postAudio(app, { refinementLevel, requestId, buffer = AUDIO_SAMPLES.webm } = {}) {
    const req = request(app).post('/api/process')
    if (requestId !== undefined) req.field('requestId', requestId)
    if (refinementLevel !== undefined) req.field('refinementLevel', refinementLevel)
    return req.attach('audio', buffer, { filename: 'blob', contentType: 'audio/webm;codecs=opus' })
  }

  it('returns every stage for a refined recording, matched to the browser request ID', async () => {
    const { app } = createTestApp()
    const res = await postAudio(app, { requestId: 'rec-1234abcd', refinementLevel: 'medium' })

    expect(res.status).toBe(200)
    const { timings } = res.body
    expect(timings).toMatchObject({
      requestId: 'rec-1234abcd',
      receiveStatus: 'success',
      transcriptionStatus: 'success',
      refinementStatus: 'success',
    })
    for (const key of ['totalMs', 'receiveMs', 'transcriptionMs', 'refinementMs', 'overheadMs']) {
      expect(timings[key]).toBeGreaterThanOrEqual(0)
    }
    const parts = timings.receiveMs + timings.transcriptionMs + timings.refinementMs + timings.overheadMs
    expect(parts).toBeCloseTo(timings.totalMs, 0)
  })

  it('reports refinement as skipped at 0 ms for None', async () => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app, { refinementLevel: 'none' })

    expect(res.body.timings).toMatchObject({ refinementMs: 0, refinementStatus: 'skipped', transcriptionStatus: 'success' })
    expect(openai.responses.create).not.toHaveBeenCalled()
  })

  it('measures a failed refinement', async () => {
    const { app } = createTestApp({ openai: fakeOpenAI(undefined, async () => Promise.reject(new Error('boom'))) })
    const res = await postAudio(app, { refinementLevel: 'light' })

    expect(res.body.refinementStatus).toBe('failed')
    expect(res.body.timings).toMatchObject({ refinementStatus: 'failed' })
    expect(res.body.timings.refinementMs).toBeGreaterThanOrEqual(0)
  })

  it('returns timings with a failed transcription', async () => {
    const { app } = createTestApp({ openai: fakeOpenAI(async () => Promise.reject(new Error('down'))) })
    const res = await postAudio(app, { requestId: 'rec-failed-1' })

    expect(res.status).toBe(502)
    expect(res.body).toMatchObject({ code: 'transcription_failed' })
    expect(res.body.timings).toMatchObject({
      requestId: 'rec-failed-1',
      transcriptionStatus: 'failed',
      refinementMs: null,
      refinementStatus: 'not_run',
    })
  })

  it('returns timings when the upload is rejected before any API call', async () => {
    const { app } = createTestApp()
    const res = await request(app).post('/api/process').field('requestId', 'rec-empty-1')

    expect(res.status).toBe(400)
    expect(res.body.timings).toMatchObject({
      requestId: 'rec-empty-1',
      receiveStatus: 'success',
      transcriptionStatus: 'not_run',
      refinementStatus: 'not_run',
    })
  })

  it('leaves timings out when EXPOSE_TIMINGS is false, for success and failure', async () => {
    const { app } = createTestApp({ env: { EXPOSE_TIMINGS: 'false' } })
    expect((await postAudio(app)).body).not.toHaveProperty('timings')
    expect((await request(app).post('/api/process')).body).not.toHaveProperty('timings')
  })

  it('keeps timings out of production responses unless turned on', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).exposeTimings).toBe(false)
    expect(loadConfig({ NODE_ENV: 'production', EXPOSE_TIMINGS: 'true' }).exposeTimings).toBe(true)
    expect(loadConfig({}).exposeTimings).toBe(true)
  })

  it('logs the timings with no transcript text, even when not returned', async () => {
    const log = vi.fn()
    const { app } = createTestApp({
      log,
      env: { EXPOSE_TIMINGS: 'false' },
      openai: fakeOpenAI(async () => ({ text: 'secret words' }), async () => ({ status: 'completed', output_text: 'secret polished' })),
    })
    await postAudio(app, { requestId: 'rec-log-1234' })
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'request' })))

    const event = log.mock.calls.find(([entry]) => entry.event === 'request')[0]
    expect(event.timings).toMatchObject({ requestId: 'rec-log-1234', transcriptionStatus: 'success', refinementStatus: 'success' })
    expect(JSON.stringify(event)).not.toMatch(/secret/)
  })
})
