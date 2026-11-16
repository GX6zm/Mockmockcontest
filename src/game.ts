/**
 * OI 模拟赛引擎（B 档：校赛 OI 赛制 + 上帝视角估分 + 赛后统一出分）
 *
 * 设计要点
 * - 赛中没有任何评测反馈：提交只是"存了一版代码"
 * - 每题 4 个子任务 10/20/30/40，最后一次提交为准
 * - 选手有暴力保底 / 对拍 / 卡常 / 估分偏差等行为
 * - 估分是选手自评（有偏），真实分数赛后统一揭晓
 * - 固定步长推进（STEP 秒），结果与显示器刷新率无关
 */
import { ROSTER } from './roster.ts';
import { IS_OPV, loadOpvConfig, opvSkills } from './opv.ts';
import type {
  Attempt, CohortEntry, Contest, ContestConfig, Phase, Problem, ProblemResult,
  ProblemState, Student, StudentResult, Skills, Topic,
} from './types.ts';

export const STEP = 0.5;

/** 校 OJ 名单人数（默认全员参赛） */
export const ROSTER_SIZE = ROSTER.length;

export const TOPIC_LIST: Topic[] = ['math', 'dp', 'graph', 'greedy', 'ds', 'impl', 'string', 'geometry'];

export const TOPIC_NAMES: Record<Topic, string> = {
  math: '数学', dp: '动态规划', graph: '图论', greedy: '贪心',
  ds: '数据结构', impl: '模拟实现', string: '字符串', geometry: '计算几何',
};

export const TOPIC_COLORS: Record<Topic, string> = {
  math: '#e74c3c', dp: '#3498db', graph: '#2ecc71', greedy: '#f39c12',
  ds: '#9b59b6', impl: '#1abc9c', string: '#e67e22', geometry: '#5b8def',
};

/**
 * 知识点口径：8 个专题各 0–150 分。
 *
 * 引擎内部仍然用 0–1 的归一化能力（所有难度/子任务公式都按这个口径标定），
 * 只是**初始值和成长值**整体压缩过：现有名单的顶尖（特别之处 / OIerDb #344）
 * 落在 120 左右，周康阳这类 IOI AKer 的平均值 145 是后期才够得到的上限。
 * 所以 `kpOf` 只做展示换算，不改变比赛公式。
 */
export const KP_MAX = 150;
/** 0–1 能力 → 0–150 知识点（四舍五入到整数） */
export const kpOf = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * KP_MAX);

/**
 * 一场比赛里，某人的“有效解题能力”。
 * 现实里赛题落在哪个主题是随机的，但强手不会因为题目是字符串就突然不会做——
 * 所以按综合能力做 70% 的平滑，只留 30% 给主题特长，否则每场分数会随抽题剧烈跳动。
 */
const TOPIC_BLEND = 0.3;
function abilityOf(st: Student, topic: Topic): number {
  const vals = Object.values(st.skills.topics);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5;
  const own = st.skills.topics[topic] ?? avg;
  return (own * TOPIC_BLEND + avg * (1 - TOPIC_BLEND)) * ABILITY_UNITS;
}

/**
 * 洛谷现行 8 档难度（2025 版：绿与蓝之间新增“青色 · 提高”）
 * color 为洛谷官方色值，ink 是在深色背景上可读的文字色
 */
export interface LevelInfo {
  id: number;
  name: string;
  en: string;
  color: string;
  ink: string;
  /** 该档对应的内部难度中心（1-100） */
  center: number;
}

export const LEVELS: LevelInfo[] = [
  { id: 0, name: '入门', en: 'Red', color: '#FE4C61', ink: '#FE4C61', center: 8 },
  { id: 1, name: '普及-', en: 'Orange', color: '#F39C11', ink: '#F39C11', center: 22 },
  { id: 2, name: '普及', en: 'Yellow', color: '#FFC116', ink: '#FFC116', center: 37 },
  { id: 3, name: '普及+/提高-', en: 'Green', color: '#52C41A', ink: '#6FD94A', center: 52 },
  { id: 4, name: '提高', en: 'Cyan', color: '#13C2C2', ink: '#2FD9D9', center: 68 },
  { id: 5, name: '提高+/省选-', en: 'Blue', color: '#3498DB', ink: '#5FB0EE', center: 78 },
  { id: 6, name: '省选/NOI-', en: 'Purple', color: '#9D3DCF', ink: '#BE7BE8', center: 94 },
  { id: 7, name: 'NOI/NOI+/CTS', en: 'Black', color: '#0E1D69', ink: '#8FA0D8', center: 106 },
];

/** 按难度（1–115）找最接近的颜色档位 */
function nearestLevel(diff: number): number {
  let best = 0;
  let bd = Infinity;
  for (const l of LEVELS) {
    const d = Math.abs(l.center - diff);
    if (d < bd) {
      bd = d;
      best = l.id;
    }
  }
  return best;
}

export function levelInfo(level: number): LevelInfo {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(level)))];
}

interface Preset {
  id: string;
  name: string;
  note: string;
  /** 每题难度档位（洛谷颜色） */
  levels: number[];
  minutes: number;
  /** 官方考试时段，例如 8:30–12:00（校赛留空） */
  clock: string;
}

