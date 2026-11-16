/**
 * 事件系统自检：
 * 1. 同一 seed + 同一策略 跑两遍，事件流水必须完全一致（可复现）
 * 2. 跑完整赛季，检查每步状态不越界（疲劳 0-100、元能力 0-1、专题 0-1）
 * 3. 多种 seed 跑下来，7 个事件模板都要出现过
 *
 * 用法：node scripts/event-check.mjs
 */
import {
  CAREER_YEARS, YEAR_WEEKS, advanceWeek, chooseEventOption, createSeason, planWeek, rosterSorted,
  runWeeklyContest, seasonReport, setTeam, teamStudents,
} from '../src/season.ts';
import { EVENT_DEFS } from '../src/events.ts';
import { TOPIC_LIST } from '../src/game.ts';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function validate(s, where) {
  for (const st of s.students) {
    if (!(st.fatigue >= 0 && st.fatigue <= 100)) throw new Error(`${where}: ${st.name} fatigue=${st.fatigue}`);
    for (const k of ['coding', 'reading', 'debug']) {
      if (!(st.skills[k] >= 0 && st.skills[k] <= 1)) throw new Error(`${where}: ${st.name} ${k}=${st.skills[k]}`);
    }
    for (const [t, v] of Object.entries(st.skills.topics)) {
      // 初始名单最高能到 ~0.999，这里只校验没有 NaN / 越界
      if (!(v >= 0 && v <= 1)) throw new Error(`${where}: ${st.name} ${t}=${v}`);
    }
  }
}

/** 一个"普通教练"策略：补最弱专题；累了就休息；事件按 seed+week 轮换选项 */
function playSeason(seed, log) {
  let s = createSeason(seed, 1);
  const team = rosterSorted(s).slice(0, 7).map((x) => x.name);
  s = setTeam(s, team);
  validate(s, 'setTeam');

  let guard = 0;
  while (s.phase !== 'finished' && guard++ < YEAR_WEEKS * 3) {
    if (s.phase === 'plan') {
      if (s.pendingEvent) {
        const opts = s.pendingEvent.options;
        const idx = (seed + s.week * 7) % opts.length;
        const choice = opts[idx];
        s = chooseEventOption(s, choice.id);
        log?.push({ week: s.week, id: s.eventLog[s.eventLog.length - 1].id, title: s.eventLog[s.eventLog.length - 1].title, choice: choice.label });
        validate(s, `event w${s.week}`);
      }
      if (s.phase !== 'plan') continue;
      const teamS = teamStudents(s);
      const avgFatigue = teamS.reduce((a, x) => a + x.fatigue, 0) / teamS.length;
      const intensity = avgFatigue > 62 ? 'rest' : avgFatigue < 35 ? 'extra' : 'normal';
      const avgOf = (t) => teamS.reduce((a, x) => a + x.skills.topics[t], 0) / teamS.length;
      const weakest = TOPIC_LIST.slice().sort((a, b) => avgOf(a) - avgOf(b))[0];
      s = planWeek(s, { topic: intensity === 'rest' ? null : weakest, intensity });
      validate(s, `plan w${s.week}`);
    } else if (s.phase === 'team') {
      s = setTeam(s, s.lastTeam);
      validate(s, 'next year setTeam');
    } else if (s.phase === 'report') {
      s = runWeeklyContest(s);
      validate(s, `contest w${s.week}`);
      if (s.phase === 'result') s = advanceWeek(s);
    }
  }
  return s;
}

const t0 = Date.now();
const a = playSeason(20261019, []);
const logA = JSON.stringify(a.eventLog);
const b = playSeason(20261019, []);
const logB = JSON.stringify(b.eventLog);
console.log(`可复现性：${logA === logB ? '✅ 两次完全一致' : '❌ 不一致'}`);
if (logA !== logB) process.exit(1);

const rep = seasonReport(a);
console.log(`第一季：${a.eventLog.length} 次事件 · 评分 ${rep.coachScore} ${rep.grade} · 省一 ${rep.provinceFirstCount} · 省队 ${rep.provinceTeamCount} · 全队综合 +${rep.avgOverallGain.toFixed(1)}`);
console.log('事件流水：');
for (const e of a.eventLog) console.log(`  第 ${String(e.week).padStart(2)} 周 · ${e.title} → ${e.choice}`);

// 多 seed 覆盖 + 每步校验
const seen = new Map();
const scores = [];
for (let i = 0; i < 6; i++) {
  const seed = 1000 + i * 7919;
  const st = playSeason(seed);
  const r = seasonReport(st);
  scores.push(r.coachScore);
  for (const e of st.eventLog) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
}
const missing = EVENT_DEFS.map((d) => d.id).filter((id) => !seen.has(id));
console.log(`
6 季覆盖：${EVENT_DEFS.length - missing.length}/${EVENT_DEFS.length} 个事件${missing.length ? `，缺 ${missing.join(',')}` : ' ✅'}`);
console.log(`评分分布：${scores.join(', ')}（耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
console.log(`事件次数：${[...seen.entries()].map(([k, v]) => `${k}×${v}`).join('  ')}`);
if (missing.length) process.exit(1);
