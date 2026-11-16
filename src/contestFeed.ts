/**
 * 赛场实况播报：把引擎里每个选手的 phase / 卡题时长 / 返工次数，
 * 翻译成「游记里会写出来的那种话」。
 *
 * 素材来自三位选手的公开游记（同一作者 te_bie_zhi_chu）：
 *  - 2025 省选：开场先看整套题、T1 卡 1h 后改排序、想到优化懒得改「后悔 100 万年」、
 *    过了大数据但 0.6 秒「评测机救救我」、12 分暴力写完直接走人、最后回去补性质。
 *  - 2026 省选：「快 2h 了就先下一题」、时空限制有点可怕、没注意时间遗憾离场。
 *  - NOI2026：读错题被坑半小时、T2 写 50 分暴力 + 链性质、觉得有银了就松懈、
 *    「早上五点起来打坐冷静」、最后 T3 读错题 8 分暴力都没写出来、忘不了 freopen。
 *
 * 这里只读引擎状态、不消耗随机数、不写回任何比赛数据，
 * 所以 1x / 4x / +10 分 / 到收卷 的结果完全不受影响。
 */
import type { Contest, Student } from './types.ts';

export interface FeedLine {
  name: string;
  text: string;
  tone: 'calm' | 'focus' | 'warn' | 'danger' | 'good';
  /** 排序用：越大越有戏剧性 */
  weight: number;
}

const MIN = 60;

/** 卡题超过这个秒数就值得播报 */
const STUCK_AFTER = 40 * MIN;

function minutes(sec: number): number {
  return Math.max(1, Math.round(sec / MIN));
}

function activeProblem(st: Student) {
  if (st.currentProblem === null) return null;
  return st.problems[st.currentProblem] ?? null;
}

/**
 * 生成当前这一分钟的实况。返回按戏剧性排序、最多 6 条。
 * 同一 (比赛分钟, 选手状态) 输出稳定，不会每帧闪烁。
 */
export function buildContestFeed(c: Contest): FeedLine[] {
  const out: FeedLine[] = [];
  const elapsed = c.timeElapsed;
  const remain = c.duration - elapsed;

  // 开场：所有人都在通读题面，这是几乎每篇游记的第一句
  if (elapsed < 8 * MIN) {
    const surveying = c.students.filter((s) => s.surveyLeft > 0).length;
    if (surveying > 0) {
      out.push({
        name: '全场',
        text: `先把 ${c.problems.length} 道题的题面整体翻一遍，再决定开题顺序`,
        tone: 'calm', weight: 20,
      });
    }
  }

  for (const st of c.students) {
    if (st.surveyLeft > 0) continue;
    const ps = activeProblem(st);
    const pLabel = st.currentProblem === null ? '' : `P${st.currentProblem + 1}`;
    const spent = ps?.timeSpent ?? 0;

    if (ps && ps.phase === 'thinking' && spent > STUCK_AFTER) {
      out.push({
        name: st.name,
        text: `${pLabel} 已经卡了 ${minutes(spent)} 分钟，还在推性质`,
        tone: 'warn', weight: 92,
      });
    } else if (ps && ps.phase === 'testing' && ps.debugRounds > 0) {
      out.push({
        name: st.name,
        text: `${pLabel} 对拍拍出 bug，第 ${ps.debugRounds} 次回去返工`,
        tone: 'danger', weight: 88,
      });
    } else if (st.phase === 'restoring') {
      out.push({
        name: st.name,
        text: `${pLabel} 交完正解心里发毛，补交一版暴力保底`,
        tone: 'warn', weight: 86,
      });
    } else if (ps && ps.phase === 'deciding') {
      out.push({
        name: st.name,
        text: `${pLabel} 在犹豫要不要交，估了一下自测过的子任务`,
        tone: 'focus', weight: 62,
      });
    } else if (ps && ps.phase === 'coding' && ps.mode === 'brute') {
      out.push({
        name: st.name,
        text: `${pLabel} 正解没思路，先把暴力分锁住`,
        tone: 'focus', weight: 58,
      });
    } else if (ps && ps.phase === 'testing') {
      out.push({
        name: st.name,
        text: `${pLabel} 在对拍，顺便看一眼时空限制`,
        tone: 'calm', weight: 40,
      });
    } else if (ps && ps.phase === 'thinking' && spent > 20 * MIN) {
      out.push({
        name: st.name,
        text: `${pLabel} 想了 ${minutes(spent)} 分钟，快到该止损换题的时候了`,
        tone: 'warn', weight: 66,
      });
    } else if (st.phase === 'checking') {
      out.push({
        name: st.name,
        text: '做完了，检查文件名、freopen 和多测清空',
        tone: 'good', weight: 30,
      });
    }
  }

  // 收卷前：游记里最高频的「最后十分钟」剧情
  if (remain > 0 && remain <= 15 * MIN) {
    const rushing = c.students.filter((s) => !s.finished && s.surveyLeft <= 0);
    if (rushing.length) {
      const one = rushing[(Math.floor(elapsed / MIN) + c.seed) % rushing.length];
      out.push({
        name: one.name,
        text: `最后 ${Math.ceil(remain / MIN)} 分钟，回去抢救一版，别慌到忘写 freopen`,
        tone: 'danger', weight: 96,
      });
    }
  }

  // 稳定排序：先按戏剧性，再按名字，保证同一帧输出一致
  out.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  const seen = new Set<string>();
  const dedup: FeedLine[] = [];
  for (const line of out) {
    if (seen.has(line.name)) continue;
    seen.add(line.name);
    dedup.push(line);
    if (dedup.length >= 6) break;
  }
  return dedup;
}

export const FEED_TONE: Record<FeedLine['tone'], string> = {
  calm: 'text-slate-400',
  focus: 'text-sky-300',
  warn: 'text-amber-300',
  danger: 'text-rose-300',
  good: 'text-emerald-300',
};
