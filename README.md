# Dictator

AI voice-to-text in the browser. Record speech in English, Mandarin Chinese, or a mix of both, get a raw transcript, and a refined version you can edit and copy.

> Status: Milestone 1 (project setup). Recording, transcription, and refinement arrive in later milestones.

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
npm test         # backend tests
npm run build    # production build of the frontend
```

Or run each side on its own with `npm run dev` inside `backend/` or `frontend/`.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns `{ "status": "ok", "openaiConfigured": true \| false }` |
