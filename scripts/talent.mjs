#!/usr/bin/env node
/**
 * 天赋对照表工具（和 scripts/grades.mjs 一个套路）
 *
 *   node scripts/talent.mjs --init    生成 data/天赋对照表.txt（带上当前种子里的天赋值，已有文件不会被覆盖）
 *   node scripts/talent.mjs           读 txt → 生成 src/talent.ts（天赋 >0 才写进去）
 *   node scripts/talent.mjs --check   只检查，不写文件
 *
 * txt 格式（Tab 或连续空格分隔都行，`#` 开头是注释）：
 *   姓名	天赋	备注
 * 天赋留空 = 沿用种子随机。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TXT = path.join(ROOT, 'data', '天赋对照表.txt');
const OUT = path.join(ROOT, 'src', 'talent.ts');
const SEED = 20261019;

const { createSeason } = await import(pathToFileURL(path.join(ROOT, 'src', 'season.ts')).href);

function readTxt() {
  if (!fs.existsSync(TXT)) return null;
  return fs.readFileSync(TXT, 'utf8').replace(/\r\n/g, '\n');
}

/** 解析成 [{name, talent, note}]；兼容旧的 4 列（第 3 列性格已废弃，直接跳过） */
function parse(txt) {
  const rows = [];
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const cols = line.split(/\t+|\s{2,}/).map((c) => c.trim());
    const name = cols[0];
    if (!name) continue;
    const talentRaw = (cols[1] ?? '').trim();
    const note = (cols.length >= 4 ? cols[3] : cols[2] ?? '').trim();
    let talent = null;
    if (talentRaw) {
      const v = Number(talentRaw);
      if (!Number.isFinite(v)) {
        console.error(`❌ ${name}：天赋「${talentRaw}」不是数字`);
      } else if (v < 0.5 || v > 1.5) {
        console.error(`❌ ${name}：天赋 ${v} 超出 0.5–1.5（正常范围 0.85–1.15）`);
      } else {
        talent = Math.round(v * 1000) / 1000;
      }
    }
    rows.push({ name, talent, note });
  }
  return rows;
}

function init() {
  const season = createSeason(SEED, 1);
  const order = [...season.students].sort((a, b) => b.startOverall - a.startOverall);

  // 已有文件：保留用户填过的值，只补新名字
  const old = readTxt();
  const kept = new Map();
  if (old) for (const r of parse(old)) kept.set(r.name, r);

  const head = [
    '# 天赋对照表 —— 手填后跑 `node scripts/talent.mjs` 生成 src/talent.ts',
    '# 列：姓名<Tab>天赋<Tab>备注  （天赋留空 = 种子随机）',
    '# 天赋是训练成长乘数：0.85（慢）~ 1.0（普通）~ 1.15（快），只在训练时生效，不直接改比赛得分',
    `# 这份初始值是 seed ${SEED} 抽到的结果，改完记得重跑 build`,
    `# 姓名\t天赋\t备注`,
  ];
  const lines = order.map((s) => {
    const k = kept.get(s.name);
    const talent = k?.talent != null ? k.talent.toFixed(3) : s.talent.toFixed(3);
    const note = k?.note ?? '';
    return [s.name, talent, note].join('\t');
  });
  fs.mkdirSync(path.dirname(TXT), { recursive: true });
  fs.writeFileSync(TXT, [...head, ...lines].join('\n') + '\n');
  console.log(`✅ 已生成 ${path.relative(ROOT, TXT)}（${lines.length} 人，已有内容保留）`);
}

function write(rows, checkOnly) {
  const talentEntries = rows.filter((r) => r.talent != null).map((r) => [r.name, r.talent]);
  const known = new Set(createSeason(SEED, 1).students.map((s) => s.name));
  for (const r of rows) if (!known.has(r.name)) console.error(`⚠️ ${r.name} 不在名单里（拼写？）`);

  const body = [
    '// 由 scripts/talent.mjs 从 data/天赋对照表.txt 生成，请勿手改',
    '',
    '/** 手填的天赋（训练成长乘数）；没填的人走种子随机 */',
    'export const TALENT_BY_NAME: Record<string, number> = {',
    ...talentEntries.map(([n, v]) => `  ${JSON.stringify(n)}: ${v},`),
    '};',
    '',
    `export const TALENT_FILLED = ${talentEntries.length};`,
    '',
  ].join('\n');

  console.log(`天赋已填 ${talentEntries.length} 人（共 ${rows.length} 行）`);
  if (checkOnly) {
    console.log('（--check：不写文件）');
    return;
  }
  fs.writeFileSync(OUT, body);
  console.log(`✅ 已写入 ${path.relative(ROOT, OUT)}`);
}

const arg = process.argv[2];
if (arg === '--init') {
  init();
} else {
  const txt = readTxt();
  if (!txt) {
    console.error(`没有 ${path.relative(ROOT, TXT)}，先跑 node scripts/talent.mjs --init`);
    process.exit(1);
  }
  write(parse(txt), arg === '--check');
}
