// 用 CDP + 虚拟时间驱动无头 Edge 跑完一整场校赛，截图并检查战报徽章。
// 用法：node scripts/e2e-check.mjs [输出前缀]
//
// 约定：脚本只认 data-testid，不认文案（改 UI 文案不会让 e2e 静默失效）。
// 这 6 个标记改 App.tsx 的 DOM 时必须保留：
//   start-contest  「开始比赛」按钮        cfg-duration  比赛时长滑杆
//   contest-screen 赛中页 <header>         finish-paper  「⏭ 到收卷」按钮
//   reveal-real    「公布真实成绩」按钮     final-heading 终局「最终成绩」标题
//   final-meta     终局那行「N 题 · M 人 · 用时…」摘要
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logRun } from './log.mjs';

// 项目根目录 = scripts/ 的上一级，跟着项目走：改名/换盘符都不用再改这里
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'OI模拟赛.html');
if (!existsSync(TARGET)) {
  console.error(`找不到 ${TARGET}，先跑 pnpm build:single 生成单文件`);
  process.exit(1);
}

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p)) ?? 'msedge.exe';
const FILE = pathToFileURL(TARGET).href;
const PORT = 9334;
// 截图默认落在项目根（e2e-contest.png 等）；前缀里带路径则按 CWD 解析
const prefix = process.argv[2] || 'e2e';
const OUT = /[/\\]/.test(prefix) ? prefix : join(ROOT, prefix);

// 注入到页面的自动驾驶脚本：开局点「开始比赛」→ 点 4x → 结束后点「公布真实成绩」
const DRIVER = `
(() => {
  const log = [];
  window.__driverLog = log;
  // 全部按 data-testid 找控件，改文案/换 DOM 结构不会静默失效
  const byId = (id) => document.querySelector('[data-testid="' + id + '"]');
  const clickId = (id) => { const b = byId(id); if (b) { b.click(); return true; } return false; };
  let step = 0;
  const timer = setInterval(() => {
    if (step === 0) {
      // 把比赛时长调到最短（120 分钟），让整场跑得快一些
      const dur = byId('cfg-duration');
      if (dur) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(dur, '120');
        dur.dispatchEvent(new Event('input', { bubbles: true }));
        log.push('duration@' + Math.round(performance.now()));
      }
      if (clickId('start-contest')) { log.push('start@' + Math.round(performance.now())); step = 1; }
    }
    else if (step === 1) {
      // 停 2.6 秒让外部截一张赛中图，然后点「⏭ 到收卷」验快进
      if (!window.__t0) window.__t0 = performance.now();
      if (performance.now() - window.__t0 > 2600) {
        if (clickId('finish-paper')) { log.push('ff@' + Math.round(performance.now())); step = 2; }
      }
    }
    else if (step === 2 && clickId('reveal-real')) { log.push('reveal@' + Math.round(performance.now())); step = 3; clearInterval(timer); }
  }, 50);
})();
`;

// 端口被上次残留的 Edge 占着会连到旧实例，先探一下免得白跑 180 秒
try {
  await fetch(`http://127.0.0.1:${PORT}/json/version`);
  console.error(`端口 ${PORT} 已被占用（可能是上次 e2e 残留的 Edge），先 taskkill 掉再跑`);
  process.exit(1);
} catch { /* 端口空闲，正常 */ }

const profile = mkdtempSync(join(tmpdir(), 'edge-e2e-'));
const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=1600,1000',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJson(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error(`无法连接 ${url}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  }
}

const connect = async (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
};

let cdp = null;
try {
  await waitJson(`http://127.0.0.1:${PORT}/json/version`);
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  await cdp.send('Page.navigate', { url: FILE });

  // 先等页面渲染出来，确认它是带 data-testid 的新产物，再把自动驾驶脚本注入进去
  // （顺序很重要：如果在导航前注入，脚本会抢在页面就绪前点按钮，导致探针扑空）
  let mounted = false;
  for (let i = 0; i < 60 && !mounted; i++) {
    if (i) await sleep(200);
    mounted = await cdp.eval("!!(document.body && document.body.innerText.trim().length)");
  }
  if (!mounted) throw new Error('页面 12 秒内没渲染出内容，检查 OI模拟赛.html 是否损坏');
  const markerCount = await cdp.eval("document.querySelectorAll('[data-testid]').length");
  if (!markerCount) {
    throw new Error('页面里没有 data-testid —— OI模拟赛.html 是旧产物，先跑 pnpm build:single');
  }

  await cdp.eval(DRIVER);

  let doneAt = 0;
  let contestShot = false;
  const started = Date.now();

  const has = (id) => cdp.eval(`!!document.querySelector('[data-testid="${id}"]')`);

  for (let i = 0; i < 180; i++) {
    await sleep(1000);
    if (!contestShot && (await has('contest-screen'))) {
      contestShot = true;
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${OUT}-contest.png`, Buffer.from(shot.data, 'base64'));
    }
    if (await has('final-heading')) { doneAt = Date.now(); break; }
  }
  if (!doneAt) {
    const txt = await cdp.eval("document.body ? document.body.innerText : ''");
    console.log('未完成。页面片段：', txt.slice(0, 300).replace(/\n/g, ' | '));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}-stuck.png`, Buffer.from(shot.data, 'base64'));
    throw new Error('比赛没跑完');
  }
  console.log(`比赛跑完，真实耗时 ${((doneAt - started) / 1000).toFixed(1)}s`);
  console.log('驱动日志:', await cdp.eval('JSON.stringify(window.__driverLog)'));

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-final.png`, Buffer.from(shot.data, 'base64'));

  const info = await cdp.eval(`(() => {
    const txt = document.body.innerText;
    const meta = document.querySelector('[data-testid="final-meta"]');
    return {
      header: (meta ? meta.textContent : '').trim(),
      badges: [...new Set(txt.match(/\\b[JS][123]\\b/g) || [])].slice(0, 12),
      badgeCount: (txt.match(/\\b[JS][123]\\b/g) || []).length,
    };
  })()`);
  console.log('标头:', info.header);
  console.log(`战报徽章 ${info.badgeCount} 个：`, info.badges.join(' '));
  process.exitCode = 0;
} catch (err) {
  console.error('失败:', err.message);
  process.exitCode = 1;
} finally {
  // process.exit() 会跳过 finally；只 kill 父进程又会漏掉 renderer/gpu 子进程（它们占住管道，脚本永不返回）
  try { cdp?.ws?.close(); } catch { /* 忽略 */ }
  try { spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* 忽略 */ }
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
  logRun('e2e-check', { result: process.exitCode ? `fail(${process.exitCode})` : 'ok' });
}
