/**
 * 教练模式 · 选手详情卡（含纯 SVG 八维知识点雷达图）
 *
 * 零外部依赖、静帧模式 100% 兼容。
 */
import { TOPIC_COLORS, TOPIC_LIST, TOPIC_NAMES } from './game.ts';
import { kpFromAbility } from './opv.ts';
import { GRADE_NAMES, overallOf } from './season.ts';
import type { SeasonStudent, StudentArchive } from './season.ts';
import { TRAITS } from './traits.ts';
import type { Topic } from './types.ts';

const pct = (v: number) => Math.round(v * 100);
/** 0–1（或超频）能力 → 0–150 知识点 */
const kp = (v: number) => kpFromAbility(v);

function toneOf(v: number): { bar: string; text: string } {
  if (v >= 85) return { bar: 'bg-emerald-400', text: 'text-emerald-300' };
  if (v >= 70) return { bar: 'bg-sky-400', text: 'text-sky-300' };
  if (v >= 50) return { bar: 'bg-amber-400', text: 'text-amber-300' };
  return { bar: 'bg-rose-400', text: 'text-rose-300' };
}

type MiniKey = 'coding' | 'reading' | 'debug';

const MINI: { key: MiniKey; label: string }[] = [
  { key: 'coding', label: '代码' },
  { key: 'reading', label: '阅读' },
  { key: 'debug', label: '调试' },
];

const SHORT_TOPIC: Record<Topic, string> = {
  math: '数学',
  dp: 'DP',
  graph: '图论',
  greedy: '贪心',
  ds: '数据',
  impl: '模拟',
  string: '字符',
  geometry: '几何',
};

const MEDAL = ['—', '金牌', '银牌', '铜牌'];

function TopicRadar({ topics }: { topics: Record<Topic, number> }) {
  const cx = 92;
  const cy = 92;
  const maxR = 58;
  const n = TOPIC_LIST.length;

  const point = (idx: number, frac: number): [number, number] => {
    const a = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
    const r = maxR * frac;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  const polyStr = (frac: number) =>
    TOPIC_LIST.map((_, i) => point(i, frac).map((v) => v.toFixed(1)).join(',')).join(' ');

  const dataPts = TOPIC_LIST.map((t, i) => {
    const val = Math.max(0, Math.min(150, kp(topics[t] ?? 0)));
    return { t, val, pos: point(i, val / 150) };
  });
  const dataPoly = dataPts.map((d) => d.pos.map((v) => v.toFixed(1)).join(',')).join(' ');

  return (
    <svg
      viewBox="0 0 184 184"
      className="w-[152px] h-[152px] shrink-0 mx-auto"
      role="img"
      aria-label="八维知识点雷达图"
    >
      {/* 同心参考网：50 / 100 / 150 */}
      {[1 / 3, 2 / 3, 1].map((f) => (
        <polygon
          key={f}
          points={polyStr(f)}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1"
        />
      ))}
      {/* 120 知识点（超频线）虚线参考圈 */}
      <polygon
        points={polyStr(120 / 150)}
        fill="none"
        stroke="rgba(234,180,84,0.35)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      {/* 8 条轴线 + 顶点标签 */}
      {TOPIC_LIST.map((t, i) => {
        const [ex, ey] = point(i, 1);
        const [lx, ly] = point(i, 1.32);
        return (
          <g key={t}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#bfc9d8"
              fontSize="10"
            >
              {SHORT_TOPIC[t]}
            </text>
          </g>
        );
      })}
      {/* 选手能力多边形 */}
      <polygon
        points={dataPoly}
        fill="var(--mood-accent-soft)"
        stroke="var(--mood-accent)"
        strokeWidth="1.6"
      />
      {dataPts.map((d) => (
        <circle
          key={d.t}
          cx={d.pos[0]}
          cy={d.pos[1]}
          r="2.4"
          fill={TOPIC_COLORS[d.t]}
        />
      ))}
    </svg>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const tone = toneOf(value / 1.5);
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] text-slate-300">{label}</span>
      <div className="h-1.5 flex-1 bg-slate-800 overflow-hidden">
        <div className={`h-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(100, value / 1.5))}%` }} />
      </div>
      <span className={`w-7 shrink-0 text-right font-mono text-[11px] ${tone.text}`}>{value}</span>
    </div>
  );
}

