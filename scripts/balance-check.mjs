/**
 * 成长标定探针：一学年，四种强度策略，打印校队知识点的起点/终点。
 *
 * 用法：node scripts/balance-check.mjs [seed]
 * 指标：知识点 = 8 个专题 0–1 能力 × 150；目标是校队主力一学年 +8–12。
 */
import {
  advanceWeek, chooseEventOption, createSeason, planWeek, rosterSorted, runWeeklyContest, setTeam,
} from '../src/season.ts';
import { TOPIC_LIST } from '../src/game.ts';

const seed = Number(process.argv[2] ?? 20261019);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const kp = (v) => Math.round(v * 150);
const teamKp = (s) => {
  const team = s.students.filter((x) => x.onTeam);
  return avg(team.map((x) => avg(TOPIC_LIST.map((t) => x.skills.topics[t])) * 150));
};

function policyNormal(s) {
  const team = s.students.filter((x) => x.onTeam);
  const avgOf = (t) => avg(team.map((x) => x.skills.topics[t]));
  const topic = TOPIC_LIST.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];
  return { topic, intensity: 'normal' };
}
function policyExtra(s) {
  const p = policyNormal(s);
  return { ...p, intensity: 'extra' };
}
function policyCycle(s, week) {
  const p = policyNormal(s);
  return { ...p, intensity: week % 4 === 0 ? 'rest' : 'extra' };
}
function policySmart(s) {
  const team = s.students.filter((x) => x.onTeam);
  const fatigue = avg(team.map((x) => x.fatigue));
  const p = policyNormal(s);
  if (fatigue > 62) return { topic: p.topic, intensity: 'rest' };
  return { ...p, intensity: fatigue < 35 ? 'extra' : 'normal' };
}

function run(label, policy, startRank = 0) {
  let s = createSeason(seed, 1);
  const names = rosterSorted(s).slice(startRank, startRank + 7).map((x) => x.name);
  s = setTeam(s, names);
  const start = new Map(s.students.filter((x) => x.onTeam).map((x) => [x.name, avg(TOPIC_LIST.map((t) => x.skills.topics[t])) * 150]));
  const startTeam = teamKp(s);
  let guard = 0;
  while (s.phase !== 'finished' && guard++ < 4000) {
    if (s.phase === 'team') { s = setTeam(s, names); continue; }
    if (s.phase === 'plan') {
      if (s.pendingEvent) s = chooseEventOption(s, s.pendingEvent.options[0].id);
      s = planWeek(s, policy(s, s.week));
      continue;
    }
    s = runWeeklyContest(s);
    if (s.phase === 'result') s = advanceWeek(s);
  }
  const team = s.students.filter((x) => x.onTeam);
  const endTeam = teamKp(s);
  console.log(`\n== ${label} ==  start ${startTeam.toFixed(1)} -> end ${endTeam.toFixed(1)}  (+${(endTeam - startTeam).toFixed(1)})`);
  for (const x of team) {
    const v = avg(TOPIC_LIST.map((t) => x.skills.topics[t])) * 150;
    const s0 = start.get(x.name) ?? v;
    console.log(`  ${x.name.padEnd(12)} ${s0.toFixed(1)} -> ${v.toFixed(1)}  (+${(v - s0).toFixed(1)})  疲劳 ${Math.round(x.fatigue)}`);
  }
}

run('顶尖 · 常规', policyNormal, 0);
run('顶尖 · 加练×3+休息×1', policyCycle, 0);
run('中游 · 常规', policyNormal, 20);
run('中游 · 加练×3+休息×1', policyCycle, 20);
run('偏弱 · 常规', policyNormal, 40);
run('偏弱 · 加练×3+休息×1', policyCycle, 40);