export const PRESETS: Preset[] = [
  { id: 'school', name: '校赛', note: '3 题 · 3 小时', levels: [3, 4, 5], minutes: 180, clock: '班级自定' },
  { id: 'cspj', name: 'CSP-J', note: '4 题 · 3.5 小时', levels: [0, 1, 2, 3], minutes: 210, clock: '8:30–12:00' },
  { id: 'csps', name: 'CSP-S', note: '4 题 · 4 小时', levels: [2, 3, 4, 5], minutes: 240, clock: '14:30–18:30' },
  { id: 'noip', name: 'NOIP', note: '4 题 · 4.5 小时', levels: [2, 3, 5, 6], minutes: 270, clock: '8:30–13:00' },
  // NOI 正赛两天、每天 3 题 5 小时，这里模拟其中一天：蓝/紫/黑，5 小时
  { id: 'noi', name: 'NOI', note: '3 题 · 5 小时', levels: [5, 6, 7], minutes: 300, clock: '8:30–13:30' },
];

/**
 * 能力单位换算：0–1 技能 → 难度刻度（1–115）上的“解题能力”。
 * 0.83（吕明栩这档）≈ 112，能稳稳吃掉“提高+/省选-”（78）；
 * 0.55（省一中游）≈ 74，能吃提高（68）但吃不下省选；0.35 只有 47，够普及+/提高-。
 * 系数直接决定“同一个人一场比赛能做掉几道题”，改前先跑 scripts/calib_real.mjs。
 */
export const ABILITY_UNITS = 135;

// ===== 题库：标题同时绑定「题型」和「适用难度档」=====
// 红题不会出现"后缀数组"，黑题也不会是"排队打水"。
interface TitleDef {
  topic: Topic;
  title: string;
  /** 适用档位下限（洛谷颜色 id） */
  min: number;
  /** 适用档位上限 */
  max: number;
}

const TITLE_POOL: TitleDef[] = [
  // ---------- 入门 / 普及-（0–1）----------
  { topic: 'impl', title: '排队打水', min: 0, max: 1 },
  { topic: 'impl', title: '模拟电梯', min: 0, max: 1 },
  { topic: 'impl', title: '日期计算', min: 0, max: 2 },
  { topic: 'impl', title: '简单的计算器', min: 0, max: 1 },
  { topic: 'math', title: '质因数分解', min: 0, max: 2 },
  { topic: 'math', title: '最大公约数', min: 0, max: 1 },
  { topic: 'math', title: '斐波那契数列', min: 0, max: 1 },
  { topic: 'greedy', title: '硬币兑换', min: 0, max: 1 },
  { topic: 'greedy', title: '区间选点 · 入门', min: 0, max: 2 },
  { topic: 'string', title: '统计单词', min: 0, max: 1 },
  { topic: 'string', title: '回文判断', min: 0, max: 1 },
  { topic: 'dp', title: '爬楼梯', min: 0, max: 1 },
  { topic: 'dp', title: '数字三角形', min: 0, max: 2 },
  { topic: 'graph', title: '图的遍历', min: 0, max: 1 },
  { topic: 'graph', title: '连通块计数', min: 0, max: 2 },
  { topic: 'ds', title: '前缀和', min: 0, max: 1 },
  { topic: 'ds', title: '差分数组', min: 0, max: 2 },
  { topic: 'geometry', title: '两点间距离', min: 0, max: 1 },
  // ---------- 普及（2）----------
  { topic: 'impl', title: '大模拟 · 图书馆', min: 2, max: 3 },
  { topic: 'impl', title: '高精度加减', min: 2, max: 3 },
  { topic: 'math', title: '快速幂', min: 2, max: 3 },
  { topic: 'math', title: '约数个数', min: 2, max: 3 },
  { topic: 'greedy', title: '区间调度', min: 2, max: 4 },
  { topic: 'greedy', title: '排序不等式', min: 2, max: 4 },
  { topic: 'string', title: '字符串哈希', min: 2, max: 4 },
  { topic: 'string', title: '字典树', min: 3, max: 4 },
  { topic: 'dp', title: '0/1 背包', min: 2, max: 3 },
  { topic: 'dp', title: '最长上升子序列', min: 2, max: 4 },
  { topic: 'graph', title: '单源最短路', min: 2, max: 4 },
  { topic: 'graph', title: '最小生成树', min: 2, max: 4 },
  { topic: 'ds', title: '并查集应用', min: 2, max: 3 },
  { topic: 'ds', title: '树状数组', min: 3, max: 4 },
  { topic: 'geometry', title: '多边形面积', min: 2, max: 3 },
  // ---------- 普及+ / 提高（3–4）----------
  { topic: 'impl', title: '表达式求值', min: 3, max: 5 },
  { topic: 'impl', title: '高精度乘除', min: 3, max: 4 },
  { topic: 'math', title: '组合数取模', min: 3, max: 5 },
  { topic: 'math', title: '数论分块', min: 4, max: 5 },
  { topic: 'greedy', title: '交换论证', min: 3, max: 5 },
  { topic: 'greedy', title: '反悔贪心', min: 4, max: 5 },
  { topic: 'string', title: 'KMP 匹配', min: 3, max: 4 },
  { topic: 'dp', title: '区间 DP', min: 3, max: 4 },
  { topic: 'dp', title: '树形 DP', min: 4, max: 5 },
  { topic: 'dp', title: '状压入门', min: 4, max: 5 },
  { topic: 'graph', title: '强连通分量', min: 3, max: 5 },
  { topic: 'graph', title: '分层图', min: 4, max: 5 },
  { topic: 'ds', title: '线段树维护', min: 4, max: 5 },
  { topic: 'ds', title: '树链剖分入门', min: 4, max: 5 },
  { topic: 'ds', title: '分块', min: 4, max: 5 },
  { topic: 'geometry', title: '凸包', min: 3, max: 5 },
  { topic: 'geometry', title: '最近点对', min: 4, max: 5 },
  // ---------- 提高+ / 省选（5–6）----------
  { topic: 'math', title: '莫比乌斯反演', min: 5, max: 6 },
  { topic: 'dp', title: '计数 DP', min: 5, max: 6 },
  { topic: 'dp', title: '矩阵加速递推', min: 5, max: 6 },
  { topic: 'graph', title: '网络流建模', min: 5, max: 6 },
  { topic: 'graph', title: '费用流', min: 6, max: 7 },
  { topic: 'ds', title: '平衡树', min: 5, max: 6 },
  { topic: 'string', title: '后缀数组', min: 5, max: 6 },
  { topic: 'geometry', title: '旋转卡壳', min: 5, max: 6 },
  { topic: 'geometry', title: '半平面交', min: 6, max: 7 },
  { topic: 'string', title: '回文自动机', min: 6, max: 7 },
  { topic: 'math', title: '生成函数', min: 6, max: 7 },
  // ---------- NOI / CTS（7）----------
  { topic: 'dp', title: '动态 DP', min: 6, max: 7 },
  { topic: 'ds', title: 'LCT 维护', min: 6, max: 7 },
  { topic: 'graph', title: '最小割树', min: 6, max: 7 },
  { topic: 'math', title: '多项式 exp', min: 7, max: 7 },
  { topic: 'string', title: '广义 SAM', min: 6, max: 7 },
];

