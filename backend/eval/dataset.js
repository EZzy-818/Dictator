// Milestone 7 evaluation set: 31 scripts in the roadmap's six categories.
//
// Each case:
//   id          File name of the recording (.eval-samples/<source>/<id>.<ext>).
//   category    Roadmap category.
//   metric      'wer' (English), 'cer' (Chinese) or 'mixed' (CER plus mixed-token error rate).
//   script      What the speaker says. It is also the expected raw transcript.
//   accept      Other written forms of the same speech that count as correct
//               (for example "3 PM" and "three PM"). The closest one is scored.
//   terms       Proper nouns, numbers and technical terms. Each entry lists the
//               accepted spellings; the raw transcript should contain one of them,
//               and the refined text must keep any the raw transcript contains.
//   refined     expected: the intended refined text (a guide for review; other
//               wordings can be fine). include: groups of accepted spellings the
//               refined text must contain. exclude: text the refined text must
//               not contain (the part a self-correction replaced). mayDrop: terms the
//               refined text may leave out because the correction replaced them.
//   correction  true when the speaker corrects themselves, so a value is meant to change.
//   noiseSnrDb  For synthetic samples, pink noise is mixed in at this signal-to-noise
//               ratio. For your own recordings, record these with background noise.

export const CATEGORIES = {
  en_normal: 'English normal speech',
  en_corrections: 'English corrections and fillers',
  zh_normal: 'Mandarin normal speech',
  zh_corrections: 'Mandarin corrections and fillers',
  mixed: 'Mixed Chinese-English speech',
  special: 'Numbers, dates, names, technical terms, and noise',
}

