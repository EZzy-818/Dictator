import { ApiError } from './errors.js'

// none: the raw transcript as is, with no refinement request. light: cleanup only. medium: also clarity and concision.
export const REFINEMENT_LEVELS = ['none', 'light', 'medium']
export const DEFAULT_REFINEMENT_LEVEL = 'light'

export function isRefinementLevel(value) {
  return REFINEMENT_LEVELS.includes(value)
}

// An omitted level means Light, so requests from before levels existed keep working.
export function resolveRefinementLevel(value) {
  if (value === undefined) return DEFAULT_REFINEMENT_LEVEL
  if (!isRefinementLevel(value)) {
    throw new ApiError(400, 'invalid_refinement_level', 'Unsupported refinement level. Choose None, Light, or Medium.')
  }
  return value
}
