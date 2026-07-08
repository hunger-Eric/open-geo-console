import type { Dictionary } from "./types";

export const zh = {
  localeName: "中文",
  metadata: {
    title: "Open GEO Console",
    description: "面向企业官网的开源 AI Search Console。"
  },
  nav: {
    scanner: "体检入口",
    logs: "日志报告",
    caseStudy: "首个案例"
  },
  actions: {
    generateReport: "生成 GEO 报告",
    openSampleLogReport: "打开示例日志报告",
    uploadLogsNext: "下一步上传日志",
    loadSample: "载入示例",
    copyLink: "复制链接",
    copiedLink: "已复制",
    printReport: "打印 / PDF",
    switchToEnglish: "English",
    switchToChinese: "中文",
    backToScanner: "返回体检入口",
    importLogs: "导入日志文件"
  },
  scanner: {
    title: "生成一份可分享的 GEO 体检报告",
    description:
      "输入企业官网，检查 AI 搜索可读性，并生成包含管理摘要、证据和修复优先级的交付报告。",
    urlLabel: "企业官网 URL",
    urlPlaceholder: "https://company.com",
    recentReportsTitle: "最近报告",
    emptyRecentReports: "还没有保存的扫描。默认网址是第一个公开案例。",
    nextTitle: "下一步：AI 爬虫访问",
    nextDescription:
      "完成 GEO 体检后，接入访问日志，确认 OpenAI、Claude、Perplexity 或字节等 AI 爬虫是否来过。",
    firstCaseUrl: "https://me.itheheda.online"
  },
  capabilities: {
    geoAudit: {
      title: "GEO 体检",
      text: "检查机器可读资产、页面结构、Schema 和正文可读性。"
    },
    crawlerLogs: {
      title: "爬虫日志",
      text: "识别 OpenAI、Claude、Perplexity、字节等 AI 爬虫访问。"
    },
    selfHosted: {
      title: "自托管",
      text: "本地 SQLite，无需账号，适合开源部署。"
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
    shareDescription: "你可以分享此报告链接，或打印为客户可读的 PDF。",
    logNextTitle: "补充 AI 爬虫访问证据",
    logNextDescription: "上传或粘贴访问日志，查看已知 AI 爬虫是否访问过该站点。",
    legacyFindingLabel: "旧版问题",
    scoreLabel: "评分",
    scoreDescription: "用于判断 AI 搜索和答案系统是否容易发现、读取并引用该网站。",
    priorityEmpty: "当前扫描未发现需要优先处理的修复项。",
    loadingReport: "正在读取浏览器中保存的报告副本。",
    reportUnavailableTitle: "报告不可用",
    reportUnavailableDescription: "服务端存储和当前浏览器都没有找到这份报告。请重新扫描生成新报告。",
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
        "先对首个案例站点运行模拟器，再把生成的尝试请求与下方粘贴或导入的访问日志进行对比。",
      targetUrlLabel: "首个案例 URL",
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
      recommendation: "为首页添加 OpenGraph title、description、URL 和 image 元数据。"
    }
  },
  errors: {
    emptyUrl: "请输入企业官网 URL。",
    unsupportedUrl: "仅支持 HTTP 和 HTTPS URL。",
    scanFailed: "暂时无法扫描该网站。"
  }
} satisfies Dictionary;
