/**
 * 一次性 UI 换肤 codemod（文件名 _ 开头，被 .gitignore 忽略）。
 *
 * 1) 把每个界面的 emoji 换成 <Ic n="..." />（Lucide）或纯文本；
 * 2) 数据文案（语录 / 彩蛋）里的 emoji 直接清掉；
 * 3) 去掉 backdrop-blur / animate-pulse，改用设计层的 .ui-live / .ui-judge；
 * 4) 硬编码的深蓝底与状态色换成 SIGNAL 色板；
 * 5) 兜底扫描：任何残留的表情符号都会被删除并打印出来。
 *
 * 全部是字面量 split/join 替换，每条都断言命中次数，改错就报错退出。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

function apply(file, pairs) {
  const path = join(SRC, file);
  let s = readFileSync(path, 'utf8');
  pairs.forEach(([oldText, newText, expected = 1], i) => {
    const parts = s.split(oldText);
    const hits = parts.length - 1;
    const ok = expected === -1 ? hits >= 1 : hits === expected;
    if (!ok) {
      throw new Error(
        `${file} #${i}: 期望命中 ${expected === -1 ? '>=1' : expected} 次，实际 ${hits} 次\n` +
        `片段: ${JSON.stringify(oldText.slice(0, 120))}`,
      );
    }
    s = parts.join(newText);
  });
  writeFileSync(path, s, 'utf8');
  console.log(`  ${file}: ${pairs.length} 组替换完成`);
  return s;
}

// ---------------------------------------------------------------------------
// App.tsx
// ---------------------------------------------------------------------------
const MASTHEAD_CODE = `

// ===== SIGNAL 报头 / 页脚 =====
function Masthead({ isOpv }: { isOpv: boolean }) {
  return (
    <header className="ui-masthead" aria-label="OI 模拟赛">
      <div className="ui-masthead-top ui-stagger">
        <span className="ui-kicker">01 / Configure</span>
        <span className="ui-kicker ui-kicker-right">No Realtime Judge — Estimate Only</span>
        <span className="ui-kicker ui-kicker-right"><Ic n="circleDot" size={11} /> Signal Stable</span>
      </div>
      <div className="ui-masthead-body ui-stagger">
        <div className="ui-display ui-display-xl">OI</div>
        <div className="ui-display ui-display-xl ui-outline">模拟赛</div>
        <div className="ui-masthead-meta">
          <span className="ui-kicker">校赛 / 单机 / 本地存档</span>
          <span className="ui-masthead-lede">无实时评测 · 上帝视角估分 · 赛后统一出分</span>
          {isOpv && <span className="ui-masthead-flag"><Ic n="zap" /> OPv 自定义开局</span>}
        </div>
      </div>
      <div className="ui-masthead-rule" />
      <div className="ui-masthead-foot ui-stagger">
        <span className="ui-kicker">Submit ≠ Score</span>
        <span className="ui-kicker">One Final Reveal</span>
        <span className="ui-kicker">Seed-Reproducible</span>
      </div>
      <div className="ui-masthead-rail" aria-hidden="true">EST. 2026 · OI SIM / 001</div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="ui-footer">
      <span className="ui-kicker">OI 模拟赛 · 本地运行 / 无需联网</span>
      <span className="ui-kicker">名单与初始 rating 取自校 OJ 排行榜 · 成长数据只存在本机浏览器</span>
    </footer>
  );
}
`;

apply('App.tsx', [
  ["import type { Contest, ContestConfig, StudentResult } from './types.ts';",
    "import type { Contest, ContestConfig, StudentResult } from './types.ts';\nimport { Ic, motionFull, plainText } from './ui.tsx';"],
  ['`⚡ 已设置：', '`已设置：'],
  ['⚡ OPv 自定义开局', '<Ic n="zap" /> OPv 自定义开局'],
  ['🎲', '<Ic n="dices" size={16} />'],
  ['🚀 开始比赛', '<Ic n="rocket" /> 开始比赛'],
  ['🎓 教练模式：带一队打多年（真实赛历）', '<Ic n="graduation" /> 教练模式：带一队打多年（真实赛历）'],
  ['⚡ OP 开局：开档前自定义一个人的年龄 / 属性 / 数值', '<Ic n="zap" /> OP 开局：开档前自定义一个人的年龄 / 属性 / 数值'],
  ['📜 赛制', '<Ic n="scroll" /> 赛制'],
  ['👁 你会看到什么', '<Ic n="eye" /> 你会看到什么'],
  ['🧠 选手会做什么', '<Ic n="brain" /> 选手会做什么'],
  ['⚡ <b>OPv 版</b>：', '<Ic n="zap" /> <b>OPv 版</b>：'],
  ["        confetti({ particleCount: 140, spread: 90, origin: { y: 0.35 }, colors: ['#6366f1', '#22d3ee', '#fbbf24', '#f472b6'] });",
    "        if (motionFull()) confetti({ particleCount: 70, spread: 70, origin: { y: 0.35 }, colors: ['#c8f135', '#4ad9e3', '#ffc24d', '#ff6f72'] });"],
  ['<div className="text-4xl animate-pulse">⚙️</div>', '<div className="ui-judge"><Ic n="cpu" size={42} /></div>'],
  ["<div className=\"h-full bg-indigo-500 animate-pulse\" style={{ width: '65%' }} />",
    "<div className=\"h-full bg-indigo-500 ui-judge-fill\" style={{ width: '65%' }} />"],
  ['<div className="text-3xl mb-1">📋</div>', '<div className="ui-stage-icon"><Ic n="clipboard" size={30} /></div>'],
  ['🔓 公布真实成绩', '<Ic n="unlock" /> 公布真实成绩'],
  ['⏭ 直接看最终排名（跳过逐条揭晓）', '<Ic n="skipForward" /> 直接看最终排名（跳过逐条揭晓）'],
  ['<div className="text-3xl mb-1">🏆</div>', '<div className="ui-stage-icon"><Ic n="trophy" size={30} /></div>'],
  ["{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}",
    '{r.rank <= 3 ? <span className="ui-rank" data-r={r.rank}>{r.rank}</span> : r.rank}'],
  ["{p.real >= 100 ? '✓' : p.real}", '{p.real >= 100 ? <Ic n="check" size={11} /> : p.real}'],
  ['<span className="text-emerald-400">↑{r.rankDelta}</span>',
    '<span className="text-emerald-400"><Ic n="arrowUp" size={11} />{r.rankDelta}</span>'],
  ['<span className="text-rose-400">↓{-r.rankDelta}</span>',
    '<span className="text-rose-400"><Ic n="arrowDown" size={11} />{-r.rankDelta}</span>'],
  ['📉 挂分最惨', '<Ic n="trendDown" /> 挂分最惨'],
  ['📈 反挂榜', '<Ic n="trendUp" /> 反挂榜'],
  ['🎯 估分校准榜', '<Ic n="target" /> 估分校准榜'],
  ['🏅 成长榜', '<Ic n="award" /> 成长榜'],
  ['🎭 今日语录', '<Ic n="drama" /> 今日语录'],
  ['📝 战报', '<Ic n="fileText" /> 战报'],
  ['{easter.banner.text}', '{plainText(easter.banner.text)}'],
  ['{quote.text}', '{plainText(quote.text)}'],
  ['🔄 同配置再来一局', '<Ic n="refresh" /> 同配置再来一局'],
  ['⚙️ 换个配置', '<Ic n="settings" /> 换个配置'],
  ['<div className="min-h-screen bg-[#0b0f19] text-slate-200 flex items-center justify-center p-4">',
    '<div className="min-h-screen text-slate-200 px-4 py-7 md:px-8">'],
  ['<div className="w-full max-w-4xl grid lg:grid-cols-[1.15fr_0.85fr] gap-4">',
    '<Masthead isOpv={isOpv} />\n      <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-[1.15fr_0.85fr] gap-4 ui-stagger">'],
  ['      </div>\n    </div>\n  );\n}\n\nfunction Slider({',
    '      </div>\n      <SiteFooter />\n    </div>\n  );\n}\n\nfunction Slider({'],
]);
{
  const p = join(SRC, 'App.tsx');
  writeFileSync(p, readFileSync(p, 'utf8') + MASTHEAD_CODE, 'utf8');
  console.log('  App.tsx: Masthead / SiteFooter 组件已追加');
}

// ---------------------------------------------------------------------------
// OpvEditor.tsx
// ---------------------------------------------------------------------------
apply('OpvEditor.tsx', [
  ["import type { Topic } from './types.ts';",
    "import type { Topic } from './types.ts';\nimport { Ic } from './ui.tsx';\nimport type { IconName } from './ui.tsx';"],
  ['🥇 ', '金牌 ', -1],
  ['bg-black/75 backdrop-blur-sm', 'bg-black/85'],
  ['bg-[#111827]/95 backdrop-blur', 'bg-[#0d1116]', 2],
  ['<div className="text-2xl">⚡</div>', '<div className="ui-editor-mark"><Ic n="zap" size={24} /></div>'],
  ['title="关闭">✕</button>', 'title="关闭"><Ic n="x" size={16} /></button>'],
  ["{m === 'override' ? '✏️ 改写名单里的人' : '✨ 新加一个人'}",
    "{m === 'override' ? <><Ic n=\"pen\" /> 改写名单里的人</> : <><Ic n=\"sparkles\" /> 新加一个人</>}"],
  ["<PresetButton label=\"🔥 我其实是神\" onClick={() => patch(preset('god'))} />",
    "<PresetButton label=\"我其实是神\" icon=\"flame\" onClick={() => patch(preset('god'))} />"],
  ['label="🎯 省一水平"', 'label="省一水平" icon="target"'],
  ['label="🌱 刚入门"', 'label="刚入门" icon="sprout"'],
  ['label="📄 读回原始数值"', 'label="读回原始数值" icon="file"'],
  ['label="🏅 周康阳 · IOI AKer"', 'label="周康阳 · IOI AKer" icon="award"'],
  ['📈 周康阳成长轨迹', '<Ic n="trendUp" /> 周康阳成长轨迹'],
  ['🏅 实力标尺：周康阳真实获奖表（点开看）', '<Ic n="award" /> 实力标尺：周康阳真实获奖表（点开看）'],
  ['🧊 恢复原始数据（关掉 OP）', '<Ic n="rotateCcw" /> 恢复原始数据（关掉 OP）'],
  ['💾 保存设置（开新的一届生效）', '<Ic n="save" /> 保存设置（开新的一届生效）'],
  ['function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {',
    'function PresetButton({ label, icon, onClick }: { label: string; icon?: IconName; onClick: () => void }) {'],
  ['      {label}\n    </button>', "      {icon && <Ic n={icon} />}{' '}{label}\n    </button>"],
]);

// ---------------------------------------------------------------------------
// ContestScreen.tsx
// ---------------------------------------------------------------------------
apply('ContestScreen.tsx', [
  ["import type { Contest, Problem, Student } from './types.ts';",
    "import type { Contest, Problem, Student } from './types.ts';\nimport { Ic } from './ui.tsx';"],
  ["'bg-emerald-400 animate-pulse'", "'bg-emerald-400 ui-live'"],
  ["{paused ? '▶ 继续' : '⏸ 暂停'}",
    "{paused ? <><Ic n=\"play\" /> 继续</> : <><Ic n=\"pause\" /> 暂停</>}"],
  ['⏩ +10 分', '<Ic n="fastForward" /> +10 分'],
  ['⏭ 到收卷', '<Ic n="skipForward" /> 到收卷'],
  ['⚠️ 赛中没有任何评测结果。', '<Ic n="alert" /> 赛中没有任何评测结果。'],
  ['📋 题目', '<Ic n="clipboard" /> 题目'],
  ['📊 统计', '<Ic n="chart" /> 统计'],
  ['🎙 赛场实况', '<Ic n="mic" /> 赛场实况'],
  ['📡 提交动态', '<Ic n="radio" /> 提交动态'],
  ["{st.totalSubmissions === 0 ? '—' : rank > 3 ? rank : rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}",
    "{st.totalSubmissions === 0 ? '—' : rank <= 3 && rank > 0 ? <span className=\"ui-rank\" data-r={rank}>{rank}</span> : rank}"],
]);

// ---------------------------------------------------------------------------
// CoachScreen.tsx
// ---------------------------------------------------------------------------
apply('CoachScreen.tsx', [
  ["import type { Topic } from './types.ts';",
    "import type { Topic } from './types.ts';\nimport { Ic, plainText } from './ui.tsx';\nimport type { IconName } from './ui.tsx';"],
  ['Record<SquadFocus, { name: string; note: string; emoji: string }>',
    'Record<SquadFocus, { name: string; note: string; icon: IconName }>'],
  ["emoji: '🎯'", "icon: 'target'"],
  ["emoji: '⚖️'", "icon: 'scale'"],
  ["emoji: '🌱'", "icon: 'sprout'"],
  ["Record<TrainingLine['tone'], { text: string; ring: string; emoji: string }>",
    "Record<TrainingLine['tone'], { text: string; ring: string; icon: IconName }>"],
  ["emoji: '📈'", "icon: 'trendUp'"],
  ["emoji: '🙂'", "icon: 'smile'"],
  ["emoji: '😐'", "icon: 'meh'"],
  ["emoji: '😵'", "icon: 'frown'"],
  ['sticky top-0 z-20 backdrop-blur bg-[#0b0f19]/85 border-b border-slate-800',
    'sticky top-0 z-20 bg-[#08090c]/95 border-b border-slate-800'],
  ['🎓 教练模式', '<Ic n="graduation" /> 教练模式'],
  ['⚡ OPv', '<Ic n="zap" /> OPv'],
  ["          {saveOk\n            ? resumed ? '💾 已续上上次进度 · 自动存档' : '💾 自动存档已开启'\n            : '⚠ 本浏览器禁用了本地存储，刷新会丢进度'}",
    '          {saveOk\n            ? resumed ? <><Ic n="save" /> 已续上上次进度 · 自动存档</> : <><Ic n="save" /> 自动存档已开启</>\n            : <><Ic n="alert" /> 本浏览器禁用了本地存储，刷新会丢进度</>}'],
  ['🔄 新的一届', '<Ic n="refresh" /> 新的一届'],
  ['← 返回观战模式', '<Ic n="arrowLeft" /> 返回观战模式'],
  ["'bg-indigo-500/40 animate-pulse'", "'bg-indigo-500/40 ui-live'"],
  ['⚡ OP 开局', '<Ic n="zap" /> OP 开局'],
  ['⚙ 改设置（回设置页）', '<Ic n="settings" /> 改设置（回设置页）'],
  ['🎓 毕业离队', '<Ic n="graduation" /> 毕业离队'],
  ['✨ 初一 / 高一新生', '<Ic n="sparkles" /> 初一 / 高一新生'],
  ['<span className="ml-1 text-[9px] text-amber-300 font-bold">⚡OP</span>',
    '<span className="ml-1 text-[9px] text-amber-300 font-bold" data-opv-tag><Ic n="zap" size={9} />OP</span>'],
  ['<span className="ml-1 text-[9px] text-amber-300">⚡OP</span>',
    '<span className="ml-1 text-[9px] text-amber-300" data-opv-tag><Ic n="zap" size={9} />OP</span>'],
  ["            {ready\n              ? season.year === 1 ? '🎓 开始第 1 学年' : `🎓 进入第 ${season.year} 学年`\n              : `至少选 ${TEAM_MIN} 人`}",
    '            {ready\n              ? season.year === 1 ? <><Ic n="graduation" /> 开始第 1 学年</> : <><Ic n="graduation" /> 进入第 {season.year} 学年</>\n              : `至少选 ${TEAM_MIN} 人`}'],
  ['🏁 本周有正式比赛：{stage.name}', '<Ic n="flag" /> 本周有正式比赛：{stage.name}'],
  ['<b className="mr-1.5">📌 本周插曲</b>', '<b className="mr-1.5"><Ic n="pin" /> 本周插曲</b>'],
  ['{info.emoji} {info.name}', '<Ic n={info.icon} /> {info.name}', 2],
  ["{intensity === 'rest' ? '☕ 本周休息，进入周末' : '📘 排入本周训练'}",
    "{intensity === 'rest' ? <><Ic n=\"coffee\" /> 本周休息，进入周末</> : <><Ic n=\"book\" /> 排入本周训练</>}"],
  ['📈 状态好 {tone.good}', '<Ic n="trendUp" /> 状态好 {tone.good}'],
  ['🙂 还行 {tone.ok}', '<Ic n="smile" /> 还行 {tone.ok}'],
  ['😐 一般 {tone.flat}', '<Ic n="meh" /> 一般 {tone.flat}'],
  ['😵 白练 {tone.bad}', '<Ic n="frown" /> 白练 {tone.bad}'],
  ['<div className="text-lg">{t.emoji}</div>', '<div className="text-lg"><Ic n={t.icon} size={20} /></div>'],
  ["{stage ? `🏁 ${stage.short}：开考` : '🏁 周末：模拟赛'}",
    '{stage ? <><Ic n="flag" /> {stage.short}：开考</> : <><Ic n="flag" /> 周末：模拟赛</>}'],
  ["  const nextLabel = lastWeek\n    ? season.year >= season.careerYears ? '🏆 查看生涯结算' : '📅 学年结束 · 继续或退休'\n    : `→ 进入第 ${season.week} 周`;",
    "  const nextLabel = lastWeek\n    ? season.year >= season.careerYears ? '查看生涯结算' : '学年结束 · 继续或退休'\n    : `进入第 ${season.week} 周`;"],
  ['<span className="ml-1 text-[9px] text-indigo-300">🎓</span>',
    '<span className="ml-1 text-[9px] text-indigo-300"><Ic n="graduation" size={9} /></span>', 3],
  ['📅 学年结算', '<Ic n="calendar" /> 学年结算'],
  ['📅 继续带队 · 进入第 {season.year + 1} 学年', '<Ic n="calendar" /> 继续带队 · 进入第 {season.year + 1} 学年'],
  ['🏆 退休 · 查看生涯评价', '<Ic n="trophy" /> 退休 · 查看生涯评价'],
  ['<span className="text-emerald-400">→ {r.endOverall.toFixed(0)}</span>',
    '<span className="text-emerald-400"><Ic n="arrowRight" size={10} /> {r.endOverall.toFixed(0)}</span>'],
  ['🔄 再带一届', '<Ic n="refresh" /> 再带一届'],
  ['← 观战模式', '<Ic n="arrowLeft" /> 观战模式'],
  ['<span className="text-amber-300/70">{name}：</span>“{q.text}”',
    '<span className="text-amber-300/70">{name}：</span>“{plainText(q.text)}”'],
  ['🔓 公布真实成绩', '<Ic n="unlock" /> 公布真实成绩'],
  ['<span className="text-indigo-300 font-bold">✓</span>',
    '<span className="text-indigo-300 font-bold"><Ic n="check" size={12} /></span>'],
]);

// ---------------------------------------------------------------------------
// season.ts — 只改 UI 用的杂项表，语义零改动
// ---------------------------------------------------------------------------
apply('season.ts', [
  ["export const INTENSITY_INFO: Record<WeekIntensity, { name: string; note: string; emoji: string }> = {",
    "export const INTENSITY_INFO: Record<WeekIntensity, { name: string; note: string; icon: 'book' | 'flame' | 'coffee' }> = {"],
  ["emoji: '📘'", "icon: 'book'"],
  ["emoji: '🔥'", "icon: 'flame'"],
  ["emoji: '☕'", "icon: 'coffee'"],
]);

// ---------------------------------------------------------------------------
// 全局：硬编码色值 → SIGNAL 色板（只动 TSX，游戏引擎里的洛谷题目颜色不动）
// ---------------------------------------------------------------------------
const HEX = [
  ['#0b0f19', '#08090c'],
  ['#111827', '#0d1116'],
  ['#0f1626', '#0b0e13'],
  ['#141a2e', '#10140f'],
  ['#101827', '#0a0d11'],
  ['#22c55e22', '#c8f13522'],
  ['#22c55e44', '#c8f13555'],
  ['#4ade80', '#d8fa63'],
  ['#e74c3c', '#ff6f72'],
  ['#f39c12', '#ffc24d'],
  ['#6366f1', '#c8f135'],
];
for (const f of readdirSync(SRC).filter((n) => n.endsWith('.tsx'))) {
  const p = join(SRC, f);
  let s = readFileSync(p, 'utf8');
  let changed = 0;
  for (const [a, b] of HEX) {
    const n = s.split(a).length - 1;
    if (n) { s = s.split(a).join(b); changed += n; }
  }
  if (changed) writeFileSync(p, s, 'utf8');
  if (changed) console.log(`  ${f}: ${changed} 处硬编码色值已换肤`);
}

// ---------------------------------------------------------------------------
// 兜底：清除所有残留的表情符号 / 装饰性图形（数据文案、注释也算）
// ---------------------------------------------------------------------------
const GRAPHICS = /[\p{Extended_Pictographic}\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/gu;
const MODIFIERS = /[\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu;
let leftovers = 0;
for (const f of readdirSync(SRC).filter((n) => /\.(ts|tsx|css)$/.test(n))) {
  const p = join(SRC, f);
  const before = readFileSync(p, 'utf8');
  const found = [...new Set(before.match(GRAPHICS) || [])];
  const cleaned = before.replace(MODIFIERS, '').replace(GRAPHICS, '');
  if (cleaned !== before) {
    writeFileSync(p, cleaned, 'utf8');
    leftovers += found.length;
    console.log(`  ${f}: 兜底清除 ${JSON.stringify(found)}`);
  }
}
console.log(`\n完成。兜底清除的字符种类数：${leftovers}`);
