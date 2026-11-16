import io

base = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
src = io.open(base + r'\scripts\_orig_game.ts', 'rb').read()
text = src.decode('utf-8')  # 校验原始文件是 UTF-8
print('orig ok, lines', text.count('\n') + 1, 'has 题库', '题库' in text)

# 1) 能力单位常量 + 说明
anchor = '// ===== 题库：标题同时绑定「题型」和「适用难度档」====='
const_block = """/**
 * 能力单位换算：0–1 技能 → 难度刻度（1–115）上的“解题能力”。
 * 0.83（吕明栩这档）≈ 112，能稳稳吃掉“提高+/省选-”（78）；
 * 0.55（省一中游）≈ 74，能吃提高（68）但吃不下省选；0.35 只有 47，够普及+/提高-。
 * 系数直接决定“同一个人一场比赛能做掉几道题”，改前先跑 scripts/calib_real.mjs。
 */
export const ABILITY_UNITS = 135;

"""
assert text.count(anchor) == 1
text = text.replace(anchor, const_block + anchor)

# 2) 技能 → 难度单位的换算点
pairs = [
    ("const skill = st.skills.topics[p.topic] * 100;", "const skill = st.skills.topics[p.topic] * ABILITY_UNITS;"),
    ("(0.12 - (st.skills.coding * 100 - p.impl) / 90)", "(0.12 - (st.skills.coding * ABILITY_UNITS - p.impl) / 90)"),
    ("const gap = st.skills.topics[p.topic] * 100 - p.think;", "const gap = st.skills.topics[p.topic] * ABILITY_UNITS - p.think;"),
]
for a, b in pairs:
    print('replace', text.count(a), a[:40])
    text = text.replace(a, b)

# 3) 开局按题号顺序
old_order = """    if (early) s *= 1 + Math.max(0, 3 - p.level) * 0.28;"""
new_order = """    if (early) {
      s *= 1 + Math.max(0, 3 - p.level) * 0.28;
      // 前半场更愿意“按顺序开题”，而不是凭性价比直接跳到最后一题
      s *= 1 + 0.9 * (1 - p.id / Math.max(1, c.problems.length - 1));
    }"""
print('order', text.count(old_order))
text = text.replace(old_order, new_order)

io.open(base + r'\src\game.ts', 'w', encoding='utf-8', newline='').write(text)
print('written, lines', text.count('\n') + 1)
