/**
 * OPv 版 · 自定义开局配置
 *
 * 这一层只放「纯数据 + localStorage」，不 import 任何运行时模块（game.ts /
 * season.ts 会反过来 import 它），避免打包后出现循环依赖。
 *
 * 设计原则：
 *  ① 开关由构建期常量 __OPV__ 决定：普通构建里这些代码全部是死分支，
 *     原版 OI模拟赛.html 的行为与存档完全不变；
 *  ② OPv 用独立的 localStorage key 存教练档，和原版互不干扰；
 *  ③ 所有外部数据（localStorage）都做校验与 clamp，坏数据一律退回默认值。
 */
import type { Skills, Topic } from './types.ts';

declare const __OPV__: boolean;

/** 自定义开局（OP 模式）已并入主版本，始终可用（默认关闭，不启用即按原始数据开档） */
export const IS_OPV = true;

export const OPV_CONFIG_KEY = 'oi-sim-opv-config-v1';
/** 历史 OPv 独立存档键（保留用于平滑迁移到主存档） */
export const OPV_COACH_KEY = 'oi-sim-coach-opv-v1';
export const OPV_LABEL = '自定义开局（OP）';

export const OPV_TOPIC_LIST: Topic[] = ['math', 'dp', 'graph', 'greedy', 'ds', 'impl', 'string', 'geometry'];
export const OPV_TOPIC_NAMES: Record<Topic, string> = {
  math: '数学', dp: '动态规划', graph: '图论', greedy: '贪心',
  ds: '数据结构', impl: '模拟实现', string: '字符串', geometry: '计算几何',
};
export const OPV_TOPIC_COLORS: Record<Topic, string> = {
  math: '#e74c3c', dp: '#3498db', graph: '#2ecc71', greedy: '#f39c12',
  ds: '#9b59b6', impl: '#1abc9c', string: '#e67e22', geometry: '#5b8def',
};

/** 1–6 = 初一…高三（与 season.ts 的 Grade 一致） */
export type OpvGrade = 1 | 2 | 3 | 4 | 5 | 6;
export const GRADE_LABELS: Record<OpvGrade, string> = {
  1: '初一', 2: '初二', 3: '初三', 4: '高一', 5: '高二', 6: '高三',
};

export const AGE_MIN = 10;
export const AGE_MAX = 20;

/** 岁数 -> 年级：12 初一、13 初二、14 初三、15 高一、16 高二、17+ 高三 */
export function gradeForAge(age: number): OpvGrade {
  if (age <= 12) return 1;
  if (age === 13) return 2;
  if (age === 14) return 3;
  if (age === 15) return 4;
  if (age === 16) return 5;
  return 6;
}
export function ageForGrade(g: OpvGrade): number {
  return 11 + g; // 12…17
}

