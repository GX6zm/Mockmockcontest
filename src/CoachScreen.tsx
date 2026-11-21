import { useEffect, useState } from 'react';
import {
  TOPIC_COLORS, TOPIC_LIST, TOPIC_NAMES, createContest, levelInfo,
  randomSeed, totalEstimate,
} from './game.ts';
import { ContestScreen } from './ContestScreen.tsx';
import { StudentDetail } from './StudentDetail.tsx';
import {
  CAREER_YEARS, GRADE_NAMES, INTENSITY_INFO, MAX_YEARS, MOCK_PRESETS, PRELIM_LINE, TEAM_MIN, YEAR_STAGES, YEAR_WEEKS,
  advanceWeek, chooseEventOption, continueCareer, createSeason, nextStage, planWeek, qualifiedFor, retireCareer,
  reserveStudents, rosterSorted, runWeeklyContest, seasonReport, setSquad, setTeam, stageOfWeek, overallScoreOf, teamStudents,
} from './season.ts';
import type { WeekPlan } from './season.ts';
import type {
  AwardRow, CareerReport, ContestRecap, ContestRound, MockConfig, MockPreset, SeasonState, SeasonStudent, SquadFocus, StageDef,
  TrainingLine, TrainingReport, WeekIntensity,
} from './season.ts';
import type { PendingEvent } from './events.ts';
import { clearCoachSeason, coachStorageAvailable, hasCoachSave, loadCoachSeason, saveCoachSeason } from './coachSave.ts';
import { IS_OPV, loadOpvConfig } from './opv.ts';
import { quoteFor } from './easter.ts';
import type { Topic } from './types.ts';
import type { Contest } from './types.ts';
import { ReviewOverlay } from './ReviewOverlay.tsx';
import { Ic, plainText } from './ui.tsx';
import type { IconName } from './ui.tsx';

const pct = (v: number) => Math.round(v * 100);
/** 0–1 能力 → 0–150 知识点 */
const kp = (v: number) => Math.round(v * 150);

const SQUAD_FOCUS_INFO: Record<SquadFocus, { name: string; note: string; icon: IconName }> = {
  main: { name: '主力优先', note: '主力吃满注意力，梯队每周只分到一点', icon: 'target' },
  balanced: { name: '均衡', note: '主力 80%、梯队 70%，两边都顾得上', icon: 'scale' },
  reserve: { name: '梯队优先', note: '梯队吃满，主力靠自觉；适合换血年', icon: 'sprout' },
};

const TONE: Record<TrainingLine['tone'], { text: string; ring: string; icon: IconName }> = {
  good: { text: 'text-emerald-300', ring: 'border-emerald-500/30', icon: 'trendUp' },
  ok: { text: 'text-sky-300', ring: 'border-sky-500/25', icon: 'smile' },
  flat: { text: 'text-slate-400', ring: 'border-slate-600/50', icon: 'meh' },
  bad: { text: 'text-rose-300', ring: 'border-rose-500/30', icon: 'frown' },
};

