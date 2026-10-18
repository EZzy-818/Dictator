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
 * view: { version, phase, outcome, message, code, serverState }
 * actions: { toggle, openMicrophoneSettings, quit }
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
    },
  ]
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
