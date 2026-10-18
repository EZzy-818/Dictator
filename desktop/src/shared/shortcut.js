// Global recording shortcuts: how a key press becomes one, how it is checked, and how it is
// shown. Any key may be chosen, alone or with modifiers; risky choices get a warning, not a refusal. Shared by the main process (which decides) and the Settings window (which displays), so
// it must not import anything from Electron or Node.
//
// Shortcuts are stored as Electron accelerators in one canonical form, modifiers in the order
// macOS shows them (⌃⌥⇧⌘): for example "Control+Alt+Space" or "Shift+Command+D".

export const DEFAULT_SHORTCUT = 'Control+Alt+Space'

// The one thing that can't be a shortcut: macOS global hotkeys need a key besides the modifiers.
export const MODIFIERS_ONLY = 'Modifier keys on their own can’t be a shortcut (macOS needs one more key). Hold them and press another key.'

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
const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/

// Physical keys (KeyboardEvent.code) that are not letters, digits or function keys, with the
// Electron accelerator name for each and how it is shown.
const KEYS = {
  Space: ['Space', 'Space'],
  Enter: ['Return', '↩'],
  Tab: ['Tab', '⇥'],
  Backspace: ['Backspace', '⌫'],
  Delete: ['Delete', '⌦'],
  Insert: ['Insert', 'Insert'],
  Escape: ['Escape', '⎋'],
  ArrowUp: ['Up', '↑'],
  ArrowDown: ['Down', '↓'],
  ArrowLeft: ['Left', '←'],
  ArrowRight: ['Right', '→'],
  Home: ['Home', '↖'],
  End: ['End', '↘'],
  PageUp: ['PageUp', '⇞'],
  PageDown: ['PageDown', '⇟'],
  Minus: ['-', '-'],
  Equal: ['=', '='],
  BracketLeft: ['[', '['],
  BracketRight: [']', ']'],
  Backslash: ['\\', '\\'],
  Semicolon: [';', ';'],
  Quote: ["'", "'"],
  Comma: [',', ','],
  Period: ['.', '.'],
  Slash: ['/', '/'],
  Backquote: ['`', '`'],
  NumpadAdd: ['numadd', 'Keypad +'],
  NumpadSubtract: ['numsub', 'Keypad −'],
  NumpadMultiply: ['nummult', 'Keypad ×'],
  NumpadDivide: ['numdiv', 'Keypad ÷'],
  NumpadDecimal: ['numdec', 'Keypad .'],
}
for (let digit = 0; digit <= 9; digit++) KEYS[`Numpad${digit}`] = [`num${digit}`, `Keypad ${digit}`]

// Accelerator key name (lowercase) → [canonical name, label].
const KEY_NAMES = Object.fromEntries(Object.values(KEYS).map(([name, label]) => [name.toLowerCase(), [name, label]]))
KEY_NAMES.enter = KEY_NAMES.return
KEY_NAMES.esc = KEY_NAMES.escape

