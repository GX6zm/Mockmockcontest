import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

block = """/** 洛谷难度档（1–8）→ 引擎难度中心（1–115） */
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

/**
 * 取「赛季年份」对应的那份真实卷子。
 * 有当年数据就用当年；没有就用最近一年有数据的；再往后（游戏里的未来年份）按年轮换，
 * 这样连带多年时每年的难度剖面都不一样，而不是每年都考同一份卷子。
 */
export function paperOfYear(stageId: string, year: number): number[] | null {
  const table = PAPER_HISTORY[stageId];
  if (!table) return null;
  if (table[year]) return table[year];
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const past = years.filter((y) => y <= year);
  if (past.length) return table[past[past.length - 1]];
  const span = years[years.length - 1] - years[0] + 1;
  const idx = ((year - years[0]) % span + span) % span;
  return table[years[Math.min(years.length - 1, idx)]];
}

/** 把赛程里的固定难度换成「当年那份卷子」的难度 */
export function stageWithPaper(stage: StageDef, year: number): StageDef {
  const ds = paperOfYear(stage.id, year);
  if (!ds || ds.length !== stage.levels.length * stage.days) return stage;
  return {
    ...stage,
    levels: ds.map(colorOfD),
    ranges: ds.map((d) => {
      const c = D_CENTER[d] ?? 52;
      return [Math.max(5, c - 5), Math.min(115, c + 5)] as [number, number];
    }),
  };
}

"""

anchor = "/** 初赛：陕西 2025 S 线 37 分，全国分位来自官方指导线 */"
assert s.count(anchor) == 1
s = s.replace(anchor, block + anchor)

a = "  const stage = stageOfWeek(s.week);"
b = "  const rawStage = stageOfWeek(s.week);\n  // 按赛季年份选当年真题剖面（游戏里的第 1 年 = 2026）\n  const stage = rawStage ? stageWithPaper(rawStage, s.year) : rawStage;"
assert s.count(a) == 1
s = s.replace(a, b)

a2 = "  const runs = Array.from({ length: stage.days }, (_, d) => runOneDay(cohort, stage.levels, stage.minutes, (seedBase + d * 1013) >>> 0, stage.ranges, trace,"
b2 = """  // 多试赛事：第 d 试取 ranges 里属于它的那一段，否则两天会撞题
  const dayRanges = (d: number): [number, number][] | undefined => {
    if (!stage.ranges) return undefined;
    const n = stage.levels.length;
    return stage.ranges.slice(d * n, (d + 1) * n);
  };
  const runs = Array.from({ length: stage.days }, (_, d) => runOneDay(cohort, stage.levels, stage.minutes, (seedBase + d * 1013) >>> 0, dayRanges(d), trace,"""
assert s.count(a2) == 1
s = s.replace(a2, b2)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
