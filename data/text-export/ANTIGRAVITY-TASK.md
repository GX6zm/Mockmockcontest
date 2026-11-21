# Antigravity 任务单：游戏文案改写

你现在在一个本地代码仓库里工作。**只做文案**，不要改代码逻辑、不要改数值、不要改目录结构。

## 0. 环境

- 工作目录：`C:\Users\lifen\Documents\deepseek-harness\default-workspace\mockmock-src`
- 任务包目录：`data/text-export/`
- Node 可执行：`D:\nodejs\node.exe`（PowerShell 里 `npm` 会被人执行策略拦住，用 `D:\nodejs\npm.cmd`）

## 1. 你要读什么

1. 先读 `data/text-export/writing-brief.json` 里的 `meta`（项目背景 / 文风 / 红线 / 字数上限）。
2. 再从三个分卷里挑一个做（**一次只做一卷，做完等确认**）：

| 批次 | 文件 | 条数 | 内容 |
|---|---|---|---|
| 1 | `brief-batch-1-events.json` | 119 | 每周事件卡（现有 17 张润色 + 扩写） |
| 2 | `brief-batch-2-chains.json` | 330 | 66 道题的思维链 |
| 3 | `brief-batch-3-pools-approaches.json` | 152 | 通用思维句库 + 多解法 |

每个 item 的字段：

- `key`：唯一标识，**不要改**
- `when`：这句话出现在界面的什么位置、什么时机
- `limit`：字数上限（中文按字符数算）
- `current`：当前文字
- `issue`：现在的问题
- `hint`：改写方向

## 2. 你要写什么

在原目录新建结果文件（不要覆盖 brief）：

- `data/text-export/results-batch-1.json`
- `data/text-export/results-batch-2.json`
- `data/text-export/results-batch-3.json`

格式是**扁平映射**，key 原样，值是改写后的中文：

```json
{
  "results": {
    "event.early_love.title": "早恋风波",
    "chains.模拟电梯.corner[0]": "空闲时别乱动方向键，多算一次移动就超时",
    "approaches.graph[0].name": "堆优化 Dijkstra"
  }
}
```

要求：

1. 每个 key 都要有值，不能漏、不能为空、不能返回 null。
2. 严格不超 `limit`。
3. 文风：选手心里的短句 / 教练视角；具体、克制、允许自嘲；不煽情；不用「你」「玩家」「让我们一起」；不用 emoji；不用英文整句（CSP-S / NOIP / APIO / NOI / LCT / NTT 这类缩写除外）。
4. 术语要准：挂分、卡常、对拍、打表、省一、国集、D 类、freopen、时空限制。
5. 事件卡的三个选项，代价方向必须彼此不同（体力 / 关系 / 成绩 / 声望）。
6. 事件卡如果要求扩写新条目：照现有字段补全，`id` 用英文小写下划线，效果数值不要编，写 `effectHint`（一句自然语言），数值由开发补。

## 3. 你必须自检

写完每卷后跑：

```
D:\nodejs\node.exe scripts\validate_results.cjs data/text-export/brief-batch-1-events.json data/text-export/results-batch-1.json
```

（把文件名换成对应批次。）

- 输出 `PASS` 才算完成。
- `FAIL` 就要按提示修：超字数、漏条、禁用词、含 emoji。
- 「提示」不是错误，但如果同一类问题出现很多（比如大量过短句），请自行补足信息量。

## 4. 红线

1. 不要改 `src/` 下的任何 `.ts` / `.tsx` 文件。
2. 不要改 `data/text-export/quotes.json`——那是选手本人的博客原话，禁止改写。
3. 不要编造真实选手的成绩、奖项、学校（人名都是真人）。
4. 不要新增依赖、不要动 `package.json`。
5. 不要一次性做完三卷后问我「还要吗」，做完一卷停下来等确认。

## 5. 参考

- 现有风格样本：`data/text-export/chains.json` 里 `模拟电梯` / `快速幂` 两题。
- 项目背景：`data/text-work-inventory.md`（文字工作总清单）、`data/thinking-chain-report.md`（思维链调研报告）。
