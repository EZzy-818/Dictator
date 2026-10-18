// Global recording shortcuts: what may be chosen, how a key press becomes one, and how it is
// shown. Shared by the main process (which decides) and the Settings window (which displays), so
// it must not import anything from Electron or Node.
//
// Shortcuts are stored as Electron accelerators in one canonical form, modifiers in the order
// macOS shows them (⌃⌥⇧⌘): for example "Control+Alt+Space" or "Shift+Command+D".

export const DEFAULT_SHORTCUT = 'Control+Alt+Space'

const MODIFIERS = ['Control', 'Alt', 'Shift', 'Command']
const MODIFIER_ALIASES = {
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  command: 'Command',
  cmd: 'Command',
}
const SYMBOLS = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }
// The modifiers that make a letter, number or Space a shortcut instead of typing.
const STRONG = ['Control', 'Alt', 'Command']
const FUNCTION_KEY = /^F([1-9]|1[0-9]|20)$/

// Combinations macOS keeps for itself (in its default setup). Registering them may succeed and
// then never fire, or take the shortcut away from the system, so they are refused up front.
const RESERVED = {
  'Command+Space': 'Spotlight',
  'Control+Space': 'switching input sources',
  'Alt+Command+Space': 'Finder search',
  'Control+Command+Space': 'the Character Viewer',
  'Shift+Command+3': 'screenshots',
  'Shift+Command+4': 'screenshots',
  'Shift+Command+5': 'screenshots',
  'Shift+Command+6': 'Touch Bar screenshots',
  'Control+Shift+Command+3': 'screenshots',
  'Control+Shift+Command+4': 'screenshots',
  'Shift+Command+Q': 'logging out',
  'Alt+Shift+Command+Q': 'logging out',
  'Control+Command+Q': 'locking the screen',
  'Control+Command+F': 'full screen',
  'Alt+Command+D': 'showing and hiding the Dock',
  'Alt+Command+H': 'hiding other apps',
  'Command+F5': 'VoiceOver',
  'Alt+Command+F5': 'Accessibility Shortcuts',
  'Control+F1': 'keyboard navigation',
  'Control+F2': 'keyboard navigation',
  'Control+F3': 'keyboard navigation',
  'Control+F4': 'keyboard navigation',
  'Control+F5': 'keyboard navigation',
  'Control+F6': 'keyboard navigation',
  'Control+F7': 'keyboard navigation',
  'Control+F8': 'keyboard navigation',
}

function normalizeKey(token) {
  if (/^[a-z]$/i.test(token)) return token.toUpperCase()
  if (/^[0-9]$/.test(token)) return token
  if (/^space$/i.test(token)) return 'Space'
  const fn = token.toUpperCase()
  return FUNCTION_KEY.test(fn) ? fn : null
}

/** "Shift+Command+D" → "⇧⌘D". Anything unparseable is shown as is. */
export function shortcutLabel(accelerator) {
  const parsed = parse(accelerator)
  if (!parsed?.key) return typeof accelerator === 'string' ? accelerator : ''
  return parsed.modifiers.map((m) => SYMBOLS[m]).join('') + parsed.key
}

/** Symbols for the modifiers held down, for showing a shortcut while it is being pressed. */
export function modifierLabel({ control, alt, shift, meta }) {
  return [control && '⌃', alt && '⌥', shift && '⇧', meta && '⌘'].filter(Boolean).join('')
}

// { modifiers, key } in canonical order, key null when there is none; null when malformed.
function parse(accelerator) {
  if (typeof accelerator !== 'string' || accelerator.length > 64) return null
  const tokens = accelerator.split('+')
  const modifiers = new Set()
  let key = null
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES[token.toLowerCase()]
    if (modifier) {
      if (modifiers.has(modifier)) return null
      modifiers.add(modifier)
      continue
    }
    const normalized = normalizeKey(token)
    if (!normalized || key) return null
    key = normalized
  }
  return { modifiers: MODIFIERS.filter((m) => modifiers.has(m)), key }
}

/**
 * Checks a shortcut. Returns { ok: true, accelerator } with the canonical form, or
 * { ok: false, error } with a sentence to show the user. Registration (whether another app owns
 * it) is checked separately, by actually registering it.
 */
export function validateShortcut(accelerator) {
  const parsed = parse(accelerator)
  if (!parsed) return { ok: false, error: 'That shortcut isn’t supported. Use a letter, number, function key or Space.' }
  const { modifiers, key } = parsed
  if (!key) return { ok: false, error: 'Add a letter, number or function key to the modifier keys.' }
  const canonical = [...modifiers, key].join('+')
  const label = shortcutLabel(canonical)
  if (!FUNCTION_KEY.test(key) && !modifiers.some((m) => STRONG.includes(m))) {
    return { ok: false, error: `${label} would block typing. Letters, numbers and Space need ⌘, ⌃ or ⌥.` }
  }
  if (modifiers.length === 1 && modifiers[0] === 'Command' && key !== 'Space') {
    return { ok: false, error: `${label} is a standard app shortcut. Add ⌃, ⌥ or ⇧.` }
  }
  if (RESERVED[canonical]) return { ok: false, error: `${label} is reserved by macOS for ${RESERVED[canonical]}.` }
  return { ok: true, accelerator: canonical }
}

/**
 * Turns a key press (an Electron before-input-event input, or a DOM KeyboardEvent's fields) into
 * a shortcut. Uses the physical key (code), so ⌥D is "D" and not "∂" whatever the layout.
 * Returns one of:
 *   { cancel: true }          Escape with no modifiers
 *   { modifiersOnly: true }   only modifier keys so far; keep waiting
 *   { ok: true, accelerator } / { ok: false, error }  as validateShortcut
 */
export function shortcutFromKey({ code, control, alt, shift, meta }) {
  if (typeof code !== 'string') return { ok: false, error: 'That key isn’t supported.' }
  if (/^(Meta|OS|Control|Alt|Shift)(Left|Right)?$/.test(code) || code === 'CapsLock' || code === 'Fn') return { modifiersOnly: true }
  if (code === 'Escape' && !control && !alt && !shift && !meta) return { cancel: true }
  const key = /^Key([A-Z])$/.exec(code)?.[1] ?? /^Digit([0-9])$/.exec(code)?.[1] ?? (code === 'Space' ? 'Space' : FUNCTION_KEY.test(code) ? code : null)
  if (!key) return { ok: false, error: 'That key isn’t supported. Use a letter, number, function key or Space.' }
  const modifiers = [control && 'Control', alt && 'Alt', shift && 'Shift', meta && 'Command'].filter(Boolean)
  return validateShortcut([...modifiers, key].join('+'))
}
