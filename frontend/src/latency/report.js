// Latency profiling for the developer panel. Browser marks are performance.now() readings on
// this page's clock; server stages are durations the backend measured on its own clock. The two
// are never mixed as timestamps: the only cross-machine figure is the network estimate, which
// subtracts one duration (the server's total) from another (the browser's round trip).

const STORAGE_KEY = 'dictator.latencyPanel'
const RUN_LIMIT = 50

// The panel shows in `vite dev`, or anywhere after opening the page once with ?latency=1
// (?latency=0 turns it off again). Regular visitors never see it.
export function isLatencyPanelEnabled({ mode = import.meta.env.MODE, location = globalThis.location, storage } = {}) {
  if (mode === 'development') return true
  try {
    storage ??= globalThis.localStorage
    const flag = new URLSearchParams(location?.search ?? '').get('latency')
    if (flag === '1') storage.setItem(STORAGE_KEY, 'on')
    if (flag === '0') storage.removeItem(STORAGE_KEY)
    return storage.getItem(STORAGE_KEY) === 'on'
  } catch {
    // Storage blocked (private mode, sandboxed frame): the panel stays off.
    return false
  }
}

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const diff = (end, start) => (Number.isFinite(end) && Number.isFinite(start) ? Math.max(0, end - start) : null)
const serverMs = (value) => (Number.isFinite(value) ? value : null)

function stage(key, label, ms, { source, estimate = false, status } = {}) {
  return { key, label, ms, source, estimate, status: status ?? (ms === null ? 'unavailable' : 'success') }
}

/**
 * Turns one recording's marks into the panel's rows.
 *
 * trace: {
 *   requestId, refinementLevel,
 *   stopRequestedAt, blobReadyAt,    from the recorder
 *   requestStartedAt, responseAt,    from the API call
 *   displayedAt,                     after the result was painted
 *   server,                          the backend's timings object, if it sent one
 *   outcome, errorCode               'success' | 'refinement_failed' | 'failed'
 * }
 * The rows add up to the total: when the server sent its timings, the network row is the rest
 * of the browser's round trip after the server's own time.
 */
export function buildLatencyReport(trace) {
  const server = trace.server ?? null
  const roundTripMs = diff(trace.responseAt, trace.requestStartedAt)
  const browser = { source: 'browser' }
  const stages = [
    stage('finalization', 'Audio finalization', diff(trace.blobReadyAt, trace.stopRequestedAt), browser),
    stage('setup', 'Request setup', diff(trace.requestStartedAt, trace.blobReadyAt), browser),
  ]

  if (server && roundTripMs !== null) {
    const serverTotal = serverMs(server.totalMs) ?? 0
    stages.push(
      stage('upload', 'Upload (server receive)', serverMs(server.receiveMs), {
        source: 'server',
        status: server.receiveStatus,
      }),
      stage('network', 'Network & proxy', Math.max(0, roundTripMs - serverTotal), {
        source: 'browser − server',
        estimate: true,
      }),
    )
  } else {
    // No server breakdown (timings off, or the request never got an answer): the whole round trip in one row.
    stages.push(stage('roundTrip', 'Request round trip', roundTripMs, browser))
  }

  stages.push(
    stage('transcription', 'Transcription API', serverMs(server?.transcriptionMs), {
      source: 'server',
      status: server ? server.transcriptionStatus : 'not_reported',
    }),
    stage('refinement', 'AI refinement API', serverMs(server?.refinementMs), {
      source: 'server',
      status: server ? server.refinementStatus : trace.refinementLevel === 'none' ? 'skipped' : 'not_reported',
    }),
    stage('overhead', 'Backend overhead', serverMs(server?.overheadMs), {
      source: 'server',
      status: server ? undefined : 'not_reported',
    }),
    stage('display', 'Frontend display', diff(trace.displayedAt, trace.responseAt), browser),
  )

  // None skips the refinement call, which counts as 0 ms even without server timings.
  const refinement = stages.find((row) => row.key === 'refinement')
  if (refinement.status === 'skipped') refinement.ms = 0

  const totalMs = diff(trace.displayedAt, trace.stopRequestedAt)
  // The slowest directly measured stage; the network estimate is not a candidate.
  const timed = stages.filter((row) => !row.estimate && row.ms !== null && row.ms > 0)
  const slowest = timed.length ? timed.reduce((a, b) => (b.ms > a.ms ? b : a)).key : null

  return {
    requestId: trace.requestId,
    refinementLevel: trace.refinementLevel,
    outcome: trace.outcome,
    errorCode: trace.errorCode,
    stages,
    totalMs,
    slowest,
  }
}

// Linear interpolation between the two nearest ranks (the usual spreadsheet and NumPy default).
export function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const rank = (sorted.length - 1) * p
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
}

export function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return {
    count: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

export function addRun(runs, report) {
  return [...runs, report].slice(-RUN_LIMIT)
}
