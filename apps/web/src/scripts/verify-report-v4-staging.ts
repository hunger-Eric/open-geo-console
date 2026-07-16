import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  parseReportV4Registry,
  type ReportV4RequirementRegistry
} from "../report-v4/conformance";

const DEFAULT_EVIDENCE_PATH = "docs/operations/evidence/report-v4-protected-staging-acceptance.json";
const REGISTRY_PATH = "config/report-contracts/combined-geo-report-v4.requirements.json";
const TEN_MINUTES_MS = 10 * 60_000;
const FIVE_MINUTES_MS = 5 * 60_000;

export interface ReportV4StagingVerificationArgs {
  readonly evidencePath: string;
}

export interface ReportV4StagingVerificationResult {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

export interface ReportV4StagingVerificationDependencies {
  readonly readText?: (absolutePath: string) => string;
  readonly isFile?: (absolutePath: string) => boolean;
  readonly workspaceRoot?: string;
}

export interface ReportV4StagingVerificationEvidence {
  readonly schemaVersion: "report_v4_protected_staging_acceptance_v2";
  readonly environment: "protected_staging";
  readonly contract: "combined_geo_report_v4";
  readonly recordedAt: string;
  readonly deployment: {
    readonly previewDeploymentId: string;
    readonly protectedAliasUrl: string;
    readonly webSourceRevision: string;
    readonly workerSourceRevision: string;
  };
  readonly identities: {
    readonly reportId: string;
    readonly orderId: string;
    readonly coreJobId: string;
    readonly enhancementJobId: string;
    readonly coreArtifactRevisionId: string;
    readonly enhancementArtifactRevisionId: string;
    readonly siteSnapshotId: string;
  };
  readonly lineage: {
    readonly configuration: {
      readonly configSnapshotId: string;
      readonly modelProfileHash: string;
      readonly reportProfileHash: string;
    };
    readonly core: {
      readonly reportId: string;
      readonly orderId: string;
      readonly jobId: string;
      readonly artifactRevisionId: string;
      readonly configSnapshotId: string;
    };
    readonly enhancement: {
      readonly reportId: string;
      readonly orderId: string;
      readonly jobId: string;
      readonly artifactRevisionId: string;
      readonly sourceArtifactRevisionId: string;
      readonly configSnapshotId: string;
    };
  };
  readonly timings: {
    readonly crawlStartedAt: string;
    readonly crawlDeadlineAt: string;
    readonly crawlCompletedAt: string;
    readonly paymentConfirmedAt: string;
    readonly coreActivatedAt: string;
    readonly enhancementStartedAt: string;
    readonly enhancementCompletedAt: string;
  };
  readonly crawl: {
    readonly siteSnapshotId: string;
    readonly runs: 1;
    readonly candidatePages: number;
    readonly analyzablePages: number;
    readonly jsDependentPages: number;
    readonly excludedPages: number;
    readonly rawReads: number;
    readonly browserReads: number;
    readonly browserFallbacks: number;
    readonly networkReadsAfterPayment: 0;
    readonly reusedSnapshotAfterPayment: true;
  };
  readonly providerCalls: {
    readonly pageAnalysis: { readonly calls: number; readonly retries: 0; readonly retryPolicy: "none" };
    readonly websiteSynthesis: 1;
    readonly questions: readonly ProviderAttempt[];
    readonly diagnoses: readonly ProviderAttempt[];
    readonly total: number;
  };
  readonly tokenBudgetRejection: {
    readonly operation: "page_analysis";
    readonly oversizedSmallestUnit: true;
    readonly rejectedBeforeProvider: true;
    readonly providerCallDelta: 0;
    readonly retryDelta: 0;
  };
  readonly customerHtml: {
    readonly promptLeakCount: 0;
    readonly rawProviderPayloadLeakCount: 0;
    readonly internalWorkflowTermCount: 0;
    readonly seoFramingCount: 0;
  };
  readonly sources: {
    readonly questions: readonly { readonly questionId: string; readonly displayedSourceCount: number }[];
    readonly independentReadFailure: {
      readonly questionId: string;
      readonly sourceId: string;
      readonly readStatus: "inaccessible";
      readonly answerPreserved: true;
      readonly linkPreserved: true;
    };
  };
  readonly delivery: {
    readonly customerFormats: readonly ["html"];
    readonly coreHtmlAssemblies: 1;
    readonly enhancementHtmlAssemblies: 1;
    readonly pdfOperations: 0;
  };
  readonly mainline: {
    readonly wholeReportReruns: 0;
    readonly providerClaimCalls: 0;
    readonly qualificationCalls: 0;
    readonly fourSnapshotCalls: 0;
    readonly replacementFulfillmentCalls: 0;
  };
  readonly diagnosisFailure: DiagnosisFailureEvidence;
  readonly questionFailure: QuestionFailureEvidence;
  readonly commerce: CommerceEvidence;
  readonly browser: BrowserEvidence;
  readonly legacy: {
    readonly v1Readable: true;
    readonly v2Readable: true;
    readonly v3Readable: true;
    readonly historicalPdfReadable: true;
    readonly historicalPdfMutationCount: 0;
  };
  readonly productionUnchanged: true;
  readonly requirementResults: readonly RequirementResult[];
}

interface ProviderAttempt {
  readonly questionId: string;
  readonly calls: 1 | 2;
  readonly retries: 0 | 1;
  readonly status: "completed";
}

interface RequirementResult {
  readonly requirementId: string;
  readonly status: "PASS";
  readonly verificationCommands: readonly { readonly command: string; readonly exitCode: 0 }[];
}

interface DiagnosisFailureEvidence {
  readonly injected: true;
  readonly identities: {
    readonly reportId: string;
    readonly orderId: string;
    readonly coreJobId: string;
    readonly coreArtifactRevisionId: string;
  };
  readonly coreArtifactRevisionIdBefore: string;
  readonly coreArtifactRevisionIdAfter: string;
  readonly coreRemainedActive: true;
  readonly answerUnchanged: true;
  readonly accessUnchanged: true;
  readonly commerceSideEffectsDelta: {
    readonly payments: 0;
    readonly credits: 0;
    readonly refunds: 0;
    readonly emails: 0;
    readonly accessGrants: 0;
  };
}

interface CommerceEvidence {
  readonly paymentCount: 1;
  readonly coreJobCount: 1;
  readonly enhancementJobCount: 1;
  readonly creditBoundJobCount: 1;
  readonly enhancementCreditCount: 0;
  readonly creditReservationCount: 1;
  readonly creditSettlementCount: 1;
  readonly accessGrantCount: 1;
  readonly paymentConfirmationEmailCount: 1;
  readonly coreReportReadyEmailCount: 1;
  readonly enhancementSideEffects: ZeroCommerceSideEffects;
  readonly refundCount: 0;
  readonly duplicatePaymentCount: 0;
  readonly duplicateCreditCount: 0;
  readonly duplicateAccessGrantCount: 0;
  readonly duplicateEmailCount: 0;
  readonly duplicateRefundCount: 0;
  readonly auditExitCode: 0;
}

interface ZeroCommerceSideEffects {
  readonly payments: 0;
  readonly credits: 0;
  readonly refunds: 0;
  readonly emails: 0;
  readonly accessGrants: 0;
}

type QuestionFailureResult =
  | {
      readonly questionId: string;
      readonly status: "answered";
      readonly calls: 1 | 2;
      readonly retries: 0 | 1;
      readonly answerCheckpointUnchanged: true;
      readonly sourceCheckpointUnchanged: true;
    }
  | {
      readonly questionId: string;
      readonly status: "unavailable";
      readonly calls: 2;
      readonly retries: 1;
      readonly terminalFailureRecorded: true;
    };

interface QuestionFailureEvidence {
  readonly injected: true;
  readonly identities: {
    readonly reportId: string;
    readonly orderId: string;
    readonly coreJobId: string;
    readonly coreArtifactRevisionId: string;
  };
  readonly questions: readonly QuestionFailureResult[];
  readonly totalQuestionCalls: number;
  readonly coreStatus: "completed_limited";
  readonly coreDelivered: true;
  readonly wholeReportReruns: 0;
  readonly commerce: {
    readonly paymentCount: 1;
    readonly creditSettlementCount: 1;
    readonly accessGrantCount: 1;
    readonly coreReportReadyEmailCount: 1;
    readonly refundCount: 0;
    readonly duplicateSideEffectCount: 0;
  };
  readonly accessStateValid: true;
}

interface AuthorizedBrowserEvidence {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly statusCode: 200;
  readonly reportVisible: true;
  readonly noHorizontalOverflow: true;
  readonly relevantConsoleErrorCount: 0;
  readonly screenshotEvidenceRef: string;
}

interface BrowserEvidence {
  readonly authorizedDesktop: AuthorizedBrowserEvidence;
  readonly authorizedNarrow: AuthorizedBrowserEvidence;
  readonly anonymous: { readonly statusCode: 404; readonly reportVisible: false };
  readonly wrongScope: { readonly statusCode: 404; readonly reportVisible: false };
}

export function parseReportV4StagingVerificationArgs(argv: readonly string[]): ReportV4StagingVerificationArgs {
  if (argv.length === 0) return { evidencePath: DEFAULT_EVIDENCE_PATH };
  if (argv.length !== 2 || argv[0] !== "--evidence") {
    throw new TypeError("Usage: report:v4:staging:verify [--evidence <workspace-relative-json-path>].");
  }
  return { evidencePath: workspacePath(argv[1], "--evidence") };
}

export function verifyReportV4StagingEvidence(
  value: unknown,
  registryValue: unknown
): ReportV4StagingVerificationEvidence {
  const registry = parseReportV4Registry(registryValue);
  const input = strictRecord(value, "protected-Staging verification evidence", [
    "schemaVersion", "environment", "contract", "recordedAt", "deployment", "identities", "lineage", "timings", "crawl",
    "providerCalls", "tokenBudgetRejection", "customerHtml", "sources", "delivery", "mainline",
    "diagnosisFailure", "questionFailure", "commerce", "browser", "legacy", "productionUnchanged", "requirementResults"
  ]);
  const deployment = parseDeployment(input.deployment);
  const identities = parseIdentities(input.identities);
  const lineage = parseLineage(input.lineage, identities);
  const timings = parseTimings(input.timings, input.recordedAt);
  const crawl = parseCrawl(input.crawl, identities.siteSnapshotId);
  const providerCalls = parseProviderCalls(input.providerCalls, crawl.analyzablePages);
  const tokenBudgetRejection = parseTokenBudgetRejection(input.tokenBudgetRejection);
  const customerHtml = parseCustomerHtml(input.customerHtml);
  const sources = parseSources(input.sources, providerCalls.questions.map(({ questionId }) => questionId));
  const delivery = parseDelivery(input.delivery);
  const mainline = parseMainline(input.mainline);
  const diagnosisFailure = parseDiagnosisFailure(input.diagnosisFailure, identities);
  const questionFailure = parseQuestionFailure(input.questionFailure, identities, diagnosisFailure.identities);
  const commerce = parseCommerce(input.commerce);
  const browser = parseBrowser(input.browser);
  const legacy = parseLegacy(input.legacy);
  const requirementResults = parseRequirementResults(input.requirementResults, registry);

  return {
    schemaVersion: literal(input.schemaVersion, "report_v4_protected_staging_acceptance_v2", "schemaVersion"),
    environment: literal(input.environment, "protected_staging", "environment"),
    contract: literal(input.contract, "combined_geo_report_v4", "contract"),
    recordedAt: isoTimestamp(input.recordedAt, "recordedAt").value,
    deployment,
    identities,
    lineage,
    timings,
    crawl,
    providerCalls,
    tokenBudgetRejection,
    customerHtml,
    sources,
    delivery,
    mainline,
    diagnosisFailure,
    questionFailure,
    commerce,
    browser,
    legacy,
    productionUnchanged: literal(input.productionUnchanged, true, "productionUnchanged"),
    requirementResults
  };
}

export function runReportV4StagingVerification(
  argv: readonly string[],
  overrides: ReportV4StagingVerificationDependencies = {}
): ReportV4StagingVerificationResult {
  const workspaceRoot = overrides.workspaceRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const readText = overrides.readText ?? ((path: string) => readFileSync(path, "utf8"));
  const isFile = overrides.isFile ?? ((path: string) => statSync(path).isFile());
  try {
    const args = parseReportV4StagingVerificationArgs(argv);
    const evidencePath = resolve(workspaceRoot, args.evidencePath);
    const registry = JSON.parse(readText(resolve(workspaceRoot, REGISTRY_PATH))) as unknown;
    const evidence = verifyReportV4StagingEvidence(JSON.parse(readText(evidencePath)) as unknown, registry);
    for (const [viewport, ref] of [
      ["desktop", evidence.browser.authorizedDesktop.screenshotEvidenceRef],
      ["narrow", evidence.browser.authorizedNarrow.screenshotEvidenceRef]
    ] as const) {
      if (!isFile(resolve(workspaceRoot, ref))) {
        throw new TypeError(`Missing ${viewport} screenshot evidence file ${ref}.`);
      }
    }
    return {
      exitCode: 0,
      output: `Report V4 protected-Staging verification passed for ${evidence.identities.reportId}; ${evidence.requirementResults.length} requirements proven.\n`
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `Report V4 protected-Staging verification failed: ${error instanceof Error ? error.message : String(error)}\n`
    };
  }
}

function parseDeployment(value: unknown): ReportV4StagingVerificationEvidence["deployment"] {
  const input = strictRecord(value, "deployment", [
    "previewDeploymentId", "protectedAliasUrl", "webSourceRevision", "workerSourceRevision"
  ]);
  const result = {
    previewDeploymentId: nonblank(input.previewDeploymentId, "deployment.previewDeploymentId"),
    protectedAliasUrl: httpsUrl(input.protectedAliasUrl, "deployment.protectedAliasUrl"),
    webSourceRevision: sourceRevision(input.webSourceRevision, "deployment.webSourceRevision"),
    workerSourceRevision: sourceRevision(input.workerSourceRevision, "deployment.workerSourceRevision")
  };
  if (result.webSourceRevision !== result.workerSourceRevision) {
    throw new TypeError("deployment Web and Worker source revisions must match.");
  }
  return result;
}

function parseIdentities(value: unknown): ReportV4StagingVerificationEvidence["identities"] {
  const input = strictRecord(value, "identities", [
    "reportId", "orderId", "coreJobId", "enhancementJobId", "coreArtifactRevisionId",
    "enhancementArtifactRevisionId", "siteSnapshotId"
  ]);
  const result = {
    reportId: uuid(input.reportId, "identities.reportId"),
    orderId: uuid(input.orderId, "identities.orderId"),
    coreJobId: uuid(input.coreJobId, "identities.coreJobId"),
    enhancementJobId: uuid(input.enhancementJobId, "identities.enhancementJobId"),
    coreArtifactRevisionId: uuid(input.coreArtifactRevisionId, "identities.coreArtifactRevisionId"),
    enhancementArtifactRevisionId: uuid(input.enhancementArtifactRevisionId, "identities.enhancementArtifactRevisionId"),
    siteSnapshotId: reportV4SiteSnapshotId(input.siteSnapshotId, "identities.siteSnapshotId")
  };
  if (new Set(Object.values(result)).size !== Object.keys(result).length) {
    throw new TypeError("identities must contain seven distinct UUIDs.");
  }
  return result;
}

function parseLineage(
  value: unknown,
  identities: ReportV4StagingVerificationEvidence["identities"]
): ReportV4StagingVerificationEvidence["lineage"] {
  const input = strictRecord(value, "lineage", ["configuration", "core", "enhancement"]);
  const configurationInput = strictRecord(input.configuration, "lineage.configuration", [
    "configSnapshotId", "modelProfileHash", "reportProfileHash"
  ]);
  const configuration = {
    configSnapshotId: configurationSnapshotId(
      configurationInput.configSnapshotId,
      "lineage.configuration.configSnapshotId"
    ),
    modelProfileHash: sha256(configurationInput.modelProfileHash, "lineage.configuration.modelProfileHash"),
    reportProfileHash: sha256(configurationInput.reportProfileHash, "lineage.configuration.reportProfileHash")
  };
  const coreInput = strictRecord(input.core, "lineage.core", [
    "reportId", "orderId", "jobId", "artifactRevisionId", "configSnapshotId"
  ]);
  const enhancementInput = strictRecord(input.enhancement, "lineage.enhancement", [
    "reportId", "orderId", "jobId", "artifactRevisionId", "sourceArtifactRevisionId", "configSnapshotId"
  ]);
  const core = {
    reportId: uuid(coreInput.reportId, "lineage.core.reportId"),
    orderId: uuid(coreInput.orderId, "lineage.core.orderId"),
    jobId: uuid(coreInput.jobId, "lineage.core.jobId"),
    artifactRevisionId: uuid(coreInput.artifactRevisionId, "lineage.core.artifactRevisionId"),
    configSnapshotId: configurationSnapshotId(coreInput.configSnapshotId, "lineage.core.configSnapshotId")
  };
  const enhancement = {
    reportId: uuid(enhancementInput.reportId, "lineage.enhancement.reportId"),
    orderId: uuid(enhancementInput.orderId, "lineage.enhancement.orderId"),
    jobId: uuid(enhancementInput.jobId, "lineage.enhancement.jobId"),
    artifactRevisionId: uuid(enhancementInput.artifactRevisionId, "lineage.enhancement.artifactRevisionId"),
    sourceArtifactRevisionId: uuid(
      enhancementInput.sourceArtifactRevisionId,
      "lineage.enhancement.sourceArtifactRevisionId"
    ),
    configSnapshotId: configurationSnapshotId(
      enhancementInput.configSnapshotId,
      "lineage.enhancement.configSnapshotId"
    )
  };
  const expectedCore = [
    identities.reportId, identities.orderId, identities.coreJobId, identities.coreArtifactRevisionId,
    configuration.configSnapshotId
  ];
  const actualCore = [core.reportId, core.orderId, core.jobId, core.artifactRevisionId, core.configSnapshotId];
  const expectedEnhancement = [
    identities.reportId, identities.orderId, identities.enhancementJobId,
    identities.enhancementArtifactRevisionId, identities.coreArtifactRevisionId, configuration.configSnapshotId
  ];
  const actualEnhancement = [
    enhancement.reportId, enhancement.orderId, enhancement.jobId,
    enhancement.artifactRevisionId, enhancement.sourceArtifactRevisionId, enhancement.configSnapshotId
  ];
  if (actualCore.some((item, index) => item !== expectedCore[index])
    || actualEnhancement.some((item, index) => item !== expectedEnhancement[index])) {
    throw new TypeError("core and enhancement lineage must exactly match the declared report/order/job/revision identities.");
  }
  return { configuration, core, enhancement };
}

function parseTimings(value: unknown, recordedAtValue: unknown): ReportV4StagingVerificationEvidence["timings"] {
  const input = strictRecord(value, "timings", [
    "crawlStartedAt", "crawlDeadlineAt", "crawlCompletedAt", "paymentConfirmedAt", "coreActivatedAt",
    "enhancementStartedAt", "enhancementCompletedAt"
  ]);
  const parsed = {
    crawlStartedAt: isoTimestamp(input.crawlStartedAt, "timings.crawlStartedAt"),
    crawlDeadlineAt: isoTimestamp(input.crawlDeadlineAt, "timings.crawlDeadlineAt"),
    crawlCompletedAt: isoTimestamp(input.crawlCompletedAt, "timings.crawlCompletedAt"),
    paymentConfirmedAt: isoTimestamp(input.paymentConfirmedAt, "timings.paymentConfirmedAt"),
    coreActivatedAt: isoTimestamp(input.coreActivatedAt, "timings.coreActivatedAt"),
    enhancementStartedAt: isoTimestamp(input.enhancementStartedAt, "timings.enhancementStartedAt"),
    enhancementCompletedAt: isoTimestamp(input.enhancementCompletedAt, "timings.enhancementCompletedAt")
  };
  const recordedAt = isoTimestamp(recordedAtValue, "recordedAt");
  if (parsed.crawlDeadlineAt.epochMs !== parsed.crawlStartedAt.epochMs + TEN_MINUTES_MS
    || parsed.crawlCompletedAt.epochMs > parsed.crawlDeadlineAt.epochMs) {
    throw new TypeError("site crawl must use and complete within one 10 minutes deadline.");
  }
  const ordered = [
    parsed.crawlStartedAt, parsed.crawlCompletedAt, parsed.paymentConfirmedAt, parsed.coreActivatedAt,
    parsed.enhancementStartedAt, parsed.enhancementCompletedAt, recordedAt
  ];
  if (ordered.some((item, index) => index > 0 && item.epochMs < ordered[index - 1]!.epochMs)) {
    throw new TypeError("timings must keep crawl, payment, core-before-enhancement, and recordedAt in execution order.");
  }
  if (parsed.coreActivatedAt.epochMs - parsed.paymentConfirmedAt.epochMs > FIVE_MINUTES_MS) {
    throw new TypeError("core HTML must activate within 5 minutes after payment.");
  }
  if (parsed.enhancementCompletedAt.epochMs - parsed.coreActivatedAt.epochMs > TEN_MINUTES_MS) {
    throw new TypeError("enhancement must complete within 10 minutes after core activation.");
  }
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, item.value])) as unknown as ReportV4StagingVerificationEvidence["timings"];
}