/** 从题库里挑一道符合该档位的题；同场比赛不重名 */
function pickTitle(level: number, used: Set<string>, rng: () => number): TitleDef {
  let pool = TITLE_POOL.filter((t) => t.min <= level && level <= t.max && !used.has(t.title));
  if (pool.length === 0) pool = TITLE_POOL.filter((t) => !used.has(t.title));
  if (pool.length === 0) pool = TITLE_POOL;
  const pick = pool[Math.floor(rng() * pool.length)];
  used.add(pick.title);
  return pick;
}

// 题型带来的难度偏移
const TOPIC_THINK: Record<Topic, number> = {
  math: 8, dp: 11, graph: 5, greedy: 2, ds: 4, impl: -9, string: -3, geometry: 6,
};
const TOPIC_IMPL: Record<Topic, number> = {
  math: -6, dp: 2, graph: 4, greedy: -4, ds: 5, impl: 13, string: 7, geometry: 8,
};

// ===== 基础工具 =====
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

function gauss(rng: () => number): number {
  return (rng() + rng() + rng() - 1.5) * 2;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ===== 生成 =====
function genSkills(rng: () => number): Skills {
  // 0–1 归一化能力。顶尖约 0.8（=120/150 知识点），普通校队 0.45–0.62。
  const base = clamp(0.34 + rng() * 0.28, 0.05, 0.72);
  const topics = {} as Record<Topic, number>;
  const order = shuffle(TOPIC_LIST, rng);
  const spec = order.slice(0, 2);
  const weak = order.slice(2, 4);
  for (const t of TOPIC_LIST) {
    let v = base + gauss(rng) * 0.07;
    if (spec.indexOf(t) >= 0) v += 0.08 + rng() * 0.1;
    if (weak.indexOf(t) >= 0) v -= 0.05 + rng() * 0.07;
    topics[t] = clamp(v, 0.06, 0.82);
  }
  return {
    topics,
    coding: clamp(base + gauss(rng) * 0.1, 0.05, 0.86),
    debug: clamp(base * 0.9 + 0.05 + gauss(rng) * 0.1, 0.05, 0.86),
    reading: clamp(base * 0.8 + 0.1 + gauss(rng) * 0.1, 0.05, 0.86),
  };
}

function createProblems(cfg: ContestConfig, rng: () => number): Problem[] {
  const used = new Set<string>();
  const list: Problem[] = [];
  const count = Math.max(1, Math.min(cfg.problemCount, cfg.levels.length));
  for (let i = 0; i < count; i++) {
    const level = Math.max(0, Math.min(LEVELS.length - 1, cfg.levels[i]));
    const info = LEVELS[level];
    // 档位内再抖一点，保证同色题也有强弱；正赛会带 difficultyRanges 精确控难度
    const range = cfg.difficultyRanges?.[i];
    const diff = range
      ? clamp(Math.round(range[0] + rng() * (range[1] - range[0])), 5, 115)
      : clamp(Math.round(info.center + (rng() - 0.5) * 6), 5, 115);
    // 颜色跟着实际难度走（正赛的 levels 顺序只作兜底），避免色档与难度脱节
    const colorLevel = range ? nearestLevel(diff) : level;
    const chosen = pickTitle(colorLevel, used, rng);
    const topic = chosen.topic;
    const title = chosen.title;

    const think = clamp(Math.round(diff + TOPIC_THINK[topic] + (rng() - 0.5) * 12), 5, 130);
    const impl = clamp(Math.round(diff * 0.9 + TOPIC_IMPL[topic] + (rng() - 0.5) * 14), 5, 100);
    const detail = clamp(Math.round(diff * 0.85 + (rng() - 0.5) * 18), 5, 100);

    list.push({
      id: i,
      title,
      topic,
      level: colorLevel,
      difficulty: diff,
      think,
      impl,
      detail,
      subtasks: [
        { label: '10% 数据', points: 10 },
        { label: '30% 数据', points: 20 },
        { label: '60% 数据', points: 30 },
        { label: '100% 数据', points: 40 },
      ],
      submitCount: 0,
    });
  }
  return list;
}

function blankProblems(n: number): ProblemState[] {
  return Array.from({ length: n }, () => ({
    status: 'queue' as const,
    phase: 'idle' as Phase,
    progress: 0,
    mode: 'full' as const,
    tested: false,
    debugRounds: 0,
    attempts: [] as Attempt[],
    submissions: 0,
    timeSpent: 0,
  }));
}

function mkStudent(
  id: number, name: string, skills: Skills, problemCount: number, rng: () => number,
  fatigue = 0, focus?: number, motivation?: number,
): Student {
  return {
    id,
    name,
    skills,
    fatigue,
    focus: focus ?? 0.85 + rng() * 0.15,
    motivation: motivation ?? 0.7 + rng() * 0.3,
    problems: blankProblems(problemCount),
    phase: 'idle' as Phase,
    phaseProgress: 0,
    currentProblem: null,
    totalSubmissions: 0,
    finished: false,
    surveyLeft: 0,
    surveyTotal: 0,
  };
}

function createStudents(cfg: ContestConfig, problemCount: number, rng: () => number): Student[] {
  const count = Math.max(1, cfg.studentCount);
  // 教练模式：阵容和技能由赛季带入，跨周保持连续
  if (cfg.cohort && cfg.cohort.length > 0) {
    return cfg.cohort.slice(0, count).map((e, i) => {
      const skills = JSON.parse(JSON.stringify(e.skills)) as Skills;
      return mkStudent(i, e.name, skills, problemCount, rng, e.fatigue, e.focus, e.motivation);
    });
  }

  // 名单只决定名字和参赛顺序；初始水平按中性分布抽，不再读任何隐藏“实力”
  const order = shuffle(ROSTER.map((_, i) => i), rng);
  const picked = order.slice(0, Math.min(count, ROSTER.length));
  const students = picked.map((ri, i) => {
    const entry = ROSTER[ri];
    return mkStudent(i, entry.name, genSkills(rng), problemCount, rng);
  });
  // OPv：观战模式也认这份自定义配置。教练模式（cfg.cohort）不走这里，
  // 否则每周重放比赛时都会把选手的成长覆盖回开局数值。
  return withOpvWatch(students, problemCount, rng);
}

function withOpvWatch(students: Student[], problemCount: number, rng: () => number): Student[] {
  const cfg = IS_OPV ? loadOpvConfig() : null;
  if (!cfg) return students;
  const base = opvSkills(cfg);
  const copy = (): Skills => ({ ...base, topics: { ...base.topics } });
  let found = false;
  for (const st of students) {
    if (st.name === cfg.name) { st.skills = copy(); found = true; }
  }
  if (!found && students.length > 0) {
    // 人数滑杆可能没抽到 TA（或 TA 是自定义新人）：顶掉最后一位，保证一定在场
    const last = students.length - 1;
    students[last] = mkStudent(students[last].id, cfg.name, copy(), problemCount, rng);
  }
  return students;
}

/** 教练模式开局：给全校 54 人生成一份固定的初始技能（同种子同结果） */
export function buildCohort(seed: number): CohortEntry[] {
  const rng = makeRng(seed);
  return ROSTER.map((entry) => ({
    name: entry.name,
    skills: genSkills(rng),
  }));
}

export function createContest(cfg: ContestConfig): Contest {
  const rng = makeRng(cfg.seed);
  const problems = createProblems(cfg, rng);
  const students = createStudents(cfg, problems.length, rng);

  // 开场通读：先花 4-10 分钟把整套题翻一遍，再决定做哪题（游记里的标准开局）
  // 整套题越简单，翻得越快：全是红题时没人会认真读满五分钟
  const avgCenter = problems.reduce((a, p) => a + (LEVELS[p.level]?.center ?? 50), 0) / Math.max(1, problems.length);
  const levelFactor = 0.5 + 0.5 * clamp(avgCenter / 106, 0, 1);
  for (const st of students) {
    const total = (240 + rng() * 360) * (1.3 - st.skills.reading * 0.45) * levelFactor;
    st.surveyTotal = Math.round(total);
    st.surveyLeft = st.surveyTotal;
    st.phase = 'survey';
    st.phaseProgress = 0;
  }

  return {
    seed: cfg.seed,
    rng,
    pending: 0,
    problems,
    students,
    submissions: [],
    timeElapsed: 0,
    duration: cfg.minutes * 60,
    isFinished: false,
    config: cfg,
  };
}

// ===== 观测量 =====
export function totalEstimate(st: Student): number {
  let t = 0;
  for (const ps of st.problems) {
    const last = ps.attempts[ps.attempts.length - 1];
    if (last) t += last.est;
  }
  return t;
}

export function problemEstimate(st: Student, pid: number): number | null {
  const ps = st.problems[pid];
  if (!ps) return null;
  const last = ps.attempts[ps.attempts.length - 1];
  return last ? last.est : null;
}

export function estimateRankMap(c: Contest): Map<number, number> {
  const sorted = c.students.slice().sort((a, b) => totalEstimate(b) - totalEstimate(a));
  const map = new Map<number, number>();
  let last = -1;
  let rank = 0;
  sorted.forEach((st, i) => {
    const v = totalEstimate(st);
    if (v !== last) { rank = i + 1; last = v; }
    map.set(st.id, rank);
  });
  return map;
}

// ===== 单题决策 =====
/**
 * 熟悉度：题目相对选手的水平有多"顺手"
 * 0 = 需要认真想，1 = 闭着眼睛写（提高组一等做红题）
 */
function familiarity(st: Student, p: Problem): number {
  const skill = abilityOf(st, p.topic);
  return clamp((skill - p.think - 15) / 45, 0, 1);
}

function estimatedCost(st: Student, p: Problem): number {
  const d = p.difficulty / 100;
  const skill = st.skills.topics[p.topic];
  const fam = familiarity(st, p);
  const reading = (45 + d * 90) * (1.35 - st.skills.reading * 0.5) * (1 - 0.5 * fam);
  const think = (420 + d * 780) * (1.55 - skill * 0.95) * (1 - 0.85 * fam);
  const code = (520 + d * 760) * (1.55 - st.skills.coding * 0.8) * (1 - 0.7 * fam);
  const test = (150 + d * 260) * (1.35 - st.skills.debug * 0.55) * (1 - 0.85 * fam);
  return (reading + think + code + test) / 60;
}

function phaseDuration(c: Contest, st: Student, p: Problem, ps: ProblemState): number {
  const d = p.difficulty / 100;
  const skill = st.skills.topics[p.topic];
  const fam = familiarity(st, p);
  switch (ps.phase) {
    case 'reading':
      return (45 + d * 90) * (1.35 - st.skills.reading * 0.5) * (1 - 0.5 * fam);
    case 'thinking':
      return (ps.mode === 'full'
        ? (420 + d * 780) * (1.55 - skill * 0.95)
        : (200 + d * 300) * (1.45 - skill * 0.85)) * (1 - 0.85 * fam);
    case 'coding':
      return (ps.mode === 'full'
        ? (520 + d * 760) * (1.55 - st.skills.coding * 0.8)
        : (260 + d * 260) * (1.4 - st.skills.coding * 0.7)) * (1 - 0.7 * fam);
    case 'testing':
      return (150 + d * 260) * (1.35 - st.skills.debug * 0.55) * (1 - 0.85 * fam);
    case 'deciding':
      // 顺手题不纠结，犹豫时间跟着缩短
      return (30 + c.rng() * 60) * (1 - 0.6 * fam);
    case 'restoring':
      return 90 + d * 120;
    default:
      return 60;
  }
}

function chooseProblem(c: Contest, st: Student, remaining: number, rankMap: Map<number, number>): number | null {
  const ratio = (rankMap.get(st.id) || 1) / c.students.length;
  const behind = ratio > 0.6;
  const early = c.timeElapsed < c.duration * 0.4;
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const p of c.problems) {
    const ps = st.problems[p.id];
    if (ps.status === 'done') continue;
    const skill = abilityOf(st, p.topic);
    const fit = sigmoid((skill - p.think) / 18);
    const value = fit * 100 + (1 - fit) * 40;
    const cost = estimatedCost(st, p);
    if (remaining < cost * 60 * 0.55) continue;
    let s = value / Math.max(12, cost);
    // 游记里的标准开局：先按顺序把能稳拿分的题做掉，再回头啃硬的
    if (early) {
      s *= 1 + Math.max(0, 3 - p.level) * 0.28;
      // 前半场更愿意“按顺序开题”，而不是凭性价比直接跳到最后一题
      s *= 1 + 0.9 * (1 - p.id / Math.max(1, c.problems.length - 1));
    }
    if (remaining < c.duration * 0.3) s *= 1 + fit * 0.5;
    if (behind) s *= 0.9 + fit * 0.3;
    s *= 1 + (c.rng() - 0.5) * 0.6;
    if (s > bestScore) { bestScore = s; best = p.id; }
  }
  return best;
}

