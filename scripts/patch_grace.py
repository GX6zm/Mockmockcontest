import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

a = """  if (year > max) {
    // 游戏里的未来年份：按顺序轮换历年真题，保证每年考卷都不一样
    return table[years[(year - min) % years.length]];
  }"""
b = """  if (year > max) {
    // 最近一届还没考（比如 2026 的 NOIP）就沿用上一年的卷子
    if (year === max + 1) return table[max];
    // 更远的未来年份：按顺序轮换历年真题，保证每年考卷都不一样
    return table[years[(year - min) % years.length]];
  }"""
assert s.count(a) == 1
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
