/**
 * 峰值探针：把一名高二选手拉到 145 知识点（IOI AKer 口径），跑两学年，
 * 检查跨学年国集链：第 1 学年 NOI 前 50 → 第 2 学年 CTT → CTS 前 6 → 答辩 → IOI。
 */
import {
  advanceWeek, chooseEventOption, continueCareer, createSeason, planWeek, rosterSorted, runWeeklyContest, setTeam,
} from '../src/season.ts';
import { TOPIC_LIST } from '../src/game.ts';

const seed = Number(process.argv[2] ?? 20261019);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const kp = (v) => Math.round(v * 150);

let s = createSeason(seed, 2);
const peak = '王思琦';
s = {
  ...s,
  students: s.students.map((st) => {
    if (st.name !== peak) return st;
    const topics = {};
    for (const t of TOPIC_LIST) topics[t] = 145 / 150;
    return { ...st, grade: 5, skills: { ...st.skills, topics, coding: 1, reading: 1, debug: 1 } };
  }),
};
const names = [peak, ...rosterSorted(s).filter((x) => x.name !== peak).slice(0, 6).map((x) => x.name)];
s = setTeam(s, names);
const peakSt = () => s.students.find((x) => x.name === peak);
console.log('start kp:', kp(avg(TOPIC_LIST.map((t) => peakSt().skills.topics[t]))));

function plan(s) {
  const team = s.students.filter((x) => x.onTeam);
  const fatigue = avg(team.map((x) => x.fatigue));
  if (fatigue > 62) return { topic: null, intensity: 'rest' };
  const avgOf = (t) => avg(team.map((x) => x.skills.topics[t]));
  const weakest = TOPIC_LIST.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];
  return { topic: weakest, intensity: fatigue < 35 ? 'extra' : 'normal' };
}

let guard = 0;
let lastKey = '';
while (s.phase !== 'finished' && guard++ < 8000) {
  if (s.phase === 'team') {
    const alive = new Set(s.students.map((x) => x.name));
    const keep = [peak, ...s.lastTeam.filter((n) => n !== peak && alive.has(n))];
    const fill = rosterSorted(s).map((x) => x.name).filter((n) => !keep.includes(n)).slice(0, Math.max(0, 7 - keep.length));
    s = setTeam(s, [...keep, ...fill].slice(0, 8));
    continue;
  }
  if (s.phase === 'yearEnd') { s = continueCareer(s); continue; }
  if (s.phase === 'plan') {
    if (s.pendingEvent) s = chooseEventOption(s, s.pendingEvent.options[0].id);
    s = planWeek(s, plan(s));
    continue;
  }
  s = runWeeklyContest(s);
  const c = s.lastContest;
  const key = c?.stageId ? `Y${c.year}-${c.stageId}` : '';
  if (c?.stageId && key !== lastKey) {
    lastKey = key;
    const awards = (c.awards ?? []).map((a) => `${a.name}:${a.label}`).join(' ');
    const nat = c.national?.rows?.filter((r) => r.name === peak).map((r) => `rank#${r.rank} ${r.award} ${r.note ?? ''}`).join(' ');
    const def = c.defense?.map((d) => `${d.name}#${d.rank}`).join(' ');
    console.log(`[Y${c.year} ${c.stageId}] ${c.title}  队内=${c.rows.length}  排名=${nat ?? '—'}  奖=${awards || '—'}${def ? `  答辩=${def}` : ''}`);
  }
  if (s.phase === 'result') s = advanceWeek(s);
}
const st = peakSt();
console.log('end kp:', kp(avg(TOPIC_LIST.map((t) => st.skills.topics[t]))), 'NOI(Y1->prev):', st.prevNoiScore, 'CTT:', st.ctt, 'CTS:', st.cts, 'IOI:', st.ioi);
