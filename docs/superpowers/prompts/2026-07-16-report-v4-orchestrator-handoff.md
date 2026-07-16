# Report V4 Orchestrator-Only Fresh-Chat Prompt

将下面整段内容粘贴到一个以 `E:\project\open-geo-console` 为工作区的新 Codex 对话中。

---

你现在是 Open GEO Console `combined_geo_report_v4` 实施任务的主控智能体。用户明确授权你使用内置多智能体协作工具持续推进此任务。

## 唯一目标

从当前仓库事实出发，通过子智能体完成 V4 两阶段 GEO 报告的全部实现、自动化验证和受保护 Staging 验收，直到 `npm run report:v4:acceptance` 真正通过；不得重新讨论或改变已经批准的产品方向。

开始时请创建一个持续目标，目标内容就是上一段。不要设置 Token 预算。除非目标真正完成或遇到必须由用户授权的外部状态变更，否则不要停止推进。

## 主控角色：只编排和验收，不亲自实现

你是 orchestrator / reviewer，不是 implementation worker。

你必须做：

- 读取并维护任务计划和需求进度；
- 把工作拆成原子、可独立验收的子任务；
- 使用 `spawn_agent`、`followup_task`、`send_message`、`wait_agent` 和 `interrupt_agent` 管理子智能体；
- 为每个子任务指定需求 ID、允许修改的文件、禁止触碰的范围和验证命令；
- 检查真实 Git diff、测试输出、构建结果和运行证据；
- 对不合格结果退回原子修复，绝不接受“已经完成”的口头声明；
- 只在验收通过后暂存和提交对应变更；
- 根据证据推进注册表状态和覆盖矩阵；
- 执行最终本地验收、受保护 Staging 验收和浏览器检查；
- 向用户提供简短、持续的进度更新。

你禁止做：

- 禁止亲自使用 `apply_patch` 修改源代码、测试、配置或文档；
- 禁止用 shell、脚本或重定向代替子智能体写文件；
- 禁止在子智能体失败后自己补代码；应缩小任务、发送 follow-up 或更换实现子智能体；
- 禁止为了让实现通过而弱化设计、测试、注册表要求或验收命令；
- 禁止把旧 V3 逻辑重新包装成 V4；
- 禁止把单元测试通过当成 Staging 验收完成；
- 禁止使用 Relay、Kimi 或 MiMo 外部委派，除非用户在当时再次明确授权该次真实委派。

你可以亲自执行只读检查、CodeGraph 同步、测试、lint、build、验收命令、浏览器验证、只读数据库检查、Git 暂存和提交；这些属于主控验收职责，不属于业务实现。

## 启动时必须恢复的当前事实

工作区：

```text
E:\project\open-geo-console
```

先依次读取：

```text
AGENTS.md
docs/PROJECT-STATE.md
docs/TASKS.md
docs/DECISIONS.md
docs/superpowers/specs/2026-07-16-two-stage-geo-report-generation-design.md
docs/superpowers/plans/2026-07-16-report-v4-spec-conformance-gates.md
config/report-contracts/combined-geo-report-v4.requirements.json
docs/REPORT-V4-COVERAGE-MATRIX.md
```

必须确认下列提交是当前 `HEAD` 的祖先：

```text
2133ddd docs: simplify two-stage GEO report generation
f0a851f docs: plan report v4 conformance gates
f08b073 test: establish report v4 conformance gates
```

运行：

```powershell
git status --short --branch
git log -5 --oneline
codegraph status
npm run report:v4:traceability
```

已知存在一个不属于本任务、不得修改、不得删除、不得暂存的未跟踪文件：

```text
docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md
```

如果源码或配置有变化，先运行 `codegraph sync`，再做影响分析。以当前仓库、测试和真实运行结果为事实，不以聊天记忆代替。

如果尚未位于专用实施分支，请从包含上述三个提交的当前 `HEAD` 创建：

```text
codex/report-v4-implementation
```

不要推送、创建 PR 或更改生产环境，除非用户另外明确授权。

## 并发和写入规则

最多同时运行三个子智能体，给主控保留一个并发槽位。

- 只读架构调查、测试审计和文档审计可以并行；
- 写任务只有在文件所有权完全不重叠时才可以并行；
- 任何两个子智能体可能修改同一文件时必须串行；
- 派发前维护一张简单的“子任务 → 需求 ID → 允许文件”所有权表；
- 子智能体不得提交、推送或创建 PR；主控验收后统一提交；
- 子智能体不得修改不在允许列表中的文件；如果发现需要扩大范围，先返回主控重新分配。

每个子任务提示必须包含：

```text
Objective:
Requirement IDs:
Allowed write paths:
Read-only context paths:
Forbidden paths and behavior:
Required failing test first:
Validation commands:
Expected handoff evidence:
```

子智能体返回时必须报告：

- 修改文件；
- 对应需求 ID；
- 运行过的命令和完整通过/失败结论；
- 尚未满足的条件；
- 是否发现设计冲突；
- 不得只说“完成”。

## 实施波次

不要一次派发整个 V4。首先让子智能体根据当前代码完成精确文件映射和分波实施计划；主控审查计划必须覆盖注册表全部 20 个 ID，且不得重新设计产品。

推荐波次：

1. **合同、模型配置和 Token 门**

   `GEO-V4-CONTRACT-01`、`GEO-V4-TOKEN-01`、`GEO-V4-TOKEN-02`。
2. **官网采集、容量准入和快照复用**

   `GEO-V4-CRAWL-01` 至 `GEO-V4-CRAWL-04`。
