import { APIConnectionTimeoutError, toFile } from 'openai'
import { ApiError } from '../lib/errors.js'

// Per attempt; the client retries once, so the worst case is about twice this.
export const TRANSCRIPTION_TIMEOUT_MS = 45_000

// Speakers mix Mandarin or Hindi with English freely, so every recording is transcribed as all three.
// gpt-4o-transcribe has no way to say that: with no language it sometimes translates the
// English parts into Chinese, and it drops fillers, which the None level must keep.
export const SPOKEN_LANGUAGES = ['zh', 'en', 'hi']

export const TRANSCRIPTION_PROMPT =
  'Verbatim transcript of dictation in English, Mandarin Chinese, or Hindi, often mixing two of them in one sentence. Write each word in the language it was spoken in: Chinese in Simplified Chinese characters, Hindi in Devanagari, English in English words. Never translate. Keep every filler word and hesitation as spoken, such as um, uh, like, you know, 嗯, 呃, 那个 and उम्म.'

// Only the gpt-transcribe family accepts a list of expected languages; older models reject it.
export function transcriptionParams(model) {
  const params = { prompt: TRANSCRIPTION_PROMPT }
  if (/^gpt-(live-)?transcribe/.test(model)) params.languages = SPOKEN_LANGUAGES
  return params
}

/**
 * Transcribes one audio file. Returns the transcript text exactly as the API returned it.
 * audio: { buffer, mimeType, extension } as produced by identifyAudio plus the bytes.
 */
export async function transcribeAudio({ client, model, audio }) {
  const params = transcriptionParams(model)
  const file = await toFile(audio.buffer, `recording.${audio.extension}`, { type: audio.mimeType })

  let response
  try {
    response = await client.audio.transcriptions.create(
      {
        file,
        model,
        response_format: 'json',
        ...params,
      },
      { timeout: TRANSCRIPTION_TIMEOUT_MS },
    )
  } catch (err) {
    console.error('Transcription request failed:', err?.status ?? '', err?.name ?? '', err?.code ?? '')
    if (err instanceof APIConnectionTimeoutError) {
      throw new ApiError(504, 'transcription_timeout', 'Transcription took too long. Please try again.')
    }
    throw new ApiError(502, 'transcription_failed', 'Transcription failed. Please try again.')
  }

  if (typeof response?.text !== 'string') {
    console.error('Transcription response had no text field.')
    throw new ApiError(502, 'transcription_failed', 'Transcription failed. Please try again.')
  }

  if (response.text.trim() === '') {
    throw new ApiError(422, 'no_speech', 'No speech was detected in the recording. Please try again and speak clearly.')
  }

  return response.text
}
