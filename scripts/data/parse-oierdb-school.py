"""从 OIerDb NG 的学校页（浏览器另存的 HTML）解析选手列表。

用法：python scripts/data/parse-oierdb-school.py "<学校页.html>" [输出.json]

页面上的表头是：# / 姓名 / 年级 / 全国排名 / 评分 / CCF 评级。
注意 OIerDb 的学校页是分页的，每页 30 人；要多页就把每页分别另存再依次解析。
"""
import json
import sys

from lxml import html


def parse(path):
    doc = html.parse(path)
    title = " ".join(t.strip() for t in doc.xpath("//title/text()"))
    school = title.split(" - ")[0].strip() if " - " in title else title
    rows = []
    for tbl in doc.xpath("//table[contains(@class,'unstackable')]"):
        for tr in tbl.xpath(".//tbody/tr"):
            cells = [c.text_content().strip() for c in tr.xpath("./td")]
            if len(cells) != 6:
                continue
            rows.append(
                {
                    "idx": int(cells[0]) if cells[0].isdigit() else None,
                    "name": cells[1],
                    "grade": cells[2],
                    "national": int(cells[3]) if cells[3].isdigit() else None,
                    "score": float(cells[4]) if cells[4].replace(".", "", 1).isdigit() else None,
                    "ccf": int(cells[5]) if cells[5].isdigit() else None,
                }
            )
    return school, rows


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else "data/oierdb-school.json"
    school, rows = parse(src)
    rows = [r for r in rows if r["name"] and r["score"] is not None]
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print(f"{school}：{len(rows)} 人 -> {dst}")
    for r in rows:
        print(f"  {r['idx'] or '':>3} {r['name']:<8} {r['grade']:<6} 全国#{r['national']:<7} 评分 {r['score']:>10.2f} CCF {r['ccf']}")


if __name__ == "__main__":
    main()
