// 把 vite 构建产物打包成一个可以直接双击打开的 HTML（file:// 也能跑）
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

let html = readFileSync(join(distDir, 'index.html'), 'utf8');

const jsFile = readdirSync(join(distDir, 'assets')).find((f) => f.endsWith('.js'));
const cssFile = readdirSync(join(distDir, 'assets')).find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('dist/assets 里找不到 js/css，请先 vite build');

// 关键：不能让 JS 里出现 </script（大小写/空白变体都算），否则浏览器会提前结束脚本
const js = readFileSync(join(distDir, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(distDir, 'assets', cssFile), 'utf8');

const jsTag = html.match(/<script type="module"[^>]*src="[^"]+"><\/script>/);
const cssTag = html.match(/<link rel="stylesheet" crossorigin href="[^"]+">/);
if (!jsTag || !cssTag) throw new Error('dist/index.html 结构和预期不符');

// 用函数做 replacement：字符串形式会把 $&、$'、$1 当成特殊变量展开，
// 之前就是这样把整个 <script> 标签塞进了 bundle 里，导致页面变成一屏源码。
html = html.replace(jsTag[0], () => `<script type="module">${js}</script>`);
html = html.replace(cssTag[0], () => `<style>${css}</style>`);
// 去掉外网 CDN，保证离线可用
html = html.replace(/<link\s+rel="stylesheet"\s+href="https:\/\/cdnjs[^>]*>/g, '');

const out = join(root, 'OI模拟赛.html');
writeFileSync(out, html, 'utf8');

// 自检：HTML 里除三个正常脚本外，不应再有 </script
const closers = (html.match(/<\/script/gi) || []).length;
if (closers !== 3) throw new Error(`自检失败：</script 出现 ${closers} 次（应为 3）`);
if (!html.includes('opv-editor')) throw new Error('自检失败：产物里找不到自定义开局编辑器');
if (!html.includes('ui-ic')) throw new Error('自检失败：产物里找不到 Lucide 图标原语');
if (!/<html\b[^>]*data-motion="/.test(html)) throw new Error('自检失败：<html> 上缺少 data-motion 开关');

const FORBIDDEN = [
  '🥇', '🥈', '🥉', '⚡', '🎓', '🚀', '📜', '👁', '🧠', '🏆', '⚙', '📋',
  '🔓', '⏭', '📉', '📈', '🎯', '🏅', '🎭', '📝', '🔄', '🎲', '✏', '✨',
  '🔥', '🌱', '📄', '🧊', '💾', '✕', '⚠', '⚖', '🙂', '😐', '😵', '📌',
  '☕', '📘', '🏁', '📅', '📊', '🎙', '📡', '⏩', '▶', '⏸', '◆', '◇',
  '✓', '😡', '🤨', '🤣', '😨', '😤', '🤓', '🤬', '😭', '❗',
];
const hits = FORBIDDEN.filter((g) => html.includes(g));
if (hits.length) throw new Error(`自检失败：产物里仍有表情符号 ${JSON.stringify(hits)}`);

console.log(`已生成 ${out}（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB，已内置自定义开局与动效切换），双击即可开始`);

// GitHub Pages：同一份单文件再放一份到 site/index.html，Pages 从 /site 目录发布。
// 这样线上地址是 .../仓库名/ 这种干净链接，而不是 .../OI模拟赛.html 一长串百分号编码。
const siteDir = join(root, 'site');
mkdirSync(siteDir, { recursive: true });
writeFileSync(join(siteDir, 'index.html'), html, 'utf8');
// 关掉 Jekyll，省掉 Pages 构建时的额外处理
writeFileSync(join(siteDir, '.nojekyll'), '', 'utf8');
console.log(`已同步 ${join(siteDir, 'index.html')}（GitHub Pages 用）`);
