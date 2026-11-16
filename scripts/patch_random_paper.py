import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

# 1) StageDef 增加纸面信息
a = "  rangesJ?: [number, number][];"
b = "  rangesJ?: [number, number][];\n  /** 本次卷子的难度档（1–8），以及由它换算出的分数线浮动（分） */\n  paperD?: number[];\n  paperShift?: number;"
assert s.count(a) == 1
s = s.replace(a, b)

start = s.index("/**\n * 取「赛季年份」对应的那份真实卷子。")
end = s.index("/** 初赛：陕西 2025 S 线 37 分")
new = '''/** 中位数 */
function median(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 每个题位「历年难度的中位数」——这是合理范围的中心，不是某一年的原卷 */
export function paperBaseProfile(stageId: string): number[] | null {
  const table = PAPER_HISTORY[stageId];
  if (!table) return null;
  const years = Object.keys(table).map(Number);
  const len = table[years[0]].length;
  const out: number[] = [];
  for (let i = 0; i < len; i += 1) out.push(median(years.map((y) => table[y][i])));
  return out;
}

/** 标准正态（Box–Muller） */
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 生成「某一年的卷子」：以历年同题位难度中位数为锚，叠加
 * 整卷偏难/偏易（年份运气）和逐题噪声，限制在锚点 ±2 档以内。
 * 所以不会照搬任何一年，但也不会出现「T1 是黑题」这种离谱情况。
 * 同时按「实际均难度 − 基准均难度」换算出分数线浮动 paperShift。
 */
export function stagePaperForYear(stage: StageDef, year: number, seed: number): StageDef {
  const base = paperBaseProfile(stage.id);
  if (!base || base.length !== stage.levels.length * stage.days) return stage;
  const rng = makeRng((seed * 7919 + year * 104729 + 12345) >>> 0);
  const bias = Math.max(-1.3, Math.min(1.3, gauss(rng) * 0.6));
  const ds = base.map((b) => {
    const c = Math.round(b);
    const raw = Math.round(b + bias + gauss(rng) * 0.5);
    return Math.max(1, Math.min(8, Math.max(c - 2, Math.min(c + 2, raw))));
  });
  const full = ds.length * 100;
  const baseAvg = base.reduce((x, y) => x + y, 0) / base.length;
  const avg = ds.reduce((x, y) => x + y, 0) / ds.length;
  // 每难 1 档 ≈ 400 分制下掉 28 分；按本场满分缩放，再取整到 5 分
  const shift = Math.round(((baseAvg - avg) * 28 * (full / 400)) / 5) * 5;
  return {
    ...stage,
    levels: ds.map(colorOfD),
    ranges: ds.map((d) => {
      const c = D_CENTER[d] ?? 52;
      return [Math.max(5, c - 5), Math.min(115, c + 5)] as [number, number];
    }),
    paperD: ds,
    paperShift: shift,
  };
}

/** 本场卷子带来的分数线浮动（分） */
export function paperShiftOf(stage: StageDef): number {
  return stage.paperShift ?? 0;
}

/** 省线随卷面难度整体浮动 */
function shiftLines(lines: ScoreLine[], shift: number): ScoreLine[] {
  if (!shift) return lines;
  return lines.map((l) => ({ ...l, min: Math.max(0, Math.round((l.min + shift) / 5) * 5) }));
}

'''
s = s[:start] + new + s[end:]

# 2) runWeeklyContest 调用处
a2 = """  const rawStage = stageOfWeek(s.week);
  // 按赛季年份选当年真题剖面（游戏里的第 1 年 = 2026）
  const stage = rawStage ? stageWithPaper(rawStage, s.year) : rawStage;"""
b2 = """  const rawStage = stageOfWeek(s.week);
  // 按赛季年份现出一份「合理范围内的随机卷」：历年难度中位数为锚 + 年份偏难/偏易 + 逐题噪声
  const stage = rawStage ? stagePaperForYear(rawStage, s.year, s.seed) : rawStage;"""
assert s.count(a2) == 1
s = s.replace(a2, b2)

# 3) CSP2 省线按卷面浮动
a3 = "    const guide = CSP2_GUIDE.S;"
b3 = "    const guide = { ...CSP2_GUIDE.S, lines: shiftLines(CSP2_GUIDE.S.lines, paperShiftOf(stage)) };"
assert s.count(a3) == 1
s = s.replace(a3, b3)

a4 = "陕西官方线：一等 100 分（157 人）、二等 30 分，不设三等"
b4 = "陕西线（随卷面难度浮动）：一等 ${guide.lines[0].min} 分（157 人）、二等 ${guide.lines[1].min} 分，不设三等"
assert s.count(a4) == 1
s = s.replace(a4, b4)

# 4) NOIP 省线按卷面浮动
a5 = "      const line = bandOfLines(NOIP_SSX.lines, scoreInt);"
b5 = "      const line = bandOfLines(shiftLines(NOIP_SSX.lines, paperShiftOf(stage)), scoreInt);"
assert s.count(a5) == 1
s = s.replace(a5, b5)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
