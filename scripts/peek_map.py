# -*- coding: utf-8 -*-
import io, json

MAP = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\blog-roster-mapping.json'
with io.open(MAP, encoding='utf-8') as f:
    data = json.load(f)

rows = data['mapping']
print(type(rows), len(rows))
print(json.dumps(rows[-1], ensure_ascii=False, indent=1)[:600])
