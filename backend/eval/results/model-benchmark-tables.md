# Model benchmark tables

Source: **synthetic** recordings (OpenAI text-to-speech reading the scripts; the reference is the script text). Generated 2026-10-17T18:52:04.280Z.

## Latency

Environment: this cloud container → OpenAI, backend running in the benchmark process (loopback HTTP, usage limits off), synthetic WebM/Opus recordings, sequential requests. 12 recordings (one per language and length) × 5 repeats per configuration and level, interleaved. Times are the /api/process round trip in ms; the stage columns are the server's own timings. Not comparable with timings from the live site, which add the user's network, Vercel and Render.

### None

| Config | Runs | Failed | Mean | p50 | p95 | Min | Max | Saved at p50 | Transcription stage | Primary call | Name check call | Refinement stage | Server total | API cost / recording |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | 60 | 0 | 1,079 | 927 | 1,877 | 561 | 1,984 | — | 1,075 | 905 | 1,052 | 0 | 1,076 | $0.0024 |
| A | 60 | 0 | 1,041 | 905 | 1,838 | 562 | 1,966 | 22 ms (2%) | 1,038 | 686 | 1,037 | 0 | 1,039 | $0.0020 |

### Light

| Config | Runs | Failed | Mean | p50 | p95 | Min | Max | Saved at p50 | Transcription stage | Primary call | Name check call | Refinement stage | Server total | API cost / recording |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | 60 | 0 | 1,902 | 1,704 | 2,831 | 1,163 | 2,965 | — | 1,097 | 951 | 1,040 | 802 | 1,900 | $0.0040 |
| A | 60 | 0 | 1,877 | 1,647 | 2,837 | 1,172 | 3,163 | 57 ms (3%) | 1,060 | 717 | 1,046 | 815 | 1,875 | $0.0043 |
| B | 60 | 0 | 2,181 | 2,039 | 3,439 | 1,342 | 3,837 | -335 ms (-20%) | 1,072 | 878 | 1,057 | 1,104 | 2,178 | $0.0024 |
| A+B | 60 | 0 | 2,190 | 1,990 | 3,476 | 1,283 | 3,714 | -286 ms (-17%) | 1,036 | 696 | 1,035 | 1,150 | 2,187 | $0.0021 |

### Medium

| Config | Runs | Failed | Mean | p50 | p95 | Min | Max | Saved at p50 | Transcription stage | Primary call | Name check call | Refinement stage | Server total | API cost / recording |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | 60 | 0 | 1,880 | 1,664 | 2,820 | 1,219 | 2,950 | — | 1,089 | 922 | 1,062 | 788 | 1,877 | $0.0043 |
| A | 60 | 0 | 1,928 | 1,744 | 2,900 | 1,169 | 3,014 | -80 ms (-5%) | 1,045 | 698 | 1,044 | 879 | 1,926 | $0.0041 |
| B | 60 | 0 | 2,205 | 2,065 | 3,271 | 1,415 | 3,363 | -401 ms (-24%) | 1,059 | 916 | 1,032 | 1,142 | 2,202 | $0.0024 |
| A+B | 60 | 0 | 2,208 | 2,024 | 3,323 | 1,356 | 3,542 | -360 ms (-22%) | 1,041 | 686 | 1,040 | 1,163 | 2,206 | $0.0021 |

### By recording length (Light and Medium together, p50 ms)

| Config | ~5 s | ~15 s | ~30 s |
| --- | --- | --- | --- |
| Baseline | 1,375 | 1,672 | 2,568 |
| A | 1,320 | 1,682 | 2,619 |
| B | 1,519 | 2,057 | 2,988 |
| A+B | 1,553 | 1,987 | 2,941 |

Recording lengths: 3.2–28.2 s.

## End-to-end latency in the browser (Stop → text displayed)

