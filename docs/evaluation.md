# Accuracy evaluation (Milestone 7)

Raw-transcript fidelity (fillers, language modes, translation) and refinement language preservation are measured separately: see [transcription-fidelity.md](transcription-fidelity.md).

## Update: one mixed-language mode with `gpt-transcribe`

The app no longer has a spoken-language setting. Every recording is sent to `gpt-transcribe` with `languages: ["zh", "en"]` and a prompt asking for a verbatim transcript that keeps each word in its spoken language and keeps fillers. Full report: [backend/eval/results/synthetic.md](../backend/eval/results/synthetic.md); the same 31 samples through `gpt-4o-transcribe` with the same prompt are in [synthetic-gpt-4o-transcribe.md](../backend/eval/results/synthetic-gpt-4o-transcribe.md).

| Model | English WER | Chinese CER | Mixed CER | Mixed-token error rate |
| --- | --- | --- | --- | --- |
| `gpt-transcribe`, Chinese plus English | 0.0% | 3.6% (one sample, see below) | 0.0% | 0.0% |
| `gpt-4o-transcribe`, same prompt | 0.6% | 0.8% | 0.0% | 0.0% |

The Chinese errors are all in `special-3`, where 2027年3月15日上午10点半 came back as 二零二七年三月十五日上午十点半: the same date in Chinese numerals. `mixed-4`, the hard case below, was transcribed correctly. All refinement checks passed (31 / 31 languages preserved).

The 31 samples are mostly Chinese with English terms, which every model handled. Users reported whole English clauses disappearing from mixed speech, so 11 harder synthetic clips (English clauses inside Chinese sentences, English-led sentences, fillers in both languages) were each run 3 times per setup:

| Setup | Runs where English was written in Chinese or dropped | Fillers kept |
| --- | --- | --- |
| `gpt-4o-transcribe`, no language, no prompt (the old Auto-detect) | 7 of 33 (one run dropped "which is way too slow for our users" entirely) | often removed: 嗯, 呃, um, uh |
| `gpt-4o-transcribe` plus the new prompt | 2 of 33 | some |
| `gpt-transcribe` with `languages: ["zh", "en"]` plus the prompt | 0 of 33 | almost all, identical across runs |

The old Auto-detect also removed fillers before refinement ever ran, which is why **None** still showed text without um or 嗯. `gpt-4o-transcribe` has no option for verbatim output; a prompt helps somewhat. `gpt-transcribe` keeps them far more consistently, though a very short filler can still be missed.

## Update: Hindi added

`languages` is now `["zh", "en", "hi"]` and the prompt names Hindi in Devanagari. On 6 synthetic Hindi and Hindi-English clips (2 runs each), every Hindi word stayed Hindi and every English clause stayed English, with or without `hi` in the list; the 7 Chinese-English clips above gave the same transcripts with `hi` added (one run kept an extra 呃). English words spoken inside Hindi sentences are sometimes written in Devanagari (सर्वर लॉग्स, टाइमआउट), which is a common way to write Hindi. Light and Medium refinement of Hindi and Hindi-English transcripts removed fillers (उम, उम्म, अं), resolved a Hindi correction (सोमवार, नहीं मतलब बुधवार → बुधवार) and translated nothing. Raw output: `eval-runs/mixed-language/hindi.txt` in the project files.

## Earlier run with `gpt-4o-transcribe` and a language setting

Commit 482ceab, 31 synthetic samples, `gpt-4o-transcribe` and `gpt-4.1`, each sample sent with its own language option. That report is in the repository history at commit 482ceab (`backend/eval/results/synthetic.md`).

All samples are OpenAI text-to-speech, not human recordings. Clean synthetic speech is easier than real speech, so treat these numbers as a best case. Real-voice samples can be added later (see "How the evaluation works").

## Results

### Transcription

| Group | Metric | Samples | Rate | S / D / I / N |
| --- | --- | --- | --- | --- |
| English | WER | 13 | 0.6% | 0 / 1 / 0 / 169 |
| Chinese | CER | 12 | 2.0% | 3 / 2 / 0 / 248 |
| Mixed Chinese-English | CER | 6 | 5.6% | 3 / 10 / 0 / 233 |
| Mixed Chinese-English | Mixed-token error rate | 6 | 2.8% | 3 / 0 / 0 / 107 |

The same audio was transcribed five times while the prompts were being fixed. Transcription itself never changed between those runs, so the spread is the model's run-to-run variation:

| Run | English WER | Chinese CER | Mixed CER |
| --- | --- | --- | --- |
| 1 (first run, before two scoring fixes) | 1.2% | 2.0%* | 5.6% |
| 2 | 0.6% | 0.8% | 5.6% |
| 3 | 0.6% | 1.6% | 6.0% |
| 4 | 0.6% | 0.0% | 5.6% |
| 5 (final) | 0.6% | 2.0% | 5.6% |

\* Before 10:30 and 25000 were accepted together for `special-3`; scored with the final rules it is about 0.8%.

### Every transcription error in the final run

