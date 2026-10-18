import { describe, expect, it } from 'vitest'
import { resolveInside } from '../src/main/protocol.js'
import { isAppUrl, isPermissionAllowed, secureWebPreferences } from '../src/main/security.js'

const appUrl = 'app://dictator/index.html'

describe('secureWebPreferences', () => {
  it('isolates the renderer from Node and Electron', () => {
    const prefs = secureWebPreferences('/preload.cjs')
    expect(prefs).toMatchObject({
      preload: '/preload.cjs',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      webviewTag: false,
      backgroundThrottling: false,
    })
  })
})

describe('isAppUrl', () => {
  it('matches the app scheme and host, or the same dev server, only', () => {
    expect(isAppUrl(appUrl, appUrl)).toBe(true)
    expect(isAppUrl('app://dictator/assets/index.js', appUrl)).toBe(true)
    expect(isAppUrl('app://other/index.html', appUrl)).toBe(false)
    expect(isAppUrl('file:///tmp/evil.html', appUrl)).toBe(false)
    expect(isAppUrl('file:///tmp/evil.html', 'file:///tmp/evil.html')).toBe(false)
    expect(isAppUrl('http://localhost:5173/index.html', 'http://localhost:5173/')).toBe(true)
    expect(isAppUrl('http://localhost:5174/', 'http://localhost:5173/')).toBe(false)
    expect(isAppUrl('https://example.com/', appUrl)).toBe(false)
    expect(isAppUrl(undefined, appUrl)).toBe(false)
    expect(isAppUrl('not a url', appUrl)).toBe(false)
  })
})

describe('isPermissionAllowed', () => {
  it('allows microphone audio for the app page', () => {
    expect(isPermissionAllowed({ permission: 'media', requestingUrl: appUrl, mediaTypes: ['audio'], appUrl })).toBe(true)
  })

  it('allows the permission check, which carries no media types', () => {
    expect(isPermissionAllowed({ permission: 'media', requestingUrl: appUrl, appUrl })).toBe(true)
  })

  it('refuses the camera, empty media requests and other permissions', () => {
    expect(isPermissionAllowed({ permission: 'media', requestingUrl: appUrl, mediaTypes: ['video'], appUrl })).toBe(false)
    expect(isPermissionAllowed({ permission: 'media', requestingUrl: appUrl, mediaTypes: ['audio', 'video'], appUrl })).toBe(false)
    expect(isPermissionAllowed({ permission: 'media', requestingUrl: appUrl, mediaTypes: [], appUrl })).toBe(false)
    for (const permission of ['notifications', 'geolocation', 'clipboard-read', 'openExternal']) {
      expect(isPermissionAllowed({ permission, requestingUrl: appUrl, mediaTypes: [], appUrl })).toBe(false)
    }
  })

  it('refuses any other page', () => {
    expect(
      isPermissionAllowed({ permission: 'media', requestingUrl: 'https://example.com/', mediaTypes: ['audio'], appUrl }),
    ).toBe(false)
  })
})

describe('resolveInside', () => {
  it('serves files under the renderer folder only', () => {
    expect(resolveInside('/app/renderer', '/')).toBe('/app/renderer/index.html')
    expect(resolveInside('/app/renderer', '/assets/index-1.js')).toBe('/app/renderer/assets/index-1.js')
    expect(resolveInside('/app/renderer', '/../main/index.js')).toBe(null)
    expect(resolveInside('/app/renderer', '/%2e%2e/main/index.js')).toBe(null)
    expect(resolveInside('/app/renderer', '/%E0%A4%A')).toBe(null)
  })
})
