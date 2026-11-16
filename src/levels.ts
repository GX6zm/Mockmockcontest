/**
 * 选手水平基线（2026-11 调研版）
 *
 * 数据来源：详见 data/level-analysis.md 与 data/blog-roster-mapping.json。
 * - ability：实力指数 0–100，口径 = 0.45×CSP-S2026 + 0.25×NOIP2025 + 0.30×最高级别赛事2026，
 *   每项先换算成「全国百分位分 = 100 × (1 − (名次/32643)^⅓)」；缺项按 CSP 补齐。
 * - growth：成长指数 0–100 = 50 + 0.33 × CSP-S 最近一次同比年化增幅。
 * - src：一句话依据，方便以后有人问「这数哪来的」。
 *
 * 只收有公开比赛记录的人（洛谷 / OIerDb / CCF 名单）。没有记录的不编，
 * 继续走引擎生成值，由 OJ 数据决定的相对位置保持不变。
 */
import { ROSTER } from './roster.ts';
export interface PlayerLevel {
  ability: number;
  growth: number;
  /** 2026 学年的年级（1 初一 … 6 高三）；不填沿用属性表 */
  grade?: 1 | 2 | 3 | 4 | 5 | 6;
  src: string;
}

export const LEVEL_BY_NAME: Record<string, PlayerLevel> = {
  '特别之处': { ability: 89.8, growth: 65, src: 'CSP-S26 380 / NOI26 夏令营 Au 第 4' },
  '陈和骏': { ability: 83.4, growth: 58, grade: 2, src: 'CSP-S26 350（149/32643）/ J25 400 全国第 1' },
  '丁一宸': { ability: 82.3, growth: 72, src: 'CSP-S26 350 / NOIP25 261 / NOI26 第 157' },
  'noitamotuA_珂': { ability: 80.4, growth: 55, src: 'CSP-S26 320 / NOI26 夏令营 83' },
  '傻白虎': { ability: 79.6, growth: 98, src: 'CSP-S26 340 / NOIP25 193 / APIO26 177' },
  '肖子卓': { ability: 78.2, growth: 57, src: 'CSP-S26 300 / NOI26 夏令营 61' },
  '王思琦': { ability: 75.6, growth: 49, src: 'CSP-S26 270 / NOI26 夏令营 34' },
  '都大人的题构结据数做年常': { ability: 73.9, growth: 89, src: 'CSP-S26 316 / NOIP25 136' },
  '周檬轩': { ability: 69.2, growth: 76, src: 'CSP-S26 268' },
  '周炜恒': { ability: 68.9, growth: 59, src: 'CSP-S26 267' },
  '法克火星人': { ability: 68.6, growth: 50, src: 'CSP-S26 270 / NOIP25 146' },
  '蔡青辰': { ability: 68.4, growth: 99, src: 'CSP-S26 263（省 26）' },
  '为什么不让我叫Ciall': { ability: 68.4, growth: 70, src: 'CSP-S26 263 / CSP-S25 201' },
  '李金潼': { ability: 62.7, growth: 99, src: 'CSP-S26 248' },
  '陈逸阳': { ability: 60.5, growth: 60, src: 'CSP-S26 243' },
  '周逸然': { ability: 58.4, growth: 59, src: 'CSP-S26 239' },
  'Zctf一零八八': { ability: 55.5, growth: 49, src: 'CSP-S26 228' },
  'zch_stl大变': { ability: 53.1, growth: 64, src: 'CSP-S26 219' },
  '张培楠': { ability: 53.1, growth: 48, src: 'CSP-S26 219（3360/32643）/ S25 213' },
  '孙可轩': { ability: 53.0, growth: 53, src: 'CSP-S26 218（3395/32643）/ J25 400 全国第 1' },
  '陈怡嘉': { ability: 52.5, growth: 85, src: 'CSP-S26 215 / CSP-S25 108' },
  '苗淇': { ability: 51.6, growth: 58, src: 'CSP-S26 211' },
  '王鼎翼': { ability: 49.3, growth: 67, src: 'CSP-S26 200 / CSP-S25 148' },
  '刘子牧': { ability: 49.3, growth: 95, src: 'CSP-S26 200 / CSP-S25 65' },
  '不见了，失败了。': { ability: 48.3, growth: 54, src: 'CSP-S26 172 / NOIP25 128' },
  '陈钰婉': { ability: 44.7, growth: 53, grade: 5, src: 'CSP-S26 152 / NOIP25 115' },
  '李君泽': { ability: 42.2, growth: 83, src: 'CSP-S26 160 / J26 353' },
  '代羽辰': { ability: 25.7, growth: 50, src: 'CSP-S26 90 / J26 372' },
};

/**
 * 没有公开比赛记录的人：按校 OJ 排名给一个保守区间（第 1 名 55 → 末位 20）。
 * 只用来在名单里排序，不代表跨校实力；有人带数据来就补进 LEVEL_BY_NAME。
 */
export function levelOf(name: string): PlayerLevel | undefined {
  const hit = LEVEL_BY_NAME[name];
  if (hit) return hit;
  const entry = ROSTER.find((r) => r.name === name);
  if (!entry) return undefined;
  const t = (entry.rank - 1) / Math.max(1, ROSTER.length - 1);
  return {
    ability: Math.round((55 - 35 * t) * 10) / 10,
    growth: 55,
    src: `校 OJ 第 ${entry.rank} 名推算（无正赛记录，低置信度）`,
  };
}
