# Local acceptance tests (Milestone 8)

The results below are from before the language setting was removed. The script no longer picks a language; tests A to D now run with the app's single mixed-language mode, and the two D clips check that English-only and Mandarin-only speech stay in their language.

Run at commit 482ceab with `npm run test:acceptance --prefix backend`, against the app started with `npm run dev` and a real OpenAI key.

Since Milestone 10 the backend limits recordings to 5 per minute per visitor. The suite records less often than that, but if a run is refused with "Too many recordings", raise `PROCESS_LIMIT_PER_MINUTE` in `backend/.env` for the run.

The script opens the app in Chromium and drives it like a user: it clicks Start Recording and Stop Recording, waits for the result, and reads the Raw transcript and Polished text boxes. The speech is OpenAI text-to-speech played into Chromium's fake microphone, so the browser records it with `MediaRecorder` and the app uploads it exactly as it would a real voice. A person speaking into a real microphone has not been tested.

| Test | Language option | Result |
| --- | --- | --- |
| A. English | English | Pass |
| B. Mandarin | 中文 | Pass |
| C. Mixed-language | Auto-detect | Pass (wording differs, see below) |
| D. Auto-detect, English clip | Auto-detect | Pass |
| D. Auto-detect, Mandarin clip | Auto-detect | Pass |
| E. Copy edited mixed text | Auto-detect | Pass |

## Outputs

**A. English** ([screenshot](acceptance/test-a.png))

- Spoken: I want to schedule a meeting on Monday, actually Wednesday at 3 PM.
- Raw: I want to schedule a meeting on Monday, actually Wednesday, at 3 PM.
- Polished: I want to schedule a meeting on Wednesday at 3 PM.

**B. Mandarin** ([screenshot](acceptance/test-b.png))

- Spoken: 我想下周二开会，嗯，不对，下周三下午三点。
- Raw: 我想下周二开会，不对，下周三下午三点。
- Polished: 我想下周三下午三点开会。

**C. Mixed-language** ([screenshot](acceptance/test-c.png))

- Spoken: 我觉得这个项目我们应该用 MongoDB，啊不对，用 PostgreSQL 会更合适。
- Raw: 我觉得这个项目我们应该用MongoDB，不对，用PostgreSQL会更合适。
- Polished: 我觉得这个项目我们应该用 PostgreSQL 会更合适。
- Expected: 我觉得这个项目用 PostgreSQL 会更合适。

The correction is resolved, MongoDB is gone, both languages are kept and PostgreSQL is intact. The output keeps 我们应该用 from the retracted half, which reads slightly awkwardly. This was the same in every run, and a prompt change aimed at it caused a regression elsewhere, so it is a known limitation (see [evaluation.md](evaluation.md)).

**D. Auto-detect** ([English](acceptance/test-d-en.png), [Mandarin](acceptance/test-d-zh.png))

- English clip: The quarterly report is ready, so please review it before Friday. Transcribed and kept in English.
- Mandarin clip: 季度报告已经准备好了，请大家在周五之前看一下。 Transcribed and kept in Chinese, not translated.

**E. Copy**

After test C, the polished text was replaced with 我觉得这个项目用 PostgreSQL 会更合适，backend 先用 Node.js（v22）。「已确认」✅ and copied with the Copy button. The clipboard held exactly the same text, including full-width punctuation, corner brackets and the emoji.

## Other runs

Tests A to E were run four times in total, at commits daf7fb2, 05633ec, 29a57c7 and 482ceab. Every check passed each time, and test C's polished text was identical each time.
