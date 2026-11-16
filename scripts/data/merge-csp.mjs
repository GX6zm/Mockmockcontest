// 把 CSP 获奖名单（data/csp-shaanxi.json）合并进 src/roster.ts 的 strength。
//
// 输入：data/csp-shaanxi.json（scripts/extract-csp-awards.py 生成）
// 用法：在项目根目录跑 node scripts/data/merge-csp.mjs [--write]（脚本读写的都是 cwd 相对路径）
//
// 规则：
//   1. 按「真名 + 本校」匹配，同名但不在本校的记为待确认，不合并
//   2. 正赛水平 = 省内在该组别（普及/提高）中的百分位；提高组额外加权
//   3. 最终 strength = 0.6 × 校 OJ 百分位 + 0.4 × 正赛水平
//   4. 幂等：以 strength0（合并前的校 OJ 原始实力）为基线，重复跑不叠加
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const JSON_PATH = 'data/csp-shaanxi.json';
const ROSTER_PATH = 'src/roster.ts';
const WRITE = process.argv.includes('--write');

// 本校及集团校：学校名里同时带「西安」和「高新」就算（能排除渭南/宝鸡/榆林等外地高新学校）
const requiresXiAnGaoXin = (school) => school.includes('西安') && school.includes('高新');

if (!existsSync(JSON_PATH)) {
  console.error(`找不到 ${JSON_PATH}，先跑 scripts/fetch-csp-awards.ps1 和 scripts/extract-csp-awards.py`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const rosterSrc = readFileSync(ROSTER_PATH, 'utf8');

// ===== 解析 roster =====
const entries = [];
for (const line of rosterSrc.split(/\r?\n/)) {
  const m = line.match(/\{ name: "([^"]+)", lv: (\d+), rp: (-?\d+|null), ac: (-?\d+|null), rank: (\d+), strength: ([\d.]+), rating0: (\d+)/);
  if (!m) continue;
  const rn = line.match(/realName: "([^"]+)"/);
  const s0 = line.match(/strength0: ([\d.]+)/);
  entries.push({
    name: m[1],
    lv: Number(m[2]),
    rp: m[3] === 'null' ? null : Number(m[3]),
    ac: m[4] === 'null' ? null : Number(m[4]),
    rank: Number(m[5]),
    strength: Number(m[6]),
    rating0: Number(m[7]),
    realName: rn ? rn[1] : null,
    strength0: s0 ? Number(s0[1]) : null,
    line,
  });
}
if (entries.length === 0) {
  console.error('roster.ts 解析失败');
  process.exit(1);
}

// ===== 索引获奖记录 =====
/** 姓名 -> 记录[] */
const byName = new Map();
/** `${year}_${group}_${award}` -> 该奖项陕西所有成绩（用于同奖项内算百分位） */
const awardPools = new Map();

for (const info of Object.values(data)) {
  const key = `${info.year}_${info.group}_${info.award}`;
  const pool = [];
  for (const r of info.rows) {
    const score = Number(r['成绩']);
    if (!Number.isFinite(score)) continue;
    pool.push(score);
    const nm = (r['姓名'] || '').trim();
    if (!nm) continue;
    if (!byName.has(nm)) byName.set(nm, []);
    byName.get(nm).push({
      year: info.year,
      group: info.group,
      award: info.award,
      school: (r['学校'] || '').trim(),
      grade: (r['年级'] || '').trim(),
      score,
      poolKey: `${info.year}_${info.group}`,
    });
  }
  pool.sort((a, b) => a - b);
  awardPools.set(key, pool);
}

// ===== OIerDb（更权威：历年正赛的综合评分与全国排名）=====
// 关键：直接用「评分」的绝对量级换算，而不是校内百分位。
// 校内百分位会把人压进 0.80–1.00 的窄带里（30 个人也能拉出 0.03 的差距），
// 结果 #3795 和 #1058 只差几个千分点，一律被校 OJ 的 30% 推翻。#评分 是连续量，
// 用 log 尺度才能让 #344 和 #3795 拉开应有的差距。
const OIERDB_PATH = 'data/oierdb-school-3319.json';
// 评分 2000（入门级省一）→ 0.70，评分 32000（全国前列）→ 0.99
const OIERDB_SCORE_LO = 2000;
const OIERDB_SCORE_HI = 32000;
const OIERDB_FLOOR = 0.70;
const OIERDB_CEIL = 0.99;
const oierdb = new Map();
let oierdbCount = 0;

if (existsSync(OIERDB_PATH)) {
  const list = JSON.parse(readFileSync(OIERDB_PATH, 'utf8'))
    .map((r) => ({ ...r, score: Number(r.score), national: Number(r.national), ccf: Number(r.ccf) }))
    .filter((r) => Number.isFinite(r.score) && r.name);
  const lo = Math.log10(OIERDB_SCORE_LO);
  const span = Math.log10(OIERDB_SCORE_HI) - lo;
  for (const r of list) {
    const t = Math.max(0, Math.min(1, (Math.log10(Math.max(1, r.score)) - lo) / span));
    const oi = OIERDB_FLOOR + (OIERDB_CEIL - OIERDB_FLOOR) * t;
    oierdb.set(r.name, { ...r, oi });
  }
  oierdbCount = list.length;
}

// 省内在该组别、该奖项等级中的百分位（0-1）
function awardPercentile(poolKey, award, score) {
  const pool = awardPools.get(`${poolKey}_${award}`);
  if (!pool || pool.length < 2) return 0.5;
  let lo = 0;
  while (lo < pool.length && pool[lo] < score) lo++;
  return lo / (pool.length - 1);
}

// 奖项基准分：先看组别，再看奖项等级；同奖项内按名次/分数再加最多 SPREAD
// 基准取「该奖项的中位水平」而不是天花板，天花板 = base + spread：
//   提高一等 0.88→0.95、提高二等 0.76→0.83、提高三等 0.58→0.65
//   普及一等 0.66→0.73、普及二等 0.50→0.57、普及三等 0.35→0.42
const AWARD_BASE = {
  s: { 1: 0.78, 2: 0.66, 3: 0.56 },
  j: { 1: 0.60, 2: 0.46, 3: 0.34 },
};
const AWARD_SPREAD = 0.12;

// 有全国名次时用名次曲线（和 OIerDb 同一把标尺）：
// pct=60% → 0.62，pct=80% → 0.71，pct=92% → 0.85，pct=99% → 0.96
// 入门组整体下移 0.15（同样名次，提高组强得多，不能让入门名次反超提高名次）
const RANK_GROUP_PENALTY = { s: 0, j: 0.15 };
function rankCurve(pct) {
  const x = Math.max(0, Math.min(1, (pct - 0.6) / 0.4));
  return 0.62 + 0.36 * x * x;
}

// 手动补充的获奖记录（带全国名次/总人数时，用名次百分位代替分数百分位）
const EXTRA_PATH = 'data/csp-extra.json';
const extraByName = new Map();
if (existsSync(EXTRA_PATH)) {
  const raw = JSON.parse(readFileSync(EXTRA_PATH, 'utf8'));
  for (const item of raw) {
    extraByName.set(item.name, (item.records || []).map((r) => ({
      year: r.year, group: r.group, award: r.award, score: r.score,
      school: r.school || '', grade: r.grade || '',
      rank: r.rank ?? null, total: r.total ?? null,
      poolKey: `${r.year}_${r.group}`,
    })));
  }
}

const GROUP_NAME = { s: '提高', j: '普及' };
const AWARD_NAME = { 1: '一等', 2: '二等', 3: '三等' };

const isOurSchool = requiresXiAnGaoXin;

// ===== 匹配 =====
const hits = [];
const ambiguous = [];
const misses = [];
const oierdbOnly = [];

for (const e of entries) {
  const key = e.realName || e.name;
  // OIerDb 优先：它覆盖历年所有正赛，比单年获奖等级更稳
  const od = oierdb.get(key);
  const records = byName.get(key);
  const extra = extraByName.get(e.name) || [];
  const ours = [...(records || []).filter((r) => isOurSchool(r.school)), ...extra];
  if (!od && ours.length === 0) {
    if (records && records.length > 0) ambiguous.push({ ...e, records });
    else misses.push(e);
    continue;
  }

  let best = null;
  let oi = 0;
  let source = '';
  if (od) {
    oi = od.oi;
    source = 'OIerDb';
  } else {
    for (const r of ours) {
      // 有全国名次就用名次百分位（更准），否则退回同奖项内的分数百分位
      let p;
      if (r.rank && r.total) {
        p = Math.max(0, Math.min(1, 1 - (r.rank - 0.5) / r.total));
        r.pctKind = `全国#${r.rank}/${r.total}`;
        r.oi = Math.max(0, Math.min(1, rankCurve(p) - RANK_GROUP_PENALTY[r.group]));
      } else {
        p = awardPercentile(`${r.year}_${r.group}`, r.award, r.score);
        r.pctKind = `省内分数${r.score}`;
        r.oi = Math.max(0, Math.min(1, AWARD_BASE[r.group][r.award] + AWARD_SPREAD * p));
      }
      r.awardPct = p;
    }
    best = ours.reduce((a, b) => (b.oi > a.oi ? b : a));
    oi = best.oi;
    source = 'CSP';
  }
  hits.push({ entry: e, records: ours, best, oi, source, oierdb: od || null });
}

// OIerDb 上有人、但校 OJ 名单里没有的（没刷过校 OJ 或低于 LV2）
for (const [nm, od] of oierdb) {
  if (!entries.some((e) => (e.realName || e.name) === nm)) oierdbOnly.push(od);
}

// ===== 合并 =====
function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return (v) => {
    let lo = 0;
    while (lo < n && sorted[lo] < v) lo++;
    let hi = n - 1;
    while (hi >= 0 && sorted[hi] > v) hi--;
    return (lo + hi) / 2 / Math.max(1, n - 1);
  };
}
const rpPct = percentiles(entries.map((e) => e.rp ?? 0));
const acPct = percentiles(entries.map((e) => e.ac ?? 0));
const ojPct = new Map(entries.map((e) => [e.name, 0.7 * rpPct(e.rp ?? 0) + 0.3 * acPct(e.ac ?? 0)]));

