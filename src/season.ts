/**
 * 教练模式 · 生涯引擎（M2：三年周期 + 真实 OI 赛历 + 资格链）
 *
 * 一个学年 = 40 周（9 月 → 次年 7 月），赛历按真实 OI 节奏排：
 *   第 4 周  CSP-S 第一轮（初赛，100 分笔试，过线才能报复赛）
 *   第 8 周  CSP-S 第二轮（复赛，4 题 4 小时）
 *   第 12 周 NOIP（4 题 4.5 小时）
 *   第 16 周 WC 冬令营（3 题 5 小时）
 *   第 21 周 省选（两试，各 3 题 4.5 小时）
 *   第 26 周 APIO（3 题 5 小时）
 *   第 32 周 NOI（100 分笔试 + 两试，各 3 题 5 小时）
 *   第 34 周 CTT（国家集训队集训测试，两试）
 *   第 37 周 CTS（国家队选拔，两试）
 *   第 40 周 IOI（国际赛，两试）
 * 其余周次是训练周 + 周末校内模拟赛（不计入正式成绩，只给反馈）。
 *
 * 资格链：初赛过线 → 复赛；复赛二等及以上 → NOIP；NOIP 省一 → 省选/WC/APIO；
 * 省选进省队 → NOI；NOI 金牌 → CTT 前 30 → CTS 前 4 → IOI。
 * 拿不到资格就只能练一年，等下一个赛季。
 *
 * 生涯 = 3 个学年：每年 6 月高三毕业、高一新生入校，教练重新选队；
 * 3 年后看累计带出了几个省队、几块 NOI 牌。
 *
 * 训练 / 事件 / 比赛都只影响这个模块自己的状态，不碰 game.ts 的比赛循环。
 */
import { ROSTER } from './roster.ts';
import { awardIndexByRank, fieldScores, pctOf, rankAmong, shiftField } from './field.ts';
import type { FieldSpec } from './field.ts';
import { GRADES_BY_NAME } from './grades.ts';
import { TALENT_BY_NAME } from './talent.ts';
import { PROFILE_BY_NAME } from './profile.ts';
import { levelOf } from './levels.ts';
import {
  TOPIC_LIST, TOPIC_NAMES, buildCohort, createContest, finalize, makeRng, tick,
} from './game.ts';
import { EVENT_DEFS, eventDefById } from './events.ts';
import type { PendingEvent, StudentPatch } from './events.ts';
import { ABILITY_CEIL, IS_OPV, NORMAL_ABILITY_CEIL, OPV_ABILITY_CEIL, loadOpvConfig, opvSkills } from './opv.ts';
import type { OpvConfig } from './opv.ts';
import { assignTraits } from './traits.ts';
import type {
  CohortEntry, ContestConfig, ContestFormat, ContestTactic, Problem, Skills, StudentResult, Topic, TraitId,
} from './types.ts';

export const YEAR_WEEKS = 40;
/** 兼容旧脚本的默认值；教练实际可以带任意多年，学年末自己决定是否退休 */
export const CAREER_YEARS = 3;
export const MAX_YEARS = 99;
/** 兼容旧脚本的名字（一学年周数） */
export const SEASON_WEEKS = YEAR_WEEKS;
export const TEAM_MIN = 6;
export const TEAM_MAX = 8;

export interface ContestGuideLine {
  score: number;
  label: string;
  tone: 'gold' | 'silver' | 'bronze' | 'prov1' | 'team';
}

/**
 * 一场「可观看」的比赛：runWeeklyContest 传 trace 时把每场要打的 cfg 记下来，
 * 前端用同一个 cfg 重建 Contest（同 seed 同结果），逐场播放给教练看；
 * 脚本不传 trace，则照旧瞬间算完——两边走的是同一个引擎，结果完全一致。
 */
export interface ContestRound {
  label: string;
  cfg: ContestConfig;
  stageId?: StageId;
  guideLines?: ContestGuideLine[];
}

export type Grade = 1 | 2 | 3 | 4 | 5 | 6;
export const GRADE_NAMES: Record<Grade, string> = { 1: '初一', 2: '初二', 3: '初三', 4: '高一', 5: '高二', 6: '高三' };
/** 初中 / 高中分界：1–3 初中，4–6 高中 */
export const SENIOR_GRADE: Grade = 4;
export const isSenior = (g: Grade) => g >= SENIOR_GRADE;
export const isJunior = (g: Grade) => g < SENIOR_GRADE;

export type StageId = 'csp1' | 'csp2' | 'noip' | 'wc' | 'prov' | 'apio' | 'noi' | 'ctt' | 'cts' | 'ioi';

/** 奖项档：pct = 全国前百分之几（含）能拿这个奖 */
export interface AwardBand {
  pct: number;
  label: string;
  tone: 'gold' | 'silver' | 'bronze' | 'prov1' | 'team';
}

export interface StageDef {
  id: StageId;
  week: number;
  name: string;
  short: string;
  kind: 'prelim' | 'contest';
  /** 赛制：oi = 盲测估分/最后提交/有 freopen；ioi = 实时评测/取最高分/无 freopen */
  format?: ContestFormat;
  /** J 组 / S 组 / BOTH = 同场分 J、S 两组 / OPEN = 不分学段 */
  group: 'J' | 'S' | 'BOTH' | 'OPEN';
  levels: number[];
  /** 每题难度范围（1-115），按历年真题难度定；初赛（笔试）不用 */
  ranges?: [number, number][];
  /** 引擎原始得分率 → 赛事真实得分率 的分段线性曲线（按历年真题得分率校准） */
  curve?: [number, number][];
  /** J/S 同场分卷时，J 组另一套难度范围 */
  rangesJ?: [number, number][];
  /** 本次卷子的难度档（1–8），以及由它换算出的分数线浮动（分） */
  paperD?: number[];
  paperShift?: number;
  minutes: number;
  days: number;
  gate: StageId | null;
  gateText: string;
  advanceText: string;
  clock: string;
  /** 全国参赛人数（官方数据；推算的写在 note 里） */
  national: number;
  /** 得分率 → 全国分位的锚点（分位 = 全国前多少比例） */
  anchors: [number, number][];
  /** 奖项线（按全国分位），空数组 = 不评奖 */
  bands: AwardBand[];
  note?: string;
}

/**
 * 一学年的真实赛历（9 月第 1 周起算），参数按 2025–2026 赛季官方规程：
 * 初赛 100 分 2h（陕西 2025 S 线 37 / J 线 37.5，对应全国 80%/70% 位次）；
 * 复赛 S 组 4 题 4h、J 组 4 题 3.5h，一等/二等/三等 ≈ 全国前 20%/45%/75%；
 * NOIP 4 题 4.5h，全国获奖 67%（一等 20%、二等 22%、三等 25%），基准线 137/108/86；
 * WC 冬令营学生营员测试 1 场，不评奖（国家队从国家集训队里选）；
 * 省选两试各 4.5h，总分 = NOIP 标准分×30% + 省选标准分×70%，省队按上限 A 5 + B 12 = 17 人；
 * APIO 中国区 3 题 5h，金 64 / 银 128 / 铜 193（参赛约 600 名选手）；
 * NOI 两试各 5h，正式选手约 337 人，金 50 / 银 152 / 铜 85（85% 获奖）。
 */
export const YEAR_STAGES: StageDef[] = [
  {
    id: 'csp1', week: 4, name: 'CSP 第一轮（初赛）', short: '初赛',
    kind: 'prelim', group: 'S', levels: [], minutes: 120, days: 1, gate: null, gateText: '',
    advanceText: '过线才能参加第二轮', clock: '9 月中旬 · 第一轮',
    national: 34400, anchors: [], bands: [],
    note: '全校一张卷（S 卷），陕西线 37 分；晋级名额不少于实考 20%',
  },
  {
    id: 'csp2', week: 8, name: 'CSP 第二轮（复赛）', short: '复赛',
    kind: 'contest', format: 'oi', group: 'S', levels: [1, 3, 7, 7], minutes: 240, days: 1,
    // 历年 CSP-S2：T1 普及+/提高-、T2 提高、T3 提高+、T4 省选
    ranges: [[20, 32], [48, 58], [100, 110], [106, 114]],
    // 校准：引擎原始得分率 → 2025 陕西 S 组真实得分率（强选手 84% ≈ 336 分）
    curve: [[0, 0], [0.25, 0.12], [0.32, 0.26], [0.38, 0.5], [0.45, 0.85], [0.6, 0.95], [1, 1]],
    gate: 'csp1', gateText: '初赛过线', advanceText: 'S 组二等及以上进 NOIP 名单',
    clock: '10 月底 · OI 赛制 · 4 小时',
    national: 785,
    anchors: [[0.2, 0.75], [0.4, 0.45]],
    bands: [
      { pct: 0.2, label: '省一', tone: 'prov1' },
      { pct: 0.45, label: '省二', tone: 'silver' },
      { pct: 0.75, label: '省三', tone: 'bronze' },
    ],
    note: '2025 赛季：陕西 S 组 785 人参赛、一等线 100 分、157 人、二等线 30 分，不设三等',
  },
  {
    id: 'noip', week: 12, name: 'NOIP', short: 'NOIP',
    kind: 'contest', format: 'oi', group: 'S', levels: [2, 7, 7, 7], minutes: 270, days: 1,
    // 历年 NOIP：T1 提高-、T2 提高、T3 提高+、T4 省选
    ranges: [[32, 42], [100, 110], [106, 114], [106, 114]],
    // 校准：NOIP 2025 陕西一等线 128（≈32%）、二等 95、三等 86；强选手 ~67%（270 分）
    curve: [[0, 0], [0.15, 0.28], [0.3, 0.5], [0.4, 0.62], [0.5, 0.72], [0.65, 0.85], [1, 1]],
    gate: 'csp2', gateText: 'CSP-S 二等及以上（限高中生）', advanceText: '一等进省选 / WC / APIO 名单',
    clock: '11 月底 · OI 赛制 · 4.5h',
    national: 7725,
    anchors: [[0.215, 0.67], [0.27, 0.42], [0.3425, 0.2]],
    bands: [
      { pct: 0.2, label: 'NOIP 一等', tone: 'prov1' },
      { pct: 0.42, label: 'NOIP 二等', tone: 'silver' },
      { pct: 0.67, label: 'NOIP 三等', tone: 'bronze' },
    ],
    note: '全国高中生参赛约 7,725 人（一等 1,545 人 ÷ 20%）；基准线 137/108/86',
  },
  {
    id: 'ctt', week: 14, name: 'CTT 国家集训队集训', short: 'CTT',
    kind: 'contest', format: 'ioi', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 3,
    // 集训队测试（12 月）：NOI 金 ~ IOI 级，三场，IOI 实时评测赛制
    ranges: [
      [96, 108], [104, 112], [106, 114],
      [100, 110], [104, 114], [106, 114],
      [100, 110], [106, 114], [106, 114],
    ],
    curve: [[0, 0], [0.1, 0.3], [0.25, 0.55], [0.45, 0.78], [0.65, 0.9], [1, 1]],
    gate: 'noi', gateText: '上学年 NOI 前 50（国家集训队）', advanceText: '总成绩前 30 名进 CTS',
    clock: '12 月中旬 · IOI 赛制 · 三试',
    national: 50, anchors: [[0.2, 0.85], [0.5, 0.55], [0.8, 0.2]], bands: [],
    note: '跨学年国集周期：上学年 NOI 进国集队员参加；总成绩 = 作业/互测 10% + CTT 三场各 18%（54%），前 30 进 CTS',
  },
  {
    id: 'wc', week: 18, name: 'WC 冬令营', short: 'WC',
    kind: 'contest', format: 'ioi', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 1,
    // WC 学生营员测试：省选 ~ NOI-，IOI 实时评测赛制，评金银铜牌
    ranges: [[100, 110], [104, 114], [106, 114]],
    // 校准：WC2025 金线 257/300、银线 211、铜线 167
    curve: [[0, 0], [0.1, 0.35], [0.2, 0.6], [0.35, 0.82], [0.5, 0.92], [1, 1]],
    gate: 'noip', gateText: 'NOIP 一等（省推荐名额）', advanceText: '冬令营金银铜牌',
    clock: '次年 1–2 月 · IOI 赛制 · 5h',
    national: 500, anchors: [[0.557, 0.68], [0.703, 0.386], [0.857, 0.112]],
    bands: [
      { pct: 0.112, label: '金牌', tone: 'gold' },
      { pct: 0.386, label: '银牌', tone: 'silver' },
      { pct: 0.68, label: '铜牌', tone: 'bronze' },
    ],
    note: 'WC 学生营员测试采用 IOI 实时评测赛制，满分 300；按全国名次评金/银/铜牌（约 500 人：金 56 / 银 137 / 铜 147）',
  },
  {
    id: 'cts', week: 19, name: 'CTS 国家队选拔', short: 'CTS',
    kind: 'contest', format: 'ioi', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 2,
    // 国家队选拔（与 WC 同期）：IOI 级，两试，IOI 实时评测赛制
    ranges: [
      [104, 112], [106, 114], [106, 114],
      [104, 112], [106, 114], [106, 114],
    ],
    curve: [[0, 0], [0.08, 0.25], [0.2, 0.5], [0.4, 0.75], [0.62, 0.9], [1, 1]],
    gate: 'ctt', gateText: 'CTT 总成绩前 30 名', advanceText: '前 6 名答辩 → 前 4 名国家队',
    clock: '次年 1–2 月 · IOI 赛制 · 两试',
    national: 30, anchors: [[0.15, 0.9], [0.45, 0.6], [0.75, 0.25]], bands: [],
    note: '与 WC 同期举行：总成绩 = 作业/互测 10% + CTT 54% + CTS 两场各 18%（36%）；前 6 名进入论文答辩，定 4 人国家队',
  },
  {
    id: 'prov', week: 23, name: '省选（两试）', short: '省选',
    kind: 'contest', format: 'oi', group: 'OPEN', levels: [6, 7, 7], minutes: 270, days: 2,
    // 省选两试：T1 提高+、T2 省选-、T3 省选/NOI
    ranges: [
      [74, 94], [102, 112], [106, 114],
      [74, 94], [102, 112], [106, 114],
    ],
    // 校准：省选两试合计 600 分，陕西最高约 350–400、省队线约 300
    curve: [[0, 0], [0.3, 0.4], [0.5, 0.62], [0.65, 0.78], [0.8, 0.9], [1, 1]],
    gate: 'noip', gateText: 'NOIP 正式选手（高一/高二；初中须达一等线体验）', advanceText: '省队 17 个名额：A 类 5（NOI+5分）+ B 类 12',
    clock: '次年 3 月上旬 · OI 赛制 · 两试',
    national: 160, anchors: [[0.2, 0.5], [0.27, 0.2], [0.32, 0.05]], bands: [],
    note: '总分 = NOIP 标准分×30% + 省选标准分×70%；前 5 名为 A 类（NOI +5 分），单校不超过 1/3（最多 5 人）；初中生达省队线可获 NOI E 类资格',
  },
  {
    id: 'apio', week: 28, name: 'APIO', short: 'APIO',
    kind: 'contest', format: 'ioi', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 1,
    // APIO 中国区：省选 ~ NOI-，IOI 实时评测赛制
    ranges: [[94, 104], [100, 110], [106, 114]],
    // 校准：APIO2025 中国区 300 分、金 193 / 银 130 / 铜 80
    curve: [[0, 0], [0.3, 0.42], [0.45, 0.55], [0.6, 0.7], [0.8, 0.88], [1, 1]],
    gate: 'noip', gateText: '省队或 NOIP 一等（高中生）', advanceText: '亚太赛金银铜',
    clock: '次年 5 月 · IOI 赛制 · 5h',
    national: 640, anchors: [[0.267, 0.517], [0.433, 0.258], [0.643, 0.086]],
    bands: [
      { pct: 0.1, label: '金牌', tone: 'gold' },
      { pct: 0.3, label: '银牌', tone: 'silver' },
      { pct: 0.6, label: '铜牌', tone: 'bronze' },
    ],
    note: 'APIO 中国区采用 IOI 实时评测赛制，约 640 人参赛（省队 + NOIP 一等高中生）；金 64 / 银 128 / 铜 193（线 193/130/80）',
  },
  {
    id: 'noi', week: 34, name: 'NOI（两试）', short: 'NOI',
    kind: 'contest', format: 'oi', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 2,
    // NOI 两试：NOI ~ NOI+
    ranges: [
      [90, 100], [102, 112], [106, 114],
      [90, 100], [102, 112], [106, 114],
    ],
    // 按 NOI2026 游记校准：满分 705 = 笔试 100 + 两试各 300 + A 类加分 5
    curve: [[0, 0], [0.1, 0.74], [0.2, 0.94], [0.3, 0.97], [0.45, 1], [1, 1]],
    gate: 'prov', gateText: '省队（或初中生省选达省队线 E 类）', advanceText: '前 50 金牌进下学年国集（保送清北）',
    clock: '次年 7 月 · OI 赛制 · 笔试 + 两试',
    national: 338, anchors: [[0.25, 0.85], [0.4, 0.6], [0.55, 0.148]],
    bands: [
      { pct: 0.148, label: '金牌', tone: 'gold' },
      { pct: 0.6, label: '银牌', tone: 'silver' },
      { pct: 0.85, label: '铜牌', tone: 'bronze' },
    ],
    note: '正式选手约 338 人：金 50 / 银 152 / 铜 85；满分 705（笔试 100 + 两试 600 + 省队 A 类 5 分）；前 50 入选下学年国家集训队（CTT）并获保送资格',
  },
  {
    id: 'ioi', week: 39, name: 'IOI 国际信息学奥林匹克', short: 'IOI',
    kind: 'contest', format: 'ioi', group: 'OPEN', levels: [6, 7, 7], minutes: 300, days: 2,
    // IOI：中国队 4 人出征国际赛（全球约 353 人，满分 600，IOI 实时评测赛制）
    ranges: [
      [44, 52], [104, 112], [106, 114],
      [44, 52], [104, 112], [106, 114],
    ],
    curve: [[0, 0], [0.08, 0.3], [0.2, 0.58], [0.4, 0.82], [0.62, 0.93], [1, 1]],
    gate: 'cts', gateText: '本学年 CTS 前 4 名（国家队）', advanceText: '国际赛金银铜（全球前 1/12 金）',
    clock: '次年 8 月 · IOI 赛制 · 两试',
    national: 353, anchors: [[0.358, 0.5], [0.55, 0.25], [0.733, 0.085]],
    bands: [
      { pct: 30 / 353, label: '金牌', tone: 'gold' },
      { pct: 89 / 353, label: '银牌', tone: 'silver' },
      { pct: 177 / 353, label: '铜牌', tone: 'bronze' },
    ],
    note: '中国队 4 人出征国际赛（全球约 353 人，满分 600，IOI 实时评测赛制）；按全球前 1/12 金（30）、前 1/4 银（59）、前 1/2 铜（88）发牌',
  },
];

/** 洛谷难度档（1–8）→ 引擎难度中心（1–115） */
const D_CENTER: Record<number, number> = { 1: 8, 2: 22, 3: 37, 4: 52, 5: 78, 6: 94, 7: 106, 8: 112 };

/** 难度档 → 颜色档 id（引擎 LEVELS 0–7） */
function colorOfD(d: number): number {
  if (d <= 1) return 0;
  if (d === 2) return 1;
  if (d === 3) return 2;
  if (d === 4) return 3;
  if (d === 5) return 4;
  if (d === 6) return 5;
  if (d === 7) return 6;
  return 7;
}

