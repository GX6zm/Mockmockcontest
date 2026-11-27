/**
 * 赛场实况播报 + 全场转折大事记：
 * 把引擎里每个选手的 phase / 卡题时长 / 返工次数 / 关键提交，
 * 翻译成「游记里会写出来的那种话」。
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

export interface ContestMilestone {
  time: number;
  kind: 'firstBlood' | 'leadChange' | 'wall' | 'ak';
  title: string;
  text: string;
  tone: FeedLine['tone'];
}

const MIN = 60;
const STUCK_AFTER = 40 * MIN;

function minutes(sec: number): number {
  return Math.max(1, Math.round(sec / MIN));
}

function activeProblem(st: Student) {
  if (st.currentProblem === null) return null;
  return st.problems[st.currentProblem] ?? null;
}

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pickLine(variants: string[], key: string): string {
  return variants[strHash(key) % variants.length] ?? variants[0];
}

/**
 * 生成当前这一分钟的实况。返回按戏剧性排序、最多 6 条。
 * 同一 (比赛分钟, 选手状态) 输出稳定，不会每帧闪烁。
 */
export function buildContestFeed(c: Contest): FeedLine[] {
  const out: FeedLine[] = [];
  const elapsed = c.timeElapsed;
  const remain = c.duration - elapsed;
  const ioi = c.config.format === 'ioi';
  const bucket = Math.floor(elapsed / (5 * MIN));

  if (elapsed < 8 * MIN) {
    const surveying = c.students.filter((s) => s.surveyLeft > 0).length;
    if (surveying > 0) {
      out.push({
        name: '全场',
        text: pickLine([
          `先把 ${c.problems.length} 道题的题面整体翻一遍，再决定开题顺序`,
          '机房响成一片翻纸页声，所有人先用五分钟摸清楚题型和难度梯度',
          '大屏幕上刚亮起题面，前排选手已经开始在草稿纸上圈关键词',
          '开场前八分钟还没人动键盘，都在通读全卷估分',
        ], `${c.seed}#open`),
        tone: 'calm',
        weight: 20,
      });
    }
  }

  for (const st of c.students) {
    if (st.surveyLeft > 0) continue;
    const ps = activeProblem(st);
    const pLabel = st.currentProblem === null ? '' : `P${st.currentProblem + 1}`;
    const spent = ps?.timeSpent ?? 0;
    const key = `${c.seed}#${st.name}#${pLabel}#${bucket}`;

    if (ps && ps.phase === 'thinking' && spent > STUCK_AFTER) {
      const m = minutes(spent);
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 已经卡了 ${m} 分钟，还在推性质`,
          `${pLabel} 盯着草稿纸咬了 ${m} 分钟笔头，状态转移差最后一层没捅破`,
          `${pLabel} 卡在 ${m} 分钟，看得出想死磕正解但手还没摸到键盘`,
          `${pLabel} 枯坐 ${m} 分钟，再想不通只能先写档部分分走了`,
        ], `${key}#stuck`),
        tone: 'warn',
        weight: 92,
      });
    } else if (ps && ps.phase === 'fixing') {
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 实时评测出锅，正在紧急修 bug 重交`,
          `${pLabel} 刚交上去飘了个红点，正逐行揪数组和边界问题`,
          `${pLabel} IOI 评测打回部分分，停下新题全速抢修提交`,
          `${pLabel} 评测机刚亮完红标，已经回头猛改代码了`,
        ], `${key}#fix`),
        tone: 'danger',
        weight: 90,
      });
    } else if (ps && ps.phase === 'testing' && ps.debugRounds > 0) {
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 对拍拍出 bug，第 ${ps.debugRounds} 次回去返工`,
          `${pLabel} 幸亏加了暴力对拍，第 ${ps.debugRounds} 轮跑出反例抓回来改`,
          `${pLabel} 小样本过了但对拍炸了（第 ${ps.debugRounds} 回），正瞪大眼睛查`,
          `${pLabel} 写完一测对拍又挂了，第 ${ps.debugRounds} 次回头翻代码`,
        ], `${key}#dbg${ps.debugRounds}`),
        tone: 'danger',
        weight: 88,
      });
    } else if (st.phase === 'restoring') {
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 交完正解心里发毛，补交一版暴力保底`,
          `${pLabel} 越想越觉得正解有个边界悬，趁有时间把保险暴力覆上去`,
          `${pLabel} 害怕大样例太水翻车，忍痛切回上一版稳定暴力代码`,
          `${pLabel} 正解写得有点虚，还是决定求稳锁住部分分`,
        ], `${key}#restore`),
        tone: 'warn',
        weight: 86,
      });
    } else if (ps && ps.phase === 'deciding') {
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 在犹豫要不要交，估了一下自测过的子任务`,
          `${pLabel} 对着本地测速发呆，还在掂量要不要上交`,
          `${pLabel} 再三比对完输出格式，手指已经悬在提交键上`,
          `${pLabel} 大样例压线跑过，正盘算留着检查还是立刻封存`,
        ], `${key}#decide`),
        tone: 'focus',
        weight: 62,
      });
    } else if (ps && ps.phase === 'coding' && ps.mode === 'brute') {
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 正解没思路，先把暴力分锁住`,
          `${pLabel} 先打一发爆搜加上特殊性质把基本分装进兜里`,
          `${pLabel} 决定先写稳一档部分分垫底，有时间再回来冲正解`,
          `${pLabel} 手敲暴力比正解稳得多，键盘哒哒响先抢底分`,
        ], `${key}#brute`),
        tone: 'focus',
        weight: 58,
      });
    } else if (ps && ps.phase === 'testing') {
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 在对拍，顺便看一眼时空限制`,
          `${pLabel} 挂着拍子造极限随机数据，顺手算一遍数组内存`,
          `${pLabel} 跑完大样例不放心，加了个卡满数据测 1 秒能不能过`,
          `${pLabel} 造了两组边界极端数据验证下越界与负数情况`,
        ], `${key}#test`),
        tone: 'calm',
        weight: 40,
      });
    } else if (ps && ps.phase === 'thinking' && spent > 20 * MIN) {
      const m = minutes(spent);
      out.push({
        name: st.name,
        text: pickLine([
          `${pLabel} 想了 ${m} 分钟，快到该止损换题的时候了`,
          `${pLabel} 在这题耗了 ${m} 分钟，如果还没雏形就得先做下一题`,
          `${pLabel} 推了 ${m} 分钟有点钻牛角尖，换张草稿纸试着逆向转化`,
          `${pLabel} 卡住 ${m} 分钟了，再拖下去后面大题就写不完对拍`,
        ], `${key}#think20`),
        tone: 'warn',
        weight: 66,
      });
    } else if (st.phase === 'checking') {
      out.push({
        name: st.name,
        text: pickLine(ioi ? [
          '做完了，复查代码边界并确认每题最高分提交',
          '所有可做题都交上了最高分，正再查一遍有没有漏小性质',
          '把每题提交历史最后扫一眼，确认没有掉最高分版本',
          '已经提前进入垃圾时间，顺便帮一道卡住的题再抠点部分分',
        ] : [
          '做完了，检查文件名、freopen 和多测清空',
          '在考场最后时段逐个文件夹核对 cpp 命名和字节数，防一切低级乌龙',
          '全部代码收进目录，顺手复测了一遍全套大样例',
          '收尾阶段不敢乱改核心逻辑，老老实实查了一遍多测清零与数组空间',
        ], `${key}#check`),
        tone: 'good',
        weight: 30,
      });
    }
  }

  if (remain > 0 && remain <= 15 * MIN) {
    const rushing = c.students.filter((s) => !s.finished && s.surveyLeft <= 0);
    if (rushing.length) {
      const one = rushing[(Math.floor(elapsed / MIN) + c.seed) % rushing.length];
      const remM = Math.ceil(remain / MIN);
      out.push({
        name: one.name,
        text: pickLine(ioi ? [
          `最后 ${remM} 分钟，还在抓紧改代码抢最后一波子任务分`,
          `倒计时只剩 ${remM} 分钟，盯紧评测条再抠一档特判分`,
          `最后 ${remM} 分钟，手速拉满拼最后一次提交`,
          `离收卷只有 ${remM} 分钟，全神贯注改掉一个致命边界`,
        ] : [
          `最后 ${remM} 分钟，回去抢救一版，别慌到忘写 freopen`,
          `只剩 ${remM} 分钟收卷，飞快补完特判正匆忙覆盖文件夹提交`,
          `终场倒数 ${remM} 分钟，心跳加速最后检查一次文件读写和数组范围`,
          `最后 ${remM} 分钟还在突击多测边界，全考场只剩键盘敲击声`,
        ], `${c.seed}#rush#${remM}`),
        tone: 'danger',
        weight: 96,
      });
    }
  }

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

