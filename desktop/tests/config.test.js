import { describe, expect, it } from 'vitest'
import { DEV_API_BASE_URL, resolveApiBaseUrl } from '../config.mjs'

describe('resolveApiBaseUrl', () => {
  it('uses the local backend in development when nothing is set', () => {
    expect(resolveApiBaseUrl(undefined, { production: false })).toBe(DEV_API_BASE_URL)
    expect(resolveApiBaseUrl('  ', { production: false })).toBe('http://localhost:3001')
  })

  it('refuses a production build without an address', () => {
    expect(() => resolveApiBaseUrl('', { production: true })).toThrow(/DICTATOR_API_BASE_URL is not set/)
  })

  it('accepts https and strips trailing slashes', () => {
    expect(resolveApiBaseUrl('https://dictator-api.onrender.com/', { production: true })).toBe(
      'https://dictator-api.onrender.com',
    )
  })

  it('allows plain http only for this machine', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:4000', { production: true })).toBe('http://127.0.0.1:4000')
    expect(() => resolveApiBaseUrl('http://dictator-api.onrender.com', { production: true })).toThrow(/must use https/)
    expect(() => resolveApiBaseUrl('ftp://localhost', { production: false })).toThrow(/must use https/)
  })

  it('rejects text that is not a URL', () => {
    expect(() => resolveApiBaseUrl('dictator-api', { production: false })).toThrow(/is not a URL/)
  })
})
