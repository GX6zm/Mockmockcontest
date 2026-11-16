#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Extract plain text of a saved Luogu article page.

Usage: python luogu_article.py <htmlfile> [maxchars]
"""
import html as htmllib
import json
import re
import sys

PAT = re.compile(r'<script id="lentille-context" type="application/json">(.*?)</script>', re.S)


def main():
    path = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 6000
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        page = f.read()
    m = PAT.search(page)
    if not m:
        print("NO_CONTEXT")
        return
    ctx = json.loads(m.group(1))
    data = ctx.get("data") or {}
    art = data.get("article") or {}
    print("title:", art.get("title"))
    print("time:", art.get("time"), "upvote:", art.get("upvote"), "category:", art.get("category"))
    print("author:", json.dumps((art.get("author") or {}).get("name"), ensure_ascii=False))
    content = art.get("content") or ""
    content = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", content, flags=re.S)
    content = re.sub(r"<br\s*/?>", "\n", content)
    content = re.sub(r"</p>", "\n\n", content)
    content = re.sub(r"<[^>]+>", "", content)
    content = htmllib.unescape(content)
    content = re.sub(r"[ \t]+", " ", content)
    content = re.sub(r"\n{3,}", "\n\n", content)
    print("---")
    print(content.strip()[:limit])


if __name__ == "__main__":
    main()
