// Read-only. Deliberately has no copy action: the one Copy button sits under the polished text.
function TranscriptPanel({ transcript, lang }) {
  return (
    <section>
      <label htmlFor="raw-transcript" className="mb-2 block text-sm font-medium text-slate-600">
        Raw transcript
      </label>
      <textarea
        id="raw-transcript"
        lang={lang}
        readOnly
        value={transcript ?? ''}
        placeholder="Your words will appear here after you record."
        rows={4}
        className="block w-full resize-y rounded-2xl border-0 bg-slate-100/80 px-4 py-3.5 text-[15px] leading-relaxed text-slate-700 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
      />
    </section>
  )
}

export default TranscriptPanel
