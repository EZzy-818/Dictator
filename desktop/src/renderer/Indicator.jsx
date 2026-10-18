import Waveform from '@frontend/components/Waveform.jsx'

// The floating status pill. D0 renders the idle shell with the web app's Waveform; recording,
// processing and result states arrive in D1 to D3.
export default function Indicator({ stream = null }) {
  return (
    <div className="indicator" data-indicator>
      <span className="dot" aria-hidden="true" />
      <span className="label">Dictator</span>
      <div className="wave">
        <Waveform stream={stream} />
      </div>
    </div>
  )
}
