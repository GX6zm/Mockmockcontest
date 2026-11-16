// 临时探针：天花板选手在各正赛的原始分 / 官方分，定位「全满却低分」卡在哪一环
import { createContest, finalize, tick, TOPIC_LIST } from '../src/game.ts';
import { YEAR_STAGES } from '../src/season.ts';

const mkSkills = (v) => ({
  topics: Object.fromEntries(TOPIC_LIST.map((t) => [t, v])),
  coding: Math.min(v, 0.998), reading: Math.min(v, 0.998), debug: Math.min(v, 0.998),
});

function run(stage, ability, seed = 20261018) {
  const cfg = {
    preset: 'season-week', problemCount: stage.levels.length, levels: stage.levels,
    studentCount: 1, minutes: stage.minutes, seed,
    cohort: [{ name: 'X', skills: mkSkills(ability) }],
    difficultyRanges: stage.ranges, scoreCurve: stage.curve,
  };
  const c = createContest(cfg);
  let guard = 0;
  while (!c.isFinished && guard++ < 20000) tick(c, 60);
  const row = finalize(c)[0];
  return {
    real: row.real,
    per: row.perProblem.map((p) => p.real),
    think: c.problems.map((p) => p.think),
    diff: c.problems.map((p) => p.difficulty),
    level: c.problems.map((p) => p.level),
  };
}

const ids = ['csp2', 'noip', 'wc', 'apio', 'noi', 'ctt', 'cts', 'ioi'];
for (const id of ids) {
  const stage = YEAR_STAGES.find((s) => s.id === id);
  const base = run(stage, 0.998);
  const full = stage.id === 'noi' ? 700 : stage.levels.length * 100 * stage.days;
  console.log(`\n[${id}] 满分 ${full} · 题难度 ${base.diff.join('/')} · think ${base.think.join('/')} · 颜色 ${base.level.join('/')}`);
  for (const a of [0.998, 1.15, 1.25, 1.35, 1.45]) {
    const r = run(stage, a);
    const oneDay = r.real;
    console.log(`  能力 ${a.toFixed(3)} (=${Math.round(a * 100)} 点): 单日 ${oneDay.toFixed(0)}/100×题数  每题 ${r.per.join('/')}`);
  }
  console.log(`  curve: ${JSON.stringify(stage.curve)}`);
}

// 多 seed 分布：确认「全满 98 分」是偶发挂分还是稳定被压，并挑一个稳健的超频上限
console.log('\n=== 30 个 seed 的分布（单日官方分） ===');
for (const id of ['csp2', 'wc', 'noi', 'ioi']) {
  const stage = YEAR_STAGES.find((s) => s.id === id);
  for (const a of [0.998, 1.2, 1.25, 1.3, 1.35]) {
    const vals = [];
    for (let k = 0; k < 30; k++) vals.push(run(stage, a, 20261018 + k * 7919).real);
    const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
    console.log(`  [${id}] 能力 ${a.toFixed(3)}: 均值 ${mean.toFixed(0)}  最低 ${Math.min(...vals).toFixed(0)}  最高 ${Math.max(...vals).toFixed(0)}`);
  }
}
