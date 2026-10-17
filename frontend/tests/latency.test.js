import { describe, expect, it, vi } from 'vitest'
import { addRun, buildLatencyReport, isLatencyPanelEnabled, percentile, summarize } from '../src/latency/report.js'

// Browser marks are performance.now() readings; server values are durations from the backend.
const SERVER = {
  requestId: 'rec-1',
  totalMs: 2450,
  receiveMs: 30,
  receiveStatus: 'success',
  transcriptionMs: 1450,
  transcriptionStatus: 'success',
  refinementMs: 920,
  refinementStatus: 'success',
  overheadMs: 50,
}

function trace(overrides = {}) {
  return {
    requestId: 'rec-1',
    refinementLevel: 'light',
    stopRequestedAt: 10_000,
    blobReadyAt: 10_085,
    requestStartedAt: 10_087,
    responseAt: 12_747,
    displayedAt: 12_762,
    server: SERVER,
    outcome: 'success',
    ...overrides,
  }
}

const row = (report, key) => report.stages.find((stage) => stage.key === key)
const msOf = (report) => Object.fromEntries(report.stages.map((stage) => [stage.key, stage.ms]))

describe('buildLatencyReport', () => {
  it('splits a successful run into stages that add up to the total', () => {
    const report = buildLatencyReport(trace())

    expect(msOf(report)).toEqual({
      finalization: 85,
      setup: 2,
      upload: 30,
      network: 210, // 2660 ms round trip − 2450 ms on the server
      transcription: 1450,
      refinement: 920,
      overhead: 50,
      display: 15,
    })
    expect(report.totalMs).toBe(2762)
    const sum = report.stages.reduce((total, stage) => total + stage.ms, 0)
    expect(sum).toBe(report.totalMs)
  })

  it('marks only the network row as an estimate and names the slowest stage', () => {
    const report = buildLatencyReport(trace())
    expect(report.stages.filter((stage) => stage.estimate).map((stage) => stage.key)).toEqual(['network'])
    expect(report.slowest).toBe('transcription')
  })

  it('never names the network estimate as the slowest stage', () => {
    const report = buildLatencyReport(trace({ responseAt: 20_000, displayedAt: 20_010 }))
    expect(row(report, 'network').ms).toBeGreaterThan(row(report, 'transcription').ms)
    expect(report.slowest).toBe('transcription')
  })

  it('reports refinement at None as skipped and 0 ms', () => {
    const server = { ...SERVER, totalMs: 1530, refinementMs: 0, refinementStatus: 'skipped' }
    const report = buildLatencyReport(trace({ refinementLevel: 'none', server }))
    expect(row(report, 'refinement')).toMatchObject({ ms: 0, status: 'skipped' })
  })

  it('reports refinement at None as skipped even when the server sends no timings', () => {
    const report = buildLatencyReport(trace({ refinementLevel: 'none', server: undefined }))
    expect(row(report, 'refinement')).toMatchObject({ ms: 0, status: 'skipped' })
    expect(row(report, 'transcription')).toMatchObject({ ms: null, status: 'not_reported' })
  })

  it('shows one round-trip row when the server sends no timings', () => {
    const report = buildLatencyReport(trace({ server: undefined }))
    expect(row(report, 'roundTrip')).toMatchObject({ ms: 2660, estimate: false })
    expect(row(report, 'network')).toBeUndefined()
    expect(row(report, 'upload')).toBeUndefined()
    expect(row(report, 'overhead').status).toBe('not_reported')
    expect(report.slowest).toBe('roundTrip')
    expect(report.totalMs).toBe(2762)
  })

  it('keeps the stages of a request that failed at transcription', () => {
    const server = {
      ...SERVER,
      totalMs: 640,
      transcriptionMs: 600,
      transcriptionStatus: 'failed',
      refinementMs: null,
      refinementStatus: 'not_run',
      overheadMs: 10,
    }
    const report = buildLatencyReport(trace({ server, outcome: 'failed', errorCode: 'transcription_failed' }))

    expect(row(report, 'transcription')).toMatchObject({ ms: 600, status: 'failed' })
    expect(row(report, 'refinement')).toMatchObject({ ms: null, status: 'not_run' })
    expect(report).toMatchObject({ outcome: 'failed', errorCode: 'transcription_failed' })
  })

  it('handles a request that never reached the server', () => {
    const report = buildLatencyReport(
      trace({
        server: undefined,
        responseAt: 10_090,
        displayedAt: 10_100,
        outcome: 'failed',
        errorCode: 'network_error',
      }),
    )
    expect(row(report, 'roundTrip').ms).toBe(3)
    expect(report.totalMs).toBe(100)
  })

  it('leaves a stage empty rather than guessing when a mark is missing', () => {
    const report = buildLatencyReport(trace({ stopRequestedAt: undefined }))
    expect(row(report, 'finalization')).toMatchObject({ ms: null, status: 'unavailable' })
    expect(report.totalMs).toBeNull()
  })

  it('never shows a negative network estimate', () => {
    const report = buildLatencyReport(trace({ server: { ...SERVER, totalMs: 9_999 } }))
    expect(row(report, 'network').ms).toBe(0)
  })

  it('carries no transcript text', () => {
    const report = buildLatencyReport(trace({ rawTranscript: 'secret' }))
    expect(JSON.stringify(report)).not.toContain('secret')
  })
})

describe('summarize', () => {
  it('computes mean, p50, p95, min and max', () => {
    expect(summarize([300, 100, 200, 500, 400])).toEqual({
      count: 5,
      mean: 300,
      p50: 300,
      p95: 480,
      min: 100,
      max: 500,
    })
  })

  it('interpolates percentiles between ranks', () => {
    expect(percentile([100, 200], 0.5)).toBe(150)
    expect(percentile([7], 0.95)).toBe(7)
    expect(percentile([], 0.5)).toBeNull()
  })

  it('ignores missing values and returns null with none left', () => {
    expect(summarize([null, 100, undefined])).toMatchObject({ count: 1, mean: 100 })
    expect(summarize([null])).toBeNull()
  })

  it('keeps the latest 50 runs', () => {
    let runs = []
    for (let i = 0; i < 55; i++) runs = addRun(runs, { requestId: String(i) })
    expect(runs).toHaveLength(50)
    expect(runs[0].requestId).toBe('5')
  })
})

describe('isLatencyPanelEnabled', () => {
  function memoryStorage() {
    const items = new Map()
    return {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, value),
      removeItem: (key) => items.delete(key),
    }
  }

  it('is on in vite dev mode', () => {
    expect(isLatencyPanelEnabled({ mode: 'development', location: { search: '' }, storage: memoryStorage() })).toBe(
      true,
    )
  })

  it('is off for regular visitors of a production build', () => {
    expect(isLatencyPanelEnabled({ mode: 'production', location: { search: '' }, storage: memoryStorage() })).toBe(
      false,
    )
  })

  it('turns on with ?latency=1, stays on, and turns off with ?latency=0', () => {
    const storage = memoryStorage()
    expect(isLatencyPanelEnabled({ mode: 'production', location: { search: '?latency=1' }, storage })).toBe(true)
    expect(isLatencyPanelEnabled({ mode: 'production', location: { search: '' }, storage })).toBe(true)
    expect(isLatencyPanelEnabled({ mode: 'production', location: { search: '?latency=0' }, storage })).toBe(false)
    expect(isLatencyPanelEnabled({ mode: 'production', location: { search: '' }, storage })).toBe(false)
  })

  it('stays off when storage is blocked', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    expect(isLatencyPanelEnabled({ mode: 'production', location: { search: '' }, storage })).toBe(false)
  })
})
