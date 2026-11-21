// 统计各类「文字素材」的规模，给外包清单用。
// 用法：node scripts/text_stats.ts
import { QUOTES } from '../src/quotes.ts';
import { EVENT_DEFS } from '../src/events.ts';
import { TITLE_CHAINS, APPROACHES } from '../src/chains.ts';
import { LEVELS, PRESETS } from '../src/game.ts';
import { YEAR_STAGES } from '../src/season.ts';

const zh = (s: string) => (s.match(/[\u4e00-\u9fa5]/g) ?? []).length;
const zhOf = (v: unknown) => zh(JSON.stringify(v));

const chainKinds = Object.values(TITLE_CHAINS).reduce((a, t) => a + Object.keys(t).length, 0);
const chainSents = Object.values(TITLE_CHAINS).reduce(
  (a, t) => a + Object.values(t).reduce((x, arr) => x + (arr?.length ?? 0), 0), 0);
const approachCount = Object.values(APPROACHES).reduce((a, l) => a + l.length, 0);
const evOptions = EVENT_DEFS.reduce((a, e) => a + e.options.length, 0);

const rows = [
  { 类别: '题目名', 数量: 66, 中文字数: 66 * 4, 说明: 'TITLE_POOL，8 个知识点共 66 个题名' },
  { 类别: '题目专属思维链', 数量: `${Object.keys(TITLE_CHAINS).length} 题 / ${chainSents} 句`, 中文字数: zhOf(TITLE_CHAINS), 说明: 'chains.ts TITLE_CHAINS' },
  { 类别: '多解法分支', 数量: `${approachCount} 条`, 中文字数: zhOf(APPROACHES), 说明: 'chains.ts APPROACHES（8 知识点 × 2 解法）' },
  { 类别: '通用思维句库', 数量: '120 句（8 × 5 × 3）', 中文字数: 0, 说明: 'thinking.ts POOLS（未导出，按文件估算约 2400 字）' },
  { 类别: '选手语录', 数量: `${QUOTES.length} 条`, 中文字数: zhOf(QUOTES), 说明: 'quotes.ts QUOTES（来自博客原句，含粗口，原样保留）' },
  { 类别: '每周事件卡', 数量: `${EVENT_DEFS.length} 张 / ${evOptions} 个选项`, 中文字数: zhOf(EVENT_DEFS), 说明: 'events.ts EVENT_DEFS' },
  { 类别: '赛事定义', 数量: `${YEAR_STAGES.length} 场`, 中文字数: zhOf(YEAR_STAGES), 说明: 'season.ts YEAR_STAGES（名称/时间/说明/资格）' },
  { 类别: '难度与赛制档', 数量: `${LEVELS.length + PRESETS.length} 条`, 中文字数: zhOf(LEVELS) + zhOf(PRESETS), 说明: 'game.ts LEVELS / PRESETS' },
];
for (const r of rows) console.log(`${r.类别}\t${r.数量}\t${r.中文字数}\t${r.说明}`);
