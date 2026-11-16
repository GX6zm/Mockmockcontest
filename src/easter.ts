/**
 * 战报彩蛋：把 201 条“唐话”按固定规则塞进赛后战报。
 *
 * 规则（用户确认）：
 * - 每场固定 1 条“今日语录”；
 * - 另外 3 个高亮位：最大挂分 / 最大反挂 / 估分最准，各配 1 条；
 * - 高亮位优先用该选手自己的语录；没有就退到通用池；
 * - 同一场不重复用同一句；全部由 seed 决定，刷新页面不变，也不影响任何分数。
 *
 * 这是纯展示数据，不参与估分、排名、rating 或训练。
 */
import { QUOTES } from './quotes.ts';
import type { Quote } from './quotes.ts';
import type { StudentResult } from './types.ts';

export interface EasterHighlight {
  label: string;
  name: string;
  quote: Quote;
}

export interface EasterReport {
  banner: Quote;
  highlights: EasterHighlight[];
}

/** 固定种子的线性同余，保证同一场刷新后还是同一批彩蛋 */
function makeRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickQuote(speaker: string | null, rng: () => number, used: Set<string>): Quote {
  const own = speaker ? QUOTES.filter((q) => q.speaker === speaker && !used.has(q.text)) : [];
  if (own.length > 0) return own[Math.floor(rng() * own.length)];

  const pool = QUOTES.filter((q) => !used.has(q.text));
  if (pool.length === 0) return QUOTES[Math.floor(rng() * QUOTES.length)];
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * 生成一场比赛的彩蛋。
 * `results` 是 finalize 后的真实成绩；这里只读 name/delta/calibration，不修改。
 */
export function buildEasterReport(results: StudentResult[], seed: number): EasterReport {
  const rng = makeRng(seed);
  const used = new Set<string>();

  const banner = pickQuote(null, rng, used);
  used.add(banner.text);

  const byDelta = results.slice().sort((a, b) => a.delta - b.delta || a.name.localeCompare(b.name));
  const worst = byDelta[0];
  const best = byDelta[byDelta.length - 1];
  const accurate = results.slice().sort((a, b) => b.calibration - a.calibration || a.name.localeCompare(b.name))[0];

  const slots: { label: string; result: StudentResult | undefined }[] = [
    { label: '最大挂分', result: worst },
    { label: '最大反挂', result: best },
    { label: '估分最准', result: accurate },
  ];

  const highlights: EasterHighlight[] = [];
  for (const slot of slots) {
    if (!slot.result) continue;
    const quote = pickQuote(slot.result.name, rng, used);
    used.add(quote.text);
    highlights.push({ label: slot.label, name: slot.result.name, quote });
  }

  return { banner, highlights };
}

/**
 * 教练模式的轻量彩蛋：只在该选手有专属语录时返回一条，没有就返回 null。
 * 不新增语录、不编造，纯展示，不影响任何分数。
 */
export function quoteFor(speaker: string | null, seed = 0): Quote | null {
  if (!speaker) return null;
  const own = QUOTES.filter((q) => q.speaker === speaker);
  if (own.length === 0) return null;
  return own[Math.abs(Math.floor(seed)) % own.length];
}
