# Accuracy evaluation: synthetic recordings

Run 2026-10-17T04:16:12.352Z. Transcription model `gpt-4o-transcribe`, refinement model `gpt-4.1`.

31 of 31 samples transcribed.

The synthetic samples are OpenAI text-to-speech audio, not human speech. Noisy samples have pink noise mixed in.

Rates are corpus-level: total errors divided by total reference tokens. Hesitation sounds (um, uh, 嗯, 呃) are ignored on both sides; the last column counts them. See docs/evaluation.md for the normalization policy.

## Transcription

| Group | Metric | Samples | Rate | S / D / I / N | With fillers counted |
| --- | --- | --- | --- | --- | --- |
| English | WER | 13 | 0.6% | 1 / 0 / 0 / 168 | 1.7% |
| Chinese | CER | 12 | 0.8% | 0 / 2 / 0 / 247 | 2.0% |
| Mixed | CER | 6 | 0.0% | 0 / 0 / 0 / 233 | 0.0% |
| Mixed | MER | 6 | 0.0% | 0 / 0 / 0 / 107 | 0.0% |

| Category | Metric | Samples | Rate | S / D / I / N | With fillers counted |
| --- | --- | --- | --- | --- | --- |
| English normal speech | WER | 5 | 0.0% | 0 / 0 / 0 / 74 | 0.0% |
| English corrections and fillers | WER | 5 | 0.0% | 0 / 0 / 0 / 55 | 3.4% |
| Mandarin normal speech | CER | 5 | 0.0% | 0 / 0 / 0 / 110 | 0.0% |
| Mandarin corrections and fillers | CER | 5 | 2.2% | 0 / 2 / 0 / 90 | 5.3% |
| Mixed Chinese-English speech | CER | 5 | 0.0% | 0 / 0 / 0 / 185 | 0.0% |
| Numbers, dates, names, technical terms, and noise | WER | 3 | 2.6% | 1 / 0 / 0 / 39 | 2.6% |
| Numbers, dates, names, technical terms, and noise | CER | 3 | 0.0% | 0 / 0 / 0 / 95 | 0.0% |

## Refinement (automatic checks)

| Check | Passed |
| --- | --- |
| Self-correction handled | 8 / 8 |
| Fillers removed | 31 / 31 |
| Languages preserved | 31 / 31 |
| Names and terms kept | 15 / 15 |
| Numbers kept | 23 / 23 |
| Negations kept | 23 / 23 |

Explicit corrections handled: 8 / 8. Samples with a changed number or negation: 0.

Meaning, invented facts and overall acceptability are reviewed by a person; see docs/evaluation.md.

## Samples

### en-normal-1

English normal speech.

- Script: Please send the quarterly report to the finance team before Friday afternoon.
- Raw transcript: Please send the quarterly report to the finance team before Friday afternoon.
- WER: 0.0% (0 / 12; with fillers counted 0.0%). Errors: none
- Refined: Please send the quarterly report to the finance team before Friday afternoon.
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### en-normal-2

English normal speech.

- Script: The new onboarding flow made it much easier for customers to find the settings page.
- Raw transcript: The new onboarding flow made it much easier for customers to find the settings page.
- WER: 0.0% (0 / 15; with fillers counted 0.0%). Errors: none
- Refined: The new onboarding flow made it much easier for customers to find the settings page.
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### en-normal-3

English normal speech.

- Script: I'd like to schedule a short call with the design team to go over the mobile layout.
- Raw transcript: I'd like to schedule a short call with the design team to go over the mobile layout.
- WER: 0.0% (0 / 17; with fillers counted 0.0%). Errors: none
- Refined: I'd like to schedule a short call with the design team to go over the mobile layout.
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### en-normal-4

English normal speech.

- Script: Our main goal for this sprint is to improve the search results and fix the login bugs.
- Raw transcript: Our main goal for this sprint is to improve the search results and fix the login bugs.
- WER: 0.0% (0 / 17; with fillers counted 0.0%). Errors: none
- Refined: Our main goal for this sprint is to improve the search results and fix the login bugs.
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### en-normal-5

