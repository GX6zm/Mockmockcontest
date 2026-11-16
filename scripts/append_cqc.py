# -*- coding: utf-8 -*-
import io, json

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
P = BASE + r'\data\level-analysis.md'
M = BASE + r'\data\blog-roster-mapping.json'

section = '''
---

## 蔡青辰（初三 · 校内 OIerDb #18）

**洛谷**：uid 1773073，`FFT_NTT_`，**红名**，ccf 5，ranking 2196，AC 484 / 提交 509，注册 **2025-06-02**（比同届晚一年进场，两年冲到红名）。签名「你是四月早天里的云烟，黄昏吹着风的软，星子在无意中闪，细雨点洒在花前。」
**OIerDb**：uid 253951，全国 **4583** / 6651.86 / CCF 7，初三，高新三中。
**校 OJ**：`{ name: "蔡青辰", lv: 5, rp: 290, ac: 794, rank: 18, rating0: 1684 }`

### 比赛记录（OIerDb 官网口径）
| 赛事 | 奖项 | 分数 | 排名/参赛 | 年级 |
|---|---|---|---|---|
| CSP 2026 提高 | 一等 | **263** | 1027 / 32643（前 3.1%） | 初三 |
| CSP 2026 入门 | 一等 | 338 | 2312 / 43864 | 初三 |
| CSP 2025 提高 | 二等 | 114 | 7101 / 30497 | 初二 |
| CSP 2025 入门 | 一等 | 350 | 1560 / 39205 | 初二 |

### 专栏（27 篇，2025-04 ~ 2026-11）
- **理论/造轮子**：《多层分块树》**25 赞 / 40 评论**（**自创**数据结构：递归分块，每层用辅助同构树维护块和，O(log n) 单点改 + 区间查，但常数极大，树状数组模板实测 2.4 s，「比我的 cdq 分治还慢」，结论挂在「目前唯一良好性质是树高 O(log log n)」）《数据结构专题》《字符串专题》。
- **学习笔记**（极密集）：SAM、网络流、数论函数、可持久化线段树、根号平衡 / bitset、状压 DP、《思维 - Level 1 总结》。
- **题解 6 篇**：P15322 MX-X24-T3 自行车、P12806 AMPPZ 2019 Drone Show、P16522 自破碎的天空坠落（2 赞）、P11827 TOIP 大步小步向前走（BSGS）、P14968 Hoping That One Day（3 赞）、P6080 USACO Cow Patterns、P14759 Opoi CCD 的异或 II。
- **整活**：《P 话 ge》1 篇、《成为 llamn 教程》（模仿陈逸阳的梗）、《初三上模拟赛合集》《26 暑假模拟赛合集》、NOICA 题单、《神品乐章》。

### 《多层分块树》这篇的分量
不是水贴：递归定义 + 三层都给了代码（build / update / query），给出 T(n)=2T(√n)+O(1) ⇒ O(log n) 的递推证明，还自嘲「空间复杂度我不会算，AI 推的」。评论区把 LEWISAK、OldDriverTree、llamn、Zhou_Lemon 全引出来了——LEWISAK 说「好像已经有过了（？）」，llamn 说「线段树做不了必须分块的题通常只能正常二层分块，建议改为休闲娱乐」，作者回「这至少比所谓二叉分块树靠谱，不太希望去休闲娱乐」。
**价值不在新（本质 sqrt tree / vEB 的近亲），而在于初三学生能独立完成递归结构的构造、正确性论证、复杂度递推和工程实现**——这是队里少见的「理论型」苗子。

### CSP 2026 游记要点（263 分，省第 26）
- 2025 年 S 组 114（club 黄题 60、road MST 板子 28、T3 暴力没时间打）连 NOIP 正赛都没进；今年 T1 前缀和+二分 3 min 秒，T2 看出「上了一条线不换乘就不耗时」→ 对线路建图 Floyd，T3 想出 O(n³) dp 加前缀和优化拿 48，T4 只有 O(2ⁿ·poly) 暴力 15，合计 **100+100+48+15=263**，一分没挂。
- 自评「好菜，我 S 组要完蛋了」，结论是「263 是大众分」；评价 T2「这题跟 road 是一个难度吗」，还去发工单要求把 T2 降绿（后来真降了，气得说「无法场切青题了」）。
- 评论补充：「目前 ydoj 分改了，zmx 我和 lewisak 占据 sn 所有 263」——三人并列 263。

### 判断
- **初三、一年内 114 → 263**，提升幅度全校最猛之一；河北/陕西同届里 CSP-S 270 分档。
- 数据结构与理论功底扎实，**有自研究习惯**（会为「让分块更优美」去造树、写证明、失败也照样发出来），这种「爱造轮子」的特质通常是长期上限的强信号。
- 短板：题解多集中在绿到蓝（P6080 紫），难题实战少；T3/T4 的「设计状态」能力还没到位（263 的分构成是 T1 白给 + T2 想出模型 + T3 半暴力 + T4 暴力）。
- 校内定位：初三这一批（肖子卓 300、丁子博 320、周檬轩 268、蔡青辰 263）里的第 4 人，比周檬轩少 5 分但知识面更偏理论、更「论文向」。
'''

with io.open(P, 'a', encoding='utf-8', newline='\n') as f:
    f.write(section)

d = json.load(io.open(M, encoding='utf-8'))
rows = d['mapping']
if not any(r.get('abbr') == 'Cqc' for r in rows):
    rows.append({
        "abbr": "Cqc",
        "luogu": "FFT_NTT_",
        "uid": 1773073,
        "blogGrade": None,
        "gameName": "蔡青辰",
        "gameRealName": "蔡青辰",
        "gameGrade": "初三",
        "quotes": 0,
        "boundQuotes": 0,
        "confidence": "用户确认",
        "evidence": "用户 2026-11-15 提供 FFT_NTT_=蔡青辰；洛谷搜索 uid 1773073、红名 ccf5、注册 2025-06-02；OIerDb uid 253951 同名同校；CSP2026 提高 263（1027/32643）与游记「省第26」一致。"
    })
for r in rows:
    if r.get('abbr') == 'Mq':
        r['evidence'] = "用户 2026-11-15 提供 苗淇=Flynewcat；洛谷 uid 781437、橙名、ccf6；OIerDb uid 207126 同名同校；《退役帖》为全队玩梗，用户已澄清「飞猫没有退役」。"
d['mapping'] = rows
with io.open(M, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print('ok rows', len(rows))