function startProblem(st: Student, pid: number) {
  const ps = st.problems[pid];
  ps.status = 'active';
  ps.phase = 'reading';
  ps.progress = 0;
  ps.mode = 'full';
  ps.tested = false;
  st.currentProblem = pid;
  st.phase = 'reading';
  st.phaseProgress = 0;
}

function finishProblem(st: Student, ps: ProblemState) {
  ps.status = 'done';
  ps.phase = 'done';
  ps.progress = 0;
  st.currentProblem = null;
  st.phase = 'idle';
  st.phaseProgress = 0;
}

function lastAttemptOfMode(ps: ProblemState, mode: 'brute' | 'full'): Attempt | null {
  for (let i = ps.attempts.length - 1; i >= 0; i--) {
    if (ps.attempts[i].mode === mode) return ps.attempts[i];
  }
  return null;
}

/** 所有题都"做完"了但还有时间：回去抢救估分最低的那道 */
function chooseRetry(c: Contest, st: Student, remaining: number): number | null {
  let best: number | null = null;
  let bestScore = 0;
  for (const p of c.problems) {
    const ps = st.problems[p.id];
    if (ps.status !== 'done') continue;
    const last = ps.attempts[ps.attempts.length - 1];
    if (!last || last.est >= 100) continue;
    const cost = estimatedCost(st, p) * 60;
    if (remaining < cost * 0.75) continue;
    const room = (100 - last.est) / Math.max(10, cost / 60);
    if (room > bestScore) { bestScore = room; best = p.id; }
  }
  if (best !== null) st.problems[best].status = 'queue';
  return best;
}

