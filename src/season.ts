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
import { awardIndexByRank, fieldScores, pctOf, rankAmong } from './field.ts';
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
import { ABILITY_CEIL, IS_OPV, loadOpvConfig, opvSkills } from './opv.ts';
import type { OpvConfig } from './opv.ts';
import type { CohortEntry, ContestConfig, Problem, Skills, StudentResult, Topic } from './types.ts';

export const YEAR_WEEKS = 40;
/** 兼容旧脚本的默认值；教练实际可以带任意多年，学年末自己决定是否退休 */
export const CAREER_YEARS = 3;
export const MAX_YEARS = 99;
/** 兼容旧脚本的名字（一学年周数） */
export const SEASON_WEEKS = YEAR_WEEKS;
export const TEAM_MIN = 6;
export const TEAM_MAX = 8;

/**
 * 一场「可观看」的比赛：runWeeklyContest 传 trace 时把每场要打的 cfg 记下来，
 * 前端用同一个 cfg 重建 Contest（同 seed 同结果），逐场播放给教练看；
 * 脚本不传 trace，则照旧瞬间算完——两边走的是同一个引擎，结果完全一致。
 */
export interface ContestRound {
  label: string;
  cfg: ContestConfig;
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
    advanceText: '过线才能参加第二轮', clock: '2026-09-19 · 第一轮',
    national: 34400, anchors: [], bands: [],
    note: '全校一张卷（S 卷），陕西线 37 分；晋级名额不少于实考 20%',
  },
  {
    id: 'csp2', week: 8, name: 'CSP 第二轮（复赛）', short: '复赛',
    kind: 'contest', group: 'S', levels: [1, 3, 7, 7], minutes: 240, days: 1,
    // 历年 CSP-S2：T1 普及+/提高-、T2 提高、T3 提高+、T4 省选
    ranges: [[20, 32], [48, 58], [100, 110], [106, 114]],
    // 校准：引擎原始得分率 → 2025 陕西 S 组真实得分率（强选手 84% ≈ 336 分）
    curve: [[0, 0], [0.25, 0.12], [0.32, 0.26], [0.38, 0.5], [0.45, 0.85], [0.6, 0.95], [1, 1]],
    gate: 'csp1', gateText: '初赛过线', advanceText: 'S 组二等及以上进 NOIP 名单',
    clock: '2026-10-31 · 4 小时',
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
    kind: 'contest', group: 'S', levels: [2, 7, 7, 7], minutes: 270, days: 1,
    // 历年 NOIP：T1 提高-、T2 提高、T3 提高+、T4 省选
    ranges: [[32, 42], [100, 110], [106, 114], [106, 114]],
    // 校准：NOIP 2025 陕西一等线 128（≈32%）、二等 95、三等 86；强选手 ~67%（270 分）
    curve: [[0, 0], [0.15, 0.28], [0.3, 0.5], [0.4, 0.62], [0.5, 0.72], [0.65, 0.85], [1, 1]],
    gate: 'csp2', gateText: 'CSP-S 二等及以上（限高中生）', advanceText: '一等进省选 / WC 名单',
    clock: '2026-11-29 · 4.5h',
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
    id: 'wc', week: 16, name: 'WC 冬令营', short: 'WC',
    kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 1,
    // WC 学生营员测试：省选 ~ NOI-
    ranges: [[100, 110], [104, 114], [106, 114]],
    // 校准：WC2025 银线 257/300、铜线 211；陕西仅 6 人获奖（167–240 分）
    curve: [[0, 0], [0.1, 0.35], [0.2, 0.6], [0.35, 0.82], [0.5, 0.92], [1, 1]],
    gate: 'noip', gateText: 'NOIP 一等（省推荐名额）', advanceText: '测试排名，不评奖',
    clock: '2027-02 · 青岛 · 冬令营测试',
    national: 300, anchors: [[0.15, 0.9], [0.35, 0.5], [0.55, 0.1]], bands: [],
    note: '学生营员测试不评金银铜；国家队从国家集训队（NOI 前 50）里选拔',
  },
  {
    id: 'prov', week: 21, name: '省选（两试）', short: '省选',
    kind: 'contest', group: 'OPEN', levels: [6, 7, 7], minutes: 270, days: 2,
    // 省选两试：T1 提高+、T2 省选-、T3 省选/NOI
    ranges: [[74, 94], [102, 112], [106, 114]],
    // 校准：省选两试合计 600 分，陕西最高约 350–400、省队线约 300
    curve: [[0, 0], [0.3, 0.4], [0.5, 0.62], [0.65, 0.78], [0.8, 0.9], [1, 1]],
    gate: 'noip', gateText: 'NOIP 正式选手（非高三）', advanceText: '省队 17 个名额：A 类 5 + B 类 12（上限）',
    clock: '2027-03 上旬 · 两试',
    national: 160, anchors: [[0.2, 0.5], [0.27, 0.2], [0.32, 0.05]], bands: [],
    note: '总分 = NOIP 标准分×30% + 省选标准分×70%；单校不得超过省队名额的 1/3（17 个名额 → 我校最多 5 人）',
  },
  {
    id: 'apio', week: 26, name: 'APIO', short: 'APIO',
    kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 1,
    // APIO 中国区：省选 ~ NOI-
    ranges: [[94, 104], [100, 110], [106, 114]],
    // 校准：APIO2025 中国区 300 分、金 193 / 银 130 / 铜 80
    curve: [[0, 0], [0.3, 0.42], [0.45, 0.55], [0.6, 0.7], [0.8, 0.88], [1, 1]],
    gate: 'prov', gateText: '进入省队', advanceText: '亚太赛金银铜',
    clock: '2027-05 · 中国区',
    national: 600, anchors: [[0.267, 0.517], [0.433, 0.258], [0.643, 0.086]],
    bands: [
      { pct: 0.086, label: '金牌', tone: 'gold' },
      { pct: 0.258, label: '银牌', tone: 'silver' },
      { pct: 0.517, label: '铜牌', tone: 'bronze' },
    ],
    note: 'APIO2025 中国区 744 位师生、金牌 64 / 银 128 / 铜 193（线 193/130/80）',
  },
  {
    id: 'noi', week: 32, name: 'NOI（两试）', short: 'NOI',
    kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 2,
    // NOI 两试：NOI ~ NOI+
    ranges: [[90, 100], [102, 112], [106, 114]],
    // 按 NOI2026 游记校准：满分 700 = 笔试 100 + 两试各 300；
    // 特别之处真实总分 557（100+100+60+97+100+100+0），顶尖选手两试得分率应落在 0.76 上下。
    // 旧曲线把 145 知识点的选手压到 485 分 / 全国 #114；逐档重标定后 145 知识点约 560 分，
    // 越过 FIELDS.noi 的 557 金线（全国第 50 名），国集链 CTT → CTS → IOI 才可达。
    // 金线是硬门槛：差 2 分也是银牌、CTT 全链无人，所以这一段必须留一点余量。
    curve: [[0, 0], [0.1, 0.74], [0.2, 0.94], [0.3, 0.97], [0.45, 1], [1, 1]],
    gate: 'prov', gateText: '进入省队', advanceText: '全国赛金银铜（初中生只能进夏令营）',
    clock: '2027-07 · 两试',
    national: 337, anchors: [[0.25, 0.85], [0.4, 0.6], [0.55, 0.148]],
    bands: [
      { pct: 0.148, label: '金牌', tone: 'gold' },
      { pct: 0.6, label: '银牌', tone: 'silver' },
      { pct: 0.85, label: '铜牌', tone: 'bronze' },
    ],
    note: '正式选手约 337 人（获奖 287 ÷ 85%）：金 50 / 银 152 / 铜 85；总分 = 笔试 100 + 两试各 300；铜牌还要求 ≥100 分',
  },
  {
    id: 'ctt', week: 34, name: 'CTT 国家集训队集训', short: 'CTT',
    kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 3,
    // 集训队测试：NOI 金 ~ IOI 级，三场
    ranges: [[100, 110], [106, 114], [106, 114]],
    curve: [[0, 0], [0.1, 0.3], [0.25, 0.55], [0.45, 0.78], [0.65, 0.9], [1, 1]],
    gate: 'noi', gateText: 'NOI 前 50（国家集训队 / 保送）', advanceText: '总成绩前 30 名进 CTS',
    clock: '2027-07 下旬 · 三试',
    national: 50, anchors: [[0.2, 0.85], [0.5, 0.55], [0.8, 0.2]], bands: [],
    note: '总成绩 = 作业/互测 10% + CTT 三场各 18%（合计 54%）；测试后取前 30 名进入 CTS',
  },
  {
    id: 'cts', week: 37, name: 'CTS 国家队选拔', short: 'CTS',
    kind: 'contest', group: 'OPEN', levels: [2, 7, 7], minutes: 300, days: 2,
    // 国家队选拔：IOI 级；六属性删除后按引擎可达区间压一档
    ranges: [[106, 114], [106, 114], [106, 114]],
    curve: [[0, 0], [0.08, 0.25], [0.2, 0.5], [0.4, 0.75], [0.62, 0.9], [1, 1]],
    gate: 'ctt', gateText: 'CTT 总成绩前 30 名', advanceText: '前 6 名答辩 → 前 4 名国家队',
    clock: '2027-08 上旬 · 两试',
    national: 30, anchors: [[0.15, 0.9], [0.45, 0.6], [0.75, 0.25]], bands: [],
    note: '总成绩 = 作业/互测 10% + CTT 54% + CTS 两场各 18%（36%）；前 6 名进入论文答辩，答辩定 4 人',
  },
  {
    id: 'ioi', week: 40, name: 'IOI 国际信息学奥林匹克', short: 'IOI',
    kind: 'contest', group: 'OPEN', levels: [6, 7, 7], minutes: 300, days: 2,
    // IOI：国家队 4 人，国际赛难度；同样按引擎可达区间校准
    ranges: [[44, 52], [104, 112], [106, 114]],
    curve: [[0, 0], [0.08, 0.3], [0.2, 0.58], [0.4, 0.82], [0.62, 0.93], [1, 1]],
    gate: 'cts', gateText: 'CTS 前 4 名（国家队）', advanceText: '国际赛金银铜',
    clock: '2027-08 中旬 · 两试',
    national: 4, anchors: [[0.25, 0.9], [0.5, 0.65], [0.75, 0.35]], bands: [
      { pct: 0.25, label: '金牌', tone: 'gold' },
      { pct: 0.5, label: '银牌', tone: 'silver' },
      { pct: 1, label: '铜牌', tone: 'bronze' },
    ],
    note: '中国队 4 人出征；按 4 人内部排名发金/银/铜（简化）',
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

/** 初赛：陕西 2025 S 线 37 分，全国分位来自官方指导线 */
export const PRELIM_NATIONAL_S = 34400;
/** 官方指导线：37 分 = 全国前 20%（晋级名额 ≈ 实考 20%）；62.5 分 = 前 5% */
export const PRELIM_ANCHORS_S: [number, number][] = [[0.37, 0.2], [0.625, 0.05]];

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
  // ===== 本学年资格链（每年 6 月清空）=====
  csp1?: { score: number; passed: boolean };
  csp2?: { score: number; rank: number; award: 0 | 1 | 2 | 3 };
  noip?: { score: number; rank: number; first: boolean };
  wc?: { score: number; medal: 0 | 1 | 2 | 3 };
  prov?: { score: number; rank: number; first: boolean; team: boolean; raw?: number };
  apio?: { score: number; medal: 0 | 1 | 2 | 3 };
  noi?: { score: number; medal: 0 | 1 | 2 | 3; selected?: boolean; baosong?: boolean };
  ctt?: { score: number; rank: number; selected: boolean; composite?: number };
  cts?: { score: number; rank: number; selected: boolean; composite?: number; defenseRank?: number };
  ioi?: { score: number; medal: 0 | 1 | 2 | 3 };
}

