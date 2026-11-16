# -*- coding: utf-8 -*-
import io, json

MAP = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\blog-roster-mapping.json'
with io.open(MAP, encoding='utf-8') as f:
    data = json.load(f)

rows = data['mapping']
new = {
    "abbr": "Zxc",
    "luogu": "ref_rainT",
    "uid": 661274,
    "blogGrade": None,
    "gameName": None,
    "gameRealName": "张轩程",
    "gameGrade": "初三",
    "quotes": 0,
    "boundQuotes": 0,
    "confidence": "用户确认",
    "evidence": "用户 2026-11-15 说 zxc=ref_rainT；洛谷 uid 661274 蓝名 ccf0（原名 Brainless_zxc），OIerDb uid 181656 全国 8634/4509.97，S2026 仅 98 二等；不在 src/roster.ts。"
}

hit = None
for r in rows:
    if r.get('abbr') == 'Zxc' or r.get('uid') == 661274:
        hit = r
        break
if hit is None:
    rows.append(new)
    print('appended row, total', len(rows))
else:
    hit.update(new)
    print('updated existing row')

with io.open(MAP, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('rows', len(rows))