Production frontend build served locally in headless Chromium, the recording played into its fake microphone, backend in the benchmark process. en-15-a and mixed-15-b × 3 repeats per configuration and level, a fresh browser each time. Total is the panel's Stop → painted text; the browser stages (audio finalization, frontend display) do not depend on the models.

| Level | Config | Runs | Failed | Mean | p50 | p95 | Min | Max | Saved at p50 | Finalization | Transcription | Refinement | Display |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | Baseline | 6 | 0 | 1,484 | 1,511 | 1,668 | 1,166 | 1,668 | — | 12 | 1,399 | 0 | 56 |
| none | A | 6 | 0 | 1,256 | 1,206 | 1,450 | 1,115 | 1,476 | 305 ms (20%) | 11 | 1,214 | 0 | 18 |
| light | Baseline | 6 | 0 | 2,042 | 2,007 | 2,252 | 1,838 | 2,265 | — | 15 | 1,189 | 809 | 17 |
| light | A | 6 | 0 | 2,017 | 1,971 | 2,219 | 1,924 | 2,283 | 37 ms (2%) | 13 | 1,119 | 857 | 16 |
| light | B | 6 | 0 | 2,667 | 2,358 | 3,721 | 2,275 | 4,111 | -350 ms (-17%) | 20 | 1,297 | 1,322 | 17 |
| light | A+B | 6 | 0 | 2,349 | 2,318 | 2,762 | 1,972 | 2,871 | -311 ms (-15%) | 14 | 1,255 | 1,053 | 18 |
| medium | Baseline | 6 | 0 | 2,039 | 2,094 | 2,239 | 1,735 | 2,264 | — | 13 | 1,262 | 733 | 18 |
| medium | A | 6 | 0 | 2,163 | 2,141 | 2,454 | 1,947 | 2,511 | -46 ms (-2%) | 14 | 1,346 | 772 | 19 |
| medium | B | 6 | 0 | 2,787 | 2,571 | 3,607 | 2,288 | 3,715 | -477 ms (-23%) | 13 | 1,546 | 1,198 | 18 |
| medium | A+B | 6 | 0 | 2,480 | 2,420 | 3,039 | 2,060 | 3,213 | -326 ms (-16%) | 18 | 1,338 | 1,093 | 18 |

## Transcription accuracy (before refinement)

Each model transcribed every recording 3 times with the production prompt and name check (`gpt-4o-transcribe`). Rates are corpus rates (total errors / total reference tokens) over all repeats; the range is the lowest and highest single-repeat rate. Fillers are ignored in the headline rate and kept in the verbatim rate.

