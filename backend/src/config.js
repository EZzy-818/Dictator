const DEV_FRONTEND_ORIGIN = 'http://localhost:5173'

// Usage limits: [environment variable, default]. See docs/deployment.md for the reasoning.
export const LIMIT_SETTINGS = {
  processPerMinute: ['PROCESS_LIMIT_PER_MINUTE', 5],
  processPerDay: ['PROCESS_LIMIT_PER_DAY', 30],
  processGlobalPerDay: ['PROCESS_LIMIT_GLOBAL_PER_DAY', 100],
  refinePerMinute: ['REFINE_LIMIT_PER_MINUTE', 10],
  refinePerDay: ['REFINE_LIMIT_PER_DAY', 60],
  refineGlobalPerDay: ['REFINE_LIMIT_GLOBAL_PER_DAY', 100],
  maxConcurrent: ['MAX_CONCURRENT_REQUESTS', 4],
  maxConcurrentPerClient: ['MAX_CONCURRENT_PER_CLIENT', 2],
}

// A positive whole number, or NaN if the variable is set to anything else.
function positiveInt(value, fallback) {
  if (value === undefined || value.trim() === '') return fallback
  return /^\d+$/.test(value.trim()) && Number(value) > 0 ? Number(value) : NaN
}

// Express "trust proxy": how many proxies in front of the server to trust for the client address.
function trustProxy(value) {
  if (value === undefined || value.trim() === '') return false
  if (/^\d+$/.test(value.trim())) return Number(value)
  if (value === 'true' || value === 'false') return value === 'true'
  return value
}

// Reads backend configuration from the environment. Secrets stay server-side.
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  return {
    production,
    port: Number(env.PORT) || 3001,
    openaiApiKey: env.OPENAI_API_KEY || '',
    transcriptionModel: env.TRANSCRIPTION_MODEL || 'gpt-transcribe',
    refinementModel: env.REFINEMENT_MODEL || 'gpt-4.1',
    limits: Object.fromEntries(
      Object.entries(LIMIT_SETTINGS).map(([key, [name, fallback]]) => [key, positiveInt(env[name], fallback)]),
    ),
    trustProxy: trustProxy(env.TRUST_PROXY),
    // Optional shared store for the usage counters. Without it they live in memory.
    redisUrl: env.REDIS_URL || '',
    // Comma-separated list of browser origins allowed to call the API. The local
    // frontend is the default only in development; production must set it.
    corsOrigins: (env.CORS_ORIGINS ?? (production ? '' : DEV_FRONTEND_ORIGIN))
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  }
}

function isLocalhost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

// Problems that would make the server misbehave. The server refuses to start on any of them.
export function configProblems(config) {
  const problems = []
  if (config.production && !config.openaiApiKey) {
    problems.push('OPENAI_API_KEY is not set.')
  }
  if (config.production && config.corsOrigins.length === 0) {
    problems.push('CORS_ORIGINS is not set. Set it to the frontend URL, for example https://dictator.vercel.app.')
  }
  for (const [key, [name]] of Object.entries(LIMIT_SETTINGS)) {
    if (Number.isNaN(config.limits[key])) problems.push(`${name} must be a positive whole number.`)
  }
  for (const origin of config.corsOrigins) {
    let url
    try {
      url = new URL(origin)
    } catch {
      problems.push(`CORS_ORIGINS entry "${origin}" is not a URL.`)
      continue
    }
    if (url.origin !== origin) {
      problems.push(`CORS_ORIGINS entry "${origin}" must be an origin only (scheme, host and optional port, no path), for example ${url.origin}.`)
    } else if (config.production && url.protocol !== 'https:' && !isLocalhost(url.hostname)) {
      problems.push(`CORS_ORIGINS entry "${origin}" must use https in production.`)
    }
  }
  return problems
}

// For local scripts that run many requests in a row with the developer's own key.
export function withoutUsageLimits(config) {
  const limits = Object.fromEntries(Object.keys(LIMIT_SETTINGS).map((key) => [key, 1_000_000]))
  return { ...config, limits }
}
