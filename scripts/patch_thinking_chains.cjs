const fs = require('fs');
const p = 'src/thinking.ts';
let s = fs.readFileSync(p, 'utf8');
const startMarker = '// ---------- 题目级覆盖 ----------';
const endMarker = '/** 题目没被单独覆盖时，用带题名的泛化句子';
const a = s.indexOf(startMarker);
const b = s.indexOf(endMarker);
if (a < 0 || b < 0 || b < a) {
  console.error('markers not found', a, b);
  process.exit(1);
}
const replacement =
  '// ---------- 题目级覆盖 ----------\n' +
  '// 题库里很多题直接用算法命名（快速幂、生成函数、LCT 维护……），\n' +
  '// 按知识点随机抽句子会露馅。题目专属链统一放在 chains.ts，这里只负责取用。\n' +
  'import { TITLE_CHAINS } from \'./chains.ts\';\n\n';
s = s.slice(0, a) + replacement + s.slice(b);
// import 必须放在文件顶部区（TS 允许中间 import，但为了整洁仍移到顶部）
s = s.replace(replacement, '// ---------- 题目级覆盖 ----------\n// 题目专属链统一放在 chains.ts，这里只负责取用。\n\n');
const firstImportEnd = s.indexOf('\n', s.indexOf('import ')) + 1;
if (!s.includes("from './chains.ts'")) {
  s = s.slice(0, firstImportEnd) + "import { TITLE_CHAINS } from './chains.ts';\n" + s.slice(firstImportEnd);
}
fs.writeFileSync(p, s, 'utf8');
console.log('patched, hasLocalTable=', /const TITLE_CHAINS: Record/.test(s), 'len=', s.length);
