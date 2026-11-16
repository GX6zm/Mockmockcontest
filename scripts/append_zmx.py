# -*- coding: utf-8 -*-
import io
import json
import os

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
P = os.path.join(BASE, 'data', 'level-analysis.md')
M = os.path.join(BASE, 'data', 'blog-roster-mapping.json')

section = '''
---

## Zhou_Lemon（周檬轩，初三）— 游戏角色「周檬轩」

**账号**：洛谷 uid 1602119，绿名，ccfLevel 0（未绑定），ranking 18202，AC 766 / 提交 785，**注册 2024-11-30**（新号），签名「人生如逆旅，我才是真正的行人……」。
**OIerDb**：uid 237511，全国 3014 / 8176.46 / CCF 7，初三，高新三中。roster：lv5、rp 286、ac 705、rank 23、rating0 1704（快照 9370/3246.47、ccf7、初三）。

### 比赛记录（OIerDb 官网口径）
| 赛事 | 奖项 | 分数 | 排名/参赛 | 年级 |
|---|---|---|---|---|
| CSP 2026 入门 | 一等 | **400** | **1 / 43864（全国第一）** | 初三 |
| CSP 2026 提高 | 一等 | 268 | 953 / 32643（前 2.9%） | 初三 |
| CSP 2025 提高 | 一等 | 189 | 2953 / 30497 | 初二 |
| CSP 2025 入门 | 一等 | 385 | 902 / 39205 | 初二 |
| CSP 2024 入门 | 二等 | 100 | 21930 / 40430 | 初一 |

无 NOIP/APIO/省选记录。

### 专栏（13 篇，2025-06 ~ 2026-08，全是学习笔记 + 少量题解）
- 学习笔记 10 篇：并查集、图论基础、分块与莫队、组合数取模、概率与期望、CDQ 分治与整体二分、**《一种新型的平衡树》**、《详细揭秘：如何优化线段树复杂度》、《[JSOI2009] 密码 做题感想》、《个人收藏整理》。
- 题解 2 篇：P15612 [ICPC 2021 Jakarta R] Feeder Robot（2 赞）、P10632 Normal（2 赞）。
- 杂谈 1 篇《神品乐章》（cat7）。
- 特点：**边学边写、系统性极强**，从并查集一路写到概率期望、CDQ、平衡树，2026 年还在更新——是全队少见的「持续写笔记」的初中生。

### 判断
- **校内初中段最强之一**：J 组 100 → 385 → **400 全国第一**，S 组 189 → 268，两年完成从入门到前 3% 的跨越。
- 洛谷账号 2024-11 才注册，ranking 18202 说明刷题量还不大，但笔记密度高——**学习效率型**选手，靠理解而非题海。
- 与同校 J 组满分的周炜恒/李金潼/陈逸阳不同：周檬轩还只是**初三**，且 S 组 268 已经是他们高一的水平，**上升空间最大**。
- 校内定位：OIerDb 折算第 14（初中生在这套折算里吃亏），实际按 S 组 268 应在校内前八；2027 年升入高中后是省队的重点培养对象。
- 风险：洛谷 ccf 未绑定、无 NOIP 经历，**提高组后期（NOIP/省选）尚未验刀**。

---

'''

with io.open(P, 'a', encoding='utf-8', newline='\n') as f:
    f.write(section)

d = json.load(io.open(M, encoding='utf-8'))
rows = d['mapping']
if not any(r.get('luogu') == 'Zhou_Lemon' for r in rows):
    rows.append({
        "abbr": "Zmx", "luogu": "Zhou_Lemon", "uid": 1602119, "blogGrade": None,
        "gameName": "周檬轩", "gameRealName": "周檬轩", "gameGrade": "初三",
        "quotes": 0, "boundQuotes": 0, "confidence": "用户确认",
        "evidence": "用户 2026-11-15 提供 Zhou_Lemon；洛谷 /api/user/search 返回 uid 1602119、绿名；OIerDb uid 237511 同名同校，初三。",
    })
d['userCorrections'] = d.get('userCorrections', []) + [
    "2026-11-15：Zhou_Lemon = 周檬轩（洛谷 uid 1602119）。"]
d['meta']['updatedAt'] = '2026-11-15'
io.open(M, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2))
print('ok, mapping rows', len(d['mapping']))
