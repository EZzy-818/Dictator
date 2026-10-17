import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { audioDurationSeconds, webmDurationSeconds } from '../src/lib/duration.js'
import { formatWait } from '../src/lib/limits.js'
import { AUDIO_SAMPLES, FIXTURES, createTestApp, fakeOpenAI } from './helpers.js'

const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name))

// The test app trusts one proxy, so each X-Forwarded-For value acts as a separate visitor.
function postAudio(app, { client = '203.0.113.1', buffer = AUDIO_SAMPLES.webm, language = 'en' } = {}) {
  return request(app)
    .post('/api/process')
    .set('X-Forwarded-For', client)
    .field('language', language)
    .attach('audio', buffer, { filename: 'blob', contentType: 'audio/webm;codecs=opus' })
}

function postRefine(app, { client = '203.0.113.1', transcript = 'hello world', language = 'en' } = {}) {
  return request(app).post('/api/refine').set('X-Forwarded-For', client).send({ transcript, language })
}

function limitedApp(env, options) {
  return createTestApp({ env: { TRUST_PROXY: '1', ...env }, ...options })
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recording duration', () => {
  it('reads WebM recordings without a duration header from their block timestamps', () => {
    expect(webmDurationSeconds(AUDIO_SAMPLES.webm)).toBeCloseTo(2.94, 1)
    expect(webmDurationSeconds(fixture('silence-130s.webm'))).toBeCloseTo(130, 0)
  })

  it('reads a cut-off WebM recording up to where it ends', () => {
    const half = AUDIO_SAMPLES.webm.subarray(0, AUDIO_SAMPLES.webm.length / 2)
    expect(webmDurationSeconds(half)).toBeGreaterThan(0.5)
    expect(webmDurationSeconds(half)).toBeLessThan(2.5)
  })

  it('reads MP4 and Ogg recordings', async () => {
    expect(await audioDurationSeconds(AUDIO_SAMPLES.mp4, { mimeType: 'audio/mp4', extension: 'mp4' })).toBeCloseTo(2.96, 1)
    expect(await audioDurationSeconds(fixture('tone-1s.ogg'), { mimeType: 'audio/ogg', extension: 'ogg' })).toBeCloseTo(1, 1)
  })

  it('returns null for data that only looks like audio', async () => {
    const fake = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 1)])
    expect(webmDurationSeconds(fake)).toBeNull()
    const fakeMp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(64, 1)])
    expect(await audioDurationSeconds(fakeMp4, { mimeType: 'audio/mp4', extension: 'mp4' })).toBeNull()
  })
})

describe('upload validation', () => {
  it('rejects recordings over 2 minutes without calling OpenAI', async () => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app, { buffer: fixture('silence-130s.webm') })

    expect(res.status).toBe(413)
    expect(res.body.code).toBe('recording_too_long')
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled()
  })

  it('rejects audio whose length cannot be read', async () => {
    const { app, openai } = createTestApp()
    const fake = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 1)])
    const res = await postAudio(app, { buffer: fake })

    expect(res.status).toBe(415)
    expect(res.body.code).toBe('unreadable_audio')
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled()
  })

  it('rejects oversized form fields', async () => {
    const { app } = createTestApp()
    const res = await postAudio(app, { language: 'x'.repeat(2000) })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('invalid_upload')
  })

  it('rejects oversized JSON bodies with 413', async () => {
    const { app } = createTestApp()
    const res = await postRefine(app, { transcript: 'a'.repeat(200_000) })

    expect(res.status).toBe(413)
    expect(res.body.code).toBe('body_too_large')
  })
})

