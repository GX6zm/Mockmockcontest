# -*- coding: utf-8 -*-
import io
import json
import os

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
P = os.path.join(BASE, 'data', 'level-analysis.md')
M = os.path.join(BASE, 'data', 'blog-roster-mapping.json')

section = '''
---

## LIjintong（李金潼，高一）— 游戏角色「李金潼」

**账号**：洛谷 uid 738431，绿名，ccfLevel 6，ranking 15513，AC 920 / 提交 997，注册 2022-06-14，签名「夜幕临，彩灯起，执千转，空无依 || 头像来自我自己 || 私信壶关，要求活人 || 终有返生」。
**OIerDb**：uid 168639，全国 2825→8427.02 / CCF 7，高一，高新三中。roster 里有同名条目（校 OJ 第 12，rating0 1769 一带）。

### 比赛记录（OIerDb 官网口径）
| 赛事 | 奖项 | 分数 | 排名/参赛 | 年级 |
|---|---|---|---|---|
| CSP 2026 提高 | 一等 | 248 | 1691 / 32643 | 高一 |
| CSP 2026 入门 | 一等 | 390 | 504 / 43864 | 高一 |
| CSP 2025 入门 | 一等 | **400** | **1 / 39205（全国第一）** | 初三 |
| CSP 2025 提高 | 一等 | 101 | 8412 / 30497 | 初三 |
| CSP 2024 提高 | 一等 | 180 | 4285 / 27521 | 初二 |
| CSP 2024 入门 | 一等 | 230 | 8641 / 40430 | 初二 |
| CSP 2023 提高 | 二等 | 100 | 7528 / 19202 | 初一 |

无 NOIP/APIO/NOI/省选记录。

### 专栏（只有 7 篇，全是整活/杂谈，零题解零笔记）
- 《CSP2026 SN迷惑行为大赏》（cat7）、《新春会大盘点》、《小说（可能永远不会写）》、《答案之书（并非）百问百答》、《入类技能树》、《东方原曲写写。》、《c++冷门小知识》。
- 分类清一色 cat1/cat7，**一篇题解、一篇学习笔记都没有**——这在全队里是独一份。

### 判断
- **低开高走型**：2025 年 S 组只有 101 分（J 组却满分全国第一，落差极大），2026 年 S 组直接 248（1691/32643，前 5.2%），进步幅度全队最猛之一。
- J 组能考 400 说明**基础与细节扎实、简单题不会挂**；S 组 101→248 说明提高组知识点是这一年在补。目前 S 组水平在第三梯队中上（248 低于张顺凯 228？不，高于；略低于陈泉林 270、柏鹭鸣 316）。
- 没有技术文章可参考，但从《C++冷门小知识》《入类技能树》看是**喜欢钻偏门细节**的类型。
- 校内定位：OIerDb 折算第 12，实际 S 组成绩已进入校内前八；上限取决于能否把 J 组的稳定性迁移到 S 组难题上。
'''

with io.open(P, 'a', encoding='utf-8', newline='\n') as f:
    f.write(section)

d = json.load(io.open(M, encoding='utf-8'))
rows = d['mapping']
if not any(r.get('abbr') == 'Ljt' for r in rows):
    rows.append({
        "abbr": "Ljt", "luogu": "LIjintong", "uid": 738431, "blogGrade": None,
        "gameName": "李金潼", "gameRealName": "李金潼", "gameGrade": "高一",
        "quotes": 0, "boundQuotes": 0, "confidence": "用户确认",
        "evidence": "用户 2026-11-15 提供：LIjintong = ljt；洛谷 /api/user/search 返回 uid 738431、绿名、ccf6；OIerDb uid 168639 同名同校。",
    })
d['userCorrections'] = d.get('userCorrections', []) + [
    "2026-11-15：LIjintong = ljt = 李金潼（洛谷 uid 738431）。"]
d['meta']['updatedAt'] = '2026-11-15'
io.open(M, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2))
print('ok, mapping rows', len(d['mapping']))
