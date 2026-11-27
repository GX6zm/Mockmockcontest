// ===== 赛后复盘：居中双栏工作台（消灭左右贴边中间黑洞） =====
import { useState } from 'react';
import { FocusPanel } from './FocusPanel.tsx';
import type { Contest, Student } from './types.ts';
import { Ic } from './ui.tsx';

function summaryOf(st: Student, ioi: boolean): { real: number; est: number; delta: number } {
  let real = 0;
  let est = 0;
  for (const ps of st.problems) {
    if (ps.attempts.length === 0) continue;
    const eff = !ioi
      ? ps.attempts[ps.attempts.length - 1]
      : ps.attempts.reduce((best, cur) => (cur.score >= best.score ? cur : best), ps.attempts[0]);
    real += eff.score;
    est += eff.est;
  }
  return { real, est, delta: real - est };
}

export function ReviewOverlay({ round, onClose }: { round: Contest; onClose: () => void }) {
  const ioi = round.config.format === 'ioi';
  const rows = round.students
    .map((s) => ({ s, ...summaryOf(s, ioi) }))
    .sort((a, b) => b.real - a.real);
  const [sel, setSel] = useState<number>(rows[0]?.s.id ?? 0);
  const student = round.students.find((s) => s.id === sel) ?? rows[0]?.s;
  if (!student) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl h-[86vh] ui-panel border border-white/15 grid md:grid-cols-[240px_1fr] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-r border-white/10 bg-[#0a0e16] flex flex-col min-h-0">
          <div className="px-3.5 py-2.5 border-b border-white/10 bg-[#0d121b]">
            <div className="text-[13px] font-bold text-white flex items-center gap-1.5">
              <Ic n="brain" size={14} /> 赛后复盘 · 思维链
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              点选手切换，右侧展开全部题目的思路与挂分原因
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {rows.map(({ s, real, delta }, idx) => {
              const active = s.id === sel;
              return (
                <button
                  key={s.id}
                  data-testid={`review-${s.name}`}
                  onClick={() => setSel(s.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors border-b border-white/[0.04] ${
                    active ? 'ui-row-selected text-white font-bold' : 'text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="w-5 font-mono text-[11px] text-slate-400">{idx + 1}</span>
                  <span className="truncate flex-1">{s.name}</span>
                  <span className="font-mono text-slate-100">{Math.round(real)}</span>
                  {!ioi && delta !== 0 && (
                    <span className={`font-mono text-[10.5px] ${delta < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            className="m-2.5 ui-btn-ghost py-1.5 text-[12px]"
          >
            关掉复盘
          </button>
        </div>
        <div className="min-h-0 h-full overflow-hidden">
          <FocusPanel contest={round} student={student} onClose={onClose} embedded />
        </div>
      </div>
    </div>
  );
}
