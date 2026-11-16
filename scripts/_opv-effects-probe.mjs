// 临时探针：验证 OPv 超频天花板在「观战模式」和「教练模式正赛」里的真实效果
// 用 globalThis.__OPV__ = true 模拟 OPV=1 构建（Vite define 会把它替换成字面量 true）
globalThis.__OPV__ = true;

const { IS_OPV, ABILITY_CEIL, opvAbility, opvSkills, sanitizeOpvConfig, OPV_TOPIC_LIST } = await import('../src/opv.ts');
const { createContest, finalize, tick, TOPIC_LIST } = await import('../src/game.ts');
const {
  YEAR_STAGES, createSeason, applyOpvToSeason, setTeam, planWeek, chooseEventOption,
  runWeeklyContest, advanceWeek, rosterSorted, stageOfWeek,
} = await import('../src/season.ts');

console.log('IS_OPV =', IS_OPV, ' ABILITY_CEIL =', ABILITY_CEIL);
console.log('能力刻度：120 ->', opvAbility(120).toFixed(3), ' 145 ->', opvAbility(145).toFixed(3), ' 150 ->', opvAbility(150).toFixed(3));

const mkCfg = (kp, name = 'OP选手') => {
  const base = sanitizeOpvConfig({}, name);
  const topics = Object.fromEntries(OPV_TOPIC_LIST.map((t) => [t, kp]));
  return { ...base, enabled: true, mode: 'create', name, topics, coding: 100, reading: 100, debug: 100, talent: 3 };
};

// ===== 观战模式（单日正赛，20 个 seed）=====
function watchRun(stage, ability, seed) {
  const cfg = {
    preset: 'season-week', problemCount: stage.levels.length, levels: stage.levels,
    studentCount: 1, minutes: stage.minutes, seed,
    cohort: [{ name: 'X', skills: { topics: Object.fromEntries(TOPIC_LIST.map((t) => [t, ability])), coding: 0.998, reading: 0.998, debug: 0.998 } }],
    difficultyRanges: stage.ranges, scoreCurve: stage.curve,
  };
  const c = createContest(cfg);
  let guard = 0;
  while (!c.isFinished && guard++ < 20000) tick(c, 60);
  return finalize(c)[0].real;
}

const MODE = process.argv.includes('--coach') ? 'coach' : process.argv.includes('--watch') ? 'watch' : 'both';

if (MODE !== 'coach') {
const cases = [
  { label: '原版全满(旧上限 0.998)', ability: 0.998 },
  { label: '校内顶尖 120', ability: opvAbility(120) },
  { label: '周康阳 145', ability: opvAbility(145) },
  { label: 'OPv 全满 150', ability: opvAbility(150) },
];
console.log('\n=== 观战模式 · 各赛事单日官方分（20 seed 均值 / 最低） ===');
for (const id of ['csp2', 'noip', 'wc', 'apio', 'noi', 'ioi']) {
  const stage = YEAR_STAGES.find((s) => s.id === id);
  const line = cases.map((cs) => {
    const vals = Array.from({ length: 10 }, (_, k) => watchRun(stage, cs.ability, 20261018 + k * 7919));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${cs.label}: ${mean.toFixed(0)}(min ${Math.min(...vals).toFixed(0)})`;
  });
  console.log(`  [${id}] ${line.join('  |  ')}`);
}
}

if (MODE !== 'watch') {
// ===== 教练模式：跑到 WC（第 16 周），看真实结算页分数 =====
function coachWc(cfg, seed) {
  let s = applyOpvToSeason(createSeason(seed, 1), cfg);
  const names = [cfg.name, ...rosterSorted(s).filter((x) => x.name !== cfg.name).slice(0, 5).map((x) => x.name)];
  s = setTeam(s, names);
  let guard = 0;
  // 只打正赛周（W4/8/12/16），跳过校内模拟赛：验证的是 WC 得分，不需要每周训练
  while (s.week <= 16 && guard++ < 100) {
    const stage = stageOfWeek(s.week);
    if (!stage) {
      s = { ...s, week: s.week + 1, phase: 'plan', report: null, lastContest: null, pendingEvent: null };
      continue;
    }
    if (s.pendingEvent) {
      // 避开会让本人禁赛的事件选项（真实玩家也会这么选）
      const choices = s.pendingEvent.options.map((o) => chooseEventOption(s, o.id));
      const safe = choices.find((n) => n.students.find((x) => x.name === cfg.name)?.sitOut === 0);
      s = safe ?? choices[0];
    }
    s = runWeeklyContest(s);
    const c = s.lastContest;
    if (c?.stageId === 'wc') {
      const row = c.rows.find((r) => r.name === cfg.name);
      return row ? row.real : '未参赛';
    }
    if (s.phase === 'result') s = advanceWeek(s);
  }
  return '未到 WC';
}

console.log('\n=== 教练模式 · WC 结算分（满分 300，4 个种子，跑到第 16 周即停） ===');
for (const [label, kp] of [['周康阳 145', 145], ['OPv 全满 150', 150]]) {
  const cfg = mkCfg(kp);
  const vals = [];
  for (let k = 0; k < 4; k++) vals.push(coachWc(cfg, 20261018 + k * 7919));
  const nums = vals.filter((v) => typeof v === 'number');
  console.log(`  ${label}: ${vals.join(' / ')}  均值 ${nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(0) : '—'}`);
}
}
