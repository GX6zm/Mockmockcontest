// 临时截图工具：node scripts/_shot.mjs <html文件名> <输出png> [--opv]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const htmlName = process.argv[2] || 'OI模拟赛-OPv-满血.html';
const outName = process.argv[3] || '_shot.png';
const openEditor = process.argv.includes('--opv');
const clickId = (process.argv.find((a) => a.startsWith('--click=')) || '').split('=')[1];

const BROWSER = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync) ?? 'chrome.exe';

let html = join(ROOT, '_shot.html');
let source = readFileSync(join(ROOT, htmlName), 'utf8');
const target = openEditor ? 'opv-btn' : clickId;
if (target) {
  source = source.replace('</body>', `<script>
  (()=>{ window.confirm=()=>true; let t=0; const i=setInterval(()=>{t++;
    const b=document.querySelector('[data-testid="${target}"]');
    if(b){ b.click(); clearInterval(i); }
    if(t>100) clearInterval(i);
  },50); })();
  </script></body>`);
}
writeFileSync(html, source, 'utf8');

const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--window-size=1440,1120',
  '--virtual-time-budget=6000',
  '--allow-file-access-from-files',
  `--screenshot=${join(ROOT, outName)}`,
  pathToFileURL(html).href,
];
const r = spawnSync(BROWSER, args, { encoding: 'utf8', timeout: 90000 });
console.log('exit', r.status, '->', outName);
if (r.status !== 0) console.log((r.stderr || '').slice(0, 800));
