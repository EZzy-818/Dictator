import { MAX_UPLOAD_BYTES } from './api.js'
import { isAppUrl } from './security.js'

// The formats the backend accepts (backend/src/lib/audio.js); codecs parameters are allowed.
const AUDIO_TYPE = /^audio\/(webm|mp4|ogg)(;\s*codecs=[\w.,"-]+)?$/

/** True when an IPC message comes from the indicator window's own page. */
export function isTrustedSender(event, win, appUrl) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return false
  return isAppUrl(event.senderFrame?.url, appUrl)
}

/**
 * Checks a finished recording sent by the renderer and turns it into what the API client takes.
 * Returns { recording: { blob, mimeType, durationMs, peak } } or { error }.
 */
export function parseRecording(payload) {
  if (!payload || typeof payload !== 'object') return { error: 'not an object' }
  const { bytes, mimeType, durationMs, peak } = payload
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : ArrayBuffer.isView(bytes) ? bytes : null
  if (!data) return { error: 'bytes is not binary' }
  if (data.byteLength === 0) return { error: 'empty recording' }
  if (data.byteLength > MAX_UPLOAD_BYTES) return { error: 'recording too large' }
  if (typeof mimeType !== 'string' || !AUDIO_TYPE.test(mimeType)) return { error: 'unsupported type' }
  if (!Number.isFinite(durationMs) || durationMs < 0) return { error: 'bad duration' }
  const recording = { blob: new Blob([data], { type: mimeType }), mimeType, durationMs }
  if (Number.isFinite(peak)) recording.peak = peak
  return { recording }
}

/** Recorder error codes the renderer may report (from frontend useAudioRecorder). */
export function parseRecorderError(code, knownCodes) {
  return typeof code === 'string' && knownCodes.includes(code) ? code : 'recording-failed'
}
