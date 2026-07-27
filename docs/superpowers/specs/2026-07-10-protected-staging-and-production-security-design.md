# 受保护测试站与正式站安全设计

日期：2026-07-10
状态：已确认，等待用户复核书面规格

## 1. 背景与目标

当前公开验收站对匿名用户执行“同一网络地址在滚动 24 小时内最多分析 2 个不同网站”的限制。这个限制能够控制公开滥用，但也会阻止操作者在浏览器中连续测试多个网站。当前实现还会复用同一网站 30 天内的免费报告，因此仅提高每日额度仍不能验证同一网站的重新抓取和重新生成。

本设计同时解决两个问题：

1. 建立一个只有操作者能够访问、可以调用真实 CodingPlan 模型的独立测试站。
2. 为未来公开商业正式站建立纵深防御，同时保证测试资源和正式资源完全隔离。

成功标准：操作者可以在测试站连续测试、选择性重新生成同一网站、验证沙箱支付与邮件，而任何测试行为都不能改变正式站限流、正式数据或真实商业结果。

## 2. 方案选择

### 2.1 采用：受保护的 Vercel Preview

复用当前 Vercel 项目的固定 Preview 分支，开启 Vercel Authentication，并为 Preview 配置独立环境变量和独立 Neon 数据库。测试站默认调用真实 CodingPlan API。

选择理由：

- 不新增固定服务器费用。
- Vercel 在应用到达 Next.js 前完成成员身份验证。
- Preview 可以使用与 Production 分开的环境变量。
- 测试数据库、模型密钥、支付沙箱和邮件行为可以独立验收。

### 2.2 未采用：在正式站加入管理员绕过

不在公开正式站加入管理员 Header、Cookie、查询参数或通用额度重置接口。此类入口会扩大正式站攻击面，并可能因为密钥泄露或配置错误绕过生产限流。

### 2.3 未采用：仅在本机测试

本机测试继续用于快速开发，但不能替代真实 Preview 对 Vercel 保护、平台 Header、远程数据库和浏览器行为的验收。

## 3. 环境拓扑

### 3.1 测试站

```text
操作者浏览器
  -> Vercel Authentication
  -> 受保护 Preview Web/API
  -> 独立 Neon staging 数据库
  -> 本地 staging Worker
  -> 独立 CodingPlan 测试密钥
  -> Airwallex Sandbox / 测试邮件收件箱
```

测试站使用固定 Preview 分支 URL。未经授权的浏览器访问页面或 API 时都必须停在 Vercel 登录层。

### 3.2 正式站

目标商业拓扑为：

```text
公众访客
  -> Cloudflare DDoS / Bot Fight Mode / WAF / 短时限流
  -> Netlify 商业 Web/API
  -> Turnstile 服务端验证
  -> PostgreSQL 业务限流和任务权威
  -> free/deep Worker
  -> 正式模型、支付、邮件和 Queue 资源
```

当前 Vercel Hobby 公开部署继续只作为非商业验收站；商业正式站仍按现有项目边界迁移到 Netlify。Cloudflare 不是唯一防线：即使请求绕过 Cloudflare到达源站，应用层 Turnstile、数据库限流、任务预算、Webhook 验签和 SSRF 防护仍然生效。

## 4. 环境身份与配置边界

新增明确的部署身份：

```text
OGC_DEPLOYMENT_PROFILE=staging | production
```

测试能力只有在以下条件同时满足时生效：

```text
VERCEL_ENV=preview
OGC_DEPLOYMENT_PROFILE=staging
COMMERCE_MODE!=live
```

任何条件缺失、值非法或互相冲突时都必须失败关闭。`VERCEL_ENV=production` 时，无条件忽略所有 staging 专用变量并使用正式策略。

每个 PostgreSQL 实例保存一个不可由普通请求修改的环境标记。Web 和 Worker 启动时比较数据库标记与 `OGC_DEPLOYMENT_PROFILE`；不一致时拒绝处理任务。数据库标记通过本地运维命令初始化，不提供 HTTP 修改接口。

测试与正式环境必须分别配置：

- `DATABASE_URL`
- `OGC_TOKEN_HASH_SECRET`
- `OGC_IP_HASH_SECRET`
- 邮箱加密密钥
- `OGC_AI_API_KEY` 及其他模型参数
- Airwallex 凭据和 Webhook secret
- Resend 凭据、发件身份和 Webhook secret
- Queue 凭据
- Vercel automation protection bypass

