// Must match the levels the backend accepts (backend/src/lib/refinementLevels.js).
export const REFINEMENT_LEVEL_OPTIONS = [
  { value: 'none', label: 'None', description: 'No changes' },
  { value: 'light', label: 'Light', description: 'Clean up filler words and grammar' },
  { value: 'medium', label: 'Medium', description: 'Improve clarity and conciseness' },
]

export const DEFAULT_REFINEMENT_LEVEL = 'light'
