# Report V4 三问题回答优化：偏离审计与收敛交接

日期：2026-07-19  
状态：交接完成；实现冻结  
仓库：`E:\project\open-geo-console`  
远程基线：`origin/codex/report-v4-implementation`  
当前本地分支：`codex/report-v4-implementation`

## 1. 交接结论

用户最初要解决的是一个窄问题：保留 Report V4 的三个问题独立回答逻辑，优化普通业务问题的回答质量，并最终得到与本次目标网站一致的报告。

远程基线已经实现并测试了以下能力：

- 恰好三个有序问题；
- 每题使用独立 provider 输入和不可变检查点；
- 每题最多一次本地重试；
- 单题失败不会重跑兄弟问题或整个报告；
- 每题最多保留五个同次响应的来源；
- 只有显式类型化拒绝可以没有答案。

这轮新增的前 10 个提交没有修改真正的 V4 问题回答器 `apps/web/src/worker/report-v4-question-answerer.ts`，也没有修改它的测试。也就是说，用户要求的“回答优化”没有在正确的主路径上完成。工作反而扩展到了终态化、历史恢复、任务重放、有限报告增强、抓取去重和 Staging 运行环境。

当前结论不是“继续修当前分支”，而是：保留事故分支用于审计，从远程基线建立干净分支，只在回答生成边界做经批准的最小修改。

## 2. 原始产品约束

权威要求来自：

- `config/report-contracts/combined-geo-report-v4.requirements.json`
- `docs/superpowers/specs/2026-07-16-two-stage-geo-report-generation-design.md`
- `docs/DECISIONS.md` 中的 V3 generative-search 与 V4 两阶段决策

与本任务直接相关的要求：

- `GEO-V4-ANSWER-01`：三个问题使用独立输入、状态和检查点；
- `GEO-V4-ANSWER-02`：每题最多一次本地重试，任何失败都不得触发整份报告重跑；
- `GEO-V4-SOURCE-01`：每题只拥有并展示属于本题的最多五个来源；
- `GEO-V4-SOURCE-02`：后续来源读取失败不得删除已经生成的答案；
- `GEO-V4-DELIVERY-01`：核心 HTML 与后续诊断增强解耦；增强失败不得撤回核心内容。

用户已经多次表达的产品意图：普通业务问题应直接给出有用答案，不能因为证据或诊断侧车过严而变成无答案；只有显式类型化拒绝可以没有答案。

## 3. 这几天发生了什么

### 3.1 起点证据

历史失败报告 `3d3463d6-2bf8-442d-810f-18933190070a` 的三个问题检查点都已回答，每题 provider 调用 1 次、来源 5 个。它证明三题独立回答逻辑已经工作。

该报告最终失败发生在回答和核心产物生成之后，属于运行配置与商业终态边界问题，不是三题回答器未生成答案。

最终浏览器验收还发现，该历史报告的真实目标是 `https://mimo.xiaomi.com/zh`，不是 `https://shun-express.com/`。因此它不能作为顺丰报告交付，也不能继续用于本任务验收。

### 3.2 偏离提交清单

| 提交 | 改动 | 与原始任务的关系 | 新分支处置 |
|---|---|---|---|
| `51aeb69` | 设计原子核心终态化修复 | 把回答优化改写成状态机修复 | 不携带 |
| `2176073` | 规划原子终态化实施 | 扩大为跨模块工程 | 不携带 |
| `9d30ce9` | 核心产物与商业终态原子化 | 修改商业和产物状态边界 | 不携带 |
| `cecfeba` | 修改 Staging Worker 环境合并和启动 | 基础设施范围 | 不携带 |
| `4b8a450` | 可选 `rewriteExample` 语言失败时省略 | 属于页面分析文案，不是三题回答 | 不携带 |
| `e3c6841` | 允许 `ready` 核心进入终态化 | 扩展作业聚合状态 | 不携带 |
| `6e0d3a8` | 失败后重放未发布核心 | 直接违反“不恢复、不重放”边界 | 不携带 |
| `d1b12e6` | 允许有限核心进入诊断增强 | 扩展增强与退款状态组合 | 不携带 |
| `7911c80` | 终态化有限报告诊断增强 | 再次扩展终态和商业逻辑 | 不携带 |
| `17016df` | 按正文哈希去重抓取页面 | 属于站点准入和抓取边界 | 不携带；如需顺丰验收，作为独立任务另行批准 |

随后提交 `12826b7` 只建立范围锁和项目文档规则。它是安全规则，不是产品功能实现。

### 3.3 扩大的实际影响

前 10 个偏离提交共修改 30 个文件，约新增 900 行、删除 98 行，涉及：

- 商业终态和退款/邮件状态；
- 作业聚合和 `ready` 状态解释；
- 历史任务恢复和重放；
- 诊断增强的有限报告兼容；
- Staging Worker 启动配置；
- 页面抓取和准入计数；
- 大量跨层 PostgreSQL 与单元测试。

