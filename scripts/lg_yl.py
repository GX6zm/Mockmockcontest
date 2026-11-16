import json, re, sys, os, urllib.parse, subprocess

CTX = re.compile(r'<script id="lentille-context" type="application/json">(.*?)</script>', re.S)

def get(keyword, page=1):
    url = 'https://www.luogu.com.cn/problem/list?keyword=' + urllib.parse.quote(keyword) + '&page=%d' % page
    r = subprocess.run(['curl.exe', '-s', '--compressed', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', url],
                       capture_output=True)
    t = r.stdout.decode('utf-8', 'ignore')
    m = CTX.search(t)
    if not m:
        return None
    return json.loads(m.group(1))

for kw in sys.argv[1:]:
    j = get(kw)
    if not j:
        print(kw, 'FAIL')
        continue
    rows = [r for r in j['data']['problems']['result'] if kw.replace(' ','').lower() in r['name'].replace(' ','').lower()]
    print('==', kw, 'total', j['data']['problems'].get('count'))
    for r in rows:
        print('%s\t%s\td%s\t%s' % (r['pid'], r['name'], r['difficulty'], r.get('totalAccepted')))

