# -*- coding: utf-8 -*-
import io

P = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\level-analysis.md'
t = io.open(P, encoding='utf-8').read()

old = 'roster 里没有这条（blog 里是“卢某人”水友式提及，gameName 是整活名），已按用户提供补进 mapping。'
new = ('roster 条目：`{ name: "都大人的题构结据数做年常", lv: 5, rp: 289, ac: 776, rank: 19, rating0: 1749, '
       'realName: "柏鹭鸣" }`——**校 OJ 只排 19**，与 OIerDb 校内第 10 形成反差；roster 里的 OIerDb 快照'
       '（4107/5755.88）也已过时。')
assert old in t
t = t.replace(old, new)
io.open(P, 'w', encoding='utf-8', newline='\n').write(t)
print('patched')
