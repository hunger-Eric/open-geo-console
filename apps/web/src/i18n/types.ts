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
  nav: Record<"scanner" | "logs", string>;
  actions: Record<
    | "generateReport"
    | "openSampleLogReport"
    | "uploadLogsNext"
    | "loadSample"
    | "copyLink"
    | "copiedLink"
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
    forceFreshLabel: string;
    forceFreshDescription: string;
    verifyingHuman: string;
    acceptingReport: string;
    scanProgressStarting: string;
    scanProgressSlow: string;
    scanProgressExtended: string;
    nextTitle: string;
    nextDescription: string;
  };
  capabilities: Record<"freeHomepage" | "evidenceAi" | "privateDeep", { title: string; text: string }>;
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
    findingAggregation: {
      affectedPages: string;
      representativePages: string;
      morePages: string;
      pageType: string;
      template: string;
      pageTypeLabels: Record<
        | "home"
        | "product"
        | "service"
        | "about"
        | "pricing"
        | "case-study"
        | "contact"
        | "blog"
        | "news"
        | "help"
        | "careers"
        | "legal"
        | "other",
        string
      >;
    };
    metricLabels: Record<"critical" | "warnings" | "pages" | "assets", string>;
    tableHeaders: Record<"url" | "status" | "h1" | "schema" | "text" | "links", string>;
    fields: Record<"present" | "missing" | "yes" | "no" | "error", string>;
    assetLabels: Record<"robotsTxt" | "sitemapXml" | "llmsTxt", string>;
    assetPresent: string;
    assetMissing: string;
  };
  workspace: {
    tabs: Record<"overview" | "analysis" | "issues" | "bots" | "technical", string>;
    currentSite: string;
    lastScan: string;
    submittedAt: string;
    overviewTitle: string;
    topFixes: string;
    viewIssueDetails: string;
    viewAllIssues: string;
    botEvidenceTitle: string;
    botEvidenceEmpty: string;
    botEvidenceDescription: string;
    botsObserved: string;
    operatorsObserved: string;
    latestEvidence: string;
    issuesTitle: string;
    issuesDescription: string;
    botsTitle: string;
    botsDescription: string;
    technicalTitle: string;
    technicalDescription: string;
    importTitle: string;
    importDescription: string;
    pasteLogs: string;
    analyzeAndSave: string;
    analyzing: string;
    replaceEvidence: string;
    removeEvidence: string;
    removing: string;
    localFallback: string;
    savedEvidence: string;
    removedEvidence: string;
    targetUrl: string;
    detectedBots: string;
    registry: string;
    registryDescription: string;
    noDetectedBots: string;
    advancedSimulator: string;
    advancedSimulatorDescription: string;
    sourceLines: string;
    updatedAt: string;
    fileReady: string;
    previousPage: string;
    nextPage: string;
    pageStatus: string;
    backToReport: string;
    errors: Record<"emptyLogs" | "payloadTooLarge" | "saveFailed" | "deleteFailed", string>;
  };
  aiReport: {
    title: string;
    description: string;
    previewLabel: string;
    deepLabel: string;
    homepageScore: string;
    homepageScoreDescription: string;
    homepagePreviewNotice: string;
    detectedPagesEstimate: string;
    lockedDeepFeatures: string;
    technicalScore: string;
    aiDimensions: string;
    organizationProfile: string;
    executiveSummary: string;
    topFindings: string;
    pageTypes: string;
    roadmap: string;
    coverage: string;
    evidence: string;
    confidence: string;
    unlockTitle: string;
    unlockDescription: string;
    accessKeyLabel: string;
    unlockAction: string;
    unlocking: string;
    startNewAnalysis: string;
    statusTitle: string;
    waitingDescription: string;
    retryWaitDescription: string;
    repairWaitDescription: string;
    acceptedDescription: string;
    technicalFailedDescription: string;
    completedDescription: string;
    completedLimitedDescription: string;
    failedDescription: string;
    unavailableDescription: string;
    previewUnavailableDescription: string;
    reportLanguage: string;
    reportLanguageEnglish: string;
    reportLanguageChinese: string;
    regenerateLanguage: string;
    correctionInProgress: string;
    siteTechnicalScore: string;
    queuePosition: string;
    queueJobsAhead: string;
    queueActiveJobsInPool: string;
    queueAwaitingClaim: string;
    activeTierPreview: string;
    activeTierDeep: string;
    activeTierMixed: string;
    progressValue: string;
    stageDescriptions: Record<
      "queued" | "discovering" | "planning" | "fetching" | "analyzing" | "synthesizing" | "completed" | "completed_limited" | "failed",
      string
    >;
  };
  commerce: {
    offerTitle: string;
    offerDescription: string;
    scopeEvidence: string;
    scopeFixes: string;
    scopeRoadmap: string;
    emailLabel: string;
    currencyLabel: string;
    deliveryPromise: string;
    buyAction: string;
    redirecting: string;
    verifying: string;
    unavailable: string;
    checkoutFailed: string;
    humanVerification: string;
    operatorKeySummary: string;
    paymentReturnTitle: string;
    paymentConfirming: string;
    paymentNotCompleted: string;
    paymentCancelled: string;
    paymentQueued: string;
    paymentGenerating: string;
    paymentCompleted: string;
    paymentFailed: string;
    paymentRefundPending: string;
    paymentRefunded: string;
    paymentRefundFailed: string;
    paymentStatusUnavailable: string;
    paymentRefresh: string;
    paymentRefreshStopped: string;
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
  errors: Record<
    | "emptyUrl"
    | "unsupportedUrl"
    | "scanFailed"
    | "humanVerificationRequired"
    | "freePreviewLimitReached"
    | "stagingFreePreviewLimitReached"
    | "stagingConcurrencyLimitReached"
    | "forceFreshUnavailable"
    | "deploymentConfigurationInvalid",
    string
  >;
}
