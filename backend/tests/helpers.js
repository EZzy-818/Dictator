import { vi } from 'vitest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'

// Minimal byte headers that identify each container format.
export const AUDIO_SAMPLES = {
  webm: Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 1)]),
  mp4: Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(64, 1)]),
}

export function fakeOpenAI(transcribe = async () => ({ text: 'Hello world.' })) {
  return { audio: { transcriptions: { create: vi.fn(transcribe) } } }
}

export function createTestApp({ openai = fakeOpenAI(), env = {} } = {}) {
  const config = loadConfig({ OPENAI_API_KEY: 'sk-test', ...env })
  return { app: createApp(config, { openai }), openai, config }
}
