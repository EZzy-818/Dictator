import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

dotenv.config({ quiet: true });

const config = loadConfig();

if (!config.openaiApiKey) {
  console.warn('OPENAI_API_KEY is not set. Transcription and refinement will be unavailable.');
}

createApp(config).listen(config.port, () => {
  console.log(`Dictator backend listening on http://localhost:${config.port}`);
});
