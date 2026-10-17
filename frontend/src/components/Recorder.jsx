import { formatDuration } from '../hooks/useAudioRecorder.js'
import Waveform from './Waveform.jsx'
import { MicIcon, SpinnerIcon, StopIcon } from './icons.jsx'

// The four states a person sees. 'requesting' (waiting for microphone permission) reads as Recording starting.
const STATE_LABEL = { idle: 'Ready', recording: 'Recording', processing: 'Processing', error: 'Error' }

const STATE_DOT = {
  idle: 'bg-emerald-500',
  recording: 'bg-rose-500 motion-safe:animate-pulse',
  processing: 'bg-brand-violet motion-safe:animate-pulse',
  error: 'bg-red-500',
}

const HINT = {
  idle: 'Tap the microphone to start',
  requesting: 'Waiting for microphone permission…',
  recording: 'Tap to stop',
  processing: 'Transcribing and refining…',
  refining: 'Refining…',
  error: 'Tap the microphone to try again',
}

function Recorder({ status, failed, refinementLevel, elapsedMs, maxDurationMs, stream, onStart, onStop }) {
  const isRecording = status === 'recording'
  // refining: the current transcript is being refined again at a newly selected level.
  const isWorking = status === 'processing' || status === 'refining'
  const isBusy = status === 'requesting' || isWorking
  const state = isRecording || status === 'requesting' ? 'recording' : isWorking ? 'processing' : failed ? 'error' : 'idle'
  const hint =
    status === 'processing' && refinementLevel === 'none'
      ? 'Transcribing…'
      : HINT[status === 'idle' && failed ? 'error' : status]

  return (
    <section className="flex flex-col items-center gap-5 py-2" aria-label="Recorder">
      <div className="relative grid size-32 place-items-center sm:size-36">
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full bg-gradient-to-br from-brand-blue to-brand-violet blur-2xl transition-opacity duration-500 ${
            isRecording ? 'opacity-60 motion-safe:animate-mic-glow' : 'opacity-25'
          }`}
        />
        <button
          type="button"
          onClick={isRecording ? onStop : onStart}
          disabled={isBusy}
          aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
          className="relative grid size-24 place-items-center rounded-full bg-gradient-to-br from-brand-blue to-brand-violet text-white shadow-[0_10px_30px_-6px_rgb(99_102_241/0.55)] ring-4 ring-white transition duration-200 hover:scale-[1.03] hover:shadow-[0_14px_36px_-6px_rgb(99_102_241/0.65)] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand-blue active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 motion-reduce:transition-none motion-reduce:hover:scale-100 sm:size-28"
        >
          {isRecording ? (
            <StopIcon className="size-9" />
          ) : isWorking ? (
            <SpinnerIcon className="size-9 motion-safe:animate-spin" />
          ) : (
            <MicIcon className="size-10" />
          )}
        </button>
      </div>

      <Waveform stream={isRecording ? stream : null} />

      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            <span className={`size-2 rounded-full ${STATE_DOT[state]}`} aria-hidden="true" />
            {STATE_LABEL[state]}
          </span>
          <span className="font-mono text-sm text-slate-500 tabular-nums" data-testid="timer">
            {formatDuration(elapsedMs)} / {formatDuration(maxDurationMs)}
          </span>
        </div>
        <p className="text-sm text-slate-500" role="status" aria-live="polite">
          {hint}
        </p>
      </div>
    </section>
  )
}

export default Recorder