// Typing keys: on their own (or with only ⇧) they type text, so a shortcut made of them stops
// that key from typing anywhere while Dictator runs.
const TYPING_KEY = /^([A-Z0-9]|Space|Return|Tab|Backspace|Delete|Up|Down|Left|Right|[-=[\]\\;',./`]|num.*)$/

// Combinations macOS keeps for itself in its default setup. They are allowed, but the user is
// told, because registering them may succeed and then never fire.
const RESERVED = {
  'Command+Space': 'Spotlight',
  'Control+Space': 'switching input sources',
  'Alt+Command+Space': 'Finder search',
  'Control+Command+Space': 'the Character Viewer',
  'Shift+Command+3': 'screenshots',
  'Shift+Command+4': 'screenshots',
  'Shift+Command+5': 'screenshots',
  'Control+Shift+Command+3': 'screenshots',
  'Control+Shift+Command+4': 'screenshots',
  'Shift+Command+Q': 'logging out',
  'Control+Command+Q': 'locking the screen',
  'Control+Command+F': 'full screen',
  'Alt+Command+D': 'showing and hiding the Dock',
  'Command+Tab': 'switching apps',
  'Command+F5': 'VoiceOver',
}

function normalizeKey(token) {
  if (/^[a-z]$/i.test(token)) return token.toUpperCase()
  if (/^[0-9]$/.test(token)) return token
  const fn = token.toUpperCase()
  if (FUNCTION_KEY.test(fn)) return fn
  return KEY_NAMES[token.toLowerCase()]?.[0] ?? null
}

function keyLabel(key) {
  return KEY_NAMES[key.toLowerCase()]?.[1] ?? key
}

/** "Shift+Command+D" → "⇧⌘D". Anything unparseable is shown as is. */
export function shortcutLabel(accelerator) {
  const parsed = parse(accelerator)
  if (!parsed?.key) return typeof accelerator === 'string' ? accelerator : ''
  return parsed.modifiers.map((m) => SYMBOLS[m]).join('') + keyLabel(parsed.key)
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
 * Checks a shortcut. Any supported key works, with or without modifiers: the user decides.
 * Returns { ok: true, accelerator, warning? } with the canonical form and, for a choice that may
 * get in the way, a sentence saying how; or { ok: false, error } when it is not a shortcut at all
 * (modifier keys only, or not parseable). Whether another app owns it is checked separately, by
 * actually registering it.
 */
export function validateShortcut(accelerator) {
  const parsed = parse(accelerator)
  if (!parsed) return { ok: false, error: 'That shortcut isn’t supported.' }
  const { modifiers, key } = parsed
  if (!key) return { ok: false, error: MODIFIERS_ONLY }
  const canonical = [...modifiers, key].join('+')
  const warning = shortcutWarning(canonical, modifiers, key)
  return warning ? { ok: true, accelerator: canonical, warning } : { ok: true, accelerator: canonical }
}

function shortcutWarning(canonical, modifiers, key) {
  const label = shortcutLabel(canonical)
  if (RESERVED[canonical]) return `macOS uses ${label} for ${RESERVED[canonical]}, so it may never reach Dictator.`
  if (TYPING_KEY.test(key) && modifiers.every((m) => m === 'Shift')) return `While Dictator runs, ${label} starts dictation everywhere and no longer types.`
  if (TYPING_KEY.test(key) && modifiers.length === 1 && modifiers[0] === 'Command') return `While Dictator runs, ${label} starts dictation instead of its usual action in every app.`
  return null
}

/**
 * Turns a key press (an Electron before-input-event input, or a DOM KeyboardEvent's fields) into
 * a shortcut. Uses the physical key (code), so ⌥D is "D" and not "∂" whatever the layout.
 * Returns one of:
 *   { cancel: true }          Escape with no modifiers
 *   { modifiersOnly: true }   only modifier keys so far; keep waiting
 *   { ok: true, accelerator, warning? } / { ok: false, error }  as validateShortcut
 */
export function shortcutFromKey({ code, control, alt, shift, meta }) {
  if (typeof code !== 'string') return { ok: false, error: 'That key isn’t supported.' }
  if (/^(Meta|OS|Control|Alt|Shift)(Left|Right)?$/.test(code) || code === 'CapsLock' || code === 'Fn') return { modifiersOnly: true }
  if (code === 'Escape' && !control && !alt && !shift && !meta) return { cancel: true }
  const key = /^Key([A-Z])$/.exec(code)?.[1] ?? /^Digit([0-9])$/.exec(code)?.[1] ?? (FUNCTION_KEY.test(code) ? code : KEYS[code]?.[0])
  if (!key) return { ok: false, error: 'macOS can’t use that key in a shortcut. Try another key.' }
  const modifiers = [control && 'Control', alt && 'Alt', shift && 'Shift', meta && 'Command'].filter(Boolean)
  return validateShortcut([...modifiers, key].join('+'))
}
