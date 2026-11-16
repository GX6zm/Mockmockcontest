import io, re

base = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src'
p = base + r'\src\game.ts'
text = io.open(p, encoding='utf-8').read()

helper = """/**
 * 一场比赛里，某人的“有效解题能力”。
 * 现实里赛题落在哪个主题是随机的，但强手不会因为题目是字符串就突然不会做——
 * 所以按综合能力做 70% 的平滑，只留 30% 给主题特长，否则每场分数会随抽题剧烈跳动。
 */
const TOPIC_BLEND = 0.3;
function abilityOf(st: Student, topic: Topic): number {
  const vals = Object.values(st.skills.topics);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5;
  const own = st.skills.topics[topic] ?? avg;
  return (own * TOPIC_BLEND + avg * (1 - TOPIC_BLEND)) * ABILITY_UNITS;
}

"""
anchor = "/**\n * 洛谷现行 8 档难度"
assert text.count(anchor) == 1
# 放在 LEVELS 之前（依赖 Topic/Student 类型，函数体运行时求值无碍）
text = text.replace(anchor, helper + anchor)

pairs = [
    ("const skill = st.skills.topics[p.topic] * ABILITY_UNITS;", "const skill = abilityOf(st, p.topic);"),
    ("const gap = st.skills.topics[p.topic] * ABILITY_UNITS - p.think;", "const gap = abilityOf(st, p.topic) - p.think;"),
]
for a, b in pairs:
    print(text.count(a), a[:45])
    text = text.replace(a, b)

io.open(p, 'w', encoding='utf-8', newline='').write(text)
print('ok')

