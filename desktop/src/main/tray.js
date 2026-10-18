import path from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'

const SERVER_LABELS = {
  checking: 'Server: checking…',
  ready: 'Server: ready',
  unconfigured: 'Server: speech service not configured',
  unreachable: 'Server: unreachable',
}

// The menu bar icon. D0 only shows the app and server state and offers Quit.
export function createTray({ iconDir }) {
  // A "Template" image lets macOS tint it for light and dark menu bars.
  const icon = nativeImage.createFromPath(path.join(iconDir, 'trayTemplate.png'))
  icon.setTemplateImage(true)
  const tray = new Tray(icon)
  tray.setToolTip('Dictator')

  let serverState = 'checking'
  const render = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Dictator ${app.getVersion()}`, enabled: false },
        { label: SERVER_LABELS[serverState], enabled: false },
        { type: 'separator' },
        { label: 'Quit Dictator', accelerator: 'Command+Q', click: () => app.quit() },
      ]),
    )
  }
  render()

  return {
    tray,
    setServerState(state) {
      serverState = state
      render()
    },
    getServerState: () => serverState,
  }
}
