# Transcription fidelity, language preservation and refinement levels

What happens to the speaker's words between the microphone and the screen, what changed them, and what was fixed. All audio here is synthetic (OpenAI text-to-speech, `gpt-4o-mini-tts`), not a human voice; see [Limitations](#limitations).

## The pipeline, stage by stage

| Stage | Code | What it does to the text |
| --- | --- | --- |
| Recording | `frontend/src/hooks/useAudioRecorder.js` | Nothing (audio only). |
| Upload | `frontend/src/services/api.js` → `POST /api/process` | Sends the audio and the selected level. |
| Transcription | `backend/src/services/transcription.js` | `gpt-transcribe` with `languages: ["zh", "en", "hi"]` and a prompt. The text is returned **as the API sent it**: no trimming, no filler removal, no normalization. The one exception is the name check below: a short name that `gpt-4o-transcribe` heard in the other language replaces gpt-transcribe's version of it. |
| Refinement | `backend/src/services/refinement.js`, `backend/src/prompts/refinement.js` | None: skipped, `polishedTranscript === rawTranscript`, 0 ms. Light / Medium: `gpt-4.1` edits the text. |
| Display | `frontend/src/App.jsx` | Raw transcript shown read-only as received; polished text editable. |

There is no other string processing anywhere. Every change to the words comes from one of the two models, or (before this change) from the page showing a result made at a different level.

## Root causes

**A. Mixed speech translated into one language.** Two causes:

1. **Refinement (our prompt), the main one.** The roadmap's system prompt said "For English speech, produce natural English. For Mandarin speech, use Simplified Chinese", and Medium is told to rephrase awkward sentences. GPT-4.1 read a mixed sentence as something to fix and translated one part. On 11 mixed transcripts × Light and Medium × 3 runs, **19 of 66 results lost a language** (Light 3 of 33, Medium 16 of 33). Example, Light, 3 of 3 runs: `我觉得我们应该用 PostgreSQL，because it handles relational data better.` → `我觉得我们应该用 PostgreSQL，因为它处理关系型数据更好。`
2. **The speech model, less often.** `gpt-transcribe` itself sometimes writes a spoken English phrase in Chinese (`Um, 我觉得 we should 先 deploy` → `嗯，我觉得我们应该先 deploy`) and once in Hindi (`because it is more reliable` → `क्योंकि ये ज़्यादा…`). The prompt matters: **with no prompt, or with Mandarin as the only language, it translated the spec's PostgreSQL sentence into Chinese every time.** A prompt written half in Chinese made English loss more likely (it rewrote the spec's React/Python sentence in Chinese), so the app's English prompt stays.

**B. Fillers missing from the raw transcript.** The speech model, not our code. Nothing in the backend or frontend removes words (checked above and pinned by `returns the transcript exactly as the API produced it` in `backend/tests/process.test.js`). `gpt-transcribe` drops many fillers on its own: the spec's own sentence `Um, I think we should, uh, use PostgreSQL.` came back as `I think we should use PostgreSQL.` in every setting tried, clean or noisy, in the API benchmark and in the browser. The prompt asking for fillers helps a little; no documented parameter asks for verbatim output.

**C. None looking like Light.** The backend was already right: None never calls the refinement API, returns the raw text unchanged and reports 0 ms, skipped. Two things made None look cleaned:

1. **The page showed stale results (our code).** The level was read when processing started. Switching to None after a recording, or while it was processing, left the Light text on screen under a None selection; only a small badge said "Light refinement". Since the Regenerate button was removed, nothing ever updated it.
2. **The raw transcript itself has fewer fillers** (cause B), so even a correct None result is not verbatim.

Also checked: production on Render runs the latest `main`, with no way here to read its environment variables. `backend/.env.example` set `TRANSCRIPTION_MODEL=gpt-4o-transcribe`, the older model that drops fillers and translates more; if that line was copied into Render, the app ignores the `gpt-transcribe` default. `/api/health` now reports the models in use so this can be checked.

## What changed

1. **Refinement prompt** (`backend/src/prompts/refinement.js`): rules 11 to 14 now say code-switching is intentional and every word, phrase and clause stays in the language it was spoken in. The language guidance adds that edits happen inside each language, single English words (connectives included) stay English, and how a cross-language correction resolves (`我们应该用 MongoDB，actually no, PostgreSQL is better.` → `我们应该用 PostgreSQL，it is better.`). Medium is told a language switch is never a reason to rephrase.
2. **Translation check after refinement** (`backend/src/lib/languages.js`, `refinement.js`): if the result lost most of a language while another grew, or swapped a short English word (because, so, but, actually…) for its Chinese or Hindi equivalent, the model is asked once more, naming what it translated. If the second answer still lost a language, refinement fails with `refinement_changed_language` and the raw transcript is kept, rather than showing a translation. Counts only; no text is logged.
3. **Polished text follows the selected level** (`frontend/src/App.jsx`): switching levels after a recording redoes the same raw transcript at the new level. None shows the raw transcript exactly, with no request; Light and Medium call `POST /api/refine`; results are kept per level, so switching back is instant. The raw transcript never changes.
4. **Transcription prompt unchanged**, with its comment corrected: the prompt is context that makes the wanted output more likely, not a guarantee.
5. **`/api/health`** reports `transcriptionModel` and `refinementModel`; `.env.example` no longer sets `gpt-4o-transcribe`.
6. **`npm run eval:fidelity`** (`backend/scripts/eval-fidelity.js`): raw-transcript benchmark of language settings, prompts and models.

