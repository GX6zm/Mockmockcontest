// ===== 思维链：把「一道题怎么想」拆成可以独立丢失的环节 =====
//
// 设计原则（来自洛谷题解调研，见 data/thinking-chain-report.md）：
//   1. 链长随难度增长，但不是线性的；d1–d2 只有 2–3 步，d6–d8 有 5–6 步。
//   2. 每一步都是「串行依赖」的：前一步想不到，后面全部不可见。
//   3. 分数不是链的输入，而是链的输出——先定得分，再倒推他断在哪一步。
//   4. 一题多解是常态，所以除了 canonical 还有 alternatives 和 traps。
//
// 这个文件只做数据层：给定题目 + 选手的每题得分，生成一条「他实际上怎么想的」链。
// UI 在 FocusPanel.tsx 里。

import type { Problem, ProblemState, Skills, Student, Subtask, Topic } from './types.ts';
import { TOPIC_NAMES } from './game.ts';

export type IdeaKind = 'observe' | 'transform' | 'structure' | 'optimize' | 'corner';

export interface IdeaStep {
  kind: IdeaKind;
  /** 这一步具体在做什么，一句话，用选手自己的口吻 */
  text: string;
  /** 这一步完成后的复杂度（选填） */
  complexity?: string;
  /** 对得分的贡献权重 0–1，用来把链和分数对齐 */
  weight: number;
}

export interface Trap {
  /** 会走到的错误方向 */
  text: string;
  /** 走进去大概掉多少分（0–100） */
  loss: number;
}

export interface SolveChain {
  /** 参考解 */
  canonical: IdeaStep[];
  /** 另一种正解走法（可能为空） */
  alternatives: IdeaStep[][];
  /** 常见误区，按难度挑 1–2 条 */
  traps: Trap[];
}

export type StepStatus = 'got' | 'missed' | 'misled' | 'pending';

export interface TracedStep {
  step: IdeaStep;
  status: StepStatus;
  /** 大概在第几分钟想到（相对比赛开始，单位分钟） */
  minute: number;
}

export interface StudentTrace {
  steps: TracedStep[];
  /** 断在第几步（0 = 连第一步都没走通；steps.length = 全部走通） */
  breakAt: number;
  /** 触发过的误区 */
  trapHit: Trap | null;
  /** 这条链对应的最终得分（0–100，和真实得分同口径） */
  score: number;
  /** 一句话总结 */
  summary: string;
}

// ---------- 随机数（确定性，和比赛 seed 无关，只跟题目/选手绑定） ----------

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

// ---------- 按难度分档 ----------

/** 题目的「档」：0–7 色档 → 3 个思维档（低/中/高） */
function tierOf(level: number): 'low' | 'mid' | 'high' {
  if (level <= 1) return 'low';
  if (level <= 4) return 'mid';
  return 'high';
}

/** 这一档题目对复杂度的最低要求，写进「优化」那一步 */
function complexityFloor(level: number): string {
  if (level <= 1) return 'O(n)';
  if (level <= 3) return 'O(n log n)';
  if (level <= 5) return 'O(n log² n)';
  if (level <= 6) return 'O(n√n)';
  return 'O(n log n) 且常数要小';
}

// ---------- 词库：按「知识点 × 环节」组织 ----------
// 句式参考洛谷题解的真实写法：观察到 / 不难证明 / 注意到 / 于是考虑 / 只需在……内选

interface StepPool {
  observe: string[];
  transform: string[];
  structure: string[];
  optimize: string[];
  corner: string[];
}

