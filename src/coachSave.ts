/**
 * 教练模式存档：40 周一届，刷新一次全丢是最劝退的体验。
 *
 * 只存纯数据的 SeasonState —— pendingEvent 里没有函数（选项逻辑在
 * chooseEventOption 里按 id 现查 events.ts），ContestRecap / TrainingReport
 * 也都是普通对象，可以直接 JSON 序列化。
 *
 * 三条原则：
 *  ① 读档做结构校验，任何字段缺失/类型不对就退回新档，绝不白屏；
 *  ② 写档吞掉所有异常（file://、隐私模式、配额满都降级为「这一局不存」）；
 *  ③ 不缓存到模块变量里，多标签页时始终以 localStorage 为准，避免互相覆盖。
 */
import type { SeasonState } from './season.ts';
import { OPV_COACH_KEY } from './opv.ts';

/** 统一主存档键；首次读档时若主存档为空，会平滑迁移旧 OPv 存档 */
const KEY = 'oi-sim-coach-v1';
const LEGACY_KEYS = [OPV_COACH_KEY];
const VERSION = 1;

interface CoachSave {
  version: number;
  savedAt: number;
  season: SeasonState;
}

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 结构校验：这些字段只要缺一个，CoachScreen 渲染时就会直接抛错 */
function validSeason(v: unknown): v is SeasonState {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<SeasonState>;
  return isNum(s.seed) && isNum(s.careerYears) && isNum(s.year) && isNum(s.week)
    && typeof s.phase === 'string'
    && isNum(s.prestige) && isNum(s.weekMult)
    && isArr(s.students) && isArr(s.team) && isArr(s.reserve)
    && isArr(s.lastTeam) && isArr(s.lastReserve)
    && isArr(s.graduates) && isArr(s.newcomers)
    && isArr(s.contests) && isArr(s.history) && isArr(s.eventLog)
    && (s.plan === null || typeof s.plan === 'object')
    && (s.report === null || typeof s.report === 'object')
    && (s.lastContest === null || typeof s.lastContest === 'object')
    && (s.pendingEvent === null || typeof s.pendingEvent === 'object')
    && s.students.length > 0
    && s.week >= 1 && s.week <= 60 && s.year >= 1;
}

function readValidFrom(key: string): SeasonState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoachSave;
    if (!parsed || parsed.version !== VERSION || !validSeason(parsed.season)) return null;
    return parsed.season;
  } catch {
    return null;
  }
}

export function hasCoachSave(): boolean {
  if (readValidFrom(KEY)) return true;
  return LEGACY_KEYS.some((k) => Boolean(readValidFrom(k)));
}

/** 读不到 / 读到坏档时，用调用方给的新档兜底；存在旧 OPv 存档时自动平滑迁移 */
export function loadCoachSeason(fallback: () => SeasonState): SeasonState {
  const primary = readValidFrom(KEY);
  if (primary) return primary;
  for (const k of LEGACY_KEYS) {
    const legacy = readValidFrom(k);
    if (legacy) {
      saveCoachSeason(legacy);
      return legacy;
    }
  }
  return fallback();
}

/** 返回是否真的写进去了：file:// / 隐私模式下可能不可用，UI 不该假装已存档 */
export function saveCoachSeason(season: SeasonState): boolean {
  try {
    const payload: CoachSave = { version: VERSION, savedAt: Date.now(), season };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    /* 存不了就算了，不影响这一局继续玩 */
    return false;
  }
}

/** 首屏探测一次，用来显示真实的存档状态 */
export function coachStorageAvailable(): boolean {
  try {
    localStorage.setItem('__oi_probe__', '1');
    localStorage.removeItem('__oi_probe__');
    return true;
  } catch {
    return false;
  }
}

export function clearCoachSeason(): void {
  try {
    localStorage.removeItem(KEY);
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
