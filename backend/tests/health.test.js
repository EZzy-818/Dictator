import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'

const SECRET = 'sk-test-secret-value'

describe('GET /api/health', () => {
  it('returns 200 and reports whether OpenAI is configured', async () => {
    const app = createApp(loadConfig({ OPENAI_API_KEY: SECRET }))
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', openaiConfigured: true })
  })

  it('never includes the API key in the response', async () => {
    const app = createApp(loadConfig({ OPENAI_API_KEY: SECRET }))
    const res = await request(app).get('/api/health')

    expect(res.text).not.toContain(SECRET)
  })

  it('reports openaiConfigured false when the key is missing', async () => {
    const app = createApp(loadConfig({}))
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.openaiConfigured).toBe(false)
  })
})

describe('CORS', () => {
  const app = createApp(loadConfig({ CORS_ORIGINS: 'http://localhost:5173' }))

  it('allows the configured frontend origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('does not allow other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://evil.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('config', () => {
  it('uses roadmap defaults', () => {
    const config = loadConfig({})
    expect(config.port).toBe(3001)
    expect(config.transcriptionModel).toBe('gpt-transcribe')
    expect(config.refinementModel).toBe('gpt-4.1')
  })

  it('reads model names from the environment', () => {
    const config = loadConfig({ TRANSCRIPTION_MODEL: 'a', REFINEMENT_MODEL: 'b', PORT: '4000' })
    expect(config).toMatchObject({ transcriptionModel: 'a', refinementModel: 'b', port: 4000 })
  })
})

describe('unknown routes', () => {
  it('returns 404 JSON for unknown API routes', async () => {
    const res = await request(createApp(loadConfig({}))).get('/api/nope')
    expect(res.status).toBe(404)
  })
})
