// Auto-Paste (experimental): after a dictation the final text is on the clipboard, and if the
// app the user was in when recording started is still in front with a text field focused,
// Dictator sends one ⌘V to it. It never types, never presses Return, never changes another
// app's text directly and never brings an app back to the front. Whenever it can't tell that
// pasting is safe, it skips it and the text stays on the clipboard to paste by hand.
// It owns no Electron objects (macOS calls are in macAutomation.js), so it can be tested on its own.

// Why a paste was skipped. Each one leaves the text on the clipboard.
export const SKIP_REASONS = [
  'unsupported', // not macOS, or the helper is missing from this build
  'accessibility', // Dictator has no Accessibility access
  'no-app', // the app in front at the start could not be read
  'self', // Dictator itself was in front (its Settings window)
  'app-changed', // another app is in front now
  'secure', // a password field, or macOS secure input is on
  'no-target', // no text field could be detected
  'failed', // the macOS calls failed
]

// Accessibility roles of text fields (AXSearchField is a subrole of AXTextField).
const TEXT_ROLES = new Set(['AXTextField', 'AXTextArea', 'AXComboBox'])
const SECURE = 'AXSecureTextField'

/** Whether the focused element looks like somewhere text can be pasted. */
export function isEditable(focused) {
  if (!focused) return false
  if (TEXT_ROLES.has(focused.role)) return true
  // Rich text areas some apps report with another role still take a value and count characters.
  return focused.settable === true && typeof focused.chars === 'number'
}

export function isSecure(facts) {
  const focused = facts.focused
  return facts.secureInput === true || focused?.role === SECURE || focused?.subrole === SECURE
}

/**
 * Decides from what macOS reported just before pasting whether to send ⌘V.
 * target: the app in front when recording started, { pid, bundleId }.
 * facts: automation.inspect(target.pid), see macAutomation.js.
 * Returns { ok: true, expectedChars } or { ok: false, reason }. expectedChars is the field's
 * length once the text is in (replacing any selection), used to confirm the paste; null if unknown.
 */
export function checkTarget(facts, target, text) {
  if (facts.trusted === false) return { ok: false, reason: 'accessibility' }
  const front = facts.front
  if (!front || front.pid !== target.pid || front.bundleId !== target.bundleId) return { ok: false, reason: 'app-changed' }
  if (isSecure(facts)) return { ok: false, reason: 'secure' }
  const focused = facts.focused
  // The focused element must belong to that app; a system dialog or another process's panel doesn't count.
  if (!focused || focused.pid !== target.pid || !isEditable(focused)) return { ok: false, reason: 'no-target' }
  const expectedChars = typeof focused.chars === 'number' ? focused.chars - (focused.selection?.length ?? 0) + text.length : null
  return { ok: true, expectedChars }
}

/**
 * automation (macAutomation.js, or a fake in tests):
 *   isSupported() → boolean
 *   isTrusted() → boolean  whether Dictator itself has Accessibility access
 *   frontmostApp() → Promise<{ pid, bundleId, name } | null>
 *   inspect(pid) → Promise<{ trusted, secureInput, front, focused }>
 *   sendPaste({ pid, expectedChars }) → Promise<{ posted, reason?, confirmed }>
 *     checks again that pid is in front and no secure field is focused, then posts one ⌘V
 * selfPid: Dictator's own process id.
 *
 * captureTarget() at the start of a recording; paste(text, target) once the final text is on the
 * clipboard. paste never throws and returns { delivery: 'pasted' | 'attempted' | 'skipped', reason? }:
 *   pasted: ⌘V sent and the field's length changed by exactly the text's length
 *   attempted: ⌘V sent, but the change could not be confirmed
 *   skipped: nothing sent (reason is one of SKIP_REASONS)
 */
export function createAutoPaste({ automation, selfPid }) {
  const skipped = (reason) => ({ delivery: 'skipped', reason })

  return {
    async captureTarget() {
      if (!automation.isSupported()) return null
      try {
        const app = await automation.frontmostApp()
        return app && Number.isInteger(app.pid) ? { pid: app.pid, bundleId: app.bundleId ?? null, name: app.name ?? null } : null
      } catch {
        return null
      }
    },

    async paste(text, target) {
      if (!automation.isSupported()) return skipped('unsupported')
      if (!automation.isTrusted()) return skipped('accessibility')
      if (!target) return skipped('no-app')
      if (target.pid === selfPid) return skipped('self')
      let check
      try {
        check = checkTarget(await automation.inspect(target.pid), target, text)
      } catch {
        return skipped('failed')
      }
      if (!check.ok) return skipped(check.reason)
      let sent
      try {
        sent = await automation.sendPaste({ pid: target.pid, expectedChars: check.expectedChars })
      } catch {
        // The ⌘V may or may not have gone out; it is never sent again.
        return { delivery: 'attempted', reason: 'failed' }
      }
      if (!sent?.posted) return skipped(SKIP_REASONS.includes(sent?.reason) ? sent.reason : 'failed')
      return { delivery: sent.confirmed ? 'pasted' : 'attempted' }
    },
  }
}
