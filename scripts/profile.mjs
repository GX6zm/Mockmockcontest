#!/usr/bin/env node
/**
 * 选手属性对照表工具（简化版）
 *
 *   node scripts/profile.mjs --init    生成 data/属性对照表.csv（Excel 直接打开）和 .txt
 *   node scripts/profile.mjs           读表 → 生成 src/profile.ts
 *   node scripts/profile.mjs --check   只校验，不写文件
 *   node scripts/profile.mjs --show    终端里按列对齐打印
 *   node scripts/profile.mjs --verify  校验 src/profile.ts 与表逐格一致
 *
 * 列顺序（15 列）：
 *   姓名 年级 天赋 数学 动态规划 图论 贪心 数据结构 模拟实现 字符串 计算几何 代码 阅读 调试 备注
 *
 * 已彻底移除：性格 / 实力 / 自我认知 / 抗压 / 耐心 / 冒险。
 * 这些字段在引擎、类型、详情卡里都不再存在；旧表里即使还有这些列也会被忽略。
 * 估分噪声、交题策略、初赛权重都改成固定中性规则，不再依赖任何隐藏属性。
 *
 * 除姓名外留空 = 沿用当前值；8 个专题 0–150（150 = 知识点上限），元能力 0–100；
 * 天赋 0.5–1.5（建议 0.85–1.15）；年级写 初一…高三 或 1–6。
 * 优先读 .csv，没有 csv 再读 .txt；编码自适应 UTF-8 / GBK / UTF-16LE。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(ROOT, 'data', '属性对照表.csv');
const TXT = path.join(ROOT, 'data', '属性对照表.txt');
const OUT = path.join(ROOT, 'src', 'profile.ts');
const SEED = 20261019;

const { TOPIC_LIST, TOPIC_NAMES } = await import(pathToFileURL(path.join(ROOT, 'src', 'game.ts')).href);
const { createSeason, GRADE_NAMES } = await import(pathToFileURL(path.join(ROOT, 'src', 'season.ts')).href);

const GRADE_LABEL = { 初一: 1, 初二: 2, 初三: 3, 高一: 4, 高二: 5, 高三: 6 };

const TOPIC_COLS = TOPIC_LIST.map((t) => ({ col: TOPIC_NAMES[t], key: t }));
const META_COLS = [
  { col: '代码', key: 'coding' },
  { col: '阅读', key: 'reading' },
  { col: '调试', key: 'debug' },
];
const HEADER_COLS = ['姓名', '年级', '天赋', ...TOPIC_COLS.map((c) => c.col), ...META_COLS.map((c) => c.col), '备注'];

/** 显示宽度：中文算 2 列 */
function width(s) {
  let w = 0;
  for (const ch of String(s)) w += ch.codePointAt(0) > 255 ? 2 : 1;
  return w;
}
function pad(s, n) {
  const t = String(s);
  return t + ' '.repeat(Math.max(0, n - width(t)));
}

/**
 * 解码：Excel 在中文 Windows 上可能存成 GBK/ANSI、UTF-16LE 或 UTF-8。
 * 先看 BOM，再试严格 UTF-8，失败再按 GBK 解，保证用户直接「保存」出来的文件都能读。
 */
function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try { return new TextDecoder('gbk').decode(buf); } catch { return buf.toString('utf8'); }
  }
}

function readTable() {
  if (fs.existsSync(CSV)) return { text: decode(fs.readFileSync(CSV)), file: CSV };
  if (fs.existsSync(TXT)) return { text: decode(fs.readFileSync(TXT)), file: TXT };
  return null;
}

/** 按 CSV/TSV 规则切一行（支持引号） */
function splitLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** 按行切（引号里的换行不算） */
function splitRows(text) {
  const rows = [];
  let cur = '';
  let q = false;
  const push = () => { if (cur.trim()) rows.push(cur); cur = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      cur += ch;
      if (ch === '"' && text[i + 1] === '"') cur += text[++i];
      else if (ch === '"') q = false;
    } else if (ch === '"') { q = true; cur += ch; }
    else if (ch === '\n') push();
    else cur += ch;
  }
  push();
  return rows;
}

function emptyOverride() {
  return { grade: null, talent: null, topics: {}, meta: {} };
}

function parse(text) {
  const rows = [];
  const errors = [];
  const lines = splitRows(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const cols = splitLine(line);
    const name = cols[0];
    if (!name || name === '姓名') continue;
    const o = emptyOverride();

    const gradeRaw = cols[1] ?? '';
    if (gradeRaw) {
      const g = GRADE_LABEL[gradeRaw] ?? Number(gradeRaw);
      if (Number.isInteger(g) && g >= 1 && g <= 6) o.grade = g;
      else errors.push(`${name}：年级「${gradeRaw}」不认识（初一…初三 / 高一…高三 / 1–6）`);
    }

    const talentRaw = cols[2] ?? '';
    if (talentRaw) {
      const v = Number(talentRaw);
      if (!Number.isFinite(v)) errors.push(`${name}：天赋「${talentRaw}」不是数字`);
      else if (v < 0.5 || v > 1.5) errors.push(`${name}：天赋 ${v} 超出 0.5–1.5`);
      else o.talent = Math.round(v * 1000) / 1000;
    }

    const attrAt = (i, max, label) => {
      const raw = cols[i] ?? '';
      if (!raw) return null;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0 || v > max) {
        errors.push(`${name}：${label}「${raw}」要是 0–${max} 的数字`);
        return null;
      }
      return Math.round(v) / max;
    };

    TOPIC_COLS.forEach((c, i) => {
      const v = attrAt(3 + i, 150, c.col);
      if (v != null) o.topics[c.key] = v;
    });
    META_COLS.forEach((c, i) => {
      const v = attrAt(3 + TOPIC_COLS.length + i, 100, c.col);
      if (v != null) o.meta[c.key] = v;
    });

    rows.push({ name, o });
  }
  return { rows, errors };
}

