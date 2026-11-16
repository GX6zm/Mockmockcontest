import fs from 'node:fs';

const mp = 'data/blog-roster-mapping.json';
const m = JSON.parse(fs.readFileSync(mp, 'utf8'));

const exists = m.mapping.some((r) => r.gameName === '孙可轩');
if (!exists) {
  m.mapping.push({
    abbr: 'Skx',
    luogu: 'FallInDream',
    uid: 1035594,
    blogGrade: '初二',
    gameName: '孙可轩',
    gameRealName: '孙可轩',
    gameGrade: '初二',
    quotes: 0,
    boundQuotes: 0,
    confidence: '用户确认',
    evidence: '用户 2026-11-16 确认：孙可轩 = FallInDream（洛谷 1035594，OIerDb 204692）；博客表里没有对应缩写，故按账号直接挂到游戏名。',
  });
}

// 陈和骏 / 张培楠 已有行，补上 OIerDb 依据
for (const row of m.mapping) {
  if (row.gameName === '陈和骏') {
    row.oierdb = 204668;
    row.evidence = `${row.evidence}；OIerDb 204668：CSP-S26 350（149/32643）、CSP-J25 400 全国第 1。`;
  }
  if (row.gameName === '张培楠') {
    row.oierdb = 170607;
    row.evidence = `${row.evidence}；OIerDb 170607：CSP-S26 219（3360/32643）。`;
  }
}

m.updatedAt = '2026-11-16';
fs.writeFileSync(mp, JSON.stringify(m, null, 2), 'utf8');
console.log('rows:', m.mapping.length, 'has skx:', m.mapping.some((r) => r.gameName === '孙可轩'));
