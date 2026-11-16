/**
 * M2 生涯自检：真赛道（初赛→复赛→NOIP→WC→省选→APIO→NOI）× 3 学年。
 * 检查：赛历跑满、年级递进、高三毕业、新高一生、资格链、结算数据不越界。
 *
 * 用法：node scripts/career-check.mjs [seeds...]
 *   默认跑 20261019 / 777 / 4242 三个种子 × best/mid/worst 三支队。
 */
import {
  advanceWeek, chooseEventOption, continueCareer, createSeason, planWeek, runWeeklyContest,
  seasonReport, setTeam, teamStudents, rosterSorted, YEAR_STAGES, YEAR_WEEKS, CAREER_YEARS,
} from '../src/season.ts';
import { TOPIC_LIST } from '../src/game.ts';
import { logRun } from './log.mjs';

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const clampInt = (v) => Math.max(0, Math.min(100, Math.round(v)));

function pickNames(s, mode) {
  const ranked = rosterSorted(s);
  if (mode === 'best') return ranked.slice(0, 7).map((x) => x.name);
  if (mode === 'worst') return ranked.slice(-7).map((x) => x.name);
  const mid = Math.floor((ranked.length - 7) / 2);
  return ranked.slice(mid, mid + 7).map((x) => x.name);
}

/** 换学年时：留下没毕业的老队员，不足 7 人从名单前排补 */
function nextYearTeam(s, mode) {
  const alive = new Set(s.students.map((x) => x.name));
  const kept = s.lastTeam.filter((n) => alive.has(n));
  if (kept.length >= 6) return kept.slice(0, 8);
  const pool = rosterSorted(s).map((x) => x.name);
  const fill = pool.filter((n) => !kept.includes(n)).slice(0, 7 - kept.length);
  void mode;
  return [...kept, ...fill];
}

function autoPlan(s) {
  const team = teamStudents(s);
  const fatigue = avg(team.map((x) => x.fatigue));
  if (fatigue > 62) return { topic: null, intensity: 'rest' };
  const avgOf = (t) => avg(team.map((x) => x.skills.topics[t]));
  const weakest = TOPIC_LIST.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];
  return { topic: weakest, intensity: fatigue < 32 ? 'extra' : 'normal' };
}

function playCareer(seed, mode) {
  let s = createSeason(seed, CAREER_YEARS);
  s = setTeam(s, pickNames(s, mode));
  const check = (where) => {
    if (s.phase !== 'team' && (s.team.length < 6 || s.team.length > 8)) throw new Error(`${where}: 队伍 ${s.team.length} 人`);
    for (const st of s.students) {
      if (!(st.fatigue >= 0 && st.fatigue <= 100)) throw new Error(`${where}: ${st.name} fatigue=${st.fatigue}`);
      if (!(st.grade >= 1 && st.grade <= 6)) throw new Error(`${where}: ${st.name} grade=${st.grade}`);
    }
    if (!(s.year >= 1 && s.year <= CAREER_YEARS)) throw new Error(`${where}: year=${s.year}`);
  };

  let guard = 0;
  while (s.phase !== 'finished' && guard++ < 4000) {
    if (s.phase === 'team') {
      s = setTeam(s, nextYearTeam(s, mode));
      check(`year${s.year} setTeam`);
      continue;
    }
    if (s.phase === 'yearEnd') {
      s = continueCareer(s);
      check(`year${s.year - 1} yearEnd`);
      continue;
    }
    if (s.phase === 'plan') {
      if (s.pendingEvent) {
        const idx = (seed + s.year * 31 + s.week * 7) % s.pendingEvent.options.length;
        s = chooseEventOption(s, s.pendingEvent.options[idx].id);
        if (s.phase !== 'plan') continue;
      }
      s = planWeek(s, autoPlan(s));
      check(`y${s.year}w${s.week} plan`);
      continue;
    }
    if (s.phase === 'report') {
      s = runWeeklyContest(s);
      check(`y${s.year}w${s.week} contest`);
      continue;
    }
    if (s.phase === 'result') {
      // 资格链硬校验：NOIP 起只允许高中生正式参赛；初中生只能走"体验/夏令营"名额
      const c = s.lastContest;
      if (c?.kind === 'official' && ['noip', 'wc', 'prov', 'apio', 'noi', 'ctt', 'cts', 'ioi'].includes(c.stageId)) {
        const senior = new Set(s.students.filter((x) => x.grade >= 4).map((x) => x.name));
        const expNames = new Set((c.national?.rows ?? []).filter((r) => r.note === '体验').map((r) => r.name));
        for (const r of c.rows) {
          if (senior.has(r.name)) continue;
          const canExperience = ['noip', 'prov', 'noi'].includes(c.stageId) && expNames.has(r.name);
          if (!canExperience) throw new Error(`y${s.year} ${c.stageId}: 初中生 ${r.name} 出现在高中组正式比赛`);
        }
        // 体验名额不能拿正式奖项
        for (const a of c.awards ?? []) {
          if (!senior.has(a.name)) throw new Error(`y${s.year} ${c.stageId}: 初中生 ${a.name} 拿到正式奖 ${a.label}`);
        }
      }
      if (c?.kind === 'prelim') {
        // 全校一张 S 卷：没被伤病/处分停赛的人都参加。
        // sitOut 在正赛结算时就消耗掉一场，赛后可能已归零，不能用赛后 s.students
        // 反推赛前的停赛名单；recap.absent 记的才是开考那一刻的缺考名单。
        const names = new Set((c.prelim ?? []).map((p) => p.name));
        const absent = new Set(c.absent ?? []);
        for (const name of absent) {
          if (names.has(name)) throw new Error(`y${s.year} 初赛: ${name} 停赛中却出现在考场`);
        }
        if (names.size !== s.students.length - absent.size) {
          throw new Error(`y${s.year} 初赛: 参赛 ${names.size} 人 ≠ 在校 ${s.students.length} − 停赛 ${absent.size}`);
        }
      }
      // 全国排名合理性：排名在 1..参赛人数 内、分位 0–1、体验名额不能拿正式奖
      if (c?.national) {
        for (const r of c.national.rows) {
          if (!(r.rank >= 1 && r.rank <= c.national.total)) throw new Error(`y${s.year} ${c.stageId}: ${r.name} 全国排名 ${r.rank} 越界（总 ${c.national.total}）`);
          if (!(r.pct > 0 && r.pct <= 1)) throw new Error(`y${s.year} ${c.stageId}: ${r.name} 分位 ${r.pct} 越界`);
          if (r.note === '体验' && !/体验|夏令营/.test(r.award)) throw new Error(`y${s.year} ${c.stageId}: 体验名额 ${r.name} 拿到 ${r.award}`);
        }
      }
      if (c?.kind === 'official' && c.stageId === 'csp2') {
        // 只有初赛过线的人能进复赛
        for (const st of s.students) {
          if (st.csp2 && !st.csp1?.passed) throw new Error(`y${s.year} 复赛: ${st.name} 没过初赛却进了复赛`);
        }
      }
      s = advanceWeek(s);
      check(`y${s.year}w${s.week} advance`);
      continue;
    }
    throw new Error(`卡住的 phase=${s.phase} y${s.year} w${s.week}`);
  }
  if (guard >= 4000) throw new Error('没有走完生涯（疑似死循环）');
  return s;
}