/**
 * 纯函数推导本场至今的「全场转折大事记」：
 * 一血、榜首易主、2 小时防 AK 墙预警、疑似 AK。
 */
export function buildContestMilestones(c: Contest): ContestMilestone[] {
  const milestones: ContestMilestone[] = [];
  const ioi = c.config.format === 'ioi';
  const fullTotal = c.problems.length * 100;

  // 把每次 Submission 与对应选手 Attempt 对齐（同 (problemId, nth)）
  const firstBloodDone = new Set<number>();
  const akDone = new Set<number>();
  const curEst = new Map<number, number[]>(); // studentId -> problem scores
  const totalOf = (sid: number) => (curEst.get(sid) ?? []).reduce((a, b) => a + b, 0);

  let leaderId: number | null = null;
  let leaderScore = 0;
  let lastLeadTime = -9999;

  for (const sub of c.submissions) {
    const st = c.students.find((x) => x.id === sub.studentId);
    const ps = st?.problems[sub.problemId];
    const att = ps?.attempts.find((a) => a.nth === sub.nth);
    if (!st || !att) continue;

    let arr = curEst.get(st.id);
    if (!arr) {
      arr = new Array(c.problems.length).fill(0);
      curEst.set(st.id, arr);
    }

    const val = ioi ? att.score : att.est;
    const prevVal = arr[sub.problemId] ?? 0;
    arr[sub.problemId] = ioi ? Math.max(prevVal, val) : val;

    // 1) 全场一血：某题首次估分/得分拉满 100
    if (val >= 100 && !firstBloodDone.has(sub.problemId)) {
      firstBloodDone.add(sub.problemId);
      const pTitle = c.problems[sub.problemId]?.title ?? `P${sub.problemId + 1}`;
      milestones.push({
        time: sub.time,
        kind: 'firstBlood',
        title: `P${sub.problemId + 1} 全场一血`,
        text: `${st.name} 率先${ioi ? '拿下 AC 100' : '自估满分'} · P${sub.problemId + 1}「${pTitle}」`,
        tone: 'good',
      });
    }

    // 2) 榜首易主（10 分钟后、分数达到 60 以上且间隔至少 5 分钟才记一次）
    let topId = st.id;
    let topScore = totalOf(st.id);
    for (const [sid] of curEst) {
      const sc = totalOf(sid);
      if (sc > topScore) {
        topScore = sc;
        topId = sid;
      }
    }
    if (topScore >= 60 && sub.time >= 10 * MIN && topId !== leaderId && topScore > leaderScore) {
      if (leaderId !== null && sub.time - lastLeadTime >= 5 * MIN) {
        const who = c.students.find((x) => x.id === topId)?.name ?? st.name;
        milestones.push({
          time: sub.time,
          kind: 'leadChange',
          title: '榜首易主',
          text: `${who} 冲至${ioi ? '实时榜' : '估分榜'}第 1（${ioi ? '' : '≈'}${topScore} 分）`,
          tone: 'focus',
        });
        lastLeadTime = sub.time;
      }
      leaderId = topId;
      leaderScore = topScore;
    } else if (topId === leaderId && topScore > leaderScore) {
      leaderScore = topScore;
    }

    // 3) 疑似 AK 宣言
    const t = totalOf(st.id);
    if (fullTotal > 0 && t >= fullTotal && !akDone.has(st.id)) {
      akDone.add(st.id);
      milestones.push({
        time: sub.time,
        kind: 'ak',
        title: ioi ? '全场 AK' : '疑似 AK',
        text: `${st.name} 全卷${ioi ? '全部 AC' : '自估拉满'} ${fullTotal} 分`,
        tone: 'good',
      });
    }
  }

  // 4) 开考 2 小时后：仍无人 >= 80 分的防 AK 题预警
  if (c.timeElapsed >= 120 * MIN) {
    c.problems.forEach((p, idx) => {
      let maxVal = 0;
      for (const st of c.students) {
        const ps = st.problems[idx];
        if (!ps || !ps.attempts.length) continue;
        const eff = ioi
          ? ps.attempts.reduce((b, x) => (x.score >= b.score ? x : b), ps.attempts[0])
          : ps.attempts[ps.attempts.length - 1];
        const v = ioi ? eff.score : eff.est;
        if (v > maxVal) maxVal = v;
      }
      if (maxVal < 80) {
        milestones.push({
          time: 120 * MIN,
          kind: 'wall',
          title: `P${idx + 1} 集体卡壳`,
          text: `开考两小时无人估到 80 分，P${idx + 1}「${p.title}」成防 AK 关卡`,
          tone: 'warn',
        });
      }
    });
  }

  return milestones.sort((a, b) => b.time - a.time);
}

export const FEED_TONE: Record<FeedLine['tone'], string> = {
  calm: 'text-slate-400',
  focus: 'text-sky-300',
  warn: 'text-amber-300',
  danger: 'text-rose-300',
  good: 'text-emerald-300',
};
