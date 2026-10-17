# Raw transcription fidelity

Source: synthetic speech (OpenAI text-to-speech, not a human voice), voice onyx, pink noise at 15 dB SNR. 1 runs per sample. Raw transcripts only; no refinement.

| Setting | Languages kept | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt) | 24/24 | 7/15 (47%) | 2 | 4% | 0 |
| zh+en+hi, no prompt | 24/24 | 7/15 (47%) | 2 | 3% | 0 |
| Auto (no languages, no prompt) | 24/24 | 4/15 (27%) | 1 | 4% | 0 |
| Auto (no languages), app prompt | 24/24 | 7/15 (47%) | 2 | 4% | 0 |
| English only, app prompt | 24/24 | 6/15 (40%) | 1 | 4% | 0 |
| Mandarin only, app prompt | 23/24 | 7/15 (47%) | 2 | 5% | 0 |
| Hindi only, app prompt | 24/24 | 6/15 (40%) | 1 | 3% | 0 |
| zh+en+hi, half-Chinese prompt (candidate) | 24/24 | 7/15 (47%) | 2 | 5% | 0 |
| zh+en+hi, app prompt, filler keywords (candidate) | 24/24 | 7/15 (47%) | 2 | 3% | 0 |
| gpt-4o-transcribe, app prompt | 24/24 | 4/15 (27%) | 0 | 4% | 0 |
| whisper-1, no prompt | 20/24 | 6/15 (40%) | 1 | 16% | 0 |

Languages kept: runs where every language spoken in the sample is still there (none translated away, none added). Fillers: um, uh, er, ah, hmm, "you know", 嗯, 呃 and Hindi fillers, counted per occurrence. Verbatim error rate: mixed-token error rate (one token per Chinese character or English word) with fillers counted.

## mix-postgres (Mandarin-English code-switching)

Said: 我觉得我们应该用 PostgreSQL，because it handles relational data better.

- app #1: 我觉得我们应该用PostgreSQL，因为它 handles relational data better。
- all-no-prompt #1: 我觉得我们应该用PostgreSQL because it handles relational data better。
- auto #1: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- auto-prompt #1: 我觉得我们应该用Postgres SQL because it handles relational data better.
- en #1: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- zh #1: 我觉得我们应该用PostgreSQL，因为它对relational data的处理更好。  **[languages lost: English]**
- hi #1: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- bilingual-prompt #1: 我觉得我们应该用Postgres SQL，因为它 handles relational data better。
- keywords #1: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- 4o #1: 我觉得我们应该用PostgreSQL because it handles relational data better
- whisper #1: 我觉得我们应该用PostgreSQL 因为它能够更好地处理相关资料  **[languages lost: English]**

## mix-react (Mandarin-English code-switching)

Said: 我们应该用 React for the frontend，然后用 Python for the backend.

- app #1: 我们应该用 React for the front end，然后用 Python for the back end。
- all-no-prompt #1: 我们应该用 React for the front end，然后用 Python for the back end。
- auto #1: 我们应该用 React for the front end，然后用 Python for the back end。
- auto-prompt #1: 我们应该用 React for the front end，然后用 Python for the back end。
- en #1: 我们应该用 React for the front end，然后用 Python for the back end。
- zh #1: 我们应该用 React for the front end，然后用 Python for the back end。
- hi #1: 我们应该用 React for the front end，然后用 Python for the back end。
- bilingual-prompt #1: 我们应该用 React for the front end，然后用 Python for the back end。
- keywords #1: 我们应该用 React for the front end，然后用 Python for the back end。
- 4o #1: 我们应该用React for the front end，然后用Python for the back end.
- whisper #1: 我们应该用React for the front end,然后用Python for the back end。

## mix-correction (Mandarin-English code-switching)

Said: 我们应该用 MongoDB，actually no, PostgreSQL is better.

