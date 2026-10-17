# Production configuration (Milestone 9)

Everything that differs between local development and production is set through environment variables. The two addresses are the backend's allowed origin (`CORS_ORIGINS`) and the frontend's API address (`VITE_API_BASE_URL`). Deploying to new addresses needs no source-code changes.

## Backend (Express, for example on Render)

| Variable | Production value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Render sets this at runtime for Node services. It turns on the checks below. |
| `OPENAI_API_KEY` | your OpenAI secret key | Set it as a secret in the host's dashboard. Never commit it, and never put it in a `VITE_` variable. |
| `CORS_ORIGINS` | the frontend's address, for example `https://dictator.vercel.app` | Comma-separated. Use origins only: scheme, host and optional port, with no path. A trailing slash is ignored. |
| `PORT` | set by the host | Render provides it (default `10000`). |
| `TRANSCRIPTION_MODEL` | `gpt-4o-transcribe` (default) | Optional. |
| `REFINEMENT_MODEL` | `gpt-4.1` (default) | Optional. It must accept `temperature`. |

When `NODE_ENV=production`, the server **refuses to start** if `OPENAI_API_KEY` or `CORS_ORIGINS` is missing, if an origin is not a plain origin, or if an origin uses `http` for anything other than localhost. It prints the reason, so a misconfigured deploy fails visibly instead of running half-broken. In development the defaults stay as before: the key is optional, and `http://localhost:5173` is allowed.

CORS only tells browsers which sites may read the API's responses. It does not protect the API from other clients; that is Milestone 10.

Settings for a Render web service:

- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/health`

## Frontend (React + Vite, for example on Vercel)

| Variable | Production value | Notes |
| --- | --- | --- |
| `VITE_API_BASE_URL` | the backend's https address, for example `https://dictator-api.onrender.com` | Built into the JavaScript bundle, so it is public. A trailing slash is ignored. |

`npm run build` **fails** if `VITE_API_BASE_URL` is missing, is not a URL, or uses `http` for anything other than localhost. An https page cannot call an http API, so such a build would never work.

After building, `npm run build` scans the output (`frontend/scripts/check-build.mjs`). It fails if the bundle contains:

- anything shaped like an OpenAI secret key (`sk-…`);
- the text `OPENAI_API_KEY`;
- a direct call to `api.openai.com`;
- the key configured on the build machine.

Settings for a Vercel project:

- Root directory: `frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE_URL`

## HTTPS and the microphone

Browsers allow microphone access only on secure pages: `https://` addresses, plus `http://localhost` for development. On a plain `http://` page, Start Recording shows "Recording needs a secure connection. Open this page with an https:// address." Vercel and Render both serve https by default.

### How this was verified

The production build was tested over https without a real deployment:

1. Built with `VITE_API_BASE_URL=https://api.dictator.test:8443`.
2. Served from `https://dictator.test:8444` with a self-signed certificate.
3. The backend ran with `NODE_ENV=production` and `CORS_ORIGINS=https://dictator.test:8444`, behind a TLS proxy on port 8443. OpenAI was replaced by a local stand-in.
4. Chromium mapped both hostnames to the machine and used its fake microphone.

Results:

- **https page:** a secure context. Recording, upload and display all worked. The only API calls went to `https://api.dictator.test:8443` (`/api/health`, `/api/process`), and the page made no `http://` requests.
- **Same build over plain http:** not a secure context. Start Recording showed the https message, and the page did not start the microphone.
- **CORS:** a request from `https://dictator.test:8444` got `access-control-allow-origin`. A request from any other origin did not.

Real microphones on the deployed site are tested in Milestones 11 and 12.

## What the production build no longer includes

- The "Backend: connected / unreachable" developer status line. The page still checks `/api/health` on load, which also wakes a backend that sleeps when idle. Users see a warning only if the speech service is not reachable or not configured, and the warning clears after the next successful recording.
- The `http://localhost:3001` fallback API address. It applies only to `npm run dev`; production builds must set `VITE_API_BASE_URL`.
