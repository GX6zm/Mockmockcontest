// 诊断：OPv 全满选手在教练模式里为何有时「未参赛」WC
globalThis.__OPV__ = true;
const opv = await import('../src/opv.ts');
const season = await import('../src/season.ts');

const cfg = {
  ...opv.sanitizeOpvConfig({}, 'OP选手'),
  enabled: true, mode: 'create', name: 'OP选手',
  topics: Object.fromEntries(opv.OPV_TOPIC_LIST.map((t) => [t, 150])),
  coding: 100, reading: 100, debug: 100, talent: 3,
};
const seed = Number(process.argv[2] ?? 20261018);
let s = season.applyOpvToSeason(season.createSeason(seed, 1), cfg);
const names = [cfg.name, ...season.rosterSorted(s).filter((x) => x.name !== cfg.name).slice(0, 5).map((x) => x.name)];
s = season.setTeam(s, names);
const st = () => s.students.find((x) => x.name === cfg.name);
console.log('开档:', cfg.name, '年级', st().grade, '综合', season.overallScoreOf(st()).toFixed(1), '能力', st().skills.topics.dp.toFixed(3));

let guard = 0;
while (s.phase !== 'finished' && guard++ < 4000) {
  if (s.phase === 'team') { s = season.setTeam(s, names); continue; }
  if (s.phase === 'plan') {
    if (s.pendingEvent) {
      console.log(`  W${s.week} 事件: ${s.pendingEvent.title} → 选 ${s.pendingEvent.options[0].id}`);
      s = season.chooseEventOption(s, s.pendingEvent.options[0].id);
    }
    if (s.phase === 'plan') s = season.planWeek(s, { topic: null, intensity: 'rest' });
    if (st()?.sitOut > 0) console.log(`  W${s.week} → 本人被禁赛 sitOut=${st().sitOut}`);
    continue;
  }
  const week = s.week;
  const stage = season.stageOfWeek(week);
  s = season.runWeeklyContest(s);
  const c = s.lastContest;
  if (stage && stage.kind !== 'practice') {
    const x = st();
    console.log(`  W${week} ${stage.id}: 本人 ${c?.rows?.find((r) => r.name === cfg.name)?.real ?? '—'} | csp1=${x.csp1?.score?.toFixed(0)}/${x.csp1?.passed} csp2=${x.csp2?.score?.toFixed(0)}/${x.csp2?.award} noip=${x.noip?.score?.toFixed(0)}/${x.noip?.first} sitOut=${x.sitOut} 参赛=${c?.rows?.length} note=${c?.note ?? ''} absent=${(c?.absent ?? []).join(',')}`);
  }
  if (c?.stageId === 'wc') {
    console.log('WC 参赛名单:', (c.rows ?? []).map((r) => `${r.name}:${r.real}`).join(' | '));
    console.log('本人 in students?', s.students.some((x) => x.name === cfg.name), 'onTeam?', st()?.onTeam, 'grade', st()?.grade, 'noip', st()?.noip);
    break;
  }
  if (s.phase === 'result') s = season.advanceWeek(s);
}