/** 历年真题每题难度（洛谷 difficulty，1–8）。多试赛事按「第 1 试 3 题 + 第 2 试 3 题」拼接。 */
export const PAPER_HISTORY: Record<string, Record<number, number[]>> = {
  // CSP-S 复赛
  csp2: {
    2019: [2, 4, 8, 6],
    2020: [4, 3, 6, 8],
    2021: [4, 6, 4, 7],
    2022: [5, 4, 7, 7],
    2023: [2, 5, 6, 6],
    2024: [2, 4, 5, 8],
    2025: [3, 5, 6, 7],
    2026: [2, 4, 7, 8],
  },
  // CSP-J 复赛（目前只用来给初一/初二的比赛出题参考）
  cspj: {
    2021: [2, 3, 3, 4],
    2022: [1, 2, 4, 3],
    2023: [2, 2, 3, 4],
    2024: [1, 2, 3, 5],
    2025: [2, 2, 3, 3],
  },
  // NOIP
  noip: {
    2021: [3, 6, 7, 8],
    2022: [4, 6, 7, 7],
    2023: [2, 4, 7, 6],
    2024: [5, 4, 7, 7],
    2025: [3, 7, 8, 8],
  },
  // WC（3 题）
  wc: {
    2024: [4, 7, 8],
    2025: [4, 7, 8],
    2026: [7, 8, 8],
  },
  // 省选联考（两试各 3 题）
  prov: {
    2025: [5, 7, 8, 6, 8, 8],
    2026: [6, 7, 8, 5, 8, 8],
  },
  // APIO 中国区（3 题）
  apio: {
    2025: [8, 8, 6],
    2026: [8, 7, 8],
  },
  // NOI（两试各 3 题；不含笔试）
  noi: {
    2024: [7, 7, 8, 8, 8, 8],
    2025: [4, 6, 7, 8, 8, 8],
    2026: [6, 7, 8, 7, 8, 8],
  },
  // CTT（三试，每天 3 题）
  ctt: {
    2024: [6, 7, 8, 7, 7, 8, 7, 8, 8],
    2025: [7, 7, 8, 7, 8, 8, 7, 8, 8],
  },
  // CTS（两试）
  cts: {
    2025: [7, 8, 8, 8, 8, 8],
    2026: [8, 8, 8, 8, 8, 8],
  },
  // IOI（两天，每天 3 题）
  ioi: {
    2024: [5, 7, 8, 8, 8, 8],
    2026: [3, 8, 8, 8, 8, 8],
  },
};

/** 中位数 */
function median(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 每个题位「历年难度的中位数」——这是合理范围的中心，不是某一年的原卷 */
export function paperBaseProfile(stageId: string): number[] | null {
  const table = PAPER_HISTORY[stageId];
  if (!table) return null;
  const years = Object.keys(table).map(Number).sort((x, y) => x - y);
  const len = table[years[0]].length;
  const out: number[] = [];
  for (let i = 0; i < len; i += 1) {
    // 近年权重更大：难度有逐年走高的趋势，不能把 2019 和 2026 等权平均
    let sum = 0;
    let wsum = 0;
    years.forEach((y, k) => {
      const w = k + 1;
      sum += table[y][i] * w;
      wsum += w;
    });
    out.push(sum / wsum);
  }
  return out;
}

/** 标准正态（Box–Muller），给卷面随机化用 */
function paperGauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 生成「某一年的卷子」：以历年同题位难度中位数为锚，叠加
 * 整卷偏难/偏易（年份运气）和逐题噪声，限制在锚点 ±2 档以内。
 * 所以不会照搬任何一年，但也不会出现「T1 是黑题」这种离谱情况。
 * 同时按「实际均难度 − 基准均难度」换算出分数线浮动 paperShift。
 */
export function stagePaperForYear(stage: StageDef, year: number, seed: number): StageDef {
  const base = paperBaseProfile(stage.id);
  const perDay = stage.levels.length;
  if (!base || base.length !== perDay * stage.days) return stage;
  // 每场赛事用各自的随机流：同一年里不同比赛不会一起“全简单/全难”
  let h = 2166136261;
  for (const ch of stage.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = makeRng((seed * 7919 + year * 104729 + (h >>> 0) + 12345) >>> 0);
  const bias = Math.max(-1, Math.min(1, paperGauss(rng) * 0.5));
  // 每个题位历年真实出现过的上下限：随机只在这个区间里晃，
  // 避免「CSP-S T1 出 d1」「NOI D1T1 出 d4」这种历史上从没有过的卷面
  const years = Object.keys(PAPER_HISTORY[stage.id]).map(Number);
  const lo = base.map((_, i) => Math.min(...years.map((y) => PAPER_HISTORY[stage.id][y][i])));
  const hi = base.map((_, i) => Math.max(...years.map((y) => PAPER_HISTORY[stage.id][y][i])));
  const ds = base.map((b, i) => {
    const c = Math.round(b);
    const raw = Math.round(b + bias + paperGauss(rng) * 0.7);
    const band = Math.max(c - 2, Math.min(c + 2, raw));
    return Math.max(lo[i], Math.min(hi[i], Math.max(1, Math.min(8, band))));
  });
  const full = ds.length * 100;
  const baseAvg = base.reduce((x, y) => x + y, 0) / base.length;
  const avg = ds.reduce((x, y) => x + y, 0) / ds.length;
  // 每难 1 档 ≈ 400 分制下掉 24 分；按本场满分缩放，浮动上限 ±8%（再取整到 5 分）
  const raw = (baseAvg - avg) * 24 * (full / 400);
  const cap = full * 0.08;
  const shift = Math.round(Math.max(-cap, Math.min(cap, raw)) / 5) * 5;
  return {
    ...stage,
    // 多试赛事：levels 是「每天几题」，ranges 才是两试拼起来的总表
    levels: ds.slice(0, perDay).map(colorOfD),
    ranges: ds.map((d) => {
      const c = D_CENTER[d] ?? 52;
      return [Math.max(5, c - 5), Math.min(115, c + 5)] as [number, number];
    }),
    paperD: ds,
    paperShift: shift,
  };
}

/** 本场卷子带来的分数线浮动（分） */
export function paperShiftOf(stage: StageDef): number {
  return stage.paperShift ?? 0;
}

/** 省线随卷面难度整体浮动 */
function shiftLines(lines: ScoreLine[], shift: number): ScoreLine[] {
  if (!shift) return lines;
  return lines.map((l) => ({ ...l, min: Math.max(0, Math.round((l.min + shift) / 5) * 5) }));
}

/** 初赛：陕西 2025 S 线 37 分，全国分位按真实全客观题卷面分布校准 */
export const PRELIM_NATIONAL_S = 34400;
/** 全国 CSP-S 初赛分位锚点（30 分纯蒙底线 ≈ 前 85%，45 分全国中位 ≈ 前 50%，60 分 ≈ 前 22%，75 分 ≈ 前 7%，88 分 ≈ 前 1.5%） */
export const PRELIM_ANCHORS_S: [number, number][] = [
  [0.30, 0.85],
  [0.45, 0.50],
  [0.60, 0.22],
  [0.75, 0.07],
  [0.88, 0.015],
];

/** 在锚点之间线性插值出「全国前多少比例」；两端补 (0, 100%) 和 (满分, 1%) */
export function pctFromAnchors(anchors: [number, number][], ratio: number): number {
  const pts = ([[0, 1], ...anchors, [1, 0.01]] as [number, number][]).sort((a, b) => a[0] - b[0]);
  const r = Math.max(0, Math.min(1, ratio));
  for (let i = 1; i < pts.length; i++) {
    const [r0, p0] = pts[i - 1];
    const [r1, p1] = pts[i];
    if (r <= r1) {
      const t = r1 === r0 ? 0 : (r - r0) / (r1 - r0);
      return Math.max(0.005, Math.min(1, p0 + (p1 - p0) * t));
    }
  }
  return 0.01;
}

export function stageOfWeek(week: number): StageDef | null {
  return YEAR_STAGES.find((s) => s.week === week) ?? null;
}

/** 下一场比赛（含本周） */
export function nextStage(s: SeasonState): StageDef | null {
  return YEAR_STAGES.find((st) => st.week >= s.week) ?? null;
}

export type WeekIntensity = 'normal' | 'extra' | 'rest';
export type SeasonPhase = 'team' | 'plan' | 'report' | 'result' | 'yearEnd' | 'finished';

export interface SeasonStudent {
  name: string;
  skills: Skills;
  startSkills: Skills;
  /** 初一 ~ 高三（1–3 初中，4–6 高中） */
  grade: Grade;
  /** 本学年开始时的综合与排名 */
  startOverall: number;
  startRank: number;
  /** 0-100 的疲劳 */
  fatigue: number;
  /** 0-100 的作业/互测分：训练出勤 + 校内模拟赛表现，国集选拔占 10% */
  homework: number;
  /** 还要缺席几周的正式比赛（伤病 / 处分等事件） */
  sitOut: number;
  /** 个体天赋 1.0-1.3，决定同样训练涨多快 */
  talent: number;
  onTeam: boolean;
  /** 梯队/预备队：每周跟着练、打校内模拟赛，成长慢一点，但不占正赛名额 */
  onReserve: boolean;
  /** 哪一年入校（1..3，转年新生） */
  joined: number;
  /** 岁数（仅 OPv 自定义开局设置，原版名单没有这个字段） */
  age?: number;
  /** 选手轻量特性词条 */
  traits?: TraitId[];
  /** 新生苗子特性是否已揭示（打满 3 场或第 6 周后自动揭晓） */
  traitsRevealed?: boolean;
  /** 本人累计打过的比赛场数 */
  contestsPlayed?: number;
  // ===== 跨学年国集资格（上学年 NOI 前 50 结转到本学年 12 月 CTT / 2 月 CTS / 8 月 IOI）=====
  cttEligible?: boolean;
  /** 上学年 NOI 总分（满分 705），供本学年 CTS 答辩折算 */
  prevNoiScore?: number;
  // ===== 本学年资格链（每年 6 月清空）=====
  csp1?: { score: number; passed: boolean };
  csp2?: { score: number; rank: number; award: 0 | 1 | 2 | 3 };
  noip?: { score: number; rank: number; first: boolean; reachedFirstLine?: boolean };
  wc?: { score: number; medal: 0 | 1 | 2 | 3 };
  prov?: { score: number; rank: number; first: boolean; team: boolean; category?: 'A' | 'B'; raw?: number };
  apio?: { score: number; medal: 0 | 1 | 2 | 3 };
  noi?: { score: number; medal: 0 | 1 | 2 | 3; selected?: boolean; baosong?: boolean };
  ctt?: { score: number; rank: number; selected: boolean; composite?: number };
  cts?: { score: number; rank: number; selected: boolean; composite?: number; defenseRank?: number };
  ioi?: { score: number; medal: 0 | 1 | 2 | 3 };
}

export type SquadFocus = 'main' | 'balanced' | 'reserve';

export type CareAction = 'rest' | 'weak' | 'meta';
export interface CareOrder {
  name: string;
  action: CareAction;
}
export const CARE_MAX = 2;
export const CARE_INFO: Record<CareAction, { name: string; short: string; note: string }> = {
  rest: { name: '单人轮休', short: '休', note: '本周不练，单独大幅回疲劳，不影响全队训练' },
  weak: { name: '专项补短', short: '短', note: '改练自己最弱专题且效率 ×1.35（额外疲劳 +3）' },
  meta: { name: '代码调试', short: '码', note: '强化编码/调试/阅读，压低写挂率（专题效率 ×0.65）' },
};

export type SpecialProjectId = 'suspend' | 'camp' | 'alumni' | 'drill';
export interface SpecialProjectDef {
  id: SpecialProjectId;
  name: string;
  costBudget: number;
  costSuspend: number;
  limitPerYear?: number;
  note: string;
  icon: 'flag' | 'rocket' | 'award' | 'target';
}

export const SPECIAL_PROJECTS: SpecialProjectDef[] = [
  {
    id: 'suspend',
    name: '申请停课集训',
    costBudget: 0,
    costSuspend: 1,
    note: '全队本周成长 ×1.45、作业 +3；额外疲劳 +10，下周文化课压力事件概率翻倍',
    icon: 'flag',
  },
  {
    id: 'camp',
    name: '外校联训营',
    costBudget: 25,
    costSuspend: 0,
    limitPerYear: 3,
    note: '主专题成长 ×1.65（突破 120 后衰减减缓）+ 顺手补弱项；额外疲劳 +14，每学年限 3 次',
    icon: 'rocket',
  },
  {
    id: 'alumni',
    name: '请往届学长讲课',
    costBudget: 15,
    costSuspend: 0,
    note: '邀毕业强手返校讲其最强专题，定向补专题 + 提调试阅读 + 全队疲劳 −4',
    icon: 'award',
  },
  {
    id: 'drill',
    name: '赛前防挂题包',
    costBudget: 12,
    costSuspend: 0,
    note: '全队代码/调试显著提升、作业 +4；本周专题成长 ×0.8、额外疲劳 +4',
    icon: 'target',
  },
];

export interface HonorEntry {
  year: number;
  grade: Grade;
  stageId: StageId;
  stageShort: string;
  score: number;
  rank: number;
  award: string;
}

export interface StudentArchive {
  name: string;
  joinedYear: number;
  graduatedYear: number | null;
  entryGrade?: Grade;
  underdog?: boolean;
  startOverall: number;
  peakOverall: number;
  maxGrade: Grade;
  bestTopic: Topic;
  destination?: string;
  provFirsts: number;
  provTeams: number;
  noiGold: number;
  noiSilver: number;
  noiBronze: number;
  noiSelected: number;
  ioiMedals: number;
  officialCount: number;
  worstDrop?: { year: number; stageShort: string; problemId: number; delta: number; reason: string };
  bestGain?: { year: number; stageShort: string; problemId: number; delta: number; reason: string };
  honors: HonorEntry[];
}

export interface RecordEntry {
  name: string;
  year: number;
  value: number;
  detail: string;
}

export interface SeasonRecords {
  highestOverall?: RecordEntry;
  highestOfficialRatio?: RecordEntry;
  worstDrop?: RecordEntry;
  bestGain?: RecordEntry;
  fastestGrowth?: RecordEntry;
  mostOfficialContests?: RecordEntry;
}

export interface WeekPlan {
  topic: Topic | null;
  intensity: WeekIntensity;
  /** 教练精力分配：主力优先 / 均衡 / 梯队优先 */
  focus?: SquadFocus;
  /** 梯队单独专题（不传则跟随主力专题） */
  reserveTopic?: Topic | null;
  /** 每周最多 2 个人的个别关照微调 */
  care?: CareOrder[];
  /** 每周最多选 1 项战略特训项目 */
  special?: SpecialProjectId | null;
  /** 请往届学长讲课时指定的毕业生名字 */
  alumniName?: string | null;
  /** 校内模拟赛配置：难度档 / 题数 / 时长 */
  mock?: MockConfig;
}

export type MockPreset = 'easy' | 'normal' | 'hard';

export interface MockConfig {
  preset: MockPreset;
  problemCount: number;
  minutes: number;
}

export const MOCK_PRESETS: Record<MockPreset, { name: string; levels: number[]; note: string }> = {
  easy: { name: '基础', levels: [1, 2, 3], note: '普及- ~ 普及，练手' },
  normal: { name: '提高', levels: [3, 4, 5], note: '普及+ ~ 提高+，常规' },
  hard: { name: '冲刺', levels: [4, 5, 6], note: '提高+ ~ 省选-，赛前冲刺' },
};

export interface TrainingLine {
  name: string;
  text: string;
  tone: 'good' | 'ok' | 'flat' | 'bad';
  fatigue: number;
}

export interface TrainingReport {
  week: number;
  plan: WeekPlan;
  lines: TrainingLine[];
  specialNote?: string;
  breakthroughNote?: string;
}

export type ScenarioId = 'standard' | 'desert' | 'lastStand';
export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  badge: string;
  note: string;
  yearsLabel: string;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'standard',
    name: '标准校队',
    badge: '默认',
    note: '声望 50 开局，传承正常校队梯度，自由执教多年打造百年强校',
    yearsLabel: '不限学年',
  },
  {
    id: 'desert',
    name: '荒漠重建',
    badge: '高难挑战',
    note: '声望 20 · 经费 25 · 停课 1 周 · 全员从零起步，5 年极限冲省队',
    yearsLabel: '5 年重建',
  },
  {
    id: 'lastStand',
    name: '背水一战',
    badge: '单季冲刺',
    note: '仅有 1 学年窗口！声望 65 · 经费 90 · 停课 5 周，一季定胜负',
    yearsLabel: '1 年限时',
  },
];

export type SeasonGoalId = 'safe' | 'ambitious' | 'gamble';
export interface SeasonGoalDef {
  id: SeasonGoalId;
  name: string;
  requirement: string;
  rewardText: string;
  penaltyText: string;
}

export const SEASON_GOALS: SeasonGoalDef[] = [
  {
    id: 'safe',
    name: '稳健保底',
    requirement: '本学年省一（CSP-S / NOIP）≥ 2 人',
    rewardText: '经费 +10 · 声望 +2',
    penaltyText: '声望 −3',
  },
  {
    id: 'ambitious',
    name: '进取争先',
    requirement: '本学年省队 ≥ 1 人 或 省一 ≥ 4 人',
    rewardText: '经费 +18 · 下学年停课 +1 周 · 声望 +4',
    penaltyText: '声望 −5',
  },
  {
    id: 'gamble',
    name: '豪赌冲金',
    requirement: '本学年 NOI 奖牌 ≥ 1 块 或 省队 ≥ 3 人',
    rewardText: '经费 +30 · 下学年停课 +2 周 · 声望 +7',
    penaltyText: '声望 −8',
  },
];

export interface GoalResult {
  goalId: SeasonGoalId;
  title: string;
  met: boolean;
  note: string;
  rewardBudget: number;
  rewardSuspend: number;
  deltaPrestige: number;
}

export interface RivalComparison {
  school: string;
  isLocal: boolean;
  ace: string;
  aceScore: number;
  ourTop: number;
  rivalMedals: number;
  ourMedals: number;
  beaten: boolean;
}

export type ContestKind = 'practice' | 'prelim' | 'official';

export interface AwardRow {
  name: string;
  label: string;
  tone: 'gold' | 'silver' | 'bronze' | 'prov1' | 'team';
}

export interface ContestRecap {
  year: number;
  week: number;
  kind: ContestKind;
  format?: ContestFormat;
  stageId?: StageId;
  title: string;
  levels: number[];
  minutes: number;
  days: number;
  rows: StudentResult[];
  fullScore: number;
  problems: Problem[];
  /** 初赛成绩（只有 kind==='prelim'） */
  prelim?: {
    name: string; score: number; passed: boolean; onTeam: boolean;
    /** 全国排名（按分组全国人数折算） */
    nationalRank?: number; pct?: number;
  }[];
  /** 正赛的全国排名（参赛人数 × 得分分位） */
  national?: {
    total: number;
    rows: { name: string; score: number; raw?: number; rank: number; pct: number; award: string; team: boolean; note?: string; tone?: AwardRow['tone'] }[];
  };
  /** 官方赛事的奖项 / 头衔 */
  awards?: AwardRow[];
  /** CTS 前 6 的论文答辩分（纯派生，无竞赛环节） */
  defense?: { name: string; score: number; rank: number }[];
  /** 拿到下一阶段资格的人 */
  advanced?: string[];
  /** 因伤病/处分停赛而缺考的人（赛后 sitOut 已消耗，只能从 recap 里查到赛前名单） */
  absent?: string[];
  /** 本场使用的赛前战术指令 */
  tactic?: ContestTactic;
  /** 宿敌名校赛后对位结果 */
  rivals?: RivalComparison[];
  note?: string;
  cutoff?: number;
}

export interface YearSummary {
  year: number;
  team: string[];
  csp1Pass: number;
  csp2First: number;
  csp2Second: number;
  noipFirst: number;
  provTeam: number;
  wcGold: number;
  wcSilver: number;
  wcBronze: number;
  apioGold: number;
  apioSilver: number;
  apioBronze: number;
  noiGold: number;
  noiSilver: number;
  noiBronze: number;
  /** NOI 前 50 进国集（同时获得保送资格） */
  noiSelected: number;
  cttSelected: number;
  ctsSelected: number;
  ioiGold: number;
  ioiSilver: number;
  ioiBronze: number;
  avgOverallGain: number;
  graduates: string[];
  goalResult?: GoalResult;
}