function parseCrawl(
  value: unknown,
  expectedSnapshotId: string
): ReportV4StagingVerificationEvidence["crawl"] {
  const input = strictRecord(value, "crawl", [
    "siteSnapshotId", "runs", "candidatePages", "analyzablePages", "jsDependentPages", "excludedPages",
    "rawReads", "browserReads", "browserFallbacks", "networkReadsAfterPayment", "reusedSnapshotAfterPayment"
  ]);
  const result = {
    siteSnapshotId: reportV4SiteSnapshotId(input.siteSnapshotId, "crawl.siteSnapshotId"),
    runs: literal(input.runs, 1, "crawl.runs"),
    candidatePages: integer(input.candidatePages, "crawl.candidatePages", 1, Number.MAX_SAFE_INTEGER),
    analyzablePages: integer(input.analyzablePages, "crawl.analyzablePages", 1, 50),
    jsDependentPages: integer(input.jsDependentPages, "crawl.jsDependentPages", 0, 50),
    excludedPages: integer(input.excludedPages, "crawl.excludedPages", 0, Number.MAX_SAFE_INTEGER),
    rawReads: integer(input.rawReads, "crawl.rawReads", 1, Number.MAX_SAFE_INTEGER),
    browserReads: integer(input.browserReads, "crawl.browserReads", 0, Number.MAX_SAFE_INTEGER),
    browserFallbacks: integer(input.browserFallbacks, "crawl.browserFallbacks", 0, Number.MAX_SAFE_INTEGER),
    networkReadsAfterPayment: literal(input.networkReadsAfterPayment, 0, "crawl.networkReadsAfterPayment"),
    reusedSnapshotAfterPayment: literal(input.reusedSnapshotAfterPayment, true, "crawl.reusedSnapshotAfterPayment")
  };
  if (result.siteSnapshotId !== expectedSnapshotId) throw new TypeError("crawl.siteSnapshotId must match identities.siteSnapshotId.");
  if (result.candidatePages !== result.analyzablePages + result.excludedPages) {
    throw new TypeError("crawl.candidatePages must exactly equal analyzablePages plus excludedPages at terminal evidence.");
  }
  if (result.jsDependentPages > result.analyzablePages || result.rawReads < result.analyzablePages
    || result.rawReads > result.candidatePages || result.browserReads > result.rawReads
    || result.browserFallbacks !== result.browserReads || result.browserReads < result.jsDependentPages) {
    throw new TypeError("crawl counts and raw/browser read modes are inconsistent or out of bounds.");
  }
  return result;
}

