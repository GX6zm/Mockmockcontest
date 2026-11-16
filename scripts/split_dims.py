# -*- coding: utf-8 -*-
"""重写附录：实力与增长速度分成两个独立维度，不再合成综合分。"""
import json, io

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data'
MD = BASE + r'\level-analysis.md'

static = json.load(io.open(BASE + r'\oierdb-static.json', encoding='utf-8'))
contests = static['contests']

PEOPLE = [
    ("吕明栩", 132383, "初三"), ("丁一宸", 161505, "高二"), ("刘昱合", 126983, "高二"),
    ("丁子博", 129118, "初三"), ("柏鹭鸣", 168641, "高二"), ("肖子卓", 165795, "初三"),
    ("王思琦", 129696, "高一"), ("陈泉林", 180486, "高二"), ("周檬轩", 237511, "初三"),
    ("周炜恒", 198226, "高一"), ("蔡青辰", 253951, "初三"), ("李金潼", 168639, "高一"),
    ("陈逸阳", 178319, "高一"), ("周逸然", 170007, "高一"), ("张顺凯", 164052, "高一"),
    ("张宸华", 199681, "高一"), ("陈怡嘉", 164073, "高一"), ("苗淇", 207126, "初三"),
    ("王鼎翼", 204676, "高一"), ("刘子牧", 257922, "初三"), ("禹奕成", 175420, "高二"),
    ("李君泽", 202403, "初三"), ("陈钰婉", 178066, "高二"), ("张笑语", 174730, "高三"),
    ("夏菁阳", 181144, "高二"),
]

series, names = {}, {}
with io.open(BASE + r'\oierdb-result.txt', encoding='utf-8', errors='replace') as f:
    for line in f:
        p = line.rstrip('\n').split(',')
        if len(p) < 9:
            continue
        names[p[0]] = p[2]
        ser = series.setdefault(p[0], {})
        for chunk in (p[8] or '').split('/'):
            b = chunk.split(':')
            if len(b) < 6:
                continue
            try:
                cid = int(b[0])
            except ValueError:
                continue
            if cid >= len(contests):
                continue
            c = contests[cid]
            if c.get('type') not in (8, 9):
                continue
            ser[c['name']] = b[2]

# 王一乐 uid 反查
WYL = None
for uid, ser in series.items():
    if ser.get('CSP2026提高') == '263' and ser.get('CSP2025入门') == '375':
        WYL = uid
PEOPLE.append(("王一乐", int(WYL), "初三"))

def s_series(uid):
    ser = series.get(str(uid), {})
    return sorted([(int(k[3:7]), v) for k, v in ser.items() if k.startswith('CSP') and k.endswith('提高')])

def year_delta(uid):
    s = s_series(uid)
    if len(s) < 2:
        return None
    (y1, v1), (y2, v2) = s[-2], s[-1]
    return (int(v2) - int(v1)) / max(1, y2 - y1)

rows = []
for name, uid, grade in PEOPLE:
    s = s_series(uid)
    s26 = dict(s).get(2026)
    if not s26:
        rows.append(dict(name=name, uid=uid, grade=grade, s26=None, base=None, d=None, gi=None, ser='—'))
        continue
    d = year_delta(uid)
    base = round(int(s26) / 4.0, 2)
    gi = None if d is None else max(0, min(100, round(50 + 0.33 * d)))
    ser = '→'.join(f'{y%100}:{v}' for y, v in s)
    rows.append(dict(name=name, uid=uid, grade=grade, s26=int(s26), base=base, d=d, gi=gi, ser=ser))

by_base = sorted([r for r in rows if r['base'] is not None], key=lambda r: -r['base'])
rank_base = {r['name']: i + 1 for i, r in enumerate(by_base)}
by_growth = sorted([r for r in by_base if r['gi'] is not None], key=lambda r: -r['gi'])
rank_growth = {r['name']: i + 1 for i, r in enumerate(by_growth)}

t = ['| # | 选手 | 年级 | S 组序列 | S2026 | 基础实力 | 年增 | 成长指数 |',
     '|---|---|---|---|---|---|---|---|']
for r in by_base:
    ds = f"{r['d']:+.0f}" if r['d'] is not None else '—'
    gi = r['gi'] if r['gi'] is not None else '—'
    t.append(f"| {rank_base[r['name']]} | {r['name']} | {r['grade']} | {r['ser']} | {r['s26']} | **{r['base']:g}** | {ds}/年 | **{gi}** |")
for r in rows:
    if r['base'] is None:
        t.append(f"| — | {r['name']} | {r['grade']} | {r['ser']} | — | — | — | — |")
table = '\n'.join(t)

growth_top = '\n'.join(
    f"{i+1}. {r['name']} {r['gi']}（{r['ser']}，{r['d']:+.0f}/年）" for i, r in enumerate(by_growth[:6])
)

appendix = f'''## 附：量化口径与总表（实力 / 增长速度 分开）

**两个维度，不合成一个数。**

1. **基础实力 = CSP-S 2026 得分 ÷ 4**（0–400 → 0–100）。同年同卷、官方 capacity=32643，跨校可比；J 组无区分度，不采用。**这是「现在能考多少」。**
2. **成长指数 = 50 + 0.33 × S 组最近一次同比年化增幅**，封顶 0–100。**这是「一年涨多快」，与当前水平无关。**
3. 两者**不加权、不求和**：实力高的成长慢（吕明栩 95 / 65），成长快的实力低（刘子牧 50 / 95）都是正常组合。游戏里分别喂给不同系统。
4. 不含洛谷 AC/排名、校 OJ、专栏产量（独立的「纸面 / 日常 / 理论」维度）；游记自述不计入。

{table}

**成长指数前六**（与实力排名无关）：
{growth_top}

### 分开读的意义
- **实力** → 角色当前面板、出场强度、棋盘上的战力。
- **成长** → 升级曲线斜率、训练收益、潜力条上限。
- **不要把成长折算进当前实力**：刘子牧 200→（自评）265 是「可能达到」，不是「已经达到」；李金潼 101→248、陈怡嘉 108→215 也是低基反弹，不能用成长指数去抬当前面板。
- **低基反弹打折**：前一年明显失常（S2025 65 / 101 / 108 这类）时，年增里含「恢复」成分，成长指数只能当趋势信号。
'''
with io.open(MD, encoding='utf-8') as f:
    txt = f.read()
idx = txt.find('## 附：量化口径与总表')
if idx < 0:
    raise SystemExit('appendix marker not found')
txt = txt[:idx].rstrip() + '\n\n'
with io.open(MD, 'w', encoding='utf-8', newline='\n') as f:
    f.write(txt + appendix)
print(table)
print('chars', len(txt + appendix))