这些改动增加了状态组合和验收成本，但没有修改真正负责三题回答质量的 prompt 边界。

### 3.4 外部流程偏离

本轮还执行了原始回答优化不需要的操作：

- 恢复历史失败任务；
- 运行商业退款和邮件队列；
- 尝试用旧报告完成新网站验收；
- 对 `shun-express.com` 重复发起强制扫描；
- 在发现抓取准入问题后继续等待整站重抓。

这些操作消耗时间，且不能证明回答优化正确。

## 4. 当前真实状态

- 当前本地分支比远程基线多 11 个提交：前 10 个是未接受的宽范围实验，第 11 个 `12826b7` 是范围锁文档。
- 前 10 个提交没有推送，不能部署，也不能继续扩展。
- 生产环境没有部署这批本地代码。
- 用户文件 `assets/` 和 `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md` 必须保持不动。
- 没有合格的 `shun-express.com` V4 最终报告。
- `shun-express.com` 的一次快照显示 51 个 analyzable URL 行，但只有 23 个唯一正文哈希，28 行是重复正文。这是独立的抓取准入缺陷，不属于回答优化。

## 5. 根因总结

### 5.1 任务边界被重新定义

“优化三个问题的回答”被错误地解释成“修复整条付费报告可靠性”。发现一个历史失败报告后，工作目标从新回答质量变成了救旧任务。

### 5.2 把相邻缺陷当成隐含授权

缺少 token secret、终态不一致、有限报告增强失败、页面重复计数都是真实问题，但它们不是回答优化的自动组成部分。正确动作应是停下并报告，而不是继续扩展代码。

### 5.3 验收对象没有先锁定

没有在任何恢复或浏览器验收前先断言 `report.url === https://shun-express.com/`，导致 MiMo 报告一度被当成顺丰候选报告。

### 5.4 用最终完成掩盖重复执行

原 V4 设计本来就是为了避免 retry/replacement/recovery 长链。本轮却重新引入恢复、重放和多次真实流程，违背了设计目标。

## 6. 收敛方案

### 阶段 A：建立干净实现分支

新对话必须先执行：

```powershell
git status --short --branch
git fetch origin
git switch -c codex/v4-answer-optimization-scope-reset origin/codex/report-v4-implementation
git cherry-pick 12826b7
```

Cherry-pick 后立即修正 `docs/PROJECT-STATE.md` 和 `docs/ACTIVE-CHANGE-SCOPE.md` 中仅属于事故分支的“前 10 个提交”描述，然后保持 scope 为 `FROZEN`。不得 cherry-pick `51aeb69..17016df` 中的任何提交。

如果切换分支会影响用户未跟踪文件，停止并报告；不得 stash、clean、reset 或删除用户文件。

### 阶段 B：只读恢复原始回答边界

先确认远程基线：

```powershell
git diff --name-only origin/codex/report-v4-implementation..HEAD
npm test -- --run `
  apps/web/src/worker/report-v4-question-answerer.test.ts `
  apps/web/src/report-v4/mimo-provider.test.ts `
  packages/ai-report-engine/src/generative-search-answer.test.ts
```

基线应证明三题独立行为已经存在。不得为了“重新实现”而修改：

- `apps/web/src/worker/report-v4-question-answerer.ts`
- `apps/web/src/db/report-v4-question-checkpoints.ts`
- 核心作业状态、商业终态、抓取、增强或部署代码。

### 阶段 C：提出最小回答优化 scope

推荐初始允许文件：

1. `apps/web/src/report-v4/mimo-provider.ts`
2. `apps/web/src/report-v4/mimo-provider.test.ts`

仅当测试证明“正确答案被现有解析器拒绝”时，才申请增加：

3. `packages/ai-report-engine/src/generative-search-answer.ts`
4. `packages/ai-report-engine/src/generative-search-answer.test.ts`

初始 diff 预算：最多 1 个生产文件和 1 个测试文件。条件扩展后总上限：2 个生产文件和 2 个测试文件。超过预算必须重新冻结并获得用户批准。

推荐回答优化目标：

- 每次 provider 调用只处理当前一个问题；
- 先直接回答问题，再给必要说明；
- 对“哪些服务商”给出具体名称和公开提供的服务；
- 对“哪些方案适合哪些场景”给出方案、适用场景、交付条件和限制的对应关系；
- 对“采购时核验什么”给出服务范围、条件、限制和风险清单；
- 普通问题不得输出研究方法、空泛市场背景或无答案措辞；
- 不把来源写进 JSON 正文，来源继续只取同次响应 annotations；
- 只有明确类型化拒绝才允许 `unavailable`；
- 不改变三题独立检查点、最多一次本地重试和五来源上限。

新对话必须先把上述允许文件和目标写入 `docs/ACTIVE-CHANGE-SCOPE.md`，展示给用户并等待批准，之后才能把状态改为 `APPROVED`。

### 阶段 D：聚焦实现和本地验收

只运行批准范围内的测试：

```powershell
npm test -- --run `
  apps/web/src/report-v4/mimo-provider.test.ts `
  apps/web/src/worker/report-v4-question-answerer.test.ts `
  packages/ai-report-engine/src/generative-search-answer.test.ts
npm run lint
git diff --check
git diff --name-only origin/codex/report-v4-implementation..HEAD
```

