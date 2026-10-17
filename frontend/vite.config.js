import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// A production build must know where the API is, and an https page can only call an https API.
export function checkApiBaseUrl(value) {
  if (!value) {
    return 'VITE_API_BASE_URL is not set. Set it to the backend URL, for example https://dictator-api.onrender.com.'
  }
  let url
  try {
    url = new URL(value)
  } catch {
    return `VITE_API_BASE_URL "${value}" is not a URL.`
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !local) {
    return `VITE_API_BASE_URL "${value}" must use https.`
  }
  return null
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const problem = checkApiBaseUrl(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL)
    if (problem) throw new Error(problem)
  }
  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom',
    },
  }
})
