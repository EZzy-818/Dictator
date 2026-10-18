// The menu bar menu as a plain template, built from the app state so it can be unit tested.

const SERVER_LABELS = {
  checking: 'Server: checking…',
  ready: 'Server: ready',
  unconfigured: 'Server: speech service not configured',
  unreachable: 'Server: unreachable',
}

const STATUS_LABELS = {
  idle: 'Ready',
  starting: 'Starting…',
  recording: 'Recording…',
  processing: 'Transcribing…',
}

/**
 * view: { version, phase, outcome, message, code, serverState, level, levels, hasLastTranscript,
 *         hotkey, hotkeyOk }
 *   levels: [{ value, label, description }] from the web app's refinementLevels.js
 *   hotkeyOk is false when another app owns the hotkey
 * actions: { toggle, setLevel(value), copyLast, openMicrophoneSettings, openSettings, quit }
 * The hotkey is chosen in the Settings window.
 */
export function buildMenuTemplate(view, actions) {
  const { phase } = view
  const status = phase === 'done' ? view.message : STATUS_LABELS[phase]
  const template = [
    { label: `Dictator ${view.version}`, enabled: false },
    { label: status, enabled: false },
    { type: 'separator' },
    {
      label: phase === 'recording' ? 'Stop Recording' : 'Start Recording',
      enabled: phase !== 'processing' && phase !== 'starting',
      click: actions.toggle,
      // Shown for reference only; the global hotkey itself is registered separately.
      ...(view.hotkey && view.hotkeyOk ? { accelerator: view.hotkey, registerAccelerator: false } : {}),
    },
  ]
  if (view.hotkey && view.hotkeyOk === false) {
    template.push({ label: 'Hotkey unavailable: another app uses it. Choose another in Settings.', enabled: false })
  }
  template.push({ label: 'Copy Last Transcript', enabled: Boolean(view.hasLastTranscript), click: actions.copyLast })
  if (view.levels) {
    template.push({
      label: 'Refinement',
      submenu: view.levels.map((option) => ({
        label: `${option.label} — ${option.description}`,
        type: 'radio',
        checked: option.value === view.level,
        click: () => actions.setLevel(option.value),
      })),
    })
  }
  if (view.code === 'permission-denied') {
    template.push({ label: 'Open Microphone Settings…', click: actions.openMicrophoneSettings })
  }
  template.push(
    { type: 'separator' },
    { label: SERVER_LABELS[view.serverState] ?? SERVER_LABELS.checking, enabled: false },
    { type: 'separator' },
    { label: 'Settings…', accelerator: 'Command+,', registerAccelerator: false, click: actions.openSettings },
    { label: 'Quit Dictator', accelerator: 'Command+Q', click: actions.quit },
  )
  return template
}

/** Text beside the menu bar icon: a dot while recording, an ellipsis while transcribing. */
export function trayTitle(phase) {
  if (phase === 'recording') return ' ●'
  if (phase === 'processing' || phase === 'starting') return ' …'
  return ''
}