const POOLS: Record<Topic, StepPool> = {
  dp: {
    observe: [
      '先看数据范围：n ≤ 2000，O(n²) 的状态是装得下的',
      '手推了几组小数据，发现答案只和「最后一次操作」有关',
      '注意到每个位置只被前一个位置影响，像个链式结构',
    ],
    transform: [
      '把「操作序列」反过来考虑：从终态倒推，每次撤销一步',
      '把题面里的代价拆成「每段的固定代价 + 长度 × 单价」',
      '把状态从「哪些点选了」压成「选到第几个 + 当前段的长度」',
    ],
    structure: [
      '设计 f[i][j]：前 i 个位置、当前段长为 j 的最小代价',
      '写出 O(n²) 的转移后发现它其实是一次前缀 min',
      '用单调队列把转移里那一层 j 的枚举摊掉',
    ],
    optimize: [
      '转移是「前缀 max」，用线段树维护每行的最值，复杂度从 O(n³) 降到 O(n² log n)',
      '把「所有左端点」塞进一个堆里，每次取最小后只新增一个候选，复杂度 O(n log n)',
      '发现决策点单调，改成双指针，省掉一层枚举',
    ],
    corner: [
      '答案可能为负，边界的初值要设成 -inf 而不是 0',
      'n = 1 时没有转移，要单独返回 0',
      '多测要清空数组，不然上一组的残留会串进来',
    ],
  },
  graph: {
    observe: [
      '图是稀疏的（m ≤ 2n），说明正解大概率是 O((n+m) log n)',
      '所有边权都是正的，最短路思路可以先试',
      '题面里「不能重复经过同一条边」暗示要拆点',
    ],
    transform: [
      '把「每个点最多用一次」拆成入点/出点，变成二分图匹配',
      '把「路径」转成「从超级源到超级汇的一条流」，容量为 1 就自动不重复',
      '给每个点建两层，层间边权为 0，跨层的边表示「用掉一次机会」',
    ],
    structure: [
      '跑一遍 Dijkstra 预处理出所有关键点对的距离',
      '用 Tarjan 缩点，把环压成一个点后图变成 DAG',
      '按拓扑序做一次 DP，同时维护「以这个点为结尾的最长路」',
    ],
    optimize: [
      '暴力连边的边数是 O(n²)，用线段树优化建图压到 O(n log n)',
      '用可并堆把每个点的「候选集合」合并，总复杂度 O((n+m) log n)',
      '把最短路换成 0-1 BFS，去掉堆的 log',
    ],
    corner: [
      '不连通时要输出 -1，不能直接返回 dis[n]',
      '有自环和重边，读入时要判掉',
      '图可能不弱连通，多源要把所有入度为 0 的点一起塞进队列',
    ],
  },
  greedy: {
    observe: [
      '先按右端点排序试试，交换论证通常能过',
      '手玩发现：越早结束的区间越应该先选',
      '答案只和「当前还能用多少资源」有关，和具体选了谁无关',
    ],
    transform: [
      '把「选最多区间」转成「每个时刻最多占一个资源」的匹配',
      '把代价函数写成「每多等一分钟，多花 c 元」，变成贪心的增量',
      '把原问题取反：最大化留下的，等于最小化删掉的',
    ],
    structure: [
      '用堆维护当前已选区间的结束时间，冲突时弹掉最晚的',
      '把所有候选按收益排序，能拿就拿',
      '用并查集维护「下一个可用的位置」，跳过已经占掉的',
    ],
    optimize: [
      '每次弹堆是 O(log n)，总复杂度 O(n log n)',
      '排序是瓶颈，改成计数排序后 O(n + V)',
      '把逐次判断改成差分前缀，省掉一层循环',
    ],
    corner: [
      '区间端点重合时算不算相交，要按题面来',
      '答案可能爆 int，用 long long',
      '输入可能不保证有序，别忘了先 sort',
    ],
  },
  ds: {
    observe: [
      '操作是「区间加 + 区间求和」，树状数组套一下就行',
      '注意到只有单点修改，没有必要上线段树',
      'n, q ≤ 2e5，必须带 log',
    ],
    transform: [
      '把「区间第 k 小」转成「在值域上二分 + 统计 ≤ mid 的个数」',
      '把树上的路径查询拆成「根到 x + 根到 y − 2 × 根到 lca」',
      '把「颜色段」的合并抽象成「相同颜色的连续段」',
    ],
    structure: [
      '树状数组维护差分数组，区间加变成两次单点加',
      '线段树每个节点存「左端颜色、右端颜色、段数」',
      '主席树按版本建，每个版本只加一条链',
    ],
    optimize: [
      '把线段树的递归改成迭代，常数能小一半',
      '查询只有 O(q) 次，预处理 O(n log n) 反而更划算',
      '用 ODT 均摊，随机数据下总复杂度 O((n+q) log n)',
    ],
    corner: [
      '下标从 1 开始，树状数组的 lowbit 别越界',
      '区间加之后查询要 pushdown，或者干脆用标记永久化',
      'long long 的懒标记在取模时要先模再加',
    ],
  },
  string: {
    observe: [
      '先求一遍 next 数组，很多性质直接就有了',
      '字符串长度 1e6，只能 O(n) 或 O(n log n)',
      '注意到答案和「前缀 = 后缀」有关，往 border 上想',
    ],
    transform: [
      '把「循环同构」转成「s + s 上跑匹配」',
      '把「本质不同子串数」转成「每个后缀贡献的新子串数」',
      '把匹配失败的回跳全部记下来，就是一棵 fail 树',
    ],
    structure: [
      '建 SAM，每个状态的 endpos 大小就是出现次数',
      '后缀数组 + height 数组，用单调栈统计每个 height 的贡献',
      '把模式串拼起来建 AC 自动机，文本串在上面跑',
    ],
    optimize: [
      'fail 树上做一次子树和，把「每个串出现几次」一次算完',
      '用基数排序替代快排，后缀数组建到 O(n log n)',
      '把哈希换成双哈希，冲突概率降到可忽略',
    ],
    corner: [
      '空串、单字符要特判，不然 SAM 会少一个状态',
      '哈希 base 要大于字符集，且不能是常见数',
      '多测时 SAM 的节点数要重置，否则越界',
    ],
  },
  math: {
    observe: [
      '公式里出现了阶乘和逆元，先预处理到 1e6',
      'n ≤ 1e18，只能是 log 级的做法，往矩阵快速幂上想',
      '手推前几项，发现是个线性递推',
    ],
    transform: [
      '把「求和」转成「枚举 gcd 再莫比乌斯反演」',
      '把「恰好 k 个」用二项式反演转成「至少 k 个」',
      '把递推写成矩阵，用快速幂一次跳 n 步',
    ],
    structure: [
      '线性筛预处理出 μ 和 phi，再整除分块',
      '构造转移矩阵，大小是 k × k',
      '用扩展欧拉定理把指数降下来',
    ],
    optimize: [
      '整除分块把 O(n) 的求和降到 O(√n)',
      '矩阵乘法的常数太大，改成 k 次多项式乘法',
      '快速幂里每次只乘需要的位，省掉一半',
    ],
    corner: [
      '模数不一定是质数，不能用费马小定理求逆元',
      '指数要对 φ(p) 取模，且要处理 b < φ(p) 的情况',
      '负数取模要加模数再模',
    ],
  },
  impl: {
    observe: [
      '题面很长，但拆开就是「模拟 + 几个边界」',
      '数据范围很小，O(n²) 暴力能过，先保证正确',
      '注意到操作只有几种，可以用数组直接存状态',
    ],
    transform: [
      '把「时间轴上的事件」按时间排序，依次处理',
      '把二维坐标压成一维下标，省掉一层循环',
      '把「每个操作独立」改成「维护整体的偏移量」',
    ],
    structure: [
      '开一个桶记录每个值出现了几次',
      '用一个 vector 存每个位置的历史，查询时二分',
      '按题意写一个 check 函数，主过程逐条模拟',
    ],
    optimize: [
      '每个事件只处理一次，总复杂度 O(n + q)',
      '把重复计算的部分提到循环外',
      '用前缀和把区间查询降到 O(1)',
    ],
    corner: [
      '多测要清空，不然上一组的数据会污染',
      '输出格式（空格/换行）要和样例完全一致',
      '边界：n = 0、所有元素相同、只有一个操作',
    ],
  },
  geometry: {
    observe: [
      '所有点都在凸包上，直接上旋转卡壳',
      'n ≤ 2000，O(n²) 枚举点对是可行的',
      '注意到答案只和「最远点对」有关',
    ],
    transform: [
      '把「面积最大三角形」转成「固定一条边，找最远点」',
      '把「圆覆盖」转成「角度区间覆盖」，扫一遍即可',
      '把叉积的符号当成半平面，用极角排序',
    ],
    structure: [
      '先求凸包，再在凸包上双指针',
      '用扫描线 + 平衡树维护当前的交点集合',
      '三分找单峰函数的最值',
    ],
    optimize: [
      '旋转卡壳把 O(n²) 降到 O(n)',
      '极角排序后双指针，总复杂度 O(n log n)',
      '把浮点比较换成整数叉积，避免精度问题',
    ],
    corner: [
      '共线点要不要保留，按题意决定',
      '浮点误差：比较时用 eps，别直接用 ==',
      'n < 3 时无法构成三角形，直接输出 0',
    ],
  },
};

