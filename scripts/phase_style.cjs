const fs = require('fs');
const p = 'src/FocusPanel.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  '<div className="text-[8px] tracking-wider text-slate-600 pt-1">\n                                  {ph === \'early\' ? \'前期 · 读懂题、找性质\' : \'后期 · 落地、卡复杂度\'}\n                                </div>',
  '<div className="flex items-center gap-1.5 pt-1.5 pb-0.5">\n                                  <span className="text-[8px] tracking-[0.15em] text-slate-400/80">\n                                    {ph === \'early\' ? \'前期 · 读懂题、找性质\' : \'后期 · 落地、卡复杂度\'}\n                                  </span>\n                                  <span className="h-px flex-1 bg-slate-700/40" />\n                                </div>'
);
fs.writeFileSync(p, s, 'utf8');
console.log('phase style', s.includes('前期 · 读懂题、找性质'));