/** 当前引擎算出来的完整表（用于 --init 预填） */
function currentRows() {
  const season = createSeason(SEED, 1);
  const order = [...season.students].sort((a, b) => b.startOverall - a.startOverall);
  return order.map((s) => {
    const sk = s.skills;
    return [
      s.name,
      GRADE_NAMES[s.grade],
      s.talent.toFixed(3),
      ...TOPIC_COLS.map((c) => String(Math.round((sk.topics[c.key] ?? 0) * 150))),
      ...META_COLS.map((c) => String(Math.round(sk[c.key] * 100))),
      '',
    ];
  });
}

function init() {
  const old = readTable();
  const kept = new Map();
  if (old) for (const r of parse(old.text).rows) kept.set(r.name, r.o);

  const rows = currentRows().map((cells) => {
    const o = kept.get(cells[0]);
    if (!o) return cells;
    const vt = (x, fallback) => (x != null ? String(Math.round(x * 150)) : fallback);
    const vm = (x, fallback) => (x != null ? String(Math.round(x * 100)) : fallback);
    return [
      cells[0],
      o.grade != null ? GRADE_NAMES[o.grade] : cells[1],
      o.talent != null ? o.talent.toFixed(3) : cells[2],
      ...TOPIC_COLS.map((c, i) => vt(o.topics[c.key], cells[3 + i])),
      ...META_COLS.map((c, i) => vm(o.meta[c.key], cells[3 + TOPIC_COLS.length + i])),
      cells[cells.length - 1],
    ];
  });

  const quote = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  fs.mkdirSync(path.dirname(CSV), { recursive: true });
  // Excel 2010 也能正确识别 UTF-8 BOM 的逗号 CSV；双击直接分列
  fs.writeFileSync(CSV, '\uFEFF' + [HEADER_COLS.map(quote).join(','), ...rows.map((r) => r.map(quote).join(','))].join('\r\n'));
  fs.writeFileSync(
    TXT,
    [
      '# 选手属性对照表（文本版；Excel 用 data/属性对照表.csv）',
      '# Tab 分隔；除姓名外留空 = 沿用当前值。8 个专题 0–150（150 = 上限），代码/阅读/调试 0–100；天赋 0.85–1.15；年级写 初一…高三',
      '# 列：姓名 年级 天赋 数学 动态规划 图论 贪心 数据结构 模拟实现 字符串 计算几何 代码 阅读 调试 备注',
      '# 已移除：性格 / 实力 / 自我认知 / 抗压 / 耐心 / 冒险（引擎里不再存在）',
      `# 基于 seed ${SEED} + 当前天赋表生成；改完跑 node scripts/profile.mjs`,
      '# ' + HEADER_COLS.join('\t'),
      ...rows.map((r) => r.join('\t')),
    ].join('\n') + '\n',
  );
  console.log(`✅ 已生成 ${path.relative(ROOT, CSV)}（Excel / WPS 直接打开）和 ${path.relative(ROOT, TXT)}，共 ${rows.length} 人`);
}

function show(text) {
  const { rows, errors } = parse(text);
  const st = (v) => (v != null ? String(Math.round(v * 150)) : '');
  const sm = (v) => (v != null ? String(Math.round(v * 100)) : '');
  const table = [HEADER_COLS, ...rows.map((r) => {
    const o = r.o;
    return [
      r.name,
      o.grade != null ? GRADE_NAMES[o.grade] : '',
      o.talent != null ? o.talent.toFixed(3) : '',
      ...TOPIC_COLS.map((c) => st(o.topics[c.key])),
      ...META_COLS.map((c) => sm(o.meta[c.key])),
      '',
    ];
  })];
  const widths = HEADER_COLS.map((h, i) => Math.max(width(h), ...table.map((r) => width(r[i] ?? ''))));
  for (const [i, r] of table.entries()) {
    console.log(r.map((c, j) => pad(c ?? '', widths[j])).join('  ').trimEnd());
    if (i === 0) console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  }
  if (errors.length) {
    console.log();
    for (const e of errors) console.error('❌ ' + e);
  }
}