English normal speech.

- Script: Can you check whether the latest build passed all of the integration tests?
- Raw transcript: Can you check whether the latest build passed all of the integration tests?
- WER: 0.0% (0 / 13; with fillers counted 0.0%). Errors: none
- Refined: Can you check whether the latest build passed all of the integration tests?
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### en-corrections-1

English corrections and fillers.

- Script: Um, I think we should, uh, start the migration tomorrow morning.
- Raw transcript: Um, I think we should start the migration tomorrow morning.
- WER: 0.0% (0 / 9; with fillers counted 9.1%). Errors: none
- Refined: I think we should start the migration tomorrow morning.
- Intended refinement: I think we should start the migration tomorrow morning.
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### en-corrections-2

English corrections and fillers.

- Script: Let's meet on Tuesday, actually no, Wednesday at three PM.
- Raw transcript: Let's meet on Tuesday, actually no, Wednesday at 3pm.
- WER: 0.0% (0 / 9; with fillers counted 0.0%). Errors: none
- Refined: Let's meet on Wednesday at 3pm.
- Intended refinement: Let's meet on Wednesday at 3 PM.
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes, Names and terms kept yes

### en-corrections-3

English corrections and fillers.

- Script: The deadline is the end of May, sorry, I mean the end of June.
- Raw transcript: The deadline is the end of May, sorry I mean the end of June.
- WER: 0.0% (0 / 14; with fillers counted 0.0%). Errors: none
- Refined: The deadline is the end of June.
- Intended refinement: The deadline is the end of June.
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes

### en-corrections-4

English corrections and fillers.

- Script: Uh, can you send me the, um, the slides from yesterday's meeting?
- Raw transcript: 呃 can you send me the um the slides from yesterday's meeting?
- WER: 0.0% (0 / 10; with fillers counted 8.3%). Errors: none
- Refined: Can you send me the slides from yesterday's meeting?
- Intended refinement: Can you send me the slides from yesterday's meeting?
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### en-corrections-5

English corrections and fillers.

- Script: We need three new servers, no wait, four new servers for the launch.
- Raw transcript: We need three new servers, no wait, four new servers for the launch.
- WER: 0.0% (0 / 13; with fillers counted 0.0%). Errors: none
- Refined: We need four new servers for the launch.
- Intended refinement: We need four new servers for the launch.
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes

### zh-normal-1

Mandarin normal speech.

- Script: 请把这份季度报告发给财务部门，周五之前要完成。
- Raw transcript: 请把这份季度报告发给财务部门，周五之前要完成。
- CER: 0.0% (0 / 21; with fillers counted 0.0%). Errors: none
- Refined: 请把这份季度报告发给财务部门，周五之前要完成。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### zh-normal-2

Mandarin normal speech.

- Script: 新的注册流程让用户更容易找到设置页面。
- Raw transcript: 新的注册流程让用户更容易找到设置页面。
- CER: 0.0% (0 / 18; with fillers counted 0.0%). Errors: none
- Refined: 新的注册流程让用户更容易找到设置页面。
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### zh-normal-3

Mandarin normal speech.

- Script: 我想和设计团队约一个简短的会议，讨论一下手机端的布局。
- Raw transcript: 我想和设计团队约一个简短的会议，讨论一下手机端的布局。
- CER: 0.0% (0 / 25; with fillers counted 0.0%). Errors: none
- Refined: 我想和设计团队约一个简短的会议，讨论一下手机端的布局。
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### zh-normal-4

Mandarin normal speech.

- Script: 这个迭代的主要目标是改进搜索结果和修复登录问题。
- Raw transcript: 这个迭代的主要目标是改进搜索结果和修复登录问题。
- CER: 0.0% (0 / 23; with fillers counted 0.0%). Errors: none
- Refined: 这个迭代的主要目标是改进搜索结果和修复登录问题。
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### zh-normal-5

