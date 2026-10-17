# Realtime transcription benchmark (Phase 1)

Measures whether streaming transcription with `gpt-live-transcribe` beats the corrected batch baseline (production with the name-check number fix) before any of it is built into the app. The realtime path from the design is simulated inside the benchmark process; nothing in `src/` changes and nothing is deployed.

## What it compares

| Path | Transcript | Name check | Refinement |
| --- | --- | --- | --- |
| Baseline | `gpt-transcribe` on the WebM upload, via `/api/process` | `gpt-4o-transcribe` on the same upload, waited for at most 1.5 s after the transcript | `gpt-4.1` after the check |
| Realtime + check | `gpt-live-transcribe`, 24 kHz PCM streamed at real time in 100 ms frames, committed at Stop | `gpt-4o-transcribe` on a WAV of the streamed audio, started at Stop, waited for at most 1.5 s after the transcript | `gpt-4.1` started on the realtime transcript, the swap made in the refined text (O2) |
| Realtime, no check | same | none | `gpt-4.1` on the realtime transcript |

At None, realtime text counts as final only once the name check is back (or timed out), because final text must not change after it is shown.

Realtime configurations: `delay` low (main), minimal and medium, and `gpt-realtime-whisper` for comparison. `gpt-realtime-whisper` refuses both the language list and the prompt, so it runs without them.

## Recordings

Synthetic speech, as in the model and name-check benchmarks: the 36 model-benchmark recordings (English, Mandarin, Hindi, mixed; ~5, 15 and 30 s), the 31 name recordings clean and in noise, and 8 long recordings (~60 s and ~100–120 s per language group) joined from the model recordings with half a second of silence, so their reference is the joined scripts. Missing recordings are synthesized with the same settings as before.

## Stages

`validate` checks session settings against the API without sending audio. `baseline` and `stream` capture transcripts for accuracy (streams run 6 at a time). `e2e` times Stop → final output one recording at a time, alternating which path goes first. `fallback` injects a refused connection, a connection lost halfway, and a missing final transcript, then runs the batch path. `quality` refines realtime transcripts at Light and Medium. `report` writes `tables.md` and `summary.json`.

The streaming stages need a direct WebSocket connection to `api.openai.com`.

## Running it

```
cd backend
npm install
# OPENAI_API_KEY in backend/.env; ffmpeg on the PATH
node scripts/benchmark-realtime.js --out=.eval-runs/realtime --cap=8
```

Every stage is resumable: rerun the same command and finished work is skipped. Spending is estimated from list prices into `costs.jsonl`, and the run stops before the next call once it passes `--cap`. `--only=en-5-a,mixed-15-a` limits a trial run to a few recordings.

## Limits

- Synthetic voices, not people; the last check before any rollout is a few recordings in your own voice.
- Both paths run from one machine straight to OpenAI. The browser ↔ server hop is left out of both, so the realtime figures leave out the relay round trip the design adds at Stop.
- Costs are estimates from list prices; the realtime figures assume billing per minute of audio streamed.
