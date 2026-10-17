// Must match the levels the backend accepts (backend/src/lib/refinementLevels.js).
export const REFINEMENT_LEVEL_OPTIONS = [
  { value: 'none', label: 'None', description: 'Raw transcription with no AI refinement.' },
  { value: 'light', label: 'Light', description: 'Removes filler words and corrects grammar.' },
  { value: 'medium', label: 'Medium', description: 'Improves clarity and conciseness while preserving the meaning.' },
]

export const DEFAULT_REFINEMENT_LEVEL = 'light'