- app #1: 我们应该用 MongoDB，actually no，PostgreSQL is better.
- all-no-prompt #1: 我们应该用 MongoDB，actually no，PostgreSQL is better.
- auto #1: 我们应该用 MongoDB, actually no, PostgreSQL is better.
- auto-prompt #1: 我们应该用 MongoDB，actually no，PostgreSQL is better.
- en #1: 我们应该用 MongoDB, actually no, PostgreSQL is better.
- zh #1: 我们应该用 MongoDB，actually no，PostgreSQL is better.
- hi #1: 我们应该用 MongoDB, actually no, PostgreSQL is better.
- bilingual-prompt #1: 我们应该用 MongoDB，actually no，PostgreSQL is better.
- keywords #1: 我们应该用 MongoDB，actually no，PostgreSQL is better.
- 4o #1: 我们应该用MongoDB,actually no,PostgreSQL is better.
- whisper #1: 我们应该用mongodb Actually no PostgreSQL is better

## mix-en-first (Mandarin-English code-switching)

Said: So the meeting is at three, 然后我们需要准备一下 slides 和 demo.

- app #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- all-no-prompt #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- auto #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- auto-prompt #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- en #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- zh #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- hi #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- bilingual-prompt #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- keywords #1: So, the meeting is at three. 然后我们需要准备一下slides和demo。
- 4o #1: So the meeting is at three, 然后我们需要准备一下slides和demo.
- whisper #1: So, the meeting is at 3, and we need to prepare slides and demos.  **[languages lost: Chinese]**

## mix-zh-clause (Mandarin-English code-switching)

Said: 这个 bug 其实挺难复现的，it only happens when two users log in at the same time.

- app #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- all-no-prompt #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- auto #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- auto-prompt #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- en #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- zh #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- hi #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- bilingual-prompt #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- keywords #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- 4o #1: 这个bug其实挺难复现的。It only happens when two users log in at the same time.
- whisper #1: 这个Bug其实挺难复现的 It only happens when two users log in at the same time

## mix-fillers (Mandarin-English code-switching)

Said: 嗯，我觉得这个 feature, um, 我们应该先 test 一下，然后再 release.

- app #1: 嗯，我觉得这个 feature，嗯，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed; 1 filler(s) invented]**
- all-no-prompt #1: 嗯，我觉得这个 feature，嗯，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed; 1 filler(s) invented]**
- auto #1: 嗯，我觉得这个 feature，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- auto-prompt #1: 嗯，我觉得这个 feature，嗯，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed; 1 filler(s) invented]**
- en #1: 嗯，我觉得这个 feature，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- zh #1: 嗯，我觉得这个 feature，嗯，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed; 1 filler(s) invented]**
- hi #1: 嗯，我觉得这个 feature，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- bilingual-prompt #1: 嗯，我觉得这个 feature，嗯，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed; 1 filler(s) invented]**
- keywords #1: 嗯，我觉得这个 feature，嗯，我们应该先 test 一下，然后再 release。  **[1 filler(s) missed; 1 filler(s) invented]**
- 4o #1: 我觉得这个feature我们应该先test一下，然后再release  **[2 filler(s) missed]**
- whisper #1: 我觉得这个feature 我们应该先test一下 然后再release  **[2 filler(s) missed]**

## mix-latency (Mandarin-English code-switching)

Said: OK，所以 main problem 是 API latency。我看了一下监控，平均响应时间大概是八百毫秒，which is way too slow for our users.

- app #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- all-no-prompt #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- auto #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- auto-prompt #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- en #1: OK, 所以 main problem 是 API latency。我看了一下监控，平均响应时间大概是 800 毫秒，which is way too slow for our users.
- zh #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- hi #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- bilingual-prompt #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- keywords #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800 毫秒，which is way too slow for our users。
- 4o #1: OK，所以main problem是API latency。我看了一下监控，平均响应时间大概是800毫秒which is way too slow for our users.
- whisper #1: OK,所以主要的问题是API延迟 我看了一下监控 平均响应时间大概是800毫秒 这太慢了  **[languages lost: English]**

## mix-logs (Mandarin-English code-switching)

Said: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。

- app #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- all-no-prompt #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- auto #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- auto-prompt #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- en #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- zh #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- hi #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- bilingual-prompt #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- keywords #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- 4o #1: 我刚才check了一下the server logs，看起来database connection一直在timeout.
- whisper #1: 我刚才check了一下 The server logs 看起来Database connection一直在timeout

