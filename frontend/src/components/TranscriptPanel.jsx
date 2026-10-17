function TranscriptPanel({ transcript, lang }) {
  return (
    <section>
      <label htmlFor="raw-transcript" className="mb-2 block text-sm font-medium text-slate-700">
        Raw transcript
      </label>
      <textarea
        id="raw-transcript"
        lang={lang}
        readOnly
        value={transcript}
        rows={4}
        className="w-full resize-y rounded-lg border border-slate-300 bg-slate-100 p-3 text-slate-800"
      />
    </section>
  )
}

export default TranscriptPanel