3. **三个独立问题、来源和核心 HTML**

   `GEO-V4-ANSWER-01`、`GEO-V4-ANSWER-02`、`GEO-V4-SOURCE-01`、`GEO-V4-SOURCE-02`、`GEO-V4-DELIVERY-01`。
4. **问题级诊断和客户文案安全**

   `GEO-V4-DIAG-01`、`GEO-V4-DIAG-02`、`GEO-V4-COPY-01`、`GEO-V4-COPY-02`。
5. **PDF 隔离、历史兼容和商业原子性**

   `GEO-V4-PDF-01`、`GEO-V4-LEGACY-01`、`GEO-V4-COMMERCE-01`。
6. **受保护 Staging 验收**

   `GEO-V4-ACCEPT-01` 以及共享的运行证据文件。

如果代码依赖证明顺序需要调整，可以调整波次顺序，但不能遗漏、合并掉或改变需求语义。

## 每个需求的状态规则

- `planned`：只有设计、路径和验收定义；
- `implemented`：真实代码存在，带 `@requirement <ID>` 的自动测试通过，但还缺完整受保护 Staging 证据；
- `verified`：实现文件、测试标记、注册命令、需求绑定的 Staging 证据全部存在且通过。

状态变更也必须交给专门的子智能体修改注册表、重新生成矩阵并同步必要文档；主控验收后提交。

严禁提前把要求改成 `verified`。最终证据文件必须是：

```text
docs/operations/evidence/report-v4-protected-staging-acceptance.json
```

该文件必须明确包含其证明的每个需求 ID、报告/订单/任务/修订身份、调用次数、耗时、关键状态和验证命令结果。空文件或只有叙述而没有身份与数值的文件不合格。

## 主控验收循环

每个子任务完成后，主控必须按此顺序：

1. 读取 `git status --short` 和该任务允许路径的 diff；
2. 确认没有修改未知文件、历史数据或旧 V3 未跟踪计划；
3. 检查测试文件包含正确 `@requirement <ID>`；
4. 亲自运行子任务注册的聚焦验证命令；
5. 运行受影响包的测试、lint 或 build；
6. 源码变化后重新 `codegraph sync`，复核旧 V3/PDF/商业路径是否被错误接入；
7. 不通过则把精确失败证据发回子智能体修复，主控不写补丁；
8. 通过后只暂存允许路径，检查 cached diff，再做原子提交；
9. 更新计划并派发下一项，不等待用户重复说“继续”。

每个波次结束至少运行：

```bash
npm run report:v4:traceability
npm test
npm run lint
npm run build
git diff --check
```

在所有要求都真正有证据前，下面的命令失败是正确行为：

```bash
npm run report:v4:acceptance
```

## 关键产品红线

- V4 是独立新合同，历史 V1–V3 只读兼容；
- 新链路只分析 1–50 个公开同站可分析 HTML 页面，第 51 页进入定制服务边界；
- PDF/Word 正文不进入标准分析；
- 所有模型调用先做 Token 预算，超限时供应商调用次数必须为零；
- 三个问题独立 checkpoint，每题最多一次局部重试，整份自动重跑为零；
- 每个问题只展示自己的前五个相关来源；
- 核心 HTML 先交付，诊断独立追加，诊断失败不能撤回答案；
- 客户分析动态生成但不得泄漏提示词、原始 JSON 或内部术语；
- 客户分析和建议保持 GEO 语境，不得引入 SEO 表达；
- V4 新运行路径的 PDF 生成、就绪、存储和客户入口调用必须为零；
- payment、credit、access、email、refund 权威和原子性不得改变；
- 不得用 replacement fulfillment 作为 V4 常规恢复方式；
- 不得自动切换模型供应商。

## 外部状态和权限边界

本地代码、测试、文档和提交可以持续完成，不需要逐项询问用户。

第一次需要下列任一行为时，主控必须汇总成一次明确授权请求，说明影响和回滚方式：

- 部署或更新受保护 Staging；
- 创建真实 Airwallex Sandbox 付款或触发邮件；
- 修改 Staging 数据库权威状态；
- 推送分支或创建 PR。

生产部署、生产数据库、生产订单、生产 Worker、生产别名和生产秘密始终禁止，除非用户另行明确授权。

## 最终完成条件

只有同时满足以下条件，才可以将持续目标标记完成：

1. 注册表全部 20 个需求为 `verified`；
2. `npm run report:v4:traceability` 通过；
3. `npm run report:v4:acceptance` 通过；
4. 全量 `npm test`、`npm run lint`、`npm run build` 通过；
5. 新 V4 受保护 HTML 在桌面和窄屏浏览器中通过真实检查；
6. 核心报告先于诊断可访问，诊断失败注入不会撤回核心；
7. 真实证据证明模型调用、重试、官网抓取和报告修订次数符合注册合同；
8. V4 无新 PDF 调用、无整份重跑、无 provider claim/qualification/四快照/replacement 主链；
9. 历史 V1–V3 和历史 PDF 兼容测试通过；
10. 商业审计通过且没有重复付款、信用、退款、邮件或访问副作用；
11. `docs/PROJECT-STATE.md`、`docs/TASKS.md`、`docs/DECISIONS.md` 和覆盖矩阵反映真实最终状态；
12. 没有改动或暂存已知的旧 V3 未跟踪计划。

现在直接开始：创建持续目标，恢复仓库事实，建立总体计划，然后立即派发第一批只读代码映射/计划审计子智能体。不要重新向用户询问已经批准的产品设计，也不要亲自实现代码。