| Model | English WER | Chinese CER | Hindi WER | Mixed CER | Mixed token error | Unintended translation (any language) | Failures |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gpt-transcribe` | 0.00% (0.0%–0.0%) | 3.10% (2.4%–3.5%) | 0.51% (0.4%–0.8%) | 4.91% (4.7%–5.3%) | 4.55% | 2.8% (3/108, 1%–8%) | 0 |
| `gpt-4o-mini-transcribe-2025-12-15` | 0.00% (0.0%–0.0%) | 2.38% (2.2%–2.8%) | 1.29% (0.8%–1.5%) | 1.89% (1.3%–2.5%) | 2.50% | 1.9% (2/108, 1%–7%) | 0 |

Change of the faster candidate against the baseline (absolute, and relative to the baseline rate):

| Group | Metric | `gpt-transcribe` | `gpt-4o-mini-transcribe-2025-12-15` | Change | Verbatim (fillers kept): baseline → candidate | Before name merge: baseline → candidate |
| --- | --- | --- | --- | --- | --- | --- |
| English | WER | 0.00% | 0.00% | +0.00 pts | 2.06% → 1.67% | 0.00% → 0.00% |
| Mandarin | CER | 3.10% | 2.38% | -0.72 pts (-23% rel.) | 3.27% → 2.99% | 2.38% → 2.38% |
| Hindi | WER | 0.51% | 1.29% | +0.77 pts (+150% rel.) | 1.52% → 2.53% | 0.51% → 1.29% |
| Mixed English–Mandarin | CER | 4.91% | 1.89% | -3.03 pts (-62% rel.) | 4.89% → 2.09% | 5.44% → 2.54% |

### Mixed English–Mandarin

| Model | Mixed CER | Language preservation | Code-switching accuracy | Unintended translation (samples) | Technical terms kept |
| --- | --- | --- | --- | --- | --- |
| `gpt-transcribe` | 4.91% | 97.5% | 98.8% | 11.1% (3/27, 4%–28%) | 95.8% (69/72, 88%–99%) |
| `gpt-4o-mini-transcribe-2025-12-15` | 1.89% | 98.4% | 94.7% | 7.4% (2/27, 2%–23%) | 91.7% (66/72, 83%–96%) |

### Entity errors (all languages)

| Model | name missed | term missed | number missed | date missed | negation missed |
| --- | --- | --- | --- | --- | --- |
| `gpt-transcribe` | 3.8% (3/78, 1%–11%) | 2.0% (3/150, 1%–6%) | 3.4% (3/87, 1%–10%) | 0.0% (0/87, 0%–4%) | 0.0% (0/63, 0%–6%) |
| `gpt-4o-mini-transcribe-2025-12-15` | 0.0% (0/78, 0%–5%) | 6.0% (9/150, 3%–11%) | 0.0% (0/87, 0%–4%) | 0.0% (0/87, 0%–4%) | 0.0% (0/63, 0%–6%) |

### Transcription call time (concurrent accuracy runs, not the latency benchmark)

| Model | Stage mean | Stage p50 | Primary call p50 | Name check p50 |
| --- | --- | --- | --- | --- |
| `gpt-transcribe` | 1,060 | 950 | 699 | 942 |
| `gpt-4o-mini-transcribe-2025-12-15` | 1,025 | 938 | 641 | 937 |

## Refinement quality (on the reference transcripts)

Every model refined the same 36 verbatim reference transcripts (fillers and corrections included) at Light and Medium, with the production prompt and retry logic. Deterministic checks run on every repeat; judge scores (blind, `gpt-5.6-terra`, labelled *judged*) on repeat 1 only. A refinement that failed (the production code refuses an output that translated a language twice) counts as a failure, not as a pass.

### Light

| Model | Meaning preservation | Meaning (rules + judged) | Correction accuracy | Hallucination (numbers) | Hallucination (rules + judged) | Entity preservation | Language preservation | Failed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gpt-4.1` | 97.2% (105/108, 92%–99%) | 97.2% (35/36, 86%–100%) | 100.0% (39/39, 91%–100%) | 0.0% (0/108, 0%–3%) | 0.0% (0/36, 0%–10%) | 100.0% (465/465, 99%–100%) | 97.2% (105/108, 92%–99%) | 0 |
| `gpt-6-luna` | 100.0% (108/108, 97%–100%) | 100.0% (36/36, 90%–100%) | 100.0% (39/39, 91%–100%) | 0.0% (0/108, 0%–3%) | 0.0% (0/36, 0%–10%) | 100.0% (465/465, 99%–100%) | 100.0% (108/108, 97%–100%) | 0 |
| `gpt-5.4-mini` | 97.2% (105/108, 92%–99%) | 94.4% (34/36, 82%–98%) | 92.3% (36/39, 80%–97%) | 0.0% (0/108, 0%–3%) | 0.0% (0/36, 0%–10%) | 99.8% (464/465, 99%–100%) | 100.0% (108/108, 97%–100%) | 0 |

