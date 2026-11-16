# -*- coding: utf-8 -*-
import io, json

MD = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\level-analysis.md'
MAP = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\blog-roster-mapping.json'

section = '''## 代羽辰（dyc / ChengShihan0716，初三 · 校内 OIerDb #30）

**洛谷**：uid 1662833，`ChengShihan0716`，橙名，**ccfLevel 4**，ranking 5374，注册 **2025-02-09**，签名「你已在洛谷连续打卡了 339 天」。AC 数隐藏。
**OIerDb**：uid 237485，全国 **14581** / 3018.83 / CCF 5，初三。
**校 OJ**：`{ name: "代羽辰", lv: 3, rp: 272, ac: 431, rank: 42, rating0: 1492 }`（roster 里的 rank 42）。

### 比赛记录
| 赛事 | 分数 | 奖项 | 排名/参赛 |
|---|---|---|---|
| CSP 2026 入门 | **372** | 一等 | 907 / 43864（前 2.1%） |
| CSP 2026 提高 | 90 | 二等 | 13385 / 32643（前 41.0%） |
| CSP 2025 入门 | 213 | 二等 | 14735 / 39205 |
| CSP 2024 入门 | 100 | 二等 | 21930 / 40430 |

**没有 CSP-S 2025 记录**（要么没报名、要么未上二等线未收录）；S 组只有 2026 年这一场 90 分。

### 专栏（3 篇，2026-01 ~ 2026-10）
- 题解《P10687 True Liars》5 赞
- 题解《P10647 [NordicOI 2023] Ice Cream Machines》3 赞
- 《粉色折痕里的离心机》（cat8，0 赞，2026-10）——标题是散文/小说式的，不是题解。

### 判断
- **J 组强、S 组刚起步**：J 2026 的 372 分（前 2.1%）是硬成绩，但同届 S 组 90 分只到二等中段，说明他刚转提高组、还没适应。
- 洛谷 2025-02 才注册、橙名、连续打卡 339 天——**执行力和日常坚持是这批人里最好的一档**；但专栏产量低（3 篇），公开积累少。
- 校 OJ 第 42 / OIerDb 14581 与 J 组 372 的错位，说明他的分数主要来自「J 组舒适区」。
- 数据不足以判断成长：S 组只有一年记录。

### 游戏数值
- **实力 25.7**（S2026 90 分；无 NOIP/NOI，按 CSP 补齐）
- **成长：无法测量**（S 组仅 1 年）——建议给中性 50，或按 J 组斜率（100→213→372，两年 +136/年）给 **75** 并标注「J 组口径」
- 角色定位建议：新人/成长型，起点低但训练效率高（打卡 339 天），做成「勤勉」特性。

'''

with io.open(MD, encoding='utf-8') as f:
    txt = f.read()
marker = '## 附：量化口径与总表'
idx = txt.find(marker)
assert idx > 0
txt = txt[:idx].rstrip() + '\n\n' + section + txt[idx:]
txt = txt.replace('（25 人里排第 20）', '（27 人总表里排第 21）')
with io.open(MD, 'w', encoding='utf-8', newline='\n') as f:
    f.write(txt)
print('section added, chars', len(txt))

with io.open(MAP, encoding='utf-8') as f:
    data = json.load(f)
rows = data['mapping']
new = {
    "abbr": "Dyc2",
    "luogu": "ChengShihan0716",
    "uid": 1662833,
    "blogGrade": None,
    "gameName": "代羽辰",
    "gameRealName": "代羽辰",
    "gameGrade": "初三",
    "quotes": 0,
    "boundQuotes": 0,
    "confidence": "用户确认",
    "evidence": "用户 2026-11-15 说 dyc=ChengShihan0716（此处 dyc 指游戏角色代羽辰，非丁一宸的 Dyc）；洛谷 uid 1662833 橙名 ccf4；OIerDb uid 237485 全国 14581/3018.83。"
}
hit = None
for r in rows:
    if r.get('uid') == 1662833:
        hit = r
        break
if hit is None:
    rows.append(new)
    print('appended')
else:
    hit.update(new)
    print('updated')
with io.open(MAP, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('rows', len(rows))
