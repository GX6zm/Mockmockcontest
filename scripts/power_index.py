# -*- coding: utf-8 -*-
"""实力指数（多赛事）+ 成长指数，两个维度分开输出。"""
import json, io

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data'
static = json.load(io.open(BASE + r'\oierdb-static.json', encoding='utf-8'))
C = static['contests']
TYPE = {c['name']: c.get('type') for c in C}
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
    ("夏菁阳", 181144, "高二"),
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
            if cid >= N:
                continue
            d.setdefault(C[cid]['name'], []).append((b[2], b[3]))  # score, rank

# 王一乐
for uid, d in recs.items():
    if 'CSP2026提高' in d and d['CSP2026提高'][0][0] == '263' and 'CSP2025入门' in d and d['CSP2025入门'][0][0] == '375':
        PEOPLE.append(("王一乐", int(uid), "初三"))

NATIONAL = 32643

def sc(rank):
    try:
        p = float(rank) / NATIONAL
    except ValueError:
        return None
    return 100 * (1 - p ** (1 / 3))

def best(d, keys):
    out = []
    for k in keys:
        for score, rank in d.get(k, []):
            v = sc(rank)
            if v is not None:
                out.append((v, k, score, rank))
    return max(out) if out else None

rows = []
for name, uid, grade in PEOPLE:
    d = recs.get(str(uid), {})
    csp = d.get('CSP2026提高', [(None, None)])[-1]
    csp_s = sc(csp[1]) if csp[1] else None
    noip = best(d, ['NOIP2025'])
    elite = best(d, ['NOI2026', 'NOI2026夏令营', 'APIO2026中国区', 'WC2026'])
    # 成长：S 组序列
    ser = sorted((int(k[3:7]), v[0][0]) for k, v in d.items() if k.startswith('CSP') and k.endswith('提高') and v[0][0].isdigit())
    delta = None
    if len(ser) >= 2:
        (y1, v1), (y2, v2) = ser[-2], ser[-1]
        delta = (int(v2) - int(v1)) / max(1, y2 - y1)
    if csp_s is None:
        rows.append((name, grade, None, None, None, None, None, delta))
        continue
    n = noip[0] if noip else csp_s
    e = elite[0] if elite else csp_s
    power = 0.45 * csp_s + 0.25 * n + 0.30 * e
    rows.append((name, grade, csp_s, n, e, power, elite, delta, csp, noip))

print(f"{'姓名':<6}{'年级':<4}{'CSP':>6}{'NOIP':>7}{'全力':>7}{'最高赛事':>22}{'成长':>8}")
for r in rows:
    name, grade, csp_s, n, e, power, elite, delta = r[:8]
    if csp_s is None:
        print(f'{name:<6}{grade:<4} 无 S 成绩')
        continue
    etxt = f'{elite[1]} {elite[3]}名' if elite else '—'
    dtxt = f'{delta:+.0f}/年' if delta is not None else '—'
    print(f'{name:<6}{grade:<4}{csp_s:>6.1f}{n:>7.1f}{power:>7.1f}{etxt:>20}{dtxt:>8}')
