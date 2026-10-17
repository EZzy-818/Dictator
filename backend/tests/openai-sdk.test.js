// Runs the real OpenAI SDK against a local stand-in server to check the exact
// requests it sends, without network access or an API key.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import multer from 'multer'
import OpenAI from 'openai'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { TRANSCRIPTION_HINTS } from '../src/services/transcription.js'
import { AUDIO_SAMPLES } from './helpers.js'

let server
let received
let baseURL

beforeAll(async () => {
  const mock = express()
  mock.post('/v1/audio/transcriptions', multer().single('file'), (req, res) => {
    received = { path: req.path, auth: req.headers.authorization, body: { ...req.body }, file: req.file }
    res.json({ text: '我们应该用 PostgreSQL。' })
  })
  mock.post('/v1/responses', express.json(), (req, res) => {
    received.responses = req.body
    res.json({
      id: 'resp_1',
      object: 'response',
      status: 'completed',
      output: [
        {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: '我们应该使用 PostgreSQL。', annotations: [] }],
        },
      ],
    })
  })
  await new Promise((resolve) => {
    server = mock.listen(0, resolve)
  })
  baseURL = `http://127.0.0.1:${server.address().port}/v1`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

function appWithRealSdk() {
  const config = loadConfig({ OPENAI_API_KEY: 'sk-test', TRANSCRIPTION_MODEL: 'gpt-4o-transcribe', REFINEMENT_MODEL: 'gpt-4.1' })
  return createApp(config, { openai: new OpenAI({ apiKey: 'sk-test', baseURL, maxRetries: 0 }) })
}

describe('OpenAI SDK requests', () => {
  it('sends model, language, prompt and the audio file as multipart', async () => {
    const res = await request(appWithRealSdk())
      .post('/api/process')
      .field('language', 'zh')
      .attach('audio', AUDIO_SAMPLES.webm, { filename: 'blob', contentType: 'audio/webm;codecs=opus' })

    expect(res.status).toBe(200)
    expect(res.body.rawTranscript).toBe('我们应该用 PostgreSQL。')
    expect(res.body.polishedTranscript).toBe('我们应该使用 PostgreSQL。')
    expect(res.body.refinementStatus).toBe('success')
    expect(received.responses).toMatchObject({ model: 'gpt-4.1', store: false })
    expect(received.responses.input).toContain('我们应该用 PostgreSQL。')
    expect(received.auth).toBe('Bearer sk-test')
    expect(received.body).toEqual({
      model: 'gpt-4o-transcribe',
      response_format: 'json',
      language: 'zh',
      prompt: TRANSCRIPTION_HINTS.zh,
    })
    expect(received.file.originalname).toBe('recording.webm')
    expect(received.file.mimetype).toBe('audio/webm')
    expect(received.file.buffer.equals(AUDIO_SAMPLES.webm)).toBe(true)
  })

  it('sends no language field in auto mode', async () => {
    await request(appWithRealSdk())
      .post('/api/process')
      .field('language', 'auto')
      .attach('audio', AUDIO_SAMPLES.webm, { filename: 'blob', contentType: 'audio/webm' })

    expect(received.body).toEqual({ model: 'gpt-4o-transcribe', response_format: 'json' })
  })
})
