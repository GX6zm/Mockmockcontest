import json, re, sys, collections, datetime

uid = sys.argv[1]
rows = []
i = 1
while True:
    try:
        h = open(rf'data\luogu\u{uid}_art{i}.json', encoding='utf-8').read()
    except FileNotFoundError:
        break
    m = re.search(r'<script id="lentille-context" type="application/json">(.*?)</script>', h, re.S)
    if not m:
        break
    d = json.loads(m.group(1))['data']['articles']
    rows += d['result']
    if i * d['perPage'] >= d['count']:
        break
    i += 1

print('total', len(rows))
print('cats', dict(collections.Counter(r['category'] for r in rows)))
diffs = collections.Counter(r['solutionFor']['difficulty'] for r in rows if r.get('solutionFor'))
print('diff', dict(sorted(diffs.items())))
top = sorted(rows, key=lambda x: -x['upvote'])[:6]
print('top:', [(r['upvote'], r['title'][:24]) for r in top])
for r in sorted(rows, key=lambda x: x['time']):
    print(datetime.datetime.fromtimestamp(r['time']).strftime('%Y-%m'), 'cat%d' % r['category'], 'up%d' % r['upvote'], r['title'][:46])
