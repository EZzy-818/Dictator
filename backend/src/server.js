import dotenv from 'dotenv'
import { ErrorReply, createClient } from 'redis'
import { RedisStore } from 'rate-limit-redis'
import { configProblems, loadConfig } from './config.js'
import { ApiError } from './lib/errors.js'
import { createApp } from './app.js'

dotenv.config({ quiet: true })

const config = loadConfig()

const problems = configProblems(config)
if (problems.length) {
  for (const problem of problems) console.error(`Configuration error: ${problem}`)
  process.exit(1)
}

if (!config.openaiApiKey) {
  console.warn('OPENAI_API_KEY is not set. Transcription and refinement will be unavailable.')
}

// Usage counters go to Redis when REDIS_URL is set, so they survive restarts and are shared
// by every instance. Without it they are kept in memory and reset when the server restarts.
let createStore
if (config.redisUrl) {
  let connected = false
  const redis = createClient({
    url: config.redisUrl,
    // Retry after a dropped connection, but fail start-up if the first connection fails.
    socket: { reconnectStrategy: (retries) => (connected ? Math.min(retries * 200, 3000) : new Error('Redis connection failed')) },
  })
  // Logged without details: the error can include the connection URL and its password.
  redis.on('error', (err) => console.error('Redis error:', err?.code ?? err?.name ?? 'Error'))
  try {
    await redis.connect()
    connected = true
  } catch (err) {
    console.error('Configuration error: could not connect to REDIS_URL:', err?.code ?? err?.name ?? 'Error')
    process.exit(1)
  }
  // Without the counters the limits cannot be enforced, so requests are refused until Redis is back.
  // Redis replies pass through: the store reloads its script when a restarted Redis answers NOSCRIPT.
  const sendCommand = (...args) =>
    redis.sendCommand(args).catch((err) => {
      if (err instanceof ErrorReply) throw err
      throw new ApiError(503, 'limits_unavailable', 'Dictator is temporarily unavailable. Please try again in a minute.')
    })
  createStore = (prefix) => new RedisStore({ sendCommand, prefix })
} else if (config.production) {
  console.warn('REDIS_URL is not set. Usage limits are kept in memory and reset when the server restarts.')
}

const server = createApp(config, { createStore }).listen(config.port, () => {
  console.log(`Dictator backend listening on port ${config.port} (${config.production ? 'production' : 'development'}, usage limits in ${createStore ? 'Redis' : 'memory'})`)
})

// Time allowed to receive a whole request, so slow uploads cannot hold a request slot for long.
// 10 MB in 60 s needs about 1.4 Mbit/s; a 2-minute recording is usually under 2 MB. Node checks
// this every 30 seconds, so a request is cut off 60 to 90 seconds after it starts. Processing time
// after the upload is bounded by the OpenAI timeouts in services/.
server.requestTimeout = 60_000
