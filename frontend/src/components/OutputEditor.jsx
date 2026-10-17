const BUTTON =
  'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Copy failed' }

const OUTPUT_LEVEL_TEXT = { none: 'No refinement', light: 'Light refinement', medium: 'Medium refinement' }

/**
 * Editable polished text with Copy.
 * value is null while there is no polished text (after a refinement failure).
 * outputLevel is the refinement level the text was made with.
 */
function OutputEditor({ value, onChange, lang, outputLevel, copyStatus, onCopy }) {
  const hasText = value !== null

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor="polished-text" className="text-sm font-medium text-slate-700">
          Polished text
        </label>
        {outputLevel && (
          <span className="text-xs text-slate-500" data-testid="output-level">
            {OUTPUT_LEVEL_TEXT[outputLevel]}
          </span>
        )}
      </div>
      <textarea
        id="polished-text"
        lang={lang}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={!hasText}
        placeholder={hasText ? '' : 'No polished text. Copy from the raw transcript above.'}
        rows={6}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-slate-900 disabled:bg-slate-100"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={onCopy} disabled={!hasText} className={BUTTON}>
          {COPY_LABEL[copyStatus]}
        </button>
      </div>
    </section>
  )
}

export default OutputEditor