export interface SeasonState {
  seed: number;
  careerYears: number;
  /** 第几个学年 1..careerYears */
  year: number;
  /** 当前周 1..YEAR_WEEKS；跑完最后一周变 YEAR_WEEKS + 1 */
  week: number;
  phase: SeasonPhase;
  students: SeasonStudent[];
  team: string[];
  /** 梯队/预备队（不占正赛名额，但跟着训练、打校内模拟赛） */
  reserve: string[];
  /** 学校声望 0–100，影响新生质量 */
  prestige: number;
  plan: WeekPlan | null;
  /** 上一周实际排的方案（下一周默认沿用） */
  lastPlan?: WeekPlan | null;
  report: TrainingReport | null;
  lastContest: ContestRecap | null;
  /** 本学年的比赛记录 */
  contests: ContestRecap[];
  /** 上周的队伍（新学年"沿用上季阵容"用） */
  lastTeam: string[];
  /** 上季的梯队（新学年选队页预填） */
  lastReserve: string[];
  /** 本学年毕业的高三学生（选队页展示） */
  graduates: { name: string; grade: Grade; overall: number; destination?: string }[];
  /** 本学年新入学的高一新生 */
  newcomers: string[];
  /** 历年总结 */
  history: YearSummary[];
  /** 校队经费（点数，1 点≈1 千元） */
  budget?: number;
  /** 停课集训额度（周/学年） */
  suspendQuota?: number;
  /** 本学年外出联训营已用次数 */
  campUsed?: number;
  /** 停课引发的下周文化课压力翻倍标志 */
  suspendPressure?: number;
  /** 跨学年选手长期档案（含毕业生去向与全部正赛履历） */
  archives?: Record<string, StudentArchive>;
  /** 跨学年校史奇闻纪录榜 */
  records?: SeasonRecords;
  /** 开局剧本（标准 / 荒漠重建 / 背水一战） */
  scenario?: ScenarioId;
  /** 本学年校领导目标协议 */
  yearGoal?: SeasonGoalId;
  /** 下场正赛的赛前战术指令 */
  nextTactic?: ContestTactic;
  /** 连续剧事件链排期 */
  scheduledEvents?: { id: string; minWeek: number; target?: string | null }[];
  /** 连续剧剧情状态标记 */
  storyFlags?: Record<string, string>;
  /** 学年目标达标结转到下学年的额外停课额度 */
  nextYearSuspendBonus?: number;
  // ===== 每周插曲（沿用 M1）=====
  pendingEvent: PendingEvent | null;
  eventLog: EventLogEntry[];
  lastEventResult: string | null;
  weekMult: number;
}

export interface EventLogEntry {
  week: number;
  year: number;
  id: string;
  title: string;
  choice: string;
  log: string;
}

// ===== 小工具 =====
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const cloneSkills = (s: Skills): Skills => JSON.parse(JSON.stringify(s)) as Skills;

/** 综合分 0-100：八专题为主，coding / debug 加权两成 */
export function overallOf(s: Skills): number {
  const topicAvg = TOPIC_LIST.reduce((a, t) => a + s.topics[t], 0) / TOPIC_LIST.length;
  return Math.round((topicAvg * 0.8 + s.coding * 0.12 + s.debug * 0.08) * 1000) / 10;
}

/** 选手当前综合分（由技能现算，不是独立属性） */
export function overallScoreOf(st: SeasonStudent): number {
  return overallOf(st.skills);
}

function contestSkills(st: SeasonStudent): Skills {
  // 疲劳只影响训练效率（见 planWeek），不再在赛场上扣能力。
  const topics = {} as Record<Topic, number>;
  for (const t of TOPIC_LIST) topics[t] = clamp(st.skills.topics[t], 0.03, ABILITY_CEIL);
  return {
    ...st.skills,
    topics,
    coding: clamp(st.skills.coding, 0.03, ABILITY_CEIL),
    debug: clamp(st.skills.debug, 0.03, ABILITY_CEIL),
  };
}

/** 近似正态（Irwin–Hall，4 个均匀分布），sd ≈ 0.577 */
function gauss(rng: () => number): number {
  return (rng() + rng() + rng() + rng() - 2) * 1.732;
}

// ===== 年级分配 =====
/**
 * 初始年级：优先用 data/年级对照表.txt 填的；没填的人按种子打散，
 * 保证高一/高二/高三都有人（否则一个 3 年周期没法玩）。
 */
function assignGrades(names: string[], seed: number): Map<string, Grade> {
  const out = new Map<string, Grade>();
  const unknown: string[] = [];
  for (const n of names) {
    const g = GRADES_BY_NAME[n];
    if (g === 1 || g === 2 || g === 3 || g === 4 || g === 5 || g === 6) out.set(n, g as Grade);
    else unknown.push(n);
  }
  const rng = makeRng((seed * 6151 + 11) >>> 0);
  const pool = unknown.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // 默认分布：初中 3 级共约 46%，高中 3 级共约 54%（真实校队低年级更多）
  const weights = [0.17, 0.15, 0.14, 0.2, 0.18, 0.16];
  const n = pool.length;
  const counts = weights.map((w) => Math.max(4, Math.round(n * w)));
  let cursor = 0;
  for (let g = 1; g <= 6; g++) {
    for (let k = 0; k < counts[g - 1] && cursor < n; k++, cursor++) {
      out.set(pool[cursor], g as Grade);
    }
  }
  while (cursor < n) { out.set(pool[cursor], 4); cursor++; }
  return out;
}

