# Raw transcription fidelity

Source: synthetic speech (OpenAI text-to-speech, not a human voice). 3 runs per sample. Raw transcripts only; no refinement.

| Setting | Languages kept | Names kept as spoken | Fillers kept | Fillers invented | Verbatim error rate | Failed requests |
| --- | --- | --- | --- | --- | --- | --- |
| App (gpt-transcribe, zh+en+hi, app prompt, name check with gpt-4o-transcribe) | 89/93 | 33/45 | 28/48 (58%) | 3 | 4% | 0 |
| gpt-transcribe, zh+en+hi, app prompt, no name check | 87/93 | 21/45 | 26/48 (54%) | 3 | 5% | 0 |

Names kept as spoken: names and terms (the dataset's `terms`) that came back in the language they were said in. Languages kept: runs where every language spoken in the sample is still there (none translated away, none added). Fillers: um, uh, er, ah, hmm, "you know", 嗯, 呃 and Hindi fillers, counted per occurrence. Verbatim error rate: mixed-token error rate (one token per Chinese character or English word) with fillers counted.

## mix-postgres (Mandarin-English code-switching)

Said: 我觉得我们应该用 PostgreSQL，because it handles relational data better.

- app #1: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- app #2: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- app #3: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- no-name-check #1: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- no-name-check #2: 我觉得我们应该用 PostgreSQL because it handles relational data better.
- no-name-check #3: 我觉得我们应该用 PostgreSQL because it handles relational data better.

## mix-react (Mandarin-English code-switching)

Said: 我们应该用 React for the frontend，然后用 Python for the backend.

- app #1: 我们应该用 React for the front end，然后用 Python for the back end。
- app #2: 我们应该用 React for the front end，然后用 Python for the back end。
- app #3: 我们应该用 React for the front end，然后用 Python for the back end。
- no-name-check #1: 我们应该用 React for the front end，然后用 Python for the back end。
- no-name-check #2: 我们应该用 React for the front end，然后用 Python for the back end。
- no-name-check #3: 我们应该用 React for the front end，然后用 Python for the back end。

## mix-correction (Mandarin-English code-switching)

Said: 我们应该用 MongoDB，actually no, PostgreSQL is better.

- app #1: 我们应该用 MongoDB。Actually no, PostgreSQL is better.
- app #2: 我们应该用 MongoDB。Actually no, PostgreSQL is better.
- app #3: 我们应该用 MongoDB。Actually no, PostgreSQL is better.
- no-name-check #1: 我们应该用 MongoDB。Actually no, PostgreSQL is better.
- no-name-check #2: 我们应该用 MongoDB。Actually no, PostgreSQL is better.
- no-name-check #3: 我们应该用 MongoDB。Actually no, PostgreSQL is better.

## mix-en-first (Mandarin-English code-switching)

Said: So the meeting is at three, 然后我们需要准备一下 slides 和 demo.

- app #1: So, the meeting is at three, 然后我们需要准备一下 slides 和 demo。
- app #2: So, the meeting is at three, 然后我们需要准备一下 slides 和 demo。
- app #3: So, the meeting is at three, 然后我们需要准备一下 slides 和 demo。
- no-name-check #1: So, the meeting is at three, 然后我们需要准备一下 slides 和 demo。
- no-name-check #2: So, the meeting is at three, 然后我们需要准备一下 slides 和 demo。
- no-name-check #3: So, the meeting is at three, 然后我们需要准备一下 slides 和 demo。

## mix-zh-clause (Mandarin-English code-switching)

Said: 这个 bug 其实挺难复现的，it only happens when two users log in at the same time.

- app #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- app #2: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- app #3: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- no-name-check #1: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- no-name-check #2: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.
- no-name-check #3: 这个 bug 其实挺难复现的。It only happens when two users log in at the same time.

## mix-fillers (Mandarin-English code-switching)

Said: 嗯，我觉得这个 feature, um, 我们应该先 test 一下，然后再 release.

- app #1: 嗯，我觉得这个 feature 我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- app #2: 嗯，我觉得这个 feature 我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- app #3: 嗯，我觉得这个 feature 我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- no-name-check #1: 嗯，我觉得这个 feature 我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- no-name-check #2: 嗯，我觉得这个 feature 我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**
- no-name-check #3: 嗯，我觉得这个 feature 我们应该先 test 一下，然后再 release。  **[1 filler(s) missed]**

## mix-latency (Mandarin-English code-switching)

Said: OK，所以 main problem 是 API latency。我看了一下监控，平均响应时间大概是八百毫秒，which is way too slow for our users.

- app #1: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800ms，which is way too slow for our users。
- app #2: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800ms，which is way too slow for our users。
- app #3: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800ms，which is way too slow for our users。
- no-name-check #1: OK，所以 main problem 是 API latency。我看了一下监控，平均响应时间大概是 800 毫秒，which is way too slow for our users.
- no-name-check #2: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800ms，which is way too slow for our users。
- no-name-check #3: OK，所以 main problem 是 API latency，我看了一下监控平均响应时间大概是 800ms，which is way too slow for our users。

## mix-logs (Mandarin-English code-switching)

Said: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。

- app #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- app #2: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- app #3: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- no-name-check #1: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- no-name-check #2: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。
- no-name-check #3: 我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。

## mix-deadline (Mandarin-English code-switching)

Said: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。

- app #1: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- app #2: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- app #3: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- no-name-check #1: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- no-name-check #2: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。
- no-name-check #3: 那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。

## mix-schedule (Mandarin-English code-switching)

Said: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。

- app #1: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。
- app #2: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。
- app #3: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。
- no-name-check #1: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。
- no-name-check #2: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。
- no-name-check #3: 你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。

## mix-ci (Mandarin-English code-switching)

Said: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。

- app #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- app #2: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- app #3: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- no-name-check #1: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- no-name-check #2: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。
- no-name-check #3: 这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。

## mix-deploy (Mandarin-English code-switching)

Said: Um, 我觉得 we should 先 deploy 到 staging，然后再 push to production.

- app #1: 嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- app #2: 嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- app #3: 嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- no-name-check #1: 嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- no-name-check #2: 嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**
- no-name-check #3: 嗯，我觉得 we should 先 deploy 到 staging，然后再 push to production。  **[1 filler(s) missed; 1 filler(s) invented]**

## zh-heavy-timeline (Mandarin-English code-switching)

Said: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。

- app #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- app #2: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- app #3: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- no-name-check #1: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- no-name-check #2: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。
- no-name-check #3: 我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。

## zh-heavy-retention (Mandarin-English code-switching)

Said: 昨天开会的时候老板说，我们这个季度的重点是提高用户留存，especially for new users。

- app #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- app #2: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- app #3: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- no-name-check #1: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- no-name-check #2: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。
- no-name-check #3: 昨天开会的时候，老板说我们这个季度的重点是提高用户留存，especially for new users。

## zh-heavy-update (Mandarin-English code-switching)

Said: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。

- app #1: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- app #2: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- app #3: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- no-name-check #1: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- no-name-check #2: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。
- no-name-check #3: 好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。

## mix-intro-nyu (Mandarin-English code-switching)

Said: 嗯，你好，我的名字叫王宇辰, and I just graduated from 纽约大学 with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。

- app #1: 嗯，你好，我的名字叫王宇辰, and I just graduated from 纽约大学 with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。
- app #2: 嗯，你好，我的名字叫王宇辰, and I just graduated from 纽约大学 with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。
- app #3: 嗯，你好，我的名字叫王宇辰, and I just graduated from 纽约大学 with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。
- no-name-check #1: 嗯，你好，我的名字叫王宇辰, and I just graduated from New York University with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。  **[names changed: 纽约大学]**
- no-name-check #2: 嗯，你好，我的名字叫王宇辰, and I just graduated from New York University with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。  **[names changed: 纽约大学]**
- no-name-check #3: 嗯，你好，我的名字叫王宇辰, and I just graduated from New York University with a bachelor degree in 计算机科学. So it's really nice for me to meet you today. 我想要更多地了解你。  **[names changed: 纽约大学]**

## mix-en-zh-school (Mandarin-English code-switching)

Said: I'm meeting 张老师 at 清华大学 tomorrow, so I'll be a little late for the call.

- app #1: I'm meeting 张老师 at 清华大学 tomorrow, so I'll be a little late for the call.
- app #2: I'm meeting 张老师 at 清华大学 tomorrow, so I'll be a little late for the call.
- app #3: I'm meeting 张老师 at 清华大学 tomorrow, so I'll be a little late for the call.
- no-name-check #1: I'm meeting Zhang老师 at 清华大学 tomorrow, so I'll be a little late for the call.  **[names changed: 张老师]**
- no-name-check #2: I'm meeting Zhang老师 at 清华大学 tomorrow, so I'll be a little late for the call.  **[names changed: 张老师]**
- no-name-check #3: I'm meeting Zhang老师 at 清华大学 tomorrow, so I'll be a little late for the call.  **[names changed: 张老师]**

## mix-en-zh-places (Mandarin-English code-switching)

Said: We flew from 上海 to 北京 last week, but honestly I liked the hotel near 外滩 better.

- app #1: We flew from Shanghai to Beijing last week, but honestly I liked the hotel near Y10 better.  **[names changed: 上海, 北京, 外滩; languages lost: Chinese]**
- app #2: We flew from 上海 to Beijing last week, but honestly I liked the hotel near Y10 better.  **[names changed: 北京, 外滩; languages lost: Chinese]**
- app #3: We flew from Shanghai to Beijing last week, but honestly I liked the hotel near Y10 better.  **[names changed: 上海, 北京, 外滩; languages lost: Chinese]**
- no-name-check #1: We flew from Shanghai to Beijing last week, but honestly I liked the hotel near Y10 better.  **[names changed: 上海, 北京, 外滩; languages lost: Chinese]**
- no-name-check #2: We flew from Shanghai to Beijing last week, but honestly I liked the hotel near Y10 better.  **[names changed: 上海, 北京, 外滩; languages lost: Chinese]**
- no-name-check #3: We flew from Shanghai to Beijing last week, but honestly I liked the hotel near Y10 better.  **[names changed: 上海, 北京, 外滩; languages lost: Chinese]**

## mix-en-zh-company (Mandarin-English code-switching)

Said: My friend just started at 腾讯, and she says the 微信 team is really busy right now.

- app #1: My friend just started at Tongxin, and she says the Weixin team is really busy right now.  **[names changed: 腾讯, 微信; languages lost: Chinese]**
- app #2: My friend just started at 腾信, and she says the 微信 team is really busy right now.  **[names changed: 腾讯]**
- app #3: My friend just started at 腾迅, and she says the 微信 team is really busy right now.  **[names changed: 腾讯]**
- no-name-check #1: My friend just started at Tongxin, and she says the Weixin team is really busy right now.  **[names changed: 腾讯, 微信; languages lost: Chinese]**
- no-name-check #2: My friend just started at Tongxin, and she says the Weixin team is really busy right now.  **[names changed: 腾讯, 微信; languages lost: Chinese]**
- no-name-check #3: My friend just started at Tongxin, and she says the Weixin team is really busy right now.  **[names changed: 腾讯, 微信; languages lost: Chinese]**

## mix-en-zh-major (Mandarin-English code-switching)

Said: Next year I want to study 人工智能, especially 机器学习, at a school in California.

- app #1: Next year I want to study 人工智能, especially 机器学习, at a school in California.
- app #2: Next year I want to study 人工智能, especially 机器学习, at a school in California.
- app #3: Next year I want to study 人工智能, especially 机器学习, at a school in California.
- no-name-check #1: Next year I want to study 人工智能, especially 机器学习, at a school in California.
- no-name-check #2: Next year I want to study 人工智能, especially 机器学习, at a school in California.
- no-name-check #3: Next year I want to study 人工智能, especially 机器学习, at a school in California.

## mix-zh-en-school (Mandarin-English code-switching)

Said: 我明年想去 New York University 读研究生，学 computer science。

- app #1: 我明年想去 New York University 读研究生，学 computer science。
- app #2: 我明年想去 New York University 读研究生，学 computer science。
- app #3: 我明年想去 New York University 读研究生，学 computer science。
- no-name-check #1: 我明年想去 New York University 读研究生，学 computer science。
- no-name-check #2: 我明年想去 New York University 读研究生，学 computer science。
- no-name-check #3: 我明年想去 New York University 读研究生，学 computer science。

## mix-zh-en-names (Mandarin-English code-switching)

Said: 我朋友在 Google 工作，他下个月要搬到 Seattle 去。

- app #1: 我朋友在 Google 工作，他下个月要搬到 Seattle 去。
- app #2: 我朋友在 Google 工作，他下个月要搬到 Seattle 去。
- app #3: 我朋友在 Google 工作，他下个月要搬到 Seattle 去。
- no-name-check #1: 我朋友在 Google 工作，他下个月要搬到西雅图去。  **[names changed: Seattle]**
- no-name-check #2: 我朋友在 Google 工作，他下个月要搬到西雅图去。  **[names changed: Seattle]**
- no-name-check #3: 我朋友在 Google 工作，他下个月要搬到西雅图去。  **[names changed: Seattle]**

## en-fillers-spec (English fillers)

Said: Um, I think we should, uh, use PostgreSQL.

- app #1: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- app #2: Um, I think we should, uh, use PostgreSQL.
- app #3: Um, I think we should, uh, use PostgreSQL.
- no-name-check #1: Um, I think we should, uh, use PostgreSQL.
- no-name-check #2: I think we should use PostgreSQL.  **[2 filler(s) missed]**
- no-name-check #3: I think we should use PostgreSQL.  **[2 filler(s) missed]**

## en-fillers-many (English fillers)

Said: Um, so, uh, I was thinking, you know, that we could, um, maybe move the meeting to Friday.

- app #1: So, I was thinking, you know, that we could maybe move the meeting to Friday.  **[3 filler(s) missed]**
- app #2: So, I was thinking, you know, that we could maybe move the meeting to Friday.  **[3 filler(s) missed]**
- app #3: So, I was thinking, you know, that we could maybe move the meeting to Friday.  **[3 filler(s) missed]**
- no-name-check #1: So, I was thinking, you know, that we could maybe move the meeting to Friday.  **[3 filler(s) missed]**
- no-name-check #2: So, I was thinking, you know, that we could maybe move the meeting to Friday.  **[3 filler(s) missed]**
- no-name-check #3: So, I was thinking, you know, that we could maybe move the meeting to Friday.  **[3 filler(s) missed]**

## en-repetition (English fillers)

Said: I, I think we should, uh, we should use Redis, no, Postgres for the cache.

- app #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- app #2: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- app #3: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- no-name-check #1: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- no-name-check #2: I, I think we should, uh, we should use Redis. No, Postgres for the cache.
- no-name-check #3: I, I think we should, uh, we should use Redis. No, Postgres for the cache.

## zh-fillers-many (Mandarin fillers)

Said: 嗯，我觉得我们，呃，应该先把这个测试，嗯，做完再上线。

- app #1: 嗯，我觉得我们呃应该先把这个测试嗯做完再上线。
- app #2: 嗯，我觉得我们呃应该先把这个测试嗯做完再上线。
- app #3: 嗯，我觉得我们呃应该先把这个测试嗯做完再上线。
- no-name-check #1: 嗯，我觉得我们呃应该先把这个测试嗯做完再上线。
- no-name-check #2: 嗯，我觉得我们呃应该先把这个测试嗯做完再上线。
- no-name-check #3: 嗯，我觉得我们呃应该先把这个测试嗯做完再上线。

## zh-fillers-question (Mandarin fillers)

Said: 呃，你能把昨天会议的，嗯，幻灯片发给我吗？

- app #1: 二，你能把昨天会议的，嗯，幻灯片发给我吗？  **[1 filler(s) missed]**
- app #2: 二，你能把昨天会议的，嗯，幻灯片发给我吗？  **[1 filler(s) missed]**
- app #3: 二，你能把昨天会议的，嗯，幻灯片发给我吗？  **[1 filler(s) missed]**
- no-name-check #1: 二，你能把昨天会议的，嗯，幻灯片发给我吗？  **[1 filler(s) missed]**
- no-name-check #2: 二，你能把昨天会议的，嗯，幻灯片发给我吗？  **[1 filler(s) missed]**
- no-name-check #3: 二，你能把昨天会议的，嗯，幻灯片发给我吗？  **[1 filler(s) missed]**

## en-plain (No fillers (checks that none are invented))

Said: Please send the quarterly report to the finance team before Friday afternoon.

- app #1: Please send the quarterly report to the finance team before Friday afternoon.
- app #2: Please send the quarterly report to the finance team before Friday afternoon.
- app #3: Please send the quarterly report to the finance team before Friday afternoon.
- no-name-check #1: Please send the quarterly report to the finance team before Friday afternoon.
- no-name-check #2: Please send the quarterly report to the finance team before Friday afternoon.
- no-name-check #3: Please send the quarterly report to the finance team before Friday afternoon.

## zh-plain (No fillers (checks that none are invented))

Said: 请把这份季度报告发给财务部门，周五之前要完成。

- app #1: 请把这份季度报告发给财务部门，周五之前要完成。
- app #2: 请把这份季度报告发给财务部门，周五之前要完成。
- app #3: 请把这份季度报告发给财务部门，周五之前要完成。
- no-name-check #1: 请把这份季度报告发给财务部门，周五之前要完成。
- no-name-check #2: 请把这份季度报告发给财务部门，周五之前要完成。
- no-name-check #3: 请把这份季度报告发给财务部门，周五之前要完成。

## hi-plain (Hindi and Hindi-English)

Said: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।

- app #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- app #2: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- app #3: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- no-name-check #1: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- no-name-check #2: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।
- no-name-check #3: मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।

## hi-mixed (Hindi and Hindi-English)

Said: मुझे लगता है कि हमें PostgreSQL use करना चाहिए, because it is more reliable.

- app #1: मुझे लगता है कि हमें पोस्टग्रे एसक्यूएल यूज़ करना चाहिए, because it is more reliable.
- app #2: मुझे लगता है कि हमें पोस्टग्रे एसक्यूएल यूज़ करना चाहिए, because it is more reliable.
- app #3: मुझे लगता है कि हमें पोस्टग्रे एसक्यूएल यूज़ करना चाहिए, because it is more reliable.
- no-name-check #1: मुझे लगता है कि हमें पोस्टग्रे एसक्यूएल यूज़ करना चाहिए, because it is more reliable.
- no-name-check #2: मुझे लगता है कि हमें पोस्टग्रे एसक्यूएल यूज़ करना चाहिए, because it is more reliable.
- no-name-check #3: मुझे लगता है कि हमें पोस्टग्रे एसक्यूएल यूज़ करना चाहिए, because it is more reliable.
