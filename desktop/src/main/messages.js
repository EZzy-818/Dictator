// What the desktop app says to the user. Recorder error codes come from the web app's
// useAudioRecorder; the wording here points at macOS settings instead of a browser's.

export const RECORDER_MESSAGES = {
  'permission-denied': 'Microphone access is off. Turn on Dictator in System Settings › Privacy & Security › Microphone.',
  'no-microphone': 'No microphone was found. Connect one and try again.',
  'microphone-busy': 'The microphone could not be started. Another app may be using it.',
  'microphone-error': 'Could not access the microphone. Please try again.',
  'insecure-context': 'Recording is not available in this build.',
  'unsupported-browser': 'Recording is not available in this build.',
  'unsupported-format': 'Recording is not available in this build.',
  empty: 'No audio was captured. Please try again.',
  'too-short': 'The recording was too short. Press the hotkey, speak, then press it again.',
  'recording-failed': 'Recording failed unexpectedly. Please try again.',
}

export const MESSAGES = {
  starting: 'Starting…',
  recording: 'Recording',
  transcribing: 'Transcribing…',
  slow: 'Still transcribing… the server may be waking up.',
  busy: 'Still transcribing. Please wait.',
  copied: 'Copied to clipboard',
  copiedRaw: 'Copied raw transcript (refinement failed)',
  noSpeech: 'No speech was detected. Nothing was copied.',
  silent: 'No sound reached the microphone. Check the input in System Settings › Sound (a closed MacBook lid turns off the built-in microphone).',
  copyFailed: 'Could not copy to the clipboard. Use Copy Last Transcript in the menu bar.',
  recopied: 'Copied last transcript again',
  // Auto-Paste. "Pasted" only when the text field's length changed by exactly the text's length.
  pasted: 'Pasted',
  pastedRaw: 'Pasted raw transcript (refinement failed)',
  pasteAttempted: 'Paste attempted. The text is also on the clipboard.',
  pasteAttemptedRaw: 'Paste attempted with the raw transcript (refinement failed). Also on the clipboard.',
}

// Why Auto-Paste did not paste, after "Copied to clipboard. Not pasted: ".
export const PASTE_SKIPPED = {
  unsupported: 'Auto-Paste is not available on this computer.',
  accessibility: 'Dictator needs Accessibility access (see Settings).',
  'no-app': 'the app you were in could not be detected.',
  self: 'Dictator was the active app.',
  'app-changed': 'you switched apps.',
  secure: 'password fields are never pasted into.',
  'no-target': 'no text field was detected.',
  failed: 'macOS did not respond.',
}

/** What the pill says after a successful dictation, for each Auto-Paste result. */
export function deliveryMessage({ refined, output, delivery, reason }) {
  const copied = refined ? MESSAGES.copied : MESSAGES.copiedRaw
  if (output !== 'paste') return copied
  if (delivery === 'pasted') return refined ? MESSAGES.pasted : MESSAGES.pastedRaw
  if (delivery === 'attempted') return refined ? MESSAGES.pasteAttempted : MESSAGES.pasteAttemptedRaw
  return `${copied}. Not pasted: ${PASTE_SKIPPED[reason] ?? PASTE_SKIPPED.failed}`
}

export function recorderMessage(code) {
  return RECORDER_MESSAGES[code] ?? RECORDER_MESSAGES['recording-failed']
}
