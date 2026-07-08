export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];
export type TranslationParams = Record<string, string | number | boolean>;
export type SeverityKey = "critical" | "warning" | "info";

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
    | "backToScanner",
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
    recommendedNginx: string;
    noKnownCrawlers: string;
    sampleDescription: string;
    textareaLabel: string;
    missingUserAgentWarning: string;
    recommendedNginxIntro: string;
    metricLabels: Record<"lines" | "parsed" | "aiHits" | "groups", string>;
    fields: Record<"operator" | "bot" | "path" | "status" | "date" | "hits", string>;
    hitCount: string;
    groupMeta: string;
  };
  severity: Record<SeverityKey, string>;
  findings: Record<string, FindingMessage>;
  errors: Record<"emptyUrl" | "unsupportedUrl" | "scanFailed", string>;
}