Mandarin normal speech.

- Script: 你能帮我看一下最新的版本有没有通过所有的测试吗？
- Raw transcript: 你能帮我看一下最新的版本有没有通过所有的测试吗?
- CER: 0.0% (0 / 23; with fillers counted 0.0%). Errors: none
- Refined: 你能帮我看一下最新的版本有没有通过所有的测试吗？
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### zh-corrections-1

Mandarin corrections and fillers.

- Script: 嗯，我觉得我们，呃，明天上午可以开始迁移。
- Raw transcript: 嗯，我觉得我们明天上午可以开始迁移。
- CER: 0.0% (0 / 15; with fillers counted 5.9%). Errors: none
- Refined: 我觉得我们明天上午可以开始迁移。
- Intended refinement: 我觉得我们明天上午可以开始迁移。
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### zh-corrections-2

Mandarin corrections and fillers.

- Script: 我们下周二开会，不对，应该是下周三下午三点。
- Raw transcript: 我们下周二开会，不对，应该是下周三下午三点
- CER: 0.0% (0 / 19; with fillers counted 0.0%). Errors: none
- Refined: 我们下周三下午三点开会。
- Intended refinement: 我们下周三下午三点开会。
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes, Names and terms kept yes

### zh-corrections-3

Mandarin corrections and fillers.

- Script: 截止日期是五月底，不好意思，我是说六月底。
- Raw transcript: 截止日期是五月底，不好意思，我是说六月底。
- CER: 0.0% (0 / 18; with fillers counted 0.0%). Errors: none
- Refined: 截止日期是六月底。
- Intended refinement: 截止日期是六月底。
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes

### zh-corrections-4

Mandarin corrections and fillers.

- Script: 呃，你能把昨天会议的那个，嗯，那个幻灯片发给我吗？
- Raw transcript: 你能把昨天会议的那个幻灯片发给我吗?
- CER: 10.5% (2 / 19; with fillers counted 19.0%). Errors: D `那`, D `个`
- Refined: 你能把昨天会议的那个幻灯片发给我吗？
- Intended refinement: 你能把昨天会议的幻灯片发给我吗？
- Automatic checks: Fillers removed yes, Languages preserved yes, Numbers kept yes, Negations kept yes

### zh-corrections-5

Mandarin corrections and fillers.

- Script: 我们需要三台新服务器，哦不，是四台新服务器。
- Raw transcript: 我们需要三台新服务器，哦不，是四台新服务器。
- CER: 0.0% (0 / 19; with fillers counted 0.0%). Errors: none
- Refined: 我们需要四台新服务器。
- Intended refinement: 我们需要四台新服务器。
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes

### mixed-1

Mixed Chinese-English speech.

- Script: 我觉得这个 backend 应该用 Python，但是 frontend 还是用 React 比较好。
- Raw transcript: 我觉得这个backend应该用Python，但是frontend还是用React比较好。
- CER: 0.0% (0 / 42; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 20; with fillers counted 0.0%). Errors: none
- Refined: 我觉得这个 backend 应该用 Python，但是 frontend 还是用 React 比较好。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### mixed-2

Mixed Chinese-English speech.

- Script: 明天的 meeting 改到下午两点，记得带上你的 laptop。
- Raw transcript: 明天的meeting改到下午两点，记得带上你的laptop。
- CER: 0.0% (0 / 28; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 17; with fillers counted 0.0%). Errors: none
- Refined: 明天的 meeting 改到下午两点，记得带上你的 laptop。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### mixed-3

Mixed Chinese-English speech.

- Script: 这个 bug 是因为 API 返回的 JSON 格式不对。
- Raw transcript: 这个bug是因为API返回的JSON格式不对。
- CER: 0.0% (0 / 22; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 15; with fillers counted 0.0%). Errors: none
- Refined: 这个 bug 是因为 API 返回的 JSON 格式不对。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### mixed-4

Mixed Chinese-English speech.