任何测试密钥不得被复制到正式环境，任何正式密钥不得进入 Preview。

## 5. 测试站免费报告策略

正式策略保持不变：同一 HMAC 客户端身份在滚动 24 小时内最多分析 2 个不同网站，同一网站可复用 30 天内的有效免费报告。

测试策略：

- 默认最多分析 100 个不同网站/滚动 24 小时。
- staging 限额设置上限为 100；非法、负数、小数或超上限配置失败关闭。
- 同一网站默认继续复用现有报告，不重复计入不同网站数量。
- staging 同时运行的报告任务最多为 2，初始本地 Worker 默认并发为 1。
- 保留全局 AI 作业安全阀，防止循环或自动化错误无限创建模型任务；它是任务数量保护，不用于按 Token 计费。

正式代码路径必须证明：即使 Production 误配 `OGC_STAGING_FREE_SITE_LIMIT=100`，有效限额仍然是 2。

## 6. “强制重新生成”语义

测试站报告表单提供仅 staging 可见的“强制重新生成”选项，默认不勾选。它只作用于免费报告，不作为正式站或付费深度报告的管理员重置功能。

服务端必须再次验证 staging 环境，不能依赖前端隐藏。Production 收到 `forceFresh` 请求时返回拒绝响应，不能静默启用。

重新生成遵循以下规则：

1. 创建新的报告和免费任务，不覆盖旧报告。
2. 旧的站点复用映射在新报告生成期间继续有效。
3. 新报告达到可用终态后，原子地将该网站的活动复用映射切换到新报告。
4. 新任务失败或被取消时，复用映射保持指向旧报告。
5. 同一网站同一时间只允许一个 staging 重新生成任务，重复点击返回正在运行的任务。
6. 旧报告仍可通过原报告 ID 访问，用于前后对比。

这避免了“先删除旧报告、再生成失败”导致测试证据丢失。

## 7. Worker 隔离

增加明确的 staging Worker 和商业批处理入口。操作者不能通过手工替换 `apps/web/.env.local` 在测试库与正式库之间切换。

staging Worker 启动前必须：

1. 加载被 Git 忽略的 staging 环境文件或 Vercel Preview 环境。
2. 确认 `OGC_DEPLOYMENT_PROFILE=staging`。
3. 查询数据库环境标记并确认是 staging。
4. 确认 `COMMERCE_MODE` 不是 `live`。
5. 输出数据库实例的非敏感指纹和运行模式，禁止输出连接串或密钥。

任一步不满足即退出，不能回退到默认或正式配置。

## 8. 支付、Webhook 与邮件

### 8.1 支付

测试站固定使用 `COMMERCE_MODE=test` 和 Airwallex Sandbox。服务端价格目录、Webhook 验签、幂等付款、一次性权益和退款流程仍按正式逻辑执行。错误签名、重复事件和客户端篡改金额必须被拒绝。

### 8.2 受保护 Preview 的 Webhook

Vercel Authentication 会同时保护 Webhook 路由。Airwallex Sandbox 和 Resend 测试 Webhook使用独立且可轮换的 automation bypass，穿过 Vercel 后仍必须通过各自的应用层签名验证。

现有 automation bypass 在本轮只读审查中被判定需要轮换。启用测试站之前必须撤销旧值、生成新值并确认旧值无法访问。任何 bypass 值都不得写入仓库、命令输出、日志或文档。

### 8.3 测试邮件

`COMMERCE_MODE=test` 本身不会自动阻止 Resend 真实发信，因此测试站必须配置 `OGC_TEST_EMAIL_RECIPIENT`：

- 所有测试邮件的实际 envelope recipient 强制改为该地址。
- 用户输入的原始邮箱仍按现有加密边界保存，以测试订单流程，但绝不作为实际发送目标。
- 未配置测试收件地址时，测试邮件发送失败关闭。
- Production 必须忽略并禁止该重定向变量。

## 9. 正式站纵深防御

正式站部署时启用：

