import json, re, subprocess, sys, urllib.parse

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
PROXY = 'http://127.0.0.1:7897'


def fetch(url):
    out = subprocess.run(['curl.exe', '-s', '--compressed', '-x', PROXY, '-A', UA, url],
                         capture_output=True)
    return out.stdout.decode('utf-8', 'replace')


def lentille(html):
    m = re.search(r'<script id="lentille-context" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        return None
    return json.loads(m.group(1))


def search(keyword, pages=1):
    res = []
    for page in range(1, pages + 1):
        url = 'https://www.luogu.com.cn/problem/list?keyword=' + urllib.parse.quote(keyword) + f'&page={page}'
        html = fetch(url)
        ctx = lentille(html)
        if not ctx:
            print('NOCTX', keyword, page, len(html))
            continue
        probs = ctx['data'].get('problems', {})
        rows = probs.get('result', [])
        for r in rows:
            res.append((r.get('pid'), r.get('title'), r.get('difficulty'),
                        r.get('totalAccepted'), r.get('totalSubmit')))
        if not rows:
            break
    return res


if __name__ == '__main__':
    kw = sys.argv[1]
    pages = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    for pid, title, diff, acc, sub in search(kw, pages):
        rate = (acc / sub * 100) if sub else 0
        print(f'{pid}\t{diff}\t{rate:5.1f}%\t{acc}/{sub}\t{title}')
