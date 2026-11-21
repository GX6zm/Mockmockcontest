// 把游戏里的「文字素材」导出成 JSON，给外部写手（Gemini）改写用。
// 用法：node scripts/dump_text.ts
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { QUOTES } from '../src/quotes.ts';
import { EVENT_DEFS } from '../src/events.ts';
import { TITLE_CHAINS, APPROACHES } from '../src/chains.ts';

const out = 'data/text-export';
mkdirSync(out, { recursive: true });

writeFileSync(`${out}/quotes.json`, JSON.stringify(QUOTES, null, 2), 'utf8');
writeFileSync(`${out}/events.json`, JSON.stringify(EVENT_DEFS, null, 2), 'utf8');
writeFileSync(`${out}/chains.json`, JSON.stringify(TITLE_CHAINS, null, 2), 'utf8');
writeFileSync(`${out}/approaches.json`, JSON.stringify(APPROACHES, null, 2), 'utf8');

// 中文文字量统计（粗略：按中文串字数）
function zhCount(s: string): number {
  const m = s.match(/[\u4e00-\u9fa5]/g);
  return m ? m.length : 0;
}
const rows: { file: string; literals: number; zhChars: number }[] = [];
for (const f of readdirSync('src')) {
  if (!/\.(ts|tsx)$/.test(f)) continue;
  const src = readFileSync(`src/${f}`, 'utf8');
  const lits = src.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  let chars = 0;
  let n = 0;
  for (const lit of lits) {
    const c = zhCount(lit);
    if (c > 0) { chars += c; n += 1; }
  }
  rows.push({ file: f, literals: n, zhChars: chars });
}
rows.sort((a, b) => b.zhChars - a.zhChars);
writeFileSync(`${out}/zh-volume.csv`, 'file,zh_literals,zh_chars\n' + rows.map((r) => `${r.file},${r.literals},${r.zhChars}`).join('\n'), 'utf8');
console.log('quotes', QUOTES.length, 'events', EVENT_DEFS.length, 'titles', Object.keys(TITLE_CHAINS).length);
console.log(rows.slice(0, 12).map((r) => `${r.file}: ${r.zhChars}`).join('\n'));
