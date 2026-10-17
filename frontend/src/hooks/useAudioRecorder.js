import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_RECORDING_MS = 120_000
// Anything shorter is almost certainly an accidental double click, not speech.
export const MIN_RECORDING_MS = 500

// In order of preference. We upload whatever the browser actually produced.
export const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

export const RECORDER_ERRORS = {
  'insecure-context': 'Recording needs a secure connection. Open this page with an https:// address.',
  'unsupported-browser': 'This browser cannot record audio. Use a recent version of Chrome, Edge, Firefox, or Safari.',
  'unsupported-format': 'This browser cannot record audio in a supported format (WebM or MP4).',
  'permission-denied':
    'Microphone access was denied. Allow microphone access for this site in your browser settings, then try again.',
  'no-microphone': 'No microphone was found. Connect a microphone and try again.',
  'microphone-busy': 'Your microphone could not be started. It may be in use by another application.',
  'microphone-error': 'Could not access the microphone. Please try again.',
  empty: 'No audio was captured. Please record again.',
  'too-short': 'The recording was too short. Please record again.',
  'recording-failed': 'Recording failed unexpectedly. Please try again.',
}

function recorderError(code) {
  return { code, message: RECORDER_ERRORS[code] }
}

export function pickMimeType(isTypeSupported) {
  return PREFERRED_MIME_TYPES.find((type) => isTypeSupported(type)) ?? null
}

export function describeMicrophoneError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return recorderError('permission-denied')
    case 'NotFoundError':
    case 'OverconstrainedError':
      return recorderError('no-microphone')
    case 'NotReadableError':
    case 'AbortError':
      return recorderError('microphone-busy')
    default:
      return recorderError('microphone-error')
  }
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/**
 * Records microphone audio with MediaRecorder.
 *
 * status: 'idle' | 'requesting' (waiting for microphone permission) | 'recording'
 * recording: { blob, mimeType, durationMs } after a successful stop, otherwise null
 * stream: the microphone MediaStream while recording, otherwise null
 * onRecordingComplete: called with that same object when a recording finishes successfully
 */
export function useAudioRecorder({ maxDurationMs = MAX_RECORDING_MS, onRecordingComplete } = {}) {
  const [status, setStatus] = useState('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recording, setRecording] = useState(null)
  const [error, setError] = useState(null)
  const [stoppedAtLimit, setStoppedAtLimit] = useState(false)
  // The live microphone stream while recording, so the page can draw its level. Null otherwise.
  const [stream, setStream] = useState(null)

  const busyRef = useRef(false)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const limitRef = useRef(null)
  const onCompleteRef = useRef(onRecordingComplete)

  useEffect(() => {
    onCompleteRef.current = onRecordingComplete
  }, [onRecordingComplete])

  const releaseMicrophone = useCallback(() => {
    clearInterval(timerRef.current)
    clearTimeout(limitRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [])

  const start = useCallback(async () => {
    // Ignore repeated clicks while a recording is starting or running.
    if (busyRef.current) return
    busyRef.current = true

    const fail = (err) => {
      releaseMicrophone()
      recorderRef.current = null
      setError(err)
      setStatus('idle')
      busyRef.current = false
    }

    setError(null)
    setRecording(null)
    setStoppedAtLimit(false)
    setElapsedMs(0)

    // Browsers hide the microphone API on plain http pages (localhost excepted).
    if (window.isSecureContext === false) {
      return fail(recorderError('insecure-context'))
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return fail(recorderError('unsupported-browser'))
    }

    const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) {
      return fail(recorderError('unsupported-format'))
    }

    setStatus('requesting')
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      return fail(describeMicrophoneError(err))
    }

    let recorder
    try {
      recorder = new MediaRecorder(streamRef.current, { mimeType })
    } catch {
      return fail(recorderError('unsupported-format'))
    }

    const chunks = []
    let failed = false
    let startedAt = 0

    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => {
      failed = true
    }
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAt
      const type = recorder.mimeType || mimeType
      const blob = new Blob(chunks, { type })

      if (failed) return fail(recorderError('recording-failed'))
      if (blob.size === 0) return fail(recorderError('empty'))
      if (durationMs < MIN_RECORDING_MS) return fail(recorderError('too-short'))

      releaseMicrophone()
      recorderRef.current = null
      const result = { blob, mimeType: type, durationMs }
      setElapsedMs(durationMs)
      setRecording(result)
      setStatus('idle')
      busyRef.current = false
      onCompleteRef.current?.(result)
    }

    recorderRef.current = recorder
    recorder.start()
    startedAt = Date.now()
    setStatus('recording')
    setStream(streamRef.current)

    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)
    limitRef.current = setTimeout(() => {
      setStoppedAtLimit(true)
      stop()
    }, maxDurationMs)
  }, [maxDurationMs, releaseMicrophone, stop])

  // Release the microphone if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder) {
        recorder.onstop = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      releaseMicrophone()
    }
  }, [releaseMicrophone])

  return { status, elapsedMs, maxDurationMs, recording, error, stoppedAtLimit, stream, start, stop }
}
