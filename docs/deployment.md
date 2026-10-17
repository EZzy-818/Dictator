# Production configuration (Milestones 9 and 10)

Everything that differs between local development and production is set through environment variables. The two addresses are the backend's allowed origin (`CORS_ORIGINS`) and the frontend's API address (`VITE_API_BASE_URL`). Deploying to new addresses needs no source-code changes.

## Backend (Express, for example on Render)

| Variable | Production value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Render sets this at runtime for Node services. It turns on the checks below. |
| `OPENAI_API_KEY` | your OpenAI secret key | Set it as a secret in the host's dashboard. Never commit it, and never put it in a `VITE_` variable. |
| `CORS_ORIGINS` | the frontend's address, for example `https://dictator.vercel.app` | Comma-separated. Use origins only: scheme, host and optional port, with no path. A trailing slash is ignored. |
| `PORT` | set by the host | Render provides it (default `10000`). |
| `TRANSCRIPTION_MODEL` | `gpt-transcribe` (default) | Optional. Leave it unset: only the `gpt-transcribe` family takes the Chinese, English and Hindi language list that keeps mixed speech intact. |
| `REFINEMENT_MODEL` | `gpt-4.1` (default) | Optional. It must accept `temperature`. |
| `TRUST_PROXY` | the number of proxies in front of the server | Needed to see each visitor's address for the usage limits. See [Usage limits](#usage-limits-and-abuse-protection-milestone-10). |
| `REDIS_URL` | a Redis connection URL, for example Render Key Value's internal URL | Recommended. Keeps the usage counters when the server restarts or sleeps. |
| `PROCESS_LIMIT_…`, `REFINE_LIMIT_…`, `MAX_CONCURRENT_…` | optional | Change the usage limits. See the table below. |

When `NODE_ENV=production`, the server **refuses to start** if `OPENAI_API_KEY` or `CORS_ORIGINS` is missing, if an origin is not a plain origin, or if an origin uses `http` for anything other than localhost. It prints the reason, so a misconfigured deploy fails visibly instead of running half-broken. In development the defaults stay as before: the key is optional, and `http://localhost:5173` is allowed.

CORS only tells browsers which sites may read the API's responses. It does not protect the API from other clients: anyone can call it directly. The usage limits below do that.

Settings for a Render web service:

- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/health`

## Usage limits and abuse protection (Milestone 10)

Dictator has no accounts, so anyone who finds the API can call it, and every call that reaches OpenAI costs money. The backend limits usage per visitor and in total, so one anonymous visitor cannot run up unlimited costs.

### Limits

| Limit | Default | Variable | When it is reached |
| --- | --- | --- | --- |
| Recordings per visitor per minute | 5 | `PROCESS_LIMIT_PER_MINUTE` | 429 `rate_limited`: "Too many recordings in a short time. Please wait 42 seconds and try again." |
| Recordings per visitor per day | 30 | `PROCESS_LIMIT_PER_DAY` | 429 `rate_limited`: "You have reached today's limit of 30 recordings. Please try again in about 5 hours." |
| Recordings per day, all visitors together | 100 | `PROCESS_LIMIT_GLOBAL_PER_DAY` | 429 `daily_limit_reached`: "Dictator has reached its usage limit for today. Please try again in about 5 hours." |
| Retry Refinement per visitor per minute | 10 | `REFINE_LIMIT_PER_MINUTE` | 429 `rate_limited`, as above |
| Retry Refinement per visitor per day | 60 | `REFINE_LIMIT_PER_DAY` | 429 `rate_limited`, as above |
| Retry Refinement per day, all visitors together | 100 | `REFINE_LIMIT_GLOBAL_PER_DAY` | 429 `daily_limit_reached`, as above |
| Requests in progress, all visitors together | 4 | `MAX_CONCURRENT_REQUESTS` | 503 `server_busy`: "Dictator is busy right now. Please try again in a few seconds." |
| Requests in progress per visitor | 2 | `MAX_CONCURRENT_PER_CLIENT` | 429 `too_many_concurrent`: "Please wait for your current request to finish." |
| Recording length | 2 minutes (125 s with margin) | fixed | 413 `recording_too_long` |
| Upload size | 10 MB | fixed | 413 `file_too_large` |
| Transcript sent to Retry Refinement | 10,000 characters | fixed | 413 `transcript_too_long` |
| JSON request body | 100 KB | fixed | 413 `body_too_large` |

The page shows each message as it is. Limited responses also carry a `Retry-After` header and `RateLimit` headers.

- **What counts.** A request counts toward the limits only after it passes validation (refinement level, audio format, readable audio, length), right before OpenAI is called. Rejected uploads never reach OpenAI and do not count. Requests that reach OpenAI count even if OpenAI fails, because they may still cost money. The recording that `/api/process` refines does not count toward the Retry Refinement limits.
- **Windows.** Each counter is a fixed window that starts with the first counted request: one minute or 24 hours.
- **Visitors.** A visitor is an IP address. IPv6 addresses are grouped by `/56` subnet, since one household or phone usually controls a whole subnet. People behind one shared address (an office, a school) share one allowance.
- **Recording length.** The server reads the length from the audio itself. Browsers write WebM recordings without a length header, so the server reads the time stamps of the audio blocks (`backend/src/lib/duration.js`); MP4, Ogg, WAV, MP3 and FLAC are read with `music-metadata`. Audio whose length cannot be read is rejected with 415 `unreadable_audio`.
- **Timeouts.** OpenAI timeouts are unchanged from Milestone 4: 45 seconds per transcription attempt and 30 seconds per refinement attempt, one retry each. Receiving an upload may take at most 60 seconds (`server.requestTimeout`, checked every 30 seconds by Node), so a slow upload cannot hold a request slot for long; this was 180 seconds before Milestone 10.

### Visitor addresses behind a proxy (`TRUST_PROXY`)

On Render and similar hosts, requests reach the server through the host's proxies, so the server sees the proxy's address unless it is told to read the `X-Forwarded-For` header. `TRUST_PROXY` is the number of proxies to trust (Express's `trust proxy` setting).

- Unset, every visitor looks like the same address and shares one allowance, which locks everyone out together.
- Set too high, a visitor can send a fake `X-Forwarded-For` header and get a fresh allowance on every request.

The Blueprint sets `TRUST_PROXY=1`. Render's documentation does not say how many proxies it uses, so this is checked after the first deploy. Successful API responses carry a `RateLimit-Policy` header whose `pk` value is a hash of the address the server counted. It must match the hash of the caller's real public address, with and without a made-up `X-Forwarded-For` header. The `client` values in the logs give the same check.

### Shared counters (`REDIS_URL`)

Without `REDIS_URL` the counters live in the server's memory. That is enough for one server instance, but they reset whenever the server restarts. A free Render web service spins down after 15 minutes without traffic, which would also reset the daily limits.

With `REDIS_URL` the counters live in Redis (for example Render Key Value, which has a free tier), so they survive restarts and sleep, and every instance shares them. The server then:

- refuses to start if it cannot connect to Redis;
- refuses API requests with 503 `limits_unavailable` while Redis is unreachable, rather than running without limits, and recovers when Redis is back.

In production the server warns at start-up when `REDIS_URL` is not set. The concurrency limits are per instance and are always kept in memory.

How this was tested: the browser test in this milestone recorded twice with `PROCESS_LIMIT_PER_MINUTE=2`, was refused on the third recording with the wait message, and was still refused after the server restarted. Stopping Redis gave 503 `limits_unavailable`, and requests worked again after Redis restarted.

### What one request can cost

Prices from OpenAI's [pricing page](https://developers.openai.com/api/docs/pricing) and [GPT-4.1 model page](https://developers.openai.com/api/docs/models/gpt-4.1), checked on 2026-10-17:

- `gpt-transcribe` (the default since the language setting was removed): $0.0045 per minute of audio, as reported by third-party price trackers in October 2026; not yet checked against OpenAI's own pricing page. The table below was worked out for `gpt-4o-transcribe`, which costs more, so it remains an upper bound.
- `gpt-4o-transcribe`: about $0.006 per minute of audio; $2.50 per million input tokens and $10 per million output tokens; a 16,000-token context and at most 2,000 output tokens.
- `gpt-4.1`: $2 per million input tokens and $8 per million output tokens.

| Request | Typical | Worst case |
| --- | --- | --- |
| A 2-minute recording (`/api/process`) | about $0.02: $0.012 transcription, under $0.01 refinement | about $0.10: the transcription model's 16,000-token context filled and 2,000 tokens out ($0.06), then refinement of that transcript with the full 4,000 output tokens ($0.04) |
| Retry Refinement (`/api/refine`) | under $0.01 | about $0.05: a 10,000-character transcript and 4,000 output tokens |

A request that times out or fails may be retried once by the server, and a failed attempt can still be billed, so the true ceiling is up to twice these numbers.

With the default limits, a full day costs about $2 to $3 in normal use (100 recordings plus some retries). The theoretical ceiling, with every request at its worst case and retried, is about 100 × $0.20 + 100 × $0.10 = **$30 per day**, and one visitor alone can reach about $12 per day. Lower the limits to lower these numbers.

### Spend limit at OpenAI

The server's limits are the first line of defense. As a backstop, set a hard monthly spend limit on the OpenAI project that owns the key (Project settings → Limits → Spend → turn on "Enforce a hard limit"). Once the limit is reached, OpenAI refuses the project's requests with 429 `project_spend_limit_exceeded`, and Dictator shows its usual transcription error. OpenAI notes that enforcement is not instantaneous, so spend can slightly exceed the limit. See [Spend limits](https://developers.openai.com/api/docs/guides/spend-limits).

### Monitoring

Every request to `/api/process` and `/api/refine` writes one JSON line to the server log:

```json
{"time":"2026-10-17T02:49:29.495Z","event":"request","method":"POST","path":"/api/process","status":429,"code":"rate_limited","ms":4,"bytes":16185,"refinementLevel":"light","client":"a17b73a8e926"}
```

Each refusal also writes a `"event":"limit"` line naming the limit, such as `process-minute` or `process-global-day`. `client` is a keyed hash of the visitor's address. It is stable while the server runs, so one visitor's requests can be grouped, but it cannot be turned back into the address, and it changes when the server restarts. The log never contains audio, transcripts, refined text, or IP addresses. On Render the lines appear in the service's Logs tab; filter on `"event":"limit"` to see who is being limited.

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

## Deploying (Milestone 11)

The backend goes to Render from the Blueprint in [`render.yaml`](../render.yaml), and the frontend to Vercel. Both deploy from the `main` branch of the GitHub repository and redeploy on every push to it.

The Blueprint creates two free Render services in the Oregon region (the region cannot be changed later):

- `dictator-api`: the Express backend, with `NODE_ENV=production`, Node 22, `TRUST_PROXY=1` and `REDIS_URL` filled in automatically.
- `dictator-limits`: a Key Value (Redis) instance for the usage counters, reachable only from Render's private network.

Steps:

1. **OpenAI.** Create an API key in a project used only by Dictator, and set a hard monthly spend limit on that project (see [Spend limit at OpenAI](#spend-limit-at-openai)).
2. **Render.** In the Render Dashboard choose New → Blueprint and connect this repository. Render lists the two services and asks for the two secret values:
   - `OPENAI_API_KEY`: the key from step 1.
   - `CORS_ORIGINS`: the address the frontend will have, `https://<vercel-project-name>.vercel.app`. Vercel only knows it for sure after step 3, so this is corrected in step 4 if needed.
   Create the services. When the deploy finishes, open `https://<render-service>.onrender.com/api/health`; it should answer `{"status":"ok","openaiConfigured":true}`.
3. **Vercel.** Choose Add New → Project and import this repository. Set Root Directory to `frontend` (Vercel detects Vite), add the environment variable `VITE_API_BASE_URL` with the Render address from step 2, and deploy.
4. If the Vercel production address differs from `CORS_ORIGINS`, change `CORS_ORIGINS` in the Render service's Environment settings and save; Render redeploys.

The free Render web service sleeps after 15 minutes without traffic and takes up to about a minute to wake. The page checks `/api/health` as soon as it opens, so it usually wakes while the visitor picks a language. The counters in Key Value survive the sleep. Free Key Value instances do not save to disk, so the counters reset if the Key Value instance itself restarts.

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
