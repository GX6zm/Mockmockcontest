# -*- coding: utf-8 -*-
import io
P = r'C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src\data\level-analysis.md'
with io.open(P, encoding='utf-8') as f:
    t = f.read()

old = '''### 游戏数值建议（按 0–100 归一）
- 基础实力：**45**（pct 13% ≈ D 档下沿；若按自评 3% 则为 70，但游戏数值应以实测为锚）
- 上限 / 潜力：**72**（自评 265 与一年 +135 的斜率支撑）
- 稳定性：**40**（S2025 65 与 S2026 200 落差大，且关键场会主动收手）'''

new = '''### 游戏数值建议（按 0–100 归一，口径见文末总表）
- 基础实力：**50**（S2026 200 ÷ 4；pct 13.0%）
- 成长指数：**95**（+135/年，全队并列前三——蔡青辰 99、李金潼 99、刘子牧 95）
- 综合：**68.0**（0.6×50 + 0.4×95），在总表 24 人中排第 9，与自评「认真打 265」对应的位置吻合
- 稳定性：**40**（S2025 65 与 S2026 200 落差大，且关键场会主动收手）

**但成长指数要打折看**：+135 是从 65 的低基上跳起来的，其中有多少是「补回 2025 的失常」无法区分；只有一年样本。它的正确含义是「趋势向上、未兑现」，不是「已经有 265 的实力」。'''
assert old in t
t = t.replace(old, new)
with io.open(P, 'w', encoding='utf-8', newline='\n') as f:
    f.write(t)
print('patched', len(t))
