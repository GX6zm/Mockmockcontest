/**
 * 成长机制：跨局 rating（Elo 思路）+ 参赛场次 / 冠军 / AK 记录
 * 数据存在 localStorage，本地单人使用；文件打不开 localStorage 时降级为内存态。
 */
import { ROSTER } from './roster.ts';
import { IS_OPV } from './opv.ts';
import type { StudentResult } from './types.ts';

export interface PlayerProfile {
  name: string;
  rating: number;
  games: number;
  wins: number;
  aks: number;
  bestRank: number;
}

export interface ContestRecord {
  ts: number;
  title: string;
  n: number;
  top: { name: string; rating: number; real: number }[];
}

export interface SaveData {
  version: number;
  players: Record<string, PlayerProfile>;
  records: ContestRecord[];
}

export interface GrowthResult {
  data: SaveData;
  before: Record<string, number>;
  after: Record<string, number>;
  deltas: Record<string, number>;
}

/** OPv 版连观战 rating 档也单独存，不往原版的成长数据里塞自定义选手 */
const KEY = IS_OPV ? 'oi-sim-growth-opv-v1' : 'oi-sim-growth-v1';
const BASE_RATING = 1500;

const rosterRating = new Map(ROSTER.map((r) => [r.name, r.rating0]));

export function startingRating(name: string): number {
  return rosterRating.get(name) ?? BASE_RATING;
}

export function emptySave(): SaveData {
  return { version: 1, players: {}, records: [] };
}

/** 仅在 localStorage 完全不可用时才用，避免多标签页互相覆盖 */
let memoryFallback: SaveData | null = null;

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const count = (v: unknown, fallback: number): number =>
  Math.max(0, Math.round(num(v, fallback)));

/**
 * 读档做完整结构校验。旧版本只检查 version + players，一旦 records 被
 * 写坏（或手工改成 null），settleContest 里的 prev.records.slice() 会直接抛错，
 * 整局结算白屏。这里把每个字段都洗一遍，脏字段退回默认值。
 */
function normalizeSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<SaveData>;
  if (o.version !== 1 || !o.players || typeof o.players !== 'object' || Array.isArray(o.players)) return null;
  const players: Record<string, PlayerProfile> = {};
  for (const [name, p] of Object.entries(o.players)) {
    if (!p || typeof p !== 'object') continue;
    const q = p as Partial<PlayerProfile>;
    players[name] = {
      name,
      rating: Math.max(1000, Math.min(2600, num(q.rating, startingRating(name)))),
      games: count(q.games, 0),
      wins: count(q.wins, 0),
      aks: count(q.aks, 0),
      bestRank: Math.max(1, Math.round(num(q.bestRank, 999))),
    };
  }
  const records: ContestRecord[] = Array.isArray(o.records)
    ? o.records
      .filter((r): r is ContestRecord =>
        Boolean(r) && typeof r === 'object' && Array.isArray((r as ContestRecord).top))
      .slice(-30)
    : [];
  return { version: 1, players, records };
}

export function loadGrowth(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memoryFallback ?? emptySave();
    const parsed = normalizeSave(JSON.parse(raw));
    return parsed ?? memoryFallback ?? emptySave();
  } catch {
    return memoryFallback ?? emptySave();
  }
}

export function saveGrowth(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    memoryFallback = null; // 有 localStorage 就别再用内存副本，否则多标签页会互相覆盖
  } catch {
    /* file:// 或隐私模式下可能不可用，退回内存态 */
    memoryFallback = data;
  }
}

export function resetGrowth(): SaveData {
  const d = emptySave();
  saveGrowth(d);
  return d;
}

export function profileOf(data: SaveData, name: string): PlayerProfile {
  const p = data.players?.[name];
  if (p && typeof p === 'object') return p;
  return {
    name,
    rating: startingRating(name),
    games: 0,
    wins: 0,
    aks: 0,
    bestRank: 999,
  };
}

/**
 * 一场比赛后的结算：
 * - 用赛前 rating 的均值做基准，算每个人的“预期名次”
 * - 实际名次越好，涨分越多；爆冷夺冠涨得多，热门翻车掉得多
 */
export function settleContest(
  prev: SaveData,
  results: StudentResult[],
  meta: { title: string; fullScore: number },
): GrowthResult {
  // prev 可能来自外部传入的旧档/坏档，这里再兜一层，保证下面不会 slice() 到 undefined
  const base = normalizeSave(prev) ?? emptySave();
  const data: SaveData = {
    version: 1,
    players: { ...base.players },
    records: base.records.slice(),
  };

  const n = results.length;
  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  const deltas: Record<string, number> = {};

  const ratings = results.map((r) => profileOf(data, r.name).rating);
  const mean = ratings.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const K = 72;

  // 先算原始涨跌，再整体减去均值，保证零和（rating 不会被整场通胀）
  const raw: Record<string, number> = {};
  for (const r of results) {
    const prof = profileOf(data, r.name);
    const expected = 1 / (1 + Math.exp(-(prof.rating - mean) / 200));
    const actual = 1 - (r.rank - 1) / Math.max(1, n - 1);
    raw[r.name] = K * (actual - expected);
  }
  const rawMean = Object.values(raw).reduce((a, b) => a + b, 0) / Math.max(1, n);

  for (const r of results) {
    const prof = profileOf(data, r.name);
    before[r.name] = prof.rating;
    let delta = Math.round(raw[r.name] - rawMean);
    delta = Math.max(-90, Math.min(90, delta));
    const next = Math.max(1000, Math.min(2600, prof.rating + delta));
    deltas[r.name] = next - prof.rating;
    after[r.name] = next;

    data.players[r.name] = {
      name: r.name,
      rating: next,
      games: prof.games + 1,
      // 同分并列时只认榜首那一个冠军
      wins: prof.wins + (r === results[0] ? 1 : 0),
      aks: prof.aks + (meta.fullScore > 0 && r.real >= meta.fullScore ? 1 : 0),
      bestRank: Math.min(prof.bestRank, r.rank),
    };
  }

  const top = results
    .slice(0, 5)
    .map((r) => ({ name: r.name, rating: after[r.name], real: r.real }));
  data.records.push({ ts: Date.now(), title: meta.title, n, top });
  if (data.records.length > 30) data.records = data.records.slice(-30);

  saveGrowth(data);
  return { data, before, after, deltas };
}

export interface RatingRow {
  name: string;
  rating: number;
  games: number;
  wins: number;
  aks: number;
}

export function ratingBoard(data: SaveData): RatingRow[] {
  return Object.values(data.players)
    .filter((p) => p.games > 0)
    .sort((a, b) => b.rating - a.rating)
    .map((p) => ({ name: p.name, rating: p.rating, games: p.games, wins: p.wins, aks: p.aks }));
}
