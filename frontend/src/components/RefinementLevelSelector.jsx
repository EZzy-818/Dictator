import SegmentedControl from './SegmentedControl.jsx'
import { REFINEMENT_LEVEL_OPTIONS } from '../refinementLevels.js'

// Not disabled while recording: the level is read when processing starts, so changing it never touches the microphone.
function RefinementLevelSelector({ value, onChange }) {
  const selected = REFINEMENT_LEVEL_OPTIONS.find((option) => option.value === value)
  return (
    <SegmentedControl
      legend="AI refinement"
      name="refinementLevel"
      options={REFINEMENT_LEVEL_OPTIONS}
      value={value}
      onChange={onChange}
    >
      <p className="mt-2.5 text-center text-sm text-slate-500" aria-live="polite">
        {selected?.description}
      </p>
    </SegmentedControl>
  )
}

export default RefinementLevelSelector
