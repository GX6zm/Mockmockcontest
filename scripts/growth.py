# -*- coding: utf-8 -*-
"""计算选手成长速度：CSP-S 逐年分数、同比增幅、年化斜率。"""
import json, io, sys

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data'
static = json.load(io.open(BASE + r'\oierdb-static.json', encoding='utf-8'))
contests = static['contests']

NAMES = ["王一乐","吕明栩","王思琦","丁一宸","刘昱合","肖子卓","丁子博","周逸然","陈泉林","周炜恒",
         "柏鹭鸣","张顺凯","李金潼","陈逸阳","周檬轩","苗淇","夏菁阳","蔡青辰","陈怡嘉","张笑语",
         "张宸华","陈钰婉","禹奕成","李君泽","王鼎翼","刘子牧"]

rows = {}
with io.open(BASE + r'\oierdb-result.txt', encoding='utf-8', errors='replace') as f:
    for line in f:
        p = line.rstrip('\n').split(',')
        if len(p) < 9:
            continue
        name = p[2]
        if name not in NAMES:
            continue
        rows.setdefault(name, []).append(p)

for name in NAMES:
    recs = rows.get(name)
    if not recs:
        print(f'{name}\tNO_DATA')
        continue
    series = {'S': {}, 'J': {}}
    for p in recs:
        uid, initials, nm, gender, enroll, score, ccf_score, ccf_level, rs = p[:9]
        if not rs:
            continue
        for chunk in rs.split('/'):
            bits = chunk.split(':')
            if len(bits) < 6:
                continue
            cid, school, sc, rank, grade, level = bits[:6]
            try:
                cid = int(cid)
            except ValueError:
                continue
            if cid >= len(contests):
                continue
            c = contests[cid]
            cname = c.get('name', '')
            ctype = c.get('type')
            cap = c.get('capacity')
            if ctype == 8:
                grp = 'S'
            elif ctype == 9:
                grp = 'J'
            else:
                continue
            series[grp][cname] = (sc, rank, grade, cap)
    out = []
    for grp in ('S', 'J'):
        items = sorted(series[grp].items(), key=lambda kv: kv[0])
        out.append(grp + '=' + '|'.join(f'{k.replace("CSP","")}:{v[0]}' for k, v in items))
    # 同比增幅（相邻年份的 S 组）
    s = sorted(series['S'].items(), key=lambda kv: kv[0])
    deltas = []
    for (y1, v1), (y2, v2) in zip(s, s[1:]):
        try:
            deltas.append(int(v2[0]) - int(v1[0]))
        except ValueError:
            pass
    print(f'{name}\t' + '\t'.join(out) + f'\tDELTAS={",".join(map(str, deltas))}')
