# -*- coding: utf-8 -*-
"""Dump article list from saved Luogu user article pages."""
import glob
import io
import json
import re
import sys

BASE = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\luogu'
PAT = re.compile(r'<script id="lentille-context" type="application/json">(.*?)</script>', re.S)


def main():
    uid = sys.argv[1]
    total = None
    for f in sorted(glob.glob(BASE + r'\u%s_art*.json' % uid)):
        t = io.open(f, encoding='utf-8').read()
        if 'lentille-context' not in t:
            print('-- no ctx', f, len(t))
            continue
        d = json.loads(PAT.search(t).group(1))['data']
        print('== file', f, 'template', d.get('template'))
        print('   keys', list(d.keys()))
        arts = d.get('articles') or {}
        if isinstance(arts, dict):
            if total is None:
                total = arts.get('count')
            for it in arts.get('result', []):
                print('  ', it.get('lid'), it.get('category'), it.get('time'),
                      it.get('upvote'), it.get('title'))
        else:
            print('   articles type', type(arts))
    print('total count', total)


main()
