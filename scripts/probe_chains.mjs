/** 题目思维链覆盖率探针：逐题打印链，检查每个题名都有专属句子、没有穿帮 */
import { chainFor } from '../src/thinking.ts';
import { TITLE_CHAINS } from '../src/chains.ts';

const fake = (title, level) => ({
  id: 1,
  title,
  topic: 'dp',
  level,
  difficulty: 52,
  subtasks: [{ points: 40 }, { points: 30 }, { points: 30 }],
  timeLimit: 1000,
  memoryLimit: 256,
  think: 50,
  impl: 50,
  detail: 50,
});

const titles = Object.keys(TITLE_CHAINS);
let bad = 0;
const only = process.argv[2];
for (const t of titles) {
  const level = t === only ? 6 : 6;
  const c = chainFor(fake(t, level));
  const texts = c.canonical.map((s) => s.text);
  const empty = texts.some((x) => !x || x.length < 6);
  const generic = texts.some((x) => /标准框架摆出来|那一类的做法|标准写法来/.test(x));
  if (empty || generic) { bad++; console.log('BAD', t, texts); }
  if (only === t || (!only && ['快速幂', '模拟电梯', 'KMP 匹配', '凸包', '0/1 背包'].includes(t))) {
    console.log(`\n【${t}】`);
    c.canonical.forEach((s, i) => console.log(` ${i + 1}. [${s.kind}] ${s.text}${s.complexity ? '  ' + s.complexity : ''}`));
    console.log('  坑:', c.traps.map((x) => x.text).join(' / '));
  }
}
console.log(`\n覆盖 ${titles.length} 个题名，异常 ${bad} 个`);
