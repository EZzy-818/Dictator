// Model optimization benchmark set: 36 scripts, 4 language groups × 3 lengths (about 5, 15 and
// 30 seconds of speech) × 3 scripts. See docs/model-benchmark.md.
//
// Each case:
//   id          File name of the recording (.eval-samples/<source>/models/<id>.<ext>).
//   group       'en', 'zh', 'hi' or 'mixed' (English and Mandarin in one recording).
//   length      Target length in seconds; the measured length is reported.
//   voice       Text-to-speech voice for the synthetic recording.
//   script      What the speaker says, word for word: the reference transcript. For synthetic
//               samples it is the exact text sent to text-to-speech.
//   equiv       Groups of written forms that mean the same spoken words ("3 PM", "three PM").
//               The first of each group is canonical; the others are rewritten to it in both
//               the reference and the hypothesis before scoring.
//   entities    Names, technical terms, numbers, dates and negations that must survive, by type.
//               Each lists its accepted written forms.
//   correction  An explicit self-correction: the retracted words and the replacement. The
//               refined text must contain the replacement and none of the `drop` strings.
//   expected    The intended refined text, for human review only (other wordings can be right).

export const GROUPS = { en: 'English', zh: 'Mandarin', hi: 'Hindi', mixed: 'Mixed English–Mandarin' }
export const ENTITY_TYPES = ['name', 'term', 'number', 'date', 'negation']

const VOICES = { en: ['alloy', 'ash'], zh: ['nova', 'shimmer'], hi: ['coral', 'sage'], mixed: ['nova', 'shimmer'] }

const e = (type, ...forms) => ({ type, forms })

