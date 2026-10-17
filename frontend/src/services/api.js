const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '')

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

// Slightly above the backend's worst case (transcription + refinement, one retry each).
const PROCESS_TIMEOUT_MS = 170_000
const REFINE_TIMEOUT_MS = 70_000
const HEALTH_TIMEOUT_MS = 10_000

const MESSAGES = {
  network_error: 'Could not reach the server. Check your connection and try again.',
  timeout: 'The server took too long to respond. Please try again.',
  bad_response: 'The server sent an unexpected response. Please try again.',
  file_too_large: 'The recording is larger than the 10 MB limit. Please record a shorter clip.',
}

// Matches the formats the backend accepts; the file name only labels the real encoding.
const EXTENSIONS = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg' }

export class ApiRequestError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

function clientError(code) {
  return new ApiRequestError(MESSAGES[code], { code })
}

async function readError(res) {
  try {
    const body = await res.json()
    if (typeof body.error === 'string') {
      return new ApiRequestError(body.error, { status: res.status, code: body.code })
    }
  } catch {
    // Not our JSON error format, e.g. an HTML page from a proxy.
  }
  return new ApiRequestError(`The server could not complete the request (${res.status}). Please try again.`, {
    status: res.status,
  })
}

async function send(path, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let res
    try {
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, signal: controller.signal })
    } catch {
      throw clientError(controller.signal.aborted ? 'timeout' : 'network_error')
    }
    if (!res.ok) throw await readError(res)
    try {
      return await res.json()
    } catch {
      throw clientError(controller.signal.aborted ? 'timeout' : 'bad_response')
    }
  } finally {
    clearTimeout(timer)
  }
}

export function getHealth() {
  return send('/api/health', {}, HEALTH_TIMEOUT_MS)
}

export async function processAudio({ blob, mimeType }, language, refinementLevel = 'light') {
  if (blob.size > MAX_UPLOAD_BYTES) throw clientError('file_too_large')

  const baseType = mimeType.split(';')[0]
  const form = new FormData()
  form.append('language', language)
  form.append('refinementLevel', refinementLevel)
  form.append('audio', blob, `recording.${EXTENSIONS[baseType] ?? 'webm'}`)
  const data = await send('/api/process', { method: 'POST', body: form }, PROCESS_TIMEOUT_MS)
  if (typeof data?.rawTranscript !== 'string') throw clientError('bad_response')
  return data
}

export async function refineTranscript(transcript, language, refinementLevel = 'light') {
  const data = await send(
    '/api/refine',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, language, refinementLevel }),
    },
    REFINE_TIMEOUT_MS,
  )
  if (typeof data?.polishedTranscript !== 'string') throw clientError('bad_response')
  return data
}
