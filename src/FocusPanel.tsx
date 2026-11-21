// ===== 聚焦面板：看某一位选手在比赛里「怎么想的」 =====
//
// 只读视图：不消耗随机数、不改引擎状态，完全由 contest 的当前状态推导。
// 链本身来自 thinking.ts（题目侧固定，选手侧的断点由真实得分倒推）。

import { Fragment } from 'react';
import { levelInfo, TOPIC_NAMES } from './game.ts';
import type { Contest, Student } from './types.ts';
import { kindName, tracesForStudent, type TracedStep } from './thinking.ts';
import { Ic } from './ui.tsx';

const STATUS_STYLE: Record<TracedStep['status'], { dot: string; text: string; label: string }> = {
  got: { dot: 'bg-emerald-400', text: 'text-slate-200', label: '想到了' },
  misled: { dot: 'bg-rose-400', text: 'text-rose-200/90', label: '想歪了' },
  missed: { dot: 'bg-slate-600', text: 'text-slate-500', label: '没想到' },
  pending: { dot: 'bg-slate-700', text: 'text-slate-600', label: '还没想到' },
};

export function FocusPanel({
  contest,
  student,
  onClose,
}: {
  contest: Contest;
  student: Student;
  onClose: () => void;
}) {
  const minutes = contest.duration / 60;
  const nowMin = contest.timeElapsed / 60;
  const finished = contest.isFinished;
  const traces = tracesForStudent(student, contest.problems, minutes);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div className="absolute inset-y-0 right-0 w-full max-w-[460px] pointer-events-auto flex flex-col bg-[#0b0e13]/97 border-l border-indigo-500/25 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/60">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          <span className="text-[12px] font-bold text-white truncate">{student.name}</span>
          <span className="text-[10px] text-slate-500">的思维链</span>
          <button
            onClick={onClose}
            data-testid="focus-close"
            className="ml-auto w-6 h-6 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 flex items-center justify-center"
            title="关闭"
          >
            ×
          </button>
        </div>

        <div className="px-3 pt-1.5 pb-1 text-[9.5px] text-slate-600">
          {finished
            ? '赛后复盘：整条链都已展开，可以对照他最后拿了多少分。'
            : '比赛中只展开他已经走过的步骤，没走到的先收着。'}
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 pb-6 space-y-2">
          {contest.problems.map((p, i) => {
            const tr = traces[i];
            const ps = student.problems[i];
            const L = levelInfo(p.level);
            const c = L.color;
            const active = student.currentProblem === i;
            // 没交过题时，只露出他开头的那一步
            const revealedAll = finished || ps.attempts.length > 0;
            return (
              <div
                key={p.id}
                className="rounded-lg border p-2"
                style={{ borderColor: active ? c + '99' : c + '33', backgroundColor: c + '0a' }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-200">
                    P{i + 1} · {p.title}
                  </span>
                  <span
                    className="text-[8.5px] px-1 rounded font-bold"
                    style={{ color: L.ink, backgroundColor: c + '33' }}
                  >
                    {L.name}
                  </span>
                  <span className="text-[8.5px] px-1 rounded-full ml-auto" style={{ color: c }}>
                    {TOPIC_NAMES[p.topic]}
                  </span>
                </div>

                {finished && tr.branchName && (
                  <div className="mt-1 text-[8.5px] text-slate-500">
                    这题的正解：{tr.branchName}
                    {tr.altNames && tr.altNames.length > 0 ? ` · 也可以 ${tr.altNames.join(' / ')}` : ''}
                  </div>
                )}

                <div className="mt-1.5 space-y-1">
                  {(() => {
                    // 还没动过这题（没交过、也不在做），就什么思路都不该露出来
                    const touched =
                      finished ||
                      ps.attempts.length > 0 ||
                      (student.currentProblem === i && ps.phase !== 'idle');
                    const visible = touched ? tr.steps.filter((s) => finished || s.minute <= nowMin) : [];
                    if (visible.length === 0) {
                      return (
                        <div className="flex items-center gap-1.5 opacity-40">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                          <span className="text-[10px] text-slate-600">还没轮到这题</span>
                        </div>
                      );
                    }
                    const rest = tr.steps.length - visible.length;
                    // 他此刻正在啃的那一步：比赛里给个「现在在想」的活口
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
                                <div className="flex items-center gap-1.5 pt-1.5 pb-0.5">
                                  <span className="text-[8px] tracking-[0.15em] text-slate-400/80">
                                    {ph === 'early' ? '前期 · 读懂题、找性质' : '后期 · 落地、卡复杂度'}
                                  </span>
                                  <span className="h-px flex-1 bg-slate-700/40" />
                                </div>
                              )}
                              <div className="flex items-start gap-1.5 leading-snug">
                                <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                                <div className="min-w-0">
                                  <div className={`text-[10.5px] ${style.text}`}>{s.step.text}</div>
                                  <div className="text-[8.5px] text-slate-600">
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
                          <div className="flex items-start gap-1.5 rounded-md bg-amber-400/10 border border-amber-400/20 px-1.5 py-1">
                            <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 bg-amber-300 animate-pulse" />
                            <div className="min-w-0">
                              <div className="text-[10.5px] text-amber-200/90">现在在想：{thinkingNow.step.text}</div>
                              <div className="text-[8.5px] text-amber-300/50">
                                第 {visible.length + 1}/{tr.steps.length} 步 · {kindName(thinkingNow.step.kind)}
                              </div>
                            </div>
                          </div>
                        )}
                        {rest > 0 && (
                          <div className="flex items-center gap-1.5 opacity-40">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                            <span className="text-[10px] text-slate-600">后面还有 {rest} 步，赛后展开</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {tr.trapHit && (revealedAll || tr.steps[1]?.minute <= nowMin) && (
                  <div className="mt-1.5 text-[9px] text-rose-300/80 border-l-2 border-rose-500/40 pl-1.5">
                    走偏：{tr.trapHit.text}
                  </div>
                )}

                {finished ? (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-700/40 flex items-center gap-2">
                    <span className="text-[9px] text-slate-500">这题最终</span>
                    <span className="text-[10px] font-mono font-bold text-slate-200">{tr.score} 分</span>
                    <span className="text-[9px] text-slate-600 truncate">{tr.summary}</span>
                  </div>
                ) : (
                  <div className="mt-1.5 text-[9px] text-slate-600">
                    {ps.attempts.length > 0 ? '交过题了，还在改' : ps.phase === 'thinking' ? '正在读题…' : '还没动手'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-3 py-1.5 border-t border-slate-700/60 text-[9px] text-slate-600 flex items-center gap-1">
          <Ic n="eye" /> 思维链是赛后复盘用的，不改变任何比赛结果
        </div>
      </div>
    </div>
  );
}
