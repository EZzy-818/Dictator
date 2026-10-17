import dotenv from 'dotenv'
import { configProblems, loadConfig } from './config.js'
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

const server = createApp(config).listen(config.port, () => {
  console.log(`Dictator backend listening on port ${config.port} (${config.production ? 'production' : 'development'})`)
})

// Upper bound for one request, above the worst case of transcription plus refinement with one retry each.
server.requestTimeout = 180_000