const merged = [];
for (const h of hits) {
  const e = h.entry;
  const base = e.strength0 ?? e.strength; // 合并前的校 OJ 原始实力
  const oj = ojPct.get(e.name);
  // 校 OJ 更多反映做题量，正赛成绩更能反映真实水平 → 校 OJ 20% + 正赛 80%
  const blended = 0.2 * oj + 0.8 * h.oi;
  const nextStrength = Math.max(0.05, Math.min(0.99, 0.15 + 0.84 * blended));
  const nextRating = Math.round(1200 + 700 * Math.min(1, Math.max(0, blended)));
  merged.push({
    entry: e,
    oj,
    oi: h.oi,
    blended,
    nextStrength: Math.round(nextStrength * 1000) / 1000,
    nextRating,
    delta: Math.round((nextStrength - base) * 1000) / 1000,
    base,
    best: h.best,
    source: h.source,
    oierdb: h.oierdb,
    records: h.records,
  });
}

// ===== 报告 =====
const coverage = merged.length / entries.length;
const fromOierdb = merged.filter((m) => m.source === 'OIerDb').length;
console.log(`名单 ${entries.length} 人：有正赛数据 ${merged.length}（OIerDb ${fromOierdb} + 仅 CSP ${merged.length - fromOierdb}），同名外校 ${ambiguous.length}，查不到 ${misses.length}`);
console.log(`覆盖率 ${(coverage * 100).toFixed(0)}%` + (coverage < 0.4 ? '  ⚠ 低于 40%，不建议全量改权重' : ''));
if (oierdbCount) console.log(`OIerDb 收录本校 ${oierdbCount} 人，其中 ${fromOierdb} 人在校 OJ 名单里`);

