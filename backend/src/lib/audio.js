export const MAX_AUDIO_BYTES = 10 * 1024 * 1024

// Formats the transcription API accepts, keyed by base MIME type. The extension
// tells the API how to decode the upload, so it must match the real encoding.
const AUDIO_FORMATS = {
  'audio/webm': { extension: 'webm', matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  'audio/mp4': { extension: 'mp4', matches: isIsoMedia },
  'audio/m4a': { extension: 'm4a', matches: isIsoMedia },
  'audio/x-m4a': { extension: 'm4a', matches: isIsoMedia },
  'audio/ogg': { extension: 'ogg', matches: (b) => startsWith(b, [0x4f, 0x67, 0x67, 0x53]) },
  'audio/wav': { extension: 'wav', matches: isWav },
  'audio/x-wav': { extension: 'wav', matches: isWav },
  'audio/wave': { extension: 'wav', matches: isWav },
  'audio/mpeg': { extension: 'mp3', matches: isMp3 },
  'audio/flac': { extension: 'flac', matches: (b) => startsWith(b, [0x66, 0x4c, 0x61, 0x43]) },
}

function startsWith(buffer, bytes, offset = 0) {
  return buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte)
}

function isIsoMedia(buffer) {
  return startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4) // "ftyp"
}

function isWav(buffer) {
  return startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x41, 0x56, 0x45], 8)
}

function isMp3(buffer) {
  return startsWith(buffer, [0x49, 0x44, 0x33]) || (buffer.length > 1 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
}

export function baseMimeType(mimeType = '') {
  return mimeType.split(';')[0].trim().toLowerCase()
}

/**
 * Returns { mimeType, extension } for a supported, correctly encoded upload, or null.
 * The declared type must be supported and the bytes must look like that format.
 */
export function identifyAudio(buffer, declaredMimeType) {
  const mimeType = baseMimeType(declaredMimeType)
  const format = AUDIO_FORMATS[mimeType]
  if (!format || !format.matches(buffer)) return null
  return { mimeType, extension: format.extension }
}