export function StudentDetail({ student, archive }: { student: SeasonStudent; archive?: StudentArchive }) {
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
      text: `${student.csp1.score}${student.csp1.passed ? ' 过线' : ' 没过'}`,
      tone: student.csp1.passed ? 'text-emerald-300' : 'text-slate-400',
    });
  }
  if (student.csp2) {
    races.push({
      label: '复赛',
      text: `${Math.round(student.csp2.score)}${student.csp2.award ? ` 省${['', '一', '二', '三'][student.csp2.award]}` : ''}`,
      tone: student.csp2.award ? 'text-amber-300' : 'text-slate-300',
    });
  }
  if (student.noip) races.push({ label: 'NOIP', text: `${Math.round(student.noip.score)}${student.noip.first ? ' 省一' : ''}`, tone: 'text-amber-300' });
  if (student.wc) races.push({ label: 'WC', text: `${Math.round(student.wc.score)}${student.wc.medal ? ` ${MEDAL[student.wc.medal]}` : ''}`, tone: 'text-amber-300' });
  if (student.prov) races.push({ label: '省选', text: `折算 ${Math.round(student.prov.score)}${student.prov.raw != null ? `（原始 ${Math.round(student.prov.raw)}）` : ''} #${student.prov.rank}${student.prov.team ? ` 省队${student.prov.category ? `·${student.prov.category}类` : ''}` : student.prov.first ? ' 省一' : ''}`, tone: 'text-amber-300' });
  if (student.apio) races.push({ label: 'APIO', text: `${Math.round(student.apio.score)}${student.apio.medal ? ` ${MEDAL[student.apio.medal]}` : ''}`, tone: 'text-amber-300' });
  if (student.noi) races.push({ label: 'NOI', text: `${Math.round(student.noi.score)}${student.noi.medal ? ` ${MEDAL[student.noi.medal]}` : ''}${student.noi.selected ? ' · 国集' : ''}`, tone: 'text-amber-300' });
  if (student.ctt) races.push({ label: 'CTT', text: `#${student.ctt.rank}${student.ctt.selected ? ' 进 CTS' : ''}`, tone: 'text-violet-300' });
  if (student.cts) races.push({ label: 'CTS', text: `#${student.cts.rank}${student.cts.defenseRank ? ` 答辩#${student.cts.defenseRank}` : ''}${student.cts.selected ? ' 国家队' : ''}`, tone: 'text-fuchsia-300' });
  if (student.ioi) races.push({ label: 'IOI', text: `${Math.round(student.ioi.score)}${student.ioi.medal ? ` ${MEDAL[student.ioi.medal]}` : ''}`, tone: 'text-cyan-300' });

  return (
    <div
      data-testid="student-detail-panel"
      className="mt-1.5 border border-white/10 bg-[#0b0f17] p-3"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] font-bold text-slate-100">选手详情 · {student.name}</span>
        <span className="text-[10.5px] text-slate-400">再点名字收起</span>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
        <span>
          天赋 <span className="font-mono text-amber-300 font-bold">{student.talent.toFixed(2)}×</span>
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-300">{GRADE_NAMES[student.grade]}{student.age !== undefined ? ` · ${student.age} 岁` : ''}</span>
        <span className="text-slate-600">·</span>
        <span className={student.onTeam ? 'text-sky-300' : student.onReserve ? 'text-amber-300' : 'text-slate-400'}>
          {student.onTeam ? '主力' : student.onReserve ? '梯队' : '未编入'}
        </span>
        {student.cttEligible && (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-fuchsia-300">国集资格（本学年 CTT）</span>
          </>
        )}
      </div>

      {student.traitsRevealed === false ? (
        <div className="mb-2.5 text-[10.5px] px-2 py-1 border border-dashed border-white/15 bg-white/[0.02] text-slate-400" data-testid="student-traits-mystery">
          特性词条：潜力未探明（再打 {Math.max(1, 3 - (student.contestsPlayed ?? 0))} 场比赛或第 6 周后揭晓）
        </div>
      ) : (student.traits?.length ?? 0) > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5" data-testid="student-traits">
          {student.traits!.map((tid) => {
            const tr = TRAITS[tid];
            if (!tr) return null;
            const toneCls = tr.tone === 'emerald'
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
              : tr.tone === 'amber'
                ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                : tr.tone === 'violet'
                  ? 'border-violet-500/35 bg-violet-500/10 text-violet-200'
                  : tr.tone === 'rose'
                    ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                    : 'border-sky-500/35 bg-sky-500/10 text-sky-200';
            return (
              <span
                key={tid}
                title={tr.note}
                className={`text-[10.5px] px-2 py-0.5 border ${toneCls}`}
              >
                {tr.name} · <span className="opacity-80">{tr.note}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <div className="text-lg font-black text-white font-mono">{overall}</div>
          <div className="text-[10.5px] text-slate-400">综合</div>
        </div>
        <div>
          <div className={`text-lg font-black font-mono ${fatigueTone}`}>{fatigue}</div>
          <div className="text-[10.5px] text-slate-400">疲劳</div>
        </div>
        <div>
          <div className={`text-lg font-black font-mono ${toneOf(topicAvg / 1.5).text}`}>{topicAvg}</div>
          <div className="text-[10.5px] text-slate-400">知识点 /150</div>
        </div>
        <div>
          <div className={`text-lg font-black font-mono ${toneOf(metaAvg).text}`}>{metaAvg}</div>
          <div className="text-[10.5px] text-slate-400">元能力</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3 mb-2.5">
        <TopicRadar topics={sk.topics} />
        <div className="flex-1 w-full space-y-1">
          <div className="text-[10.5px] text-slate-400 mb-1">八维知识点（虚线 = 120 超频线）</div>
          {TOPIC_LIST.map((t) => (
            <Bar key={t} label={TOPIC_NAMES[t]} value={kp(sk.topics[t] ?? 0)} />
          ))}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-white/[0.08] grid grid-cols-3 gap-x-3 gap-y-1">
        {MINI.map((m) => (
          <div key={m.key} className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{m.label}</span>
            <span className="font-mono text-slate-200 font-bold">{pct(sk[m.key])}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-white/[0.08] pt-2 text-[11px] text-slate-400">
        <span>入学第 <span className="font-mono text-slate-200">{student.joined}</span> 年</span>
        <span>开学综合 <span className="font-mono text-slate-200">{Math.round(student.startOverall)}</span></span>
        <span>开学排名 <span className="font-mono text-slate-200">#{student.startRank}</span></span>
        <span>作业/互测 <span className="font-mono text-slate-200">{Math.round(student.homework)}</span></span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
        {races.length === 0 ? (
          <span>本赛季还没打正赛</span>
        ) : (
          races.map((r) => (
            <span key={r.label}>
              {r.label} <span className={`font-mono ${r.tone}`}>{r.text}</span>
            </span>
          ))
        )}
      </div>

      {archive && (archive.honors.length > 0 || archive.destination) && (
        <div className="mt-2 pt-2 border-t border-white/[0.08] space-y-1.5" data-testid="student-archive">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[10.5px] text-slate-400">
            <span>跨学年档案 · 峰值综合 <b className="font-mono text-slate-200">{archive.peakOverall.toFixed(1)}</b></span>
            <span>
              省一 {archive.provFirsts} · 省队 {archive.provTeams} · NOI 牌 {archive.noiGold + archive.noiSilver + archive.noiBronze}
              {archive.ioiMedals > 0 ? ` · IOI 牌 ${archive.ioiMedals}` : ''}
            </span>
          </div>
          {archive.honors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {archive.honors.slice(-10).map((h, i) => (
                <span
                  key={`${h.year}-${h.stageId}-${i}`}
                  className="text-[10px] px-1.5 py-0.5 border border-white/10 bg-white/[0.03] text-slate-300"
                  title={`第 ${h.year} 学年（${GRADE_NAMES[h.grade]}）· 得分 ${h.score} · 排名 #${h.rank}`}
                >
                  Y{h.year} {h.stageShort} · {h.award}
                </span>
              ))}
            </div>
          )}
          {archive.worstDrop && (
            <div className="text-[10.5px] text-rose-300/90">
              生涯最痛挂分：Y{archive.worstDrop.year} {archive.worstDrop.stageShort} P{archive.worstDrop.problemId + 1}（{archive.worstDrop.delta} · {archive.worstDrop.reason}）
            </div>
          )}
        </div>
      )}
    </div>
  );
}