function write(rows, errors, checkOnly) {
  const known = new Set(createSeason(SEED, 1).students.map((s) => s.name));
  for (const r of rows) if (!known.has(r.name)) errors.push(`${r.name} 不在名单里（拼写？）`);

  const filled = rows.filter((r) =>
    r.o.grade != null || r.o.talent != null
    || Object.keys(r.o.topics).length || Object.keys(r.o.meta).length);
  if (errors.length) {
    for (const e of errors) console.error('❌ ' + e);
    console.error(`共 ${errors.length} 处错误，先改表再生成`);
    process.exitCode = 1;
    return;
  }

  const body = [
    '// 由 scripts/profile.mjs 从 data/属性对照表.csv 生成，请勿手改',
    "import type { Skills, Topic } from './types.ts';",
    '',
    'export interface ProfileOverride {',
    '  grade?: 1 | 2 | 3 | 4 | 5 | 6;',
    '  talent?: number;',
    '  topics?: Partial<Record<Topic, number>>;',
    "  meta?: Partial<Pick<Skills, 'coding' | 'reading' | 'debug'>>;",
    '}',
    '',
    '/** 手填的属性覆盖；没填的人沿用引擎生成值 */',
    'export const PROFILE_BY_NAME: Record<string, ProfileOverride> = {',
  ];
  for (const r of filled) {
    const parts = [];
    if (r.o.grade != null) parts.push(`grade: ${r.o.grade}`);
    if (r.o.talent != null) parts.push(`talent: ${r.o.talent}`);
    const topics = Object.entries(r.o.topics);
    if (topics.length) parts.push(`topics: { ${topics.map(([k, v]) => `${k}: ${v}`).join(', ')} }`);
    const meta = Object.entries(r.o.meta);
    if (meta.length) parts.push(`meta: { ${meta.map(([k, v]) => `${k}: ${v}`).join(', ')} }`);
    body.push(`  ${JSON.stringify(r.name)}: { ${parts.join(', ')} },`);
  }
  body.push('};', '', `export const PROFILE_FILLED = ${filled.length};`, '');

  const blanks = rows.filter((r) => !filled.includes(r));
  console.log(`已填 ${filled.length} / ${rows.length} 人（其余沿用引擎值）`);
  if (blanks.length) console.log(`⚠️ ${blanks.length} 人仍有空白格，留空的字段会沿用引擎生成值：${blanks.map((r) => r.name).join('、')}`);
  if (checkOnly) {
    console.log('（--check：不写文件）');
    return;
  }
  fs.writeFileSync(OUT, body.join('\n'));
  console.log(`✅ 已写入 ${path.relative(ROOT, OUT)}`);
}

/** 校验生成物 src/profile.ts 与表逐格一致（防止手工改 profile.ts 或忘了重跑） */
async function verify() {
  const table = readTable();
  if (!table) {
    console.error('没有找到 data/属性对照表.csv 或 .txt');
    process.exit(1);
  }
  const { rows, errors } = parse(table.text);
  if (errors.length) {
    for (const e of errors) console.error('❌ ' + e);
    process.exitCode = 1;
    return;
  }
  const mod = await import(pathToFileURL(OUT).href + '?v=' + Date.now());
  const gen = mod.PROFILE_BY_NAME;
  const issues = [];
  const cmp = (name, label, want, got) => {
    if (want == null && got == null) return;
    if (want == null || got == null || Math.abs(want - got) > 1e-9) issues.push(`${name}. ${label}：表=${want} 生成=${got}`);
  };
  for (const r of rows) {
    const g = gen[r.name];
    if (!g) { issues.push(`${r.name}：profile.ts 里没有这个人`); continue; }
    cmp(r.name, 'grade', r.o.grade, g.grade);
    cmp(r.name, 'talent', r.o.talent, g.talent);
    for (const [k, v] of Object.entries(r.o.topics)) cmp(r.name, 'topics.' + k, v, g.topics?.[k]);
    for (const [k, v] of Object.entries(r.o.meta)) cmp(r.name, 'meta.' + k, v, g.meta?.[k]);
  }
  for (const name of Object.keys(gen)) if (!rows.some((r) => r.name === name)) issues.push(`${name}：表里没有，但 profile.ts 里有`);

  if (issues.length) {
    for (const s of issues) console.error('❌ ' + s);
    console.error(`共 ${issues.length} 处不一致：改完表要重跑 node scripts/profile.mjs`);
    process.exitCode = 1;
    return;
  }
  const cells = rows.reduce((n, r) => n + 1 + Object.keys(r.o.topics).length + Object.keys(r.o.meta).length
    + (r.o.talent != null ? 1 : 0) + (r.o.grade != null ? 1 : 0), 0);
  console.log(`✅ src/profile.ts 与表一致：${rows.length} 人 / ${cells} 个字段`);
}

const arg = process.argv[2];
if (arg === '--init') {
  init();
} else {
  const table = readTable();
  if (!table) {
    console.error('没有找到 data/属性对照表.csv 或 .txt，先跑 node scripts/profile.mjs --init');
    process.exit(1);
  }
  if (arg === '--show') {
    show(table.text);
  } else if (arg === '--verify') {
    await verify();
  } else {
    const { rows, errors } = parse(table.text);
    write(rows, errors, arg === '--check');
  }
}
