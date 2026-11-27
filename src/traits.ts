/**
 * 选手轻量特性词条：让招进来的初一 / 高一苗子有辨识度和培养期待感。
 * 全部分配与效果均为确定性，不消耗赛中 / 训练随机流，严格兼容 trace-check。
 */
import type { TraitId } from './types.ts';
import type { IconName } from './ui.tsx';

export interface TraitDef {
  id: TraitId;
  name: string;
  short: string;
  note: string;
  tone: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose';
  icon: IconName;
}

export const TRAIT_LIST: TraitId[] = [
  'clutch',
  'bruteMaster',
  'lateBloomer',
  'specialist',
  'tester',
  'sprinter',
];

export const TRAITS: Record<TraitId, TraitDef> = {
  clutch: {
    id: 'clutch',
    name: '大心脏',
    short: '心脏',
    note: '正赛挂分率 −30%，关键时刻手稳不易写飞',
    tone: 'emerald',
    icon: 'award',
  },
  bruteMaster: {
    id: 'bruteMaster',
    name: '暴力战神',
    short: '暴力',
    note: '部分分与暴力子任务极其稳健，劣势局也能咬住基本盘',
    tone: 'amber',
    icon: 'target',
  },
  lateBloomer: {
    id: 'lateBloomer',
    name: '大器晚成',
    short: '晚成',
    note: '进入高中阶段（高一起）每周训练成长 ×1.22',
    tone: 'violet',
    icon: 'sprout',
  },
  specialist: {
    id: 'specialist',
    name: '偏科怪才',
    short: '偏科',
    note: '练到自己最擅长专题时成长 ×1.40',
    tone: 'sky',
    icon: 'zap',
  },
  tester: {
    id: 'tester',
    name: '对拍强迫症',
    short: '对拍',
    note: '更容易主动写对拍且压低挂分，但单题对拍耗时略增',
    tone: 'rose',
    icon: 'scale',
  },
  sprinter: {
    id: 'sprinter',
    name: '高能冲刺',
    short: '冲刺',
    note: '疲劳低于 40 时精力充沛，本周训练效率 ×1.18',
    tone: 'emerald',
    icon: 'flame',
  },
};

function fnvHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 为选手确定性分配 1–2 个轻量特性词条。
 * 高中生略偏向成型特性，初中生偏向养成/随机盲盒，完全确定不破坏外部 rng。
 */
export function assignTraits(name: string, seed: number, grade: number): TraitId[] {
  const rng = mulberry(fnvHash(`${name}#${seed}#traits`));
  const pool = TRAIT_LIST.slice();
  // 适度调整初高权重，但 6 个特性均可能出现
  const weighted: TraitId[] = grade <= 2
    ? [...pool, 'lateBloomer', 'specialist']
    : [...pool, 'clutch', 'tester'];
  const first = weighted[Math.floor(rng() * weighted.length)] ?? 'clutch';
  if (rng() >= 0.25) return [first];
  const rest = pool.filter((id) => id !== first);
  const second = rest[Math.floor(rng() * rest.length)];
  return second ? [first, second] : [first];
}