// 难度档对链的裁剪：低档题不需要 transform/structure/optimize 全套
const STEP_PLAN: Record<'low' | 'mid' | 'high', IdeaKind[]> = {
  low: ['observe', 'transform'],
  mid: ['observe', 'transform', 'structure', 'corner'],
  high: ['observe', 'transform', 'structure', 'optimize', 'corner'],
};

// ---------- 题目级覆盖 ----------
// 题库里的高难题干脆直接以算法命名（快速幂、生成函数、LCT 维护……），
// 这时按知识点随机抽句子会露馅：这道题就叫「快速幂」，不能说他去写了莫比乌斯反演。
// 所以对这些题给一份「题目专属」的链，其它题继续用知识点词库。

const TITLE_CHAINS: Record<string, Partial<Record<IdeaKind, string[]>>> = {
  快速幂: {
    observe: ['指数最大到 1e18，逐个乘肯定不行，只能把它拆成二进制'],
    transform: ['a^b = a^(b&1) × (a²)^(b>>1)，每轮只处理最低位'],
    structure: ['while (b) { if (b & 1) ans = ans * a % p; a = a * a % p; b >>= 1; }'],
    optimize: ['每轮只做一次乘法和一次平方，总共 log b 轮，顺手把 log 挂到指数上'],
    corner: ['模数可能是 1，ans 初值要设 1 不是 0；b = 0 时要直接返回 1'],
  },
  生成函数: {
    observe: ['答案是一个卷积的形式：枚举分拆后两边乘起来'],
    transform: ['把「组合方案数」写成 ∑ a_i b_{n−i}，直接就是多项式乘法的系数'],
    structure: ['把两段方案分别写成多项式 A(x)、B(x)，求它们的卷积'],
    optimize: ['暴力卷积是 O(n²)，上 NTT 把复杂度压到 O(n log n)'],
    corner: ['卷积长度要开到 2n，不然下标越界；模数要选一个能 NTT 的'],
  },
  '多项式 exp': {
    observe: ['n ≤ 1e5，要求的是 exp(F(x))，直接按定义算是 O(n²)'],
    transform: ['把 exp 的式子取 ln：ln G = F，转化成求逆 + 求导 + 积分'],
    structure: ['牛顿迭代：G ← G × (1 − ln G + F) mod x^k，每次规模翻倍'],
    optimize: ['每轮做常数次 NTT，总复杂度 O(n log n)，前提是把求逆也写成迭代'],
    corner: ['常数项必须是 0，否则 exp 无意义；每轮要截断到 x^k'],
  },
  莫比乌斯反演: {
    observe: ['式子里有 ∑_{d|n} μ(d) 的结构，先把 gcd 提出来'],
    transform: ['把「gcd = k」转成「gcd 是 k 的倍数」再反演，答案 = ∑ μ(d) × f(d)'],
    structure: ['线性筛预处理 μ 和前缀和，外层对 d 整除分块'],
    optimize: ['整除分块后每个块内 f 的贡献相同，总复杂度 O(√n) 每组询问'],
    corner: ['μ(1) = 1，别漏；多测要预处理到最大值'],
  },
  数论分块: {
    observe: ['∑ ⌊n/i⌋ 不能逐项算，但 ⌊n/i⌋ 的取值只有 O(√n) 种'],
    transform: ['把相同的 ⌊n/i⌋ 归成一段：i ∈ [l, ⌊n/⌊n/l⌋⌋] 内值不变'],
    structure: ['枚举 l，每次跳到 r + 1，段内直接乘起来'],
    optimize: ['每块 O(1)，总块数 O(√n)，复杂度从 O(n) 降到 O(√n)'],
    corner: ['r 可能超过 n，要取 min；n = 0 时直接返回'],
  },
  组合数取模: {
    observe: ['n、m 最多到 1e6，预处理阶乘和逆元就能 O(1) 查询'],
    transform: ['C(n, m) = n! / (m! (n−m)!)，把除法换成乘逆元'],
    structure: ['线性递推阶乘，再用费马小定理求一次逆元，之后递推逆元'],
    optimize: ['所有查询共用预处理，O(n + q)'],
    corner: ['模数必须大于 n 才能直接用逆元；n < m 要返回 0'],
  },
  后缀数组: {
    observe: ['要求所有后缀的排名，直接比较是 O(n² log n)'],
    transform: ['用倍增：先按长度 1 排，再按长度 2、4、8 排，用 (rk[i], rk[i+k]) 排序'],
    structure: ['基数排序替代快排，每轮 O(n)，共 log n 轮'],
    optimize: ['总复杂度 O(n log n)，常数主要在两轮计数排序'],
    corner: ['排名从 1 开始，越界的那一半要补 0；height 数组长度是 n'],
  },
  网络流建模: {
    observe: ['题面是「每个点最多用一次 + 每个点有收益」，像流量分配'],
    transform: ['把「点只能用一次」拆成入点/出点，中间连容量 1 的边'],
    structure: ['源点连入点、出点连汇点，跑最大流/最小割'],
    optimize: ['Dinic 分层图 + 当前弧优化，复杂度 O(n²m) 实际很快'],
    corner: ['容量要开够，边数开两倍；源汇要单独编号'],
  },
  费用流: {
    observe: ['「最大收益」+「每个点只能用一次」= 最小费用最大流'],
    transform: ['把收益取反当费用，跑最小费用流，答案再取反'],
    structure: ['SPFA/ZKW 求增广路，每次沿最短路推流'],
    optimize: ['把 SPFA 换成势能 Dijkstra，去掉最坏情况的 O(VE)'],
    corner: ['负权边要处理；流量为 0 时答案也可能是 0 而不是 -inf'],
  },
  平衡树: {
    observe: ['要支持插入、删除、查第 k 小，n、q ≤ 1e5'],
    transform: ['把询问离线，换成「区间 + 权值」两个维度'],
    structure: ['FHQ Treap 按权值分裂合并，每个节点维护子树大小'],
    optimize: ['随机优先级让树高期望 log n，单次操作 O(log n)'],
    corner: ['重复元素要单独计数；split 的边界要判空'],
  },
  'LCT 维护': {
    observe: ['要维护动态树的路径信息，树的结构一直在变'],
    transform: ['把树拆成若干条 preferred path，每条用 splay 维护'],
    structure: ['access(x) 把 x 到根的路径变成一条重链，makeroot 换根'],
    optimize: ['均摊 O(log n)，总复杂度 O((n+q) log n)'],
    corner: ['link/cut 前先判连通性；pushdown 不能漏'],
  },
  '动态 DP': {
    observe: ['树上带修改的 DP，每次改一个点不能重跑整棵树'],
    transform: ['把 DP 转移写成矩阵，树上的转移就是矩阵连乘'],
    structure: ['树链剖分把路径拆成重链，用线段树维护区间矩阵积'],
    optimize: ['单次修改 O(log² n)，查询 O(log n)'],
    corner: ['矩阵乘法没有交换律，方向别写反；叶子节点的转移矩阵要单独设'],
  },
};

