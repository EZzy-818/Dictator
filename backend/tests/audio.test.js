import { describe, expect, it } from 'vitest'
import { identifyAudio } from '../src/lib/audio.js'
import { TRANSCRIPTION_PROMPT, transcriptionParams } from '../src/services/transcription.js'
import { AUDIO_SAMPLES } from './helpers.js'

describe('identifyAudio', () => {
  it('identifies WebM, ignoring codec parameters', () => {
    expect(identifyAudio(AUDIO_SAMPLES.webm, 'audio/webm;codecs=opus')).toEqual({ mimeType: 'audio/webm', extension: 'webm' })
  })

  it('identifies MP4', () => {
    expect(identifyAudio(AUDIO_SAMPLES.mp4, 'audio/mp4')).toEqual({ mimeType: 'audio/mp4', extension: 'mp4' })
  })

  it('rejects mismatched or unknown formats', () => {
    expect(identifyAudio(AUDIO_SAMPLES.webm, 'audio/mp4')).toBeNull()
    expect(identifyAudio(AUDIO_SAMPLES.webm, 'video/quicktime')).toBeNull()
    expect(identifyAudio(Buffer.from('not audio'), 'audio/webm')).toBeNull()
  })
})

describe('transcriptionParams', () => {
  it('asks gpt-transcribe for mixed Mandarin and English, verbatim', () => {
    expect(transcriptionParams('gpt-transcribe')).toEqual({ prompt: TRANSCRIPTION_PROMPT, languages: ['zh', 'en'] })
    expect(transcriptionParams('gpt-live-transcribe').languages).toEqual(['zh', 'en'])
  })

  it('sends only the prompt to models that reject a language list', () => {
    expect(transcriptionParams('gpt-4o-transcribe')).toEqual({ prompt: TRANSCRIPTION_PROMPT })
    expect(transcriptionParams('gpt-4o-mini-transcribe')).toEqual({ prompt: TRANSCRIPTION_PROMPT })
    expect(transcriptionParams('whisper-1')).toEqual({ prompt: TRANSCRIPTION_PROMPT })
  })

  it('asks the model to keep fillers and never translate', () => {
    expect(TRANSCRIPTION_PROMPT).toMatch(/Keep every filler word/)
    expect(TRANSCRIPTION_PROMPT).toMatch(/Never translate/)
  })
})
