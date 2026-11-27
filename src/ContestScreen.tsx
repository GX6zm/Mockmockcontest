import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  TOPIC_COLORS,
  TOPIC_NAMES,
  estimateRankMap,
  formatTime,
  isIoiFormat,
  levelInfo,
  phaseColor,
  phaseLabel,
  problemEstimate,
  tick,
  totalEstimate,
} from './game.ts';
import { loadGrowth, profileOf } from './growth.ts';
import { buildContestFeed, buildContestMilestones, FEED_TONE } from './contestFeed.ts';
import { FocusPanel } from './FocusPanel.tsx';
import type { ContestGuideLine } from './season.ts';
import { kindName, tracesForStudent } from './thinking.ts';
import type { Contest, Phase, Problem, Student } from './types.ts';
import { Ic, motionFull } from './ui.tsx';

type CellFxKind = 'ac' | 'gain' | 'wa' | 'tle' | 're' | 'seal' | 'rework' | 'restore';

interface CellFx {
  kind: CellFxKind;
  label: string;
  until: number;
  seq: number;
}

interface RankShift {
  delta: number;
  until: number;
}

interface RecentAction {
  studentId: number;
  studentName: string;
  problemId: number;
  atReal: number;
  kind: CellFxKind;
  caption: string;
  tone: 'good' | 'sky' | 'amber' | 'rose';
}

interface PrevProblemSnap {
  subs: number;
  bestScore: number;
  debugRounds: number;
}

const ROW_H = 44;
const DIVIDER_H = 30;

const PIPELINE_STEPS: { id: Phase; label: string }[] = [
  { id: 'survey', label: '通读' },
  { id: 'reading', label: '读题' },
  { id: 'thinking', label: '思考' },
  { id: 'coding', label: '编码' },
  { id: 'testing', label: '对拍' },
  { id: 'deciding', label: '交卷' },
];

const LINE_TONE_STYLE: Record<ContestGuideLine['tone'], { border: string; badge: string; text: string }> = {
  gold: {
    border: 'border-amber-400/45',
    badge: 'bg-amber-400/18 text-amber-200 border-amber-400/45',
    text: 'text-amber-200',
  },
  prov1: {
    border: 'border-amber-500/40',
    badge: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
    text: 'text-amber-200',
  },
  team: {
    border: 'border-rose-400/45',
    badge: 'bg-rose-500/18 text-rose-200 border-rose-400/45',
    text: 'text-rose-200',
  },
  silver: {
    border: 'border-sky-400/40',
    badge: 'bg-sky-500/15 text-sky-200 border-sky-400/35',
    text: 'text-sky-200',
  },
  bronze: {
    border: 'border-orange-500/40',
    badge: 'bg-orange-500/15 text-orange-200 border-orange-500/35',
    text: 'text-orange-200',
  },
};

const CONFETTI_OFFSETS: { dx: string; color: string; left: string }[] = [
  { dx: '-28px', color: '#50cf9e', left: '16%' },
  { dx: '-14px', color: '#eab454', left: '26%' },
  { dx: '12px', color: '#56c2d4', left: '38%' },
  { dx: '26px', color: '#b8df4a', left: '50%' },
  { dx: '-20px', color: '#f5ca79', left: '62%' },
  { dx: '18px', color: '#7de2ba', left: '74%' },
  { dx: '-10px', color: '#eb737c', left: '84%' },
  { dx: '24px', color: '#eab454', left: '91%' },
];

