const fs = require('fs');
const p = 'src/FocusPanel.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "import { levelInfo, TOPIC_NAMES } from './game.ts';",
  "import { Fragment } from 'react';\nimport { levelInfo, TOPIC_NAMES } from './game.ts';"
);
const anchor = '                <div className="mt-1.5 space-y-1">';
const block = `                {finished && tr.branchName && (
                  <div className="mt-1 text-[8.5px] text-slate-500">
                    这题的正解：{tr.branchName}
                    {tr.altNames && tr.altNames.length > 0 ? \` · 也可以 \${tr.altNames.join(' / ')}\` : ''}
                  </div>
                )}

${anchor}`;
if (!s.includes(anchor)) throw new Error('anchor missing');
s = s.replace(anchor, block);
fs.writeFileSync(p, s, 'utf8');
console.log('ok', s.includes('也可以'), s.includes('Fragment'));
