# Dictator

AI voice-to-text in the browser. Record speech in English, Mandarin Chinese, or a mix of both, get a raw transcript, and a refined version you can edit and copy.

> Status: Milestone 8 (local MVP acceptance). The app runs locally end to end; public deployment is the next phase.

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
| `TRANSCRIPTION_MODEL` | `gpt-4o-transcribe` | Speech-to-text model |
| `REFINEMENT_MODEL` | `gpt-4.1` | Text refinement model |
| `PORT` | `3001` | Port the API listens on |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins allowed to call the API |

### Frontend environment (`frontend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3001` | Backend base URL. Everything prefixed `VITE_` is public, so never put secrets here. |

## Development

```bash
npm run dev      # starts backend (http://localhost:3001) and frontend (http://localhost:5173)
npm test         # backend and frontend tests (OpenAI is mocked)
npm run build    # production build of the frontend
npm run test:live --prefix backend          # live transcription + refinement smoke test; needs OPENAI_API_KEY and network access
npm run test:live:refine --prefix backend   # live refinement test cases from the roadmap, for human review
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
- `language`: `en`, `zh`, or `auto` (default `auto`).

| Option | Sent to the transcription API |
| --- | --- |
| `en` | `language: "en"` plus a short English technical-vocabulary hint |
| `zh` | `language: "zh"` plus a short Chinese technical-vocabulary hint |
| `auto` | No `language` and no hint; the model infers the language |

Success (`200`):

```json
{
  "rawTranscript": "我们应该用 PostgreSQL。",
  "polishedTranscript": "我们应该使用 PostgreSQL。",
  "selectedLanguage": "zh",
  "transcriptionStatus": "success",
  "refinementStatus": "success"
}
```

`selectedLanguage` echoes the user's choice; it is not a detected language. If transcription succeeds but refinement fails, the response is still `200` with the raw transcript, `"polishedTranscript": null` and `"refinementStatus": "failed"`, so the client can retry with `/api/refine` without transcribing again. If transcription fails, refinement is not attempted.

Errors return `{ "error": "<safe message>", "code": "<code>" }`:

| Status | Code | When |
| --- | --- | --- |
| 400 | `invalid_language` | Language is not `en`, `zh`, or `auto` |
| 400 | `missing_audio` / `empty_audio` / `invalid_upload` | No file, an empty file, or a malformed upload |
| 413 | `file_too_large` | Over 10 MB |
| 415 | `unsupported_audio` | Unsupported type, or bytes that do not match the type |
| 422 | `no_speech` | The transcription contained no speech |
| 502 | `transcription_failed` | The OpenAI request failed |
| 503 | `service_unavailable` | `OPENAI_API_KEY` is not configured |
| 504 | `transcription_timeout` | OpenAI did not answer in time |

### `POST /api/refine`

JSON body `{ "transcript": "Raw recognized speech", "language": "en" }` (`language` is required: `en`, `zh`, or `auto`). Returns `{ "polishedTranscript": "Refined text" }`.

Refinement uses the OpenAI Responses API with `REFINEMENT_MODEL`, the roadmap's system prompt (`backend/src/prompts/refinement.js`), and short guidance for the selected language, including how to treat corrections spoken in the other language. It never asks the model to translate; in `auto` mode it keeps every part in the language it was spoken in. The language guidance is appended to the system instructions, and the transcript is sent as the input wrapped in `<transcript>` tags so instructions inside it are treated as speech. Requests use `temperature: 0` (so `REFINEMENT_MODEL` must be a model that accepts it, such as `gpt-4.1`) and `store: false`.

| Status | Code | When |
| --- | --- | --- |
| 400 | `invalid_language` / `missing_transcript` / `invalid_json` | Bad input |
| 413 | `transcript_too_long` | Over 10,000 characters |
| 502 | `refinement_failed` | The OpenAI request failed or returned no text |
| 503 | `service_unavailable` | `OPENAI_API_KEY` is not configured |
| 504 | `refinement_timeout` | OpenAI did not answer in time |

Recordings are processed in memory and never written to disk. Transcripts and refined text are not logged.

### Timeouts

| Step | Limit |
| --- | --- |
| Transcription request to OpenAI | 45 s per attempt, 1 retry |
| Refinement request to OpenAI | 30 s per attempt, 1 retry |
| Whole backend request (`server.requestTimeout`) | 180 s |
| Browser wait for `/api/process` / `/api/refine` | 170 s / 70 s |

## Using the app

1. Pick **Auto-detect**, **English**, or **中文**. The choice stays selected until you change it.
2. Click **Start Recording**, speak, then **Stop Recording**. The recording is uploaded with the selected language.
3. The **Raw transcript** shows exactly what the transcription model returned (read-only).
4. The **Polished text** is editable. **Copy** copies exactly what is in the box. **Retry Refinement** refines the same raw transcript again through `/api/refine`, without transcribing again, and replaces the polished text. **Record Again** clears the results and starts a new recording.

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
| Copy blocked by the browser | Message asking to select and copy manually |
| Repeated clicks | Start is disabled while recording or processing; Retry ignores clicks while running |
| Unexpected rendering error | An error boundary shows a message instead of a blank page |

## Accuracy

Measured on 31 synthetic (text-to-speech) samples: English word error rate 0.6%, Chinese character error rate 2.0%, mixed Chinese-English character error rate 5.6%, with every refinement target met. Synthetic speech is easier than real speech, so treat these as a best case. Details, the normalization policy and known limitations are in [docs/evaluation.md](docs/evaluation.md). The local acceptance tests are in [docs/acceptance.md](docs/acceptance.md).

Known limitations:

- A sentence that starts in English and switches to Chinese (for a correction such as 不对) can come back from transcription with the English part written in Chinese. Choosing a language does not reliably prevent it.
- After resolving a correction, refined Chinese can keep a few words of the retracted half (我觉得这个项目我们应该用 PostgreSQL 会更合适), which reads slightly awkwardly. The meaning is right.

## Browser recording

Recording uses `getUserMedia` and `MediaRecorder`. The first supported format is used, in this order:

1. `audio/webm;codecs=opus` (Chrome, Edge, Firefox, recent Safari)
2. `audio/webm`
3. `audio/mp4` (older Safari)

The audio is kept in the format the browser produced. Recordings stop automatically after 120 seconds, and the microphone is released as soon as recording stops.

Browsers only allow microphone access on `https://` pages or `http://localhost`. Browsers without `MediaRecorder` or without any of the formats above show an error instead of recording.
