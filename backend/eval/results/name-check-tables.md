# Name check benchmark

Synthetic speech (OpenAI `gpt-4o-mini-tts`), not human recordings. Main transcription `gpt-transcribe`, refinement `gpt-4.1`. Fixed is the corrected baseline (the name check with the number fix); "Before fix" is production before it. O4 uses `gpt-4o-mini-transcribe-2025-12-15` as the name check. 3 repeats per recording.

## Transcription accuracy (raw transcript)

Every configuration starts from the same `gpt-transcribe` transcript of each recording and repeat; only the name check differs. O2 returns the same raw transcript as Fixed, and O2+O4 the same as O4. Rates are corpus rates over all repeats, fillers ignored.

### The 36 model-benchmark recordings

| Config | English WER | Mandarin CER | Hindi WER | Mixed CER | Code-switching kept | Recordings with a translation | Names missed | Terms missed | Numbers missed | Dates missed | Negations missed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Before fix | 0.00% | 3.10% | 0.39% | 6.37% | 98.8% | 2.8% (3/108, 1%–8%) | 3.8% (3/78, 1%–11%) | 2.0% (3/150, 1%–6%) | 6.9% (6/87, 3%–14%) | 0.0% (0/87, 0%–4%) | 0.0% (0/63, 0%–6%) |
| Fixed | 0.00% | 2.38% | 0.39% | 4.89% | 98.8% | 2.8% (3/108, 1%–8%) | 3.8% (3/78, 1%–11%) | 2.0% (3/150, 1%–6%) | 0.0% (0/87, 0%–4%) | 0.0% (0/87, 0%–4%) | 0.0% (0/63, 0%–6%) |
| O4 | 0.00% | 2.38% | 0.39% | 5.80% | 95.5% | 2.8% (3/108, 1%–8%) | 3.8% (3/78, 1%–11%) | 4.0% (6/150, 2%–8%) | 0.0% (0/87, 0%–4%) | 0.0% (0/87, 0%–4%) | 0.0% (0/63, 0%–6%) |
| No check | 0.00% | 2.38% | 0.39% | 5.92% | 93.9% | 2.8% (3/108, 1%–8%) | 3.8% (3/78, 1%–11%) | 4.0% (6/150, 2%–8%) | 0.0% (0/87, 0%–4%) | 0.0% (0/87, 0%–4%) | 0.0% (0/63, 0%–6%) |

### The 31 name-check recordings, clean

| Config | Names kept as spoken | Languages kept | Mixed token error |
| --- | --- | --- | --- |
| Before fix | 38/45 | 84/93 | 7.1% |
| Fixed | 38/45 | 84/93 | 7.1% |
| O4 | 36/45 | 84/93 | 7.3% |
| No check | 23/45 | 81/93 | 8.8% |

### The 31 name-check recordings, onyx voice, pink noise at 15 dB SNR

| Config | Names kept as spoken | Languages kept | Mixed token error |
| --- | --- | --- | --- |
| Before fix | 34/45 | 87/93 | 5.8% |
| Fixed | 34/45 | 87/93 | 5.8% |
| O4 | 29/45 | 85/93 | 6.4% |
| No check | 24/45 | 84/93 | 7.6% |

### What each name check changed

A change is helpful when it lowers the recording's error rate against what was said (or keeps more names as spoken), harmful when it raises it, neutral otherwise. Every change is listed in review.md.

| Config | Recordings | Transcripts changed | Helpful | Harmful | Neutral |
| --- | --- | --- | --- | --- | --- |
| Before fix | 36 recordings | 11/108 | 6 | 5 | 0 |
| Before fix | name recordings, clean | 12/93 | 12 | 0 | 0 |
| Before fix | name recordings, noisy | 13/93 | 13 | 0 | 0 |
| Fixed | 36 recordings | 6/108 | 6 | 0 | 0 |
| Fixed | name recordings, clean | 12/93 | 12 | 0 | 0 |
| Fixed | name recordings, noisy | 13/93 | 13 | 0 | 0 |
| O4 | 36 recordings | 5/108 | 3 | 2 | 0 |
| O4 | name recordings, clean | 10/93 | 10 | 0 | 0 |
| O4 | name recordings, noisy | 8/93 | 8 | 0 | 0 |

