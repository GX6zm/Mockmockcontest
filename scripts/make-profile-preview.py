#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 data/属性对照表.csv 生成带实时公式的 Excel 预览表。

只读 CSV，不修改游戏数据；输出 data/属性对照表-综合预览.xlsx。
改 D–N 列的黄色格子，P 列“综合”会按引擎公式实时重算。
"""
import csv
import io
from pathlib import Path

import xlsxwriter

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "属性对照表.csv"
OUT = ROOT / "data" / "属性对照表-综合预览.xlsx"

TOPICS = ["数学", "动态规划", "图论", "贪心", "数据结构", "模拟实现", "字符串", "计算几何"]
META = ["代码", "阅读", "调试"]
GRADES = ["初一", "初二", "初三", "高一", "高二", "高三"]
HEADERS = ["姓名", "年级", "天赋", *TOPICS, *META, "备注", "综合", "知识点均值", "综合排名"]


def read_rows():
    raw = CSV.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("gbk")
    reader = csv.reader(io.StringIO(text))
    header = [h.strip() for h in next(reader)]
    idx = {h: i for i, h in enumerate(header)}
    rows = []
    for raw_row in reader:
        if not raw_row or not raw_row[0].strip():
            continue
        row = [c.strip() for c in raw_row]
        name = row[idx["姓名"]]
        if name == "姓名":
            continue
        rec = {
            "name": name,
            "grade": row[idx["年级"]],
            "talent": float(row[idx["天赋"]] or 0),
            "topics": [float(row[idx[t]] or 0) for t in TOPICS],
            "coding": float(row[idx["代码"]] or 0),
            "reading": float(row[idx["阅读"]] or 0),
            "debug": float(row[idx["调试"]] or 0),
            "note": row[idx["备注"]] if "备注" in idx else "",
        }
        avg = sum(rec["topics"]) / len(TOPICS)
        rec["avg"] = avg
        rec["overall"] = round(avg * 0.8 + rec["coding"] * 0.12 + rec["debug"] * 0.08, 1)
        rows.append(rec)
    for rec in rows:
        rec["rank"] = 1 + sum(1 for other in rows if other["overall"] > rec["overall"])
    return rows


def main():
    rows = read_rows()
    wb = xlsxwriter.Workbook(str(OUT))
    wb.set_properties(
        {
            "title": "OI 选手属性 · 综合实时预览",
            "subject": "改一个知识点即可看到综合变化",
            "author": "OI 模拟赛项目",
            "comments": "由 scripts/make-profile-preview.py 从 data/属性对照表.csv 生成",
        }
    )

    ws = wb.add_worksheet("属性表")
    ws.set_tab_color("#4F46E5")
    ws.hide_gridlines(2)

    fmt_title = wb.add_format(
        {
            "bold": True,
            "font_size": 14,
            "font_color": "#FFFFFF",
            "bg_color": "#111827",
            "align": "left",
            "valign": "vcenter",
        }
    )
    fmt_header = wb.add_format(
        {
            "bold": True,
            "font_color": "#FFFFFF",
            "bg_color": "#1F2937",
            "align": "center",
            "valign": "vcenter",
            "border": 1,
            "border_color": "#374151",
            "text_wrap": True,
        }
    )
    fmt_text = wb.add_format(
        {"border": 1, "border_color": "#D1D5DB", "valign": "vcenter", "font_color": "#111827"}
    )
    fmt_center = wb.add_format(
        {
            "border": 1,
            "border_color": "#D1D5DB",
            "valign": "vcenter",
            "align": "center",
            "font_color": "#111827",
        }
    )
    fmt_num = wb.add_format(
        {
            "border": 1,
            "border_color": "#D1D5DB",
            "valign": "vcenter",
            "align": "center",
            "num_format": "0",
            "bg_color": "#FFFBEB",
            "font_color": "#111827",
        }
    )
    fmt_talent = wb.add_format(
        {
            "border": 1,
            "border_color": "#D1D5DB",
            "valign": "vcenter",
            "align": "center",
            "num_format": "0.000",
            "bg_color": "#FFFBEB",
            "font_color": "#111827",
        }
    )
    fmt_grade = wb.add_format(
        {
            "border": 1,
            "border_color": "#D1D5DB",
            "valign": "vcenter",
            "align": "center",
            "bg_color": "#FFFBEB",
            "font_color": "#111827",
        }
    )
    fmt_note = wb.add_format(
        {
            "border": 1,
            "border_color": "#D1D5DB",
            "valign": "vcenter",
            "font_color": "#4B5563",
            "bg_color": "#F9FAFB",
        }
    )
    fmt_overall = wb.add_format(
        {
            "border": 1,
            "border_color": "#C7D2FE",
            "valign": "vcenter",
            "align": "center",
            "num_format": "0.0",
            "bold": True,
            "bg_color": "#E0E7FF",
            "font_color": "#1E1B4B",
        }
    )
    fmt_avg = wb.add_format(
        {
            "border": 1,
            "border_color": "#C7D2FE",
            "valign": "vcenter",
            "align": "center",
            "num_format": "0.00",
            "bg_color": "#EEF2FF",
            "font_color": "#3730A3",
        }
    )
    fmt_rank = wb.add_format(
        {
            "border": 1,
            "border_color": "#C7D2FE",
            "valign": "vcenter",
            "align": "center",
            "num_format": "0",
            "bg_color": "#EEF2FF",
            "font_color": "#3730A3",
        }
    )

    ws.merge_range(0, 0, 0, len(HEADERS) - 1, "OI 选手属性 · 综合实时预览 ｜ 改黄色格，P 列自动重算", fmt_title)
    ws.set_row(0, 28)
    for col, head in enumerate(HEADERS):
        ws.write_string(1, col, head, fmt_header)
    ws.set_row(1, 34)

    for i, rec in enumerate(rows):
        r = i + 2
        excel_row = r + 1  # 1-based Excel row
        ws.write_string(r, 0, rec["name"], fmt_text)
        ws.write_string(r, 1, rec["grade"], fmt_grade)
        ws.write_number(r, 2, rec["talent"], fmt_talent)
        for j, val in enumerate(rec["topics"]):
            ws.write_number(r, 3 + j, val, fmt_num)
        ws.write_number(r, 11, rec["coding"], fmt_num)
        ws.write_number(r, 12, rec["reading"], fmt_num)
        ws.write_number(r, 13, rec["debug"], fmt_num)
        ws.write_string(r, 14, rec["note"], fmt_note)
        formula_p = (
            f"=ROUND(AVERAGE(D{excel_row}:K{excel_row})*0.8"
            f"+L{excel_row}*0.12+N{excel_row}*0.08,1)"
        )
        ws.write_formula(r, 15, formula_p, fmt_overall, rec["overall"])
        ws.write_formula(
            r, 16, f"=ROUND(AVERAGE(D{excel_row}:K{excel_row}),2)", fmt_avg, round(rec["avg"], 2)
        )
        ws.write_formula(
            r,
            17,
            f"=RANK(P{excel_row},$P$3:$P${len(rows) + 2},0)",
            fmt_rank,
            rec["rank"],
        )

    last_row = len(rows) + 1
    ws.autofilter(1, 0, last_row, len(HEADERS) - 1)
    ws.freeze_panes(2, 4)

    widths = [14, 8, 8] + [8.5] * 8 + [7, 7, 7, 26, 9, 11, 10]
    for col, width in enumerate(widths):
        ws.set_column(col, col, width)

    # 输入区提示色 + 公式区
    ws.data_validation(
        2,
        3,
        last_row,
        13,
        {
            "validate": "decimal",
            "criteria": "between",
            "minimum": 0,
            "maximum": 100,
            "error_title": "数值范围",
            "error_message": "知识点 / 代码 / 阅读 / 调试请填 0–100。",
            "input_title": "可改",
            "input_message": "填 0–100 的整数；改完 P 列会自动重算。",
        },
    )
    ws.data_validation(
        2,
        2,
        last_row,
        2,
        {
            "validate": "decimal",
            "criteria": "between",
            "minimum": 0.5,
            "maximum": 1.5,
            "error_title": "天赋范围",
            "error_message": "天赋建议 0.5–1.5，常用 0.85–1.15。",
        },
    )
    ws.data_validation(
        2,
        1,
        last_row,
        1,
        {
            "validate": "list",
            "source": GRADES,
            "error_title": "年级",
            "error_message": "请从下拉列表里选初一…高三。",
        },
    )

    ws.conditional_format(
        2,
        15,
        last_row,
        15,
        {
            "type": "3_color_scale",
            "min_color": "#FCA5A5",
            "mid_color": "#FDE68A",
            "max_color": "#86EFAC",
        },
    )

    note = wb.add_worksheet("说明")
    note.set_column("A:A", 110)
    note.hide_gridlines(2)
    title2 = wb.add_format(
        {"bold": True, "font_size": 16, "font_color": "#111827", "valign": "vcenter"}
    )
    body = wb.add_format({"font_size": 11, "font_color": "#374151", "text_wrap": True, "valign": "top"})
    code = wb.add_format(
        {
            "font_name": "Consolas",
            "font_size": 10,
            "font_color": "#1E1B4B",
            "bg_color": "#EEF2FF",
            "border": 1,
            "border_color": "#C7D2FE",
            "text_wrap": True,
            "valign": "vcenter",
        }
    )
    note.write_string(0, 0, "这个表怎么用", title2)
    note.write_string(2, 0, "改「属性表」里 D–N 列的黄色格子，P 列「综合」会立刻按引擎公式重算；Q 是 8 个知识点的平均值，R 是队内排名。", body)
    note.write_string(4, 0, "引擎公式（与 src/season.ts 的 overallOf 一致）", body)
    note.write_string(5, 0, "综合 = ROUND(0.8 × 平均(数学 … 计算几何) + 0.12 × 代码 + 0.08 × 调试, 1)", code)
    note.write_string(6, 0, "阅读不参与综合；它只影响比赛里的读题/理解，不改综合分。", body)
    note.write_string(8, 0, "注意", body)
    note.write_string(9, 0, "1. 这个 xlsx 只是预览表，游戏读取的仍是 data/属性对照表.csv。", body)
    note.write_string(10, 0, "2. 数值定稿后，把 D–N 列的值同步回 CSV（或告诉我，我来同步），再跑 profile.mjs。", body)
    note.write_string(11, 0, "3. 不要改姓名列，也不要加/删行；姓名是同步时的匹配键。", body)
    note.write_string(12, 0, "4. 黄色格是输入区，蓝紫色 P/Q/R 是公式区，不要手填公式结果。", body)
    note.set_row(5, 34)
    for r in (2, 4, 6, 8, 9, 10, 11, 12):
        note.set_row(r, 28)

    wb.close()
    print(f"wrote {OUT} ({len(rows)} players)")


if __name__ == "__main__":
    main()
