// Summary statistics for latency benchmarks. Kept free of I/O so it can be unit tested.

// Linear interpolation between the two nearest ranks (the usual spreadsheet and NumPy default).
// With 5 runs, p95 lies between the two slowest runs, so it says little more than the maximum.
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

export function mean(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

// Groups rows by the key function, keeping first-seen order.
export function groupBy(rows, key) {
  const groups = new Map()
  for (const row of rows) {
    const k = key(row)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(row)
  }
  return groups
}

/**
 * Stats for one group of benchmark runs. Only successful runs count toward the latency
 * figures; failures are counted separately so they are visible but do not skew the timings.
 * stageKeys: the per-run fields to average, such as transcriptionMs.
 */
export function describeRuns(runs, { totalKey, stageKeys }) {
  const ok = runs.filter((run) => run.ok)
  return {
    runs: runs.length,
    failed: runs.length - ok.length,
    total: summarize(ok.map((run) => run[totalKey])),
    stages: Object.fromEntries(stageKeys.map((key) => [key, mean(ok.map((run) => run[key]))])),
  }
}
