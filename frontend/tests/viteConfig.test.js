import { describe, expect, it } from 'vitest'
import { checkApiBaseUrl } from '../vite.config.js'

describe('checkApiBaseUrl', () => {
  it('accepts an https backend and a local development backend', () => {
    expect(checkApiBaseUrl('https://dictator-api.onrender.com')).toBeNull()
    expect(checkApiBaseUrl('http://localhost:3001')).toBeNull()
    expect(checkApiBaseUrl('http://127.0.0.1:3001')).toBeNull()
  })

  it('rejects a missing value, a non-URL, and plain http to a remote host', () => {
    expect(checkApiBaseUrl(undefined)).toMatch(/not set/)
    expect(checkApiBaseUrl('dictator-api.onrender.com')).toMatch(/not a URL/)
    expect(checkApiBaseUrl('http://dictator-api.onrender.com')).toMatch(/https/)
  })
})
