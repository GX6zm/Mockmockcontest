import { Fragment, useEffect, useState } from 'react';
import {
  TOPIC_COLORS, TOPIC_LIST, TOPIC_NAMES, createContest, isIoiFormat, levelInfo,
  randomSeed, totalEstimate,
} from './game.ts';
import { ContestScreen } from './ContestScreen.tsx';
import { HallOfFame } from './HallOfFame.tsx';
import { StudentDetail } from './StudentDetail.tsx';
import {
  CAREER_YEARS, CARE_INFO, CARE_MAX, GRADE_NAMES, INTENSITY_INFO, MAX_YEARS, MOCK_PRESETS, PRELIM_LINE,
  SCENARIOS, SEASON_GOALS, SPECIAL_PROJECTS, TEAM_MIN, YEAR_STAGES, YEAR_WEEKS,
  advanceWeek, alumniPoolOf, archiveOf, budgetOf, canUseSpecial, chooseEventOption, continueCareer, createSeason,
  fastForwardWeeks, nextStage, planWeek, qualifiedFor, retireCareer, reserveStudents, rosterSorted, runWeeklyContest,
  seasonReport, setSquad, setTeam, stageOfWeek, overallScoreOf, suspendQuotaOf, teamStudents,
} from './season.ts';
import type { CareAction, CareOrder, ScenarioId, SeasonGoalId, SpecialProjectId, WeekPlan } from './season.ts';
import type {
  AwardRow, CareerReport, ContestRecap, ContestRound, MockConfig, MockPreset, SeasonState, SeasonStudent, SquadFocus, StageDef,
  TrainingLine, TrainingReport, WeekIntensity,
} from './season.ts';
import { syncAchievements, type AchievementDef } from './achievements.ts';
import { TRAITS } from './traits.ts';
import type { PendingEvent } from './events.ts';
import { clearCoachSeason, coachStorageAvailable, hasCoachSave, loadCoachSeason, saveCoachSeason } from './coachSave.ts';
import { kpFromAbility, loadOpvConfig } from './opv.ts';
import { quoteFor } from './easter.ts';
import type { Contest, ContestTactic, StudentResult, Topic } from './types.ts';
import { ReviewOverlay } from './ReviewOverlay.tsx';
import { Ic, getMotionMode, plainText, setMotionMode } from './ui.tsx';
import type { IconName, MotionMode } from './ui.tsx';

type UiMood = 'early' | 'crunch' | 'winter' | 'summer' | 'contest-oi' | 'contest-ioi' | 'yearend';

/** 40 周映射到真实学年月份（9 月 → 次年 8 月），仅作时间刻度展示 */
function monthLabelOf(week: number): string {
  const w = Math.max(1, Math.min(YEAR_WEEKS, week));
  if (w <= 4) return '9 月';
  if (w <= 8) return '10 月';
  if (w <= 12) return '11 月';
  if (w <= 16) return '12 月';
  if (w <= 18) return '1 月';
  if (w <= 20) return '2 月';
  if (w <= 24) return '3 月';
  if (w <= 27) return '4 月';
  if (w <= 30) return '5 月';
  if (w <= 32) return '6 月';
  if (w <= 36) return '7 月';
  return '8 月';
}

function moodOf(season: SeasonState, watchFormat?: 'oi' | 'ioi' | null): UiMood {
  if (watchFormat === 'ioi') return 'contest-ioi';
  if (watchFormat === 'oi') return 'contest-oi';
  if (season.phase === 'yearEnd' || season.phase === 'finished') return 'yearend';
  const w = season.week;
  if (w <= 6) return 'early';
  if (w <= 12) return 'crunch';
  if (w <= 23) return 'winter';
  return 'summer';
}

