const BUTTON =
  'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Copy failed' }

/**
 * Editable polished text with Copy, Retry Refinement, and Record Again.
 * value is null while there is no polished text (for example after a refinement failure).
 */
function OutputEditor({ value, onChange, lang, copyStatus, onCopy, refining, onRetry, onRecordAgain, disabled }) {
  const hasText = value !== null

  return (
    <section>
      <label htmlFor="polished-text" className="mb-2 block text-sm font-medium text-slate-700">
        Polished text
      </label>
      <textarea
        id="polished-text"
        lang={lang}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={!hasText || refining}
        placeholder={refining ? 'Refining…' : hasText ? '' : 'No polished text yet. Retry refinement, or copy from the raw transcript.'}
        rows={6}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-slate-900 disabled:bg-slate-100"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={onCopy} disabled={!hasText || refining} className={BUTTON}>
          {COPY_LABEL[copyStatus]}
        </button>
        <button type="button" onClick={onRetry} disabled={refining || disabled} className={BUTTON}>
          {refining ? 'Refining…' : 'Retry Refinement'}
        </button>
        <button type="button" onClick={onRecordAgain} disabled={refining || disabled} className={BUTTON}>
          Record Again
        </button>
      </div>
    </section>
  )
}

export default OutputEditor