/** 题目没被单独覆盖时，用带题名的泛化句子，避免「题叫快速幂、他说莫比乌斯反演」 */
function genericStep(p: Problem, kind: IdeaKind): string[] {
  const name = p.title;
  if (kind === 'observe') {
    return [
      `题面基本是裸的「${name}」：先把它的标准框架摆出来，再往里填细节`,
      `数据范围给出的信号很明显：这是「${name}」那一类的做法`,
    ];
  }
  if (kind === 'structure') {
    return [
      `主过程按「${name}」的标准写法来，剩下的就是处理边界`,
      `把「${name}」的模板写完，再对拍一遍确认没有细节漏掉`,
    ];
  }
  return [];
}

/** 题目名是「玩法」而非具体算法时，用知识点词库更自然（模拟电梯不需要谈 NTT） */
const TOPIC_DESCRIPTIVE = new Set([
  '大模拟 · 图书馆',
  '多边形面积',
  '斐波那契数列',
  '高精度乘除',
  '高精度加减',
  '回文判断',
  '简单的计算器',
  '连通块计数',
  '两点间距离',
  '模拟电梯',
  '爬楼梯',
  '排队打水',
  '前缀和',
  '区间调度',
  '区间选点 · 入门',
  '日期计算',
  '数字三角形',
  '统计单词',
  '图的遍历',
  '硬币兑换',
  '约数个数',
  '质因数分解',
  '最大公约数',
]);

