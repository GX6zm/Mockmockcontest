import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

a = """/** 标准正态（Box–Muller） */
function gauss(rng: () => number): number {"""
b = """/** 标准正态（Box–Muller），给卷面随机化用 */
function paperGauss(rng: () => number): number {"""
assert s.count(a) == 1
s = s.replace(a, b)
s = s.replace("Math.min(1.3, gauss(rng) * 0.6)", "Math.min(1.3, paperGauss(rng) * 0.6)", 1)
s = s.replace("Math.round(b + bias + gauss(rng) * 0.5)", "Math.round(b + bias + paperGauss(rng) * 0.5)", 1)

a2 = "    const guide = { ...CSP2_GUIDE.S, lines: shiftLines(CSP2_GUIDE.S.lines, paperShiftOf(stage)) };"
b2 = "    const guide = csp2Guide;"
assert s.count(a2) == 1
s = s.replace(a2, b2)

a3 = "  const ranAny = entrants.length > 0;"
b3 = """  const ranAny = entrants.length > 0;
  // 省线随本卷难度浮动（难卷降线、易卷抬线）
  const csp2Guide = { ...CSP2_GUIDE.S, lines: shiftLines(CSP2_GUIDE.S.lines, paperShiftOf(stage)) };"""
assert s.count(a3) == 1
s = s.replace(a3, b3)

s = s.replace("一等 ${guide.lines[0].min} 分（157 人）、二等 ${guide.lines[1].min} 分",
              "一等 ${csp2Guide.lines[0].min} 分（157 人）、二等 ${csp2Guide.lines[1].min} 分", 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
