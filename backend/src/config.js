const DEV_FRONTEND_ORIGIN = 'http://localhost:5173'

// Reads backend configuration from the environment. Secrets stay server-side.
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  return {
    production,
    port: Number(env.PORT) || 3001,
    openaiApiKey: env.OPENAI_API_KEY || '',
    transcriptionModel: env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    refinementModel: env.REFINEMENT_MODEL || 'gpt-4.1',
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
