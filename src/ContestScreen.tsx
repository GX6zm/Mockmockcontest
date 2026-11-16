import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  TOPIC_COLORS,
  TOPIC_NAMES,
  estimateRankMap,
  formatTime,
  levelInfo,
  phaseColor,
  phaseLabel,
  problemEstimate,
  tick,
  totalEstimate,
} from './game.ts';
import { loadGrowth, profileOf } from './growth.ts';
import { buildContestFeed, FEED_TONE } from './contestFeed.ts';
import { FocusPanel } from './FocusPanel.tsx';
import type { Contest, Problem, Student } from './types.ts';
import { Ic } from './ui.tsx';

// ===== 比赛进行中 =====
export function ContestScreen({ contest, onFinish }: { contest: Contest; onFinish: () => void }) {
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [, setFrame] = useState(0);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  speedRef.current = speed;
  pausedRef.current = paused;
  onFinishRef.current = onFinish;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    // 后台标签页里 requestAnimationFrame 会被浏览器停掉，比赛时钟跟着冻住，
    // 只剩按钮能手动推进、却永远等不到收卷。所以额外挂一个低频定时器兜底。
    const step = (now: number) => {
      const dtReal = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !contest.isFinished) {
        tick(contest, dtReal * speedRef.current * 60);
      }
      setFrame((f) => (f + 1) % 100000);
      if (contest.isFinished && !finishedRef.current) {
        finishedRef.current = true;
        onFinishRef.current();
        return false;
      }
      return true;
    };
    const loop = (now: number) => {
      if (!step(now)) return;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const fallback = window.setInterval(() => {
      if (document.hidden) step(performance.now());
    }, 200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(fallback);
    };
  }, [contest]);

  const ranks = estimateRankMap(contest);
  const sorted = contest.students.slice().sort((a, b) => totalEstimate(b) - totalEstimate(a));
  const remain = Math.max(0, contest.duration - contest.timeElapsed);
  const progress = Math.min(1, contest.timeElapsed / contest.duration);
  const avgEst = contest.students.length
    ? Math.round(contest.students.reduce((a, s) => a + totalEstimate(s), 0) / contest.students.length)
    : 0;
  const topEst = contest.students.reduce((a, s) => Math.max(a, totalEstimate(s)), 0);
  const submittedCells = contest.students.reduce(
    (a, s) => a + s.problems.filter((p) => p.submissions > 0).length,
    0,
  );
  // 实况每分钟重算一次，不跟着每一帧闪；只读引擎状态，不消耗随机数
  const minuteKey = Math.floor(contest.timeElapsed / 60);
  const feed = useMemo(() => buildContestFeed(contest), [contest, minuteKey]);
  // 题数多的时候把格子压窄，保证 10 题也能一屏放下
  const cellW = contest.problems.length >= 9 ? 32 : contest.problems.length >= 7 ? 38 : 46;

  // 赛前 Rating：默认取成长存档，没打过就是校 OJ 换算的初始分
  const ratings = useMemo(() => {
    const g = loadGrowth();
    return new Map(contest.students.map((s) => [s.id, profileOf(g, s.name).rating]));
  }, [contest]);
  const avgRating = Math.round(
    [...ratings.values()].reduce((a, b) => a + b, 0) / Math.max(1, ratings.size),
  );

  return (
    <div className="min-h-screen bg-[#08090c] text-slate-200 p-2.5">
      <header data-testid="contest-screen" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/20 bg-[#0d1116]/85 px-3 py-2 mb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-black text-white">OI 模拟赛</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">估分榜</span>
          <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400 ui-live'}`} />
          <span className="text-[11px] text-slate-400">{paused ? '已暂停' : '进行中'}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-mono text-lg font-bold text-white leading-none">{formatTime(contest.timeElapsed)}</div>
            <div className="text-[9px] text-slate-500 mt-0.5">剩余 {formatTime(remain)}</div>
          </div>
          <div className="w-36">
            <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress * 100}%`, background: progress > 0.8 ? '#ff6f72' : progress > 0.5 ? '#ffc24d' : '#c8f135' }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
              paused ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-amber-600/90 hover:bg-amber-500 text-white'
            }`}
          >
            {paused ? <><Ic n="play" /> 继续</> : <><Ic n="pause" /> 暂停</>}
          </button>
          <div className="flex rounded-lg bg-slate-800 p-0.5">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                title={`${s}x：1 秒现实时间 = ${s * 60} 秒比赛时间`}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                  speed === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-slate-800 p-0.5">
            <button
              onClick={() => tick(contest, 600)}
              title="快进 10 分钟比赛时间"
              className="px-2 py-0.5 rounded text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <Ic n="fastForward" /> +10 分
            </button>
            <button
              onClick={() => {
                const left = Math.max(0, contest.duration - contest.timeElapsed);
                const step = 1800;
                // 分段推进，避免一次性步数过多
                for (let t = 0; t < left; t += step) tick(contest, Math.min(step, left - t));
              }}
              title="直接跳到收卷（结果与自然播完完全一致）"
              data-testid="finish-paper"
              className="px-2 py-0.5 rounded text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <Ic n="skipForward" /> 到收卷
            </button>
          </div>
        </div>
      </header>

      <div className="mb-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[10.5px] text-amber-200/90">
        <Ic n="alert" /> 赛中没有任何评测结果。榜上的 <b className="font-bold">≈分数</b> 是选手自己的估计，不是真实成绩；赛后统一出分，可能挂分或反挂分。
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-2.5">
        <section className="xl:col-span-3 rounded-xl border border-indigo-500/15 bg-[#0d1116]/70 overflow-hidden">
          <div className="flex items-center px-3 py-1.5 bg-[#0b0e13] border-b border-slate-700/50 text-[10px] text-slate-400 font-medium">
            <div className="w-8 text-center">#</div>
            <div className="w-40 flex items-center gap-1">
              选手<span className="text-slate-600 font-normal">· Rating</span>
            </div>
            <div className="px-2" style={{ width: contest.problems.length * (cellW + 2) + 16 }}>
              题目估分
            </div>
            <div className="flex-1" />
            <div className="w-14 text-right">估分</div>
            <div className="w-28 text-right">状态</div>
          </div>
          <div className="max-h-[calc(100vh-190px)] overflow-y-auto">
            {sorted.map((st) => (
              <StudentRow
                key={st.id}
                student={st}
                rank={ranks.get(st.id) || 0}
                problems={contest.problems}
                cellW={cellW}
                rating={ratings.get(st.id) ?? 1500}
                onFocus={() => setFocusId(st.id)}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-2.5">
          <div className="rounded-xl border border-indigo-500/15 bg-[#0d1116]/70 p-2.5">
            <h3 className="text-[11px] font-bold text-slate-300 mb-1.5"><Ic n="clipboard" /> 题目</h3>
            <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
              {contest.problems.map((p, i) => (
                <ProblemCard key={p.id} problem={p} index={i} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/15 bg-[#0d1116]/70 p-2.5">
            <h3 className="text-[11px] font-bold text-slate-300 mb-1.5"><Ic n="chart" /> 统计</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <Stat label="总提交" value={`${contest.submissions.length}`} />
              <Stat label="已交题" value={`${submittedCells}`} />
              <Stat label="平均估分" value={`≈${avgEst}`} />
              <Stat label="最高估分" value={`≈${topEst}`} />
              <Stat label="人均提交" value={`${(contest.submissions.length / contest.students.length).toFixed(1)} 次`} />
              <Stat label="剩余时间" value={formatTime(remain)} />
              <Stat label="平均 Rating" value={`${avgRating}`} />
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-[#0d1116]/70 p-2.5">
            <h3 className="text-[11px] font-bold text-slate-300 mb-1.5"><Ic n="mic" /> 赛场实况</h3>
            <div className="h-44 overflow-y-auto bg-black/30 rounded-md px-2 py-1.5 space-y-1.5">
              {feed.length === 0 ? (
                <div className="text-slate-600 text-[10px] text-center py-6">选手还在通读题面…</div>
              ) : feed.map((f, i) => (
                <div key={`${f.name}-${i}`} className="text-[10px] leading-snug border-b border-slate-800/60 pb-1">
                  <span className="text-slate-500">{f.name}</span>
                  <span className="mx-1 text-slate-700">·</span>
                  <span className={FEED_TONE[f.tone]}>{f.text}</span>
                </div>
              ))}
            </div>
            <div className="text-[9px] text-slate-600 mt-1">取材于真实游记：开题、卡题、止损、补暴力、最后十分钟</div>
          </div>

          <div className="rounded-xl border border-indigo-500/15 bg-[#0d1116]/70 p-2.5">
            <h3 className="text-[11px] font-bold text-slate-300 mb-1.5"><Ic n="radio" /> 提交动态</h3>
            <div className="h-40 overflow-y-auto bg-black/30 rounded-md px-1.5 py-1">
              {contest.submissions.length === 0 ? (
                <div className="text-slate-600 text-[10px] text-center py-6">还没有人交代码…</div>
              ) : (
                contest.submissions
                  .slice(-30)
                  .reverse()
                  .map((s, i) => (
                    <div key={`${s.studentId}-${s.problemId}-${s.nth}-${i}`} className="flex items-center gap-1.5 text-[10px] py-[2px] border-b border-slate-800/60">
                      <span className="text-slate-600 font-mono w-11 shrink-0">{formatTime(s.time).slice(0, 5)}</span>
                      <span className="text-slate-300 w-16 truncate">{s.studentName}</span>
                      <span className="text-slate-500">P{s.problemId + 1}</span>
                      <span className="ml-auto text-[9px] text-slate-600">第 {s.nth} 次</span>
                    </div>
                  ))
              )}
            </div>
            <div className="text-[9px] text-slate-600 mt-1">只显示"谁交了"，不显示结果</div>
          </div>
        </aside>
      </div>

      {focusId !== null && (() => {
        const st = contest.students.find((s) => s.id === focusId);
        return st ? <FocusPanel contest={contest} student={st} onClose={() => setFocusId(null)} /> : null;
      })()}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 font-mono">{value}</span>
    </div>
  );
}

function ProblemCard({ problem, index }: { problem: Problem; index: number }) {
  const L = levelInfo(problem.level);
  const c = L.color;
  const tc = TOPIC_COLORS[problem.topic];
  return (
    <div className="rounded-lg border p-1.5" style={{ borderColor: c + '55', backgroundColor: c + '0d' }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-300">
          P{index + 1} · {problem.title}
        </span>
        <span
          className="text-[9px] font-bold px-1 rounded whitespace-nowrap"
          style={{ color: L.ink, backgroundColor: c + '33' }}
          title={L.en}
        >
          {L.name}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] px-1 rounded-full" style={{ color: tc, backgroundColor: tc + '22' }}>
          {TOPIC_NAMES[problem.topic]}
        </span>
        <span className="text-[9px] text-slate-500">{problem.submitCount} 次提交</span>
      </div>
      <div className="flex gap-0.5 mt-1">
        {problem.subtasks.map((s, i) => (
          <span key={i} className="flex-1 text-center text-[8px] py-[1px] rounded bg-slate-800/80 text-slate-500">
            {s.points}
          </span>
        ))}
      </div>
    </div>
  );
}

function StudentRow({
  student: st,
  rank,
  problems,
  cellW,
  rating,
  onFocus,
}: {
  student: Student;
  rank: number;
  problems: Problem[];
  cellW: number;
  rating: number;
  onFocus: () => void;
}) {
  const current = st.currentProblem;
  const done = st.finished;
  const phase = done ? 'done' : st.phase;
  const pc = phaseColor(phase);

  return (
    <div className={`flex items-center px-3 py-[5px] border-b border-slate-800/50 text-[11px] ${rank <= 3 && st.totalSubmissions > 0 ? 'bg-amber-400/[0.04]' : ''}`}>
      <div className="w-8 text-center font-mono text-[10px] text-slate-400">
        {st.totalSubmissions === 0 ? '—' : rank <= 3 && rank > 0 ? <span className="ui-rank" data-r={rank}>{rank}</span> : rank}
      </div>
      <div className="w-40 flex items-center gap-1 overflow-hidden pr-1">
        <button
          onClick={onFocus}
          title="看他的思路"
          data-testid={`focus-${st.name}`}
          className="text-slate-200 font-medium truncate text-left hover:text-indigo-300 hover:underline decoration-dotted underline-offset-2 transition-colors"
        >
          {st.name}
        </button>
        <span className="ml-auto font-mono text-[9px] text-slate-500 shrink-0" title="当前 Rating">
          {rating}
        </span>
      </div>
      <div className="flex gap-0.5 px-2" style={{ width: problems.length * (cellW + 2) + 16 }}>
        {problems.map((_, i) => {
          const est = problemEstimate(st, i);
          const ps = st.problems[i];
          const active = current === i;
          return (
            <div
              key={i}
              className={`relative h-6 rounded flex items-center justify-center font-mono font-bold transition-all ${
                cellW >= 38 ? 'text-[10px]' : 'text-[9px]'
              } ${active ? 'ring-1 ring-white/50' : ''}`}
              style={{
                width: cellW,
                backgroundColor: est === null ? '#ffffff08' : '#ffffff12',
                color: est === null ? '#3b4a63' : '#e2e8f0',
                border: active ? `1px solid ${pc}` : '1px solid rgba(148,163,184,0.14)',
              }}
              title={`P${i + 1} ${ps.submissions} 次提交`}
            >
              {est === null ? (active ? '…' : '—') : `≈${est}`}
              {ps.submissions > 1 && (
                <span className="absolute -top-1 -right-1 text-[7px] px-[3px] rounded bg-slate-700 text-slate-300 leading-[9px]">
                  {ps.submissions}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex-1" />
      <div className="w-14 text-right font-mono font-bold text-slate-100">
        {st.totalSubmissions === 0 ? <span className="text-slate-600">—</span> : `≈${totalEstimate(st)}`}
      </div>
      <div className="w-28 flex justify-end">
        {done ? (
          <span className="text-[10px] text-emerald-400/80">收工</span>
        ) : (
          <div className="flex flex-col items-end w-full">
            <span className="text-[9px]" style={{ color: pc }}>
              {phaseLabel(phase)}
              {current !== null ? ` · P${current + 1}` : ''} {Math.round(st.phaseProgress * 100)}%
            </span>
            <div className="w-16 h-1 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${st.phaseProgress * 100}%`, backgroundColor: pc }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#08090c] text-slate-200 p-4">{children}</div>;
}
