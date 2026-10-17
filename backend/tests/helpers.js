import fs from 'node:fs'
import path from 'node:path'
import { vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'

// Real recordings. chrome.* come from Chromium's MediaRecorder (about 3 seconds, a test tone);
// see fixtures/README.md.
export const FIXTURES = path.resolve(import.meta.dirname, 'fixtures')
export const AUDIO_SAMPLES = {
  webm: fs.readFileSync(path.join(FIXTURES, 'chrome.webm')),
  mp4: fs.readFileSync(path.join(FIXTURES, 'chrome.mp4')),
}

export function fakeOpenAI(
  transcribe = async () => ({ text: 'Hello world.' }),
  refine = async () => ({ status: 'completed', output_text: 'Hello, world.' }),
) {
  return {
    audio: { transcriptions: { create: vi.fn(transcribe) } },
    responses: { create: vi.fn(refine) },
  }
}

export function createTestApp({ openai = fakeOpenAI(), env = {}, log = () => {}, createStore } = {}) {
  // The name check makes a second transcription request; tests that want it turn it on.
  const config = loadConfig({ OPENAI_API_KEY: 'sk-test', NAME_CHECK_MODEL: '', ...env })
  return { app: createApp(config, { openai, log, createStore }), openai, config }
}