const AWARD_STYLE: Record<AwardRow['tone'], string> = {
  gold: 'bg-amber-400/20 text-amber-200 border-amber-400/40',
  silver: 'bg-slate-300/15 text-slate-200 border-slate-300/35',
  bronze: 'bg-orange-700/20 text-orange-200 border-orange-500/30',
  prov1: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  team: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

/** `?years=1` 可以只跑一届（调试 / 冒烟用）；默认无上限，学年末自己决定退休 */
function requestedYears(): number {
  if (typeof location === 'undefined') return MAX_YEARS;
  const n = Number(new URLSearchParams(location.search).get('years'));
  return n >= 1 && n <= MAX_YEARS ? n : MAX_YEARS;
}

/** `?seed=123` 固定种子（冒烟 / 复现 bug 用） */
function requestedSeed(): number {
  if (typeof location === 'undefined') return randomSeed();
  const n = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : randomSeed();
}

/**
 * OPv：第一学年默认把自定义的选手 + 综合最高的几位一起勾进主力，
 * 直接凑够 6 人，玩家进选队页就能点「开始第 1 学年」。
 */
function opvAutoPicks(s: SeasonState): string[] {
  const cfg = IS_OPV ? loadOpvConfig() : null;
  if (!cfg || !cfg.autoTeam || s.year !== 1) return [];
  if (!s.students.some((st) => st.name === cfg.name)) return [];
  const top = rosterSorted(s).filter((st) => st.name !== cfg.name).slice(0, TEAM_MIN - 1).map((st) => st.name);
  return [...new Set([cfg.name, ...top])];
}

export default function CoachScreen({ onOpvSetup }: { onOpvSetup?: () => void }) {
  // 有存档就续上，没有（或存档损坏）才开新的一届
  const [season, setSeason] = useState<SeasonState>(() =>
    loadCoachSeason(() => createSeason(requestedSeed(), requestedYears())));
  const [resumed] = useState<boolean>(() => hasCoachSave());
  const [saveOk, setSaveOk] = useState<boolean>(() => coachStorageAvailable());
  const [picked, setPicked] = useState<string[]>([]);
  const [reservePicked, setReservePicked] = useState<string[]>([]);

  // 每次状态变化就地存档：刷新、关标签页、误按返回都不会丢掉这一届
  useEffect(() => {
    setSaveOk(saveCoachSeason(season));
  }, [season]);

  const newSeason = () => {
    if (!window.confirm(`开新的一届会清掉当前存档（第 ${season.year} 学年 · 第 ${Math.min(season.week, YEAR_WEEKS)} 周），确定吗？`)) return;
    clearCoachSeason();
    const next = createSeason(requestedSeed(), requestedYears());
    setPicked(opvAutoPicks(next));
    setReservePicked([]);
    setSeason(next);
  };

  // 学年切换后，默认把上一届留下来的队员勾上
  useEffect(() => {
    if (season.phase !== 'team') return;
    const keep = season.lastTeam.filter((n) => season.students.some((st) => st.name === n));
    const keepReserve = season.lastReserve.filter((n) => season.students.some((st) => st.name === n));
    // OPv：第一学年把自定义的那个人和几位强手默认勾进主力
    const auto = opvAutoPicks(season);
    const withOpv = auto.length ? [...new Set([...auto, ...keep])] : keep;
    setPicked(withOpv);
    setReservePicked(keepReserve.filter((n) => !withOpv.includes(n)));
  }, [season.year, season.phase]);

  const team = teamStudents(season);
  const opvName = IS_OPV ? (loadOpvConfig()?.name ?? null) : null;

  // 正赛/模拟赛：先瞬时结算出真实成绩，再把每一场的 Contest 重放给玩家看，
  // 播完才把结算后的 state 写回去（保证 UI 与脚本同 seed 逐分一致）。
  const [watch, setWatch] = useState<{
    rounds: ContestRound[];
    next: SeasonState;
    index: number;
    est: Record<string, number>;
    review?: Contest;
  } | null>(null);

  const startContest = () => {
    const trace: ContestRound[] = [];
    const next = runWeeklyContest(season, trace);
    // 校内模拟赛默认直接出成绩：不播逐日过程、不进取分板，跑完立刻看榜单。
    // 初赛是笔试，本来就直接出分。
    if (trace.length === 0 || next.lastContest?.kind === 'practice') {
      setSeason(next);
      return;
    }
    setWatch({ rounds: trace, next, index: 0, est: {} });
  };
  const revealResult = () => {
    if (!watch) return;
    setSeason(watch.next);
    setWatch(null);
  };

  return (
    <div className="min-h-screen bg-[#08090c] text-slate-200">
      <Header season={season} team={team} onNew={newSeason} resumed={resumed} saveOk={saveOk} />
      <div className="max-w-6xl mx-auto px-4 pb-16">
        {watch && watch.index < watch.rounds.length && (
          <CoachPlay
            key={watch.index}
            round={watch.rounds[watch.index]}
            onDone={(est, contest) => setWatch((w) => (w ? { ...w, est: { ...w.est, ...est }, index: w.index + 1, review: contest } : w))}
            onSkip={revealResult}
          />
        )}
        {watch && watch.index >= watch.rounds.length && (
          <EstimateBoard
            est={watch.next.lastContest
              ? Object.fromEntries(watch.next.lastContest.rows.map((r) => [r.name, r.est]))
              : watch.est}
            round={watch.review}
            onReveal={revealResult}
            onSkip={revealResult}
          />
        )}
        {!watch && season.phase === 'team' && (
          <PickTeam
            season={season}
            picked={picked}
            setPicked={setPicked}
            reserve={reservePicked}
            setReserve={setReservePicked}
            onStart={(names, res) => setSeason(setSquad(season, names, res))}
            opvName={opvName}
            onOpvSetup={onOpvSetup}
          />
        )}
        {!watch && season.phase === 'plan' && (
          <PlanWeek
            season={season}
            onPlan={(plan) => setSeason(planWeek(season, plan))}
            onEvent={(id) => setSeason(chooseEventOption(season, id))}
          />
        )}
        {!watch && season.phase === 'report' && season.report && (
          <ReportView
            season={season}
            report={season.report}
            onRun={startContest}
          />
        )}
        {!watch && season.phase === 'result' && season.lastContest && (
          <ResultView
            season={season}
            recap={season.lastContest}
            onNext={() => setSeason(advanceWeek(season))}
          />
        )}
        {!watch && season.phase === 'yearEnd' && (
          <YearEnd
            season={season}
            onContinue={() => setSeason(continueCareer(season))}
            onRetire={() => {
              if (!window.confirm(`退休会结束这一届生涯（已带 ${season.year} 个学年），确定吗？`)) return;
              setSeason(retireCareer(season));
            }}
          />
        )}
        {!watch && season.phase === 'finished' && <Finale season={season} onNew={newSeason} />}
      </div>
    </div>
  );
}

// ===== 顶栏 =====
function Header({
  season, team, onNew, resumed, saveOk,
}: {
  season: SeasonState; team: SeasonStudent[]; onNew: () => void; resumed: boolean; saveOk: boolean;
}) {
  const week = Math.min(season.week, YEAR_WEEKS);
  const avgOverall = team.length ? team.reduce((a, s) => a + overallScoreOf(s), 0) / team.length : 0;
  const avgFatigue = team.length ? team.reduce((a, s) => a + s.fatigue, 0) / team.length : 0;
  const stage = nextStage(season);
  const yearsLeft = season.careerYears - season.year;
  return (
    <div className="sticky top-0 z-20 bg-[#08090c]/95 border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-black text-white"><Ic n="graduation" /> 教练模式</h1>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">M7 · 任意多年</span>
          {IS_OPV && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold"><Ic n="zap" /> OPv</span>}
        </div>
        <div className="text-[11px] text-slate-400 font-mono">
          第 <b className="text-white">{season.year}</b> 学年
          {season.careerYears < MAX_YEARS ? <span className="text-slate-500"> / {season.careerYears}</span> : <span className="text-slate-500"> · 无上限</span>}
          <span className="mx-1 text-slate-600">·</span>
          第 <b className="text-white">{week}</b>/{YEAR_WEEKS} 周
        </div>
        {team.length > 0 && (
          <>
            <div className="text-[11px] text-slate-400">主力 <b className="text-white">{team.length}</b> 人</div>
            <div className="text-[11px] text-slate-400">梯队 <b className="text-amber-300">{season.reserve.length}</b> 人</div>
            <div className="text-[11px] text-slate-400">声望 <b className="text-amber-200">{Math.round(season.prestige)}</b></div>
            <div className="text-[11px] text-slate-400">综合 <b className="text-white">{avgOverall.toFixed(1)}</b></div>
            <div className="text-[11px] text-slate-400">
              疲劳 <b className={avgFatigue > 65 ? 'text-rose-300' : avgFatigue > 40 ? 'text-amber-300' : 'text-emerald-300'}>{Math.round(avgFatigue)}</b>
            </div>
          </>
        )}
        <div className="flex-1" />
        <div
          className={`text-[10px] px-2 py-1 rounded-lg border ${
            saveOk
              ? 'border-emerald-600/30 bg-emerald-500/[0.07] text-emerald-300/90'
              : 'border-amber-600/30 bg-amber-500/[0.07] text-amber-300/90'
          }`}
          data-testid="coach-save-state"
          title="进度随每周自动写入本机；关掉页面不会清档，随时可以回来接着带"
        >
          {saveOk
            ? resumed ? <><Ic n="save" /> 已续上上次进度 · 自动存档</> : <><Ic n="save" /> 自动存档已开启</>
            : <><Ic n="alert" /> 本浏览器禁用了本地存储，刷新会丢进度</>}
        </div>
        {team.length > 0 && (
          <div className="text-[11px] text-slate-500" data-testid="next-stage">
            {stage ? (
              <>下一场 <b className="text-slate-300">{stage.short}</b> · 第 {stage.week} 周</>
            ) : (
              <>{yearsLeft > 0 ? '本学年赛程已结束' : '生涯最后一场已结束'}</>
            )}
          </div>
        )}
        <button onClick={onNew} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-indigo-400/60">
          <Ic n="refresh" /> 新的一届
        </button>
      </div>
      <ProgressBar season={season} />
    </div>
  );
}

/** 一学年进度条：正式比赛周加高并标出来 */
function ProgressBar({ season }: { season: SeasonState }) {
  const byWeek = new Map<number, ContestRecap>();
  for (const c of season.contests) byWeek.set(c.week, c);
  return (
    <div className="max-w-6xl mx-auto px-4 pb-2 flex items-end gap-[3px]">
      {Array.from({ length: YEAR_WEEKS }, (_, i) => {
        const w = i + 1;
        const stage = stageOfWeek(w);
        const c = byWeek.get(w);
        const team = c ? c.rows.filter((r) => season.team.includes(r.name)) : [];
        const frac = c && team.length ? team.reduce((a, r) => a + r.real, 0) / (c.fullScore * team.length) : 0;
        const active = season.week === w && season.phase !== 'finished';
        const officialDone = c?.kind === 'official' || c?.kind === 'prelim';
        return (
          <div
            key={w}
            title={stage ? `第 ${w} 周 · ${stage.name}${c ? '（已考）' : ''}` : c ? `第 ${w} 周 · 模拟赛` : `第 ${w} 周`}
            className={`flex-1 rounded-sm transition-all ${
              stage ? 'h-2.5' : 'h-1.5'
            } ${
              officialDone ? 'bg-amber-400/80' : c ? 'bg-indigo-400/70' : active ? 'bg-indigo-500/40 ui-live' : stage ? 'bg-slate-700' : 'bg-slate-800'
            }`}
            style={c && !stage ? { opacity: 0.35 + frac * 0.65 } : undefined}
          />
        );
      })}
    </div>
  );
}

// ===== 赛历条 =====
function CalendarStrip({ season }: { season: SeasonState }) {
  const done = new Set(season.contests.map((c) => c.stageId).filter(Boolean));
  return (
    <div className="flex flex-wrap gap-1.5 mb-4" data-testid="calendar-strip">
      {YEAR_STAGES.map((st) => {
        const isDone = done.has(st.id);
        const isNow = st.week === season.week;
        const qual = qualifiedFor(season, st);
        return (
          <div
            key={st.id}
            className={`text-[10px] px-2 py-1 rounded-lg border ${
              isDone ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                : isNow ? 'border-indigo-400/60 bg-indigo-600/20 text-indigo-200'
                  : 'border-slate-700/70 text-slate-400'
            }`}
          >
            <div className="font-bold">{st.short} <span className="font-mono text-[9px] opacity-70">W{st.week}</span></div>
            <div className="opacity-75">{isDone ? '已考' : `资格 ${qual} 人`}</div>
          </div>
        );
      })}
    </div>
  );
}

// ===== 阶段一：选队 =====
function PickTeam({
  season, picked, setPicked, reserve, setReserve, onStart, opvName, onOpvSetup,
}: {
  season: SeasonState;
  picked: string[];
  setPicked: (v: string[]) => void;
  reserve: string[];
  setReserve: (v: string[]) => void;
  onStart: (names: string[], reserve: string[]) => void;
  opvName: string | null;
  onOpvSetup?: () => void;
}) {
  const ranked = rosterSorted(season);
  // 跨学年时 picked 里可能还留着刚毕业的名字，渲染/提交都要先过滤
  const byName = new Map(season.students.map((st) => [st.name, st]));
  const pickedValid = picked.filter((n) => byName.has(n));
  const reserveValid = reserve.filter((n) => byName.has(n) && !pickedValid.includes(n));
  const toggle = (name: string) => {
    if (pickedValid.includes(name)) setPicked(pickedValid.filter((n) => n !== name));
    else {
      setPicked([...pickedValid, name]);
      setReserve(reserveValid.filter((n) => n !== name));
    }
  };
  const toggleReserve = (name: string) => {
    if (reserveValid.includes(name)) setReserve(reserveValid.filter((n) => n !== name));
    else {
      setReserve([...reserveValid, name]);
      setPicked(pickedValid.filter((n) => n !== name));
    }
  };
  const ready = pickedValid.length >= TEAM_MIN;
  const avg = pickedValid.length
    ? pickedValid.reduce((a, n) => a + overallScoreOf(byName.get(n)!), 0) / pickedValid.length
    : 0;
  const isNewYear = season.year > 1;
  const newcomerSet = new Set(season.newcomers);
  const opvSt = opvName ? byName.get(opvName) : undefined;

  return (
    <div className="pt-5">
      {IS_OPV && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 mb-4 flex flex-wrap items-center gap-2" data-testid="opv-banner">
          <span className="text-[12px] font-bold text-amber-200"><Ic n="zap" /> OP 开局</span>
          <span className="text-[11px] text-slate-300">
            {opvSt ? (
              <>
                已按自定义数值开档：<b className="text-white">{opvSt.name}</b>
                <span className="text-slate-400">（{GRADE_NAMES[opvSt.grade]}{opvSt.age !== undefined ? ` · ${opvSt.age} 岁` : ''} · 综合 {overallScoreOf(opvSt).toFixed(1)}）</span>
              </>
            ) : (
              '当前按原始数据开档；想自证实力就回去改一份'
            )}
          </span>
          <div className="flex-1" />
          {onOpvSetup && (
            <button
              onClick={onOpvSetup}
              data-testid="opv-edit"
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-500/15"
            >
              <Ic n="settings" /> 改设置（回设置页）
            </button>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/80 p-5 mb-4">
        <div className="flex flex-wrap items-baseline gap-2 mb-1">
          <h2 className="text-base font-bold text-white">
            第 {season.year} 学年 · 选队：主力至少 {TEAM_MIN} 个（上不封顶）+ 梯队最多 12 个
          </h2>
          <span className="text-[11px] text-slate-500">一学年 {YEAR_WEEKS} 周，10 场正式比赛，其余周是训练 + 校内模拟赛</span>
        </div>
        <p className="text-[12px] text-slate-400 leading-relaxed">
          赛历按真实 OI 节奏：CSP 第一轮 → 第二轮 → NOIP → WC → 省选 → APIO → NOI → CTT → CTS → IOI，每一场都要先拿到资格。全校一张 S 卷，初赛过线才能打复赛；初中生也能考，但 NOIP 起只收高中生，初中生拿省一只能算「后备体验 / 夏令营」名额；高三打完这一年就毕业，
          每年补 6 个初一 + 4 个高一新生。教练可以一直带下去，学年末自己决定继续还是退休；梯队每周跟着练、打校内模拟赛，成长比主力慢一点，但随时可以升上来。学校声望 <b className="text-amber-300">{Math.round(season.prestige)}</b>/100，声望越高新生质量越好。
        </p>
        {isNewYear && (
          <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-2.5 py-2">
              <b className="text-rose-300"><Ic n="graduation" /> 毕业离队</b>
              <div className="text-slate-400 mt-0.5">
                {season.graduates.length
                  ? season.graduates.map((g) => `${g.name}（${g.overall.toFixed(0)}）`).join('、')
                  : '没有高三学生，没人毕业'}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-2">
              <b className="text-emerald-300"><Ic n="sparkles" /> 初一 / 高一新生</b>
              <div className="text-slate-400 mt-0.5">{season.newcomers.join('、') || '—'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 overflow-hidden">
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#0f1524] text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-10">#</th>
                  <th className="text-left px-2 py-2 font-medium">选手</th>
                  <th className="text-left px-2 py-2 font-medium">年级</th>
                  <th className="text-right px-2 py-2 font-medium">综合</th>
                  <th className="text-left px-3 py-2 font-medium">最擅长 / 最怕</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {ranked.map((st, i) => {
                  const on = pickedValid.includes(st.name);
                  const inReserve = reserveValid.includes(st.name);
                  const [best, worst] = topTopics(st);
                  return (
                    <tr
                      key={st.name}
                      onClick={() => toggle(st.name)}
                      data-testid={`pick-${i}`}
                      className={`cursor-pointer border-t border-slate-800/60 transition-colors ${
                        on ? 'bg-indigo-600/15' : inReserve ? 'bg-amber-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-3 py-1.5 text-slate-500 font-mono">{i + 1}</td>
                      <td className="px-2 py-1.5 font-bold text-slate-100">
                        {st.name}
                        {newcomerSet.has(st.name) && <span className="ml-1 text-[9px] text-emerald-300">新生</span>}
                        {st.name === opvName && <span className="ml-1 text-[9px] text-amber-300 font-bold" data-opv-tag><Ic n="zap" size={9} />OP</span>}
                        {inReserve && <span className="ml-1 text-[9px] text-amber-300">梯队</span>}
                      </td>
                      <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">
                        {GRADE_NAMES[st.grade]}{st.age !== undefined ? ` · ${st.age}岁` : ''}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-200">{overallScoreOf(st).toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">
                        <span style={{ color: TOPIC_COLORS[best.t] }}>{TOPIC_NAMES[best.t]} {kp(best.v)}</span>
                        <span className="text-slate-600"> · </span>
                        <span className="text-rose-300/80">{TOPIC_NAMES[worst.t]} {kp(worst.v)}</span>
                      </td>
                      <td className="px-1 text-center whitespace-nowrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleReserve(st.name); }}
                          title="加入 / 移出梯队"
                          className={`mr-1 text-[11px] ${inReserve ? 'text-amber-300' : 'text-slate-600 hover:text-amber-300'}`}
                        >
                          {inReserve ? <Ic n="layers" size={12} /> : <Ic n="circleDot" size={12} />}
                        </button>
                        {on ? <span className="text-indigo-300 font-bold"><Ic n="check" size={12} /></span> : <span className="text-slate-700"><Ic n="plus" size={12} /></span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-500/25 bg-[#0d1116]/90 p-4 lg:sticky lg:top-24">
          <div className="text-[11px] text-slate-400 mb-2">主力 <b className="text-white text-sm">{pickedValid.length}</b> 人（至少 {TEAM_MIN}）· 梯队 <b className="text-amber-300 text-sm">{reserveValid.length}</b> 人</div>
          <div className="space-y-1.5 mb-3 min-h-[120px]">
            {pickedValid.length === 0 && <div className="text-[11px] text-slate-600 py-8 text-center">点左边的选手加入主力；点名字前的圆点加入梯队</div>}
            {pickedValid.map((n) => {
              const st = byName.get(n)!;
              return (
                <div key={n} className="flex items-center gap-2 text-[12px] bg-indigo-600/15 rounded-lg px-2 py-1.5">
                  <span className="text-slate-200 font-bold truncate">{n}{n === opvName && <span className="ml-1 text-[9px] text-amber-300" data-opv-tag><Ic n="zap" size={9} />OP</span>}</span>
                  <span className="text-[10px] text-slate-500">{GRADE_NAMES[st.grade]}{st.age !== undefined ? ` · ${st.age}岁` : ''}</span>
                  <span className="ml-auto font-mono text-slate-400">{overallScoreOf(st).toFixed(1)}</span>
                  <button onClick={() => toggle(n)} className="text-slate-500 hover:text-rose-300"><Ic n="x" size={13} /></button>
                </div>
              );
            })}
            {reserveValid.length > 0 && (
              <div className="pt-1 text-[10px] text-amber-300/80">梯队（跟着练，不占正赛名额）</div>
            )}
            {reserveValid.map((n) => {
              const st = byName.get(n)!;
              return (
                <div key={n} className="flex items-center gap-2 text-[12px] bg-amber-500/10 rounded-lg px-2 py-1.5">
                  <span className="text-amber-100 font-bold truncate"><Ic n="layers" size={11} /> {n}</span>
                  <span className="text-[10px] text-slate-500">{GRADE_NAMES[st.grade]}</span>
                  <span className="ml-auto font-mono text-slate-400">{overallScoreOf(st).toFixed(1)}</span>
                  <button onClick={() => toggleReserve(n)} className="text-slate-500 hover:text-rose-300"><Ic n="x" size={13} /></button>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-slate-400 mb-2">
            主力平均综合 <b className="text-white">{pickedValid.length ? avg.toFixed(1) : '—'}</b>
          </div>
          <div className="flex gap-1.5 mb-2">
            <button
              onClick={() => {
                const top = rosterSorted(season);
                setPicked(top.slice(0, TEAM_MIN).map((s) => s.name));
                setReserve(top.slice(TEAM_MIN, TEAM_MIN + 6).map((s) => s.name));
              }}
              data-testid="pick-auto"
              className="flex-1 text-[11px] py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-indigo-400/50"
            >
              推荐主力 + 梯队
            </button>
            <button
              onClick={() => { setPicked([]); setReserve([]); }}
              className="flex-1 text-[11px] py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-rose-400/50"
            >
              清空
            </button>
          </div>
          <button
            disabled={!ready}
            onClick={() => onStart(pickedValid, reserveValid)}
            data-testid="start-season"
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-35 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-all"
          >
            {ready
              ? season.year === 1 ? <><Ic n="graduation" /> 开始第 1 学年</> : <><Ic n="graduation" /> 进入第 {season.year} 学年</>
              : `至少选 ${TEAM_MIN} 人`}
          </button>
        </div>
      </div>

    </div>
  );
}

function topTopics(st: SeasonStudent): [{ t: Topic; v: number }, { t: Topic; v: number }] {
  const arr = TOPIC_LIST.map((t) => ({ t, v: st.skills.topics[t] })).sort((a, b) => b.v - a.v);
  return [arr[0], arr[arr.length - 1]];
}

// ===== 阶段二：排本周训练 =====
function PlanWeek({
  season, onPlan, onEvent,
}: {
  season: SeasonState;
  onPlan: (p: WeekPlan) => void;
  onEvent: (optionId: string) => void;
}) {
  const lastPlan = season.lastPlan ?? null;
  const [topic, setTopic] = useState<Topic | null>(lastPlan?.topic ?? null);
  const [intensity, setIntensity] = useState<WeekIntensity>(lastPlan?.intensity ?? 'normal');
  const [focus, setFocus] = useState<SquadFocus>(lastPlan?.focus ?? 'balanced');
  const [mock, setMock] = useState<MockConfig>(lastPlan?.mock ?? { preset: 'normal', problemCount: 3, minutes: 180 });
  const team = teamStudents(season);
  const teamAvg = (t: Topic) => team.reduce((a, s) => a + s.skills.topics[t], 0) / Math.max(1, team.length);
  const avgFatigue = team.reduce((a, s) => a + s.fatigue, 0) / Math.max(1, team.length);
  const weakest = TOPIC_LIST.slice().sort((a, b) => teamAvg(a) - teamAvg(b))[0];
  const canGo = intensity === 'rest' || topic !== null;
  const event = season.pendingEvent;
  const stage = stageOfWeek(season.week);

  return (
    <div className="pt-5">
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/80 p-5 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-base font-bold text-white mb-1">
            第 {season.year} 学年 · 第 {season.week} 周 · 排训练
          </h2>
          <p className="text-[12px] text-slate-400">
            全队这周只练一个专题。队伍 <b className="text-white">{team.length}</b> 人，平均疲劳 <b className={avgFatigue > 65 ? 'text-rose-300' : 'text-slate-200'}>{Math.round(avgFatigue)}</b>。
          </p>
        </div>
        {!event && (
          <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
            最弱专题：{TOPIC_NAMES[weakest]}（{kp(teamAvg(weakest))}/150）— 补短板通常比拔尖划算
          </div>
        )}
      </div>

      <CalendarStrip season={season} />

      {stage && (
        <div className="mb-4 rounded-xl border border-indigo-500/35 bg-indigo-500/[0.08] px-4 py-3" data-testid="stage-notice">
          <div className="flex flex-wrap items-baseline gap-2">
            <b className="text-indigo-200"><Ic n="flag" /> 本周有正式比赛：{stage.name}</b>
            <span className="text-[11px] text-slate-400">{stage.clock}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {stage.kind === 'prelim'
              ? `100 分笔试：陕西统一划 ${PRELIM_LINE} 分线，过线即进第二轮；官方只规定晋级人数不少于实考 20%（下限保障），强校过线率通常高于全省平均。`
              : `${stage.levels.length} 题 · ${stage.minutes} 分钟${stage.days > 1 ? ` × ${stage.days} 天` : ''}，满分 ${stage.levels.length * 100 * stage.days}；按官方线发奖：${stage.id === 'csp2' ? 'S 一等 100 分（陕西 157 人 / 785 人参赛）' : stage.id === 'noip' ? '陕西一等 128、二等 95、三等 86' : '按全国分数线'}。资格：${stage.gateText}（现在有 ${qualifiedFor(season, stage)} 人够资格）。`}
          </div>
        </div>
      )}

      {lastPlan && !event && (() => {
        const t = lastPlan.topic;
        const changed = t !== topic || lastPlan.intensity !== intensity || lastPlan.focus !== focus;
        return (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2" data-testid="last-plan">
            <span className="text-[11px] text-slate-300">
              <Ic n="pin" /> 上周：{t ? TOPIC_NAMES[t] : '休息'} · {INTENSITY_INFO[lastPlan.intensity].name}
              {!stage && lastPlan.mock ? ` · 模拟赛 ${MOCK_PRESETS[lastPlan.mock.preset].name} ${lastPlan.mock.problemCount} 题 ${lastPlan.mock.minutes} 分` : ''}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => {
                setTopic(lastPlan.topic);
                setIntensity(lastPlan.intensity);
                if (lastPlan.focus) setFocus(lastPlan.focus);
                if (lastPlan.mock) setMock(lastPlan.mock);
              }}
              className="rounded-md border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700/50"
            >
              {changed ? '恢复成上周' : '已沿用'}
            </button>
            <button
              onClick={() => onPlan(lastPlan)}
              data-testid="plan-same-as-last"
              className="rounded-md bg-slate-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-600"
            >
              一字不改，直接排
            </button>
          </div>
        );
      })()}

      {event && <EventCard ev={event} season={season} onPick={onEvent} />}

      {!event && (
        <>
          {season.lastEventResult && (
            <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-200/90">
              <b className="mr-1.5"><Ic n="pin" /> 本周插曲</b>{season.lastEventResult}
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
                <div className="text-[11px] text-slate-400 mb-2">专题（队伍当前水平）</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TOPIC_LIST.map((t) => {
                    const v = teamAvg(t);
                    const active = topic === t;
                    return (
                      <button
                        key={t}
                        disabled={intensity === 'rest'}
                        data-testid={`topic-${t}`}
                        onClick={() => setTopic(t)}
                        className={`text-left rounded-lg px-2.5 py-2 border transition-all disabled:opacity-40 ${
                          active ? 'border-indigo-400/70 bg-indigo-600/20' : 'border-slate-700/70 bg-slate-800/50 hover:border-indigo-400/40'
                        }`}
                      >
                        <div className="text-[12px] font-bold text-slate-100">{TOPIC_NAMES[t]}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="h-1.5 flex-1 bg-slate-700/70 rounded overflow-hidden">
                            <div className="h-full rounded" style={{ width: `${Math.min(100, pct(v))}%`, backgroundColor: TOPIC_COLORS[t] }} />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{kp(v)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {stage ? (
                // 正赛周的周末不跑模拟赛，这些设置传进 planWeek 也不会生效。
                // 与其让玩家调完一堆滑块却发现毫无作用，不如直接说明白。
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4" data-testid="mock-disabled">
                  <div className="text-[12px] font-bold text-slate-300">周末校内模拟赛 · 本周不开放</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    第 {season.week} 周是 <b className="text-indigo-300">{stage.short}</b> 正赛周，赛历里没有模拟赛，难度 / 题数 / 时长设置本周不会生效，留到下一个训练周再调。
                    本周训练照常有效：专题、强度、教练精力分配都会影响正赛状态。
                  </div>
                </div>
              ) : (
              <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
                <div className="flex flex-wrap items-baseline gap-2 mb-2">
                  <span className="text-[11px] text-slate-400">周末校内模拟赛</span>
                  <span className="text-[10px] text-slate-500">难度贴近比赛才涨棋；也可以直接去周末正式比赛</span>
                </div>
                <div className="grid sm:grid-cols-3 gap-2 mb-3">
                  {(Object.keys(MOCK_PRESETS) as MockPreset[]).map((k) => {
                    const info = MOCK_PRESETS[k];
                    const active = mock.preset === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setMock({ ...mock, preset: k })}
                        data-testid={`mock-${k}`}
                        className={`text-left rounded-lg px-3 py-2 border transition-all ${
                          active ? 'border-sky-400/70 bg-sky-600/15' : 'border-slate-700/70 bg-slate-800/50 hover:border-sky-400/40'
                        }`}
                      >
                        <div className="text-[12px] font-bold text-slate-100">{info.name}档</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{info.note}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>题数</span><b className="text-white font-mono">{mock.problemCount}</b>
                    </div>
                    <input
                      type="range" min={1} max={6} step={1} value={mock.problemCount}
                      onChange={(e) => setMock({ ...mock, problemCount: Number(e.target.value) })}
                      data-testid="mock-count"
                      className="w-full accent-sky-400"
                    />
                  </label>
                  <label className="block">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>时长</span><b className="text-white font-mono">{mock.minutes} 分钟</b>
                    </div>
                    <input
                      type="range" min={60} max={300} step={30} value={mock.minutes}
                      onChange={(e) => setMock({ ...mock, minutes: Number(e.target.value) })}
                      data-testid="mock-minutes"
                      className="w-full accent-sky-400"
                    />
                  </label>
                </div>
              </div>
              )}

              <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
                <div className="flex flex-wrap items-baseline gap-2 mb-2">
                  <span className="text-[11px] text-slate-400">教练精力分配</span>
                  <span className="text-[10px] text-slate-500">主力 {team.length} 人 · 梯队 {reserveStudents(season).length} 人</span>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  {(Object.keys(SQUAD_FOCUS_INFO) as SquadFocus[]).map((k) => {
                    const info = SQUAD_FOCUS_INFO[k];
                    const active = focus === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setFocus(k)}
                        data-testid={`focus-${k}`}
                        className={`text-left rounded-lg px-3 py-2 border transition-all ${
                          active ? 'border-amber-400/70 bg-amber-600/15' : 'border-slate-700/70 bg-slate-800/50 hover:border-amber-400/40'
                        }`}
                      >
                        <div className="text-[12px] font-bold text-slate-100"><Ic n={info.icon} /> {info.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{info.note}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
                <div className="text-[11px] text-slate-400 mb-2">强度</div>
                <div className="grid sm:grid-cols-3 gap-2">
                  {(Object.keys(INTENSITY_INFO) as WeekIntensity[]).map((k) => {
                    const info = INTENSITY_INFO[k];
                    const active = intensity === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setIntensity(k)}
                        data-testid={`intensity-${k}`}
                        className={`text-left rounded-lg px-3 py-2.5 border transition-all ${
                          active ? 'border-emerald-400/70 bg-emerald-600/15' : 'border-slate-700/70 bg-slate-800/50 hover:border-emerald-400/40'
                        }`}
                      >
                        <div className="text-[12px] font-bold text-slate-100"><Ic n={info.icon} /> {info.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{info.note}</div>
                      </button>
                    );
                  })}
                </div>
                {intensity === 'extra' && avgFatigue > 40 && (
                  <div className="mt-2 text-[11px] text-rose-300/90">队伍已经偏累了，继续加练周末比赛容易崩。</div>
                )}
              </div>

              <button
                disabled={!canGo}
                onClick={() => onPlan({ topic: intensity === 'rest' ? null : topic, intensity, focus, mock })}
                data-testid="plan-confirm"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-35 text-white font-bold text-sm shadow-lg shadow-indigo-900/30"
              >
                {intensity === 'rest' ? <><Ic n="coffee" /> 本周休息，进入周末</> : <><Ic n="book" /> 排入本周训练</>}
              </button>
            </div>

            <TeamPanel season={season} />
          </div>
        </>
      )}
    </div>
  );
}

// ===== 本周插曲：事件卡 =====
function EventCard({ ev, season, onPick }: { ev: PendingEvent; season: SeasonState; onPick: (optionId: string) => void }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5 mb-4">
      <div className="flex items-center gap-2 mb-2" data-testid="event-card">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">{ev.tag}</span>
        <span className="text-[10px] text-amber-200/60 font-mono">第 {ev.week} 周 · 本周插曲</span>
        <div className="flex-1" />
        <span className="text-[10px] text-slate-500">处理完才能排训练</span>
      </div>
      <h3 className="text-base font-bold text-white mb-1.5">「{ev.title}」</h3>
      <p className="text-[12px] text-slate-300 leading-relaxed mb-4">{ev.text}</p>
      <QuoteLine name={ev.target} seed={season.seed + ev.week} />
      <div className="grid sm:grid-cols-3 gap-2">
        {ev.options.map((o) => (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            data-testid={`event-opt-${o.id}`}
            className="text-left rounded-xl border border-slate-700/70 bg-[#0d1116]/80 px-3 py-2.5 hover:border-amber-400/50 hover:bg-amber-500/10 transition-all"
          >
            <div className="text-[12px] font-bold text-slate-100">{o.label}</div>
            <div className="text-[10px] text-slate-400 mt-1 leading-snug">{o.note}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== 阶段三：训练报告 =====
function ReportView({ season, report, onRun }: { season: SeasonState; report: TrainingReport; onRun: () => void }) {
  const plan = report.plan;
  const tone = { good: 0, ok: 0, flat: 0, bad: 0 } as Record<TrainingLine['tone'], number>;
  report.lines.forEach((l) => { tone[l.tone] += 1; });
  const stage = stageOfWeek(season.week);
  const quoted = report.lines.find((l) => quoteFor(l.name, season.seed + report.week));
  return (
    <div className="pt-5">
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/80 p-5 mb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-base font-bold text-white">
            第 {report.week} 周 · {plan.intensity === 'rest' ? '休息' : `练 ${plan.topic ? TOPIC_NAMES[plan.topic] : '自由训练'}`}
          </h2>
          <span className="text-[11px] text-slate-500">周中 · 教练的模糊观察（没有精确数字）</span>
        </div>
        <div className="flex gap-3 mt-2 text-[11px]">
          <span className="text-emerald-300"><Ic n="trendUp" /> 状态好 {tone.good}</span>
          <span className="text-sky-300"><Ic n="smile" /> 还行 {tone.ok}</span>
          <span className="text-slate-400"><Ic n="meh" /> 一般 {tone.flat}</span>
          <span className="text-rose-300"><Ic n="frown" /> 白练 {tone.bad}</span>
        </div>
        {quoted && <QuoteLine name={quoted.name} seed={season.seed + report.week} />}
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="space-y-2">
          {report.lines.map((l) => {
            const t = TONE[l.tone];
            return (
              <div key={l.name} className={`rounded-xl border ${t.ring} bg-[#0d1116]/70 px-3.5 py-2.5 flex items-center gap-3`}>
                <div className="text-lg"><Ic n={t.icon} size={20} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-slate-100">{l.name}</div>
                  <div className={`text-[11px] ${t.text}`}>{l.text}</div>
                </div>
                <div className="w-20 shrink-0">
                  <div className="text-[9px] text-slate-500 mb-0.5">疲劳</div>
                  <div className="h-1.5 bg-slate-700/70 rounded overflow-hidden">
                    <div className={`h-full ${l.fatigue > 65 ? 'bg-rose-400' : l.fatigue > 40 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${l.fatigue}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
            <div className="text-[11px] text-slate-400 mb-2">周末安排</div>
            {stage ? (
              <>
                <div className="text-[12px] font-bold text-indigo-200 mb-1">{stage.name}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                  {stage.clock} · {stage.kind === 'prelim' ? `100 分笔试（S 组 ${PRELIM_LINE} 分线，过线即晋级）` : stage.id === 'csp2' ? 'S 组 4 题 240 分钟' : `${stage.levels.length} 题 ${stage.minutes} 分钟${stage.days > 1 ? ` × ${stage.days} 天` : ''}`}
                  ；资格：{stage.kind === 'prelim' ? '全员' : `${stage.gateText}（${qualifiedFor(season, stage)} 人）`}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                本周没有正式比赛，周六跑一场 3 题 · 3 小时的校内模拟赛，只给状态反馈、不计成绩。
              </p>
            )}
            <button
              onClick={onRun}
              data-testid="run-contest"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30"
            >
              {stage ? <><Ic n="flag" /> {stage.short}：开考</> : <><Ic n="flag" /> 周末：模拟赛</>}
            </button>
          </div>
          <TeamPanel season={season} />
        </div>
      </div>
    </div>
  );
}

// ===== 阶段四：赛后 =====
function ResultView({ season, recap, onNext }: { season: SeasonState; recap: ContestRecap; onNext: () => void }) {
  const isTeam = (n: string) => season.team.includes(n);
  const lastWeek = season.week > YEAR_WEEKS;
  const nextLabel = lastWeek
    ? season.year >= season.careerYears ? '查看生涯结算' : '学年结束 · 继续或退休'
    : `进入第 ${season.week} 周`;

  return (
    <div className="pt-5">
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/80 p-5 mb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-base font-bold text-white">{recap.title}</h2>
          <span className="text-[11px] text-slate-500">
            {recap.kind === 'prelim'
              ? '100 分笔试 · S 组'
              : `${recap.days > 1 ? `两试 · 每试 ` : ''}${recap.levels.map((lv) => levelInfo(lv).name).join(' / ')} · ${recap.minutes} 分钟 · 满分 ${recap.fullScore}`}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
            第 {recap.year} 学年 · 第 {recap.week} 周
          </span>
        </div>
        {recap.note && <div className="text-[11px] text-slate-400 mt-1.5">{recap.note}</div>}
        {recap.kind === 'official' && recap.awards && recap.awards.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2" data-testid="awards">
            {recap.awards.map((a) => (
              <span key={`${a.name}-${a.label}`} className={`text-[10px] px-1.5 py-0.5 rounded border ${AWARD_STYLE[a.tone]}`}>
                {a.name} · {a.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {recap.kind === 'prelim' && recap.prelim && (
        <PrelimResult recap={recap} isTeam={isTeam} onNext={onNext} nextLabel={nextLabel} />
      )}
      {recap.kind === 'official' && (
        <OfficialResult season={season} recap={recap} isTeam={isTeam} onNext={onNext} nextLabel={nextLabel} />
      )}
      {recap.kind === 'practice' && (
        <PracticeResult recap={recap} isTeam={isTeam} onNext={onNext} nextLabel={nextLabel} />
      )}
      <div className="mt-3 text-[11px] text-slate-500">
        当前累计：省一 {countAwards(season, 'prov1')}、省队 {countAwards(season, 'team')}、NOI 牌 {countNoi(season)}
      </div>
    </div>
  );
}

const countAwards = (s: SeasonState, tone: AwardRow['tone']) =>
  s.contests.reduce((a, c) => a + (c.awards ?? []).filter((x) => x.tone === tone).length, 0);
const countNoi = (s: SeasonState) =>
  s.contests.filter((c) => c.stageId === 'noi').reduce((a, c) => a + (c.awards ?? []).length, 0);

function PrelimResult({
  recap, isTeam, onNext, nextLabel,
}: {
  recap: ContestRecap; isTeam: (n: string) => boolean; onNext: () => void; nextLabel: string;
}) {
  const rows = (recap.prelim ?? []).slice().sort((a, b) => b.score - a.score);
  const passed = rows.filter((r) => r.passed).length;
  const teamRows = rows.filter((r) => isTeam(r.name));
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
        <div className="flex flex-wrap items-baseline gap-3 mb-2 text-[12px]">
          <span className="text-slate-400">全校晋级 <b className="text-emerald-300">{passed}</b>/{rows.length}</span>
          <span className="text-slate-400">队里晋级 <b className="text-indigo-300">{teamRows.filter((r) => r.passed).length}</b>/{teamRows.length}</span>
          <span className="text-slate-500">S 线 {recap.cutoff} · 过线即晋级</span>
        </div>
        <table className="w-full text-[12px]" data-testid="national-table">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left px-2 py-1 font-medium w-10">#</th>
              <th className="text-left px-2 py-1 font-medium">选手</th>
              <th className="text-right px-2 py-1 font-medium">初赛分</th>
              <th className="text-right px-2 py-1 font-medium">全国排名</th>
              <th className="text-right px-2 py-1 font-medium">结果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={`border-t border-slate-800/60 ${isTeam(r.name) ? 'bg-indigo-600/10' : ''}`}>
                <td className="px-2 py-1 text-slate-500 font-mono">{i + 1}</td>
                <td className="px-2 py-1 text-slate-100">{r.name}{isTeam(r.name) && <span className="ml-1 text-[9px] text-indigo-300"><Ic n="graduation" size={9} /></span>}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-100">{r.score}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-400">
                  {r.nationalRank ? <>#{r.nationalRank.toLocaleString()}<span className="ml-1 text-[9px] text-slate-500">前 {((r.pct ?? 1) * 100).toFixed(1)}%</span></> : '—'}
                </td>
                <td className="px-2 py-1 text-right">
                  {r.passed ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">进复赛</span>
                    : <span className="text-[10px] text-slate-600">未过线</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 lg:sticky lg:top-24">
        <button onClick={onNext} data-testid="result-next" className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm">
          {nextLabel}
        </button>
        <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4 text-[11px] text-slate-400 leading-relaxed">
          初赛考的是阅读程序和完善程序，跟刷专题的关联没有复赛大；但没过线就只能在看台上等一年。
          <div className="mt-2 text-slate-500">
            CSP 只要当年 9 月 1 日前满 12 周岁就能报名，J/S 可同时报；陕西 2026 年第一轮 9 月 19 日、第二轮 10 月 31 日。
            官方规定晋级人数<b className="text-slate-400">不少于</b>第一轮实考的 20%（下限保障，不是上限）；本校是强校，过线率高于全省平均很正常。
          </div>
        </div>
      </div>
    </div>
  );
}

function OfficialResult({
  season, recap, isTeam, onNext, nextLabel,
}: {
  season: SeasonState; recap: ContestRecap; isTeam: (n: string) => boolean; onNext: () => void; nextLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = recap.rows;
  const top = rows.slice(0, 15);
  const awardOf = new Map((recap.awards ?? []).map((a) => [a.name, a]));
  const provStage = recap.stageId === 'csp2' || recap.stageId === 'noip' || recap.stageId === 'prov';
  const natOf = new Map((recap.national?.rows ?? []).map((r) => [r.name, r]));
  const teamRows = rows.filter((r) => isTeam(r.name));
  const quoted = teamRows.find((r) => quoteFor(r.name, recap.week * 7919 + recap.year * 131));
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-6">
        <p className="text-[12px] text-slate-400">{recap.note ?? '没有人参加这场比赛。'}</p>
        <button onClick={onNext} data-testid="result-next" className="mt-4 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">
          {nextLabel}
        </button>
      </div>
    );
  }
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[11px] text-slate-400">
            榜单（{rows.length} 人参赛{recap.national ? (recap.stageId === 'csp1' ? ' · 全国约 S 3.44 万 / J 5.78 万' : ` · ${provStage ? '陕西' : '全国'}约 ${recap.national.total.toLocaleString()} 人`) : ''}）
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowAll((v) => !v)} className="text-[11px] text-indigo-300 hover:text-indigo-200">
            {showAll ? '只看前 15' : '看完整榜单'}
          </button>
        </div>
        <table className="w-full text-[12px]" data-testid="national-table">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left px-2 py-1 font-medium w-10">#</th>
              <th className="text-left px-2 py-1 font-medium">选手</th>
              <th className="text-right px-2 py-1 font-medium">{recap.stageId === 'prov' ? '折算总分' : '真分'}</th>
              <th className="text-right px-2 py-1 font-medium">自估</th>
              <th className="text-right px-2 py-1 font-medium">挂分</th>
              <th className="text-right px-2 py-1 font-medium">{provStage ? '省排名（陕西）' : '全国排名'}</th>
              <th className="text-left px-2 py-1 font-medium">成绩</th>
            </tr>
          </thead>
          <tbody>
            {(showAll ? rows : top).map((r) => {
              const a = awardOf.get(r.name);
              const nat = natOf.get(r.name);
              return (
                <tr key={r.name} className={`border-t border-slate-800/60 ${isTeam(r.name) ? 'bg-indigo-600/10' : ''}`}>
                  <td className="px-2 py-1 text-slate-500 font-mono">{r.rank}</td>
                  <td className="px-2 py-1 text-slate-100">
                    {r.name}{isTeam(r.name) && <span className="ml-1 text-[9px] text-indigo-300"><Ic n="graduation" size={9} /></span>}
                    {recap.stageId === 'noi' && r.written != null && (
                      <div className="text-[9px] text-sky-300 leading-tight">笔试 {r.written}</div>
                    )}
                    {nat?.note && (nat.note.startsWith('国集') || nat.note.startsWith('答辩') || nat.note.startsWith('积分')) && (
                      <div className="text-[9px] text-fuchsia-300 leading-tight">{nat.note}</div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-slate-100">
                    {recap.stageId === 'prov' ? (nat?.score ?? Math.round(r.real)) : r.real}
                    {recap.stageId === 'prov' && nat?.raw != null && (
                      <div className="text-[9px] text-slate-500 leading-tight">原始 {nat.raw}</div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-slate-500">{r.est}</td>
                  <td className={`px-2 py-1 text-right font-mono ${r.delta < 0 ? 'text-rose-300' : r.delta > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-slate-400">
                    {nat ? <>#{nat.rank.toLocaleString()}<span className="ml-1 text-[9px] text-slate-500">前 {(nat.pct * 100).toFixed(1)}%</span></> : '—'}
                  </td>
                  <td className="px-2 py-1">
                    {a ? <span className={`text-[10px] px-1.5 py-0.5 rounded border ${AWARD_STYLE[a.tone]}`}>{a.label}</span> : <span className="text-[10px] text-slate-600">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {recap.defense && recap.defense.length > 0 && (
          <div className="mt-4 border-t border-slate-800/60 pt-3">
            <div className="text-[11px] text-slate-400 mb-1.5">论文答辩 · 前 6 → 前 4（纯派生：作业 40% + NOI 25% + 阅读表达 20% + CTS 15%）</div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {recap.defense.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-200 truncate">{d.name}</span>
                  <span className="ml-auto font-mono text-slate-400">{(d.score * 100).toFixed(1)}</span>
                  <span className={`font-mono ${d.rank <= 4 ? 'text-emerald-300' : 'text-slate-500'}`}>#{d.rank}</span>
                  <span className={`text-[9px] ${d.rank <= 4 ? 'text-emerald-300' : 'text-slate-600'}`}>{d.rank <= 4 ? '国家队' : '未入队'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-3 lg:sticky lg:top-24">
        <button onClick={onNext} data-testid="result-next" className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm">
          {nextLabel}
        </button>
        <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
          <div className="text-[11px] text-slate-400 mb-2">队里成绩</div>
          <div className="space-y-1.5">
            {teamRows.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-200 truncate">{r.name}</span>
                <span className="ml-auto font-mono text-slate-300">{r.real}</span>
                <span className="font-mono text-slate-500">#{r.rank}</span>
              </div>
            ))}
          </div>
          {quoted && <QuoteLine name={quoted.name} seed={recap.week * 7919 + recap.year * 131} />}
        </div>
        <TeamPanel season={season} />
      </div>
    </div>
  );
}

function PracticeResult({
  recap, isTeam, onNext, nextLabel,
}: {
  recap: ContestRecap; isTeam: (n: string) => boolean; onNext: () => void; nextLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const top = recap.rows.slice(0, 12);
  const teamRows = recap.rows.filter((r) => isTeam(r.name));
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4 items-start">
      <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[11px] text-slate-400">模拟赛榜单</div>
          <div className="flex-1" />
          <button onClick={() => setShowAll((v) => !v)} className="text-[11px] text-indigo-300 hover:text-indigo-200">
            {showAll ? '只看前 12' : '看完整榜单'}
          </button>
        </div>
        <table className="w-full text-[12px]">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left px-2 py-1 font-medium w-12">#</th>
              <th className="text-left px-2 py-1 font-medium">选手</th>
              <th className="text-right px-2 py-1 font-medium">真分</th>
              <th className="text-right px-2 py-1 font-medium">自估</th>
              <th className="text-right px-2 py-1 font-medium">挂分</th>
            </tr>
          </thead>
          <tbody>
            {(showAll ? recap.rows : top).map((r) => (
              <tr key={r.name} className={`border-t border-slate-800/60 ${isTeam(r.name) ? 'bg-indigo-600/10' : ''}`}>
                <td className="px-2 py-1 text-slate-500 font-mono">{r.rank}</td>
                <td className="px-2 py-1 text-slate-100">{r.name}{isTeam(r.name) && <span className="ml-1 text-[9px] text-indigo-300"><Ic n="graduation" size={9} /></span>}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-100">{r.real}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-500">{r.est}</td>
                <td className={`px-2 py-1 text-right font-mono ${r.delta < 0 ? 'text-rose-300' : r.delta > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!showAll && teamRows.some((r) => r.rank > 12) && (
          <div className="mt-2 text-[10px] text-slate-500">
            队里还有 {teamRows.filter((r) => r.rank > 12).length} 人在 12 名开外：{teamRows.filter((r) => r.rank > 12).map((r) => `${r.name}#${r.rank}`).join('、')}
          </div>
        )}
      </div>
      <div className="space-y-3 lg:sticky lg:top-24">
        <button onClick={onNext} data-testid="result-next" className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm">
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

// ===== 学年末：继续 or 退休 =====
function YearEnd({
  season, onContinue, onRetire,
}: {
  season: SeasonState; onContinue: () => void; onRetire: () => void;
}) {
  const rep: CareerReport = seasonReport(season);
  const y = season.history[season.history.length - 1];
  const t = rep.totals;
  const quoted = season.team
    .map((n) => season.students.find((st) => st.name === n))
    .find((st) => st && quoteFor(st.name, season.seed + season.year));
  return (
    <div className="pt-5" data-testid="year-end">
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-[#10140f] to-[#0a0d11] p-6 mb-4">
        <div className="text-[11px] text-slate-400 mb-1">第 {season.year} 学年结束 · 教练可以继续带，也可以在这里退休</div>
        <h2 className="text-xl font-black text-white mb-2"><Ic n="calendar" /> 学年结算</h2>
        <div className="flex flex-wrap gap-6 text-[12px] mb-3">
          <Stat label="本年省一（S/NOIP）" value={`${(y?.csp2First ?? 0) + (y?.noipFirst ?? 0)}`} tone="text-amber-300" />
          <Stat label="本年省队" value={`${y?.provTeam ?? 0}`} tone="text-rose-300" />
          <Stat label="本年 NOI 牌" value={`${(y?.noiGold ?? 0) + (y?.noiSilver ?? 0) + (y?.noiBronze ?? 0)}`} tone="text-emerald-300" />
          <Stat label="本年国集 / 保送" value={`${y?.noiSelected ?? 0}`} tone="text-violet-300" />
          <Stat label="本年综合提升" value={`+${Math.max(0, y?.avgOverallGain ?? 0).toFixed(1)}`} tone="text-sky-300" />
        </div>
        <div className="text-[11px] text-slate-500">
          生涯累计：省一 {t.csp2First + t.noipFirst} · 省队 {t.provTeam} · NOI 牌 {t.noiGold + t.noiSilver + t.noiBronze} · 国集 {t.noiSelected} · CTT {t.cttSelected} / CTS {t.ctsSelected} · IOI 牌 {t.ioiGold + t.ioiSilver + t.ioiBronze}
        </div>
        {quoted && <QuoteLine name={quoted.name} seed={season.seed + season.year} />}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <button
          onClick={onContinue}
          data-testid="continue-career"
          className="py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold text-sm"
        >
          <Ic n="calendar" /> 继续带队 · 进入第 {season.year + 1} 学年
        </button>
        <button
          onClick={onRetire}
          data-testid="retire-career"
          className="py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 font-bold text-sm"
        >
          <Ic n="trophy" /> 退休 · 查看生涯评价
        </button>
      </div>
      <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
        继续带队：学生升一级，高三毕业，补 6 个初一 + 4 个高一新生；梯队在下一学年重新选。
        退休：按「每年平均产出 + 生涯高光」结算教练评分。
      </div>
    </div>
  );
}

// ===== 阶段五：生涯结算 =====
function Finale({ season, onNew }: { season: SeasonState; onNew: () => void }) {
  const rep: CareerReport = seasonReport(season);
  const t = rep.totals;
  const quoted = season.team
    .map((n) => season.students.find((st) => st.name === n))
    .find((st) => st && quoteFor(st.name, season.seed + season.year));
  return (
    <div className="pt-5">
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-[#10140f] to-[#0a0d11] p-6 mb-4 text-center">
        <div className="text-[11px] text-slate-400 mb-1">{season.history.length || season.year} 年带训结束 · 第 {season.year} 学年</div>
        <div data-testid="finale-grade" className="text-3xl font-black text-white mb-1">{rep.grade}</div>
        <div className="text-[13px] text-slate-300 max-w-xl mx-auto leading-relaxed">{rep.comment}</div>
        {quoted && <QuoteLine name={quoted.name} seed={season.seed + season.year} />}
        <div className="flex flex-wrap justify-center gap-6 mt-4 text-[12px]">
          <Stat label="教练评分" value={`${rep.coachScore}`} tone="text-indigo-300" />
          <Stat label="省一（S/NOIP）" value={`${t.csp2First + t.noipFirst}`} tone="text-amber-300" />
          <Stat label="省队" value={`${t.provTeam}`} tone="text-rose-300" />
          <Stat label="NOI 奖牌" value={`${t.noiGold + t.noiSilver + t.noiBronze}`} tone="text-emerald-300" />
          <Stat label="国集 / 保送" value={`${t.noiSelected}`} tone="text-fuchsia-300" />
          <Stat label="CTT / CTS" value={`${t.cttSelected} / ${t.ctsSelected}`} tone="text-violet-300" />
          <Stat label="IOI 奖牌" value={`${t.ioiGold + t.ioiSilver + t.ioiBronze}`} tone="text-cyan-300" />
          <Stat label="平均综合提升" value={`+${Math.max(0, rep.avgOverallGain).toFixed(1)}`} tone="text-sky-300" />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-4 items-start">
        <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
          <div className="text-[11px] text-slate-400 mb-2">逐年战绩</div>
          <table className="w-full text-[12px]">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left px-2 py-1 font-medium">学年</th>
                <th className="text-right px-2 py-1 font-medium">初赛晋级</th>
                <th className="text-right px-2 py-1 font-medium">省一</th>
                <th className="text-right px-2 py-1 font-medium">省队</th>
                <th className="text-right px-2 py-1 font-medium">NOI 牌</th>
                <th className="text-right px-2 py-1 font-medium">综合+</th>
              </tr>
            </thead>
            <tbody>
              {rep.years.map((y) => {
                const noi = y.noiGold + y.noiSilver + y.noiBronze;
                return (
                  <tr key={y.year} className="border-t border-slate-800/60">
                    <td className="px-2 py-1.5 text-slate-100">第 {y.year} 学年</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-400">{y.csp1Pass}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-amber-300">{y.csp2First + y.noipFirst}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-rose-300">{y.provTeam}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-emerald-300">{noi || '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-sky-300">+{y.avgOverallGain.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 text-[11px] text-slate-500">
            累计：初赛晋级 {t.csp1Pass} · S 组省一 {t.csp2First} · NOIP 省一 {t.noipFirst} · 省队 {t.provTeam} · WC 金 {t.wcGold} 银 {t.wcSilver} · APIO 金 {t.apioGold} 银 {t.apioSilver} 铜 {t.apioBronze} · NOI 金 {t.noiGold} 银 {t.noiSilver} 铜 {t.noiBronze} · CTT {t.cttSelected} / CTS {t.ctsSelected} · IOI 金 {t.ioiGold} 银 {t.ioiSilver} 铜 {t.ioiBronze}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-4">
            <div className="text-[11px] text-slate-400 mb-2">最后一届队员</div>
            <table className="w-full text-[12px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left px-2 py-1 font-medium">选手</th>
                  <th className="text-left px-2 py-1 font-medium">年级</th>
                  <th className="text-right px-2 py-1 font-medium">综合</th>
                  <th className="text-right px-2 py-1 font-medium">结果</th>
                </tr>
              </thead>
              <tbody>
                {rep.team.slice().sort((a, b) => b.endOverall - a.endOverall).map((r) => (
                  <tr key={r.name} className="border-t border-slate-800/60">
                    <td className="px-2 py-1.5 text-slate-100">{r.name}</td>
                    <td className="px-2 py-1.5 text-slate-400">{GRADE_NAMES[r.grade]}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-400">{r.startOverall.toFixed(0)} <span className="text-emerald-400"><Ic n="arrowRight" size={10} /> {r.endOverall.toFixed(0)}</span></td>
                    <td className="px-2 py-1.5 text-right">
                      {r.provTeam ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300">省队</span>
                        : r.noipFirst || r.csp2Award === 1 ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">{'省一'}</span>
                          : <span className="text-[10px] text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={onNew} data-testid="finale-new" className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm">
              <Ic n="refresh" /> 再带一届
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className={`text-xl font-black ${tone}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

/** 教练模式彩蛋：有专属语录才显示，没有就什么都不渲染 */
function QuoteLine({ name, seed }: { name: string | null; seed: number }) {
  const q = quoteFor(name, seed);
  if (!q || !name) return null;
  return (
    <div className="mt-1 text-[10px] text-slate-500 leading-snug">
      <span className="text-amber-300/70">{name}：</span>“{plainText(q.text)}”
    </div>
  );
}

// ===== 侧边：队伍状态 =====
function TeamPanel({ season }: { season: SeasonState }) {
  const team = teamStudents(season);
  const reserve = reserveStudents(season);
  const [openName, setOpenName] = useState<string | null>(null);
  const renderOne = (st: SeasonStudent) => {
    const expanded = openName === st.name;
    return (
      <div key={st.name} className="text-[11px]">
        <button
          type="button"
          onClick={() => setOpenName(expanded ? null : st.name)}
          data-testid={`student-detail-${st.name}`}
          aria-expanded={expanded}
          className="block w-full text-left rounded px-1 -mx-1 py-0.5 hover:bg-slate-700/30"
        >
          <div className="flex items-center gap-1.5">
            <span className={`truncate ${st.onReserve ? 'text-amber-100' : 'text-slate-200'}`}>{st.onReserve ? <><Ic n="layers" size={10} /> </> : null}{st.name}</span>
            <span className="text-[9px] text-slate-500">{GRADE_NAMES[st.grade]}</span>
            <span className="ml-auto font-mono text-slate-400">{overallScoreOf(st).toFixed(1)}</span>
          </div>
          <div className="h-1 mt-0.5 bg-slate-700/60 rounded overflow-hidden">
            <div
              className={`h-full ${st.fatigue > 65 ? 'bg-rose-400' : st.fatigue > 40 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${st.fatigue}%` }}
            />
          </div>
        </button>
        {expanded && <StudentDetail student={st} />}
      </div>
    );
  };
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-[#0d1116]/70 p-3">
      <div className="text-[11px] text-slate-400 mb-2">队伍状态 · 主力 {team.length} / 梯队 {reserve.length}</div>
      <div className="space-y-1.5">
        {team.map(renderOne)}
        {reserve.length > 0 && <div className="pt-1 text-[9px] text-amber-300/70">梯队 · 跟着练，不占正赛名额</div>}
        {reserve.map(renderOne)}
      </div>
      <div className="text-[9px] text-slate-600 mt-2">条 = 疲劳（越高训练效率越低）· 点名字看详情</div>
    </div>
  );
}

// ===== 比赛观看：用观战同一套实时引擎重放一场 =====
function CoachPlay({
  round, onDone, onSkip,
}: {
  round: ContestRound; onDone: (est: Record<string, number>, contest: Contest) => void; onSkip: () => void;
}) {
  const [contest] = useState(() => createContest(round.cfg));
  const finish = () => {
    const est: Record<string, number> = {};
    for (const st of contest.students) est[st.name] = totalEstimate(st);
    onDone(est, contest);
  };
  return (
    <div className="pt-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span data-testid="coach-watch" className="text-[12px] font-bold text-indigo-200">
          {round.label}
        </span>
        <span className="text-[11px] text-slate-500">和正式比赛同一套引擎 · 可暂停 / 加速 / 直接到收卷</span>
        <button
          onClick={onSkip}
          data-testid="coach-skip"
          className="ml-auto px-3 py-1.5 rounded-lg border border-slate-600 text-[11px] text-slate-300 hover:bg-slate-700/40"
        >
          跳过观看，直接出成绩
        </button>
      </div>
      <ContestScreen contest={contest} onFinish={finish} />
    </div>
  );
}

// ===== 收卷后的估分榜（还没公布真实成绩） =====
function EstimateBoard({
  est, round, onReveal, onSkip,
}: {
  est: Record<string, number>;
  round?: Contest;
  onReveal: () => void;
  onSkip: () => void;
}) {
  const [review, setReview] = useState(false);
  const list = Object.entries(est).sort((a, b) => b[1] - a[1]);
  return (
    <div className="pt-5">
      <div className="rounded-2xl border border-indigo-500/25 bg-[#0d1116]/80 p-5">
        <h2 className="text-base font-bold text-white mb-1">估分榜</h2>
        <p className="text-[11px] text-slate-400 mb-4">
          按选手交卷时的自估分排；真实成绩要等评测完公布（和省线、省排名一起出）。
        </p>
        <div className="space-y-1">
          {list.map(([name, score], i) => (
            <div key={name} className="flex items-center gap-3 rounded-lg bg-slate-800/40 px-3 py-1.5">
              <span className="w-6 font-mono text-[11px] text-slate-500">#{i + 1}</span>
              <span className="text-[12px] text-slate-200">{name}</span>
              <span className="ml-auto font-mono text-[12px] text-slate-300">≈{Math.round(score)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onReveal}
            data-testid="coach-reveal"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
          >
            <Ic n="unlock" /> 公布真实成绩
          </button>
          <button
            onClick={onSkip}
            data-testid="coach-skip"
            className="px-4 py-2 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700/40"
          >
            直接看结果
          </button>
          {round && (
            <button
              onClick={() => setReview(true)}
              data-testid="coach-review"
              className="px-4 py-2 rounded-xl border border-emerald-500/40 text-emerald-300 text-sm hover:bg-emerald-500/10"
            >
              <Ic n="brain" /> 看思维链
            </button>
          )}
        </div>
      </div>
      {review && round && <ReviewOverlay round={round} onClose={() => setReview(false)} />}
    </div>
  );
}
