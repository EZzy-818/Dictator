import { APIConnectionTimeoutError } from 'openai'
import { ApiError } from '../lib/errors.js'
import { lostLanguages, translatedWords } from '../lib/languages.js'
import { DEFAULT_REFINEMENT_LEVEL } from '../lib/refinementLevels.js'
import { buildRefinementInput, buildRefinementInstructions } from '../prompts/refinement.js'

export const MAX_TRANSCRIPT_CHARS = 10_000
const MAX_OUTPUT_TOKENS = 4_000
// Per attempt; the client retries once, so the worst case is about twice this.
export const REFINEMENT_TIMEOUT_MS = 30_000

const REFINEMENT_FAILED = 'Refinement failed. Your raw transcript is unchanged; please retry.'
const REFINEMENT_CHANGED_LANGUAGE =
  'Refinement rewrote part of your speech in another language, so it was not used. Your raw transcript is unchanged.'

export function validateRefinementRequest(transcript) {
  if (typeof transcript !== 'string' || transcript.trim() === '') {
    throw new ApiError(400, 'missing_transcript', 'A transcript is required.')
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    throw new ApiError(413, 'transcript_too_long', 'The transcript is too long to refine.')
  }
}

// Removes the transcript tags if the model echoes them despite the instructions.
function stripTranscriptTags(text) {
  return text.replace(/^\s*<transcript>\s*/i, '').replace(/\s*<\/transcript>\s*$/i, '')
}

// One model call. keepLanguages and keepWords: what a previous attempt translated, to warn about.
async function requestRefinement({ client, model, transcript, level, keepLanguages, keepWords }) {
  let response
  try {
    response = await client.responses.create(
      {
        model,
        instructions: buildRefinementInstructions(level, { keepLanguages, keepWords }),
        input: buildRefinementInput(transcript),
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // Editing should be as repeatable as possible. Reasoning models reject this parameter.
        temperature: 0,
        // Do not keep dictated text on OpenAI's side beyond the request.
        store: false,
      },
      { timeout: REFINEMENT_TIMEOUT_MS },
    )
  } catch (err) {
    console.error('Refinement request failed:', err?.status ?? '', err?.name ?? '', err?.code ?? '')
    if (err instanceof APIConnectionTimeoutError) {
      throw new ApiError(504, 'refinement_timeout', 'Refinement took too long. Your raw transcript is unchanged; please retry.')
    }
    throw new ApiError(502, 'refinement_failed', REFINEMENT_FAILED)
  }

  if (response?.status && response.status !== 'completed') {
    console.error('Refinement response not completed:', response.status, response.incomplete_details?.reason ?? '')
    throw new ApiError(502, 'refinement_failed', REFINEMENT_FAILED)
  }

  const polished = typeof response?.output_text === 'string' ? stripTranscriptTags(response.output_text).trim() : ''
  if (polished === '') {
    const refused = response?.output?.some((item) => item.content?.some((part) => part.type === 'refusal'))
    console.error(refused ? 'Refinement model refused the request.' : 'Refinement response had no text.')
    throw new ApiError(502, 'refinement_failed', REFINEMENT_FAILED)
  }
  return polished
}

/**
 * Returns the polished transcript. Throws ApiError on any failure.
 * level "none" returns the transcript exactly as given, without calling the model.
 *
 * The prompt asks the model to keep every language, but it sometimes still rewrites one part of a
 * mixed sentence in the other language, or swaps a single English word such as "because" for its
 * Chinese equivalent. Either way the model is asked once more, naming what it translated. If the
 * second answer still lost most of a language, it is not used, because a translated transcript is
 * worse than none; a second single-word swap is accepted.
 */
export async function refineTranscript({ client, model, transcript, level = DEFAULT_REFINEMENT_LEVEL }) {
  validateRefinementRequest(transcript)
  if (level === 'none') return transcript

  const polished = await requestRefinement({ client, model, transcript, level })
  const lost = lostLanguages(transcript, polished)
  const words = translatedWords(transcript, polished)
  if (lost.length === 0 && words.length === 0) return polished

  console.warn(`Refinement translated ${lost.length ? lost.join(' and ') : `${words.length} English word(s)`}; retrying once.`)
  const retried = await requestRefinement({ client, model, transcript, level, keepLanguages: lost, keepWords: words })
  const stillLost = lostLanguages(transcript, retried)
  if (stillLost.length === 0) return retried

  console.error(`Refinement dropped ${stillLost.join(' and ')} again; not using it.`)
  throw new ApiError(502, 'refinement_changed_language', REFINEMENT_CHANGED_LANGUAGE)
}