merged.sort((a, b) => b.nextStrength - a.nextStrength);
console.log('\n姓名             真名    正赛依据                        校OJ  正赛  混合   实力变化');
for (const m of merged) {
  const bestTxt = m.source === 'OIerDb'
    ? `全国#${m.oierdb.national} 评分${Math.round(m.oierdb.score)} CCF${m.oierdb.ccf}`
    : `${m.best.year} ${GROUP_NAME[m.best.group]}${AWARD_NAME[m.best.award]} ${m.best.score}分${m.best.rank ? ` #${m.best.rank}` : ""}`;
  const sign = m.delta >= 0 ? '+' : '';
  console.log(
    `${(m.entry.name + ' ').padEnd(14, '　')} ${(m.entry.realName || m.entry.name).padEnd(5, '　')} ${bestTxt.padEnd(30, ' ')} ${(m.oj * 100).toFixed(0).padStart(4)} ${(m.oi * 100).toFixed(0).padStart(5)} ${(m.blended * 100).toFixed(0).padStart(5)}  ${m.base.toFixed(3)}→${m.nextStrength.toFixed(3)} (${sign}${m.delta.toFixed(3)})`,
  );
}

if (ambiguous.length) {
  console.log('\n=== 同名但不在本校（未合并，需人工确认）===');
  for (const a of ambiguous) {
    console.log(`  ${a.name}${a.realName ? ` / ${a.realName}` : ''}: ` + a.records.map((r) => `${r.school} ${r.score}(${GROUP_NAME[r.group]}${AWARD_NAME[r.award]})`).join(' ; '));
  }
}
if (misses.length) {
  console.log('\n=== 完全没有获奖记录 ===');
  console.log('  ' + misses.map((m) => m.realName || m.name).join('、'));
}

