import io

p = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\src\game.ts'
s = io.open(p, encoding='utf-8').read()
subs = [
    ("const skill = st.skills.topics[p.topic] * 100;\n    const fit",
     "const skill = st.skills.topics[p.topic] * ABILITY_UNITS;\n    const fit"),
    ("(0.12 - (st.skills.coding * 100 - p.impl) / 90)",
     "(0.12 - (st.skills.coding * ABILITY_UNITS - p.impl) / 90)"),
    ("const gap = st.skills.topics[p.topic] * 100 - p.think;",
     "const gap = st.skills.topics[p.topic] * ABILITY_UNITS - p.think;"),
    ("const skill = st.skills.topics[p.topic] * 100;\n    const room",
     "const skill = st.skills.topics[p.topic] * ABILITY_UNITS;\n    const room"),
]
for a, b in subs:
    print(s.count(a), a.splitlines()[0][:55])
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