- Script: We should use MySQL, 不对，PostgreSQL would be better.
- Raw transcript: We should use MySQL, 不对，PostgreSQL would be better.
- CER: 0.0% (0 / 41; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 10; with fillers counted 0.0%). Errors: none
- Refined: We should use PostgreSQL.
- Intended refinement: We should use PostgreSQL instead of MySQL.
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes, Names and terms kept yes

### mixed-5

Mixed Chinese-English speech.

- Script: 我觉得我们应该用 MongoDB，不对，还是 PostgreSQL 比较好，因为我们需要 relational data。
- Raw transcript: 我觉得我们应该用MongoDB，不对，还是PostgreSQL比较好，因为我们需要relational data.
- CER: 0.0% (0 / 52; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 25; with fillers counted 0.0%). Errors: none
- Refined: 我觉得我们应该用PostgreSQL，因为我们需要 relational data。
- Intended refinement: 我觉得我们还是应该用 PostgreSQL，因为我们需要 relational data。
- Automatic checks: Self-correction handled yes, Fillers removed yes, Languages preserved yes, Names and terms kept yes

### special-1

Numbers, dates, names, technical terms, and noise.

- Script: The invoice total is $1,250, and it is due on March 15th, 2027.
- Raw transcript: The invoice total is $1,250 and it is due on March 15th, 2027.
- WER: 0.0% (0 / 13; with fillers counted 0.0%). Errors: none
- Refined: The invoice total is $1,250, and it is due on March 15th, 2027.
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### special-2

Numbers, dates, names, technical terms, and noise.

- Script: Sarah Chen from Stripe asked us to upgrade Kubernetes to version 1.31 and enable OAuth.
- Raw transcript: Sarah Chan from Stripe asked us to upgrade Kubernetes to version 1.31 and enable OAuth.
- WER: 6.7% (1 / 15; with fillers counted 6.7%). Errors: S `chen`→`chan`
- Terms missing from the raw transcript: Sarah Chen
- Refined: Sarah Chan from Stripe asked us to upgrade Kubernetes to version 1.31 and enable OAuth.
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### special-3

Numbers, dates, names, technical terms, and noise.

- Script: 会议定在2027年3月15日上午10点半，预算是两万五千元。
- Raw transcript: 会议定在2027年3月15日上午10点半，预算是两万五千元。
- CER: 0.0% (0 / 28; with fillers counted 0.0%). Errors: none
- Refined: 会议定在2027年3月15日上午10点半，预算是两万五千元。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### special-4

Numbers, dates, names, technical terms, and noise.

- Script: 请把 GitHub 上的 pull request 发给王伟，他会用 TypeScript 重写这个 module。
- Raw transcript: 请把GitHub上的pull request发给王伟，他会用TypeScript重写这个module.
- CER: 0.0% (0 / 48; with fillers counted 0.0%). Errors: none
- Mixed-token error rate: 0.0% (0 / 20; with fillers counted 0.0%). Errors: none
- Refined: 请把 GitHub 上的 pull request 发给王伟，他会用 TypeScript 重写这个 module。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### special-5

Numbers, dates, names, technical terms, and noise.

- Script: Please remind Daniel to renew the AWS certificate before October 3rd.
- Raw transcript: Please remind Daniel to renew the AWS certificate before October 3rd.
- WER: 0.0% (0 / 11; with fillers counted 0.0%). Errors: none
- Refined: Please remind Daniel to renew the AWS certificate before October 3rd.
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes

### special-6

Numbers, dates, names, technical terms, and noise.

- Script: 请提醒李娜在十月三号之前更新服务器证书。
- Raw transcript: 请提醒李娜在十月三号之前更新服务器证书。
- CER: 0.0% (0 / 19; with fillers counted 0.0%). Errors: none
- Refined: 请提醒李娜在十月三号之前更新服务器证书。
- Automatic checks: Fillers removed yes, Languages preserved yes, Names and terms kept yes, Numbers kept yes, Negations kept yes
