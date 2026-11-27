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
  /** 校队经费变化 */
  budget?: number;
  /** 触发后续连续剧事件 */
  followUp?: { id: string; delayWeeks: number; keepTarget?: boolean };
  /** 写入连续剧剧情标记 */
  storyFlag?: [string, string];
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
  /** 仅通过连续剧 followUp 触发，不进入每周随机抽取池 */
  chainOnly?: boolean;
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
          log: '你把成绩单拍在桌上："期末看结果。"班主任没再说话，但转身去了家长群。',
          team: { fatigue: 4 },
          growthMult: 1.1,
          followUp: { id: 'teacher_alliance', delayWeeks: 3 },
          storyFlag: ['teacher', 'held'],
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
        note: '留下：疲劳 −2、补最弱专题 +1%；动摇：3 周后风波再起',
        apply: (s, t, rng) => {
          const stay = rng() > 0.35;
          return {
            log: stay
              ? `${t ?? '他'} 想了两天，最后还是留在了机房。`
              : `${t ?? '他'} 嘴上说再看看，隔壁学校周末又把他拉进内部联测群。`,
            target: stay
              ? { fatigue: -2, ...bump(s, t, 0.01) }
              : { fatigue: 4 },
            ...(stay ? {} : { followUp: { id: 'poach_followup', delayWeeks: 3, keepTarget: true }, storyFlag: ['poach', 'wavered'] }),
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
        note: '经费 −10 · 本周训练 ×0.7 · 疲劳 −10',
        apply: () => ({
          log: '训练量减了，资料也停了，账上经费还是缩了一截。',
          team: { fatigue: -10 },
          growthMult: 0.7,
          budget: -10,
        }),
      },
      {
        id: 'parents',
        label: '找家长分摊',
        note: '经费 +5 · 声望 −2 · 本周训练 ×0.95 · 作业 +1',
        apply: () => ({
          log: '家长群里凑了一笔钱，也凑了一堆意见。',
          team: { homework: 1 },
          growthMult: 0.95,
          prestige: -2,
          budget: 5,
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
        note: '声望 +5 · 经费 +8 · 本周训练 ×0.9',
        apply: () => ({
          log: '稿子登出来以后，校长在大会上念了一遍，顺手批了一笔宣传奖金。',
          growthMult: 0.9,
          prestige: 5,
          budget: 8,
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

  // ===== 6 条连续剧事件链与 12+ 新增机房日常事件 =====
  {
    id: 'poach_followup',
    tag: '竞争',
    title: '挖角风波再起',
    needsTarget: true,
    weight: 0,
    chainOnly: true,
    text: '三周过去，隔壁校直接抛来名额保底承诺，催 {name} 本周给最终答复。',
    options: [
      {
        id: 'scholarship',
        label: '批专项加训经费，全力留人',
        note: '经费 −12 · 最弱专题 +2% · 声望 +2',
        apply: (s, t) => ({
          log: `你向校领导特批了一笔资源，${t ?? '他'} 退了隔壁群，重新把题刷起来。`,
          budget: -12,
          prestige: 2,
          target: { homework: 3, ...bump(s, t, 0.02) },
        }),
      },
      {
        id: 'heart_to_heart',
        label: '拿往届档案彻夜长谈',
        note: '疲劳 +4 · 最弱专题 +1.5% · 作业 +2',
        apply: (s, t) => ({
          log: `你在机房给 ${t ?? '他'} 讲透了高二冲省队的路径，心结彻底解开。`,
          target: { fatigue: 4, homework: 2, ...bump(s, t, 0.015) },
        }),
      },
      {
        id: 'let_go',
        label: '不再强留，保留学籍专注自练',
        note: '缺席 1 场正赛 · 声望 −2 · 本周训练 ×0.95',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 去意已决办了借读，剩下的人反倒憋了一股气。`,
          target: { sitOut: 1, fatigue: -4 },
          prestige: -2,
          growthMult: 0.95,
        }),
      },
    ],
  },
  {
    id: 'teacher_alliance',
    tag: '教学',
    title: '班主任与家长三方约谈',
    needsTarget: false,
    weight: 0,
    chainOnly: true,
    text: '上次硬顶之后，班主任叫上两位主力家长要求正式定出文化课底线时间表。',
    options: [
      {
        id: 'schedule',
        label: '制定双轨作息表，立规矩',
        note: '作业 +5 · 本周训练 ×0.9 · 声望 +2',
        apply: () => ({
          log: '每周保留固定晚自习补文化课，三方都在作息表上签了字。',
          team: { homework: 5, fatigue: -2 },
          growthMult: 0.9,
          prestige: 2,
        }),
      },
      {
        id: 'quota_trade',
        label: '主动让出一节晚训换取支持',
        note: '本周训练 ×0.8 · 疲劳 −8 · 经费 +6',
        apply: () => ({
          log: '班主任消了气，家委会还顺便凑了一小笔机房空调电费。',
          team: { fatigue: -8 },
          growthMult: 0.8,
          budget: 6,
        }),
      },
      {
        id: 'stand_firm',
        label: '展示省一/保送政策，再次顶住',
        note: '本周训练 ×1.1 · 疲劳 +6 · 声望 −1',
        apply: () => ({
          log: '你把去年的升学清单甩出来，对方没再拦人，但要求月考必须见分。',
          team: { fatigue: 6, homework: -2 },
          growthMult: 1.1,
          prestige: -1,
        }),
      },
    ],
  },
  {
    id: 'post_gold_slack',
    tag: '竞争',
    title: '领跑后的松懈期',
    needsTarget: true,
    weight: 0.85,
    text: '{name} 最近在模拟赛稳居前列，晚训开始刷题摸鱼看游记，自称“保底省一稳了”。',
    options: [
      {
        id: 'humble_set',
        label: '偷偷塞一套高难黑题模拟砸醒他',
        note: '疲劳 +7 · 本周训练 ×1.08 · 3 周后看效果',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 一场考出 40 分，下考脸绿着回来重刷构造和 DP。`,
          target: { fatigue: 7 },
          growthMult: 1.08,
          followUp: { id: 'post_gold_reignite', delayWeeks: 3, keepTarget: true },
        }),
      },
      {
        id: 'mentor_duty',
        label: '让他给梯队初一生讲两道题',
        note: '疲劳 +2 · 作业 +3 · 声望 +2',
        apply: (_s, t) => ({
          log: `备课讲题比自己写还费脑，${t ?? '他'} 讲完直呼自己细节也漏了好多。`,
          target: { fatigue: 2, homework: 3 },
          prestige: 2,
        }),
      },
      {
        id: 'relax',
        label: '难得状态轻松，随他去调两天',
        note: '疲劳 −8 · 本周训练 ×0.92',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 连续三天准点回宿舍睡觉，只是训练题量明显掉了下来。`,
          target: { fatigue: -8 },
          growthMult: 0.92,
        }),
      },
    ],
  },
  {
    id: 'post_gold_reignite',
    tag: '竞争',
    title: '重燃斗志 · 冲刺国赛门槛',
    needsTarget: true,
    weight: 0,
    chainOnly: true,
    text: '被那套难题扎醒后，{name} 自己列了一份高阶专题清单来找你核对。',
    options: [
      {
        id: 'tailor',
        label: '一对一划重点打通瓶颈',
        note: '最弱专题 +2.5% · 疲劳 +5',
        apply: (s, t) => ({
          log: `${t ?? '他'} 彻底收起飘了的心态，直接把最弱的一块短板推上去一大截。`,
          target: { fatigue: 5, homework: 3, ...bump(s, t, 0.025) },
        }),
      },
      {
        id: 'duo',
        label: '安排跟强手限时单挑两道紫题',
        note: '本周训练 ×1.12 · 疲劳 +6 · 声望 +1',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 打赢那场单挑后，手感和信心都比从前更稳。`,
          target: { fatigue: 6 },
          growthMult: 1.12,
          prestige: 1,
        }),
      },
    ],
  },
  {
    id: 'study_pair',
    tag: '教学',
    title: '双人互测搭档提议',
    needsTarget: true,
    weight: 0.95,
    text: '{name} 提出想和机房另一位同学结成“互造数据互卡常”对拍搭档。',
    options: [
      {
        id: 'approve',
        label: '批准结对，每天互 hack 三组',
        note: '作业 +4 · 疲劳 +4 · 4 周后验收成效',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 搭档当天就写了个数据生成器，相互找错玩得很起劲。`,
          target: { homework: 4, fatigue: 4 },
          followUp: { id: 'study_pair_payoff', delayWeeks: 4, keepTarget: true },
        }),
      },
      {
        id: 'rotate',
        label: '改成全队轮流交叉对拍',
        note: '全队作业 +2 · 本周训练 ×1.03',
        apply: () => ({
          log: '每个人都得给别人代码挑刺，机房一时间到处在比谁的生成器够毒。',
          team: { homework: 2, fatigue: 2 },
          growthMult: 1.03,
        }),
      },
      {
        id: 'solo',
        label: '暂不折腾，自己按计划稳练',
        note: '疲劳 −2 · 最弱专题 +0.8%',
        apply: (s, t) => ({
          log: `${t ?? '他'} 老实坐回原位，省下的时间多补了几道错题。`,
          target: { fatigue: -2, ...bump(s, t, 0.008) },
        }),
      },
    ],
  },
  {
    id: 'study_pair_payoff',
    tag: '教学',
    title: '互测搭档月度验收入坑记',
    needsTarget: true,
    weight: 0,
    chainOnly: true,
    text: '结对一个月，{name} 和搭档抱着一本几十条暗病踩坑笔记来交差。',
    options: [
      {
        id: 'share_team',
        label: '印成全队《防挂手册》人手一份',
        note: '全队作业 +4 · 声望 +2 · 经费 −4',
        apply: (s, t) => ({
          log: '从多测不清空到 long long 爆掉，全队挂分意识肉眼可见提高。',
          team: { homework: 4 },
          target: { ...bump(s, t, 0.015) },
          prestige: 2,
          budget: -4,
        }),
      },
      {
        id: 'deepen',
        label: '继续深挖极限卡常写法',
        note: '本周训练 ×1.1 · 最弱专题 +2%',
        apply: (s, t) => ({
          log: `${t ?? '他'} 连带着把读入优化、快排常数全练熟了。`,
          target: { ...bump(s, t, 0.02), fatigue: 3 },
          growthMult: 1.1,
        }),
      },
    ],
  },
  {
    id: 'alumni_sponsor',
    tag: '机会',
    title: '毕业校友欲赠评测机',
    needsTarget: false,
    weight: 0.75,
    text: '一位几年前毕业进互联网大厂的师兄联系你，想低价转让或捐赠两台高性能评测服务器给校内 OJ。',
    options: [
      {
        id: 'deploy',
        label: '出点经费配好机柜直接上线',
        note: '经费 −10 · 声望 +3 · 本周训练 ×1.12 · 3 周后后续',
        apply: () => ({
          log: '新评测机跑得飞快，队里刷大样例终于不用再排队等两分钟。',
          budget: -10,
          prestige: 3,
          growthMult: 1.12,
          followUp: { id: 'alumni_sponsor_lab', delayWeeks: 3 },
        }),
      },
      {
        id: 'free_old',
        label: '先收二手旧机顶着用',
        note: '经费 +5 · 本周训练 ×1.02 · 疲劳 +3',
        apply: () => ({
          log: '省下预算还顺手找校友拉到小额维修费，就是偶尔会响风扇。',
          budget: 5,
          team: { fatigue: 3 },
          growthMult: 1.02,
        }),
      },
      {
        id: 'cash',
        label: '机房空间有限，折现换成模拟题库经费',
        note: '经费 +14 · 声望 +1',
        apply: () => ({
          log: '师兄很爽快直接转账充公，校队账上宽裕了不少。',
          budget: 14,
          prestige: 1,
        }),
      },
    ],
  },
  {
    id: 'alumni_sponsor_lab',
    tag: '机会',
    title: '校内 OJ 首届校友杯开赛',
    needsTarget: false,
    weight: 0,
    chainOnly: true,
    text: '新评测机稳定跑满三周，师兄自掏腰包出了一套高质量互测题邀你们校队验题打榜。',
    options: [
      {
        id: 'full_test',
        label: '全队当成正式模拟实战开打',
        note: '全队作业 +4 · 本周训练 ×1.15 · 疲劳 +6',
        apply: () => ({
          log: '这套题质量极高，打完复盘顶得上平时练两周。',
          team: { homework: 4, fatigue: 6 },
          growthMult: 1.15,
          prestige: 2,
        }),
      },
      {
        id: 'open_school',
        label: '顺便向全校公开吸引高一新生',
        note: '声望 +4 · 经费 +6 · 本周训练 ×1.0',
        apply: () => ({
          log: '全校好多理科实验班学生来看榜，下届招生底气足了。',
          prestige: 4,
          budget: 6,
        }),
      },
    ],
  },
  {
    id: 'wrist_strain',
    tag: '健康',
    title: '手腕腱鞘发炎告警',
    needsTarget: true,
    weight: 0.75,
    text: '{name} 连续几周高强度打板子，今天敲代码时手腕明显发麻疼得使不上劲。',
    options: [
      {
        id: 'care',
        label: '强制改用读题与纸笔推演一周',
        note: '疲劳 −16 · 最弱专题 +0.8% · 2 周后复查',
        apply: (s, t) => ({
          log: `你收了 ${t ?? '他'} 键盘一周，让他光拿草稿纸推式子。`,
          target: { fatigue: -16, ...bump(s, t, 0.008) },
          followUp: { id: 'wrist_recovery', delayWeeks: 2, keepTarget: true },
        }),
      },
      {
        id: 'ergonomic',
        label: '从经费批一批护腕与人体工学键盘',
        note: '经费 −6 · 全队疲劳 −6',
        apply: () => ({
          log: '机房终于换掉了咔咔响的老薄膜键盘，全队都舒坦多了。',
          budget: -6,
          team: { fatigue: -6 },
        }),
      },
      {
        id: 'ignore',
        label: '贴两片膏药再顶几天',
        note: '疲劳 +10 · 本周训练 ×1.05 · 2 周后复查',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 缠着绷带敲代码，你心里隐隐有点打鼓。`,
          target: { fatigue: 10 },
          growthMult: 1.05,
          followUp: { id: 'wrist_recovery', delayWeeks: 2, keepTarget: true },
        }),
      },
    ],
  },
  {
    id: 'wrist_recovery',
    tag: '健康',
    title: '手腕复查结果',
    needsTarget: true,
    weight: 0,
    chainOnly: true,
    text: '两周后 {name} 去校医室复查手腕。',
    options: [
      {
        id: 'check',
        label: '配合医生做物理拉伸恢复',
        note: '疲劳 −8 · 作业 +2',
        apply: (_s, t) => ({
          log: `复查结论不错，${t ?? '他'} 的打字节奏和手腕都稳住了。`,
          target: { fatigue: -8, homework: 2 },
        }),
      },
      {
        id: 'sprint',
        label: '既然没事就补回前面落下的题',
        note: '最弱专题 +1.5% · 疲劳 +6',
        apply: (s, t) => ({
          log: `${t ?? '他'} 一口气把上周划掉的题全补清了。`,
          target: { fatigue: 6, ...bump(s, t, 0.015) },
        }),
      },
    ],
  },
  {
    id: 'oj_down',
    tag: '教学',
    title: '评测机队列堵成长龙',
    needsTarget: false,
    weight: 0.85,
    text: '外网 OJ 晚上突发评测排队 40 分钟，一机房的人交完代码都在干等结果。',
    options: [
      {
        id: 'local_judge',
        label: '断网！改成本地命令行对拍',
        note: '全队作业 +3 · 疲劳 +3 · 本周训练 ×1.05',
        apply: () => ({
          log: '虽然没人看得到绿标了，但大家逼着自己学会了手写对拍和算时间复杂度。',
          team: { homework: 3, fatigue: 3 },
          growthMult: 1.05,
        }),
      },
      {
        id: 'theory_night',
        label: '索性停机开一节口胡推导课',
        note: '本周训练 ×0.95 · 疲劳 −6',
        apply: () => ({
          log: '你在黑板画了整整两小时的树与状态转移，氛围出奇地好。',
          team: { fatigue: -6 },
          growthMult: 0.95,
        }),
      },
    ],
  },
  {
    id: 'cf_midnight',
    tag: '健康',
    title: '半夜打 Codeforces 上瘾',
    needsTarget: true,
    weight: 0.9,
    text: '早上来机房发现 {name} 顶着黑眼圈趴在桌上——昨晚又打完两场凌晨 Div.2 才睡。',
    options: [
      {
        id: 'ban_late',
        label: '严令禁打熬夜场，改成周日白天空余补题',
        note: '疲劳 −10 · 最弱专题 +1%',
        apply: (s, t) => ({
          log: `${t ?? '他'} 苦着脸收起账号，但白天精神头一下好回来了。`,
          target: { fatigue: -10, ...bump(s, t, 0.01) },
        }),
      },
      {
        id: 'vp_allow',
        label: '允许白天空余打 VP，禁熬夜实况',
        note: '疲劳 +2 · 本周训练 ×1.04 · 作业 +2',
        apply: (_s, t) => ({
          log: `改用虚拟赛（VP）练节奏以后，${t ?? '他'} 作息规律了手速也没丢。`,
          target: { fatigue: 2, homework: 2 },
          growthMult: 1.04,
        }),
      },
      {
        id: 'let_grind',
        label: 'Rating 涨得快就先不管他',
        note: '疲劳 +12 · 最弱专题 +1.8%',
        apply: (s, t) => ({
          log: `${t ?? '他'} 打上了新颜色高兴了半天，就是下午模拟赛差点睡着。`,
          target: { fatigue: 12, ...bump(s, t, 0.018) },
        }),
      },
    ],
  },
  {
    id: 'hack_room',
    tag: '竞争',
    title: '互卡常与 Hack 大乱斗',
    needsTarget: false,
    weight: 0.8,
    text: '不知谁带头造了一组专门卡 unordered_map 哈希碰撞和栈溢出的毒瘤数据放进公用测试包。',
    options: [
      {
        id: 'encourage',
        label: '拍手叫好：全员拿这组数据重跑旧代码',
        note: '全队作业 +4 · 疲劳 +5',
        apply: () => ({
          log: '一测吓出一身冷汗，大半队员当场修掉了好几个原本以为稳过的隐蔽漏洞。',
          team: { homework: 4, fatigue: 5 },
        }),
      },
      {
        id: 'moderate',
        label: '提醒适度防卡即可，别全天耗在玄学优化上',
        note: '本周训练 ×1.04 · 疲劳 +1',
        apply: () => ({
          log: '机房恢复了算正经复杂度、抓核心算法的节奏。',
          team: { fatigue: 1 },
          growthMult: 1.04,
        }),
      },
    ],
  },
  {
    id: 'template_book',
    tag: '教学',
    title: '全队手抄模板与代码规范风潮',
    needsTarget: false,
    weight: 0.85,
    text: '考前不少人在整理自己的考场头文件、快读板子、对拍脚本与线段树统一写法。',
    options: [
      {
        id: 'print_pack',
        label: '出钱打印统一装订成校队小册子',
        note: '经费 −5 · 全队作业 +3 · 声望 +2',
        apply: () => ({
          log: '人手一本厚实小册子，新招的初中苗子看得两眼放光。',
          budget: -5,
          team: { homework: 3 },
          prestige: 2,
        }),
      },
      {
        id: 'blind_write',
        label: '组织一次无补全盲敲常见模板测验',
        note: '疲劳 +5 · 本周训练 ×1.06',
        apply: () => ({
          log: '好几个人平时拷贝习惯了，一闭眼默写树剖和后缀数组当场卡壳，赶紧补背。',
          team: { fatigue: 5 },
          growthMult: 1.06,
        }),
      },
    ],
  },
  {
    id: 'math_olympiad',
    tag: '跨界',
    title: '数竞组借人交流',
    needsTarget: true,
    weight: 0.7,
    text: '数学竞赛教练跑来感叹这届数论太难，盯上了推式子很猛的 {name}，想借他去听两天数竞组合讲座。',
    options: [
      {
        id: 'go',
        label: '去听两天组合与数论推导',
        note: '数学专题 +2% · 本周训练 ×0.92 · 声望 +1',
        apply: (_s, t) => ({
          log: `${t ?? '他'} 带着一笔记本生成函数与容斥笔记回机房，笑称赚翻了。`,
          target: { topics: { math: 0.02 }, fatigue: 3 },
          growthMult: 0.92,
          prestige: 1,
        }),
      },
      {
        id: 'invite_back',
        label: '反向邀请数竞老师来机房上一节组合课',
        note: '经费 −4 · 全队数学 +0.8% · 疲劳 +2',
        apply: () => ({
          log: '全队一起补了一波纯数学思维课，DP 和计数题一下子通透不少。',
          budget: -4,
          team: { topics: { math: 0.008 }, fatigue: 2 },
        }),
      },
      {
        id: 'decline',
        label: '竞赛周期吃紧，谢绝了',
        note: '本周训练 ×1.03',
        apply: () => ({
          log: '专注抓回算法主线，没有分散精力。',
          growthMult: 1.03,
        }),
      },
    ],
  },
  {
    id: 'mock_leaked',
    tag: '竞争',
    title: '撞上做过的原题风波',
    needsTarget: false,
    weight: 0.65,
    text: '打校外联考刚开考 20 分钟，机房好几个人嘀咕：T2 好像是上个月在洛谷刷过的原题。',
    options: [
      {
        id: 'honest',
        label: '要求闭眼换新做法重写，不背结论交',
        note: '全队作业 +3 · 疲劳 +4 · 声望 +2',
        apply: () => ({
          log: '队里没人靠背代码水高分，踏实练出了第二解法。',
          team: { homework: 3, fatigue: 4 },
          prestige: 2,
        }),
      },
      {
        id: 'swap_prob',
        label: '果断现场加练两道额外紫题替代',
        note: '本周训练 ×1.06 · 疲劳 +6',
        apply: () => ({
          log: '临时加练拉高了密度，谁都没占到便宜，手热得发烫。',
          team: { fatigue: 6 },
          growthMult: 1.06,
        }),
      },
    ],
  },
  {
    id: 'ac_bus',
    tag: '后勤',
    title: '机房空调集体罢工',
    needsTarget: false,
    weight: 0.75,
    text: '连着几天闷热，机房十几台主机满载运行把室温烘到了三十多度，空调突然不制冷了。',
    options: [
      {
        id: 'repair',
        label: '立刻叫师傅加急修并买冰饮降温',
        note: '经费 −7 · 疲劳 −4',
        apply: () => ({
          log: '半天就抢修好了，冰镇饮料摆上桌，机房重新响起欢快键盘声。',
          budget: -7,
          team: { fatigue: -4 },
        }),
      },
      {
        id: 'library',
        label: '全体带笔记本转移去图书馆大桌',
        note: '本周训练 ×0.92 · 疲劳 +2 · 作业 +2',
        apply: () => ({
          log: '换到空调足的图书馆自习区打了一周模拟，大家反而很安静专注。',
          team: { fatigue: 2, homework: 2 },
          growthMult: 0.92,
        }),
      },
    ],
  },
  {
    id: 'lecture_salon',
    tag: '教学',
    title: '周五晚间选手小讲堂',
    needsTarget: true,
    weight: 0.95,
    text: '按传统轮到 {name} 在周五晚上给大家讲一道本周打得最痛快的好题。',
    options: [
      {
        id: 'deep_dive',
        label: '准备充分：要求从错误尝试讲起',
        note: '最弱专题 +1.5% · 作业 +3 · 疲劳 +3',
        apply: (s, t) => ({
          log: `${t ?? '他'} 把自己写偏三次的全过程贴在白板上，下面听得频频点头。`,
          target: { homework: 3, fatigue: 3, ...bump(s, t, 0.015) },
        }),
      },
      {
        id: 'quick',
        label: '控制半小时讲完，省时间加餐刷题',
        note: '本周训练 ×1.05 · 疲劳 +4',
        apply: () => ({
          log: '短平快抓重点，大家记完核心式子马上接着开敲。',
          team: { fatigue: 4 },
          growthMult: 1.05,
        }),
      },
    ],
  },
  {
    id: 'principal_visit',
    tag: '行政',
    title: '校长突击巡视机房',
    needsTarget: false,
    weight: 0.7,
    text: '晚训正酣时，校长陪着市教研员推门进来查看特色学科建设。',
    options: [
      {
        id: 'showcase',
        label: '大方展示训练看板和梯队规划',
        note: '声望 +4 · 经费 +10 · 本周训练 ×0.95',
        apply: () => ({
          log: '教研员连连赞赏校队梯队完整，校长当场拍板多拨一笔学科经费。',
          prestige: 4,
          budget: 10,
          growthMult: 0.95,
        }),
      },
      {
        id: 'quiet',
        label: '示意队员专注屏幕别被打断',
        note: '本周训练 ×1.04 · 声望 +1',
        apply: () => ({
          log: '一屋子孩子连头都没抬全在调代码，领导站在门外默默点了点头。',
          prestige: 1,
          growthMult: 1.04,
        }),
      },
    ],
  },
  {
    id: 'late_night_tea',
    tag: '氛围',
    title: '考前夜宵与机房夜话',
    needsTarget: false,
    weight: 0.85,
    text: '周末要连轴打模拟，周五九点半训练刚停，几个队员商量着想在楼下买点热饮烤串顺便复盘。',
    options: [
      {
        id: 'treat',
        label: '教练掏经费请客，一起复盘半小时就回',
        note: '经费 −6 · 全队疲劳 −10 · 声望 +1',
        apply: () => ({
          log: '一杯热奶茶下肚，连续刷题攒出来的紧绷感散了大半，队里气氛极好。',
          budget: -6,
          team: { fatigue: -10 },
          prestige: 1,
        }),
      },
      {
        id: 'early_bed',
        label: '吃完不聊题了，十点前必须全部熄灯休息',
        note: '全队疲劳 −14 · 本周训练 ×0.96',
        apply: () => ({
          log: '大家难得十点前躺平，第二天早上的精神像换了支队伍。',
          team: { fatigue: -14 },
          growthMult: 0.96,
        }),
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
