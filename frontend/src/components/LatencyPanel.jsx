import { useState } from 'react'
import { summarize } from '../latency/report.js'

// Developer-only latency readout. It floats over the page and is rendered only when the panel is
// turned on (see isLatencyPanelEnabled), so the regular page is unchanged.

const ms = (value) => `${Math.round(value).toLocaleString('en-US')} ms`

function stageValue(row) {
  switch (row.status) {
    case 'skipped':
      return '0 ms · skipped'
    case 'failed':
      return row.ms === null ? 'failed' : `${ms(row.ms)} · failed`
    case 'not_run':
      return 'not run'
    case 'not_reported':
      return 'not reported'
    default:
      if (row.ms === null) return '—'
      return row.estimate ? `~${ms(row.ms)}` : ms(row.ms)
  }
}

const OUTCOME = { success: 'ok', refinement_failed: 'refinement failed', failed: 'failed' }

function LatencyPanel({ runs, onClear }) {
  const [copied, setCopied] = useState(false)
  const run = runs.at(-1)
  const totals = summarize(runs.filter((r) => r.outcome !== 'failed').map((r) => r.totalMs))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(runs, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <aside
      aria-label="Dictator Performance"
      className="fixed right-3 bottom-3 z-50 w-[min(340px,calc(100vw-24px))] rounded-xl border border-slate-700 bg-slate-900/95 font-mono text-[12px] leading-5 text-slate-100 shadow-2xl"
    >
      <details open>
        <summary className="cursor-pointer px-3 py-2 font-semibold select-none">
          Dictator Performance
          {run && (
            <span className="ml-2 font-normal text-slate-400">
              {run.refinementLevel} · {OUTCOME[run.outcome] ?? run.outcome}
            </span>
          )}
        </summary>
        <div className="border-t border-slate-700 px-3 pt-2 pb-3">
          {!run ? (
            <p className="text-slate-400">Record something to see where the time goes.</p>
          ) : (
            <>
              <table className="w-full">
                <tbody>
                  {run.stages.map((row) => (
                    <tr key={row.key} className={row.key === run.slowest ? 'text-amber-300' : undefined}>
                      <th scope="row" className="py-px pr-2 text-left font-normal">
                        {row.label}
                        {row.key === run.slowest && <span className="ml-1 text-[10px] uppercase">slowest</span>}
                      </th>
                      <td className="py-px text-right tabular-nums">{stageValue(row)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-700 font-semibold">
                    <th scope="row" className="pt-1 pr-2 text-left">
                      Total latency
                    </th>
                    <td className="pt-1 text-right tabular-nums">{run.totalMs === null ? '—' : ms(run.totalMs)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                Measured unless marked ~ (estimate: browser round trip minus server time). Total runs from Stop to the
                text being painted.
                {run.errorCode && ` Error: ${run.errorCode}.`}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-500" title={run.requestId}>
                Request {run.requestId}
              </p>
            </>
          )}
          {totals && (
            <p className="mt-2 border-t border-slate-700 pt-2 text-[11px] leading-4 text-slate-300">
              {totals.count} run{totals.count === 1 ? '' : 's'}: mean {ms(totals.mean)} · p50 {ms(totals.p50)} · p95{' '}
              {ms(totals.p95)} · min {ms(totals.min)} · max {ms(totals.max)}
            </p>
          )}
          {runs.length > 0 && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800"
              >
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </details>
    </aside>
  )
}

export default LatencyPanel