/**
 * 子任务通过率模型
 * off[i]：第 i 个子任务对能力差的容忍度（小数据好拿、大数据难拿）
 * 同一个 gap（选手水平 − 题目思维难度）下，越靠后的子任务越难过
 * level 惩罚：洛谷颜色越高，连第一个子任务都更难糊弄过去（黑题没有白送的 10 分）
 */
const SUB_OFF = [34, 24, 2, -6];
const LEVEL_PENALTY = 2.2;

function subtaskPass(gap: number, i: number, optimism: number, level: number): number {
  const off = SUB_OFF[i] - level * LEVEL_PENALTY;
  return clamp(sigmoid((gap + off + optimism) / 13), 0.02, 0.985);
}

/** 写挂概率：大样例能挡住大部分细节错，但暗病永远有；细节越多、题越难越容易藏 */
function bugChance(st: Student, p: Problem, mode: 'brute' | 'full', tested: boolean, debugRounds: number): number {
  const fam = familiarity(st, p);
  let bugP = (0.235 + (p.detail / 100) * 0.15) * clamp(0.55 + p.difficulty / 110, 0.65, 1.5)
    - st.skills.debug * 0.04
    - (tested ? 0.05 : 0)
    - debugRounds * 0.025
    - (mode === 'brute' ? 0.03 : 0);
  // 顺手到闭眼写的题，手一抖写挂的概率也跟着降
  bugP *= 1 - 0.55 * fam;
  return clamp(bugP, 0.03, 0.5);
}

