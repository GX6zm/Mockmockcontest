"""从 data.noip.space 的 CSP 获奖名单页面提取陕西选手成绩。

这些页面的文件名是 j1/j2/s1…，但真实含义是「组别 + 奖项等级」：
  j = 普及组（CSP-J），s = 提高组（CSP-S），1/2/3 = 一/二/三等奖
成绩是第二轮（复赛）分数，满分 400。

用法：python scripts/data/extract-csp-awards.py <html目录> [输出json] [--all]
  默认只保留陕西行（体积小、够用）；加 --all 保留全国名单。
"""
import json
import os
import re
import sys

from lxml import html

PROVINCE = "陕西"
TITLE_RE = re.compile(r"CSP\s*(\d{4})\s*(普及|提高)组\s*([一二三])\s*等奖")


def parse_page(path):
    """返回 (meta, rows)，meta 为 {year, group, award, label}；不是名单页返回 (None, [])。"""
    doc = html.parse(path)
    title = " ".join(t.strip() for t in doc.xpath("//title/text()"))
    m = TITLE_RE.search(title)
    if not m:
        return None, []
    year, group_cn, award_cn = m.group(1), m.group(2), m.group(3)
    group = "j" if group_cn == "普及" else "s"
    award = {"一": 1, "二": 2, "三": 3}[award_cn]

    tables = doc.xpath("//table")
    if not tables:
        return {"year": year, "group": group, "award": award}, []
    trs = tables[0].xpath(".//tr")
    if not trs:
        return {"year": year, "group": group, "award": award}, []
    header = [c.text_content().strip() for c in trs[0].xpath("./td|./th")]
    rows = []
    for tr in trs[1:]:
        cells = [c.text_content().strip() for c in tr.xpath("./td|./th")]
        if len(cells) != len(header):
            continue
        rows.append(dict(zip(header, cells)))
    return {"year": year, "group": group, "award": award}, rows


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    keep_all = '--all' in sys.argv
    src_dir = args[0] if args else os.environ.get("TEMP", ".")
    dst = args[1] if len(args) > 1 else os.path.join(src_dir, "shaanxi.json")

    result = {}
    for name in sorted(os.listdir(src_dir)):
        if not name.endswith(".html"):
            continue
        path = os.path.join(src_dir, name)
        meta, rows = parse_page(path)
        if meta is None:
            continue
        shaanxi = [r for r in rows if r.get("省份") == PROVINCE]
        if not rows:
            print(f"{name:18s} 空页面（{meta['year']} {meta['group']}{meta['award']} 等奖）")
            continue
        key = f"{meta['year']}_{meta['group']}{meta['award']}"
        entry = {
            "year": int(meta["year"]),
            "group": meta["group"],
            "award": meta["award"],
            "total": len(rows),
            "rows": shaanxi,
        }
        if keep_all:
            entry["all"] = rows
        result[key] = entry
        print(f"{name:18s} 全国 {len(rows):6d}  陕西 {len(shaanxi):5d}  ({meta['year']} {meta['group']}{meta['award']}等奖)")

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    total = sum(len(v["rows"]) for v in result.values())
    print(f"\n共 {len(result)} 张名单、{total} 条陕西记录 -> {dst}")


if __name__ == "__main__":
    main()