/** 新高一学生：拿现有模板按目标综合缩放，名字随机组合 */
const SURNAMES = ['张', '王', '李', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗'];
const GIVEN = ['子轩', '浩然', '雨桐', '思远', '嘉怡', '宇航', '若曦', '博文', '一鸣', '晨曦', '可欣', '天佑', '语桐', '泽宇', '欣怡', '沐辰', '雨泽', '砚清'];

function makeNewcomer(idx: number, year: number, seed: number, template: CohortEntry, grade: Grade = 1, prestige = 50): SeasonStudent {
  const rng = makeRng((seed * 7717 + year * 911 + idx * 131 + 7) >>> 0);
  const name = `${SURNAMES[Math.floor(rng() * SURNAMES.length)]}${GIVEN[Math.floor(rng() * GIVEN.length)]}`;
  // 新生按 0–1 归一化能力定档：初一 0.26–0.58（约 39–87 知识点），声望高会稍微好一点。
  const target = clamp(0.26 + rng() * 0.32 + (prestige - 50) / 500, 0.2, 0.7);
  const base = overallOf(template.skills) / 100 || 0.5;
  const k = target / base;
  const skills = cloneSkills(template.skills);
  const topics = {} as Record<Topic, number>;
  for (const t of TOPIC_LIST) topics[t] = clamp(skills.topics[t] * k, 0.08, 0.62);
  const scaled: Skills = {
    ...skills,
    topics,
    coding: clamp(skills.coding * k, 0.08, 0.62),
    debug: clamp(skills.debug * k, 0.08, 0.62),
    reading: clamp(skills.reading * k, 0.08, 0.62),
  };
  return {
    name,
    skills: scaled,
    startSkills: cloneSkills(scaled),
    grade,
    startOverall: overallOf(scaled),
    startRank: 0,
    fatigue: 0,
    homework: 50,
    sitOut: 0,
    talent: 0.85 + rng() * 0.3,
    onTeam: false,
    onReserve: false,
    joined: year,
    traits: assignTraits(name, seed + year * 977 + idx * 31, grade),
    traitsRevealed: false,
    contestsPlayed: 0,
  };
}

// ===== 开局 =====
/** 把技能等比缩放到目标综合分，保留知识点之间的相对形状（偏数学的人还是偏数学） */
function scaleSkillsToOverall(skills: Skills, target: number): void {
  const cur = overallOf(skills);
  if (!(cur > 1) || !(target > 0)) return;
  const k = clamp(target / cur, 0.2, 2.2);
  for (const t of TOPIC_LIST) skills.topics[t] = clamp(skills.topics[t] * k, 0.05, 0.99);
  skills.coding = clamp(skills.coding * k, 0.05, 0.99);
  skills.debug = clamp(skills.debug * k, 0.05, 0.99);
  // 读题只顺手放大一点：它影响开场通读时间，不该跟实力同幅增长
  skills.reading = clamp(skills.reading * (0.6 + 0.4 * k), 0.05, 0.99);
}

/** 成长指数 → 天赋系数：40 → 0.90，99 → 1.35（训练收益倍率） */
function talentFromGrowth(growth: number): number {
  return Math.round((0.9 + (clamp(growth, 0, 100) - 40) / 59 * 0.45) * 1000) / 1000;
}

export function createSeason(seed: number, careerYears = MAX_YEARS, scenario: ScenarioId = 'standard'): SeasonState {
  const career = scenario === 'lastStand'
    ? 1
    : scenario === 'desert'
      ? (careerYears === MAX_YEARS ? 5 : Math.max(1, Math.min(MAX_YEARS, careerYears)))
      : Math.max(1, Math.min(MAX_YEARS, careerYears));
  const cohort = buildCohort(seed >>> 0);
  const rng = makeRng((seed * 7919 + 17) >>> 0);
  const grades = assignGrades(cohort.map((e) => e.name), seed >>> 0);
  const students: SeasonStudent[] = cohort.map((e, idx) => {
    const over = PROFILE_BY_NAME[e.name];
    const skills = cloneSkills(e.skills);
    // 属性表只保留 topics / 代码·阅读·调试 / 年级 / 天赋
    if (over) {
      if (over.topics) for (const [k, v] of Object.entries(over.topics)) skills.topics[k as Topic] = v as number;
      if (over.meta) Object.assign(skills, over.meta);
    }
    // 水平基线：按调研出的实力指数整体缩放（保留个人知识点形状：偏数学的还是偏图论）
    const level = levelOf(e.name);
    if (level) scaleSkillsToOverall(skills, level.ability);
    const grade: Grade = scenario === 'desert'
      ? (([1, 1, 2, 3, 4, 4][idx % 6] as Grade))
      : (level?.grade ?? over?.grade ?? grades.get(e.name) ?? 4);
    if (scenario === 'desert') {
      const targetOv = 26 + ((seed + idx * 37) % 18);
      scaleSkillsToOverall(skills, targetOv);
    }
    // 天赋表填了就用表里的，没填沿用种子随机；随机数照常消耗，保证没填的人结果不变
    const talentRoll = 0.85 + rng() * 0.3;
    return {
      name: e.name,
      skills,
      startSkills: cloneSkills(skills),
      grade,
      startOverall: overallOf(skills),
      startRank: 0,
      fatigue: 0,
      homework: 50,
      sitOut: 0,
      talent: level ? talentFromGrowth(level.growth) : (over?.talent ?? TALENT_BY_NAME[e.name] ?? talentRoll),
      onTeam: false,
      onReserve: false,
      joined: 1,
      traits: assignTraits(e.name, seed >>> 0, grade),
      traitsRevealed: grade >= 4,
      contestsPlayed: 0,
    };
  });
  rankStudents(students);
  const archives = syncArchiveSnapshots({}, students, 1, false, students.length);
  const prestige = scenario === 'desert' ? 20 : scenario === 'lastStand' ? 65 : 50;
  const budget = scenario === 'desert' ? 25 : scenario === 'lastStand' ? 90 : initialBudgetFor(prestige);
  const suspendQuota = scenario === 'desert' ? 1 : scenario === 'lastStand' ? 5 : initialSuspendFor(prestige);
  const state: SeasonState = {
    seed: seed >>> 0,
    careerYears: career,
    year: 1,
    week: 1,
    phase: 'team',
    students,
    team: [],
    reserve: [],
    prestige,
    budget,
    suspendQuota,
    campUsed: 0,
    suspendPressure: 0,
    archives,
    records: {},
    scenario,
    yearGoal: 'safe',
    nextTactic: 'normal',
    scheduledEvents: [],
    storyFlags: {},
    nextYearSuspendBonus: 0,
    plan: null,
    report: null,
    lastContest: null,
    contests: [],
    lastTeam: [],
    lastReserve: [],
    graduates: [],
    newcomers: [],
    history: [],
    pendingEvent: null,
    eventLog: [],
    lastEventResult: null,
    weekMult: 1,
  };
  // OPv：开档这一刻把自定义的人写进赛季，之后就按正常规则成长 / 升级 / 毕业
  return IS_OPV ? applyOpvToSeason(state, loadOpvConfig()) : state;
}

/**
 * OPv · 把自定义开局写进赛季状态。
 *
 * 只在「开档」时调用（createSeason）；赛季中途绝不重放，否则会把每周的成长抹掉。
 * override 模式只改名单里已有的人；create 模式在没找到同名选手时追加一个新队员。
 * 除了目标选手，其他人的 startOverall 一律不动（成长统计靠它算）。
 */
export function applyOpvToSeason(s: SeasonState, cfg: OpvConfig | null = loadOpvConfig()): SeasonState {
  if (!cfg || !cfg.enabled) return s;
  const name = cfg.name.trim();
  if (!name) return s;
  const skills = opvSkills(cfg);
  const students = s.students.slice();
  let idx = students.findIndex((st) => st.name === name);
  if (idx < 0) {
    if (cfg.mode !== 'create') return s;
    // 自定义新人：按现有队员的结构补一份，避免存档校验或后续结算缺字段
    students.push({
      name,
      skills: cloneSkills(skills),
      startSkills: cloneSkills(skills),
      grade: cfg.grade as Grade,
      age: cfg.age,
      startOverall: overallOf(skills),
      startRank: 0,
      fatigue: cfg.fatigue,
      homework: cfg.homework,
      sitOut: 0,
      talent: cfg.talent,
      onTeam: false,
      onReserve: false,
      joined: s.year,
    });
    idx = students.length - 1;
  }
  const st = students[idx];
  students[idx] = {
    ...st,
    skills: cloneSkills(skills),
    startSkills: cloneSkills(skills),
    grade: cfg.grade as Grade,
    age: cfg.age,
    talent: cfg.talent,
    fatigue: cfg.fatigue,
    homework: cfg.homework,
    sitOut: 0,
    startOverall: overallOf(skills),
  };
  // 只重排名次，不重算其他人的开学综合
  students.slice().sort((a, b) => b.startOverall - a.startOverall).forEach((x, i) => { x.startRank = i + 1; });
  const archives = syncArchiveSnapshots(s.archives ?? {}, [students[idx]], s.year, true);
  return {
    ...s,
    students,
    prestige: cfg.prestige,
    budget: initialBudgetFor(cfg.prestige),
    suspendQuota: initialSuspendFor(cfg.prestige),
    archives,
  };
}

function meanDifficulty(problems: Problem[]): number {
  if (!problems.length) return 60;
  return problems.reduce((a, p) => a + p.difficulty, 0) / problems.length;
}

/**
 * 赛后成长：题目平均难度与选手水平越接近（略高于水平 6 分左右）涨得越多，
 * 太简单或太难都涨得少。比赛成长写进对应专题（不再维护“实力”字段）。
 */
function growFromContest(
  st: SeasonStudent, meanDiff: number, problemCount: number, scale: number, topics: Set<Topic>,
): SeasonStudent {
  const gap = meanDiff - overallOf(st.skills);
  const match = clamp(1 - Math.abs(gap - 6) / 45, 0.12, 1);
  const gain = scale * match * clamp(problemCount / 4, 0.5, 1.5);
  const skills: Skills = { ...st.skills, topics: { ...st.skills.topics } };
  for (const t of topics) skills.topics[t] = clamp(skills.topics[t] + gain * 0.55, 0.03, ABILITY_CEIL);
  return { ...st, skills };
}

function rankStudents(students: SeasonStudent[]) {
  students.forEach((st) => { st.startOverall = overallOf(st.skills); });
  students.slice().sort((a, b) => b.startOverall - a.startOverall).forEach((st, i) => { st.startRank = i + 1; });
}

export function setSquad(
  s: SeasonState,
  names: string[],
  reserve: string[] = [],
  yearGoal?: SeasonGoalId,
): SeasonState {
  // 主力人数上不封顶；梯队默认最多 12 人，避免一屏塞不下。
  const valid = new Set(s.students.map((st) => st.name));
  const main = [...new Set(names)].filter((n) => valid.has(n));
  const res = [...new Set(reserve)].filter((n) => valid.has(n) && !main.includes(n)).slice(0, 12);
  return withEvent({
    ...s,
    team: main,
    reserve: res,
    yearGoal: yearGoal ?? s.yearGoal ?? 'safe',
    phase: 'plan',
    students: s.students.map((st) => ({
      ...st,
      onTeam: main.includes(st.name),
      onReserve: res.includes(st.name),
    })),
  });
}

export function setTeam(s: SeasonState, names: string[]): SeasonState {
  return setSquad(s, names, s.reserve);
}

export function teamStudents(s: SeasonState): SeasonStudent[] {
  return s.team
    .map((n) => s.students.find((st) => st.name === n))
    .filter((x): x is SeasonStudent => Boolean(x));
}

export function reserveStudents(s: SeasonState): SeasonStudent[] {
  return s.reserve
    .map((n) => s.students.find((st) => st.name === n))
    .filter((x): x is SeasonStudent => Boolean(x));
}

// ===== 资源、档案与校史纪录工具 =====
const initialBudgetFor = (prestige: number) => Math.round(30 + clamp(prestige, 0, 100) * 0.8);
const initialSuspendFor = (prestige: number) => (prestige >= 75 ? 5 : 4);

export const budgetOf = (s: SeasonState): number => s.budget ?? 70;
export const suspendQuotaOf = (s: SeasonState): number => s.suspendQuota ?? 4;
export const campUsedOf = (s: SeasonState): number => s.campUsed ?? 0;

function bestTopicOf(st: SeasonStudent): Topic {
  let best: Topic = 'dp';
  let val = -1;
  for (const t of TOPIC_LIST) {
    if (st.skills.topics[t] > val) { val = st.skills.topics[t]; best = t; }
  }
  return best;
}

function weakestTopicOfStudent(st: SeasonStudent): Topic {
  let worst: Topic = 'dp';
  let val = Infinity;
  for (const t of TOPIC_LIST) {
    if (st.skills.topics[t] < val) { val = st.skills.topics[t]; worst = t; }
  }
  return worst;
}

export function honorScoreOf(a: StudentArchive): number {
  return (
    a.ioiMedals * 60 +
    a.noiGold * 40 +
    a.noiSelected * 20 +
    a.noiSilver * 22 +
    a.noiBronze * 12 +
    a.provTeams * 15 +
    a.provFirsts * 4 +
    a.peakOverall * 0.2
  );
}

export function archiveOf(s: SeasonState, name: string): StudentArchive | undefined {
  return s.archives?.[name];
}

export function recordsOf(s: SeasonState): SeasonRecords {
  return s.records ?? {};
}

export function alumniPoolOf(s: SeasonState): StudentArchive[] {
  return Object.values(s.archives ?? {})
    .filter((a) => a.graduatedYear !== null)
    .sort((a, b) => honorScoreOf(b) - honorScoreOf(a) || b.peakOverall - a.peakOverall);
}

export function canUseSpecial(s: SeasonState, id: SpecialProjectId): { ok: boolean; reason?: string } {
  const def = SPECIAL_PROJECTS.find((p) => p.id === id);
  if (!def) return { ok: false, reason: '未知项目' };
  if (budgetOf(s) < def.costBudget) return { ok: false, reason: `经费不足 ${def.costBudget}` };
  if (suspendQuotaOf(s) < def.costSuspend) return { ok: false, reason: '本学年停课额度已用完' };
  if (def.limitPerYear && campUsedOf(s) >= def.limitPerYear) {
    return { ok: false, reason: `本学年已满 ${def.limitPerYear} 次` };
  }
  return { ok: true };
}

function createEmptyArchive(st: SeasonStudent, year: number, totalCount = 54): StudentArchive {
  const ov = overallOf(st.skills);
  return {
    name: st.name,
    joinedYear: st.joined ?? year,
    graduatedYear: null,
    entryGrade: st.grade,
    underdog: st.startRank > 0 && st.startRank > Math.round(totalCount * 0.8),
    startOverall: st.startOverall || ov,
    peakOverall: ov,
    maxGrade: st.grade,
    bestTopic: bestTopicOf(st),
    provFirsts: 0,
    provTeams: 0,
    noiGold: 0,
    noiSilver: 0,
    noiBronze: 0,
    noiSelected: 0,
    ioiMedals: 0,
    officialCount: 0,
    honors: [],
  };
}

function syncArchiveSnapshots(
  prev: Record<string, StudentArchive>,
  students: SeasonStudent[],
  year: number,
  resetStart = false,
  totalCount = students.length,
): Record<string, StudentArchive> {
  const next: Record<string, StudentArchive> = { ...prev };
  for (const st of students) {
    const ov = overallOf(st.skills);
    const cur = next[st.name] ?? createEmptyArchive(st, year, totalCount);
    next[st.name] = {
      ...cur,
      entryGrade: cur.entryGrade ?? st.grade,
      underdog: cur.underdog ?? (st.startRank > 0 && st.startRank > Math.round(totalCount * 0.8)),
      startOverall: resetStart ? (st.startOverall || ov) : cur.startOverall,
      peakOverall: resetStart ? ov : Math.max(cur.peakOverall, ov),
      maxGrade: Math.max(cur.maxGrade, st.grade) as Grade,
      bestTopic: bestTopicOf(st),
    };
  }
  return next;
}

function destinationOf(st: SeasonStudent, arch: StudentArchive): string {
  const ioiMedal = arch.ioiMedals > 0 || (st.ioi?.medal ?? 0) > 0;
  const noiGold = arch.noiGold > 0 || st.noi?.medal === 1 || Boolean(st.noi?.selected);
  const noiMedal = arch.noiSilver > 0 || arch.noiBronze > 0 || (st.noi?.medal ?? 0) >= 2;
  const provTeam = arch.provTeams > 0 || Boolean(st.prov?.team);
  const provFirst = arch.provFirsts > 0 || Boolean(st.noip?.first) || st.csp2?.award === 1;

  if (ioiMedal || Boolean(st.cts?.selected)) return '清北姚班 / 图灵班（IOI 国家队保送）';
  if (noiGold) return '清北保送（NOI 国家集训队）';
  if (noiMedal || provTeam) return '强基破格入围清北 / 华五计算机';
  if (provFirst) return '回归文化课，考入 985 计算机 / 软工';
  return '告别机房回归文化课，开启新旅程';
}

// ===== 赛场与随机事件 =====
const PRESSURE_EVENT_IDS = new Set(['teacher', 'parent', 'midterm', 'parents_job']);

/** 每周出事件的概率：一学年 40 周大约 25 次 */
const EVENT_CHANCE = 0.62;

function rollWeekEvent(s: SeasonState): { event: PendingEvent | null; scheduledLeft: { id: string; minWeek: number; target?: string | null }[] } {
  const scheduled = s.scheduledEvents ?? [];
  const dueIdx = scheduled.findIndex((item) => item.minWeek <= s.week);
  if (dueIdx >= 0) {
    const due = scheduled[dueIdx];
    const def = eventDefById(due.id);
    if (def) {
      const target = def.needsTarget
        ? (due.target && s.team.includes(due.target) ? due.target : s.team[0] ?? null)
        : null;
      return {
        event: {
          id: def.id,
          week: s.week,
          tag: def.tag,
          title: def.title,
          text: def.text.replace('{name}', target ?? '一个队员'),
          target,
          options: def.options.map((o) => ({ id: o.id, label: o.label, note: o.note })),
        },
        scheduledLeft: scheduled.filter((_, i) => i !== dueIdx),
      };
    }
  }

  if (!s.team.length) return { event: null, scheduledLeft: scheduled };
  const rng = makeRng((s.seed * 8191 + s.year * 104729 + s.week * 7331 + 3) >>> 0);
  if (rng() > EVENT_CHANCE) return { event: null, scheduledLeft: scheduled };

  const lastId = s.eventLog[s.eventLog.length - 1]?.id ?? null;
  let pool = EVENT_DEFS.filter((d) => !d.chainOnly);
  if (pool.length > 1) pool = pool.filter((d) => d.id !== lastId);

  const pressure = (s.suspendPressure ?? 0) > 0;
  const weightOf = (d: (typeof EVENT_DEFS)[number]) =>
    pressure && PRESSURE_EVENT_IDS.has(d.id) ? d.weight * 2 : d.weight;

  const total = pool.reduce((a, d) => a + weightOf(d), 0);
  let r = rng() * total;
  let def = pool[pool.length - 1];
  for (const d of pool) {
    r -= weightOf(d);
    if (r <= 0) { def = d; break; }
  }
  const target = def.needsTarget ? s.team[Math.floor(rng() * s.team.length)] ?? null : null;
  return {
    event: {
      id: def.id,
      week: s.week,
      tag: def.tag,
      title: def.title,
      text: def.text.replace('{name}', target ?? '一个队员'),
      target,
      options: def.options.map((o) => ({ id: o.id, label: o.label, note: o.note })),
    },
    scheduledLeft: scheduled,
  };
}

function withEvent(s: SeasonState): SeasonState {
  if (s.phase !== 'plan') return s;
  const { event, scheduledLeft } = rollWeekEvent(s);
  return { ...s, pendingEvent: event, scheduledEvents: scheduledLeft, lastEventResult: null, suspendPressure: 0 };
}

function applyPatch(st: SeasonStudent, p: StudentPatch): SeasonStudent {
  const skills = cloneSkills(st.skills);
  if (p.topics) {
    for (const [t, d] of Object.entries(p.topics)) {
      const topic = t as Topic;
      skills.topics[topic] = clamp(skills.topics[topic] + (d ?? 0), 0.05, ABILITY_CEIL);
    }
  }
  return {
    ...st,
    skills,
    fatigue: clamp(st.fatigue + (p.fatigue ?? 0), 0, 100),
    homework: clamp((st.homework ?? 50) + (p.homework ?? 0), 0, 100),
    sitOut: Math.max(st.sitOut ?? 0, p.sitOut ?? 0),
  };
}

export function chooseEventOption(s: SeasonState, optionId: string): SeasonState {
  const pending = s.pendingEvent;
  if (!pending) return s;
  const def = eventDefById(pending.id);
  const opt = def?.options.find((o) => o.id === optionId);
  if (!def || !opt) return s;

  const rng = makeRng((s.seed * 2654435761 + s.year * 31397 + pending.week * 131 + optionId.length * 17) >>> 0);
  const patch = opt.apply(s, pending.target, rng);
  const students = s.students.map((st) => {
    if (!st.onTeam) return st;
    if (pending.target && st.name === pending.target && patch.target) return applyPatch(st, patch.target);
    if (patch.team) return applyPatch(st, patch.team);
    return st;
  });

  const nextScheduled = [...(s.scheduledEvents ?? [])];
  if (patch.followUp) {
    nextScheduled.push({
      id: patch.followUp.id,
      minWeek: pending.week + patch.followUp.delayWeeks,
      target: patch.followUp.keepTarget ? pending.target : null,
    });
  }
  const nextFlags = patch.storyFlag
    ? { ...(s.storyFlags ?? {}), [patch.storyFlag[0]]: patch.storyFlag[1] }
    : s.storyFlags;

  return {
    ...s,
    students,
    prestige: clamp(s.prestige + (patch.prestige ?? 0), 0, 100),
    budget: clamp(budgetOf(s) + (patch.budget ?? 0), 0, 200),
    pendingEvent: null,
    scheduledEvents: nextScheduled,
    ...(nextFlags ? { storyFlags: nextFlags } : {}),
    weekMult: s.weekMult * (patch.growthMult ?? 1),
    lastEventResult: patch.log,
    eventLog: [
      ...s.eventLog,
      { year: s.year, week: pending.week, id: pending.id, title: pending.title, choice: opt.label, log: patch.log },
    ],
  };
}

// ===== 一周训练 =====
/**
 * 成长中等化（2026-10 用户口径：不一学年打 IOI 金牌）。
 * 目标：校队主力一学年 +8–12 个知识点（0–150 口径），顶尖且长期加练 +12–18；
 * 从 120 到 145 需要 2–3 年高质量训练，从初一 40 分爬到 145 需要 5–6 年。
 * 三条成长来源（每周训练 / 校内模拟赛 / 正赛）一起降，避免只砍一处、另外两处补回来。
 */
const INTENSITY_GAIN: Record<WeekIntensity, number> = { normal: 6, extra: 18, rest: 0 };
const INTENSITY_K: Record<WeekIntensity, number> = { normal: 0.75, extra: 1.15, rest: 0 };
const TRAIN_BASE = 0.05;
/** 边际递减指数：越接近上限涨得越慢，但不至于完全练不动 */
const TRAIN_EXP = 0.55;
/** 疲劳只做一件事：减缓训练效率（0 疲劳 100%，100 疲劳 45%） */
const fatigueTrainMult = (fatigue: number) => 1 - 0.55 * Math.pow(clamp(fatigue, 0, 100) / 100, 2);

function reportOf(growth: number, fatigue: number, intensity: WeekIntensity): { text: string; tone: TrainingLine['tone'] } {
  if (intensity === 'rest') {
    return { text: fatigue > 55 ? '休息了一周，缓过来一些' : '这周放松，状态拉满', tone: 'ok' };
  }
  let base: string;
  let tone: TrainingLine['tone'];
  if (growth >= 0.022) { base = '这周练透了，专题明显上了一个台阶'; tone = 'good'; }
  else if (growth >= 0.013) { base = '稳步在涨，手感不错'; tone = 'good'; }
  else if (growth >= 0.007) { base = '有点进步，但不算多'; tone = 'ok'; }
  else if (growth >= 0.003) { base = '基本原地踏步'; tone = 'flat'; }
  else { base = '几乎没吸收进去，像白练了一周'; tone = 'bad'; }
  if (fatigue >= 78) base += '，不过人已经很疲惫了';
  else if (fatigue >= 58) base += '，人有点累';
  return { text: base, tone };
}

export function planWeek(s: SeasonState, plan: WeekPlan): SeasonState {
  const rng = makeRng((s.seed * 131 + s.year * 7919 + s.week * 977 + 1) >>> 0);
  const k = INTENSITY_K[plan.intensity];
  const baseGain = INTENSITY_GAIN[plan.intensity];
  const lines: TrainingLine[] = [];

  // 特训项目校验与资源结算
  let activeSpecial: SpecialProjectId | null = plan.special ?? null;
  if (activeSpecial && !canUseSpecial(s, activeSpecial).ok) activeSpecial = null;
  const specialDef = activeSpecial ? SPECIAL_PROJECTS.find((p) => p.id === activeSpecial) : undefined;
  let nextBudget = budgetOf(s) - (specialDef?.costBudget ?? 0);
  const nextSuspendQuota = suspendQuotaOf(s) - (specialDef?.costSuspend ?? 0);
  const nextCampUsed = campUsedOf(s) + (activeSpecial === 'camp' ? 1 : 0);
  const nextSuspendPressure = activeSpecial === 'suspend' ? 1 : 0;

  // 请往届学长讲课：锁定讲授人与专题
  const alumniPool = alumniPoolOf(s);
  const invitedAlumnus = activeSpecial === 'alumni'
    ? (alumniPool.find((a) => a.name === plan.alumniName) ?? alumniPool[0] ?? null)
    : null;
  const teamWeakestTopic = (() => {
    const squad = teamStudents(s);
    if (!squad.length) return 'dp' as Topic;
    return TOPIC_LIST.slice().sort((a, b) => {
      const av = squad.reduce((sum, x) => sum + x.skills.topics[a], 0);
      const bv = squad.reduce((sum, x) => sum + x.skills.topics[b], 0);
      return av - bv;
    })[0];
  })();
  const alumniTopic: Topic = invitedAlumnus?.bestTopic ?? plan.topic ?? teamWeakestTopic;
  const specialGrowthMult = activeSpecial === 'suspend'
    ? 1.45
    : activeSpecial === 'camp'
      ? 1.65
      : activeSpecial === 'drill'
        ? 0.8
        : 1;

  let specialNote: string | undefined;
  if (activeSpecial === 'suspend') {
    specialNote = `特训·申请停课集训：消耗 1 周停课额度（余 ${nextSuspendQuota} 周），全队成长 ×1.45、疲劳 +10，下周文化课压力事件概率翻倍。`;
  } else if (activeSpecial === 'camp') {
    specialNote = `特训·外校联训营：消耗 25 经费（余 ${nextBudget}），主专题成长 ×1.65（超频区衰减减缓）+ 顺手补弱项，全队疲劳 +14。`;
  } else if (activeSpecial === 'alumni') {
    const speaker = invitedAlumnus ? `${invitedAlumnus.name}（${invitedAlumnus.graduatedYear}届）` : '校史往届金牌学长';
    specialNote = `特训·学长返校讲课：消耗 15 经费（余 ${nextBudget}），邀 ${speaker} 讲授「${TOPIC_NAMES[alumniTopic]}」，定向提专题与调试阅读，全队疲劳 −4。`;
  } else if (activeSpecial === 'drill') {
    specialNote = `特训·赛前防挂题包：消耗 12 经费（余 ${nextBudget}），全队代码/调试显著提升、作业 +4，专题成长 ×0.8、疲劳 +4。`;
  }

  // 个别关照槽位（最多 2 人，仅限主力/梯队）
  const careMap = new Map<string, CareAction>();
  for (const ord of (plan.care ?? []).slice(0, CARE_MAX)) {
    if (!careMap.has(ord.name)) careMap.set(ord.name, ord.action);
  }

  // 带的人越多，每人分到的教练注意力越少（6 人满额，按 0.6 次方稀释，最少 0.2）
  const sizePenalty = Math.max(0.2, Math.pow(TEAM_MIN / Math.max(TEAM_MIN, s.team.length), 0.6));
  const focus: SquadFocus = plan.focus ?? 'balanced';
  // 开窍顿悟：使用独立随机流，不扰动常规训练随机数；每周最多 1 名低疲劳主力/梯队队员触发
  const btRng = makeRng((s.seed * 4099 + s.year * 997 + s.week * 313 + 7) >>> 0);
  const btCandidates = s.students.filter(
    (st) => (st.onTeam || st.onReserve) && st.fatigue < 60 && careMap.get(st.name) !== 'rest',
  );
  const breakthroughTarget = plan.intensity !== 'rest' && btCandidates.length > 0 && btRng() < 0.045
    ? btCandidates[Math.floor(btRng() * btCandidates.length)]?.name ?? null
    : null;
  let breakthroughNote: string | undefined;

  const students = s.students.map((st) => {
    const skills = cloneSkills(st.skills);
    const inSquad = st.onTeam || st.onReserve;
    const care = inSquad ? careMap.get(st.name) : undefined;
    const attention = st.onTeam
      ? (focus === 'main' ? 1 : focus === 'reserve' ? 0.55 : 0.8)
      : st.onReserve
        ? (focus === 'main' ? 0.35 : focus === 'reserve' ? 1 : 0.7)
        : 0.2;

    if (care === 'rest') {
      const rec = -(16 + 0.22 * st.fatigue);
      const fatigue = clamp(st.fatigue + rec, 0, 100);
      const homework = clamp((st.homework ?? 50) - 0.6, 0, 100);
      if (st.onTeam) {
        lines.push({ name: st.name, text: '【个别轮休】本周单人暂停训练，集中回了一波状态', tone: 'ok', fatigue });
      }
      return { ...st, skills, fatigue, homework };
    }

    let growth = 0;
    let trainedTopic: Topic | null = null;
    if (k > 0) {
      if (care === 'weak') {
        trainedTopic = weakestTopicOfStudent(st);
      } else if (st.onReserve && plan.reserveTopic) {
        trainedTopic = plan.reserveTopic;
      } else if (inSquad && plan.topic) {
        trainedTopic = plan.topic;
      } else {
        trainedTopic = TOPIC_LIST[Math.floor(rng() * TOPIC_LIST.length)] ?? null;
      }
      if (trainedTopic) {
        const cur = skills.topics[trainedTopic];
        // OPv 超频区（> 0.8 = 120 知识点）按 OPV_ABILITY_CEIL 平滑衰减；外校联训营进一步减缓超频衰减
        let headroom = cur <= 0.8
          ? Math.max(0, 1 - cur)
          : (IS_OPV ? Math.max(0, (OPV_ABILITY_CEIL - cur) / (OPV_ABILITY_CEIL - 0.8)) * 0.2 : Math.max(0, 1 - cur));
        if (activeSpecial === 'camp' && cur > 0.8) {
          headroom = Math.max(headroom, 0.22);
        }
        const careMult = care === 'weak' ? 1.35 : care === 'meta' ? 0.65 : 1;
        // 选手特性训练加成：大器晚成（高中）/ 偏科怪才（练最强专题）/ 高能冲刺（低疲劳）
        const tr = st.traits ?? [];
        const traitMult = (tr.includes('lateBloomer') && isSenior(st.grade) ? 1.22 : 1)
          * (tr.includes('specialist') && trainedTopic === bestTopicOf(st) ? 1.40 : 1)
          * (tr.includes('sprinter') && st.fatigue < 40 ? 1.18 : 1);
        growth = Math.pow(headroom, TRAIN_EXP) * TRAIN_BASE * k * attention
          * sizePenalty * st.talent * fatigueTrainMult(st.fatigue)
          * specialGrowthMult * careMult * traitMult;
        growth *= 0.75 + rng() * 0.5;
        growth *= s.weekMult;
        skills.topics[trainedTopic] = clamp(cur + growth, 0.05, ABILITY_CEIL);
        skills.coding = clamp(skills.coding + growth * 0.12, 0.05, NORMAL_ABILITY_CEIL);
        skills.debug = clamp(skills.debug + growth * 0.1, 0.05, NORMAL_ABILITY_CEIL);
      }
    }

    const hitBreakthrough = st.name === breakthroughTarget && trainedTopic !== null;
    if (hitBreakthrough && trainedTopic) {
      skills.topics[trainedTopic] = clamp(skills.topics[trainedTopic] + 0.025, 0.05, ABILITY_CEIL);
      skills.coding = clamp(skills.coding + 0.01, 0.05, NORMAL_ABILITY_CEIL);
      breakthroughNote = `开窍顿悟：${st.name} 本周在「${TOPIC_NAMES[trainedTopic]}」突然打通任督二脉，专题与代码手感额外暴涨！`;
    }

    // 个别关照：代码调试强化
    if (care === 'meta') {
      skills.coding = clamp(skills.coding + 0.015 * st.talent, 0.05, NORMAL_ABILITY_CEIL);
      skills.debug = clamp(skills.debug + 0.016 * st.talent, 0.05, NORMAL_ABILITY_CEIL);
      skills.reading = clamp(skills.reading + 0.012 * st.talent, 0.05, NORMAL_ABILITY_CEIL);
    }

    // 特训项目额外收益与疲劳/作业影响
    let specialFatigue = 0;
    let specialHw = 0;
    if (inSquad && activeSpecial === 'suspend') {
      specialFatigue = 10;
      specialHw = 3;
    } else if (inSquad && activeSpecial === 'camp') {
      const wt = weakestTopicOfStudent(st);
      skills.topics[wt] = clamp(skills.topics[wt] + 0.008 * attention, 0.05, ABILITY_CEIL);
      specialFatigue = 14;
    } else if (inSquad && activeSpecial === 'alumni') {
      skills.topics[alumniTopic] = clamp(skills.topics[alumniTopic] + 0.015 * attention * st.talent, 0.05, ABILITY_CEIL);
      skills.debug = clamp(skills.debug + 0.01 * attention, 0.05, NORMAL_ABILITY_CEIL);
      skills.reading = clamp(skills.reading + 0.008 * attention, 0.05, NORMAL_ABILITY_CEIL);
      specialFatigue = -4;
      specialHw = 2;
    } else if (inSquad && activeSpecial === 'drill') {
      skills.coding = clamp(skills.coding + 0.018 * attention, 0.05, NORMAL_ABILITY_CEIL);
      skills.debug = clamp(skills.debug + 0.022 * attention, 0.05, NORMAL_ABILITY_CEIL);
      specialFatigue = 4;
      specialHw = 4;
    }

    // 休息按当前疲劳恢复：低疲劳休息会浪费，高疲劳才回得动。
    const gain = plan.intensity === 'rest'
      ? -(16 + 0.22 * st.fatigue)
      : baseGain + (care === 'weak' ? 3 : 0);
    const fatigue = clamp(st.fatigue + gain + specialFatigue, 0, 100);
    // 作业/互测分：训练出勤与质量，国集选拔时占 10%
    const hwGain = plan.intensity === 'rest'
      ? -1.2
      : 0.25 + (plan.intensity === 'extra' ? 0.2 : 0) + growth * 150 * 0.08;
    const homework = clamp((st.homework ?? 50) + hwGain + specialHw, 0, 100);

    if (st.onTeam) {
      const r = reportOf(growth, fatigue, plan.intensity);
      const btPrefix = hitBreakthrough ? '【开窍顿悟】' : '';
      const prefix = `${btPrefix}${care === 'weak' ? '【补短板】' : care === 'meta' ? '【练代码对拍】' : ''}`;
      lines.push({ name: st.name, text: `${prefix}${r.text}`, tone: hitBreakthrough ? 'good' : r.tone, fatigue });
    }
    return { ...st, skills, fatigue, homework };
  });

  // 同步档案峰值与最高综合纪录
  const archives = syncArchiveSnapshots(s.archives ?? {}, students, s.year);
  const records: SeasonRecords = { ...(s.records ?? {}) };
  for (const st of students) {
    const ov = overallOf(st.skills);
    if (!records.highestOverall || ov > records.highestOverall.value) {
      records.highestOverall = {
        name: st.name,
        year: s.year,
        value: Math.round(ov * 10) / 10,
        detail: `${GRADE_NAMES[st.grade]} · 第 ${s.week} 周`,
      };
    }
  }

  // 上周方案保留分层专题和补短/代码关照，但清空一次性的单人轮休与特训项目，防止下周连点误扣资源
  const cleanCare = (plan.care ?? []).slice(0, CARE_MAX).filter((c) => c.action !== 'rest');
  const nextLastPlan: WeekPlan = {
    ...plan,
    special: null,
    alumniName: null,
    care: cleanCare.length ? cleanCare : undefined,
  };

  return {
    ...s,
    students,
    budget: clamp(nextBudget, 0, 200),
    suspendQuota: Math.max(0, nextSuspendQuota),
    campUsed: nextCampUsed,
    suspendPressure: nextSuspendPressure,
    archives,
    records,
    plan: { ...plan, special: activeSpecial },
    lastPlan: nextLastPlan,
    report: { week: s.week, plan: { ...plan, special: activeSpecial }, lines, specialNote, breakthroughNote },
    phase: 'report',
    weekMult: 1,
  };
}

// ===== 比赛引擎 =====
function runOneDay(
  cohort: CohortEntry[],
  levels: number[],
  minutes: number,
  seed: number,
  ranges?: [number, number][],
  trace?: ContestRound[],
  label?: string,
  curve?: [number, number][],
  format: ContestFormat = 'oi',
  tactic?: ContestTactic,
) {
  const cfg: ContestConfig = {
    preset: 'season-week',
    problemCount: levels.length,
    levels,
    studentCount: cohort.length,
    minutes,
    seed,
    format,
    ...(tactic && tactic !== 'normal' ? { tactic } : {}),
    cohort,
    difficultyRanges: ranges,
    scoreCurve: curve,
  };
  if (trace) trace.push({ label: label ?? '比赛', cfg });
  const contest = createContest(cfg);
  let guard = 0;
  while (!contest.isFinished && guard++ < 20000) tick(contest, 60);
  return { rows: finalize(contest), problems: contest.problems as Problem[] };
}

function mergeDays(runs: { rows: StudentResult[]; problems: Problem[] }[], fullScore: number): StudentResult[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const r of runs) { offsets.push(acc); acc += r.problems.length; }

  const byName = new Map<string, StudentResult>();
  runs.forEach((run, i) => {
    const off = offsets[i] ?? 0;
    for (const row of run.rows) {
      const perProblem = row.perProblem.map((pr) => ({ ...pr, problemId: pr.problemId + off }));
      const prev = byName.get(row.name);
      if (!prev) {
        byName.set(row.name, { ...row, perProblem });
      } else {
        prev.real += row.real;
        prev.est += row.est;
        prev.delta = prev.real - prev.est;
        prev.perProblem = [...prev.perProblem, ...perProblem];
      }
    }
  });

  const rows = [...byName.values()];
  rows.sort((a, b) => b.real - a.real);
  rows.forEach((r, i) => { r.rank = i + 1; });
  const byEst = rows.slice().sort((a, b) => b.est - a.est);
  byEst.forEach((r, i) => { r.estRank = i + 1; });
  for (const r of rows) {
    r.rankDelta = r.estRank - r.rank;
    r.calibration = clamp(100 - (Math.abs(r.delta) / fullScore) * 100, 0, 100);
  }
  return rows;
}

