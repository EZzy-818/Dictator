# Accuracy evaluation: synthetic recordings

Run 2026-10-17T01:28:13.845Z. Transcription model `gpt-4o-transcribe`, refinement model `gpt-4.1`.
Language option: `en` for every sample.

6 of 6 samples transcribed.

The synthetic samples are OpenAI text-to-speech audio, not human speech. Noisy samples have pink noise mixed in.

Rates are corpus-level: total errors divided by total reference tokens. Hesitation sounds (um, uh, 嗯, 呃) are ignored on both sides; the last column counts them. See docs/evaluation.md for the normalization policy.

## Transcription

| Group | Metric | Samples | Rate | S / D / I / N | With fillers counted |
| --- | --- | --- | --- | --- | --- |
| Mixed | CER | 6 | 10.3% | 8 / 16 / 0 / 233 | 10.3% |
| Mixed | MER | 6 | 7.5% | 6 / 0 / 2 / 107 | 7.5% |

| Category | Metric | Samples | Rate | S / D / I / N | With fillers counted |
| --- | --- | --- | --- | --- | --- |
| Mixed Chinese-English speech | CER | 5 | 13.0% | 8 / 16 / 0 / 185 | 13.0% |
| Numbers, dates, names, technical terms, and noise | CER | 1 | 0.0% | 0 / 0 / 0 / 48 | 0.0% |

## Refinement (automatic checks)

| Check | Passed |
| --- | --- |
| Self-correction handled | 2 / 2 |
| Fillers removed | 6 / 6 |
| Languages preserved | 6 / 6 |
| Names and terms kept | 6 / 6 |
| Numbers kept | 4 / 4 |
| Negations kept | 4 / 4 |

Explicit corrections handled: 2 / 2. Samples with a changed number or negation: 0.

Meaning, invented facts and overall acceptability are reviewed by a person; see docs/evaluation.md.

## Samples

### mixed-1

Mixed Chinese-English speech. Language option: `en`.

- Script: 我觉得这个 backend 应该用 Python，但是 frontend 还是用 React 比较好。
- Raw transcript: 我觉得这个backend应该用Python，但是frontend还是用React比较好。
- CER: 0.0% (0 / 42; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 20; with fillers counted 0.0%). Errors: none
- Refined: 我觉得这个backend应该用Python，但是frontend还是用React比较好。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### mixed-2

Mixed Chinese-English speech. Language option: `en`.

- Script: 明天的 meeting 改到下午两点，记得带上你的 laptop。
- Raw transcript: 明天的meeting改到下午两点，记得带上你的laptop。
- CER: 0.0% (0 / 28; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 17; with fillers counted 0.0%). Errors: none
- Refined: 明天的meeting改到下午两点，记得带上你的laptop。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### mixed-3

Mixed Chinese-English speech. Language option: `en`.

- Script: 这个 bug 是因为 API 返回的 JSON 格式不对。
- Raw transcript: 这个bug是因为API返回的JSON格式不对。
- CER: 0.0% (0 / 22; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 15; with fillers counted 0.0%). Errors: none
- Refined: 这个bug是因为API返回的JSON格式不对。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### mixed-4

Mixed Chinese-English speech. Language option: `en`.

- Script: We should use MySQL, 不对，PostgreSQL would be better.
- Raw transcript: 我们应该用MySQL。不对，PostgreSQL会更好。
- CER: 58.5% (24 / 41; with fillers counted 58.5%). Errors: D `w`, D `e`, D `s`, D `h`, D `o`, D `u`, S `l`→`我`, S `d`→`们`, S `u`→`应`, S `s`→`该`, S `e`→`用`, D `l`, D `w`, D `o`, D `u`, D `d`, D `b`, D `e`, D `b`, D `e`, D `t`, S `t`→`会`, S `e`→`更`, S `r`→`好`
- Mixed-token error rate: 80.0% (8 / 10; with fillers counted 80.0%). Errors: I `我`, I `们`, S `we`→`应`, S `should`→`该`, S `use`→`用`, S `would`→`会`, S `be`→`更`, S `better`→`好`
- Refined: 我们应该用PostgreSQL。
- Intended refinement: We should use PostgreSQL instead of MySQL.
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes, Names and terms kept yes

### mixed-5

Mixed Chinese-English speech. Language option: `en`.

- Script: 我觉得我们应该用 MongoDB，不对，还是 PostgreSQL 比较好，因为我们需要 relational data。
- Raw transcript: 我觉得我们应该用MongoDB，不对，还是PostgreSQL比较好，因为我们需要relational data。
- CER: 0.0% (0 / 52; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 25; with fillers counted 0.0%). Errors: none
- Refined: 我觉得我们应该用PostgreSQL比较好，因为我们需要relational data。
- Intended refinement: 我觉得我们还是应该用 PostgreSQL，因为我们需要 relational data。
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes, Names and terms kept yes

### special-4

Numbers, dates, names, technical terms, and noise. Language option: `en`.

- Script: 请把 GitHub 上的 pull request 发给王伟，他会用 TypeScript 重写这个 module。
- Raw transcript: 请把GitHub上的pull request发给王伟，他会用TypeScript重写这个module.
- CER: 0.0% (0 / 48; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 20; with fillers counted 0.0%). Errors: none
- Refined: 请把GitHub上的pull request发给王伟，他会用TypeScript重写这个module。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes
