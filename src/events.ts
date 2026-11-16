/**
 * 教练模式 · 每周随机事件（M1.1）
 *
 * 设计目标：让「每周的 16 个决定」真的影响结局，而不只是换一个专题按钮。
 * 事件在「排训练」之前出现，玩家必须做一个有代价的选择；选完才进入训练。
 *
 * 原则：
 * - 效果全部可量化、有代价，没有纯赚的选项；
 * - 事件只改 SeasonStudent 的 fatigue / topics（以及本周训练效率），
 *   不碰 game.ts 的比赛循环；
 * - 没有“心态/抗压/冒险”这类隐藏属性，选项一律落在疲劳、专题、训练效率上；
 * - 数据驱动：加事件 = 往 EVENT_DEFS 里加一条，不用改状态机。
 */
import { TOPIC_LIST } from './game.ts';
import type { Topic } from './types.ts';
import type { SeasonState } from './season.ts';

export interface StudentPatch {
  /** 0-100 */
  fatigue?: number;
  /** 专题水平增量 */
  topics?: Partial<Record<Topic, number>>;
  /** 作业/互测分增量 */
  homework?: number;
  /** 因伤病/处分等原因错过接下来几周的正式比赛 */
  sitOut?: number;
}

export interface EventPatch {
  /** 事件日志里显示的一句话（会带上学生名字） */
  log: string;
  /** 只作用于事件指向的那个学生 */
  target?: StudentPatch;
  /** 作用于全队 */
  team?: StudentPatch;
  /** 本周训练效率倍率（1 = 正常；0.6 = 砍半） */
  growthMult?: number;
  /** 学校声望变化（招生质量） */
  prestige?: number;
}

export interface EventChoice {
  id: string;
  label: string;
  /** 按钮上的代价提示（玩家可见） */
  note: string;
  apply: (s: SeasonState, target: string | null, rng: () => number) => EventPatch;
}

export interface SeasonEventDef {
  id: string;
  /** 归类：感情 / 教学 / 行政 / 家庭 / 机会 / 健康 / 竞争 */
  tag: string;
  title: string;
  /** 需要指定一个队员 */
  needsTarget: boolean;
  /** 抽取权重 */
  weight: number;
  /** 正文，{name} 替换成学生名 */
  text: string;
  options: EventChoice[];
}

/** 找某个学生当前最弱的专题（事件可以"顺手补一点"） */
function weakestTopic(s: SeasonState, name: string | null): Topic | null {
  const st = s.students.find((x) => x.name === name);
  if (!st) return null;
  let worst: Topic | null = null;
  let v = 2;
  for (const t of TOPIC_LIST) {
    if (st.skills.topics[t] < v) { v = st.skills.topics[t]; worst = t; }
  }
  return worst;
}

/** 把"涨一点点某专题"写成 patch；找不到学生就退化成 generic 补弱项 */
function bump(s: SeasonState, target: string | null, delta: number): EventPatch['target'] {
  const t = weakestTopic(s, target);
  if (!t) return {};
  return { topics: { [t]: delta } as Partial<Record<Topic, number>> };
}

export const EVENT_DEFS: SeasonEventDef[] = [
  {
    id: 'romance',
    tag: '感情',
    title: '早恋风波',
    needsTarget: true,
    weight: 1.1,
    text: '{name} 最近和隔壁班一个同学走得很近，晚自习明显心不在焉，训练日志上开始出现"发呆"。',
    options: [
      {
        id: 'talk',
        label: '约谈一次，定个边界',
        note: '疲劳 +4 · 顺手补最弱专题 +1%',
        apply: (s, t) => ({
          log: `你在操场边和 ${t ?? '他'} 聊了 40 分钟：不反对，但不能耽误训练。对方点头了。`,
          target: { fatigue: 4, ...bump(s, t, 0.01) },
        }),
      },
      {
        id: 'blind',
        label: '睁一只眼闭一只眼',
        note: '疲劳 +2 · 本周训练 ×0.9',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 心情很好，训练时却总在回消息。你说不出哪里不对。`,
          target: { fatigue: 2 },
          growthMult: 0.9,
        }),
      },
      {
        id: 'plan',
        label: '约法三章，一起排时间表',
        note: '疲劳 +3 · 最弱专题 +2%',
        apply: (s, t) => ({
          log: `${t ?? '他'} 自己把晚自习切成了训练/见面两段，还顺手把最弱的专题补了一点。`,
          target: { fatigue: 3, ...bump(s, t, 0.02) },
        }),
      },
    ],
  },
  {
    id: 'teacher',
    tag: '教学',
    title: '班主任找上门',
    needsTarget: false,
    weight: 1.0,
    text: '文化课班主任在走廊拦住你：最近作业交得越来越晚，"你这个训练，是不是占得太多了？"',
    options: [
      {
        id: 'cut',
        label: '把训练压一压',
        note: '本周训练 ×0.6 · 疲劳 −10',
        apply: () => ({
          log: '训练量砍半，班主任满意了，学生倒是睡了个好觉。',
          team: { fatigue: -10 },
          growthMult: 0.6,
        }),
      },
      {
        id: 'arrange',
        label: '和班主任商量着排课',
        note: '本周训练 ×0.85 · 疲劳 −4',
        apply: () => ({
          log: '你们把晚自习重新切了块，各退一步，勉强都过得去。',
          team: { fatigue: -4 },
          growthMult: 0.85,
        }),
      },
      {
        id: 'hold',
        label: '顶住，用成绩说话',
        note: '本周训练 ×1.1 · 疲劳 +4',
        apply: () => ({
          log: '你把成绩单拍在桌上："期末看结果。"班主任没再说话。',
          team: { fatigue: 4 },
          growthMult: 1.1,
        }),
      },
    ],
  },
  {
    id: 'school',
    tag: '行政',
    title: '校领导的压力',
    needsTarget: false,
    weight: 0.9,
    text: '年级会上领导点了名：今年信息学竞赛要出成绩，"你们那批人到底行不行，给个准话。"',
    options: [
      {
        id: 'vow',
        label: '立军令状',
        note: '本周训练 ×1.15 · 疲劳 +6',
        apply: () => ({
          log: '你在会上把目标写在了黑板上。回来以后，机房的气氛明显绷紧了。',
          team: { fatigue: 6 },
          growthMult: 1.15,
        }),
      },
      {
        id: 'talk',
        label: '会后单独找领导沟通',
        note: '本周训练 ×0.95 · 疲劳 +2',
        apply: () => ({
          log: '你在办公室解释了赛制和时间线，领导勉强接受了"稳着来"。',
          team: { fatigue: 2 },
          growthMult: 0.95,
        }),
      },
      {
        id: 'refuse',
        label: '顶回去：节奏不能乱',
        note: '本周训练 ×1.05',
        apply: () => ({
          log: '你坚持了自己的节奏。领导没再说什么，但队里有人听说了这事。',
          growthMult: 1.05,
        }),
      },
    ],
  },
  {
    id: 'parent',
    tag: '家庭',
    title: '家长焦虑',
    needsTarget: true,
    weight: 1.1,
    text: '{name} 家长的电话打到你手机上，语气很急：孩子天天泡机房，文化课要掉下来了。',
    options: [
      {
        id: 'meeting',
        label: '请家长来学校谈一次',
        note: '疲劳 +6 · 最弱专题 +1%',
        apply: (s, t) => ({
          log: `你给 ${t ?? '他'} 家长看了训练记录和升学数据，对方走的时候脸色好多了。`,
          target: { fatigue: 6, ...bump(s, t, 0.01) },
        }),
      },
      {
        id: 'call',
        label: '电话里安抚',
        note: '疲劳 +2 · 最弱专题 +0.5%',
        apply: (s, t) => ({
          log: `你在电话里讲了半小时，${t ?? '他'} 家长将信将疑地挂了电话。`,
          target: { fatigue: 2, ...bump(s, t, 0.005) },
        }),
      },
      {
        id: 'self',
        label: '让学生自己跟家里谈',
        note: '五五开：谈成疲劳 +3、补最弱专题 +1.5%；谈崩疲劳 +5',
        apply: (s, t, rng) => {
          const ok = rng() < 0.5;
          return {
            log: ok
              ? `${t ?? '他'} 自己跟家里谈通了，回来的时候眼睛是亮的。`
              : `${t ?? '他'} 和家里吵了一架，回来一言不发，训练时手一直在抖。`,
            target: ok
              ? { fatigue: 3, ...bump(s, t, 0.015) }
              : { fatigue: 5 },
          };
        },
      },
    ],
  },
  {
    id: 'exchange',
    tag: '机会',
    title: '隔壁学校约交流赛',
    needsTarget: false,
    weight: 0.8,
    text: '隔壁学校发来消息：周六想约一场交流赛，四道题，打完一起讲评。',
    options: [
      {
        id: 'accept',
        label: '接，当实战演练',
        note: '疲劳 +12 · 本周训练 ×0.9',
        apply: () => ({
          log: '交流赛打得很凶，虽然累，但队里第一次见识了外面的节奏。',
          team: { fatigue: 12 },
          growthMult: 0.9,
        }),
      },
      {
        id: 'decline',
        label: '婉拒，按计划练',
        note: '本周训练 ×1.05 · 少一次实战',
        apply: () => ({
          log: '你推掉了交流赛，按原计划训练。有人小声说"好想打"。',
          growthMult: 1.05,
        }),
      },
      {
        id: 'partial',
        label: '只派状态好的几个去',
        note: '疲劳 +5 · 本周训练 ×0.95',
        apply: () => ({
          log: '你挑了三个状态最好的去打，回来给大家讲了半节复盘课。',
          team: { fatigue: 5 },
          growthMult: 0.95,
        }),
      },
    ],
  },
  {
    id: 'cold',
    tag: '健康',
    title: '有人感冒了',
    needsTarget: true,
    weight: 0.9,
    text: '{name} 连着打了两天喷嚏，今天早上没来早训。',
    options: [
      {
        id: 'rest',
        label: '让他休息一周',
        note: '疲劳 −25 · 本周训练 ×0.9',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 在家躺了一周，回来的时候脸色好多了。`,
          target: { fatigue: -25 },
          growthMult: 0.9,
        }),
      },
      {
        id: 'push',
        label: '带病训练，轻伤不下火线',
        note: '疲劳 +15 · 最弱专题 +1.5%',
        apply: (s, t) => ({
          log: `${t ?? '他'} 裹着外套来机房，一边咳嗽一边敲代码。你有点心疼。`,
          target: { fatigue: 15, ...bump(s, t, 0.015) },
        }),
      },
      {
        id: 'half',
        label: '半天训练半天休息',
        note: '疲劳 −6',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 上午来机房，下午回去睡觉。折中方案，谁都不太满意。`,
          target: { fatigue: -6 },
        }),
      },
    ],
  },
  {
    id: 'rival',
    tag: '竞争',
    title: '隔壁教练来挖人',
    needsTarget: true,
    weight: 0.7,
    text: '隔壁学校的教练私下加了 {name} 的微信，说"来我们这，每周两次一对一"。',
    options: [
      {
        id: 'promise',
        label: '找学生谈话，给出承诺',
        note: '疲劳 +2 · 最弱专题 +1%',
        apply: (s, t) => ({
          log: `你跟 ${t ?? '他'} 交了底：资源有限，但你的时间都给他。他留下来了。`,
          target: { fatigue: 2, ...bump(s, t, 0.01) },
        }),
      },
      {
        id: 'invest',
        label: '加大投入，用行动表态',
        note: '本周训练 ×1.1 · 疲劳 +8',
        apply: (_s, t) => ({
          log: `你连夜给 ${t ?? '他'} 排了一套加练计划。他没说什么，第二天来得最早。`,
          target: { fatigue: 8 },
          growthMult: 1.1,
        }),
      },
      {
        id: 'free',
        label: '尊重他的选择，不拦',
        note: '留下：疲劳 −2、补最弱专题 +1%；离开：疲劳 +4',
        apply: (s, t, rng) => {
          const stay = rng() > 0.35;
          return {
            log: stay
              ? `${t ?? '他'} 想了两天，最后还是留在了机房。`
              : `${t ?? '他'} 去了隔壁学校，人虽然还在队里，心已经不在。`,
            target: stay
              ? { fatigue: -2, ...bump(s, t, 0.01) }
              : { fatigue: 4 },
          };
        },
      },
    ],
  },
  {
    id: 'fever',
    tag: '健康',
    title: '赛前发烧',
    needsTarget: true,
    weight: 0.9,
    text: '比赛前一天，{name} 烧到 38.5℃，家长问要不要弃赛。',
    options: [
      {
        id: 'rest',
        label: '弃赛，先把人养好',
        note: '疲劳 −20 · 缺席本周正式比赛',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 在家躺了两天，比赛没去。你说身体比一场比赛重要。`,
          target: { fatigue: -20, sitOut: 1 },
        }),
      },
      {
        id: 'push',
        label: '带病上，吃点药顶住',
        note: '疲劳 +12 · 本周训练 ×0.9',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 裹着外套进了考场，出来的时候脸是白的。`,
          target: { fatigue: 12, homework: 2 },
          growthMult: 0.9,
        }),
      },
      {
        id: 'half',
        label: '先请假半天，看情况',
        note: '疲劳 +4 · 缺席本周正式比赛 · 作业 +1',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 上午在家睡了一觉，下午还是没赶上。`,
          target: { fatigue: 4, sitOut: 1, homework: 1 },
        }),
      },
    ],
  },
  {
    id: 'midterm',
    tag: '教学',
    title: '期中考试周',
    needsTarget: false,
    weight: 1.0,
    text: '文化课期中考试撞上训练周，班主任把成绩单发到了群里。',
    options: [
      {
        id: 'pause',
        label: '停训一周，先保文化课',
        note: '本周训练 ×0.5 · 疲劳 −8 · 作业 +4',
        apply: () => ({
          log: '训练暂停，机房安静了一周。班主任在群里发了个“这才像话”。',
          team: { fatigue: -8, homework: 4 },
          growthMult: 0.5,
        }),
      },
      {
        id: 'balance',
        label: '训练减半，晚上补课',
        note: '本周训练 ×0.8 · 作业 +1',
        apply: () => ({
          log: '白天上课、晚上训练，两边都没落下，就是人有点困。',
          team: { homework: 1 },
          growthMult: 0.8,
        }),
      },
      {
        id: 'push',
        label: '照常训练，成绩再说',
        note: '本周训练 ×1.0 · 作业 −3 · 声望 −1',
        apply: () => ({
          log: '你顶住了压力。成绩单下来，班主任的脸色不太好看。',
          team: { homework: -3 },
          prestige: -1,
        }),
      },
    ],
  },
  {
    id: 'recruit',
    tag: '梯队',
    title: '小学宣讲',
    needsTarget: false,
    weight: 0.9,
    text: '附近小学请你去讲一节“信息学是干什么的”，顺便招几个好苗子。',
    options: [
      {
        id: 'go',
        label: '亲自去讲',
        note: '声望 +4 · 本周训练 ×0.9 · 疲劳 +4',
        apply: () => ({
          log: '你带着两台笔记本去了小学，台下眼睛亮了一片。',
          team: { fatigue: 4 },
          growthMult: 0.9,
          prestige: 4,
        }),
      },
      {
        id: 'send',
        label: '让队员去讲',
        note: '声望 +2 · 作业 +2 · 本周训练 ×0.95',
        apply: () => ({
          log: '队里两个老队员去讲了一节课，回来兴奋了半天。',
          team: { homework: 2 },
          growthMult: 0.95,
          prestige: 2,
        }),
      },
      {
        id: 'skip',
        label: '不去了，训练要紧',
        note: '本周训练 ×1.0 · 声望 −2',
        apply: () => ({
          log: '你婉拒了邀请。少了一次露脸的机会，训练倒是没耽误。',
          prestige: -2,
        }),
      },
    ],
  },
  {
    id: 'alumni',
    tag: '机会',
    title: '学长回校',
    needsTarget: false,
    weight: 0.8,
    text: '去年毕业的学长回来看老师，顺便在机房坐了一下午。',
    options: [
      {
        id: 'lecture',
        label: '请他讲一节课',
        note: '全队专题 +0.5% · 作业 +3 · 声望 +2',
        apply: () => ({
          log: '学长讲了自己在省队的见闻，底下的人听得比上课认真。',
          team: { topics: { math: 0.005, dp: 0.005, graph: 0.005, greedy: 0.005, ds: 0.005, impl: 0.005, string: 0.005, geometry: 0.005 }, homework: 3 },
          prestige: 2,
        }),
      },
      {
        id: 'dinner',
        label: '一起吃个饭，聊聊天',
        note: '疲劳 −6 · 声望 +1',
        apply: () => ({
          log: '一顿饭吃了两个小时，回来的时候大家心情都不错。',
          team: { fatigue: -6 },
          prestige: 1,
        }),
      },
      {
        id: 'train',
        label: '让他陪练一场',
        note: '疲劳 +6 · 本周训练 ×1.05',
        apply: () => ({
          log: '学长被拉来打了一场模拟赛，队里第一次被压着打。',
          team: { fatigue: 6 },
          growthMult: 1.05,
        }),
      },
    ],
  },
  {
    id: 'funding',
    tag: '行政',
    title: '经费被砍',
    needsTarget: false,
    weight: 0.8,
    text: '学校说这学期经费紧张，机房的电费和资料费要砍一半。',
    options: [
      {
        id: 'raise',
        label: '自己想办法筹',
        note: '疲劳 +6 · 本周训练 ×1.05 · 声望 +1',
        apply: () => ({
          log: '你跑了两天赞助，勉强把窟窿补上，人累得够呛。',
          team: { fatigue: 6 },
          growthMult: 1.05,
          prestige: 1,
        }),
      },
      {
        id: 'cut',
        label: '砍掉加练和资料',
        note: '本周训练 ×0.7 · 疲劳 −10',
        apply: () => ({
          log: '训练量减了，资料也停了。学生们没说什么，但你知道他们在等。',
          team: { fatigue: -10 },
          growthMult: 0.7,
        }),
      },
      {
        id: 'parents',
        label: '找家长分摊',
        note: '声望 −2 · 本周训练 ×0.95 · 作业 +1',
        apply: () => ({
          log: '家长群里凑了一笔钱，也凑了一堆意见。',
          team: { homework: 1 },
          growthMult: 0.95,
          prestige: -2,
        }),
      },
    ],
  },
  {
    id: 'transfer',
    tag: '竞争',
    title: '有人想转学',
    needsTarget: true,
    weight: 0.7,
    text: '{name} 家长在考虑把孩子转到有竞赛班的学校，来问你意见。',
    options: [
      {
        id: 'stay',
        label: '挽留，给出训练承诺',
        note: '疲劳 +3 · 最弱专题 +1% · 作业 +2',
        apply: (s, t) => ({
          log: `你和家长谈了很久，${t ?? '他'} 最后留了下来。`,
          target: { fatigue: 3, homework: 2, ...bump(s, t, 0.01) },
        }),
      },
      {
        id: 'leave',
        label: '尊重选择，办手续',
        note: '缺席两周 · 声望 −2',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 去新学校试读了两周，队里少了一个人。`,
          target: { sitOut: 2, fatigue: -4 },
          prestige: -2,
        }),
      },
      {
        id: 'prove',
        label: '用一次比赛成绩证明',
        note: '疲劳 +5 · 本周训练 ×1.1 · 声望 +1',
        apply: (_s, t) => ({
          log: `你给 ${t ?? '他'} 加了一周小灶，成绩出来以后家长没再提转学。`,
          target: { fatigue: 5 },
          growthMult: 1.1,
          prestige: 1,
        }),
      },
    ],
  },
  {
    id: 'burnout',
    tag: '健康',
    title: '状态崩了',
    needsTarget: true,
    weight: 0.7,
    text: '{name} 连续两周训练时发呆，问他怎么了，只说“不想写了”。',
    options: [
      {
        id: 'rest',
        label: '强制休息两周',
        note: '疲劳 −30 · 缺席两周正式比赛',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 被你先赶回家睡觉，两周没碰代码。`,
          target: { fatigue: -30, sitOut: 2 },
        }),
      },
      {
        id: 'talk',
        label: '聊一聊，减点量',
        note: '疲劳 −10 · 作业 +2 · 本周训练 ×0.85',
        apply: (_s, t) => ({
          log: `你和 ${t ?? '他'} 在操场走了三圈，他把憋着的话说出来了。`,
          target: { fatigue: -10, homework: 2 },
          growthMult: 0.85,
        }),
      },
      {
        id: 'push',
        label: '再顶一顶，比赛要紧',
        note: '疲劳 +8 · 本周训练 ×1.1 · 声望 −1',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 没再说什么，第二天还是来了，只是更沉默了。`,
          target: { fatigue: 8 },
          growthMult: 1.1,
          prestige: -1,
        }),
      },
    ],
  },
  {
    id: 'media',
    tag: '机会',
    title: '本地媒体报道',
    needsTarget: false,
    weight: 0.6,
    text: '本地报纸想写一篇“中学生搞信息学”的稿子，点名要采访你们队。',
    options: [
      {
        id: 'accept',
        label: '接受采访',
        note: '声望 +5 · 本周训练 ×0.9',
        apply: () => ({
          log: '稿子登出来以后，校长在大会上念了一遍。',
          growthMult: 0.9,
          prestige: 5,
        }),
      },
      {
        id: 'low',
        label: '低调处理，只给资料',
        note: '声望 +1 · 本周训练 ×1.0',
        apply: () => ({
          log: '你给了几段训练记录，没让学生出镜。',
          prestige: 1,
        }),
      },
      {
        id: 'refuse',
        label: '拒绝，别打扰训练',
        note: '声望 −1 · 本周训练 ×1.05',
        apply: () => ({
          log: '你回绝了采访。机房那周格外安静。',
          growthMult: 1.05,
          prestige: -1,
        }),
      },
    ],
  },
  {
    id: 'joint',
    tag: '机会',
    title: '外校联合训练',
    needsTarget: false,
    weight: 0.9,
    text: '邻市几所学校组织联合训练，包吃包住，打三天比赛。',
    options: [
      {
        id: 'join',
        label: '全队参加',
        note: '疲劳 +10 · 本周训练 ×1.1 · 作业 +2',
        apply: () => ({
          log: '三天打了六场，回来的时候每个人都在记别人的套路。',
          team: { fatigue: 10, homework: 2 },
          growthMult: 1.1,
        }),
      },
      {
        id: 'half',
        label: '只去主力',
        note: '疲劳 +4 · 本周训练 ×1.0 · 声望 +1',
        apply: () => ({
          log: '主力去打了三天，梯队留在学校按计划练。',
          team: { fatigue: 4 },
          prestige: 1,
        }),
      },
      {
        id: 'skip',
        label: '不去，按自己的节奏',
        note: '本周训练 ×1.0',
        apply: () => ({
          log: '你推掉了联合训练。有人松了口气，也有人有点失望。',
        }),
      },
    ],
  },
  {
    id: 'parents_job',
    tag: '家庭',
    title: '家长要求转文化课',
    needsTarget: true,
    weight: 0.8,
    text: '{name} 家长下了最后通牒：再不出成绩，就回去专心高考。',
    options: [
      {
        id: 'promise',
        label: '保证文化课不掉',
        note: '本周训练 ×0.8 · 疲劳 −4 · 作业 +3',
        apply: (_s, t) => ({
          log: `你给 ${t ?? '他'} 排了文化课时间表，家长勉强同意再观察一学期。`,
          target: { fatigue: -4, homework: 3 },
          growthMult: 0.8,
        }),
      },
      {
        id: 'allin',
        label: '全力冲竞赛',
        note: '疲劳 +6 · 本周训练 ×1.1 · 声望 −1',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 把课桌搬进了机房。家长在电话里沉默了很久。`,
          target: { fatigue: 6 },
          growthMult: 1.1,
          prestige: -1,
        }),
      },
      {
        id: 'choice',
        label: '让学生自己选',
        note: '五五开：留下补专题 +1%，离开疲劳 +4',
        apply: (s, t, rng) => {
          const stay = rng() < 0.55;
          return {
            log: stay
              ? `${t ?? '他'} 想了一晚上，第二天照常出现在机房。`
              : `${t ?? '他'} 收拾东西回了教室，说想先把成绩补上来。`,
            target: stay ? { homework: 2, ...bump(s, t, 0.01) } : { fatigue: 4, sitOut: 2 },
          };
        },
      },
    ],
  },
];

/** 事件抽到的结果（存进 SeasonState，UI 直接渲染） */
export interface PendingEvent {
  id: string;
  week: number;
  tag: string;
  title: string;
  text: string;
  target: string | null;
  options: { id: string; label: string; note: string }[];
}

export function eventDefById(id: string): SeasonEventDef | undefined {
  return EVENT_DEFS.find((d) => d.id === id);
}
