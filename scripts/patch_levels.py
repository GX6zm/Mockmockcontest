import io

base = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
p = base + r'\src\season.ts'
s = io.open(p, encoding='utf-8').read()

# 颜色档：0 红 入门 / 1 橙 普及- / 2 黄 普及 / 3 绿 普及+/提高- / 4 青 提高 / 5 蓝 提高+/省选- / 6 紫 省选 / 7 黑 NOI+
# 按洛谷真题颜色重排，顺序对应各赛事的 T1..Tn
pairs = [
    # CSP-S 2026：能量水晶 d2 橙、地铁 d4 绿、迁徙 d7 黑、研发基地 d8 黑
    ("kind: 'contest', group: 'S', levels: [3, 4, 5, 6], minutes: 240, days: 1,",
     "kind: 'contest', group: 'S', levels: [1, 3, 7, 7], minutes: 240, days: 1,"),
    # NOIP 2025：糖果店 d3 黄、清仓甩卖 d7 黑、树的价值/序列询问 d8 黑
    ("kind: 'contest', group: 'S', levels: [3, 4, 5, 6], minutes: 270, days: 1,",
     "kind: 'contest', group: 'S', levels: [2, 7, 7, 7], minutes: 270, days: 1,"),
    # WC 2026：二进制 d7 黑、猫和老鼠/画树 d8 黑
    ("kind: 'contest', group: 'OPEN', levels: [5, 6, 7], minutes: 300, days: 1,",
     "kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 1,"),
    # 省选 2026：找寻者 d6 紫、摩卡串 d7 黑、夜空 d8 黑 / 排列游戏 d5 蓝、星图/工业系统 d8 黑
    ("kind: 'contest', group: 'OPEN', levels: [4, 5, 6], minutes: 270, days: 2,",
     "kind: 'contest', group: 'OPEN', levels: [6, 7, 7], minutes: 270, days: 2,"),
    # APIO 2026 中国赛区：上升/集宝 d8 黑、蛋糕 d7 黑
    ("kind: 'contest', group: 'OPEN', levels: [4, 5, 6], minutes: 300, days: 1,",
     "kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 1,"),
    # NOI 2026：线段 d6 紫、传送/布丁 d7/d8 黑（D2 中位数 d7、木棉/彩虹树 d8）
    ("kind: 'contest', group: 'OPEN', levels: [5, 6, 7], minutes: 300, days: 2,",
     "kind: 'contest', group: 'OPEN', levels: [6, 7, 7], minutes: 300, days: 2,"),
]
for a, b in pairs:
    print(s.count(a), a[:60])
    s = s.replace(a, b, 1)

# CTT / CTS / IOI：集训队、国家队选拔基本全黑；IOI 保留一题黄
s = s.replace("kind: 'contest', group: 'OPEN', levels: [5, 6, 7], minutes: 300, days: 3,",
              "kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 3,", 1)
s = s.replace("kind: 'contest', group: 'OPEN', levels: [6, 7, 7], minutes: 300, days: 2,",
              "kind: 'contest', group: 'OPEN', levels: [7, 7, 7], minutes: 300, days: 2,", 1)
s = s.replace("kind: 'contest', group: 'OPEN', levels: [6, 7, 7], minutes: 300, days: 2,",
              "kind: 'contest', group: 'OPEN', levels: [2, 7, 7], minutes: 300, days: 2,", 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
