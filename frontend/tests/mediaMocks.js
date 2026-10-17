import { vi } from 'vitest'

// Minimal stand-ins for getUserMedia and MediaRecorder so recorder logic can be tested in jsdom.
export function installMediaMocks({
  supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'],
  chunkBytes = 1024,
} = {}) {
  const tracks = []
  const recorders = []

  const getUserMedia = vi.fn(async () => {
    const track = { stop: vi.fn() }
    tracks.push(track)
    return { getTracks: () => [track] }
  })

  class FakeMediaRecorder {
    static isTypeSupported = vi.fn((type) => supportedTypes.includes(type))

    constructor(stream, options) {
      this.stream = stream
      this.mimeType = options.mimeType
      this.state = 'inactive'
      recorders.push(this)
    }

    start() {
      this.state = 'recording'
    }

    stop() {
      this.state = 'inactive'
      const data = new Blob([new Uint8Array(chunkBytes)], { type: this.mimeType })
      this.ondataavailable?.({ data })
      this.onstop?.()
    }
  }

  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })

  return { getUserMedia, tracks, recorders, MediaRecorder: FakeMediaRecorder }
}

export function removeMediaMocks() {
  vi.unstubAllGlobals()
  delete navigator.mediaDevices
}
