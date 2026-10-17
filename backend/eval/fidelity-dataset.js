// Fidelity set: what the speaker says, which is also the expected verbatim raw transcript.
// Synthetic samples are spoken by OpenAI text-to-speech, so they test the transcription model
// on clear, deliberate fillers; a person's quick, quiet "uh" is harder. See docs/evaluation.md.
//
// Each case: id, group, script (spoken text = verbatim reference), voice, casual: true to ask
// the speech model for relaxed, hesitant delivery, and terms: names that must come back exactly
// as written, in the language they were said in.

export const FIDELITY_GROUPS = {
  mixed: 'Mandarin-English code-switching',
  fillers_en: 'English fillers',
  fillers_zh: 'Mandarin fillers',
  plain: 'No fillers (checks that none are invented)',
  hindi: 'Hindi and Hindi-English',
}

export const FIDELITY_CASES = [
  // The spec's examples.
  { id: 'mix-postgres', group: 'mixed', voice: 'nova', script: '我觉得我们应该用 PostgreSQL，because it handles relational data better.' },
  { id: 'mix-react', group: 'mixed', voice: 'alloy', script: '我们应该用 React for the frontend，然后用 Python for the backend.' },
  { id: 'mix-correction', group: 'mixed', voice: 'coral', script: '我们应该用 MongoDB，actually no, PostgreSQL is better.' },
  { id: 'mix-en-first', group: 'mixed', voice: 'shimmer', script: 'So the meeting is at three, 然后我们需要准备一下 slides 和 demo.' },
  { id: 'mix-zh-clause', group: 'mixed', voice: 'echo', script: '这个 bug 其实挺难复现的，it only happens when two users log in at the same time.' },
  { id: 'mix-fillers', group: 'mixed', voice: 'nova', casual: true, script: '嗯，我觉得这个 feature, um, 我们应该先 test 一下，然后再 release.' },

  // Chinese sentences carrying English terms, where a model is most tempted to write one language.
  { id: 'mix-latency', group: 'mixed', voice: 'onyx', script: 'OK，所以 main problem 是 API latency。我看了一下监控，平均响应时间大概是八百毫秒，which is way too slow for our users.' },
  { id: 'mix-logs', group: 'mixed', voice: 'coral', script: '我刚才 check 了一下 the server logs，看起来 database connection 一直在 timeout。' },
  { id: 'mix-deadline', group: 'mixed', voice: 'alloy', script: '那个 deadline 是 next Friday，所以我们 this week 要把 code review 做完。' },
  { id: 'mix-schedule', group: 'mixed', voice: 'shimmer', script: '你帮我 schedule 一个 meeting，跟 design team 讨论一下 new onboarding flow。' },
  { id: 'mix-ci', group: 'mixed', voice: 'echo', script: '这个 PR 我已经 merge 了，但是 CI 还是 fail，可能是 test environment 的问题。' },
  { id: 'mix-deploy', group: 'mixed', voice: 'nova', casual: true, script: 'Um, 我觉得 we should 先 deploy 到 staging，然后再 push to production.' },

  // Mostly Chinese, where a model could turn Chinese into English.
  { id: 'zh-heavy-timeline', group: 'mixed', voice: 'onyx', script: '我觉得这个方案还可以，但是我们需要再讨论一下 timeline，因为下个月大家都很忙。' },
  { id: 'zh-heavy-retention', group: 'mixed', voice: 'shimmer', script: '昨天开会的时候老板说，我们这个季度的重点是提高用户留存，especially for new users。' },
  { id: 'zh-heavy-update', group: 'mixed', voice: 'alloy', script: '好，我先说一下今天的进度。前端那边登录页面已经做完了，后端的 API 还差两个接口，然后测试环境明天应该能搭好。如果没有问题的话，我们下周三就可以 release。' },

  // Chinese names inside English sentences, which the model tends to write in English (纽约大学 as
  // "New York University"). The first is a sentence a user reported. The last two are the reverse:
  // English names said in English, which must stay English.
  {
    id: 'mix-intro-nyu',
    group: 'mixed',
    voice: 'echo',
    casual: true,
    terms: ['纽约大学', '计算机科学', '王宇辰'],
    script: '嗯，你好，我的名字叫王宇辰, and I just graduated from 纽约大学 with a bachelor degree in 计算机科学. So it\'s really nice for me to meet you today. 我想要更多地了解你。',
  },
  { id: 'mix-en-zh-school', group: 'mixed', voice: 'nova', terms: ['张老师', '清华大学'], script: "I'm meeting 张老师 at 清华大学 tomorrow, so I'll be a little late for the call." },
  { id: 'mix-en-zh-places', group: 'mixed', voice: 'onyx', terms: ['上海', '北京', '外滩'], script: 'We flew from 上海 to 北京 last week, but honestly I liked the hotel near 外滩 better.' },
  { id: 'mix-en-zh-company', group: 'mixed', voice: 'shimmer', terms: ['腾讯', '微信'], script: 'My friend just started at 腾讯, and she says the 微信 team is really busy right now.' },
  { id: 'mix-en-zh-major', group: 'mixed', voice: 'alloy', terms: ['人工智能', '机器学习'], script: 'Next year I want to study 人工智能, especially 机器学习, at a school in California.' },
  { id: 'mix-zh-en-school', group: 'mixed', voice: 'coral', terms: ['New York University'], script: '我明年想去 New York University 读研究生，学 computer science。' },
  { id: 'mix-zh-en-names', group: 'mixed', voice: 'echo', terms: ['Google', 'Seattle'], script: '我朋友在 Google 工作，他下个月要搬到 Seattle 去。' },

  { id: 'en-fillers-spec', group: 'fillers_en', voice: 'alloy', casual: true, script: 'Um, I think we should, uh, use PostgreSQL.' },
  { id: 'en-fillers-many', group: 'fillers_en', voice: 'onyx', casual: true, script: 'Um, so, uh, I was thinking, you know, that we could, um, maybe move the meeting to Friday.' },
  { id: 'en-repetition', group: 'fillers_en', voice: 'coral', casual: true, script: 'I, I think we should, uh, we should use Redis, no, Postgres for the cache.' },

  { id: 'zh-fillers-many', group: 'fillers_zh', voice: 'nova', casual: true, script: '嗯，我觉得我们，呃，应该先把这个测试，嗯，做完再上线。' },
  { id: 'zh-fillers-question', group: 'fillers_zh', voice: 'shimmer', casual: true, script: '呃，你能把昨天会议的，嗯，幻灯片发给我吗？' },

  { id: 'en-plain', group: 'plain', voice: 'echo', script: 'Please send the quarterly report to the finance team before Friday afternoon.' },
  { id: 'zh-plain', group: 'plain', voice: 'coral', script: '请把这份季度报告发给财务部门，周五之前要完成。' },

  { id: 'hi-plain', group: 'hindi', voice: 'alloy', script: 'मुझे लगता है कि हमें अगले हफ्ते मीटिंग करनी चाहिए।' },
  { id: 'hi-mixed', group: 'hindi', voice: 'nova', script: 'मुझे लगता है कि हमें PostgreSQL use करना चाहिए, because it is more reliable.' },
]
