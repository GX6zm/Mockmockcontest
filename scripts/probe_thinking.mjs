/** 思维链探针：跑一场 CSP-S，打印每人每题的「得分 + 链 + 断点」，检查链和分数是否自洽 */
import { createContest, tick } from '../src/game.ts';
import { YEAR_STAGES } from '../src/season.ts';
import { tracesForStudent, chainFor, topicNameOf } from '../src/thinking.ts';
import { PROFILE_BY_NAME } from '../src/profile.ts';
import { TOPIC_LIST } from '../src/game.ts';

const stage = YEAR_STAGES.find((s) => s.id === 'csp2');
const names = process.argv.slice(2);
const cohort = names.map((n) => {
  const p = PROFILE_BY_NAME[n];
  const topics = {};
  for (const t of TOPIC_LIST) topics[t] = p?.topics?.[t] ?? 0.5;
  const skills = {
    topics,
    coding: p?.meta?.coding ?? 0.5,
    debug: p?.meta?.debug ?? 0.5,
    reading: p?.meta?.reading ?? 0.5,
  };
  return { name: n, skills, fatigue: 0 };
});

const cfg = {
  preset: 'season-week',
  problemCount: 4,
  levels: stage.levels,
  studentCount: cohort.length,
  minutes: stage.minutes,
  seed: 20261116,
  cohort,
  difficultyRanges: stage.ranges,
  scoreCurve: stage.curve,
};
const contest = createContest(cfg);
console.log('卷面：');
for (const p of contest.problems) {
  console.log(`  P${p.id} ${p.title} [${topicNameOf(p)}] d=${p.difficulty} level=${p.level} 子任务=${p.subtasks.map((s) => s.points).join('/')}`);
}
let guard = 0;
while (!contest.isFinished && guard++ < 200000) tick(contest, 30);

for (const st of contest.students) {
  console.log(`\n=== ${st.name} ===`);
  const traces = tracesForStudent(st, contest.problems, contest.duration / 60);
  traces.forEach((tr, i) => {
    const p = contest.problems[i];
    const chain = chainFor(p);
    console.log(`  P${p.id} 得分 ${tr.score}  断点 ${tr.breakAt}/${tr.steps.length}  ${tr.summary}`);
    if (tr.trapHit) console.log(`     走偏：${tr.trapHit.text}（-${tr.trapHit.loss}）`);
    tr.steps.forEach((s, j) => {
      const tag = s.status === 'got' ? '✓' : s.status === 'misled' ? '✗' : '·';
      console.log(`     ${tag} [${s.step.kind}] ${s.step.text}${s.step.complexity ? `  (${s.step.complexity})` : ''}`);
    });
    if (tr.steps.length !== chain.canonical.length) console.log('     !! 链长不一致');
  });
}
