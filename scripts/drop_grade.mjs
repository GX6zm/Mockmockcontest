import fs from 'node:fs';
const p = 'src/levels.ts';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replace("'张培楠': { ability: 53.1, growth: 48, grade: 4, src:", "'张培楠': { ability: 53.1, growth: 48, src:");
s = s.replace("'孙可轩': { ability: 53.0, growth: 53, grade: 4, src:", "'孙可轩': { ability: 53.0, growth: 53, src:");
fs.writeFileSync(p, s, 'utf8');
console.log('changed:', before !== s, 'stillGrade4:', s.includes('grade: 4'));
