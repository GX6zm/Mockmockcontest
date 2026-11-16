/**
 * 事件「选择有没有分量」检验：同一个种子、同一套训练策略，只把事件选项固定成
 * 第 0/1/2 个，看赛季结局差多少。
 * 用法：node scripts/event-choice-check.mjs
 */
import {
  advanceWeek, chooseEventOption, createSeason, planWeek, rosterSorted, setTeam as setTeamAlias,
  runWeeklyContest, seasonReport, setTeam, teamStudents,
} from '../src/season.ts';
import { TOPIC_LIST } from '../src/game.ts';

/** choiceMode: 'rotate' 按周轮换；数字则固定选第 n 个选项 */
function playSeason(seed, choiceMode) {
  let s = createSeason(seed, 1);
  s = setTeam(s, rosterSorted(s).slice(0, 7).map((x) => x.name));

  let guard = 0;
  while (s.phase !== 'finished' && guard++ < 500) {
    if (s.phase === 'plan') {
      if (s.pendingEvent) {
        const opts = s.pendingEvent.options;
        const idx = typeof choiceMode === 'number' ? choiceMode % opts.length : (seed + s.week) % opts.length;
        s = chooseEventOption(s, opts[idx].id);
      }
      if (s.phase !== 'plan') continue;
      const teamS = teamStudents(s);
      const avgFatigue = teamS.reduce((a, x) => a + x.fatigue, 0) / teamS.length;
      const intensity = avgFatigue > 62 ? 'rest' : avgFatigue < 35 ? 'extra' : 'normal';
      const avgOf = (t) => teamS.reduce((a, x) => a + x.skills.topics[t], 0) / teamS.length;
      const weakest = TOPIC_LIST.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];
      s = planWeek(s, { topic: intensity === 'rest' ? null : weakest, intensity });
    } else if (s.phase === 'team') {
      s = setTeamAlias(s, s.lastTeam);
    } else if (s.phase === 'report') {
      s = runWeeklyContest(s);
      if (s.phase === 'result') s = advanceWeek(s);
    }
  }
  return s;
}

const rows = [];
for (const seed of [20261019, 777, 4242]) {
  const cells = [0, 1, 2].map((idx) => {
    const s = playSeason(seed, idx);
    const r = seasonReport(s);
    return { idx, score: r.coachScore, grade: r.grade, win: s.eventLog.length, ev: s.eventLog.map((e) => e.choice[0]).join('') };
  });
  const spread = Math.max(...cells.map((c) => c.score)) - Math.min(...cells.map((c) => c.score));
  rows.push({ seed, cells, spread });
}

console.log('同一 seed / 同一训练策略，只改事件选项 → 赛季评分：');
for (const r of rows) {
  const line = r.cells.map((c) => `选${c.idx + 1}=${c.score}(${c.grade})`).join('  ');
  console.log(`  seed ${r.seed}：${line}   → 极差 ${r.spread} 分`);
}
const spreads = rows.map((r) => r.spread);
console.log(`
极差：${spreads.join(' / ')} 分（事件数：${rows[0].cells.map((c) => c.win).join('/')}）`);
const avg = spreads.reduce((a, b) => a + b, 0) / spreads.length;
console.log(avg >= 8 ? `✅ 选择平均影响 ${avg.toFixed(1)} 分，有分量` : `❌ 选择平均只影响 ${avg.toFixed(1)} 分，太弱`);
