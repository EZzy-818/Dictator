# Dictator

AI voice-to-text in the browser. Record speech in English, Mandarin Chinese, Hindi, or a mix (Chinese or Hindi with English), get a raw transcript, and a refined version you can edit and copy.

> Status: Milestone 10 (public API protection). The app is configured for deployment through environment variables, and the API has per-visitor and daily usage limits; see [docs/deployment.md](docs/deployment.md).

## Stack

- **Frontend:** React + Vite, Tailwind CSS (`frontend/`)
- **Backend:** Node.js + Express, Multer, official OpenAI SDK (`backend/`)
- **Tests:** Vitest + Supertest

All OpenAI requests are made by the backend. The API key never reaches the browser.

## Requirements

- Node.js 20.19 or newer (developed on Node 22)

## Setup

```bash
npm install              # root dev tools (concurrently)
npm run install:all      # backend and frontend dependencies

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Then set `OPENAI_API_KEY` in `backend/.env`.

### Backend environment (`backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | (none) | OpenAI secret key. Server-side only. |
| `TRANSCRIPTION_MODEL` | `gpt-transcribe` | Speech-to-text model |
| `REFINEMENT_MODEL` | `gpt-4.1` | Text refinement model |
| `PORT` | `3001` | Port the API listens on |
| `CORS_ORIGINS` | `http://localhost:5173` (development only) | Comma-separated browser origins allowed to call the API |
| `NODE_ENV` | `development` | `production` on the hosted server: the server then refuses to start without `OPENAI_API_KEY` and https `CORS_ORIGINS` |

### Frontend environment (`frontend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3001` (development only) | Backend base URL. Required for `npm run build`, and must be https unless it is localhost. Everything prefixed `VITE_` is public, so never put secrets here. |

## Development

```bash
npm run dev      # starts backend (http://localhost:3001) and frontend (http://localhost:5173)
npm test         # backend and frontend tests (OpenAI is mocked)
npm run build    # production build of the frontend, then a check that the bundle holds no OpenAI key
npm run test:live --prefix backend          # live transcription + refinement smoke test; needs OPENAI_API_KEY and network access
npm run test:live:refine --prefix backend   # live refinement test cases from the roadmap, for human review
npm run test:live:levels --prefix backend   # live None / Light / Medium cases in English, Chinese and mixed speech, scored by checks
npm run eval --prefix backend               # accuracy evaluation (WER/CER) on 31 samples; see docs/evaluation.md
npm run test:acceptance --prefix backend    # acceptance tests A to E in Chromium against the running app; see docs/acceptance.md
```

The live commands call the real OpenAI API and cost a small amount. `test:acceptance` also needs Playwright with Chromium (`npm install -g playwright`, then run it with `NODE_PATH=$(npm root -g)`).

Or run each side on its own with `npm run dev` inside `backend/` or `frontend/`.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns `{ "status": "ok", "openaiConfigured": true \| false }` |
| `POST` | `/api/process` | Transcribes and refines one recording. See below. |
| `POST` | `/api/refine` | Refines a transcript again (used to retry refinement). See below. |

### `POST /api/process`

`multipart/form-data` with:

