// 教练模式冒烟：无头 Edge 打开单文件，自动建队 → 一周周排训练/处理事件/跑比赛 → 走到赛季结算，截图。
// 全部按 data-testid 找控件，与观战模式的 e2e-check.mjs 同一套约定。
// 用法：node scripts/coach-smoke.mjs [输出前缀]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logRun } from './log.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'OI模拟赛.html');
if (!existsSync(TARGET)) {
  console.error(`找不到 ${TARGET}，先跑 pnpm build:single`);
  process.exit(1);
}

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p)) ?? 'msedge.exe';
const FILE = pathToFileURL(TARGET).href;
const PORT = 9335;
const FULL = process.argv.includes('--full');
const prefix = process.argv[2] || 'coach-smoke';
const OUT = /[/\\]/.test(prefix) ? prefix : join(ROOT, prefix);

try {
  await fetch(`http://127.0.0.1:${PORT}/json/version`);
  console.error(`端口 ${PORT} 被占用，先关掉残留的 Edge`);
  process.exit(1);
} catch { /* 空闲 */ }

const profile = mkdtempSync(join(tmpdir(), 'edge-coach-'));
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1600,1000', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitJson(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* 等 */ }
    await sleep(250);
  }
  throw new Error(`连不上 ${url}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await Promise.race([
      this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
      sleep(15000).then(() => { throw new Error('CDP 求值 15 秒无响应（页面可能崩了）'); }),
    ]);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

const connect = async (url) => {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  return new Cdp(ws);
};

let conn = null;

try {
  await waitJson(`http://127.0.0.1:${PORT}/json/version`);
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = await connect(target.webSocketDebuggerUrl);
  conn = cdp;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errs=[];addEventListener('error',e=>window.__errs.push(String(e.message)+' @ '+String(e.filename||'').split('/').pop()+':'+e.lineno));addEventListener('unhandledrejection',e=>window.__errs.push('rejection: '+String(e.reason&&e.reason.stack||e.reason)));`,
  });
  const qs = [FULL ? 'years=1' : '', process.env.COACH_SEED ? 'seed=' + process.env.COACH_SEED : ''].filter(Boolean).join('&');
  await cdp.send('Page.navigate', { url: FILE + (qs ? '?' + qs : '') });

  // 等页面渲染
  let mounted = false;
  for (let i = 0; i < 60 && !mounted; i++) {
    if (i) await sleep(200);
    mounted = await cdp.eval("!!(document.body && document.body.innerText.trim().length)");
  }
  if (!mounted) throw new Error('页面没渲染出来');

  const has = (id) => cdp.eval(`!!document.querySelector('[data-testid="${id}"]')`);
  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}-${name}.png`, Buffer.from(s.data, 'base64'));
  };

  // 建队
  for (let i = 0; i < 40 && !(await has('coach-btn')); i++) await sleep(200);
  await cdp.eval(`document.querySelector('[data-testid="coach-btn"]').click()`);
  for (let i = 0; i < 40 && !(await has('pick-auto')); i++) await sleep(200);
  await cdp.eval(`document.querySelector('[data-testid="pick-auto"]').click()`);
  await sleep(300);
  await cdp.eval(`(() => { const b = document.querySelector('[data-testid="start-season"]'); if (b && !b.disabled) { b.click(); return true; } return false; })()`);
  await sleep(400);

  let weekViews = 0;
  let eventSeen = 0;
  let eventShot = false;
  let done = false;
  let yearScreens = 0;
  let finaleReached = false;
  let stageShot = false;
  let yearEndShot = false;
  let awardShot = false;

  for (let tick = 0; tick < 2400; tick++) {
    await sleep(80);
    const state = await cdp.eval(`(() => {
      const q = (id) => document.querySelector('[data-testid="' + id + '"]');
      return {
        finale: !!q('finale-grade'),
        event: !!q('event-card'),
        plan: !!q('plan-confirm'),
        run: !!q('run-contest'),
        next: !!q('result-next'),
        team: !!q('start-season'),
        stage: !!q('stage-notice'),
        awards: !!q('awards'),
        watch: !!q('coach-watch'),
        skip: !!q('coach-skip'),
        reveal: !!q('coach-reveal'),
        watch: !!q('coach-watch'),
        skip: !!q('coach-skip'),
        reveal: !!q('coach-reveal'),
        yearEnd: !!q('year-end'),
      };
    })()`);
    if (state.finale) { finaleReached = true; done = true; break; }
    const bodyLen = await cdp.eval('document.body.innerText.trim().length');
    if (bodyLen === 0) {
      const errs = await cdp.eval('JSON.stringify(window.__errs||[])');
      const html = await cdp.eval('document.getElementById("root")?.innerHTML?.slice(0,200)||""');
      throw new Error(`页面白屏（第 ${weekViews} 周后）：${errs} root=${html}`);
    }
    if (state.yearEnd) {
      await sleep(250);
      if (!yearEndShot) { await shot('year-end'); yearEndShot = true; }
      const skipped = await cdp.eval(`(() => { const b = document.querySelector('[data-testid="continue-career"]'); if (b) { b.click(); return true; } return false; })()`);
      if (!skipped) throw new Error('学年末页没有「继续带队」按钮');
      await sleep(300);
      continue;
    }
    if (state.team) {
      yearScreens++;
      if (yearScreens === 1) {
        // 第 2 学年选队：验证毕业生 / 新生区域
        await sleep(300);
        await shot('year2');
        const txt = await cdp.eval("document.body.innerText");
        const grad = txt.split('\n').filter((l) => /毕业|新生|学年/.test(l)).slice(0, 6).join(' | ');
        console.log(`第 2 学年选队页：${grad}`);
        done = true;
        break;
      }
      const started = await cdp.eval(`(() => { const b = document.querySelector('[data-testid="start-season"]'); if (b && !b.disabled) { b.click(); return true; } return false; })()`);
      if (!started) {
        await cdp.eval(`document.querySelector('[data-testid="pick-auto"]')?.click()`);
        await sleep(150);
        await cdp.eval(`(() => { const b = document.querySelector('[data-testid="start-season"]'); if (b && !b.disabled) b.click(); })()`);
      }
      await sleep(300);
      continue;
    }
    if (state.stage && !stageShot) { await sleep(200); await shot('stage'); stageShot = true; }
    if (state.awards && !awardShot) { await sleep(250); await shot('awards'); awardShot = true; }
    if (state.event) {
      eventSeen++;
      if (!eventShot) { await sleep(250); await shot('event'); eventShot = true; }
      if (eventSeen === 1) {
        const info = await cdp.eval(`(() => {
          const card = document.querySelector('[data-testid="event-card"]');
          const opts = [...document.querySelectorAll('[data-testid^="event-opt-"]')];
          return { title: card?.parentElement?.querySelector('h3')?.textContent || '', options: opts.length };
        })()`);
        console.log(`首个事件：${info.title}（${info.options} 个选项）`);
      }
      await cdp.eval(`(() => { const b = document.querySelector('[data-testid^="event-opt-"]'); if (b) b.click(); })()`);
      continue;
    }
    if (state.plan) {
      await cdp.eval(`(() => {
        const t = document.querySelector('[data-testid^="topic-"]:not([disabled])');
        if (t) t.click();
        const plan = document.querySelector('[data-testid="plan-confirm"]');
        setTimeout(() => { if (plan && !plan.disabled) plan.click(); }, 30);
      })()`);
      await sleep(200);
      weekViews++;
      if (weekViews === 2) {
        await shot('week');
        const opened = await cdp.eval("(() => { const b = document.querySelector('[data-testid^=\"student-detail-\"]'); if (b) { b.click(); return true; } return false; })()");
        if (opened) { await sleep(250); await shot('detail'); }
      }
      continue;
    }
    if (state.reveal) { await cdp.eval(`document.querySelector('[data-testid="coach-reveal"]').click()`); await sleep(250); continue; }
    if (state.skip) { await cdp.eval(`document.querySelector('[data-testid="coach-skip"]').click()`); await sleep(300); continue; }
    if (state.reveal) { await cdp.eval(`document.querySelector('[data-testid="coach-reveal"]').click()`); await sleep(250); continue; }
    if (state.skip) { await cdp.eval(`document.querySelector('[data-testid="coach-skip"]').click()`); await sleep(300); continue; }
    if (state.run) { await cdp.eval(`document.querySelector('[data-testid="run-contest"]').click()`); await sleep(250); continue; }
    if (state.next) { await cdp.eval(`document.querySelector('[data-testid="result-next"]').click()`); await sleep(200); continue; }
  }

  if (!done) {
    const txt = await cdp.eval("document.body.innerText");
    await shot('stuck');
    console.log('没走到结算，页面片段：', txt.slice(0, 400).replace(/\n/g, ' | '));
  } else if (finaleReached) {
    await sleep(400);
    await shot('final');
    const grade = await cdp.eval(`document.querySelector('[data-testid="finale-grade"]').textContent.trim()`);
    const body = await cdp.eval("document.body.innerText");
    console.log(`生涯跑完：${weekViews} 次排训练 · ${eventSeen} 次事件 · 评级 ${grade}`);
    console.log('结算页关键行：', body.split('\n').filter((l) => /教练评分|省一|省队|平均/.test(l)).slice(0, 6).join(' | '));
  } else {
    console.log(`第 1 学年跑完：${weekViews} 周排训练 · ${eventSeen} 次事件 · 已进入第 2 学年选队页`);
  }
  if (eventSeen === 0) console.log('⚠️ 第 1 学年没遇到事件（概率约 62%/周，40 周遇不到几乎不可能，需检查）');
  process.exitCode = done ? 0 : 1;
} catch (err) {
  console.error('失败:', err.message);
  process.exitCode = 1;
} finally {
  // process.exit() 不会执行 finally，所以这里显式收尾：
  // 杀掉整棵 Edge 进程树（只 kill 父进程会漏掉 renderer/gpu，那些进程会占住管道让脚本永远不返回）
  try { conn?.ws?.close(); } catch { /* 忽略 */ }
  try { spawnSync('taskkill', ['/pid', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* 忽略 */ }
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
  logRun('coach-smoke', {
    args: process.argv.slice(2).join(' ') || 'default',
    result: process.exitCode ? `fail(${process.exitCode})` : 'ok',
  });
}
