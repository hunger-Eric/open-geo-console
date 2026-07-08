import type { Dictionary } from "./types";

export const en = {
  localeName: "English",
  metadata: {
    title: "Open GEO Console",
    description: "Open-source AI Search Console for company websites."
  },
  nav: {
    scanner: "Scanner",
    logs: "Log report",
    caseStudy: "First case"
  },
  actions: {
    generateReport: "Generate GEO report",
    openSampleLogReport: "Open sample log report",
    uploadLogsNext: "Upload logs next",
    loadSample: "Load sample",
    copyLink: "Copy link",
    copiedLink: "Copied",
    printReport: "Print / PDF",
    switchToEnglish: "English",
    switchToChinese: "中文",
    backToScanner: "Back to scanner"
  },
  scanner: {
    title: "Generate a shareable GEO report",
    description:
      "Scan a company website for AI search readiness, then hand off a report with executive summary, evidence, and next fixes.",
    urlLabel: "Company website URL",
    urlPlaceholder: "https://company.com",
    recentReportsTitle: "Recent reports",
    emptyRecentReports: "No saved scans yet. The default URL is the first public case study.",
    nextTitle: "Next: AI crawler access",
    nextDescription:
      "After the GEO report, add access logs to answer whether OpenAI, Claude, Perplexity, or ByteDance has visited.",
    firstCaseUrl: "https://me.itheheda.online"
  },
  capabilities: {
    geoAudit: {
      title: "GEO audit",
      text: "Machine-readable assets, structure, schema, and content checks."
    },
    crawlerLogs: {
      title: "Crawler logs",
      text: "OpenAI, Claude, Perplexity, ByteDance, and more."
    },
    selfHosted: {
      title: "Self-hosted",
      text: "Local SQLite, no account required, ready for open-source deployment."
    }
  },
  report: {
    title: "GEO Readiness Report",
    generatedFor: "Generated for",
    scanDate: "Scan date",
    executiveSummary: "Executive summary",
    scoreMeaning: "Score meaning",
    scoreGood: "This site is broadly ready for AI search discovery.",
    scoreWatch: "This site is partially ready, but priority fixes would improve AI readability.",
    scoreRisk: "This site has high-priority GEO gaps that can block reliable AI interpretation.",
    topRisks: "Top risks",
    priorityFixes: "Priority fixes",
    evidence: "Evidence",
    machineReadableAssets: "Machine-readable assets",
    findingsAndRecommendations: "Findings and recommendations",
    auditedPages: "Audited pages",
    technicalAppendix: "Technical appendix",
    noFindings: "No findings. This site is in good shape.",
    shareDescription: "Share this report URL or print it as a client-ready PDF.",
    logNextTitle: "Add AI crawler evidence",
    logNextDescription:
      "Upload or paste access logs to see whether known AI crawlers have visited this site.",
    legacyFindingLabel: "Legacy finding",
    scoreLabel: "Score",
    scoreDescription:
      "A practical score for how easily AI search and answer systems can discover, read, and cite this website.",
    priorityEmpty: "No priority fixes are required from the current scan.",
    loadingReport: "Loading the saved browser copy of this report.",
    reportUnavailableTitle: "Report unavailable",
    reportUnavailableDescription:
      "This report is not available in server storage or this browser. Generate a new scan to create a fresh report.",
    metricLabels: {
      critical: "Critical",
      warnings: "Warnings",
      pages: "Pages",
      assets: "Assets"
    },
    tableHeaders: {
      url: "URL",
      status: "Status",
      h1: "H1",
      schema: "Schema",
      text: "Text",
      links: "Links"
    },
    fields: {
      present: "Present",
      missing: "Missing",
      yes: "Yes",
      no: "No",
      error: "Error"
    },
    assetLabels: {
      robotsTxt: "robots.txt",
      sitemapXml: "sitemap.xml",
      llmsTxt: "llms.txt"
    },
    assetPresent: "{asset} is available.",
    assetMissing: "{asset} was not found or returned an empty response."
  },
  logs: {
    title: "AI Bot Visibility Report",
    description:
      "Paste Nginx combined logs or Cloudflare JSONL to see which recognizable AI bots actually appeared in your access logs.",
    summary: "Summary",
    crawlerGroups: "Crawler groups",
    operatorSummary: "Operator summary",
    botCoverageMatrix: "AI Bot Coverage Matrix",
    policyHints: "Policy and evidence notes",
    detectedEvidence: "Detected path evidence",
    recommendedNginx: "Recommended Nginx logging",
    noKnownCrawlers: "No known AI crawlers found yet.",
    noDetectedOperators: "No AI bot operators were detected in this log sample.",
    sampleDescription: "Sample log",
    textareaLabel: "Access log sample",
    missingUserAgentWarning:
      "This log does not include User-Agent values, so historical AI crawler access cannot be reconstructed. Enable User-Agent logging before collecting future evidence.",
    recommendedNginxIntro: "Use this Nginx log format to keep User-Agent evidence for future reports.",
    registryContext: "{detected} of {total} registry entries were detected from log evidence.",
    robotTokenOnlyNotice:
      "Robots-token-only entries are policy controls for robots.txt. They are not proof that a crawler visited the site.",
    docsLink: "Docs",
    morePaths: "+{count} more paths",
    metricLabels: {
      lines: "Lines",
      parsed: "Parsed",
      aiHits: "AI hits",
      groups: "Groups",
      detectedBots: "Detected bots",
      detectedOperators: "Operators",
      registryBots: "Registry bots"
    },
    fields: {
      operator: "Operator",
      bot: "Bot",
      path: "Path",
      status: "Status",
      date: "Date",
      hits: "Hits",
      intent: "Intent",
      detectability: "Detectability",
      latestDate: "Latest date",
      robotsToken: "Robots token",
      docs: "Source",
      paths: "Paths"
    },
    coverageStatuses: {
      detected: "Detected",
      not_seen: "Not seen",
      not_log_detectable: "Policy token",
      unknown_or_unverified: "Needs verification"
    },
    coverageStatusDescriptions: {
      detected: "This bot appeared in the provided logs with a recognizable User-Agent.",
      not_seen: "This bot is log-detectable, but it did not appear in the provided sample.",
      not_log_detectable:
        "This is a robots.txt policy token and should not be treated as log evidence.",
      unknown_or_unverified:
        "This rule is useful for visibility, but the source should be verified before treating absence as evidence."
    },
    intentLabels: {
      training: "Training",
      search: "Search",
      assistant: "Assistant fetch",
      preview: "Preview",
      general: "General crawl"
    },
    detectabilityLabels: {
      "log-detectable": "Log-detectable",
      "robots-token-only": "Robots token only",
      "suspected-or-community": "Suspected / community"
    },
    detectabilityDescriptions: {
      "log-detectable": "Can be detected from access logs when the User-Agent is recorded.",
      "robots-token-only": "Controls policy in robots.txt; it is not expected as a normal HTTP User-Agent.",
      "suspected-or-community": "Known from community or indirect evidence; confirm before making hard claims."
    },
    policyHintMessages: {
      "logging-user-agent":
        "User-Agent is missing, so historical AI bot access cannot be reconstructed from this log.",
      "robots-token-control":
        "{bot} is controlled through the robots.txt token {robotsToken}; show it as policy, not traffic evidence.",
      "suspected-verification":
        "{bot} is marked as suspected or community-observed. Treat hits as visibility signals and verify the source before reporting a definitive claim."
    },
    hitCount: "{count} hits",
    groupMeta: "{date} · HTTP {status}"
  },
  severity: {
    critical: "Critical",
    warning: "Warning",
    info: "Info"
  },
  findings: {
    "asset.missingLlmsTxt": {
      title: "Missing llms.txt",
      description: "AI answer engines have no dedicated summary file for your site.",
      recommendation:
        "Publish /llms.txt with a concise company summary, canonical product pages, and preferred citations."
    },
    "asset.missingSitemapXml": {
      title: "Missing sitemap.xml",
      description: "The audit could not discover a sitemap for representative page selection.",
      recommendation: "Publish /sitemap.xml and reference it from robots.txt."
    },
    "asset.missingRobotsTxt": {
      title: "Missing robots.txt",
      description: "Crawler policy is not declared at the standard location.",
      recommendation: "Publish /robots.txt with sitemap discovery and explicit AI crawler policy."
    },
    "page.badStatus": {
      title: "Page returned an error status",
      description: "{url} returned HTTP {status}.",
      recommendation: "Fix broken canonical pages or remove them from the sitemap."
    },
    "page.weakTitle": {
      title: "Weak or missing title",
      description: "AI crawlers rely on clear titles to identify page purpose.",
      recommendation: "Add a specific title that names the company, product, or page intent."
    },
    "page.missingMetaDescription": {
      title: "Missing meta description",
      description: "The page lacks a concise summary for search and AI preview contexts.",
      recommendation: "Add a descriptive meta description for each important page."
    },
    "page.h1Structure": {
      title: "H1 structure needs attention",
      description: "Expected one H1, found {h1Count}.",
      recommendation: "Use one descriptive H1 per page and reserve H2 for section structure."
    },
    "page.missingCanonical": {
      title: "Missing canonical URL",
      description: "Canonical URLs help crawlers consolidate duplicate or parameterized pages.",
      recommendation: "Add a canonical link for each indexable page."
    },
    "page.missingJsonLd": {
      title: "Missing JSON-LD schema",
      description: "Structured data is absent from this page.",
      recommendation: "Add Organization, WebSite, Article, Product, or Service schema where appropriate."
    },
    "page.lowReadableContent": {
      title: "Low readable content",
      description: "The page may not expose enough text for AI systems to summarize confidently.",
      recommendation:
        "Ensure key pages include crawlable text that explains the offer, audience, proof, and next steps."
    },
    "homepage.missingOpenGraph": {
      title: "Homepage lacks OpenGraph metadata",
      description: "Shared previews may be less consistent across answer and social surfaces.",
      recommendation: "Add OpenGraph title, description, URL, and image metadata to the homepage."
    }
  },
  errors: {
    emptyUrl: "Enter a company website URL.",
    unsupportedUrl: "Only HTTP and HTTPS URLs are supported.",
    scanFailed: "Unable to scan this website."
  }
} satisfies Dictionary;