| Model | Grammar (judged) | Readability (judged) | Filler removal (judged) | Concision (judged) | Fillers left (rules) | Output / input length | Same output all repeats | Retried | Call p50 ms (concurrent) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gpt-4.1` | 4.94 | 4.94 | 4.97 | 4.92 | 0.0% (0/108, 0%–3%) | 0.90 | 94.4% (34/36, 82%–98%) | 0 | 797 |
| `gpt-6-luna` | 5.00 | 5.00 | 5.00 | 5.00 | 0.0% (0/108, 0%–3%) | 0.90 | 88.9% (32/36, 75%–96%) | 0 | 1,254 |
| `gpt-5.4-mini` | 4.97 | 4.97 | 4.89 | 4.92 | 0.0% (0/108, 0%–3%) | 0.91 | 88.9% (32/36, 75%–96%) | 0 | 837 |

| Model | name kept | term kept | number kept | date kept | negation kept |
| --- | --- | --- | --- | --- | --- |
| `gpt-4.1` | 100.0% (78/78, 95%–100%) | 100.0% (150/150, 98%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (63/63, 94%–100%) |
| `gpt-6-luna` | 100.0% (78/78, 95%–100%) | 100.0% (150/150, 98%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (63/63, 94%–100%) |
| `gpt-5.4-mini` | 100.0% (78/78, 95%–100%) | 100.0% (150/150, 98%–100%) | 98.9% (86/87, 94%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (63/63, 94%–100%) |

### Medium

| Model | Meaning preservation | Meaning (rules + judged) | Correction accuracy | Hallucination (numbers) | Hallucination (rules + judged) | Entity preservation | Language preservation | Failed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gpt-4.1` | 97.2% (105/108, 92%–99%) | 94.4% (34/36, 82%–98%) | 100.0% (39/39, 91%–100%) | 0.0% (0/108, 0%–3%) | 0.0% (0/36, 0%–10%) | 100.0% (465/465, 99%–100%) | 97.2% (105/108, 92%–99%) | 0 |
| `gpt-6-luna` | 95.4% (103/108, 90%–98%) | 94.4% (34/36, 82%–98%) | 100.0% (39/39, 91%–100%) | 0.0% (0/108, 0%–3%) | 0.0% (0/36, 0%–10%) | 100.0% (465/465, 99%–100%) | 95.4% (103/108, 90%–98%) | 0 |
| `gpt-5.4-mini` | 98.1% (106/108, 93%–99%) | 97.2% (35/36, 86%–100%) | 100.0% (39/39, 91%–100%) | 0.0% (0/108, 0%–3%) | 0.0% (0/36, 0%–10%) | 100.0% (465/465, 99%–100%) | 98.1% (106/108, 93%–99%) | 0 |

