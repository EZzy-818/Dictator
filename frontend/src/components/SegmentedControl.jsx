// A row of radio buttons styled as one control. options: [{ value, label, lang? }]
function SegmentedControl({ legend, name, options, value, onChange, disabled = false, children }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              lang={option.lang}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-slate-900 ${
                selected ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
      {children}
    </fieldset>
  )
}

export default SegmentedControl
