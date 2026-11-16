/**
 * 生成 OPv 版的两个独立单文件：
 *
 *   OI模拟赛-OPv-静帧.html   data-motion="static"  零动画 / 零过渡 / 不撒纸屑
 *   OI模拟赛-OPv-满血.html   data-motion="full"    完整入场动效 / 活体指示 / 纸屑
 *   OI模拟赛-OPv.html        满血版的旧文件名别名（保留，避免旧书签与验证脚本失效）
 *
 * 与 scripts/inline.mjs 的区别（很重要）：
 *  - 只写新文件，**绝不**覆盖 OI模拟赛.html，也不同步 site/index.html；
 *  - 生成前后校验原版 HTML / Pages 页面的哈希，一旦被动过就报错；
 *  - 自检产物：OPv 标记、编辑器、Lucide 图标类、data-motion、界面无 emoji。
 *
 * 用法（必须先构建 OPv 版）：
 *   OPV=1 npx vite build
 *   node scripts/inline-opv.mjs
 *
 * 说明：两个版本共用同一次构建。动效开关写在 <html data-motion="..."> 上，
 * CSS 与运行时都读它，因此不需要跑两遍 vite build，也不会出现功能分叉。
 * 如果只想让 dev / dist 默认是静帧版，用 `OPV=1 MOTION=0 npx vite build`。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const originalHtml = join(root, 'OI模拟赛.html');
const siteHtml = join(root, 'site', 'index.html');

const sha = (p) => existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null;
const originalBefore = sha(originalHtml);
const siteBefore = sha(siteHtml);

let html = readFileSync(join(distDir, 'index.html'), 'utf8');

const jsFile = readdirSync(join(distDir, 'assets')).find((f) => f.endsWith('.js'));
const cssFile = readdirSync(join(distDir, 'assets')).find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('dist/assets 里找不到 js/css，请先执行 OPV=1 vite build');

// 不能让 JS 里出现 </script（大小写/空白变体都算），否则浏览器会提前结束脚本
const js = readFileSync(join(distDir, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(distDir, 'assets', cssFile), 'utf8');

const jsTag = html.match(/<script type="module"[^>]*src="[^"]+"><\/script>/);
const cssTag = html.match(/<link rel="stylesheet" crossorigin href="[^"]+">/);
if (!jsTag || !cssTag) throw new Error('dist/index.html 结构和预期不符');

// 函数式 replacement：字符串形式会把 $& / $' / $1 当成特殊变量展开
html = html.replace(jsTag[0], () => `<script type="module">${js}</script>`);
html = html.replace(cssTag[0], () => `<style>${css}</style>`);
// 单文件版完全离线：移除任何外部样式表（历史版本残留的 CDN 图标库）
html = html.replace(/<link\s+rel="stylesheet"\s+href="https:\/\/cdnjs[^>]*>/g, '');

// ---- 产物自检（与动效版本无关的公共部分） ----
const closers = (html.match(/<\/script/gi) || []).length;
if (closers !== 3) throw new Error(`自检失败：</script 出现 ${closers} 次（应为 3）`);
if (!html.includes('OPV_BUILD_MARKER')) throw new Error('自检失败：dist 不是 OPv 构建（请先执行 OPV=1 vite build）');
if (!html.includes('opv-editor')) throw new Error('自检失败：产物里找不到 OP 开局编辑器');
if (!html.includes('ui-ic')) throw new Error('自检失败：产物里找不到 Lucide 图标原语（src/ui.tsx 没有被打包？）');
if (!/<html\b[^>]*data-motion="/.test(html)) throw new Error('自检失败：<html> 上缺少 data-motion 开关');

// 界面全程禁止表情符号：对已知用过的每一个图形字符做硬校验
const FORBIDDEN = [
  '🥇', '🥈', '🥉', '⚡', '🎓', '🚀', '📜', '👁', '🧠', '🏆', '⚙', '📋',
  '🔓', '⏭', '📉', '📈', '🎯', '🏅', '🎭', '📝', '🔄', '🎲', '✏', '✨',
  '🔥', '🌱', '📄', '🧊', '💾', '✕', '⚠', '⚖', '🙂', '😐', '😵', '📌',
  '☕', '📘', '🏁', '📅', '💾', '📊', '🎙', '📡', '⏩', '▶', '⏸', '◆', '◇',
  '✓', '😡', '🤨', '🤣', '😨', '😤', '🤓', '🤬', '😭', '❗',
];
const hits = FORBIDDEN.filter((g) => html.includes(g));
if (hits.length) throw new Error(`自检失败：产物里仍有表情符号 ${JSON.stringify(hits)}`);

// ---- 生成三个文件 ----
const VARIANTS = [
  {
    motion: 'static',
    file: 'OI模拟赛-OPv-静帧.html',
    title: 'OI 模拟赛 · OPv 静帧版 | 零动画 · 低配流畅',
    label: '静帧版 / 零动画',
  },
  {
    motion: 'full',
    file: 'OI模拟赛-OPv-满血.html',
    title: 'OI 模拟赛 · OPv 满血版 | 完整动效',
    label: '满血版 / 完整动效',
  },
  {
    motion: 'full',
    file: 'OI模拟赛-OPv.html',
    title: 'OI 模拟赛 · OPv 版 | 开档前自定义年龄、属性与数值',
    label: '满血版（旧文件名别名）',
  },
];

for (const v of VARIANTS) {
  let out = html
    // 只改 <html> 标签上的开关，绝不误伤 CSS 里的 html[data-motion="..."] 选择器
    .replace(/(<html\b[^>]*?)data-motion="[^"]*"/, `$1data-motion="${v.motion}"`)
    .replace(/<!-- MOTION_BUILD:(?:full|static) -->/, `<!-- MOTION_BUILD:${v.motion} -->`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${v.title}</title>`)
    .replace('</head>', `  <!-- ${v.label} · 原版 OI模拟赛.html 未被改动 -->\n  </head>`);

  if (!out.includes(`data-motion="${v.motion}"`)) throw new Error(`${v.file}：动效开关写入失败`);
  const outPath = join(root, v.file);
  writeFileSync(outPath, out, 'utf8');
  console.log(`已生成 ${v.file}（${(Buffer.byteLength(out) / 1024).toFixed(0)} KB）· ${v.label}`);
}

// 绝不覆盖旧文件：写完后核对原版与 Pages 页面哈希
if (originalBefore && sha(originalHtml) !== originalBefore) throw new Error('自检失败：OI模拟赛.html 被改动了');
if (siteBefore && sha(siteHtml) !== siteBefore) throw new Error('自检失败：site/index.html 被改动了');

console.log('\n双击任意一个 HTML 即可开始；三个版本的存档与配置互相隔离，且都不碰原版存档。');
console.log('原版 OI模拟赛.html 与 site/index.html 均未改动');
