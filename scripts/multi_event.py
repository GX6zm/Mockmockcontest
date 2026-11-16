# -*- coding: utf-8 -*-
"""重写附录：实力指数（CSP-S + NOIP + 最高级别赛事）与成长指数分开；并同步修正刘子牧条目数值。"""
import json, io

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data'
MD = BASE + r'\level-analysis.md'
static = json.load(io.open(BASE + r'\oierdb-static.json', encoding='utf-8'))
C = static['contests']
N = len(C)

PEOPLE = [
    ("吕明栩", 132383, "初三"), ("丁一宸", 161505, "高二"), ("刘昱合", 126983, "高二"),
    ("丁子博", 129118, "初三"), ("柏鹭鸣", 168641, "高二"), ("肖子卓", 165795, "初三"),
    ("王思琦", 129696, "高一"), ("陈泉林", 180486, "高二"), ("周檬轩", 237511, "初三"),
    ("周炜恒", 198226, "高一"), ("蔡青辰", 253951, "初三"), ("李金潼", 168639, "高一"),
    ("陈逸阳", 178319, "高一"), ("周逸然", 170007, "高一"), ("张顺凯", 164052, "高一"),
    ("张宸华", 199681, "高一"), ("陈怡嘉", 164073, "高一"), ("苗淇", 207126, "初三"),
    ("王鼎翼", 204676, "高一"), ("刘子牧", 257922, "初三"), ("禹奕成", 175420, "高二"),
    ("李君泽", 202403, "初三"), ("陈钰婉", 178066, "高二"), ("张笑语", 174730, "高三"),
    ("夏菁阳", 181144, "高二"), ("张轩程", 181656, "初三"), ("代羽辰", 237485, "初三"),
]

recs = {}
with io.open(BASE + r'\oierdb-result.txt', encoding='utf-8', errors='replace') as f:
    for line in f:
        p = line.rstrip('\n').split(',')
        if len(p) < 9:
            continue
        d = recs.setdefault(p[0], {})
        for chunk in (p[8] or '').split('/'):
            b = chunk.split(':')
            if len(b) < 6:
                continue
            try:
                cid = int(b[0])
            except ValueError:
                continue
            if cid < N:
                d.setdefault(C[cid]['name'], []).append((b[2], b[3]))

for uid, d in recs.items():
    if d.get('CSP2026提高', [('', '')])[0][0] == '263' and d.get('CSP2025入门', [('', '')])[0][0] == '375':
        PEOPLE.append(("王一乐", int(uid), "初三"))

NAT = 32643
def sc(rank):
    try:
        return 100 * (1 - (float(rank) / NAT) ** (1 / 3))
    except (TypeError, ValueError):
        return None

def best(d, keys):
    out = []
    for k in keys:
        for s, r in d.get(k, []):
            v = sc(r)
            if v is not None:
                out.append((v, k, s, r))
    return max(out) if out else None

rows = []
for name, uid, grade in PEOPLE:
    d = recs.get(str(uid), {})
    csp = d.get('CSP2026提高', [(None, None)])[-1]
    csp_s = sc(csp[1]) if csp[1] else None
    noip = best(d, ['NOIP2025'])
    elite = best(d, ['NOI2026', 'NOI2026夏令营', 'APIO2026中国区', 'WC2026'])
    ser = sorted((int(k[3:7]), v[0][0]) for k, v in d.items() if k.startswith('CSP') and k.endswith('提高') and v[0][0].isdigit())
    delta = None
    if len(ser) >= 2:
        (y1, v1), (y2, v2) = ser[-2], ser[-1]
        delta = (int(v2) - int(v1)) / max(1, y2 - y1)
    if csp_s is None:
        rows.append(dict(name=name, grade=grade, csp=None, noip=None, elite=None, power=None, delta=delta))
        continue
    n = noip[0] if noip else csp_s
    e = elite[0] if elite else csp_s
    rows.append(dict(name=name, grade=grade, csp=csp_s, csp_raw=csp[0], noip=(noip[0] if noip else None),
                     noip_raw=(noip[2] if noip else None), elite=elite, power=0.45 * csp_s + 0.25 * n + 0.30 * e, delta=delta))

