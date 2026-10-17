import { APIConnectionTimeoutError } from 'openai'
import { ApiError } from '../lib/errors.js'
import { DEFAULT_REFINEMENT_LEVEL } from '../lib/refinementLevels.js'
import { buildRefinementInput, buildRefinementInstructions } from '../prompts/refinement.js'

export const MAX_TRANSCRIPT_CHARS = 10_000
const MAX_OUTPUT_TOKENS = 4_000
// Per attempt; the client retries once, so the worst case is about twice this.
export const REFINEMENT_TIMEOUT_MS = 30_000

const REFINEMENT_FAILED = 'Refinement failed. Your raw transcript is unchanged; please retry.'

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

/**
 * Returns the polished transcript. Throws ApiError on any failure.
 * level "none" returns the transcript exactly as given, without calling the model.
 */
export async function refineTranscript({ client, model, transcript, level = DEFAULT_REFINEMENT_LEVEL }) {
  validateRefinementRequest(transcript)
  if (level === 'none') return transcript

  let response
  try {
    response = await client.responses.create(
      {
        model,
        instructions: buildRefinementInstructions(level),
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
