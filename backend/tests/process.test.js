import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { TRANSCRIPTION_HINTS } from '../src/services/transcription.js'
import { AUDIO_SAMPLES, createTestApp, fakeOpenAI } from './helpers.js'

function postAudio(app, { buffer = AUDIO_SAMPLES.webm, contentType = 'audio/webm;codecs=opus', language } = {}) {
  const req = request(app).post('/api/process')
  if (language !== undefined) req.field('language', language)
  return req.attach('audio', buffer, { filename: 'blob', contentType })
}

describe('POST /api/process', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the documented response shape', async () => {
    const { app } = createTestApp()
    const res = await postAudio(app, { language: 'en' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      rawTranscript: 'Hello world.',
      polishedTranscript: 'Hello, world.',
      selectedLanguage: 'en',
      transcriptionStatus: 'success',
      refinementStatus: 'success',
    })
  })

  it('sends English with the English hint and the configured model', async () => {
    const { app, openai } = createTestApp({ env: { TRANSCRIPTION_MODEL: 'gpt-4o-transcribe' } })
    await postAudio(app, { language: 'en' })

    const params = openai.audio.transcriptions.create.mock.calls[0][0]
    expect(params).toMatchObject({
      model: 'gpt-4o-transcribe',
      language: 'en',
      prompt: TRANSCRIPTION_HINTS.en,
      response_format: 'json',
    })
    expect(params.file.name).toBe('recording.webm')
    expect(params.file.type).toBe('audio/webm')
  })

  it('sends Chinese with the Chinese hint', async () => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app, { language: 'zh' })

    const params = openai.audio.transcriptions.create.mock.calls[0][0]
    expect(params.language).toBe('zh')
    expect(params.prompt).toBe(TRANSCRIPTION_HINTS.zh)
    expect(res.body.selectedLanguage).toBe('zh')
  })

  it('omits language and prompt in auto mode', async () => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app, { language: 'auto' })

    const params = openai.audio.transcriptions.create.mock.calls[0][0]
    expect(params).not.toHaveProperty('language')
    expect(params).not.toHaveProperty('prompt')
    expect(res.body.selectedLanguage).toBe('auto')
  })

  it('defaults to auto when no language is sent', async () => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app)

    expect(res.status).toBe(200)
    expect(res.body.selectedLanguage).toBe('auto')
    expect(openai.audio.transcriptions.create.mock.calls[0][0]).not.toHaveProperty('language')
  })

  it.each(['fr', 'EN', 'english', 'zh-CN', ' auto'])('rejects unsupported language %j', async (language) => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app, { language })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('invalid_language')
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled()
  })

  it('returns the transcript exactly as the API produced it', async () => {
    const text = ' 嗯，我觉得我们应该用 MongoDB，不对，还是 PostgreSQL 比较好。 '
    const { app } = createTestApp({ openai: fakeOpenAI(async () => ({ text })) })
    const res = await postAudio(app, { language: 'zh' })

    expect(res.body.rawTranscript).toBe(text)
  })

  it('accepts MP4 audio from Safari and keeps its real format', async () => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app, { buffer: AUDIO_SAMPLES.mp4, contentType: 'audio/mp4' })

    expect(res.status).toBe(200)
    const { file } = openai.audio.transcriptions.create.mock.calls[0][0]
    expect(file.name).toBe('recording.mp4')
    expect(file.type).toBe('audio/mp4')
  })

  it('rejects a request without audio', async () => {
    const { app } = createTestApp()
    const res = await request(app).post('/api/process').field('language', 'en')

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('missing_audio')
  })

  it('rejects an empty file', async () => {
    const { app } = createTestApp()
    const res = await postAudio(app, { buffer: Buffer.alloc(0) })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('empty_audio')
  })

  it('rejects files over 10 MB', async () => {
    const { app, openai } = createTestApp()
    const big = Buffer.concat([AUDIO_SAMPLES.webm, Buffer.alloc(10 * 1024 * 1024)])
    const res = await postAudio(app, { buffer: big })

    expect(res.status).toBe(413)
    expect(res.body.code).toBe('file_too_large')
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled()
  })

  it('rejects unsupported content types', async () => {
    const { app } = createTestApp()
    const res = await postAudio(app, { buffer: Buffer.from('hello'), contentType: 'text/plain' })

    expect(res.status).toBe(415)
    expect(res.body.code).toBe('unsupported_audio')
  })

  it('rejects files whose bytes do not match the declared format', async () => {
    const { app, openai } = createTestApp()
    const res = await postAudio(app, { buffer: AUDIO_SAMPLES.mp4, contentType: 'audio/webm' })

    expect(res.status).toBe(415)
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled()
  })

  it('reports no speech instead of inventing text', async () => {
    for (const text of ['', '   \n']) {
      const { app } = createTestApp({ openai: fakeOpenAI(async () => ({ text })) })
      const res = await postAudio(app)

      expect(res.status).toBe(422)
      expect(res.body.code).toBe('no_speech')
      expect(res.body).not.toHaveProperty('rawTranscript')
    }
  })

  it('returns a safe error when the transcription API fails', async () => {
    const failure = Object.assign(new Error('Incorrect API key provided: sk-secret-123'), { status: 401 })
    const { app } = createTestApp({ openai: fakeOpenAI(async () => Promise.reject(failure)) })
    const res = await postAudio(app)

    expect(res.status).toBe(502)
    expect(res.body.code).toBe('transcription_failed')
    expect(res.text).not.toContain('sk-secret')
  })

  it('treats a malformed API response as a failure', async () => {
    const { app } = createTestApp({ openai: fakeOpenAI(async () => ({})) })
    const res = await postAudio(app)

    expect(res.status).toBe(502)
    expect(res.body.code).toBe('transcription_failed')
  })

  it('refines the raw transcript with the configured model and selected language', async () => {
    const { app, openai } = createTestApp({ env: { REFINEMENT_MODEL: 'gpt-4.1' } })
    await postAudio(app, { language: 'zh' })

    const params = openai.responses.create.mock.calls[0][0]
    expect(params.model).toBe('gpt-4.1')
    expect(params.input).toBe('<transcript>\nHello world.\n</transcript>')
    expect(params.instructions).toContain('Mandarin')
  })

  it('keeps the raw transcript when refinement fails', async () => {
    const { app } = createTestApp({
      openai: fakeOpenAI(undefined, async () => Promise.reject(new Error('boom'))),
    })
    const res = await postAudio(app, { language: 'en' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      rawTranscript: 'Hello world.',
      polishedTranscript: null,
      selectedLanguage: 'en',
      transcriptionStatus: 'success',
      refinementStatus: 'failed',
    })
  })

  it('does not call refinement when transcription fails or finds no speech', async () => {
    for (const transcribe of [async () => Promise.reject(new Error('down')), async () => ({ text: ' ' })]) {
      const { app, openai } = createTestApp({ openai: fakeOpenAI(transcribe) })
      const res = await postAudio(app)

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(openai.responses.create).not.toHaveBeenCalled()
    }
  })

  it('returns 503 when no API key is configured', async () => {
    const app = createApp(loadConfig({}))
    const res = await postAudio(app)

    expect(res.status).toBe(503)
    expect(res.body.code).toBe('service_unavailable')
  })

  it('rejects extra files', async () => {
    const { app } = createTestApp()
    const res = await request(app)
      .post('/api/process')
      .attach('audio', AUDIO_SAMPLES.webm, { filename: 'a', contentType: 'audio/webm' })
      .attach('audio', AUDIO_SAMPLES.webm, { filename: 'b', contentType: 'audio/webm' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('invalid_upload')
  })

  it('does not log transcripts', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { app } = createTestApp({ openai: fakeOpenAI(async () => ({ text: 'private words' })) })
    await postAudio(app)

    const logged = [...log.mock.calls, ...console.error.mock.calls].flat().join(' ')
    expect(logged).not.toContain('private words')
  })
})
