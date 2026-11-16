# -*- coding: utf-8 -*-
import io

P = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\level-analysis.md'
t = io.open(P, encoding='utf-8').read()

old = 'roster 里有同名条目（校 OJ 第 12，rating0 1769 一带）。'
new = ('roster 条目：`{ name: "李金潼", lv: 3, rp: 276, ac: 513, rank: 33, rating0: 1689 }`——**校 OJ 只排 33**'
       '（roster 快照里的 OIerDb 数据 7441/3874.22、ccf6、初三 均已过时）。')
assert old in t
t = t.replace(old, new)
io.open(P, 'w', encoding='utf-8', newline='\n').write(t)
print('patched')