function parseProviderCalls(
  value: unknown,
  analyzablePages: number
): ReportV4StagingVerificationEvidence["providerCalls"] {
  const input = strictRecord(value, "providerCalls", [
    "pageAnalysis", "websiteSynthesis", "questions", "diagnoses", "total"
  ]);
  const pageAnalysisInput = strictRecord(input.pageAnalysis, "providerCalls.pageAnalysis", [
    "calls", "retries", "retryPolicy"
  ]);
  const pageAnalysis = {
    calls: integer(pageAnalysisInput.calls, "providerCalls.pageAnalysis.calls", 1, 50),
    retries: literal(pageAnalysisInput.retries, 0, "providerCalls.pageAnalysis.retries"),
    retryPolicy: literal(pageAnalysisInput.retryPolicy, "none", "providerCalls.pageAnalysis.retryPolicy")
  };
  if (pageAnalysis.calls !== analyzablePages) {
    throw new TypeError("providerCalls.pageAnalysis.calls must exactly equal crawl.analyzablePages.");
  }
  const questions = attempts(input.questions, "providerCalls.questions");
  const diagnoses = attempts(input.diagnoses, "providerCalls.diagnoses");
  const questionIds = questions.map(({ questionId }) => questionId).sort();
  const diagnosisIds = diagnoses.map(({ questionId }) => questionId).sort();
  if (questionIds.some((id, index) => id !== diagnosisIds[index])) {
    throw new TypeError("providerCalls questions and diagnoses must cover the same three question IDs.");
  }
  const websiteSynthesis = literal(input.websiteSynthesis, 1, "providerCalls.websiteSynthesis");
  const expectedTotal = pageAnalysis.calls + websiteSynthesis
    + questions.reduce((total, item) => total + item.calls, 0)
    + diagnoses.reduce((total, item) => total + item.calls, 0);
  const total = integer(input.total, "providerCalls.total", 8, 63);
  if (total !== expectedTotal) throw new TypeError("providerCalls.total must equal bounded website, question, and diagnosis calls.");
  return { pageAnalysis, websiteSynthesis, questions, diagnoses, total };
}

