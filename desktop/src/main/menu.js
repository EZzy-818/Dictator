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
 *         hotkey, hotkeyOk, hotkeys }
 *   levels: [{ value, label, description }] from the web app's refinementLevels.js
 *   hotkeys: [{ accelerator, label }]; hotkeyOk is false when another app owns the hotkey
 * actions: { toggle, setLevel(value), setHotkey(accelerator), copyLast, openMicrophoneSettings, quit }
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
    template.push({ label: 'Hotkey unavailable: another app uses it. Choose another below.', enabled: false })
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
  if (view.hotkeys) {
    template.push({
      label: 'Hotkey',
      submenu: view.hotkeys.map((option) => ({
        label: option.label,
        type: 'radio',
        checked: option.accelerator === view.hotkey,
        click: () => actions.setHotkey(option.accelerator),
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
