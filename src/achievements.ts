/**
 * 跨周目永久成就系统（存在本地 localStorage，鼓励多届挑战与重开）。
 * 所有判定均为纯读 SeasonState，不修改游戏数值。
 */
import type { SeasonState } from './season.ts';
import type { IconName } from './ui.tsx';

export type AchievementId =
  | 'first_prov1'
  | 'full_prov_team'
  | 'six_year_gold'
  | 'zero_drop'
  | 'underdog_rise'
  | 'grand_slam'
  | 'desert_miracle'
  | 'iron_coach';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  desc: string;
  icon: IconName;
  tier: 'bronze' | 'silver' | 'gold';
}

export interface AchievementStore {
  unlocked: Record<string, number>;
}

const KEY = 'oi-sim-achievements-v1';

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_prov1',
    name: '初露锋芒',
    desc: '在任意一届执教中收获首张 CSP-S 或 NOIP 省一',
    icon: 'award',
    tier: 'bronze',
  },
  {
    id: 'full_prov_team',
    name: '满门忠烈',
    desc: '单学年内校队共有不少于 5 人携手闯进省队',
    icon: 'users',
    tier: 'gold',
  },
  {
    id: 'six_year_gold',
    name: '六年养成',
    desc: '把一名从初一入队的苗子一路培养成 NOI 金牌选手',
    icon: 'sprout',
    tier: 'gold',
  },
  {
    id: 'zero_drop',
    name: '零挂分圣体',
    desc: '单场 4 题及以上的 OI 赛制正赛中，至少 4 名参战主力无人挂分',
    icon: 'target',
    tier: 'silver',
  },
  {
    id: 'underdog_rise',
    name: '草根逆袭',
    desc: '把入校时综合排在全校后 20% 的队员一路带进省队',
    icon: 'trendUp',
    tier: 'silver',
  },
  {
    id: 'grand_slam',
    name: '大满贯教练',
    desc: '单届生涯累计集齐 WC、APIO、NOI、IOI 四项金牌',
    icon: 'trophy',
    tier: 'gold',
  },
  {
    id: 'desert_miracle',
    name: '荒漠绿洲',
    desc: '在「荒漠重建」挑战剧本中成功带出至少 1 名省队选手',
    icon: 'flame',
    tier: 'gold',
  },
  {
    id: 'iron_coach',
    name: '常青名帅',
    desc: '在同一份教案下坚持带队执教满 5 个学年及以上',
    icon: 'calendar',
    tier: 'silver',
  },
];

export function loadAchievements(): AchievementStore {
  try {
    if (typeof localStorage === 'undefined') return { unlocked: {} };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { unlocked: {} };
    const parsed = JSON.parse(raw) as Partial<AchievementStore>;
    if (!parsed || typeof parsed.unlocked !== 'object' || !parsed.unlocked) {
      return { unlocked: {} };
    }
    return { unlocked: { ...parsed.unlocked } };
  } catch {
    return { unlocked: {} };
  }
}

export function saveAchievements(store: AchievementStore): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 隐私模式或 Node 环境忽略 */
  }
}

/** 根据当前赛季状态计算已满足条件的成就列表 */
export function evaluateSeasonAchievements(s: SeasonState): AchievementId[] {
  const out = new Set<AchievementId>();

  // 统计历史 + 本学年累计奖项
  let prov1 = 0;
  let provTeamTotal = 0;
  let wcGold = 0;
  let apioGold = 0;
  let noiGold = 0;
  let ioiGold = 0;

  for (const h of s.history) {
    prov1 += h.csp2First + h.noipFirst;
    provTeamTotal += h.provTeam;
    if (h.provTeam >= 5) out.add('full_prov_team');
    wcGold += h.wcGold;
    apioGold += h.apioGold;
    noiGold += h.noiGold;
    ioiGold += h.ioiGold;
  }

  // 本学年尚未归档进 history 的部分
  if (s.year > s.history.length) {
    let curProvTeam = 0;
    for (const c of s.contests) {
      if (c.kind !== 'official') continue;
      for (const a of c.awards ?? []) {
        if ((c.stageId === 'csp2' || c.stageId === 'noip') && a.tone === 'prov1') prov1 += 1;
        if (c.stageId === 'prov' && a.tone === 'team') { curProvTeam += 1; provTeamTotal += 1; }
        if (c.stageId === 'wc' && a.tone === 'gold') wcGold += 1;
        if (c.stageId === 'apio' && a.tone === 'gold') apioGold += 1;
        if (c.stageId === 'noi' && a.tone === 'gold') noiGold += 1;
        if (c.stageId === 'ioi' && a.tone === 'gold') ioiGold += 1;
      }
    }
    if (curProvTeam >= 5) out.add('full_prov_team');
  }

  if (prov1 > 0) out.add('first_prov1');
  if (wcGold > 0 && apioGold > 0 && noiGold > 0 && ioiGold > 0) out.add('grand_slam');
  if (s.scenario === 'desert' && provTeamTotal > 0) out.add('desert_miracle');
  if (s.year >= 5 || s.history.length >= 5) out.add('iron_coach');

  // 单场 4+ 题 OI 正赛：至少 4 名在队主力零挂分
  const teamSet = new Set(s.team);
  for (const c of s.contests) {
    if (c.kind !== 'official' || c.format === 'ioi') continue;
    if (c.levels.length < 4) continue;
    const teamRows = c.rows.filter((r) => teamSet.has(r.name));
    if (teamRows.length >= 4 && teamRows.every((r) => r.delta >= 0)) {
      out.add('zero_drop');
      break;
    }
  }

  // 跨学年档案：六年养成 + 草根逆袭
  for (const arch of Object.values(s.archives ?? {})) {
    if (arch.entryGrade === 1 && arch.noiGold > 0) out.add('six_year_gold');
    if (arch.underdog && arch.provTeams > 0) out.add('underdog_rise');
  }
  for (const st of s.students) {
    const arch = s.archives?.[st.name];
    if (arch?.entryGrade === 1 && st.noi?.medal === 1) out.add('six_year_gold');
    if (arch?.underdog && st.prov?.team) out.add('underdog_rise');
  }

  return [...out];
}

/** 同步成就到底层存储，返回新解锁的成就列表 */
export function syncAchievements(s: SeasonState): { store: AchievementStore; newlyUnlocked: AchievementDef[] } {
  const store = loadAchievements();
  const matched = evaluateSeasonAchievements(s);
  const newlyUnlocked: AchievementDef[] = [];
  const now = Date.now();
  let changed = false;
  for (const id of matched) {
    if (!store.unlocked[id]) {
      store.unlocked[id] = now;
      changed = true;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) newlyUnlocked.push(def);
    }
  }
  if (changed) saveAchievements(store);
  return { store, newlyUnlocked };
}
