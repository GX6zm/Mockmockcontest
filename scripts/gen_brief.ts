// 生成「带上下文的写作说明」给外部写手（Gemini）。
// 用法：node scripts/gen_brief.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { TITLE_CHAINS, APPROACHES } from '../src/chains.ts';
import { POOLS } from '../src/thinking.ts';
import { EVENT_DEFS } from '../src/events.ts';

const out = 'data/text-export';
mkdirSync(out, { recursive: true });

const KIND_LABEL: Record<string, string> = {
  observe: '观察', transform: '转化', structure: '结构', optimize: '优化', corner: '边界',
};

const TITLE_TOPIC: Record<string, string> = {};
// 从 chains 里拿不到 topic，用题名在 game.ts 里的映射太重；这里只标注「题目」。

type Item = {
  key: string;
  location: string;
  when: string;
  limit: number;
  current: string;
  issue: string;
  hint?: string;
};

const batches: { id: string; title: string; why: string; deliver: string; items: Item[] }[] = [];

// ===== 批次 1：事件卡 =====
batches.push({
  id: 'batch-1-events',
  title: '每周事件卡（17 张 → 40 张）',
  why: '教练模式的叙事主体。玩家一季 40 周就会把 17 张全见完，之后每周都是重复。这是玩家感知最强的文字。',
  deliver: '返回同结构的 JSON：现有 17 张只改文字；新增 23 张照字段补全（id 用英文小写下划线）。效果数值不要填，用 effectHint 写一句自然语言，我来配。',
  items: EVENT_DEFS.flatMap((e) => [
    {
      key: `event.${e.id}.title`,
      location: `src/events.ts EVENT_DEFS → ${e.id}`,
      when: '每周排训练前弹出的事件卡标题（一行，加粗显示）',
      limit: 16,
      current: e.title,
      issue: '标题需要一眼看出冲突，现在偏「说明文」。',
      hint: '写成一句冲突/场景名，例如「机房停电那晚」而不是「机房供电问题」。',
    },
    {
      key: `event.${e.id}.text`,
      location: `src/events.ts EVENT_DEFS → ${e.id}`,
      when: '事件卡正文，选手/教练视角的处境描述',
      limit: 80,
      current: e.text,
      issue: '常见「交代背景 → 给出选择」的平铺，缺画面和对话。',
      hint: '至少一个具体细节（时间、地点、动作、一句原话），不要总结。',
    },
    {
      key: `event.${e.id}.quote`,
      location: `src/events.ts EVENT_DEFS → ${e.id}`,
      when: '正文下方的一句话台词，带引号显示',
      limit: 40,
      current: e.quote ?? '',
      issue: '部分台词太像旁白，不像人说出来的。',
      hint: '像学生在微信/机房里真会说的一句，允许不完整、带口头语。',
    },
    ...e.options.map((o, i) => ({
      key: `event.${e.id}.options[${i}]`,
      location: `src/events.ts EVENT_DEFS → ${e.id}.options[${i}]`,
      when: '三个并列选项卡片：label 是按钮主文，note 是小字代价说明',
      limit: 16,
      current: `${o.label}｜${o.note}`,
      issue: '选项要一眼看出代价差异，label 现在偶有两条太像。',
      hint: 'label ≤10 字，note ≤16 字；三条选项的代价方向必须不同（体力 / 关系 / 成绩 / 声望）。',
    })),
    {
      key: `event.${e.id}.log`,
      location: `src/events.ts EVENT_DEFS → ${e.id}`,
      when: '选择后写进「本周插曲」日志的一句话，前面会自动带学生名字',
      limit: 30,
      current: e.log ?? '',
      issue: '日志句容易和正文重复。',
      hint: '写成结果，不写过程；不要以「他」开头（前面已经有名字）。',
    },
  ]),
});

// ===== 批次 2：题目思维链 =====
const chainItems: Item[] = [];
for (const [title, kinds] of Object.entries(TITLE_CHAINS)) {
  for (const [kind, arr] of Object.entries(kinds)) {
    (arr ?? []).forEach((sentence, i) => {
      chainItems.push({
        key: `chains.${title}.${kind}[${i}]`,
        location: `src/chains.ts TITLE_CHAINS → "${title}" → ${kind}`,
        when: kind === 'observe' || kind === 'transform'
          ? '比赛中/赛后复盘，选手某一题的「前期」步骤（读懂题、找性质）'
          : '比赛中/赛后复盘，选手某一题的「后期」步骤（落地、卡复杂度、边界）',
        limit: 40,
        current: sentence,
        issue: '句式重复度高，同类句常以「先…再…」开头；缺具体数字与情绪。',
        hint: `这是${KIND_LABEL[kind] ?? kind}类句子，要能看出这一题的具体难点，不要写成通用建议。`,
      });
    });
  }
}
batches.push({
  id: 'batch-2-chains',
  title: '题目专属思维链（66 题 / 330 句重写）',
  why: '玩家一场比赛会读 4 题 × 5 步 × 若干选手，是全文阅读量最大的部分。术语现在是对的，但读三场就腻。',
  deliver: '返回同结构 JSON，key 不动，只替换字符串；每题 5 类各 1–2 句，允许删掉重复的句子（但每类至少留 1 句）。',
  items: chainItems,
});