| Sample | Error | Kind |
| --- | --- | --- |
| `en-corrections-4` | "the, um, the slides" → "the slides" | The model dropped a stuttered repeat. Counted as an error by the verbatim policy; harmless for dictation. |
| `zh-normal-5` | 你能 → 米娜 | Misheard as a name. Refinement kept it (米娜，帮我看一下…) and did not hide it. |
| `zh-corrections-3` | 截止 → 截至 | Homophone substitution. |
| `zh-corrections-4` | 那个，嗯，那个 → 那个 | Stuttered repeat dropped, as above. |
| `mixed-4` | "We should use MySQL, 不对, PostgreSQL would be better" → "…PostgreSQL会更好" | The English ending was written in Chinese. |

Earlier runs also produced 1.31 → 1.3.1 (`special-2`), "would be better" → 会比较好 (`mixed-4`), and Chinese numbers written as digits (10点半 → 10:30, 两万五千元 → 25000元), which are accepted forms.

### Mixed-language findings

- **`mixed-4` is the hard case.** "We should use MySQL, 不对, PostgreSQL would be better" starts in English and switches to Chinese for the correction. Across 13 runs of the same audio it was transcribed correctly 3 times (once each with Auto-detect, 中文 and English). Usually the English ending came back in Chinese (会更好). Once with 中文 the English opening was dropped, and once with English the whole sentence came back in Chinese. Every mixed-speech error in every run is in this one sample: the other five mixed samples were transcribed with no errors in all 13 runs.
- **English terms inside Chinese sentences are reliable.** backend, frontend, Python, React, meeting, laptop, bug, API, JSON, MongoDB, PostgreSQL, relational data, GitHub, pull request, TypeScript and module were all transcribed correctly in every run.
- **Proper nouns and numbers:** all 15 listed names and terms in the final run (Sarah Chen, Stripe, Kubernetes, OAuth, Daniel, AWS, 王伟, 李娜, dates and amounts).

### Language option comparison (step 2 of the roadmap's model comparison)

One run each, same audio. Reports are in `backend/eval/results/`. The comparison runs are from commit 29a57c7, which had one extra refinement prompt line (since removed); it does not affect transcription.

| Language option | English WER | Chinese CER | Mixed CER | Mixed-token error rate |
| --- | --- | --- | --- | --- |
| Each sample's own (final) | 0.6% | 2.0% | 5.6% | 2.8% |
| Auto-detect for all | 0.6% | 1.6% | 5.6% | 2.8% |
| 中文 for the mixed samples | | | 0.0% (12.4% in an earlier run) | 0.0% |
| English for the mixed samples | | | 10.3% (0.0% in an earlier run) | 7.5% |
| Auto-detect plus a short mixed-language hint | 7.1% | 3.2% | 5.6% | 3.7% |

- Auto-detect is as accurate as choosing the language for English-only and Chinese-only speech.
- For mixed speech, results swing between runs on `mixed-4` alone, so six samples cannot rank the three options. No option was consistently better.
- **A transcription hint in Auto-detect mode made things worse.** With the hint 中英混合 / Mixed Chinese and English speech, an English sample came back entirely in Chinese (`en-corrections-4`, 100% WER), and mixed speech did not improve. Following the roadmap ("only if testing shows it improves accuracy"), Auto-detect keeps sending no hint.
- **The English and Chinese hints come from the roadmap** and include PostgreSQL, MongoDB, React and Python, which also appear in the samples. Scores on those words may be slightly optimistic.
- Another transcription model was not compared. The targets below are met and the roadmap asks for a comparison only if accuracy is insufficient. `TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe npm run eval` runs one.

### Refinement

Automatic checks in the final run:

| Check | Passed |
| --- | --- |
| Self-corrections handled | 8 / 8 |
| Fillers removed | 31 / 31 |
| Languages preserved | 30 / 31 |
| Names and terms kept | 15 / 15 |
| Numbers kept (samples without a correction) | 23 / 23 |
| Negations kept | 23 / 23 |

Each of the 31 refined outputs was also read against its raw transcript for meaning and invented content. That review was done by Claude, not by a person, so it is worth a spot check. 30 of 31 are acceptable. The exception is `mixed-4`: "We should use PostgreSQL 会更好。" keeps the right meaning and the corrected choice, but it joins an English and a Chinese clause into one sentence. It follows from the transcription error above, and the refinement prompt does not add anything to cover it.

The 21 hand-written refinement cases (`npm run test:live:refine -- --repeat=3`) at the final commit: 15 gave the expected text in all 3 runs. The other 6 kept the meaning, with these differences:

- Test C: 我觉得这个项目我们应该用 PostgreSQL 会更合适。 The correct database, but it keeps 我们应该用 from the retracted half, so it reads slightly awkwardly. A prompt line asking for one grammatical sentence did not change this, and it made the model drop MongoDB from an unrelated sentence, so it was removed.
- "We should use MySQL, 不对, PostgreSQL would be better" gave "We should use PostgreSQL." or "We should use PostgreSQL; it would be better."
- 我觉得这个 backend… keeps 这个, which the expected text drops.
- In English mode, a Chinese-led sentence stays Chinese but without spaces around the English words.

