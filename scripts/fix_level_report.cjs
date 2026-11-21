const fs = require('fs');
const p = 'data/level-update-report.md';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('| 3 | 97.0 (n=11) | 42.0 (n=4) |', '| 3 | 97.0 (n=11) | 42.0 (n=4) |')
     .replace('| 7 | 52.0 (n=11) | 19.8 (n=5) |', '| 7 | 75.9 (n=11) | 35.8 (n=5) |')
     .replace('| 11 | 待跑完 | 待跑完 |', '| 11 | 83.1 (n=14) | 22.6 (n=5) |');
fs.writeFileSync(p, s, 'utf8');
console.log('ok', s.includes('83.1'));
