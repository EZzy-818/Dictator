import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installMediaMocks, removeMediaMocks } from '../../frontend/tests/mediaMocks.js'
import { useDesktopRecorder } from '../src/renderer/useDesktopRecorder.js'

function fakeBridge() {
  let command
  return {
    onCommand: vi.fn((cb) => {
      command = cb
      return () => {}
    }),
    send: (value) => act(async () => command(value)),
    ready: vi.fn(),
    reportStarted: vi.fn(),
    reportError: vi.fn(),
    submitRecording: vi.fn(),
  }
}

let media
let clock
beforeEach(() => {
  media = installMediaMocks()
  clock = 0
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  removeMediaMocks()
  vi.restoreAllMocks()
})

describe('useDesktopRecorder', () => {
  it('records on start and submits the audio on stop', async () => {
    const bridge = fakeBridge()
    renderHook(() => useDesktopRecorder(bridge))
    expect(bridge.ready).toHaveBeenCalled()
    await bridge.send({ type: 'start' })
    await waitFor(() => expect(bridge.reportStarted).toHaveBeenCalled())
    clock = 2000
    await bridge.send({ type: 'stop' })
    await waitFor(() => expect(bridge.submitRecording).toHaveBeenCalled())
    const sent = bridge.submitRecording.mock.calls[0][0]
    expect(sent.bytes).toBeInstanceOf(ArrayBuffer)
    expect(sent.bytes.byteLength).toBe(1024)
    expect(sent.mimeType).toBe('audio/webm;codecs=opus')
    expect(sent.durationMs).toBe(2000)
    expect(media.tracks[0].stop).toHaveBeenCalled()
  })

  it('reports recorder errors by code', async () => {
    const bridge = fakeBridge()
    renderHook(() => useDesktopRecorder(bridge))
    media.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    await bridge.send({ type: 'start' })
    await waitFor(() => expect(bridge.reportError).toHaveBeenCalledWith('permission-denied'))
    expect(bridge.submitRecording).not.toHaveBeenCalled()
  })

  it('reports a too-short recording', async () => {
    const bridge = fakeBridge()
    renderHook(() => useDesktopRecorder(bridge))
    await bridge.send({ type: 'start' })
    await waitFor(() => expect(bridge.reportStarted).toHaveBeenCalled())
    clock = 100
    await bridge.send({ type: 'stop' })
    await waitFor(() => expect(bridge.reportError).toHaveBeenCalledWith('too-short'))
  })

  it('drops the audio when cancelled', async () => {
    const bridge = fakeBridge()
    renderHook(() => useDesktopRecorder(bridge))
    await bridge.send({ type: 'start' })
    await waitFor(() => expect(bridge.reportStarted).toHaveBeenCalled())
    clock = 2000
    await bridge.send({ type: 'cancel' })
    await waitFor(() => expect(media.tracks[0].stop).toHaveBeenCalled())
    expect(bridge.submitRecording).not.toHaveBeenCalled()
    expect(bridge.reportError).not.toHaveBeenCalled()
  })

  it('stops and keeps the audio when the microphone goes away', async () => {
    const listeners = {}
    media.getUserMedia.mockImplementationOnce(async () => {
      const track = { stop: vi.fn(), addEventListener: (name, fn) => (listeners[name] = fn), removeEventListener: vi.fn() }
      media.tracks.push(track)
      return { getTracks: () => [track] }
    })
    const bridge = fakeBridge()
    renderHook(() => useDesktopRecorder(bridge))
    await bridge.send({ type: 'start' })
    await waitFor(() => expect(listeners.ended).toBeTypeOf('function'))
    clock = 3000
    await act(async () => listeners.ended())
    await waitFor(() => expect(bridge.submitRecording).toHaveBeenCalled())
  })
})