const seeds = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const SEEDS = seeds.length ? seeds : [20261019, 777, 4242];
// 默认跑三支队；完整一轮要十几分钟，冒烟时可用 CAREER_MODES=best 只跑一支
const MODES = (process.env.CAREER_MODES ?? 'best,mid,worst').split(',').filter(Boolean);
const t0 = Date.now();
const rows = [];

for (const seed of SEEDS) {
  for (const mode of MODES) {
    let s = playCareer(seed, mode);
    // —— 结算一致性 ——
    const rep = seasonReport(s);
    if (rep.years.length !== CAREER_YEARS) throw new Error(`seed ${seed} ${mode}: 学年数 ${rep.years.length}`);
    if (s.week !== YEAR_WEEKS + 1) throw new Error(`seed ${seed} ${mode}: 结束周 ${s.week}`);
    if (s.phase !== 'finished' || s.year !== CAREER_YEARS) throw new Error(`seed ${seed} ${mode}: 结束状态 ${s.phase}/Y${s.year}`);
    if (s.students.some((x) => x.grade > 6 || x.grade < 1)) throw new Error('年级越界');

    const yearStats = rep.years.map((y) => {
      const noi = y.noiGold + y.noiSilver + y.noiBronze;
      return { y: y.year, p1: y.csp1Pass, c2: y.csp2First, np: y.noipFirst, pt: y.provTeam, noi };
    });
    const gc = s.newcomers.length;
    rows.push({
      seed, mode,
      team: s.team.join(','),
      years: yearStats,
      gc,
      score: rep.coachScore,
      grade: rep.grade,
      gain: rep.avgOverallGain,
      events: s.eventLog.length,
    });
    void gc;
  }
}

console.log('生涯自检 · 每年 40 周 · 10 场正式比赛 × 3 学年');
console.log('seed       队伍       Y1(初赛/S省一/NOIP省一/省队/NOI牌)  Y2                    Y3                    评分 等级');
for (const r of rows) {
  const fmt = (y) => `${y.p1}/${y.c2}/${y.np}/${y.pt}/${y.noi}`.padEnd(20);
  console.log(
    `${String(r.seed).padEnd(10)} ${r.mode.padEnd(8)} ${r.years.map(fmt).join(' ')} ${String(r.score).padStart(3)} ${r.grade.split(' ')[0]}`,
  );
}

// —— 对比：最强 7 人 vs 最弱 7 人 ——
// 用 CAREER_MODES=best 单队冒烟时没有 worst 队，跳过这段对比即可
const spreads = [];
for (const seed of SEEDS) {
  const best = rows.find((r) => r.seed === seed && r.mode === 'best');
  const worst = rows.find((r) => r.seed === seed && r.mode === 'worst');
  if (best && worst) spreads.push(best.score - worst.score);
}
if (spreads.length) {
  console.log(`\n强队 - 弱队 教练评分差：${spreads.join(' / ')} 分（平均 ${avg(spreads).toFixed(1)}）`);
}
const allScores = rows.map((r) => r.score);
console.log(`评分范围 ${Math.min(...allScores)}–${Math.max(...allScores)}；等级：${[...new Set(rows.map((r) => r.grade.split(' ')[0]))].join('/')}`);
const ms = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`✅ 跑完 ${rows.length} 条三年生涯，用时 ${ms}s`);
const top = rows.reduce((a, b) => (b.score > a.score ? b : a));
const low = rows.reduce((a, b) => (b.score < a.score ? b : a));
logRun('career-check', {
  seeds: [...new Set(rows.map((r) => r.seed))].join('/'),
  runs: rows.length,
  best: `${top.score}${top.grade.split(' ')[0]}`,
  worst: `${low.score}${low.grade.split(' ')[0]}`,
  spread: top.score - low.score,
  ms,
});
