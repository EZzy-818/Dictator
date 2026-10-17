import { useCallback, useEffect, useRef, useState } from 'react'
import { getHealth, processAudio, refineText } from './services/api.js'
import { formatDuration, useAudioRecorder } from './hooks/useAudioRecorder.js'
import RefinementLevelSelector from './components/RefinementLevelSelector.jsx'
import { DEFAULT_REFINEMENT_LEVEL } from './refinementLevels.js'
import Recorder from './components/Recorder.jsx'
import TranscriptPanel from './components/TranscriptPanel.jsx'
import OutputEditor from './components/OutputEditor.jsx'
import { LockIcon, WaveLogo } from './components/icons.jsx'
import LatencyPanel from './components/LatencyPanel.jsx'
import { addRun, buildLatencyReport, isLatencyPanelEnabled, newRequestId } from './latency/report.js'

// Tells the browser which glyphs to prefer. Text with any Chinese or Hindi in it is marked
// as that language, which still shows English words normally.
function textLangOf(text) {
  if (/\p{Script=Han}/u.test(text)) return 'zh-CN'
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi'
  return 'en'
}

const REFINEMENT_FAILED = 'Refinement failed. Your raw transcript is preserved above; you can select and copy it from there.'

function Notice({ tone, children }) {
  const styles = {
    error: 'border-red-200/80 bg-red-50/80 text-red-800',
    warning: 'border-amber-200/80 bg-amber-50/80 text-amber-800',
  }
  return (
    <p role="alert" className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${styles[tone]}`}>
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
  // The level the polished text was made with (or attempted at, after a failure).
  const [outputLevel, setOutputLevel] = useState(null)
  const [refinementError, setRefinementError] = useState(null)
  // True while the current transcript is being refined again at a newly selected level.
  const [refining, setRefining] = useState(false)
  // Polished text per level for the current transcript, so switching back needs no request.
  const levelResultsRef = useRef({})
  // The selected level, for code that runs after a later selection change.
  const selectedLevelRef = useRef(refinementLevel)
  const [copyStatus, setCopyStatus] = useState('idle')
  const requestIdRef = useRef(0)
  const copyTimerRef = useRef(null)
  // Developer latency panel. Off for regular visitors, who then pay for none of the display tracking.
  const [latencyEnabled] = useState(() => isLatencyPanelEnabled())
  const [latencyRuns, setLatencyRuns] = useState([])
  const [latencyCommit, setLatencyCommit] = useState(0)
  const pendingLatencyRef = useRef(null)

  const resetResults = () => {
    requestIdRef.current++
    setProcessing(false)
    setProcessError(null)
    setTranscript(null)
    setPolishedText(null)
    setOutputLevel(null)
    setRefinementError(null)
    setRefining(false)
    levelResultsRef.current = {}
    setCopyStatus('idle')
  }

  // The polished text always matches the selected level. Choosing another level after a recording
  // (or while it was processing) redoes the current transcript at that level: None shows the raw
  // transcript as is, Light and Medium refine it again. Without this, the text from the old level
  // stayed on screen under the new selection, so None could look like Light.
  const showLevel = useCallback((level, rawTranscript) => {
    const requestId = ++requestIdRef.current
    setRefinementError(null)
    const known = levelResultsRef.current[level]
    if (known !== undefined) {
      setRefining(false)
      setPolishedText(known)
      setOutputLevel(level)
      return
    }
    setPolishedText(null)
    setRefining(true)
    refineText(rawTranscript, level)
      .then((data) => {
        if (requestId !== requestIdRef.current) return
        levelResultsRef.current[level] = data.polishedTranscript
        setPolishedText(data.polishedTranscript)
      })
      .catch((err) => {
        if (requestId === requestIdRef.current) setRefinementError(err.message ?? REFINEMENT_FAILED)
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setOutputLevel(level)
        setRefining(false)
      })
  }, [])

  const changeLevel = (level) => {
    selectedLevelRef.current = level
    setRefinementLevel(level)
    if (transcript && !processing) showLevel(level, transcript.rawTranscript)
  }

  const handleRecordingComplete = useCallback(
    async (recording) => {
      const requestId = ++requestIdRef.current
      // Latency marks for this recording; only durations and IDs, never audio or text.
      const trace = { requestId: newRequestId(), refinementLevel, ...recording.timing }
      // The level is captured here, when processing begins.
      setOutputLevel(refinementLevel)
      setProcessing(true)
      // Set when the result arrives after another level was selected.
      let reshow = null
      try {
        const data = await processAudio(recording, refinementLevel, trace)
        if (requestId !== requestIdRef.current) return
        trace.server = data.timings
        setServerUnavailable(false)
        const level = data.refinementLevel ?? refinementLevel
        levelResultsRef.current = { none: data.rawTranscript }
        setTranscript({ rawTranscript: data.rawTranscript })
        setOutputLevel(level)
        if (data.refinementStatus === 'success' || data.refinementStatus === 'skipped') {
          levelResultsRef.current[level] = data.polishedTranscript
          setPolishedText(data.polishedTranscript)
          trace.outcome = 'success'
        } else {
          setRefinementError(REFINEMENT_FAILED)
          trace.outcome = 'refinement_failed'
        }
        if (selectedLevelRef.current !== level) reshow = { level: selectedLevelRef.current, rawTranscript: data.rawTranscript }
      } catch (err) {
        if (requestId === requestIdRef.current) setProcessError(err.message)
        Object.assign(trace, { server: err.timings, outcome: 'failed', errorCode: err.code ?? 'unknown' })
      } finally {
        if (requestId === requestIdRef.current) {
          setProcessing(false)
          // The result commits with this render; the effect below times its paint.
          if (latencyEnabled) {
            pendingLatencyRef.current = trace
            setLatencyCommit((count) => count + 1)
          }
          if (reshow) showLevel(reshow.level, reshow.rawTranscript)
        }
      }
    },
    [refinementLevel, latencyEnabled, showLevel],
  )

  // Runs after the result is in the DOM. The browser paints before the next animation frame's
  // callbacks finish, so the mark after it is when the text became visible.
  useEffect(() => {
    const trace = pendingLatencyRef.current
    if (!trace) return
    pendingLatencyRef.current = null
    requestAnimationFrame(() =>
      setTimeout(() => {
        trace.displayedAt = performance.now()
        setLatencyRuns((runs) => addRun(runs, buildLatencyReport(trace)))
      }),
    )
  }, [latencyCommit])

  const recorder = useAudioRecorder({ onRecordingComplete: handleRecordingComplete })

  const startRecording = () => {
    resetResults()
    recorder.start()
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
    : processing || refining
      ? 'processing'
      : error
        ? 'error'
        : transcript
          ? 'completed'
          : 'idle'
  const textLang = transcript ? textLangOf(transcript.rawTranscript) : undefined

  return (
    <main className="mx-auto w-full max-w-[880px] px-4 pt-10 pb-12 sm:px-6 sm:pt-16" data-state={uiState}>
      <header className="mb-8 text-center sm:mb-10">
        <div className="mb-4 inline-flex items-center gap-2.5">
          <WaveLogo className="size-8" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dictator</h1>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-balance text-slate-900 sm:text-4xl">
          Think out loud. Get polished text instantly.
        </p>
        <p className="mx-auto mt-3 max-w-md text-[15px] text-balance text-slate-500 sm:text-base">
          Multilingual transcription and AI refinement for clearer, more concise writing.
        </p>
      </header>

      <div className="space-y-8 rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_60px_-24px_rgb(30_41_90/0.18)] backdrop-blur-xl sm:p-10">
        <RefinementLevelSelector value={refinementLevel} onChange={changeLevel} />

        <Recorder
          status={processing ? 'processing' : refining ? 'refining' : recorder.status}
          failed={Boolean(error)}
          refinementLevel={outputLevel}
          elapsedMs={recorder.elapsedMs}
          maxDurationMs={recorder.maxDurationMs}
          stream={recorder.stream}
          onStart={startRecording}
          onStop={recorder.stop}
        />

        {(serverUnavailable || error || recorder.stoppedAtLimit) && (
          <div className="space-y-3">
            {serverUnavailable && (
              <Notice tone="warning">
                The speech service is not responding right now. If recording fails, try again in a moment.
              </Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {recorder.stoppedAtLimit && (
              <Notice tone="warning">
                Recording stopped automatically at the {formatDuration(recorder.maxDurationMs)} limit.
              </Notice>
            )}
          </div>
        )}

        <div className="space-y-6">
          <TranscriptPanel transcript={transcript?.rawTranscript} lang={textLang} />

          {refinementError && <Notice tone="warning">{refinementError}</Notice>}
          {copyStatus === 'failed' && (
            <Notice tone="warning">Could not copy automatically. Select the polished text and press Ctrl+C (⌘C on a Mac).</Notice>
          )}

          <OutputEditor
            value={polishedText}
            onChange={setPolishedText}
            lang={textLang}
            outputLevel={transcript ? outputLevel : null}
            copyStatus={copyStatus}
            onCopy={copyPolishedText}
            placeholder={
              refinementError
                ? 'No polished text. Select and copy the raw transcript above instead.'
                : refining
                  ? 'Refining…'
                  : 'Your polished text will appear here.'
            }
          />
        </div>

        <footer className="border-t border-slate-200/80 pt-6 text-[13px] leading-relaxed text-slate-500">
          <p className="flex gap-2.5">
            <LockIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <span>
              Your recording is sent to the Dictator server and to OpenAI to be transcribed and refined. Dictator does
              not store your recordings or text.
            </span>
          </p>
          <details className="group mt-2 pl-[26px]">
            <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">
              How your audio is handled
            </summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>
                Recording starts only when you press the microphone button and stops when you press it again or after{' '}
                {formatDuration(recorder.maxDurationMs)}. The microphone is released as soon as recording stops.
              </li>
              <li>
                The audio is uploaded over an encrypted connection, kept in the server&apos;s memory only while it is
                processed, and never saved to disk.
              </li>
              <li>
                The audio is sent to OpenAI for transcription, and the transcript is sent to OpenAI for refinement
                unless AI refinement is set to None. OpenAI does not use this data to train its models. Under its API
                data policy, OpenAI may keep the text sent for refinement for up to 30 days to monitor abuse.
              </li>
              <li>
                Dictator does not log transcripts and keeps no history or accounts. Your results exist only in this
                page and are gone when you close or reload it.
              </li>
              <li>Avoid dictating passwords or other information you would not want to send to these services.</li>
            </ul>
          </details>
        </footer>
      </div>

      {latencyEnabled && <LatencyPanel runs={latencyRuns} onClear={() => setLatencyRuns([])} />}
    </main>
  )
}

export default App