/** 卡常概率：只有需要跑大数据、写起来又重的题才会 */
function tleChance(st: Student, p: Problem): number {
  return clamp(
    (0.12 - (st.skills.coding * ABILITY_UNITS - p.impl) / 90) * clamp((p.difficulty - 25) / 55, 0, 1),
    0.003, 0.22,
  );
}

/** 比赛中的预期分：按子任务期望通过率估这题大概能拿多少（用来做决策，不展示） */
function expectedScore(st: Student, p: Problem, mode: 'brute' | 'full'): number {
  const covered = mode === 'full' ? 4 : 2;
  const gap = abilityOf(st, p.topic) - p.think;
  let sum = 0;
  for (let i = 0; i < covered; i++) sum += p.subtasks[i].points * subtaskPass(gap, i, 0, p.level);
  return sum;
}

/**
 * 得分率映射：把引擎原始得分（0-100 每题）按分段线性映射到官方得分区间。
 * 教练模式的正赛用它把「能力/难度」原始分校正到该赛事真实得分率，
 * 观战模式不传 curve 时原样返回。
 */
export function curveScore(curve: [number, number][] | undefined, raw: number): number {
  if (!curve || curve.length === 0) return raw;
  const x = clamp(raw / 100, 0, 1);
  const pts = curve.slice().sort((a, b) => a[0] - b[0]);
  if (x <= pts[0][0]) return clamp(pts[0][1], 0, 1) * 100;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return clamp(y0 + (y1 - y0) * t, 0, 1) * 100;
    }
  }
  return clamp(pts[pts.length - 1][1], 0, 1) * 100;
}

/**
 * 估分：正赛发了大样例，选手自测完基本知道哪些子任务过了 —— 所以估分就等于
 * 「干净分」加一点固定噪声。暗病（挂分梯子）赛后才知道。
 * 不再有“自我认知 / 性格偏差”这类隐藏属性：所有人用同一条中性规则。
 */
const EST_NOISE = 3.0;

function beliefOf(c: Contest, clean: number): number {
  // 极少数时候选手严重低估自己：以为暴力都过不了，结果正解跑过去了 —— 天神眷顾
  if (c.rng() < 0.003) return clamp(Math.round((clean - 30 - c.rng() * 30) / 10) * 10, 0, 100);
  const noise = gauss(c.rng) * EST_NOISE;
  return clamp(Math.round((clean + noise) / 10) * 10, 0, 100);
}

/**
 * 挂分梯子：赛后才知道的暗病，一处一处往外掏分。
 * 幅度越大概率越低 —— 掉一个小点最常见，整题爆零要看运气。
 */
function applyDamage(
  c: Contest, st: Student, p: Problem, mode: 'brute' | 'full', passed: boolean[], clean: number,
  tested: boolean, debugRounds: number,
): { score: number; reason: string } {
  const bugP = bugChance(st, p, mode, tested, debugRounds);
  if (c.rng() >= bugP) {
    return { score: clean, reason: clean === 100 ? '' : clean === 0 ? 'WA · 算法有反例' : '部分分 · 正确性不足' };
  }
  const live = passed.map((ok, i) => (ok ? i : -1)).filter((i) => i >= 0);
  if (!live.length) return { score: 0, reason: 'WA · 算法有反例' };

  const bySize = [...live].sort((a, b) => p.subtasks[a].points - p.subtasks[b].points);
  const tle = c.rng() < tleChance(st, p);
  const r = c.rng();
  let killed: number[];
  let reason: string;
  if (r < 0.70) {
    // 小刀口：掉最小的一个点
    killed = [bySize[0]];
    reason = ['math', 'geometry', 'impl'].includes(p.topic) ? 'WA · 精度写挂' : 'WA · 边界没处理好';
  } else if (r < 0.90) {
    // 大刀口：掉最大的一个点
    killed = [bySize[bySize.length - 1]];
    reason = tle ? 'TLE · 常数被卡' : 'WA · 多测没清空';
  } else if (r < 0.97) {
    // 双刀：两个大点一起掉
    killed = bySize.slice(-2);
    reason = tle ? 'TLE · 常数被卡' : 'WA · 多测没清空';
  } else {
    // 全灭：整题爆零，概率最低
    killed = bySize;
    const r2 = c.rng();
    reason = r2 < 0.45 ? 'RE · 数组开小' : r2 < 0.75 ? 'CE · freopen 写错' : 'WA · 算法有反例';
  }
  for (const i of killed) passed[i] = false;
  return {
    score: passed.reduce((a, ok, i) => a + (ok ? p.subtasks[i].points : 0), 0),
    reason,
  };
}

