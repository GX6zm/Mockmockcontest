// 临时验证：无头 Edge 打开 OPv 单文件，自动点完「设数值 -> 保存 -> 进教练模式」，
// 把检查结果写进 DOM 再用 --dump-dom 取回。脚本名以 _ 开头，被 .gitignore 忽略。
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE_ARG = (process.argv.find((a) => a.startsWith('--file=')) || '').split('=')[1];
const SOURCE = join(ROOT, FILE_ARG || 'OI模拟赛-OPv.html');
const TARGET = join(ROOT, '_opv-verify.html');
const BROWSER = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync) ?? 'chrome.exe';

const WATCH_DRIVER = String.raw`
<script>
(() => {
  window.confirm = () => true;
  // 直接预置一份拉满的配置，验证观战模式的名单替换与引擎接入
  const cfg = { enabled:true, mode:'create', name:'此刻的我', age:15, grade:4,
    topics:{math:150,dp:150,graph:150,greedy:150,ds:150,impl:150,string:150,geometry:150},
    coding:100, reading:100, debug:100, talent:1.3, fatigue:0, homework:100, prestige:100, autoTeam:true };
  try { localStorage.setItem('oi-sim-opv-config-v1', JSON.stringify(cfg)); } catch (e) {}
  const result = { steps: [] };
  const q = (id) => document.querySelector('[data-testid="' + id + '"]');
  let step = 0, ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    if (ticks > 200) { finish('timeout'); return; }
    if (step === 0) {
      if (q('start-contest')) { q('start-contest').click(); step = 1; result.steps.push('start-contest'); }
    } else if (step === 1) {
      if (q('contest-screen')) {
        const body = document.body.innerText || '';
        result.hasCustomName = body.includes('此刻的我');
        result.contestText = body.slice(0, 260);
        result.configRead = !!localStorage.getItem('oi-sim-opv-config-v1');
        finish('ok');
      }
    }
  }, 60);
  function finish(status) {
    clearInterval(timer);
    result.status = status;
    result.ticks = ticks;
    const out = document.createElement('div');
    out.id = 'opv-test-result';
    out.textContent = 'OPV_RESULT_JSON:' + JSON.stringify(result) + ':END';
    document.body.appendChild(out);
  }
})();
</script>
`;

const FULL_DRIVER = String.raw`
<script>
(() => {
  window.confirm = () => true;
  const cfg = { enabled:true, mode:'create', name:'此刻的我', age:15, grade:4,
    topics:{math:150,dp:150,graph:150,greedy:150,ds:150,impl:150,string:150,geometry:150},
    coding:100, reading:100, debug:100, talent:1.3, fatigue:0, homework:100, prestige:100, autoTeam:true };
  try { localStorage.setItem('oi-sim-opv-config-v1', JSON.stringify(cfg)); } catch (e) {}
  const result = { steps: [] };
  const q = (id) => document.querySelector('[data-testid="' + id + '"]');
  let step = 0, ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    if (ticks > 3000) { finish('timeout'); return; }
    if (step === 0) {
      const dur = q('cfg-duration');
      if (dur) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(dur, '120');
        dur.dispatchEvent(new Event('input', { bubbles: true }));
        dur.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (q('start-contest')) { q('start-contest').click(); step = 1; result.steps.push('start'); }
    } else if (step === 1) {
      if (q('finish-paper')) { q('finish-paper').click(); step = 2; result.steps.push('finish-paper'); }
    } else if (step === 2) {
      if (q('reveal-real')) { q('reveal-real').click(); step = 3; result.steps.push('reveal'); }
    } else if (step === 3) {
      const body = document.body.innerText || '';
      if (body.includes('最终成绩') || q('final-heading')) {
        result.hasCustomName = body.includes('此刻的我');
        const idx = body.indexOf('此刻的我');
        result.aroundName = idx >= 0 ? body.slice(Math.max(0, idx - 100), idx + 200) : '';
        result.finalMeta = (q('final-meta')?.textContent || '').trim();
        result.opvGrowthKey = !!localStorage.getItem('oi-sim-growth-opv-v1');
        result.originalGrowthKey = !!localStorage.getItem('oi-sim-growth-v1');
        finish('ok');
      }
    }
  }, 30);
  function finish(status) {
    clearInterval(timer);
    result.status = status;
    result.ticks = ticks;
    const out = document.createElement('div');
    out.id = 'opv-test-result';
    out.textContent = 'OPV_RESULT_JSON:' + JSON.stringify(result) + ':END';
    document.body.appendChild(out);
  }
})();
</script>
`;

