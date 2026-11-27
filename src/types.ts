// ===== 领域类型 =====

export type Topic =
  | 'math' | 'dp' | 'graph' | 'greedy'
  | 'ds' | 'impl' | 'string' | 'geometry';

/** 赛制：oi = 赛中盲测估分/最后提交为准/有 freopen；ioi = 实时评测/取历史最高分/无 freopen */
export type ContestFormat = 'oi' | 'ioi';

/** 选手特性词条 */
export type TraitId = 'clutch' | 'bruteMaster' | 'lateBloomer' | 'specialist' | 'tester' | 'sprinter';

/** 赛前战术指令 */
export type ContestTactic = 'steady' | 'normal' | 'aggressive';

/** 选手当前所处阶段 */
export type Phase =
  | 'idle'      // 选题
  | 'survey'    // 开场通读题面
  | 'reading'   // 读题
  | 'thinking'  // 思考
  | 'coding'    // 编码
  | 'testing'   // 对拍
  | 'deciding'  // 犹豫要不要交
  | 'restoring' // 补交暴力保底
  | 'fixing'    // IOI 实时评测后快速修 bug 重交
  | 'checking'  // 没事做了：检查文件、复读题面，等收卷
  | 'done';     // 收工

export interface Subtask {
  label: string;
  points: number;
}

export interface Problem {
  id: number;
  title: string;
  topic: Topic;
  /** 洛谷难度档位 0-7：红橙黄绿青蓝紫黑 */
  level: number;
  difficulty: number; // 1-100 综合难度（由档位换算，用于内部能力对比）
  think: number;      // 思维难度
  impl: number;       // 实现难度
  detail: number;     // 细节（坑）难度
  subtasks: Subtask[];
  submitCount: number;
}

export interface Skills {
  /** 八个知识点水平（0–1），比赛里只按题目的 topic 取对应值 */
  topics: Record<Topic, number>;
  /** 代码手感：影响卡常、写挂和实现耗时 */
  coding: number;
  /** 读题/理解：影响开场通读和初赛阅读程序 */
  reading: number;
  /** 调试：影响对拍发现 bug、写挂概率 */
  debug: number;
}

export interface Attempt {
  mode: 'brute' | 'full';
  score: number;   // 真实得分（赛中隐藏）
  est: number;     // 选手自估
  /** 扣除暗病挂分前的干净分（已过赛制曲线，用于 IOI 修 bug 重交） */
  clean?: number;
  /** 本次提交是否触发了暗病挂分 */
  damaged?: boolean;
  tested: boolean;
  time: number;
  reason: string;
  nth: number;
}

export interface ProblemState {
  status: 'queue' | 'active' | 'done';
  phase: Phase;
  progress: number;
  mode: 'brute' | 'full';
  tested: boolean;
  /** 对拍发现 bug、回去返工的次数 */
  debugRounds: number;
  /** IOI 实时评测后快速修 bug 重交的次数 */
  fixRounds: number;
  attempts: Attempt[];
  submissions: number;
  timeSpent: number;
}

export interface Student {
  id: number;
  name: string;
  skills: Skills;
  fatigue: number;
  focus: number;
  motivation: number;
  problems: ProblemState[];
  phase: Phase;
  phaseProgress: number;
  currentProblem: number | null;
  totalSubmissions: number;
  finished: boolean;
  /** 开场通读题面剩余秒数（读完全部题才开始做） */
  surveyLeft: number;
  surveyTotal: number;
  /** 选手特性词条（影响对拍/挂分倾向，仅展示与轻量判定） */
  traits?: TraitId[];
}

export interface Submission {
  time: number;
  studentId: number;
  studentName: string;
  problemId: number;
  nth: number;
  mode: 'brute' | 'full';
}

export interface ContestConfig {
  preset: string;
  problemCount: number;
  /** 每题难度档位 0-7（洛谷颜色） */
  levels: number[];
  studentCount: number;
  minutes: number;
  seed: number;
  /**
   * 赛制：默认 'oi'（传统盲测）；'ioi' 为实时评测、取历次提交最高分、无 freopen 爆零。
   */
  format?: ContestFormat;
  /** 赛前战术指令：稳健保底 / 常规 / 搏命冲高 */
  tactic?: ContestTactic;
  /**
   * 外部带入的阵容（教练模式用）：给了就按这份名单和技能生成选手，
   * 不再随机从校 OJ 名单里抽人。观战模式不传。
   */
  cohort?: CohortEntry[];
  /**
   * 每题难度范围（1-115）：给了就按范围随机抽，不再按档位中心 ±3 抖动。
   * 教练模式的正赛用它来贴近历年真题难度。
   */
  difficultyRanges?: [number, number][];
  /**
   * 每题原始得分百分比 → 官方得分百分比的映射（教练模式正赛用）。
   * 把引擎的「能力/难度」原始得分曲线校正到该赛事真实的得分区间，
   * 例如 NOI 高分段的真实得分率明显高于引擎原始估计。
   * 观战模式不传，显示的就是引擎原始分。
   */
  scoreCurve?: [number, number][];
}

/** 教练模式里跨周保存的选手快照 */
export interface CohortEntry {
  name: string;
  skills: Skills;
  /** 0-1 的疲劳（引擎内部口径，赛季的 0-100 除以 100） */
  fatigue?: number;
  focus?: number;
  motivation?: number;
  /** 选手特性词条 */
  traits?: TraitId[];
}

export interface Contest {
  seed: number;
  rng: () => number;
  /** 尚未消费的模拟秒数（保证固定步长推进，与帧率无关） */
  pending: number;
  problems: Problem[];
  students: Student[];
  submissions: Submission[];
  timeElapsed: number;
  duration: number;
  isFinished: boolean;
  config: ContestConfig;
}

export interface ProblemResult {
  problemId: number;
  real: number;
  est: number;
  delta: number;
  attempts: number;
  reason: string;
  /** 历次提交的估分轨迹，用于战后复盘 */
  trail: { time: number; mode: 'brute' | 'full'; est: number; score: number }[];
}

export interface StudentResult {
  id: number;
  name: string;
  real: number;
  est: number;
  delta: number;
  perProblem: ProblemResult[];
  rank: number;
  estRank: number;
  rankDelta: number; // >0 表示名次上升
  calibration: number; // 0-100 估分准确度
  written?: number; // NOI 笔试分（0-100），其他比赛没有
  bonus?: number;   // NOI 省队 A 类加分（+5），其他比赛没有
}
