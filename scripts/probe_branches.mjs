// 抽查：多种正解 + 前期/后期两步是否生效
import { chainFor } from '../src/thinking.ts';

const fake = (title, topic, level, id) => ({
  id, title, topic, level, difficulty: 52, subtasks: [], timeLimit: 1, memoryLimit: 256,
});

const samples = [
  fake('区间划分', 'dp', 7, 1),
  fake('连通性询问', 'ds', 6, 2),
  fake('最短路径', 'graph', 8, 3),
  fake('括号匹配', 'string', 2, 4),
];

for (const p of samples) {
  const c = chainFor(p);
  console.log(`\n== ${p.title} (level ${p.level}) 正解=${c.branchName ?? '专属链'} 另解=${(c.altNames ?? []).join(' / ') || '无'}`);
  for (const s of c.canonical) console.log(`  [${s.phase}] ${s.kind}: ${s.text}`);
  if (c.alternatives[0]) {
    console.log('  -- 另解的结构步:', c.alternatives[0].find((s) => s.kind === 'structure')?.text);
  }
}
