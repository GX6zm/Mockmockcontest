# -*- coding: utf-8 -*-
import io
import json
import os

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
P = os.path.join(BASE, 'data', 'level-analysis.md')
M = os.path.join(BASE, 'data', 'blog-roster-mapping.json')

section = '''
---

## Flynewcat（苗淇，初三）— 游戏角色「苗淇」· 已退役

**账号**：洛谷 uid 781437，橙名，ccfLevel 6，ranking 8511，AC 433 / 提交 530，注册 2022-08-26，签名「我该在哪里停留？我问我自己」。
**OIerDb**：uid 207126，全国 3749 / 7379.51 / CCF 7，初三，高新三中。roster：lv3、rp 274、ac 485、rank 35、rating0 1679（快照 8040/3653.89）。

### 比赛记录（OIerDb 官网口径）
| 赛事 | 奖项 | 分数 | 排名/参赛 | 年级 |
|---|---|---|---|---|
| CSP 2026 入门 | 一等 | 390 | 504 / 43864 | 初三 |
| CSP 2026 提高 | 一等 | 211 | 3707 / 32643 | 初三 |
| CSP 2025 提高 | 一等 | 188 | 3001 / 30497 | 初二 |
| CSP 2025 入门 | 一等 | 295 | 4244 / 39205 | 初二 |
| NOIP 2025 | 无奖 | 100 | 自述 | 初二 |
| CSP 2024 提高 | 二等 | 100 | 11554 / 27521 | 初一 |
| CSP 2024 入门 | 一等 | 260 | 4492 / 40430 | 初一 |

无 NOI/APIO/省选（2026 省选未进队）。

### 专栏（19 篇，2025-01 ~ 2026-11）
- **《信竞的梦，该醒了……》（2026-03，82 赞 / 57 评论）**——全队传播量最高的文章之一，写了从小学 Scratch、四年级学而思、2023 年考进 GXYZ BY 班冬令营、集训落选、初一 CSP J260/S100、被劝退、求教练停课被拒、文化课崩、2025 CSP J295/S188、NOIP 100、省选后听说「陈泉*没进省队」梦想被击碎的全过程。
- **《退役帖·致敬我的青春》（2026-11-13）**——正式退役，留下长篇学习法则：手搓算法而非抄模板、先写暴力再优化最慢一环、看题解要「学思路不改代码」、AI 要「让讲解留白」、补题优先、「精力是一池水，睡眠是唯一回灌」。
- CSP 2026 游记（3 赞）、《9.29 初二运动会记录》×3、《睡神》《睡神 2》、地生会考经历（2 赞）。
- 题解 6 篇：P12707 KOI2021 橡皮擦（2 赞）、P3503 [POI2010] KLO-Blocks（3 赞）、UVA13108、UVA10557、P1080 国王游戏、P1048 采药——**难度集中在黄/橙，最高一道绿题**。

### 判断
- **天赋中上、环境最拧巴的一个**：三年里反复在文化课和竞赛之间被拉扯（停课申请被拒、被停竞赛课又求回来），CSP-S 188 → 211 进步缓慢，NOIP 100 分无奖，省选未进队。
- 技术面：题解最高绿题、AC 数 433，**知识面窄而浅**；但从《退役帖》的学习法则看，他的**方法论认知远超自己的执行水平**——知道该怎么练，只是没被执行条件和时间允许。
- 性格：极强的表达欲和自省能力（82 赞文章的写作质量是全队前列），情绪敏感、易受影响（「陈泉*没进省队」就直接击碎梦想）。
- 2026-11-13 已正式退役。给游戏角色写设定时，他是「心比天高、命比纸薄」那一类：值得给他一个「意难平」的结局线，而不是简单的弱者标签。

---

'''

with io.open(P, 'a', encoding='utf-8', newline='\n') as f:
    f.write(section)

d = json.load(io.open(M, encoding='utf-8'))
rows = d['mapping']
if not any(r.get('luogu') == 'Flynewcat' for r in rows):
    rows.append({
        "abbr": "Mq", "luogu": "Flynewcat", "uid": 781437, "blogGrade": None,
        "gameName": "苗淇", "gameRealName": "苗淇", "gameGrade": "初三",
        "quotes": 0, "boundQuotes": 0, "confidence": "用户确认",
        "evidence": "用户 2026-11-15 提供 苗淇=Flynewcat；洛谷 /api/user/search 返回 uid 781437、橙名、ccf6；OIerDb uid 207126 同名同校；2026-11-13 发退役帖。",
    })
d['userCorrections'] = d.get('userCorrections', []) + [
    "2026-11-15：Flynewcat = 苗淇（洛谷 uid 781437，已退役）。"]
d['meta']['updatedAt'] = '2026-11-15'
io.open(M, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2))
print('ok, mapping rows', len(d['mapping']))
