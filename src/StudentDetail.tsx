/**
 * 教练模式 · 选手详情卡
 *
 * 点「队伍状态」里的某个选手展开：这段时间他的全部属性都在这儿——
 * 综合 / 疲劳 / 八个知识点 / 三个元能力，成长相关（天赋、入校、开局排名），
 * 以及本学年已打过的比赛成绩。纯展示组件，不改 state、不引新依赖。
 */
import { TOPIC_LIST, TOPIC_NAMES } from './game.ts';
import { GRADE_NAMES, overallOf } from './season.ts';
import type { SeasonStudent } from './season.ts';

const pct = (v: number) => Math.round(v * 100);
/** 0–1 能力 → 0–150 知识点 */
const kp = (v: number) => Math.round(v * 150);

/** 数值高低 -> 进度条 / 文字颜色（>=85 emerald、>=70 sky、>=50 amber、其余 rose） */
function toneOf(v: number): { bar: string; text: string } {
  if (v >= 85) return { bar: 'bg-emerald-400', text: 'text-emerald-300' };
  if (v >= 70) return { bar: 'bg-sky-400', text: 'text-sky-300' };
  if (v >= 50) return { bar: 'bg-amber-400', text: 'text-amber-300' };
  return { bar: 'bg-rose-400', text: 'text-rose-300' };
}

/** 0-1 技能里除 topics 以外的字段 */
type MiniKey = 'coding' | 'reading' | 'debug';

const MINI: { key: MiniKey; label: string }[] = [
  { key: 'coding', label: '代码' },
  { key: 'reading', label: '阅读' },
  { key: 'debug', label: '调试' },
];

const MEDAL = ['—', '金牌', '银牌', '铜牌'];

function Bar({ label, value }: { label: string; value: number }) {
  const tone = toneOf(value / 1.5);
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-[10px] text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 rounded bg-slate-700/60 overflow-hidden">
        <div className={`h-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(100, value / 1.5))}%` }} />
      </div>
      <span className={`w-6 shrink-0 text-right font-mono text-[10px] ${tone.text}`}>{value}</span>
    </div>
  );
}

