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
import { APPROACHES, TITLE_CHAINS } from './chains.ts';
import type { Approach } from './chains.ts';
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
  /** 前期（读懂/建模）还是后期（落地/调参）：难题两段的思考方式不一样 */
  phase?: 'early' | 'late';
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
  /** 这一卷「标准正解」的名字，如「Kruskal + 并查集」 */
  branchName?: string;
  /** 其它同样能过的正解名字 */
  altNames?: string[];
}

export type StepStatus = 'got' | 'missed' | 'misled' | 'pending';

export interface TracedStep {
  step: IdeaStep;
  status: StepStatus;
  /** 大概在第几分钟想到（相对比赛开始，单位分钟） */
  minute: number;
}

export interface LandingNode {
  text: string;
  tone: 'good' | 'warn' | 'bad';
  detail?: string;
}

export interface StudentTrace {
  steps: TracedStep[];
  /** 断在第几步（0 = 连第一步都没走通；steps.length = 全部走通） */
  breakAt: number;
  /** 触发过的误区 */
  trapHit: Trap | null;
  /** 这道题的标准正解叫什么 / 另外几种正解 */
  branchName?: string;
  /** 该名选手实际采用的正解路线名（多解法时可与默认正解不同） */
  usedBranchName?: string;
  altNames?: string[];
  /** 考场落地节点：连接思维链与真实挂分/对拍/修锅结果 */
  landing?: LandingNode;
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

export const POOLS: Record<Topic, StepPool> = {
  dp: {
    observe: [
      '先看数据范围：n ≤ 2000，O(n²) 的状态是装得下的',
      '手推了几组小数据，发现答案只和「最后一次操作」有关',
      '注意到每个位置只被前一个位置影响，像个链式结构',
      '暴力爆搜明显重合状态巨多，先看怎么记状态能不重算',
      '题目一直在算「前 i 个挑完以后」，八成就是按阶段推 DP',
      '先糊一版 O(n²) 转移保住 40 分底线，再回头看决策单调性',
    ],
    transform: [
      '把「操作序列」反过来考虑：从终态倒推，每次撤销一步',
      '把题面里的代价拆成「每段的固定代价 + 长度 × 单价」',
      '把状态从「哪些点选了」压成「选到第几个 + 当前段的长度」',
      '发现贡献只取决于相邻两项差值，把全局限制拆回局部转移',
      '把「最多/最少」转化成可行性背包，最后再扫一遍答案层',
      '直接正向推会有后效性，改成按时间倒序加进来就干净了',
    ],
    structure: [
      '设计 f[i][j]：前 i 个位置、当前段长为 j 的最小代价',
      '写出 O(n²) 的转移后发现它其实是一次前缀 min',
      '用单调队列把转移里那一层 j 的枚举摊掉',
      '把滚动数组挂上，第一维直接压掉省得 MLE',
      '先写个记忆化搜索对拍一下转移顺序，确认无环再改成递推',
      '把离散状态编号映射紧一点，免得转移时满地越界判断',
    ],
    optimize: [
      '转移是「前缀 max」，用线段树维护每行的最值，复杂度从 O(n³) 降到 O(n² log n)',
      '把「所有左端点」塞进一个堆里，每次取最小后只新增一个候选，复杂度 O(n log n)',
      '发现决策点单调，改成双指针，省掉一层枚举',
      '大样例跑了 1.3s 有点擦边，把内层枚举顺序调成连续访存挤一挤常数',
      '转移矩阵大小不到 5，直接上矩阵快速幂把线性的 O(n) 砍成 O(log n)',
      '拆出前缀 max 和后缀 max 各扫一遍，稳压到 O(n)',
    ],
    corner: [
      '答案可能为负，边界的初值要设成 -inf 而不是 0',
      'n = 1 时没有转移，要单独返回 0',
      '多测要清空数组，不然上一组的残留会串进来',
      '加和转移中间项可能超过 2e9，全开 long long 保险',
      '滚动数组清零只清上一行用过的范围，别整段 memset 超时',
      '空子集算不算合法状态，读两遍题面别大意',
    ],
  },
  graph: {
    observe: [
      '图是稀疏的（m ≤ 2n），说明正解大概率是 O((n+m) log n)',
      '所有边权都是正的，最短路思路可以先试',
      '题面里「不能重复经过同一条边」暗示要拆点',
      '边比点多不了几个，大概率是一棵基环树或者缩完点后的 DAG',
      '要先判断有没有负环/正环，先在草稿纸上画个 4 个点的圈试一下',
      '条件看着像带约束的最短路，试试往分层图上面搬',
    ],
    transform: [
      '把「每个点最多用一次」拆成入点/出点，变成二分图匹配',
      '把「路径」转成「从超级源到超级汇的一条流」，容量为 1 就自动不重复',
      '给每个点建两层，层间边权为 0，跨层的边表示「用掉一次机会」',
      '反向建边从终点倒着跑，把「多点到终点」压成「单源一次搜」',
      '把边权限制转成二分阈值，只留达标边判连通',
      '把「环上绕一圈」拆成断一条环边后的两条链各自求解',
    ],
    structure: [
      '跑一遍 Dijkstra 预处理出所有关键点对的距离',
      '用 Tarjan 缩点，把环压成一个点后图变成 DAG',
      '按拓扑序做一次 DP，同时维护「以这个点为结尾的最长路」',
      '先用手写链式前向星存边，比 vector 少掉一堆动态扩容常数',
      '用并查集把当前可用点缩一块，跳过中间早就访问过的死胡同',
      '写个 SPFA 先跑通小样例当暴力对照，再决定要不要换势能 Dijkstra',
    ],
    optimize: [
      '暴力连边的边数是 O(n²)，用线段树优化建图压到 O(n log n)',
      '用可并堆把每个点的「候选集合」合并，总复杂度 O((n+m) log n)',
      '把最短路换成 0-1 BFS，去掉堆的 log',
      '堆优化里加一句 if (d > dis[u]) continue，过期节点直接丢掉',
      '把点对之间的冗余虚边删一删，只留相邻关键站点',
      '多源求最近距离干脆一开始全塞队列同时跑，O(n+m) 直接下班',
    ],
    corner: [
      '不连通时要输出 -1，不能直接返回 dis[n]',
      '有自环和重边，读入时要判掉',
      '图可能不弱连通，多源要把所有入度为 0 的点一起塞进队列',
      '双向边数组一定要开 2*M，少开一倍直接 RE 到怀疑人生',
      '树退化成一条长链时递归 DFS 会爆栈，尽量写迭代或开栈',
      '距离初始化设 0x3f 不够大时得直接上 1e18',
    ],
  },
  greedy: {
    observe: [
      '先按右端点排序试试，交换论证通常能过',
      '手玩发现：越早结束的区间越应该先选',
      '答案只和「当前还能用多少资源」有关，和具体选了谁无关',
      '怎么想 DP 状态都压不掉后效性，反手先试一个局部贪心看看对不对',
      '直觉告诉我可以先选收益比最大的，但得找反例验一下要不要反悔',
      '如果所有操作顺序可以任意调，八成有一条隐藏的全序不等式',
    ],
    transform: [
      '把「选最多区间」转成「每个时刻最多占一个资源」的匹配',
      '把代价函数写成「每多等一分钟，多花 c 元」，变成贪心的增量',
      '把原问题取反：最大化留下的，等于最小化删掉的',
      '假定已经排好序，交换相邻两项写出不等式推关键字',
      '遇到冲突时先别急着拒掉，把最差的旧选踢出去换更优的新选',
      '把带限期的任务从最后一天倒着往前填，保证早到的不占用晚到的位置',
    ],
    structure: [
      '用堆维护当前已选区间的结束时间，冲突时弹掉最晚的',
      '把所有候选按收益排序，能拿就拿',
      '用并查集维护「下一个可用的位置」，跳过已经占掉的',
      '拿两个对顶堆维护当前前 k 小之和，比平衡树好写十倍',
      '先写一发 O(n²) 暴力跟贪心对拍 500 组随机小数据，过拍就敢交',
      '双指针一边推进时间轴，一边从优先队列里取最划算的活',
    ],
    optimize: [
      '每次弹堆是 O(log n)，总复杂度 O(n log n)',
      '排序是瓶颈，改成计数排序后 O(n + V)',
      '把逐次判断改成差分前缀，省掉一层循环',
      '把堆里的懒删除统一延迟到栈顶取出时才清理',
      '只保存全局最优的少数候选，把堆大小死死摁住',
      '扫完一遍直接出结果，常数小到甚至不需要快读',
    ],
    corner: [
      '区间端点重合时算不算相交，要按题面来',
      '答案可能爆 int，用 long long',
      '输入可能不保证有序，别忘了先 sort',
      '堆为空时调用 top() 会当场 RE，弹堆前一定判 !q.empty()',
      '排序比较函数严格弱序要满足，不能用 <= 号否则 sort 直接越界崩掉',
      '出现负数权值时停手条件别写死在 > 0 上',
    ],
  },
  ds: {
    observe: [
      '操作是「区间加 + 区间求和」，树状数组套一下就行',
      '注意到只有单点修改，没有必要上线段树',
      'n, q ≤ 2e5，必须带 log',
      '如果允许离线，把所有询问读完按右端点排序事情会好办很多',
      '看起来是一堆区间修改，但每次只改颜色段数，其实均摊很薄',
      '空间给得只有 128MB，主席树节点数可得抠着算',
    ],
    transform: [
      '把「区间第 k 小」转成「在值域上二分 + 统计 ≤ mid 的个数」',
      '把树上的路径查询拆成「根到 x + 根到 y − 2 × 根到 lca」',
      '把「颜色段」的合并抽象成「相同颜色的连续段」',
      '把带时间维度的修改离线拆成 CDQ 三维偏序扫描',
      '按树链剖分把树上路径摊平进 DFS 序区间',
      '把动态开点里用不到的空子树统一指向 0 号哨兵节点',
    ],
    structure: [
      '树状数组维护差分数组，区间加变成两次单点加',
      '线段树每个节点存「左端颜色、右端颜色、段数」',
      '主席树按版本建，每个版本只加一条链',
      '用 ST 表预处理静态区间 RMQ，询问端直接 O(1) 不带脑子',
      '套个分块把散块暴力算、整块打标记，好调不容易写挂',
      '写一个规范的 pushup / pushdown 结构体把节点合并逻辑封死',
    ],
    optimize: [
      '把线段树的递归改成迭代，常数能小一半',
      '查询只有 O(q) 次，预处理 O(n log n) 反而更划算',
      '用 ODT 均摊，随机数据下总复杂度 O((n+q) log n)',
      '把离散化换成手写排序去重 + lower_bound，比 map 快几倍',
      '线段树叶子节点干脆不 pushdown，省掉一半下传分支',
      '快读加上 inline 以后 2e5 次操作稳稳跑进 300ms 内',
    ],
    corner: [
      '下标从 1 开始，树状数组的 lowbit 别越界',
      '区间加之后查询要 pushdown，或者干脆用标记永久化',
      'long long 的懒标记在取模时要先模再加',
      '线段树数组一定要开 4 * N，漏乘 4 随机 RE',
      '区间右端点可能大于左端点（反着给询问），先 swap(l, r) 再查',
      '空区间或零号节点不能被懒标记误改',
    ],
  },
  string: {
    observe: [
      '先求一遍 next 数组，很多性质直接就有了',
      '字符串长度 1e6，只能 O(n) 或 O(n log n)',
      '注意到答案和「前缀 = 后缀」有关，往 border 上想',
      '两个串比来比去太慢了，先糊个双哈希 O(1) 判相等试试',
      '一坨串问公共子串，不是广义 SAM 就是把串拼中间塞分隔符跑 SA',
      '题面问循环同构，八成把原串复制一份拼成 s + s 就看出来了',
    ],
    transform: [
      '把「循环同构」转成「s + s 上跑匹配」',
      '把「本质不同子串数」转成「每个后缀贡献的新子串数」',
      '把匹配失败的回跳全部记下来，就是一棵 fail 树',
      '把回文中心统一扩成 2n + 1 个插井号位置，奇偶不用分两份写',
      '利用 border 等差数列性质，把长串匹配压成不超过 log n 段',
      '按字典序倒序建后缀树，最长公共前缀转化成 LCA 深度',
    ],
    structure: [
      '建 SAM，每个状态的 endpos 大小就是出现次数',
      '后缀数组 + height 数组，用单调栈统计每个 height 的贡献',
      '把模式串拼起来建 AC 自动机，文本串在上面跑',
      'KMP 里多开一个跳表，在失配树上快速往上找到 ≤ len/2 的最大 border',
      'Z 函数直接扫出每个后缀和全串前缀的最长公共长度',
      '用双模数自然溢出加 1e9+7 算两路滚动哈希',
    ],
    optimize: [
      'fail 树上做一次子树和，把「每个串出现几次」一次算完',
      '用基数排序替代快排，后缀数组建到 O(n log n)',
      '把哈希换成双哈希，冲突概率降到可忽略',
      'SAM 数组别开 unordered_map 转移，小写字母直接开 26 格定长数组',
      '预处理幂次数组 p^k，区间截串直接一次乘法出哈希值',
      '只保留有效终止节点记子树和，省去整树拷贝',
    ],
    corner: [
      '空串、单字符要特判，不然 SAM 会少一个状态',
      '哈希 base 要大于字符集，且不能是常见数',
      '多测时 SAM 的节点数要重置，否则越界',
      '读入字符串小心行尾换行符和 Windows 回车 \\r',
      'SA 倍增超出长度 n 那一截记得补成极小值 0',
      '全串同一字符是最容易卡死 AC 自动机和哈希的数据，自己捏一组测测',
    ],
  },
  math: {
    observe: [
      '公式里出现了阶乘和逆元，先预处理到 1e6',
      'n ≤ 1e18，只能是 log 级的做法，往矩阵快速幂上想',
      '手推前几项，发现是个线性递推',
      '暴力打表把 n = 1..10 的答案全印出来找找规律，说不定是个组合数',
      '数据上限只到 1e7 但给 1s，说明连带 log 的快速幂都得多注意，尽量线性筛搞定',
      '看见带取模的除法先看模数是不是质数，不是就得上 exgcd',
    ],
    transform: [
      '把「求和」转成「枚举 gcd 再莫比乌斯反演」',
      '把「恰好 k 个」用二项式反演转成「至少 k 个」',
      '把递推写成矩阵，用快速幂一次跳 n 步',
      '把期望拆成每个独立指示变量的期望之和（线性性真香）',
      '按唯一分解定理拆成各个质数次幂各自独立算完再 CRT 拼回来',
      '把连乘换底数转成原根下的指数加法',
    ],
    structure: [
      '线性筛预处理出 μ 和 phi，再整除分块',
      '构造转移矩阵，大小是 k × k',
      '用扩展欧拉定理把指数降下来',
      'O(n) 预处理阶乘表和阶乘逆元表，后续组合数 O(1) 现查',
      '高斯消元先按主元绝对值排序消成上三角，避免被 0 主元炸掉',
      '写个杜教筛把前缀和拆成递归小块并用 unordered_map 记下来',
    ],
    optimize: [
      '整除分块把 O(n) 的求和降到 O(√n)',
      '矩阵乘法的常数太大，改成 k 次多项式乘法',
      '快速幂里每次只乘需要的位，省掉一半',
      '筛法外层用布尔数组压 bitset，缓存命中率直线上升',
      '反演式子把两层枚举合并后，只用枚举 d 就能顺便累完两个整除块',
      '乘法取模全部强转 unsigned long long 再模，别中途溢出',
    ],
    corner: [
      '模数不一定是质数，不能用费马小定理求逆元',
      '指数要对 φ(p) 取模，且要处理 b < φ(p) 的情况',
      '负数取模要加模数再模',
      '组合数 C(n, m) 当 m > n 或 m < 0 时要返回 0，不能直接访问负下标',
      '快速幂底数是 0、指数是 0 的边界先想清楚',
      '高精或 128 位整数输入输出千万用对，别用 int 读 1e18',
    ],
  },
  impl: {
    observe: [
      '题面很长，但拆开就是「模拟 + 几个边界」',
      '数据范围很小，O(n²) 暴力能过，先保证正确',
      '注意到操作只有几种，可以用数组直接存状态',
      '大模拟别急着动手敲，先把所有规则列张清单一条条对号入座',
      '读了一遍发现只要照着时间先后扫事件就行，一点高级算法都没有',
      '看似步数很多但状态有限，肯定会在不多步之后进入循环节',
    ],
    transform: [
      '把「时间轴上的事件」按时间排序，依次处理',
      '把二维坐标压成一维下标，省掉一层循环',
      '把「每个操作独立」改成「维护整体的偏移量」',
      '把同一层的条件拆写成独立 helper 函数，主流程只管按顺序调',
      '用一个状态时间戳数组记录上次改动时间，跳过中间什么都没发生的空档',
      '先拿最笨的写法把前 30 分拿牢，再去优化那一块重复循环',
    ],
    structure: [
      '开一个桶记录每个值出现了几次',
      '用一个 vector 存每个位置的历史，查询时二分',
      '按题意写一个 check 函数，主过程逐条模拟',
      '把实体的几个属性打包成 struct，排序比下标映射清楚得多',
      '用一个优先队列维护下一次最早触发状态变更的事件时间点',
      '多写两个局部断言检查关键不变量，对拍时自己抓 bug',
    ],
    optimize: [
      '每个事件只处理一次，总复杂度 O(n + q)',
      '把重复计算的部分提到循环外',
      '用前缀和把区间查询降到 O(1)',
      '把整段拷贝改成记录差异索引，还原时间一下降回线性',
      '中间状态没必要每轮清整个大数组，用版本戳 tag 代替清空',
      '关掉 cin 同步解绑 stdio，光靠 IO 提速就能救回几百毫秒',
    ],
    corner: [
      '多测要清空，不然上一组的数据会污染',
      '输出格式（空格/换行）要和样例完全一致',
      '边界：n = 0、所有元素相同、只有一个操作',
      '大小写字母和字符 ASCII 差值别手抖写错一位',
      '闰年 2 月 29 日或者月末进位一定要单造一组测',
      '浮点四舍五入输出保留两位小数时，-0.00 的负号要特判消掉',
    ],
  },
  geometry: {
    observe: [
      '所有点都在凸包上，直接上旋转卡壳',
      'n ≤ 2000，O(n²) 枚举点对是可行的',
      '注意到答案只和「最远点对」有关',
      '坐标全是整数，尽量用叉积和点积躲开一切开根号和三角函数',
      '范围看着要算很多平面区域交，先想想能不能离散化成网格或极角区间',
      '先画一张坐标纸把三点共线、垂线垂直这几种恶心图全标出来',
    ],
    transform: [
      '把「面积最大三角形」转成「固定一条边，找最远点」',
      '把「圆覆盖」转成「角度区间覆盖」，扫一遍即可',
      '把叉积的符号当成半平面，用极角排序',
      '把曼哈顿距离旋转 45 度拆成切比雪夫 max(|x|, |y|)，两维各自就独立了',
      '把凸包拆成上凸壳和下凸壳两条单调链，分别二分极其好写',
      '把两点连线转成向量差，利用点积符号判夹角钝锐',
    ],
    structure: [
      '先求凸包，再在凸包上双指针',
      '用扫描线 + 平衡树维护当前的交点集合',
      '三分找单峰函数的最值',
      '把直线和线段统一存成 (Point o, Vector dir)，用极角排好半平面顺序',
      '对二维点做分治（按 x 中位线切半，中间条带内最多检查 7 个点）',
      '手写一套稳定的 Point 结构体加叉积重载，代码写起来干净不少',
    ],
    optimize: [
      '旋转卡壳把 O(n²) 降到 O(n)',
      '极角排序后双指针，总复杂度 O(n log n)',
      '把浮点比较换成整数叉积，避免精度问题',
      '用交叉乘代替斜率除法，彻底远离除以 0 和 double 丢精度',
      '凸包合并前先把极坐标半径最小以外的冗余共线内点丢掉',
      '外层距离平方直接存 long long 比较，直到最终输出那一行才 sqrt',
    ],
    corner: [
      '共线点要不要保留，按题意决定',
      '浮点误差：比较时用 eps，别直接用 ==',
      'n < 3 时无法构成三角形，直接输出 0',
      '叉积做三次连续坐标相乘会爆 32 位 int，一定要转 long long',
      '极角排序用 atan2 可能跨 -pi 和 pi 断线，建议按象限加叉积排序',
      '重合点在求极角时会得出 0 向量，进栈前务必要过滤干净',
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
// 题目专属链统一放在 chains.ts，这里只负责取用。

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

/** 题目名是「玩法/包装场景」而非具体算法时，用知识点词库更自然（模拟电梯/花坛铺砖不需要谈裸模板） */
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
  // 新增 58 道场景包装题全部归入描述性题名，避免出现「裸的 xxx」穿帮
  '剧场排座', '花坛铺砖', '书架整理', '气象站网', '云端同步', '遗迹密道', '棋盘覆盖',
  '圆桌分糖', '营地补给', '货仓选址', '港口泊位', '任务抢占', '廊桥调度', '燃料补给',
  '数轴跳棋', '石碑拓片', '残缺棋盘', '列车编组', '魔法药剂', '序列折叠', '区间博弈', '树上寻宝', '卡牌博弈',
  '信号中继', '雪山索道', '城际光缆', '地铁换乘', '迷宫传送', '电网调度', '城市供水', '关键节点', '双向奔赴',
  '烽火传递', '古籍修复', '矩阵染色', '树链染色', '动态开点星图', '离线查询驿站', '区间历史最值',
  '齿轮啮合', '密码破译', '潮汐发电', '排列重塑', '航线规划', '星际跃迁',
  '括号序列修复', '词典压缩', '前缀密码', '回文卷轴', '基因片段', '多串情报检索',
  '围栏修建', '无人机巡检', '雷达盲区', '夜航灯塔', '矿道爆破', '激光反射', '星图重构',
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

function buildSteps(p: Problem, rng: () => number, branch?: Approach): IdeaStep[] {
  const tier = tierOf(p.level);
  const plan = [...STEP_PLAN[tier]];
  // 高档题有概率多一步「观察」：真实难题常常要先发现一个不显眼的性质
  // 但题目专属链的观察步往往只有一句，多插一步就会重复，这时不插
  if (tier === 'high' && rng() < 0.6 && textsFor(p, 'observe').length > 1) plan.splice(1, 0, 'observe');
  // 难题还常常要「先想一个结构，发现不够，再换一个」：多插一步结构
  // 难题还常常要「先想一个结构，发现不够，再换一个」：多插一步结构
  // 换正解分支时结构句已经被换成了分支的写法，再插就会两句一模一样
  if (tier === 'high' && !branch && rng() < 0.35 && textsFor(p, 'structure').length > 1) plan.splice(plan.lastIndexOf('structure'), 0, 'structure');
  const fresh = new Set<string>();
  return plan.map((kind, i) => {
    const options = textsFor(p, kind);
    let text = pick(rng, options);
    // 同一条链里不重复同一句话
    let guard = 0;
    while (fresh.has(text) && guard++ < 6) text = pick(rng, options);
    fresh.add(text);
    // 换一种正解：只换「结构/优化」两步，观察和转化是共同的入口
    if (branch && kind === 'structure') text = branch.structure;
    if (branch && kind === 'optimize') text = branch.optimize;
    // 句子自己写了复杂度（如 O(n log n)）就以它为准，别硬套难度档的默认值
    // 「先 O(n²) 再上 NTT」这种句子取最后一个才算最终复杂度
    const inline = [...text.matchAll(/O\([^)]{1,24}\)/g)];
    const inlineBest = inline.length ? inline[inline.length - 1][0] : undefined;
    const weight =
      kind === 'observe' ? 0.2 : kind === 'transform' ? 0.25 : kind === 'structure' ? 0.25 : kind === 'optimize' ? 0.2 : 0.1;
    return {
      kind,
      text,
      // 只在句子自己写了复杂度时才显示：硬套难度档的默认值会给出
      // 「KMP 的优化是 O(n√n)」这种明显不对的标注
      complexity: kind === 'structure' || kind === 'optimize' ? inlineBest : undefined,
      weight,
      phase: kind === 'observe' || kind === 'transform' ? 'early' : 'late',
    };
  });
}

/** 给一道题生成它的参考解链（同一道题永远同一条链） */
export function chainFor(p: Problem): SolveChain {
  const rng = mulberry(hash(`${p.title}#${p.topic}#${p.level}#${p.id}`));
  const pool = POOLS[p.topic];
  // 按知识点生成的题（不是题目专属链）在 4 档以上会有多种正解；
  // 挑哪一条随题目定死，保证同一场比赛重放时每个人的选择一致
  const canBranch = p.level >= 4 && !TITLE_CHAINS[p.title];
  const branches = canBranch ? APPROACHES[p.topic] : [];
  const pickIdx = branches.length ? Math.floor(rng() * branches.length) : -1;
  const branch = pickIdx >= 0 ? branches[pickIdx] : undefined;
  const canonical = buildSteps(p, rng, branch);
  // 另一条走法：同一套观察/转化，换成另一种结构 + 优化
  const alternatives: IdeaStep[][] = [];
  const altNames: string[] = [];
  if (branches.length > 1) {
    branches.forEach((b, i) => {
      if (i === pickIdx) return;
      altNames.push(b.name);
      alternatives.push(
        canonical.map((s) =>
          s.kind === 'structure'
            ? { ...s, text: b.structure }
            : s.kind === 'optimize'
              ? { ...s, text: b.optimize }
              : s,
        ),
      );
    });
  }
  const traps: Trap[] = [];
  const trapCount = p.level >= 6 ? 2 : 1;
  // 题目专属链的「坑」是这道题真实会踩的坑，优先用它；没有才退回知识点词库
  const ownCorner = TITLE_CHAINS[p.title]?.corner ?? [];
  const cornerPool = ownCorner.length ? ownCorner : pool.corner;
  const picked = [...cornerPool].sort(() => rng() - 0.5);
  for (let i = 0; i < trapCount; i++) {
    // 第一种坑用这道题自己的边界，后面的才用通用失误
    const options = ownCorner.length
      ? [picked[i] ?? picked[0], '复杂度算错了，以为 O(n²) 能过', '数组开小了，最后一个点直接 RE']
      : [picked[i] ?? '边界没判，小样例全过但大样例挂', '以为这题是 DP，写了一半才发现不是', '复杂度算错了，以为 O(n²) 能过'];
    traps.push({ text: pick(rng, options), loss: Math.round(15 + rng() * 25) });
  }
  return { canonical, alternatives, traps, branchName: branch?.name, altNames };
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
 * @param ps          引擎里这场比赛的该题状态（用它拿 attempts 和得分）
 * @param minutes     整场比赛时长（分钟），用来给链分配时间点
 * @param chain       可选参考链；未传时现算
 * @param studentName 选手名，用于在多解法/变体池里做确定性差异化，避免全员同一字不差
 * @param ioi         是否 IOI 赛制（取历史最高分，而非最后一次提交）
 */
export function traceFor(
  p: Problem,
  ps: ProblemState | undefined,
  skills: Skills,
  minutes: number,
  chain: SolveChain = chainFor(p),
  studentName = '',
  ioi = false,
): StudentTrace {
  const attempts = ps?.attempts ?? [];
  const eff = !attempts.length
    ? undefined
    : ioi
      ? attempts.reduce((best, cur) => (cur.score >= best.score ? cur : best), attempts[0])
      : attempts[attempts.length - 1];

  // 核心修复：用「干净分 cleanScore」反推赛时想通了哪几步，再把挂分/修锅作为「考场落地节点」接在后面
  const cleanScore = eff ? Math.round(eff.clean ?? eff.score) : 0;
  const finalScore = eff ? Math.round(eff.score) : 0;

  // 若同一题存在多解法分支且提供了选手名，按选手哈希决定他实际走的那一路
  const branchTotal = 1 + chain.alternatives.length;
  const pickedBranchIdx = studentName && branchTotal > 1
    ? hash(`${p.title}#${p.id}#${studentName}#branch`) % branchTotal
    : 0;
  const chosenBase = pickedBranchIdx === 0
    ? chain.canonical
    : (chain.alternatives[pickedBranchIdx - 1] ?? chain.canonical);
  const usedBranchName = pickedBranchIdx === 0
    ? chain.branchName
    : (chain.altNames?.[pickedBranchIdx - 1] ?? chain.branchName);

  // 对非固定分支覆盖步骤，按选手名哈希从词库/专属多句变体里挑一句人话，避免全员撞词
  const stRng = studentName ? mulberry(hash(`${p.title}#${p.id}#${studentName}#phrasing`)) : null;
  const usedTexts = new Set<string>();
  const variedSteps = chosenBase.map((st) => {
    if (!stRng || (pickedBranchIdx > 0 && (st.kind === 'structure' || st.kind === 'optimize'))) {
      return st;
    }
    const opts = textsFor(p, st.kind);
    if (opts.length <= 1) return st;
    let txt = opts[Math.floor(stRng() * opts.length)];
    let guard = 0;
    while (usedTexts.has(txt) && guard++ < 5) txt = opts[Math.floor(stRng() * opts.length)];
    usedTexts.add(txt);
    const inline = [...txt.matchAll(/O\([^)]{1,24}\)/g)];
    const inlineBest = inline.length ? inline[inline.length - 1][0] : st.complexity;
    return {
      ...st,
      text: txt,
      complexity: st.kind === 'structure' || st.kind === 'optimize' ? inlineBest : st.complexity,
    };
  });

  const firstTime = attempts[0]?.time ?? 0;
  const firstMinute = firstTime > 0 ? firstTime / 60 : 0;
  const breakAt = breakIndexForScore(cleanScore, variedSteps);
  const misled = shouldGetMisled(p, cleanScore, skills);
  const trapHit = misled ? (chain.traps[0] ?? null) : null;
  const times = minutesFor(variedSteps, firstMinute, minutes);

  const steps: TracedStep[] = variedSteps.map((step, i) => ({
    step,
    status: i < breakAt ? 'got' : 'missed',
    minute: times[i],
  }));
  if (misled && steps.length > 0) {
    // 走偏的人：第一步还是对的，但第二步被错误方向带走了
    steps[0].status = 'got';
    if (steps[1]) steps[1].status = 'misled';
  }

  let landing: LandingNode | undefined;
  if (eff) {
    if (eff.damaged || cleanScore > finalScore) {
      landing = {
        text: `${eff.reason}（原本已写出 ${cleanScore} 分思路，实测跌至 ${finalScore} 分）`,
        tone: 'bad',
        detail: `${cleanScore} → ${finalScore}`,
      };
    } else if (finalScore > eff.est) {
      landing = {
        text: `${eff.reason}（赛中保守估计 ${eff.est}，实测拿回 ${finalScore} 分）`,
        tone: 'good',
        detail: `反挂 +${finalScore - eff.est}`,
      };
    } else if ((ps?.fixRounds ?? 0) > 0) {
      landing = {
        text: `IOI 实时评测后抓紧修改 ${ps!.fixRounds} 轮，最终稳拿 ${finalScore} 分`,
        tone: 'good',
        detail: `${finalScore} 分`,
      };
    } else if ((ps?.debugRounds ?? 0) > 0) {
      landing = {
        text: `赛中对拍拍出 ${ps!.debugRounds} 处 Bug 并返工修好，保住 ${finalScore} 分`,
        tone: 'good',
        detail: `对拍救回 ${finalScore}`,
      };
    } else if (eff.mode === 'brute' && attempts.some((a) => a.mode === 'full')) {
      landing = {
        text: `交完正解心里没底，收卷前切回暴力稳住基本盘，实拿 ${finalScore} 分`,
        tone: 'warn',
        detail: `保底 ${finalScore}`,
      };
    } else if (finalScore >= 100) {
      landing = {
        text: '代码一次写对稳稳 AC，赛场落地零失误',
        tone: 'good',
        detail: 'AC 100',
      };
    } else if (finalScore > 0) {
      landing = {
        text: `平稳提交已写完的子任务代码，实得 ${finalScore} 分`,
        tone: 'good',
        detail: `${finalScore} 分`,
      };
    } else {
      landing = {
        text: eff.reason || '没能通过任何测试点',
        tone: 'bad',
        detail: '0 分',
      };
    }
  }

  let summary: string;
  if (eff && cleanScore >= 70 && finalScore < cleanScore) {
    summary = `思路本身已做到 ${cleanScore} 分档位，但考场代码落地翻车：${eff.reason}（${cleanScore} → ${finalScore}）。`;
  } else if (eff && finalScore > eff.est) {
    summary = `思路走到 ${cleanScore} 分档位，赛中估偏保守实测反挂冲到 ${finalScore} 分。`;
  } else if (cleanScore >= 95) {
    summary = '整条思维链完全走通，代码也顺利过关。';
  } else if (cleanScore >= 70) {
    summary = `断在「${kindName(variedSteps[breakAt]?.kind ?? 'corner')}」这一步：前面核心转化都对了，最后细节没补全。`;
  } else if (cleanScore >= 45) {
    summary = `只走到「${kindName(variedSteps[Math.max(0, breakAt - 1)].kind)}」：过掉小部分数据，但性质或复杂度没压下去。`;
  } else if (cleanScore >= 20) {
    summary = '拿到了暴力或基础性质分：方向摸到一半，后续转化没推透。';
  } else if (cleanScore > 0) {
    summary = '只摸到题面边缘，没来得及拼出完整正解。';
  } else {
    summary = misled ? '一开始就被表面条件带偏了方向。' : '这题没动，把时间留给了别的题。';
  }

  return {
    steps,
    breakAt,
    trapHit,
    landing,
    score: finalScore,
    summary,
    branchName: chain.branchName,
    usedBranchName,
    altNames: chain.altNames,
  };
}

/** 一场比赛、一位选手、每道题的链。给聚焦面板用 */
export function tracesForStudent(
  student: Student,
  problems: Problem[],
  minutes: number,
  ioi = false,
): StudentTrace[] {
  return problems.map((p, i) => traceFor(p, student.problems[i], student.skills, minutes, undefined, student.name, ioi));
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