## mix-deadline (Mandarin-English code-switching)

Said: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。

- app #1: 那个deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- all-no-prompt #1: 那个deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- auto #1: 那个deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- auto-prompt #1: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- en #1: 那个deadline是next Friday，所以我们这 week 要把code review做完。
- zh #1: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- hi #1: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- bilingual-prompt #1: 那个 deadline 是 next Friday，所以我们这 week 要把 code review 做完。
- keywords #1: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- 4o #1: 那个deadline是next Friday，所以我们this week要把code review做完
- whisper #1: 那個 deadline 是 next friday 所以我們 this week 要把 code review 做完

## mix-schedule (Mandarin-English code-switching)

Said: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。

- app #1: 你帮我schedule一个meeting跟design team讨论一下 new onboarding flow。
- all-no-prompt #1: 你帮我schedule一个meeting，跟design team讨论一下 new onboarding flow。
- auto #1: 你帮我schedule一个meeting，跟design team讨论一下new onboarding flow。
- auto-prompt #1: 你帮我schedule一个meeting，跟design team讨论一下 new onboarding flow。
- en #1: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。
- zh #1: 你帮我schedule一个meeting，跟design team讨论一下 new onboarding flow。
- hi #1: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。
- bilingual-prompt #1: 你帮我schedule一个meeting，跟design team讨论一下new onboarding flow。
- keywords #1: 你帮我schedule一个meeting，跟design team讨论一下 new onboarding flow。
- 4o #1: 你帮我schedule一个meeting跟design team讨论一下new onboarding flow
- whisper #1: 你幫我Schedule一個Meeting跟Design Team討論一下New Onboarding Flow

## mix-ci (Mandarin-English code-switching)

Said: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。

- app #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- all-no-prompt #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- auto #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- auto-prompt #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- en #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- zh #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- hi #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- bilingual-prompt #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- keywords #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- 4o #1: 这个PR我已经merge了，但是CI还是fail，可能是test environment的问题。
- whisper #1: 这个PR我已经MERGE了 但是CI还是FAIL 可能是TEST ENVIRONMENT的问题

## mix-deploy (Mandarin-English code-switching)

Said: Um, 我觉得 we should 先 deploy 到 staging，然后再 push to production.

- app #1: 嗯，我觉得我们应该先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- all-no-prompt #1: 嗯，我觉得我们先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- auto #1: 嗯，我觉得我们先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- auto-prompt #1: 嗯，我觉得我们先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- en #1: 嗯，我觉得我们应该先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- zh #1: 嗯，我觉得我们先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- hi #1: 嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- bilingual-prompt #1: 嗯，我觉得我们应该先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- keywords #1: 嗯，我觉得我们先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- 4o #1: um 我觉得 we should 先 deploy 到 staging 然后再 push to production
- whisper #1: 嗯 我觉得我们应该先进行舞台 然后再推进制作  **[languages lost: English; 1 filler(s) missed; 1 filler(s) invented]**

## zh-heavy-timeline (Mandarin-English code-switching)

Said: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。

- app #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- all-no-prompt #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- auto #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- auto-prompt #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- en #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- zh #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- hi #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- bilingual-prompt #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- keywords #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- 4o #1: 我觉得这个方案还可以，但是我们需要再讨论一下timeline，因为下个月大家都很忙。
- whisper #1: 我觉得这个方案还可以,但是我们需要再讨论一下Timeline,因为下个月大家都很忙。

## zh-heavy-retention (Mandarin-English code-switching)

Said: 昨天开会的时候老板说，我们这个季度的重点是提高用户留存，especially for new users。

- app #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- all-no-prompt #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- auto #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- auto-prompt #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- en #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users.
- zh #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- hi #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- bilingual-prompt #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- keywords #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- 4o #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存, especially for new users.
- whisper #1: 昨天开会的时候,老板说,我们这个记录的重点是提高用户留存,especially for new users.

## zh-heavy-update (Mandarin-English code-switching)

Said: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。

