import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

a = """  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const past = years.filter((y) => y <= year);
  if (past.length) return table[past[past.length - 1]];
  const span = years[years.length - 1] - years[0] + 1;
  const idx = ((year - years[0]) % span + span) % span;
  return table[years[Math.min(years.length - 1, idx)]];"""
b = """  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const min = years[0];
  const max = years[years.length - 1];
  if (year > max) {
    // 游戏里的未来年份：按顺序轮换历年真题，保证每年考卷都不一样
    return table[years[(year - min) % years.length]];
  }
  const past = years.filter((y) => y <= year);
  return table[past[past.length - 1]];"""
assert s.count(a) == 1
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