describe('usage limits', () => {
  it('limits recordings per visitor per minute, with a wait time', async () => {
    const { app, openai } = limitedApp({ PROCESS_LIMIT_PER_MINUTE: '2' })
    expect((await postAudio(app)).status).toBe(200)
    expect((await postAudio(app)).status).toBe(200)
    const res = await postAudio(app)

    expect(res.status).toBe(429)
    expect(res.body.code).toBe('rate_limited')
    expect(res.body.error).toMatch(/^Too many recordings in a short time\. Please wait \d+ seconds and try again\.$/)
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    expect(openai.audio.transcriptions.create).toHaveBeenCalledTimes(2)
  })

  it('counts each visitor separately', async () => {
    const { app } = limitedApp({ PROCESS_LIMIT_PER_MINUTE: '1' })
    expect((await postAudio(app, { client: '203.0.113.1' })).status).toBe(200)
    expect((await postAudio(app, { client: '203.0.113.1' })).status).toBe(429)
    expect((await postAudio(app, { client: '198.51.100.7' })).status).toBe(200)
  })

  it('groups IPv6 visitors by /56 subnet', async () => {
    const { app } = limitedApp({ PROCESS_LIMIT_PER_MINUTE: '1' })
    expect((await postAudio(app, { client: '2001:db8:0:1::1' })).status).toBe(200)
    expect((await postAudio(app, { client: '2001:db8:0:2::1' })).status).toBe(429)
  })

  it('does not count requests rejected by validation', async () => {
    const { app } = limitedApp({ PROCESS_LIMIT_PER_MINUTE: '1' })
    for (let i = 0; i < 3; i++) {
      expect((await postAudio(app, { language: 'fr' })).status).toBe(400)
      expect((await postAudio(app, { buffer: fixture('silence-130s.webm') })).status).toBe(413)
    }
    expect((await postAudio(app)).status).toBe(200)
  })

  it('counts requests that reached OpenAI even when they failed', async () => {
    const failing = fakeOpenAI(async () => Promise.reject(Object.assign(new Error('boom'), { status: 500 })))
    const { app } = limitedApp({ PROCESS_LIMIT_PER_MINUTE: '1' }, { openai: failing })
    expect((await postAudio(app)).status).toBe(502)
    expect((await postAudio(app)).status).toBe(429)
  })

  it("limits recordings per visitor per day and says how long to wait", async () => {
    const { app } = limitedApp({ PROCESS_LIMIT_PER_DAY: '2' })
    await postAudio(app)
    await postAudio(app)
    const res = await postAudio(app)

    expect(res.status).toBe(429)
    expect(res.body.code).toBe('rate_limited')
    expect(res.body.error).toBe("You have reached today's limit of 2 recordings. Please try again in about 24 hours.")
  })

  it('stops all recordings once the daily budget is used, whoever sends them', async () => {
    const { app, openai } = limitedApp({ PROCESS_LIMIT_GLOBAL_PER_DAY: '2' })
    expect((await postAudio(app, { client: '203.0.113.1' })).status).toBe(200)
    expect((await postAudio(app, { client: '203.0.113.2' })).status).toBe(200)
    const res = await postAudio(app, { client: '203.0.113.3' })

    expect(res.status).toBe(429)
    expect(res.body.code).toBe('daily_limit_reached')
    expect(res.body.error).toMatch(/^Dictator has reached its usage limit for today\. Please try again in about \d+ hours\.$/)
    expect(openai.audio.transcriptions.create).toHaveBeenCalledTimes(2)
  })

  it('limits refinement separately from recordings', async () => {
    const { app } = limitedApp({ REFINE_LIMIT_PER_MINUTE: '1', REFINE_LIMIT_GLOBAL_PER_DAY: '5' })
    expect((await postRefine(app)).status).toBe(200)
    const res = await postRefine(app)
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/^Too many refinement requests in a short time\./)
    expect((await postAudio(app)).status).toBe(200)
  })

  it('does not count invalid refinement requests', async () => {
    const { app } = limitedApp({ REFINE_LIMIT_PER_MINUTE: '1' })
    expect((await postRefine(app, { transcript: '' })).status).toBe(400)
    expect((await postRefine(app, { language: 'de' })).status).toBe(400)
    expect((await postRefine(app)).status).toBe(200)
  })

  it('formats wait times for people', () => {
    expect(formatWait(0.2)).toBe('1 seconds')
    expect(formatWait(42.1)).toBe('43 seconds')
    expect(formatWait(61)).toBe('2 minutes')
    expect(formatWait(3600)).toBe('about 1 hour')
    expect(formatWait(5 * 3600 + 1)).toBe('about 6 hours')
  })
})

