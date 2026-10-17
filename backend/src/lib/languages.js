export const SUPPORTED_LANGUAGES = ['auto', 'en', 'zh']
export const DEFAULT_LANGUAGE = 'auto'

export function isSupportedLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value)
}