/** 初赛分数：阅读程序 / 完善程序 + 一点实现手感，100 分制 */
export const PRELIM_LINE = 37;
/** 初中组（J 组）初赛线：卷子更容易，线反而略高（陕西 2025：J 37.5 / S 37） */
const PRELIM_JUNIOR_LINE = 37.5;

const prelimSig = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * 初赛 = 全客观题笔试（100 分：15 单选×2 + 阅读程序 40 分含判断/单选 + 完善程序 10 单选×3）。
 *
 * 按 CCF CSP-S 真实试卷结构逐题模拟：
 * - 真正会做的题按能力与题位难度（sigmoid）直接拿分；
 * - 不会做的题按客观题概率蒙题（判断二选一 50%、单选四选一 25% + 少量排除干扰项加成）。
 * 由此保证纯零基础盲蒙期望也在 ~29 分，校队弱生自然落在 30–42 分，不再出现 0–10 分白卷；
 * 中游 45–60 分，校队强手 70–85 分，顶尖/满级选手 85–99 分，并保留真实 0.5 分刻度。
 */
function prelimPaperScore(st: SeasonStudent, rng: () => number): number {
  const sk = st.skills;
  const topicAvg = clamp(
    TOPIC_LIST.reduce((a, t) => a + sk.topics[t], 0) / TOPIC_LIST.length,
    0,
    1,
  );
  const read = clamp(sk.reading, 0, 1);
  const code = clamp(sk.coding, 0, 1);
  const exp = (st.grade - 1) / 5;
  // 考场临场状态小波动
  const shift = gauss(rng) * 0.03;

  const s1 = clamp(0.42 * topicAvg + 0.28 * read + 0.22 * code + 0.08 * exp + shift, 0, 1.05);
  const s2 = clamp(0.48 * read + 0.27 * code + 0.20 * topicAvg + 0.05 * exp + shift, 0, 1.05);
  const s3 = clamp(0.42 * code + 0.33 * topicAvg + 0.20 * read + 0.05 * exp + shift, 0, 1.05);

  let score = 0;

  // 1) 单项选择：15 题 × 2 分 = 30 分（四选一，纯蒙 25%）
  const mcqD = [0.22, 0.30, 0.38, 0.44, 0.50, 0.55, 0.60, 0.64, 0.68, 0.72, 0.76, 0.80, 0.84, 0.88, 0.92];
  const guessMcq1 = 0.25 + 0.05 * Math.min(1, s1);
  for (const d of mcqD) {
    const know = clamp(prelimSig((s1 - d) / 0.11), 0.005, 0.985);
    if (rng() < know || rng() < guessMcq1) score += 2;
  }

  // 2) 阅读程序（3 题共 40 分）：10 道判断 × 1.5 分（二选一 50%）+ 7 道单选共 25 分（四选一 25%）
  const readTf: [number, number][] = [
    [0.42, 1.5], [0.50, 1.5], [0.58, 1.5],
    [0.62, 1.5], [0.68, 1.5], [0.74, 1.5],
    [0.76, 1.5], [0.82, 1.5], [0.86, 1.5], [0.90, 1.5],
  ];
  for (const [d, pts] of readTf) {
    const know = clamp(prelimSig((s2 - d) / 0.12), 0.005, 0.98);
    if (rng() < know || rng() < 0.5) score += pts;
  }
  const readMcq: [number, number][] = [
    [0.50, 3], [0.60, 3],
    [0.68, 3.5], [0.76, 3.5],
    [0.80, 4], [0.86, 4], [0.92, 4],
  ];
  const guessMcq2 = 0.25 + 0.05 * Math.min(1, s2);
  for (const [d, pts] of readMcq) {
    const know = clamp(prelimSig((s2 - d) / 0.12), 0.005, 0.98);
    if (rng() < know || rng() < guessMcq2) score += pts;
  }

  // 3) 完善程序（2 题）：10 道单选 × 3 分 = 30 分（四选一 25%）
  const fillD = [0.50, 0.56, 0.62, 0.68, 0.74, 0.72, 0.78, 0.83, 0.88, 0.93];
  const guessMcq3 = 0.25 + 0.05 * Math.min(1, s3);
  for (const d of fillD) {
    const know = clamp(prelimSig((s3 - d) / 0.11), 0.005, 0.985);
    if (rng() < know || rng() < guessMcq3) score += 3;
  }

  return clamp(Math.round(score * 2) / 2, 0, 100);
}

/** NOI 笔试（100 分，公开题库背诵）：省队选手普遍 98–100 分，偶发粗心丢 1–4 分 */
function noiWrittenScore(st: SeasonStudent, rng: () => number): number {
  const prep = 0.55 * clamp(st.skills.reading, 0, 1) + 0.45 * clamp((st.homework ?? 50) / 100, 0, 1);
  const missP = clamp(0.045 - prep * 0.042, 0.004, 0.05);
  let wrong = 0;
  for (let i = 0; i < 100; i += 1) {
    if (rng() < missP) wrong += 1;
  }
  return clamp(100 - wrong, 85, 100);
}

const ratioLine = (n: number, p: number) => Math.max(1, Math.round(n * p));

function bumpFatigue(s: SeasonState, dayCount: number, participants?: Set<string>): SeasonState {
  return {
    ...s,
    students: s.students.map((st) => ({
      ...st,
      // 缺席或未获得本场资格的人没上考场，不跟着加疲劳
      fatigue: (st.sitOut > 0 || (participants && !participants.has(st.name)))
        ? st.fatigue
        : clamp(st.fatigue + (st.onTeam ? 8 : 5) * dayCount, 0, 100),
    })),
  };
}

/** 校内模拟赛：难度档/题数/时长由教练在排训练时选（不计正式成绩，只给成长和反馈） */
function runPractice(s: SeasonState, trace?: ContestRound[]): SeasonState {
  const week = s.week;
  const mock = s.plan?.mock ?? { preset: 'normal' as MockPreset, problemCount: 3, minutes: 180 };
  const baseLevels = MOCK_PRESETS[mock.preset].levels;
  const count = clamp(mock.problemCount, 1, 6);
  const levels = Array.from({ length: count }, (_, i) => baseLevels[Math.min(baseLevels.length - 1, Math.floor((i * baseLevels.length) / count))]);
  const minutes = clamp(mock.minutes, 60, 300);
  const cohort: CohortEntry[] = s.students.map((st) => ({
    name: st.name,
    skills: contestSkills(st),
    fatigue: 0,
    traits: st.traits,
  }));
  const fullScore = levels.length * 100;
  const run = runOneDay(cohort, levels, minutes, (s.seed * 31 + s.year * 6151 + week * 7919 + 5) >>> 0, undefined, trace, `校内模拟赛 · ${count} 题 · ${minutes} 分钟（${MOCK_PRESETS[mock.preset].name}）`, undefined, 'oi');
  const topics = new Set(run.problems.map((p) => p.topic));
  const meanDiff = meanDifficulty(run.problems);
  const grown = s.students.map((st) => {
    const g = growFromContest(st, meanDiff, run.problems.length, 0.0005, topics);
    const row = run.rows.find((r) => r.name === st.name);
    if (!row) return g;
    const frac = row.real / fullScore;
    return { ...g, homework: clamp((g.homework ?? 50) * 0.85 + frac * 100 * 0.15, 0, 100) };
  });
  const recap: ContestRecap = {
    year: s.year, week, kind: 'practice', format: 'oi', title: `第 ${week} 周 · 校内模拟赛（${MOCK_PRESETS[mock.preset].name}）`,
    levels, minutes, days: 1, rows: run.rows, fullScore, problems: run.problems,
    note: `模拟赛 ${count} 题 · ${minutes} 分钟 · ${MOCK_PRESETS[mock.preset].note}；不计正式成绩，难度和水平匹配时成长最多`,
  };
  return {
    ...bumpFatigue({ ...s, students: grown }, 1),
    week: week + 1,
    phase: 'result',
    lastContest: recap,
    contests: [...s.contests, recap],
  };
}

/**
 * 初赛（笔试）：全校一张卷，直接出分（不用比赛引擎）。
 * 过线才能进 CSP 第二轮；初中生也可以考，但 NOIP 起只限高中生。
 */
function runPrelim(s: SeasonState, stage: StageDef): SeasonState {
  const week = s.week;
  const rows: NonNullable<ContestRecap['prelim']> = [];

  // CCF 口径：陕西统一划 37 分线，「晋级人数不少于实考 20%」是最低保障，不是上限。
  // 上一版把「不少于」做成了「校内最多前 22%」，还把全省晋级率套到校内，
  // 结果考 40 分的人被砍掉、界面还标成「没过线」——既违背官方规则，也让门槛显得莫名地高。
  // 强校过线率天然高于全省平均（本校约 60%），这是真实且合理的，不该用校内名额压回去。
  const scored = s.students.map((st, i) => {
    if (st.sitOut > 0) return { st, score: 0, pct: 1, skipped: true };
    const rngBase = (s.seed * 131 + s.year * 7331 + week * 991 + i * 17 + 3) >>> 0;
    const score = prelimPaperScore(st, makeRng((rngBase + 29) >>> 0));
    const pct = pctFromAnchors(PRELIM_ANCHORS_S, score / 100);
    return { st, score, pct, skipped: false };
  });
  const sat = scored.filter((x) => !x.skipped);
  const minQuota = Math.max(1, Math.round(sat.length * 0.20));
  const byScore = sat.slice().sort((a, b) => b.score - a.score);
  const overLine = byScore.filter((x) => x.score >= PRELIM_LINE);
  // 正常情况：过线者全部晋级。只有过线人数不足下限时才按分数补足（官方兜底）。
  const passNames = new Set(
    (overLine.length >= minQuota ? overLine : byScore.slice(0, minQuota)).map((x) => x.st.name),
  );
  const students = scored.map(({ st, score, pct, skipped }) => {
    if (skipped) return { ...st, csp1: undefined };
    const passed = passNames.has(st.name);
    rows.push({
      name: st.name, score, passed, onTeam: st.onTeam,
      nationalRank: Math.max(1, Math.round(PRELIM_NATIONAL_S * pct)), pct,
    });
    return { ...st, csp1: { score, passed } };
  });

  const pass = rows.filter((r) => r.passed);
  const absent = scored.filter((x) => x.skipped).map((x) => x.st.name);
  const recap: ContestRecap = {
    year: s.year, week, kind: 'prelim', stageId: stage.id, title: stage.name,
    levels: [], minutes: stage.minutes, days: 1, rows: [], fullScore: 100, problems: [],
    prelim: rows,
    absent,
    cutoff: PRELIM_LINE,
    advanced: pass.map((r) => r.name),
    national: {
      total: PRELIM_NATIONAL_S,
      rows: rows
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((p) => ({
          name: p.name, score: p.score, rank: p.nationalRank ?? 0, pct: p.pct ?? 1,
          award: p.passed ? '晋级' : '未晋级',
          team: p.onTeam, note: 'S 卷',
        })),
    },
    note: `笔试直接出分：全校 ${rows.length} 人参加${absent.length ? `（${absent.length} 人停赛缺考）` : ''}，陕西线 ${PRELIM_LINE} 分，过线 ${overLine.length} 人${overLine.length < minQuota ? `（不足实考 20%，按官方下限补足到 ${minQuota} 人）` : '全部晋级'}；官方只规定晋级人数不少于实考 20%（${minQuota} 人），强校过线率通常高于全省平均。实际晋级 ${pass.length} 人。`,
  };
  return recordOfficialOutcome(
    {
      ...s,
      students,
      week: week + 1,
      phase: 'result',
      lastContest: recap,
      contests: [...s.contests, recap],
    },
    recap,
    stage,
  );
}

/** 按省线判奖：min 是该奖的最低分（满分按实际场次） */
interface ScoreLine { label: string; min: number; tone: AwardBand['tone'] }
function bandOfLines(lines: ScoreLine[], real: number): ScoreLine | null {
  for (const l of lines) if (real >= l.min) return l;
  return null;
}

/** 陕西 CSP-S 2025 第二轮官方一等线/名额（CCF 2025-11-14 评级通知）：
 *  157 人 / 100 分、二等 30 分，不设三等。参赛人数官方未公布，按 20% 一等率反推 ≈785。 */
const CSP2_GUIDE = {
  S: { total: 785, quota: 157, lines: [{ label: '省一', min: 100, tone: 'prov1' }, { label: '省二', min: 30, tone: 'silver' }] as ScoreLine[] },
};

/** 虚构外校/外省选手的分数分布池（满分按各赛事实际：CSP 400、NOIP 400、WC/APIO 300、NOI 705、CTT/CTS 100 积分制、IOI 600、省选总分 100 分制） */
export const FIELDS: Record<string, FieldSpec> = {
  'csp2.S': { total: 785, anchors: [{ q: 0, score: 400 }, { q: 0.2, score: 100 }, { q: 0.4, score: 30 }, { q: 1, score: 0 }] },
  noip: { total: 160, anchors: [{ q: 0, score: 300 }, { q: 0.2, score: 128 }, { q: 0.43, score: 95 }, { q: 0.49, score: 86 }, { q: 1, score: 0 }] },
  prov: { total: 79, anchors: [{ q: 0, score: 75 }, { q: 0.15, score: 65 }, { q: 0.5, score: 45 }, { q: 1, score: 5 }] },
  // WC2025：满分 300，金牌线 257（前 11.2%）、银牌线 211（前 38.6%）、铜牌线 167（前 68%）
  wc: { total: 500, anchors: [{ q: 0, score: 300 }, { q: 0.112, score: 257 }, { q: 0.386, score: 211 }, { q: 0.68, score: 167 }, { q: 1, score: 100 }] },
  apio: { total: 640, anchors: [{ q: 0, score: 290 }, { q: 0.1, score: 193 }, { q: 0.3, score: 130 }, { q: 0.6, score: 80 }, { q: 1, score: 0 }] },
  // NOI2026 真实金线 557（满分 705 = 笔试 100 + 两试 600 + 省队 A 类 5 分）；金 50 / 银 152 / 铜 85
  noi: { total: 338, anchors: [{ q: 0, score: 705 }, { q: 0.148, score: 557 }, { q: 0.5, score: 400 }, { q: 0.85, score: 300 }, { q: 1, score: 0 }] },
  // CTT/CTS 改用 100 分制的积分池，和上面的 composite×100 同刻度：
  // CTT 50 人取前 30（q=0.6）、CTS 30 人取前 6（q=0.2），两条线都有真实门槛。
  ctt: { total: 50, anchors: [{ q: 0, score: 100 }, { q: 0.3, score: 52 }, { q: 0.6, score: 26 }, { q: 1, score: 0 }] },
  cts: { total: 30, anchors: [{ q: 0, score: 100 }, { q: 0.2, score: 58 }, { q: 0.5, score: 36 }, { q: 1, score: 0 }] },
  // IOI 全球赛池（约 353 人，满分 600 = 两试各 300）：前 1/12 金（30）、前 1/4 银（89）、前 1/2 铜（177）
  ioi: {
    total: 353,
    anchors: [
      { q: 0, score: 600 },
      { q: 30 / 353, score: 440 },
      { q: 89 / 353, score: 330 },
      { q: 177 / 353, score: 215 },
      { q: 1, score: 0 },
    ],
  },
};

/** 全国/国际赛事按名次名额发奖（WC 500：金 56 / 银 137 / 铜 147；NOI 338：金 50 / 银 152 / 铜 85；APIO 640：金 64 / 银 128 / 铜 193；IOI 353：金 30 / 银 59 / 铜 88） */
export const NATIONAL_QUOTAS: Record<string, number[]> = {
  wc: [56, 193, 340],
  noi: [50, 202, 287],
  apio: [64, 192, 385],
  ioi: [30, 89, 177],
};

/** 陕西 NOIP 2025 官方线：一等 128（32 人）、二等 95（37）、三等 86（10） */
const NOIP_SSX = {
  total: 160,
  lines: [
    { label: 'NOIP 一等', min: 128, tone: 'prov1' },
    { label: 'NOIP 二等', min: 95, tone: 'silver' },
    { label: 'NOIP 三等', min: 86, tone: 'bronze' },
  ] as ScoreLine[],
  anchors: [[0.215, 0.494], [0.2375, 0.431], [0.32, 0.2]] as [number, number][],
};