// ===== 比赛进行中（统一赛时顶栏 + 对齐实时榜单 + 折叠式导播台 + 分栏侧边栏） =====
export function ContestScreen({
  contest,
  onFinish,
  onSkip,
  teamNames,
  opvName,
  guideLines,
  roundLabel,
}: {
  contest: Contest;
  onFinish: () => void;
  onSkip?: () => void;
  teamNames?: string[];
  opvName?: string | null;
  guideLines?: ContestGuideLine[];
  roundLabel?: string;
}) {
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const [autoSlowMo, setAutoSlowMo] = useState(true);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [autoDirector, setAutoDirector] = useState(true);
  const [lockedFocusId, setLockedFocusId] = useState<number | null>(null);
  const [drawerStudentId, setDrawerStudentId] = useState<number | null>(null);
  const [boardFilter, setBoardFilter] = useState<'all' | 'team'>('all');
  const [showGuideLines, setShowGuideLines] = useState(true);
  const [sideTab, setSideTab] = useState<'feed' | 'subs' | 'problems'>('feed');
  const [feedTab, setFeedTab] = useState<'live' | 'milestones'>('live');
  const [, setFrame] = useState(0);
  const confettiSeqRef = useRef(0);

  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const autoSlowMoRef = useRef(autoSlowMo);
  const slowMoUntilRef = useRef(0);
  const slowMoCooldownRef = useRef<Set<string>>(new Set());
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);

  // 轻量前端状态差分快照（不写回 Contest，100% 不影响结算结果）
  const prevSnapRef = useRef<Map<string, PrevProblemSnap>>(new Map());
  const prevRankRef = useRef<Map<number, number>>(new Map());
  const cellFxRef = useRef<Map<string, CellFx>>(new Map());
  const rankShiftRef = useRef<Map<number, RankShift>>(new Map());
  const recentActionRef = useRef<RecentAction | null>(null);
  const autoPickHoldRef = useRef<{ id: number; until: number }>({ id: -1, until: 0 });
  const fxSeqRef = useRef(1);

  const boardBodyRef = useRef<HTMLDivElement | null>(null);
  const committedIdsRef = useRef<number[]>([]);
  const lastOrderCommitRef = useRef(0);
  const prevElapsedRef = useRef(contest.timeElapsed);
  const prevFilterRef = useRef(boardFilter);
  const prevShowGuideLinesRef = useRef(showGuideLines);
  const prevRowYRef = useRef<Map<number, number>>(new Map());
  const rowMotionRef = useRef<Map<number, { dir: 'up' | 'down'; until: number }>>(new Map());
  const prevLineTeamAboveRef = useRef<Map<string, number>>(new Map());
  const linePulseUntilRef = useRef<Map<string, number>>(new Map());

  speedRef.current = speed;
  pausedRef.current = paused;
  autoSlowMoRef.current = autoSlowMo;
  onFinishRef.current = onFinish;

  const teamSet = useMemo(() => new Set(teamNames ?? []), [teamNames]);
  const ioi = isIoiFormat(contest);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dtReal = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !contest.isFinished) {
        const inSlowMo = autoSlowMoRef.current && speedRef.current > 1 && now < slowMoUntilRef.current;
        const effSpeed = inSlowMo ? 1 : speedRef.current;
        tick(contest, dtReal * effSpeed * 60);
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

  const nowReal = typeof performance !== 'undefined' ? performance.now() : 0;
  const ranks = estimateRankMap(contest);
  const sorted = contest.students
    .slice()
    .sort((a, b) => totalEstimate(b, ioi) - totalEstimate(a, ioi) || a.id - b.id);

  // 逐帧差分检测：提交判题特效、对拍返工、排名超车角标与慢放触发（纯读 contest）
  for (const st of contest.students) {
    const isSquad = teamSet.size === 0 || teamSet.has(st.name) || st.name === opvName;
    const curRank = ranks.get(st.id) || 0;
    const prevRank = prevRankRef.current.get(st.id);
    if (st.totalSubmissions > 0 && prevRank !== undefined && prevRank > 0 && curRank > 0 && prevRank !== curRank) {
      rankShiftRef.current.set(st.id, {
        delta: prevRank - curRank,
        until: nowReal + 3200,
      });
    }
    if (st.totalSubmissions > 0) {
      prevRankRef.current.set(st.id, curRank);
    }

    // 关键主角进入犹豫提交时触发一次短暂 1x 推镜慢放（每题限一次，不卡进度）
    if (
      autoSlowMo &&
      speed > 1 &&
      isSquad &&
      st.currentProblem !== null &&
      (st.phase === 'deciding' || st.phase === 'fixing')
    ) {
      const cdKey = `${st.id}#${st.currentProblem}#${st.phase}`;
      if (!slowMoCooldownRef.current.has(cdKey)) {
        slowMoCooldownRef.current.add(cdKey);
        slowMoUntilRef.current = Math.max(slowMoUntilRef.current, nowReal + 1600);
      }
    }

    st.problems.forEach((ps, pid) => {
      const key = `${st.id}#${pid}`;
      const prev = prevSnapRef.current.get(key);
      const curBest = ps.attempts.reduce((m, a) => Math.max(m, a.score), 0);
      if (!prev) {
        prevSnapRef.current.set(key, {
          subs: ps.submissions,
          bestScore: curBest,
          debugRounds: ps.debugRounds,
        });
        return;
      }

      if (ps.submissions > prev.subs && ps.attempts.length > 0) {
        const att = ps.attempts[ps.attempts.length - 1];
        const seq = fxSeqRef.current++;
        if (ioi) {
          if (att.score >= 100) {
            cellFxRef.current.set(key, { kind: 'ac', label: 'AC', until: nowReal + 2800, seq });
            if (isSquad) {
              recentActionRef.current = {
                studentId: st.id,
                studentName: st.name,
                problemId: pid,
                atReal: nowReal,
                kind: 'ac',
                caption: `评测返回 AC 100 · P${pid + 1} 全测试点通过！`,
                tone: 'good',
              };
              if (prev.bestScore < 100 && motionFull()) {
                confettiSeqRef.current += 1;
              }
              if (autoSlowMo && speed > 1) {
                slowMoUntilRef.current = Math.max(slowMoUntilRef.current, nowReal + 1600);
              }
            }
          } else if (att.score > prev.bestScore) {
            const gain = Math.round(att.score - prev.bestScore);
            cellFxRef.current.set(key, { kind: 'gain', label: `+${gain}↑`, until: nowReal + 2500, seq });
            if (isSquad) {
              recentActionRef.current = {
                studentId: st.id,
                studentName: st.name,
                problemId: pid,
                atReal: nowReal,
                kind: 'gain',
                caption: `评测返回 ${Math.round(att.score)} 分（较前次 +${gain} ↑）· P${pid + 1}`,
                tone: 'sky',
              };
            }
          } else if (att.reason.startsWith('TLE')) {
            cellFxRef.current.set(key, { kind: 'tle', label: 'TLE', until: nowReal + 2600, seq });
            if (isSquad) {
              recentActionRef.current = {
                studentId: st.id,
                studentName: st.name,
                problemId: pid,
                atReal: nowReal,
                kind: 'tle',
                caption: `评测受阻：${att.reason}（P${pid + 1} · ${Math.round(att.score)} 分）`,
                tone: 'amber',
              };
            }
          } else if (att.reason.startsWith('RE')) {
            cellFxRef.current.set(key, { kind: 're', label: 'RE', until: nowReal + 2600, seq });
            if (isSquad) {
              recentActionRef.current = {
                studentId: st.id,
                studentName: st.name,
                problemId: pid,
                atReal: nowReal,
                kind: 're',
                caption: `运行错误：${att.reason}（P${pid + 1}）`,
                tone: 'rose',
              };
            }
          } else {
            cellFxRef.current.set(key, { kind: 'wa', label: 'WA', until: nowReal + 2600, seq });
            if (isSquad) {
              recentActionRef.current = {
                studentId: st.id,
                studentName: st.name,
                problemId: pid,
                atReal: nowReal,
                kind: 'wa',
                caption: `评测未拿满：${att.reason}（P${pid + 1} · ${Math.round(att.score)} 分）`,
                tone: 'rose',
              };
            }
          }
        } else {
          // OI 盲测赛制：严格保密真分，突出封存归档与保底切换仪式感
          const switchedBrute =
            att.mode === 'brute' && ps.attempts.length > 1 && ps.attempts.some((a) => a.mode === 'full');
          if (switchedBrute) {
            cellFxRef.current.set(key, { kind: 'restore', label: '保底', until: nowReal + 2600, seq });
            if (isSquad) {
              recentActionRef.current = {
                studentId: st.id,
                studentName: st.name,
                problemId: pid,
                atReal: nowReal,
                kind: 'restore',
                caption: `P${pid + 1} 撤回激进正解，重新封存暴力保底版（自估 ≈${Math.round(att.est)}）`,
                tone: 'amber',
              };
            }
          } else {
            cellFxRef.current.set(key, { kind: 'seal', label: '封存', until: nowReal + 2300, seq });
            if (isSquad) {
              recentActionRef.current = {
                studentId: st.id,
                studentName: st.name,
                problemId: pid,
                atReal: nowReal,
                kind: 'seal',
                caption: `代码已封存归档 · P${pid + 1} 第 ${att.nth} 次提交（自估 ≈${Math.round(att.est)}）`,
                tone: att.est >= 100 ? 'good' : 'amber',
              };
              if (autoSlowMo && speed > 1 && att.est >= 80) {
                slowMoUntilRef.current = Math.max(slowMoUntilRef.current, nowReal + 1500);
              }
            }
          }
        }
      } else if (ps.debugRounds > prev.debugRounds) {
        const seq = fxSeqRef.current++;
        cellFxRef.current.set(key, {
          kind: 'rework',
          label: `返工×${ps.debugRounds}`,
          until: nowReal + 2600,
          seq,
        });
        if (isSquad) {
          recentActionRef.current = {
            studentId: st.id,
            studentName: st.name,
            problemId: pid,
            atReal: nowReal,
            kind: 'rework',
            caption: `对拍报警！P${pid + 1} 拍出第 ${ps.debugRounds} 处反例，正在紧急返工修 Bug`,
            tone: 'rose',
          };
        }
      }

      prevSnapRef.current.set(key, {
        subs: ps.submissions,
        bestScore: curBest,
        debugRounds: ps.debugRounds,
      });
    });
  }

  // 自动导播：优先聚焦正在犹豫提交 / 修锅 / 刚交题 / 我队头名或 OP 主角，并加驻留防抖
  const focusedStudent: Student | null = (() => {
    if (!contest.students.length) return null;
    if (!autoDirector && lockedFocusId !== null) {
      return contest.students.find((s) => s.id === lockedFocusId) ?? sorted[0] ?? null;
    }
    const recent = recentActionRef.current;
    if (recent && nowReal - recent.atReal < 2400) {
      const target = contest.students.find((s) => s.id === recent.studentId);
      if (target) {
        autoPickHoldRef.current = { id: target.id, until: nowReal + 2800 };
        return target;
      }
    }
    const pool = teamSet.size > 0
      ? sorted.filter((s) => teamSet.has(s.name) || s.name === opvName)
      : sorted.slice(0, Math.min(8, sorted.length));
    const candidates = pool.length > 0 ? pool : sorted;

    let best = candidates[0];
    let bestWeight = -1;
    for (let idx = 0; idx < candidates.length; idx += 1) {
      const s = candidates[idx];
      let w = (candidates.length - idx) * 2;
      if (s.name === opvName) w += 18;
      if (s.phase === 'deciding') w += 110;
      else if (s.phase === 'fixing' || s.phase === 'restoring') w += 95;
      else if (s.phase === 'testing' && s.currentProblem !== null && (s.problems[s.currentProblem]?.debugRounds ?? 0) > 0) {
        w += 80;
      } else if (s.phase === 'coding') {
        w += 25;
      }
      if (w > bestWeight) {
        bestWeight = w;
        best = s;
      }
    }

    if (bestWeight < 80 && nowReal < autoPickHoldRef.current.until) {
      const held = candidates.find((s) => s.id === autoPickHoldRef.current.id);
      if (held) return held;
    }
    if (best && best.id !== autoPickHoldRef.current.id) {
      autoPickHoldRef.current = { id: best.id, until: nowReal + 3200 };
    }
    return best ?? sorted[0] ?? null;
  })();

  const remain = Math.max(0, contest.duration - contest.timeElapsed);
  const progress = Math.min(1, contest.timeElapsed / contest.duration);
  const avgEst = contest.students.length
    ? Math.round(contest.students.reduce((a, s) => a + totalEstimate(s, ioi), 0) / contest.students.length)
    : 0;
  const topEst = contest.students.reduce((a, s) => Math.max(a, totalEstimate(s, ioi)), 0);
  const submittedCells = contest.students.reduce(
    (a, s) => a + s.problems.filter((p) => p.submissions > 0).length,
    0,
  );
  const minuteKey = Math.floor(contest.timeElapsed / 60);
  const feed = useMemo(() => buildContestFeed(contest), [contest, minuteKey]);
  const milestones = useMemo(
    () => buildContestMilestones(contest),
    [contest, minuteKey, contest.submissions.length],
  );

  // 预计算每题实时满分/提交人数，供表头与题目页共用
  const problemStats = contest.problems.map((_, i) => {
    let fullCnt = 0;
    let partCnt = 0;
    let subUsers = 0;
    for (const st of contest.students) {
      const est = problemEstimate(st, i, ioi);
      if (est !== null) {
        subUsers += 1;
        if (est >= 100) fullCnt += 1;
        else if (est > 0) partCnt += 1;
      }
    }
    return { fullCnt, partCnt, subUsers };
  });

  const ratings = useMemo(() => {
    const g = loadGrowth();
    return new Map(contest.students.map((s) => [s.id, profileOf(g, s.name).rating]));
  }, [contest]);
  const avgRating = Math.round(
    [...ratings.values()].reduce((a, b) => a + b, 0) / Math.max(1, ratings.size),
  );

  const sortedGuideLines = useMemo(
    () => (guideLines ?? []).slice().sort((a, b) => b.score - a.score),
    [guideLines],
  );

  const activeBreaking = milestones.find((m) => contest.timeElapsed - m.time <= 25 * 60) ?? null;
  const inSlowMo = !paused && autoSlowMo && speed > 1 && nowReal < slowMoUntilRef.current;
  const teamCount = contest.students.filter((s) => teamSet.has(s.name) || s.name === opvName).length;
  const manyProblems = contest.problems.length >= 7;

  // 固定行高 GPU 轨道几何与防抖节拍
  const moveDurationMs = speed >= 4 ? 240 : speed >= 2 ? 380 : 460;
  const throttleMs = speed >= 4 ? 260 : 320;
  const manualJump = Math.abs(contest.timeElapsed - prevElapsedRef.current) > 120;
  prevElapsedRef.current = contest.timeElapsed;

  const liveIds = sorted.map((s) => s.id);
  const orderChanged =
    committedIdsRef.current.length !== liveIds.length ||
    liveIds.some((id, idx) => committedIdsRef.current[idx] !== id);
  if (
    committedIdsRef.current.length !== liveIds.length ||
    !motionFull() ||
    paused ||
    manualJump ||
    (orderChanged && nowReal - lastOrderCommitRef.current >= throttleMs)
  ) {
    committedIdsRef.current = liveIds;
    lastOrderCommitRef.current = nowReal;
  }

  const studentById = new Map(contest.students.map((s) => [s.id, s]));
  const visualSorted = committedIdsRef.current
    .map((id) => studentById.get(id))
    .filter((s): s is Student => Boolean(s));

  const visualDisplayedRows =
    boardFilter === 'team' && teamSet.size > 0
      ? visualSorted.filter((s) => teamSet.has(s.name) || s.name === opvName)
      : visualSorted;

  const visualRanks = new Map<number, number>();
  {
    let curR = 0;
    let prevSc = Infinity;
    let seenSub = 0;
    for (const s of visualSorted) {
      if (s.totalSubmissions === 0) {
        visualRanks.set(s.id, 0);
        continue;
      }
      seenSub += 1;
      const sc = totalEstimate(s, ioi);
      if (sc < prevSc) {
        curR = seenSub;
        prevSc = sc;
      }
      visualRanks.set(s.id, curR);
    }
  }

  // 计算每行（含参考线）绝对轨道纵坐标
  const filterChanged = prevFilterRef.current !== boardFilter || prevShowGuideLinesRef.current !== showGuideLines;
  prevFilterRef.current = boardFilter;
  prevShowGuideLinesRef.current = showGuideLines;
  if (filterChanged) {
    prevRowYRef.current.clear();
    rowMotionRef.current.clear();
  }

  let cursorY = 0;
  let summaryY: number | null = null;
  if (showGuideLines && contest.submissions.length === 0 && sortedGuideLines.length > 0) {
    summaryY = 0;
    cursorY += DIVIDER_H;
  }

  const linePosMap = new Map<string, { y: number; allAbove: number; teamAbove: number }>();
  const studentPosMap = new Map<number, number>();
  const renderedLines = new Set<number>();

  const countAbove = (lineScore: number) => {
    let allAbove = 0;
    let teamAbove = 0;
    for (const s of visualSorted) {
      if (s.totalSubmissions > 0 && totalEstimate(s, ioi) >= lineScore) {
        allAbove += 1;
        if (teamSet.has(s.name)) teamAbove += 1;
      }
    }
    return { allAbove, teamAbove };
  };

  for (const st of visualDisplayedRows) {
    const stScore = st.totalSubmissions > 0 ? totalEstimate(st, ioi) : -1;
    if (showGuideLines && contest.submissions.length > 0) {
      sortedGuideLines.forEach((gl, gi) => {
        if (!renderedLines.has(gi) && stScore < gl.score) {
          renderedLines.add(gi);
          const { allAbove, teamAbove } = countAbove(gl.score);
          const prevTeamAbove = prevLineTeamAboveRef.current.get(gl.label);
          if (prevTeamAbove !== undefined && teamAbove > prevTeamAbove) {
            linePulseUntilRef.current.set(gl.label, nowReal + 1800);
          }
          prevLineTeamAboveRef.current.set(gl.label, teamAbove);
          linePosMap.set(gl.label, { y: cursorY, allAbove, teamAbove });
          cursorY += DIVIDER_H;
        }
      });
    }
    studentPosMap.set(st.id, cursorY);
    cursorY += ROW_H;
  }

  if (showGuideLines && contest.submissions.length > 0) {
    sortedGuideLines.forEach((gl, gi) => {
      if (!renderedLines.has(gi)) {
        renderedLines.add(gi);
        const { allAbove, teamAbove } = countAbove(gl.score);
        const prevTeamAbove = prevLineTeamAboveRef.current.get(gl.label);
        if (prevTeamAbove !== undefined && teamAbove > prevTeamAbove) {
          linePulseUntilRef.current.set(gl.label, nowReal + 1800);
        }
        prevLineTeamAboveRef.current.set(gl.label, teamAbove);
        linePosMap.set(gl.label, { y: cursorY, allAbove, teamAbove });
        cursorY += DIVIDER_H;
      }
    });
  }

  const totalTrackH = Math.max(ROW_H, cursorY);

  if (!manualJump) {
    for (const [sid, newY] of studentPosMap) {
      const oldY = prevRowYRef.current.get(sid);
      if (oldY !== undefined && oldY !== newY) {
        rowMotionRef.current.set(sid, {
          dir: newY < oldY ? 'up' : 'down',
          until: nowReal + moveDurationMs + 220,
        });
      }
      prevRowYRef.current.set(sid, newY);
    }
  } else {
    for (const [sid, newY] of studentPosMap) {
      prevRowYRef.current.set(sid, newY);
    }
    rowMotionRef.current.clear();
  }

  const probMinW = manyProblems ? 54 : 68;
  const gridCols = `56px minmax(148px, 1.35fr) repeat(${contest.problems.length}, minmax(${probMinW}px, 1fr)) 82px 144px`;
  const boardMinWidth = 56 + 148 + contest.problems.length * (manyProblems ? 56 : 72) + 82 + 144;

  const handleLockStudent = (sid: number) => {
    setLockedFocusId(sid);
    setAutoDirector(false);
    setSpotlightOpen(true);
  };

  return (
    <div className="text-slate-200 pb-6 pt-3">
      {/* 单一统一赛时控制顶栏 */}
      <header
        data-testid="contest-screen"
        className="ui-panel-hero relative overflow-hidden flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 mb-2.5"
      >
        {confettiSeqRef.current > 0 && motionFull() && (
          <div key={confettiSeqRef.current} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {CONFETTI_OFFSETS.map((c, idx) => (
              <span
                key={idx}
                className="ui-confetti-piece absolute top-1 w-1.5 h-2.5"
                style={{ left: c.left, backgroundColor: c.color, '--dx': c.dx } as CSSProperties}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2.5 min-w-0">
          <span data-testid="coach-watch" className="text-[15px] font-black text-white truncate">
            {roundLabel ?? 'OI 模拟赛'}
          </span>
          <span
            title={
              ioi
                ? 'IOI 实时评测：立即返回 AC / WA / TLE / RE 真实得分，单题取历史最高分，无 freopen 爆零'
                : 'OI 盲测赛制：赛中无评测反馈，榜上 ≈分数 为选手自估；交题仅封存代码，赛后统一揭晓挂分或反挂'
            }
            className={`text-[10.5px] px-1.5 py-0.5 border font-bold shrink-0 cursor-help ${
              ioi
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
            }`}
          >
            {ioi ? 'IOI 实时榜' : 'OI 估分榜'}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${paused ? 'bg-amber-400' : 'bg-emerald-400 ui-live'}`} />
          <span className="text-[11.5px] text-slate-300 shrink-0">
            {paused ? '已暂停' : inSlowMo ? '1x 慢放' : '进行中'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-white leading-none">{formatTime(contest.timeElapsed)}</span>
            <span className="font-mono text-[11px] text-slate-400">剩余 {formatTime(remain)}</span>
          </div>
          <div className="w-32 sm:w-36 h-1.5 bg-slate-800 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${progress * 100}%`, background: progress > 0.8 ? '#eb737c' : progress > 0.5 ? '#eab454' : 'var(--mood-accent)' }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className={`px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
              paused ? 'ui-btn-primary' : 'ui-btn-ghost text-amber-200 border-amber-500/40'
            }`}
          >
            {paused ? <><Ic n="play" /> 继续</> : <><Ic n="pause" /> 暂停</>}
          </button>
          <div className="flex bg-slate-900 border border-white/10 p-0.5">
            {[1, 2, 4].map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSpeed(s)}
                title={`${s}x：1 秒现实时间 = ${s * 60} 秒比赛时间`}
                className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${
                  speed === s ? 'ui-btn-primary' : 'text-slate-300 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="flex bg-slate-900 border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => tick(contest, 600)}
              title="快进 10 分钟比赛时间"
              className="px-2 py-0.5 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Ic n="fastForward" /> +10 分
            </button>
            <button
              type="button"
              onClick={() => {
                const left = Math.max(0, contest.duration - contest.timeElapsed);
                const step = 1800;
                for (let t = 0; t < left; t += step) tick(contest, Math.min(step, left - t));
              }}
              title="直接跳到收卷（结果与自然播完完全一致）"
              data-testid="finish-paper"
              className="px-2 py-0.5 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Ic n="skipForward" /> 到收卷
            </button>
          </div>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              data-testid="coach-skip"
              className="ui-btn-ghost px-2.5 py-1 text-[11px] text-slate-300"
            >
              跳过观看
            </button>
          )}
        </div>
      </header>

      {/* 可折叠的顶部「导播聚焦台」：默认收起，点击任意选手或工具栏「导播台」打开 */}
      {spotlightOpen && focusedStudent && (
        <DirectorSpotlight
          contest={contest}
          student={focusedStudent}
          rank={ranks.get(focusedStudent.id) || 0}
          ioi={ioi}
          isTeam={teamSet.has(focusedStudent.name)}
          isOpv={focusedStudent.name === opvName}
          autoDirector={autoDirector}
          autoSlowMo={autoSlowMo}
          recentAction={
            recentActionRef.current &&
            recentActionRef.current.studentId === focusedStudent.id &&
            nowReal - recentActionRef.current.atReal < 2400
              ? recentActionRef.current
              : null
          }
          onToggleAuto={() => {
            if (!autoDirector) {
              setAutoDirector(true);
              setLockedFocusId(null);
            } else {
              setAutoDirector(false);
              setLockedFocusId(focusedStudent.id);
            }
          }}
          onToggleSlowMo={() => setAutoSlowMo((v) => !v)}
          onFocusLeader={() => {
            if (sorted[0]) handleLockStudent(sorted[0].id);
          }}
          onFocusTeamTop={() => {
            const topSquad = sorted.find((s) => teamSet.has(s.name) || s.name === opvName);
            if (topSquad) handleLockStudent(topSquad.id);
          }}
          onOpenDrawer={() => setDrawerStudentId(focusedStudent.id)}
          onCollapse={() => setSpotlightOpen(false)}
        />
      )}

      {/* 主区域：左侧对齐实时榜单 + 右侧分栏实况/提交/题目 */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 items-start">
        <section className="ui-panel overflow-hidden min-w-0">
          {/* 榜单筛选与功能工具栏 */}
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 border-b border-white/[0.07] bg-[#0b1018] text-[11.5px]">
            {teamSet.size > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBoardFilter('all')}
                  data-testid="board-filter-all"
                  className={`ui-pill ${boardFilter === 'all' ? 'ui-pill-active' : ''}`}
                >
                  全场 ({contest.students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBoardFilter('team')}
                  data-testid="board-filter-team"
                  className={`ui-pill ${boardFilter === 'team' ? 'ui-pill-active' : ''}`}
                >
                  只看我队 ({teamCount})
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSpotlightOpen((v) => !v)}
              data-testid={spotlightOpen ? 'toggle-spotlight' : 'reopen-spotlight'}
              className={`ui-pill ${spotlightOpen ? 'ui-pill-active' : ''}`}
              title="展开或收起顶部导播跟拍台"
            >
              <Ic n="eye" size={11} /> 导播台
            </button>

            {sortedGuideLines.length > 0 && (
              <button
                type="button"
                onClick={() => setShowGuideLines((v) => !v)}
                className={`ui-pill ${showGuideLines ? 'ui-pill-active' : ''}`}
                title="显示或隐藏实时目标分数参考线"
              >
                <Ic n="flag" size={11} /> 分数线
              </button>
            )}

            <div className="ml-auto hidden sm:flex items-center gap-3 text-[10.5px] text-slate-400">
              <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block bg-emerald-400" />100</span>
              <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block bg-sky-400" />50–99</span>
              <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block bg-amber-400" />1–49</span>
              <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block bg-rose-400" />0</span>
              <span className="text-slate-500 border-l border-white/10 pl-2.5 hidden lg:inline">点击跟拍 · 双击看思维链</span>
            </div>
          </div>

          {/* 固定行高 CSS Grid + GPU 平滑滑行轨道 */}
          <div className="max-h-[calc(100vh-185px)] overflow-auto">
            <div style={{ minWidth: boardMinWidth }}>
              <div
                role="row"
                className="sticky top-0 z-20 ui-table-head ui-board-grid-head grid items-center text-[11px] font-medium"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="text-center px-2 py-2.5">#</div>
                <div className="text-left px-2.5 py-2.5">选手</div>
                {contest.problems.map((p, i) => {
                  const L = levelInfo(p.level);
                  const psStat = problemStats[i];
                  return (
                    <div
                      key={p.id}
                      className="text-center px-1.5 py-2"
                      title={`P${i + 1} · ${p.title}（${L.name} · ${TOPIC_NAMES[p.topic]}）`}
                    >
                      <div className="inline-flex items-center justify-center gap-1 font-mono text-[11.5px] font-bold text-slate-100">
                        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: L.color }} />
                        <span>P{i + 1}</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 font-normal leading-tight">
                        {psStat.fullCnt}/{contest.students.length}
                      </div>
                    </div>
                  );
                })}
                <div className="text-right px-3 py-2.5">{ioi ? '总分' : '总估分'}</div>
                <div className="text-right px-3 py-2.5">当前状态</div>
              </div>

              <div
                ref={boardBodyRef}
                className="relative w-full ui-board-track"
                style={{
                  height: totalTrackH,
                  '--board-move-ms': `${moveDurationMs}ms`,
                } as CSSProperties}
              >
                {summaryY !== null && (
                  <div
                    className="absolute top-0 left-0 right-0 px-3 flex items-center bg-[#090d14] border-b border-white/[0.06] text-[11px] text-slate-400"
                    style={{ height: DIVIDER_H, transform: `translate3d(0, ${summaryY}px, 0)`, zIndex: 6 }}
                  >
                    <span className="inline-flex items-center gap-1.5 mr-2 text-slate-300 font-medium shrink-0">
                      <Ic n="flag" size={11} /> 目标线：
                    </span>
                    <div className="truncate">
                      {sortedGuideLines.map((gl, idx) => (
                        <span key={gl.label} className={`${LINE_TONE_STYLE[gl.tone].text} font-mono`}>
                          {idx > 0 && <span className="mx-1.5 text-slate-600">·</span>}
                          {gl.label} {ioi ? `${gl.score}` : `≈${gl.score}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 保持稳定的 DOM 节点顺序，确保 CSS transform 滑行永不被重排打断 */}
                {showGuideLines && contest.submissions.length > 0 && sortedGuideLines.map((gl) => {
                  const pos = linePosMap.get(gl.label);
                  if (!pos) return null;
                  const pulseUntil = linePulseUntilRef.current.get(gl.label) ?? 0;
                  return (
                    <ScoreReferenceDivider
                      key={`gl-${gl.label}`}
                      line={gl}
                      ioi={ioi}
                      allAbove={pos.allAbove}
                      teamAbove={pos.teamAbove}
                      teamTotal={teamSet.size}
                      y={pos.y}
                      pulsing={nowReal < pulseUntil}
                    />
                  );
                })}

                {contest.students.map((st) => {
                  const y = studentPosMap.get(st.id);
                  if (y === undefined) return null;
                  const shift = rankShiftRef.current.get(st.id);
                  const activeShift = shift && nowReal < shift.until ? shift.delta : 0;
                  const motionState = rowMotionRef.current.get(st.id);
                  const moveDir = motionState && nowReal < motionState.until ? motionState.dir : null;

                  return (
                    <StudentRow
                      key={`st-${st.id}`}
                      student={st}
                      rank={visualRanks.get(st.id) || 0}
                      rankDelta={activeShift}
                      problems={contest.problems}
                      manyProblems={manyProblems}
                      gridCols={gridCols}
                      y={y}
                      moveDir={moveDir}
                      rating={ratings.get(st.id) ?? 1500}
                      ioi={ioi}
                      isTeam={teamSet.has(st.name)}
                      isOpv={st.name === opvName}
                      isFocused={focusedStudent?.id === st.id}
                      cellFxMap={cellFxRef.current}
                      nowReal={nowReal}
                      onFocus={() => handleLockStudent(st.id)}
                      onOpenDrawer={() => setDrawerStudentId(st.id)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 右侧：精简概览统计 + 赛场快讯 + 三合一选项卡 */}
        <aside className="space-y-2.5">
          <div className="ui-panel p-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white/[0.025] border border-white/[0.06] px-2.5 py-2">
                <div className="text-[10.5px] text-slate-400">{ioi ? '最高分' : '最高估分'}</div>
                <div className="text-[15px] font-mono font-bold text-white mt-0.5">
                  {ioi ? `${topEst}` : `≈${topEst}`}
                </div>
              </div>
              <div className="bg-white/[0.025] border border-white/[0.06] px-2.5 py-2">
                <div className="text-[10.5px] text-slate-400">{ioi ? '平均分' : '平均估分'}</div>
                <div className="text-[15px] font-mono font-bold text-white mt-0.5">
                  {ioi ? `${avgEst}` : `≈${avgEst}`}
                </div>
              </div>
              <div className="bg-white/[0.025] border border-white/[0.06] px-2.5 py-2">
                <div className="text-[10.5px] text-slate-400">总提交</div>
                <div className="text-[15px] font-mono font-bold text-white mt-0.5">
                  {contest.submissions.length}
                </div>
              </div>
              <div className="bg-white/[0.025] border border-white/[0.06] px-2.5 py-2">
                <div className="text-[10.5px] text-slate-400">已交题</div>
                <div className="text-[15px] font-mono font-bold text-white mt-0.5">
                  {submittedCells}
                </div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10.5px] text-slate-400 font-mono">
              <span>人均提交 {(contest.submissions.length / Math.max(1, contest.students.length)).toFixed(1)} 次</span>
              <span>均 Rating {avgRating}</span>
            </div>
          </div>

          {activeBreaking && (
            <div
              key={`${activeBreaking.kind}-${activeBreaking.time}-${activeBreaking.title}`}
              data-testid="live-breaking-banner"
              className="ui-ticker-enter ui-panel border-l-2 px-3 py-2 text-[11px]"
              style={{
                borderLeftColor:
                  activeBreaking.tone === 'good'
                    ? '#50cf9e'
                    : activeBreaking.tone === 'warn'
                      ? '#eab454'
                      : '#56c2d4',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold border ${
                    activeBreaking.tone === 'good'
                      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                      : activeBreaking.tone === 'warn'
                        ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                        : 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                  }`}
                >
                  <Ic n="zap" size={10} /> {activeBreaking.title}
                </span>
                <span className="ml-auto font-mono text-[10px] text-slate-400">
                  {formatTime(activeBreaking.time).slice(0, 5)}
                </span>
              </div>
              <div className="text-slate-100 font-medium mt-1 leading-snug">{activeBreaking.text}</div>
            </div>
          )}

          <div className="ui-panel overflow-hidden">
            <div className="grid grid-cols-3 border-b border-white/[0.08] bg-[#0b1018] text-[11px]">
              <button
                type="button"
                onClick={() => setSideTab('feed')}
                className={`py-2 font-bold transition-colors border-b-2 ${
                  sideTab === 'feed'
                    ? 'text-white border-[var(--mood-accent)] bg-white/[0.04]'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                <Ic n="mic" size={11} /> 赛场实况
              </button>
              <button
                type="button"
                onClick={() => setSideTab('subs')}
                className={`py-2 font-bold transition-colors border-b-2 ${
                  sideTab === 'subs'
                    ? 'text-white border-[var(--mood-accent)] bg-white/[0.04]'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                <Ic n="radio" size={11} /> 提交 ({contest.submissions.length})
              </button>
              <button
                type="button"
                onClick={() => setSideTab('problems')}
                className={`py-2 font-bold transition-colors border-b-2 ${
                  sideTab === 'problems'
                    ? 'text-white border-[var(--mood-accent)] bg-white/[0.04]'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                <Ic n="clipboard" size={11} /> 题目 ({contest.problems.length})
              </button>
            </div>

            <div className="h-[calc(100vh-360px)] min-h-[280px] max-h-[520px] overflow-y-auto p-2.5">
              {sideTab === 'feed' && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <button
                      type="button"
                      onClick={() => setFeedTab('live')}
                      data-testid="feed-tab-live"
                      className={`ui-pill ${feedTab === 'live' ? 'ui-pill-active' : ''}`}
                    >
                      实时动态
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedTab('milestones')}
                      data-testid="feed-tab-milestones"
                      className={`ui-pill ${feedTab === 'milestones' ? 'ui-pill-active' : ''}`}
                    >
                      大事记 ({milestones.length})
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {feedTab === 'live' ? (
                      feed.length === 0 ? (
                        <div className="text-slate-400 text-[11.5px] text-center py-8">选手还在通读题面…</div>
                      ) : (
                        feed.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="text-[11.5px] leading-relaxed border-b border-white/[0.06] pb-1.5">
                            <span className="text-slate-200 font-semibold">{f.name}</span>
                            <span className="mx-1 text-slate-500">·</span>
                            <span className={FEED_TONE[f.tone]}>{f.text}</span>
                          </div>
                        ))
                      )
                    ) : milestones.length === 0 ? (
                      <div className="text-slate-400 text-[11.5px] text-center py-8">暂未触发一血 / 榜首易主等转折节点…</div>
                    ) : (
                      milestones.map((m, i) => (
                        <div key={`${m.kind}-${m.time}-${i}`} className="text-[11.5px] leading-relaxed border-b border-white/[0.06] pb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-slate-400">{formatTime(m.time).slice(0, 5)}</span>
                            <span className={`font-bold ${FEED_TONE[m.tone]}`}>{m.title}</span>
                          </div>
                          <div className="text-slate-200 mt-0.5">{m.text}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {sideTab === 'subs' && (
                <div>
                  {contest.submissions.length === 0 ? (
                    <div className="text-slate-400 text-[11.5px] text-center py-8">还没有人交代码…</div>
                  ) : (
                    <div className="space-y-0.5">
                      {contest.submissions
                        .slice(-40)
                        .reverse()
                        .map((s, i) => {
                          const stObj = contest.students.find((x) => x.id === s.studentId);
                          const att = stObj?.problems[s.problemId]?.attempts.find((a) => a.nth === s.nth);
                          return (
                            <div
                              key={`${s.studentId}-${s.problemId}-${s.nth}-${i}`}
                              className="flex items-center gap-2 text-[11.5px] py-1 border-b border-white/[0.05]"
                            >
                              <span className="text-slate-400 font-mono w-11 shrink-0">{formatTime(s.time).slice(0, 5)}</span>
                              <span
                                className={`flex-1 truncate ${
                                  teamSet.has(s.studentName) || s.studentName === opvName
                                    ? 'text-amber-200 font-bold'
                                    : 'text-slate-200'
                                }`}
                              >
                                {s.studentName}
                              </span>
                              <span className="text-slate-300 font-mono shrink-0">P{s.problemId + 1}</span>
                              <span className="font-mono text-[10.5px] shrink-0 text-right w-14">
                                {ioi && att ? (
                                  att.score >= 100 ? (
                                    <span className="text-emerald-300 font-bold">AC 100</span>
                                  ) : att.damaged ? (
                                    <span className="text-rose-300">{att.reason.split(' ')[0]} {Math.round(att.score)}</span>
                                  ) : (
                                    <span className="text-sky-300">{Math.round(att.score)}分</span>
                                  )
                                ) : (
                                  <span className="text-slate-400">第 {s.nth} 次</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {sideTab === 'problems' && (
                <div className="space-y-2">
                  {contest.problems.map((p, i) => (
                    <ProblemCard
                      key={p.id}
                      problem={p}
                      index={i}
                      totalStudents={contest.students.length}
                      stat={problemStats[i]}
                      ioi={ioi}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {drawerStudentId !== null && (() => {
        const st = contest.students.find((s) => s.id === drawerStudentId);
        return st ? <FocusPanel contest={contest} student={st} onClose={() => setDrawerStudentId(null)} /> : null;
      })()}
    </div>
  );
}

// ===== 紧凑型顶部导播聚焦台（不跳变、无重复题卡） =====
function DirectorSpotlight({
  contest,
  student: st,
  rank,
  ioi,
  isTeam,
  isOpv,
  autoDirector,
  autoSlowMo,
  recentAction,
  onToggleAuto,
  onToggleSlowMo,
  onFocusLeader,
  onFocusTeamTop,
  onOpenDrawer,
  onCollapse,
}: {
  contest: Contest;
  student: Student;
  rank: number;
  ioi: boolean;
  isTeam: boolean;
  isOpv: boolean;
  autoDirector: boolean;
  autoSlowMo: boolean;
  recentAction: RecentAction | null;
  onToggleAuto: () => void;
  onToggleSlowMo: () => void;
  onFocusLeader: () => void;
  onFocusTeamTop: () => void;
  onOpenDrawer: () => void;
  onCollapse: () => void;
}) {
  const curIdx = st.currentProblem;
  const activeProb = curIdx !== null ? contest.problems[curIdx] : null;
  const activePs = curIdx !== null ? st.problems[curIdx] : null;
  const phase: Phase = st.finished ? 'done' : st.phase;
  const pc = phaseColor(phase);
  const totalEst = totalEstimate(st, ioi);

  const minutes = contest.duration / 60;
  const nowMin = contest.timeElapsed / 60;
  const traces = useMemo(
    () => tracesForStudent(st, contest.problems, minutes, ioi),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st, contest.problems, minutes, ioi, Math.floor(nowMin), curIdx, st.totalSubmissions],
  );
  const curTrace = curIdx !== null ? traces[curIdx] : null;
  const activeStep = useMemo(() => {
    if (!curTrace || !activePs || activePs.phase === 'idle') return null;
    const passed = curTrace.steps.filter((s) => s.minute <= nowMin);
    return curTrace.steps[passed.length] ?? passed[passed.length - 1] ?? curTrace.steps[0] ?? null;
  }, [curTrace, activePs, nowMin]);

  const isCloseUp =
    phase === 'deciding' ||
    phase === 'fixing' ||
    phase === 'restoring' ||
    Boolean(recentAction);

  let closeUpCaption: { text: string; tone: 'good' | 'sky' | 'amber' | 'rose' } | null = null;
  if (recentAction) {
    closeUpCaption = { text: recentAction.caption, tone: recentAction.tone };
  } else if (phase === 'deciding' && curIdx !== null) {
    closeUpCaption = {
      text: ioi
        ? `提交前特写：P${curIdx + 1} 本地样例已过，准备送交评测机 Running on tests…`
        : `提交前特写：P${curIdx + 1}（${activePs?.mode === 'brute' ? '暴力档' : '正解档'}）自测完毕，正在核对文件名准备封存代码…`,
      tone: 'amber',
    };
  } else if (phase === 'fixing' && curIdx !== null) {
    closeUpCaption = {
      text: `紧急抢修特写：P${curIdx + 1} 收到实时评测反馈，正全速定位边界 Bug 准备重交…`,
      tone: 'rose',
    };
  } else if (phase === 'restoring' && curIdx !== null) {
    closeUpCaption = {
      text: `求稳特写：P${curIdx + 1} 担心正解挂穿，正在把保底暴力覆盖回提交目录…`,
      tone: 'amber',
    };
  }

  const activeStageIndex = (() => {
    if (phase === 'survey') return 0;
    if (phase === 'reading') return 1;
    if (phase === 'thinking') return 2;
    if (phase === 'coding') return 3;
    if (phase === 'testing') return 4;
    if (phase === 'deciding' || phase === 'fixing' || phase === 'restoring') return 5;
    return -1;
  })();

  const lineToneCls = closeUpCaption
    ? closeUpCaption.tone === 'good'
      ? 'border-emerald-400 bg-emerald-500/12 text-emerald-200'
      : closeUpCaption.tone === 'sky'
        ? 'border-sky-400 bg-sky-500/12 text-sky-200'
        : closeUpCaption.tone === 'rose'
          ? 'border-rose-400 bg-rose-500/12 text-rose-200'
          : 'border-amber-400 bg-amber-500/12 text-amber-200'
    : 'border-white/10 bg-black/25 text-slate-300';

  return (
    <div
      data-testid="director-spotlight"
      className={`ui-spotlight px-3.5 py-2.5 mb-2.5 ${isCloseUp ? 'ui-spotlight-zoom' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-white/[0.07]">
        <span className="text-[10.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-white/15 bg-white/[0.04] text-slate-200">
          <Ic n="eye" size={11} /> 导播跟拍
        </span>
        <span className="text-[13.5px] font-black text-white">{st.name}</span>
        {isOpv && (
          <span className="text-[10px] px-1.5 py-0.5 border border-amber-400/45 bg-amber-500/15 text-amber-200 font-bold">
            <Ic n="zap" size={10} /> OP
          </span>
        )}
        {isTeam && (
          <span className="text-[10px] px-1.5 py-0.5 border border-indigo-400/40 bg-indigo-500/15 text-indigo-200 font-bold">
            我队
          </span>
        )}
        <span className="text-[11.5px] font-mono text-slate-300">
          {st.totalSubmissions > 0 ? `#${rank} · ${ioi ? `${totalEst} 分` : `≈${totalEst} 分`}` : '暂未交题'}
        </span>

        {isCloseUp && (
          <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/20 border border-rose-400/50 text-rose-200 font-bold">
            LIVE 特写
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleAuto}
            data-testid="toggle-auto-director"
            className={`ui-pill ${autoDirector ? 'ui-pill-active' : ''}`}
            title="自动把镜头切给正在提交、修锅或领跑的我队主力；点击任意选手行则转为手动锁定"
          >
            <Ic n="radio" size={10} /> {autoDirector ? '自动导播' : '手动锁定'}
          </button>
          <button
            type="button"
            onClick={onToggleSlowMo}
            data-testid="toggle-slowmo"
            title="快进观看时，遇到我队关键提交或犹豫交卷自动切 1x 特写 1.5 秒（不改变任何结果）"
            className={`ui-pill ${autoSlowMo ? 'ui-pill-active' : ''}`}
          >
            <Ic n="timer" size={10} /> 特写慢放
          </button>
          <button type="button" onClick={onFocusTeamTop} className="ui-pill" title="锁定我队当前最高分">
            我队头名
          </button>
          <button type="button" onClick={onFocusLeader} className="ui-pill" title="锁定全场榜首">
            全场榜首
          </button>
          <button
            type="button"
            onClick={onOpenDrawer}
            data-testid="spotlight-open-drawer"
            className="ui-pill text-emerald-200 border-emerald-500/35"
          >
            <Ic n="brain" size={11} /> 全卷思维链
          </button>
          <button
            type="button"
            onClick={onCollapse}
            data-testid="spotlight-close"
            className="ui-pill text-slate-400"
            title="收起顶部导播台"
          >
            <Ic n="x" size={11} />
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-2.5 items-center">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            {activeProb && curIdx !== null ? (
              <>
                <span className="font-bold text-white truncate">
                  正在攻克：P{curIdx + 1} · {activeProb.title}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 font-bold shrink-0"
                  style={{ color: levelInfo(activeProb.level).ink, backgroundColor: levelInfo(activeProb.level).color + '2b' }}
                >
                  {levelInfo(activeProb.level).name}
                </span>
                <span className="text-[11px] text-slate-400 shrink-0">{TOPIC_NAMES[activeProb.topic]}</span>
              </>
            ) : (
              <span className="text-slate-300 font-medium">
                {st.finished ? '已提前收工等收卷' : phase === 'survey' ? '正在通读全卷题面评估开题顺序…' : '全卷可做题已扫完，正在检查文件名与边界…'}
              </span>
            )}
            <span className="ml-auto font-mono text-[11px] font-bold shrink-0" style={{ color: pc }}>
              {phaseLabel(phase)} {st.finished ? '' : `${Math.round(st.phaseProgress * 100)}%`}
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const doneStep = activeStageIndex > idx || st.finished;
              const isCur = activeStageIndex === idx && !st.finished;
              return (
                <div
                  key={step.id}
                  className={`px-1.5 py-1 border text-center text-[10px] relative overflow-hidden ${
                    isCur
                      ? 'border-white/40 bg-white/[0.07] text-white font-bold'
                      : doneStep
                        ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300'
                        : 'border-white/[0.07] bg-black/25 text-slate-500'
                  }`}
                >
                  <span>{step.label}</span>
                  {isCur && (
                    <span
                      className="absolute bottom-0 left-0 h-[2px]"
                      style={{ width: `${Math.round(st.phaseProgress * 100)}%`, backgroundColor: pc }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 固定单槽实时字幕 / 思维步骤（不增减高度，榜单永不跳动） */}
        <div
          data-testid={closeUpCaption ? 'spotlight-closeup-caption' : undefined}
          className={`px-2.5 py-2 border-l-2 text-[11.5px] leading-snug min-h-[44px] flex items-center ${lineToneCls}`}
        >
          {closeUpCaption ? (
            <span className="font-medium truncate" title={closeUpCaption.text}>
              {closeUpCaption.text}
            </span>
          ) : activeStep && !st.finished ? (
            <span className="truncate" title={activeStep.step.text}>
              <span className="text-amber-300 font-bold mr-1.5">[{kindName(activeStep.step.kind)}]</span>
              <span>{activeStep.step.text}</span>
            </span>
          ) : (
            <span className="text-slate-400">
              {st.finished ? '已全部交卷封存，等待赛后统一评测揭晓真分。' : '考场稳态推进中，点击表格任意行可切换跟拍对象。'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 榜单内嵌实时目标参考线（绝对轨道同步滑行） =====
function ScoreReferenceDivider({
  line,
  ioi,
  allAbove,
  teamAbove,
  teamTotal,
  y,
  pulsing,
}: {
  line: ContestGuideLine;
  ioi: boolean;
  allAbove: number;
  teamAbove: number;
  teamTotal: number;
  y: number;
  pulsing: boolean;
}) {
  const st = LINE_TONE_STYLE[line.tone];
  return (
    <div
      data-testid={`score-line-${line.label}`}
      className={`ui-track-divider absolute top-0 left-0 right-0 px-3 flex items-center gap-2 text-[10.5px] bg-[#090d14] border-y border-white/[0.06] ${
        pulsing ? 'ui-line-crossed' : ''
      }`}
      style={{ height: DIVIDER_H, transform: `translate3d(0, ${y}px, 0)`, zIndex: 6 }}
    >
      <span className={`px-1.5 py-0.5 border font-bold shrink-0 ${st.badge}`}>
        <Ic n="flag" size={10} /> {line.label} · {ioi ? `${line.score}` : `≈${line.score}`} 分
      </span>
      <div className={`flex-1 border-t border-dashed ${st.border}`} />
      <span className={`font-mono shrink-0 ${pulsing ? 'text-white font-bold' : st.text}`}>
        全场达线 {allAbove} 人{teamTotal > 0 ? ` · 我队 ${teamAbove}/${teamTotal}` : ''}
      </span>
    </div>
  );
}

function AnimatedScore({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [bumping, setBumping] = useState(false);
  const shownRef = useRef(value);

  useEffect(() => {
    if (!motionFull() || value === shownRef.current) {
      shownRef.current = value;
      setShown(value);
      setBumping(false);
      return;
    }
    const startVal = shownRef.current;
    const diff = value - startVal;
    const duration = 280;
    let startTime: number | null = null;
    if (diff > 0) setBumping(true);
    let raf = 0;
    const step = (now: number) => {
      if (startTime === null) startTime = now;
      const t = Math.max(0, Math.min(1, (now - startTime) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const nextVal = Math.round(startVal + diff * eased);
      shownRef.current = nextVal;
      setShown(nextVal);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        shownRef.current = value;
        setShown(value);
        setBumping(false);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={bumping ? 'text-emerald-300 transition-colors' : undefined}>
      {shown}
    </span>
  );
}

function ProblemCard({
  problem,
  index,
  totalStudents,
  stat,
  ioi,
}: {
  problem: Problem;
  index: number;
  totalStudents: number;
  stat: { fullCnt: number; partCnt: number; subUsers: number };
  ioi: boolean;
}) {
  const L = levelInfo(problem.level);
  const c = L.color;
  const tc = TOPIC_COLORS[problem.topic];
  const total = Math.max(1, totalStudents);
  const fullPct = (stat.fullCnt / total) * 100;
  const partPct = (stat.partCnt / total) * 100;

  return (
    <div className="border p-2" style={{ borderColor: c + '48', backgroundColor: c + '0d' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-100 truncate">
          P{index + 1} · {problem.title}
        </span>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 whitespace-nowrap shrink-0"
          style={{ color: L.ink, backgroundColor: c + '2b' }}
          title={L.en}
        >
          {L.name}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] px-1.5 py-0.5" style={{ color: tc, backgroundColor: tc + '20' }}>
          {TOPIC_NAMES[problem.topic]}
        </span>
        <span className="text-[10px] text-slate-300 font-mono">
          {ioi ? 'AC' : '估满'} {stat.fullCnt}/{totalStudents} · 交 {stat.subUsers}人
        </span>
      </div>
      <div className="mt-1.5 h-1.5 bg-slate-900/90 overflow-hidden flex" title={`满分 ${stat.fullCnt} 人 · 部分分 ${stat.partCnt} 人`}>
        <div className="h-full bg-emerald-400" style={{ width: `${fullPct}%` }} />
        <div className="h-full bg-sky-400/80" style={{ width: `${partPct}%` }} />
      </div>
      <div className="flex gap-1 mt-1.5">
        {problem.subtasks.map((s, i) => (
          <span key={i} className="flex-1 text-center text-[9.5px] font-mono py-0.5 bg-slate-800/80 text-slate-300">
            {s.points}
          </span>
        ))}
      </div>
    </div>
  );
}

function cellHeatStyle(
  est: number | null,
  ioi: boolean,
  active: boolean,
  phaseCol: string,
): { bg: string; text: string; border: string } {
  if (est === null) {
    return {
      bg: active ? 'rgba(255,255,255,0.045)' : 'transparent',
      text: active ? '#cbd5e1' : '#334155',
      border: active ? phaseCol : 'transparent',
    };
  }
  if (est >= 100) {
    return {
      bg: ioi ? 'rgba(80,207,158,0.22)' : 'rgba(80,207,158,0.15)',
      text: '#d1f8e8',
      border: active ? phaseCol : 'rgba(80,207,158,0.42)',
    };
  }
  if (est >= 50) {
    return {
      bg: 'rgba(86,194,212,0.16)',
      text: '#b2e8f1',
      border: active ? phaseCol : 'rgba(86,194,212,0.36)',
    };
  }
  if (est > 0) {
    return {
      bg: 'rgba(234,180,84,0.14)',
      text: '#fae0a8',
      border: active ? phaseCol : 'rgba(234,180,84,0.34)',
    };
  }
  return {
    bg: 'rgba(235,115,124,0.13)',
    text: '#fbc3c7',
    border: active ? phaseCol : 'rgba(235,115,124,0.32)',
  };
}

function fxMeta(kind: CellFxKind): { textCls: string; anim: string } {
  switch (kind) {
    case 'ac':
      return { textCls: 'text-emerald-300 font-bold', anim: 'ui-fx-ac' };
    case 'gain':
      return { textCls: 'text-sky-300 font-bold', anim: 'ui-fx-gain' };
    case 'tle':
      return { textCls: 'text-amber-300 font-bold', anim: 'ui-fx-tle' };
    case 're':
      return { textCls: 'text-violet-300 font-bold', anim: 'ui-fx-re' };
    case 'wa':
    case 'rework':
      return { textCls: 'text-rose-300 font-bold', anim: 'ui-fx-wa' };
    case 'restore':
    case 'seal':
    default:
      return { textCls: 'text-amber-200 font-bold', anim: 'ui-fx-seal' };
  }
}

function StudentRow({
  student: st,
  rank,
  rankDelta,
  problems,
  manyProblems,
  gridCols,
  y,
  moveDir,
  rating,
  ioi,
  isTeam,
  isOpv,
  isFocused,
  cellFxMap,
  nowReal,
  onFocus,
  onOpenDrawer,
}: {
  student: Student;
  rank: number;
  rankDelta: number;
  problems: Problem[];
  manyProblems: boolean;
  gridCols: string;
  y: number;
  moveDir: 'up' | 'down' | null;
  rating: number;
  ioi: boolean;
  isTeam: boolean;
  isOpv: boolean;
  isFocused: boolean;
  cellFxMap: Map<string, CellFx>;
  nowReal: number;
  onFocus: () => void;
  onOpenDrawer: () => void;
}) {
  const current = st.currentProblem;
  const done = st.finished;
  const phase = done ? 'done' : st.phase;
  const pc = phaseColor(phase);

  const rowBg = isFocused
    ? 'bg-white/[0.08]'
    : isTeam || isOpv
      ? 'bg-indigo-500/[0.075] hover:bg-indigo-500/[0.11]'
      : rank <= 3 && st.totalSubmissions > 0
        ? 'bg-amber-400/[0.025] hover:bg-white/[0.035]'
        : 'hover:bg-white/[0.035]';

  const firstCellAccent = isFocused
    ? 'inset 3px 0 0 #ffffff'
    : isTeam || isOpv
      ? 'inset 3px 0 0 var(--mood-accent)'
      : undefined;

  const totalScore = totalEstimate(st, ioi);

  return (
    <div
      role="row"
      data-row-sid={st.id}
      className={`ui-track-row group grid items-center absolute top-0 left-0 right-0 border-b border-white/[0.05] text-[12px] ${rowBg} ${
        moveDir === 'up' ? 'ui-track-row-rising' : ''
      }`}
      style={{
        height: ROW_H,
        gridTemplateColumns: gridCols,
        transform: `translate3d(0, ${y}px, 0)`,
        zIndex: moveDir === 'up' ? 12 : moveDir === 'down' ? 2 : isFocused ? 5 : 4,
      }}
    >
      {/* # 名次列 */}
      <div
        className="h-full px-2 flex items-center justify-center font-mono whitespace-nowrap"
        style={firstCellAccent ? { boxShadow: firstCellAccent } : undefined}
      >
        <div className="inline-flex items-center justify-center gap-1">
          {st.totalSubmissions === 0 ? (
            <span className="text-slate-600">—</span>
          ) : rank <= 3 && rank > 0 ? (
            <span className="ui-rank" data-r={rank}>{rank}</span>
          ) : (
            <span className="text-[12px] text-slate-400">{rank}</span>
          )}
          {rankDelta !== 0 && (
            <span
              className={`ui-rank-delta text-[10px] font-bold leading-none ${
                rankDelta > 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {rankDelta > 0 ? `↑${rankDelta}` : `↓${Math.abs(rankDelta)}`}
            </span>
          )}
        </div>
      </div>

      {/* 选手列 */}
      <div className="px-2.5 flex items-center gap-1.5 min-w-0 overflow-hidden">
        <button
          type="button"
          onClick={onFocus}
          onDoubleClick={onOpenDrawer}
          title={`${st.name} · Rating ${rating}（单击锁定导播跟拍；双击展开全卷思维链）`}
          data-testid={`focus-${st.name}`}
          className={`truncate text-left text-[13px] transition-colors ${
            isTeam || isOpv
              ? 'text-white font-bold hover:text-amber-200'
              : 'text-slate-200 font-medium hover:text-indigo-300'
          }`}
        >
          {st.name}
        </button>
        {isOpv ? (
          <span className="text-[9.5px] px-1 py-0.5 border border-amber-400/45 bg-amber-500/15 text-amber-200 font-bold shrink-0 leading-none">
            OP
          </span>
        ) : isTeam ? (
          <span className="text-[9.5px] px-1 py-0.5 border border-white/15 bg-white/[0.06] text-indigo-200 shrink-0 leading-none">
            我队
          </span>
        ) : null}
        <button
          type="button"
          onClick={onOpenDrawer}
          title={`展开 ${st.name} 的全卷思维链（Rating ${rating}）`}
          className="ml-auto text-slate-400 hover:text-white opacity-35 group-hover:opacity-100 transition-opacity shrink-0 p-0.5"
        >
          <Ic n="brain" size={12} />
        </button>
      </div>

      {/* 各题得分方格 */}
      {problems.map((_, i) => {
        const est = problemEstimate(st, i, ioi);
        const ps = st.problems[i];
        const active = current === i && !done;
        const fx = cellFxMap.get(`${st.id}#${i}`);
        const hasLiveFx = Boolean(fx && nowReal < fx.until);
        const fxInfo = hasLiveFx && fx ? fxMeta(fx.kind) : null;
        const heat = cellHeatStyle(est, ioi, active, pc);

        const subHint =
          hasLiveFx && fx && fxInfo
            ? { text: fx.label, cls: fxInfo.textCls }
            : !ioi && ps.debugRounds > 0
              ? { text: `拍×${ps.debugRounds}`, cls: 'text-rose-300/90' }
              : ps.submissions > 1
                ? { text: `${ps.submissions}次`, cls: 'text-slate-400' }
                : null;

        return (
          <div key={i} className="px-1 flex items-center justify-center">
            <div
              key={hasLiveFx && fx ? `${i}-fx-${fx.seq}` : `${i}-base`}
              className={`relative h-8 w-full flex flex-col items-center justify-center rounded-[3px] font-mono ${
                fxInfo ? `${fxInfo.anim} ui-cell-glow` : ''
              }`}
              style={{
                backgroundColor: heat.bg,
                color: heat.text,
                border: `1px solid ${heat.border}`,
              }}
              title={`P${i + 1} · ${ps.submissions} 次提交${ps.debugRounds > 0 ? ` · 对拍返工 ${ps.debugRounds} 次` : ''}`}
            >
              {est === null ? (
                <span className={`text-[12px] leading-none ${active ? 'text-slate-300' : 'text-slate-700'}`}>
                  {active ? '…' : '·'}
                </span>
              ) : (
                <span className={`${manyProblems ? 'text-[11px]' : 'text-[12.5px]'} font-bold leading-none`}>
                  {!ioi && <span className="text-[10px] opacity-70 mr-[1px]">≈</span>}
                  {est}
                </span>
              )}

              {!manyProblems && subHint && (
                <span className={`text-[9px] leading-none mt-0.5 ${subHint.cls}`}>
                  {subHint.text}
                </span>
              )}

              {active && (
                <span
                  className="absolute bottom-0 left-0 h-[2px]"
                  style={{ width: `${Math.round(ps.progress * 100)}%`, backgroundColor: pc }}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* 总分列（平滑数字滚动） */}
      <div className="px-3 text-right font-mono font-extrabold text-[13.5px] whitespace-nowrap">
        {st.totalSubmissions === 0 ? (
          <span className="text-slate-600 font-normal">—</span>
        ) : (
          <span className={isTeam || isOpv || rank <= 3 ? 'text-white' : 'text-slate-100'}>
            {!ioi && <span className="text-[11px] text-slate-400 font-normal mr-0.5">≈</span>}
            <AnimatedScore value={totalScore} />
          </span>
        )}
      </div>

      {/* 当前状态列 */}
      <div className="px-3 text-right">
        {done ? (
          <span className="text-[11px] text-emerald-400/85 font-medium">已交卷</span>
        ) : (
          <div className="flex flex-col items-end w-full">
            <div className="flex items-center justify-end gap-1.5 w-full text-[11px] leading-none">
              <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: pc }} />
              <span className="truncate" style={{ color: pc }}>
                {phaseLabel(phase)}
                {current !== null ? ` P${current + 1}` : ''}
              </span>
              <span className="font-mono text-[10px] text-slate-400 shrink-0">
                {Math.round(st.phaseProgress * 100)}%
              </span>
            </div>
            <div className="w-full h-[3px] bg-slate-800/90 mt-1.5 overflow-hidden">
              <div className="h-full" style={{ width: `${st.phaseProgress * 100}%`, backgroundColor: pc }} />
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