## Refinement alongside the name check (O2)

For every recording (repeat 1) where the name check changed the transcript, Light and Medium were refined in both orders: after the check (as production does) and alongside it, with the swap made in the refined text, or the changed transcript refined again when the name was not there exactly once. When the check changes nothing, both orders refine the same text, so they are not run.

| Config | Outputs | Swap placed in refined text | Identical to refining after the check | Meaning kept, after the check | Meaning kept, alongside |
| --- | --- | --- | --- | --- | --- |
| O2 (with gpt-4o-transcribe) | 14 | 13/14 | 14/14 | 14/14 | 14/14 |
| O2+O4 (with mini) | 12 | 11/12 | 10/12 | 11/12 | 12/12 |

Meaning kept: for the 36 recordings, the rule-based check from the model benchmark (entities, correction, languages, no new numbers) against the changed raw transcript; for the name recordings, every name the raw transcript kept as spoken is still there.

## Latency

`/api/process` round trip in ms, backend in this process (loopback HTTP), container → OpenAI. 5 repeats × 12 recordings per row, configurations interleaved. Extra wait: how much longer the transcription stage took than the main `gpt-transcribe` call. At None there is no refinement to overlap with, so O2 and O2+O4 are the same as Fixed and O4.

| Level | Config | p50 | p95 | Mean | p50 change vs Fixed | p95 change vs Fixed | Main call p50 | Check call p50 | Extra wait p50 / p95 | Refinement stage p50 | Refined twice | Failed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| None | Fixed | 925 | 1,751 | 1,050 | — | — | 778 | 897 | 96 / 485 | 0 | — | 0 |
| None | O4 | 824 | 1,473 | 914 | −101 ms (11%) | −279 ms (16%) | 820 | 643 | 1 / 2 | 0 | — | 0 |
| Light | Fixed | 1,622 | 2,866 | 1,893 | — | — | 789 | 874 | 109 / 547 | 759 | 0/60 | 0 |
| Light | O2 | 1,557 | 2,464 | 1,704 | −65 ms (4%) | −402 ms (14%) | 772 | 896 | hidden | 763 | 0/60 | 0 |
| Light | O4 | 1,617 | 2,520 | 1,740 | −5 ms (0%) | −346 ms (12%) | 805 | 644 | 1 / 89 | 768 | 0/60 | 0 |
| Light | O2+O4 | 1,594 | 2,597 | 1,814 | −28 ms (2%) | −269 ms (9%) | 854 | 631 | hidden | 760 | 0/60 | 0 |
| Medium | Fixed | 1,702 | 2,980 | 1,913 | — | — | 810 | 853 | 60 / 481 | 778 | 0/60 | 0 |
| Medium | O2 | 1,560 | 2,447 | 1,737 | −142 ms (8%) | −532 ms (18%) | 808 | 925 | hidden | 762 | 0/60 | 0 |
| Medium | O4 | 1,539 | 2,512 | 1,719 | −163 ms (10%) | −467 ms (16%) | 769 | 618 | 1 / 4 | 749 | 0/60 | 0 |
| Medium | O2+O4 | 1,551 | 2,501 | 1,707 | −151 ms (9%) | −479 ms (16%) | 771 | 609 | hidden | 759 | 0/60 | 0 |

A minus sign is faster than Fixed. "Refined twice" counts requests that needed a second refinement call, for any reason: a swap that could not be placed in the refined text (O2) or the language retry in refinement.js (any configuration).

## Stop → text displayed (browser, Light)

Production frontend build in headless Chromium with the recording as its fake microphone, total from the `?latency=1` panel. en-15-a, mixed-15-b × 3 repeats; a sanity check, not a precise number.

| Config | p50 | p95 | Mean | Runs |
| --- | --- | --- | --- | --- |
| Fixed | 2,101 | 2,407 | 2,118 | 6 |
| O2+O4 | 1,956 | 2,597 | 2,045 | 6 |

## Cost

Estimated from list prices: $2.85 (audio $0.12, capture $0.63, e2e $0.11, latency $1.95, browser $0.04), against a $8 cap.

No transcription call failed.
