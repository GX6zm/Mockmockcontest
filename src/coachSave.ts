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
import { IS_OPV, OPV_COACH_KEY } from './opv.ts';

/** OPv 版用独立存档，绝不能把原版的教练档覆盖掉（file:// 下同源） */
const KEY = IS_OPV ? OPV_COACH_KEY : 'oi-sim-coach-v1';
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

export function hasCoachSave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as CoachSave;
    return parsed?.version === VERSION && validSeason(parsed.season);
  } catch {
    return false;
  }
}

/** 读不到 / 读到坏档时，用调用方给的新档兜底 */
export function loadCoachSeason(fallback: () => SeasonState): SeasonState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw) as CoachSave;
    if (!parsed || parsed.version !== VERSION || !validSeason(parsed.season)) return fallback();
    return parsed.season;
  } catch {
    return fallback();
  }
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
  } catch {
    /* ignore */
  }
}