/** 题目名本身就是某个技术时，别再往知识点词库里抽「树剖/线段树」那种结构句，容易张冠李戴 */
const GENERIC_MECHANISM: Partial<Record<IdeaKind, string[]>> = {
  transform: [
    '把题面的操作翻译成「一次修改 + 一次询问」，看能不能直接套现成的结构',
    '先写出 O(n²) 的暴力，再从「哪里在重复算」找优化的口子',
  ],
  optimize: [
    '瓶颈都在中间那层枚举，用数据结构或者单调性把它摊掉',
    '把重复的合并成一次，复杂度就下来了',
  ],
  corner: [
    '多测要清空数组和计数器，不然第二组数据直接错',
    'n = 1、元素全相同、下标越界，这三组先测',
    '样例过了还不够，写个暴力对拍一遍再交',
  ],
};

/** 取词：题目专属链 > 带题名的泛化句 > 知识点词库 */
function textsFor(p: Problem, kind: IdeaKind): string[] {
  const own = TITLE_CHAINS[p.title]?.[kind];
  if (own && own.length) return own;
  if (!TOPIC_DESCRIPTIVE.has(p.title)) {
    const generic = genericStep(p, kind);
    if (generic.length) return generic;
    const mech = GENERIC_MECHANISM[kind];
    if (mech) return mech;
    return POOLS[p.topic][kind];
  }
  return POOLS[p.topic][kind];
}

