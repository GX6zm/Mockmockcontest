import { YEAR_STAGES, stagePaperForYear, paperBaseProfile } from '../src/season.ts';

const ids = ['csp2', 'noip', 'wc', 'prov', 'apio', 'noi', 'cts', 'ioi'];
for (const id of ids) {
  const st = YEAR_STAGES.find((s) => s.id === id);
  if (!st) continue;
  const base = paperBaseProfile(id);
  console.log('== ' + id + '  历年同题位中位: ' + (base ? base.map((b) => b.toFixed(1)).join('/') : '无数据'));
  if (!base) continue;
  for (const [seed, years] of [[20261019, [2026, 2027, 2028]], [777, [2026, 2027, 2028]]]) {
    const parts = years.map((y) => {
      const p = stagePaperForYear(st, y, seed);
      return y + ': d' + p.paperD.join('/d') + ' 线浮动' + (p.paperShift >= 0 ? '+' : '') + p.paperShift;
    });
    console.log('  seed ' + seed + '  ' + parts.join('   '));
  }
}
