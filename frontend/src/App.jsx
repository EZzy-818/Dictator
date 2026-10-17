import { useCallback, useEffect, useRef, useState } from 'react'
import { getHealth, processAudio, refineTranscript } from './services/api.js'
import { formatDuration, useAudioRecorder } from './hooks/useAudioRecorder.js'
import LanguageSelector from './components/LanguageSelector.jsx'
import Recorder from './components/Recorder.jsx'
import TranscriptPanel from './components/TranscriptPanel.jsx'
import OutputEditor from './components/OutputEditor.jsx'

// Tells the browser which glyphs to prefer; auto-detected text may be either language.
const TEXT_LANG = { en: 'en', zh: 'zh-CN', auto: undefined }

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
  const [backendStatus, setBackendStatus] = useState('checking')
  const [language, setLanguage] = useState('auto')
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState(null)
  // { rawTranscript, selectedLanguage } from the last successful transcription.
  const [transcript, setTranscript] = useState(null)
  const [polishedText, setPolishedText] = useState(null)
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
    setRefining(false)
    setRefinementError(null)
    setCopyStatus('idle')
  }

  const handleRecordingComplete = useCallback(
    async (recording) => {
      const requestId = ++requestIdRef.current
      setProcessing(true)
      try {
        const data = await processAudio(recording, language)
        if (requestId !== requestIdRef.current) return
        setTranscript({ rawTranscript: data.rawTranscript, selectedLanguage: data.selectedLanguage })
        if (data.refinementStatus === 'success') {
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
    [language],
  )

  const recorder = useAudioRecorder({ onRecordingComplete: handleRecordingComplete })

  const startRecording = () => {
    resetResults()
    recorder.start()
  }

  // Retries only the refinement step, reusing the transcript and the language it was recorded with.
  const retryRefinement = async () => {
    if (!transcript || refining) return
    const requestId = requestIdRef.current
    setRefining(true)
    setRefinementError(null)
    try {
      const data = await refineTranscript(transcript.rawTranscript, transcript.selectedLanguage)
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

  useEffect(() => {
    getHealth()
      .then(() => setBackendStatus('connected'))
      .catch(() => setBackendStatus('unreachable'))
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
  const textLang = transcript ? TEXT_LANG[transcript.selectedLanguage] : undefined

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10" data-state={uiState}>
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Dictator</h1>
        <p className="text-slate-600">AI Voice-to-Text</p>
      </header>

      <LanguageSelector value={language} onChange={setLanguage} />

      <Recorder
        status={processing ? 'processing' : recorder.status}
        elapsedMs={recorder.elapsedMs}
        maxDurationMs={recorder.maxDurationMs}
        onStart={startRecording}
        onStop={recorder.stop}
      />

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
            copyStatus={copyStatus}
            onCopy={copyPolishedText}
            refining={refining}
            onRetry={retryRefinement}
            onRecordAgain={startRecording}
            disabled={uiState !== 'completed'}
          />
        </>
      )}

      <p className="text-sm text-slate-500" data-testid="backend-status">
        Backend: {backendStatus}
      </p>
    </main>
  )
}

export default App
