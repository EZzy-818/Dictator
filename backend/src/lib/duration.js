import { parseBuffer } from 'music-metadata'

// Matroska/WebM element IDs, with their marker bits, as in the Matroska specification.
const SEGMENT = 0x18538067
const INFO = 0x1549a966
const TIMESTAMP_SCALE = 0x2ad7b1
const CLUSTER = 0x1f43b675
const CLUSTER_TIMESTAMP = 0xe7
const BLOCK_GROUP = 0xa0
const BLOCK = 0xa1
const SIMPLE_BLOCK = 0xa3
// Containers whose children are read; every other element is skipped by its size.
const ENTERED = new Set([SEGMENT, INFO, CLUSTER, BLOCK_GROUP])

// Reads an EBML variable-length integer. Returns { value, length, unknown } or null.
function readVint(buffer, offset, keepMarker) {
  const first = buffer[offset]
  if (first === undefined || first === 0) return null
  const length = Math.clz32(first) - 23
  if (length > 8 || offset + length > buffer.length) return null
  let value = keepMarker ? first : first & (0xff >> length)
  let allOnes = value === (0xff >> length)
  for (let i = 1; i < length; i++) {
    value = value * 256 + buffer[offset + i]
    if (buffer[offset + i] !== 0xff) allOnes = false
  }
  return { value, length, unknown: !keepMarker && allOnes }
}

function readUint(buffer, offset, size) {
  let value = 0
  for (let i = 0; i < size; i++) value = value * 256 + buffer[offset + i]
  return value
}

/**
 * Duration of a WebM recording from its block timestamps. Browsers' MediaRecorder
 * writes WebM without a duration header, so the blocks are the only reliable source.
 */
export function webmDurationSeconds(buffer) {
  let scale = 1_000_000 // nanoseconds per timestamp unit, the Matroska default
  let clusterTime = 0
  let maxTime = null
  let offset = 0
  while (offset < buffer.length) {
    const id = readVint(buffer, offset, true)
    if (!id) return null
    const size = readVint(buffer, offset + id.length, false)
    if (!size) return null
    const start = offset + id.length + size.length
    if (ENTERED.has(id.value)) {
      offset = start
      continue
    }
    // Only containers may have an unknown size; a leaf of unknown size is unreadable.
    if (size.unknown || start + size.value > buffer.length) {
      // The final block of a recording cut short can be incomplete; stop there.
      break
    }
    if (id.value === TIMESTAMP_SCALE) scale = readUint(buffer, start, size.value)
    if (id.value === CLUSTER_TIMESTAMP) clusterTime = readUint(buffer, start, size.value)
    if (id.value === SIMPLE_BLOCK || id.value === BLOCK) {
      const track = readVint(buffer, start, false)
      if (!track || size.value < track.length + 2) return null
      const relative = buffer.readInt16BE(start + track.length)
      maxTime = Math.max(maxTime ?? 0, clusterTime + relative)
    }
    offset = start + size.value
  }
  return maxTime === null || !scale ? null : (maxTime * scale) / 1e9
}

/** Returns the recording's length in seconds, or null if it cannot be determined. */
export async function audioDurationSeconds(buffer, { mimeType, extension }) {
  if (extension === 'webm') return webmDurationSeconds(buffer)
  try {
    const { format } = await parseBuffer(buffer, { mimeType }, { duration: true, skipCovers: true })
    return Number.isFinite(format.duration) && format.duration > 0 ? format.duration : null
  } catch {
    return null
  }
}
