import path from 'node:path'
import { Menu, Tray, nativeImage } from 'electron'
import { buildMenuTemplate, trayTitle } from './menu.js'

// The menu bar icon and its menu, rebuilt whenever the view changes.
export function createTray({ iconDir, actions }) {
  // A "Template" image lets macOS tint it for light and dark menu bars.
  const icon = nativeImage.createFromPath(path.join(iconDir, 'trayTemplate.png'))
  icon.setTemplateImage(true)
  const tray = new Tray(icon)
  tray.setToolTip('Dictator')

  return {
    tray,
    render(view) {
      tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(view, actions)))
      tray.setTitle(trayTitle(view.phase))
    },
  }
}
