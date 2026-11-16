# -*- coding: utf-8 -*-
import io, json

MD = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\level-analysis.md'
MAP = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\blog-roster-mapping.json'

section = '''## 张轩程（zxc / ref_rainT，初三 · 校内 OIerDb #28）

**洛谷**：uid 661274，`ref_rainT`（原名 `Brainless_zxc`），**蓝名**，ccf 未绑定，ranking 90793，注册 2022-01-09，签名「下次见面时我们会手捧鲜花」。AC 数隐藏。
**OIerDb**：uid 181656，全国 **8634** / 4509.97 / CCF 5，初三。
**注**：不在 `src/roster.ts` 的 54 人名单里（和夏菁阳、张笑语一样是「名单外」选手）。

### 比赛记录
| 赛事 | 分数 | 奖项 | 排名/参赛 |
|---|---|---|---|
| CSP 2026 提高 | **98** | 二等 | 12988 / 32643（前 39.8%） |
| CSP 2026 入门 | 232 | 一等 | 11214 / 43864 |
| CSP 2025 提高 | 128 | 一等 | 6229 / 30497（前 20.4%） |
| CSP 2025 入门 | 285 | 一等 | 4786 / 39205 |
| CSP 2024 提高 | 120 | 二等 | 8585 / 27521 |
| CSP 2024 入门 | 260 | 一等 | 4492 / 40430 |
| CSP 2023 入门 | 110 | 一等 | 9650 / 28869 |

S 组序列：**120 → 128 → 98**，最近一年 **−30**（成长指数 40，全队最低一档）。

### 专栏（5 篇，2023-09 ~ 2026-08）
- 《**行列式入门**》**43 赞**（2026-04）
- 《浅谈 **Cauchy-Binet 公式**》**26 赞**（2026-08）
- 《矩阵的若干运算及其性质》7 赞（2026-05）
- 《造句练习》3 赞（2023）、整活《圣经》3 赞（2025）

**全队唯一的「线性代数专栏作者」**：三篇线代长文累计 76 赞，写法是严格定义 → 定理 → 证明，不是题解套路。评论量和收藏数据说明在洛谷上有真实读者。

### 判断
- **纸面极强、实战极弱**的极端案例。专栏写的是大学线性代数（行列式、Cauchy-Binet），水平明显超出初三竞赛生平均；但 CSP-S 三年 120→128→98，S 组从未进过省一前列，OIerDb 全国 8634。
- 两种解释：(a) 他把时间放在数学/写作上，竞赛训练量不足；(b) 他的长处在「理解与表达」，不在「限时手速」。——现有数据支持 (b) 更多：三篇线代文都是慢工，没有任何算法题解或游记。
- 2026 年 S 组跌到 98，是**倒退**，不是波动（前一年 128）。
- 洛谷蓝名 + ranking 90793 与 76 赞专栏并存，也印证「写作型账号」而非「刷题型账号」。

### 游戏数值
- **实力 26.4**（CSP 分项 26.4；无 NOIP/NOI 记录，按 CSP 补齐）
- **成长 40**（−30/年，唯一负增长的现役选手）
- 建议做成「学者型 NPC」：战斗力低、但提供技能书/公式解锁（把线代专长转成游戏内的「推演」或「构造」类能力），而不是当战斗角色。

'''

with io.open(MD, encoding='utf-8') as f:
    txt = f.read()
marker = '## 附：量化口径与总表'
idx = txt.find(marker)
assert idx > 0
txt = txt[:idx].rstrip() + '\n\n' + section + txt[idx:]
with io.open(MD, 'w', encoding='utf-8', newline='\n') as f:
    f.write(txt)
print('section added, chars', len(txt))

with io.open(MAP, encoding='utf-8') as f:
    data = json.load(f)

rows = data.get('mappings') or data.get('rows') or []
print('map keys', list(data.keys()))
