/** 调试：单场 CSP-S，打印指定选手逐题轨迹（阶段/提交/得分/时间） */
import { createContest, tick } from '../src/game.ts';
import { YEAR_STAGES } from '../src/season.ts';

const stage = YEAR_STAGES.find((s) => s.id === 'csp2');
const names = process.argv.slice(2);
const students = names.map((n) => ({ name: n, skill: 0.8 }));

// 直接从 profile 读技能
const { PROFILE_BY_NAME } = await import('../src/profile.ts');
const { TOPIC_LIST } = await import('../src/game.ts');

const cohort = names.map((n) => {
  const p = PROFILE_BY_NAME[n];
  const topics = {};
  for (const t of TOPIC_LIST) topics[t] = p?.topics?.[t] ?? 0.5;
  const skills = { topics, coding: p?.meta?.coding ?? 0.5, debug: p?.meta?.debug ?? 0.5, reading: p?.meta?.reading ?? 0.5 };
  return { name: n, skills, fatigue: 0 };
});

const cfg = {
  preset: 'season-week', problemCount: 4, levels: stage.levels, studentCount: cohort.length,
  minutes: stage.minutes, seed: 12345, cohort, difficultyRanges: stage.ranges, scoreCurve: stage.curve,
};
const contest = createContest(cfg);
console.log('题目: ' + contest.problems.map((p) => `${p.title}(${p.topic}) diff=${p.difficulty} think=${p.think} level=${p.level}`).join('\n      '));
let guard = 0;
while (!contest.isFinished && guard++ < 20000) {
  tick(contest, 10);
  for (const st of contest.students) {
    for (const p of contest.problems) {
      const ps = st.problems[p.id];
      const att = ps.attempts[ps.attempts.length - 1];
      if (att && !att._seen) {
        att._seen = true;
        console.log(`t=${Math.round(contest.timeElapsed / 60)}min ${st.name} P${p.id} ${att.mode} score=${att.score} est=${att.est} reason=${att.reason}`);
      }
    }
  }
}
for (const st of contest.students) {
  const tot = st.problems.reduce((a, ps) => a + (ps.attempts.length ? ps.attempts[ps.attempts.length - 1].score : 0), 0);
  console.log(`${st.name}: 总分约 ${tot}`);
}
