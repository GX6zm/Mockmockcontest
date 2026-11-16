# -*- coding: utf-8 -*-
"""列出同名选手的所有 uid 候选，带 CSP-S 2024/2025/2026 分数，便于人工挑正确的那个。"""
import json, io

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data'
static = json.load(io.open(BASE + r'\oierdb-static.json', encoding='utf-8'))
contests = static['contests']
idx = {c['name']: i for i, c in enumerate(contests)}

NAMES = ["吕明栩", "陈逸阳", "周逸然", "刘子牧", "陈怡嘉", "李君泽", "丁子博", "张笑语"]

with io.open(BASE + r'\oierdb-result.txt', encoding='utf-8', errors='replace') as f:
    for line in f:
        p = line.rstrip('\n').split(',')
        if len(p) < 9 or p[2] not in NAMES:
            continue
        uid, initials, nm, gender, enroll, score, ccf_score, ccf_level, rs = p[:9]
        get = {}
        for chunk in (rs or '').split('/'):
            b = chunk.split(':')
            if len(b) < 6:
                continue
            try:
                cid = int(b[0])
            except ValueError:
                continue
            if cid < len(contests):
                get[contests[cid]['name']] = (b[2], b[3], b[4])
        s26 = get.get('CSP2026提高', ('-', '-', '-'))
        s25 = get.get('CSP2025提高', ('-', '-', '-'))
        s24 = get.get('CSP2024提高', ('-', '-', '-'))
        j26 = get.get('CSP2026入门', ('-', '-', '-'))
        print(f'{nm}\tuid={uid}\tenroll={enroll}\tccf={ccf_score}/{ccf_level}\tS24={s24[0]}\tS25={s25[0]}\tS26={s26[0]}@{s26[1]}\tJ26={j26[0]}')
