/**
 * 校验日志：所有检查脚本（career-check / coach-smoke / e2e-check / trace-check）
 * 每次跑完往 logs/verify.log 追加一行，方便回看「哪次改动后数字变了」。
 *
 * 用法（脚本内部）：
 *   import { logRun } from './log.mjs';
 *   logRun('career-check', { seed, best, mid, worst, ms });
 *
 * 日志失败绝不影响主流程（全部 try/catch 吞掉）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG = path.join(ROOT, 'logs', 'verify.log');

/** 本地时间戳（Asia/Shanghai），形如 2026-10-19 21:30:11 */
export function stamp() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** 追加一条运行记录：2026-10-19 21:30:11 [career-check] seed=… best=91 … */
export function logRun(script, fields = {}) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    const kv = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    fs.appendFileSync(LOG, `${stamp()} [${script}]${kv ? ' ' + kv : ''}\n`);
  } catch {
    /* 日志写不进去也不影响校验 */
  }
}

/** 追加一条自由文本记录（用于「改了哪段、为什么」的笔记） */
export function logNote(tag, message) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${stamp()} [${tag}] ${message}\n`);
  } catch {
    /* 同上 */
  }
}