export function StudentDetail({ student }: { student: SeasonStudent }) {
  const sk = student.skills;
  const overall = Math.round(overallOf(sk));
  const topicAvg = Math.round(TOPIC_LIST.reduce((a, t) => a + kp(sk.topics[t] ?? 0), 0) / TOPIC_LIST.length);
  const metaAvg = pct((sk.coding + sk.reading + sk.debug) / 3);
  const fatigue = Math.round(student.fatigue);
  const fatigueTone = fatigue > 65 ? 'text-rose-300' : fatigue > 40 ? 'text-amber-300' : 'text-emerald-300';

  const races: { label: string; text: string; tone: string }[] = [];
  if (student.csp1) {
    races.push({
      label: '初赛',
      text: `${Math.round(student.csp1.score)}${student.csp1.passed ? ' 过线' : ' 没过'}`,
      tone: student.csp1.passed ? 'text-emerald-300' : 'text-slate-500',
    });
  }
  if (student.csp2) {
    races.push({
      label: '复赛',
      text: `${Math.round(student.csp2.score)}${student.csp2.award ? ` 省${['', '一', '二', '三'][student.csp2.award]}` : ''}`,
      tone: student.csp2.award ? 'text-amber-300' : 'text-slate-400',
    });
  }
  if (student.noip) races.push({ label: 'NOIP', text: `${Math.round(student.noip.score)}${student.noip.first ? ' 省一' : ''}`, tone: 'text-amber-300' });
  if (student.wc) races.push({ label: 'WC', text: `${Math.round(student.wc.score)}${student.wc.medal ? ` ${MEDAL[student.wc.medal]}` : ''}`, tone: 'text-amber-300' });
  if (student.prov) races.push({ label: '省选', text: `折算 ${Math.round(student.prov.score)}${student.prov.raw != null ? `（原始 ${Math.round(student.prov.raw)}）` : ''} #${student.prov.rank}${student.prov.team ? ' 省队' : student.prov.first ? ' 省一' : ''}`, tone: 'text-amber-300' });
  if (student.apio) races.push({ label: 'APIO', text: `${Math.round(student.apio.score)}${student.apio.medal ? ` ${MEDAL[student.apio.medal]}` : ''}`, tone: 'text-amber-300' });
  if (student.noi) races.push({ label: 'NOI', text: `${Math.round(student.noi.score)}${student.noi.medal ? ` ${MEDAL[student.noi.medal]}` : ''}${student.noi.selected ? ' · 国集' : ''}`, tone: 'text-amber-300' });
  if (student.ctt) races.push({ label: 'CTT', text: `#${student.ctt.rank}${student.ctt.selected ? ' 进 CTS' : ''}`, tone: 'text-violet-300' });
  if (student.cts) races.push({ label: 'CTS', text: `#${student.cts.rank}${student.cts.defenseRank ? ` 答辩#${student.cts.defenseRank}` : ''}${student.cts.selected ? ' 国家队' : ''}`, tone: 'text-fuchsia-300' });
  if (student.ioi) races.push({ label: 'IOI', text: `${Math.round(student.ioi.score)}${student.ioi.medal ? ` ${MEDAL[student.ioi.medal]}` : ''}`, tone: 'text-cyan-300' });

  return (
    <div
      data-testid="student-detail-panel"
      className="mt-1.5 rounded-lg border border-white/5 bg-slate-900/60 p-2.5"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-bold text-slate-100">选手详情 · {student.name}</span>
        <span className="text-[9px] text-slate-500">再点名字收起</span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-500">
        <span>
          天赋 <span className="font-mono text-amber-300">{student.talent.toFixed(2)}</span>
        </span>
        <span className="text-slate-600">·</span>
        <span>{GRADE_NAMES[student.grade]}{student.age !== undefined ? ` · ${student.age} 岁` : ''}</span>
        <span className="text-slate-600">·</span>
        <span className={student.onTeam ? 'text-sky-300' : 'text-slate-500'}>
          {student.onTeam ? '校队' : '非校队'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        <div>
          <div className="text-lg font-black text-indigo-200">{overall}</div>
          <div className="text-[9px] text-slate-500">综合</div>
        </div>
        <div>
          <div className={`text-lg font-black ${fatigueTone}`}>{fatigue}</div>
          <div className="text-[9px] text-slate-500">疲劳</div>
        </div>
        <div>
          <div className={`text-lg font-black ${toneOf(topicAvg / 1.5).text}`}>{topicAvg}</div>
          <div className="text-[9px] text-slate-500">知识点均值 /150</div>
        </div>
        <div>
          <div className={`text-lg font-black ${toneOf(metaAvg).text}`}>{metaAvg}</div>
          <div className="text-[9px] text-slate-500">元能力均值</div>
        </div>
      </div>

      <div className="mb-1 text-[9px] text-slate-500">知识点</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {TOPIC_LIST.map((t) => (
          <Bar key={t} label={TOPIC_NAMES[t]} value={kp(sk.topics[t] ?? 0)} />
        ))}
      </div>

      <div className="mt-2 mb-1 text-[9px] text-slate-500">元能力</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1">
        {MINI.map((m) => (
          <div key={m.key} className="flex items-center justify-between text-[9px] text-slate-500">
            <span>{m.label}</span>
            <span className="font-mono text-slate-300">{pct(sk[m.key])}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5 border-t border-white/5 pt-1.5 text-[9px] text-slate-500">
        <span>入学第 <span className="font-mono text-slate-300">{student.joined}</span> 年</span>
        <span>开学综合 <span className="font-mono text-slate-300">{Math.round(student.startOverall)}</span></span>
        <span>开学排名 <span className="font-mono text-slate-300">#{student.startRank}</span></span>
        <span>作业/互测 <span className="font-mono text-slate-300">{Math.round(student.homework)}</span></span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[9px] text-slate-500">
        {races.length === 0 ? (
          <span>本赛季还没打比赛</span>
        ) : (
          races.map((r) => (
            <span key={r.label}>
              {r.label} <span className={`font-mono ${r.tone}`}>{r.text}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