提交前必须证明：

- 完整 diff 没有超出文件白名单；
- 没有新增恢复、重放、状态、迁移、商业、抓取或部署逻辑；
- 没有修改三个问题的独立性；
- 没有运行真实扫描、支付、退款、邮件或部署。

### 阶段 E：把顺丰真实报告作为独立批准门

回答优化本地通过后，先停止并向用户报告。要生成 `shun-express.com` 真报告，还存在两个独立前置条件：

1. Staging Worker 的既有 secret 必须通过只读 preflight；不得用代码补偿缺失配置。
2. 顺丰快照的重复正文准入问题必须作为独立 scope 获得批准，不能混入回答 prompt 修改。

只有用户明确批准后，才能：

- 单独修复 exact-content 去重边界；
- 部署一次受保护 Staging 修订；
- 创建恰好一个全新的顺丰报告；
- 在任何付费动作前断言报告 URL、site key 和快照都属于 `shun-express.com`；
- 运行恰好一次批准的 Sandbox 流程；
- 浏览器确认三个问题和三个答案属于顺丰网站。

旧 MiMo 报告、旧顺丰 `custom_service` 快照和任何失败任务都不得恢复、重放或作为最终报告。

## 7. 完成定义

回答优化阶段只有同时满足以下条件才算完成：

1. 修改发生在批准的回答 prompt/解析边界，而不是状态机。
2. 三题独立测试保持通过。
3. 新增测试分别覆盖三种问题目的的直接回答要求。
4. 普通问题不会被空泛答案或无答案逻辑吞掉。
5. 完整 diff 不超出批准文件和预算。
6. 没有恢复、重放或重复外部流程。

顺丰真实报告属于后续独立验收阶段。没有正确目标绑定、唯一报告身份和浏览器证据，不得声称完成。

## 8. 新对话复制提示词

```text
工作目录：E:\project\open-geo-console

请先完整读取：
1. AGENTS.md
2. docs/ACTIVE-CHANGE-SCOPE.md
3. docs/handoffs/2026-07-19-v4-answer-optimization-scope-recovery.md
4. docs/PROJECT-STATE.md
5. config/report-contracts/combined-geo-report-v4.requirements.json

这是一次范围收敛任务。不要继续当前事故分支的前 10 个宽范围提交，也不要恢复或重放任何历史报告。

先只读检查 git 状态和远程基线，然后从 origin/codex/report-v4-implementation 创建干净分支 codex/v4-answer-optimization-scope-reset。只携带范围锁文档提交 12826b7；不要携带 51aeb69 到 17016df 的任何产品代码提交。保护 assets/ 和 docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md，不得 stash、clean、reset 或删除。

第一阶段只完成 V4 三问题回答优化：
- 保留恰好三个问题、独立输入、独立检查点、单题最多一次本地重试；
- 普通问题必须直接回答，只有显式类型化拒绝可以无答案；
- 每题来源仍只来自本题同次 provider response annotations，最多五个；
- 不修改状态机、恢复、重放、历史数据、支付、退款、邮件、访问 token、抓取、准入、诊断增强、Worker 启动、Docker 或部署。

推荐初始文件白名单只有：
- apps/web/src/report-v4/mimo-provider.ts
- apps/web/src/report-v4/mimo-provider.test.ts

只有测试证明现有 parser 会拒绝正确答案时，才提出增加：
- packages/ai-report-engine/src/generative-search-answer.ts
- packages/ai-report-engine/src/generative-search-answer.test.ts

修改代码前，先把精确白名单、禁止项、diff 预算和验收命令写入 docs/ACTIVE-CHANGE-SCOPE.md，并把 scope 保持 FROZEN。先向我展示这份 scope，等我明确批准后才能改为 APPROVED 并开始代码修改。发现范围外问题必须停止报告，不得自行扩展。

本地回答优化通过后先停止，不要运行真实网站、支付、退款、邮件或部署。shun-express.com 的重复正文准入问题和一次真实 Staging 报告属于第二个独立批准门，必须另行获得我的明确批准。

最终向我交付：
1. 精确改动文件；
2. 回答优化前后差异；
3. 三题独立测试证据；
4. 完整 diff 与白名单核对；
5. 明确列出未触碰的系统。
```
