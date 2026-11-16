// 验证：教练模式「瞬时结算」与「回放观看」用同一个引擎，结果逐分一致。
// runWeeklyContest(s, trace) 记下每场比赛的 cfg；前端用 createContest(cfg) 重建后
// 自己 tick 完整时长，finalize 出来的分数必须和瞬时结算的 recap.rows 完全相等。
import {
  createSeason, setTeam, planWeek, runWeeklyContest, advanceWeek, stageOfWeek, YEAR_WEEKS,
} from '../src/season.ts';
import { createContest, tick, finalize } from '../src/game.ts';
import { logRun } from './log.mjs';

const seed = Number(process.argv[2] ?? 20261019);
let s = createSeason(seed, 1);
s = setTeam(s, s.students.slice(0, 8).map((st) => st.name));

let checked = 0;
let mismatches = 0;

for (let week = 1; week <= YEAR_WEEKS; week++) {
  if (s.phase === 'team') s = setTeam(s, s.students.slice(0, 8).map((st) => st.name));
  s = planWeek(s, 'dp', 2, { preset: 'normal', problemCount: 3, minutes: 180 });
  const stage = stageOfWeek(week);
  const trace = [];
  const t0 = Date.now();
  const next = runWeeklyContest(s, trace);
  const dt = Date.now() - t0;
  const recap = next.lastContest;

  // 初赛是笔试直接出分，没有可看的比赛
  if (stage && stage.kind === 'prelim') {
    if (trace.length !== 0) { console.log(`❌ 第 ${week} 周初赛不该有回放`); mismatches++; }
  } else if (trace.length === 0) {
    console.log(`⚠️ 第 ${week} 周 ${stage?.short ?? '模拟赛'}：没有回放（可能没人报名）`);
  } else {
    // 回放：同 cfg 重建 + 跑满时长。
    // 多试比赛（NOI / CTT / CTS / IOI）要把每一试累加，不能 set 覆盖成最后一试；
    // NOI 的 100 分笔试不来自比赛引擎，瞬时结算里单独加在 r.written 上，比较时要扣掉。
    const replayRows = new Map();
    for (const round of trace) {
      const c = createContest(round.cfg);
      tick(c, c.duration);
      if (!c.isFinished) throw new Error(`第 ${week} 周 ${round.label} 没跑到收卷`);
      for (const r of finalize(c)) replayRows.set(r.name, (replayRows.get(r.name) ?? 0) + r.real);
    }
    // 瞬时结算的分数（只比引擎跑出来的部分）
    const settleRows = new Map(recap.rows.map((r) => [r.name, r.real - (r.written ?? 0)]));
    for (const [name, score] of settleRows) {
      const replay = replayRows.get(name);
      if (replay === undefined) { console.log(`❌ ${week} 周 ${name} 不在回放里`); mismatches++; continue; }
      if (replay !== score) { console.log(`❌ ${week} 周 ${name}：瞬时 ${score} ≠ 回放 ${replay}`); mismatches++; }
    }
    checked++;
    console.log(`✅ 第 ${week.toString().padStart(2)} 周 ${recap.title.slice(0, 22)}：${trace.length} 场回放、${settleRows.size} 人逐分一致（瞬时 ${dt}ms）`);
  }
  s = advanceWeek(next);
  if (s.phase === 'finished') break;
}

console.log(`\n检查 ${checked} 场比赛，不一致 ${mismatches} 处`);
logRun('trace-check', { seed, contests: checked, mismatches });
if (mismatches) process.exitCode = 1;
