import { useCallback, useEffect, useRef, useState } from 'react'
import { getHealth, processAudio, refineTranscript } from './services/api.js'
import { formatDuration, useAudioRecorder } from './hooks/useAudioRecorder.js'
import RefinementLevelSelector from './components/RefinementLevelSelector.jsx'
import { DEFAULT_REFINEMENT_LEVEL } from './refinementLevels.js'
import Recorder from './components/Recorder.jsx'
import TranscriptPanel from './components/TranscriptPanel.jsx'
import OutputEditor from './components/OutputEditor.jsx'

// Tells the browser which glyphs to prefer. Text with any Chinese in it is marked Chinese,
// which still shows English words normally.
function textLangOf(text) {
  return /\p{Script=Han}/u.test(text) ? 'zh-CN' : 'en'
}

const REFINEMENT_FAILED = 'Refinement failed. Your raw transcript is preserved; you can retry refinement.'

function Notice({ tone, children }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
  }
  return (
    <p role="alert" className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}>
      {children}
    </p>
  )
}

function App() {
  const [serverUnavailable, setServerUnavailable] = useState(false)
  const [refinementLevel, setRefinementLevel] = useState(DEFAULT_REFINEMENT_LEVEL)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState(null)
  // { rawTranscript } from the last successful transcription.
  const [transcript, setTranscript] = useState(null)
  const [polishedText, setPolishedText] = useState(null)
  // The level the polished text was made with (or last attempted at, after a failure).
  const [outputLevel, setOutputLevel] = useState(null)
  const [refining, setRefining] = useState(false)
  const [refinementError, setRefinementError] = useState(null)
  const [copyStatus, setCopyStatus] = useState('idle')
  const requestIdRef = useRef(0)
  const copyTimerRef = useRef(null)

  const resetResults = () => {
    requestIdRef.current++
    setProcessing(false)
    setProcessError(null)
    setTranscript(null)
    setPolishedText(null)
    setOutputLevel(null)
    setRefining(false)
    setRefinementError(null)
    setCopyStatus('idle')
  }

  const handleRecordingComplete = useCallback(
    async (recording) => {
      const requestId = ++requestIdRef.current
      // The level is captured here, when processing begins.
      setOutputLevel(refinementLevel)
      setProcessing(true)
      try {
        const data = await processAudio(recording, refinementLevel)
        if (requestId !== requestIdRef.current) return
        setServerUnavailable(false)
        setTranscript({ rawTranscript: data.rawTranscript })
        setOutputLevel(data.refinementLevel ?? refinementLevel)
        if (data.refinementStatus === 'success' || data.refinementStatus === 'skipped') {
          setPolishedText(data.polishedTranscript)
        } else {
          setRefinementError(REFINEMENT_FAILED)
        }
      } catch (err) {
        if (requestId === requestIdRef.current) setProcessError(err.message)
      } finally {
        if (requestId === requestIdRef.current) setProcessing(false)
      }
    },
    [refinementLevel],
  )

  const recorder = useAudioRecorder({ onRecordingComplete: handleRecordingComplete })

  const startRecording = () => {
    resetResults()
    recorder.start()
  }

  // Refines the same transcript again at the selected level.
  const retryRefinement = async () => {
    if (!transcript || refining) return
    const level = refinementLevel
    setOutputLevel(level)
    setRefinementError(null)
    // None is the raw transcript itself; there is nothing to ask the server.
    if (level === 'none') {
      setPolishedText(transcript.rawTranscript)
      return
    }
    const requestId = requestIdRef.current
    setRefining(true)
    try {
      const data = await refineTranscript(transcript.rawTranscript, level)
      if (requestId === requestIdRef.current) setPolishedText(data.polishedTranscript)
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setRefinementError(err.message || REFINEMENT_FAILED)
      }
    } finally {
      if (requestId === requestIdRef.current) setRefining(false)
    }
  }

  const copyPolishedText = async () => {
    clearTimeout(copyTimerRef.current)
    try {
      await navigator.clipboard.writeText(polishedText)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    copyTimerRef.current = setTimeout(() => setCopyStatus((status) => (status === 'copied' ? 'idle' : status)), 2000)
  }

  useEffect(() => () => clearTimeout(copyTimerRef.current), [])

  // Checking early also wakes a hosted backend that sleeps when idle.
  useEffect(() => {
    getHealth()
      .then((health) => setServerUnavailable(health.openaiConfigured === false))
      .catch(() => setServerUnavailable(true))
  }, [])

  const isRecording = recorder.status === 'recording' || recorder.status === 'requesting'
  const error = recorder.error?.message ?? processError
  // idle | recording | processing | completed | error
  const uiState = isRecording
    ? 'recording'
    : processing
      ? 'processing'
      : error
        ? 'error'
        : transcript
          ? 'completed'
          : 'idle'
  const textLang = transcript ? textLangOf(transcript.rawTranscript) : undefined

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10" data-state={uiState}>
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Dictator</h1>
        <p className="text-slate-600">AI Voice-to-Text</p>
      </header>

      <RefinementLevelSelector value={refinementLevel} onChange={setRefinementLevel} />

      <Recorder
        status={processing ? 'processing' : recorder.status}
        refinementLevel={outputLevel}
        elapsedMs={recorder.elapsedMs}
        maxDurationMs={recorder.maxDurationMs}
        onStart={startRecording}
        onStop={recorder.stop}
      />

      {serverUnavailable && (
        <Notice tone="warning">The speech service is not responding right now. If recording fails, try again in a moment.</Notice>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {recorder.stoppedAtLimit && (
        <Notice tone="warning">Recording stopped automatically at the {formatDuration(recorder.maxDurationMs)} limit.</Notice>
      )}

      {transcript && (
        <>
          <TranscriptPanel transcript={transcript.rawTranscript} lang={textLang} />

          {refinementError && <Notice tone="warning">{refinementError}</Notice>}
          {copyStatus === 'failed' && (
            <Notice tone="warning">Could not copy automatically. Select the polished text and press Ctrl+C (⌘C on a Mac).</Notice>
          )}

          <OutputEditor
            value={polishedText}
            onChange={setPolishedText}
            lang={textLang}
            outputLevel={outputLevel}
            selectedLevel={refinementLevel}
            copyStatus={copyStatus}
            onCopy={copyPolishedText}
            refining={refining}
            onRetry={retryRefinement}
            onRecordAgain={startRecording}
            disabled={uiState !== 'completed'}
          />
        </>
      )}

      <footer className="border-t border-slate-200 pt-4 text-sm text-slate-500">
        <p>
          Your recording is sent to the Dictator server and to OpenAI to be transcribed and refined. Dictator does not
          store your recordings or text.
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-slate-600 hover:text-slate-800">How your audio is handled</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Recording starts only when you click Start Recording and stops when you click Stop Recording or after{' '}
              {formatDuration(recorder.maxDurationMs)}. The microphone is released as soon as recording stops.
            </li>
            <li>
              The audio is uploaded over an encrypted connection, kept in the server&apos;s memory only while it is
              processed, and never saved to disk.
            </li>
            <li>
              The audio is sent to OpenAI for transcription, and the transcript is sent to OpenAI for refinement unless
              AI refinement is set to None. OpenAI
              does not use this data to train its models. Under its API data policy, OpenAI may keep the text sent for
              refinement for up to 30 days to monitor abuse.
            </li>
            <li>
              Dictator does not log transcripts and keeps no history or accounts. Your results exist only in this page
              and are gone when you close or reload it.
            </li>
            <li>Avoid dictating passwords or other information you would not want to send to these services.</li>
          </ul>
        </details>
      </footer>
    </main>
  )
}

export default App
