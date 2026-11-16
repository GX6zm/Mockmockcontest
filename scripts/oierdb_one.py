import json, sys, io

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data'
static = json.load(io.open(BASE + r'\oierdb-static.json', encoding='utf-8'))
contests = static['contests']

rows = io.open(BASE + r'\oierdb-result.txt', encoding='utf-8', newline='').read().splitlines()
name = sys.argv[1]
for line in rows:
    f = line.split(',')
    if len(f) < 8 or f[2] != name:
        continue
    print('==', f[2], 'uid', f[0], 'initials', f[1], 'enroll', f[4], 'score', f[5], 'ccf', f[6], f[7])
    for rec in (f[8] if len(f) > 8 else '').split('/'):
        if not rec:
            continue
        cid, sid, score, rank, grade, level = rec.split(':')
        cid = int(cid); ct = contests[cid]
        print('  %-12s score=%-4s rank=%-5s/%-6s level=%s grade=%s' % (
            ct['name'], score, rank, ct.get('capacity', '?'), level, grade))
    break
