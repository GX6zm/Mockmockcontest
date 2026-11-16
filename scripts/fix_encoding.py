import io, sys

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\game.ts'
raw = io.open(p, 'rb').read()
if raw.startswith(b'\xef\xbb\xbf'):
    raw = raw[3:]
text = raw.decode('utf-8')
try:
    restored = text.encode('gb18030').decode('utf-8')
except Exception as e:
    print('FAIL', e)
    sys.exit(1)
io.open(p, 'w', encoding='utf-8', newline='').write(restored)
print(restored.splitlines()[22])
print('len', len(restored))
