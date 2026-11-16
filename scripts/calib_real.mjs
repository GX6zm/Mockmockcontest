/**
 * 校准探针：跑一整个赛季，打印每场正赛全队真分 + 每题得分，
 * 用来和真实成绩表对比（真实数据见 data/real-baseline.json）。
 * 用法：node scripts/calib_real.mjs [seed] [years]
 */
import {
  advanceWeek, chooseEventOption, continueCareer, createSeason, planWeek, rosterSorted, runWeeklyContest, setTeam, stageOfWeek,
} from '../src/season.ts';
import { TOPIC_LIST } from '../src/game.ts';

const seed = Number(process.argv[2] ?? 20261019);
const years = Number(process.argv[3] ?? 1);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function autoPlan(s) {
  const team = s.students.filter((x) => x.onTeam);
  const fatigue = avg(team.map((x) => x.fatigue));
  if (fatigue > 62) return { topic: null, intensity: 'rest' };
  const avgOf = (t) => avg(team.map((x) => x.skills.topics[t]));
  const weakest = TOPIC_LIST.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];
  return { topic: weakest, intensity: fatigue < 32 ? 'extra' : 'normal' };
}

/** 主力 = 校 OJ 前 12（尽量覆盖真实强选手），其余进梯队 */
const pickTeam = (st) => {
  const all = rosterSorted(st).map((x) => x.name);
  return setTeam(st, all.slice(0, 12));
};

let s = pickTeam(createSeason(seed, years));
let guard = 0;
const out = [];
while (s.phase !== 'finished' && guard++ < 5000) {
  if (s.phase === 'team') { s = pickTeam(s); continue; }
  if (s.phase === 'yearEnd') { s = continueCareer(s); continue; }
  if (s.phase === 'plan') {
    s = planWeek(s, autoPlan(s));
    if (s.pendingEvent) s = chooseEventOption(s, s.pendingEvent.options[0].id);
    continue;
  }
  const stage = stageOfWeek(s.week);
  s = runWeeklyContest(s);
  const r = s.lastContest;
  if (r && stage && stage.kind === 'contest' && r.rows.length) {
    out.push({ year: r.year, stage: stage.short, full: r.fullScore, rows: r.rows, problems: r.problems });
  }
  if (s.phase === 'result') s = advanceWeek(s);
}

import { readFileSync } from 'node:fs';
const baseline = JSON.parse(readFileSync(new URL('../data/real-baseline.json', import.meta.url), 'utf8'));
const BASELINE_BY_STAGE = {
  '复赛': () => baseline.cspS2026,
  'NOIP': () => baseline.noip2025,
};

for (const c of out) {
  console.log(`\n===== Y${c.year} ${c.stage} / ${c.full} 分 =====`);
  const base = BASELINE_BY_STAGE[c.stage]?.();
  let errSum = 0;
  let errN = 0;
  const pairs = [];
  if (base) {
    for (const row of c.rows) {
      const real = base.scores[row.name];
      if (real == null) continue;
      const sim = Math.round(row.real);
      pairs.push([row.name, sim, real, sim - real]);
      errSum += Math.abs(sim - real);
      errN++;
    }
  }
  if (c.problems) {
    console.log('题目难度: ' + c.problems.map((p) => `${p.level}:${p.difficulty}`).join(' | '));
  }
  const sorted = c.rows.slice().sort((a, b) => b.real - a.real);
  for (const row of sorted) {
    const per = (row.perProblem || []).map((p) => Math.round(p.real ?? p.score ?? 0)).join('/');
    console.log(`${row.name}\t${Math.round(row.real)}\t${per}`);
  }
  const scores = sorted.map((r) => Math.round(r.real));
  console.log(`分布: 最高 ${scores[0]}, 中位 ${scores[Math.floor(scores.length / 2)]}, 最低 ${scores[scores.length - 1]}`);
  if (pairs.length) {
    pairs.sort((a, b) => b[2] - a[2]);
    console.log('--- 与真实成绩对比（模型/真实/误差）---');
    for (const [name, sim, real, d] of pairs) {
      console.log(`${name}\t${sim}\t${real}\t${d > 0 ? '+' : ''}${d}`);
    }
    console.log(`MAE = ${(errSum / errN).toFixed(1)} (n=${errN})`);
  }
}
console.log(`\n(seed=${seed}, guard=${guard})`);
