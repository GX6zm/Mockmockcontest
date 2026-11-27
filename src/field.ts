/**
 * 虚构的外校/外省选手分数池。
 *
 * 现实里省排名、省队、NOI/APIO/WC 奖牌都是"和多少人比"，不是"过没过某条线"。
 * 官方只公布每个奖项的名额与分数线，所以我们用「分数—分位锚点」反推整条分数分布：
 *   q=0 是全省最高分，q=1 是最低分，锚点之间线性插值。
 * 外校选手按 q_i = (i+0.5)/total 等分位取样，因此：
 *   ① 分数落在锚点上时，名次正好是分数线的名次（线 = 第 quota 名）；
 *   ② 结果由 total 与锚点唯一决定，同 seed 同参数完全可复现，UI 与脚本一致。
 * 本校选手不参与取样，排名 = 1 + 外校里分数比自己高的人数（同分并列）。
 */

/** 分位锚点：q=0 最高分，q=1 最低分 */
export interface FieldAnchor {
  q: number;
  score: number;
}

export interface FieldSpec {
  /** 含本校选手在内的参赛总人数 */
  total: number;
  anchors: FieldAnchor[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 已排序锚点插值：给分位 → 分数 */
function interpSorted(anchors: FieldAnchor[], q: number): number {
  if (!anchors.length) return 0;
  const qq = clamp01(q);
  if (qq <= anchors[0].q) return anchors[0].score;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (qq <= b.q) {
      const t = b.q === a.q ? 0 : (qq - a.q) / (b.q - a.q);
      return a.score + (b.score - a.score) * t;
    }
  }
  return anchors[anchors.length - 1].score;
}

/** 锚点插值：给分位 → 分数 */
export function scoreAt(spec: FieldSpec, q: number): number {
  const anchors = spec.anchors.slice().sort((a, b) => a.q - b.q);
  return interpSorted(anchors, q);
}

/** 卷面难度浮动时同步偏移中间锚点，使省排名池与浮动后的省线保持一致 */
export function shiftField(spec: FieldSpec, shift: number, maxScore: number): FieldSpec {
  if (!shift) return spec;
  return {
    ...spec,
    anchors: spec.anchors.map((a) => (
      a.q <= 0 || a.q >= 1
        ? a
        : { ...a, score: Math.max(0, Math.min(maxScore, Math.round((a.score + shift) / 5) * 5)) }
    )),
  };
}

/**
 * 外校选手分数（降序），人数 = total - 1（把最高分位置留给本校最高分，避免
 * "我们考了 400 却排在虚构的第 1 名之外"这种别扭事；真实里确实可能并列第一）。
 * 用分位中点取值，不额外加噪声，保证「线 = 第 quota 名」严格成立。
 */
export function fieldScores(spec: FieldSpec): number[] {
  const n = Math.max(0, spec.total - 1);
  const anchors = spec.anchors.slice().sort((a, b) => a.q - b.q);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // i=0 → 分位最低、i=n-1 → 分位最高：先按分位从高到低排
    const q = (n - 1 - i + 0.5) / spec.total;
    out.push(Math.round(interpSorted(anchors, q)));
  }
  return out;
}

/** 外校里比 mine 严格高的人数 */
export function countAbove(scores: number[], mine: number): number {
  let above = 0;
  for (const s of scores) {
    if (s > mine) above += 1;
  }
  return above;
}

/** 名次 = 1 + 外校里严格高于自己的人数 */
export function rankAmong(scores: number[], mine: number): number {
  return 1 + countAbove(scores, mine);
}

/** 名次 → 分位（0–1） */
export function pctOf(rank: number, total: number): number {
  return Math.max(0, Math.min(1, (rank - 0.5) / Math.max(1, total)));
}

/** 按名次发奖：返回命中的最高奖级下标（-1 表示没奖） */
export function awardIndexByRank(rank: number, quotas: number[]): number {
  for (let i = 0; i < quotas.length; i++) {
    if (rank <= quotas[i]) return i;
  }
  return -1;
}
