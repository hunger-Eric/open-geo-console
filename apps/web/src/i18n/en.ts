import type { Dictionary } from "./types";

export const en = {
  localeName: "English",
  metadata: {
    title: "Open GEO Console",
    description: "Open-source AI Search Console for company websites."
  },
  nav: {
    scanner: "Website analysis",
    logs: "Advanced log tool"
  },
  actions: {
    generateReport: "Generate GEO report",
    openSampleLogReport: "Open sample log report",
    uploadLogsNext: "Upload logs next",
    loadSample: "Load sample",
    copyLink: "Copy link",
    copiedLink: "Copied",
    switchToEnglish: "English",
    switchToChinese: "中文",
    backToScanner: "Back to scanner",
    importLogs: "Import log file"
  },
  scanner: {
    title: "Analyze your company website",
    description:
      "Get a free homepage check now. A private deep report analyzes the valid pages across your site with evidence-backed AI analysis.",
    urlLabel: "Company website URL",
    urlPlaceholder: "https://company.com",
    forceFreshLabel: "Force a fresh report",
    forceFreshDescription: "Staging only. Keep the current report available while a new crawl and report are generated.",
    verifyingHuman: "Verifying",
    acceptingReport: "Creating report",
    scanProgressStarting: "Creating a secure report workspace. The website analysis will continue after it opens.",
    scanProgressSlow: "Admission is taking longer than expected. Your request is still protected against duplicate submission.",
    scanProgressExtended: "The service is slow to accept this request. Keep this page open; retrying is safe and will recover the same request.",
    nextTitle: "Already have server access logs?",
    nextDescription:
      "Verify whether identifiable AI crawlers visited the site."
  },
  capabilities: {
    freeHomepage: {
      title: "Free homepage check",
      text: "See the homepage technical score and the most important verified finding."
    },
    evidenceAi: {
      title: "Evidence-backed AI analysis",
      text: "Every formal AI finding is checked against captured page evidence."
    },
    privateDeep: {
      title: "Private deep report",
      text: "Analyze valid site pages, coverage limits, dimension scores, and a 90-day roadmap."
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
    shareDescription: "Share this report using its secure HTML link.",
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
    findingAggregation: {
      affectedPages: "{count} affected pages",
      representativePages: "Representative pages",
      morePages: "+{count} more affected pages",
      pageType: "Page type: {pageType}",
      template: "Template: {template}",
      pageTypeLabels: {
        home: "Home",
        product: "Product",
        service: "Service",
        about: "About",
        pricing: "Pricing",
        "case-study": "Case study",
        contact: "Contact",
        blog: "Blog",
        news: "News",
        help: "Help",
        careers: "Careers",
        legal: "Legal",
        other: "Other"
      }
    },
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
  workspace: {
    tabs: {
      overview: "Overview",
      analysis: "AI analysis",
      issues: "Issues",
      bots: "AI Bot evidence",
      technical: "Technical"
    },
    currentSite: "Website context",
    lastScan: "Last scan",
    submittedAt: "Submitted",
    overviewTitle: "Audit overview",
    topFixes: "Highest-priority fixes",
    viewIssueDetails: "View repair guide",
    viewAllIssues: "View all issues",
    botEvidenceTitle: "AI Bot evidence",
    botEvidenceEmpty: "No access-log evidence has been added yet.",
    botEvidenceDescription: "Add logs only when you need to verify real, recognizable AI bot visits.",
    botsObserved: "Bots observed",
    operatorsObserved: "Operators observed",
    latestEvidence: "Latest evidence",
    issuesTitle: "Issues and recommendations",
    issuesDescription: "Work through findings in severity order. The score remains based on the website audit.",
    botsTitle: "AI Bot evidence",
    botsDescription: "Import access logs to add visit evidence without storing raw logs, IPs, or full paths.",
    technicalTitle: "Technical details",
    technicalDescription: "Machine-readable assets, audited pages, and implementation references.",
    importTitle: "Import access logs",
    importDescription: "Nginx combined logs and Cloudflare JSONL are supported. Raw logs are discarded after analysis.",
    pasteLogs: "Paste logs instead",
    analyzeAndSave: "Analyze and save summary",
    analyzing: "Analyzing logs",
    replaceEvidence: "Replace evidence",
    removeEvidence: "Remove evidence",
    removing: "Removing evidence",
    localFallback: "Saved in this browser because shared server storage is unavailable.",
    savedEvidence: "The sanitized evidence summary was saved.",
    removedEvidence: "The saved evidence summary was removed.",
    targetUrl: "Target website",
    detectedBots: "Detected bots",
    registry: "Full registry",
    registryDescription: "Policy-only and unseen entries are reference data, not proof of a visit.",
    noDetectedBots: "No recognizable AI bots were found in this log sample.",
    advancedSimulator: "Advanced: external crawler simulator",
    advancedSimulatorDescription: "Generate marked requests, then use imported logs to decide which attempts were observed.",
    sourceLines: "Source lines",
    updatedAt: "Updated",
    fileReady: "Ready to analyze: {name}",
    previousPage: "Previous",
    nextPage: "Next",
    pageStatus: "Page {page} of {total}",
    backToReport: "Back to report",
    errors: {
      emptyLogs: "Paste or import access logs before analyzing.",
      payloadTooLarge: "The log input exceeds the 5 MiB limit.",
      saveFailed: "The analysis completed, but the shared summary could not be saved.",
      deleteFailed: "Unable to remove the saved evidence summary."
    }
  },
  aiReport: {
    title: "Evidence-backed AI website analysis",
    description: "A real model reads selected pages, checks its conclusions against captured evidence, and builds a traceable company website report.",
    previewLabel: "Free AI preview",
    deepLabel: "Deep report",
    homepageScore: "Homepage technical score",
    homepageScoreDescription: "This score uses the submitted homepage and the standard robots.txt, sitemap.xml, and llms.txt checks. It is not a site-wide score.",
    homepagePreviewNotice: "This free preview analyzed the homepage only.",
    detectedPagesEstimate: "Approximately {count} site URLs were detected without fetching or analyzing their content.",
    lockedDeepFeatures: "Unlock the deep report for complete site findings, page evidence, dimension explanations, rewrites, and the 90-day roadmap.",
    technicalScore: "Technical score",
    aiDimensions: "AI dimension scores",
    organizationProfile: "Organization profile",
    executiveSummary: "Executive summary",
    topFindings: "Highest-impact findings",
    pageTypes: "Page-type analysis",
    roadmap: "90-day roadmap",
    coverage: "Coverage and limits",
    evidence: "Evidence",
    confidence: "Confidence",
    unlockTitle: "Unlock the deep AI report",
    unlockDescription: "Use one report credit to analyze up to 50 representative pages and reveal the complete evidence and action plan.",
    accessKeyLabel: "Report access key",
    unlockAction: "Unlock deep report",
    unlocking: "Reserving credit",
    startNewAnalysis: "Start a new analysis",
    statusTitle: "Report status",
    waitingDescription: "The report is being generated. Recoverable work is handled automatically.",
    retryWaitDescription: "A temporary issue was detected. The report will resume automatically while preserving completed work.",
    repairWaitDescription: "We are repairing a fulfillment dependency. Completed work is preserved and no action is required from you.",
    acceptedDescription: "Your request is accepted. We are checking the website and will add results here as they become available.",
    technicalFailedDescription: "The website could not be analyzed safely. You can start a new analysis with a reachable public URL.",
    completedDescription: "Report completed — {count} pages analyzed.",
    completedLimitedDescription: "Report completed — {count} valid pages analyzed. {failed} inaccessible pages were excluded, are listed in coverage limitations, and the credit was returned.",
    failedDescription: "This analysis could not be completed. The report credit has been returned. You can start a new analysis later.",
    unavailableDescription: "AI analysis has not been configured for this deployment.",
    previewUnavailableDescription: "This free AI preview was not generated, but the homepage technical report is complete and remains available.",
    reportLanguage: "Report language",
    reportLanguageEnglish: "English",
    reportLanguageChinese: "Chinese",
    regenerateLanguage: "Regenerate in {language}",
    correctionInProgress: "Regenerating the report in its intended language.",
    siteTechnicalScore: "Site technical score — based on {count} valid pages",
    queuePosition: "Queue position {position}",
    queueJobsAhead: "{count} jobs are ahead in this report lane.",
    queueActiveJobsInPool: "This report is next; the worker lane is processing another job.",
    queueAwaitingClaim: "This report is next, but no background worker has claimed it yet. It will continue automatically when a worker starts; do not resubmit.",
    activeTierPreview: "Free AI previews are currently being processed.",
    activeTierDeep: "Deep reports are currently being processed.",
    activeTierMixed: "Free previews and deep reports are currently being processed.",
    progressValue: "Report generation is {progress}% complete",
    stageDescriptions: {
      queued: "Request accepted. The background worker will start automatically.",
      discovering: "Checking URL safety and reading the submitted homepage.",
      planning: "Preparing the evidence plan for this report.",
      fetching: "Collecting readable website evidence.",
      analyzing: "Analyzing the captured evidence.",
      synthesizing: "Finalizing verified findings and recommendations.",
      completed: "The report is complete.",
      completed_limited: "The available report is complete with stated coverage limits.",
      failed: "The report could not be completed."
    }
  },
  commerce: {
    offerTitle: "Unlock the full-site AI Search Visibility Audit",
    offerDescription: "One purchase covers a private deep report for this site. The payment amount is fixed by the server-side catalog.",
    scopeEvidence: "Evidence across up to 50 representative pages",
    scopeFixes: "Prioritized fixes with page-level examples",
    scopeRoadmap: "A practical 90-day action roadmap",
    emailLabel: "Delivery email",
    currencyLabel: "Payment currency",
    deliveryPromise: "Delivered by email within 24 hours of payment or fully refunded.",
    buyAction: "Unlock full-site analysis",
    redirecting: "Opening secure checkout",
    verifying: "Verifying",
    unavailable: "Online purchase is not configured for this deployment.",
    checkoutFailed: "Secure checkout could not be opened. Please try again.",
    humanVerification: "Complete human verification to continue.",
    operatorKeySummary: "Already have a report access key?",
    paymentReturnTitle: "Payment and delivery status",
    paymentConfirming: "You are back at your report. We are waiting for the signed payment confirmation; no further action is needed.",
    paymentNotCompleted: "The checkout was closed before payment was confirmed. You can try again when you are ready.",
    paymentCancelled: "The payment was cancelled. No report entitlement was created.",
    paymentQueued: "Payment confirmed. Your private deep report is queued and will be delivered by email within 24 hours.",
    paymentGenerating: "Payment confirmed. Your private deep report is being generated.",
    paymentCompleted: "Your private deep report is complete. Check the delivery email for secure access.",
    paymentFailed: "The report could not be completed. The refund workflow is being handled automatically.",
    paymentRefundPending: "A full refund has been requested and is awaiting provider confirmation.",
    paymentRefunded: "The full refund has been confirmed.",
    paymentStatusUnavailable: "We could not load this order status for the current report.",
    paymentRefresh: "Refresh status",
    paymentRefreshStopped: "Automatic updates have paused. Refresh to check the latest verified status."
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
    textareaLabel: "Paste or import access logs",
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
    groupMeta: "{date} · HTTP {status}",
    simulator: {
      title: "External AI crawler simulator",
      description:
        "Run the simulator against the website you enter, then compare the attempted crawl requests with the logs you paste or import below.",
      targetUrlLabel: "Website URL",
      runButton: "Run simulator",
      runningButton: "Running simulator",
      compareButton: "Compare with imported logs",
      comparingButton: "Comparing logs",
      attemptedTitle: "Simulated crawl attempts",
      attemptedDescription:
        "These are generated requests only. They are not proof that an AI company visited the site.",
      comparisonTitle: "Observed in imported logs",
      comparisonDescription:
        "This comparison marks which simulated attempts also appear in the access logs currently pasted here.",
      observedTitle: "Observed",
      missingTitle: "Not observed",
      noAttempts: "Run the simulator to see attempted requests.",
      noObserved: "No simulated attempts were observed in the imported logs yet.",
      noMissing: "Every simulated attempt was observed in the imported logs.",
      pasteLogsHint: "Paste or import access logs before comparing.",
      simulatedBadge: "Simulated crawl attempt",
      observedBadge: "Observed in imported logs",
      missingBadge: "Not observed in imported logs",
      pendingBadge: "Waiting for log comparison",
      generatedMeta: "Run {runId} generated {date}",
      comparisonSummary: "{observed} observed · {missing} not observed",
      fields: {
        method: "Method",
        url: "URL",
        path: "Path",
        userAgent: "User-Agent",
        operator: "Operator",
        bot: "Bot"
      },
      errors: {
        runFailed: "Unable to run the simulator. Try again after the simulator API is available.",
        matchFailed: "Unable to compare logs with this simulator run.",
        emptyLogs: "Paste or import access logs before comparing.",
        invalidRun: "The simulator response did not include a usable run.",
        importFailed: "Unable to import this log file."
      }
    }
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
    "page.duplicateTitles": {
      title: "Multiple pages reuse the same title",
      description: "{affectedCount} pages expose the same title, reducing page-specific GEO identity.",
      recommendation:
        "Give each page a concise title that states its distinct purpose and keep only a short reusable brand identifier."
    },
    "page.dominantTitleTemplate": {
      title: "Page titles are dominated by a shared template",
      description:
        "{affectedCount} pages share a {sharedLength}-character title segment that outweighs their page-specific meaning.",
      recommendation:
        "Lead with the page's distinct purpose and reduce the repeated portion to a concise brand identifier so generative engines can select and cite the right page."
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
    scanFailed: "Unable to scan this website.",
    humanVerificationRequired: "Complete human verification before starting the diagnosis.",
    freePreviewLimitReached: "The free preview supports two different websites per network in any 24-hour period. Please try again later.",
    stagingFreePreviewLimitReached: "The protected staging Preview has reached its rolling 24-hour website limit.",
    stagingConcurrencyLimitReached: "Two staging reports are already running. Wait for one to finish and try again.",
    forceFreshUnavailable: "Forced regeneration is available only on the protected staging Preview.",
    deploymentConfigurationInvalid: "This deployment is not configured with a safe environment identity."
  }
} satisfies Dictionary;