- app #1: 好，我先说一下今天的进度，前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好，如果没有问题的话，我们下周三就可以 release。
- all-no-prompt #1: 好，我先说一下今天的进度：前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- auto #1: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- auto-prompt #1: 好，我先说一下今天的进度，前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好，如果没有问题的话，我们下周三就可以 release。
- en #1: 好，我先说一下今天的进度，前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好，如果没有问题的话，我们下周三就可以 release。
- zh #1: 好，我先说一下今天的进度：前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- hi #1: 好，我先说一下今天的进度：前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- bilingual-prompt #1: 好，我先说一下今天的进度：前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- keywords #1: 好，我先说一下今天的进度，前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好，如果没有问题的话，我们下周三就可以 release。
- 4o #1: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release.
- whisper #1: 好,我先说一下今天的进度 前端那边登录页面已经做完了 后端的API还差两个接口 然后测试环境明天应该能搭好 如果没有问题的话 我们下周三就可以release

## en-fillers-spec (English fillers)

Said: Um, I think we should, uh, use PostgreSQL.

- app #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- all-no-prompt #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- auto #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- auto-prompt #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- en #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- zh #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- hi #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- bilingual-prompt #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- keywords #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- 4o #1: Um, I think we should use PostgreSQL.  **[1 filler(s) missed]**
- whisper #1: Um, I think we should, uh, use postgresql.

## en-fillers-many (English fillers)

Said: Um, so, uh, I was thinking, you know, that we could, um, maybe move the meeting to Friday.

- app #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- all-no-prompt #1: Um, so I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- auto #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- auto-prompt #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- en #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- zh #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- hi #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- bilingual-prompt #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- keywords #1: Um, so, I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- 4o #1: Um, so I was thinking, you know, that we could maybe move the meeting to Friday.  **[2 filler(s) missed]**
- whisper #1: So, I was thinking, you know, that we could maybe move the meeting to Friday.  **[3 filler(s) missed]**

## en-repetition (English fillers)

Said: I, I think we should, uh, we should use Redis, no, Postgres for the cache.

- app #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- all-no-prompt #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- auto #1: I, I think we should, we should use Redis. No, Postgres for the cache.  **[1 filler(s) missed]**
- auto-prompt #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- en #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- zh #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- hi #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- bilingual-prompt #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- keywords #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- 4o #1: I think we should use Redis, no, Postgres for the cache.  **[1 filler(s) missed]**
- whisper #1: I, I think we should, uh, we should use Redis, no, Postgres for the cache.

## zh-fillers-many (Mandarin fillers)

Said: 嗯，我觉得我们，呃，应该先把这个测试，嗯，做完再上线。

- app #1: 嗯，我觉得我们应该先把这个测试做完再上线。  **[2 filler(s) missed]**
- all-no-prompt #1: 嗯，我觉得我们应该先把这个测试做完再上线。  **[2 filler(s) missed]**
- auto #1: 我觉得我们应该先把这个测试做完再上线。  **[3 filler(s) missed]**
- auto-prompt #1: 呃，我觉得我们应该先把这个测试做完再上线。  **[2 filler(s) missed]**
- en #1: 我觉得我们应该先把这个测试做完再上线。  **[3 filler(s) missed]**
- zh #1: 嗯，我觉得我们应该先把这个测试做完再上线。  **[2 filler(s) missed]**
- hi #1: 我觉得我们应该先把这个测试做完再上线。  **[3 filler(s) missed]**
- bilingual-prompt #1: 嗯，我觉得我们应该先把这个测试做完再上线。  **[2 filler(s) missed]**
- keywords #1: 嗯，我觉得我们应该先把这个测试做完再上线。  **[2 filler(s) missed]**
- 4o #1: 我觉得我们应该先把这个测试做完再上线。  **[3 filler(s) missed]**
- whisper #1: 我觉得我们应该先把这个测试做完再上线  **[3 filler(s) missed]**

## zh-fillers-question (Mandarin fillers)

Said: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？

- app #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- all-no-prompt #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- auto #1: 呃，你能把昨天会议的幻灯片发给我吗？  **[1 filler(s) missed]**
- auto-prompt #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- en #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- zh #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- hi #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- bilingual-prompt #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- keywords #1: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？
- 4o #1: 你能把昨天会议的幻灯片发给我吗?  **[2 filler(s) missed]**
- whisper #1: 呃,你能把昨天会议的,嗯,幻灯片发给我吗?