describe('concurrency limits', () => {
  // Transcription waits until release() is called, so requests stay in progress.
  function slowOpenAI() {
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const openai = fakeOpenAI(async () => {
      await gate
      return { text: 'Hello world.' }
    })
    return { openai, release }
  }

  const waitForCalls = (mock, n) => vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(n))

  it('lets each visitor run only a set number of requests at once', async () => {
    const { openai, release } = slowOpenAI()
    const { app } = limitedApp({ MAX_CONCURRENT_PER_CLIENT: '1' }, { openai })
    const first = postAudio(app).then((res) => res)
    await waitForCalls(openai.audio.transcriptions.create, 1)

    const second = await postAudio(app)
    expect(second.status).toBe(429)
    expect(second.body.code).toBe('too_many_concurrent')
    expect((await postRefine(app)).status).toBe(429)

    release()
    expect((await first).status).toBe(200)
    expect((await postAudio(app)).status).toBe(200)
  })

  it('returns 503 with Retry-After when the server is at capacity', async () => {
    const { openai, release } = slowOpenAI()
    const { app } = limitedApp({ MAX_CONCURRENT_REQUESTS: '2' }, { openai })
    const running = [postAudio(app, { client: '203.0.113.1' }).then((r) => r), postAudio(app, { client: '203.0.113.2' }).then((r) => r)]
    await waitForCalls(openai.audio.transcriptions.create, 2)

    const res = await postAudio(app, { client: '203.0.113.3' })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('server_busy')
    expect(res.headers['retry-after']).toBe('10')

    release()
    expect((await Promise.all(running)).map((r) => r.status)).toEqual([200, 200])
    expect((await postAudio(app, { client: '203.0.113.3' })).status).toBe(200)
  })
})

// Needs a Redis server: REDIS_TEST_URL=redis://localhost:6379 npm test
describe.skipIf(!process.env.REDIS_TEST_URL)('shared Redis store', () => {
  it('keeps counts in Redis, so a new server process sees earlier usage', async () => {
    const { createClient } = await import('redis')
    const { RedisStore } = await import('rate-limit-redis')
    const redis = createClient({ url: process.env.REDIS_TEST_URL })
    await redis.connect()
    const run = `test-${Date.now()}`
    const createStore = (prefix) => new RedisStore({ sendCommand: (...args) => redis.sendCommand(args), prefix: `${run}:${prefix}` })
    try {
      const env = { PROCESS_LIMIT_PER_MINUTE: '2' }
      const first = limitedApp(env, { createStore }).app
      expect((await postAudio(first)).status).toBe(200)
      // A second app stands in for a restarted server or a second instance.
      const second = limitedApp(env, { createStore }).app
      expect((await postAudio(second)).status).toBe(200)
      const res = await postAudio(second)
      expect(res.status).toBe(429)
      expect(res.body.code).toBe('rate_limited')
      expect(Number(await redis.get(`${run}:dictator:process-minute:203.0.113.1`))).toBe(3)
    } finally {
      const keys = await redis.keys(`${run}:*`)
      if (keys.length) await redis.del(keys)
      await redis.quit()
    }
  })
})

describe('usage logging', () => {
  it('logs each API request without content or addresses', async () => {
    const log = vi.fn()
    const transcript = '我们明天下午三点开会'
    const polished = '我们明天下午三点开会。'
    const openai = fakeOpenAI(
      async () => ({ text: transcript }),
      async () => ({ status: 'completed', output_text: polished }),
    )
    const { app } = limitedApp({}, { log, openai })
    await postAudio(app, { client: '203.0.113.9', language: 'zh' })
    await postRefine(app, { client: '203.0.113.9', transcript, language: 'zh' })
    await request(app).get('/api/health')

    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(2))
    const [processEvent, refineEvent] = log.mock.calls.map(([event]) => event)
    expect(processEvent).toMatchObject({ event: 'request', method: 'POST', path: '/api/process', status: 200, language: 'zh' })
    expect(processEvent.bytes).toBeGreaterThan(AUDIO_SAMPLES.webm.length)
    expect(processEvent.ms).toBeGreaterThanOrEqual(0)
    expect(processEvent.client).toMatch(/^[0-9a-f]{12}$/)
    expect(refineEvent).toMatchObject({ path: '/api/refine', status: 200, client: processEvent.client })

    const logged = JSON.stringify(log.mock.calls)
    expect(logged).not.toContain('我们')
    expect(logged).not.toContain('203.0.113.9')
  })

  it('logs limit events and error codes', async () => {
    const log = vi.fn()
    const { app } = limitedApp({ PROCESS_LIMIT_PER_MINUTE: '1' }, { log })
    await postAudio(app)
    await postAudio(app)

    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(3))
    const events = log.mock.calls.map(([event]) => event)
    expect(events).toContainEqual(expect.objectContaining({ event: 'limit', limit: 'process-minute' }))
    expect(events).toContainEqual(expect.objectContaining({ event: 'request', status: 429, code: 'rate_limited' }))
  })

  it('does not log an unsupported language value', async () => {
    const log = vi.fn()
    const { app } = limitedApp({}, { log })
    await postRefine(app, { language: 'secret words' })

    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1))
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret')
  })
})
