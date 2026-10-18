import { describe, expect, it } from 'vitest'
import { isAppUrl, isPermissionAllowed, secureWebPreferences } from '../src/main/security.js'

const appUrl = 'file:///Applications/Dictator.app/Contents/Resources/app.asar/out/renderer/index.html'

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
  it('matches the same file or the same dev server origin only', () => {
    expect(isAppUrl(appUrl, appUrl)).toBe(true)
    expect(isAppUrl('file:///tmp/evil.html', appUrl)).toBe(false)
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
