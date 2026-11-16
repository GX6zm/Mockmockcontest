import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

a = """  const rng = makeRng((seed * 7919 + year * 104729 + 12345) >>> 0);
  const bias = Math.max(-1.3, Math.min(1.3, paperGauss(rng) * 0.6));"""
b = """  // 每场赛事用各自的随机流：同一年里不同比赛不会一起“全简单/全难”
  let h = 2166136261;
  for (const ch of stage.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = makeRng((seed * 7919 + year * 104729 + (h >>> 0) + 12345) >>> 0);
  const bias = Math.max(-1, Math.min(1, paperGauss(rng) * 0.5));"""
assert s.count(a) == 1
s = s.replace(a, b)

a2 = """  // 每难 1 档 ≈ 400 分制下掉 28 分；按本场满分缩放，再取整到 5 分
  const shift = Math.round(((baseAvg - avg) * 28 * (full / 400)) / 5) * 5;"""
b2 = """  // 每难 1 档 ≈ 400 分制下掉 24 分；按本场满分缩放，浮动上限 ±8%（再取整到 5 分）
  const raw = (baseAvg - avg) * 24 * (full / 400);
  const cap = full * 0.08;
  const shift = Math.round(Math.max(-cap, Math.min(cap, raw)) / 5) * 5;"""
assert s.count(a2) == 1
s = s.replace(a2, b2)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
