// The web app's API client, used unchanged from the main process. Requests from Node carry no
// Origin header, so the backend's CORS settings need no desktop entry. The address is injected
// at build time (see electron.vite.config.mjs).
export { getHealth, processAudio, refineText, ApiRequestError, MAX_UPLOAD_BYTES } from '@frontend/services/api.js'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