if (oierdbOnly.length) {
  console.log('\n=== OIerDb 有记录、但不在校 OJ LV2+ 名单里（未加入）===');
  for (const o of oierdbOnly) {
    console.log(`  ${o.name}（${o.grade}）全国#${o.national} 评分${Math.round(o.score)} CCF${o.ccf}`);
  }
}

if (!WRITE) {
  console.log('\n（预演模式，未写文件；加 --write 写回 src/roster.ts）');
  process.exit(0);
}

// ===== 写回 =====
const byMerge = new Map(merged.map((m) => [m.entry.name, m]));
const out = [];
out.push('// 由 scripts/merge-csp.mjs 自动生成，请勿手改');
out.push(`// 来源：校 OJ（oj.gxyzh.com）排行榜 LV2+ ${entries.length} 人 + CSP-J/S 2023–2024 陕西获奖名单 + OIerDb 本校 ${oierdbCount} 人`);
out.push(`// 其中 ${merged.length} 人有正赛数据（${fromOierdb} 人来自 OIerDb，${merged.length - fromOierdb} 人来自 CSP 奖项），正赛占 80%；无正赛数据者按校 OJ 排名计算`);
out.push('export interface RosterEntry {');
out.push('  name: string;');
out.push('  lv: number;');
out.push('  rp: number | null;');
out.push('  ac: number | null;');
out.push('  rank: number;');
out.push('  /** 0-1 初始实力（校 OJ 20% + 正赛 80% 混合） */');
out.push('  strength: number;');
out.push('  /** 初始 rating，用于成长机制 */');
out.push('  rating0: number;');
out.push('  /** 合并前的校 OJ 原始实力，重复跑脚本时的基线 */');
out.push('  strength0?: number;');
out.push('  /** 真实姓名（有的话） */');
out.push('  realName?: string;');
out.push('  /** OIerDb 正赛数据（有的话） */');
out.push('  oierdb?: { national: number; score: number; ccf: number; grade: string };');
out.push('  /** CSP 最好成绩（没有 OIerDb 时才有） */');
out.push('  csp?: { year: number; group: "j" | "s"; award: 1 | 2 | 3; score: number; school: string; rank?: number | null; total?: number | null };');
out.push('}');
out.push('');
out.push('export const ROSTER: RosterEntry[] = [');
entries.sort((a, b) => a.rank - b.rank);
for (const e of entries) {
  const m = byMerge.get(e.name);
  const parts = [`name: ${JSON.stringify(e.name)}`, `lv: ${e.lv}`, `rp: ${e.rp ?? 'null'}`, `ac: ${e.ac ?? 'null'}`, `rank: ${e.rank}`];
  if (m) {
    parts.push(`strength: ${m.nextStrength}`, `rating0: ${m.nextRating}`, `strength0: ${e.strength0 ?? e.strength}`);
  } else {
    parts.push(`strength: ${e.strength}`, `rating0: ${e.rating0}`);
  }
  // 真名与成绩无关，无论有没有并到正赛数据都要保留
  if (e.realName) parts.push(`realName: ${JSON.stringify(e.realName)}`);
  if (m) {
    if (m.oierdb) {
      const o = m.oierdb;
      parts.push(`oierdb: { national: ${o.national}, score: ${o.score}, ccf: ${o.ccf}, grade: ${JSON.stringify(o.grade)} }`);
    }
    if (m.best) {
      const b = m.best;
      parts.push(`csp: { year: ${b.year}, group: "${b.group}", award: ${b.award}, score: ${b.score}, school: ${JSON.stringify(b.school)}${b.rank ? `, rank: ${b.rank}, total: ${b.total}` : ""} }`);
    }
  }
  out.push(`  { ${parts.join(', ')} },`);
}
out.push('];');
out.push('');
writeFileSync(ROSTER_PATH, out.join('\n'), 'utf8');
console.log(`\n✅ 已写回 ${ROSTER_PATH}（${entries.length} 条，其中 ${merged.length} 条带正赛数据）`);
