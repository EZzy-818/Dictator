import { session } from 'electron'
import { isPermissionAllowed } from './security.js'

// Applies the permission rules in security.js to the default session. appUrl is the indicator
// page's URL; nothing else may ask for anything.
export function installPermissionHandlers(appUrl) {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      isPermissionAllowed({ permission, requestingUrl: details.requestingUrl ?? webContents.getURL(), mediaTypes: details.mediaTypes ?? [], appUrl }),
    )
  })
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
    isPermissionAllowed({ permission, requestingUrl: details.requestingUrl ?? webContents?.getURL(), appUrl }),
  )
}