// ===== 批次 3：通用句库 + 多解法 =====
const poolItems: Item[] = [];
for (const [topic, kinds] of Object.entries(POOLS)) {
  for (const [kind, arr] of Object.entries(kinds as Record<string, string[]>)) {
    arr.forEach((sentence, i) => {
      poolItems.push({
        key: `pools.${topic}.${kind}[${i}]`,
        location: `src/thinking.ts POOLS → ${topic} → ${kind}`,
        when: '题名不是具体算法时（如「模拟电梯」「排队打水」）使用的通用思维句',
        limit: 30,
        current: sentence,
        issue: '通用句最容易空泛；需要扩到每类 6 句以减少重复。',
        hint: `知识点是 ${topic}，不要绑定具体题目；可写"看数据范围就知道是 X"这类判断。`,
      });
    });
  }
}
const approachItems: Item[] = [];
for (const [topic, list] of Object.entries(APPROACHES)) {
  list.forEach((a, i) => {
    approachItems.push({
      key: `approaches.${topic}[${i}].name`,
      location: `src/chains.ts APPROACHES → ${topic}[${i}]`,
      when: '赛后复盘时显示「这题的正解：X · 也可以 Y」',
      limit: 10,
      current: a.name,
      issue: '解法名要能区分复杂度/实现难度，现在偏笼统。',
      hint: '用 OI 圈常见叫法，如「线段树优化转移」「杜教筛 + 整除分块」。',
    });
    approachItems.push({
      key: `approaches.${topic}[${i}].structure+optimize`,
      location: `src/chains.ts APPROACHES → ${topic}[${i}]`,
      when: '该解法对应的结构步与优化步（两条各 ≤25 字）',
      limit: 50,
      current: `${a.structure}｜${a.optimize}`,
      issue: '两句常写成同一件事。',
      hint: 'structure 说「用什么」，optimize 说「复杂度怎么降下来」；需要新增到每知识点 3 条。',
    });
  });
}
batches.push({
  id: 'batch-3-pools-approaches',
  title: '通用句库（120 → 240 句）+ 多解法（16 → 24 条）',
  why: '通用句库决定「非算法题」的观感；多解法决定赛后复盘的厚度。',
  deliver: '返回同结构 JSON；pool 每类扩到 6 句；approaches 每知识点补到 3 条（新增条目照字段补全）。',
  items: [...poolItems, ...approachItems],
});

const brief = {
  meta: {
    project: 'OI 模拟赛 · 校赛版（教练模式网页游戏）',
    language: 'zh-CN',
    version: '2026-11',
    audience: '中文写手（熟悉 OI 竞赛语境）',
    howToUse: [
      '这是一份「文字素材 + 上下文 + 约束」清单。你只需要改写 current 字段里的中文，不要改 key、不要改结构、不要翻译。',
      '每个 item 都标注了它出现在界面的什么位置（when）、字数上限（limit）、当前问题（issue）、改写方向（hint）。',
      '改写后按同一 JSON 结构返回；新增条目（事件卡、多解法）照现有字段补全。',
      '数值、机制、真实成绩都不要写；若需要表达效果，写进 effectHint（自然语言），由开发补数值。',
    ],
    style: {
      voice: '选手心里的第一人称短句 / 教练视角的第三人称叙述',
      tone: '克制、具体、允许自嘲，不煽情、不用感叹号堆情绪',
      rules: [
        '每句必须有具体信息（数字、复杂度、动作、场景），不要空泛建议',
        '不出现「你」「玩家」「让我们一起」「在这个旅程中」',
        '不用 emoji；不用英文整句（专业缩写除外：CSP-S / NOIP / APIO / NOI / LCT / NTT）',
        '术语必须准确：挂分、卡常、对拍、打表、省一、国集、D 类、freopen、时空限制',
      ],
      examples: {
        good: [
          '先把暴力写出来垫着，过了大样例再想怎么砍一维',
          '空闲时不要乱动，否则会多算一次移动',
          '最后 15 分钟回去抢救一版，别慌到忘写 freopen',
        ],
        bad: [
          '这题需要我们认真思考，找到最优的解决方案。',
          '让我们一起努力，攻克这道难题吧！',
          '通过分析题目，我们可以发现……',
        ],
      },
    },
    redLines: [
      '不许编造真实选手的成绩或获奖（人名、学校、分数都是真事，可调侃不可杜撰）',
      '不许改机制与数值，只写字符串',
      '不许改 key、字段名、JSON 结构',
      '语录（quotes.json）是选手本人的博客原话，禁止改写',
    ],
    limits: '超字数会被截断或撑破布局：思维链 ≤40 字、事件正文 ≤80 字、选项 ≤16 字、播报 ≤30 字、解法名 ≤10 字。',
  },
  batches,
};

writeFileSync(`${out}/writing-brief.json`, JSON.stringify(brief, null, 2), 'utf8');
const count = batches.reduce((a, b) => a + b.items.length, 0);
console.log('items', count, 'bytes', JSON.stringify(brief).length);
for (const b of batches) console.log(b.id, b.items.length);
