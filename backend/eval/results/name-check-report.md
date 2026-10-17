# Name check benchmark report (O1, O2, O4, O2+O4)

Run on 2026-10-17 from branch `claude/name-check-investigation-qkumqh`, which is based on PR #18. Method: `docs/name-check-benchmark.md`. Generated tables: `name-check-tables.md`. Every change the name check made, and every O2 output that differs: `name-check-review.md`. Raw data is in the project files under `eval-runs/name-check/`. Nothing in production was changed or deployed.

## Recommendation

1. **Ship O1 (the number fix).** It removes every harmful change the name check made in this run and keeps every helpful one. Latency is unchanged.
2. **O2 (refinement alongside the check) is accuracy-neutral and a modest latency gain.** In all 14 tested outputs it produced the same polished text as production. At p50 it saves 65 ms at Light and 142 ms at Medium. At p95 it saves 400–530 ms. It's worth keeping if you value the tail, but it isn't urgent, and the same idea applies after realtime streaming.
3. **Reject O4 and O2+O4.** As the name check, `gpt-4o-mini-transcribe-2025-12-15` kept fewer names (36 vs 38 of 45 clean, 29 vs 34 noisy) and fewer technical terms, and lowered code-switching accuracy. It also made two meaning-changing swaps ("send out" → "send 到"). The latency gain was no better than O2's, and the two together saved no more than either one alone.
4. `gpt-4o-transcribe` still shuts down on 2027-02-26, and the mini snapshot is not an acceptable replacement on this evidence. Choosing what comes next belongs to the realtime work.

## Read this first

- **Synthetic speech.** All recordings are OpenAI TTS (`gpt-4o-mini-tts`). This covers the same 36 model-benchmark recordings plus the 31 PR #17 name recordings, clean and with onyx voice at 15 dB pink noise. References are the scripts. zh-30-a is still suspected of missing its last sentence, and it affects every configuration equally.
- **Same main transcript for every configuration.** Each recording was transcribed 3 times by `gpt-transcribe`, `gpt-4o-transcribe` and the mini snapshot at once. Each configuration's raw transcript comes from those, including the 1.5 s wait limit, so accuracy differences come only from the name check.
- **Latency** comes from the server's own stage timings (PR #15), with the backend in-process and calls from this container to OpenAI. It is not the live site. Each row is 12 recordings × 5 repeats, interleaved. p50 differences under about 100 ms are within run-to-run noise; Fixed's Light p50 in this run (1,622 ms) differs from the model benchmark's baseline (1,704 ms) by about that much.

## Accuracy

The 36 model-benchmark recordings, 108 transcripts per row:

| Config | Mandarin CER | Mixed CER | Code-switching kept | Terms missed | Numbers missed | Harmful changes |
| --- | --- | --- | --- | --- | --- | --- |
| Before fix (production today) | 3.10% | 6.37% | 98.8% | 3/150 | **6/87** | **5** |
| **Fixed (O1)** | **2.38%** | **4.89%** | 98.8% | 3/150 | **0/87** | **0** |
| O4 (mini check) | 2.38% | 5.80% | 95.5% | 6/150 | 0/87 | 2 |
| No check | 2.38% | 5.92% | 93.9% | 6/150 | 0/87 | — |

English WER (0.00%), Hindi WER (0.39%), names missed (3/78), dates and negations (0 missed) were identical in every configuration. The name check can't act on Hindi, which is written in Devanagari, so Hindi is unaffected by design.

The 31 name recordings, 93 transcripts per row:

| Config | Names kept as spoken, clean | noisy | Languages kept, clean | noisy |
| --- | --- | --- | --- | --- |
| Before fix | 38/45 | 34/45 | 84/93 | 87/93 |
| **Fixed (O1)** | **38/45** | **34/45** | 84/93 | 87/93 |
| O4 (mini check) | 36/45 | 29/45 | 84/93 | 85/93 |
| No check | 23/45 | 24/45 | 81/93 | 84/93 |

What the fix removed: all 5 harmful changes before the fix were numbers. "百分之十五" became "15" and "百分之二" became "2", losing the percent; "十点" became "10 点". After the fix, the name check made 31 changes across all three sets, and all of them were helpful. Examples are 纽约大学, 张老师, 外滩, 腾讯/微信, Seattle, "team 里" and "push 到".

Why O4 fails: twice it swapped "send out" for "send 到" in mixed-30-c, which changes the words. It also restored fewer names, most clearly in noise (29 vs 34 of 45). One of its "helpful" noisy changes, like the Fixed one, writes 腾迅 for 腾讯. That still counts as keeping the language, but it's the wrong character.

## Refinement alongside the name check (O2)

For every recording where the check changed the transcript (repeat 1, Light and Medium), refinement ran in both orders:

| Config | Outputs | Swap placed in refined text | Same text as refining after the check | Meaning kept |
| --- | --- | --- | --- | --- |
| O2 | 14 | 13/14 (1 refined again) | **14/14** | 14/14 |
| O2+O4 | 12 | 11/12 (1 refined again) | 10/12 | 12/12 |

The one "refined again" case was mixed-5-c at Medium. There the refiner had already rewritten "push down", so O2 refined the changed transcript a second time and got the same text. The two O2+O4 differences come from O4's bad "send 到" swap, not from the overlap.

## Latency (`/api/process`, ms)

| Level | Config | p50 | p95 | p50 vs Fixed | p95 vs Fixed |
| --- | --- | --- | --- | --- | --- |
| None | Fixed | 925 | 1,751 | — | — |
| None | O4 | 824 | 1,473 | −101 | −279 |
| Light | Fixed | 1,622 | 2,866 | — | — |
| Light | O2 | 1,557 | 2,464 | −65 | −402 |
| Light | O4 | 1,617 | 2,520 | −5 | −346 |
| Light | O2+O4 | 1,594 | 2,597 | −28 | −269 |
| Medium | Fixed | 1,702 | 2,980 | — | — |
| Medium | O2 | 1,560 | 2,447 | −142 | −532 |
| Medium | O4 | 1,539 | 2,512 | −163 | −467 |
| Medium | O2+O4 | 1,551 | 2,501 | −151 | −479 |

- **What there is to gain.** With Fixed, the transcription stage waited 96–109 ms (p50) and 480–550 ms (p95) longer than the main call. That wait is the most any of these options can save.
- **O2** hides the wait behind refinement, about 760 ms. No request needed a second refinement call (0/120). O2 doesn't apply at None, where there's nothing to overlap with.
- **O4** makes the check finish about as fast as the main call: the extra wait drops to about 1 ms at p50, at the accuracy cost above.
- **The gains aren't additive.** O2+O4 is no faster than either alone, because both remove the same wait.
- **Browser check** (Light, 2 recordings × 3): Fixed 2,101 ms p50, O2+O4 1,956 ms. Six runs is only a sanity check.

## Is it worth the complexity?

- **O1:** yes. It's a 2-line rule plus regression tests, and it fixes a real meaning error ("15" for 15%).
- **O2:** about 20 lines in the route plus `applySwaps`. It's off by default (`NAME_CHECK_OVERLAP`). It saves 65–142 ms at p50 and 0.4–0.5 s at p95 with no accuracy change in this run. That's small next to realtime streaming, which removes most of the ~0.8 s transcription wait after Stop. With realtime, the transcript is ready at Stop, so a batch name check would again be the wait unless it overlaps with refinement. O2's approach carries over directly.
- **O4:** no.

## Cost

Estimated $2.85 of the $8 cap: audio $0.12, capture $0.63, refinement comparison $0.11, latency $1.95, browser $0.04.