/** APIO 2025 中国区线：金 193 / 银 130 / 铜 80（满分 300） */
const APIO_LINES: ScoreLine[] = [
  { label: '金牌', min: 193, tone: 'gold' },
  { label: '银牌', min: 130, tone: 'silver' },
  { label: '铜牌', min: 80, tone: 'bronze' },
];

/** 按全国分位找奖项档；NOI 铜牌还要求 ≥100 分 */
function bandOf(stage: StageDef, pct: number, real: number): AwardBand | null {
  for (const b of stage.bands) {
    if (pct > b.pct + 1e-9) continue;
    if (stage.id === 'noi' && b.label === '铜牌' && real < 100) return null;
    return b;
  }
  return null;
}

export const RIVAL_SCHOOLS: { school: string; isLocal: boolean; strengthPct: number; aces: string[] }[] = [
  { school: '省实验中学', isLocal: true, strengthPct: 0.14, aces: ['顾知行', '宋明轩', '许若尘'] },
  { school: '附中竞赛部', isLocal: true, strengthPct: 0.22, aces: ['沈亦辰', '周予安', '林景明'] },
  { school: '镇海二中', isLocal: false, strengthPct: 0.08, aces: ['江屿白', '陈致远', '余思齐'] },
  { school: '雅礼实验', isLocal: false, strengthPct: 0.12, aces: ['谢清晏', '陆行舟', '苏子昂'] },
];

function computeRivalComparisons(
  stage: StageDef,
  rows: StudentResult[],
  awards: AwardRow[],
  teamSet: Set<string>,
  stageField: number[],
  nationalRows: NonNullable<ContestRecap['national']>['rows'],
  seed: number,
  year: number,
): RivalComparison[] {
  if (!stageField.length || !rows.length) return [];
  const ourTeamScores = nationalRows
    .filter((r) => teamSet.has(r.name))
    .map((r) => r.score);
  const ourTop = ourTeamScores.length
    ? Math.max(...ourTeamScores)
    : Math.round(Math.max(0, ...rows.map((r) => r.real)));
  const ourMedals = awards.filter(
    (a) => teamSet.has(a.name) && (a.tone === 'gold' || a.tone === 'silver' || a.tone === 'prov1' || a.tone === 'team'),
  ).length;

  const isLocalStage = stage.id === 'csp2' || stage.id === 'noip' || stage.id === 'prov';
  const targets = isLocalStage
    ? RIVAL_SCHOOLS.filter((r) => r.isLocal || r.school === '镇海二中')
    : RIVAL_SCHOOLS;

  const descending = stageField.slice().sort((a, b) => b - a);
  const rng = makeRng((seed * 193 + year * 4099 + stage.week * 131 + 17) >>> 0);

  return targets.map((rv) => {
    const jitter = (rng() - 0.5) * 0.06;
    const q = clamp(rv.strengthPct + jitter, 0.02, 0.72);
    const idx = clamp(Math.floor(q * (descending.length - 1)), 0, descending.length - 1);
    const aceScore = Math.round(descending[idx] ?? 0);
    const ace = rv.aces[(year + stage.week + Math.floor(rng() * rv.aces.length)) % rv.aces.length];
    const rivalMedals = Math.max(1, Math.round((1 - q) * 3.2 + rng() * 1.2));
    const beaten = ourTop > aceScore || (ourTop === aceScore && ourMedals >= rivalMedals);
    return {
      school: rv.school,
      isLocal: rv.isLocal,
      ace,
      aceScore,
      ourTop,
      rivalMedals,
      ourMedals,
      beaten,
    };
  });
}

/** 为赛时直播榜单生成目标参考分数线（纯展示，随本年卷面难度偏移） */
export function guideLinesForStage(stage: StageDef): ContestGuideLine[] {
  const shift = paperShiftOf(stage);
  switch (stage.id) {
    case 'csp2': {
      const lines = shiftLines(CSP2_GUIDE.S.lines, shift);
      return lines.map((l) => ({ score: l.min, label: `S组${l.label}线`, tone: l.tone }));
    }
    case 'noip': {
      const lines = shiftLines(NOIP_SSX.lines, shift);
      return lines.slice(0, 2).map((l) => ({ score: l.min, label: `${l.label}线`, tone: l.tone }));
    }
    case 'wc':
      return [
        { score: 257, label: 'WC 金牌线', tone: 'gold' },
        { score: 211, label: 'WC 银牌线', tone: 'silver' },
        { score: 167, label: 'WC 铜牌线', tone: 'bronze' },
      ];
    case 'apio':
      return [
        { score: 193, label: 'APIO 金牌线', tone: 'gold' },
        { score: 130, label: 'APIO 银牌线', tone: 'silver' },
        { score: 80, label: 'APIO 铜牌线', tone: 'bronze' },
      ];
    case 'prov':
      return [
        { score: 220, label: '冲 A 类单试线', tone: 'gold' },
        { score: 160, label: '省队单试基准线', tone: 'team' },
      ];
    case 'noi':
      return [
        { score: 225, label: 'NOI 金牌单试线', tone: 'gold' },
        { score: 150, label: 'NOI 银牌单试线', tone: 'silver' },
        { score: 100, label: 'NOI 铜牌单试线', tone: 'bronze' },
      ];
    case 'ctt':
      return [
        { score: 185, label: '进 CTS 单试线', tone: 'team' },
        { score: 125, label: '国集稳健线', tone: 'silver' },
      ];
    case 'cts':
      return [
        { score: 205, label: '国家队冲刺线', tone: 'gold' },
        { score: 155, label: '答辩入围基准线', tone: 'team' },
      ];
    case 'ioi':
      return [
        { score: 220, label: 'IOI 金牌单试线', tone: 'gold' },
        { score: 165, label: 'IOI 银牌单试线', tone: 'silver' },
        { score: 108, label: 'IOI 铜牌单试线', tone: 'bronze' },
      ];
    default:
      return [];
  }
}

/** 复赛：4 题 4h，初赛过线的人全部参加（初中生也可考，NOIP 起才限高中生），按陕西官方省线判奖 */
function runCsp2(s: SeasonState, stage: StageDef, trace?: ContestRound[]): SeasonState {
  const week = s.week;
  const entrants = s.students.filter((st) => Boolean(st.csp1?.passed) && st.sitOut === 0);
  const tactic = s.nextTactic ?? 'normal';

  const allRows: StudentResult[] = [];
  const allProblems: Problem[] = [];
  const awards: AwardRow[] = [];
  const advanced: string[] = [];
  const nationalRows: NonNullable<ContestRecap['national']>['rows'] = [];
  const teamSet = new Set(s.team);
  const info = new Map<string, { rank: number; award: 0 | 1 | 2 | 3; score: number }>();
  const ranAny = entrants.length > 0;
  // 省线与分数池随本卷难度同步浮动（难卷降线、易卷抬线）
  const shift = paperShiftOf(stage);
  const csp2Guide = { ...CSP2_GUIDE.S, lines: shiftLines(CSP2_GUIDE.S.lines, shift) };
  const csp2Spec = shiftField(FIELDS['csp2.S'], shift, 400);
  const csp2Field = fieldScores(csp2Spec);

  if (ranAny) {
    const guide = csp2Guide;
    const cohort: CohortEntry[] = entrants.map((st) => ({
      name: st.name,
      skills: contestSkills(st),
      fatigue: 0,
      traits: st.traits,
    }));
    const seedBase = (s.seed * 31 + s.year * 977 + week * 7919 + 5) >>> 0;
    const traceStart = trace ? trace.length : 0;
    const run = runOneDay(cohort, stage.levels, stage.minutes, seedBase, stage.ranges, trace,
      `${stage.levels.length} 题 · ${stage.minutes / 60} 小时`, stage.curve, stage.format ?? 'oi', tactic);
    if (trace) {
      const gLines = guideLinesForStage(stage);
      for (let ti = traceStart; ti < trace.length; ti += 1) {
        trace[ti].stageId = stage.id;
        trace[ti].guideLines = gLines;
      }
    }
    allProblems.push(...run.problems);

    for (const r of run.rows) {
      allRows.push(r);
      // 省排名：陕西参赛池里比自己高的人数（随卷面难度同步偏移）
      const scoreInt = Math.round(r.real);
      const rank = rankAmong(csp2Field, scoreInt);
      const pct = pctOf(rank, csp2Spec.total);
      const line = bandOfLines(guide.lines, scoreInt);
      const awardNum: 0 | 1 | 2 | 3 = line ? (line.label.includes('省一') ? 1 : line.label.includes('省二') ? 2 : 3) : 0;
      info.set(r.name, { rank, award: awardNum, score: scoreInt });
      if (line) awards.push({ name: r.name, label: line.label, tone: line.tone });
      if (line && awardNum <= 2) advanced.push(r.name);
      nationalRows.push({
        name: r.name, score: scoreInt, rank, pct,
        award: line?.label ?? '无奖', team: teamSet.has(r.name), note: 'S 组',
      });
    }
  }

  // 展示用的总排名按真分排（发奖用的是省排名/省线）
  allRows.sort((a, b) => b.real - a.real);
  allRows.forEach((r, i) => { r.rank = i + 1; });

  const meanDiff = meanDifficulty(allProblems);
  const topicSet = new Set(allProblems.map((p) => p.topic));
  const students = s.students.map((st) => {
    const it = info.get(st.name);
    if (!it) return { ...st, csp2: undefined };
    const next: SeasonStudent = { ...st, csp2: { score: it.score, rank: it.rank, award: it.award } };
    return growFromContest(next, meanDiff, 4, 0.0012, topicSet);
  });

  const rivals = ranAny
    ? computeRivalComparisons(stage, allRows, awards, teamSet, csp2Field, nationalRows, s.seed, s.year)
    : undefined;
  const recap: ContestRecap = {
    year: s.year, week, kind: 'official', format: stage.format ?? 'oi', stageId: stage.id, title: stage.name,
    levels: stage.levels, minutes: stage.minutes, days: 1, rows: allRows, fullScore: 400, problems: allProblems,
    awards, advanced, tactic, rivals,
    national: { total: csp2Spec.total, rows: nationalRows },
    note: ranAny
      ? `初赛过线 ${entrants.length} 人参加（4 题 · 4h · OI 赛制）；二等及以上进 NOIP 名单。陕西线（随卷面难度浮动）：一等 ${csp2Guide.lines[0].min} 分（157 人）、二等 ${csp2Guide.lines[1].min} 分，不设三等`
      : '初赛没人过线，复赛报名表是空的',
  };
  return recordOfficialOutcome(
    {
      ...bumpFatigue({ ...s, students }, 1, new Set(entrants.map((st) => st.name))),
      week: week + 1,
      phase: 'result',
      lastContest: recap,
      contests: [...s.contests, recap],
    },
    recap,
    stage,
  );
}
/** 正式比赛：按真实资格链筛参赛者，跑完按全国/国际分位排名发奖 */
function runStage(s: SeasonState, stage: StageDef, trace?: ContestRound[]): SeasonState {
  const week = s.week;
  const format: ContestFormat = stage.format ?? 'oi';

  // 各赛事的正式资格（按真实 CCF 规程）
  const eligOfficial = (st: SeasonStudent) => {
    switch (stage.id) {
      case 'noip':
        return isSenior(st.grade) && (st.csp2?.award ?? 0) >= 1 && (st.csp2?.award ?? 0) <= 2;
      case 'wc':
        return isSenior(st.grade) && Boolean(st.noip?.first);
      case 'prov':
        // 官方：高三不占省选正式名额（gateText 写的「非高三」）
        return st.grade >= 4 && st.grade <= 5 && st.noip !== undefined;
      case 'apio':
        // 现实 APIO 中国区面向省队及 NOIP 一等前排高中生
        return Boolean(st.prov?.team) || (isSenior(st.grade) && Boolean(st.noip?.first));
      case 'noi':
        return Boolean(st.prov?.team);
      case 'ctt':
        // 跨学年国集周期：上学年 NOI 前 50 入选国集队员参加本学年 12 月 CTT
        return Boolean(st.cttEligible);
      case 'cts':
        return Boolean(st.ctt?.selected);
      case 'ioi':
        return Boolean(st.cts?.selected);
      default:
        return false;
    }
  };
  // 体验/E类夏令营名额：初中生 NOIP 须 CSP-S 省一；省选须 NOIP 达省一线；NOI E 类须省选达省队线（前 17）
  const eligExperience = (st: SeasonStudent) => {
    switch (stage.id) {
      case 'noip':
        return isJunior(st.grade) && (st.csp2?.award ?? 0) === 1;
      case 'prov':
        return isJunior(st.grade) && Boolean(st.noip?.reachedFirstLine);
      case 'noi':
        return isJunior(st.grade) && st.prov !== undefined && st.prov.rank <= 17;
      default:
        return false;
    }
  };

  const official = s.students.filter((st) => st.sitOut === 0 && eligOfficial(st));
  const experience = s.students.filter((st) => st.sitOut === 0 && eligExperience(st));
  const qualified = [...official, ...experience];
  const officialSet = new Set(official.map((st) => st.name));
  const experienceSet = new Set(experience.map((st) => st.name));
  const teamSet = new Set(s.team);

  // NOI 2025/2026 正式满分 705：笔试 100 + 两试各 300 + 省队 A 类加分 5
  const fullScore = stage.id === 'noi' ? 705 : stage.levels.length * 100 * stage.days;

  if (!qualified.length) {
    const recap: ContestRecap = {
      year: s.year, week, kind: 'official', format, stageId: stage.id, title: stage.name,
      levels: stage.levels, minutes: stage.minutes, days: stage.days,
      rows: [], fullScore, problems: [],
      note: `队里没有人拿到「${stage.gateText}」，这一场只能弃权`,
      awards: [], advanced: [],
    };
    return { ...s, week: week + 1, phase: 'result', lastContest: recap, contests: [...s.contests, recap] };
  }

  const tactic = s.nextTactic ?? 'normal';
  const cohort: CohortEntry[] = qualified.map((st) => ({
    name: st.name,
    skills: contestSkills(st),
    fatigue: 0,
    traits: st.traits,
  }));
  const seedBase = (s.seed * 31 + s.year * 977 + week * 7919 + 5) >>> 0;
  // 多试赛事：第 d 试取 ranges 里属于它的那一段；若 ranges 仅给了一天则安全复用
  const dayRanges = (d: number): [number, number][] | undefined => {
    if (!stage.ranges || stage.ranges.length === 0) return undefined;
    const n = stage.levels.length;
    const slice = stage.ranges.slice(d * n, (d + 1) * n);
    return slice.length === n ? slice : stage.ranges.slice(0, n);
  };
  const traceStart = trace ? trace.length : 0;
  const runs = Array.from({ length: stage.days }, (_, d) => runOneDay(
    cohort,
    stage.levels,
    stage.minutes,
    (seedBase + d * 1013) >>> 0,
    dayRanges(d),
    trace,
    stage.days > 1 ? `${stage.short} · 第 ${d + 1} 试` : `${stage.short} · ${stage.levels.length} 题 · ${stage.minutes / 60} 小时`,
    stage.curve,
    format,
    tactic,
  ));
  if (trace) {
    const gLines = guideLinesForStage(stage);
    for (let ti = traceStart; ti < trace.length; ti += 1) {
      trace[ti].stageId = stage.id;
      trace[ti].guideLines = gLines;
    }
  }
  const rows = stage.days > 1 ? mergeDays(runs, fullScore) : runs[0].rows;

  // NOI：100 分笔试（公开题库背诵，常规 98–100 分）+ 省队 A 类 5 分加分
  if (stage.id === 'noi') {
    const written = new Map<string, number>();
    const bonusOf = new Map<string, number>();
    for (const st of qualified) {
      const nameSeed = [...st.name].reduce((acc, ch) => (acc * 131 + ch.charCodeAt(0)) >>> 0, 7);
      written.set(st.name, noiWrittenScore(st, makeRng((seedBase ^ nameSeed ^ 0x9e3779b9) >>> 0)));
      bonusOf.set(st.name, officialSet.has(st.name) && st.prov?.category === 'A' ? 5 : 0);
    }
    for (const r of rows) {
      const w = written.get(r.name) ?? 0;
      const b = bonusOf.get(r.name) ?? 0;
      r.written = w;
      if (b > 0) r.bonus = b;
      r.real += w + b;
      r.est += w + b;
      r.delta = r.real - r.est;
    }
    rows.sort((a, b) => b.real - a.real);
    rows.forEach((r, i) => { r.rank = i + 1; });
    const byEst = rows.slice().sort((a, b) => b.est - a.est);
    byEst.forEach((r, i) => { r.estRank = i + 1; });
    for (const r of rows) {
      r.rankDelta = r.estRank - r.rank;
      r.calibration = clamp(100 - (Math.abs(r.delta) / fullScore) * 100, 0, 100);
    }
  }
  const problems: Problem[] = [];
  let pidOffset = 0;
  for (const r of runs) {
    for (const p of r.problems) problems.push({ ...p, id: p.id + pidOffset });
    pidOffset += r.problems.length;
  }

  // 省选：总分 = NOIP 标准分 30% + 省选标准分 70%（官方折算规则），按总分排省队
  // 标准化用「满分」而不是「校内最高分」，否则校队第一名永远排全省第一
  const PROV_TOP_RAW = 450; // 全省省选最高分（推算：约 75% 满分，官方不公布）
  const NOIP_TOP_RAW = 300; // 全省 NOIP 最高分（推算：2025 陕西最高分未公布）
  const provTotal = new Map<string, number>();
  if (stage.id === 'prov') {
    for (const r of rows) {
      const st = s.students.find((x) => x.name === r.name);
      // 官方标准分 = 本人 / 全省最高 × 100（不是除以满分）；全省最高用「我们的最高 vs 推算值」取大
      const noipStd = Math.min(1, (st?.noip?.score ?? 0) / NOIP_TOP_RAW) * 100;
      const provStd = Math.min(1, r.real / PROV_TOP_RAW) * 100;
      provTotal.set(r.name, (0.3 * noipStd + 0.7 * provStd) / 100);
    }
    rows.sort((a, b) => (provTotal.get(b.name) ?? 0) - (provTotal.get(a.name) ?? 0));
    rows.forEach((r, i) => { r.rank = i + 1; });
  }

  // 预计算本场外校分数池与省线（只算一次，避免在循环里重复生成与排序）
  const rawSpec = FIELDS[stage.id] ?? FIELDS.noip;
  const stageSpec = stage.id === 'noip' ? shiftField(rawSpec, paperShiftOf(stage), fullScore) : rawSpec;
  const stageField = fieldScores(stageSpec);
  const noipLines = stage.id === 'noip' ? shiftLines(NOIP_SSX.lines, paperShiftOf(stage)) : NOIP_SSX.lines;

  // CTT / CTS 用积分制：作业/互测 10% + CTT 三场 54% + CTS 两场 36%，不再按单场原始分排名
  const hwOf = new Map(s.students.map((st) => [st.name, st.homework ?? 50]));
  const compositeOf = new Map<string, number>();
  const specialRank = new Map<string, number>();
  const defenseOf = new Map<string, { score: number; rank: number }>();
  const defenseTop4 = new Set<string>();
  if (stage.id === 'ctt' || stage.id === 'cts') {
    for (const r of rows) {
      if (stage.id === 'ctt') {
        compositeOf.set(r.name, 0.10 * ((hwOf.get(r.name) ?? 50) / 100) + 0.54 * (r.real / fullScore));
      } else {
        const st = s.students.find((x) => x.name === r.name);
        compositeOf.set(r.name, (st?.ctt?.composite ?? 0) + 0.36 * (r.real / fullScore));
      }
    }
    const sorted = rows.slice().sort((a, b) => (compositeOf.get(b.name) ?? 0) - (compositeOf.get(a.name) ?? 0));
    sorted.forEach((r, i) => specialRank.set(r.name, i + 1));
    if (stage.id === 'cts') {
      // 答辩资格是「全国 CTS 积分榜前 6」，不是「本校前 6」。
      const eligible = sorted.filter((r) =>
        rankAmong(stageField, Math.round((compositeOf.get(r.name) ?? 0) * 100)) <= 6);
      const def = eligible.map((r) => {
        const st = s.students.find((x) => x.name === r.name);
        const hw = (st?.homework ?? 50) / 100;
        const noi = (st?.prevNoiScore ?? st?.noi?.score ?? 0) / 705;
        const read = st?.skills.reading ?? 0.5;
        const cts = r.real / fullScore;
        // 纯派生：论文/作业 40% + NOI 笔试与正赛 25% + 阅读表达 20% + CTS 15%
        return { name: r.name, score: 0.40 * hw + 0.25 * noi + 0.20 * read + 0.15 * cts };
      }).sort((a, b) => b.score - a.score);
      def.forEach((d, i) => {
        defenseOf.set(d.name, { score: d.score, rank: i + 1 });
        if (i < 4) defenseTop4.add(d.name);
      });
    }
  }

  const nationalRows: NonNullable<ContestRecap['national']>['rows'] = [];
  const awards: AwardRow[] = [];
  const advanced: string[] = [];
  const noiSelectedSet = new Set<string>();
  const noipLineFirstSet = new Set<string>();
  const provCategory = new Map<string, 'A' | 'B'>();
  let schoolTeam = 0; // 单校不超过省队 1/3：17 个名额 → 我校最多 5 人
  const poolTotal = stageSpec.total;

  for (const r of rows) {
    const isOfficial = officialSet.has(r.name);
    const special = stage.id === 'ctt' || stage.id === 'cts';
    // 判线 / 排名统一用四舍五入后的整数，榜上显示多少就按多少发奖
    const scoreInt = Math.round(r.real);
    const mine = special
      ? Math.round((compositeOf.get(r.name) ?? 0) * 100)
      : stage.id === 'prov'
        ? (provTotal.get(r.name) ?? 0) * 100
        : scoreInt;
    const rank = rankAmong(stageField, mine);
    const pct = pctOf(rank, stageSpec.total);
    let award = '';
    let tone: AwardRow['tone'] = 'silver';

    if (stage.id === 'prov') {
      if (isOfficial && rank <= 17 && schoolTeam < 5) {
        const cat: 'A' | 'B' = rank <= 5 ? 'A' : 'B';
        provCategory.set(r.name, cat);
        award = cat === 'A' ? '进省队 · A类' : '进省队 · B类';
        tone = 'team';
        schoolTeam += 1;
        advanced.push(r.name);
      } else if (!isOfficial) {
        award = rank <= 17 ? '体验（达省队线 · E类）' : '体验（不计成绩）';
      } else {
        award = '未进省队';
      }
    } else if (stage.id === 'ctt') {
      if (isOfficial && rank <= 30) {
        award = '进 CTS'; tone = 'team'; advanced.push(r.name);
      } else {
        award = '未进 CTS';
      }
    } else if (stage.id === 'cts') {
      if (isOfficial && defenseTop4.has(r.name)) {
        award = '进 IOI 国家队'; tone = 'team'; advanced.push(r.name);
      } else if (isOfficial && rank <= 6) {
        award = '进答辩（未入队）'; tone = 'silver';
      } else {
        award = '未进国家队';
      }
    } else if (stage.id === 'noip') {
      const line = bandOfLines(noipLines, scoreInt);
      if (line?.label === 'NOIP 一等') noipLineFirstSet.add(r.name);
      if (isOfficial) {
        award = line ? line.label : '无奖';
        tone = line?.tone ?? 'silver';
        if (line?.label === 'NOIP 一等') advanced.push(r.name);
      } else {
        award = line?.label === 'NOIP 一等' ? '后备体验（达一等线）' : '后备体验（无证书）';
      }
    } else if (stage.id === 'noi' && !isOfficial) {
      award = '夏令营 E 类（成绩证明）';
    } else {
      // WC / APIO / NOI / IOI 均按名次名额发金/银/铜牌
      const quotas = NATIONAL_QUOTAS[stage.id] ?? [];
      let idx = awardIndexByRank(rank, quotas);
      if (stage.id === 'noi' && idx === 2 && scoreInt < 100) idx = -1; // 铜牌须 ≥100/705
      const labels = ['金牌', '银牌', '铜牌'] as const;
      award = idx >= 0 ? labels[idx] : '无奖';
      tone = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'silver';
      if (stage.id === 'noi' && idx === 0) noiSelectedSet.add(r.name);
    }

    if (isOfficial && award && award !== '无奖' && !award.startsWith('未进')) {
      awards.push({ name: r.name, label: award, tone });
    }
    const note = !isOfficial
      ? (experienceSet.has(r.name) ? '体验' : '非正式')
      : stage.id === 'noi' && noiSelectedSet.has(r.name)
        ? '下学年国集 · 保送清北'
        : stage.id === 'cts' && defenseOf.has(r.name)
          ? `答辩第 ${defenseOf.get(r.name)!.rank}`
          : stage.id === 'ctt' || stage.id === 'cts'
            ? `积分 ${((compositeOf.get(r.name) ?? 0) * 100).toFixed(1)} · 队内第 ${specialRank.get(r.name) ?? '—'}`
            : '正式';
    const displayScore = stage.id === 'prov' ? Math.round((provTotal.get(r.name) ?? 0) * 100) : scoreInt;
    nationalRows.push({
      name: r.name, score: displayScore, raw: stage.id === 'prov' ? scoreInt : undefined, rank, pct, award, tone,
      team: teamSet.has(r.name),
      note,
    });
  }
  awards.sort((a, b) => (nationalRows.find((x) => x.name === a.name)?.rank ?? 9999) - (nationalRows.find((x) => x.name === b.name)?.rank ?? 9999));

  const awardOf = new Map(awards.map((a) => [a.name, a.label]));
  const advancedSet = new Set(advanced);
  const rankOf = new Map(nationalRows.map((r) => [r.name, r.rank]));
  const meanDiff = meanDifficulty(problems);
  const topicSet = new Set(problems.map((p) => p.topic));
  const students = s.students.map((st) => {
    const rank = rankOf.get(st.name);
    if (rank === undefined) return st;
    const label = awardOf.get(st.name) ?? '';
    let next: SeasonStudent = { ...st };
    if (stage.id === 'noip') {
      next = {
        ...next,
        noip: {
          score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0),
          rank,
          first: advancedSet.has(st.name),
          reachedFirstLine: noipLineFirstSet.has(st.name),
        },
      };
    } else if (stage.id === 'prov') {
      const inTeam = advancedSet.has(st.name);
      next = {
        ...next,
        prov: {
          score: Math.round((provTotal.get(st.name) ?? 0) * 100),
          raw: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0),
          rank,
          first: inTeam,
          team: inTeam,
          category: provCategory.get(st.name),
        },
      };
    } else if (stage.id === 'wc') {
      next = { ...next, wc: { score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0), medal: label === '金牌' ? 1 : label === '银牌' ? 2 : label === '铜牌' ? 3 : 0 } };
    } else if (stage.id === 'apio') {
      next = { ...next, apio: { score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0), medal: label === '金牌' ? 1 : label === '银牌' ? 2 : label === '铜牌' ? 3 : 0 } };
    } else if (stage.id === 'noi') {
      const selected = noiSelectedSet.has(st.name);
      next = {
        ...next,
        noi: {
          score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0),
          medal: label === '金牌' ? 1 : label === '银牌' ? 2 : label === '铜牌' ? 3 : 0,
          selected,
          baosong: selected,
        },
      };
    } else if (stage.id === 'ctt') {
      next = {
        ...next,
        ctt: {
          score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0),
          rank,
          selected: advancedSet.has(st.name),
          composite: compositeOf.get(st.name),
        },
      };
    } else if (stage.id === 'cts') {
      next = {
        ...next,
        cts: {
          score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0),
          rank,
          selected: advancedSet.has(st.name),
          composite: compositeOf.get(st.name),
          defenseRank: defenseOf.get(st.name)?.rank,
        },
      };
    } else if (stage.id === 'ioi') {
      next = { ...next, ioi: { score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0), medal: label === '金牌' ? 1 : label === '银牌' ? 2 : label === '铜牌' ? 3 : 0 } };
    }
    return growFromContest(next, meanDiff, problems.length, 0.0012 * stage.days, topicSet);
  });

  const rivals = computeRivalComparisons(stage, rows, awards, teamSet, stageField, nationalRows, s.seed, s.year);
  const scopeLabel = stage.id === 'ioi' ? '全球' : stage.id === 'noip' || stage.id === 'prov' ? '陕西' : '全国';
  const formatLabel = format === 'ioi' ? 'IOI 实时评测赛制' : 'OI 赛制';
  const recap: ContestRecap = {
    year: s.year, week, kind: 'official', format, stageId: stage.id, title: stage.name,
    levels: stage.levels, minutes: stage.minutes, days: stage.days,
    rows, fullScore, problems,
    awards, advanced, tactic, rivals,
    defense: stage.id === 'cts'
      ? [...defenseOf.entries()].map(([name, v]) => ({ name, score: v.score, rank: v.rank })).sort((a, b) => a.rank - b.rank)
      : undefined,
    national: { total: poolTotal, rows: nationalRows },
    note: `参赛 ${qualified.length} 人（正式 ${official.length}${experience.length ? ` · 体验 ${experience.length}` : ''}）· ${formatLabel} · 资格：${stage.gateText || '无门槛'} · ${scopeLabel}约 ${poolTotal.toLocaleString()} 人${stage.id === 'noi' ? ' · 满分 705（含 100 分笔试 + A 类 5 分），前 50 进下学年国集/保送' : ''}${stage.id === 'ctt' ? ' · 积分制：作业 10% + 三场 54%' : ''}${stage.id === 'cts' ? ' · 积分制：+两场 36%，前 6 答辩' : ''}`,
  };

  return recordOfficialOutcome(
    {
      ...bumpFatigue({ ...s, students }, stage.days, new Set(qualified.map((st) => st.name))),
      week: week + 1,
      phase: 'result',
      lastContest: recap,
      contests: [...s.contests, recap],
    },
    recap,
    stage,
  );
}

