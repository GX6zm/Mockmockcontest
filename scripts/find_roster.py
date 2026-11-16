# -*- coding: utf-8 -*-
import io, re
t = io.open(r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\roster.ts', encoding='utf-8').read()
names = re.findall(r'name: "([^"]+)"', t)
print(len(names))
print(names)
idx = t.find('张轩程')
print('zhangxuancheng idx', idx)
for line in t.splitlines():
    if 'zxc' in line.lower() or '181656' in line:
        print(line[:200])
