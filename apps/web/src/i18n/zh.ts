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
    backToScanner: "返回体检入口"
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
    title: "AI 爬虫访问报告",
    description:
      "粘贴 Nginx combined 日志或 Cloudflare JSONL。MVP 内置示例日志，方便立刻查看报告效果。",
    summary: "概览",
    crawlerGroups: "爬虫分组",
    recommendedNginx: "推荐 Nginx 日志配置",
    noKnownCrawlers: "暂未发现已知 AI 爬虫。",
    sampleDescription: "示例日志",
    textareaLabel: "访问日志样本",
    missingUserAgentWarning:
      "这份日志没有 User-Agent 字段，因此无法还原历史 AI 爬虫访问。请先开启 User-Agent 记录，再收集后续证据。",
    recommendedNginxIntro: "使用以下 Nginx 日志格式，为后续报告保留 User-Agent 证据。",
    metricLabels: {
      lines: "行数",
      parsed: "已解析",
      aiHits: "AI 命中",
      groups: "分组"
    },
    fields: {
      operator: "公司",
      bot: "Bot",
      path: "路径",
      status: "状态码",
      date: "日期",
      hits: "访问次数"
    },
    hitCount: "{count} 次",
    groupMeta: "{date} · HTTP {status}"
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