/** 正式比赛结算后：写入选手长期档案、更新校史奇闻纪录、并按主力获奖发放学校经费奖金 */
function recordOfficialOutcome(s: SeasonState, recap: ContestRecap, stage: StageDef): SeasonState {
  const archives = syncArchiveSnapshots(s.archives ?? {}, s.students, s.year);
  const records: SeasonRecords = { ...(s.records ?? {}) };
  const byName = new Map(s.students.map((st) => [st.name, st]));
  const natMap = new Map((recap.national?.rows ?? []).map((r) => [r.name, r]));
  const awardMap = new Map((recap.awards ?? []).map((a) => [a.name, a]));

  if (stage.id === 'csp1' && recap.prelim) {
    for (const pr of recap.prelim) {
      const st = byName.get(pr.name);
      if (!st) continue;
      const cur = archives[pr.name] ?? createEmptyArchive(st, s.year);
      const nextArch: StudentArchive = {
        ...cur,
        officialCount: cur.officialCount + 1,
        honors: [
          ...cur.honors,
          {
            year: s.year,
            grade: st.grade,
            stageId: stage.id,
            stageShort: stage.short,
            score: pr.score,
            rank: pr.nationalRank ?? 0,
            award: pr.passed ? '晋级复赛' : '未过线',
          },
        ],
      };
      archives[pr.name] = nextArch;
      if (!records.mostOfficialContests || nextArch.officialCount > records.mostOfficialContests.value) {
        records.mostOfficialContests = {
          name: pr.name,
          year: s.year,
          value: nextArch.officialCount,
          detail: `${GRADE_NAMES[st.grade]} · 累计 ${nextArch.officialCount} 场正赛`,
        };
      }
    }
    return { ...s, archives, records };
  }

  let budgetBonus = 0;
  for (const r of recap.rows) {
    const st = byName.get(r.name);
    if (!st) continue;
    const nat = natMap.get(r.name);
    const aw = awardMap.get(r.name);
    const awardLabel = aw?.label ?? nat?.award ?? '参赛';
    const cur = archives[r.name] ?? createEmptyArchive(st, s.year);

    const nextArch: StudentArchive = {
      ...cur,
      officialCount: cur.officialCount + 1,
      provFirsts: cur.provFirsts + (
        (stage.id === 'csp2' && aw?.label === '省一') ||
        (stage.id === 'noip' && aw?.label === 'NOIP 一等')
          ? 1
          : 0
      ),
      provTeams: cur.provTeams + (stage.id === 'prov' && st.prov?.team ? 1 : 0),
      noiGold: cur.noiGold + (stage.id === 'noi' && aw?.label === '金牌' ? 1 : 0),
      noiSilver: cur.noiSilver + (stage.id === 'noi' && aw?.label === '银牌' ? 1 : 0),
      noiBronze: cur.noiBronze + (stage.id === 'noi' && aw?.label === '铜牌' ? 1 : 0),
      noiSelected: cur.noiSelected + (stage.id === 'noi' && st.noi?.selected ? 1 : 0),
      ioiMedals: cur.ioiMedals + (stage.id === 'ioi' && aw ? 1 : 0),
      honors: [
        ...cur.honors,
        {
          year: s.year,
          grade: st.grade,
          stageId: stage.id,
          stageShort: stage.short,
          score: Math.round(nat?.score ?? r.real),
          rank: nat?.rank ?? r.rank,
          award: awardLabel,
        },
      ],
    };

    // 单场最高正赛得分率（至少达到一定绝对分才有意义）
    if (recap.fullScore > 0) {
      const ratioPct = Math.round((r.real / recap.fullScore) * 1000) / 10;
      if (!records.highestOfficialRatio || ratioPct > records.highestOfficialRatio.value) {
        records.highestOfficialRatio = {
          name: r.name,
          year: s.year,
          value: ratioPct,
          detail: `Y${s.year} ${stage.short} · ${Math.round(r.real)}/${recap.fullScore}（${ratioPct}%）`,
        };
      }
    }

    // 单题挂分王 / 反挂王（仅 OI 盲测赛制有挂分/反挂）
    if (recap.format !== 'ioi') {
      for (const pr of r.perProblem) {
        if (pr.delta < 0) {
          if (!nextArch.worstDrop || pr.delta < nextArch.worstDrop.delta) {
            nextArch.worstDrop = {
              year: s.year,
              stageShort: stage.short,
              problemId: pr.problemId,
              delta: pr.delta,
              reason: pr.reason || '暗病挂分',
            };
          }
          if (!records.worstDrop || pr.delta < records.worstDrop.value) {
            records.worstDrop = {
              name: r.name,
              year: s.year,
              value: pr.delta,
              detail: `Y${s.year} ${stage.short} P${pr.problemId + 1} · ${pr.est}→${pr.real}（${pr.reason || '挂分'}）`,
            };
          }
        } else if (pr.delta > 0) {
          if (!nextArch.bestGain || pr.delta > nextArch.bestGain.delta) {
            nextArch.bestGain = {
              year: s.year,
              stageShort: stage.short,
              problemId: pr.problemId,
              delta: pr.delta,
              reason: pr.reason || '反挂加分',
            };
          }
          if (!records.bestGain || pr.delta > records.bestGain.value) {
            records.bestGain = {
              name: r.name,
              year: s.year,
              value: pr.delta,
              detail: `Y${s.year} ${stage.short} P${pr.problemId + 1} · ${pr.est}→${pr.real}（${pr.reason || '反挂'}）`,
            };
          }
        }
      }
    }

    if (!records.mostOfficialContests || nextArch.officialCount > records.mostOfficialContests.value) {
      records.mostOfficialContests = {
        name: r.name,
        year: s.year,
        value: nextArch.officialCount,
        detail: `${GRADE_NAMES[st.grade]} · 累计 ${nextArch.officialCount} 场正赛`,
      };
    }

    archives[r.name] = nextArch;

    // 校队主力斩获荣誉为校队带来经费奖励
    if (st.onTeam && aw) {
      if (stage.id === 'csp2' && aw.label === '省一') budgetBonus += 3;
      else if (stage.id === 'noip' && aw.label === 'NOIP 一等') budgetBonus += 3;
      else if (stage.id === 'prov' && st.prov?.team) budgetBonus += 12;
      else if ((stage.id === 'wc' || stage.id === 'apio') && aw.label === '金牌') budgetBonus += 8;
      else if (stage.id === 'noi') {
        if (aw.label === '金牌') budgetBonus += 25;
        else if (aw.label === '银牌') budgetBonus += 15;
        else if (aw.label === '铜牌') budgetBonus += 8;
      } else if (stage.id === 'ioi') {
        budgetBonus += 30;
      }
    }
  }

  if (budgetBonus > 0) {
    recap.note = `${recap.note ? `${recap.note} ` : ''}· 学校奖励校队经费 +${budgetBonus}`;
  }
  return {
    ...s,
    budget: clamp(budgetOf(s) + budgetBonus, 0, 200),
    archives,
    records,
  };
}

/** 跑本周的比赛：赛历上有正式比赛就跑正式的，没有就跑校内模拟赛 */
export function runWeeklyContest(s: SeasonState, trace?: ContestRound[], tactic?: ContestTactic): SeasonState {
  const rawStage = stageOfWeek(s.week);
  // 按赛季年份现出一份「合理范围内的随机卷」：历年难度中位数为锚 + 年份偏难/偏易 + 逐题噪声
  const stage = rawStage ? stagePaperForYear(rawStage, s.year, s.seed) : rawStage;
  const runInput = tactic ? { ...s, nextTactic: tactic } : s;
  let next: SeasonState;
  if (!stage) next = runPractice(runInput, trace);
  else if (stage.kind === 'prelim') next = runPrelim(runInput, stage);
  else if (stage.id === 'csp2') next = runCsp2(runInput, stage, trace);
  else next = runStage(runInput, stage, trace);

  // 记录参赛场次并解锁盲盒苗子特性（累计打满 3 场或第 6 周后揭晓）
  const playedNames = new Set<string>([
    ...(next.lastContest?.rows ?? []).map((r) => r.name),
    ...(next.lastContest?.prelim ?? []).map((p) => p.name),
  ]);
  const revealAll = s.week >= 6;
  const students = next.students.map((st) => {
    const nextPlayed = (st.contestsPlayed ?? 0) + (playedNames.has(st.name) ? 1 : 0);
    const revealed = Boolean(st.traitsRevealed) || revealAll || nextPlayed >= 3;
    const sitOut = stage && st.sitOut > 0 ? st.sitOut - 1 : st.sitOut;
    return {
      ...st,
      sitOut,
      contestsPlayed: nextPlayed,
      traitsRevealed: revealed,
    };
  });
  return {
    ...next,
    students,
    nextTactic: 'normal',
  };
}

export interface AutoRunResult {
  season: SeasonState;
  weeksRun: number;
  stopReason: 'event' | 'stage' | 'fatigue' | 'yearEnd' | 'limit' | 'blocked';
  stopText: string;
}

/**
 * 一键按当前方案连续推进平淡训练周，消除机械点击疲劳。
 * 遇到以下任一情况立即停下交回控制：
 * 1) 触发每周事件卡（pendingEvent）
 * 2) 抵达正赛周（stageOfWeek）
 * 3) 主力中有队员疲劳 > 70
 * 4) 抵达学年末结算
 */
export function fastForwardWeeks(s: SeasonState, plan: WeekPlan, maxWeeks = 12): AutoRunResult {
  if (s.phase !== 'plan' || s.pendingEvent || stageOfWeek(s.week)) {
    return {
      season: s,
      weeksRun: 0,
      stopReason: 'blocked',
      stopText: s.pendingEvent ? '需先处理本周插曲' : stageOfWeek(s.week) ? '本周为正赛周' : '当前不在排训练阶段',
    };
  }
  let cur = s;
  let weeksRun = 0;
  let curPlan: WeekPlan = { ...plan };
  for (let i = 0; i < maxWeeks; i += 1) {
    if (cur.phase !== 'plan' || cur.pendingEvent || stageOfWeek(cur.week)) break;
    cur = planWeek(cur, curPlan);
    cur = runWeeklyContest(cur);
    cur = advanceWeek(cur);
    weeksRun += 1;
    // 连推第 2 周起沿用洁净方案，避免重复扣一次性特训项目或重复轮休
    curPlan = cur.lastPlan ?? {
      ...plan,
      special: null,
      alumniName: null,
      care: plan.care?.filter((c) => c.action !== 'rest'),
    };
    if (cur.phase === 'yearEnd' || cur.phase === 'finished') {
      return { season: cur, weeksRun, stopReason: 'yearEnd', stopText: `已连推 ${weeksRun} 周，抵达学年末结算` };
    }
    if (cur.pendingEvent) {
      return { season: cur, weeksRun, stopReason: 'event', stopText: `已连推 ${weeksRun} 周，第 ${cur.week} 周触发插曲「${cur.pendingEvent.title}」` };
    }
    if (stageOfWeek(cur.week)) {
      const stg = stageOfWeek(cur.week)!;
      return { season: cur, weeksRun, stopReason: 'stage', stopText: `已连推 ${weeksRun} 周，进入正赛周：${stg.name}` };
    }
    const tired = teamStudents(cur).find((x) => x.fatigue > 70);
    if (tired) {
      return { season: cur, weeksRun, stopReason: 'fatigue', stopText: `已连推 ${weeksRun} 周，${tired.name} 疲劳达 ${Math.round(tired.fatigue)}，建议调整或轮休` };
    }
  }
  return {
    season: cur,
    weeksRun,
    stopReason: 'limit',
    stopText: `已连续推进 ${weeksRun} 个训练周`,
  };
}

