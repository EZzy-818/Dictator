function TranscriptPanel({ id, label, transcript }) {
  return (
    <section>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={id}
        readOnly
        value={transcript}
        rows={5}
        className="w-full resize-y rounded-lg border border-slate-300 bg-slate-100 p-3 text-slate-800"
      />
    </section>
  )
}

export default TranscriptPanel