function buildSteps(p: Problem, rng: () => number): IdeaStep[] {
  const tier = tierOf(p.level);
  const plan = [...STEP_PLAN[tier]];
  // 高档题有概率多一步「观察」：真实难题常常要先发现一个不显眼的性质
  // 但题目专属链的观察步往往只有一句，多插一步就会重复，这时不插
  if (tier === 'high' && rng() < 0.6 && textsFor(p, 'observe').length > 1) plan.splice(1, 0, 'observe');
  const complexity = complexityFloor(p.level);
  const fresh = new Set<string>();
  return plan.map((kind, i) => {
    const options = textsFor(p, kind);
    let text = pick(rng, options);
    // 同一条链里不重复同一句话
    let guard = 0;
    while (fresh.has(text) && guard++ < 6) text = pick(rng, options);
    fresh.add(text);
    // 句子自己写了复杂度（如 O(n log n)）就以它为准，别硬套难度档的默认值
    // 「先 O(n²) 再上 NTT」这种句子取最后一个才算最终复杂度
    const inline = [...text.matchAll(/O\([^)]{1,24}\)/g)];
    const inlineBest = inline.length ? inline[inline.length - 1][0] : undefined;
    const weight =
      kind === 'observe' ? 0.2 : kind === 'transform' ? 0.25 : kind === 'structure' ? 0.25 : kind === 'optimize' ? 0.2 : 0.1;
    return {
      kind,
      text,
      complexity:
        kind === 'structure' || kind === 'optimize'
          ? (inlineBest ?? complexity)
          : undefined,
      weight,
    };
  });
}

