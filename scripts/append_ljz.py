# -*- coding: utf-8 -*-
import io, json

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
P = BASE + r'\data\level-analysis.md'
M = BASE + r'\data\blog-roster-mapping.json'

section = '''
---

## 李君泽（初三 · 校内 OIerDb #25）

**洛谷**：uid 745347，`L_Merengues`，**红名**，ccf 5，ranking **2039**，AC 830 / 提交 870，注册 2022-07-03，签名「Hala Madrid!」（皇马球迷，文章里足球含量极高）。
**OIerDb**：uid 202403，全国 **7264** / 5094.70 / CCF 6，初三，高新三中（注意：OIerDb 里另有一个更强的「李君泽」uid 162665 / 10307.93，不是他，别混）。
**校 OJ**：`{ name: "李君泽", lv: 4, rp: 286, ac: 689, rank: 24, rating0: 1682 }`（roster 快照 oierdb 14419/2260.78 严重过时）。

### 比赛记录（OIerDb 官网口径）
| 赛事 | 奖项 | 分数 | 排名/参赛 | 年级 |
|---|---|---|---|---|
| CSP 2026 提高 | 一等 | **160** | 6304 / 32643（前 19.3%） | 初三 |
| CSP 2026 入门 | 一等 | **353** | 1520 / 43864 | 初三 |
| CSP 2025 提高 | 二等 | **60** | 11402 / 30497 | 初二 |
| CSP 2025 入门 | 一等 | 279 | 5314 / 39205 | 初二 |
| CSP 2024 提高 | 一等 | 130 | 7963 / 27521 | 初一 |
| CSP 2024 入门 | 二等 | 200 | 12203 / 40430 | 初一 |

NOIP 2025：以「神秘后备名额」参赛（游记原话），T1 贪心调了一个小时样例、其余暴力，**没有拿到奖**；这也是他第一次进 NOIP。

### 专栏（37 篇，2025-01 ~ 2026-11）
- **游记 4 篇**：《CSP-J 2026 游记》（「最后一年 J 组了能否 AK？」，估 331–362，T1 因「F」阵亡）、《NOIP2025 游记》（「失败中的失败」）、《CSP2025 游寄》、《足球生涯模拟器》。
- **整活为主**：《2026 美加墨世界杯》《BY2027届七一史》《足球生涯模拟器》——他是队里少见的「足球 + OI」双线程。
- **题解**：ICPC 2022 Tehran R Magic with Cards、MX-S12-T1 取模、Algo Beat Contest 002 题目分配（7 赞）/Bicycle Competition、GCPC 2023、GCJ 2011/2016、KOI 2021 橡皮擦、JSOI2008 球形空间产生器，以及 NOIP 2004/2005 水题。
- **笔记**：Tarjan（vector 存图版）、各种式子、DP 推导。

### 判断
- **J 组强、S 组弱，落差极大**：J 组 200→279→**353（全国 1520）**，S 组 130→**60**→160。2025 年 S 组 60 分是明显的崩盘，2026 才回到 160。
- **洛谷红名 / ranking 2039 / AC 830** 但正赛只有 160，这个组合说明：**刷题量和不稳定性严重不匹配**——平时能做出不少题，考场上产出不出来。典型症状在他游记里写得很清楚：T1 能磨一个小时、其余题「写暴力获得 eps 分」。
- 和同届的蔡青辰（263）、周檬轩（268）比，他的正赛分数低一档，但洛谷排名反而更高——**「刷题型而非应试型」**。
- 高一还有机会，如果正赛心态与时间分配不改善，大概率止步省级一等。
- **游戏彩蛋（用户提供，m01590）**：他曾谈过一段恋爱。建议做成隐晦彩蛋——比如某个场景的「抽屉里的旧信 / 未送出的礼物 / 看台上空着的座位」，与他的皇马/足球线绑定，**不点名、不描写细节**，让知道的人会心一笑即可。
'''

with io.open(P, 'a', encoding='utf-8', newline='\n') as f:
    f.write(section)

d = json.load(io.open(M, encoding='utf-8'))
rows = d['mapping']
if not any(r.get('abbr') == 'Ljz' for r in rows):
    rows.append({
        "abbr": "Ljz",
        "luogu": "L_Merengues",
        "uid": 745347,
        "blogGrade": None,
        "gameName": "李君泽",
        "gameRealName": "李君泽",
        "gameGrade": "初三",
        "quotes": 0,
        "boundQuotes": 0,
        "confidence": "用户确认",
        "evidence": "用户 2026-11-15 提供 L_Merengues=李君泽；洛谷 uid 745347 红名 ccf5；OIerDb uid 202403（全国 7264/5094.70），CSP-J 2026 353 与其游记「估 331-362」一致；注意 OIerDb 另有同名 uid 162665 更强，非本校。"
    })
d['mapping'] = rows
with io.open(M, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print('ok rows', len(rows))
