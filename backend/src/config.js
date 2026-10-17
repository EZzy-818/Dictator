// Reads backend configuration from the environment. Secrets stay server-side.
export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3001,
    openaiApiKey: env.OPENAI_API_KEY || '',
    transcriptionModel: env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    refinementModel: env.REFINEMENT_MODEL || 'gpt-4.1',
    // Comma-separated list of browser origins allowed to call the API.
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