const ZKY_DRIVER = String.raw`
<script>
(() => {
  window.confirm = () => true;
  const result = {};
  const q = (id) => document.querySelector('[data-testid="' + id + '"]');
  const btn = (needle) => Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes(needle));
  const num = (id) => q(id)?.querySelector('input[type=number]')?.value ?? null;
  let step = 0, ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    if (ticks > 200) { finish('timeout'); return; }
    if (step === 0) { if (q('opv-btn')) { q('opv-btn').click(); step = 1; } }
    else if (step === 1) { if (q('opv-editor')) { const b = btn('周康阳'); if (b) { b.click(); step = 2; result.clicked = true; } } }
    else if (step === 2) {
      result.overall = (q('opv-overall')?.textContent || '').trim();
      result.age = num('opv-slider-年龄');
      result.kpMath = num('opv-slider-数学');
      result.talent = num('opv-slider-天赋');
      if (q('opv-save')) { q('opv-save').click(); step = 3; }
    } else if (step === 3) {
      try { result.config = JSON.parse(localStorage.getItem('oi-sim-opv-config-v1')); } catch (e) {}
      finish('ok');
    }
  }, 60);
  function finish(status) {
    clearInterval(timer);
    result.status = status;
    const out = document.createElement('div');
    out.id = 'opv-test-result';
    out.textContent = 'OPV_RESULT_JSON:' + JSON.stringify(result) + ':END';
    document.body.appendChild(out);
  }
})();
</script>
`;

const EDITOR_DRIVER = String.raw`
<script>
(() => {
  window.confirm = () => true;
  const result = { steps: [] };
  const q = (id) => document.querySelector('[data-testid="' + id + '"]');
  const txt = (id) => (q(id)?.textContent || '').trim();
  const btn = (needle) => Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes(needle));
  const setInput = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let step = 0, ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    if (ticks > 200) { finish('timeout'); return; }
    if (step === 0) {
      if (q('opv-btn')) { q('opv-btn').click(); step = 1; result.steps.push('open-editor'); }
    } else if (step === 1) {
      if (q('opv-editor')) { step = 2; result.steps.push('editor-rendered'); }
    } else if (step === 2) {
      const b = btn('新加一个人');
      if (b) { b.click(); step = 3; result.steps.push('switch-create'); }
    } else if (step === 3) {
      const input = q('opv-name-input');
      if (input) { setInput(input, '此刻的我'); step = 4; result.steps.push('set-name'); }
    } else if (step === 4) {
      const b = btn('我其实是神');
      if (b) { b.click(); step = 5; result.steps.push('preset-god'); }
    } else if (step === 5) {
      result.overallInEditor = txt('opv-overall');
      result.hasZkyTrack = !!q('opv-zky-track');
      result.hasZkyPreset = !!btn('周康阳');
      if (q('opv-save')) { q('opv-save').click(); step = 6; result.steps.push('saved'); }
    } else if (step === 6) {
      try {
        const raw = localStorage.getItem('oi-sim-opv-config-v1');
        result.config = raw ? JSON.parse(raw) : null;
      } catch (e) { result.configError = String(e); }
      result.summary = txt('opv-summary');
      if (q('coach-btn')) { q('coach-btn').click(); step = 7; result.steps.push('enter-coach'); }
    } else if (step === 7) {
      if (q('opv-banner')) {
        result.banner = txt('opv-banner');
        const body = document.body.innerText || '';
        result.hasOpTag = !!document.querySelector('[data-opv-tag]');
        result.hasCustomName = body.includes('此刻的我');
        result.autoPicked = body.includes('此刻的我') && !!document.querySelector('[data-testid="opv-banner"]');
        try {
          result.opvSaveExists = !!localStorage.getItem('oi-sim-coach-opv-v1');
          result.originalSaveExists = !!localStorage.getItem('oi-sim-coach-v1');
        } catch (e) { result.saveError = String(e); }
        result.startSeasonDisabled = q('start-season')?.disabled ?? null;
        finish('ok');
      }
    }
  }, 60);
  function finish(status) {
    clearInterval(timer);
    result.status = status;
    result.ticks = ticks;
    const out = document.createElement('div');
    out.id = 'opv-test-result';
    out.textContent = 'OPV_RESULT_JSON:' + JSON.stringify(result) + ':END';
    document.body.appendChild(out);
  }
})();
</script>
`;

const MODE = process.argv.includes('--full') ? 'full'
  : process.argv.includes('--watch') ? 'watch'
    : process.argv.includes('--zky') ? 'zky' : 'editor';
const DRIVER = MODE === 'full' ? FULL_DRIVER
  : MODE === 'watch' ? WATCH_DRIVER
    : MODE === 'zky' ? ZKY_DRIVER : EDITOR_DRIVER;
let html = readFileSync(SOURCE, 'utf8');
html = html.replace('</body>', DRIVER + '\n</body>');
writeFileSync(TARGET, html, 'utf8');

const profile = mkdtempSync(join(tmpdir(), 'edge-opv-verify-'));
const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  `--virtual-time-budget=${MODE === 'full' ? 90000 : 20000}`,
  '--allow-file-access-from-files',
  '--dump-dom',
  pathToFileURL(TARGET).href,
];
const r = spawnSync(BROWSER, args, { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, timeout: 120000 });
const dom = r.stdout || '';
const m = dom.match(/OPV_RESULT_JSON:(\{[\s\S]*?\}):END/);
console.log('edge exit:', r.status, 'dom bytes:', dom.length);
if (!m) {
  console.log('没有拿到验证结果，stderr 片段：', (r.stderr || '').slice(0, 1500));
  console.log('DOM 片段：', dom.slice(-1500));
} else {
  const data = JSON.parse(m[1]);
  console.log(JSON.stringify(data, null, 2));
}
try { rmSync(TARGET, { force: true }); } catch { /* ignore */ }
try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