// ===== 周的推进 / 学年切换 =====
export function advanceWeek(s: SeasonState): SeasonState {
  if (s.phase !== 'result') return s;
  if (s.week > YEAR_WEEKS) return endYear(s);
  return withEvent({
    ...s,
    phase: 'plan',
    plan: null,
    report: null,
    pendingEvent: null,
    lastEventResult: null,
    weekMult: 1,
  });
}

function evaluateYearGoal(goalId: SeasonGoalId, summary: YearSummary): GoalResult {
  const def = SEASON_GOALS.find((g) => g.id === goalId) ?? SEASON_GOALS[0];
  const prov1 = summary.csp2First + summary.noipFirst;
  const provTeam = summary.provTeam;
  const noiMedals = summary.noiGold + summary.noiSilver + summary.noiBronze;

  let met = false;
  if (def.id === 'safe') met = prov1 >= 2;
  else if (def.id === 'ambitious') met = provTeam >= 1 || prov1 >= 4;
  else met = noiMedals >= 1 || provTeam >= 3;

  if (met) {
    const rewardBudget = def.id === 'gamble' ? 30 : def.id === 'ambitious' ? 18 : 10;
    const rewardSuspend = def.id === 'gamble' ? 2 : def.id === 'ambitious' ? 1 : 0;
    const deltaPrestige = def.id === 'gamble' ? 7 : def.id === 'ambitious' ? 4 : 2;
    return {
      goalId: def.id,
      title: def.name,
      met: true,
      note: `目标达成（${def.requirement}）· ${def.rewardText}`,
      rewardBudget,
      rewardSuspend,
      deltaPrestige,
    };
  }
  const deltaPrestige = def.id === 'gamble' ? -8 : def.id === 'ambitious' ? -5 : -3;
  return {
    goalId: def.id,
    title: def.name,
    met: false,
    note: `未达目标（${def.requirement}）· ${def.penaltyText}`,
    rewardBudget: 0,
    rewardSuspend: 0,
    deltaPrestige,
  };
}

/** 学年末：默认停在「继续 / 退休」的选择页，教练带多少年由自己决定 */
function endYear(s: SeasonState): SeasonState {
  const summary = summarizeYear(s);
  summary.graduates = s.students.filter((st) => st.grade === 6).map((st) => st.name);
  const goalResult = evaluateYearGoal(s.yearGoal ?? 'safe', summary);
  summary.goalResult = goalResult;
  const history = [...s.history, summary];
  const nextBudget = clamp(budgetOf(s) + goalResult.rewardBudget, 0, 200);
  const nextPrestige = clamp(s.prestige + goalResult.deltaPrestige, 0, 100);
  const nextYearSuspendBonus = (s.nextYearSuspendBonus ?? 0) + goalResult.rewardSuspend;
  if (s.year >= s.careerYears) {
    return { ...s, phase: 'finished', history, budget: nextBudget, prestige: nextPrestige, nextYearSuspendBonus };
  }
  return { ...s, phase: 'yearEnd', history, budget: nextBudget, prestige: nextPrestige, nextYearSuspendBonus };
}

/** 学年末选择「继续带队」 */
export function continueCareer(s: SeasonState): SeasonState {
  if (s.phase !== 'yearEnd') return s;
  return beginNextYear(s);
}

/** 学年末选择「退休结算」 */
export function retireCareer(s: SeasonState): SeasonState {
  if (s.phase !== 'yearEnd') return s;
  return { ...s, phase: 'finished' };
}

function summarizeYear(s: SeasonState): YearSummary {
  const team = teamStudents(s);
  const count = (f: (st: SeasonStudent) => boolean) => team.filter(f).length;
  const base = {
    year: s.year,
    team: s.team.slice(),
    csp1Pass: count((st) => Boolean(st.csp1?.passed)),
    csp2First: count((st) => st.csp2?.award === 1),
    csp2Second: count((st) => st.csp2?.award === 2),
    noipFirst: count((st) => Boolean(st.noip?.first)),
    provTeam: count((st) => Boolean(st.prov?.team)),
    wcGold: count((st) => st.wc?.medal === 1),
    wcSilver: count((st) => st.wc?.medal === 2),
    wcBronze: count((st) => st.wc?.medal === 3),
    apioGold: count((st) => st.apio?.medal === 1),
    apioSilver: count((st) => st.apio?.medal === 2),
    apioBronze: count((st) => st.apio?.medal === 3),
    noiGold: count((st) => st.noi?.medal === 1),
    noiSilver: count((st) => st.noi?.medal === 2),
    noiBronze: count((st) => st.noi?.medal === 3),
    noiSelected: count((st) => Boolean(st.noi?.selected)),
    cttSelected: count((st) => Boolean(st.ctt?.selected)),
    ctsSelected: count((st) => Boolean(st.cts?.selected)),
    ioiGold: count((st) => st.ioi?.medal === 1),
    ioiSilver: count((st) => st.ioi?.medal === 2),
    ioiBronze: count((st) => st.ioi?.medal === 3),
    avgOverallGain: team.length
      ? team.reduce((a, st) => a + (overallOf(st.skills) - st.startOverall), 0) / team.length
      : 0,
    graduates: [] as string[],
  };
  return base;
}

function beginNextYear(s: SeasonState): SeasonState {
  const grads = s.students.filter((st) => st.grade === 6);
  const archives = syncArchiveSnapshots(s.archives ?? {}, s.students, s.year);
  const records: SeasonRecords = { ...(s.records ?? {}) };

  // 记录本学年综合暴涨黑马 + 为每位高三毕业生定格去向
  for (const st of s.students) {
    const gain = Math.round((overallOf(st.skills) - st.startOverall) * 10) / 10;
    if (!records.fastestGrowth || gain > records.fastestGrowth.value) {
      records.fastestGrowth = {
        name: st.name,
        year: s.year,
        value: gain,
        detail: `Y${s.year} · ${st.startOverall.toFixed(1)} → ${overallOf(st.skills).toFixed(1)}`,
      };
    }
  }

  const gradSummaries = grads.map((g) => {
    const cur = archives[g.name] ?? createEmptyArchive(g, s.year);
    const dest = destinationOf(g, cur);
    archives[g.name] = {
      ...cur,
      graduatedYear: s.year,
      destination: dest,
      peakOverall: Math.max(cur.peakOverall, overallOf(g.skills)),
      bestTopic: bestTopicOf(g),
    };
    return { name: g.name, grade: g.grade, overall: overallOf(g.skills), destination: dest };
  });

  const staying = s.students
    .filter((st) => st.grade < 6)
    .map((st) => ({
      ...st,
      grade: (st.grade + 1) as Grade,
      ...(st.age === undefined ? {} : { age: st.age + 1 }),
      startSkills: cloneSkills(st.skills),
      startOverall: overallOf(st.skills),
      startRank: 0,
      fatigue: Math.round(st.fatigue * 0.4),
      homework: clamp((st.homework ?? 50) * 0.9 + 5, 0, 100),
      onTeam: false,
      onReserve: false,
      sitOut: 0,
      // 跨学年结转：上学年 NOI 前 50 获得本学年 12 月 CTT 国家集训队资格
      cttEligible: Boolean(st.noi?.selected),
      prevNoiScore: st.noi?.selected ? st.noi.score : undefined,
      // 清空上一学年的资格链
      csp1: undefined, csp2: undefined, noip: undefined,
      wc: undefined, prov: undefined, apio: undefined, noi: undefined,
      ctt: undefined, cts: undefined, ioi: undefined,
    }));

  const baseCohort = buildCohort((s.seed * 13 + s.year * 104729 + 7) >>> 0);
  const newcomers: SeasonStudent[] = [];
  // 每年补 6 个初一 + 4 个高一：初中生是校队的底座，高中生才是省选/NOI 的兵源
  const intake: Grade[] = [1, 1, 1, 1, 1, 1, 4, 4, 4, 4];
  for (let i = 0; i < intake.length; i++) {
    const tmpl = baseCohort[Math.floor(makeRng((s.seed * 977 + s.year * 131 + i * 37 + 5) >>> 0)() * baseCohort.length)];
    newcomers.push(makeNewcomer(i, s.year + 1, s.seed, tmpl, intake[i], s.prestige));
  }

  // 新生名是随机拼的，可能和在校生/往届生重名；重名会让比赛引擎按名字认人出错，这里强制去重
  const used = new Set([...staying.map((st) => st.name), ...Object.keys(archives)]);
  for (const n of newcomers) {
    if (!used.has(n.name)) { used.add(n.name); continue; }
    let k = 2;
    let name = `${n.name}（${k}）`;
    while (used.has(name)) { k++; name = `${n.name}（${k}）`; }
    n.name = name;
    used.add(name);
  }
  const students = [...staying, ...newcomers];
  rankStudents(students);
  const nextArchives = syncArchiveSnapshots(archives, newcomers, s.year + 1, false, students.length);
  const keptTeam = s.team.filter((n) => students.some((st) => st.name === n));
  const keptReserve = s.reserve.filter((n) => students.some((st) => st.name === n));
  // 声望：比赛成绩好，来年招生质量高；没成绩就慢慢回落到 50。
  const lastYear = s.history[s.history.length - 1];
  const prestigeGain = lastYear
    ? lastYear.provTeam * 8 + lastYear.noiGold * 15 + lastYear.noiSilver * 8 + lastYear.noiBronze * 3
      + lastYear.csp2First * 2 + lastYear.noipFirst * 2 + lastYear.cttSelected * 5 + lastYear.ioiGold * 20
    : 0;
  const prestige = clamp(s.prestige * 0.85 + 7.5 + prestigeGain, 0, 100);
  const nextBudget = clamp(Math.round(budgetOf(s) * 0.5) + initialBudgetFor(prestige), 20, 150);
  const nextSuspendQuota = initialSuspendFor(prestige) + (s.nextYearSuspendBonus ?? 0);

  return {
    ...s,
    year: s.year + 1,
    week: 1,
    phase: 'team',
    students,
    team: [],
    reserve: [],
    prestige,
    budget: nextBudget,
    suspendQuota: nextSuspendQuota,
    nextYearSuspendBonus: 0,
    scheduledEvents: [],
    campUsed: 0,
    suspendPressure: 0,
    archives: nextArchives,
    records,
    lastTeam: keptTeam,
    lastReserve: keptReserve,
    plan: null,
    report: null,
    lastContest: null,
    contests: [],
    graduates: gradSummaries,
    newcomers: newcomers.map((n) => n.name),
    // 本学年的 summary 已在 endYear 里写入 history，这里不再重复 push
    history: s.history,
    pendingEvent: null,
    lastEventResult: null,
    weekMult: 1,
  };
}

// ===== 结算 =====
export interface CareerRow {
  name: string;
  grade: Grade;
  onTeam: boolean;
  startOverall: number;
  endOverall: number;
  overallGain: number;
  csp2Award: number;
  noipFirst: boolean;
  provTeam: boolean;
  noiMedal: number;
}

export interface CareerReport {
  years: YearSummary[];
  totals: {
    csp1Pass: number; csp2First: number; csp2Second: number; noipFirst: number;
    provTeam: number; wcGold: number; wcSilver: number; wcBronze: number;
    apioGold: number; apioSilver: number; apioBronze: number;
    noiGold: number; noiSilver: number; noiBronze: number;
    noiSelected: number;
    cttSelected: number; ctsSelected: number;
    ioiGold: number; ioiSilver: number; ioiBronze: number;
  };
  roster: CareerRow[];
  team: CareerRow[];
  coachScore: number;
  grade: string;
  comment: string;
  avgOverallGain: number;
  /** 兼容旧脚本的字段 */
  provinceFirstCount: number;
  provinceTeamCount: number;
  avgRankGain: number;
  final: ContestRecap | null;
  rows: CareerRow[];
}

const GRADES: { min: number; grade: string; comment: string }[] = [
  { min: 85, grade: 'S · 传奇教练', comment: '几年下来，你把一所学校的名字打进了省队名单，下一届学生是冲着你的名头来的。' },
  { min: 55, grade: 'A · 金牌教练', comment: '省队、NOI 奖牌都有进账，队伍整体抬了一大截，是能拿出去说的成绩。' },
  { min: 34, grade: 'B · 优秀教练', comment: '训练有效果，学生能摸到省一线，离顶尖教练差一口气。' },
  { min: 19, grade: 'C · 合格教练', comment: '稳住了基本盘，成绩单不好看也不难看。' },
  { min: 0, grade: 'D · 新手上路', comment: '带完这一届，学生大多还在原地打转，赛历一场场错过。' },
];

/** 生涯结算：累计战绩 + 教练评分 */
export function seasonReport(s: SeasonState): CareerReport {
  const current = summarizeYear(s);
  const settled = s.phase === 'finished' || s.phase === 'yearEnd';
  const years = settled
    ? s.history
    : (s.history.length ? [...s.history, current] : [current]);
  const t = {
    csp1Pass: 0, csp2First: 0, csp2Second: 0, noipFirst: 0, provTeam: 0,
    wcGold: 0, wcSilver: 0, wcBronze: 0,
    apioGold: 0, apioSilver: 0, apioBronze: 0,
    noiGold: 0, noiSilver: 0, noiBronze: 0, noiSelected: 0,
    cttSelected: 0, ctsSelected: 0,
    ioiGold: 0, ioiSilver: 0, ioiBronze: 0,
  };
  for (const y of years) {
    t.csp1Pass += y.csp1Pass; t.csp2First += y.csp2First; t.csp2Second += y.csp2Second; t.noipFirst += y.noipFirst;
    t.provTeam += y.provTeam;
    t.wcGold += y.wcGold; t.wcSilver += y.wcSilver; t.wcBronze += y.wcBronze;
    t.apioGold += y.apioGold; t.apioSilver += y.apioSilver; t.apioBronze += y.apioBronze;
    t.noiGold += y.noiGold; t.noiSilver += y.noiSilver; t.noiBronze += y.noiBronze;
    t.noiSelected += y.noiSelected;
    t.cttSelected += y.cttSelected; t.ctsSelected += y.ctsSelected;
    t.ioiGold += y.ioiGold; t.ioiSilver += y.ioiSilver; t.ioiBronze += y.ioiBronze;
  }

  const roster: CareerRow[] = s.students.map((st) => ({
    name: st.name,
    grade: st.grade,
    onTeam: st.onTeam,
    startOverall: st.startOverall,
    endOverall: overallOf(st.skills),
    overallGain: overallOf(st.skills) - st.startOverall,
    csp2Award: st.csp2?.award ?? 0,
    noipFirst: Boolean(st.noip?.first),
    provTeam: Boolean(st.prov?.team),
    noiMedal: st.noi?.medal ?? 0,
  }));

  const avgOverallGain = years.length
    ? years.reduce((a, y) => a + y.avgOverallGain, 0) / years.length
    : 0;

  // 教练评分：按「每年平均产出」算，避免带得越久累计项越爆表；
  // 分母至少按 3 年算，防止只带一年、继承一支强队就直接 S。
  // 再加一小块「生涯高光」，让一次 IOI/NOI 金牌不会因为带了很多年被摊薄。
  const perYear = (n: number) => n / Math.max(3, years.length);
  let score = 10;
  score += perYear(t.csp1Pass) * 1.5;    // 每年初赛过线人数
  score += perYear(t.csp2First) * 3;     // 每年 S 组省一
  score += perYear(t.csp2Second) * 1.2;  // 复赛省二也算产出，不给 0 分
  score += perYear(t.noipFirst) * 3;     // 每年 NOIP 省一
  score += perYear(t.provTeam) * 8;      // 每年省队
  score += perYear(t.noiGold) * 25 + perYear(t.noiSilver) * 12 + perYear(t.noiBronze) * 5;
  score += perYear(t.cttSelected) * 2 + perYear(t.ctsSelected) * 6;
  score += perYear(t.ioiGold) * 18 + perYear(t.ioiSilver) * 10 + perYear(t.ioiBronze) * 5;
  score += perYear(t.wcGold + t.apioGold) * 4 + perYear(t.wcSilver + t.apioSilver) * 1.5;
  score += clamp(avgOverallGain, 0, 30) * 0.8;
  // 生涯高光：不按年摊薄，封顶 15 分，避免「带 10 年只有 1 块 IOI 金」被判成平庸
  score += Math.min(15, t.ioiGold * 10 + t.ioiSilver * 6 + t.ioiBronze * 3 + t.noiGold * 4 + t.ctsSelected * 2);
  const coachScore = Math.round(clamp(score, 0, 100));
  const g = GRADES.find((x) => coachScore >= x.min) ?? GRADES[GRADES.length - 1];

  const teamRows = roster.filter((r) => r.onTeam);
  const lastContest = s.lastContest ?? [...s.contests].reverse().find((c) => c.kind === 'official') ?? null;

  return {
    years,
    totals: t,
    roster,
    team: teamRows,
    coachScore,
    grade: g.grade,
    comment: g.comment,
    avgOverallGain,
    provinceFirstCount: t.csp2First + t.noipFirst,
    provinceTeamCount: t.provTeam,
    avgRankGain: 0,
    final: lastContest,
    rows: roster,
  };
}

// ===== 给 UI 用的杂项 =====
export const INTENSITY_INFO: Record<WeekIntensity, { name: string; note: string; icon: 'book' | 'flame' | 'coffee' }> = {
  normal: { name: '常规训练', note: '每天一节专题课，涨得稳、不累人', icon: 'book' },
  extra: { name: '加练', note: '晚上加课 + 周末加测，涨得快但人会被榨干', icon: 'flame' },
  rest: { name: '休息', note: '这周放假，恢复疲劳，专题不涨', icon: 'coffee' },
};

export function topicNameOf(t: Topic): string {
  return TOPIC_NAMES[t];
}

export function rosterSorted(s: SeasonState): SeasonStudent[] {
  return s.students.slice().sort((a, b) => overallScoreOf(b) - overallScoreOf(a));
}

export function nameOfRoster(): string[] {
  return ROSTER.map((r) => r.name);
}

/** 某场比赛的参赛人数（正式 + 体验名额，给"本周赛事"提示用） */
export function qualifiedFor(s: SeasonState, stage: StageDef): number {
  return s.students.filter((st) => {
    if (st.sitOut > 0) return false;
    switch (stage.id) {
      case 'csp1':
        return true;
      case 'csp2': return Boolean(st.csp1?.passed);
      case 'noip':
        // 正式：S 组二等及以上（限高中生）；体验：初中生须 S 组省一
        return isSenior(st.grade)
          ? (st.csp2?.award ?? 0) >= 1 && (st.csp2?.award ?? 0) <= 2
          : isJunior(st.grade) && (st.csp2?.award ?? 0) === 1;
      case 'wc': return isSenior(st.grade) && Boolean(st.noip?.first);
      case 'prov':
        return (st.grade >= 4 && st.grade <= 5 && st.noip !== undefined)
          || (isJunior(st.grade) && Boolean(st.noip?.reachedFirstLine));
      case 'apio':
        return Boolean(st.prov?.team) || (isSenior(st.grade) && Boolean(st.noip?.first));
      case 'noi':
        return Boolean(st.prov?.team) || (isJunior(st.grade) && st.prov !== undefined && st.prov.rank <= 17);
      case 'ctt': return Boolean(st.cttEligible);
      case 'cts': return Boolean(st.ctt?.selected);
      case 'ioi': return Boolean(st.cts?.selected);
      default: return false;
    }
  }).length;
}
