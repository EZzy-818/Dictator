import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import { ApiError } from './lib/errors.js'
import { createProcessRouter } from './routes/process.js'
import { createRefineRouter } from './routes/refine.js'

/**
 * openai: optional client override (used by tests). Otherwise one is created from
 * config on first use, so the server can still start without a key.
 */
export function createApp(config, { openai } = {}) {
  const app = express()
  let client = openai

  function getOpenAIClient() {
    if (client) return client
    if (!config.openaiApiKey) {
      throw new ApiError(503, 'service_unavailable', 'The speech service is not configured on the server.')
    }
    // Per-request timeouts are set by each service.
    client = new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 1 })
    return client
  }

  app.disable('x-powered-by')
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      openaiConfigured: Boolean(config.openaiApiKey),
    })
  })

  app.use('/api', createProcessRouter({ config, getOpenAIClient }))
  app.use('/api', createRefineRouter({ config, getOpenAIClient }))

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found', code: 'not_found' })
  })

  // Express recognizes error handlers by their four parameters.
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: err.message, code: err.code })
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body is not valid JSON.', code: 'invalid_json' })
    }
    console.error('Unexpected error:', err?.name ?? 'Error')
    res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'internal_error' })
  })

  return app
}