- Cloudflare Bot Fight Mode；不启用“屏蔽 AI 爬虫”，避免破坏产品自身的 GEO 可发现性。
- Cloudflare 免费 WAF 速率限制规则保护高成本写入口，主要拦截短时突发。
- `/api/scan` 强制 Turnstile，并在服务端调用 Siteverify；客户端 Widget 不能替代服务端验证。
- PostgreSQL继续精确执行滚动 24 小时不同网站额度、30 天复用和全局 AI 预算。
- 队列租约、并发、超时、重试和页面抓取上限防止资源耗尽。
- 支付和邮件 Webhook 验签、幂等处理；只有合法付款回调能够创建付费权益和 deep job。
- 数据库最小权限、备份、密钥轮换、MFA、异常请求和商业不变量审计。
- 不持久化或记录原始 IP、模型密钥、支付密钥、邮件密钥、报告 access token 或 report-credit key。

Cloudflare 免费速率限制只承担短周期边缘保护，不能替代数据库中的 24 小时业务额度。

## 10. 故障处理

- 测试数据库、数据库标记、模型密钥或 staging 身份缺失：拒绝启动或拒绝创建任务。
- CodingPlan 调用失败：按现有失败分类记录可重试状态，有限重试，禁止无限循环。
- 强制重新生成失败：旧报告和旧复用映射保持可用。
- 达到 staging 上限：返回明确、本地化的测试额度错误；不暴露远程重置接口。
- 需要清理时使用只接受 staging 数据库的本地运维命令，同时处理 `free_site_trials` 与 `anonymous_rate_buckets`；命令检测到 production 标记必须拒绝执行。
- Webhook bypass 失效：事件不能穿过 Vercel；修复保护配置后由沙箱提供方重发，不能解除整个 Preview 的身份保护。
- 测试收件地址缺失：邮件留在 outbox/失败状态，不发送到用户输入地址。
- Cloudflare不可用或被绕过：源站应用安全边界继续有效。

## 11. 验收矩阵

### 11.1 自动化测试

- 策略单测：Production 始终为 2；只有 Preview + staging 双条件允许最多 100。
- 非法配置测试：缺失、0、负数、小数和超上限值失败关闭。
- 路由测试：Header、Cookie、查询参数不能改变部署身份或限额。
- 同站复用测试：普通提交复用现有报告，不重复计数。
- 强制重新生成测试：新旧报告 ID 不同；成功后切换映射；失败时保留旧映射；并发点击不重复创建。
- PostgreSQL 集成测试：不同 IP 隔离、滚动窗口、准确 `retryAfter`、并发不超卖。
- 数据库标记测试：Web/Worker 连接错误环境时拒绝运行。
- 邮件测试：staging 所有收件人重定向；Production 不重定向；缺配置不发送。
- 支付测试：Sandbox、错误签名、重复 Webhook、篡改金额和一次性权益。
- 安全回归：SSRF、Turnstile重放、报告令牌、Webhook 验签和商业终态审计。

基础命令：

```bash
npm run lint
npm test
npm run build
npm run db:audit
```

### 11.2 部署验收

- 无痕窗口访问测试页面和 `/api/scan` 均被 Vercel Authentication 拦截。
- 登录后可以分析超过两个不同网站，达到 staging 上限后仍返回 429。
- 同一网站默认复用；显式强制重新生成产生新任务并保留旧报告。
- staging Worker 只处理 staging 作业，正式数据库计数和记录不变化。
- 使用真实 CodingPlan 测试密钥完成至少一份 free 报告。
- Airwallex Sandbox 完成一次合法付款、一次重复 Webhook 和一次错误签名验收。
- 测试邮件只到达指定测试邮箱。
- 撤销旧 Vercel automation bypass 后，旧凭据不能访问 Preview。
- 正式站第三个不同网站仍被拒绝，测试变量无法改变该结果。
- 正式站的 Turnstile、Cloudflare规则和源站应用限流分别得到实际请求证据。

## 12. 实施顺序

1. 实现部署身份、策略解析和数据库环境标记。
2. 实现 staging Worker 配置隔离。
3. 实现 staging 高额度和安全的强制重新生成。
4. 实现测试邮件重定向和 Sandbox Webhook 访问边界。
5. 配置独立 Neon、Preview 环境变量和 Vercel Authentication。
6. 轮换 automation bypass，部署并完成测试站验收。
7. 配置 Cloudflare、正式 Turnstile和正式资源，完成正式站纵深防御验收。

每一步先通过自动化测试，再进入真实部署；不得用测试环境的成功结果代替正式环境验收。

## 13. 非目标

- 不引入用户账号、团队、订阅或正式站管理员后台。
- 不允许正式用户绕过免费额度。
- 不为测试站新增常驻服务器。
- 不在这一阶段改变一次性报告购买模式。
- 不把测试站变成对外演示站或共享链接站点。
