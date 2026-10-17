# Chinese names inside English sentences: candidates measured

Synthetic speech (OpenAI text-to-speech). The 7 name samples in eval/fidelity-dataset.js (mix-intro-nyu to mix-zh-en-names). Raw transcripts only. Full transcripts were kept outside the repository.

## Prompts and models, 3 runs, default voices

| Setting | Languages kept | Names kept as spoken | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt) | 15/21 | 21/45 | 3/3 (100%) | 0 | 11% | 0 |
| zh+en+hi, no prompt | 15/21 | 18/45 | 0/3 (0%) | 0 | 14% | 0 |
| Auto (no languages, no prompt) | 12/21 | 15/45 | 0/3 (0%) | 0 | 16% | 0 |
| English only, app prompt | 12/21 | 15/45 | 3/3 (100%) | 0 | 16% | 0 |
| Mandarin only, app prompt | 15/21 | 21/45 | 3/3 (100%) | 0 | 11% | 0 |
| zh+en+hi, app prompt + names sentence (candidate) | 15/21 | 18/45 | 3/3 (100%) | 0 | 14% | 0 |
| zh+en+hi, code-switched example prompt (candidate) | 16/21 | 21/45 | 3/3 (100%) | 0 | 13% | 0 |
| zh+en+hi, names sentence + example (candidate) | 15/21 | 21/45 | 3/3 (100%) | 0 | 11% | 0 |
| gpt-4o-transcribe, app prompt | 18/21 | 33/45 | 2/3 (67%) | 0 | 9% | 0 |

## More prompts and models, 3 runs, default voices

| Setting | Languages kept | Names kept as spoken | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt) | 15/21 | 21/45 | 3/3 (100%) | 0 | 11% | 0 |
| zh+en+hi, app prompt + explicit names rule (candidate) | 15/21 | 20/45 | 3/3 (100%) | 0 | 12% | 0 |
| zh+en+hi, names-in-English example prompt (candidate) | 18/21 | 27/45 | 3/3 (100%) | 0 | 8% | 0 |
| zh+en+hi, explicit names rule + example (candidate) | 15/21 | 21/45 | 3/3 (100%) | 0 | 11% | 0 |
| gpt-4o-mini-transcribe, app prompt | 16/21 | 26/45 | 0/3 (0%) | 0 | 10% | 0 |
| gpt-live-transcribe, zh+en+hi, app prompt | 0/0 | 0/0 | 0/0 (–) | 0 | – | 21 |

## Voice nova, 2 runs

| Setting | Languages kept | Names kept as spoken | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt) | 10/14 | 14/30 | 2/2 (100%) | 0 | 13% | 0 |
| zh+en+hi, names-in-English example prompt (candidate) | 10/14 | 14/30 | 2/2 (100%) | 0 | 13% | 0 |
| zh+en, names-in-English example prompt (candidate) | 12/14 | 18/30 | 2/2 (100%) | 0 | 8% | 0 |
| Auto, names-in-English example prompt (candidate) | 10/14 | 16/30 | 2/2 (100%) | 0 | 9% | 0 |
| gpt-4o-transcribe, app prompt | 14/14 | 24/30 | 2/2 (100%) | 0 | 4% | 0 |

## Voice shimmer, 2 runs

| Setting | Languages kept | Names kept as spoken | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt) | 8/14 | 12/30 | 2/2 (100%) | 0 | 15% | 0 |
| zh+en+hi, names-in-English example prompt (candidate) | 10/14 | 16/30 | 2/2 (100%) | 0 | 12% | 0 |
| zh+en, names-in-English example prompt (candidate) | 8/14 | 14/30 | 2/2 (100%) | 0 | 13% | 0 |
| Auto, names-in-English example prompt (candidate) | 8/14 | 14/30 | 2/2 (100%) | 0 | 13% | 0 |
| gpt-4o-transcribe, app prompt | 14/14 | 28/30 | 2/2 (100%) | 0 | 1% | 0 |

## All 31 samples, gpt-transcribe (app) vs gpt-4o-transcribe, 3 runs

### Clean

| Setting | Languages kept | Names kept as spoken | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt) | 87/93 | 21/45 | 28/48 (58%) | 3 | 5% | 0 |
| gpt-4o-transcribe, app prompt | 91/93 | 36/45 | 28/48 (58%) | 0 | 4% | 0 |

### Voice onyx, pink noise at 15 dB SNR

| Setting | Languages kept | Names kept as spoken | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt) | 87/93 | 24/45 | 21/48 (44%) | 6 | 6% | 0 |
| gpt-4o-transcribe, app prompt | 89/93 | 31/45 | 15/48 (31%) | 1 | 5% | 0 |
