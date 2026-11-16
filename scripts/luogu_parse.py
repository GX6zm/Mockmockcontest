#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Parse saved Luogu HTML pages (lentille-context JSON).

Usage:
  python luogu_parse.py user <htmlfile>
  python luogu_parse.py articles <htmlfile>
"""
import json
import re
import sys

PAT = re.compile(r'<script id="lentille-context" type="application/json">(.*?)</script>', re.S)


def load(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        html = f.read()
    m = PAT.search(html)
    if not m:
        return None
    return json.loads(m.group(1))


def show_user(ctx):
    d = ctx["data"]
    u = d.get("user") or {}
    print("username:", u.get("name"))
    print("uid:", u.get("uid"), "color:", u.get("color"), "ccfLevel:", u.get("ccfLevel"))
    print("slogan:", u.get("slogan"))
    print("registerTime:", u.get("registerTime"))
    print("ranking:", u.get("ranking"), "passed:", u.get("passedProblemCount"),
          "submitted:", u.get("submittedProblemCount"))
    print("gu:", json.dumps(u.get("gu"), ensure_ascii=False)[:400])
    print("prizes:", json.dumps(u.get("prizes"), ensure_ascii=False)[:1500])
    print("elo:", json.dumps(u.get("elo"), ensure_ascii=False)[:800])
    print("keys:", list(d.keys()))


def show_articles(ctx):
    d = ctx["data"]
    arts = d.get("articles") or {}
    print("count:", arts.get("count"), "perPage:", arts.get("perPage"))
    for a in arts.get("result") or []:
        print(f"{a.get('lid')}\tcat{a.get('category')}\t{a.get('time')}\tup{a.get('upvote')}\t"
              f"reply{a.get('replyCount')}\t{a.get('title')}")
        if a.get("solutionFor"):
            print("   solutionFor:", json.dumps(a.get("solutionFor"), ensure_ascii=False))
        if a.get("content"):
            txt = re.sub(r"<[^>]+>", " ", a["content"] or "")
            print("   ", re.sub(r"\s+", " ", txt)[:200])


def main():
    mode, path = sys.argv[1], sys.argv[2]
    ctx = load(path)
    if ctx is None:
        print("NO_CONTEXT", path)
        return
    if mode == "user":
        show_user(ctx)
    else:
        show_articles(ctx)


if __name__ == "__main__":
    main()
