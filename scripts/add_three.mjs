import fs from 'node:fs';

const p = 'src/levels.ts';
let s = fs.readFileSync(p, 'utf8');

const add1 = "  '陈和骏': { ability: 83.4, growth: 58, grade: 2, src: 'CSP-S26 350（149/32643）/ J25 400 全国第 1' },\n";
const add2 = "  '张培楠': { ability: 53.1, growth: 48, grade: 4, src: 'CSP-S26 219（3360/32643）/ S25 213' },\n"
  + "  '孙可轩': { ability: 53.0, growth: 53, grade: 4, src: 'CSP-S26 218（3395/32643）/ J25 400 全国第 1' },\n";

if (!s.includes("'陈和骏'")) s = s.replace("  '丁一宸':", add1 + "  '丁一宸':");
if (!s.includes("'张培楠'")) s = s.replace("  '陈怡嘉':", add2 + "  '陈怡嘉':");

fs.writeFileSync(p, s, 'utf8');
console.log('levels.ts updated:', s.includes("'陈和骏'"), s.includes("'张培楠'"), s.includes("'孙可轩'"));

// mapping json: record user-provided account corrections
const mp = 'data/blog-roster-mapping.json';
const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
m.userCorrections = m.userCorrections || [];
const notes = [
  '陈和骏 = Stuart220_Chen（洛谷 1337513，OIerDb 204668，CSP-S26 350 全国 149）',
  '张培楠 = The_Wandering_Earth（洛谷 809165，OIerDb 170607，CSP-S26 219 全国 3360）',
  '孙可轩 = FallInDream（洛谷 1035594，OIerDb 204692，CSP-S26 218 全国 3395）',
];
for (const n of notes) if (!m.userCorrections.includes(n)) m.userCorrections.push(n);
m.updatedAt = '2026-11-16';
fs.writeFileSync(mp, JSON.stringify(m, null, 2), 'utf8');
console.log('mapping rows:', (m.mapping || []).length, 'corrections:', m.userCorrections.length);