## en-plain (No fillers (checks that none are invented))

Said: Please send the quarterly report to the finance team before Friday afternoon.

- app #1: Please send the quarterly report to the finance team before Friday afternoon.
- all-no-prompt #1: Please send the quarterly report to the finance team before Friday afternoon.
- auto #1: Please send the quarterly report to the finance team before Friday afternoon.
- auto-prompt #1: Please send the quarterly report to the finance team before Friday afternoon.
- en #1: Please send the quarterly report to the finance team before Friday afternoon.
- zh #1: Please send the quarterly report to the finance team before Friday afternoon.
- hi #1: Please send the quarterly report to the finance team before Friday afternoon.
- bilingual-prompt #1: Please send the quarterly report to the finance team before Friday afternoon.
- keywords #1: Please send the quarterly report to the finance team before Friday afternoon.
- 4o #1: Please send the quarterly report to the finance team before Friday afternoon.
- whisper #1: please send the quarterly report to the finance team before Friday afternoon.

## zh-plain (No fillers (checks that none are invented))

Said: 请把这份季度报告发给财务部门，周五之前要完成。

- app #1: 请把这份季度报告发给财务部门，周五之前要完成。
- all-no-prompt #1: 请把这份季度报告发给财务部门，周五之前要完成。
- auto #1: 请把这份季度报告发给财务部门，周五之前要完成。
- auto-prompt #1: 请把这份季度报告发给财务部门，周五之前要完成。
- en #1: 请把这份季度报告发给财务部门，周五之前要完成。
- zh #1: 请把这份季度报告发给财务部门，周五之前要完成。
- hi #1: 请把这份季度报告发给财务部门，周五之前要完成。
- bilingual-prompt #1: 请把这份季度报告发给财务部门，周五之前要完成。
- keywords #1: 请把这份季度报告发给财务部门，周五之前要完成。
- 4o #1: 请把这份季度报告发给财务部门，周五之前要完成。
- whisper #1: 请把这份季度报告发给财务部门,周五之前要完成。

## hi-plain (Hindi and Hindi-English)

Said: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।

- app #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- all-no-prompt #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- auto #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- auto-prompt #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- en #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- zh #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- hi #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- bilingual-prompt #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- keywords #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- 4o #1: मुझे लगता है कि हमें अगले हफ़्ते मीटिंग करनी चाहिए।
- whisper #1: मुझे लगता है कि हमें अगले हाफ़ते मीटिंग करनी चाहिए।

## hi-mixed (Hindi and Hindi-English)

Said: मुझे लगता है कि हमें PostgreSQL use करना चाहिए, because it is more reliable.

- app #1: मुझे लगता है कि हमें PostgreSQL use करना चाहिए because it is more reliable.
- all-no-prompt #1: मुझे लगता है कि हमें PostgreSQL यूज़ करना चाहिए because it is more reliable.
- auto #1: मुझे लगता है कि हमें PostgreSQL use करना चाहिए because it is more reliable.
- auto-prompt #1: मुझे लगता है कि हमें PostgreSQL use करना चाहिए because it is more reliable.
- en #1: मुझे लगता है कि हमें PostgreSQL यूज़ करना चाहिए because it is more reliable.
- zh #1: मुझे लगता है कि हमें PostgreSQL यूज़ करना चाहिए because it is more reliable.
- hi #1: मुझे लगता है कि हमें PostgreSQL use करना चाहिए because it is more reliable.
- bilingual-prompt #1: मुझे लगता है कि हमें PostgreSQL यूज़ करना चाहिए because it is more reliable.
- keywords #1: मुझे लगता है कि हमें PostgreSQL use करना चाहिए because it is more reliable.
- 4o #1: मुझे लगता है कि हमें PostgreSQL यूज़ करना चाहिए because it is more reliable.
- whisper #1: मुझे लगता है कि हमें पोस्ग्रे SQL यूज़ करना चाहिए Because it is more reliable.