function submitAttempt(c: Contest, st: Student, p: Problem, ps: ProblemState, mode: 'brute' | 'full', tested: boolean) {
  // 选手实际写出来的东西：哪些子任务是对的
  const covered = mode === 'full' ? 4 : 2;
  const gap = abilityOf(st, p.topic) - p.think;
  const passed: boolean[] = [];
  for (let i = 0; i < covered; i++) passed.push(c.rng() < subtaskPass(gap, i, 0, p.level));
  const clean = passed.reduce((a, ok, i) => a + (ok ? p.subtasks[i].points : 0), 0);

  // 大样例自测完的估分：基本就是干净分（再按赛事得分率曲线校正）
  const estRaw = beliefOf(c, clean);
  let truth = applyDamage(c, st, p, mode, passed, clean, tested, ps.debugRounds);

  // 最后 15 分钟慌里慌张交代码，偶尔忘写 freopen —— 游记里的经典爆零方式
  const remain = c.duration - c.timeElapsed;
  if (remain < 900 && c.rng() < 0.012 * (1 - st.skills.debug * 0.6)) {
    truth = { score: 0, reason: 'CE · 匆忙交卷忘写 freopen' };
  }

  const curve = c.config.scoreCurve;
  const est = curve ? Math.round(curveScore(curve, estRaw)) : estRaw;
  if (curve) truth = { ...truth, score: Math.round(curveScore(curve, truth.score)) };

  ps.attempts.push({
    mode,
    score: truth.score,
    est,
    tested,
    time: c.timeElapsed,
    reason: truth.reason,
    nth: ps.submissions + 1,
  });
  ps.submissions += 1;
  ps.tested = tested;
  p.submitCount += 1;
  st.totalSubmissions += 1;
  c.submissions.push({
    time: c.timeElapsed,
    studentId: st.id,
    studentName: st.name,
    problemId: p.id,
    nth: ps.submissions,
    mode,
  });
}

function decide(c: Contest, st: Student, p: Problem, ps: ProblemState, remaining: number) {
  // 固定中性策略：不再按自我认知/冒险/耐心分流，所有人都用同一套交题规则。
  const cautious = 0.55;

  if (ps.mode === 'brute') {
    submitAttempt(c, st, p, ps, 'brute', ps.tested);
    const cost = estimatedCost(st, p) * 60;
    const wantMore = c.rng() < 0.55;
    if (remaining > cost * 0.9 && wantMore) {
      ps.mode = 'full';
      ps.phase = 'thinking';
      ps.progress = 0;
      return;
    }
    finishProblem(st, ps);
    return;
  }

  const safe = lastAttemptOfMode(ps, 'brute');
  const est = expectedScore(st, p, 'full');

  // 正解没把握、手里还有暴力分：不敢交，保住保底分
  if (safe && safe.est > 0 && est < safe.est * 0.85 && cautious > 0.55 && c.rng() < 0.75) {
    finishProblem(st, ps);
    return;
  }

  submitAttempt(c, st, p, ps, 'full', ps.tested);

  // 交完正解心里发毛：补交一版暴力，防止挂穿
  const done = ps.attempts[ps.attempts.length - 1];
  const doubt = 1 - done.est / 100;
  if (safe && safe.est > 0 && remaining > 300 && doubt > 0.45 && c.rng() < 0.35 + cautious * 0.2) {
    ps.phase = 'restoring';
    ps.progress = 0;
    return;
  }
  finishProblem(st, ps);
}

function completePhase(c: Contest, st: Student, p: Problem, ps: ProblemState, remaining: number) {
  switch (ps.phase) {
    case 'reading':
      ps.phase = 'thinking';
      return;
    case 'thinking': {
      const skill = abilityOf(st, p.topic);
      let chance = sigmoid((skill - p.think + 20) / 14);
      if (ps.attempts.length > 0) chance += 0.10;
      const found = c.rng() < chance;
      ps.mode = found ? 'full' : 'brute';
      ps.phase = 'coding';
      return;
    }
    case 'coding': {
      const diligence = clamp(0.12 + st.skills.debug * 0.45, 0.05, 0.92);
      if (c.rng() < diligence) {
        ps.phase = 'testing';
      } else {
        ps.tested = false;
        ps.phase = 'deciding';
      }
      return;
    }
    case 'testing': {
      // 对拍偶尔真能拍出 bug：回去返工，时间黑洞就此形成（游记里的高频死法）
      const bugP = clamp(0.28 + (p.detail - st.skills.debug * 100) / 140 + (ps.mode === 'full' ? 0.08 : -0.06), 0.04, 0.62);
      if (c.rng() < bugP) {
        ps.debugRounds += 1;
        ps.phase = 'coding';
        ps.progress = 0.35 + c.rng() * 0.35;
        ps.tested = false;
      } else {
        ps.tested = true;
        ps.phase = 'deciding';
      }
      return;
    }
    case 'deciding':
      decide(c, st, p, ps, remaining);
      return;
    case 'restoring': {
      const brute = lastAttemptOfMode(ps, 'brute');
      if (brute) submitAttempt(c, st, p, ps, 'brute', brute.tested);
      finishProblem(st, ps);
      return;
    }
    default:
      finishProblem(st, ps);
  }
}

