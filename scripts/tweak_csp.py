import io
p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("ranges: [[44, 54], [72, 82], [88, 98], [102, 112]],", "ranges: [[44, 54], [68, 78], [84, 94], [98, 108]],")
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
