import { APIConnectionTimeoutError, toFile } from 'openai'
import { ApiError } from '../lib/errors.js'
import { restoreSpokenNames } from '../lib/names.js'

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

// How long the name check may run on after the main transcript is ready. It usually finishes about
// as fast; when it does not, the main transcript is returned without it.
export const NAME_CHECK_WAIT_MS = 1_500

async function requestTranscript({ client, model, audio, signal }) {
  const file = await toFile(audio.buffer, `recording.${audio.extension}`, { type: audio.mimeType })
  return client.audio.transcriptions.create(
    {
      file,
      model,
      response_format: 'json',
      ...transcriptionParams(model),
    },
    { timeout: TRANSCRIPTION_TIMEOUT_MS, ...(signal ? { signal } : {}) },
  )
}

// The name check's transcript, or null if it failed, was empty or took too long.
async function nameCheckTranscript(request, stopped) {
  try {
    const response = await request
    return typeof response?.text === 'string' && response.text.trim() !== '' ? response.text : null
  } catch (err) {
    if (!stopped.value) console.warn('Name check transcription failed:', err?.status ?? '', err?.name ?? '')
    return null
  }
}

/**
 * Transcribes one audio file. Resolves as soon as the main transcript is ready, with
 * text: the main transcript exactly as the API returned it, and
 * names: a promise of restoreSpokenNames's result ({ text, swapped, swaps }), where names the name
 * check heard in another language are put back as spoken (see lib/names.js). It never rejects.
 * audio: { buffer, mimeType, extension } as produced by identifyAudio plus the bytes.
 * nameCheckModel: second model run on the same audio at the same time; falsy turns it off.
 */
export async function startTranscription({ client, model, nameCheckModel, audio }) {
  // Stops the name check once its answer can no longer be used.
  const abort = new AbortController()
  const stopped = { value: false }
  const stopNameCheck = () => {
    stopped.value = true
    abort.abort()
  }
  const check = nameCheckModel
    ? nameCheckTranscript(requestTranscript({ client, model: nameCheckModel, audio, signal: abort.signal }), stopped)
    : null

  let response
  try {
    response = await requestTranscript({ client, model, audio })
  } catch (err) {
    stopNameCheck()
    console.error('Transcription request failed:', err?.status ?? '', err?.name ?? '', err?.code ?? '')
    if (err instanceof APIConnectionTimeoutError) {
      throw new ApiError(504, 'transcription_timeout', 'Transcription took too long. Please try again.')
    }
    throw new ApiError(502, 'transcription_failed', 'Transcription failed. Please try again.')
  }

  if (typeof response?.text !== 'string') {
    stopNameCheck()
    console.error('Transcription response had no text field.')
    throw new ApiError(502, 'transcription_failed', 'Transcription failed. Please try again.')
  }

  if (response.text.trim() === '') {
    stopNameCheck()
    throw new ApiError(422, 'no_speech', 'No speech was detected in the recording. Please try again and speak clearly.')
  }

  const names = (async () => {
    if (!check) return restoreSpokenNames(response.text, null)
    let timer
    const second = await Promise.race([check, new Promise((resolve) => (timer = setTimeout(resolve, NAME_CHECK_WAIT_MS, null)))])
    clearTimeout(timer)
    stopNameCheck()
    const restored = restoreSpokenNames(response.text, second)
    // Counts only; the text itself is never logged.
    if (restored.swapped) console.info(`Name check restored ${restored.swapped} name(s) to the language spoken.`)
    return restored
  })()
  return { text: response.text, names }
}

/** The transcript with the name check's names put back: startTranscription, waiting for both. */
export async function transcribeAudio(options) {
  const { names } = await startTranscription(options)
  return (await names).text
}
