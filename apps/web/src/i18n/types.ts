export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];
export type TranslationParams = Record<string, string | number | boolean>;
export type SeverityKey = "critical" | "warning" | "info";
export type LogCoverageStatus = "detected" | "not_seen" | "not_log_detectable" | "unknown_or_unverified";
export type LogIntentKey = "training" | "search" | "assistant" | "preview" | "general";
export type LogDetectabilityKey = "log-detectable" | "robots-token-only" | "suspected-or-community";
export type LogPolicyHintType =
  | "logging-user-agent"
  | "robots-token-control"
  | "suspected-verification";

export interface FindingMessage {
  title: string;
  description: string;
  recommendation: string;
}

export interface Dictionary {
  localeName: string;
  metadata: {
    title: string;
    description: string;
  };
  nav: Record<"scanner" | "logs" | "caseStudy", string>;
  actions: Record<
    | "generateReport"
    | "openSampleLogReport"
    | "uploadLogsNext"
    | "loadSample"
    | "copyLink"
    | "copiedLink"
    | "printReport"
    | "switchToEnglish"
    | "switchToChinese"
    | "backToScanner"
    | "importLogs",
    string
  >;
  scanner: {
    title: string;
    description: string;
    urlLabel: string;
    urlPlaceholder: string;
    recentReportsTitle: string;
    emptyRecentReports: string;
    nextTitle: string;
    nextDescription: string;
    firstCaseUrl: string;
  };
  capabilities: Record<"geoAudit" | "crawlerLogs" | "selfHosted", { title: string; text: string }>;
  report: {
    title: string;
    generatedFor: string;
    scanDate: string;
    executiveSummary: string;
    scoreMeaning: string;
    scoreGood: string;
    scoreWatch: string;
    scoreRisk: string;
    topRisks: string;
    priorityFixes: string;
    evidence: string;
    machineReadableAssets: string;
    findingsAndRecommendations: string;
    auditedPages: string;
    technicalAppendix: string;
    noFindings: string;
    shareDescription: string;
    logNextTitle: string;
    logNextDescription: string;
    legacyFindingLabel: string;
    scoreLabel: string;
    scoreDescription: string;
    priorityEmpty: string;
    loadingReport: string;
    reportUnavailableTitle: string;
    reportUnavailableDescription: string;
    metricLabels: Record<"critical" | "warnings" | "pages" | "assets", string>;
    tableHeaders: Record<"url" | "status" | "h1" | "schema" | "text" | "links", string>;
    fields: Record<"present" | "missing" | "yes" | "no" | "error", string>;
    assetLabels: Record<"robotsTxt" | "sitemapXml" | "llmsTxt", string>;
    assetPresent: string;
    assetMissing: string;
  };
  logs: {
    title: string;
    description: string;
    summary: string;
    crawlerGroups: string;
    operatorSummary: string;
    botCoverageMatrix: string;
    policyHints: string;
    detectedEvidence: string;
    recommendedNginx: string;
    noKnownCrawlers: string;
    noDetectedOperators: string;
    sampleDescription: string;
    textareaLabel: string;
    missingUserAgentWarning: string;
    recommendedNginxIntro: string;
    registryContext: string;
    robotTokenOnlyNotice: string;
    docsLink: string;
    morePaths: string;
    metricLabels: Record<
      | "lines"
      | "parsed"
      | "aiHits"
      | "groups"
      | "detectedBots"
      | "detectedOperators"
      | "registryBots",
      string
    >;
    fields: Record<
      | "operator"
      | "bot"
      | "path"
      | "status"
      | "date"
      | "hits"
      | "intent"
      | "detectability"
      | "latestDate"
      | "robotsToken"
      | "docs"
      | "paths",
      string
    >;
    coverageStatuses: Record<LogCoverageStatus, string>;
    coverageStatusDescriptions: Record<LogCoverageStatus, string>;
    intentLabels: Record<LogIntentKey, string>;
    detectabilityLabels: Record<LogDetectabilityKey, string>;
    detectabilityDescriptions: Record<LogDetectabilityKey, string>;
    policyHintMessages: Record<LogPolicyHintType, string>;
    hitCount: string;
    groupMeta: string;
    simulator: {
      title: string;
      description: string;
      targetUrlLabel: string;
      runButton: string;
      runningButton: string;
      compareButton: string;
      comparingButton: string;
      attemptedTitle: string;
      attemptedDescription: string;
      comparisonTitle: string;
      comparisonDescription: string;
      observedTitle: string;
      missingTitle: string;
      noAttempts: string;
      noObserved: string;
      noMissing: string;
      pasteLogsHint: string;
      simulatedBadge: string;
      observedBadge: string;
      missingBadge: string;
      pendingBadge: string;
      generatedMeta: string;
      comparisonSummary: string;
      fields: Record<"method" | "url" | "path" | "userAgent" | "operator" | "bot", string>;
      errors: Record<"runFailed" | "matchFailed" | "emptyLogs" | "invalidRun" | "importFailed", string>;
    };
  };
  severity: Record<SeverityKey, string>;
  findings: Record<string, FindingMessage>;
  errors: Record<"emptyUrl" | "unsupportedUrl" | "scanFailed", string>;
}
