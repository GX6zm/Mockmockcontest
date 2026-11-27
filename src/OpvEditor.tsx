/**
 * OPv 版 · 开档前自定义一个人的年龄 / 属性 / 数值
 *
 * 「数据爬得太早根本无法证明我现在的实力」——那就自己填。
 * 这是一个纯编辑面板：只把配置交给 App 保存，赛季状态由 createSeason 应用。
 */
import { useState } from 'react';
import { ROSTER } from './roster.ts';
import { PROFILE_BY_NAME } from './profile.ts';
import {
  AGE_MAX, AGE_MIN, GRADE_LABELS, OPV_TOPIC_COLORS, OPV_TOPIC_LIST, OPV_TOPIC_NAMES,
  ageForGrade, gradeForAge, loadOpvDraft, opvOverall,
} from './opv.ts';
import type { OpvConfig, OpvGrade } from './opv.ts';
import type { Topic } from './types.ts';
import { Ic } from './ui.tsx';
import type { IconName } from './ui.tsx';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

const GRADES: OpvGrade[] = [1, 2, 3, 4, 5, 6];

function NumSlider({
  label, value, min, max, step = 1, color = '#f59e0b', suffix = '', hint, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  color?: string; suffix?: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-2.5 py-2" data-testid={`opv-slider-${label}`}>
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1.5">
        <span className="text-slate-300 truncate">{label}</span>
        <span className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
            className="w-14 bg-slate-900/80 border border-slate-700 rounded px-1 py-0.5 text-right font-mono text-[11px] text-white outline-none focus:border-amber-400"
          />
          <span className="text-slate-500 text-[9px] w-7">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className="w-full h-1.5 appearance-none cursor-pointer rounded bg-slate-700"
        style={{ accentColor: color }}
      />
      <div className="mt-1.5 h-1 rounded-full bg-slate-900/70 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${((value - min) / (max - min)) * 100}%`, backgroundColor: color }} />
      </div>
      {hint && <div className="text-[9px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

/** 从属性对照表里读出这个人的「原始数据」，方便在原始值上微调 */
function originalOf(name: string): Partial<OpvConfig> {
  const p = PROFILE_BY_NAME[name];
  if (!p) {
    const topics = {} as Record<Topic, number>;
    for (const t of OPV_TOPIC_LIST) topics[t] = 45;
    return { topics, coding: 45, reading: 45, debug: 45, talent: 1, grade: 1, age: 12 };
  }
  const topics = {} as Record<Topic, number>;
  for (const t of OPV_TOPIC_LIST) topics[t] = Math.round((p.topics?.[t] ?? 0.4) * 150);
  const grade = (p.grade ?? 4) as OpvGrade;
  return {
    topics,
    coding: Math.round((p.meta?.coding ?? 0.5) * 100),
    reading: Math.round((p.meta?.reading ?? 0.5) * 100),
    debug: Math.round((p.meta?.debug ?? 0.5) * 100),
    talent: p.talent ?? 1,
    grade,
    age: ageForGrade(grade),
  };
}

function preset(kind: 'god' | 'prov' | 'rookie'): Partial<OpvConfig> {
  const lv = kind === 'god' ? 150 : kind === 'prov' ? 110 : 40;
  const meta = kind === 'god' ? 100 : kind === 'prov' ? 88 : 40;
  const topics = {} as Record<Topic, number>;
  for (const t of OPV_TOPIC_LIST) topics[t] = lv;
  return {
    topics, coding: meta, reading: meta, debug: meta,
    talent: kind === 'god' ? 1.3 : kind === 'prov' ? 1.2 : 1,
    fatigue: 0,
    homework: kind === 'god' ? 100 : kind === 'prov' ? 80 : 50,
    prestige: kind === 'god' ? 100 : 50,
  };
}

/**
 * 周康阳真实战绩刻度（用户提供的 OIerDb 获奖表）。
 * 知识点是按战绩估的刻度，不是官方数值；用来给「我现在的实力」一个有据可查的标尺。
 */
const ZKY_TRACK: { label: string; age: number; grade: OpvGrade; kp: number; note: string }[] = [
  { label: '初二', age: 13, grade: 2, kp: 95, note: 'CSP2020 入门 400/400、提高 300/400 · APIO 金牌 133/300' },
  { label: '初三', age: 14, grade: 3, kp: 115, note: 'NOI2022 夏令营金牌 465/705 · WC 金牌 158/300 · CSP 提高 360/400' },
  { label: '高一', age: 15, grade: 4, kp: 135, note: 'NOI2023 金牌 669/705 · APIO 金牌 266/300 · WC 金牌 180/300 · CSP 400/400' },
  { label: '高二', age: 16, grade: 5, kp: 145, note: 'IOI2024 满分金牌 600/600 · CSP2023 提高 400/400' },
];

const ZKY_AWARDS = [
  'IOI2024 金牌 600/600 · 1/353', 'CSP2023 提高一等 400/400 · 1/19202',
  'NOI2023 金牌 669/705 · 1/279', 'APIO2023 金牌 266/300 · 1/199',
  'WC2023 金牌 180/300 · 1/671', 'NOIP2022 一等 276/400 · 73/4372',
  'CSP2022 提高一等 400/400 · 1/9216', 'NOI2022 夏令营 金牌 465/705 · 1/120',
  'APIO2022 线上 金牌 260/300 · 1/191', 'WC2022 金牌 158/300 · 88/646',
  'CSP2021 提高一等 360/400 · 43/11601', 'APIO2021 金牌 133/300 · 65/461',
  'WC2021 金牌 175/300 · 85/834', 'CSP2020 入门一等 400/400 · 1/14971',
  'CSP2020 提高一等 300/400 · 219/11048',
];

/** 按周康阳某一年的一键数值（知识点 / 元能力 / 年龄 / 年级联动） */
function zkyPreset(kp: number, age: number, grade: OpvGrade): Partial<OpvConfig> {
  const topics = {} as Record<Topic, number>;
  for (const t of OPV_TOPIC_LIST) topics[t] = kp;
  const meta = Math.min(100, Math.round(kp / 145 * 100));
  return {
    topics, coding: meta, reading: meta, debug: meta,
    talent: 1.35, fatigue: 0, homework: 100, prestige: 100, age, grade,
  };
}

export default function OpvEditor({
  onClose, onSaved,
}: {
  onClose: () => void;
  onSaved: (cfg: OpvConfig | null) => void;
}) {
  const [cfg, setCfg] = useState<OpvConfig>(() => {
    const draft = loadOpvDraft(ROSTER[0]?.name ?? '');
    // 第一次打开：以此人的原始属性为底稿，方便在「现在爬到的数据」上微调
    return draft.enabled ? draft : { ...draft, enabled: true, ...originalOf(draft.name) };
  });
  const patch = (p: Partial<OpvConfig>) => setCfg((c) => ({ ...c, ...p }));
  const setTopic = (t: Topic, v: number) => setCfg((c) => ({ ...c, topics: { ...c.topics, [t]: v } }));
  const overall = opvOverall(cfg);

  const save = () => {
    let name = cfg.name.trim() || '我（现在）';
    if (cfg.mode === 'create' && ROSTER.some((r) => r.name === name)) name = `${name}·OP`;
    name = name.slice(0, 24);
    onSaved({ ...cfg, name, enabled: true });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-3 sm:p-6" data-testid="opv-editor">
      <div className="max-w-4xl mx-auto rounded-2xl border border-amber-500/30 bg-[#0d1116] shadow-2xl">
        {/* 标题 */}
        <div className="sticky top-0 z-10 flex items-start gap-3 px-5 py-4 border-b border-white/10 bg-[#0d1118]">
          <div className="ui-editor-mark"><Ic n="zap" size={24} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-black text-white">自定义开局 · 设定一名选手的初始数值</h2>
              <span className="text-[11px] px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/15 text-amber-300 font-bold">OP</span>
            </div>
            <p className="text-[12px] text-slate-400 mt-1">
              「数据爬得太早，根本无法证明我现在的实力」——可改写名单里任意一人或新加一位选手；不启用时默认按原始校队数据开档。
            </p>
          </div>
          <button onClick={onClose} className="ui-btn-ghost px-2 py-1 text-slate-300" title="关闭"><Ic n="x" size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* ① 选人 */}
          <section data-testid="opv-target">
            <SectionTitle n="①" title="选一个人" note="改写名单里的自己，或者直接新加一个人进校队" />
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {(['override', 'create'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => patch({ mode: m })}
                  className={`px-3 py-1.5 rounded-lg text-[11px] border transition-all ${
                    cfg.mode === m ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 font-bold' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-amber-400/40'
                  }`}
                >
                  {m === 'override' ? <><Ic n="pen" /> 改写名单里的人</> : <><Ic n="sparkles" /> 新加一个人</>}
                </button>
              ))}
            </div>
            {cfg.mode === 'override' ? (
              <select
                value={cfg.name}
                onChange={(e) => patch({ name: e.target.value, ...originalOf(e.target.value) })}
                data-testid="opv-name-select"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-amber-400"
              >
                {ROSTER.map((r, i) => <option key={r.name} value={r.name}>{i + 1}. {r.name}</option>)}
              </select>
            ) : (
              <input
                value={cfg.name}
                onChange={(e) => patch({ name: e.target.value })}
                data-testid="opv-name-input"
                placeholder="给自己起个名字，比如：现在的我"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-amber-400"
              />
            )}
            <div className="text-[10px] text-slate-500 mt-1.5">
              名单共 {ROSTER.length} 人。切换人选会自动载入 TA 的原始属性；自定义新人若与原名单重名，会自动加「·OP」后缀。
            </div>
          </section>

          {/* ② 年龄 / 年级 */}
          <section data-testid="opv-age">
            <SectionTitle n="②" title="年龄 / 年级" note="年级才是资格链的硬门槛" />
            <div className="grid sm:grid-cols-2 gap-3">
              <NumSlider
                label="年龄" value={cfg.age} min={AGE_MIN} max={AGE_MAX} suffix="岁" color="#38bdf8"
                hint="展示用；改年龄会同步推荐年级，也可以单独改年级"
                onChange={(age) => patch({ age, grade: gradeForAge(age) })}
              />
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-2.5 py-2">
                <div className="text-[11px] text-slate-300 mb-1.5">年级</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      onClick={() => patch({ grade: g, age: ageForGrade(g) })}
                      className={`py-1.5 rounded-lg text-[11px] border transition-all ${
                        cfg.grade === g ? 'bg-sky-500/20 border-sky-400/60 text-sky-200 font-bold' : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-sky-400/40'
                      }`}
                    >
                      {GRADE_LABELS[g]}
                    </button>
                  ))}
                </div>
                <div className="text-[9px] text-slate-500 mt-1.5">
                  NOIP 起正式名额只给高中生（高一及以上）；高三打完这一学年就毕业。
                </div>
              </div>
            </div>
          </section>

          {/* ③ 知识点 */}
          <section data-testid="opv-topics">
            <SectionTitle n="③" title="八个知识点 · 0–150" note="120 以上进超频区：赛场能力继续涨（150 = 135 能力点），才压得过黑题；120 以下与原版完全一致" />
            <div className="grid sm:grid-cols-2 gap-2">
              {OPV_TOPIC_LIST.map((t) => (
                <NumSlider
                  key={t} label={OPV_TOPIC_NAMES[t]} value={cfg.topics[t]} min={0} max={150}
                  color={OPV_TOPIC_COLORS[t]} suffix="/150" onChange={(v) => setTopic(t, v)}
                />
              ))}
            </div>
          </section>

          {/* ④ 元能力 */}
          <section data-testid="opv-meta">
            <SectionTitle n="④" title="元能力 · 0–100" note="影响读题、编码、对拍和写挂概率" />
            <div className="grid sm:grid-cols-3 gap-2">
              <NumSlider label="代码" value={cfg.coding} min={0} max={100} color="#a78bfa" onChange={(v) => patch({ coding: v })} />
              <NumSlider label="阅读" value={cfg.reading} min={0} max={100} color="#34d399" onChange={(v) => patch({ reading: v })} />
              <NumSlider label="调试" value={cfg.debug} min={0} max={100} color="#fb7185" onChange={(v) => patch({ debug: v })} />
            </div>
          </section>

          {/* ⑤ 其他数值 */}
          <section data-testid="opv-numbers">
            <SectionTitle n="⑤" title="其他数值" note="天赋只加快训练成长（3.0 = 三倍速），当场得分看知识点和元能力" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <NumSlider label="天赋" value={cfg.talent} min={0.5} max={3} step={0.05} color="#fbbf24" suffix="×" onChange={(v) => patch({ talent: v })} />
              <NumSlider label="疲劳" value={cfg.fatigue} min={0} max={100} color="#f87171" suffix="/100" onChange={(v) => patch({ fatigue: v })} />
              <NumSlider label="作业/互测" value={cfg.homework} min={0} max={100} color="#60a5fa" suffix="/100" onChange={(v) => patch({ homework: v })} />
              <NumSlider label="学校声望" value={cfg.prestige} min={0} max={100} color="#c084fc" suffix="/100" onChange={(v) => patch({ prestige: v })} />
            </div>
          </section>

          {/* 预设 + 实时预览 */}
          <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3" data-testid="opv-presets">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[11px] text-amber-200 font-bold mr-1">一键预设</span>
              <PresetButton label="我其实是神" icon="flame" onClick={() => patch(preset('god'))} />
              <PresetButton label="省一水平" icon="target" onClick={() => patch(preset('prov'))} />
              <PresetButton label="刚入门" icon="sprout" onClick={() => patch(preset('rookie'))} />
              <PresetButton label="读回原始数值" icon="file" onClick={() => patch(originalOf(cfg.name))} />
              <PresetButton label="周康阳 · IOI AKer" icon="award" onClick={() => patch(zkyPreset(145, 16, 5))} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <div className="text-slate-400">
                综合 <b className="font-mono text-amber-300 text-base" data-testid="opv-overall">{overall.toFixed(1)}</b>
                <span className="text-slate-500 ml-1">（常规口径 0–100；校内顶尖约 84，145 知识点 ≈ 121，全满 150 ≈ 128，超频会破百）</span>
              </div>
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input type="checkbox" checked={cfg.autoTeam} onChange={(e) => patch({ autoTeam: e.target.checked })} className="accent-amber-500" />
                开档时自动把 TA 勾进主力
              </label>
              <span className="text-[10px] text-slate-500">不想要了就点左下「恢复原始数据」</span>
            </div>
            <div className="mt-2.5 pt-2 border-t border-amber-500/20" data-testid="opv-zky-track">
              <div className="text-[10px] text-amber-200/90 font-bold mb-1.5">
                <Ic n="trendUp" /> 周康阳成长轨迹 · 按年龄一键套用（初二 → 高二，四年从入门打到 IOI 满分）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ZKY_TRACK.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => patch(zkyPreset(t.kp, t.age, t.grade))}
                    title={t.note}
                    className="px-2.5 py-1.5 rounded-lg border border-sky-500/25 bg-slate-900/50 text-[11px] text-sky-200/90 hover:bg-sky-500/15 hover:border-sky-400/50"
                  >
                    {t.label} · {t.kp} 知识点
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-slate-500 mt-1.5">
                知识点是按真实战绩估的刻度，不是官方数值；天赋统一 1.35 ≈ 他四年（初二→高二）的进步速度，
                想更快就把天赋拉到 3.0；年龄与年级联动，之后照常升学 / 毕业。
                预设只改数值，名字和「改写 / 新加」在 ① 里定。
              </div>
            </div>
            <details className="mt-2 text-[10px] text-slate-400">
              <summary className="cursor-pointer text-amber-200/80 hover:text-amber-200"><Ic n="award" /> 实力标尺：周康阳真实获奖表（点开看）</summary>
              <div className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[9px] text-slate-500">
                {ZKY_AWARDS.map((a) => <span key={a}>· {a}</span>)}
              </div>
              <div className="mt-1.5 text-[9px] text-slate-500">
                浙江 · 杭州学军中学教育集团文渊中学。这些满分和名次是这轮天花板校准的锚点：
                全满选手现在能稳定打到 CSP 400/400、NOI ≈ 700/700、IOI ≈ 590/600、WC ≈ 290/300。
              </div>
            </details>
          </section>

          <div className="text-[11px] leading-relaxed text-slate-400">
            这份设置保存在本机浏览器里，仅在启用后于「新的一届」开档时写入，之后照常训练成长、升级、毕业；点左下「恢复原始数据」可随时关闭。
            120 知识点以下沿用常规口径，120–150 平滑进入超频区（最高 1.35 赛场能力），名单里其余选手不受影响。
          </div>
        </div>

        {/* 底部操作 */}
        <div className="sticky bottom-0 flex flex-wrap gap-2 px-5 py-3 border-t border-white/10 bg-[#0d1118]">
          <button
            onClick={() => onSaved(null)}
            className="ui-btn-ghost px-3 py-2 text-[11px] text-slate-300 hover:border-rose-400/50 hover:text-rose-300"
            data-testid="opv-reset"
          >
            <Ic n="rotateCcw" /> 恢复原始数据（关掉自定义）
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="ui-btn-ghost px-4 py-2 text-[12px]">
            取消
          </button>
          <button
            onClick={save}
            data-testid="opv-save"
            className="ui-btn-primary px-5 py-2 text-[12px]"
          >
            <Ic n="save" /> 保存设置（开新的一届生效）
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <h3 className="text-[13px] font-bold text-white"><span className="text-amber-400 mr-1">{n}</span>{title}</h3>
      <span className="text-[10px] text-slate-500">{note}</span>
    </div>
  );
}

function PresetButton({ label, icon, onClick }: { label: string; icon?: IconName; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-2.5 py-1.5 rounded-lg border border-amber-500/25 bg-slate-900/50 text-[11px] text-amber-200/90 hover:bg-amber-500/15 hover:border-amber-400/50">
      {icon && <Ic n={icon} />}{' '}{label}
    </button>
  );
}
