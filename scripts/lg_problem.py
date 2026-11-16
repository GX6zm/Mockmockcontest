import json, re, subprocess, sys

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
PROXY = 'http://127.0.0.1:7897'
LV = {0: '暂无', 1: '入门', 2: '普及-', 3: '普及/提高-', 4: '普及+/提高', 5: '提高+/省选-', 6: '省选/NOI-', 7: 'NOI/NOI+', 8: 'NOI+/CTSC'}


def fetch(url):
    return subprocess.run(['curl.exe', '-s', '--compressed', '-x', PROXY, '-A', UA, url],
                          capture_output=True).stdout.decode('utf-8', 'replace')


def lentille(html):
    m = re.search(r'<script id="lentille-context" type="application/json">(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


for pid in sys.argv[1:]:
    html = fetch('https://www.luogu.com.cn/problem/' + pid)
    ctx = lentille(html)
    if not ctx:
        print(pid, 'NOCTX', len(html))
        continue
    p = ctx['data']['problem']
    acc = p.get('totalAccepted', 0)
    sub = p.get('totalSubmit', 0)
    rate = acc / sub * 100 if sub else 0
    print(f"{pid}\t{p.get('title')}\t难度={p.get('difficulty')}({LV.get(p.get('difficulty'), '?')})\tAC {rate:.1f}% {acc}/{sub}")
