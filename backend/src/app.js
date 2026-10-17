import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import { ApiError } from './lib/errors.js'
import { isRefinementLevel } from './lib/refinementLevels.js'
import { clientTag, concurrencyLimit, createUsageLimiters } from './lib/limits.js'
import { createTiming } from './lib/timing.js'
import { createProcessRouter } from './routes/process.js'
import { createRefineRouter } from './routes/refine.js'

// One JSON line per event. Never pass audio, transcripts or refined text to it.
function logEvent(event) {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...event }))
}

// Logs who used the API, how and with what result, so abuse is visible without any content.
function requestLog(log) {
  return (req, res, next) => {
    const started = performance.now()
    res.once('close', () => {
      const { refinementLevel } = req.body ?? {}
      log({
        event: 'request',
        method: req.method,
        path: req.originalUrl.split('?')[0],
        // A request cut off before a reply (client gone, upload timeout) has no status.
        status: res.headersSent ? res.statusCode : null,
        code: res.locals.errorCode,
        ms: Math.round(performance.now() - started),
        bytes: Number(req.headers['content-length']) || 0,
        refinementLevel: isRefinementLevel(refinementLevel) ? refinementLevel : undefined,
        client: clientTag(req),
        aborted: res.writableEnded ? undefined : true,
        // Stage durations and the request ID only (see lib/timing.js).
        timings: res.locals.timing?.summary(),
      })
    })
    next()
  }
}

/**
 * openai: optional client override (used by tests). Otherwise one is created from
 * config on first use, so the server can still start without a key.
 * createStore: optional shared store factory for the usage counters (see server.js).
 * log: where usage events go; JSON lines on stdout by default.
 */
export function createApp(config, { openai, createStore, log = logEvent } = {}) {
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

  const { limits } = config
  const processLimiters = createUsageLimiters({
    name: 'process',
    noun: 'recordings',
    limits: { perMinute: limits.processPerMinute, perDay: limits.processPerDay, globalPerDay: limits.processGlobalPerDay },
    createStore,
    log,
  })
  const refineLimiters = createUsageLimiters({
    name: 'refine',
    noun: 'refinement requests',
    limits: { perMinute: limits.refinePerMinute, perDay: limits.refinePerDay, globalPerDay: limits.refineGlobalPerDay },
    createStore,
    log,
  })

  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)
  app.use(cors({ origin: config.corsOrigins }))
  const apiRoutes = ['/api/process', '/api/refine']
  // First, so the clock starts as soon as the request's headers arrive.
  app.use('/api/process', (req, res, next) => {
    res.locals.timing = createTiming()
    next()
  })
  app.use(apiRoutes, requestLog(log))
  app.use(apiRoutes, concurrencyLimit({ maxTotal: limits.maxConcurrent, maxPerClient: limits.maxConcurrentPerClient, log }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      openaiConfigured: Boolean(config.openaiApiKey),
      // Which models are live, so a deployment's TRANSCRIPTION_MODEL override can be checked from outside.
      transcriptionModel: config.transcriptionModel,
      nameCheckModel: config.nameCheckModel || null,
      refinementModel: config.refinementModel,
    })
  })

  app.use('/api', createProcessRouter({ config, getOpenAIClient, usageLimiters: processLimiters }))
  app.use('/api', createRefineRouter({ config, getOpenAIClient, usageLimiters: refineLimiters }))

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found', code: 'not_found' })
  })

  // Express recognizes error handlers by their four parameters.
  app.use((err, req, res, next) => {
    // Failed requests are timed too, so the latency panel can show where they stopped.
    const timings = config.exposeTimings && res.locals.timing ? { timings: res.locals.timing.summary() } : {}
    if (err instanceof ApiError) {
      res.locals.errorCode = err.code
      return res.status(err.status).json({ error: err.message, code: err.code, ...timings })
    }
    if (err?.type === 'entity.too.large') {
      res.locals.errorCode = 'body_too_large'
      return res.status(413).json({ error: 'The request is too large.', code: 'body_too_large', ...timings })
    }
    if (err?.type === 'entity.parse.failed') {
      res.locals.errorCode = 'invalid_json'
      return res.status(400).json({ error: 'The request body is not valid JSON.', code: 'invalid_json', ...timings })
    }
    // The client is gone (for example an upload cut off by the timeout); there is no one to answer.
    if (req.destroyed) return
    console.error('Unexpected error:', err?.name ?? 'Error')
    res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'internal_error', ...timings })
  })

  return app
}
