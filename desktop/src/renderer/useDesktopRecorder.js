import { useCallback, useEffect, useRef } from 'react'
import { useAudioRecorder } from '@frontend/hooks/useAudioRecorder.js'

/** Loudest sample in a recording, 0 to 1. Used by the --record-test check to prove real sound. */
export async function measurePeak(arrayBuffer) {
  const context = new OfflineAudioContext(1, 1, 48_000)
  const audio = await context.decodeAudioData(arrayBuffer.slice(0))
  let peak = 0
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    for (const sample of audio.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample))
  }
  return peak
}

/**
 * The web app's recorder, driven by commands from the main process instead of buttons.
 * Recordings, start and errors go back through the preload bridge. Returns the live microphone
 * stream (for the waveform) and the recorder status.
 */
export function useDesktopRecorder(bridge = window.dictator) {
  const cancelledRef = useRef(false)
  const measureRef = useRef(false)

  const handleComplete = useCallback(
    async ({ blob, mimeType, durationMs }) => {
      if (cancelledRef.current) return
      const bytes = await blob.arrayBuffer()
      const recording = { bytes, mimeType, durationMs }
      if (measureRef.current) recording.peak = await measurePeak(bytes).catch(() => -1)
      bridge.submitRecording(recording)
    },
    [bridge],
  )

  const recorder = useAudioRecorder({ onRecordingComplete: handleComplete })
  const { status, error, stream, start, stop } = recorder

  useEffect(
    () =>
      bridge.onCommand((command) => {
        if (command?.type === 'start') {
          cancelledRef.current = false
          measureRef.current = Boolean(command.measure)
          start()
        } else if (command?.type === 'stop') {
          stop()
        } else if (command?.type === 'cancel') {
          cancelledRef.current = true
          stop()
        }
      }),
    [bridge, start, stop],
  )

  useEffect(() => {
    if (status !== 'recording') return
    // Cancelled while the microphone was still starting: stop now and drop the audio.
    if (cancelledRef.current) stop()
    else bridge.reportStarted()
  }, [status, bridge, stop])

  useEffect(() => {
    if (error && !cancelledRef.current) bridge.reportError(error.code)
  }, [error, bridge])

  // A microphone that disappears mid-recording (unplugged, permission revoked) ends its track.
  // Stop then, so whatever was captured is still transcribed.
  useEffect(() => {
    if (!stream) return
    const tracks = stream.getTracks()
    tracks.forEach((track) => track.addEventListener?.('ended', stop))
    return () => tracks.forEach((track) => track.removeEventListener?.('ended', stop))
  }, [stream, stop])

  useEffect(() => bridge.ready(), [bridge])

  return { status, stream }
}