export type SquadFocus = 'main' | 'balanced' | 'reserve';

export interface WeekPlan {
  topic: Topic | null;
  intensity: WeekIntensity;
  /** 教练精力分配：主力优先 / 均衡 / 梯队优先 */
  focus?: SquadFocus;
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
  graduates: { name: string; grade: Grade; overall: number }[];
  /** 本学年新入学的高一新生 */
  newcomers: string[];
  /** 历年总结 */
  history: YearSummary[];
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

export function createSeason(seed: number, careerYears = MAX_YEARS): SeasonState {
  const career = Math.max(1, Math.min(MAX_YEARS, careerYears));
  const cohort = buildCohort(seed >>> 0);
  const rng = makeRng((seed * 7919 + 17) >>> 0);
  const grades = assignGrades(cohort.map((e) => e.name), seed >>> 0);
  const students: SeasonStudent[] = cohort.map((e) => {
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
    // 天赋表填了就用表里的，没填沿用种子随机；随机数照常消耗，保证没填的人结果不变
    const talentRoll = 0.85 + rng() * 0.3;
    return {
      name: e.name,
      skills,
      startSkills: cloneSkills(skills),
      grade: level?.grade ?? over?.grade ?? grades.get(e.name) ?? 4,
      startOverall: overallOf(skills),
      startRank: 0,
      fatigue: 0,
    homework: 50,
    sitOut: 0,
      talent: level ? talentFromGrowth(level.growth) : (over?.talent ?? TALENT_BY_NAME[e.name] ?? talentRoll),
      onTeam: false,
      onReserve: false,
      joined: 1,
    };
  });
  rankStudents(students);
  const state: SeasonState = {
    seed: seed >>> 0,
    careerYears: career,
    year: 1,
    week: 1,
    phase: 'team',
    students,
    team: [],
    reserve: [],
    prestige: 50,
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
  return { ...s, students, prestige: cfg.prestige };
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

export function setSquad(s: SeasonState, names: string[], reserve: string[] = []): SeasonState {
  // 主力人数上不封顶；梯队默认最多 12 人，避免一屏塞不下。
  const valid = new Set(s.students.map((st) => st.name));
  const main = [...new Set(names)].filter((n) => valid.has(n));
  const res = [...new Set(reserve)].filter((n) => valid.has(n) && !main.includes(n)).slice(0, 12);
  return withEvent({
    ...s,
    team: main,
    reserve: res,
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

// ===== 随机事件（每周一个，排训练前处理） =====
/** 每周出事件的概率：一学年 40 周大约 25 次 */
const EVENT_CHANCE = 0.62;

function rollWeekEvent(s: SeasonState): PendingEvent | null {
  if (!s.team.length) return null;
  const rng = makeRng((s.seed * 8191 + s.year * 104729 + s.week * 7331 + 3) >>> 0);
  if (rng() > EVENT_CHANCE) return null;

  const lastId = s.eventLog[s.eventLog.length - 1]?.id ?? null;
  let pool = EVENT_DEFS.slice();
  if (pool.length > 1) pool = pool.filter((d) => d.id !== lastId);

  const total = pool.reduce((a, d) => a + d.weight, 0);
  let r = rng() * total;
  let def = pool[pool.length - 1];
  for (const d of pool) {
    r -= d.weight;
    if (r <= 0) { def = d; break; }
  }
  const target = def.needsTarget ? s.team[Math.floor(rng() * s.team.length)] ?? null : null;
  return {
    id: def.id,
    week: s.week,
    tag: def.tag,
    title: def.title,
    text: def.text.replace('{name}', target ?? '一个队员'),
    target,
    options: def.options.map((o) => ({ id: o.id, label: o.label, note: o.note })),
  };
}

function withEvent(s: SeasonState): SeasonState {
  if (s.phase !== 'plan') return s;
  const ev = rollWeekEvent(s);
  return { ...s, pendingEvent: ev, lastEventResult: null };
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

  return {
    ...s,
    students,
    prestige: clamp(s.prestige + (patch.prestige ?? 0), 0, 100),
    pendingEvent: null,
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

  // 带的人越多，每人分到的教练注意力越少（6 人满额，按 0.6 次方稀释，最少 0.2）
  const sizePenalty = Math.max(0.2, Math.pow(TEAM_MIN / Math.max(TEAM_MIN, s.team.length), 0.6));
  const focus: SquadFocus = plan.focus ?? 'balanced';
  const students = s.students.map((st) => {
    const skills = cloneSkills(st.skills);
    let growth = 0;
    let trainedTopic: Topic | null = null;
    if (k > 0) {
      const inSquad = st.onTeam || st.onReserve;
      trainedTopic = inSquad && plan.topic ? plan.topic : TOPIC_LIST[Math.floor(rng() * TOPIC_LIST.length)] ?? null;
      if (trainedTopic) {
        const cur = skills.topics[trainedTopic];
        const attention = st.onTeam
          ? (focus === 'main' ? 1 : focus === 'reserve' ? 0.55 : 0.8)
          : st.onReserve
            ? (focus === 'main' ? 0.35 : focus === 'reserve' ? 1 : 0.7)
            : 0.2;
        // 疲劳只减缓训练效率；越接近上限边际越小，但不至于完全练不动。
        growth = Math.pow(Math.max(0, 1 - cur), TRAIN_EXP) * TRAIN_BASE * k * attention
          * sizePenalty * st.talent * fatigueTrainMult(st.fatigue);
        growth *= 0.75 + rng() * 0.5;
        growth *= s.weekMult;
        skills.topics[trainedTopic] = clamp(cur + growth, 0.05, ABILITY_CEIL);
        skills.coding = clamp(skills.coding + growth * 0.12, 0.05, ABILITY_CEIL);
        skills.debug = clamp(skills.debug + growth * 0.1, 0.05, ABILITY_CEIL);
      }
    }
    // 休息按当前疲劳恢复：低疲劳休息会浪费，高疲劳才回得动。
    const gain = plan.intensity === 'rest' ? -(16 + 0.22 * st.fatigue) : baseGain;
    const fatigue = clamp(st.fatigue + gain, 0, 100);
    // 作业/互测分：训练出勤与质量，国集选拔时占 10%
    const hwGain = plan.intensity === 'rest'
      ? -1.2
      : 0.25 + (plan.intensity === 'extra' ? 0.2 : 0) + growth * 150 * 0.08;
    const homework = clamp((st.homework ?? 50) + hwGain, 0, 100);
    if (st.onTeam) {
      const r = reportOf(growth, fatigue, plan.intensity);
      lines.push({ name: st.name, text: r.text, tone: r.tone, fatigue });
    }
    return { ...st, skills, fatigue, homework };
  });

  return {
    ...s,
    students,
    plan,
    lastPlan: plan,
    report: { week: s.week, plan, lines },
    phase: 'report',
    weekMult: 1,
  };
}

// ===== 比赛引擎 =====
function runOneDay(cohort: CohortEntry[], levels: number[], minutes: number, seed: number, ranges?: [number, number][], trace?: ContestRound[], label?: string, curve?: [number, number][]) {
  const cfg = {
    preset: 'season-week',
    problemCount: levels.length,
    levels,
    studentCount: cohort.length,
    minutes,
    seed,
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

/**
 * 初赛 = 笔试（选择/阅读程序/完善程序），直接出分，不套比赛引擎。
 * 卷面能力 ≈ 阅读程序 + 代码基础 + 年级经验；J 卷更基础，S 卷多算法阅读。
 * 校准目标（回归测试会卡）：NOI 银牌级 J ≥95、S ≥92；高二中游 J ≈85、S ≈80；初三 J ≈65。
 */
function prelimPaperScore(st: SeasonStudent, rng: () => number): number {
  const sk = st.skills;
  const exp = (st.grade - 1) / 5;
  // 原来 13% 的“心态”权重已删除，按中性规则并入阅读（+8%）和代码（+5%）。
  const ability = 0.53 * clamp(sk.reading, 0, 1) + 0.37 * clamp(sk.coding, 0, 1) + 0.10 * exp;
  // 陕西 2025 官方线 37 分 ≈ 全国前 20%，62.5 分 ≈ 省前 25%；按能力线性映射，弱一些的学生就是过不了线
  const base = clamp((ability - 0.53) / 0.42, 0, 1);
  const noise = gauss(rng) * 3.2;
  // 疲劳只影响训练效率，不再扣初赛分。
  return clamp(Math.round(clamp(base, 0, 1) * 100 + noise), 0, 100);
}

const ratioLine = (n: number, p: number) => Math.max(1, Math.round(n * p));

function bumpFatigue(s: SeasonState, dayCount: number): SeasonState {
  return {
    ...s,
    students: s.students.map((st) => ({
      ...st,
      // 缺席的人没上考场，不该跟着加疲劳
      fatigue: st.sitOut > 0 ? st.fatigue : clamp(st.fatigue + (st.onTeam ? 8 : 5) * dayCount, 0, 100),
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
    fatigue: Math.min(0.68, (st.fatigue / 100) * 0.55),
  }));
  const fullScore = levels.length * 100;
  const run = runOneDay(cohort, levels, minutes, (s.seed * 31 + s.year * 6151 + week * 7919 + 5) >>> 0, undefined, trace, `校内模拟赛 · ${count} 题 · ${minutes} 分钟（${MOCK_PRESETS[mock.preset].name}）`);
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
    year: s.year, week, kind: 'practice', title: `第 ${week} 周 · 校内模拟赛（${MOCK_PRESETS[mock.preset].name}）`,
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
  return {
    ...s,
    students,
    week: week + 1,
    phase: 'result',
    lastContest: recap,
    contests: [...s.contests, recap],
  };
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

/** 虚构外校/外省选手的分数分布池（满分按各赛事实际：CSP 400、NOIP 400、WC/APIO 300、NOI 700、CTT/CTS/IOI 700、省选总分 100 分制） */
export const FIELDS: Record<string, FieldSpec> = {
  'csp2.S': { total: 785, anchors: [{ q: 0, score: 400 }, { q: 0.2, score: 100 }, { q: 0.4, score: 30 }, { q: 1, score: 0 }] },
  noip: { total: 160, anchors: [{ q: 0, score: 300 }, { q: 0.2, score: 128 }, { q: 0.43, score: 95 }, { q: 0.49, score: 86 }, { q: 1, score: 0 }] },
  prov: { total: 79, anchors: [{ q: 0, score: 75 }, { q: 0.15, score: 65 }, { q: 0.5, score: 45 }, { q: 1, score: 5 }] },
  // WC2025：满分 300，金牌线 257、银牌线 211、铜牌线 167（258 分在官方榜上是金牌）
  wc: { total: 500, anchors: [{ q: 0, score: 300 }, { q: 0.112, score: 257 }, { q: 0.386, score: 211 }, { q: 0.68, score: 167 }, { q: 1, score: 100 }] },
  apio: { total: 640, anchors: [{ q: 0, score: 290 }, { q: 0.1, score: 193 }, { q: 0.3, score: 130 }, { q: 0.6, score: 80 }, { q: 1, score: 0 }] },
  // NOI2026 真实金线 557（游记：te_bie_zhi_chu 557 分压线 Au）；本作 700 分制。
  // 名额仍按官方 金 50 / 银 152 / 铜 85 发，这里只把「线」对齐到真实分数。
  noi: { total: 338, anchors: [{ q: 0, score: 700 }, { q: 0.148, score: 557 }, { q: 0.5, score: 400 }, { q: 0.85, score: 300 }, { q: 1, score: 0 }] },
  // CTT/CTS 改用 100 分制的积分池，和上面的 composite×100 同刻度：
  // CTT 50 人取前 30（q=0.6）、CTS 30 人取前 6（q=0.2），两条线都有真实门槛。
  ctt: { total: 50, anchors: [{ q: 0, score: 100 }, { q: 0.3, score: 52 }, { q: 0.6, score: 26 }, { q: 1, score: 0 }] },
  cts: { total: 30, anchors: [{ q: 0, score: 100 }, { q: 0.2, score: 58 }, { q: 0.5, score: 36 }, { q: 1, score: 0 }] },
  ioi: { total: 4, anchors: [{ q: 0, score: 300 }, { q: 0.25, score: 270 }, { q: 0.5, score: 230 }, { q: 0.75, score: 180 }, { q: 1, score: 100 }] },
};

/** 全国性赛事按名次名额发奖（NOI 338 人：金 50 / 银 152 / 铜 85；APIO 640：金 64 / 银 128 / 铜 193；IOI 中国队 4 人）。
 *  WC 不在此列：冬令营学生营员测试官方不评金银铜。 */
export const NATIONAL_QUOTAS: Record<string, number[]> = {
  noi: [50, 202, 287],
  apio: [64, 192, 385],
  ioi: [1, 2, 4],
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

/** 复赛：4 题 4h，初赛过线的人全部参加（初中生也可考，NOIP 起才限高中生），按陕西官方省线判奖 */
function runCsp2(s: SeasonState, stage: StageDef, trace?: ContestRound[]): SeasonState {
  const week = s.week;
  const entrants = s.students.filter((st) => Boolean(st.csp1?.passed) && st.sitOut === 0);

  const allRows: StudentResult[] = [];
  const allProblems: Problem[] = [];
  const awards: AwardRow[] = [];
  const advanced: string[] = [];
  const nationalRows: NonNullable<ContestRecap['national']>['rows'] = [];
  const teamSet = new Set(s.team);
  const info = new Map<string, { rank: number; award: 0 | 1 | 2 | 3; score: number }>();
  const ranAny = entrants.length > 0;
  // 省线随本卷难度浮动（难卷降线、易卷抬线）
  const csp2Guide = { ...CSP2_GUIDE.S, lines: shiftLines(CSP2_GUIDE.S.lines, paperShiftOf(stage)) };

  if (ranAny) {
    const guide = csp2Guide;
    const cohort: CohortEntry[] = entrants.map((st) => ({
      name: st.name,
      skills: contestSkills(st),
      fatigue: 0,
    }));
    const seedBase = (s.seed * 31 + s.year * 977 + week * 7919 + 5) >>> 0;
    const run = runOneDay(cohort, stage.levels, stage.minutes, seedBase, stage.ranges, trace,
      `${stage.levels.length} 题 · ${stage.minutes / 60} 小时`, stage.curve);
    allProblems.push(...run.problems);

    for (const r of run.rows) {
      allRows.push(r);
      // 省排名：陕西参赛池里比自己高的人数（官方只公布名额，池子按「线 = 第 quota 名」反推）
      const spec = FIELDS['csp2.S'];
      // 分数统一按四舍五入后的整数判线 / 排名，保证「榜上显示 100」就真的按 100 发奖
      const scoreInt = Math.round(r.real);
      const rank = rankAmong(fieldScores(spec), scoreInt);
      const pct = pctOf(rank, spec.total);
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

  const recap: ContestRecap = {
    year: s.year, week, kind: 'official', stageId: stage.id, title: stage.name,
    levels: stage.levels, minutes: stage.minutes, days: 1, rows: allRows, fullScore: 400, problems: allProblems,
    awards, advanced,
    national: { total: FIELDS['csp2.S'].total, rows: nationalRows },
    note: ranAny
      ? `初赛过线 ${entrants.length} 人参加（4 题 · 4h）；二等及以上进 NOIP 名单。陕西线（随卷面难度浮动）：一等 ${csp2Guide.lines[0].min} 分（157 人）、二等 ${csp2Guide.lines[1].min} 分，不设三等`
      : '初赛没人过线，复赛报名表是空的',
  };
  return {
    ...bumpFatigue(s, 1),
    students,
    week: week + 1,
    phase: 'result',
    lastContest: recap,
    contests: [...s.contests, recap],
  };
}
/** 正式比赛：按真实资格链筛参赛者，跑完按全国分位排名发奖 */
function runStage(s: SeasonState, stage: StageDef, trace?: ContestRound[]): SeasonState {
  const week = s.week;

  // 各赛事的正式资格（口径来自 2025–26 赛季官方通知）
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
      case 'noi':
        return Boolean(st.prov?.team);
      case 'ctt':
        return Boolean(st.noi?.selected);
      case 'cts':
        return Boolean(st.ctt?.selected);
      case 'ioi':
        return Boolean(st.cts?.selected);
      default:
        return false;
    }
  };
  // 体验/夏令营名额：NOIP 的初中低年级后备体验、省选与 NOI 的初中体验，成绩不计奖
  const eligExperience = (st: SeasonStudent) => {
    switch (stage.id) {
      case 'noip':
        return isJunior(st.grade) && (st.csp2?.award ?? 0) >= 1;
      case 'prov':
      case 'noi':
        return isJunior(st.grade) && st.noip !== undefined;
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

  if (!qualified.length) {
    const recap: ContestRecap = {
      year: s.year, week, kind: 'official', stageId: stage.id, title: stage.name,
      levels: stage.levels, minutes: stage.minutes, days: stage.days,
      rows: [], fullScore: stage.id === 'noi' ? 700 : stage.levels.length * 100 * stage.days, problems: [],
      note: `队里没有人拿到「${stage.gateText}」，这一场只能弃权`,
      awards: [], advanced: [],
    };
    return { ...s, week: week + 1, phase: 'result', lastContest: recap, contests: [...s.contests, recap] };
  }

  const cohort: CohortEntry[] = qualified.map((st) => ({
    name: st.name,
    skills: contestSkills(st),
    fatigue: Math.min(0.68, (st.fatigue / 100) * 0.55),
  }));
  // NOI 2025 正式总分 705：笔试 100 + 两试各 300 + A 类选手另加 5。
  // 这里不区分 A/B 类，按 700 分制（笔试 100 + 两试 600）计入总分。
  const fullScore = stage.id === 'noi' ? 700 : stage.levels.length * 100 * stage.days;
  const seedBase = (s.seed * 31 + s.year * 977 + week * 7919 + 5) >>> 0;
  // 多试赛事：第 d 试取 ranges 里属于它的那一段，否则两天会撞题
  const dayRanges = (d: number): [number, number][] | undefined => {
    if (!stage.ranges) return undefined;
    const n = stage.levels.length;
    return stage.ranges.slice(d * n, (d + 1) * n);
  };
  const runs = Array.from({ length: stage.days }, (_, d) => runOneDay(cohort, stage.levels, stage.minutes, (seedBase + d * 1013) >>> 0, dayRanges(d), trace, stage.days > 1 ? `${stage.short} · 第 ${d + 1} 试` : `${stage.short} · ${stage.levels.length} 题 · ${stage.minutes / 60} 小时`, stage.curve));
  const rows = stage.days > 1 ? mergeDays(runs, fullScore) : runs[0].rows;

  // NOI 另有 100 分笔试（计算机基础知识），单独出分后计入总分。
  // 用与初赛同一套阅读/代码/年级能力，但每个选手独立一次噪声，避免和两试估分绑死。
  if (stage.id === 'noi') {
    const written = new Map<string, number>();
    for (const st of qualified) {
      const nameSeed = [...st.name].reduce((acc, ch) => (acc * 131 + ch.charCodeAt(0)) >>> 0, 7);
      written.set(st.name, prelimPaperScore(st, makeRng((seedBase ^ nameSeed ^ 0x9e3779b9) >>> 0)));
    }
    for (const r of rows) {
      const w = written.get(r.name) ?? 0;
      r.written = w;
      r.real += w;
      r.est += w;
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
      // 本校往往只有 1~3 人打进 CTS，按 slice(0,6) 取人会人人进答辩、再人人进国家队，
      // 国家队漏斗就形同虚设了。这里和发奖处的 rank 用同一把尺子（全国分数池）。
      const spec = FIELDS.cts ?? FIELDS.noip;
      const field = fieldScores(spec);
      const eligible = sorted.filter((r) =>
        rankAmong(field, Math.round((compositeOf.get(r.name) ?? 0) * 100)) <= 6);
      const def = eligible.map((r) => {
        const st = s.students.find((x) => x.name === r.name);
        const hw = (st?.homework ?? 50) / 100;
        const noi = (st?.noi?.score ?? 0) / 700;
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
  let schoolTeam = 0; // 单校不超过省队 1/3：17 个名额 → 我校最多 5 人
  let poolTotal = stage.national;

  for (const r of rows) {
    const isOfficial = officialSet.has(r.name);
    const special = stage.id === 'ctt' || stage.id === 'cts';
    // 判线 / 排名统一用四舍五入后的整数，榜上显示多少就按多少发奖
    const scoreInt = Math.round(r.real);
    let rank: number;
    let pct: number;
    if (special) {
      // CTT/CTS 是积分制，但要和全国集训队/选拔营的人比：
      // 只在本校三五个人里排，rank<=30 / <=6 会永远成立，国家队漏斗形同虚设。
      const spec = FIELDS[stage.id] ?? FIELDS.noip;
      const mine = Math.round((compositeOf.get(r.name) ?? 0) * 100);
      rank = rankAmong(fieldScores(spec), mine);
      pct = pctOf(rank, spec.total);
      poolTotal = spec.total;
    } else {
      // 排名 = 该赛事分数池里比自己高的人数 + 1（省选按 NOIP 30% + 省选 70% 的总分池排）
      const spec = FIELDS[stage.id] ?? FIELDS.noip;
      const mine = stage.id === 'prov' ? (provTotal.get(r.name) ?? 0) * 100 : scoreInt;
      rank = rankAmong(fieldScores(spec), mine);
      pct = pctOf(rank, spec.total);
      poolTotal = spec.total;
    }
    let award = '';
    let tone: AwardRow['tone'] = 'silver';

    if (stage.id === 'prov') {
      if (isOfficial && rank <= 17 && schoolTeam < 5) {
        award = '进省队'; tone = 'team'; schoolTeam += 1; advanced.push(r.name);
      } else if (!isOfficial) {
        award = '体验（不计成绩）';
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
      const line = bandOfLines(shiftLines(NOIP_SSX.lines, paperShiftOf(stage)), scoreInt);
      if (isOfficial) {
        award = line ? line.label : '无奖';
        tone = line?.tone ?? 'silver';
        if (line?.label === 'NOIP 一等') advanced.push(r.name);
      } else {
        award = '后备体验（无证书）';
      }
    } else if (stage.id === 'noi' && !isOfficial) {
      award = '夏令营（成绩证明）';
    } else if (stage.id === 'wc') {
      // WC 学生营员测试官方不评金银铜（stage.bands 为空、advanceText 也写「不评奖」）
      award = '完成测试（不评奖）';
      tone = 'silver';
    } else {
      const quotas = NATIONAL_QUOTAS[stage.id] ?? [];
      let idx = awardIndexByRank(rank, quotas);
      if (stage.id === 'noi' && idx === 2 && scoreInt < 100) idx = -1; // 铜牌须 ≥100/705 ≈ 100/700
      const labels = ['金牌', '银牌', '铜牌'] as const;
      award = idx >= 0 ? labels[idx] : '无奖';
      tone = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'silver';
      if (stage.id === 'noi' && idx === 0) noiSelectedSet.add(r.name);
    }

    if (isOfficial && stage.id !== 'wc' && award && award !== '无奖' && !award.startsWith('未进')) {
      awards.push({ name: r.name, label: award, tone });
    }
    const note = !isOfficial
      ? (experienceSet.has(r.name) ? '体验' : '非正式')
      : stage.id === 'noi' && noiSelectedSet.has(r.name)
        ? '国集 · 保送清北'
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
      next = { ...next, noip: { score: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0), rank, first: advancedSet.has(st.name) } };
    } else if (stage.id === 'prov') {
      next = {
        ...next,
        prov: {
          score: Math.round((provTotal.get(st.name) ?? 0) * 100),
          raw: Math.round(rows.find((r) => r.name === st.name)?.real ?? 0),
          rank,
          first: label === '进省队',
          team: label === '进省队',
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

  const recap: ContestRecap = {
    year: s.year, week, kind: 'official', stageId: stage.id, title: stage.name,
    levels: stage.levels, minutes: stage.minutes, days: stage.days,
    rows, fullScore, problems,
    awards, advanced,
    defense: stage.id === 'cts'
      ? [...defenseOf.entries()].map(([name, v]) => ({ name, score: v.score, rank: v.rank })).sort((a, b) => a.rank - b.rank)
      : undefined,
    national: { total: poolTotal, rows: nationalRows },
    note: `参赛 ${qualified.length} 人（正式 ${official.length}${experience.length ? ` · 体验 ${experience.length}` : ''}）· 资格：${stage.gateText || '无门槛'} · 全国约 ${poolTotal.toLocaleString()} 人${stage.id === 'noi' ? ' · 总分含 100 分笔试，前 50 进国集/保送' : ''}${stage.id === 'ctt' ? ' · 积分制：作业 10% + 三场 54%' : ''}${stage.id === 'cts' ? ' · 积分制：+两场 36%，前 6 答辩' : ''}`,
  };

  return {
    ...bumpFatigue(s, stage.days),
    students,
    week: week + 1,
    phase: 'result',
    lastContest: recap,
    contests: [...s.contests, recap],
  };
}

/** 跑本周的比赛：赛历上有正式比赛就跑正式的，没有就跑校内模拟赛 */
export function runWeeklyContest(s: SeasonState, trace?: ContestRound[]): SeasonState {
  const rawStage = stageOfWeek(s.week);
  // 按赛季年份现出一份「合理范围内的随机卷」：历年难度中位数为锚 + 年份偏难/偏易 + 逐题噪声
  const stage = rawStage ? stagePaperForYear(rawStage, s.year, s.seed) : rawStage;
  let next: SeasonState;
  if (!stage) next = runPractice(s, trace);
  else if (stage.kind === 'prelim') next = runPrelim(s, stage);
  else if (stage.id === 'csp2') next = runCsp2(s, stage, trace);
  else next = runStage(s, stage, trace);
  // sitOut 计的是「缺席接下来几场正式比赛」，不是几个自然周：
  // 一学年 40 周只有 10 周有正赛，按周衰减会让 2 场禁赛在下一场之前就归零。
  if (!stage) return next;
  return {
    ...next,
    students: next.students.map((st) => (st.sitOut > 0 ? { ...st, sitOut: st.sitOut - 1 } : st)),
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

/** 学年末：默认停在「继续 / 退休」的选择页，教练带多少年由自己决定 */
function endYear(s: SeasonState): SeasonState {
  const summary = summarizeYear(s);
  summary.graduates = s.students.filter((st) => st.grade === 6).map((st) => st.name);
  const history = [...s.history, summary];
  if (s.year >= s.careerYears) {
    return { ...s, phase: 'finished', history };
  }
  return { ...s, phase: 'yearEnd', history };
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
  const used = new Set(staying.map((st) => st.name));
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
  const keptTeam = s.team.filter((n) => students.some((st) => st.name === n));
  const keptReserve = s.reserve.filter((n) => students.some((st) => st.name === n));
  // 声望：比赛成绩好，来年招生质量高；没成绩就慢慢回落到 50。
  const lastYear = s.history[s.history.length - 1];
  const prestigeGain = lastYear
    ? lastYear.provTeam * 8 + lastYear.noiGold * 15 + lastYear.noiSilver * 8 + lastYear.noiBronze * 3
      + lastYear.csp2First * 2 + lastYear.noipFirst * 2 + lastYear.cttSelected * 5 + lastYear.ioiGold * 20
    : 0;
  const prestige = clamp(s.prestige * 0.85 + 7.5 + prestigeGain, 0, 100);

  return {
    ...s,
    year: s.year + 1,
    week: 1,
    phase: 'team',
    students,
    team: [],
    reserve: [],
    prestige,
    lastTeam: keptTeam,
    lastReserve: keptReserve,
    plan: null,
    report: null,
    lastContest: null,
    contests: [],
    graduates: grads.map((g) => ({ name: g.name, grade: g.grade, overall: overallOf(g.skills) })),
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
        // 正式：S 组二等及以上（限高中生）；体验：初中生拿省一可当后备体验
        return isSenior(st.grade)
          ? (st.csp2?.award ?? 0) >= 1 && (st.csp2?.award ?? 0) <= 2
          : isJunior(st.grade) && (st.csp2?.award ?? 0) >= 1;
      case 'wc': return isSenior(st.grade) && Boolean(st.noip?.first);
      case 'prov': return st.grade !== 6 && st.noip !== undefined;
      case 'apio': return Boolean(st.prov?.team);
      case 'noi': return Boolean(st.prov?.team) || (isJunior(st.grade) && st.noip !== undefined);
      case 'ctt': return Boolean(st.noi?.selected);
      case 'cts': return Boolean(st.ctt?.selected);
      case 'ioi': return Boolean(st.cts?.selected);
      default: return false;
    }
  }).length;
}
