import { useEffect, useRef } from 'react'

const BAR_COUNT = 28
const MIN_SCALE = 0.12

function resetBars(bars) {
  bars.forEach((bar) => bar && (bar.style.transform = `scaleY(${MIN_SCALE})`))
}

/**
 * Bars that follow the live microphone level. With no stream (or no Web Audio support) the bars
 * stay flat, so nothing moves unless sound is actually coming in.
 */
function Waveform({ stream }) {
  const barsRef = useRef([])

  useEffect(() => {
    const bars = barsRef.current
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
    if (!stream || !AudioContextClass) {
      resetBars(bars)
      return
    }

    let context
    let frame
    try {
      context = new AudioContextClass()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      // Only analysed, never connected to the speakers.
      context.createMediaStreamSource(stream).connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)
      const half = BAR_COUNT / 2
      // Speech sits in the lower part of the spectrum; spread those bins across half the bars and mirror them.
      const usableBins = Math.floor(data.length * 0.5)
      const binsPerBar = Math.max(1, Math.floor(usableBins / half))

      const draw = () => {
        analyser.getByteFrequencyData(data)
        for (let i = 0; i < half; i++) {
          let sum = 0
          for (let j = 0; j < binsPerBar; j++) sum += data[1 + i * binsPerBar + j] ?? 0
          const level = Math.min(1, sum / binsPerBar / 200)
          const scale = MIN_SCALE + (1 - MIN_SCALE) * level
          const left = bars[half - 1 - i]
          const right = bars[half + i]
          if (left) left.style.transform = `scaleY(${scale})`
          if (right) right.style.transform = `scaleY(${scale})`
        }
        frame = requestAnimationFrame(draw)
      }
      draw()
    } catch {
      // Drawing the level is optional; recording does not depend on it.
      resetBars(bars)
    }

    return () => {
      cancelAnimationFrame(frame)
      context?.close().catch(() => {})
      resetBars(bars)
    }
  }, [stream])

  return (
    <div className="flex h-10 items-center justify-center gap-[3px]" aria-hidden="true" data-testid="waveform">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => (barsRef.current[i] = el)}
          className={`h-full w-[3px] rounded-full transition-transform duration-75 motion-reduce:transition-none ${
            stream ? 'bg-gradient-to-b from-brand-blue to-brand-violet' : 'bg-slate-300'
          }`}
          style={{ transform: `scaleY(${MIN_SCALE})` }}
        />
      ))}
    </div>
  )
}

export default Waveform
