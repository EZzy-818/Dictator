# Dictator

AI voice-to-text in the browser. Record speech in English, Mandarin Chinese, or a mix of both, get a raw transcript, and a refined version you can edit and copy.

> Status: Milestone 3 (multilingual speech-to-text). AI refinement arrives in Milestone 4.

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
npm run test:live --prefix backend   # live transcription smoke test; needs OPENAI_API_KEY and network access
```

Or run each side on its own with `npm run dev` inside `backend/` or `frontend/`.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns `{ "status": "ok", "openaiConfigured": true \| false }` |
| `POST` | `/api/process` | Transcribes one recording. See below. |

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
  "polishedTranscript": null,
  "selectedLanguage": "zh",
  "transcriptionStatus": "success",
  "refinementStatus": "skipped"
}
```

`polishedTranscript` stays `null` and `refinementStatus` stays `"skipped"` until refinement is added in Milestone 4. `selectedLanguage` echoes the user's choice; it is not a detected language.

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

Recordings are processed in memory and never written to disk. Transcripts are not logged.

## Browser recording

Recording uses `getUserMedia` and `MediaRecorder`. The first supported format is used, in this order:

1. `audio/webm;codecs=opus` (Chrome, Edge, Firefox, recent Safari)
2. `audio/webm`
3. `audio/mp4` (older Safari)

The audio is kept in the format the browser produced. Recordings stop automatically after 120 seconds, and the microphone is released as soon as recording stops.

Browsers only allow microphone access on `https://` pages or `http://localhost`. Browsers without `MediaRecorder` or without any of the formats above show an error instead of recording.