const pct = (v: number) => Math.round(v * 100);
/** 0–1（或 OPv 超频）能力 → 0–150 知识点 */
const kp = (v: number) => kpFromAbility(v);

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
  const cfg = loadOpvConfig();
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
  const [motion, setMotion] = useState<MotionMode>(() => getMotionMode());
  const [hofOpen, setHofOpen] = useState(false);
  const [ffSummary, setFfSummary] = useState<string | null>(null);
  const [unlockedToast, setUnlockedToast] = useState<AchievementDef[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [reservePicked, setReservePicked] = useState<string[]>([]);

  const toggleMotion = () => {
    const next: MotionMode = motion === 'full' ? 'static' : 'full';
    setMotionMode(next);
    setMotion(next);
  };

  // 每次状态变化就地存档 + 同步永久成就解锁
  useEffect(() => {
    setSaveOk(saveCoachSeason(season));
    const { newlyUnlocked } = syncAchievements(season);
    if (newlyUnlocked.length > 0) {
      setUnlockedToast((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...newlyUnlocked.filter((x) => !ids.has(x.id))];
      });
    }
  }, [season]);

  const newSeason = (scenario: ScenarioId = 'standard') => {
    if (scenario === 'standard' && !window.confirm(`开新的一届会清掉当前存档（第 ${season.year} 学年 · 第 ${Math.min(season.week, YEAR_WEEKS)} 周），确定吗？`)) return;
    clearCoachSeason();
    const next = createSeason(requestedSeed(), requestedYears(), scenario);
    setPicked(opvAutoPicks(next));
    setReservePicked([]);
    setFfSummary(null);
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
  const opvName = loadOpvConfig()?.name ?? null;

  // 正赛/模拟赛：先瞬时结算出真实成绩，再把每一场的 Contest 重放给玩家看，
  // 播完才把结算后的 state 写回去（保证 UI 与脚本同 seed 逐分一致）。
  const [watch, setWatch] = useState<{
    rounds: ContestRound[];
    next: SeasonState;
    index: number;
    est: Record<string, number>;
    review?: Contest;
  } | null>(null);

  const startContest = (tactic?: ContestTactic) => {
    const trace: ContestRound[] = [];
    const next = runWeeklyContest(season, trace, tactic);
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

  const watchFormat = watch && watch.index < watch.rounds.length
    ? (watch.rounds[watch.index].cfg.format ?? 'oi')
    : null;
  const isWatching = Boolean(watch && watch.index < watch.rounds.length);
  const mood = moodOf(season, watchFormat);

  return (
    <div className="ui-canvas text-slate-200" data-mood={mood}>
      <Header
        season={season}
        team={team}
        isWatching={isWatching}
        onNew={() => newSeason('standard')}
        resumed={resumed}
        saveOk={saveOk}
        opvName={opvName}
        onOpvSetup={onOpvSetup}
        onHallOfFame={() => setHofOpen(true)}
        motion={motion}
        onToggleMotion={toggleMotion}
      />
      <div className={`${isWatching ? 'max-w-[1400px]' : 'max-w-6xl'} mx-auto px-4 pb-12 ui-enter`}>
        {unlockedToast.length > 0 && (
          <div
            data-testid="achievement-toast"
            className="mt-3 px-4 py-2.5 border border-amber-400/50 bg-amber-500/15 flex flex-wrap items-center gap-2 text-[12px]"
          >
            <Ic n="trophy" size={14} className="text-amber-300" />
            <span className="font-bold text-amber-200">解锁永久成就：</span>
            <span className="text-slate-100">{unlockedToast.map((a) => `${a.name}（${a.desc}）`).join(' · ')}</span>
            <button
              type="button"
              onClick={() => setUnlockedToast([])}
              className="ml-auto text-[11px] text-amber-200 hover:text-white"
            >
              知道了
            </button>
          </div>
        )}
        {watch && watch.index < watch.rounds.length && (
          <CoachPlay
            key={watch.index}
            round={watch.rounds[watch.index]}
            teamNames={season.team}
            opvName={opvName}
            onDone={(est, contest) => setWatch((w) => (w ? { ...w, est: { ...w.est, ...est }, index: w.index + 1, review: contest } : w))}
            onSkip={revealResult}
          />
        )}
        {watch && watch.index >= watch.rounds.length && (
          <EstimateBoard
            est={watch.next.lastContest
              ? Object.fromEntries(watch.next.lastContest.rows.map((r) => [r.name, r.est]))
              : watch.est}
            isIoi={watch.next.lastContest?.format === 'ioi'}
            round={watch.review}
            teamNames={season.team}
            opvName={opvName}
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
            onStart={(names, res, goal) => { setFfSummary(null); setSeason(setSquad(season, names, res, goal)); }}
            onScenario={(sc) => newSeason(sc)}
            opvName={opvName}
            onOpvSetup={onOpvSetup}
          />
        )}
        {!watch && season.phase === 'plan' && (
          <PlanWeek
            season={season}
            onPlan={(plan) => { setFfSummary(null); setSeason(planWeek(season, plan)); }}
            onFastForward={(plan) => {
              const res = fastForwardWeeks(season, plan);
              setSeason(res.season);
              setFfSummary(res.stopText);
            }}
            ffSummary={ffSummary}
            onDismissFf={() => setFfSummary(null)}
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
            onHallOfFame={() => setHofOpen(true)}
          />
        )}
        {!watch && season.phase === 'finished' && (
          <Finale season={season} onNew={newSeason} onHallOfFame={() => setHofOpen(true)} />
        )}
      </div>
      {hofOpen && <HallOfFame season={season} onClose={() => setHofOpen(false)} />}
    </div>
  );
}

// ===== 顶栏 =====
function Header({
  season, team, isWatching, onNew, resumed, saveOk, opvName, onOpvSetup, onHallOfFame, motion, onToggleMotion,
}: {
  season: SeasonState;
  team: SeasonStudent[];
  isWatching: boolean;
  onNew: () => void;
  resumed: boolean;
  saveOk: boolean;
  opvName: string | null;
  onOpvSetup?: () => void;
  onHallOfFame: () => void;
  motion: MotionMode;
  onToggleMotion: () => void;
}) {
  const week = Math.min(season.week, YEAR_WEEKS);
  const month = monthLabelOf(week);
  const avgOverall = team.length ? team.reduce((a, s) => a + overallScoreOf(s), 0) / team.length : 0;
  const avgFatigue = team.length ? team.reduce((a, s) => a + s.fatigue, 0) / team.length : 0;
  const stage = nextStage(season);
  const yearsLeft = season.careerYears - season.year;
  const containerMax = isWatching ? 'max-w-[1400px]' : 'max-w-6xl';
  return (
    <div className="sticky top-0 z-20 ui-topbar">
      {/* Tier 1：主导航行 */}
      <div className={`${containerMax} mx-auto px-4 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5`}>
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-black tracking-tight text-white"><Ic n="graduation" /> OI 模拟赛 · 教练模式</h1>
          <span className="ui-mood-pill">
            <span className="w-1.5 h-1.5 rounded-full ui-live" style={{ backgroundColor: 'var(--mood-accent)' }} />
            Y{season.year} · {month} · W{week}/{YEAR_WEEKS}
          </span>
          {opvName && (
            <span className="text-[11px] px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/15 text-amber-300 font-bold" title={`已启用自定义开局：${opvName}`}>
              <Ic n="zap" size={11} /> OP · {opvName}
            </span>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={onHallOfFame}
          data-testid="hall-of-fame-btn"
          title="查看校史奖杯柜、名人堂、毕业生去向与机房奇闻纪录"
          className="ui-btn-ghost text-[11px] px-2 py-1"
        >
          <Ic n="trophy" size={12} /> 校史墙
        </button>
        <div
          className={`text-[10.5px] px-2 py-1 border ${
            saveOk
              ? 'border-white/10 bg-white/[0.03] text-slate-300'
              : 'border-amber-600/40 bg-amber-500/[0.08] text-amber-300'
          }`}
          data-testid="coach-save-state"
          title="进度随每周自动写入本机；关掉页面不会清档，随时可以回来接着带"
        >
          {saveOk
            ? resumed ? <><Ic n="save" size={12} /> 已续档</> : <><Ic n="save" size={12} /> 自动存档</>
            : <><Ic n="alert" size={12} /> 无法存档</>}
        </div>
        <button
          onClick={onToggleMotion}
          data-testid="motion-toggle"
          title="切换界面动效（静帧模式彻底关闭过渡动画，低配机更流畅）"
          className="ui-btn-ghost text-[11px] px-2 py-1"
        >
          <Ic n={motion === 'full' ? 'sparkles' : 'cpu'} size={12} /> {motion === 'full' ? '满血' : '静帧'}
        </button>
        {onOpvSetup && (
          <button
            onClick={onOpvSetup}
            data-testid="topbar-opv"
            title="自定义一名选手的年龄、年级与属性（新的一届生效）"
            className="ui-btn-ghost text-[11px] px-2 py-1"
          >
            <Ic n="zap" size={12} /> 自定义开局
          </button>
        )}
        <button onClick={onNew} className="ui-btn-ghost text-[11px] px-2.5 py-1">
          <Ic n="refresh" size={12} /> 新的一届
        </button>
      </div>

      {/* Tier 2：校队状态条与学年进度条（赛时隐藏以保证榜单视区纯净） */}
      {!isWatching && (
        <>
          {team.length > 0 && (
            <div className="border-t border-white/[0.06] bg-white/[0.015]">
              <div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-400">
                <span>主力 <b className="text-slate-100 font-mono">{team.length}</b></span>
                <span>梯队 <b className="text-amber-300 font-mono">{season.reserve.length}</b></span>
                <span>声望 <b className="text-amber-200 font-mono">{Math.round(season.prestige)}</b></span>
                <span title="校队经费：用于外校联训、请往届学长讲课、防挂题包">经费 <b className="text-emerald-300 font-mono">{budgetOf(season)}</b></span>
                <span title="本学年停课集训剩余周数">停课 <b className="text-sky-300 font-mono">{suspendQuotaOf(season)}周</b></span>
                <span>综合 <b className="text-slate-100 font-mono">{avgOverall.toFixed(1)}</b></span>
                <span>
                  疲劳 <b className={`font-mono ${avgFatigue > 65 ? 'text-rose-300' : avgFatigue > 40 ? 'text-amber-300' : 'text-emerald-300'}`}>{Math.round(avgFatigue)}</b>
                </span>
                <div className="ml-auto text-[11px] text-slate-400 font-mono" data-testid="next-stage">
                  {stage ? (
                    <>下一场 <b className="text-slate-100">{stage.short}</b> · W{stage.week}</>
                  ) : (
                    <>{yearsLeft > 0 ? '本学年赛程已结束' : '生涯最后一场已结束'}</>
                  )}
                </div>
              </div>
            </div>
          )}
          <ProgressBar season={season} />
        </>
      )}
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
            title={stage ? `第 ${w} 周（${monthLabelOf(w)}）· ${stage.name}${c ? '（已考）' : ''}` : c ? `第 ${w} 周（${monthLabelOf(w)}）· 模拟赛` : `第 ${w} 周（${monthLabelOf(w)}）`}
            className={`flex-1 transition-all ${stage ? 'h-2.5' : 'h-1.5'}`}
            style={{
              backgroundColor: officialDone
                ? 'var(--color-amber-500)'
                : c
                  ? 'var(--mood-accent)'
                  : active
                    ? 'var(--mood-accent)'
                    : stage
                      ? 'rgba(255,255,255,0.22)'
                      : 'rgba(255,255,255,0.08)',
              opacity: officialDone ? 0.88 : c ? 0.3 + frac * 0.55 : active ? 0.95 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

// ===== 赛历轨道 =====
function CalendarStrip({ season }: { season: SeasonState }) {
  const done = new Set(season.contests.map((c) => c.stageId).filter(Boolean));
  const upcoming = nextStage(season);
  const weeksToNext = upcoming ? upcoming.week - season.week : null;
  return (
    <div className="ui-panel p-2.5 mb-3" data-testid="calendar-strip">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="ui-kicker"><Ic n="calendar" size={11} /> 本学年赛历</span>
        <span className="h-px flex-1 bg-white/[0.08]" />
        {upcoming && weeksToNext !== null && (
          <span className="text-[11px] font-mono text-slate-300">
            {weeksToNext <= 0
              ? <b style={{ color: 'var(--mood-accent)' }}>本周正赛 · {upcoming.short}</b>
              : <>距 <b className="text-white">{upcoming.short}</b> 还剩 <b style={{ color: 'var(--mood-accent)' }}>{weeksToNext}</b> 周</>}
          </span>
        )}
        <span className="text-[10.5px] font-mono text-slate-400">Y{season.year} · 10 场正赛</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5">
        {YEAR_STAGES.map((st) => {
          const isDone = done.has(st.id);
          const isNow = st.week === season.week;
          const isNext = upcoming?.id === st.id && !isNow;
          const qual = qualifiedFor(season, st);
          return (
            <div
              key={st.id}
              className={`text-[11px] px-2 py-1.5 border transition-colors ${
                isNow
                  ? 'ui-tile-active text-white'
                  : isDone
                    ? 'border-amber-500/35 bg-amber-500/[0.09] text-amber-200'
                    : isNext
                      ? 'border-white/25 bg-white/[0.04] text-slate-100'
                      : 'border-white/[0.09] bg-white/[0.02] text-slate-300'
              }`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-bold truncate">{st.short}</span>
                <span className="font-mono text-[10px] text-slate-400">W{st.week}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10px]">
                <span className={isDone ? 'text-amber-300/90' : qual > 0 ? 'text-slate-300' : 'text-slate-500'}>
                  {isDone ? '已考' : `${qual} 人`}
                </span>
                {st.format && (
                  <span className={`font-mono uppercase text-[9.5px] ${st.format === 'ioi' ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {st.format}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== 阶段一：选队 =====
function PickTeam({
  season, picked, setPicked, reserve, setReserve, onStart, onScenario, opvName, onOpvSetup,
}: {
  season: SeasonState;
  picked: string[];
  setPicked: (v: string[]) => void;
  reserve: string[];
  setReserve: (v: string[]) => void;
  onStart: (names: string[], reserve: string[], goal: SeasonGoalId) => void;
  onScenario?: (id: ScenarioId) => void;
  opvName: string | null;
  onOpvSetup?: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'senior' | 'junior' | 'new'>('all');
  const [sortBy, setSortBy] = useState<'overall' | 'grade' | 'talent'>('overall');
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [goal, setGoal] = useState<SeasonGoalId>(season.yearGoal ?? 'safe');

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
  // 与 season.ts planWeek 同口径的教练注意力稀释系数
  const attentionEff = pickedValid.length <= TEAM_MIN
    ? 100
    : Math.round(Math.max(0.2, Math.pow(TEAM_MIN / pickedValid.length, 0.6)) * 100);
  const isNewYear = season.year > 1;
  const newcomerSet = new Set(season.newcomers);
  const opvSt = opvName ? byName.get(opvName) : undefined;

  const ranked = rosterSorted(season)
    .filter((st) => {
      if (filter === 'senior') return st.grade >= 4;
      if (filter === 'junior') return st.grade < 4;
      if (filter === 'new') return newcomerSet.has(st.name);
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'grade') return b.grade - a.grade || overallScoreOf(b) - overallScoreOf(a);
      if (sortBy === 'talent') return b.talent - a.talent || overallScoreOf(b) - overallScoreOf(a);
      return overallScoreOf(b) - overallScoreOf(a);
    });

  return (
    <div className="pt-4">
      {opvSt && (
        <div className="ui-note-card px-4 py-2.5 mb-3 flex flex-wrap items-center gap-2" data-testid="opv-banner">
          <span className="text-[12px] font-bold text-amber-200"><Ic n="zap" /> 已启用自定义开局</span>
          <span className="text-[12px] text-slate-300">
            <b className="text-white">{opvSt.name}</b>
            <span className="text-slate-400">（{GRADE_NAMES[opvSt.grade]}{opvSt.age !== undefined ? ` · ${opvSt.age} 岁` : ''} · 综合 {overallScoreOf(opvSt).toFixed(1)}）</span>
          </span>
          <div className="flex-1" />
          {onOpvSetup && (
            <button
              onClick={onOpvSetup}
              data-testid="opv-edit"
              className="ui-btn-ghost text-[11px] px-2.5 py-1 text-amber-200"
            >
              <Ic n="settings" size={12} /> 修改设置
            </button>
          )}
        </div>
      )}

      <div className="ui-panel-hero p-4 mb-3">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h2 className="text-base font-bold text-white">
            第 {season.year} 学年 · 选队：主力至少 {TEAM_MIN} 人 + 梯队最多 12 人
          </h2>
          <span className="text-[11px] text-slate-400">一学年 {YEAR_WEEKS} 周 · 10 场正赛 · 声望 <b className="text-amber-300 font-mono">{Math.round(season.prestige)}</b>/100</span>
          <div className="flex-1" />
          {!opvSt && onOpvSetup && (
            <button
              onClick={onOpvSetup}
              data-testid="opv-edit"
              className="ui-btn-ghost text-[11px] px-2.5 py-1"
            >
              <Ic n="zap" size={12} /> 自定义开局（OP）
            </button>
          )}
        </div>
        <p className="text-[12px] text-slate-400 leading-relaxed">
          真实跨学年赛历：CSP 初/复赛 → NOIP → CTT → WC → CTS → 省选 → APIO → NOI → IOI。全校一张 S 卷，初中生 NOIP 起走体验/E 类；高三打完本学年毕业，每年补 6 初一 + 4 高一新生。主力超出 {TEAM_MIN} 人会稀释教练精力，梯队跟着练但不占正赛名额。
        </p>
        {season.year === 1 && onScenario && (
          <div className="mt-3 pt-2.5 border-t border-white/[0.08]">
            <div className="text-[11px] font-bold text-slate-300 mb-1.5">开局剧本选择</div>
            <div className="grid sm:grid-cols-3 gap-2">
              {SCENARIOS.map((sc) => {
                const active = (season.scenario ?? 'standard') === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onScenario(sc.id)}
                    data-testid={`scenario-${sc.id}`}
                    className={`text-left px-2.5 py-2 border transition-colors ${active ? 'ui-tile-active' : 'ui-tile'}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[12px] font-bold text-slate-100">{sc.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 border border-white/10 text-amber-300">{sc.badge}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 leading-snug">{sc.note}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isNewYear && (
          <div className="mt-2.5 grid sm:grid-cols-2 gap-2 text-[11.5px]">
            <div className="border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2">
              <b className="text-rose-300"><Ic n="graduation" /> 毕业离队</b>
              <div className="text-slate-300 mt-0.5 space-y-0.5">
                {season.graduates.length
                  ? season.graduates.map((g) => (
                    <div key={g.name}>
                      <b className="text-slate-100">{g.name}</b>（{g.overall.toFixed(0)}）
                      {g.destination ? <span className="text-emerald-300/90"> · {g.destination}</span> : null}
                    </div>
                  ))
                  : '没有高三学生，没人毕业'}
              </div>
            </div>
            <div className="border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2">
              <b className="text-emerald-300"><Ic n="sparkles" /> 初一 / 高一新生</b>
              <div className="text-slate-300 mt-0.5">{season.newcomers.join('、') || '—'}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="ui-panel overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.08] flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">筛选</span>
            {([
              ['all', `全部 ${season.students.length}`],
              ['senior', `高中 ${season.students.filter((s) => s.grade >= 4).length}`],
              ['junior', `初中 ${season.students.filter((s) => s.grade < 4).length}`],
              ...(season.newcomers.length ? [['new', `新生 ${season.newcomers.length}`]] : []),
            ] as ['all' | 'senior' | 'junior' | 'new', string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`ui-pill ${filter === k ? 'ui-pill-active' : ''}`}
              >
                {label}
              </button>
            ))}
            <div className="flex-1" />
            <span className="text-[11px] text-slate-400 mr-1">排序</span>
            {([
              ['overall', '综合'],
              ['grade', '年级'],
              ['talent', '天赋'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={`ui-pill ${sortBy === k ? 'ui-pill-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 ui-table-head z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-9">#</th>
                  <th className="text-left px-2 py-2 font-medium">选手（点名看详情）</th>
                  <th className="text-left px-2 py-2 font-medium">年级</th>
                  <th className="text-right px-2 py-2 font-medium">综合</th>
                  <th className="text-left px-3 py-2 font-medium">最擅长 / 最怕</th>
                  <th className="text-right px-3 py-2 font-medium w-28">编入</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((st, i) => {
                  const on = pickedValid.includes(st.name);
                  const inReserve = reserveValid.includes(st.name);
                  const [best, worst] = topTopics(st);
                  const previewOpen = previewName === st.name;
                  return (
                    <Fragment key={st.name}>
                      <tr
                        onClick={() => toggle(st.name)}
                        data-testid={`pick-${i}`}
                        className={`cursor-pointer border-t border-white/[0.06] transition-colors ${
                          on ? 'ui-row-selected' : inReserve ? 'ui-row-reserve' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-2 py-2 font-bold text-slate-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewName(previewOpen ? null : st.name);
                            }}
                            className="hover:underline underline-offset-2 text-left"
                            title="展开/收起选手雷达与详细属性"
                          >
                            {st.name}
                          </button>
                          {newcomerSet.has(st.name) && <span className="ml-1.5 text-[10px] text-emerald-300 font-medium">新生</span>}
                          {st.name === opvName && <span className="ml-1.5 text-[10px] text-amber-300 font-bold" data-opv-tag><Ic n="zap" size={10} />OP</span>}
                          {st.traitsRevealed === false ? (
                            <span className="ml-1.5 text-[9.5px] px-1 py-0.5 border border-dashed border-white/15 text-slate-400">待探明</span>
                          ) : (st.traits?.length ?? 0) > 0 && (
                            <span className="ml-1.5 text-[9.5px] px-1 py-0.5 border border-sky-400/25 bg-sky-500/10 text-sky-200" title={st.traits!.map((id) => TRAITS[id]?.note).join('；')}>
                              {TRAITS[st.traits![0]]?.short}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-slate-300 whitespace-nowrap">
                          {GRADE_NAMES[st.grade]}{st.age !== undefined ? ` · ${st.age}岁` : ''}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-slate-100">{overallScoreOf(st).toFixed(1)}</td>
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                          <span style={{ color: TOPIC_COLORS[best.t] }}>{TOPIC_NAMES[best.t]} {kp(best.v)}</span>
                          <span className="text-slate-500"> · </span>
                          <span className="text-rose-300">{TOPIC_NAMES[worst.t]} {kp(worst.v)}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggle(st.name); }}
                              className={`ui-pill ${on ? 'ui-pill-active' : ''}`}
                              title="加入 / 移出主力"
                            >
                              {on ? <Ic n="check" size={11} /> : null}主力
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleReserve(st.name); }}
                              className={`ui-pill ${inReserve ? 'ui-pill-reserve' : ''}`}
                              title="加入 / 移出梯队"
                            >
                              梯队
                            </button>
                          </div>
                        </td>
                      </tr>
                      {previewOpen && (
                        <tr className="border-t border-white/[0.05] bg-black/25">
                          <td colSpan={6} className="px-3 pb-2.5 pt-1">
                            <StudentDetail student={st} archive={archiveOf(season, st.name)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ui-panel p-4 lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[12px] text-slate-300">
              主力 <b className="text-white font-mono text-sm">{pickedValid.length}</b>
              <span className="text-slate-400 text-[11px]">（≥{TEAM_MIN}）</span>
              {' · '}梯队 <b className="text-amber-300 font-mono text-sm">{reserveValid.length}</b>
              <span className="text-slate-400 text-[11px]">/12</span>
            </div>
          </div>
          <div className="space-y-1.5 mb-3 max-h-[300px] overflow-y-auto pr-0.5 min-h-[110px]">
            {pickedValid.length === 0 && (
              <div className="text-[12px] text-slate-400 py-8 text-center border border-dashed border-white/10">
                点左侧选手的「主力」或「梯队」编入名单
              </div>
            )}
            {pickedValid.map((n) => {
              const st = byName.get(n)!;
              return (
                <div key={n} className="flex items-center gap-2 text-[12px] ui-tile-active px-2.5 py-1.5">
                  <span className="text-slate-100 font-bold truncate">{n}{n === opvName && <span className="ml-1 text-[10px] text-amber-300" data-opv-tag><Ic n="zap" size={10} />OP</span>}</span>
                  <span className="text-[11px] text-slate-400">{GRADE_NAMES[st.grade]}{st.age !== undefined ? ` · ${st.age}岁` : ''}</span>
                  <span className="ml-auto font-mono text-slate-300">{overallScoreOf(st).toFixed(1)}</span>
                  <button onClick={() => toggle(n)} className="text-slate-400 hover:text-rose-300"><Ic n="x" size={13} /></button>
                </div>
              );
            })}
            {reserveValid.length > 0 && (
              <div className="pt-1.5 text-[11px] text-amber-300">梯队（跟练，不占正赛名额）</div>
            )}
            {reserveValid.map((n) => {
              const st = byName.get(n)!;
              return (
                <div key={n} className="flex items-center gap-2 text-[12px] ui-row-reserve border border-amber-500/25 px-2.5 py-1.5">
                  <span className="text-amber-100 font-bold truncate"><Ic n="layers" size={11} /> {n}</span>
                  <span className="text-[11px] text-slate-400">{GRADE_NAMES[st.grade]}</span>
                  <span className="ml-auto font-mono text-slate-300">{overallScoreOf(st).toFixed(1)}</span>
                  <button onClick={() => toggleReserve(n)} className="text-slate-400 hover:text-rose-300"><Ic n="x" size={13} /></button>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11.5px] border-t border-white/[0.08] pt-2.5 mb-3">
            <div>
              <div className="text-slate-400">主力平均综合</div>
              <div className="font-mono font-bold text-white text-sm">{pickedValid.length ? avg.toFixed(1) : '—'}</div>
            </div>
            <div>
              <div className="text-slate-400">教练精力效率</div>
              <div className={`font-mono font-bold text-sm ${attentionEff < 80 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {pickedValid.length ? `${attentionEff}%` : '—'}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 mb-2.5">
            <button
              onClick={() => {
                const top = rosterSorted(season);
                setPicked(top.slice(0, TEAM_MIN).map((s) => s.name));
                setReserve(top.slice(TEAM_MIN, TEAM_MIN + 6).map((s) => s.name));
              }}
              data-testid="pick-auto"
              className="flex-1 ui-btn-ghost text-[11.5px] py-1.5"
            >
              推荐主力 + 梯队
            </button>
            <button
              onClick={() => { setPicked([]); setReserve([]); }}
              className="flex-1 ui-btn-ghost text-[11.5px] py-1.5 hover:border-rose-400/50"
            >
              清空
            </button>
          </div>
          <div className="mb-2.5 border-t border-white/[0.08] pt-2.5" data-testid="goal-picker">
            <div className="text-[11px] font-bold text-slate-200 mb-1.5">本学年目标签字</div>
            <div className="grid grid-cols-3 gap-1">
              {SEASON_GOALS.map((g) => {
                const active = goal === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGoal(g.id)}
                    data-testid={`goal-${g.id}`}
                    title={`${g.requirement} · 达标 ${g.rewardText}`}
                    className={`px-2 py-1.5 border text-[11px] font-bold transition-colors ${active ? 'ui-tile-active text-white' : 'ui-tile text-slate-300'}`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-[10.5px] text-slate-400 leading-snug">
              {(SEASON_GOALS.find((g) => g.id === goal) ?? SEASON_GOALS[0]).requirement}（奖 {(SEASON_GOALS.find((g) => g.id === goal) ?? SEASON_GOALS[0]).rewardText}）
            </div>
          </div>
          <button
            disabled={!ready}
            onClick={() => onStart(pickedValid, reserveValid, goal)}
            data-testid="start-season"
            className="w-full py-2.5 ui-btn-primary text-sm"
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

// ===== 阶段二：排本周训练（一屏决策台） =====
function PlanWeek({
  season, onPlan, onFastForward, ffSummary, onDismissFf, onEvent,
}: {
  season: SeasonState;
  onPlan: (p: WeekPlan) => void;
  onFastForward?: (p: WeekPlan) => void;
  ffSummary?: string | null;
  onDismissFf?: () => void;
  onEvent: (optionId: string) => void;
}) {
  const lastPlan = season.lastPlan ?? null;
  const [topic, setTopic] = useState<Topic | null>(lastPlan?.topic ?? null);
  const [reserveTopic, setReserveTopic] = useState<Topic | null>(lastPlan?.reserveTopic ?? null);
  const [intensity, setIntensity] = useState<WeekIntensity>(lastPlan?.intensity ?? 'normal');
  const [focus, setFocus] = useState<SquadFocus>(lastPlan?.focus ?? 'balanced');
  const [care, setCare] = useState<CareOrder[]>(lastPlan?.care ?? []);
  const [special, setSpecial] = useState<SpecialProjectId | null>(null);
  const alumniPool = alumniPoolOf(season);
  const [alumniName, setAlumniName] = useState<string | null>(() => alumniPool[0]?.name ?? null);
  const [mock, setMock] = useState<MockConfig>(lastPlan?.mock ?? { preset: 'normal', problemCount: 3, minutes: 180 });
  const team = teamStudents(season);
  const teamAvg = (t: Topic) => team.reduce((a, s) => a + s.skills.topics[t], 0) / Math.max(1, team.length);
  const avgFatigue = team.reduce((a, s) => a + s.fatigue, 0) / Math.max(1, team.length);
  const weakest = TOPIC_LIST.slice().sort((a, b) => teamAvg(a) - teamAvg(b))[0];
  const canGo = intensity === 'rest' || topic !== null;
  const event = season.pendingEvent;
  const stage = stageOfWeek(season.week);

  const toggleCare = (name: string, action: CareAction) => {
    setCare((cur) => {
      const existing = cur.find((c) => c.name === name);
      if (existing && existing.action === action) return cur.filter((c) => c.name !== name);
      if (existing) return cur.map((c) => (c.name === name ? { name, action } : c));
      if (cur.length >= CARE_MAX) return [...cur.slice(1), { name, action }];
      return [...cur, { name, action }];
    });
  };

  const selectedAlumnus = alumniPool.find((a) => a.name === alumniName) ?? alumniPool[0] ?? null;
  const buildPlan = (): WeekPlan => ({
    topic: intensity === 'rest' ? null : topic,
    reserveTopic: intensity === 'rest' ? null : reserveTopic,
    intensity,
    focus,
    care: care.length ? care : undefined,
    special,
    alumniName: special === 'alumni' ? (selectedAlumnus?.name ?? null) : null,
    mock,
  });

  return (
    <div className="pt-4">
      <div className="ui-panel-hero px-4 py-3 mb-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="text-base font-bold text-white">
              第 {season.year} 学年 · 第 {season.week} 周 · 排训练
            </h2>
            <span className="text-[12px] text-slate-400">
              主力 <b className="text-white font-mono">{team.length}</b> 人 · 平均疲劳{' '}
              <b className={`font-mono ${avgFatigue > 65 ? 'text-rose-300' : avgFatigue > 40 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {Math.round(avgFatigue)}
              </b>
            </span>
          </div>
        </div>
        {!event && (
          <button
            type="button"
            onClick={() => { setIntensity((cur) => (cur === 'rest' ? 'normal' : cur)); setTopic(weakest); }}
            className="text-[11.5px] text-amber-200 bg-amber-500/12 border border-amber-500/30 px-2.5 py-1 hover:bg-amber-500/20"
            title="点击直接选中队伍当前最弱专题"
          >
            最弱专题：{TOPIC_NAMES[weakest]}（{kp(teamAvg(weakest))}/150）· 点此补短板
          </button>
        )}
      </div>

      <CalendarStrip season={season} />

      {ffSummary && (
        <div
          data-testid="fast-forward-summary"
          className="ui-note-card mb-3 px-4 py-2 text-[12px] text-sky-200 flex items-center gap-2"
        >
          <Ic n="fastForward" size={13} />
          <span>{ffSummary}</span>
          {onDismissFf && (
            <button type="button" onClick={onDismissFf} className="ml-auto text-[11px] text-slate-400 hover:text-white">
              收起
            </button>
          )}
        </div>
      )}

      {stage && (
        <div className="ui-stage-banner mb-3 px-4 py-2.5" data-testid="stage-notice">
          <div className="flex flex-wrap items-baseline gap-2">
            <b className="text-white text-[13px]"><Ic n="flag" /> 本周正赛：{stage.name}</b>
            <span className="text-[11.5px] text-slate-300">{stage.clock}</span>
          </div>
          <div className="text-[11.5px] text-slate-300 mt-1 leading-relaxed">
            {stage.kind === 'prelim'
              ? `100 分笔试：陕西统一划 ${PRELIM_LINE} 分线，过线即进第二轮；官方保障晋级不少于实考 20%，强校过线率通常高于全省平均。`
              : `${stage.levels.length} 题 · ${stage.minutes} 分钟${stage.days > 1 ? ` × ${stage.days} 天` : ''} · ${stage.format === 'ioi' ? 'IOI 实时评测赛制' : 'OI 盲测赛制'}，满分 ${stage.id === 'noi' ? 705 : stage.levels.length * 100 * stage.days}；资格：${stage.gateText}（当前 ${qualifiedFor(season, stage)} 人够资格）。`}
          </div>
        </div>
      )}

      {event && <EventCard ev={event} season={season} onPick={onEvent} />}

      {!event && (
        <>
          {season.lastEventResult && (
            <div className="ui-note-card mb-3 px-4 py-2 text-[12px] text-amber-200">
              <b className="mr-1.5"><Ic n="pin" /> 本周插曲</b>{season.lastEventResult}
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
            <div className="space-y-3">
              {/* 专题选择 */}
              <div className="ui-panel p-3.5">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[12px] font-bold text-slate-200">训练专题（队伍当前水平 /150）</span>
                  {intensity === 'rest' && <span className="text-[11px] text-amber-300">当前为休息周，不练专题</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TOPIC_LIST.map((t) => {
                    const v = teamAvg(t);
                    const active = topic === t && intensity !== 'rest';
                    const isWeakest = t === weakest;
                    return (
                      <button
                        key={t}
                        disabled={intensity === 'rest'}
                        data-testid={`topic-${t}`}
                        onClick={() => setTopic(t)}
                        className={`text-left px-2.5 py-2 border transition-colors disabled:opacity-40 ${
                          active ? 'ui-tile-active' : 'ui-tile'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12.5px] font-bold text-slate-100">{TOPIC_NAMES[t]}</span>
                          {isWeakest && <span className="text-[10px] text-amber-300">短板</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <div className="h-1.5 flex-1 bg-slate-800 overflow-hidden">
                            <div className="h-full" style={{ width: `${Math.min(100, (kp(v) / 150) * 100)}%`, backgroundColor: TOPIC_COLORS[t] }} />
                          </div>
                          <span className="text-[11px] font-mono text-slate-300">{kp(v)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {season.reserve.length > 0 && intensity !== 'rest' && (
                  <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center gap-1.5" data-testid="reserve-topic-strip">
                    <span className="text-[11px] text-amber-300 font-medium mr-1">梯队专题</span>
                    <button
                      type="button"
                      onClick={() => setReserveTopic(null)}
                      className={`ui-pill ${reserveTopic === null ? 'ui-pill-reserve' : ''}`}
                    >
                      跟随主力
                    </button>
                    {TOPIC_LIST.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setReserveTopic(t)}
                        data-testid={`reserve-topic-${t}`}
                        className={`ui-pill ${reserveTopic === t ? 'ui-pill-reserve' : ''}`}
                      >
                        {TOPIC_NAMES[t]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 强度与教练精力分配并排：免滚动一屏决策 */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="ui-panel p-3.5">
                  <div className="text-[12px] font-bold text-slate-200 mb-2">训练强度</div>
                  <div className="space-y-1.5">
                    {(Object.keys(INTENSITY_INFO) as WeekIntensity[]).map((k) => {
                      const info = INTENSITY_INFO[k];
                      const active = intensity === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setIntensity(k)}
                          data-testid={`intensity-${k}`}
                          className={`w-full text-left px-2.5 py-2 border transition-colors ${
                            active ? 'ui-tile-active' : 'ui-tile'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-bold text-slate-100"><Ic n={info.icon} /> {info.name}</span>
                            {active && <span className="text-[10px] font-mono" style={{ color: 'var(--mood-accent)' }}>已选</span>}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{info.note}</div>
                        </button>
                      );
                    })}
                  </div>
                  {intensity === 'extra' && avgFatigue > 40 && (
                    <div className="mt-2 text-[11px] text-rose-300">队伍偏累，继续加练效率会明显打折，建议轮休。</div>
                  )}
                </div>

                <div className="ui-panel p-3.5">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[12px] font-bold text-slate-200">教练精力分配</span>
                    <span className="text-[11px] text-slate-400">主力 {team.length} · 梯队 {reserveStudents(season).length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {(Object.keys(SQUAD_FOCUS_INFO) as SquadFocus[]).map((k) => {
                      const info = SQUAD_FOCUS_INFO[k];
                      const active = focus === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setFocus(k)}
                          data-testid={`focus-${k}`}
                          className={`w-full text-left px-2.5 py-2 border transition-colors ${
                            active ? 'ui-tile-active' : 'ui-tile'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-bold text-slate-100"><Ic n={info.icon} /> {info.name}</span>
                            {active && <span className="text-[10px] font-mono" style={{ color: 'var(--mood-accent)' }}>已选</span>}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{info.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 特训项目（可选 · 消耗经费或停课额度） */}
              <div className="ui-panel p-3.5" data-testid="special-projects">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <span className="text-[12px] font-bold text-slate-200">特训项目（可选 · 每周最多 1 项）</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    经费 <b className="text-emerald-300">{budgetOf(season)}</b> · 停课 <b className="text-sky-300">{suspendQuotaOf(season)}周</b>
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {SPECIAL_PROJECTS.map((proj) => {
                    const check = canUseSpecial(season, proj.id);
                    const active = special === proj.id;
                    const costLabel = proj.costSuspend > 0 ? `停课 ${proj.costSuspend}周` : `经费 ${proj.costBudget}`;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        disabled={!check.ok && !active}
                        onClick={() => setSpecial(active ? null : proj.id)}
                        data-testid={`special-${proj.id}`}
                        className={`text-left px-2.5 py-2 border transition-colors disabled:opacity-40 ${
                          active ? 'ui-tile-active' : 'ui-tile'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-bold text-slate-100"><Ic n={proj.icon} size={12} /> {proj.name}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10.5px]">
                          <span className={check.ok ? 'text-amber-300 font-mono' : 'text-rose-300'}>
                            {check.ok ? costLabel : check.reason}
                          </span>
                          {active && <span className="font-mono" style={{ color: 'var(--mood-accent)' }}>已选</span>}
                        </div>
                        <div className="text-[10.5px] text-slate-400 mt-1 leading-snug">{proj.note}</div>
                      </button>
                    );
                  })}
                </div>
                {special === 'alumni' && (
                  <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-amber-200 font-medium">邀请学长：</span>
                    {alumniPool.length === 0 ? (
                      <span className="text-slate-400">本校首届高三尚未毕业，将邀校史往届金牌学长代为授课（定向补队伍最弱专题）</span>
                    ) : (
                      <select
                        value={selectedAlumnus?.name ?? ''}
                        onChange={(e) => setAlumniName(e.target.value)}
                        className="bg-slate-900 border border-white/15 px-2 py-1 text-[11.5px] text-slate-100 outline-none"
                      >
                        {alumniPool.map((a) => (
                          <option key={a.name} value={a.name}>
                            {a.name}（Y{a.graduatedYear}届 · 主讲 {TOPIC_NAMES[a.bestTopic]} · 峰值 {a.peakOverall.toFixed(0)}）
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* 周末校内模拟赛 */}
              {stage ? (
                <div className="ui-panel px-3.5 py-2.5" data-testid="mock-disabled">
                  <div className="text-[12px] font-bold text-slate-200">周末校内模拟赛 · 本周由正赛替代</div>
                  <div className="text-[11.5px] text-slate-400 mt-0.5">
                    第 {season.week} 周是 <b className="text-white">{stage.short}</b> 正赛周，本周不打校内模拟赛；专题、强度与精力分配照常生效。
                  </div>
                </div>
              ) : (
                <div className="ui-panel p-3.5">
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className="text-[12px] font-bold text-slate-200">周末校内模拟赛</span>
                    <span className="text-[11px] text-slate-400">难度略高于队伍水平时成长最多</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2 mb-2.5">
                    {(Object.keys(MOCK_PRESETS) as MockPreset[]).map((k) => {
                      const info = MOCK_PRESETS[k];
                      const active = mock.preset === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setMock({ ...mock, preset: k })}
                          data-testid={`mock-${k}`}
                          className={`text-left px-2.5 py-2 border transition-colors ${
                            active ? 'ui-tile-active' : 'ui-tile'
                          }`}
                        >
                          <div className="text-[12px] font-bold text-slate-100">{info.name}档</div>
                          <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{info.note}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block">
                      <div className="flex justify-between text-[11.5px] text-slate-300 mb-1">
                        <span>题数</span><b className="text-white font-mono">{mock.problemCount} 题</b>
                      </div>
                      <input
                        type="range" min={1} max={6} step={1} value={mock.problemCount}
                        onChange={(e) => setMock({ ...mock, problemCount: Number(e.target.value) })}
                        data-testid="mock-count"
                        className="w-full"
                      />
                    </label>
                    <label className="block">
                      <div className="flex justify-between text-[11.5px] text-slate-300 mb-1">
                        <span>时长</span><b className="text-white font-mono">{mock.minutes} 分钟</b>
                      </div>
                      <input
                        type="range" min={60} max={300} step={30} value={mock.minutes}
                        onChange={(e) => setMock({ ...mock, minutes: Number(e.target.value) })}
                        data-testid="mock-minutes"
                        className="w-full"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 右侧吸顶操作台 + 队伍状态 */}
            <div className="space-y-3 lg:sticky lg:top-24">
              <div className="ui-panel-hero p-3.5 space-y-2.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">本周方案确认</div>
                <div className="text-[12px] text-slate-200 leading-relaxed">
                  <div>
                    主力：<b className="text-white">{intensity === 'rest' ? '休息恢复' : topic ? TOPIC_NAMES[topic] : '未选专题'}</b>
                    {season.reserve.length > 0 && intensity !== 'rest' && (
                      <span className="text-amber-300 text-[11px] ml-1.5">
                        · 梯队 {reserveTopic ? TOPIC_NAMES[reserveTopic] : '同主力'}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 text-[11.5px] mt-0.5">
                    {INTENSITY_INFO[intensity].name} · {SQUAD_FOCUS_INFO[focus].name}
                    {care.length > 0 ? ` · 个别关照 ${care.length} 人` : ''}
                    {special ? ` · ${SPECIAL_PROJECTS.find((p) => p.id === special)?.name}` : ''}
                    {!stage ? ` · 模拟赛 ${MOCK_PRESETS[mock.preset].name} ${mock.problemCount}题` : ` · 周末 ${stage.short}`}
                  </div>
                </div>
                <button
                  disabled={!canGo}
                  onClick={() => onPlan(buildPlan())}
                  data-testid="plan-confirm"
                  className="w-full py-2.5 ui-btn-primary text-sm"
                >
                  {intensity === 'rest' ? <><Ic n="coffee" /> 本周休息，进入周末</> : <><Ic n="book" /> 排入本周训练</>}
                </button>
                {!stage && onFastForward && (
                  <button
                    type="button"
                    disabled={!canGo}
                    onClick={() => onFastForward(buildPlan())}
                    data-testid="plan-fast-forward"
                    title="按当前方案连续跳过平淡周，遇事件、正赛或队员疲劳 > 70 时自动停下"
                    className="w-full py-2 ui-btn-ghost text-[12px] font-bold text-sky-200 border-sky-500/35 hover:bg-sky-500/10 disabled:opacity-40"
                  >
                    <Ic n="fastForward" size={13} /> 按此方案连推（至事件/正赛）
                  </button>
                )}
                {lastPlan && (() => {
                  const t = lastPlan.topic;
                  const changed = t !== topic || lastPlan.intensity !== intensity || lastPlan.focus !== focus || (lastPlan.reserveTopic ?? null) !== reserveTopic;
                  return (
                    <div className="pt-2 border-t border-white/[0.08] space-y-1.5" data-testid="last-plan">
                      <div className="text-[11px] text-slate-400 truncate">
                        <Ic n="pin" size={11} /> 上周：{t ? TOPIC_NAMES[t] : '休息'} · {INTENSITY_INFO[lastPlan.intensity].name}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setTopic(lastPlan.topic);
                            setReserveTopic(lastPlan.reserveTopic ?? null);
                            setIntensity(lastPlan.intensity);
                            if (lastPlan.focus) setFocus(lastPlan.focus);
                            if (lastPlan.care) setCare(lastPlan.care);
                            if (lastPlan.mock) setMock(lastPlan.mock);
                          }}
                          className="ui-btn-ghost flex-1 py-1 text-[11px]"
                        >
                          {changed ? '恢复上周' : '已沿用'}
                        </button>
                        <button
                          onClick={() => onPlan(lastPlan)}
                          data-testid="plan-same-as-last"
                          className="ui-btn-ghost flex-1 py-1 text-[11px] font-bold text-white"
                        >
                          一字不改直接排
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <TeamPanel season={season} care={care} onToggleCare={toggleCare} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===== 本周插曲：事件卡（暖纸墨叙事） =====
function EventCard({ ev, season, onPick }: { ev: PendingEvent; season: SeasonState; onPick: (optionId: string) => void }) {
  return (
    <div className="ui-note-card p-5 mb-4">
      <div className="flex items-center gap-2 mb-2" data-testid="event-card">
        <span className="text-[11px] px-2 py-0.5 border border-amber-500/40 bg-amber-500/15 text-amber-200 font-bold">{ev.tag}</span>
        <span className="text-[11px] text-amber-200/80 font-mono">第 {ev.week} 周 · 本周插曲</span>
        <div className="flex-1" />
        <span className="text-[11px] text-slate-400">处理完才能排训练</span>
      </div>
      <h3 className="ui-serif text-lg font-bold text-white mb-2">「{ev.title}」</h3>
      <p className="ui-serif text-[13.5px] text-slate-200 leading-relaxed mb-3">{ev.text}</p>
      <QuoteLine name={ev.target} seed={season.seed + ev.week} />
      <div className="grid sm:grid-cols-3 gap-2.5 mt-4">
        {ev.options.map((o) => (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            data-testid={`event-opt-${o.id}`}
            className="ui-tile text-left px-3.5 py-3 hover:border-amber-400/55 hover:bg-amber-500/10"
          >
            <div className="text-[12.5px] font-bold text-slate-100">{o.label}</div>
            <div className="text-[11px] text-slate-300 mt-1 leading-snug">{o.note}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== 阶段三：训练报告 =====
function ReportView({ season, report, onRun }: { season: SeasonState; report: TrainingReport; onRun: (tactic?: ContestTactic) => void }) {
  const [tactic, setTactic] = useState<ContestTactic>(season.nextTactic ?? 'normal');
  const plan = report.plan;
  const tone = { good: 0, ok: 0, flat: 0, bad: 0 } as Record<TrainingLine['tone'], number>;
  report.lines.forEach((l) => { tone[l.tone] += 1; });
  const stage = stageOfWeek(season.week);
  const quoted = report.lines.find((l) => quoteFor(l.name, season.seed + report.week));
  return (
    <div className="pt-5">
      <div className="ui-panel-hero p-4 mb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-base font-bold text-white">
            第 {report.week} 周 · {plan.intensity === 'rest' ? '休息' : `练 ${plan.topic ? TOPIC_NAMES[plan.topic] : '自由训练'}`}
          </h2>
          <span className="text-[11.5px] text-slate-400">周中 · 教练的模糊观察（没有精确数字）</span>
        </div>
        <div className="flex flex-wrap gap-4 mt-2 text-[12px]">
          <span className="text-emerald-300"><Ic n="trendUp" /> 状态好 {tone.good}</span>
          <span className="text-sky-300"><Ic n="smile" /> 还行 {tone.ok}</span>
          <span className="text-slate-300"><Ic n="meh" /> 一般 {tone.flat}</span>
          <span className="text-rose-300"><Ic n="frown" /> 白练 {tone.bad}</span>
        </div>
        {quoted && <QuoteLine name={quoted.name} seed={season.seed + report.week} />}
        {report.breakthroughNote && (
          <div className="ui-note-card mt-2.5 px-3 py-2 text-[11.5px] text-emerald-200 border-emerald-500/40" data-testid="breakthrough-note">
            <Ic n="zap" size={12} /> {report.breakthroughNote}
          </div>
        )}
        {report.specialNote && (
          <div className="ui-note-card mt-2.5 px-3 py-2 text-[11.5px] text-amber-200" data-testid="special-note">
            <Ic n="sparkles" size={12} /> {report.specialNote}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="space-y-2">
          {report.lines.map((l) => {
            const t = TONE[l.tone];
            return (
              <div key={l.name} className={`ui-panel border ${t.ring} px-3.5 py-2.5 flex items-center gap-3`}>
                <div className="text-lg"><Ic n={t.icon} size={20} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-slate-100">{l.name}</div>
                  <div className={`text-[11.5px] ${t.text}`}>{l.text}</div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="flex justify-between text-[10.5px] text-slate-400 mb-0.5">
                    <span>疲劳</span>
                    <span className="font-mono">{Math.round(l.fatigue)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 overflow-hidden">
                    <div className={`h-full ${l.fatigue > 65 ? 'bg-rose-400' : l.fatigue > 40 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${l.fatigue}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 lg:sticky lg:top-24">
          <div className="ui-panel p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">周末安排</div>
            {stage ? (
              <>
                <div className="text-[13px] font-bold text-white mb-1">{stage.name}</div>
                <p className="text-[11.5px] text-slate-300 leading-relaxed mb-3">
                  {stage.clock} · {stage.kind === 'prelim' ? `100 分笔试（S 组 ${PRELIM_LINE} 分线，过线即晋级）` : stage.id === 'csp2' ? 'S 组 4 题 240 分钟' : `${stage.levels.length} 题 ${stage.minutes} 分钟${stage.days > 1 ? ` × ${stage.days} 天` : ''}`}
                  ；资格：{stage.kind === 'prelim' ? '全员' : `${stage.gateText}（${qualifiedFor(season, stage)} 人）`}
                </p>
              </>
            ) : (
              <p className="text-[11.5px] text-slate-300 leading-relaxed mb-3">
                本周没有正式比赛，周末跑一场校内模拟赛，只给成长和挂分反馈、不计正式成绩。
              </p>
            )}
            {stage && stage.kind === 'contest' && (
              <div className="mb-3 pt-2 border-t border-white/[0.08]" data-testid="tactic-picker">
                <div className="text-[11px] font-bold text-slate-300 mb-1.5">赛前战术指令</div>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    ['steady', '稳健保底', '强对拍、压挂分、保暴力基本盘'],
                    ['normal', '常规', '按各自考场手感自然发挥'],
                    ['aggressive', '搏命冲高', '敢硬冲正解，上下限同步放大'],
                  ] as [ContestTactic, string, string][]).map(([k, label, note]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTactic(k)}
                      data-testid={`tactic-${k}`}
                      title={note}
                      className={`px-1.5 py-1.5 border text-[11px] font-bold transition-colors ${tactic === k ? 'ui-tile-active text-white' : 'ui-tile text-slate-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="text-[10.5px] text-slate-400 mt-1">
                  {tactic === 'steady' ? '提高对拍率与部分分稳健度，挂分系数 ×0.75' : tactic === 'aggressive' ? '更敢死磕正解拿高分，但挂分风险 ×1.25' : '常规策略：按队员自身能力与习惯出战'}
                </div>
              </div>
            )}
            <button
              onClick={() => onRun(stage?.kind === 'contest' ? tactic : undefined)}
              data-testid="run-contest"
              className="w-full py-2.5 ui-btn-primary text-sm"
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
    <div className="pt-4">
      <div className="ui-panel-hero p-4 mb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-base font-bold text-white">{recap.title}</h2>
          <span className="text-[11.5px] text-slate-300">
            {recap.kind === 'prelim'
              ? '100 分笔试 · S 组'
              : `${recap.format === 'ioi' ? 'IOI 赛制 · ' : 'OI 赛制 · '}${recap.days > 1 ? `${recap.days} 试 · 每试 ` : ''}${recap.levels.map((lv) => levelInfo(lv).name).join(' / ')} · ${recap.minutes} 分钟 · 满分 ${recap.fullScore}`}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 border border-white/10 bg-white/[0.04] text-slate-300 font-mono">
            Y{recap.year} · W{recap.week}
          </span>
        </div>
        {recap.note && <div className="text-[11.5px] text-slate-400 mt-1.5">{recap.note}</div>}
        {recap.kind === 'official' && recap.awards && recap.awards.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5" data-testid="awards">
            {recap.awards.map((a) => (
              <span key={`${a.name}-${a.label}`} className={`text-[11px] px-2 py-0.5 border ${AWARD_STYLE[a.tone]}`}>
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
      <div className="mt-3 text-[11.5px] text-slate-400">
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
    <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
      <div className="ui-panel p-4">
        <div className="flex flex-wrap items-baseline gap-3 mb-2 text-[12px]">
          <span className="text-slate-300">全校晋级 <b className="text-emerald-300 font-mono">{passed}</b>/{rows.length}</span>
          <span className="text-slate-300">队里晋级 <b className="text-white font-mono">{teamRows.filter((r) => r.passed).length}</b>/{teamRows.length}</span>
          <span className="text-slate-400">S 线 {recap.cutoff} · 过线即晋级</span>
        </div>
        <table className="w-full text-[12px]" data-testid="national-table">
          <thead className="ui-table-head">
            <tr>
              <th className="text-left px-2 py-1.5 font-medium w-10">#</th>
              <th className="text-left px-2 py-1.5 font-medium">选手</th>
              <th className="text-right px-2 py-1.5 font-medium">初赛分</th>
              <th className="text-right px-2 py-1.5 font-medium">全国排名</th>
              <th className="text-right px-2 py-1.5 font-medium">结果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={`border-t border-white/[0.06] ${isTeam(r.name) ? 'ui-row-selected' : ''}`}>
                <td className="px-2 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                <td className="px-2 py-1.5 text-slate-100">{r.name}{isTeam(r.name) && <span className="ml-1 text-[10px] text-indigo-300"><Ic n="graduation" size={10} /></span>}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-100 font-bold">{r.score}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                  {r.nationalRank ? <>#{r.nationalRank.toLocaleString()}<span className="ml-1 text-[10.5px] text-slate-400">前 {((r.pct ?? 1) * 100).toFixed(1)}%</span></> : '—'}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {r.passed ? <span className="text-[11px] px-1.5 py-0.5 border border-emerald-500/35 bg-emerald-500/15 text-emerald-300">进复赛</span>
                    : <span className="text-[11px] text-slate-500">未过线</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 lg:sticky lg:top-24">
        <button onClick={onNext} data-testid="result-next" className="w-full py-2.5 ui-btn-primary text-sm">
          {nextLabel}
        </button>
        <div className="ui-panel p-4 text-[11.5px] text-slate-300 leading-relaxed">
          初赛考的是阅读程序和完善程序，跟刷专题的关联没有复赛大；但没过线就只能在看台上等一年。
          <div className="mt-2 text-slate-400">
            CSP 只要当年 9 月 1 日前满 12 周岁就能报名，J/S 可同时报；陕西 2026 年第一轮 9 月 19 日、第二轮 10 月 31 日。
            官方规定晋级人数<b className="text-slate-200">不少于</b>第一轮实考的 20%（下限保障，不是上限）；本校是强校，过线率高于全省平均很正常。
          </div>
        </div>
      </div>
    </div>
  );
}

function problemTagOf(recap: ContestRecap, problemId: number): string {
  const perDay = recap.levels.length || 1;
  if (recap.days > 1 && recap.problems.length > perDay) {
    const day = Math.floor(problemId / perDay) + 1;
    const idx = (problemId % perDay) + 1;
    return `D${day}T${idx}`;
  }
  return `P${problemId + 1}`;
}

function ProblemBreakdownRow({
  recap, row, colSpan, ioiFormat,
}: {
  recap: ContestRecap; row: StudentResult; colSpan: number; ioiFormat: boolean;
}) {
  return (
    <tr className="border-t border-slate-800/40 bg-black/25">
      <td colSpan={colSpan} className="px-3 py-2.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
          <span>
            <b className="text-slate-200">{row.name}</b> · 单题明细与{ioiFormat ? '提交记录' : '挂分账单'}
          </span>
          <span className="font-mono text-slate-500">
            {ioiFormat ? `总分 ${row.real}` : `估 ${row.est} → 实 ${row.real}（${row.delta > 0 ? `+${row.delta}` : row.delta}）`}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {row.perProblem.map((pr) => {
            const p = recap.problems[pr.problemId];
            const lv = p ? levelInfo(p.level) : null;
            const tag = problemTagOf(recap, pr.problemId);
            const dropTone = pr.delta < 0
              ? 'text-rose-300 border-rose-500/30 bg-rose-500/[0.06]'
              : pr.delta > 0
                ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.06]'
                : 'text-slate-300 border-slate-700/60 bg-slate-900/50';
            const reasonTone = pr.delta < 0
              ? 'text-rose-300/90'
              : pr.delta > 0
                ? 'text-emerald-300/90'
                : pr.real >= 100
                  ? 'text-emerald-300/80'
                  : 'text-slate-400';
            return (
              <div key={pr.problemId} className={`rounded-lg border px-2.5 py-1.5 ${dropTone}`}>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-slate-200">{tag}</span>
                  {p && <span className="text-[11px] text-slate-200 truncate">{p.title}</span>}
                  {lv && (
                    <span
                      className="text-[9px] px-1 rounded font-bold shrink-0"
                      style={{ color: lv.ink, backgroundColor: lv.color + '28' }}
                    >
                      {lv.name}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] font-bold text-slate-100 shrink-0">
                    {ioiFormat ? `${pr.real}` : `${pr.est} → ${pr.real}`}
                  </span>
                  {!ioiFormat && pr.delta !== 0 && (
                    <span className={`font-mono text-[10px] font-bold shrink-0 ${pr.delta < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {pr.delta > 0 ? `+${pr.delta}` : pr.delta}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                  <span className={`truncate ${reasonTone}`}>
                    {pr.reason || (pr.attempts === 0 ? '未提交' : pr.real >= 100 ? 'AC' : '正常发挥')}
                  </span>
                  <span className="font-mono text-[9px] text-slate-500 shrink-0">
                    {pr.attempts > 0 ? `${pr.attempts} 次提交` : '未交'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

function DropHighlights({
  recap, isTeam, onPick,
}: {
  recap: ContestRecap; isTeam: (n: string) => boolean; onPick: (name: string) => void;
}) {
  if (recap.format === 'ioi') return null;
  type DropEvent = { name: string; problemId: number; est: number; real: number; delta: number; reason: string; onTeam: boolean };
  const drops: DropEvent[] = [];
  const gains: DropEvent[] = [];
  for (const r of recap.rows) {
    for (const pr of r.perProblem) {
      if (pr.delta <= -10) {
        drops.push({ name: r.name, problemId: pr.problemId, est: pr.est, real: pr.real, delta: pr.delta, reason: pr.reason, onTeam: isTeam(r.name) });
      } else if (pr.delta >= 10) {
        gains.push({ name: r.name, problemId: pr.problemId, est: pr.est, real: pr.real, delta: pr.delta, reason: pr.reason, onTeam: isTeam(r.name) });
      }
    }
  }
  drops.sort((a, b) => a.delta - b.delta || Number(b.onTeam) - Number(a.onTeam));
  gains.sort((a, b) => b.delta - a.delta || Number(b.onTeam) - Number(a.onTeam));
  const topDrops = drops.slice(0, 3);
  const topGains = gains.slice(0, 2);
  if (!topDrops.length && !topGains.length) return null;

  return (
    <div className="ui-panel p-4 space-y-2.5" data-testid="drop-highlights">
      <div className="text-[11.5px] font-bold text-slate-200 flex items-center gap-1.5">
        <Ic n="alert" size={13} /> 本场挂分 / 反挂账单
      </div>
      {topDrops.length > 0 && (
        <div className="space-y-1.5">
          {topDrops.map((d, i) => (
            <button
              key={`d-${d.name}-${d.problemId}-${i}`}
              onClick={() => onPick(d.name)}
              className="w-full text-left rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-2.5 py-1.5 hover:border-rose-400/45 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-slate-100 font-medium truncate">{d.name}</span>
                <span className="font-mono text-[10px] text-slate-400">{problemTagOf(recap, d.problemId)}</span>
                <span className="ml-auto font-mono text-rose-300 font-bold shrink-0">
                  {d.est} → {d.real} ({d.delta})
                </span>
              </div>
              <div className="text-[10px] text-rose-200/80 truncate mt-0.5">{d.reason || '暗病挂分'}</div>
            </button>
          ))}
        </div>
      )}
      {topGains.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
          {topGains.map((g, i) => (
            <button
              key={`g-${g.name}-${g.problemId}-${i}`}
              onClick={() => onPick(g.name)}
              className="w-full text-left rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-2.5 py-1.5 hover:border-emerald-400/45 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-slate-100 font-medium truncate">{g.name}</span>
                <span className="font-mono text-[10px] text-slate-400">{problemTagOf(recap, g.problemId)}</span>
                <span className="ml-auto font-mono text-emerald-300 font-bold shrink-0">
                  {g.est} → {g.real} (+{g.delta})
                </span>
              </div>
              <div className="text-[10px] text-emerald-200/80 truncate mt-0.5">{g.reason || '反挂加分'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OfficialResult({
  season, recap, isTeam, onNext, nextLabel,
}: {
  season: SeasonState; recap: ContestRecap; isTeam: (n: string) => boolean; onNext: () => void; nextLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = recap.rows;
  const top = rows.slice(0, 15);
  const awardOf = new Map((recap.awards ?? []).map((a) => [a.name, a]));
  const provStage = recap.stageId === 'csp2' || recap.stageId === 'noip' || recap.stageId === 'prov';
  const globalStage = recap.stageId === 'ioi';
  const ioiFormat = recap.format === 'ioi';
  const natOf = new Map((recap.national?.rows ?? []).map((r) => [r.name, r]));
  const teamRows = rows.filter((r) => isTeam(r.name));
  const quoted = teamRows.find((r) => quoteFor(r.name, recap.week * 7919 + recap.year * 131));
  const focusStudent = (name: string) => {
    const idx = rows.findIndex((x) => x.name === name);
    if (idx >= 15) setShowAll(true);
    setExpanded((cur) => (cur === name ? null : name));
  };
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
    <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
      <div className="ui-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="text-[12px] text-slate-300">
            榜单（{rows.length} 人参赛{recap.national ? (recap.stageId === 'csp1' ? ' · 全国约 S 3.44 万 / J 5.78 万' : ` · ${globalStage ? '全球' : provStage ? '陕西' : '全国'}约 ${recap.national.total.toLocaleString()} 人`) : ''}）
          </div>
          <span className="text-[11px] text-slate-400">点选手展开单题明细与挂分原因</span>
          <div className="flex-1" />
          <button onClick={() => setShowAll((v) => !v)} className="ui-pill">
            {showAll ? '只看前 15' : '看完整榜单'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" data-testid="national-table">
            <thead className="ui-table-head">
              <tr>
                <th className="text-left px-2 py-2 font-medium w-10">#</th>
                <th className="text-left px-2 py-2 font-medium">选手</th>
                <th className="text-right px-2 py-2 font-medium">{recap.stageId === 'prov' ? '折算总分' : ioiFormat ? '得分' : '真分'}</th>
                <th className="text-right px-2 py-2 font-medium">{ioiFormat ? '实时' : '自估'}</th>
                <th className="text-right px-2 py-2 font-medium">{ioiFormat ? '偏差' : '挂分'}</th>
                <th className="text-right px-2 py-2 font-medium">{globalStage ? '全球排名' : provStage ? '省排名（陕西）' : '全国排名'}</th>
                <th className="text-left px-2 py-2 font-medium">成绩</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? rows : top).map((r) => {
                const a = awardOf.get(r.name);
                const nat = natOf.get(r.name);
                const isOpen = expanded === r.name;
                return (
                  <Fragment key={r.name}>
                    <tr
                      onClick={() => setExpanded((cur) => (cur === r.name ? null : r.name))}
                      className={`cursor-pointer border-t border-slate-800/60 transition-colors ${
                        isOpen ? 'bg-slate-800/60' : isTeam(r.name) ? 'bg-indigo-600/10 hover:bg-indigo-600/15' : 'hover:bg-slate-800/35'
                      }`}
                    >
                      <td className="px-2 py-1.5 text-slate-500 font-mono">{r.rank}</td>
                      <td className="px-2 py-1.5 text-slate-100">
                        <span className="inline-flex items-center gap-1">
                          {r.name}
                          {isTeam(r.name) && <span className="text-[9px] text-indigo-300"><Ic n="graduation" size={9} /></span>}
                        </span>
                        {recap.stageId === 'noi' && r.written != null && (
                          <div className="text-[9px] text-sky-300 leading-tight">
                            笔试 {r.written}{r.bonus ? ` · A类 +${r.bonus}` : ''}
                          </div>
                        )}
                        {nat?.note && (nat.note.includes('国集') || nat.note.startsWith('答辩') || nat.note.startsWith('积分')) && (
                          <div className="text-[9px] text-fuchsia-300 leading-tight">{nat.note}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-100">
                        {recap.stageId === 'prov' ? (nat?.score ?? Math.round(r.real)) : r.real}
                        {recap.stageId === 'prov' && nat?.raw != null && (
                          <div className="text-[9px] text-slate-500 leading-tight">原始 {nat.raw}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-400">{r.est}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {r.delta < 0
                          ? <span className="ui-badge-drop text-[11px]">{r.delta}</span>
                          : r.delta > 0
                            ? <span className="ui-badge-gain text-[11px]">+{r.delta}</span>
                            : <span className="text-slate-500">0</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                        {nat ? <>#{nat.rank.toLocaleString()}<span className="ml-1 text-[9px] text-slate-500">前 {(nat.pct * 100).toFixed(1)}%</span></> : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        {a ? <span className={`text-[10px] px-1.5 py-0.5 rounded border ${AWARD_STYLE[a.tone]}`}>{a.label}</span> : <span className="text-[10px] text-slate-600">—</span>}
                      </td>
                    </tr>
                    {isOpen && r.perProblem.length > 0 && (
                      <ProblemBreakdownRow recap={recap} row={r} colSpan={7} ioiFormat={ioiFormat} />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
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
        <button onClick={onNext} data-testid="result-next" className="w-full py-2.5 ui-btn-primary text-sm">
          {nextLabel}
        </button>
        <DropHighlights recap={recap} isTeam={isTeam} onPick={focusStudent} />
        <div className="ui-panel p-4">
          <div className="text-[12px] font-bold text-slate-200 mb-2">队里成绩</div>
          <div className="space-y-1.5">
            {teamRows.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-[11px]">
                <button onClick={() => focusStudent(r.name)} className="text-slate-200 hover:text-indigo-300 truncate text-left">
                  {r.name}
                </button>
                <span className="ml-auto font-mono text-slate-300">{r.real}</span>
                {!ioiFormat && r.delta !== 0 && (
                  <span className={`font-mono text-[10px] ${r.delta < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </span>
                )}
                <span className="font-mono text-slate-500">#{r.rank}</span>
              </div>
            ))}
          </div>
          {quoted && <QuoteLine name={quoted.name} seed={recap.week * 7919 + recap.year * 131} />}
        </div>
        {recap.rivals && recap.rivals.length > 0 && (
          <div className="ui-panel p-4" data-testid="rival-compare">
            <div className="text-[12px] font-bold text-slate-200 mb-2">宿敌名校对位</div>
            <div className="space-y-1.5">
              {recap.rivals.map((rv) => (
                <div key={rv.school} className="border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{rv.school}</span>
                    <span className={`font-bold ${rv.beaten ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {rv.beaten ? '占优' : '落后'}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-0.5 flex justify-between">
                    <span>王牌 {rv.ace} · {rv.aceScore}分</span>
                    <span>我校最高 {rv.ourTop}分</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const top = recap.rows.slice(0, 12);
  const teamRows = recap.rows.filter((r) => isTeam(r.name));
  const focusStudent = (name: string) => {
    const idx = recap.rows.findIndex((x) => x.name === name);
    if (idx >= 12) setShowAll(true);
    setExpanded((cur) => (cur === name ? null : name));
  };
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
      <div className="ui-panel p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="text-[12px] font-bold text-slate-200">模拟赛榜单</div>
          <span className="text-[11px] text-slate-400">点选手展开单题明细与挂分原因</span>
          <div className="flex-1" />
          <button onClick={() => setShowAll((v) => !v)} className="ui-pill">
            {showAll ? '只看前 12' : '看完整榜单'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="ui-table-head">
              <tr>
                <th className="text-left px-2 py-2 font-medium w-12">#</th>
                <th className="text-left px-2 py-2 font-medium">选手</th>
                <th className="text-right px-2 py-2 font-medium">真分</th>
                <th className="text-right px-2 py-2 font-medium">自估</th>
                <th className="text-right px-2 py-2 font-medium">挂分</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? recap.rows : top).map((r) => {
                const isOpen = expanded === r.name;
                return (
                  <Fragment key={r.name}>
                    <tr
                      onClick={() => setExpanded((cur) => (cur === r.name ? null : r.name))}
                      className={`cursor-pointer border-t border-slate-800/60 transition-colors ${
                        isOpen ? 'bg-slate-800/60' : isTeam(r.name) ? 'bg-indigo-600/10 hover:bg-indigo-600/15' : 'hover:bg-slate-800/35'
                      }`}
                    >
                      <td className="px-2 py-1.5 text-slate-500 font-mono">{r.rank}</td>
                      <td className="px-2 py-1.5 text-slate-100">{r.name}{isTeam(r.name) && <span className="ml-1 text-[9px] text-indigo-300"><Ic n="graduation" size={9} /></span>}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-100">{r.real}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-400">{r.est}</td>
                      <td className="px-2 py-1.5 text-right font-mono">
                        {r.delta < 0
                          ? <span className="ui-badge-drop text-[11px]">{r.delta}</span>
                          : r.delta > 0
                            ? <span className="ui-badge-gain text-[11px]">+{r.delta}</span>
                            : <span className="text-slate-500">0</span>}
                      </td>
                    </tr>
                    {isOpen && r.perProblem.length > 0 && (
                      <ProblemBreakdownRow recap={recap} row={r} colSpan={5} ioiFormat={false} />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!showAll && teamRows.some((r) => r.rank > 12) && (
          <div className="mt-2 text-[10px] text-slate-500">
            队里还有 {teamRows.filter((r) => r.rank > 12).length} 人在 12 名开外：{teamRows.filter((r) => r.rank > 12).map((r) => `${r.name}#${r.rank}`).join('、')}
          </div>
        )}
      </div>
      <div className="space-y-3 lg:sticky lg:top-24">
        <button onClick={onNext} data-testid="result-next" className="w-full py-2.5 ui-btn-primary text-sm">
          {nextLabel}
        </button>
        <DropHighlights recap={recap} isTeam={isTeam} onPick={focusStudent} />
      </div>
    </div>
  );
}

// ===== 学年末：继续 or 退休 =====
function YearEnd({
  season, onContinue, onRetire, onHallOfFame,
}: {
  season: SeasonState; onContinue: () => void; onRetire: () => void; onHallOfFame: () => void;
}) {
  const rep: CareerReport = seasonReport(season);
  const y = season.history[season.history.length - 1];
  const t = rep.totals;
  const quoted = season.team
    .map((n) => season.students.find((st) => st.name === n))
    .find((st) => st && quoteFor(st.name, season.seed + season.year));
  return (
    <div className="pt-5" data-testid="year-end">
      <div className="ui-panel-hero p-6 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="text-[11.5px] text-slate-400">第 {season.year} 学年结束 · 教练可以继续带，也可以在这里退休</div>
          <button onClick={onHallOfFame} className="ui-btn-ghost px-2.5 py-1 text-[11px]">
            <Ic n="trophy" size={12} /> 查看校史荣誉墙
          </button>
        </div>
        <h2 className="text-xl font-black text-white mb-2"><Ic n="calendar" /> 学年结算</h2>
        <div className="flex flex-wrap gap-6 text-[12px] mb-3">
          <Stat label="本年省一（S/NOIP）" value={`${(y?.csp2First ?? 0) + (y?.noipFirst ?? 0)}`} tone="text-amber-300" />
          <Stat label="本年省队" value={`${y?.provTeam ?? 0}`} tone="text-rose-300" />
          <Stat label="本年 NOI 牌" value={`${(y?.noiGold ?? 0) + (y?.noiSilver ?? 0) + (y?.noiBronze ?? 0)}`} tone="text-emerald-300" />
          <Stat label="本年国集 / 保送" value={`${y?.noiSelected ?? 0}`} tone="text-violet-300" />
          <Stat label="本年综合提升" value={`+${Math.max(0, y?.avgOverallGain ?? 0).toFixed(1)}`} tone="text-sky-300" />
        </div>
        <div className="text-[11.5px] text-slate-400">
          生涯累计：省一 {t.csp2First + t.noipFirst} · 省队 {t.provTeam} · NOI 牌 {t.noiGold + t.noiSilver + t.noiBronze} · 国集 {t.noiSelected} · CTT {t.cttSelected} / CTS {t.ctsSelected} · IOI 牌 {t.ioiGold + t.ioiSilver + t.ioiBronze}
        </div>
        {y?.goalResult && (
          <div
            data-testid="goal-verdict"
            className={`mt-3 px-3 py-2 border text-[12px] ${y.goalResult.met ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200'}`}
          >
            <b className="mr-1.5">学年目标「{y.goalResult.title}」：</b>
            {y.goalResult.note}
          </div>
        )}
        {quoted && <QuoteLine name={quoted.name} seed={season.seed + season.year} />}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <button
          onClick={onContinue}
          data-testid="continue-career"
          className="py-3 ui-btn-primary text-sm"
        >
          <Ic n="calendar" /> 继续带队 · 进入第 {season.year + 1} 学年
        </button>
        <button
          onClick={onRetire}
          data-testid="retire-career"
          className="py-3 ui-btn-ghost border-amber-500/40 bg-amber-500/10 text-amber-200 font-bold text-sm"
        >
          <Ic n="trophy" /> 退休 · 查看生涯评价
        </button>
      </div>
      <div className="mt-3 text-[11.5px] text-slate-400 leading-relaxed">
        继续带队：学生升一级，高三毕业，补 6 个初一 + 4 个高一新生；梯队在下一学年重新选。
        退休：按「每年平均产出 + 生涯高光」结算教练评分。
      </div>
    </div>
  );
}

// ===== 阶段五：生涯结算 =====
function Finale({ season, onNew, onHallOfFame }: { season: SeasonState; onNew: () => void; onHallOfFame: () => void }) {
  const rep: CareerReport = seasonReport(season);
  const t = rep.totals;
  const quoted = season.team
    .map((n) => season.students.find((st) => st.name === n))
    .find((st) => st && quoteFor(st.name, season.seed + season.year));
  return (
    <div className="pt-4">
      <div className="ui-panel-hero p-6 mb-4 text-center">
        <div className="text-[11.5px] text-slate-400 mb-1">{season.history.length || season.year} 年带训结束 · 第 {season.year} 学年</div>
        <div data-testid="finale-grade" className="text-3xl font-black text-white mb-1">{rep.grade}</div>
        <div className="ui-serif text-[13.5px] text-slate-200 max-w-xl mx-auto leading-relaxed">{rep.comment}</div>
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
        <div className="ui-panel p-4">
          <div className="text-[12px] font-bold text-slate-200 mb-2">逐年战绩</div>
          <table className="w-full text-[12px]">
            <thead className="ui-table-head">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">学年</th>
                <th className="text-right px-2 py-1.5 font-medium">初赛晋级</th>
                <th className="text-right px-2 py-1.5 font-medium">省一</th>
                <th className="text-right px-2 py-1.5 font-medium">省队</th>
                <th className="text-right px-2 py-1.5 font-medium">NOI 牌</th>
                <th className="text-right px-2 py-1.5 font-medium">综合+</th>
              </tr>
            </thead>
            <tbody>
              {rep.years.map((y) => {
                const noi = y.noiGold + y.noiSilver + y.noiBronze;
                return (
                  <tr key={y.year} className="border-t border-white/[0.06]">
                    <td className="px-2 py-1.5 text-slate-100">第 {y.year} 学年</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-300">{y.csp1Pass}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-amber-300">{y.csp2First + y.noipFirst}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-rose-300">{y.provTeam}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-emerald-300">{noi || '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-sky-300">+{y.avgOverallGain.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 text-[11.5px] text-slate-400">
            累计：初赛晋级 {t.csp1Pass} · S 组省一 {t.csp2First} · NOIP 省一 {t.noipFirst} · 省队 {t.provTeam} · WC 金 {t.wcGold} 银 {t.wcSilver} · APIO 金 {t.apioGold} 银 {t.apioSilver} 铜 {t.apioBronze} · NOI 金 {t.noiGold} 银 {t.noiSilver} 铜 {t.noiBronze} · CTT {t.cttSelected} / CTS {t.ctsSelected} · IOI 金 {t.ioiGold} 银 {t.ioiSilver} 铜 {t.ioiBronze}
          </div>
        </div>

        <div className="space-y-4">
          <div className="ui-panel p-4">
            <div className="text-[12px] font-bold text-slate-200 mb-2">最后一届队员</div>
            <table className="w-full text-[12px]">
              <thead className="ui-table-head">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">选手</th>
                  <th className="text-left px-2 py-1.5 font-medium">年级</th>
                  <th className="text-right px-2 py-1.5 font-medium">综合</th>
                  <th className="text-right px-2 py-1.5 font-medium">结果</th>
                </tr>
              </thead>
              <tbody>
                {rep.team.slice().sort((a, b) => b.endOverall - a.endOverall).map((r) => (
                  <tr key={r.name} className="border-t border-white/[0.06]">
                    <td className="px-2 py-1.5 text-slate-100">{r.name}</td>
                    <td className="px-2 py-1.5 text-slate-300">{GRADE_NAMES[r.grade]}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-300">{r.startOverall.toFixed(0)} <span className="text-emerald-300"><Ic n="arrowRight" size={10} /> {r.endOverall.toFixed(0)}</span></td>
                    <td className="px-2 py-1.5 text-right">
                      {r.provTeam ? <span className="text-[10.5px] px-1.5 py-0.5 border border-rose-500/35 bg-rose-500/15 text-rose-300">省队</span>
                        : r.noipFirst || r.csp2Award === 1 ? <span className="text-[10.5px] px-1.5 py-0.5 border border-amber-500/35 bg-amber-500/15 text-amber-300">{'省一'}</span>
                          : <span className="text-[10.5px] text-slate-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={onHallOfFame} className="ui-btn-ghost px-4 py-2.5 text-sm">
              <Ic n="trophy" /> 校史荣誉墙
            </button>
            <button onClick={onNew} data-testid="finale-new" className="flex-1 py-2.5 ui-btn-primary text-sm">
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

/** 教练模式彩蛋：有专属语录才显示，暖纸墨引文样式 */
function QuoteLine({ name, seed }: { name: string | null; seed: number }) {
  const q = quoteFor(name, seed);
  if (!q || !name) return null;
  return (
    <div className="ui-quote">
      <span className="text-amber-300 font-sans font-bold mr-1">{name}：</span>“{plainText(q.text)}”
    </div>
  );
}

// ===== 侧边：队伍状态（支持排训练周直接安排个别关照） =====
function TeamPanel({
  season, care, onToggleCare,
}: {
  season: SeasonState;
  care?: CareOrder[];
  onToggleCare?: (name: string, action: CareAction) => void;
}) {
  const team = teamStudents(season);
  const reserve = reserveStudents(season);
  const [openName, setOpenName] = useState<string | null>(null);
  const careOf = new Map((care ?? []).map((c) => [c.name, c.action]));

  const renderOne = (st: SeasonStudent) => {
    const expanded = openName === st.name;
    const activeCare = careOf.get(st.name);
    return (
      <div key={st.name} className="text-[12px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpenName(expanded ? null : st.name)}
            data-testid={`student-detail-${st.name}`}
            aria-expanded={expanded}
            className="flex-1 min-w-0 text-left px-1.5 -ml-1.5 py-1 hover:bg-white/[0.05] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <span className={`truncate font-medium ${st.onReserve ? 'text-amber-100' : 'text-slate-100'}`}>
                {st.onReserve ? <><Ic n="layers" size={11} /> </> : null}{st.name}
              </span>
              <span className="text-[10.5px] text-slate-400 shrink-0">{GRADE_NAMES[st.grade]}</span>
              <span className="ml-auto font-mono text-slate-300 shrink-0">{overallScoreOf(st).toFixed(1)}</span>
            </div>
            <div className="h-1 mt-1 bg-slate-800 overflow-hidden">
              <div
                className={`h-full ${st.fatigue > 65 ? 'bg-rose-400' : st.fatigue > 40 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${st.fatigue}%` }}
              />
            </div>
          </button>
          {onToggleCare && (
            <div className="flex items-center gap-0.5 shrink-0">
              {(['rest', 'weak', 'meta'] as CareAction[]).map((act) => {
                const info = CARE_INFO[act];
                const isOn = activeCare === act;
                return (
                  <button
                    key={act}
                    type="button"
                    onClick={() => onToggleCare(st.name, act)}
                    title={`${info.name}：${info.note}`}
                    data-testid={`care-${st.name}-${act}`}
                    className={`px-1 py-0.5 text-[10px] border transition-colors ${
                      isOn ? 'ui-pill-active' : 'border-white/10 text-slate-400 hover:text-white hover:border-white/25'
                    }`}
                  >
                    {info.short}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {expanded && <StudentDetail student={st} archive={archiveOf(season, st.name)} />}
      </div>
    );
  };
  return (
    <div className="ui-panel p-3.5">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] font-bold text-slate-200">队伍状态</span>
        <span className="text-[11px] font-mono text-slate-400">
          主力 {team.length} / 梯队 {reserve.length}
          {onToggleCare ? ` · 关照 ${care?.length ?? 0}/${CARE_MAX}` : ''}
        </span>
      </div>
      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
        {team.map(renderOne)}
        {reserve.length > 0 && <div className="pt-2 text-[10.5px] text-amber-300 border-t border-white/[0.06]">梯队 · 跟练不占正赛名额</div>}
        {reserve.map(renderOne)}
      </div>
      <div className="text-[10.5px] text-slate-400 mt-2.5 pt-2 border-t border-white/[0.06]">
        {onToggleCare ? '右侧 休/短/码 = 个别关照（最多 2 人）· 点名字看详情' : '细条 = 疲劳 · 点名字看雷达与详情'}
      </div>
    </div>
  );
}

// ===== 比赛观看：用观战同一套实时引擎重放一场 =====
function CoachPlay({
  round, teamNames, opvName, onDone, onSkip,
}: {
  round: ContestRound;
  teamNames: string[];
  opvName: string | null;
  onDone: (est: Record<string, number>, contest: Contest) => void;
  onSkip: () => void;
}) {
  const [contest] = useState(() => createContest(round.cfg));
  const finish = () => {
    const ioi = isIoiFormat(contest);
    const est: Record<string, number> = {};
    for (const st of contest.students) est[st.name] = totalEstimate(st, ioi);
    onDone(est, contest);
  };
  return (
    <ContestScreen
      contest={contest}
      onFinish={finish}
      onSkip={onSkip}
      teamNames={teamNames}
      opvName={opvName}
      guideLines={round.guideLines}
      roundLabel={round.label}
    />
  );
}

// ===== 收卷后的估分榜（OI 赛制还没公布真实成绩；IOI 赛制为实时得分终榜） =====
function EstimateBoard({
  est, isIoi, round, teamNames, opvName, onReveal, onSkip,
}: {
  est: Record<string, number>;
  isIoi?: boolean;
  round?: Contest;
  teamNames?: string[];
  opvName?: string | null;
  onReveal: () => void;
  onSkip: () => void;
}) {
  const [review, setReview] = useState(false);
  const teamSet = new Set(teamNames ?? []);
  const list = Object.entries(est).sort((a, b) => b[1] - a[1]);
  return (
    <div className="pt-5">
      <div className="ui-panel-hero p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold text-white">{isIoi ? '实时终榜' : '估分榜'}</h2>
            <p className="text-[12px] text-slate-300 mt-0.5">
              {isIoi
                ? 'IOI 赛制已实时评测出分；点击下方查看全国/国际排名与奖牌汇总。'
                : '按选手交卷时的自估分排；真实成绩与挂分账单要等评测完公布。'}
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">共 {list.length} 人</span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto border border-white/[0.08] bg-black/20">
          <table className="w-full border-collapse ui-board-table text-[12.5px]">
            <thead className="sticky top-0 z-10 ui-table-head">
              <tr className="text-[11px]">
                <th className="w-14 text-center px-2 py-2 font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium">选手</th>
                <th className="w-28 text-right px-3 py-2 font-medium">{isIoi ? '实时得分' : '自估总分'}</th>
              </tr>
            </thead>
            <tbody>
              {list.map(([name, score], i) => {
                const rank = i + 1;
                const isMine = teamSet.has(name) || name === opvName;
                return (
                  <tr
                    key={name}
                    className={`border-t border-white/[0.05] ${
                      isMine ? 'bg-indigo-500/[0.09]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td
                      className="w-14 px-2 py-2 text-center font-mono"
                      style={isMine ? { boxShadow: 'inset 3px 0 0 var(--mood-accent)' } : undefined}
                    >
                      {rank <= 3 ? (
                        <span className="ui-rank" data-r={rank}>{rank}</span>
                      ) : (
                        <span className="text-slate-400">{rank}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={isMine ? 'text-white font-bold' : 'text-slate-200'}>{name}</span>
                      {name === opvName ? (
                        <span className="ml-1.5 text-[9.5px] px-1 py-0.5 border border-amber-400/45 bg-amber-500/15 text-amber-200 font-bold">
                          OP
                        </span>
                      ) : isMine ? (
                        <span className="ml-1.5 text-[9.5px] px-1 py-0.5 border border-white/15 bg-white/[0.06] text-indigo-200">
                          我队
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-100">
                      {!isIoi && <span className="text-[11px] text-slate-400 font-normal mr-0.5">≈</span>}
                      {Math.round(score)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={onReveal}
            data-testid="coach-reveal"
            className="ui-btn-primary px-4 py-2 text-sm"
          >
            <Ic n="unlock" /> {isIoi ? '查看排名与奖牌' : '公布真实成绩'}
          </button>
          <button
            onClick={onSkip}
            data-testid="coach-skip"
            className="ui-btn-ghost px-4 py-2 text-sm"
          >
            直接看结果
          </button>
          {round && (
            <button
              onClick={() => setReview(true)}
              data-testid="coach-review"
              className="ui-btn-ghost px-4 py-2 text-sm text-emerald-300 border-emerald-500/40"
            >
              <Ic n="brain" /> 看思维链复盘
            </button>
          )}
        </div>
      </div>
      {review && round && <ReviewOverlay round={round} onClose={() => setReview(false)} />}
    </div>
  );
}