function stepStudent(c: Contest, st: Student, dt: number, remaining: number, rankMap: Map<number, number>) {
  if (st.finished) return;

  // 开场通读：所有人先花几分钟把题面翻一遍，这期间不会动笔
  if (st.surveyLeft > 0) {
    st.surveyLeft -= dt;
    st.phase = 'survey';
    st.phaseProgress = clamp(1 - Math.max(0, st.surveyLeft) / Math.max(1, st.surveyTotal), 0, 1);
    if (st.surveyLeft <= 0) {
      st.surveyLeft = 0;
      st.phase = 'idle';
      st.phaseProgress = 0;
    }
    return;
  }

  if (st.currentProblem === null) {
    if (remaining < 45) { st.finished = true; st.phase = 'done'; return; }
    let pid = chooseProblem(c, st, remaining, rankMap);
    if (pid === null) pid = chooseRetry(c, st, remaining);
    if (pid === null) {
      // 题都做完了也还有时间：检查文件、复读题面，坚持到收卷，而不是提前退场
      st.phase = 'checking';
      st.phaseProgress = 0.3 + 0.7 * Math.min(1, c.timeElapsed / c.duration);
      return;
    }
    startProblem(st, pid);
    return;
  }

  const ps = st.problems[st.currentProblem];
  const p = c.problems[st.currentProblem];
  ps.timeSpent += dt;

  const dur = phaseDuration(c, st, p, ps);
  let rate = dt / Math.max(20, dur);
  rate *= st.focus * (0.8 + st.motivation * 0.2) * (1 - st.fatigue * 0.3);
  ps.progress = clamp(ps.progress + rate, 0, 1);

  st.phase = ps.phase;
  st.phaseProgress = ps.progress;

  if (ps.progress >= 0.9999) {
    ps.progress = 0;
    completePhase(c, st, p, ps, remaining);
  }
}

function stepContest(c: Contest, dt: number) {
  const prog = c.timeElapsed / c.duration;
  const rankMap = estimateRankMap(c);

  for (const st of c.students) {
    if (st.finished) continue;
    st.fatigue = clamp(st.fatigue + dt * 0.000035 * (1 + prog * 1.5), 0, 0.75);
    st.focus = clamp(st.focus + (c.rng() - 0.5) * 0.03 * dt, 0.35, 1);
    const ratio = (rankMap.get(st.id) || 1) / c.students.length;
    if (ratio < 0.3) st.motivation = clamp(st.motivation + 0.0006 * dt, 0.3, 1);
    else if (ratio > 0.7) st.motivation = clamp(st.motivation - 0.0003 * dt, 0.25, 1);
    if (prog > 0.75) st.motivation = clamp(st.motivation + 0.0012 * dt, 0.35, 1);
  }

  const remaining = c.duration - c.timeElapsed;
  for (const st of c.students) stepStudent(c, st, dt, remaining, rankMap);
}

export function tick(c: Contest, simSeconds: number) {
  if (c.isFinished || simSeconds <= 0) return;
  c.pending += simSeconds;
  let guard = 0;
  // 只按固定步长消费，零头留到下一次，保证同种子结果与帧率无关
  while (c.pending >= STEP - 1e-9 && !c.isFinished && guard++ < 200000) {
    const dt = Math.min(STEP, c.duration - c.timeElapsed);
    if (dt <= 1e-9) { c.isFinished = true; break; }
    stepContest(c, dt);
    c.timeElapsed += dt;
    c.pending -= STEP;
    if (c.timeElapsed >= c.duration - 1e-9) c.isFinished = true;
  }
}

// ===== 赛后统一出分 =====
export function finalize(c: Contest): StudentResult[] {
  const rows: StudentResult[] = c.students.map((st) => {
    const perProblem: ProblemResult[] = st.problems.map((ps, i) => {
      const last = ps.attempts[ps.attempts.length - 1];
      const trail = ps.attempts.map((a) => ({ time: a.time, mode: a.mode, est: a.est, score: a.score }));
      return {
        problemId: i,
        real: last ? last.score : 0,
        est: last ? last.est : 0,
        delta: last ? last.score - last.est : 0,
        attempts: ps.attempts.length,
        reason: last ? last.reason : '未提交',
        trail,
      };
    });
    const real = perProblem.reduce((a, b) => a + b.real, 0);
    const est = perProblem.reduce((a, b) => a + b.est, 0);
    const absErr = perProblem.reduce((a, b) => a + Math.abs(b.delta), 0);
    return {
      id: st.id,
      name: st.name,
      real,
      est,
      delta: real - est,
      perProblem,
      rank: 0,
      estRank: 0,
      rankDelta: 0,
      calibration: Math.max(0, Math.round(100 - absErr / Math.max(1, perProblem.length))),
    };
  });

  const byEst = rows.slice().sort((a, b) => b.est - a.est || (a.name < b.name ? -1 : 1));
  byEst.forEach((r, i) => {
    r.estRank = i > 0 && byEst[i - 1].est === r.est ? byEst[i - 1].estRank : i + 1;
  });

  const byReal = rows.slice().sort((a, b) => b.real - a.real || (a.name < b.name ? -1 : 1));
  byReal.forEach((r, i) => {
    r.rank = i > 0 && byReal[i - 1].real === r.real ? byReal[i - 1].rank : i + 1;
  });
  rows.forEach((r) => { r.rankDelta = r.estRank - r.rank; });

  return byReal;
}

export function formatTime(s: number): string {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'survey': return '通读题面';
    case 'reading': return '读题';
    case 'thinking': return '思考';
    case 'coding': return '编码';
    case 'testing': return '对拍';
    case 'deciding': return '犹豫';
    case 'restoring': return '补交暴力';
    case 'checking': return '检查文件';
    case 'idle': return '选题';
    case 'done': return '收工';
    default: return '—';
  }
}

export function phaseColor(phase: Phase): string {
  switch (phase) {
    case 'survey': return '#6366f1';
    case 'reading': return '#3498db';
    case 'thinking': return '#f39c12';
    case 'coding': return '#2ecc71';
    case 'testing': return '#9b59b6';
    case 'deciding': return '#e74c3c';
    case 'restoring': return '#e67e22';
    case 'checking': return '#94a3b8';
    default: return '#64748b';
  }
}
