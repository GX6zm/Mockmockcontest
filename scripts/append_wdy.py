# -*- coding: utf-8 -*-
import io, json

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
P = BASE + r'\data\level-analysis.md'
M = BASE + r'\data\blog-roster-mapping.json'

section = '''
---

## 王鼎翼（高一 · 校内 OIerDb #27）

**洛谷**：uid 1038776，`WDY_Hodur`，绿名，**ccfLevel 0（未绑定）**，ranking 37302，AC 387 / 提交 418，注册 2023-07-12，签名「天地不仁，以万物为刍狗；圣人不仁，以百姓为刍狗。」
**OIerDb**：uid 204676，全国 **9117** / 4904.80 / CCF 6，高一，高新三中。
**校 OJ**：`{ name: "王鼎翼", lv: 6, rp: 297, ac: 934, rank: 9, rating0: 1740 }`——**校 OJ 第 9，比 OIerDb 的 #27 高出一大截**，这在本批里只有柏鹭鸣出现过类似反差。

### 比赛记录（OIerDb 官网口径）
| 赛事 | 奖项 | 分数 | 排名/参赛 | 年级 |
|---|---|---|---|---|
| CSP 2026 提高 | 一等 | **200** | 4247 / 32643（前 13%） | 高一 |
| CSP 2025 入门 | 一等 | **380** | 920 / 39205 | 初三 |
| CSP 2025 提高 | 一等 | 148 | 5006 / 30497 | 初三 |
| CSP 2024 入门 | 二等 | 220 | 10210 / 40430 | 初二 |
| CSP 2024 提高 | 二等 | 120 | 8585 / 27521 | 初二 |

无 NOIP / APIO / 省选记录。

### 专栏（10 篇，2024-03 ~ 2025-12，之后停更）
- **9 篇题解，难度不低**：《P10592 BZOJ4361 isn》（**9 赞**）、《P12029 [USACO25OPEN] Election Queries G》（4 赞）、《P14760 [Opoi 2025] CCD 的游戏》、《P3285 [SCOI2014] 方伯伯的 OJ》、《P12422 MX-X12-T5 Another string problem》、《P8896 DPOI-1 道路规划》、《AT_abc219_h Candles》、《P1983 NOIP2013 车站分级》、《P3503 POI2010 KLO-Blocks》。
- 1 篇《Tarjan》笔记。
- 从他选的题看，**DP + 数据结构（树状数组/线段树动态开点）+ 图论**是主攻方向；题解写得直白简短，不整活。

### 判断
- **CSP-S 120 → 148 → 200，稳步爬升**，每年 +30 左右，是这一批里节奏最健康的；J 组 380（全国 920）说明基础很硬。
- 但**正赛与校 OJ 排名错位**明显：校 OJ 第 9，OIerDb 只有 #27（9117），说明他在校内模拟赛/日常训练里表现好，正赛发挥打折。
- 洛谷 AC 只有 387（同批最少之一），ranking 37302，但题解难度集中在蓝紫——**题不在多，在挑难题写**。ccfLevel 0 大概率是没去洛谷认领。
- 专栏 2025-12 后停更，高一（2026）是否还活跃未知；按趋势合理预期 S 组能到 230–250，进省队（E 类）需要一次爆发。
- 游戏设定建议：**「训练场战神」**——校内 OJ 排名极高、正赛却中游；技能面板「模拟赛加成」。
'''

with io.open(P, 'a', encoding='utf-8', newline='\n') as f:
    f.write(section)

d = json.load(io.open(M, encoding='utf-8'))
rows = d['mapping']
if not any(r.get('abbr') == 'Wdy' for r in rows):
    rows.append({
        "abbr": "Wdy",
        "luogu": "WDY_Hodur",
        "uid": 1038776,
        "blogGrade": None,
        "gameName": "王鼎翼",
        "gameRealName": "王鼎翼",
        "gameGrade": "高一",
        "quotes": 0,
        "boundQuotes": 0,
        "confidence": "用户确认",
        "evidence": "用户 2026-11-15 提供 WDY_Hodur=王鼎翼；洛谷 uid 1038776 绿名 ccf0；OIerDb uid 204676（全国 9117/4904.80），校 OJ 第 9。"
    })
d['mapping'] = rows
with io.open(M, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print('ok rows', len(rows))
