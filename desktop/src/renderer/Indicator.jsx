import { useEffect, useState } from 'react'
import Waveform from '@frontend/components/Waveform.jsx'
import { formatDuration } from '@frontend/hooks/useAudioRecorder.js'

// The look of each state. Results keep the three outcomes visibly apart: refined text copied,
// raw transcript copied as a fallback, and nothing copied.
function toneOf(view) {
  if (view.phase === 'recording') return 'recording'
  if (view.phase !== 'done') return 'busy'
  return { refined: 'success', raw: 'warning', failed: 'error', copy_failed: 'error' }[view.outcome] ?? 'busy'
}

function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [startedAt])
  return startedAt ? Math.max(0, now - startedAt) : 0
}

/** The floating status pill. view comes from the main process (src/main/controller.js). */
export default function Indicator({ view = { phase: 'idle' }, stream = null }) {
  const elapsed = useElapsed(view.phase === 'recording' ? view.startedAt : null)
  const tone = toneOf(view)
  const text = view.notice ?? (view.phase === 'recording' ? `Recording ${formatDuration(elapsed)}` : view.message ?? 'Dictator')
  return (
    <div className={`indicator tone-${tone}`} data-indicator data-phase={view.phase} data-outcome={view.outcome ?? ''} role="status">
      <span className="dot" aria-hidden="true" />
      <span className="label">{text}</span>
      {view.phase === 'recording' && (
        <div className="wave">
          <Waveform stream={stream} />
        </div>
      )}
    </div>
  )
}
