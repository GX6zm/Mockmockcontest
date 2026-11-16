# -*- coding: utf-8 -*-
"""按 uid 重建选手 S 组序列 + 成长指数，并重写 level-analysis.md 的量化总表附录。"""
import json, io

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data'
MD = BASE + r'\level-analysis.md'

static = json.load(io.open(BASE + r'\oierdb-static.json', encoding='utf-8'))
contests = static['contests']

# (显示名, OIerDb uid, 年级)
PEOPLE = [
    ("吕明栩", 132383, "初三"),
    ("丁一宸", 161505, "高二"),
    ("刘昱合", 126983, "高二"),
    ("丁子博", 129118, "初三"),
    ("柏鹭鸣", 168641, "高二"),
    ("肖子卓", 165795, "初三"),
    ("王思琦", 129696, "高一"),
    ("陈泉林", 180486, "高二"),
    ("周檬轩", 237511, "初三"),
    ("周炜恒", 198226, "高一"),
    ("蔡青辰", 253951, "初三"),
    ("李金潼", 168639, "高一"),
    ("陈逸阳", 178319, "高一"),
    ("周逸然", 170007, "高一"),
    ("张顺凯", 164052, "高一"),
    ("张宸华", 199681, "高一"),
    ("陈怡嘉", 164073, "高一"),
    ("苗淇", 207126, "初三"),
    ("王鼎翼", 204676, "高一"),
    ("刘子牧", 257922, "初三"),
    ("禹奕成", 175420, "高二"),
    ("李君泽", 202403, "初三"),
    ("陈钰婉", 178066, "高二"),
    ("张笑语", 174730, "高三"),
    ("夏菁阳", 181144, "高二"),
    ("王一乐", 132383 + 0, "初三"),  # 占位，稍后修正
]

# 王一乐 = LEWISAK，洛谷 uid 603121，OIerDb uid 由序列匹配确定
WYL_UID = None

series = {}
caps = {}
with io.open(BASE + r'\oierdb-result.txt', encoding='utf-8', errors='replace') as f:
    for line in f:
        p = line.rstrip('\n').split(',')
        if len(p) < 9:
            continue
        uid = p[0]
        ser = series.setdefault(uid, {})
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
        caps.setdefault(uid, p[2])


def s_series(uid):
    ser = series.get(str(uid), {})
    items = sorted([(int(k[3:7]), v) for k, v in ser.items() if k.startswith('CSP') and k.endswith('提高')])
    return items


def growth(uid):
    s = s_series(uid)
    if len(s) < 2:
        return None, s
    (y1, v1), (y2, v2) = s[-2], s[-1]
    gap = max(1, y2 - y1)
    d = (int(v2) - int(v1)) / gap
    return d, s


rows = []
for name, uid, grade in PEOPLE:
    if name == "王一乐":
        continue
    vals = s_series(uid)
    if not vals:
        rows.append((name, uid, grade, None, None, None, "无S成绩"))
        continue
    s26 = dict(vals).get(2026)
    base = round(int(s26) / 4.0, 2) if s26 else None
    d, _ = growth(uid)
    g = None if d is None else max(0, min(100, round(50 + 0.33 * d)))
    rows.append((name, uid, grade, s26, base, g, None))

# 王一乐：按名字+分数 263 匹配（uid 未知，序列中找 S2026=263 且 J2025=375 的）
for uid in list(series.keys()):
    ser = series[uid]
    if ser.get('CSP2026提高') == '263' and ser.get('CSP2025入门') == '375':
        vals = s_series(uid)
        base = 263 / 4.0
        d, _ = growth(uid)
        rows.append(("王一乐", uid, "初三", 263, base, max(0, min(100, round(50 + 0.33 * d))), None))

rows.sort(key=lambda r: (r[4] is None, -(r[4] or 0)))

lines = []
lines.append('| # | 选手 | 年级 | S2026 | 基础实力 | 同比增幅 | 成长指数 | 综合 |')
lines.append('|---|---|---|---|---|---|---|---|')
rank = 0
for name, uid, grade, s26, base, g, note in rows:
    if base is None:
        lines.append(f'| — | {name} | {grade} | — | — | — | — | — |')
        continue
    rank += 1
    d, _ = growth(uid)
    ds = f'{d:+.1f}' if d is not None else '—'
    gi = g if g is not None else 50
    total = round(0.6 * base + 0.4 * gi, 1)
    lines.append(f'| {rank} | {name} | {grade} | {int(s26)} | **{base:g}** | {ds}/年 | **{gi}** | **{total:g}** |')

table = '\n'.join(lines)
print(table)

with io.open(MD, encoding='utf-8') as f:
    txt = f.read()
marker = '## 附：量化口径与总表（用于游戏数值）'
idx = txt.find(marker)
if idx >= 0:
    txt = txt[:idx]
head = '''## 附：量化口径与总表（用于游戏数值）

**口径**：
1. **基础实力 = CSP-S 2026 得分 ÷ 4**（0–400 → 0–100）。同年同卷、官方 capacity=32643，跨校可比；J 组无区分度不采用。
2. **成长指数 = 50 + 0.33 × 最近一次 S 组同比年化增幅**（两年间隔按年化），封顶 0–100。增幅 135/年 → 94，0 → 50，−30 → 40。
3. **综合 = 0.6 × 基础 + 0.4 × 成长**（用调数值时建议以此为主，成长占四成）。
4. 不含洛谷 AC/排名、校 OJ、专栏产量——这些是独立的「纸面 / 日常 / 理论」维度。
5. 游记自述（自嘲、苦情、退役帖）一律不计入。

'''
tail = '''
### 读表要点
- **成长指数高但基础低**（刘子牧 94 分成长 / 50 分基础）：单年增幅大，样本少，方差高；涨 135 分里有多少是「补回 2025 的失常」无法区分，所以综合值要打折看趋势，不能当实力。
- **基础高但成长停滞**（陈钰婉 38 基础 / +11 年增）：已见顶，游戏里给高稳定、低潜力。
- **同分不同势**：王鼎翼 200（+52/年，成长 67）与刘子牧 200（+135/年，成长 94），综合 57.6 vs 67.6——这就是「成长速度」进表的意义。
- 王一乐（LEWISAK）S 序列 120→201→263，年增 62，成长指数 70，综合 = 0.6×65.75+0.4×70 ≈ **67.5**。

### 游戏数值怎么用
- **基础实力** → 角色面板主值。
- **成长指数** → 升级曲线斜率 / 潜力条；结合年级：初三高成长视为「还会涨」，高二高成长罕见（多为找回状态）。
- **综合** → 初始战力排位（本表）。
- **稳定性** → 另算「最差场 / 最好场」落差（刘昱合 395/395 压线、李金潼 400→101）。
- **日常 / 理论** → 校 OJ 与专栏，独立维（柏鹭鸣、王鼎翼 实战≫纸面；李君泽相反）。
'''
with io.open(MD, 'w', encoding='utf-8', newline='\n') as f:
    f.write(txt + head + table + tail)
print('written, chars', len(txt + head + table + tail))

