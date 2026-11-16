import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

a = """  const years = Object.keys(table).map(Number);
  const len = table[years[0]].length;
  const out: number[] = [];
  for (let i = 0; i < len; i += 1) out.push(median(years.map((y) => table[y][i])));
  return out;"""
b = """  const years = Object.keys(table).map(Number).sort((x, y) => x - y);
  const len = table[years[0]].length;
  const out: number[] = [];
  for (let i = 0; i < len; i += 1) {
    // 近年权重更大：难度有逐年走高的趋势，不能把 2019 和 2026 等权平均
    let sum = 0;
    let wsum = 0;
    years.forEach((y, k) => {
      const w = k + 1;
      sum += table[y][i] * w;
      wsum += w;
    });
    out.push(sum / wsum);
  }
  return out;"""
assert s.count(a) == 1
s = s.replace(a, b)

a2 = """  const base = paperBaseProfile(stage.id);
  if (!base || base.length !== stage.levels.length * stage.days) return stage;"""
b2 = """  const base = paperBaseProfile(stage.id);
  const perDay = stage.levels.length;
  if (!base || base.length !== perDay * stage.days) return stage;"""
assert s.count(a2) == 1
s = s.replace(a2, b2)

a3 = """    levels: ds.map(colorOfD),"""
b3 = """    // 多试赛事：levels 是「每天几题」，ranges 才是两试拼起来的总表
    levels: ds.slice(0, perDay).map(colorOfD),"""
assert s.count(a3) == 1
s = s.replace(a3, b3)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
