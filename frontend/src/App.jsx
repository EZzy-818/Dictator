import { useCallback, useEffect, useRef, useState } from 'react'
import { getHealth, processAudio } from './services/api.js'
import { formatDuration, useAudioRecorder } from './hooks/useAudioRecorder.js'
import LanguageSelector from './components/LanguageSelector.jsx'
import Recorder from './components/Recorder.jsx'
import TranscriptPanel from './components/TranscriptPanel.jsx'

function App() {
  const [backendStatus, setBackendStatus] = useState('checking')
  const [language, setLanguage] = useState('auto')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [processError, setProcessError] = useState(null)
  const requestIdRef = useRef(0)

  const handleRecordingComplete = useCallback(
    async (recording) => {
      const requestId = ++requestIdRef.current
      setProcessing(true)
      try {
        const data = await processAudio(recording, language)
        if (requestId === requestIdRef.current) setResult(data)
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
    setResult(null)
    setProcessError(null)
    recorder.start()
  }

  useEffect(() => {
    getHealth()
      .then(() => setBackendStatus('connected'))
      .catch(() => setBackendStatus('unreachable'))
  }, [])

  const error = recorder.error?.message ?? processError

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
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

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {recorder.stoppedAtLimit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Recording stopped automatically at the {formatDuration(recorder.maxDurationMs)} limit.
        </p>
      )}

      {result && <TranscriptPanel transcript={result.rawTranscript} />}

      <p className="text-sm text-slate-500" data-testid="backend-status">
        Backend: {backendStatus}
      </p>
    </main>
  )
}

export default App
