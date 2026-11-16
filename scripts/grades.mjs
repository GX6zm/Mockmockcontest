/**
 * 学生年级表：data/年级对照表.txt  ⇄  src/grades.ts
 *
 * 用法：
 *   node scripts/grades.mjs --init   # 从 roster.ts 生成 txt 模板（已有则不动）
 *   node scripts/grades.mjs          # 读 txt，生成 src/grades.ts
 *   node scripts/grades.mjs --check  # 只检查不写
 *
 * txt 每行「姓名<TAB>年级」，年级认 初一/初二/初三/高一/高二/高三（或 1–6）；写成 ? 或留空表示未知，
 * 模拟器会按确定性的伪随机把未知的人分到三个年级（保证每级都有人）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER } from '../src/roster.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const txtArg = process.argv.find((a) => a.endsWith('.txt'));
const TXT = txtArg ? txtArg : join(ROOT, 'data', '年级对照表.txt');
const OUT = join(ROOT, 'src', 'grades.ts');

const GRADE_NUM = { 初一: 1, 初二: 2, 初三: 3, 高一: 4, 高二: 5, 高三: 6, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
const GRADE_NAME = { 1: '初一', 2: '初二', 3: '初三', 4: '高一', 5: '高二', 6: '高三' };

function initTemplate() {
  if (existsSync(TXT)) {
    console.log(`已存在，不覆盖：${TXT}`);
    return;
  }
  const lines = [
    '# 学生年级对照表（模拟器 2026-2027 学年用）',
    '#',
    '# 怎么填：把第二列的 ? 改成 初一 / 初二 / 初三 / 高一 / 高二 / 高三 就行，别改名。',
    '# 初中的同学按真实年级填：初中生只能打 CSP-J（第一轮/第二轮 J 组），NOIP 起要高中。',
    '# 留 ? 的话，模拟器会按种子自动分配年级，也能玩，只是不按你的真实名单来。',
    '# 第三列是数据源里的旧年级（2023–24 赛季），仅供参考。',
    '# 填完存成 UTF-8，然后跑：node scripts/grades.mjs',
    '#',
    '# 姓名\t年级\t资料',
    '',
  ];
  for (const r of ROSTER) {
    const ref = r.oierdb?.grade ?? '';
    lines.push(`${r.name}\t?\t${ref}`);
  }
  writeFileSync(TXT, lines.join('\n') + '\n', 'utf8');
  console.log(`已生成模板：${TXT}（${ROSTER.length} 人）`);
}

function parseTxt() {
  const text = readFileSync(TXT, 'utf8');
  const map = {};
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = line.split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const [name, g] = cells;
    const num = GRADE_NUM[g];
    rows.push({ name, raw: g, num: num ?? 0 });
    if (num) map[name] = num;
  }
  return { map, rows };
}

function writeTs(map) {
  const body = Object.entries(map)
    .sort(([a], [b]) => (ROSTER.findIndex((r) => r.name === a) - ROSTER.findIndex((r) => r.name === b)))
    .map(([n, g]) => `  ${JSON.stringify(n)}: ${g},`)
    .join('\n');
  const ts = `// 由 scripts/grades.mjs 从 data/年级对照表.txt 自动生成，请勿手改
// 1 = 初一，2 = 初二，3 = 初三，4 = 高一，5 = 高二，6 = 高三；没列出来的人由引擎按种子自动分配
export const GRADES_BY_NAME: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
${body}
};

/** 人工填写了年级的人数（0 表示整份表都是 ?，引擎全自动分配） */
export const GRADES_FILLED = ${Object.keys(map).length};
`;
  writeFileSync(OUT, ts, 'utf8');
  console.log(`已写入 ${OUT}：${Object.keys(map).length} 人有明确年级，${ROSTER.length - Object.keys(map).length} 人自动分配`);
}

const warnUnknown = (rows) => {
  const names = new Set(ROSTER.map((r) => r.name));
  const bad = rows.filter((r) => !names.has(r.name)).map((r) => r.name);
  if (bad.length) console.warn(`⚠️ 不在 roster 里的名字（会被忽略）：${bad.join('、')}`);
  const weird = rows.filter((r) => r.name && !r.num && r.raw !== '?' && r.raw !== '').map((r) => `${r.name}=${r.raw}`);
  if (weird.length) console.warn(`⚠️ 年级无法识别（按未知处理）：${weird.join('、')}`);
};

const mode = process.argv[2];
if (mode === '--init') {
  initTemplate();
  process.exit(0);
}
if (!existsSync(TXT)) {
  console.error(`找不到 ${TXT}，先跑 node scripts/grades.mjs --init`);
  process.exit(1);
}
const { map, rows } = parseTxt();
warnUnknown(rows);
if (mode === '--check') {
  const filled = rows.filter((r) => r.num).length;
  console.log(`检查：${filled}/${ROSTER.length} 人有年级，${Object.keys(map).length} 人可识别`);
  for (let g = 1; g <= 6; g++) console.log(`  ${GRADE_NAME[g]}：${Object.values(map).filter((v) => v === g).length} 人`);
  process.exit(0);
}
writeTs(map);
