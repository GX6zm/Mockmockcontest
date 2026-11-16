# -*- coding: utf-8 -*-
import io
import json
import os

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
P = os.path.join(BASE, 'data', 'level-analysis.md')
M = os.path.join(BASE, 'data', 'blog-roster-mapping.json')

section = '''
---

## llamn（陈逸阳，高一）— 游戏角色「陈逸阳」

**账号**：洛谷 uid 1038651，**红名**，ccfLevel 7，**ranking 682**（全校最高），AC 644 / 提交 703，注册 2023-07-12，签名空。
**OIerDb**：uid 178319，全国 2827 / 8426.62 / CCF 7，高一，高新三中。roster：lv4、rp 278、ac 523、rank 31、rating0 1717（快照 3934/5911.99 已过时）。

### 比赛记录（OIerDb 官网口径）
| 赛事 | 奖项 | 分数 | 排名/参赛 | 年级 |
|---|---|---|---|---|
| CSP 2026 提高 | 一等 | 243 | 2012 / 32643 | 高一 |
| CSP 2025 提高 | 一等 | 212 | 2068 / 30497 | 初三 |
| CSP 2025 入门 | 一等 | **400** | **1 / 39205（全国第一）** | 初三 |
| CSP 2024 提高 | 一等 | 220 | 2513 / 27521 | 初二 |
| CSP 2024 入门 | 一等 | 260 | 4492 / 40430 | 初二 |
| CSP 2023 入门 | 一等 | 160 | 6328 / 28869 | 初一 |
| NOIP 2024 | 一等 | 208 | 自述（100+100+0+8） | 初三 |
| NOIP 2025 | 无奖 | 123 | 自述（95+28） | 高一 |

### 专栏（32 篇，洛谷高产，风格鲜明）
- **爆款整活**《别样的 NOIP 大战（CCF视角）》**58 赞**，把 CCF 拟人成对手，写「一记紫黑黑，一飞冲天」。
- 游记：NOIP 2024 游记（7 赞）——初三第一次 NOIP 208 分，T1 字符串贪心「场切蓝题」，自己评价「紫题黑题 0AC、ST 表和 LCA 都不会、T4 写了 2 小时拿 8 分」。
- 题解 15+ 篇：P11361 [NOIP2024] 编辑字符串（27 赞）、A+B（15 赞）、肥胖问题（15 赞）、P12681（13 赞）、P12401 COI 玻利维亚（11 赞）——**从红题到蓝题全覆盖**，早期靠水题题解攒声望。
- 技术小文：《不常见卡常方法》《vector::insert 常数测试》《宏函数重载与自动生成 is_type 函数》《调试：显示变量名和值》《借助工具绘制线段树》《考场缺省源》《我的板子》——**工程/调试向**，习惯把优化细节做成实验记录。

### 判断
- 洛谷 **ranking 682** 是全队最高，但那是「刷题活跃度 + 题解获赞」的综合分，不能直接当实力；实际比赛最高 CSP-S 243（2012/32643），NOIP 2024 208、NOIP 2025 掉到 123（**NOIP 明显是他的坎**）。
- 技术画像：**广度型 + 工程型**，卡常、宏、调试工具、板子都自己写；题解横跨红到蓝说明基础面铺得广，但游记里自陈「紫黑 0AC、不会 ST 表和 LCA」说明**深度不够**，是靠简单题和暴力分堆出来的成绩。
- 风格与性格：幽默、自黑、文学化（58 赞的整活文是全队传播最广的一篇），但 NOIP2025「乱推组合数、最后半小时瞎写」的崩盘也说明**临场策略弱**。
- 校内定位：OIerDb 折算第 13、校 OJ 第 31，实际 S 组成绩在第三梯队中游；NOIP 是他的天花板检测点，两届都在 123–208 徘徊，**冲省队需要先把 NOIP 打上 200+**。
'''

with io.open(P, 'a', encoding='utf-8', newline='\n') as f:
    f.write(section)

d = json.load(io.open(M, encoding='utf-8'))
rows = d['mapping']
if not any(r.get('luogu') == 'llamn' for r in rows):
    rows.append({
        "abbr": "Cyy", "luogu": "llamn", "uid": 1038651, "blogGrade": None,
        "gameName": "陈逸阳", "gameRealName": "陈逸阳", "gameGrade": "高一",
        "quotes": 0, "boundQuotes": 0, "confidence": "用户确认",
        "evidence": "用户 2026-11-15 提供 llamn；洛谷 /api/user/search 返回 uid 1038651、红名、ccf7；OIerDb uid 178319 同名同校，年级/学校一致。",
    })
d['userCorrections'] = d.get('userCorrections', []) + [
    "2026-11-15：llamn = 陈逸阳（洛谷 uid 1038651）。"]
d['meta']['updatedAt'] = '2026-11-15'
io.open(M, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2))
print('ok, mapping rows', len(d['mapping']))