export const CASES = [
  // English normal speech
  {
    id: 'en-normal-1',
    category: 'en_normal',
    metric: 'wer',
    script: 'Please send the quarterly report to the finance team before Friday afternoon.',
    terms: [['Friday']],
  },
  {
    id: 'en-normal-2',
    category: 'en_normal',
    metric: 'wer',
    script: 'The new onboarding flow made it much easier for customers to find the settings page.',
  },
  {
    id: 'en-normal-3',
    category: 'en_normal',
    metric: 'wer',
    script: "I'd like to schedule a short call with the design team to go over the mobile layout.",
  },
  {
    id: 'en-normal-4',
    category: 'en_normal',
    metric: 'wer',
    script: 'Our main goal for this sprint is to improve the search results and fix the login bugs.',
  },
  {
    id: 'en-normal-5',
    category: 'en_normal',
    metric: 'wer',
    script: 'Can you check whether the latest build passed all of the integration tests?',
  },

  // English corrections and fillers
  {
    id: 'en-corrections-1',
    category: 'en_corrections',
    metric: 'wer',
    script: 'Um, I think we should, uh, start the migration tomorrow morning.',
    refined: { expected: 'I think we should start the migration tomorrow morning.' },
  },
  {
    id: 'en-corrections-2',
    category: 'en_corrections',
    metric: 'wer',
    script: "Let's meet on Tuesday, actually no, Wednesday at three PM.",
    accept: ["Let's meet on Tuesday, actually no, Wednesday at 3 PM.", "Let's meet on Tuesday, actually no, Wednesday at 3PM."],
    correction: true,
    terms: [['Wednesday']],
    refined: {
      expected: "Let's meet on Wednesday at 3 PM.",
      include: [['Wednesday'], ['3 PM', '3 p.m.', '3PM', '3pm', 'three PM', 'three p.m.', '3:00']],
      exclude: ['Tuesday'],
    },
  },
  {
    id: 'en-corrections-3',
    category: 'en_corrections',
    metric: 'wer',
    script: 'The deadline is the end of May, sorry, I mean the end of June.',
    correction: true,
    refined: { expected: 'The deadline is the end of June.', include: [['June']], exclude: ['May'] },
  },
  {
    id: 'en-corrections-4',
    category: 'en_corrections',
    metric: 'wer',
    script: "Uh, can you send me the, um, the slides from yesterday's meeting?",
    refined: { expected: "Can you send me the slides from yesterday's meeting?" },
  },
  {
    id: 'en-corrections-5',
    category: 'en_corrections',
    metric: 'wer',
    script: 'We need three new servers, no wait, four new servers for the launch.',
    accept: ['We need 3 new servers, no wait, 4 new servers for the launch.'],
    correction: true,
    refined: {
      expected: 'We need four new servers for the launch.',
      include: [['four', '4']],
      exclude: ['three', '3'],
    },
  },

  // Mandarin normal speech
  {
    id: 'zh-normal-1',
    category: 'zh_normal',
    metric: 'cer',
    script: '请把这份季度报告发给财务部门，周五之前要完成。',
    terms: [['周五']],
  },
  {
    id: 'zh-normal-2',
    category: 'zh_normal',
    metric: 'cer',
    script: '新的注册流程让用户更容易找到设置页面。',
  },
  {
    id: 'zh-normal-3',
    category: 'zh_normal',
    metric: 'cer',
    script: '我想和设计团队约一个简短的会议，讨论一下手机端的布局。',
  },
  {
    id: 'zh-normal-4',
    category: 'zh_normal',
    metric: 'cer',
    script: '这个迭代的主要目标是改进搜索结果和修复登录问题。',
  },
  {
    id: 'zh-normal-5',
    category: 'zh_normal',
    metric: 'cer',
    script: '你能帮我看一下最新的版本有没有通过所有的测试吗？',
  },

  // Mandarin corrections and fillers
  {
    id: 'zh-corrections-1',
    category: 'zh_corrections',
    metric: 'cer',
    script: '嗯，我觉得我们，呃，明天上午可以开始迁移。',
    refined: { expected: '我觉得我们明天上午可以开始迁移。' },
  },
  {
    id: 'zh-corrections-2',
    category: 'zh_corrections',
    metric: 'cer',
    script: '我们下周二开会，不对，应该是下周三下午三点。',
    accept: ['我们下周二开会，不对，应该是下周三下午3点。'],
    correction: true,
    terms: [['周三']],
    refined: {
      expected: '我们下周三下午三点开会。',
      include: [['周三'], ['三点', '3点', '3:00', '15点', '十五点']],
      exclude: ['周二'],
    },
  },
  {
    id: 'zh-corrections-3',
    category: 'zh_corrections',
    metric: 'cer',
    script: '截止日期是五月底，不好意思，我是说六月底。',
    accept: ['截止日期是5月底，不好意思，我是说6月底。'],
    correction: true,
    refined: { expected: '截止日期是六月底。', include: [['六月', '6月']], exclude: ['五月', '5月'] },
  },
  {
    id: 'zh-corrections-4',
    category: 'zh_corrections',
    metric: 'cer',
    script: '呃，你能把昨天会议的那个，嗯，那个幻灯片发给我吗？',
    refined: { expected: '你能把昨天会议的幻灯片发给我吗？' },
  },
  {
    id: 'zh-corrections-5',
    category: 'zh_corrections',
    metric: 'cer',
    script: '我们需要三台新服务器，哦不，是四台新服务器。',
    accept: ['我们需要3台新服务器，哦不，是4台新服务器。'],
    correction: true,
    refined: { expected: '我们需要四台新服务器。', include: [['四台', '4台']], exclude: ['三台', '3台'] },
  },

  // Mixed Chinese-English speech
  {
    id: 'mixed-1',
    category: 'mixed',
    metric: 'mixed',
    script: '我觉得这个 backend 应该用 Python，但是 frontend 还是用 React 比较好。',
    terms: [['backend', 'back-end', 'back end'], ['Python'], ['frontend', 'front-end', 'front end'], ['React']],
  },
  {
    id: 'mixed-2',
    category: 'mixed',
    metric: 'mixed',
    script: '明天的 meeting 改到下午两点，记得带上你的 laptop。',
    accept: ['明天的 meeting 改到下午2点，记得带上你的 laptop。'],
    terms: [['meeting'], ['两点', '2点', '2:00', '14点'], ['laptop']],
  },
  {
    id: 'mixed-3',
    category: 'mixed',
    metric: 'mixed',
    script: '这个 bug 是因为 API 返回的 JSON 格式不对。',
    terms: [['bug'], ['API'], ['JSON']],
  },
  {
    id: 'mixed-4',
    category: 'mixed',
    metric: 'mixed',
    script: 'We should use MySQL, 不对，PostgreSQL would be better.',
    correction: true,
    terms: [['MySQL'], ['PostgreSQL', 'Postgres']],
    refined: {
      expected: 'We should use PostgreSQL instead of MySQL.',
      include: [['PostgreSQL', 'Postgres']],
      exclude: ['use MySQL', '不对'],
      mayDrop: ['MySQL'],
    },
  },
  {
    id: 'mixed-5',
    category: 'mixed',
    metric: 'mixed',
    script: '我觉得我们应该用 MongoDB，不对，还是 PostgreSQL 比较好，因为我们需要 relational data。',
    correction: true,
    terms: [['MongoDB'], ['PostgreSQL', 'Postgres'], ['relational data']],
    refined: {
      expected: '我觉得我们还是应该用 PostgreSQL，因为我们需要 relational data。',
      include: [['PostgreSQL', 'Postgres'], ['relational data']],
      exclude: ['用 MongoDB', '用MongoDB', '不对'],
      mayDrop: ['MongoDB'],
    },
  },

  // Numbers, dates, names, technical terms, and noise
  {
    id: 'special-1',
    category: 'special',
    metric: 'wer',
    script: 'The invoice total is $1,250, and it is due on March 15th, 2027.',
    accept: ['The invoice total is $1,250, and it is due on March 15, 2027.', 'The invoice total is 1,250 dollars, and it is due on March 15th, 2027.'],
    terms: [['1,250', '1250'], ['March 15th', 'March 15'], ['2027']],
  },
  {
    id: 'special-2',
    category: 'special',
    metric: 'wer',
    script: 'Sarah Chen from Stripe asked us to upgrade Kubernetes to version 1.31 and enable OAuth.',
    terms: [['Sarah Chen'], ['Stripe'], ['Kubernetes'], ['1.31'], ['OAuth']],
  },
  {
    id: 'special-3',
    category: 'special',
    metric: 'cer',
    script: '会议定在2027年3月15日上午10点半，预算是两万五千元。',
    accept: [
      '会议定在2027年3月15日上午10点半，预算是25000元。',
      '会议定在2027年3月15日上午10:30，预算是两万五千元。',
      '会议定在2027年3月15日上午10:30，预算是25000元。',
    ],
    terms: [['2027年'], ['3月15日'], ['10点半', '十点半', '10:30'], ['两万五千', '25000', '25,000', '2.5万']],
  },
  {
    id: 'special-4',
    category: 'special',
    metric: 'mixed',
    script: '请把 GitHub 上的 pull request 发给王伟，他会用 TypeScript 重写这个 module。',
    terms: [['GitHub'], ['pull request', 'PR'], ['王伟'], ['TypeScript'], ['module']],
  },
  {
    id: 'special-5',
    category: 'special',
    metric: 'wer',
    script: 'Please remind Daniel to renew the AWS certificate before October 3rd.',
    accept: ['Please remind Daniel to renew the AWS certificate before October 3.', 'Please remind Daniel to renew the AWS certificate before October third.'],
    terms: [['Daniel'], ['AWS'], ['October 3rd', 'October 3', 'October third']],
    noiseSnrDb: 10,
  },
  {
    id: 'special-6',
    category: 'special',
    metric: 'cer',
    script: '请提醒李娜在十月三号之前更新服务器证书。',
    accept: ['请提醒李娜在10月3号之前更新服务器证书。', '请提醒李娜在10月3日之前更新服务器证书。'],
    terms: [['李娜'], ['十月三号', '10月3号', '10月3日', '十月三日']],
    noiseSnrDb: 10,
  },
]
