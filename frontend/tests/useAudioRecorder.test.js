import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  MAX_RECORDING_MS,
  describeMicrophoneError,
  formatDuration,
  pickMimeType,
  useAudioRecorder,
} from '../src/hooks/useAudioRecorder.js'
import { installMediaMocks, removeMediaMocks } from './mediaMocks.js'

describe('pickMimeType', () => {
  it('prefers WebM with Opus', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('falls back to WebM, then MP4', () => {
    expect(pickMimeType((t) => t === 'audio/webm' || t === 'audio/mp4')).toBe('audio/webm')
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns null when no preferred format is supported', () => {
    expect(pickMimeType(() => false)).toBeNull()
  })
})

describe('describeMicrophoneError', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-microphone'],
    ['OverconstrainedError', 'no-microphone'],
    ['NotReadableError', 'microphone-busy'],
    ['SomethingElse', 'microphone-error'],
  ])('maps %s to %s', (name, code) => {
    const result = describeMicrophoneError({ name })
    expect(result.code).toBe(code)
    expect(result.message).toBeTruthy()
  })
})

describe('formatDuration', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(9_999)).toBe('0:09')
    expect(formatDuration(120_000)).toBe('2:00')
  })
})

describe('useAudioRecorder', () => {
  let media

  beforeEach(() => {
    vi.useFakeTimers()
    media = installMediaMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    removeMediaMocks()
  })

  async function startRecording(result) {
    await act(() => result.current.start())
  }

  function advance(ms) {
    act(() => vi.advanceTimersByTime(ms))
  }

  it('records a nonempty blob and closes the microphone on stop', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.current.status).toBe('recording')

    advance(3_000)
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(2_750)

    act(() => result.current.stop())

    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.recording.blob.size).toBeGreaterThan(0)
    expect(result.current.recording.mimeType).toBe('audio/webm;codecs=opus')
    expect(result.current.recording.blob.type).toBe('audio/webm;codecs=opus')
    expect(result.current.recording.durationMs).toBe(3_000)
    expect(media.tracks[0].stop).toHaveBeenCalled()
  })

  it('uses the format the browser actually supports', async () => {
    removeMediaMocks()
    media = installMediaMocks({ supportedTypes: ['audio/mp4'] })
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    advance(1_000)
    act(() => result.current.stop())

    expect(result.current.recording.mimeType).toBe('audio/mp4')
  })

  it('supports several recordings in a row', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    for (let i = 0; i < 3; i++) {
      await startRecording(result)
      advance(1_000)
      act(() => result.current.stop())
      expect(result.current.recording).not.toBeNull()
    }

    expect(media.getUserMedia).toHaveBeenCalledTimes(3)
    media.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
  })

  it('ignores rapid repeated start clicks', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    await act(() => Promise.all([result.current.start(), result.current.start(), result.current.start()]))

    expect(media.getUserMedia).toHaveBeenCalledTimes(1)
    expect(media.recorders).toHaveLength(1)
  })

  it('ignores stop when not recording', () => {
    const { result } = renderHook(() => useAudioRecorder())
    act(() => result.current.stop())
    expect(result.current.status).toBe('idle')
    expect(result.current.recording).toBeNull()
  })

  it('stops automatically at 120 seconds', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    advance(MAX_RECORDING_MS - 1)
    expect(result.current.status).toBe('recording')

    advance(1)
    expect(result.current.status).toBe('idle')
    expect(result.current.stoppedAtLimit).toBe(true)
    expect(result.current.recording.durationMs).toBe(MAX_RECORDING_MS)
    expect(media.tracks[0].stop).toHaveBeenCalled()
  })

  it('reports permission denial and allows retrying', async () => {
    media.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    expect(result.current.status).toBe('idle')
    expect(result.current.error.code).toBe('permission-denied')

    await startRecording(result)
    expect(result.current.status).toBe('recording')
    expect(result.current.error).toBeNull()
  })

  it('reports a missing microphone', async () => {
    media.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('none'), { name: 'NotFoundError' }))
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    expect(result.current.error.code).toBe('no-microphone')
  })

  it('reports an unsupported recording format without requesting the microphone', async () => {
    removeMediaMocks()
    media = installMediaMocks({ supportedTypes: [] })
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    expect(result.current.error.code).toBe('unsupported-format')
    expect(media.getUserMedia).not.toHaveBeenCalled()
  })

  it('reports a browser without MediaRecorder', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    expect(result.current.error.code).toBe('unsupported-browser')
  })

  it('rejects an empty recording and still closes the microphone', async () => {
    removeMediaMocks()
    media = installMediaMocks({ chunkBytes: 0 })
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    advance(2_000)
    act(() => result.current.stop())

    expect(result.current.recording).toBeNull()
    expect(result.current.error.code).toBe('empty')
    expect(media.tracks[0].stop).toHaveBeenCalled()
  })

  it('rejects an accidental near-instant recording', async () => {
    const { result } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    advance(100)
    act(() => result.current.stop())

    expect(result.current.recording).toBeNull()
    expect(result.current.error.code).toBe('too-short')
  })

  it('releases the microphone when unmounted mid-recording', async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder())

    await startRecording(result)
    unmount()

    expect(media.tracks[0].stop).toHaveBeenCalled()
    expect(media.recorders[0].state).toBe('inactive')
  })
})