export interface OpvConfig {
  /** 关掉就完全按原始数据开档 */
  enabled: boolean;
  /** override = 改写名单里已有的人；create = 新加一个人 */
  mode: 'override' | 'create';
  /** 目标选手名字（create 模式下是自定义名字） */
  name: string;
  /** 岁数（展示用，也会联动年级） */
  age: number;
  /** 年级：真正决定 NOIP / 省选 / NOI 的资格链 */
  grade: OpvGrade;
  /** 八个专题 0–150 */
  topics: Record<Topic, number>;
  /** 元能力 0–100 */
  coding: number;
  reading: number;
  debug: number;
  /** 天赋倍率（只影响训练成长速度，不直接改比赛得分） */
  talent: number;
  /** 疲劳 0–100（只影响训练效率） */
  fatigue: number;
  /** 作业/互测 0–100（国集选拔占 10%） */
  homework: number;
  /** 学校声望 0–100（影响新生质量） */
  prestige: number;
  /** 开档时自动把 TA 勾进主力 */
  autoTeam: boolean;
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

export function defaultOpvConfig(name = ''): OpvConfig {
  const topics = {} as Record<Topic, number>;
  for (const t of OPV_TOPIC_LIST) topics[t] = 120;
  return {
    enabled: false,
    mode: 'override',
    name,
    age: 15,
    grade: 4,
    topics,
    coding: 95,
    reading: 90,
    debug: 95,
    talent: 1.3,
    fatigue: 0,
    homework: 90,
    prestige: 80,
    autoTeam: true,
  };
}

/** 从任意（可能是旧版 / 被手改坏的）对象里还原出一份安全配置 */
export function sanitizeOpvConfig(raw: unknown, fallbackName = ''): OpvConfig {
  const d = defaultOpvConfig(fallbackName);
  if (!raw || typeof raw !== 'object') return d;
  const v = raw as Partial<OpvConfig>;
  const topics = {} as Record<Topic, number>;
  const srcTopics = (v.topics ?? {}) as Partial<Record<Topic, unknown>>;
  for (const t of OPV_TOPIC_LIST) topics[t] = Math.round(clamp(srcTopics[t], 0, 150, d.topics[t]));
  const grade = Math.round(clamp(v.grade, 1, 6, d.grade)) as OpvGrade;
  return {
    enabled: v.enabled === true,
    mode: v.mode === 'create' ? 'create' : 'override',
    name: typeof v.name === 'string' ? v.name.slice(0, 24) : d.name,
    age: Math.round(clamp(v.age, AGE_MIN, AGE_MAX, 11 + grade)),
    grade,
    topics,
    coding: Math.round(clamp(v.coding, 0, 100, d.coding)),
    reading: Math.round(clamp(v.reading, 0, 100, d.reading)),
    debug: Math.round(clamp(v.debug, 0, 100, d.debug)),
    talent: Math.round(clamp(v.talent, 0.5, 3, d.talent) * 100) / 100,
    fatigue: Math.round(clamp(v.fatigue, 0, 100, d.fatigue)),
    homework: Math.round(clamp(v.homework, 0, 100, d.homework)),
    prestige: Math.round(clamp(v.prestige, 0, 100, d.prestige)),
    autoTeam: v.autoTeam !== false,
  };
}

/** 读取当前生效的配置；关掉 / 没存过 / 读失败都返回 null */
export function loadOpvConfig(): OpvConfig | null {
  if (!IS_OPV) return null;
  try {
    const raw = localStorage.getItem(OPV_CONFIG_KEY);
    if (!raw) return null;
    const cfg = sanitizeOpvConfig(JSON.parse(raw));
    return cfg.enabled && cfg.name.trim() ? cfg : null;
  } catch {
    return null;
  }
}

/** 读取未启用时的编辑草稿（编辑器用），没有就给默认草稿 */
export function loadOpvDraft(fallbackName = ''): OpvConfig {
  if (!IS_OPV) return defaultOpvConfig(fallbackName);
  try {
    const raw = localStorage.getItem(OPV_CONFIG_KEY);
    return raw ? sanitizeOpvConfig(JSON.parse(raw), fallbackName) : defaultOpvConfig(fallbackName);
  } catch {
    return defaultOpvConfig(fallbackName);
  }
}

export function saveOpvConfig(cfg: OpvConfig): boolean {
  try {
    localStorage.setItem(OPV_CONFIG_KEY, JSON.stringify(sanitizeOpvConfig(cfg)));
    return true;
  } catch {
    return false;
  }
}

export function clearOpvConfig(): void {
  try { localStorage.removeItem(OPV_CONFIG_KEY); } catch { /* ignore */ }
}

/**
 * 天花板校准（2026-11-15 第二轮）
 *
 * 原版把 0–150 知识点线性压进 0–1，且引擎/赛季都 clamp 到 0.998，
 * 于是「知识点全满」= 100 能力点；可正赛黑题的 think 能到 117–130，
 * 天花板选手天然差 −20 分，WC 30 个种子里甚至能低到 98/300。
 *
 * 按周康阳（IOI2024 600/600、NOI2023 669/705、CSP 400/400）的真实天花板，
 * 120 知识点以上进入「超频区」：赛场能力继续往上涨，150 → 1.35（135 能力点），
 * 145 → 1.258（IOI AKer 口径）。120 及以下完全沿用原版换算，普通选手一分不变。
 * 元能力（代码/阅读/调试）只影响耗时与写挂，保持 0–0.998，不参与超频。
 */
export const NORMAL_ABILITY_CEIL = 0.998;
export const OPV_ABILITY_CEIL = 1.35;
export const OPV_BASE_KP = 120;

/** 知识点 -> 引擎能力值（超频区分段线性） */
export function opvAbility(kp: number): number {
  const v = Math.max(0, Math.min(150, kp));
  if (v <= OPV_BASE_KP) return Math.min(NORMAL_ABILITY_CEIL, v / 150);
  const t = (v - OPV_BASE_KP) / (150 - OPV_BASE_KP);
  return 0.8 + t * (OPV_ABILITY_CEIL - 0.8);
}

/** 引擎能力值 -> 0–150 知识点展示（opvAbility 的反函数，120 以下与原版完全一致） */
export function kpFromAbility(v: number): number {
  const c = Math.max(0, Math.min(ABILITY_CEIL, v));
  if (c <= 0.8) return Math.round(Math.min(1, c) * 150);
  const t = (c - 0.8) / (OPV_ABILITY_CEIL - 0.8);
  return Math.round(OPV_BASE_KP + t * (150 - OPV_BASE_KP));
}

/** 统一能力天花板：120 知识点以下保持原口径，120–150 平滑进入超频区（最高 1.35） */
export const ABILITY_CEIL = OPV_ABILITY_CEIL;

/** 0–150 知识点 / 0–100 元能力 -> 引擎技能 */
export function opvSkills(cfg: OpvConfig): Skills {
  const topics = {} as Record<Topic, number>;
  for (const t of OPV_TOPIC_LIST) topics[t] = Math.max(0.02, opvAbility(cfg.topics[t]));
  return {
    topics,
    coding: Math.min(NORMAL_ABILITY_CEIL, Math.max(0.02, cfg.coding / 100)),
    reading: Math.min(NORMAL_ABILITY_CEIL, Math.max(0.02, cfg.reading / 100)),
    debug: Math.min(NORMAL_ABILITY_CEIL, Math.max(0.02, cfg.debug / 100)),
  };
}

/** 与 season.ts overallOf 同口径的综合分预览（超频后可以破 100） */
export function opvOverall(cfg: OpvConfig): number {
  const avg = OPV_TOPIC_LIST.reduce((a, t) => a + opvAbility(cfg.topics[t]), 0) / OPV_TOPIC_LIST.length;
  const coding = Math.min(NORMAL_ABILITY_CEIL, cfg.coding / 100);
  const debug = Math.min(NORMAL_ABILITY_CEIL, cfg.debug / 100);
  return Math.round((avg * 0.8 + coding * 0.12 + debug * 0.08) * 1000) / 10;
}

/** 当前配置的选手名字（未启用返回 null） */
export function opvTargetName(): string | null {
  return loadOpvConfig()?.name ?? null;
}
