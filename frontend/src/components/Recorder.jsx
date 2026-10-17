import { formatDuration } from '../hooks/useAudioRecorder.js'

const STATUS_TEXT = {
  idle: 'Ready to record',
  requesting: 'Waiting for microphone permission…',
  recording: 'Recording',
  processing: 'Transcribing and refining…',
}

function Recorder({ status, refinementLevel, elapsedMs, maxDurationMs, onStart, onStop }) {
  const isRecording = status === 'recording'

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        {isRecording ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700"
          >
            Stop Recording
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={status === 'requesting' || status === 'processing'}
            className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Recording
          </button>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-700" role="status" aria-live="polite">
          {isRecording && <span className="size-3 animate-pulse rounded-full bg-red-600" aria-hidden="true" />}
          <span>{status === 'processing' && refinementLevel === 'none' ? 'Transcribing…' : STATUS_TEXT[status]}</span>
        </div>

        <span className="ml-auto font-mono text-sm tabular-nums text-slate-600" data-testid="timer">
          {formatDuration(elapsedMs)} / {formatDuration(maxDurationMs)}
        </span>
      </div>
    </section>
  )
}

export default Recorder