## Results

### Refinement keeps both languages

Mixed and Hindi-English transcripts (the spec's examples plus harder ones), Light and Medium, 3 runs each, `gpt-4.1`:

| | Results that lost a language or swapped a word |
| --- | --- |
| Before | 19 of 66 lost a language (Light 3, Medium 16) |
| New prompt only | 3 of 66 (Medium, spec PostgreSQL sentence); single words such as because → 因为 still swapped |
| New prompt and check (shipped) | **0 of 90**; 15 of 90 needed the one extra request |

Spec tests 2 and 3, Light and Medium, in the browser with the real app:

| Said (synthetic) | None | Light | Medium |
| --- | --- | --- | --- |
| 我觉得我们应该用 PostgreSQL，because it handles relational data better. | unchanged raw | 我觉得我们应该用 PostgreSQL because it handles relational data better. | same |
| 我们应该用 React for the frontend，然后用 Python for the backend. | unchanged raw | 我们应该用 React for the front end，然后用 Python for the back end。 | same |
| 我们应该用 MongoDB，actually no, PostgreSQL is better. | unchanged raw | 我们应该用PostgreSQL，it is better. | 我们应该用 PostgreSQL，it is better. |

The live refinement suite (`npm run test:live:levels -- --repeat=2`, now with these cases) passed 56 of 56; the 31-sample accuracy evaluation still passes every refinement check (31 / 31 languages preserved, 8 / 8 corrections).

### Raw transcription: language modes and fillers

`npm run eval:fidelity`: 24 synthetic clips (before the name samples were added: 15 mixed Chinese-English, 3 English and 2 Mandarin with fillers, 2 without fillers, 2 Hindi), one run each (outputs barely vary between runs of the same audio). Clean audio, then another voice with pink noise at 15 dB SNR:

| Setting | Languages kept, clean | noisy | Fillers kept, clean | noisy |
| --- | --- | --- | --- | --- |
| **App: `gpt-transcribe`, zh+en+hi, app prompt** | **24/24** | **24/24** | 7/15 | 7/15 |
| zh+en+hi, no prompt | 23/24 | 24/24 | 7/15 | 7/15 |
| Auto (no languages, no prompt) | 23/24 | 24/24 | 7/15 | 4/15 |
| Auto, app prompt | 23/24 | 24/24 | 8/15 | 7/15 |
| English only, app prompt | 24/24 | 24/24 | 8/15 | 6/15 |
| Mandarin only, app prompt | 23/24 | 23/24 | 9/15 | 7/15 |
| Hindi only, app prompt | 24/24 | 24/24 | 8/15 | 6/15 |
| Half-Chinese prompt (candidate) | 23/24 | 24/24 | 9/15 | 7/15 |
| Filler `keywords` (candidate) | 24/24 | 24/24 | 10/15 | 7/15 |
| `gpt-4o-transcribe`, app prompt | 24/24 | 24/24 | 9/15 | 4/15 |
| `whisper-1`, no prompt | 22/24 | 20/24 | 9/15 | 6/15 |

- **Auto-detect is not better.** With no language list it translated the spec's PostgreSQL sentence into Chinese. Mandarin-only did the same; English-only and Hindi-only were no better than the three-language list. The app's setting is the only one that kept every language in both conditions.
- **No setting keeps fillers reliably**: about half in every one, and the best clean result (filler `keywords`, 10/15) fell back to 7/15 with noise. OpenAI documents that `keywords` can put words in the transcript that nobody said, so it was not adopted. Invented fillers were rare (1 or 2 per run); the one in the app's row is a spoken "Um" written as "嗯".
- Earlier prompt experiments (instruction prompt vs. a half-Chinese prompt vs. a code-switched prompt, three voices, with and without noise) moved filler counts by one or two either way, within run-to-run variation, and the Chinese-heavy prompts lost English more often. The report files `backend/eval/results/fidelity.md` and `fidelity-noisy.md` now hold the latest run (with and without the name check, below).

## Chinese names inside English sentences

Reported with a real voice: in `嗯，你好，我的名字叫王宇辰, and I just graduated from 纽约大学 with a bachelor degree in 计算机科学…`, said with 纽约大学 in Mandarin, both the raw and the refined text read "New York University".

**Cause: the speech model.** `gpt-transcribe` writes a name in the language of the sentence around it. Reproduced with synthetic speech in three voices: 纽约大学 came back as "New York University" in every run, as did 上海 → Shanghai, 腾讯 → Tongxin, 张老师 → Zhang老师, and the reverse, Seattle in a Chinese sentence → 西雅图. Refinement was not the cause: given the raw text with 纽约大学, Light and Medium kept it every time (`npm run test:live:levels`, 2 new cases).

**Prompts and language settings do not fix it.** Six prompt variants (a sentence about names, an explicit rule with examples, code-switched example transcripts, with zh+en+hi, zh+en or no language list), English-only and Mandarin-only: none kept 纽约大学, and the best moved names kept from 21 to 27 of 45 on one voice and not on others. Tables: `backend/eval/results/names-candidates.md`.

**`gpt-4o-transcribe` keeps names much better** (36 of 45, 纽约大学 in 14 of 14 runs) but cannot replace gpt-transcribe: it sometimes drops or translates a whole clause (`So it's really nice for me to meet you today.` → `所以很高兴今天见到你。`, or gone; `it only happens when two users log in at the same time.` gone), takes no language list, and keeps fewer fillers in noise (15 vs 21 of 48).

**Fix: the name check** (`backend/src/lib/names.js`). Both models transcribe the same audio at the same time. The gpt-transcribe text is kept, and only where the two agree on the words around a short span (up to 4 English words or 8 Chinese characters) and that span is English in one and Chinese in the other, gpt-4o-transcribe's span is taken. It is skipped when it is a common word or filler (because ↔ 因为, um ↔ 嗯), when either side is a number (百分之十五 ↔ 15%: the unit is not part of the span, so taking it dropped the percent), and when gpt-4o-transcribe's version is the one matching the language on both sides (its own version of the same mistake). Sentences, homophones (王宇辰 vs 王雨晨) and anything else stay exactly as gpt-transcribe wrote them. If the check fails, or is not back 1.5 s after the main transcript, the main transcript is returned alone. `NAME_CHECK_MODEL=` (empty) turns it off; `/api/health` reports it.

All 31 synthetic samples, 3 runs (`npm run eval:fidelity -- --settings=app,no-name-check --runs=3`):

| | Languages kept, clean | noisy | Names kept as spoken, clean | noisy | Fillers kept, clean | noisy |
| --- | --- | --- | --- | --- | --- | --- |
| Without the name check | 87/93 | 87/93 | 21/45 | 24/45 | 26/48 | 22/48 |
| **With the name check (shipped)** | **89/93** | **90/93** | **33/45** | **32/45** | 28/48 | 21/48 |

The reported sentence now comes back with 纽约大学 in every run, clean and noisy, and through the real `/api/process` endpoint at None and Light. None of the 24 earlier samples got worse. What still fails: names gpt-4o-transcribe also hears in English (上海, 北京 in an English sentence) or mishears (腾讯 as 腾迅). The extra request costs a second transcription per recording; it runs in parallel, so the wait is the slower of the two, about 0.1 s more at the median on these clips.

## Limitations

- **Fillers.** Raw transcripts keep roughly half of spoken fillers, so None is close to verbatim but not verbatim. This is the speech model; prompts move it only slightly and no supported parameter guarantees verbatim output. A filler can also be misheard (呃 once came back as 二, "two").
- **Names.** The name check restores a name only when gpt-4o-transcribe heard it as spoken; about a quarter of the names in the set are still written in the other language.
- **Synthetic audio only.** Text-to-speech says fillers clearly and switches languages cleanly. A real speaker's quick "uh" and accent are harder, and the reported Chinese-to-English translation in the raw transcript was not reproduced with synthetic speech. Recordings in `.eval-samples/fidelity-voice/<id>.<ext>` (ids in `backend/eval/fidelity-dataset.js`) run with `npm run eval:fidelity -- --source=voice`.
- **Refinement.** The check catches a translated clause and the common single-word swaps; a rarer one-word translation can still slip through. When it fires, the request takes one extra refinement call (about 0.7 to 1.5 s).
- **Hindi.** English terms inside Hindi are sometimes written in Devanagari, and a term can be misheard (PostgreSQL as पास्ट ग्रीक सीक्वल in one voice).

## Re-running

```
cd backend
npm run eval:fidelity                          # every setting, synthetic audio
npm run eval:fidelity -- --settings=app,no-name-check --runs=3   # with and without the name check
npm run eval:fidelity -- --settings=app,no-name-check --runs=3 --voice=onyx --noise=15 --out=fidelity-noisy
npm run test:live:levels -- --repeat=2         # refinement levels, including the mixed-language cases
```
