// ===== 聚焦面板：看某一位选手在比赛里「怎么想的」 =====
//
// 只读视图：不消耗随机数、不改引擎状态，完全由 contest 的当前状态推导。
// 支持两种形态：
// - embedded=false（默认）：观战期间右侧抽屉
// - embedded=true：赛后复盘弹窗右侧宽屏 2 列网格

import { Fragment } from 'react';
import { isIoiFormat, levelInfo, TOPIC_NAMES } from './game.ts';
import type { Attempt, Contest, ProblemState, Student } from './types.ts';
import { kindName, tracesForStudent, type TracedStep } from './thinking.ts';
import { Ic } from './ui.tsx';

const STATUS_STYLE: Record<TracedStep['status'], { dot: string; text: string; label: string }> = {
  got: { dot: 'bg-emerald-400', text: 'text-slate-100', label: '想到了' },
  misled: { dot: 'bg-rose-400', text: 'text-rose-200', label: '走了错路' },
  missed: { dot: 'bg-slate-500', text: 'text-slate-400', label: '没往这想' },
  pending: { dot: 'bg-slate-600', text: 'text-slate-400', label: '还没想到' },
};

function effectiveOf(ps: ProblemState, ioi: boolean): Attempt | undefined {
  if (!ps.attempts.length) return undefined;
  if (!ioi) return ps.attempts[ps.attempts.length - 1];
  return ps.attempts.reduce((best, cur) => (cur.score >= best.score ? cur : best), ps.attempts[0]);
}

