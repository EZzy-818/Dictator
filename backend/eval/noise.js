// Mixes pink noise into 16-bit PCM WAV files for the noisy synthetic samples.

function readWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file')
  }
  let format = null
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      }
    } else if (id === 'data') {
      // Streamed WAV files can carry a placeholder size, so the data runs to the end.
      const end = Math.min(start + size, buffer.length)
      const length = Math.floor((end - start) / 2)
      const samples = new Int16Array(length)
      for (let i = 0; i < length; i++) samples[i] = buffer.readInt16LE(start + i * 2)
      if (!format || format.audioFormat !== 1 || format.bitsPerSample !== 16) {
        throw new Error('Only 16-bit PCM WAV is supported')
      }
      return { ...format, samples }
    }
    offset = start + size + (size % 2)
  }
  throw new Error('WAV file has no data chunk')
}

function writeWav({ channels, sampleRate, samples }) {
  const dataBytes = samples.length * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * 2, 28)
  buffer.writeUInt16LE(channels * 2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples.length; i++) buffer.writeInt16LE(samples[i], 44 + i * 2)
  return buffer
}

// Small seeded generator so the same sample always gets the same noise.
function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Paul Kellett's pink noise filter applied to white noise.
function pinkNoise(length, seed) {
  const next = random(seed)
  const noise = new Float64Array(length)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < length; i++) {
    const white = next() * 2 - 1
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    noise[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    b6 = white * 0.115926
  }
  return noise
}

function rms(values) {
  let sum = 0
  for (const value of values) sum += value * value
  return Math.sqrt(sum / values.length)
}

// Speech level is measured over the louder half of the file so leading and
// trailing silence do not lower it.
function speechRms(samples) {
  const frame = 480
  const levels = []
  for (let i = 0; i + frame <= samples.length; i += frame) levels.push(rms(samples.subarray(i, i + frame)))
  levels.sort((a, b) => b - a)
  const loud = levels.slice(0, Math.max(1, Math.ceil(levels.length / 2)))
  return Math.sqrt(loud.reduce((sum, level) => sum + level * level, 0) / loud.length)
}

export function addNoise(wavBuffer, snrDb, seed = 1) {
  const wav = readWav(wavBuffer)
  const noise = pinkNoise(wav.samples.length, seed)
  const scale = speechRms(wav.samples) / 10 ** (snrDb / 20) / rms(noise)
  const mixed = new Int16Array(wav.samples.length)
  for (let i = 0; i < mixed.length; i++) {
    mixed[i] = Math.max(-32768, Math.min(32767, Math.round(wav.samples[i] + noise[i] * scale)))
  }
  return writeWav({ ...wav, samples: mixed })
}