const RAW_CASES = [
  // English
  {
    id: 'en-5-a',
    script: 'Um, send the invoice to Priya by Friday.',
    entities: [e('name', 'Priya'), e('date', 'Friday')],
    expected: 'Send the invoice to Priya by Friday.',
  },
  {
    id: 'en-5-b',
    script: "Let's meet Tuesday, actually Wednesday, at 3 PM.",
    equiv: [['3 pm', 'three pm', '3:00 pm', '3pm', '3 p.m.']],
    entities: [e('date', 'Wednesday'), e('number', '3 PM', 'three PM', '3:00 PM', '3pm', '3 p.m.')],
    correction: { retracted: 'Tuesday', replacement: ['Wednesday'], drop: ['Tuesday'] },
    expected: "Let's meet Wednesday at 3 PM.",
  },
  {
    id: 'en-5-c',
    script: "Please don't merge the Redis migration yet.",
    entities: [e('negation', "don't", 'do not'), e('term', 'Redis')],
    expected: "Please don't merge the Redis migration yet.",
  },
  {
    id: 'en-15-a',
    script:
      'So, uh, the Kubernetes cluster ran out of memory twice last night, and I think we need to bump the node size to sixteen gigabytes before the launch on March 12th.',
    equiv: [['16 gigabytes', 'sixteen gigabytes', '16 gb', '16gb'], ['march 12th', 'march 12', 'march twelfth']],
    entities: [
      e('term', 'Kubernetes'),
      e('number', '16 gigabytes', 'sixteen gigabytes', '16 GB', '16GB'),
      e('date', 'March 12th', 'March 12', 'March twelfth'),
    ],
    expected:
      'The Kubernetes cluster ran out of memory twice last night, and I think we need to bump the node size to 16 GB before the launch on March 12th.',
  },
  {
    id: 'en-15-b',
    script:
      "Hi Marcus, I reviewed the pull request for the payment service. It looks good overall, but the retry logic should use exponential backoff, and we shouldn't log the full card number.",
    entities: [e('name', 'Marcus'), e('term', 'exponential backoff'), e('term', 'pull request', 'PR'), e('negation', "shouldn't", 'should not')],
    expected:
      "Hi Marcus, I reviewed the pull request for the payment service. It looks good overall, but the retry logic should use exponential backoff, and we shouldn't log the full card number.",
  },
  {
    id: 'en-15-c',
    script:
      'The demo is on Thursday at ten, no wait, eleven thirty, in the Hudson conference room. Bring the latest build and, um, the slides from Elena.',
    equiv: [['11:30', 'eleven thirty', '1130'], ['10', 'ten']],
    entities: [e('date', 'Thursday'), e('number', '11:30', 'eleven thirty'), e('name', 'Hudson'), e('name', 'Elena')],
    correction: { retracted: 'ten', replacement: ['11:30', 'eleven thirty'], drop: ['at ten', 'at 10', '10:00'] },
    expected: 'The demo is on Thursday at 11:30 in the Hudson conference room. Bring the latest build and the slides from Elena.',
  },
  {
    id: 'en-30-a',
    script:
      "Okay, so here's the update on the mobile app. Um, the iOS build passed review yesterday, and the Android build is still waiting on the store. We fixed forty two bugs this sprint, and the crash rate dropped to under one percent. Uh, the analytics dashboard is late because the data team is short on people, so I asked Daniel to help them out until the twentieth. The launch is still planned for the first week of June, as long as nothing new comes up.",
    equiv: [['42', 'forty two', 'forty-two'], ['1', 'one'], ['20th', 'twentieth', '20']],
    entities: [
      e('term', 'iOS'),
      e('term', 'Android'),
      e('number', '42', 'forty two', 'forty-two'),
      e('number', 'one percent', '1%', '1 percent'),
      e('name', 'Daniel'),
      e('date', 'twentieth', '20th'),
      e('date', 'June'),
      e('negation', 'nothing'),
    ],
    expected:
      "Here's the update on the mobile app. The iOS build passed review yesterday, and the Android build is still waiting on the store. We fixed 42 bugs this sprint, and the crash rate dropped to under 1%. The analytics dashboard is late because the data team is short on people, so I asked Daniel to help them until the 20th. The launch is still planned for the first week of June, as long as nothing new comes up.",
  },
  {
    id: 'en-30-b',
    script:
      "Okay, so for the API redesign, uh, we're moving from REST to GraphQL for the mobile client only. The web app keeps the current endpoints for now. Latency on the search endpoint is around four hundred fifty milliseconds at p95, and the target is under two hundred. Jordan will own the schema, and, um, Aisha will handle the caching layer with Redis. We are not changing the authentication flow in this phase.",
    equiv: [['450', 'four hundred fifty', 'four hundred and fifty'], ['200', 'two hundred'], ['p95', 'p 95', 'p ninety five', 'p ninety-five']],
    entities: [
      e('term', 'REST'),
      e('term', 'GraphQL'),
      e('number', '450', 'four hundred fifty', 'four hundred and fifty'),
      e('term', 'p95', 'p 95', 'P95'),
      e('number', '200', 'two hundred'),
      e('name', 'Jordan'),
      e('name', 'Aisha'),
      e('term', 'Redis'),
      e('negation', 'not changing', "aren't changing"),
    ],
    expected:
      "For the API redesign, we're moving from REST to GraphQL for the mobile client only. The web app keeps the current endpoints for now. Latency on the search endpoint is around 450 ms at p95, and the target is under 200. Jordan will own the schema, and Aisha will handle the caching layer with Redis. We are not changing the authentication flow in this phase.",
  },
  {
    id: 'en-30-c',
    script:
      "Hey team, quick reminder that the quarterly planning offsite is on May eighth, sorry, May ninth, in Denver. Flights should be booked by the end of this week, and the budget is six hundred dollars per person. If you can't make it, let Rachel know by Monday so she can update the headcount. Uh, we'll cover the product roadmap in the morning and the hiring plan in the afternoon. Please don't share the agenda outside the team yet.",
    equiv: [['may 9th', 'may ninth', 'may 9'], ['may 8th', 'may eighth', 'may 8'], ['600', 'six hundred']],
    entities: [
      e('date', 'May 9th', 'May 9', 'May ninth'),
      e('name', 'Denver'),
      e('number', '600', 'six hundred'),
      e('name', 'Rachel'),
      e('date', 'Monday'),
      e('negation', "can't", 'cannot'),
      e('negation', "don't", 'do not'),
    ],
    correction: { retracted: 'May eighth', replacement: ['May 9th', 'May 9', 'May ninth'], drop: ['May 8th', 'May 8', 'May eighth'] },
    expected:
      "Hey team, quick reminder that the quarterly planning offsite is on May 9th in Denver. Flights should be booked by the end of this week, and the budget is $600 per person. If you can't make it, let Rachel know by Monday so she can update the headcount. We'll cover the product roadmap in the morning and the hiring plan in the afternoon. Please don't share the agenda outside the team yet.",
  },

  // Mandarin
  {
    id: 'zh-5-a',
    script: '嗯，明天下午三点开会。',
    equiv: [['三点', '3点', '3:00', '15点']],
    entities: [e('date', '明天'), e('number', '三点', '3点', '3:00')],
    expected: '明天下午三点开会。',
  },
  {
    id: 'zh-5-b',
    script: '我们周二，不对，周三上线。',
    entities: [e('date', '周三', '星期三')],
    correction: { retracted: '周二', replacement: ['周三', '星期三'], drop: ['周二', '星期二'] },
    expected: '我们周三上线。',
  },
  {
    id: 'zh-5-c',
    script: '这个版本先不要发布。',
    entities: [e('negation', '不要')],
    expected: '这个版本先不要发布。',
  },
  {
    id: 'zh-15-a',
    script: '呃，张伟刚才说服务器的内存已经用到百分之九十了，我觉得我们这周五之前需要扩容，不然下周的活动可能会出问题。',
    equiv: [['百分之九十', '90%', '九成']],
    entities: [e('name', '张伟'), e('number', '百分之九十', '90%'), e('date', '周五', '星期五'), e('negation', '不然')],
    expected: '张伟刚才说服务器的内存已经用到百分之九十了，我觉得我们这周五之前需要扩容，不然下周的活动可能会出问题。',
  },
  {
    id: 'zh-15-b',
    script: '请把合同发给李娜，金额是两万五千元，付款时间是下个月十号，记得抄送财务部。',
    equiv: [['两万五千', '25000', '2.5万', '二万五千', '25,000'], ['十号', '10号', '10日', '十日']],
    entities: [e('name', '李娜'), e('number', '两万五千', '25000', '2.5万', '25,000'), e('date', '十号', '10号', '10日'), e('term', '财务部')],
    expected: '请把合同发给李娜，金额是两万五千元，付款时间是下个月十号，记得抄送财务部。',
  },
  {
    id: 'zh-15-c',
    script: '那个，新的登录页面我们用红色，我是说蓝色，因为用户测试的时候大家觉得红色太刺眼了。',
    entities: [e('term', '登录页面'), e('term', '蓝色')],
    correction: { retracted: '红色', replacement: ['蓝色'], drop: ['用红色'] },
    expected: '新的登录页面我们用蓝色，因为用户测试的时候大家觉得红色太刺眼了。',
  },
  {
    id: 'zh-30-a',
    script:
      '好的，我说一下这周的进度。嗯，新版本的设计稿已经全部确认了，开发团队周一，不对，周二开始写代码。目前最大的风险是第三方支付接口，对方说文档要下周才能给我们。如果拿到得晚，我们可能需要把上线时间往后推一周。呃，另外测试环境的服务器下周四会停机维护两个小时，大家提前安排好工作。',
    equiv: [['两个小时', '2个小时', '2小时', '两小时']],
    entities: [
      e('date', '周二', '星期二'),
      e('term', '第三方支付接口', '第三方支付'),
      e('date', '周四', '星期四'),
      e('number', '两个小时', '2个小时', '2小时', '两小时'),
      e('term', '测试环境'),
    ],
    correction: { retracted: '周一', replacement: ['周二', '星期二'], drop: ['周一', '星期一'] },
    expected:
      '我说一下这周的进度。新版本的设计稿已经全部确认了，开发团队周二开始写代码。目前最大的风险是第三方支付接口，对方说文档要下周才能给我们。如果拿到得晚，我们可能需要把上线时间往后推一周。另外，测试环境的服务器下周四会停机维护两个小时，大家提前安排好工作。',
  },
  {
    id: 'zh-30-b',
    script:
      '关于数据库迁移，我们决定先把用户表迁到新的集群，订单表等到双十一之后再迁。嗯，迁移窗口定在凌晨两点到四点，预计影响不超过十分钟。王磊负责回滚方案，陈静负责监控和告警。迁移之前一定要做完整备份，没有备份的话不能开始。',
    equiv: [['两点', '2点', '2:00'], ['四点', '4点', '4:00'], ['十分钟', '10分钟'], ['双十一', '双11', '11.11']],
    entities: [
      e('term', '数据库迁移'),
      e('term', '集群'),
      e('date', '双十一', '双11'),
      e('number', '两点', '2点', '2:00'),
      e('number', '四点', '4点', '4:00'),
      e('number', '十分钟', '10分钟'),
      e('name', '王磊'),
      e('name', '陈静'),
      e('negation', '不能'),
    ],
    expected:
      '关于数据库迁移，我们决定先把用户表迁到新的集群，订单表等到双十一之后再迁。迁移窗口定在凌晨两点到四点，预计影响不超过十分钟。王磊负责回滚方案，陈静负责监控和告警。迁移之前一定要做完整备份，没有备份的话不能开始。',
  },
  {
    id: 'zh-30-c',
    script:
      '今天的会议主要讨论了三件事。第一，下个季度的预算增加百分之十五。第二，招聘计划从五个人调整到七个人，呃，不对，调整到八个人。第三，办公室搬迁推迟到明年三月。刘洋会在周五之前把会议纪要发给大家，有问题的话直接找他，不用再单独开会了。',
    equiv: [['百分之十五', '15%'], ['八个人', '8个人', '8人'], ['七个人', '7个人', '7人'], ['五个人', '5个人', '5人'], ['三月', '3月'], ['三件事', '3件事']],
    entities: [
      e('number', '百分之十五', '15%'),
      e('number', '八个人', '8个人', '8人'),
      e('date', '三月', '3月'),
      e('name', '刘洋'),
      e('date', '周五', '星期五'),
      e('negation', '不用'),
    ],
    correction: { retracted: '七个人', replacement: ['八个人', '8个人', '8人'], drop: ['七个人', '7个人', '7人'] },
    expected:
      '今天的会议主要讨论了三件事。第一，下个季度的预算增加百分之十五。第二，招聘计划从五个人调整到八个人。第三，办公室搬迁推迟到明年三月。刘洋会在周五之前把会议纪要发给大家，有问题的话直接找他，不用再单独开会了。',
  },

  // Hindi
  {
    id: 'hi-5-a',
    script: 'उम्म, कल सुबह दस बजे मीटिंग है।',
    equiv: [['दस बजे', '10 बजे', '10:00 बजे']],
    entities: [e('date', 'कल'), e('number', 'दस बजे', '10 बजे')],
    expected: 'कल सुबह दस बजे मीटिंग है।',
  },
  {
    id: 'hi-5-b',
    script: 'हम सोमवार, नहीं मतलब मंगलवार को लॉन्च करेंगे।',
    entities: [e('date', 'मंगलवार')],
    correction: { retracted: 'सोमवार', replacement: ['मंगलवार'], drop: ['सोमवार'] },
    expected: 'हम मंगलवार को लॉन्च करेंगे।',
  },
  {
    id: 'hi-5-c',
    script: 'अभी यह फ़ाइल किसी को मत भेजना।',
    entities: [e('negation', 'मत', 'न')],
    expected: 'अभी यह फ़ाइल किसी को मत भेजना।',
  },
  {
    id: 'hi-15-a',
    script: 'राहुल ने बताया कि सर्वर का बिल पिछले महीने बीस प्रतिशत बढ़ गया है, इसलिए हमें शुक्रवार तक खर्च की समीक्षा करनी होगी।',
    equiv: [['बीस प्रतिशत', '20 प्रतिशत', '20%', 'बीस परसेंट', '20 परसेंट']],
    entities: [e('name', 'राहुल'), e('term', 'सर्वर'), e('number', 'बीस प्रतिशत', '20 प्रतिशत', '20%', '20 परसेंट', 'बीस परसेंट'), e('date', 'शुक्रवार')],
    expected: 'राहुल ने बताया कि सर्वर का बिल पिछले महीने बीस प्रतिशत बढ़ गया है, इसलिए हमें शुक्रवार तक खर्च की समीक्षा करनी होगी।',
  },
  {
    id: 'hi-15-b',
    script: 'अं, कृपया प्रिया को रिपोर्ट भेज दीजिए और उन्हें बताइए कि डेडलाइन पंद्रह मार्च है, लेकिन बजट अभी फ़ाइनल नहीं हुआ है।',
    equiv: [['पंद्रह मार्च', '15 मार्च']],
    entities: [e('name', 'प्रिया'), e('date', 'पंद्रह मार्च', '15 मार्च'), e('term', 'डेडलाइन'), e('negation', 'नहीं')],
    expected: 'कृपया प्रिया को रिपोर्ट भेज दीजिए और उन्हें बताइए कि डेडलाइन पंद्रह मार्च है, लेकिन बजट अभी फ़ाइनल नहीं हुआ है।',
  },
  {
    id: 'hi-15-c',
    script: 'नया डिज़ाइन हरे रंग में होगा, सॉरी, नीले रंग में, क्योंकि ब्रांड गाइडलाइन में यही लिखा है।',
    entities: [e('term', 'नीले'), e('term', 'ब्रांड गाइडलाइन', 'ब्रांड गाइडलाइंस')],
    correction: { retracted: 'हरे', replacement: ['नीले'], drop: ['हरे'] },
    expected: 'नया डिज़ाइन नीले रंग में होगा, क्योंकि ब्रांड गाइडलाइन में यही लिखा है।',
  },
  {
    id: 'hi-30-a',
    script:
      'ठीक है, तो इस हफ़्ते का अपडेट देता हूँ। उम्म, नए ऐप का डिज़ाइन पूरा हो चुका है और डेवलपर्स ने सोमवार से कोडिंग शुरू कर दी है। सबसे बड़ा जोखिम पेमेंट गेटवे है, क्योंकि उनकी टीम ने अभी तक डॉक्यूमेंटेशन नहीं भेजा है। अगर अगले हफ़्ते तक जवाब नहीं आया, तो हमें लॉन्च एक हफ़्ता आगे बढ़ाना पड़ेगा। अमित टेस्टिंग संभालेगा और सीमा क्लाइंट से बात करेगी।',
    entities: [
      e('date', 'सोमवार'),
      e('term', 'पेमेंट गेटवे'),
      e('term', 'डॉक्यूमेंटेशन'),
      e('negation', 'नहीं भेजा'),
      e('negation', 'नहीं आया'),
      e('name', 'अमित'),
      e('name', 'सीमा'),
    ],
    expected:
      'तो इस हफ़्ते का अपडेट देता हूँ। नए ऐप का डिज़ाइन पूरा हो चुका है और डेवलपर्स ने सोमवार से कोडिंग शुरू कर दी है। सबसे बड़ा जोखिम पेमेंट गेटवे है, क्योंकि उनकी टीम ने अभी तक डॉक्यूमेंटेशन नहीं भेजा है। अगर अगले हफ़्ते तक जवाब नहीं आया, तो हमें लॉन्च एक हफ़्ता आगे बढ़ाना पड़ेगा। अमित टेस्टिंग संभालेगा और सीमा क्लाइंट से बात करेगी।',
  },
  {
    id: 'hi-30-b',
    script:
      'डेटाबेस माइग्रेशन के बारे में, हमने तय किया है कि पहले यूज़र टेबल को नए सर्वर पर ले जाएँगे। माइग्रेशन रात दो बजे से चार बजे के बीच होगा और लगभग दस मिनट तक सर्विस बंद रहेगी। उम्म, माइग्रेशन से पहले पूरा बैकअप लेना ज़रूरी है, बिना बैकअप के काम शुरू नहीं होगा। विकास रोलबैक प्लान बनाएगा।',
    equiv: [['दो बजे', '2 बजे'], ['चार बजे', '4 बजे'], ['दस मिनट', '10 मिनट']],
    entities: [
      e('term', 'डेटाबेस माइग्रेशन', 'डेटाबेस'),
      e('number', 'दो बजे', '2 बजे', 'रात दो', 'रात 2'),
      e('number', 'चार बजे', '4 बजे'),
      e('number', 'दस मिनट', '10 मिनट'),
      e('term', 'बैकअप'),
      e('negation', 'नहीं होगा'),
      e('name', 'विकास'),
      e('term', 'रोलबैक'),
    ],
    expected:
      'डेटाबेस माइग्रेशन के बारे में, हमने तय किया है कि पहले यूज़र टेबल को नए सर्वर पर ले जाएँगे। माइग्रेशन रात दो बजे से चार बजे के बीच होगा और लगभग दस मिनट तक सर्विस बंद रहेगी। माइग्रेशन से पहले पूरा बैकअप लेना ज़रूरी है, बिना बैकअप के काम शुरू नहीं होगा। विकास रोलबैक प्लान बनाएगा।',
  },
  {
    id: 'hi-30-c',
    script:
      'आज की मीटिंग में तीन बातें तय हुईं। पहली, अगली तिमाही का बजट दस प्रतिशत बढ़ेगा। दूसरी, हम चार लोगों को, नहीं मतलब छह लोगों को हायर करेंगे। तीसरी, ऑफ़िस शिफ़्ट अब अगले साल अप्रैल में होगा। नेहा शुक्रवार तक सबको मीटिंग के नोट्स भेज देगी, अलग से मीटिंग करने की ज़रूरत नहीं है।',
    equiv: [['दस प्रतिशत', '10 प्रतिशत', '10%'], ['छह लोगों', 'छः लोगों', '6 लोगों'], ['चार लोगों', '4 लोगों'], ['तीन बातें', '3 बातें']],
    entities: [
      e('number', 'दस प्रतिशत', '10 प्रतिशत', '10%'),
      e('number', 'छह', 'छः', '6'),
      e('date', 'अप्रैल'),
      e('name', 'नेहा'),
      e('date', 'शुक्रवार'),
      e('negation', 'ज़रूरत नहीं', 'जरूरत नहीं'),
    ],
    correction: { retracted: 'चार लोगों', replacement: ['छह', 'छः', '6'], drop: ['चार लोगों', '4 लोगों'] },
    expected:
      'आज की मीटिंग में तीन बातें तय हुईं। पहली, अगली तिमाही का बजट दस प्रतिशत बढ़ेगा। दूसरी, हम छह लोगों को हायर करेंगे। तीसरी, ऑफ़िस शिफ़्ट अब अगले साल अप्रैल में होगा। नेहा शुक्रवार तक सबको मीटिंग के नोट्स भेज देगी, अलग से मीटिंग करने की ज़रूरत नहीं है।',
  },

  // Mixed English–Mandarin
  {
    id: 'mixed-5-a',
    script: '这个 bug 我明天 fix 一下。',
    entities: [e('term', 'bug'), e('term', 'fix'), e('date', '明天')],
    expected: '这个 bug 我明天 fix 一下。',
  },
  {
    id: 'mixed-5-b',
    script: '我们用 MySQL，不对，PostgreSQL。',
    equiv: [['postgresql', 'postgres sql', 'postgre sql']],
    entities: [e('term', 'PostgreSQL', 'Postgres')],
    correction: { retracted: 'MySQL', replacement: ['PostgreSQL', 'Postgres'], drop: ['MySQL'] },
    expected: '我们用 PostgreSQL。',
  },
  {
    id: 'mixed-5-c',
    script: "Don't push 到 main branch，先开 PR。",
    entities: [e('negation', "Don't", 'do not', '不要'), e('term', 'main branch', 'main'), e('term', 'PR', 'pull request')],
    expected: "Don't push 到 main branch，先开 PR。",
  },
  {
    id: 'mixed-15-a',
    script: '我觉得我们应该用 PostgreSQL，because it handles relational data better，而且 team 里大家都比较熟。',
    equiv: [['postgresql', 'postgres sql', 'postgre sql']],
    entities: [e('term', 'PostgreSQL', 'Postgres'), e('term', 'relational data'), e('term', 'team')],
    expected: '我觉得我们应该用 PostgreSQL，because it handles relational data better，而且 team 里大家都比较熟。',
  },
  {
    id: 'mixed-15-b',
    script: '嗯，今天的 standup 我们主要 sync 一下 sprint progress，然后 Kevin 会 demo 一下新的 dashboard。',
    equiv: [['standup', 'stand up', 'stand-up']],
    entities: [e('term', 'standup', 'stand-up', 'stand up'), e('term', 'sprint'), e('name', 'Kevin'), e('term', 'dashboard'), e('term', 'demo')],
    expected: '今天的 standup 我们主要 sync 一下 sprint progress，然后 Kevin 会 demo 一下新的 dashboard。',
  },
  {
    id: 'mixed-15-c',
    script: 'So basically, I think we should 先把 login page 做完, and then we can move on to the dashboard, 呃, 最晚周四，不对，周五之前。',
    entities: [e('term', 'login page'), e('term', 'dashboard'), e('date', '周五', '星期五')],
    correction: { retracted: '周四', replacement: ['周五', '星期五'], drop: ['周四', '星期四'] },
    expected: 'I think we should 先把 login page 做完, and then we can move on to the dashboard, 最晚周五之前。',
  },
  {
    id: 'mixed-30-a',
    script:
      '好的，那个，我说一下 deployment 的计划。我们 Thursday，actually no，Friday 晚上十点开始 deploy，预计 downtime 不超过 fifteen minutes。Backend 由 Alex 负责，frontend 由小王负责。如果 error rate 超过百分之二，就直接 rollback，不要等。',
    equiv: [['十点', '10点', '10:00'], ['15 minutes', 'fifteen minutes', '15 mins', '15分钟'], ['百分之二', '2%']],
    entities: [
      e('term', 'deployment', 'deploy'),
      e('date', 'Friday'),
      e('number', '十点', '10点', '10:00'),
      e('number', 'fifteen minutes', '15 minutes', '15 mins', '15分钟'),
      e('name', 'Alex'),
      e('name', '小王'),
      e('number', '百分之二', '2%'),
      e('term', 'rollback', 'roll back'),
      e('negation', '不要等'),
      e('negation', '不超过'),
    ],
    correction: { retracted: 'Thursday', replacement: ['Friday'], drop: ['Thursday'] },
    expected:
      '我说一下 deployment 的计划。我们 Friday 晚上十点开始 deploy，预计 downtime 不超过 fifteen minutes。Backend 由 Alex 负责，frontend 由小王负责。如果 error rate 超过百分之二，就直接 rollback，不要等。',
  },
  {
    id: 'mixed-30-b',
    script:
      '这个 feature 我觉得 we need more time to test it properly，所以 release date 可能要推迟到 next Monday。嗯，QA 那边发现了三个 critical bugs，其中两个跟 payment flow 有关，另外一个是 iOS 上的 crash。我已经跟 Sarah 说了，她会 update 一下 roadmap。',
    equiv: [['三个', '3个', 'three'], ['两个', '2个', 'two']],
    entities: [
      e('term', 'release date'),
      e('date', 'next Monday', 'Monday'),
      e('term', 'QA'),
      e('number', '三个', '3个'),
      e('term', 'critical bugs', 'critical bug'),
      e('term', 'payment flow'),
      e('term', 'iOS'),
      e('name', 'Sarah'),
      e('term', 'roadmap'),
    ],
    expected:
      '这个 feature 我觉得 we need more time to test it properly，所以 release date 可能要推迟到 next Monday。QA 那边发现了三个 critical bugs，其中两个跟 payment flow 有关，另外一个是 iOS 上的 crash。我已经跟 Sarah 说了，她会 update 一下 roadmap。',
  },
  {
    id: 'mixed-30-c',
    script:
      'Okay, quick update on the Shanghai office. 我们下个月要招两个 senior engineers，one for backend and one for data。The budget has been approved，但是 office space 还没有定下来。嗯，Lisa 会在 Wednesday 之前 send out 一个 proposal。We should not announce anything publicly until 合同签完。',
    equiv: [['两个', '2个', 'two']],
    entities: [
      e('name', 'Shanghai', '上海'),
      e('number', '两个', '2个'),
      e('term', 'senior engineers', 'senior engineer'),
      e('term', 'office space'),
      e('name', 'Lisa'),
      e('date', 'Wednesday'),
      e('negation', 'should not', "shouldn't"),
      e('negation', '还没有', '没有'),
    ],
    expected:
      'Okay, quick update on the Shanghai office. 我们下个月要招两个 senior engineers，one for backend and one for data。The budget has been approved，但是 office space 还没有定下来。Lisa 会在 Wednesday 之前 send out 一个 proposal。We should not announce anything publicly until 合同签完。',
  },
]

export const CASES = RAW_CASES.map((testCase) => {
  const [group, length, variant] = testCase.id.split('-')
  const voices = VOICES[group]
  return {
    group,
    length: Number(length),
    voice: voices[(variant.charCodeAt(0) - 97) % voices.length],
    equiv: [],
    entities: [],
    correction: null,
    ...testCase,
  }
})

// The latency set: one recording per language and length, the first script of each cell.
export const LATENCY_CASE_IDS = CASES.filter((c) => c.id.endsWith('-a')).map((c) => c.id)
