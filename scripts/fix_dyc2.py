# -*- coding: utf-8 -*-
import io
P = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\level-analysis.md'
with io.open(P, encoding='utf-8') as f:
    t = f.read()
old = '**校 OJ**：`{ name: "代羽辰", lv: 3, rp: 272, ac: 431, rank: 42, rating0: 1492 }`（roster 里的 rank 42）。'
new = '**校 OJ（roster 快照）**：`{ name: "代羽辰", lv: 2, rp: 258, ac: 318, rank: 53, rating0: 1466 }`，校 OJ 第 53 位；记录里的 csp 字段是 2024 入门 100 二等（学校：西安高新区第三初级中学）。'
assert old in t
t = t.replace(old, new)
t = t.replace('- 校 OJ 第 42 / OIerDb 14581 与 J 组 372 的错位', '- 校 OJ 第 53 / OIerDb 14581 与 J 组 372 的错位')
with io.open(P, 'w', encoding='utf-8', newline='\n') as f:
    f.write(t)
print('fixed')
