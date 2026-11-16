/**
 * 临时验证：无头 Chrome 分别打开静帧版 / 满血版，用 --dump-dom 取回运行时探针结果。
 * 检查：动效开关、CSS 动画是否被真的关掉、过渡时长、主题色、Lucide 图标、界面无 emoji。
 * 文件名以 _ 开头，被 .gitignore 忽略。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync) ?? 'chrome.exe';

const DRIVER = String.raw`
<script>
(() => {
  window.confirm = () => true;
  const result = {};
  let ticks = 0;
  const G = /[\p{Extended_Pictographic}\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/u;
  const timer = setInterval(() => {
    ticks++;
    if (ticks > 200) { finish('timeout'); return; }
    if (!document.querySelector('[data-testid="opv-btn"]')) return;
    clearInterval(timer);

    result.motion = document.documentElement.dataset.motion || '(none)';
    result.title = document.title;
    result.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 无头 Chrome 恒定模拟 prefers-reduced-motion: reduce，且无法用启动参数关掉。
    // 测试时把这条 media rule 从活动样式表里删掉，才能量到满血版本来会生效的动效。
    let removed = 0, fullRules = 0, keyframes = 0;
    for (const sheet of document.styleSheets) {
      let rs; try { rs = sheet.cssRules; } catch (e) { continue; }
      for (let i = rs.length - 1; i >= 0; i--) {
        const r = rs[i];
        const txt = r.cssText || '';
        if (txt.includes('data-motion') && txt.includes('full')) fullRules++;
        if (r.type === CSSRule.KEYFRAMES_RULE && /ui-(rise|live-pulse|rotate|sweep|grow)/.test(r.name || '')) keyframes++;
        if (r.conditionText && r.conditionText.includes('prefers-reduced-motion')) {
          sheet.deleteRule(i); removed++;
        }
      }
    }
    result.removedMediaRules = removed;
    result.fullRuleCount = fullRules;
    result.keyframeCount = keyframes;

    const stagger = document.querySelector('.ui-masthead-top > *');
    result.staggerAnimation = stagger ? getComputedStyle(stagger).animationName : '(none)';

    // 活体指示：静帧版 animationName 必须是 none，满血版必须是 ui-live-pulse
    const live = document.createElement('span');
    live.className = 'ui-live';
    document.body.appendChild(live);
    result.liveAnimation = getComputedStyle(live).animationName;

    // 按钮过渡时长：静帧版 0s，满血版 0.16s
    const btn = document.querySelector('[data-testid="start-contest"]');
    result.btnTransition = btn ? getComputedStyle(btn).transitionDuration : '(no button)';

    // 方角 / 阴影 / 主题色
    const panel = document.querySelector('.rounded-2xl') || document.querySelector('.rounded-xl');
    result.panelRadius = panel ? getComputedStyle(panel).borderRadius : '(none)';
    result.bodyBg = getComputedStyle(document.body).backgroundColor;
    result.signal = getComputedStyle(document.documentElement).getPropertyValue('--signal').trim();

    // Lucide 图标是否真的渲染成 svg
    result.svgIcons = document.querySelectorAll('svg.ui-ic').length;

    // 界面文本里是否还有 emoji
    const txt = document.body.innerText || '';
    result.emojiInUI = (txt.match(new RegExp(G.source, 'gu')) || []).slice(0, 10);
    result.hasMasthead = !!document.querySelector('.ui-masthead');
    result.textSample = txt.replace(/\s+/g, ' ').slice(0, 160);
    finish('ok');
  }, 50);
  function finish(status) {
    clearInterval(timer);
    result.status = status;
    const out = document.createElement('div');
    out.id = 'motion-test-result';
    out.textContent = 'MOTION_RESULT_JSON:' + JSON.stringify(result) + ':END';
    document.body.appendChild(out);
  }
})();
</script>
`;

function probe(file) {
  const target = join(ROOT, '_motion-verify.html');
  let html = readFileSync(join(ROOT, file), 'utf8');
  html = html.replace('</body>', DRIVER + '\n</body>');
  writeFileSync(target, html, 'utf8');

  const profile = mkdtempSync(join(tmpdir(), 'motion-verify-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--virtual-time-budget=12000',
    '--allow-file-access-from-files', '--dump-dom',
    pathToFileURL(target).href,
  ];
  const r = spawnSync(BROWSER, args, { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, timeout: 120000 });
  const dom = r.stdout || '';
  const m = dom.match(/MOTION_RESULT_JSON:(\{[\s\S]*?\}):END/);
  console.log(`\n===== ${file} =====`);
  if (!m) {
    console.log('没有拿到结果，exit', r.status, 'stderr:', (r.stderr || '').slice(0, 600));
    return null;
  }
  const data = JSON.parse(m[1]);
  console.log(JSON.stringify(data, null, 2));
  try { rmSync(target, { force: true }); } catch { /* ignore */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  return data;
}

const a = probe('OI模拟赛-OPv-静帧.html');
const b = probe('OI模拟赛-OPv-满血.html');

const issues = [];
if (!a || !b) issues.push('探针未返回结果');
else {
  if (a.motion !== 'static' || b.motion !== 'full') issues.push('data-motion 开关不正确');
  if (a.liveAnimation !== 'none') issues.push('静帧版仍在跑动画：' + a.liveAnimation);
  if (b.liveAnimation !== 'ui-live-pulse') issues.push('满血版缺少活体动效：' + b.liveAnimation);
  if (b.staggerAnimation !== 'ui-rise') issues.push('满血版缺少入场动效：' + b.staggerAnimation);
  if (b.fullRuleCount < 8 || b.keyframeCount < 5) issues.push('满血版动效 CSS 规则缺失');
  if (a.btnTransition !== '0s') issues.push('静帧版仍有过渡：' + a.btnTransition);
  if (b.btnTransition === '0s') issues.push('满血版按钮过渡未生效：' + b.btnTransition);
  if (a.emojiInUI.length || b.emojiInUI.length) issues.push('界面仍含表情符号');
  if (a.svgIcons < 3 || b.svgIcons < 3) issues.push('Lucide 图标没有渲染');
  if (!a.hasMasthead || !b.hasMasthead) issues.push('报头未渲染');
}
console.log('\n===== 结论 =====');
console.log(issues.length ? 'FAIL: ' + issues.join(' / ') : 'PASS · 静帧零动画 / 满血有动效 / 两版均无 emoji / Lucide 图标正常');
if (issues.length) process.exitCode = 1;
