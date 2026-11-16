/** 校准探针 2：跑完整生涯（含 advanceWeek），打印两名选手各正赛的原始得分率 */
import {
  advanceWeek, chooseEventOption, continueCareer, createSeason, planWeek, rosterSorted, runWeeklyContest, setTeam, stageOfWeek,
} from '../src/season.ts';
import { TOPIC_LIST } from '../src/game.ts';

const seed = Number(process.argv[2] ?? 20261019);
const WATCH = ['特别之处', '王思琦'];
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function autoPlan(s) {
  const team = s.students.filter((x) => x.onTeam);
  const fatigue = avg(team.map((x) => x.fatigue));
  if (fatigue > 62) return { topic: null, intensity: 'rest' };
  const avgOf = (t) => avg(team.map((x) => x.skills.topics[t]));
  const weakest = TOPIC_LIST.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];
  return { topic: weakest, intensity: fatigue < 32 ? 'extra' : 'normal' };
}

const pickTeam = (st) => {
  const all = rosterSorted(st).map((x) => x.name);
  const pre = WATCH.filter((n) => all.includes(n));
  const rest = all.filter((n) => !pre.includes(n)).slice(0, 7 - pre.length);
  return setTeam(st, [...pre, ...rest]);
};

let s = pickTeam(createSeason(seed, 3));
let guard = 0;
while (s.phase !== 'finished' && guard++ < 4000) {
  if (s.phase === 'team') { s = pickTeam(s); continue; }
  if (s.phase === 'yearEnd') { s = continueCareer(s); continue; }
  if (s.phase === 'plan') {
    s = planWeek(s, autoPlan(s));
    if (s.pendingEvent) s = chooseEventOption(s, s.pendingEvent.options[0].id);
    continue;
  }
  const stage = stageOfWeek(s.week);
  const pre = new Map(s.students.map((x) => [x.name, x]));
  s = runWeeklyContest(s);
  const r = s.lastContest;
  if (r && stage && stage.kind === 'contest') {
    for (const row of r.rows) {
      if (!WATCH.includes(row.name)) continue;
      const st = pre.get(row.name);
      const pct = row.real / r.fullScore;
      console.log(
        `Y${r.year} ${stage.short}\t${row.name}\treal=${row.real}/${r.fullScore}=${(pct * 100).toFixed(1)}%` +
        `\t综合=${(TOPIC_LIST.reduce((a, t) => a + st.skills.topics[t], 0) / TOPIC_LIST.length * 100).toFixed(1)}` +
        `\t代码=${(st.skills.coding * 100).toFixed(0)}\t阅读=${(st.skills.reading * 100).toFixed(0)}\t调试=${(st.skills.debug * 100).toFixed(0)}\t疲劳=${st.fatigue.toFixed(0)}\t年级=${st.grade}`,
      );
    }
  }
  if (s.phase === 'result') s = advanceWeek(s);
}
console.log('done', guard);
