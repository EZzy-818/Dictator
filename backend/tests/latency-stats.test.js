import { describe, expect, it } from 'vitest'
import { describeRuns, groupBy, mean, percentile, summarize } from '../eval/latency-stats.js'

describe('latency stats', () => {
  it('computes mean, p50, p95, min and max', () => {
    expect(summarize([300, 100, 200, 500, 400])).toEqual({ count: 5, mean: 300, p50: 300, p95: 480, min: 100, max: 500 })
  })

  it('interpolates percentiles between ranks', () => {
    expect(percentile([100, 200], 0.5)).toBe(150)
    expect(percentile([100, 200, 300, 400], 0.95)).toBeCloseTo(385)
    expect(percentile([7], 0.95)).toBe(7)
    expect(percentile([], 0.5)).toBeNull()
  })

  it('ignores missing values', () => {
    expect(summarize([null, 100, undefined])).toMatchObject({ count: 1, p50: 100 })
    expect(summarize([])).toBeNull()
    expect(mean([null, 2, 4])).toBe(3)
    expect(mean([null])).toBeNull()
  })

  it('counts failures separately and leaves them out of the timings', () => {
    const runs = [
      { ok: true, roundTripMs: 1000, transcriptionMs: 600, refinementMs: 0 },
      { ok: true, roundTripMs: 2000, transcriptionMs: 800, refinementMs: 0 },
      { ok: false, roundTripMs: 50, transcriptionMs: 40, refinementMs: null },
    ]
    expect(describeRuns(runs, { totalKey: 'roundTripMs', stageKeys: ['transcriptionMs', 'refinementMs'] })).toEqual({
      runs: 3,
      failed: 1,
      total: { count: 2, mean: 1500, p50: 1500, p95: 1950, min: 1000, max: 2000 },
      stages: { transcriptionMs: 700, refinementMs: 0 },
    })
  })

  it('groups in first-seen order', () => {
    const groups = groupBy([{ l: 'b' }, { l: 'a' }, { l: 'b' }], (row) => row.l)
    expect([...groups.keys()]).toEqual(['b', 'a'])
    expect(groups.get('b')).toHaveLength(2)
  })
})