rows.sort(key=lambda r: (r['power'] is None, -(r['power'] or 0)))
lines = ['| # | 选手 | 年级 | CSP-S 26 | NOIP 25 | 最高级别赛事 | 实力指数 | 成长指数 |',
         '|---|---|---|---|---|---|---|---|']
for i, r in enumerate(rows, 1):
    if r['power'] is None:
        lines.append(f"| — | {r['name']} | {r['grade']} | — | — | — | — | — |")
        continue
    el = f"{r['elite'][1]} {r['elite'][3]}名" if r['elite'] else '—'
    np_ = f"{r['noip_raw']}分" if r['noip_raw'] else '—'
    gi = '—' if r['delta'] is None else max(0, min(100, round(50 + 0.33 * r['delta'])))
    lines.append(f"| {i} | {r['name']} | {r['grade']} | {r['csp_raw']} | {np_} | {el} | **{r['power']:.1f}** | {gi} |")
table = '\n'.join(lines)

appendix = f'''## 附：量化口径与总表（实力 / 增长速度 分开）

**不只看 CSP。** 两个维度，各自独立给数，不合成一个「综合」。

### 一、实力指数（0–100）
三个分项，各自先换成「全国百分位分」再加权：

- **百分位分 = 100 × (1 − (名次/32643)^⅓)**。开三次方是为了让头部拉开差距：名次 62 → 87.6，名次 1000 → 68.3，名次 4000 → 49.8。
- **分项**：
  1. **CSP-S 2026**（权重 0.45）——当年主战场。
  2. **NOIP 2025**（权重 0.25）——同届、样本更大、区分度好于 J 组。没有记录则该分项取 CSP 值（不奖不罚）。
  3. **最高级别赛事 2026**（权重 0.30）——NOI 2026 正赛/夏令营、APIO 2026 中国区、WC 2026 中最好的一项。没有记录则该分项取 CSP 值。
- 缺失项按 CSP 值补齐的理由：没进省队/没打 NOIP 不是「考砸」，是没参赛，不该倒扣；但打过的更好成绩会自动抬高指数。

### 二、成长指数（0–100）
- **成长 = 50 + 0.33 × CSP-S 最近一次同比年化增幅**，封顶 0–100。只描述斜率，与当前水平无关。

{table}

### 读表
- **实力 90 分以上**：吕明栩（89.8，几乎全靠 NOI 夏令营 Au 第 4 撑起来；NOIP 无记录）。
- **实力由 NOI/APIO 抬起来的**：肖子卓 74.2（CSP）→ 78.2（实力）、丁子博 77.9 → 80.4、王思琦 69.5 → 75.6（NOI 夏令营 Ag 34 名）。只看 CSP 会低估他们。
- **实力由 NOIP 拉低/拉高的**：刘昱合 81.6（CSP）→ 79.6（实力，NOIP 193 只有 72.4）；禹奕成 CSP 43.8 但 NOIP 61.7 → 48.3。
- **成长与实力无关**：蔡青辰、李金潼成长 99，实力 68.4/62.7；吕明栩成长 65，实力 89.8。
- 不使用 OIerDb 积分/校内排名（历史获奖加权，非当前水平），不使用游记自述。

### 游戏数值怎么用
- **实力指数** → 角色当前面板。
- **成长指数** → 升级斜率 / 潜力条，独立系统。
- **稳定性** → 另算「最好一场 − 最差一场」落差。
- **日常/理论** → 校 OJ 与专栏，独立维（柏鹭鸣、王鼎翼 实战≫纸面；李君泽相反）。
'''

with io.open(MD, encoding='utf-8') as f:
    txt = f.read()
idx = txt.find('## 附：量化口径与总表')
if idx < 0:
    raise SystemExit('marker missing')
txt = txt[:idx].rstrip() + '\n\n'

sync_old = '''- **实力：50**（S2026 200 ÷ 4；pct 13.0%；24 人里排第 21）'''
sync_new = '''- **实力：49.3**（CSP-S 分项 49.3，无 NOIP 2025 记录、无 NOI/APIO/WC 记录，两项按 CSP 值补齐，指数不变；25 人里排第 20）'''
if sync_old in txt:
    txt = txt.replace(sync_old, sync_new)
    print('synced 刘子牧')
else:
    print('WARN sync target missing')

with io.open(MD, 'w', encoding='utf-8', newline='\n') as f:
    f.write(txt + appendix)
print(table)
print('chars', len(txt + appendix))