/** 给一道题生成它的参考解链（同一道题永远同一条链） */
export function chainFor(p: Problem): SolveChain {
  const rng = mulberry(hash(`${p.title}#${p.topic}#${p.level}#${p.id}`));
  const canonical = buildSteps(p, rng);
  const pool = POOLS[p.topic];
  // 另一条走法：把「结构」和「优化」换掉，保留观察/转化
  const alternatives: IdeaStep[][] = [];
  // 题目自带专属链时不再编「另一条走法」，否则会冒出与题意无关的技术
  if (p.level >= 4 && !TITLE_CHAINS[p.title]) {
    const alt = canonical.map((s) =>
      s.kind === 'structure'
        ? { ...s, text: pick(rng, pool.structure.filter((t) => t !== s.text)), weight: s.weight }
        : s.kind === 'optimize'
          ? { ...s, text: pick(rng, pool.optimize.filter((t) => t !== s.text)), weight: s.weight }
          : s,
    );
    // 交换论证：只有前面几步的前提下，另一条走法也成立
    if (alt.some((a, i) => a.text !== canonical[i].text)) alternatives.push(alt);
  }
  const traps: Trap[] = [];
  const trapCount = p.level >= 6 ? 2 : 1;
  const shuffled = [...pool.corner].sort(() => rng() - 0.5);
  for (let i = 0; i < trapCount; i++) {
    traps.push({
      text: pick(rng, [
        `以为这题是 ${pick(rng, ['DP', '贪心', '最短路', '二分'])}，写了一半才发现不是`,
        '复杂度算错了，以为 O(n²) 能过',
        shuffled[i] ?? '边界没判，小样例全过但大样例挂',
      ]),
      loss: Math.round(15 + rng() * 25),
    });
  }
  return { canonical, alternatives, traps };
}

// ---------- 得分 → 断点 ----------

/**
 * 把 0–100 的真实得分映射到「链走了几步」。
 * 对应真实题解里的分层：暴力分 / 模型对但优化不掉 / 全转化但漏边界 / 满分。
 */
export function breakIndexForScore(score: number, steps: IdeaStep[]): number {
  const n = steps.length;
  if (n === 0) return 0;
  if (score >= 95) return n;
  if (score >= 70) return Math.max(1, n - 1);
  if (score >= 45) return Math.max(1, Math.min(n - 1, Math.round(n * 0.65)));
  if (score >= 20) return Math.max(1, Math.min(n - 1, Math.round(n * 0.4)));
  if (score > 0) return 1;
  return 0;
}

/** 只是「没做出来」还是「想歪了」：低分且技能明显不匹配时，让他走进误区 */
function shouldGetMisled(p: Problem, score: number, skills: Skills): boolean {
  if (score >= 20) return false;
  const topicSkill = skills.topics[p.topic] ?? 0.5;
  const gap = p.difficulty / 115 - topicSkill;
  return gap > 0.25;
}