- `audio`: the recording (WebM, MP4/M4A, OGG, WAV, MP3, or FLAC; at most 10 MB). The bytes must match the declared type.
- `refinementLevel`: `none`, `light`, or `medium` (default `light`). See [Refinement levels](#refinement-levels).

There is no language setting. Every recording may be English, Mandarin, Hindi, or a mix in one sentence, so the transcription request always sends `languages: ["zh", "en", "hi"]` and a short prompt asking for a verbatim transcript that keeps each word in the language it was spoken in (Chinese in Simplified characters, Hindi in Devanagari) and keeps filler words (`TRANSCRIPTION_PROMPT` in `backend/src/services/transcription.js`). Only the `gpt-transcribe` family accepts `languages`; with another `TRANSCRIPTION_MODEL` only the prompt is sent. A `language` field from an older page is ignored.

Success (`200`):

```json
{
  "rawTranscript": "我们应该用 PostgreSQL。",
  "polishedTranscript": "我们应该使用 PostgreSQL。",
  "refinementLevel": "light",
  "transcriptionStatus": "success",
  "refinementStatus": "success"
}
```

`refinementLevel` echoes the level used. With `none`, refinement is not attempted: `polishedTranscript` is exactly `rawTranscript` and `refinementStatus` is `"skipped"`. If transcription succeeds but refinement fails, the response is still `200` with the raw transcript, `"polishedTranscript": null` and `"refinementStatus": "failed"`, so the client can retry with `/api/refine` without transcribing again. If transcription fails, refinement is not attempted.

Errors return `{ "error": "<safe message>", "code": "<code>" }`:

| Status | Code | When |
| --- | --- | --- |
| 400 | `invalid_refinement_level` | Refinement level is not `none`, `light`, or `medium` |
| 400 | `missing_audio` / `empty_audio` / `invalid_upload` | No file, an empty file, or a malformed upload |
| 413 | `file_too_large` | Over 10 MB |
| 413 | `recording_too_long` | Longer than 2 minutes |
| 415 | `unsupported_audio` | Unsupported type, or bytes that do not match the type |
| 415 | `unreadable_audio` | The recording's length cannot be read |
| 422 | `no_speech` | The transcription contained no speech |
| 429 | `rate_limited` / `daily_limit_reached` / `too_many_concurrent` | A usage limit was reached (see below) |
| 502 | `transcription_failed` | The OpenAI request failed |
| 503 | `service_unavailable` | `OPENAI_API_KEY` is not configured |
| 503 | `server_busy` / `limits_unavailable` | Too many requests in progress, or the usage counters are unreachable |
| 504 | `transcription_timeout` | OpenAI did not answer in time |

### `POST /api/refine`

JSON body `{ "transcript": "Raw recognized speech", "refinementLevel": "medium" }` (`refinementLevel` is optional and defaults to `light`). Returns `{ "polishedTranscript": "Refined text", "refinementLevel": "medium" }`. With `none` it returns the transcript unchanged without calling OpenAI, and the request does not count toward the usage limits.

#### Refinement levels

| Level | What it does |
| --- | --- |
| `none` | No refinement request. The polished text is the raw transcript, character for character. |
| `light` (default) | Removes fillers (um, uh, you know, 嗯, 呃, 那个), accidental repetitions and false starts, resolves explicit self-corrections, and fixes grammar, punctuation and capitalization. Keeps the speaker's wording, sentence structure, hedges and level of detail. |
| `medium` | Everything Light does, plus clearer sentence structure, less wordiness and redundancy, and no content-free lead-ins. Keeps intent, tone, every important detail (names, numbers, dates, technical terms, negations, reasons) and the speaker's degree of certainty: a suggestion stays a suggestion. |

Light and Medium use the same model and roadmap rules; each adds its own block of instructions (`LEVEL_GUIDANCE` in `backend/src/prompts/refinement.js`). `npm run test:live:levels --prefix backend` runs live English, Chinese and mixed cases for every level and scores them with checks (words that must stay or go, how much of the speaker's wording Light keeps, how much shorter Medium is) rather than exact strings; `npm run test:live:refine --prefix backend -- --level=medium` runs the roadmap cases at a given level.

Refinement uses the OpenAI Responses API with `REFINEMENT_MODEL`, the roadmap's system prompt (`backend/src/prompts/refinement.js`), the selected level's guidance, and short guidance for English, Chinese, Hindi and mixed speech, including how to treat corrections spoken in the other language. It never asks the model to translate and keeps every part in the language it was spoken in. The language guidance is appended to the system instructions, and the transcript is sent as the input wrapped in `<transcript>` tags so instructions inside it are treated as speech. Requests use `temperature: 0` (so `REFINEMENT_MODEL` must be a model that accepts it, such as `gpt-4.1`) and `store: false`.

| Status | Code | When |
| --- | --- | --- |
| 400 | `invalid_refinement_level` / `missing_transcript` / `invalid_json` | Bad input |
| 413 | `transcript_too_long` / `body_too_large` | Over 10,000 characters, or a body over 100 KB |
| 429, 503 | as for `/api/process` | A usage limit was reached |
| 502 | `refinement_failed` | The OpenAI request failed or returned no text |
| 503 | `service_unavailable` | `OPENAI_API_KEY` is not configured |
| 504 | `refinement_timeout` | OpenAI did not answer in time |

### Usage limits

The API is public, so the backend limits how much anyone can use it: by default 5 recordings per minute and 30 per day per visitor, 100 recordings per day in total, and similar limits for Retry Refinement, plus limits on requests in progress. Only requests that pass validation and reach OpenAI count. The page shows the server's message, which says how long to wait. The limits, how to change them, the worst-case daily cost and the abuse-monitoring log are described in [docs/deployment.md](docs/deployment.md#usage-limits-and-abuse-protection-milestone-10). Local evaluation scripts (`npm run eval`, `test:live`) turn the limits off, since they run many requests with your own key.

Recordings are processed in memory and never written to disk. Transcripts and refined text are not logged. The app shows a short notice about this; the full version is in [docs/privacy.md](docs/privacy.md).

### Timeouts

| Step | Limit |
| --- | --- |
| Transcription request to OpenAI | 45 s per attempt, 1 retry |
| Refinement request to OpenAI | 30 s per attempt, 1 retry |
| Receiving the upload (`server.requestTimeout`) | 60 s (enforced within 90 s) |
| Browser wait for `/api/process` / `/api/refine` | 170 s / 70 s |

## Using the app

1. Pick an **AI refinement** level: **None**, **Light** (the default) or **Medium**. It stays selected until you change it, and it can be changed while recording without interrupting it. The level selected when you stop recording is the one used. There is no language to choose: speak English, Mandarin, Hindi, or a mix of Chinese or Hindi with English.
2. Click **Start Recording**, speak, then **Stop Recording**.
3. The **Raw transcript** shows exactly what the transcription model returned (read-only). It keeps filler words such as um and 嗯 as far as the model hears them, so **None** shows them too.
4. The **Polished text** is editable. **Copy** copies exactly what is in the box. **Retry Refinement** refines the same raw transcript again through `/api/refine`, without transcribing again, and replaces the polished text. After choosing a different level, the button reads **Regenerate as Medium** (or None, or Light) and regenerates the polished text at that level; None simply shows the raw transcript. A label above the box says which level made the current text. **Record Again** clears the results and starts a new recording.

If refinement fails, the raw transcript stays on screen with a warning and Retry Refinement stays available.

## Error handling

Every failure shows a readable message and never produces invented text:

| Situation | What happens |
| --- | --- |
| Microphone permission denied, no microphone, microphone busy | Message explaining what to do; Start Recording stays available |
| Browser without `MediaRecorder` or a supported format | Message instead of recording |
| Empty or accidental sub-second recording | Message; nothing is uploaded |
| Recording reaches 120 s | Stops automatically and is processed, with a notice |
| Recording over 10 MB | Rejected in the browser before upload (and by the server) |
| Transcription fails, times out, or hears no speech | Message; refinement is not attempted |
| Refinement fails or times out | Raw transcript kept, warning shown, Retry Refinement available |
| Server unreachable, offline, or an unexpected/non-JSON reply | Message; the page keeps working |
| Speech service unreachable or not configured when the page loads | Warning; it clears after the next successful recording |
| Page opened over plain `http://` (not localhost) | Message that recording needs an https address |
| Copy blocked by the browser | Message asking to select and copy manually |
| Repeated clicks | Start is disabled while recording or processing; Retry ignores clicks while running |
| Unexpected rendering error | An error boundary shows a message instead of a blank page |

## Accuracy

Measured on 31 synthetic (text-to-speech) samples with `gpt-transcribe`: English word error rate 0.0%, mixed Chinese-English character error rate 0.0%, Chinese character error rate 3.6% (all of it one sample where 2027年3月15日 came back as 二零二七年三月十五日, the same date written in Chinese numerals), with every refinement target met. Synthetic speech is easier than real speech, so treat these as a best case. Details, the normalization policy and known limitations are in [docs/evaluation.md](docs/evaluation.md). The local acceptance tests are in [docs/acceptance.md](docs/acceptance.md).

Known limitations:

- English words inside Hindi sentences sometimes come back in Devanagari (सर्वर लॉग्स चेक किए for "server logs check किए"), as Hindi is often written. Refinement keeps the script the transcript used.
- Numbers and dates spoken in Chinese may come back in Chinese numerals (十点半) rather than digits (10点半). Light and Medium keep them as transcribed.
- Filler words are kept when the model hears them, but very short or soft ones (a quick 嗯) can still be left out, so None is close to verbatim rather than exact.
- After resolving a correction, refined Chinese can keep a few words of the retracted half (我觉得这个项目我们应该用 PostgreSQL 会更合适), which reads slightly awkwardly. The meaning is right.

## Browser recording

Recording uses `getUserMedia` and `MediaRecorder`. The first supported format is used, in this order:

1. `audio/webm;codecs=opus` (Chrome, Edge, Firefox, recent Safari)
2. `audio/webm`
3. `audio/mp4` (older Safari)

The audio is kept in the format the browser produced. Recordings stop automatically after 120 seconds, and the microphone is released as soon as recording stops.

Browsers only allow microphone access on `https://` pages or `http://localhost`. On a plain `http://` page the app says that recording needs a secure connection. Browsers without `MediaRecorder` or without any of the formats above show an error instead of recording.
