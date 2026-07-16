import type { Dictionary } from "./types";

export const zh = {
  localeName: "中文",
  metadata: {
    title: "Open GEO Console",
    description: "面向企业官网的开源 AI Search Console。"
  },
  nav: {
    scanner: "网站分析",
    logs: "高级日志工具"
  },
  actions: {
    generateReport: "生成 GEO 报告",
    openSampleLogReport: "打开示例日志报告",
    uploadLogsNext: "下一步上传日志",
    loadSample: "载入示例",
    copyLink: "复制链接",
    copiedLink: "已复制",
    switchToEnglish: "English",
    switchToChinese: "中文",
    backToScanner: "返回体检入口",
    importLogs: "导入日志文件"
  },
  scanner: {
    title: "分析你的企业官网",
    description:
      "免费预览检查首页；私密深度报告会分析站内有效页面，并提供有证据支撑的 AI 分析。",
    urlLabel: "企业官网 URL",
    urlPlaceholder: "https://company.com",
    forceFreshLabel: "强制重新生成报告",
    forceFreshDescription: "仅测试站可用。生成新的抓取与报告期间，旧报告仍保持可访问。",
    verifyingHuman: "正在验证",
    acceptingReport: "正在创建报告",
    scanProgressStarting: "正在创建安全的报告工作区；打开后，网站分析会继续在后台运行。",
    scanProgressSlow: "接单速度比预期慢，请求仍受重复提交保护。",
    scanProgressExtended: "服务接收请求较慢，请保持页面打开；重新尝试也会恢复同一个请求。",
    nextTitle: "已经有服务器访问日志？",
    nextDescription: "验证可识别的 AI 爬虫是否真实访问过该站点。"
  },
  capabilities: {
    freeHomepage: {
      title: "免费首页检查",
      text: "查看首页技术评分和最重要的一条已核验证据问题。"
    },
    evidenceAi: {
      title: "有证据支撑的 AI 分析",
      text: "每条正式 AI 结论都会和已抓取的页面证据核对。"
    },
    privateDeep: {
      title: "私密深度报告",
      text: "分析站内有效页面、覆盖限制、AI 维度评分和 90 天路线图。"
    }
  },
  report: {
    title: "GEO 体检报告",
    generatedFor: "体检对象",
    scanDate: "扫描时间",
    executiveSummary: "管理摘要",
    scoreMeaning: "评分解读",
    scoreGood: "该站点整体具备较好的 AI 搜索发现基础。",
    scoreWatch: "该站点已有部分基础，但优先修复项可以继续提升 AI 可读性。",
    scoreRisk: "该站点存在高优先级 GEO 缺口，可能影响 AI 对网站的可靠理解。",
    topRisks: "主要风险",
    priorityFixes: "优先修复",
    evidence: "证据",
    machineReadableAssets: "机器可读资产",
    findingsAndRecommendations: "问题与建议",
    auditedPages: "已体检页面",
    technicalAppendix: "技术附录",
    noFindings: "未发现问题。这个站点状态良好。",
    shareDescription: "你可以通过安全 HTML 链接分享此报告。",
    logNextTitle: "补充 AI 爬虫访问证据",
    logNextDescription: "上传或粘贴访问日志，查看已知 AI 爬虫是否访问过该站点。",
    legacyFindingLabel: "旧版问题",
    scoreLabel: "评分",
    scoreDescription: "用于判断 AI 搜索和答案系统是否容易发现、读取并引用该网站。",
    priorityEmpty: "当前扫描未发现需要优先处理的修复项。",
    loadingReport: "正在读取浏览器中保存的报告副本。",
    reportUnavailableTitle: "报告不可用",
    reportUnavailableDescription: "服务端存储和当前浏览器都没有找到这份报告。请重新扫描生成新报告。",
    findingAggregation: {
      affectedPages: "影响 {count} 个页面",
      representativePages: "代表 URL",
      morePages: "另有 {count} 个受影响页面",
      pageType: "页面类型：{pageType}",
      template: "页面模板：{template}",
      pageTypeLabels: {
        home: "首页",
        product: "产品",
        service: "服务",
        about: "关于",
        pricing: "定价",
        "case-study": "案例",
        contact: "联系",
        blog: "博客",
        news: "新闻",
        help: "帮助",
        careers: "招聘",
        legal: "法务",
        other: "其他"
      }
    },
    metricLabels: {
      critical: "严重",
      warnings: "警告",
      pages: "页面",
      assets: "资产"
    },
    tableHeaders: {
      url: "URL",
      status: "状态",
      h1: "H1",
      schema: "Schema",
      text: "正文",
      links: "链接"
    },
    fields: {
      present: "存在",
      missing: "缺失",
      yes: "是",
      no: "否",
      error: "错误"
    },
    assetLabels: {
      robotsTxt: "robots.txt",
      sitemapXml: "sitemap.xml",
      llmsTxt: "llms.txt"
    },
    assetPresent: "{asset} 可访问。",
    assetMissing: "{asset} 未找到，或返回内容为空。"
  },
  workspace: {
    tabs: {
      overview: "概览",
      analysis: "AI 分析",
      issues: "问题",
      bots: "AI Bot 证据",
      technical: "技术"
    },
    currentSite: "网站上下文",
    lastScan: "最近扫描",
    submittedAt: "提交时间",
    overviewTitle: "体检概览",
    topFixes: "最高优先级修复",
    viewIssueDetails: "查看修复指引",
    viewAllIssues: "查看全部问题",
    botEvidenceTitle: "AI Bot 证据",
    botEvidenceEmpty: "尚未补充访问日志证据。",
    botEvidenceDescription: "只有需要验证真实、可识别的 AI bot 访问时，才需要导入日志。",
    botsObserved: "已观测 bot",
    operatorsObserved: "已观测公司",
    latestEvidence: "最近证据",
    issuesTitle: "问题与修复建议",
    issuesDescription: "按严重程度依次处理；GEO 评分始终只基于网站体检。",
    botsTitle: "AI Bot 证据",
    botsDescription: "导入访问日志补充访问证据，不保存原始日志、IP 或完整路径。",
    technicalTitle: "技术详情",
    technicalDescription: "机器可读资产、已体检页面和实施参考。",
    importTitle: "导入访问日志",
    importDescription: "支持 Nginx combined 日志与 Cloudflare JSONL；分析完成后丢弃原始日志。",
    pasteLogs: "改为粘贴日志",
    analyzeAndSave: "分析并保存摘要",
    analyzing: "正在分析日志",
    replaceEvidence: "替换证据",
    removeEvidence: "移除证据",
    removing: "正在移除证据",
    localFallback: "共享存储不可用，摘要仅保存在当前浏览器。",
    savedEvidence: "脱敏证据摘要已保存。",
    removedEvidence: "已移除保存的证据摘要。",
    targetUrl: "目标网站",
    detectedBots: "已识别 bot",
    registry: "完整 registry",
    registryDescription: "策略 token 和未出现条目只用于参考，不代表真实访问。",
    noDetectedBots: "这份日志中没有发现可识别的 AI bot。",
    advancedSimulator: "高级：外部爬虫模拟器",
    advancedSimulatorDescription: "生成带标记的请求，再由导入日志判断哪些尝试真正被观测到。",
    sourceLines: "日志行数",
    updatedAt: "更新时间",
    fileReady: "等待分析：{name}",
    previousPage: "上一页",
    nextPage: "下一页",
    pageStatus: "第 {page} / {total} 页",
    backToReport: "返回报告",
    errors: {
      emptyLogs: "请先粘贴或导入访问日志。",
      payloadTooLarge: "日志内容超过 5 MiB 限制。",
      saveFailed: "分析已完成，但共享摘要无法保存。",
      deleteFailed: "无法移除已保存的证据摘要。"
    }
  },
  aiReport: {
    title: "有证据支撑的 AI 官网分析",
    description: "真实大模型读取经过筛选的官网页面，逐条核验结论与抓取证据，并生成可追溯的企业官网报告。",
    previewLabel: "免费 AI 预览",
    deepLabel: "深度报告",
    homepageScore: "首页技术评分",
    homepageScoreDescription: "此评分只基于提交的首页以及 robots.txt、sitemap.xml、llms.txt 标准检查，不代表全站评分。",
    homepagePreviewNotice: "免费预览只分析了首页。",
    detectedPagesEstimate: "检测到约 {count} 个站内 URL，但尚未抓取或分析这些页面的内容。",
    lockedDeepFeatures: "解锁深度报告后可查看完整网站问题、页面证据、维度解释、改写示例和 90 天行动路线图。",
    technicalScore: "技术评分",
    aiDimensions: "AI 维度评分",
    organizationProfile: "企业身份画像",
    executiveSummary: "执行摘要",
    topFindings: "最高影响问题",
    pageTypes: "页面类型分析",
    roadmap: "90 天行动路线图",
    coverage: "覆盖范围与限制",
    evidence: "证据",
    confidence: "置信度",
    unlockTitle: "解锁深度 AI 报告",
    unlockDescription: "消耗一次报告额度，分析最多 50 个代表页面并查看完整证据和行动方案。",
    accessKeyLabel: "报告访问 Key",
    unlockAction: "解锁深度报告",
    unlocking: "正在预留额度",
    startNewAnalysis: "开始新的分析",
    statusTitle: "报告状态",
    waitingDescription: "报告正在生成，可恢复的工作会由系统自动处理。",
    retryWaitDescription: "系统遇到临时问题，已完成的工作会保留，报告将自动继续。",
    repairWaitDescription: "服务正在修复履约依赖，已完成的工作会保留，你无需重复提交。",
    acceptedDescription: "请求已接收，系统正在检查网站；结果准备好后会自动显示在这里。",
    technicalFailedDescription: "系统无法安全地分析这个网站，请使用可公开访问的网址重新生成。",
    completedDescription: "报告已完成 — 已分析 {count} 个页面。",
    completedLimitedDescription: "报告已完成 — 已分析 {count} 个有效页面，排除 {failed} 个不可访问页面；限制已列出，报告额度已退回。",
    failedDescription: "本次分析无法完成，报告额度已经退回。你可以稍后开始新的分析。",
    unavailableDescription: "当前部署尚未配置 AI 分析服务。",
    previewUnavailableDescription: "本次免费 AI 预览未生成，但首页技术报告已经完成，可以正常查看。",
    reportLanguage: "报告语言",
    reportLanguageEnglish: "英文",
    reportLanguageChinese: "中文",
    regenerateLanguage: "用{language}重新生成",
    correctionInProgress: "正在按报告设定语言重新生成。",
    siteTechnicalScore: "全站技术评分 — 基于 {count} 个有效页面",
    queuePosition: "当前排队第 {position} 位",
    queueJobsAhead: "同类报告队列前面还有 {count} 个任务。",
    queueActiveJobsInPool: "当前任务已经排在最前，Worker 仍在处理同类任务。",
    queueAwaitingClaim: "当前任务已经排在最前，后台 Worker 尚未领取；启动后会自动继续，无需重复提交。",
    activeTierPreview: "当前正在处理免费 AI 预览。",
    activeTierDeep: "当前正在处理深度报告。",
    activeTierMixed: "当前同时在处理免费预览和深度报告。",
    progressValue: "报告生成已完成 {progress}%",
    stageDescriptions: {
      queued: "请求已接收，后台 Worker 会自动开始处理。",
      discovering: "正在检查网址安全并读取提交的首页。",
      planning: "正在准备这份报告的证据计划。",
      fetching: "正在收集可读取的网站证据。",
      analyzing: "正在分析已采集的证据。",
      synthesizing: "正在整理经过验证的问题和建议。",
      completed: "报告已完成。",
      completed_limited: "报告已完成，并标明了覆盖范围限制。",
      failed: "报告未能完成。"
    }
  },
  commerce: {
    offerTitle: "解锁全站 AI 搜索可见性深度诊断",
    offerDescription: "一次购买对应当前网站的一份私密深度报告，付款金额始终由服务端价格目录确定。",
    scopeEvidence: "覆盖最多 50 个代表页面的证据",
    scopeFixes: "按优先级排列的修复建议与页面示例",
    scopeRoadmap: "可执行的 90 天行动路线图",
    emailLabel: "报告接收邮箱",
    currencyLabel: "付款币种",
    deliveryPromise: "付款后 24 小时内通过邮件交付，否则全额退款。",
    buyAction: "解锁全站分析",
    redirecting: "正在打开安全收银台",
    verifying: "正在验证",
    unavailable: "当前部署尚未配置在线购买。",
    checkoutFailed: "暂时无法打开安全收银台，请重试。",
    humanVerification: "请先完成人机验证。",
    operatorKeySummary: "已经有报告访问 Key？",
    paymentReturnTitle: "付款与交付状态",
    paymentConfirming: "你已返回原报告页。系统正在等待已验签的付款确认，无需重复付款。",
    paymentNotCompleted: "收银台已在付款确认前关闭。你可以准备好后重新发起付款。",
    paymentCancelled: "付款已取消，系统没有创建报告权益。",
    paymentQueued: "付款已确认。私密深度报告已进入队列，将在 24 小时内通过邮件交付。",
    paymentGenerating: "付款已确认，私密深度报告正在生成。",
    paymentCompleted: "私密深度报告已完成，请通过交付邮件安全访问。",
    paymentFailed: "报告未能完成，系统正在自动处理退款。",
    paymentRefundPending: "全额退款已提交，正在等待支付机构确认。",
    paymentRefunded: "全额退款已确认。",
    paymentRefundFailed: "自动退款未能完成，请联系支持团队协助核验并处理退款。",
    paymentStatusUnavailable: "无法读取当前报告对应的订单状态。",
    paymentRefresh: "刷新状态",
    paymentRefreshStopped: "自动更新已暂停，请刷新以读取最新验签状态。"
  },
  logs: {
    title: "AI Bot 可见性报告",
    description:
      "粘贴 Nginx combined 日志或 Cloudflare JSONL，查看哪些可识别 AI bot 真实出现在访问日志中。",
    summary: "概览",
    crawlerGroups: "爬虫分组",
    operatorSummary: "公司汇总",
    botCoverageMatrix: "AI Bot 覆盖矩阵",
    policyHints: "策略与证据说明",
    detectedEvidence: "已识别路径证据",
    recommendedNginx: "推荐 Nginx 日志配置",
    noKnownCrawlers: "暂未发现已知 AI 爬虫。",
    noDetectedOperators: "这份日志样本中没有识别到 AI bot 公司。",
    sampleDescription: "示例日志",
    textareaLabel: "粘贴或导入访问日志",
    missingUserAgentWarning:
      "这份日志没有 User-Agent 字段，因此无法还原历史 AI 爬虫访问。请先开启 User-Agent 记录，再收集后续证据。",
    recommendedNginxIntro: "使用以下 Nginx 日志格式，为后续报告保留 User-Agent 证据。",
    registryContext: "当前 registry 中有 {total} 条规则，其中 {detected} 条从日志证据中被识别。",
    robotTokenOnlyNotice:
      "robots-token-only 条目是 robots.txt 的策略控制项，不代表爬虫已经访问过网站。",
    docsLink: "来源文档",
    morePaths: "另有 {count} 个路径",
    metricLabels: {
      lines: "行数",
      parsed: "已解析",
      aiHits: "AI 命中",
      groups: "分组",
      detectedBots: "已识别 bot",
      detectedOperators: "公司数",
      registryBots: "规则数"
    },
    fields: {
      operator: "公司",
      bot: "Bot",
      path: "路径",
      status: "状态码",
      date: "日期",
      hits: "访问次数",
      intent: "意图",
      detectability: "可识别性",
      latestDate: "最近日期",
      robotsToken: "Robots token",
      docs: "来源",
      paths: "路径"
    },
    coverageStatuses: {
      detected: "已识别",
      not_seen: "未出现",
      not_log_detectable: "策略 token",
      unknown_or_unverified: "需验证"
    },
    coverageStatusDescriptions: {
      detected: "该 bot 以可识别 User-Agent 出现在当前日志中。",
      not_seen: "该 bot 可以通过日志识别，但未出现在当前样本中。",
      not_log_detectable: "这是 robots.txt 策略 token，不应当被当作日志访问证据。",
      unknown_or_unverified: "该规则有可见性参考价值，但在形成确定结论前需要核验来源。"
    },
    intentLabels: {
      training: "训练",
      search: "搜索",
      assistant: "助手抓取",
      preview: "预览",
      general: "通用抓取"
    },
    detectabilityLabels: {
      "log-detectable": "日志可识别",
      "robots-token-only": "仅 robots token",
      "suspected-or-community": "疑似 / 社区观察"
    },
    detectabilityDescriptions: {
      "log-detectable": "只要日志记录了 User-Agent，就可以从访问日志中识别。",
      "robots-token-only": "用于 robots.txt 策略控制，通常不会作为普通 HTTP User-Agent 出现。",
      "suspected-or-community": "来自社区观察或间接证据，形成强结论前需要确认。"
    },
    policyHintMessages: {
      "logging-user-agent": "日志缺少 User-Agent，因此无法从历史记录还原 AI bot 访问。",
      "robots-token-control":
        "{bot} 通过 robots.txt token {robotsToken} 控制；应展示为策略项，而不是流量证据。",
      "suspected-verification":
        "{bot} 标记为疑似或社区观察项。可以作为可见性信号，但对外报告前应先核验来源。"
    },
    hitCount: "{count} 次",
    groupMeta: "{date} · HTTP {status}",
    simulator: {
      title: "外部 AI 爬虫模拟器",
      description:
        "对你输入的网站运行模拟器，再把生成的尝试请求与下方粘贴或导入的访问日志进行对比。",
      targetUrlLabel: "网站 URL",
      runButton: "运行模拟器",
      runningButton: "正在运行模拟器",
      compareButton: "与导入日志对比",
      comparingButton: "正在对比日志",
      attemptedTitle: "模拟抓取尝试",
      attemptedDescription:
        "这些只是生成的请求尝试，不代表真实 AI 公司已经访问过该站点。",
      comparisonTitle: "导入日志中的观测结果",
      comparisonDescription:
        "这里会标记当前粘贴日志中是否出现了对应的模拟请求。",
      observedTitle: "已观测",
      missingTitle: "未观测",
      noAttempts: "运行模拟器后会显示尝试请求。",
      noObserved: "导入日志中暂未观测到这些模拟请求。",
      noMissing: "所有模拟请求都已在导入日志中观测到。",
      pasteLogsHint: "请先粘贴或导入访问日志，再进行对比。",
      simulatedBadge: "模拟抓取尝试",
      observedBadge: "已在导入日志中观测",
      missingBadge: "未在导入日志中观测",
      pendingBadge: "等待日志对比",
      generatedMeta: "运行 {runId} 生成于 {date}",
      comparisonSummary: "{observed} 已观测 · {missing} 未观测",
      fields: {
        method: "方法",
        url: "URL",
        path: "路径",
        userAgent: "User-Agent",
        operator: "公司",
        bot: "Bot"
      },
      errors: {
        runFailed: "暂时无法运行模拟器。请在模拟器 API 可用后重试。",
        matchFailed: "暂时无法对比这次模拟运行与日志。",
        emptyLogs: "请先粘贴或导入访问日志，再进行对比。",
        invalidRun: "模拟器响应中没有可用的运行结果。",
        importFailed: "无法导入这个日志文件。"
      }
    }
  },
  severity: {
    critical: "严重",
    warning: "警告",
    info: "提示"
  },
  findings: {
    "asset.missingLlmsTxt": {
      title: "缺少 llms.txt",
      description: "AI 答案引擎无法在标准位置读取该网站的专用摘要文件。",
      recommendation:
        "发布 /llms.txt，提供简明公司介绍、核心产品页面和希望被引用的标准链接。"
    },
    "asset.missingSitemapXml": {
      title: "缺少 sitemap.xml",
      description: "体检无法发现 sitemap，因此难以稳定选择代表性页面。",
      recommendation: "发布 /sitemap.xml，并在 robots.txt 中声明 sitemap 地址。"
    },
    "asset.missingRobotsTxt": {
      title: "缺少 robots.txt",
      description: "网站没有在标准位置声明爬虫访问策略。",
      recommendation: "发布 /robots.txt，包含 sitemap 发现信息，并明确 AI 爬虫访问策略。"
    },
    "page.badStatus": {
      title: "页面返回错误状态码",
      description: "{url} 返回 HTTP {status}。",
      recommendation: "修复损坏的核心页面，或将其从 sitemap 中移除。"
    },
    "page.weakTitle": {
      title: "标题较弱或缺失",
      description: "AI 爬虫依赖清晰标题来判断页面用途。",
      recommendation: "补充明确的页面标题，写清公司、产品或页面意图。"
    },
    "page.duplicateTitles": {
      title: "多个页面重复使用同一标题",
      description: "{affectedCount} 个页面使用相同标题，削弱了生成式引擎对页面独立用途的识别。",
      recommendation: "为每个页面使用简洁、用途明确的独立标题，仅保留短小的通用品牌标识。"
    },
    "page.dominantTitleTemplate": {
      title: "页面标题被共享模板主导",
      description: "{affectedCount} 个页面共享长度为 {sharedLength} 个字符的标题片段，页面独有语义占比过低。",
      recommendation:
        "优先表达当前页面的独特用途，并将重复部分缩减为简洁的品牌标识，以便生成式引擎准确选择和引用页面。"
    },
    "page.missingMetaDescription": {
      title: "缺少 meta description",
      description: "页面缺少可用于搜索和 AI 预览场景的简明摘要。",
      recommendation: "为每个重要页面添加描述清晰的 meta description。"
    },
    "page.h1Structure": {
      title: "H1 结构需要调整",
      description: "预期只有一个 H1，实际发现 {h1Count} 个。",
      recommendation: "每个页面使用一个描述清晰的 H1，并将 H2 用于章节结构。"
    },
    "page.missingCanonical": {
      title: "缺少 canonical URL",
      description: "Canonical URL 可以帮助爬虫合并重复页面或带参数页面。",
      recommendation: "为每个可索引页面添加 canonical 链接。"
    },
    "page.missingJsonLd": {
      title: "缺少 JSON-LD Schema",
      description: "该页面未提供结构化数据。",
      recommendation: "根据页面类型添加 Organization、WebSite、Article、Product 或 Service Schema。"
    },
    "page.lowReadableContent": {
      title: "可读正文偏少",
      description: "页面暴露的文本可能不足，AI 系统难以稳定总结。",
      recommendation:
        "确保核心页面包含可抓取正文，说明产品、受众、证明和下一步行动。"
    },
    "homepage.missingOpenGraph": {
      title: "首页缺少 OpenGraph 元数据",
      description: "在问答或社交预览场景中，展示效果可能不够稳定。",
      recommendation: "为首页添加 OpenGraph 标题、描述、URL 和图片元数据。"
    }
  },
  errors: {
    emptyUrl: "请输入企业官网 URL。",
    unsupportedUrl: "仅支持 HTTP 和 HTTPS URL。",
    scanFailed: "暂时无法扫描该网站。",
    humanVerificationRequired: "开始诊断前，请先完成人机验证。",
    freePreviewLimitReached: "每个网络地址在任意 24 小时内最多免费分析 2 个不同网站，请稍后再试。",
    stagingFreePreviewLimitReached: "受保护测试站已达到滚动 24 小时网站额度上限。",
    stagingConcurrencyLimitReached: "已有两个测试报告正在运行，请等待其中一个完成后再试。",
    forceFreshUnavailable: "强制重新生成仅在受保护测试站可用。",
    deploymentConfigurationInvalid: "当前部署没有配置安全且一致的环境身份。"
  }
} satisfies Dictionary;
