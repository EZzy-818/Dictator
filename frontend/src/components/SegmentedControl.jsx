// A row of radio buttons styled as one pill, with a bubble that slides to the selected option.
// options: [{ value, label, lang? }]. Arrow keys move between options, as with any radio group.
function SegmentedControl({ legend, name, options, value, onChange, disabled = false, children }) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mx-auto mb-3 text-center text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {legend}
      </legend>
      <div
        className="relative mx-auto grid w-full max-w-md rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/70 ring-inset"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden="true"
          className="ease-spring absolute top-1 bottom-1 left-1 rounded-full bg-white shadow-[0_1px_2px_rgb(15_23_42/0.08),0_4px_12px_rgb(79_125_255/0.15)] ring-1 ring-slate-200/60 transition-transform duration-500 motion-reduce:transition-none"
          style={{
            width: `calc((100% - 0.5rem) / ${options.length})`,
            transform: `translateX(${selectedIndex * 100}%)`,
          }}
        />
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              lang={option.lang}
              className={`relative z-10 flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium transition-colors duration-200 select-none has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-blue ${
                selected ? 'text-brand-blue' : 'text-slate-500 hover:text-slate-800'
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