export function FocusPanel({
  contest,
  student,
  onClose,
  embedded = false,
}: {
  contest: Contest;
  student: Student;
  onClose: () => void;
  embedded?: boolean;
}) {
  const minutes = contest.duration / 60;
  const nowMin = contest.timeElapsed / 60;
  const finished = contest.isFinished;
  const ioi = isIoiFormat(contest);
  const traces = tracesForStudent(student, contest.problems, minutes, ioi);

  const inner = (
    <div className={embedded ? 'flex flex-col h-full bg-[#0b0f17]' : 'absolute inset-y-0 right-0 w-full max-w-[480px] pointer-events-auto flex flex-col bg-[#0b0f17] border-l border-white/15'}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-[#0d121b]">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--mood-accent)' }} />
        <span className="text-[13px] font-bold text-white truncate">{student.name}</span>
        <span className="text-[11.5px] text-slate-400">的思维链</span>
        <button
          onClick={onClose}
          data-testid="focus-close"
          className="ml-auto ui-btn-ghost w-7 h-7 flex items-center justify-center text-slate-300"
          title="关闭"
        >
          <Ic n="x" size={14} />
        </button>
      </div>

      <div className="px-4 pt-2 pb-1.5 text-[11px] text-slate-400 border-b border-white/[0.06]">
        {finished
          ? '赛后复盘：整条思维链与真实得分/挂分原因已全部展开。'
          : '比赛中只展开他已经走过的步骤，没走到的先收着。'}
      </div>

      <div className={`flex-1 overflow-y-auto p-3 ${embedded ? 'grid lg:grid-cols-2 gap-2.5 content-start' : 'space-y-2.5'}`}>
        {contest.problems.map((p, i) => {
          const tr = traces[i];
          const ps = student.problems[i];
          const eff = effectiveOf(ps, ioi);
          const L = levelInfo(p.level);
          const c = L.color;
          const active = student.currentProblem === i;
          const revealedAll = finished || ps.attempts.length > 0;
          const delta = eff ? eff.score - eff.est : 0;

          return (
            <div
              key={p.id}
              className="border p-3 bg-[#0f141e]/90"
              style={{ borderColor: active ? c + 'aa' : c + '45' }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-slate-100">
                  P{i + 1} · {p.title}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 font-bold shrink-0"
                  style={{ color: L.ink, backgroundColor: c + '28' }}
                >
                  {L.name}
                </span>
                <span className="text-[10.5px] ml-auto font-medium" style={{ color: L.ink }}>
                  {TOPIC_NAMES[p.topic]}
                </span>
              </div>

              {(finished || (ioi && ps.attempts.length > 0)) && (tr.usedBranchName ?? tr.branchName) && (
                <div className="mt-1.5 text-[11px] text-slate-300">
                  做法：{tr.usedBranchName ?? tr.branchName}
                  {finished && tr.altNames && tr.altNames.length > 0 ? <span className="text-slate-400"> · 也可 {tr.altNames.join(' / ')}</span> : ''}
                </div>
              )}

              <div className="mt-2 space-y-1.5">
                {(() => {
                  const touched =
                    finished ||
                    ps.attempts.length > 0 ||
                    (student.currentProblem === i && ps.phase !== 'idle');
                  const visible = touched ? tr.steps.filter((s) => finished || s.minute <= nowMin) : [];
                  if (visible.length === 0) {
                    return (
                      <div className="flex items-center gap-2 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                        <span className="text-[11.5px] text-slate-400">还没轮到这题</span>
                      </div>
                    );
                  }
                  const rest = tr.steps.length - visible.length;
                  const thinkingNow =
                    !finished && active && touched && ps.phase !== 'idle' && rest > 0 ? tr.steps[visible.length] : null;
                  let lastPhase: string | undefined;
                  return (
                    <>
                      {visible.map((s, j) => {
                        const style = STATUS_STYLE[s.status];
                        const ph = s.step.phase;
                        const showPhase = ph && ph !== lastPhase;
                        lastPhase = ph ?? lastPhase;
                        return (
                          <Fragment key={j}>
                            {showPhase && (
                              <div className="flex items-center gap-2 pt-1.5 pb-0.5">
                                <span className="text-[10px] tracking-[0.12em] text-slate-300 font-medium">
                                  {ph === 'early' ? '前期 · 读懂题、找性质' : '后期 · 落地、卡复杂度'}
                                </span>
                                <span className="h-px flex-1 bg-white/10" />
                              </div>
                            )}
                            <div className="flex items-start gap-2 leading-snug">
                              <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                              <div className="min-w-0">
                                <div className={`text-[12px] ${style.text}`}>{s.step.text}</div>
                                <div className="text-[10.5px] text-slate-400 mt-0.5">
                                  {kindName(s.step.kind)}
                                  {s.step.complexity ? ` · ${s.step.complexity}` : ''} · 第 {s.minute} 分钟
                                  {s.status === 'got'
                                    ? ' · 想到了'
                                    : s.status === 'missed'
                                      ? ' · 没往这想'
                                      : s.status === 'misled'
                                        ? ' · 走了错路'
                                        : ''}
                                </div>
                              </div>
                            </div>
                          </Fragment>
                        );
                      })}
                      {thinkingNow && (
                        <div className="flex items-start gap-2 bg-amber-500/12 border border-amber-400/35 px-2.5 py-1.5">
                          <span className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 bg-amber-300 ui-live" />
                          <div className="min-w-0">
                            <div className="text-[12px] text-amber-100">现在在想：{thinkingNow.step.text}</div>
                            <div className="text-[10.5px] text-amber-200/80 mt-0.5">
                              第 {visible.length + 1}/{tr.steps.length} 步 · {kindName(thinkingNow.step.kind)}
                            </div>
                          </div>
                        </div>
                      )}
                      {rest > 0 && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                          <span className="text-[11px] text-slate-400">后面还有 {rest} 步，赛后展开</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {tr.trapHit && (revealedAll || tr.steps[1]?.minute <= nowMin) && (
                <div className="mt-2 text-[11px] text-rose-200 border-l-2 border-rose-400 pl-2">
                  走偏：{tr.trapHit.text}
                </div>
              )}

              {(finished || (ioi && ps.attempts.length > 0)) && tr.landing && (
                <div
                  data-testid={`landing-${i}`}
                  className={`mt-2 text-[11px] border-l-2 px-2 py-1 ${
                    tr.landing.tone === 'bad'
                      ? 'border-rose-400 bg-rose-500/10 text-rose-200'
                      : tr.landing.tone === 'warn'
                        ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                        : 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  <span className="font-bold mr-1">考场落地：</span>
                  {tr.landing.text}
                </div>
              )}

              {finished ? (
                <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-400">最终</span>
                    <span className="text-[12px] font-mono font-bold text-white">
                      {eff ? (ioi ? `${eff.score} 分` : `估 ${eff.est} → 实 ${eff.score}`) : '0 分'}
                    </span>
                    {!ioi && eff && delta !== 0 && (
                      <span className={`text-[10.5px] ${delta < 0 ? 'ui-badge-drop' : 'ui-badge-gain'}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                    {eff?.reason && (
                      <span className={`text-[11px] ${delta < 0 ? 'text-rose-300' : delta > 0 ? 'text-emerald-300' : 'text-slate-300'}`}>
                        {eff.reason}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">{tr.summary}</div>
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-slate-400">
                  {ps.attempts.length > 0 ? '交过题了，还在改' : ps.phase === 'thinking' ? '正在推思路…' : ps.phase === 'coding' ? '正在写代码…' : '还没动手'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2 border-t border-white/10 text-[11px] text-slate-400 flex items-center gap-1.5 bg-[#0d121b]">
        <Ic n="eye" size={12} /> 思维链用于实时观察与赛后复盘，不改变任何比赛结果
      </div>
    </div>
  );

  if (embedded) return inner;
  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {inner}
    </div>
  );
}
