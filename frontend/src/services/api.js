const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '')

const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'

// Matches the formats the backend accepts; the file name only labels the real encoding.
const EXTENSIONS = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg' }

export class ApiRequestError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function readError(res) {
  try {
    const body = await res.json()
    return new ApiRequestError(body.error || `Request failed (${res.status}).`, { status: res.status, code: body.code })
  } catch {
    return new ApiRequestError(`Request failed (${res.status}).`, { status: res.status })
  }
}

async function send(path, options) {
  let res
  try {
    res = await fetch(`${API_BASE_URL}${path}`, options)
  } catch {
    throw new ApiRequestError(NETWORK_ERROR, { code: 'network_error' })
  }
  if (!res.ok) throw await readError(res)
  return res.json()
}

export function getHealth() {
  return send('/api/health')
}

export function processAudio({ blob, mimeType }, language) {
  const baseType = mimeType.split(';')[0]
  const form = new FormData()
  form.append('language', language)
  form.append('audio', blob, `recording.${EXTENSIONS[baseType] ?? 'webm'}`)
  return send('/api/process', { method: 'POST', body: form })
}
