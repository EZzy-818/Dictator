# Accuracy evaluation (Milestone 7)

RESULTS_PLACEHOLDER

## How the evaluation works

`npm run eval --prefix backend` sends every sample in `backend/eval/dataset.js` through `POST /api/process`, exactly as the app does, and writes a report to `backend/eval/results/`. It needs `OPENAI_API_KEY` and network access.

- **Samples.** 31 scripts in the roadmap's six categories (at least 5 each). Each script is also the expected raw transcript, written by hand, with fillers and self-corrections as spoken.
- **Synthetic audio.** On the first run each script is spoken by OpenAI text-to-speech (`gpt-4o-mini-tts`, six voices in turn) and cached in `backend/.eval-samples/synthetic/`. The two noisy samples (`special-5`, `special-6`) get pink noise mixed in at 10 dB signal-to-noise ratio. Synthetic speech is clean and evenly paced, so these numbers are a best case. Your own recordings go in `backend/.eval-samples/voice/<id>.<ext>` and run with `--source=voice`.
- **Comparisons.** `--language=auto|en|zh` sends every sample with one language option. `TRANSCRIPTION_MODEL=<model>` swaps the transcription model. `--auto-hint="..."` adds a transcription prompt in Auto-detect mode, for testing whether a hint helps.

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
