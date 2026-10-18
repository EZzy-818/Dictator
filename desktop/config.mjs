// Where the desktop app sends its API requests, decided at build time. Shared by
// electron.vite.config.mjs and the tests, so it must not import anything from Vite or Electron.

export const DEV_API_BASE_URL = 'http://localhost:3001'

function isLocal(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * value: DICTATOR_API_BASE_URL from the environment or desktop/.env.
 * production: true for `electron-vite build`, which is what gets packaged.
 * Development falls back to the local backend, so desktop work never reaches production by
 * accident. A production build must name its backend, and only over https (localhost excepted).
 */
export function resolveApiBaseUrl(value, { production }) {
  const raw = value?.trim()
  if (!raw) {
    if (!production) return DEV_API_BASE_URL
    throw new Error(
      'DICTATOR_API_BASE_URL is not set. Set it to the backend URL, for example https://dictator-api.onrender.com.',
    )
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`DICTATOR_API_BASE_URL "${raw}" is not a URL.`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal(url.hostname))) {
    throw new Error(`DICTATOR_API_BASE_URL "${raw}" must use https.`)
  }
  return raw.replace(/\/+$/, '')
}