| Model | Grammar (judged) | Readability (judged) | Filler removal (judged) | Concision (judged) | Fillers left (rules) | Output / input length | Same output all repeats | Retried | Call p50 ms (concurrent) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gpt-4.1` | 5.00 | 5.00 | 5.00 | 5.00 | 0.0% (0/108, 0%–3%) | 0.89 | 91.7% (33/36, 78%–97%) | 3 | 760 |
| `gpt-6-luna` | 5.00 | 5.00 | 5.00 | 5.00 | 0.0% (0/108, 0%–3%) | 0.89 | 77.8% (28/36, 62%–88%) | 1 | 1,091 |
| `gpt-5.4-mini` | 4.92 | 4.92 | 4.97 | 4.97 | 0.0% (0/108, 0%–3%) | 0.89 | 77.8% (28/36, 62%–88%) | 3 | 854 |

| Model | name kept | term kept | number kept | date kept | negation kept |
| --- | --- | --- | --- | --- | --- |
| `gpt-4.1` | 100.0% (78/78, 95%–100%) | 100.0% (150/150, 98%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (63/63, 94%–100%) |
| `gpt-6-luna` | 100.0% (78/78, 95%–100%) | 100.0% (150/150, 98%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (63/63, 94%–100%) |
| `gpt-5.4-mini` | 100.0% (78/78, 95%–100%) | 100.0% (150/150, 98%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (87/87, 96%–100%) | 100.0% (63/63, 94%–100%) |

## End-to-end quality (transcription + refinement)

Repeat 1 of each transcription model was refined by each configuration's refiner, so Baseline and B (and A and A+B) refine the identical transcript and differ only in the refiner. Outputs are scored against what was said (the reference), so transcription errors that survive refinement count here. None returns the transcript as is.

### Light

| Config | Meaning preservation | Meaning (rules + judged) | Correction accuracy | Hallucination (rules + judged) | Unintended translation | Quality (judged, 1–5) | Failed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | 94.4% (34/36, 82%–98%) | 91.7% (33/36, 78%–97%) | 100.0% (13/13, 77%–100%) | 2.8% (1/36, 0%–14%) | 2.8% (1/36, 0%–14%) | 4.94 | 0 |
| A | 91.7% (33/36, 78%–97%) | 88.9% (32/36, 75%–96%) | 100.0% (13/13, 77%–100%) | 5.6% (2/36, 2%–18%) | 2.8% (1/36, 0%–14%) | 4.84 | 0 |
| B | 94.4% (34/36, 82%–98%) | 91.7% (33/36, 78%–97%) | 100.0% (13/13, 77%–100%) | 2.8% (1/36, 0%–14%) | 2.8% (1/36, 0%–14%) | 4.92 | 0 |
| A+B | 94.4% (34/36, 82%–98%) | 91.7% (33/36, 78%–97%) | 100.0% (13/13, 77%–100%) | 5.6% (2/36, 2%–18%) | 2.8% (1/36, 0%–14%) | 4.86 | 0 |

### Medium

| Config | Meaning preservation | Meaning (rules + judged) | Correction accuracy | Hallucination (rules + judged) | Unintended translation | Quality (judged, 1–5) | Failed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | 91.7% (33/36, 78%–97%) | 86.1% (31/36, 71%–94%) | 100.0% (13/13, 77%–100%) | 2.8% (1/36, 0%–14%) | 5.6% (2/36, 2%–18%) | 4.97 | 0 |
| A | 91.7% (33/36, 78%–97%) | 83.3% (30/36, 68%–92%) | 100.0% (13/13, 77%–100%) | 5.6% (2/36, 2%–18%) | 5.6% (2/36, 2%–18%) | 4.89 | 0 |
| B | 88.9% (32/36, 75%–96%) | 86.1% (31/36, 71%–94%) | 100.0% (13/13, 77%–100%) | 2.8% (1/36, 0%–14%) | 11.1% (4/36, 4%–25%) | 4.95 | 0 |
| A+B | 94.4% (34/36, 82%–98%) | 91.7% (33/36, 78%–97%) | 100.0% (13/13, 77%–100%) | 5.6% (2/36, 2%–18%) | 2.8% (1/36, 0%–14%) | 4.89 | 0 |

None: output identical to the transcript in Baseline 100.0% (36/36, 90%–100%), A 100.0% (36/36, 90%–100%), B 100.0% (36/36, 90%–100%), A+B 100.0% (36/36, 90%–100%).

Failures in A+B that neither A nor B has on the same recording and level: **0**.

## API spend (estimated from list prices)

| Stage | Calls | Cost |
| --- | --- | --- |
| audio | 33 | $0.115 |
| transcribe | 432 | $0.463 |
| refine | 655 | $0.534 |
| e2e | 291 | $0.335 |
| latency | 1697 | $1.807 |
| browser | 168 | $0.160 |
| judge | 504 | $1.001 |

| Model | Calls | Cost |
| --- | --- | --- |
| `gpt-4o-mini-tts` | 33 | $0.115 |
| `gpt-4o-mini-transcribe-2025-12-15` | 440 | $0.293 |
| `gpt-4o-transcribe` | 880 | $1.171 |
| `gpt-transcribe` | 440 | $0.439 |
| `gpt-4.1` | 636 | $1.283 |
| `gpt-6-luna` | 628 | $0.023 |
| `gpt-5.4-mini` | 219 | $0.090 |
| `gpt-5.6-terra` | 504 | $1.001 |

Total: **$4.414**.