// ---------- 生成选手的链 ----------

const KIND_NAMES: Record<IdeaKind, string> = {
  observe: '观察',
  transform: '转化',
  structure: '结构',
  optimize: '优化',
  corner: '边界',
};

/** 这一步属于「想到」还是「只想了一半」，用于 UI 上色的副标题 */
export function kindName(k: IdeaKind): string {
  return KIND_NAMES[k];
}

export function topicNameOf(p: Problem): string {
  return TOPIC_NAMES[p.topic] ?? p.topic;
}

/** 一题链在比赛里的时间点：靠前的步骤发生在第一次提交之前 */
function minutesFor(steps: IdeaStep[], firstSubmitMinute: number, minutes: number): number[] {
  const out: number[] = [];
  const before = Math.max(5, Math.round(minutes * 0.45));
  const anchor = firstSubmitMinute > 0 ? Math.min(firstSubmitMinute, before) : before;
  for (let i = 0; i < steps.length; i++) {
    out.push(Math.max(1, Math.round((anchor * (i + 0.5)) / steps.length)));
  }
  return out;
}

/**
 * 生成某位选手对某道题的思维链轨迹。
 *
 * @param ps       引擎里这场比赛的该题状态（用它拿 attempts 和得分）
 * @param minutes  整场比赛时长（分钟），用来给链分配时间点
 */
export function traceFor(
  p: Problem,
  ps: ProblemState | undefined,
  skills: Skills,
  minutes: number,
  chain: SolveChain = chainFor(p),
): StudentTrace {
  const last = ps?.attempts[ps.attempts.length - 1];
  const score = last ? Math.round(last.score) : 0;
  const firstTime = ps?.attempts[0]?.time ?? 0;
  const firstMinute = firstTime > 0 ? firstTime / 60 : 0;
  const breakAt = breakIndexForScore(score, chain.canonical);
  const misled = shouldGetMisled(p, score, skills);
  const trapHit = misled ? chain.traps[0] : null;
  const times = minutesFor(chain.canonical, firstMinute, minutes);

  const steps: TracedStep[] = chain.canonical.map((step, i) => ({
    step,
    status: i < breakAt ? 'got' : 'missed',
    minute: times[i],
  }));
  if (misled) {
    // 走偏的人：第一步还是对的，但第二步被错误方向带走了
    steps[0].status = 'got';
    if (steps[1]) steps[1].status = 'misled';
  }

  let summary: string;
  if (score >= 95) summary = '整条链都走通了。';
  else if (score >= 70) summary = `断在「${kindName(chain.canonical[breakAt]?.kind ?? 'corner')}」这一步：前面的转化都对，最后一个环节没补上。`;
  else if (score >= 45) summary = `只走到「${kindName(chain.canonical[Math.max(0, breakAt - 1)].kind)}」：能写出能过小数据的东西，但复杂度或性质没压住。`;
  else if (score >= 20) summary = '拿到了暴力分：模型对了一半，后面的转化没推出来。';
  else if (score > 0) summary = '只摸到题面，没有形成可写的思路。';
  else summary = misled ? '一开始就想歪了。' : '这题没动。';

  return { steps, breakAt, trapHit, score, summary };
}

/** 一场比赛、一位选手、每道题的链。给聚焦面板用 */
export function tracesForStudent(
  student: Student,
  problems: Problem[],
  minutes: number,
): StudentTrace[] {
  return problems.map((p, i) => traceFor(p, student.problems[i], student.skills, minutes));
}

// ---------- 和子任务分数对齐的校验工具（脚本用） ----------

export function subtaskScoreHint(p: Problem): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const st of p.subtasks as Subtask[]) {
    acc += st.points;
    out.push(acc);
  }
  return out;
}