function attempts(value: unknown, label: string): ProviderAttempt[] {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must contain exactly three questions.`);
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const input = strictRecord(entry, itemLabel, ["questionId", "calls", "retries", "status"]);
    const questionId = nonblank(input.questionId, `${itemLabel}.questionId`);
    if (ids.has(questionId)) throw new TypeError(`${label} contains duplicate questionId ${questionId}.`);
    ids.add(questionId);
    const calls = integer(input.calls, `${itemLabel}.calls`, 1, 2) as 1 | 2;
    const retries = integer(input.retries, `${itemLabel}.retries`, 0, 1) as 0 | 1;
    if (calls !== 1 + retries) throw new TypeError(`${itemLabel}.calls must equal one baseline call plus bounded retries.`);
    return { questionId, calls, retries, status: literal(input.status, "completed", `${itemLabel}.status`) };
  });
}

function parseTokenBudgetRejection(
  value: unknown
): ReportV4StagingVerificationEvidence["tokenBudgetRejection"] {
  const input = strictRecord(value, "tokenBudgetRejection", [
    "operation", "oversizedSmallestUnit", "rejectedBeforeProvider", "providerCallDelta", "retryDelta"
  ]);
  return {
    operation: literal(input.operation, "page_analysis", "tokenBudgetRejection.operation"),
    oversizedSmallestUnit: literal(
      input.oversizedSmallestUnit,
      true,
      "tokenBudgetRejection.oversizedSmallestUnit"
    ),
    rejectedBeforeProvider: literal(
      input.rejectedBeforeProvider,
      true,
      "tokenBudgetRejection.rejectedBeforeProvider"
    ),
    providerCallDelta: literal(input.providerCallDelta, 0, "tokenBudgetRejection.providerCallDelta"),
    retryDelta: literal(input.retryDelta, 0, "tokenBudgetRejection.retryDelta")
  };
}

function parseCustomerHtml(value: unknown): ReportV4StagingVerificationEvidence["customerHtml"] {
  const input = strictRecord(value, "customerHtml", [
    "promptLeakCount", "rawProviderPayloadLeakCount", "internalWorkflowTermCount", "seoFramingCount"
  ]);
  return {
    promptLeakCount: literal(input.promptLeakCount, 0, "customerHtml.promptLeakCount"),
    rawProviderPayloadLeakCount: literal(
      input.rawProviderPayloadLeakCount,
      0,
      "customerHtml.rawProviderPayloadLeakCount"
    ),
    internalWorkflowTermCount: literal(
      input.internalWorkflowTermCount,
      0,
      "customerHtml.internalWorkflowTermCount"
    ),
    seoFramingCount: literal(input.seoFramingCount, 0, "customerHtml.seoFramingCount")
  };
}

function parseSources(
  value: unknown,
  providerQuestionIds: readonly string[]
): ReportV4StagingVerificationEvidence["sources"] {
  const input = strictRecord(value, "sources", ["questions", "independentReadFailure"]);
  if (!Array.isArray(input.questions) || input.questions.length !== 3) {
    throw new TypeError("sources.questions must contain exactly three questions.");
  }
  const ids = new Set<string>();
  const questions = input.questions.map((entry, index) => {
    const label = `sources.questions[${index}]`;
    const question = strictRecord(entry, label, ["questionId", "displayedSourceCount"]);
    const questionId = nonblank(question.questionId, `${label}.questionId`);
    if (ids.has(questionId)) throw new TypeError(`sources.questions contains duplicate questionId ${questionId}.`);
    ids.add(questionId);
    return {
      questionId,
      displayedSourceCount: integer(question.displayedSourceCount, `${label}.displayedSourceCount`, 0, 5)
    };
  });
  const expectedIds = [...providerQuestionIds].sort();
  const actualIds = questions.map(({ questionId }) => questionId).sort();
  if (expectedIds.some((id, index) => id !== actualIds[index])) {
    throw new TypeError("sources.questions must exactly match the provider question IDs.");
  }
  const failureInput = strictRecord(input.independentReadFailure, "sources.independentReadFailure", [
    "questionId", "sourceId", "readStatus", "answerPreserved", "linkPreserved"
  ]);
  const questionId = nonblank(failureInput.questionId, "sources.independentReadFailure.questionId");
  if (!ids.has(questionId)) throw new TypeError("sources.independentReadFailure.questionId must identify a report question.");
  return {
    questions,
    independentReadFailure: {
      questionId,
      sourceId: nonblank(failureInput.sourceId, "sources.independentReadFailure.sourceId"),
      readStatus: literal(failureInput.readStatus, "inaccessible", "sources.independentReadFailure.readStatus"),
      answerPreserved: literal(
        failureInput.answerPreserved,
        true,
        "sources.independentReadFailure.answerPreserved"
      ),
      linkPreserved: literal(failureInput.linkPreserved, true, "sources.independentReadFailure.linkPreserved")
    }
  };
}

function parseDelivery(value: unknown): ReportV4StagingVerificationEvidence["delivery"] {
  const input = strictRecord(value, "delivery", [
    "customerFormats", "coreHtmlAssemblies", "enhancementHtmlAssemblies", "pdfOperations"
  ]);
  if (!Array.isArray(input.customerFormats) || input.customerFormats.length !== 1 || input.customerFormats[0] !== "html") {
    throw new TypeError("delivery.customerFormats must contain only html.");
  }
  return {
    customerFormats: ["html"],
    coreHtmlAssemblies: literal(input.coreHtmlAssemblies, 1, "delivery.coreHtmlAssemblies"),
    enhancementHtmlAssemblies: literal(input.enhancementHtmlAssemblies, 1, "delivery.enhancementHtmlAssemblies"),
    pdfOperations: literal(input.pdfOperations, 0, "delivery.pdfOperations")
  };
}

function parseMainline(value: unknown): ReportV4StagingVerificationEvidence["mainline"] {
  const input = strictRecord(value, "mainline", [
    "wholeReportReruns", "providerClaimCalls", "qualificationCalls", "fourSnapshotCalls", "replacementFulfillmentCalls"
  ]);
  return {
    wholeReportReruns: literal(input.wholeReportReruns, 0, "mainline.wholeReportReruns"),
    providerClaimCalls: literal(input.providerClaimCalls, 0, "mainline.providerClaimCalls"),
    qualificationCalls: literal(input.qualificationCalls, 0, "mainline.qualificationCalls"),
    fourSnapshotCalls: literal(input.fourSnapshotCalls, 0, "mainline.fourSnapshotCalls"),
    replacementFulfillmentCalls: literal(
      input.replacementFulfillmentCalls,
      0,
      "mainline.replacementFulfillmentCalls"
    )
  };
}

function parseDiagnosisFailure(
  value: unknown,
  successfulIdentities: ReportV4StagingVerificationEvidence["identities"]
): DiagnosisFailureEvidence {
  const input = strictRecord(value, "diagnosisFailure", [
    "injected", "identities", "coreArtifactRevisionIdBefore", "coreArtifactRevisionIdAfter", "coreRemainedActive",
    "answerUnchanged", "accessUnchanged", "commerceSideEffectsDelta"
  ]);
  const identitiesInput = strictRecord(input.identities, "diagnosisFailure.identities", [
    "reportId", "orderId", "coreJobId", "coreArtifactRevisionId"
  ]);
  const identities = {
    reportId: uuid(identitiesInput.reportId, "diagnosisFailure.identities.reportId"),
    orderId: uuid(identitiesInput.orderId, "diagnosisFailure.identities.orderId"),
    coreJobId: uuid(identitiesInput.coreJobId, "diagnosisFailure.identities.coreJobId"),
    coreArtifactRevisionId: uuid(
      identitiesInput.coreArtifactRevisionId,
      "diagnosisFailure.identities.coreArtifactRevisionId"
    )
  };
  if (new Set(Object.values(identities)).size !== 4
    || Object.values(identities).some((id) => Object.values(successfulIdentities).includes(id))) {
    throw new TypeError("diagnosisFailure identities must be distinct from each other and the successful run.");
  }
  const sideEffectsInput = strictRecord(input.commerceSideEffectsDelta, "diagnosisFailure.commerceSideEffectsDelta", [
    "payments", "credits", "refunds", "emails", "accessGrants"
  ]);
  const before = uuid(input.coreArtifactRevisionIdBefore, "diagnosisFailure.coreArtifactRevisionIdBefore");
  const after = uuid(input.coreArtifactRevisionIdAfter, "diagnosisFailure.coreArtifactRevisionIdAfter");
  if (before !== identities.coreArtifactRevisionId || after !== identities.coreArtifactRevisionId) {
    throw new TypeError("diagnosisFailure must preserve the exact active core artifact revision before and after failure.");
  }
  return {
    injected: literal(input.injected, true, "diagnosisFailure.injected"),
    identities,
    coreArtifactRevisionIdBefore: before,
    coreArtifactRevisionIdAfter: after,
    coreRemainedActive: literal(input.coreRemainedActive, true, "diagnosisFailure.coreRemainedActive"),
    answerUnchanged: literal(input.answerUnchanged, true, "diagnosisFailure.answerUnchanged"),
    accessUnchanged: literal(input.accessUnchanged, true, "diagnosisFailure.accessUnchanged"),
    commerceSideEffectsDelta: {
      payments: literal(sideEffectsInput.payments, 0, "diagnosisFailure.commerceSideEffectsDelta.payments"),
      credits: literal(sideEffectsInput.credits, 0, "diagnosisFailure.commerceSideEffectsDelta.credits"),
      refunds: literal(sideEffectsInput.refunds, 0, "diagnosisFailure.commerceSideEffectsDelta.refunds"),
      emails: literal(sideEffectsInput.emails, 0, "diagnosisFailure.commerceSideEffectsDelta.emails"),
      accessGrants: literal(sideEffectsInput.accessGrants, 0, "diagnosisFailure.commerceSideEffectsDelta.accessGrants")
    }
  };
}

function parseQuestionFailure(
  value: unknown,
  successfulIdentities: ReportV4StagingVerificationEvidence["identities"],
  diagnosisIdentities: DiagnosisFailureEvidence["identities"]
): QuestionFailureEvidence {
  const input = strictRecord(value, "questionFailure", [
    "injected", "identities", "questions", "totalQuestionCalls", "coreStatus", "coreDelivered",
    "wholeReportReruns", "commerce", "accessStateValid"
  ]);
  const identitiesInput = strictRecord(input.identities, "questionFailure.identities", [
    "reportId", "orderId", "coreJobId", "coreArtifactRevisionId"
  ]);
  const identities = {
    reportId: uuid(identitiesInput.reportId, "questionFailure.identities.reportId"),
    orderId: uuid(identitiesInput.orderId, "questionFailure.identities.orderId"),
    coreJobId: uuid(identitiesInput.coreJobId, "questionFailure.identities.coreJobId"),
    coreArtifactRevisionId: uuid(
      identitiesInput.coreArtifactRevisionId,
      "questionFailure.identities.coreArtifactRevisionId"
    )
  };
  const forbiddenIds = new Set([...Object.values(successfulIdentities), ...Object.values(diagnosisIdentities)]);
  if (new Set(Object.values(identities)).size !== 4 || Object.values(identities).some((id) => forbiddenIds.has(id))) {
    throw new TypeError("questionFailure identities must be distinct from the successful and diagnosis-failure runs.");
  }
  if (!Array.isArray(input.questions) || input.questions.length !== 3) {
    throw new TypeError("questionFailure.questions must contain exactly three questions.");
  }
  const questionIds = new Set<string>();
  const questions: QuestionFailureResult[] = input.questions.map((entry, index) => {
    const label = `questionFailure.questions[${index}]`;
    const base = strictRecord(entry, label, Object.prototype.hasOwnProperty.call(record(entry, label), "terminalFailureRecorded")
      ? ["questionId", "status", "calls", "retries", "terminalFailureRecorded"]
      : ["questionId", "status", "calls", "retries", "answerCheckpointUnchanged", "sourceCheckpointUnchanged"]);
    const questionId = nonblank(base.questionId, `${label}.questionId`);
    if (questionIds.has(questionId)) throw new TypeError(`questionFailure contains duplicate questionId ${questionId}.`);
    questionIds.add(questionId);
    if (base.status === "unavailable") {
      return {
        questionId,
        status: literal(base.status, "unavailable", `${label}.status`),
        calls: literal(base.calls, 2, `${label}.calls`),
        retries: literal(base.retries, 1, `${label}.retries`),
        terminalFailureRecorded: literal(base.terminalFailureRecorded, true, `${label}.terminalFailureRecorded`)
      };
    }
    const calls = integer(base.calls, `${label}.calls`, 1, 2) as 1 | 2;
    const retries = integer(base.retries, `${label}.retries`, 0, 1) as 0 | 1;
    if (calls !== 1 + retries) throw new TypeError(`${label}.calls must equal one baseline call plus bounded retries.`);
    return {
      questionId,
      status: literal(base.status, "answered", `${label}.status`),
      calls,
      retries,
      answerCheckpointUnchanged: literal(
        base.answerCheckpointUnchanged,
        true,
        `${label}.answerCheckpointUnchanged`
      ),
      sourceCheckpointUnchanged: literal(
        base.sourceCheckpointUnchanged,
        true,
        `${label}.sourceCheckpointUnchanged`
      )
    };
  });
  if (questions.filter(({ status }) => status === "answered").length !== 2
    || questions.filter(({ status }) => status === "unavailable").length !== 1) {
    throw new TypeError("questionFailure must contain exactly two answered questions and one unavailable question.");
  }
  const totalQuestionCalls = integer(input.totalQuestionCalls, "questionFailure.totalQuestionCalls", 4, 6);
  if (totalQuestionCalls !== questions.reduce((total, question) => total + question.calls, 0)) {
    throw new TypeError("questionFailure.totalQuestionCalls must equal its three bounded question call counts.");
  }
  const commerceInput = strictRecord(input.commerce, "questionFailure.commerce", [
    "paymentCount", "creditSettlementCount", "accessGrantCount", "coreReportReadyEmailCount", "refundCount",
    "duplicateSideEffectCount"
  ]);
  return {
    injected: literal(input.injected, true, "questionFailure.injected"),
    identities,
    questions,
    totalQuestionCalls,
    coreStatus: literal(input.coreStatus, "completed_limited", "questionFailure.coreStatus"),
    coreDelivered: literal(input.coreDelivered, true, "questionFailure.coreDelivered"),
    wholeReportReruns: literal(input.wholeReportReruns, 0, "questionFailure.wholeReportReruns"),
    commerce: {
      paymentCount: literal(commerceInput.paymentCount, 1, "questionFailure.commerce.paymentCount"),
      creditSettlementCount: literal(
        commerceInput.creditSettlementCount,
        1,
        "questionFailure.commerce.creditSettlementCount"
      ),
      accessGrantCount: literal(commerceInput.accessGrantCount, 1, "questionFailure.commerce.accessGrantCount"),
      coreReportReadyEmailCount: literal(
        commerceInput.coreReportReadyEmailCount,
        1,
        "questionFailure.commerce.coreReportReadyEmailCount"
      ),
      refundCount: literal(commerceInput.refundCount, 0, "questionFailure.commerce.refundCount"),
      duplicateSideEffectCount: literal(
        commerceInput.duplicateSideEffectCount,
        0,
        "questionFailure.commerce.duplicateSideEffectCount"
      )
    },
    accessStateValid: literal(input.accessStateValid, true, "questionFailure.accessStateValid")
  };
}

function parseCommerce(value: unknown): CommerceEvidence {
  const fields = {
    paymentCount: 1, coreJobCount: 1, enhancementJobCount: 1, creditBoundJobCount: 1,
    enhancementCreditCount: 0, creditReservationCount: 1, creditSettlementCount: 1,
    accessGrantCount: 1, paymentConfirmationEmailCount: 1, coreReportReadyEmailCount: 1,
    refundCount: 0, duplicatePaymentCount: 0,
    duplicateCreditCount: 0, duplicateAccessGrantCount: 0, duplicateEmailCount: 0, duplicateRefundCount: 0,
    auditExitCode: 0
  } as const;
  const input = strictRecord(value, "commerce", [...Object.keys(fields), "enhancementSideEffects"]);
  const parsed = Object.fromEntries(Object.entries(fields).map(([key, expected]) => [
    key,
    literal(input[key], expected, `commerce.${key}`)
  ]));
  return {
    ...parsed,
    enhancementSideEffects: zeroCommerceSideEffects(input.enhancementSideEffects, "commerce.enhancementSideEffects")
  } as CommerceEvidence;
}

function zeroCommerceSideEffects(value: unknown, label: string): ZeroCommerceSideEffects {
  const input = strictRecord(value, label, ["payments", "credits", "refunds", "emails", "accessGrants"]);
  return {
    payments: literal(input.payments, 0, `${label}.payments`),
    credits: literal(input.credits, 0, `${label}.credits`),
    refunds: literal(input.refunds, 0, `${label}.refunds`),
    emails: literal(input.emails, 0, `${label}.emails`),
    accessGrants: literal(input.accessGrants, 0, `${label}.accessGrants`)
  };
}

function parseBrowser(value: unknown): BrowserEvidence {
  const input = strictRecord(value, "browser", ["authorizedDesktop", "authorizedNarrow", "anonymous", "wrongScope"]);
  const authorizedDesktop = authorizedBrowser(input.authorizedDesktop, "browser.authorizedDesktop", 1024, 10000);
  const authorizedNarrow = authorizedBrowser(input.authorizedNarrow, "browser.authorizedNarrow", 240, 767);
  if (authorizedDesktop.screenshotEvidenceRef === authorizedNarrow.screenshotEvidenceRef) {
    throw new TypeError("desktop and narrow screenshot evidence references must be different.");
  }
  return {
    authorizedDesktop,
    authorizedNarrow,
    anonymous: deniedBrowser(input.anonymous, "browser.anonymous"),
    wrongScope: deniedBrowser(input.wrongScope, "browser.wrongScope")
  };
}

function parseLegacy(value: unknown): ReportV4StagingVerificationEvidence["legacy"] {
  const input = strictRecord(value, "legacy", [
    "v1Readable", "v2Readable", "v3Readable", "historicalPdfReadable", "historicalPdfMutationCount"
  ]);
  return {
    v1Readable: literal(input.v1Readable, true, "legacy.v1Readable"),
    v2Readable: literal(input.v2Readable, true, "legacy.v2Readable"),
    v3Readable: literal(input.v3Readable, true, "legacy.v3Readable"),
    historicalPdfReadable: literal(input.historicalPdfReadable, true, "legacy.historicalPdfReadable"),
    historicalPdfMutationCount: literal(
      input.historicalPdfMutationCount,
      0,
      "legacy.historicalPdfMutationCount"
    )
  };
}

function authorizedBrowser(
  value: unknown,
  label: string,
  minimumWidth: number,
  maximumWidth: number
): AuthorizedBrowserEvidence {
  const input = strictRecord(value, label, [
    "viewportWidth", "viewportHeight", "statusCode", "reportVisible", "noHorizontalOverflow",
    "relevantConsoleErrorCount", "screenshotEvidenceRef"
  ]);
  return {
    viewportWidth: integer(input.viewportWidth, `${label}.viewportWidth`, minimumWidth, maximumWidth),
    viewportHeight: integer(input.viewportHeight, `${label}.viewportHeight`, 1, 10000),
    statusCode: literal(input.statusCode, 200, `${label}.statusCode`),
    reportVisible: literal(input.reportVisible, true, `${label}.reportVisible`),
    noHorizontalOverflow: literal(input.noHorizontalOverflow, true, `${label}.noHorizontalOverflow`),
    relevantConsoleErrorCount: literal(input.relevantConsoleErrorCount, 0, `${label}.relevantConsoleErrorCount`),
    screenshotEvidenceRef: workspacePath(input.screenshotEvidenceRef, `${label}.screenshotEvidenceRef`)
  };
}

function deniedBrowser(value: unknown, label: string): { statusCode: 404; reportVisible: false } {
  const input = strictRecord(value, label, ["statusCode", "reportVisible"]);
  return {
    statusCode: literal(input.statusCode, 404, `${label}.statusCode`),
    reportVisible: literal(input.reportVisible, false, `${label}.reportVisible`)
  };
}

function parseRequirementResults(value: unknown, registry: ReportV4RequirementRegistry): RequirementResult[] {
  if (!Array.isArray(value)) throw new TypeError("requirementResults must be an array.");
  const byId = new Map<string, RequirementResult>();
  for (const [index, entry] of value.entries()) {
    const input = strictRecord(entry, `requirementResults[${index}]`, ["requirementId", "status", "verificationCommands"]);
    const requirementId = nonblank(input.requirementId, `requirementResults[${index}].requirementId`);
    if (byId.has(requirementId)) throw new TypeError(`Duplicate requirement result ${requirementId}.`);
    if (!Array.isArray(input.verificationCommands)) {
      throw new TypeError(`${requirementId}.verificationCommands must be an array.`);
    }
    const commands = input.verificationCommands.map((entry, commandIndex) => {
      const command = strictRecord(entry, `${requirementId}.verificationCommands[${commandIndex}]`, ["command", "exitCode"]);
      return {
        command: nonblank(command.command, `${requirementId}.verificationCommands[${commandIndex}].command`),
        exitCode: literal(command.exitCode, 0, `${requirementId}.verificationCommands[${commandIndex}].exitCode`)
      };
    });
    byId.set(requirementId, {
      requirementId,
      status: literal(input.status, "PASS", `${requirementId}.status`),
      verificationCommands: commands
    });
  }
  const expectedIds = registry.requirements.map(({ id }) => id).sort();
  const actualIds = [...byId.keys()].sort();
  if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) {
    throw new TypeError("requirement result IDs must exactly match all registry requirement IDs.");
  }
  return registry.requirements.map((requirement) => {
    const result = byId.get(requirement.id)!;
    const expectedCommands = [...requirement.verificationCommands].sort();
    const actualCommands = result.verificationCommands.map(({ command }) => command).sort();
    if (expectedCommands.length !== actualCommands.length
      || expectedCommands.some((command, index) => command !== actualCommands[index])) {
      throw new TypeError(`${requirement.id} verification commands must exactly match the registry.`);
    }
    return result;
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function strictRecord(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  const input = record(value, label);
  const expected = new Set(keys);
  const missing = keys.filter((key) => !(key in input));
  const extra = Object.keys(input).filter((key) => !expected.has(key));
  if (missing.length > 0 || extra.length > 0) {
    const details = [
      missing.length ? `missing ${missing.join(", ")}` : "",
      extra.length ? `unexpected ${extra.join(", ")}` : ""
    ].filter(Boolean).join("; ");
    throw new TypeError(`${label} has invalid fields: ${details}.`);
  }
  return input;
}

function nonblank(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new TypeError(`${label} must be a nonblank trimmed string.`);
  }
  return value;
}

function workspacePath(value: unknown, label: string): string {
  const parsed = nonblank(value, label).replaceAll("\\", "/");
  if (isAbsolute(parsed) || parsed.startsWith("/") || parsed.split("/").includes("..")) {
    throw new TypeError(`${label} must be a safe workspace-relative path.`);
  }
  return parsed;
}

function uuid(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
  return parsed;
}

function reportV4SiteSnapshotId(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  if (!/^report-v4-site-[0-9a-f]{64}$/.test(parsed)) {
    throw new TypeError(`${label} must use report-v4-site-<64 lowercase hex>.`);
  }
  return parsed;
}

function configurationSnapshotId(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  if (!/^v4-config-[0-9a-f]{64}$/.test(parsed)) {
    throw new TypeError(`${label} must use the v4-config-<64 lowercase hex> format.`);
  }
  return parsed;
}

function sha256(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  if (!/^[0-9a-f]{64}$/i.test(parsed)) throw new TypeError(`${label} must be a SHA-256 hex digest.`);
  return parsed.toLowerCase();
}

function sourceRevision(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  if (!/^[0-9a-f]{40}$/i.test(parsed)) throw new TypeError(`${label} must be a full Git source revision.`);
  return parsed.toLowerCase();
}

function httpsUrl(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  let url: URL;
  try {
    url = new URL(parsed);
  } catch {
    throw new TypeError(`${label} must be a canonical HTTPS URL without credentials.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.href !== parsed) {
    throw new TypeError(`${label} must be a canonical HTTPS URL without credentials.`);
  }
  return parsed;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

function literal<T extends string | number | boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new TypeError(`${label} must be ${JSON.stringify(expected)}.`);
  return expected;
}

function isoTimestamp(value: unknown, label: string): { value: string; epochMs: number } {
  const parsed = nonblank(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed)) {
    throw new TypeError(`${label} must be an ISO-8601 UTC timestamp with milliseconds.`);
  }
  const epochMs = Date.parse(parsed);
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== parsed) {
    throw new TypeError(`${label} must be a valid ISO-8601 UTC timestamp.`);
  }
  return { value: parsed, epochMs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runReportV4StagingVerification(process.argv.slice(2));
  (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
  process.exitCode = result.exitCode;
}
