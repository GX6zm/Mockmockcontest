import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\season.ts'
s = io.open(p, encoding='utf-8').read()

# 真实难度（洛谷标签 → 1-115 内部难度）换算：
# 入门 10 / 普及- 24 / 普及 38 / 普及+ 52 / 提高 68 / 提高+ 78 / 省选 94 / NOI 106 / NOI+ 112
new_ranges = {
    # CSP-S 2025/2024：T1 普及+ (52)、T2 提高+/省选- (78)、T3 省选 (94)、T4 NOI (108)
    "ranges: [[45, 60], [60, 75], [72, 85], [85, 100]],":
        "ranges: [[44, 54], [72, 82], [88, 98], [102, 112]],",
    # NOIP 2025：T1 普及 (38→50)、T2-T4 全是 NOI/NOI+（2024 略软，折中一点）
    "ranges: [[58, 72], [62, 78], [72, 86], [86, 100]],":
        "ranges: [[46, 56], [84, 94], [100, 110], [104, 114]],",
    # WC 2025：T1 普及+/提高 (55)、T2/T3 NOI 级
    "ranges: [[78, 90], [85, 98], [92, 108]],":
        "ranges: [[56, 66], [100, 110], [104, 114]],",
    # 省选联考 2025/2026：每天 T1 提高+/省选- (78)，T2/T3 省选~NOI
    "ranges: [[62, 76], [76, 90], [88, 102]],":
        "ranges: [[74, 84], [96, 104], [106, 114]],",
    # APIO 2025：T1 省选- (94)、T2/T3 NOI/NOI+
    "ranges: [[72, 86], [82, 96], [90, 106]],":
        "ranges: [[90, 100], [104, 112], [106, 114]],",
    # NOI 2026：D1T1 省选 (94)，其余 NOI/NOI+
    "ranges: [[85, 96], [92, 104], [98, 112]],":
        "ranges: [[88, 96], [102, 110], [106, 114]],",
}
for a, b in new_ranges.items():
    n = s.count(a)
    print(n, a[:40])
    s = s.replace(a, b, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
