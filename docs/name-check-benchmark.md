# Name check benchmark

`npm run benchmark:name-check` (in `backend/`) measures the name check (`src/lib/names.js`) and two ways to make it cheaper on latency, without changing the production defaults. Background and the plan: `name-check-investigation.md` in the project files.

| Config | Name check model | Refinement starts | Notes |
| --- | --- | --- | --- |
| Before fix | `gpt-4o-transcribe` | after the check | Production before the number fix; raw transcripts only |
| **Fixed** (corrected baseline) | `gpt-4o-transcribe` | after the check | Production with the number fix |
| O2 | `gpt-4o-transcribe` | alongside the check (`NAME_CHECK_OVERLAP=true`) | Same raw transcript as Fixed |
| O4 | `gpt-4o-mini-transcribe-2025-12-15` | after the check | |
| O2+O4 | `gpt-4o-mini-transcribe-2025-12-15` | alongside the check | Same raw transcript as O4 |
| No check | none | — | Raw transcripts only, as the floor for name accuracy |

Main transcription is `gpt-transcribe` and refinement `gpt-4.1` in every configuration.

**O2** (`NAME_CHECK_OVERLAP=true`, off by default, `src/routes/process.js`): at Light and Medium, refinement starts on the main transcript while the name check finishes. If the check changes nothing, that refined text is used. If it swaps a name, the same swap is made in the refined text (`applySwaps`), or, when the name gpt-transcribe wrote is not in the refined text exactly once, the changed transcript is refined again. At None nothing changes.

## Stages

```
NODE_USE_ENV_PROXY=1 node scripts/benchmark-name-check.js [--stages=audio,capture,e2e,latency,browser,report] [--cap=8]
```

| Stage | What it does |
| --- | --- |
| `audio` | Synthesizes the 31 recordings in `eval/fidelity-dataset.js`, clean (each case's voice) and onyx + pink noise at 15 dB SNR, as WebM/Opus. The 36 model-benchmark recordings must already be in `.eval-samples/synthetic/models/` (copied from the model benchmark, not regenerated). |
| `capture` | Every recording, 3 times, through `gpt-transcribe`, `gpt-4o-transcribe` and the mini snapshot at once. Each configuration's raw transcript is computed from these with its merge, including the 1.5 s wait limit, so all configurations share the same main transcript. |
| `e2e` | For every recording (repeat 1) a name check changed: Light and Medium refined after the check and alongside it (O2), compared. |
| `latency` | One backend per configuration in this process; `/api/process` with server stage timings, 12 recordings × 5 repeats × None/Light/Medium, interleaved. |
| `browser` | Optional. Stop → text displayed in Chromium at Light, read from the `?latency=1` panel. |
| `report` | `tables.md`, `review.md` (every change the name check made, and every O2 output that differs) and `summary.json`. |

Stages resume from `<out>/<stage>.json`; every call's estimated cost goes to `<out>/costs.jsonl` and the run stops at `--cap` dollars.

**Synthetic audio.** All recordings are OpenAI text-to-speech, and the references are the scripts. Compare configurations with it, not absolute rates.
