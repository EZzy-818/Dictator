import { useEffect, useState } from 'react'
import { getHealth } from './services/api.js'
import { formatDuration, useAudioRecorder } from './hooks/useAudioRecorder.js'
import LanguageSelector from './components/LanguageSelector.jsx'
import Recorder from './components/Recorder.jsx'

function App() {
  const [backendStatus, setBackendStatus] = useState('checking')
  const [language, setLanguage] = useState('auto')
  const recorder = useAudioRecorder()

  useEffect(() => {
    getHealth()
      .then(() => setBackendStatus('connected'))
      .catch(() => setBackendStatus('unreachable'))
  }, [])

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Dictator</h1>
        <p className="text-slate-600">AI Voice-to-Text</p>
      </header>

      <LanguageSelector value={language} onChange={setLanguage} />

      <Recorder
        status={recorder.status}
        elapsedMs={recorder.elapsedMs}
        maxDurationMs={recorder.maxDurationMs}
        onStart={recorder.start}
        onStop={recorder.stop}
      />

      {recorder.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {recorder.error.message}
        </p>
      )}

      {recorder.stoppedAtLimit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Recording stopped automatically at the {formatDuration(recorder.maxDurationMs)} limit.
        </p>
      )}

      {/* Temporary until upload is wired up in Milestone 3. */}
      {recorder.recording && (
        <p className="text-sm text-slate-600" data-testid="recording-summary">
          Captured {formatDuration(recorder.recording.durationMs)} of audio (
          {(recorder.recording.blob.size / 1024).toFixed(1)} KB, {recorder.recording.mimeType}).
        </p>
      )}

      <p className="text-sm text-slate-500" data-testid="backend-status">
        Backend: {backendStatus}
      </p>
    </main>
  )
}

export default App
