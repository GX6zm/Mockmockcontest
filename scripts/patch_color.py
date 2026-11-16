import io

base = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
p = base + r'\src\game.ts'
s = io.open(p, encoding='utf-8').read()

a = "    const chosen = pickTitle(level, used, rng);"
b = """    // 颜色跟着实际难度走（正赛的 levels 顺序只作兜底），避免色档与难度脱节
    const colorLevel = range ? nearestLevel(diff) : level;
    const chosen = pickTitle(colorLevel, used, rng);"""
assert s.count(a) == 1
s = s.replace(a, b)

a2 = "      title,\n      topic,\n      level,"
b2 = "      title,\n      topic,\n      level: colorLevel,"
assert s.count(a2) == 1
s = s.replace(a2, b2)

helper = """/** 按难度（1–115）找最接近的颜色档位 */
function nearestLevel(diff: number): number {
  let best = 0;
  let bd = Infinity;
  for (const l of LEVELS) {
    const d = Math.abs(l.center - diff);
    if (d < bd) {
      bd = d;
      best = l.id;
    }
  }
  return best;
}

"""
anchor = "export function levelInfo(level: number): LevelInfo {"
assert s.count(anchor) == 1
s = s.replace(anchor, helper + anchor)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
