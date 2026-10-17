import { randomUUID } from 'node:crypto'

// Per-request stage durations for latency profiling. Only durations, statuses and the request
// ID are kept: never audio, transcripts or anything else the person sent.
// Every mark comes from this server's monotonic clock. The browser measures its own stages on
// its own clock; the two are joined by request ID and compared only as durations.

// What the browser may send as its request ID; anything else is replaced by a server-made one.
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/

export const STAGES = ['receive', 'transcription', 'refinement']

export function cleanRequestId(value) {
  return typeof value === 'string' && REQUEST_ID.test(value) ? value : null
}

const round = (ms) => Math.round(ms * 10) / 10

/**
 * Starts timing a request at the moment the server sees it (its headers have arrived).
 * now: a monotonic clock in milliseconds; injectable for tests.
 */
export function createTiming({ now = () => performance.now() } = {}) {
  const startedAt = now()
  const stages = {}
  let requestId = randomUUID()
  let summary = null

  return {
    get requestId() {
      return requestId
    },

    // Uses the browser's ID when it sent a valid one, so both sides can be matched.
    setRequestId(value) {
      requestId = cleanRequestId(value) ?? requestId
    },

    // Milliseconds since the request arrived.
    elapsed() {
      return now() - startedAt
    },

    record(stage, ms, status = 'success') {
      stages[stage] = { ms, status }
    },

    // Runs fn and records how long it took and whether it succeeded. Errors pass through.
    async measure(stage, fn) {
      const started = now()
      try {
        const result = await fn()
        stages[stage] = { ms: now() - started, status: 'success' }
        return result
      } catch (err) {
        stages[stage] = { ms: now() - started, status: 'failed' }
        throw err
      }
    },

    // The stage did not need to run (refinement at None). It counts as 0 ms.
    skip(stage) {
      stages[stage] = { ms: 0, status: 'skipped' }
    },

    /**
     * The timings up to now, frozen on first call so the response and the log agree.
     * Stages that never started (an earlier one failed) are null with status "not_run".
     * overheadMs is everything else the server did: validation, usage limits, routing and
     * building the response. It is measured as the rest of totalMs on the same clock.
     */
    summary() {
      if (summary) return summary
      const totalMs = now() - startedAt
      const result = { requestId, totalMs: round(totalMs) }
      let stagesMs = 0
      for (const stage of STAGES) {
        const entry = stages[stage]
        result[`${stage}Ms`] = entry ? round(entry.ms) : null
        result[`${stage}Status`] = entry?.status ?? 'not_run'
        stagesMs += entry?.ms ?? 0
      }
      result.overheadMs = round(Math.max(0, totalMs - stagesMs))
      summary = result
      return summary
    },
  }
}
