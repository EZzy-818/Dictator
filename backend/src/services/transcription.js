import { APIConnectionTimeoutError, toFile } from 'openai'
import { ApiError } from '../lib/errors.js'
import { isSupportedLanguage } from '../lib/languages.js'

// Per attempt; the client retries once, so the worst case is about twice this.
export const TRANSCRIPTION_TIMEOUT_MS = 45_000

// Short vocabulary hints written in the expected language. Auto mode gets none so the
// model is not nudged toward either language.
export const TRANSCRIPTION_HINTS = {
  en: 'This recording may contain technical terminology such as React, Python, PostgreSQL, MongoDB, and APIs.',
  zh: '录音可能涉及软件开发、人工智能、数据库及技术术语，例如 React、Python、PostgreSQL 和 API。',
}

export function transcriptionLanguageParams(language) {
  if (!isSupportedLanguage(language)) {
    throw new ApiError(400, 'invalid_language', 'Unsupported language. Choose English, 中文, or Auto-detect.')
  }
  if (language === 'auto') return {}
  return { language, prompt: TRANSCRIPTION_HINTS[language] }
}

/**
 * Transcribes one audio file. Returns the transcript text exactly as the API returned it.
 * audio: { buffer, mimeType, extension } as produced by identifyAudio plus the bytes.
 */
export async function transcribeAudio({ client, model, audio, language }) {
  const params = transcriptionLanguageParams(language)
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
