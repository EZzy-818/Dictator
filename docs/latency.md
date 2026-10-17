# Latency profiling

Where the time goes between pressing Stop and seeing the polished text. This is measurement only: models, prompts and the processing pipeline are unchanged.

## What is measured

| Panel row | From → to | Measured by | Kind |
| --- | --- | --- | --- |
| Audio finalization | Stop pressed → recorded audio Blob ready | browser | measured |
| Request setup | Blob ready → upload request sent | browser | measured |
| Upload (server receive) | request headers reach Express → whole audio body read | server | measured, see limitations |
| Network & proxy | browser round trip − server total | both, as durations | **estimate** (marked ~) |
| Transcription API | OpenAI transcription request → response | server | measured |
| AI refinement API | OpenAI refinement request → response; 0 ms and "skipped" at None | server | measured |
| Backend overhead | the rest of the server's time: validation (including reading the audio's duration), usage limits, routing, building the response | server | measured |
| Frontend display | response read → first animation frame after the text is in the DOM | browser | measured |
| **Total latency** | Stop pressed → polished text painted | browser | measured |

All marks use `performance.now()`. The browser and the server each time their own stages on their own monotonic clock; no timestamp from one machine is ever compared with one from the other. The single cross-machine figure, Network & proxy, subtracts one duration (the server's total) from another (the browser's round trip). The rows add up to the total.

When the server sends no timings (production with `EXPOSE_TIMINGS` off, or a request that never got an answer), the panel shows the whole round trip as one measured row and the server stages as "not reported".

Every recording gets a random request ID. The browser sends it as a form field (not a header, which would add a CORS preflight round trip), the server returns it with the timings and writes it to its request log, so a panel run can be matched to a Render log line.

Failed requests are timed too: the panel shows which stage failed and how long it took, stages that never started as "not run", and the error code. A refinement failure shows refinement as failed with its duration.

Nothing in the timings, the panel, its JSON or the server log contains audio, transcripts, refined text or keys.

## Opening the developer panel

- **Local development** (`npm run dev`): the panel is always on, bottom right.
- **Any build, including the live site:** open the page once with `?latency=1`, for example `https://dictator-lime.vercel.app/?latency=1`. The choice is saved in that browser's local storage, so it stays on after reloads. `?latency=0` turns it off. Regular visitors never see it.

The panel can be collapsed by clicking its title. It keeps the last 50 runs of the session and shows mean, p50, p95, min and max of their totals. **Copy JSON** copies those runs (durations, statuses, level, request ID; no text) for analysis; **Clear** starts a new series.

Example (a real run: production build served locally, local backend, Chromium with a synthetic 5-second English clip as its microphone, Light):

```
Dictator Performance            light · ok
Audio finalization                 20 ms
Request setup                       1 ms
Upload (server receive)             2 ms
Network & proxy                    ~8 ms
Transcription API                 692 ms
AI refinement API   SLOWEST       820 ms
Backend overhead                    1 ms
Frontend display                   34 ms
Total latency                   1,578 ms
```

## Server timings in the API response

`POST /api/process` adds a `timings` object to its response, success or error, when `EXPOSE_TIMINGS` is on. It is on by default outside production and off in production unless `EXPOSE_TIMINGS=true` is set on the backend.

Shape (illustrative values):

```json
"timings": {
  "requestId": "…",
  "totalMs": 1515.2,
  "receiveMs": 2.1, "receiveStatus": "success",
  "transcriptionMs": 692.0, "transcriptionStatus": "success",
  "refinementMs": 820.3, "refinementStatus": "success",
  "overheadMs": 0.8
}
```

Statuses are `success`, `failed`, `skipped` (refinement at None, 0 ms) or `not_run` (with `null` ms, when an earlier step failed). The server's request log line includes the same object in every environment, whether or not it is returned.

## Benchmarking

### Synthetic, against a local backend

```
cd backend
npm run benchmark:latency -- --repeat=5 --out=eval/results/latency-local
```

Options: `--languages=en,zh,hi`, `--lengths=5,15,30` (target seconds), `--levels=none,light,medium`, `--url=<backend>` to time a running backend instead of an in-process one. Speech is OpenAI text-to-speech converted to WebM/Opus (what Chrome uploads); the samples are cached in `backend/.live-samples/latency/`. It reports the API round trip and the server's stage breakdown; the browser stages are the panel's job. Needs `OPENAI_API_KEY` and ffmpeg.

### With your own microphone

1. Open the app with the panel on (`npm run dev` locally, or the live site with `?latency=1`).
2. Pick a level and record one condition (for example English, about 15 seconds) five times. Keep the tab in front: a background tab delays animation frames, which inflates Frontend display.
3. Click **Copy JSON**, save it as a file named after the condition, such as `en-15s.json`, then **Clear**.
4. Repeat for each language, length and level you care about.
5. Summarize: `node scripts/benchmark-latency.js --from=en-5s.json --from=en-15s.json …` (from `backend/`). It prints runs, failures, mean, p50, p95, min, max and the mean of each stage, per file and level.

On the live site the backend does not return its stage breakdown unless `EXPOSE_TIMINGS=true` is set on Render, so the panel shows browser stages plus one round-trip row. The per-stage numbers are still in the Render logs, matched by request ID. The live backend's usage limits (5 recordings per minute, 30 per day per client by default) also apply, which caps a session at about 30 runs a day.

## Baseline (synthetic, local)

135 requests (English, Mandarin and Hindi; about 5, 15 and 30 seconds; None, Light and Medium; 5 repeats each) against an in-process local backend, `gpt-transcribe` and `gpt-4.1`, no failures. Full tables: [backend/eval/results/latency-local.md](../backend/eval/results/latency-local.md).

| Level | Mean | p50 | p95 | Min | Max | Transcription (mean) | Refinement (mean) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None | 1,015 | 965 | 1,522 | 604 | 1,677 | 1,009 | 0 |
| Light | 1,901 | 1,832 | 2,634 | 1,229 | 3,375 | 1,012 | 884 |
| Medium | 1,959 | 1,844 | 2,716 | 1,214 | 4,051 | 1,015 | 940 |

API round trip in ms. Transcription grows with length (mean 693 ms at 5 s, 969 ms at 15 s, 1,375 ms at 30 s); refinement adds about 0.9 s at Light or Medium. Upload, backend overhead and the local network are each a few milliseconds here. In 9 browser runs of the 5-second English clip (production build, Chromium fake microphone), audio finalization took 17–26 ms and frontend display 9–34 ms.

These figures leave out the real network between a user, Vercel, Render and OpenAI. The roughly 3-second wait users see on the live site is not reproduced here; measure it with the panel there to see how much of it is Network & proxy.

## Limitations

- **Upload is not fully isolated.** Browsers do not report when an upload finishes. Upload (server receive) is only what Express sees, from the request's headers to the end of its body. Render's proxy may buffer the body before forwarding it, which moves upload time into Network & proxy. Network & proxy also includes connection setup, TLS, the response download and any queuing in proxies; it is an estimate.
- **Frontend display** stops at the first animation frame after the text is in the DOM, the standard approximation of "painted". A hidden tab pauses animation frames.
- **Audio finalization** in Chrome includes MediaRecorder flushing its last chunk; it is usually a few milliseconds.
- **Backend overhead** includes the response's JSON being built but not its transfer, which falls in Network & proxy.
- **p95 over 5 runs** lies between the two slowest runs (linear interpolation), so it says little more than the maximum.
- **Synthetic benchmark caveats:** TTS speech is cleaner than a real voice, and in the development container OpenAI calls pass through an extra HTTPS proxy, so absolute API times can differ from Render's.
