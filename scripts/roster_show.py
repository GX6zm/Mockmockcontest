#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Print roster.ts lines whose `name: "..."` matches one of the args."""
import re
import sys
import os

ROSTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "roster.ts")


def main():
    names = set(sys.argv[1:])
    for line in open(ROSTER, encoding="utf-8"):
        m = re.search(r'name:\s*"([^"]+)"', line)
        if m and (not names or m.group(1) in names):
            print(line.strip())
            print()


if __name__ == "__main__":
    main()
