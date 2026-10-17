import { describe, expect, it } from 'vitest'
import { identifyAudio } from '../src/lib/audio.js'
import { transcriptionLanguageParams } from '../src/services/transcription.js'
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

describe('transcriptionLanguageParams', () => {
  it('maps en and zh to the API language', () => {
    expect(transcriptionLanguageParams('en').language).toBe('en')
    expect(transcriptionLanguageParams('zh').language).toBe('zh')
  })

  it('never sends "auto" to the API', () => {
    expect(transcriptionLanguageParams('auto')).toEqual({})
  })

  it('throws for unsupported values', () => {
    expect(() => transcriptionLanguageParams('fr')).toThrow()
    expect(() => transcriptionLanguageParams(undefined)).toThrow()
  })
})
