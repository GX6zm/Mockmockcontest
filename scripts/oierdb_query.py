#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Query local OIerDb dump (UTF-8) for contest records.

Usage:
  python oierdb_query.py <name> [<name> ...]
  python oierdb_query.py --school 3319
  python oierdb_query.py --contests
"""
import json
import sys
import os
from collections import defaultdict

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
STATIC = os.path.join(BASE, "oierdb-static.json")
RESULT = os.path.join(BASE, "oierdb-result.txt")


def load_static():
    with open(STATIC, "r", encoding="utf-8") as f:
        return json.load(f)


def load_players():
    players = []
    with open(RESULT, "r", encoding="utf-8") as f:
        next(f, None)
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 9:
                continue
            uid, initials, name, gender, enroll, score, ccf_score, ccf_level = parts[:8]
            raw = ",".join(parts[8:])
            recs = []
            for chunk in raw.split("/"):
                if not chunk.strip():
                    continue
                f2 = chunk.split(":")
                if len(f2) < 6:
                    continue
                recs.append({"contest": int(f2[0]), "school": int(f2[1]),
                             "score": f2[2], "rank": f2[3],
                             "grade": f2[4], "level": f2[5]})
            players.append({"uid": int(uid), "initials": initials, "name": name,
                            "gender": gender, "enroll": enroll,
                            "oierdb_score": float(score),
                            "ccf_score": float(ccf_score or 0),
                            "ccf_level": int(ccf_level or 0),
                            "records": recs})
    return players


LEVEL_CSP = {3: "一等", 4: "二等", 5: "三等", 0: "-"}
LEVEL_ONOI = {0: "Au", 1: "Ag", 2: "Cu", 3: "-"}


def level_name(contest_name, raw):
    key = "level"
    if contest_name and (contest_name.startswith("NOI") or contest_name.startswith("WC")
                         or contest_name.startswith("APIO") or contest_name.startswith("CTS")
                         or contest_name.startswith("IOI")):
        return LEVEL_ONOI.get(raw, f"?{raw}")
    return LEVEL_CSP.get(raw, f"?{raw}")
TYPE = {0: "NOI", 1: "省选", 2: "CSP", 3: "WC", 4: "APIO", 5: "CTS", 6: "其他"}


def main():
    static = load_static()
    contests = static["contests"]
    cid2c = {i: c for i, c in enumerate(contests)}  # record contest id == 0-based index
    school_rank = {}
    for i, s in enumerate(static["schools"], 1):
        school_rank[i] = s
    players = load_players()
    totals = defaultdict(int)
    for p in players:
        for r in p["records"]:
            totals[r["contest"]] += 1

    if "--contests" in sys.argv:
        for cid in sorted(cid2c):
            c = cid2c[cid]
            print(f"{cid}\t{c['name']}\ttype={TYPE.get(c['type'], c['type'])}\tfull={c['full_score']}\tplayers={totals[cid]}")
        return

    if "--school" in sys.argv:
        sid = int(sys.argv[sys.argv.index("--school") + 1])
        rows = [p for p in players if any(r["school"] == sid for r in p["records"])]
        rows.sort(key=lambda p: -p["oierdb_score"])
        if sid in school_rank:
            print("# school:", school_rank[sid])
        for i, p in enumerate(rows, 1):
            print(f"{i}\t{p['uid']}\t{p['name']}\t{p['enroll']}\t{p['oierdb_score']}\tccf{p['ccf_level']}")
        return

    byname = defaultdict(list)
    for p in players:
        byname[p["name"]].append(p)
    for q in sys.argv[1:]:
        hits = byname.get(q, [])
        if not hits:
            print(f"== {q}: NOT FOUND ==")
            continue
        for p in hits:
            print(f"== {q} uid={p['uid']} initials={p['initials']} enroll={p['enroll']} "
                  f"score={p['oierdb_score']} ccf={p['ccf_level']}({p['ccf_score']}) ==")
            for r in sorted(p["records"], key=lambda r: r["contest"], reverse=True):
                c = cid2c.get(r["contest"], {})
                print(f"  [{r['contest']:>3}] {c.get('name')} full={c.get('full_score')} "
                      f"score={r['score']} rank={r['rank']}/{totals[r['contest']]} "
                      f"level={level_name(c.get("name"), int(r["level"]))} grade={r['grade']}")


if __name__ == "__main__":
    main()