### Problems the evaluation found and fixed

- **English mode translated Chinese.** With English selected, refinement turned Chinese-led mixed speech into English in 5 of 6 samples. The English guidance now says to keep Chinese as Chinese; after the fix, 6 of 6 kept their languages.
- **Two scoring false alarms.** The terms check counted the term a correction replaced as lost, and `special-3` did not accept 10:30 and 25000 together. Both were fixed in the scoring, and each fix is in the commit history.

## Quality targets

| Target | Result |
| --- | --- |
| Zero invented facts | Met: none in 31 samples or the 21 refinement cases |
| Zero unjustified changes to numbers or negations | Met: 23 / 23 and 23 / 23 |
| At least 90% of explicit corrections handled | Met: 8 / 8 |
| At least 90% of refinement outputs acceptable | Met: 30 / 31 (97%), reviewed by Claude |
| WER and CER reported, not estimated | Met: above |
| Mixed-language errors documented | Met: above |


## How the evaluation works

`npm run eval --prefix backend` sends every sample in `backend/eval/dataset.js` through `POST /api/process`, exactly as the app does, and writes a report to `backend/eval/results/`. It needs `OPENAI_API_KEY` and network access.

- **Samples.** 31 scripts in the roadmap's six categories (at least 5 each). Each script is also the expected raw transcript, written by hand, with fillers and self-corrections as spoken.
- **Synthetic audio.** On the first run each script is spoken by OpenAI text-to-speech (`gpt-4o-mini-tts`, six voices in turn) and cached in `backend/.eval-samples/synthetic/`. The two noisy samples (`special-5`, `special-6`) get pink noise mixed in at 10 dB signal-to-noise ratio. Synthetic speech is clean and evenly paced, so these numbers are a best case. Your own recordings go in `backend/.eval-samples/voice/<id>.<ext>` and run with `--source=voice`.
- **Comparisons.** `TRANSCRIPTION_MODEL=<model>` swaps the transcription model. `--prompt="..."` replaces the transcription prompt, for testing whether a different one helps.

## Metrics

- **English: word error rate (WER)** = (S + D + I) / N over words.
- **Chinese: character error rate (CER)** = (S + D + I) / N over characters.
- **Mixed Chinese-English: CER**, plus a **mixed-token error rate (MER)** in which each Chinese character is one token and each run of Latin letters or digits is one token. MER keeps one misspelled English word from counting as many character errors. Mixed speech is never scored with English WER alone.
- S, D, I and N come from a Levenshtein alignment with equal costs. Rates are corpus-level: total errors over total reference tokens for the group.
- When a sample lists accepted written forms (for example "3 PM" and "three PM", or 十月三号 and 10月3号), it is scored against the closest one.
- **Terms.** Each sample lists its proper nouns, numbers and technical terms. The report lists any the raw transcript is missing, so errors on the words that matter most are visible even when the overall rate is low.

## Normalization policy

Applied to both the reference and the transcript before scoring:

1. Unicode NFKC, so full-width letters, digits and punctuation match their usual forms.
2. Latin letters are lowercased.
3. Curly apostrophes become straight ones.
4. Commas inside numbers are removed (1,250 → 1250). Dotted abbreviations are joined (p.m. → pm).
5. Punctuation and symbols are removed, Chinese and English alike. Exceptions: a decimal point or colon between digits (1.31, 10:30), and an apostrophe inside a word (don't).
6. Spaces are collapsed. For CER, all spaces are removed, so 这个 backend and 这个backend score the same. Characters are Unicode grapheme clusters.
7. Hesitation sounds are ignored on both sides in the main score: um, umm, uh, uhm, er, erm, ah, hmm, mm, 嗯, 呃. Transcription models usually leave them out, and dictation output should not contain them. Every table also shows the rate with them counted.

Not normalized, so these count as errors: other spelling variants (back-end vs backend), Chinese numerals vs digits unless the sample lists both forms, traditional vs simplified characters, and repeated words the speaker said twice (the, um, the).

## Refinement checks

For each sample with refined text, the report runs these automatic checks, mapped to the roadmap's checklist:

| Roadmap item | Automatic check |
| --- | --- |
| Self-corrections handled | The corrected value is present and the retracted one is gone (samples with an explicit correction) |
| Filler words removed | No hesitation sounds remain |
| Original languages preserved | The dominant language is unchanged, and Chinese text is not turned into English |
| Proper nouns and technical terms preserved | Every listed term that is in the raw transcript is still there, except a term the correction replaced |
| Numbers and dates preserved | The same numbers appear (samples without a correction), and no new numbers appear |
| Negations preserved | The same count of negation words (not, n't, no, never, 不, 没, 别, 未, 无) |
| Meaning preserved, no hallucinated facts | Reviewed by reading each output; the report flags new words and numbers not in the raw transcript |

The checks compare the refined text with the raw transcript, not with the script, so refinement is neither blamed for transcription errors nor expected to hide them.
