const fs = require('fs');

const cp = 'src/CoachScreen.tsx';
let s = fs.readFileSync(cp, 'utf8');
s = s.replace(
  '    index: number;\n    est: Record<string, number>;\n  } | null>(null);',
  '    index: number;\n    est: Record<string, number>;\n    review?: Contest;\n  } | null>(null);'
);
s = s.replace('            round={watch.rounds[0]}', '            round={watch.review}');
s = s.replace(
  '            onDone={(est) => setWatch((w) => (w ? { ...w, est: { ...w.est, ...est }, index: w.index + 1 } : w))}',
  '            onDone={(est, contest) => setWatch((w) => (w ? { ...w, est: { ...w.est, ...est }, index: w.index + 1, review: contest } : w))}'
);
s = s.replace(
  '  round: ContestRound; onDone: (est: Record<string, number>) => void; onSkip: () => void;',
  '  round: ContestRound; onDone: (est: Record<string, number>, contest: Contest) => void; onSkip: () => void;'
);
s = s.replace('    onDone(est);', '    onDone(est, contest);');
s = s.replace('<Ic n="route" />', '<Ic n="brain" />');
fs.writeFileSync(cp, s, 'utf8');
console.log('coach ok', s.includes('review: contest'), s.includes('n="brain"'));

const rp = 'src/ReviewOverlay.tsx';
let r = fs.readFileSync(rp, 'utf8');
r = r.replace('ps.attempts.at(-1)?.score', 'ps.attempts[ps.attempts.length - 1]?.score');
fs.writeFileSync(rp, r, 'utf8');
console.log('review ok', r.includes('attempts[ps.attempts.length - 1]'));
