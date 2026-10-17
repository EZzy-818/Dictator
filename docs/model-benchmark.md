# Model optimization benchmark

`npm run benchmark:models` (in `backend/`) compares four model configurations for latency, transcription accuracy and refinement quality. It never changes the production defaults in `src/config.js`. Results and the decision are in `backend/eval/results/model-optimization-report.md`, with the generated tables and review sheet of that run next to it (`model-benchmark-tables.md`, `model-benchmark-review.md`).

| Config | Transcription | Name check | Refinement |
| --- | --- | --- | --- |
| Baseline | `gpt-transcribe` | `gpt-4o-transcribe` | `gpt-4.1` |
| A | `gpt-4o-mini-transcribe-2025-12-15` | `gpt-4o-transcribe` | `gpt-4.1` |
| B | `gpt-transcribe` | `gpt-4o-transcribe` | `gpt-6-luna` |
| A+B | `gpt-4o-mini-transcribe-2025-12-15` | `gpt-4o-transcribe` | `gpt-6-luna` |

Prompts, `temperature: 0`, `store: false`, the output limit and the language retry are identical in every configuration. Two API differences cannot be avoided: `gpt-4o-mini-transcribe` rejects the `languages` hint, so it gets the prompt without it (as `transcriptionParams` already does for every non-`gpt-transcribe` model), and reasoning models (`gpt-6-luna`, `gpt-5.4-mini`) are sent `reasoning: { effort: "none" }` (`refinementParams`), the only setting at which they accept `temperature`.

## Stages

```
node scripts/benchmark-models.js [--stages=audio,transcribe,refine,e2e,latency,judge,report]
  [--source=synthetic|real] [--cap=12] [--only=en-5-a,...] [--out=.eval-runs/models-synthetic]
```

| Stage | What it does |
| --- | --- |
| `audio` | Synthesizes the 36 scripts with `gpt-4o-mini-tts` and encodes them as WebM/Opus (synthetic source only). |
| `transcribe` | Each transcription model, with the production prompt and name check, 3 times per recording. Scored before refinement. |
| `refine` | Each refinement model refines the 36 **reference** transcripts at Light and Medium, 3 times, so refinement is judged apart from transcription errors. |
| `e2e` | Each configuration refines its own transcriber's repeat-1 transcripts. Baseline and B (and A and A+B) refine the identical transcript. Scored against what was said. |
| `latency` | Starts one backend per configuration in the script's process and times `/api/process` with the server's stage timings (PR #15). 12 recordings (one per language and length) × 5 repeats × None/Light/Medium, interleaved. None runs only for Baseline and A, since the refiner is never called. |
| `judge` | Blind rubric scores from `gpt-5.6-terra` for repeat-1 refinement outputs and all end-to-end outputs. Always reported apart from the rule checks and labelled as judged. |
| `report` | Writes `tables.md`, `review.md` (everything a person should look at) and `summary.json` to the output folder. |

Each stage saves every finished call to `<out>/<stage>.json` and skips it on a rerun. Every API call's estimated cost goes to `<out>/costs.jsonl`, and the run stops before the next call once the total passes `--cap` (dollars).

Running from a Claude cloud session, set `NODE_USE_ENV_PROXY=1` so Node's fetch uses the session proxy.

## Dataset

`eval/models-dataset.js`: 36 scripts, English, Mandarin, Hindi and mixed English–Mandarin × about 5, 15 and 30 seconds × 3. Every language group has fillers, at least three explicit self-corrections (several of them cross-language) and tagged entities (names, technical terms, numbers, dates, negations). `equiv` lists written forms that are the same spoken words ("3 PM", "three PM"), which are rewritten to one form before scoring.

**Synthetic audio.** The default source is text-to-speech reading the script, so the reference is exactly the text the audio was asked to say. It is not a human-verified transcript of the audio: where both transcription models make the same error, `review.md` lists the span under "check the audio" so a person can listen and correct the reference. Clean synthetic speech gives lower error rates than real dictation; compare models with it, not absolute numbers.

**Your own recordings.** Put them in `backend/.eval-samples/real/models/<id>.webm` (or `.m4a`, `.mp4`, `.ogg`, `.mp3`, `.wav`), one per case id, and run with `--source=real`. Read the script for that id, or say something else and write what you actually said in `backend/.eval-samples/real/models/manifest.json`:

```json
[{ "id": "en-15-b", "reference": "Hi Marcus, I reviewed the pull request ..." }]
```

A manifest reference replaces the script for scoring. Entities and corrections are still taken from the dataset, so keep the same names, numbers and corrections when you deviate. Missing recordings are skipped, and results for real audio are written to their own folder (`.eval-runs/models-real`).

## Metrics

Shared normalization (`eval/metrics.js`): NFKC (which also makes precomposed and decomposed Devanagari nukta letters equal), lowercase, punctuation removed, digits' commas dropped; then `equiv` forms are canonicalized. Headline rates ignore fillers (um, uh, 嗯, 呃, उम्म, अं, हम्म); the verbatim rate keeps them.

Transcription (`eval/model-metrics.js`), corpus rates over all repeats (total errors / total reference tokens):

- **English and Hindi WER** = (S + D + I) / reference words.
- **Mandarin CER** and **mixed CER** = (S + D + I) / reference characters (spaces removed).
- **Mixed token error** = (S + D + I) / reference tokens, where each Han character and each Latin word is a token.
- **Language preservation** = reference tokens in a script whose aligned token is in the same script / reference tokens in a script. Numbers are neutral and not counted; deleted tokens are not preserved.
- **Code-switching accuracy** = reference switch points (adjacent tokens in different scripts) where both sides align to tokens of the same two scripts / switch points.
- **Unintended translation rate** = recordings with at least one span of 2 or more reference tokens in one script removed or replaced while the hypothesis has at least 1 token of another script there / recordings. Every span is listed in `review.md`. A Hindi word written in Latin letters counts.
- **Entity errors** by type = tagged entities with none of their accepted forms in the transcript / tagged entities.

Refinement, per output (`checkRefinementOutput`):

- **Meaning preservation (rules)**: every entity the input contains is kept, the correction (if any) is right, the languages are kept, and no number appears that is not in the input. **Meaning (rules + judged)** also requires the judge's `meaning_preserved`.
- **Self-correction accuracy**: the replacement is present and none of the retracted forms are.
- **Hallucination**: rules flag new numbers; new capitalized words are listed for review only; the judge's `hallucination` is added in the "rules + judged" column.
- **Entity preservation**: entities kept / entities in the input, by type.
- **Language preservation**: the production checks (`lostLanguages`, `translatedWords`) plus no script with 2 or more words disappearing entirely.
- **Quality**: judge scores 1–5 for grammar, readability, filler removal and concision (restraint at Light), plus rule-counted fillers left, output/input length and repeat consistency.
- **None**: a unit test asserts that None returns every script byte for byte without a model call, for each refinement model; end to end, None output is checked to equal the transcript.

Proportions are reported with counts and a 95% Wilson interval. With 36 recordings an interval is wide; individual failures in `review.md` matter more than a point or two of difference.
