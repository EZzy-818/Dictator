import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { APIConnectionTimeoutError } from 'openai'
import { TRANSCRIPTION_TIMEOUT_MS } from '../src/services/transcription.js'
import { REFINEMENT_TIMEOUT_MS } from '../src/services/refinement.js'
import { AUDIO_SAMPLES, createTestApp, fakeOpenAI } from './helpers.js'

const timeout = async () => Promise.reject(new APIConnectionTimeoutError())

function postAudio(app) {
  return request(app)
    .post('/api/process')
    .field('language', 'en')
    .attach('audio', AUDIO_SAMPLES.webm, { filename: 'blob', contentType: 'audio/webm' })
}

describe('OpenAI request timeouts', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes a per-request timeout to both API calls', async () => {
    const { app, openai } = createTestApp()
    await postAudio(app)

    expect(openai.audio.transcriptions.create.mock.calls[0][1]).toEqual({ timeout: TRANSCRIPTION_TIMEOUT_MS })
    expect(openai.responses.create.mock.calls[0][1]).toEqual({ timeout: REFINEMENT_TIMEOUT_MS })
  })

  it('returns 504 when transcription times out, without refining', async () => {
    const { app, openai } = createTestApp({ openai: fakeOpenAI(timeout) })
    const res = await postAudio(app)

    expect(res.status).toBe(504)
    expect(res.body.code).toBe('transcription_timeout')
    expect(openai.responses.create).not.toHaveBeenCalled()
  })

  it('keeps the raw transcript when refinement times out in /api/process', async () => {
    const { app } = createTestApp({ openai: fakeOpenAI(undefined, timeout) })
    const res = await postAudio(app)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ rawTranscript: 'Hello world.', polishedTranscript: null, refinementStatus: 'failed' })
  })

  it('returns 504 when /api/refine times out', async () => {
    const { app } = createTestApp({ openai: fakeOpenAI(undefined, timeout) })
    const res = await request(app).post('/api/refine').send({ transcript: 'hello', language: 'en' })

    expect(res.status).toBe(504)
    expect(res.body.code).toBe('refinement_timeout')
  })
})
