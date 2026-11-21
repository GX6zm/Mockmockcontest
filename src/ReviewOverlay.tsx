// ===== 赛后复盘：把已经跑完的这场比赛重新打开看思路 =====
//
// 比赛一结束 ContestScreen 就被卸载，FocusPanel 也跟着消失。
// 这里直接复用 FocusPanel（contest.isFinished 为 true 时它会展开整条链）。

import { useState } from 'react';
import { FocusPanel } from './FocusPanel.tsx';
import type { Contest, Student } from './types.ts';

function scoreOf(st: Student): number {
  return st.problems.reduce((sum, ps) => sum + (ps.attempts[ps.attempts.length - 1]?.score ?? 0), 0);
}

export function ReviewOverlay({ round, onClose }: { round: Contest; onClose: () => void }) {
  const [sel, setSel] = useState<number>(round.students[0]?.id ?? 0);
  const student = round.students.find((s) => s.id === sel) ?? round.students[0];
  if (!student) return null;
  const rows = round.students
    .map((s) => ({ s, total: scoreOf(s) }))
    .sort((a, b) => b.total - a.total);

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-40 w-[340px] bg-[#0b0e13]/98 border-r border-slate-700/60 flex flex-col">
        <div className="px-3 py-2 border-b border-slate-700/60">
          <div className="text-[12px] font-bold text-white">赛后复盘 · 整条思路链</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            点选手名字，看他每题走到了哪一步；比赛里没收着的步骤现在都展开
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {rows.map(({ s, total }) => (
            <button
              key={s.id}
              data-testid={`review-${s.name}`}
              onClick={() => setSel(s.id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] transition ${
                s.id === sel ? 'bg-indigo-500/15 text-white' : 'text-slate-300 hover:bg-slate-700/30'
              }`}
            >
              <span className="truncate flex-1">{s.name}</span>
              <span className="tabular-nums text-slate-400">{total}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="m-2 rounded-md border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700/40"
        >
          关掉复盘
        </button>
      </div>
      <FocusPanel contest={round} student={student} onClose={onClose} />
    </>
  );
}
