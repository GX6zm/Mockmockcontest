import fs from 'node:fs';
const p = 'data/level-analysis.md';
let s = fs.readFileSync(p, 'utf8');
const block = `
---

## 补充（2026-11-16）：三个账号由用户确认

### 陈和骏 — Stuart220_Chen（洛谷 1337513）/ OIerDb 204668
- 初二，CCF 7。CSP-S 2026 **350（全国 149/32643）**；CSP-J 2025 **400（并列全国第 1）**；CSP-S 2025 206（2288）。
- 洛谷：绿名、ccf 未绑定、AC 751。OIerDb 评分 7618.8，本校仅次于吕明栩。
- 判断：S 组一年从 206 到 350，是这一届涨幅最大的之一；J 组满分说明基础极稳。**实力 83.4 / 成长 58**。

### 张培楠 — The_Wandering_Earth（洛谷 809165）/ OIerDb 170607
- 高一，CCF 7，OIerDb 评分 7554。CSP-S 2026 219（3360）；S 组 65(2023) → 130(2024) → 213(2025) → 219(2026)。
- 判断：稳步爬坡型，不是爆发型；洛谷 AC 894。**实力 53.1 / 成长 48**。

### 孙可轩 — FallInDream（洛谷 1035594）/ OIerDb 204692
- 高一，CCF 6，OIerDb 评分 5851.14。CSP-S 2026 218（3395）；CSP-J 2025 **400（并列全国第 1）**；CSP-S 2025 140。
- 判断：J 组满分、S 组一年 +78，但 S 组绝对分还在 220 附近；成长指数被「满分起点」压低。**实力 53.0 / 成长 53**。
`;
if (!s.includes('陈和骏 — Stuart220_Chen')) {
  s = s + block;
  fs.writeFileSync(p, s, 'utf8');
}
console.log('level-analysis len=', s.length);
