# Model optimization report (A + B)

Benchmark of faster model candidates against production `main` (914a73e, with PRs #16 and #17), run on 2026-10-17. Plan: `specs/model-optimization-plan.md` in the project files. Method and metric definitions: `docs/model-benchmark.md`. Every number below comes from `npm run benchmark:models` output (raw data in the project files under `eval-runs/model-optimization/`); nothing is estimated except API cost.

## Recommendation: keep the baseline

**Neither faster configuration is faster in a way that matters, and each one fails at least one quality threshold.**

- **B and A+B are slower, not faster.** `gpt-6-luna` refinement (with `reasoning: none`) took about 300 ms longer per call than `gpt-4.1`, so B adds 335 ms at p50 at Light (+20%) and 401 ms at Medium (+24%). A+B is 286–360 ms slower.
- **A saves almost nothing.** `gpt-4o-mini-transcribe` answers about 230 ms faster than `gpt-transcribe`, but the transcription stage still waits for the parallel name check (`gpt-4o-transcribe`, about 1,040 ms), so the stage gets only 30–40 ms faster. Overall A was 57 ms faster at p50 at Light and 80 ms slower at Medium, which is within the noise.
- **A fails the accuracy thresholds.** Hindi WER rose from 0.51% to 1.29% (+150% relative). Technical terms missed rose from 2.0% to 6.0%, and code-switching accuracy fell from 98.8% to 94.7%. End to end it added two invented-looking errors ("这个 bug" heard as "JacobBug", "team 里" heard as "挺力"). It was clearly better on mixed-language CER (4.91% → 1.89%), names and numbers, so it's not uniformly worse, but the spec's rule is that any threshold violation keeps the baseline.
- **B's refinement quality is on par, but it translates more at Medium.** On identical reference transcripts, `gpt-6-luna` matched or beat `gpt-4.1` at Light (100% vs 97.2% meaning preservation, 0 vs 3 translations). At Medium it translated part of a mixed sentence in 5 of 108 outputs against 3 of 108, which breaks the "unintended translation must not increase" rule.

So the production configuration should stay as it is. Two findings matter beyond this decision; see "What to do next".

## Environment and data, read this first

- **Speech is synthetic.** 36 recordings were made with OpenAI text-to-speech (`gpt-4o-mini-tts`) from the scripts in `eval/models-dataset.js`, encoded as WebM/Opus like Chrome uploads. The reference transcript is the script text, not a human-verified transcript of the audio. Absolute error rates are lower than real dictation; the comparison between models is what this measures. See "Reference checks" for one place the audio and script disagree.
- **Measured lengths:** 3.2–6.1 s ("5 s" bucket), 8.5–12.4 s ("15 s"), 19.8–28.2 s ("30 s"). The middle and long buckets came out shorter than the targets.
- **Latency environment:** this cloud container → OpenAI, with the backend running inside the benchmark process (loopback HTTP, usage limits off) and requests sequential, interleaved across configurations. These are **not** live-site timings, which add the user's network, Vercel and Render. Calls from this container also pass through a proxy.
- **Sample sizes are small.** Accuracy uses 36 recordings × 3 repeats; refinement 36 × 2 levels × 3 repeats per model; end to end 36 × 2 levels per configuration; latency 12 recordings × 5 repeats per configuration and level (60 requests each); browser 2 recordings × 3 repeats (6 runs each). Rates show counts and a 95% Wilson interval. Most differences under a few points are inside the noise, so the individual failures below matter more than the point estimates.
- **Judge.** `gpt-5.6-terra` scored 504 outputs blind, on a rubric. Judge-based columns are labelled *judged* and always sit next to rule-based columns. Every judge flag is in the review sheet for a person to check.

## Performance

Light is the app's default level. `/api/process` round trip in ms, 60 requests per row.

| Config | p50 Latency | p95 Latency | Improvement (p50) |
| --- | --- | --- | --- |
| Baseline | 1,704 | 2,831 | — |
| A | 1,647 | 2,837 | 57 ms (3%) |
| B | 2,039 | 3,439 | −335 ms (−20%, slower) |
| A+B | 1,990 | 3,476 | −286 ms (−17%, slower) |

All levels:

| Level | Config | Mean | p50 | p95 | Min | Max | Saved at p50 | Transcription stage | Primary transcription call | Name check call | Refinement stage | API cost / recording |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| None | Baseline | 1,079 | 927 | 1,877 | 561 | 1,984 | — | 1,075 | 905 | 1,052 | 0 | $0.0024 |
| None | A | 1,041 | 905 | 1,838 | 562 | 1,966 | 22 ms (2%) | 1,038 | 686 | 1,037 | 0 | $0.0020 |
| Light | Baseline | 1,902 | 1,704 | 2,831 | 1,163 | 2,965 | — | 1,097 | 951 | 1,040 | 802 | $0.0040 |
| Light | A | 1,877 | 1,647 | 2,837 | 1,172 | 3,163 | 57 ms (3%) | 1,060 | 717 | 1,046 | 815 | $0.0043 |
| Light | B | 2,181 | 2,039 | 3,439 | 1,342 | 3,837 | −335 ms (−20%) | 1,072 | 878 | 1,057 | 1,104 | $0.0024 |
| Light | A+B | 2,190 | 1,990 | 3,476 | 1,283 | 3,714 | −286 ms (−17%) | 1,036 | 696 | 1,035 | 1,150 | $0.0021 |
| Medium | Baseline | 1,880 | 1,664 | 2,820 | 1,219 | 2,950 | — | 1,089 | 922 | 1,062 | 788 | $0.0043 |
| Medium | A | 1,928 | 1,744 | 2,900 | 1,169 | 3,014 | −80 ms (−5%) | 1,045 | 698 | 1,044 | 879 | $0.0041 |
| Medium | B | 2,205 | 2,065 | 3,271 | 1,415 | 3,363 | −401 ms (−24%) | 1,059 | 916 | 1,032 | 1,142 | $0.0024 |
| Medium | A+B | 2,208 | 2,024 | 3,323 | 1,356 | 3,542 | −360 ms (−22%) | 1,041 | 686 | 1,040 | 1,163 | $0.0021 |

None never calls the refiner, so B and A+B at None are the same as Baseline and A. Stage columns are means from the server's own timings. Primary and name-check columns time the individual API calls, which run in parallel; the stage ends when both are done (or 1.5 s after the primary).

By recording length (Light and Medium together, p50 ms):

| Config | ~5 s | ~15 s | ~30 s |
| --- | --- | --- | --- |
| Baseline | 1,375 | 1,672 | 2,568 |
| A | 1,320 | 1,682 | 2,619 |
| B | 1,519 | 2,057 | 2,988 |
| A+B | 1,553 | 1,987 | 2,941 |

### Stop → text displayed (browser)

The production frontend build ran in headless Chromium, with the recording played into its fake microphone and the developer latency panel's total read out. Two recordings (en-15-a, mixed-15-b) × 3 repeats, so 6 runs per row: treat these as a sanity check, not as precise numbers.

| Level | Config | Mean | p50 | p95 | Saved at p50 | Audio finalization | Display |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None | Baseline | 1,484 | 1,511 | 1,668 | — | 12 | 56 |
| None | A | 1,256 | 1,206 | 1,450 | 305 ms (20%) | 11 | 18 |
| Light | Baseline | 2,042 | 2,007 | 2,252 | — | 15 | 17 |
| Light | A | 2,017 | 1,971 | 2,219 | 37 ms (2%) | 13 | 16 |
| Light | B | 2,667 | 2,358 | 3,721 | −350 ms (−17%) | 20 | 17 |
| Light | A+B | 2,349 | 2,318 | 2,762 | −311 ms (−15%) | 14 | 18 |
| Medium | Baseline | 2,039 | 2,094 | 2,239 | — | 13 | 18 |
| Medium | A | 2,163 | 2,141 | 2,454 | −46 ms (−2%) | 14 | 19 |
| Medium | B | 2,787 | 2,571 | 3,607 | −477 ms (−23%) | 13 | 18 |
| Medium | A+B | 2,480 | 2,420 | 3,039 | −326 ms (−16%) | 18 | 18 |

The browser adds only about 30 ms (audio finalization plus display), so the API round trip is essentially the whole wait. The 305 ms A saving at None in the browser is 6 runs on two recordings; the 60-request server benchmark puts it at 22 ms.

## Transcription

Before refinement, with the production prompt and name check. Corpus rates over 3 repeats; fillers ignored in the headline rate.

| Model | English WER | Chinese CER | Hindi WER | Mixed-language errors |
| --- | --- | --- | --- | --- |
| Baseline `gpt-transcribe` | 0.00% | 3.10% | 0.51% | CER 4.91%, 3/27 samples with a translation |
| Faster candidate `gpt-4o-mini-transcribe-2025-12-15` | 0.00% | 2.38% | 1.29% | CER 1.89%, 2/27 samples with a translation |
| Change | ±0 | −0.72 pts (−23% rel.) | **+0.77 pts (+150% rel.)** | CER −3.03 pts (−62% rel.) |

Error counts behind the rates: English 0 and 0 of 996 words; Hindi 4 and 10 of 777 words. With fillers kept (verbatim), English WER is 2.06% → 1.67% and Hindi 1.52% → 2.53%.

Mixed English–Mandarin detail:

| Model | Mixed CER | Mixed token error | Language preservation | Code-switching accuracy | Unintended translation | Technical terms kept |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | 4.91% | 4.55% | 97.5% | 98.8% | 11.1% (3/27) | 95.8% (69/72) |
| Candidate | 1.89% | 2.50% | 98.4% | 94.7% | 7.4% (2/27) | 91.7% (66/72) |

Entity errors, all languages:

| Model | Names missed | Terms missed | Numbers missed | Dates missed | Negations missed |
| --- | --- | --- | --- | --- | --- |
| Baseline | 3.8% (3/78) | 2.0% (3/150) | 3.4% (3/87) | 0% (0/87) | 0% (0/63) |
| Candidate | 0% (0/78) | **6.0% (9/150)** | 0% (0/87) | 0% (0/87) | 0% (0/63) |

Failure examples (repeat 1):

- **mixed-15-a, baseline translated a clause.** Said: "我觉得我们应该用 PostgreSQL，because it handles relational data better，而且 team 里…". `gpt-transcribe` wrote "…因为它处理关系型数据更好…" (3 of 3 repeats). The candidate kept the English but heard "team 里" as "挺力".
- **mixed-5-a, candidate invented a word.** Said: "这个 bug 我明天 fix 一下。" The candidate wrote "JacobBug,我明天fix一下。"
- **hi-30-b, candidate broke a technical word.** "डेटाबेस" became "डेटा बेस", and "तय" became "तै".
- **zh-30-c, baseline lost a percent and a name.** "百分之十五" became "15", and "刘洋" became the homophone "刘阳". Refinement cannot recover either.

## Refinement

Each model refined the same 36 reference transcripts (verbatim, fillers and corrections included), 3 repeats per level, with the production prompt and language retry. Rules run on all 108 outputs per row; *judged* uses repeat 1 (36 outputs).

| Model | Meaning Preservation | Correction Accuracy | Hallucination Rate | Language Preservation |
| --- | --- | --- | --- | --- |
| Baseline `gpt-4.1`, Light | 97.2% (105/108) · judged 97.2% (35/36) | 100% (39/39) | 0% (0/108) · judged 0/36 | 97.2% (105/108) |
| Faster candidate `gpt-6-luna`, Light | **100% (108/108)** · judged 100% (36/36) | 100% (39/39) | 0% (0/108) · judged 0/36 | **100% (108/108)** |
| Baseline `gpt-4.1`, Medium | 97.2% (105/108) · judged 94.4% (34/36) | 100% (39/39) | 0% (0/108) · judged 0/36 | 97.2% (105/108) |
| Faster candidate `gpt-6-luna`, Medium | 95.4% (103/108) · judged 94.4% (34/36) | 100% (39/39) | 0% (0/108) · judged 0/36 | **95.4% (103/108)** |
| Runner-up `gpt-5.4-mini`, Light | 97.2% (105/108) · judged 94.4% (34/36) | **92.3% (36/39)** | 0% (0/108) | 100% (108/108) |
| Runner-up `gpt-5.4-mini`, Medium | 98.1% (106/108) · judged 97.2% (35/36) | 100% (39/39) | 0% (0/108) | 98.1% (106/108) |

Entity preservation was 100% for `gpt-4.1` and `gpt-6-luna` at both levels (465/465). `gpt-5.4-mini` lost one number at Light. Fillers left: 0% for all. Judged quality (grammar, readability, filler removal, concision, 1–5) was 4.92–5.00 for every model and level, so the judge doesn't separate them. Output repeatability (the same text on all 3 repeats) was lower for the reasoning models: at Medium, 33/36 for `gpt-4.1` against 28/36 for `gpt-6-luna` and `gpt-5.4-mini`. Refinement call p50 in the concurrent accuracy run was `gpt-4.1` 760–797 ms, `gpt-5.4-mini` 837–854 ms and `gpt-6-luna` 1,091–1,254 ms, so neither candidate is faster than the baseline.

Failure examples:

- **mixed-30-c, both `gpt-4.1` (Light and Medium) and `gpt-6-luna` (Medium) translated "one for backend and one for data"** into "一个负责 backend，一个负责 data". This is the one translation the baseline also makes.
- **mixed-30-b, `gpt-6-luna` Medium translated a whole clause, in 3 of 3 repeats.** "我觉得 we need more time to test it properly" became "我觉得需要更多时间才能充分测试". The production retry did not catch it, because the clause is too small for `lostLanguages` and not one of the single words `translatedWords` checks.
- **hi-30-c, `gpt-5.4-mini` Light kept the retracted number.** "हम चार लोगों को, नहीं मतलब छह लोगों को हायर करेंगे" became "हम चार लोगों को हायर करेंगे" (4 instead of 6). It also kept "七个人" in zh-30-c in 2 of 3 repeats. This is why `gpt-5.4-mini` was not carried into B.
- **en-15-a, `gpt-4.1` Medium dropped a hedge (judged).** "I think we need to bump the node size" became "We need to…". `gpt-6-luna` kept it.
- **None:** a unit test checks that None returns all 36 scripts byte for byte with no model call, for each refiner. End to end, None output equalled the transcript in 36/36 cases for every configuration.

## End-to-end quality

Each configuration's refiner refined its own transcriber's repeat-1 transcripts, so Baseline and B (and A and A+B) refine the identical transcript. Scored against what was said.

| Config | Level | Meaning preservation (rules) | Meaning (rules + judged) | Correction accuracy | Hallucination (rules + judged) | Unintended translation |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | Light | 94.4% (34/36) | 91.7% (33/36) | 100% (13/13) | 2.8% (1/36) | 2.8% (1/36) |
| A | Light | 91.7% (33/36) | 88.9% (32/36) | 100% (13/13) | 5.6% (2/36) | 2.8% (1/36) |
| B | Light | 94.4% (34/36) | 91.7% (33/36) | 100% (13/13) | 2.8% (1/36) | 2.8% (1/36) |
| A+B | Light | 94.4% (34/36) | 91.7% (33/36) | 100% (13/13) | 5.6% (2/36) | 2.8% (1/36) |
| Baseline | Medium | 91.7% (33/36) | 86.1% (31/36) | 100% (13/13) | 2.8% (1/36) | 5.6% (2/36) |
| A | Medium | 91.7% (33/36) | 83.3% (30/36) | 100% (13/13) | 5.6% (2/36) | 5.6% (2/36) |
| B | Medium | 88.9% (32/36) | 86.1% (31/36) | 100% (13/13) | 2.8% (1/36) | **11.1% (4/36)** |
| A+B | Medium | 94.4% (34/36) | 91.7% (33/36) | 100% (13/13) | 5.6% (2/36) | 2.8% (1/36) |

Combining the two changes added **no extra failures**: there was no recording and level where A+B failed while both A and B passed. A+B's hallucinations are A's transcription errors carried through ("JacobBug", "挺力/挺有力"). Its Medium translation count is lower than B's only because A's transcripts of mixed-30-b and mixed-30-c happened to escape the translation; with one pass per configuration, that is not evidence that A+B translates less.

Several failures are shared by every configuration and come from the recordings or transcription, not the refiners: zh-30-a (see "Reference checks"), zh-30-c (lost percent and name), and mixed-15-a for the `gpt-transcribe` configurations (translated clause).

## Quality vs. speed trade-offs

- **Fastest:** A, by 57 ms at Light p50 (3%) and 22 ms at None; slower at Medium (−80 ms). That's within run-to-run noise. B and A+B are about 300–400 ms slower than the baseline.
- **Best accuracy:** no configuration wins everywhere. For transcription, the baseline is better on Hindi and technical terms, and the candidate on mixed CER, names and numbers. For refinement, `gpt-6-luna` is best at Light, and `gpt-4.1` and `gpt-6-luna` tie on meaning at Medium. End to end, Baseline and B are equal at Light.
- **Fewest hallucinations:** Baseline and B (1/36 at each level, the inherited "15" for "百分之十五"). A and A+B add the two misheard-word inventions.
- **Does faster transcription cause more code-switching errors?** Mixed: it translated less (2 against 3 samples) and had a far lower mixed CER, but code-switching accuracy fell from 98.8% to 94.7%, and it missed 3× more technical terms, mostly English words inside Chinese sentences.
- **Does faster refinement weaken correction handling?** No for `gpt-6-luna`: 100% at both levels. Yes for `gpt-5.4-mini` at Light (92.3%), with retracted numbers kept in Hindi and Mandarin.
- **Does combining add downstream errors?** Not in this run: 0 extra failures. A+B inherits A's transcription errors, and refinement neither fixed nor worsened them.

## Decision against the thresholds

| Threshold | A | B (`gpt-6-luna`) | A+B |
| --- | --- | --- | --- |
| WER/CER ≤ +5% relative | **Fails** (Hindi +150%) | n/a (same transcriber) | **Fails** (Hindi +150%) |
| Meaning preservation ≥ −2 pts | **Fails** at Light end to end (−2.8 pts rules, −2.8 judged) | Passes at Light; **fails** at Medium end to end by rules (−2.8 pts; equal to baseline when judged), −1.8 pts refinement-only | Passes |
| Self-correction ≥ −5 pts | Passes | Passes | Passes |
| Unintended translation not higher | Passes | **Fails** at Medium (5 against 3 of 108 refinement-only; 4 against 2 of 36 end to end) | Passes in this run |
| Hallucination not higher | **Fails** (2 against 1 of 36) | Passes | **Fails** (2 against 1 of 36) |
| Entity preservation ≥ −2 pts | **Fails** for terms (−4.0 pts) | Passes | **Fails** for terms |
| Faster at all | Barely (≤ 57 ms) | **No (+335–401 ms)** | **No (+286–360 ms)** |

Each optimized configuration violates at least one threshold, and none is meaningfully faster, so the baseline stays.

## What to do next

1. **The name check sets the transcription time.** In every configuration the transcription stage tracks the `gpt-4o-transcribe` name check (about 1,040 ms mean), not the primary model (690–950 ms). A faster primary cannot help until the name check is faster or optional. A separate, clearly labelled experiment could try A with the name check off, or with `gpt-4o-mini-transcribe` as the name check, and measure what it costs in name accuracy (PR #17's reason for existing). I did not run that, because it changes a model outside the four approved configurations.
2. **`gpt-4.1` shuts down on 2027-01-14** (`GET /v1/models` `shutdown_date`; OpenAI names `gpt-6-luna` as the replacement), so the refiner must change anyway. On quality, `gpt-6-luna` is a credible replacement at Light and about 55× cheaper per refinement call. Before switching, its Medium clause translations and its roughly 300 ms extra latency need work. Options include a clause-level translation check in the retry logic (the alignment check used here caught every multi-word translation the judge found) and testing whether a prompt change helps, run as a separate, labelled prompt experiment. `gpt-4o-transcribe`, used for the name check, also shuts down, on 2027-02-26.
3. **Rerun on real recordings** before any production decision. See `docs/model-benchmark.md` ("Your own recordings"): save files as `backend/.eval-samples/real/models/<id>.webm` and run `npm run benchmark:models -- --source=real`.

## Reference checks (synthetic audio)

Spans where both transcription models made the same error, listed in the review sheet:

- **zh-30-a:** both models (and `whisper-1`, checked separately) leave out the last sentence, "大家提前安排好工作". The audio ends at 26.7 s with silence after "两个小时", so the text-to-speech most likely never said it. The reference is unchanged, so every configuration loses the same points on this recording; please listen to `zh-30-a.webm` to confirm.
- **mixed-15-a:** both models miss "team" ("团队", "挺力"), which may be how the voice said it.
- **Hindi nukta and chandrabindu:** both models write फाइल for फ़ाइल and जाएंगे for जाएँगे. These are accepted spelling variants, so scoring folds them (documented in `docs/model-benchmark.md`). Without the fold, both models' Hindi WER would be about 5%.

Scoring changes made after the first look at results, applied to every configuration alike: the folds above; छः accepted for छह; "stand up" accepted for "standup"; "रात दो" accepted for "दो बजे" ("दो से चार बजे" keeps the time); and % and $ spelled out before comparison, so "1%" equals "one percent". The last change removed six false English errors from the candidate and added a real one to the baseline ("15" for "百分之十五").

## Cost

Estimated from list prices and logged per call: **$4.52 in total** ($4.41 for the benchmark, $0.10 for the smoke test, and under $0.01 for compatibility probes and the `whisper-1` check), against the approved $12 cap. By stage: latency $1.81, judge $1.00, refinement $0.53, transcription $0.46, end to end $0.34, browser $0.16, audio $0.12.

## Reproduce

```
cd backend
npm run benchmark:models                           # all stages, synthetic audio, $12 cap
npm run benchmark:models -- --stages=report        # rebuild tables from saved results
npm run benchmark:models -- --source=real          # your own recordings
```

Outputs: `tables.md` (all tables), `review.md` (every failure, every judge flag, and 10 random passing outputs per model to spot-check) and `summary.json`, in `backend/.eval-runs/models-<source>/`.
