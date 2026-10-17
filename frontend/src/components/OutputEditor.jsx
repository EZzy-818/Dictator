import { CheckIcon, CopyIcon } from './icons.jsx'

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Copy failed' }

const OUTPUT_LEVEL_TEXT = { none: 'No refinement', light: 'Light refinement', medium: 'Medium refinement' }

/**
 * Editable polished text with the page's one Copy button below it.
 * value is null while there is no polished text (before a recording, or after a refinement failure).
 * outputLevel is the refinement level the text was made with.
 */
function OutputEditor({ value, onChange, lang, outputLevel, copyStatus, onCopy, placeholder }) {
  const hasText = value !== null

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="polished-text" className="text-sm font-medium text-slate-800">
          Polished text
        </label>
        {outputLevel && (
          <span
            className="rounded-full bg-gradient-to-r from-brand-blue/10 to-brand-violet/10 px-2.5 py-0.5 text-xs font-medium text-brand-violet"
            data-testid="output-level"
          >
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
        placeholder={placeholder}
        rows={6}
        className="block w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base leading-relaxed text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors placeholder:text-slate-400 focus:border-brand-blue/50 focus:ring-4 focus:ring-brand-blue/10 focus:outline-none disabled:bg-slate-50 motion-reduce:transition-none"
      />
      <button
        type="button"
        onClick={onCopy}
        disabled={!hasText}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-navy px-5 font-medium text-white shadow-[0_6px_16px_-6px_rgb(17_26_51/0.5)] transition duration-150 hover:bg-navy-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-blue active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none motion-reduce:transition-none"
      >
        {copyStatus === 'copied' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        {COPY_LABEL[copyStatus]}
      </button>
    </section>
  )
}

export default OutputEditor
