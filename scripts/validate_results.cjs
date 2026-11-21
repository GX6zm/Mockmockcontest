// 校验写手交回的 results（扁平 key → 新文字），对照 brief。
// 用法：node scripts/validate_results.cjs data/text-export/brief-batch-1-events.json data/text-export/results-batch-1.json
const fs = require('fs');

const [briefPath, resultsPath] = process.argv.slice(2);
if (!briefPath || !resultsPath) {
  console.error('用法: node scripts/validate_results.cjs <brief.json> <results.json>');
  process.exit(2);
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const brief = readJson(briefPath);
const results = readJson(resultsPath);

const flat = results.results ?? results;
const items = brief.batches.flatMap((b) => b.items);
const errors = [];
const warns = [];
const missing = [];
const extra = [];

const BAD = ['让我们一起', '在这个旅程中', '值得注意的是', '总而言之', '让我们', '玩家', '你会'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function chLen(s) {
  return [...s].length;
}

for (const it of items) {
  const v = flat[it.key];
  if (typeof v !== 'string' || v.trim() === '') {
    missing.push(it.key);
    continue;
  }
  const n = chLen(v);
  if (n > it.limit) errors.push(`超字数 ${n}>${it.limit}: ${it.key} 「${v}」`);
  if (n < 6) warns.push(`过短(${n}): ${it.key} 「${v}」`);
  for (const b of BAD) if (v.includes(b)) errors.push(`禁用词「${b}」: ${it.key}`);
  if (EMOJI.test(v)) errors.push(`含 emoji: ${it.key}`);
  if (/[「」]{0}$/.test(v) === false && /["']/.test(v)) warns.push(`含引号: ${it.key} 「${v}」`);
}
for (const k of Object.keys(flat)) {
  if (!items.some((it) => it.key === k)) extra.push(k);
}

console.log(`条数: brief ${items.length} / results ${Object.keys(flat).length}`);
if (missing.length) console.log(`缺失 ${missing.length} 条:\n  ` + missing.slice(0, 20).join('\n  '));
if (extra.length) console.log(`多余 ${extra.length} 条:\n  ` + extra.slice(0, 20).join('\n  '));
if (errors.length) console.log(`错误 ${errors.length} 条:\n  ` + errors.slice(0, 40).join('\n  '));
if (warns.length) console.log(`提示 ${warns.length} 条:\n  ` + warns.slice(0, 20).join('\n  '));

const ok = missing.length === 0 && extra.length === 0 && errors.length === 0;
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
