import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export type ReportV4RequirementStatus = "planned" | "implemented" | "verified";
export type ReportV4AuditMode = "traceability" | "acceptance";

export interface ReportV4Requirement {
  id: string;
  specSection: string;
  title: string;
  status: ReportV4RequirementStatus;
  implementationPaths: string[];
  testPaths: string[];
  verificationCommands: string[];
  runtimeEvidencePaths: string[];
}

export interface ReportV4RequirementRegistry {
  contract: "combined_geo_report_v4";
  specPath: string;
  matrixPath: string;
  requirements: ReportV4Requirement[];
}

export interface ConformanceResult {
  exitCode: 0 | 1;
  output: string;
}

export interface ReportV4ProtectedStagingEvidence {
  schemaVersion: "report_v4_protected_staging_acceptance_v1";
  environment: "protected_staging";
  contract: "combined_geo_report_v4";
  recordedAt: string;
  deployment: {
    previewDeploymentId: string;
    protectedAliasUrl: string;
    webSourceRevision: string;
    workerSourceRevision: string;
  };
  configuration: {
    configurationSnapshotId: string;
    modelProfileId: string;
    modelProfileSha256: string;
    reportProfileId: string;
    reportProfileSha256: string;
    providerOperations: {
      pageAnalysis: { provider: string; model: string; operationId: string };
      websiteSynthesis: { provider: string; model: string; operationId: string };
      questionAnswer: { provider: string; model: string; operationId: string };
      sourceDiagnosis: { provider: string; model: string; operationId: string };
    };
  };
  identities: {
    reportId: string;
    orderId: string;
    fulfillmentJobId: string;
    siteSnapshotId: string;
    coreArtifactRevisionId: string;
    enhancementArtifactRevisionId: string;
  };
  timings: {
    crawlStartedAt: string;
    crawlCompletedAt: string;
    paymentConfirmedAt: string;
    coreActivatedAt: string;
    enhancementCompletedAt: string;
  };
  counters: {
    crawl: {
      runs: 1;
      candidatePages: number;
      analyzablePages: number;
      jsDependentPages: number;
      excludedPages: number;
      networkReadsAfterPayment: 0;
    };
    modelCalls: { websiteSynthesis: 1; questionAnswer: number; diagnosis: number; total: number };
    retries: {
      questions: Array<{ questionId: string; count: 0 | 1 }>;
      diagnoses: Array<{ questionId: string; count: 0 | 1 }>;
    };
    sourceReads: { raw: number; browser: number; total: number };
    revisions: { coreActivated: 1; enhancementActivated: 1; coreHtmlAssemblies: 1; enhancementHtmlAssemblies: 1 };
    wholeReportReruns: 0;
    providerClaimCalls: 0;
    qualificationCalls: 0;
    fourSnapshotCalls: 0;
    replacementFulfillmentCalls: 0;
    pdfOperations: 0;
  };
  browser: {
    authorizedDesktop: {
      viewportWidth: number;
      viewportHeight: number;
      statusCode: 200;
      reportVisible: true;
      screenshotEvidenceRef: string;
      noOverflow: true;
      relevantConsoleErrorCount: 0;
    };
    authorizedNarrow: {
      viewportWidth: number;
      viewportHeight: number;
      statusCode: 200;
      reportVisible: true;
      screenshotEvidenceRef: string;
      noOverflow: true;
      relevantConsoleErrorCount: 0;
    };
    anonymous: { statusCode: 404; reportVisible: false };
    wrongScope: { statusCode: 404; reportVisible: false };
  };
  commerce: {
    paymentCount: 1;
    fulfillmentJobCount: 1;
    creditReservationCount: 1;
    creditSettlementCount: 1;
    accessGrantCount: 1;
    deliveryEmailCount: 1;
    refundCount: 0;
    duplicatePaymentCount: 0;
    duplicateCreditCount: 0;
    duplicateAccessGrantCount: 0;
    duplicateEmailCount: 0;
    duplicateRefundCount: 0;
    auditExitCode: 0;
  };
  legacy: {
    v1Readable: true;
    v2Readable: true;
    v3Readable: true;
    historicalPdfReadable: true;
    historicalPdfMutationCount: 0;
  };
  faultInjection: {
    diagnosisFailure: {
      injected: true;
      identities: { reportId: string; orderId: string; fulfillmentJobId: string; coreArtifactRevisionId: string };
      coreArtifactRevisionIdBefore: string;
      coreArtifactRevisionIdAfter: string;
      coreRemainedActive: true;
      answerUnchanged: true;
      accessUnchanged: true;
      commerceSideEffectsDelta: { payments: 0; credits: 0; refunds: 0; emails: 0; accessGrants: 0 };
    };
  };
  productionUnchanged: true;
  requirementResults: Array<{
    requirementId: string;
    status: "PASS";
    verificationCommands: Array<{ command: string; exitCode: 0 }>;
  }>;
}

export type VerificationCommandRunner = (command: string) => Promise<number> | number;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonblank(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a nonblank trimmed string.`);
  }
  return value;
}

function workspacePath(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  const normalized = parsed.replaceAll("\\", "/");
  if (isAbsolute(parsed) || normalized.split("/").includes("..") || normalized.startsWith("/")) {
    throw new TypeError(`${label} must be a safe relative workspace path.`);
  }
  return normalized;
}

function nonemptyStrings(
  value: unknown,
  label: string,
  itemParser: (item: unknown, itemLabel: string) => string = nonblank
): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a nonempty array.`);
  return value.map((item, index) => itemParser(item, `${label}[${index}]`));
}

function strictRecord(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  const input = record(value, label);
  const expected = new Set(keys);
  const missing = keys.filter((key) => !(key in input));
  const extra = Object.keys(input).filter((key) => !expected.has(key));
  if (missing.length > 0 || extra.length > 0) {
    const details = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      extra.length > 0 ? `unexpected ${extra.join(", ")}` : ""
    ].filter(Boolean).join("; ");
    throw new TypeError(`${label} has invalid fields: ${details}.`);
  }
  return input;
}

function literal<T extends string | number | boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new TypeError(`${label} must be ${JSON.stringify(expected)}.`);
  return expected;
}

function integer(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

function uuid(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) {
    throw new TypeError(`${label} must be a UUID.`);
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

function configurationSnapshotId(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  if (!/^v4-config-[0-9a-f]{64}$/.test(parsed)) {
    throw new TypeError(`${label} must use the v4-config-<64 lowercase hex> format.`);
  }
  return parsed;
}

function httpsUrl(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  let url: URL;
  try {
    url = new URL(parsed);
  } catch {
    throw new TypeError(`${label} must be an HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.href !== parsed) {
    throw new TypeError(`${label} must be a canonical HTTPS URL without credentials.`);
  }
  return parsed;
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

function retryResults(value: unknown, label: string): Array<{ questionId: string; count: 0 | 1 }> {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must contain exactly three questions.`);
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const item = strictRecord(entry, `${label}[${index}]`, ["questionId", "count"]);
    const questionId = nonblank(item.questionId, `${label}[${index}].questionId`);
    if (ids.has(questionId)) throw new TypeError(`${label} contains duplicate questionId ${questionId}.`);
    ids.add(questionId);
    const count = integer(item.count, `${label}[${index}].count`, 0, 1) as 0 | 1;
    return { questionId, count };
  });
}

function authorizedBrowserCheck(
  value: unknown,
  label: string,
  width: { minimum: number; maximum: number }
): {
  viewportWidth: number;
  viewportHeight: number;
  statusCode: 200;
  reportVisible: true;
  screenshotEvidenceRef: string;
  noOverflow: true;
  relevantConsoleErrorCount: 0;
} {
  const input = strictRecord(value, label, [
    "viewportWidth", "viewportHeight", "statusCode", "reportVisible", "screenshotEvidenceRef", "noOverflow",
    "relevantConsoleErrorCount"
  ]);
  return {
    viewportWidth: integer(input.viewportWidth, `${label}.viewportWidth`, width.minimum, width.maximum),
    viewportHeight: integer(input.viewportHeight, `${label}.viewportHeight`, 1, 10000),
    statusCode: literal(input.statusCode, 200, `${label}.statusCode`),
    reportVisible: literal(input.reportVisible, true, `${label}.reportVisible`),
    screenshotEvidenceRef: workspacePath(input.screenshotEvidenceRef, `${label}.screenshotEvidenceRef`),
    noOverflow: literal(input.noOverflow, true, `${label}.noOverflow`),
    relevantConsoleErrorCount: literal(input.relevantConsoleErrorCount, 0, `${label}.relevantConsoleErrorCount`)
  };
}

function deniedBrowserCheck(value: unknown, label: string): { statusCode: 404; reportVisible: false } {
  const input = strictRecord(value, label, ["statusCode", "reportVisible"]);
  return {
    statusCode: literal(input.statusCode, 404, `${label}.statusCode`),
    reportVisible: literal(input.reportVisible, false, `${label}.reportVisible`)
  };
}

function providerOperation(value: unknown, label: string): { provider: string; model: string; operationId: string } {
  const input = strictRecord(value, label, ["provider", "model", "operationId"]);
  return {
    provider: nonblank(input.provider, `${label}.provider`),
    model: nonblank(input.model, `${label}.model`),
    operationId: nonblank(input.operationId, `${label}.operationId`)
  };
}

export function parseReportV4ProtectedStagingEvidence(value: unknown): ReportV4ProtectedStagingEvidence {
  const input = strictRecord(value, "protected-staging evidence", [
    "schemaVersion", "environment", "contract", "recordedAt", "deployment", "configuration", "identities", "timings",
    "counters", "browser", "commerce", "legacy", "faultInjection", "productionUnchanged", "requirementResults"
  ]);
  const deploymentInput = strictRecord(input.deployment, "deployment", [
    "previewDeploymentId", "protectedAliasUrl", "webSourceRevision", "workerSourceRevision"
  ]);
  const deployment = {
    previewDeploymentId: nonblank(deploymentInput.previewDeploymentId, "deployment.previewDeploymentId"),
    protectedAliasUrl: httpsUrl(deploymentInput.protectedAliasUrl, "deployment.protectedAliasUrl"),
    webSourceRevision: sourceRevision(deploymentInput.webSourceRevision, "deployment.webSourceRevision"),
    workerSourceRevision: sourceRevision(deploymentInput.workerSourceRevision, "deployment.workerSourceRevision")
  };
  if (deployment.webSourceRevision !== deployment.workerSourceRevision) {
    throw new TypeError("deployment Web and Worker source revisions must match.");
  }
  const configurationInput = strictRecord(input.configuration, "configuration", [
    "configurationSnapshotId", "modelProfileId", "modelProfileSha256", "reportProfileId", "reportProfileSha256",
    "providerOperations"
  ]);
  const providerOperationsInput = strictRecord(configurationInput.providerOperations, "configuration.providerOperations", [
    "pageAnalysis", "websiteSynthesis", "questionAnswer", "sourceDiagnosis"
  ]);
  const configuration = {
    configurationSnapshotId: configurationSnapshotId(
      configurationInput.configurationSnapshotId,
      "configuration.configurationSnapshotId"
    ),
    modelProfileId: nonblank(configurationInput.modelProfileId, "configuration.modelProfileId"),
    modelProfileSha256: sha256(configurationInput.modelProfileSha256, "configuration.modelProfileSha256"),
    reportProfileId: nonblank(configurationInput.reportProfileId, "configuration.reportProfileId"),
    reportProfileSha256: sha256(configurationInput.reportProfileSha256, "configuration.reportProfileSha256"),
    providerOperations: {
      pageAnalysis: providerOperation(providerOperationsInput.pageAnalysis, "configuration.providerOperations.pageAnalysis"),
      websiteSynthesis: providerOperation(providerOperationsInput.websiteSynthesis, "configuration.providerOperations.websiteSynthesis"),
      questionAnswer: providerOperation(providerOperationsInput.questionAnswer, "configuration.providerOperations.questionAnswer"),
      sourceDiagnosis: providerOperation(providerOperationsInput.sourceDiagnosis, "configuration.providerOperations.sourceDiagnosis")
    }
  };
  const identitiesInput = strictRecord(input.identities, "identities", [
    "reportId", "orderId", "fulfillmentJobId", "siteSnapshotId", "coreArtifactRevisionId", "enhancementArtifactRevisionId"
  ]);
  const identities = {
    reportId: uuid(identitiesInput.reportId, "identities.reportId"),
    orderId: uuid(identitiesInput.orderId, "identities.orderId"),
    fulfillmentJobId: uuid(identitiesInput.fulfillmentJobId, "identities.fulfillmentJobId"),
    siteSnapshotId: uuid(identitiesInput.siteSnapshotId, "identities.siteSnapshotId"),
    coreArtifactRevisionId: uuid(identitiesInput.coreArtifactRevisionId, "identities.coreArtifactRevisionId"),
    enhancementArtifactRevisionId: uuid(identitiesInput.enhancementArtifactRevisionId, "identities.enhancementArtifactRevisionId")
  };
  if (new Set(Object.values(identities)).size !== Object.keys(identities).length) {
    throw new TypeError("identities must be distinct UUIDs.");
  }

  const timingsInput = strictRecord(input.timings, "timings", [
    "crawlStartedAt", "crawlCompletedAt", "paymentConfirmedAt", "coreActivatedAt", "enhancementCompletedAt"
  ]);
  const crawlStartedAt = isoTimestamp(timingsInput.crawlStartedAt, "timings.crawlStartedAt");
  const crawlCompletedAt = isoTimestamp(timingsInput.crawlCompletedAt, "timings.crawlCompletedAt");
  const paymentConfirmedAt = isoTimestamp(timingsInput.paymentConfirmedAt, "timings.paymentConfirmedAt");
  const coreActivatedAt = isoTimestamp(timingsInput.coreActivatedAt, "timings.coreActivatedAt");
  const enhancementCompletedAt = isoTimestamp(timingsInput.enhancementCompletedAt, "timings.enhancementCompletedAt");
  const recordedAt = isoTimestamp(input.recordedAt, "recordedAt");
  const ordered = [crawlStartedAt, crawlCompletedAt, paymentConfirmedAt, coreActivatedAt, enhancementCompletedAt, recordedAt];
  if (ordered.some((item, index) => index > 0 && item.epochMs < ordered[index - 1]!.epochMs)) {
    throw new TypeError("timings and recordedAt must be in execution order.");
  }
  if (crawlCompletedAt.epochMs - crawlStartedAt.epochMs > 10 * 60_000) {
    throw new TypeError("site crawl must complete within 10 minutes.");
  }
  if (coreActivatedAt.epochMs - paymentConfirmedAt.epochMs > 5 * 60_000) {
    throw new TypeError("core HTML must activate within 5 minutes after payment.");
  }
  if (enhancementCompletedAt.epochMs - coreActivatedAt.epochMs > 10 * 60_000) {
    throw new TypeError("enhancement must complete within 10 minutes after core activation.");
  }

  const countersInput = strictRecord(input.counters, "counters", [
    "crawl", "modelCalls", "retries", "sourceReads", "revisions", "wholeReportReruns", "providerClaimCalls",
    "qualificationCalls", "fourSnapshotCalls", "replacementFulfillmentCalls", "pdfOperations"
  ]);
  const crawlInput = strictRecord(countersInput.crawl, "counters.crawl", [
    "runs", "candidatePages", "analyzablePages", "jsDependentPages", "excludedPages", "networkReadsAfterPayment"
  ]);
  const crawl = {
    runs: literal(crawlInput.runs, 1, "counters.crawl.runs"),
    candidatePages: integer(crawlInput.candidatePages, "counters.crawl.candidatePages", 1),
    analyzablePages: integer(crawlInput.analyzablePages, "counters.crawl.analyzablePages", 1, 50),
    jsDependentPages: integer(crawlInput.jsDependentPages, "counters.crawl.jsDependentPages"),
    excludedPages: integer(crawlInput.excludedPages, "counters.crawl.excludedPages"),
    networkReadsAfterPayment: literal(crawlInput.networkReadsAfterPayment, 0, "counters.crawl.networkReadsAfterPayment")
  };
  if (crawl.analyzablePages + crawl.excludedPages > crawl.candidatePages
    || crawl.jsDependentPages > crawl.analyzablePages) {
    throw new TypeError("crawl counters must keep analyzable plus excluded pages within candidates and JS-dependent pages within analyzable pages.");
  }

  const retriesInput = strictRecord(countersInput.retries, "counters.retries", ["questions", "diagnoses"]);
  const retries = {
    questions: retryResults(retriesInput.questions, "counters.retries.questions"),
    diagnoses: retryResults(retriesInput.diagnoses, "counters.retries.diagnoses")
  };
  const questionIds = retries.questions.map(({ questionId }) => questionId).sort();
  const diagnosisIds = retries.diagnoses.map(({ questionId }) => questionId).sort();
  if (questionIds.some((id, index) => id !== diagnosisIds[index])) {
    throw new TypeError("question and diagnosis retry counters must cover the same three question IDs.");
  }
  const modelCallsInput = strictRecord(countersInput.modelCalls, "counters.modelCalls", [
    "websiteSynthesis", "questionAnswer", "diagnosis", "total"
  ]);
  const modelCalls = {
    websiteSynthesis: literal(modelCallsInput.websiteSynthesis, 1, "counters.modelCalls.websiteSynthesis"),
    questionAnswer: integer(modelCallsInput.questionAnswer, "counters.modelCalls.questionAnswer", 3, 6),
    diagnosis: integer(modelCallsInput.diagnosis, "counters.modelCalls.diagnosis", 3, 6),
    total: integer(modelCallsInput.total, "counters.modelCalls.total", 7, 13)
  };
  const questionRetries = retries.questions.reduce((total, item) => total + item.count, 0);
  const diagnosisRetries = retries.diagnoses.reduce((total, item) => total + item.count, 0);
  if (modelCalls.questionAnswer !== 3 + questionRetries || modelCalls.diagnosis !== 3 + diagnosisRetries
    || modelCalls.total !== modelCalls.websiteSynthesis + modelCalls.questionAnswer + modelCalls.diagnosis) {
    throw new TypeError("model call counters must equal baseline calls plus bounded per-question retries.");
  }

  const sourceReadsInput = strictRecord(countersInput.sourceReads, "counters.sourceReads", ["raw", "browser", "total"]);
  const sourceReads = {
    raw: integer(sourceReadsInput.raw, "counters.sourceReads.raw"),
    browser: integer(sourceReadsInput.browser, "counters.sourceReads.browser"),
    total: integer(sourceReadsInput.total, "counters.sourceReads.total", 1)
  };
  if (sourceReads.total !== sourceReads.raw + sourceReads.browser) {
    throw new TypeError("source read total must equal raw plus browser reads.");
  }
  if (sourceReads.browser > sourceReads.raw) {
    throw new TypeError("source browser reads cannot exceed raw reads.");
  }

  const revisionsInput = strictRecord(countersInput.revisions, "counters.revisions", [
    "coreActivated", "enhancementActivated", "coreHtmlAssemblies", "enhancementHtmlAssemblies"
  ]);
  const revisions = {
    coreActivated: literal(revisionsInput.coreActivated, 1, "counters.revisions.coreActivated"),
    enhancementActivated: literal(revisionsInput.enhancementActivated, 1, "counters.revisions.enhancementActivated"),
    coreHtmlAssemblies: literal(revisionsInput.coreHtmlAssemblies, 1, "counters.revisions.coreHtmlAssemblies"),
    enhancementHtmlAssemblies: literal(revisionsInput.enhancementHtmlAssemblies, 1, "counters.revisions.enhancementHtmlAssemblies")
  };

  const browserInput = strictRecord(input.browser, "browser", ["authorizedDesktop", "authorizedNarrow", "anonymous", "wrongScope"]);
  const browser = {
    authorizedDesktop: authorizedBrowserCheck(browserInput.authorizedDesktop, "browser.authorizedDesktop", { minimum: 1024, maximum: 10000 }),
    authorizedNarrow: authorizedBrowserCheck(browserInput.authorizedNarrow, "browser.authorizedNarrow", { minimum: 240, maximum: 767 }),
    anonymous: deniedBrowserCheck(browserInput.anonymous, "browser.anonymous"),
    wrongScope: deniedBrowserCheck(browserInput.wrongScope, "browser.wrongScope")
  };

  const commerceInput = strictRecord(input.commerce, "commerce", [
    "paymentCount", "fulfillmentJobCount", "creditReservationCount", "creditSettlementCount", "accessGrantCount",
    "deliveryEmailCount", "refundCount", "duplicatePaymentCount", "duplicateCreditCount", "duplicateAccessGrantCount",
    "duplicateEmailCount", "duplicateRefundCount", "auditExitCode"
  ]);
  const commerce = {
    paymentCount: literal(commerceInput.paymentCount, 1, "commerce.paymentCount"),
    fulfillmentJobCount: literal(commerceInput.fulfillmentJobCount, 1, "commerce.fulfillmentJobCount"),
    creditReservationCount: literal(commerceInput.creditReservationCount, 1, "commerce.creditReservationCount"),
    creditSettlementCount: literal(commerceInput.creditSettlementCount, 1, "commerce.creditSettlementCount"),
    accessGrantCount: literal(commerceInput.accessGrantCount, 1, "commerce.accessGrantCount"),
    deliveryEmailCount: literal(commerceInput.deliveryEmailCount, 1, "commerce.deliveryEmailCount"),
    refundCount: literal(commerceInput.refundCount, 0, "commerce.refundCount"),
    duplicatePaymentCount: literal(commerceInput.duplicatePaymentCount, 0, "commerce.duplicatePaymentCount"),
    duplicateCreditCount: literal(commerceInput.duplicateCreditCount, 0, "commerce.duplicateCreditCount"),
    duplicateAccessGrantCount: literal(commerceInput.duplicateAccessGrantCount, 0, "commerce.duplicateAccessGrantCount"),
    duplicateEmailCount: literal(commerceInput.duplicateEmailCount, 0, "commerce.duplicateEmailCount"),
    duplicateRefundCount: literal(commerceInput.duplicateRefundCount, 0, "commerce.duplicateRefundCount"),
    auditExitCode: literal(commerceInput.auditExitCode, 0, "commerce.auditExitCode")
  };

  const legacyInput = strictRecord(input.legacy, "legacy", [
    "v1Readable", "v2Readable", "v3Readable", "historicalPdfReadable", "historicalPdfMutationCount"
  ]);
  const legacy = {
    v1Readable: literal(legacyInput.v1Readable, true, "legacy.v1Readable"),
    v2Readable: literal(legacyInput.v2Readable, true, "legacy.v2Readable"),
    v3Readable: literal(legacyInput.v3Readable, true, "legacy.v3Readable"),
    historicalPdfReadable: literal(legacyInput.historicalPdfReadable, true, "legacy.historicalPdfReadable"),
    historicalPdfMutationCount: literal(legacyInput.historicalPdfMutationCount, 0, "legacy.historicalPdfMutationCount")
  };

  const faultInjectionInput = strictRecord(input.faultInjection, "faultInjection", ["diagnosisFailure"]);
  const diagnosisFailureInput = strictRecord(faultInjectionInput.diagnosisFailure, "faultInjection.diagnosisFailure", [
    "injected", "identities", "coreArtifactRevisionIdBefore", "coreArtifactRevisionIdAfter", "coreRemainedActive",
    "answerUnchanged", "accessUnchanged", "commerceSideEffectsDelta"
  ]);
  const faultIdentitiesInput = strictRecord(diagnosisFailureInput.identities, "faultInjection.diagnosisFailure.identities", [
    "reportId", "orderId", "fulfillmentJobId", "coreArtifactRevisionId"
  ]);
  const faultIdentities = {
    reportId: uuid(faultIdentitiesInput.reportId, "faultInjection.diagnosisFailure.identities.reportId"),
    orderId: uuid(faultIdentitiesInput.orderId, "faultInjection.diagnosisFailure.identities.orderId"),
    fulfillmentJobId: uuid(faultIdentitiesInput.fulfillmentJobId, "faultInjection.diagnosisFailure.identities.fulfillmentJobId"),
    coreArtifactRevisionId: uuid(
      faultIdentitiesInput.coreArtifactRevisionId,
      "faultInjection.diagnosisFailure.identities.coreArtifactRevisionId"
    )
  };
  if (new Set(Object.values(faultIdentities)).size !== Object.keys(faultIdentities).length
    || Object.values(faultIdentities).some((id) => Object.values(identities).includes(id))) {
    throw new TypeError("diagnosis failure identities must be distinct from each other and from the successful acceptance run.");
  }
  const sideEffectsInput = strictRecord(
    diagnosisFailureInput.commerceSideEffectsDelta,
    "faultInjection.diagnosisFailure.commerceSideEffectsDelta",
    ["payments", "credits", "refunds", "emails", "accessGrants"]
  );
  const diagnosisFailure = {
    injected: literal(diagnosisFailureInput.injected, true, "faultInjection.diagnosisFailure.injected"),
    identities: faultIdentities,
    coreArtifactRevisionIdBefore: uuid(
      diagnosisFailureInput.coreArtifactRevisionIdBefore,
      "faultInjection.diagnosisFailure.coreArtifactRevisionIdBefore"
    ),
    coreArtifactRevisionIdAfter: uuid(
      diagnosisFailureInput.coreArtifactRevisionIdAfter,
      "faultInjection.diagnosisFailure.coreArtifactRevisionIdAfter"
    ),
    coreRemainedActive: literal(
      diagnosisFailureInput.coreRemainedActive,
      true,
      "faultInjection.diagnosisFailure.coreRemainedActive"
    ),
    answerUnchanged: literal(diagnosisFailureInput.answerUnchanged, true, "faultInjection.diagnosisFailure.answerUnchanged"),
    accessUnchanged: literal(diagnosisFailureInput.accessUnchanged, true, "faultInjection.diagnosisFailure.accessUnchanged"),
    commerceSideEffectsDelta: {
      payments: literal(sideEffectsInput.payments, 0, "faultInjection.diagnosisFailure.commerceSideEffectsDelta.payments"),
      credits: literal(sideEffectsInput.credits, 0, "faultInjection.diagnosisFailure.commerceSideEffectsDelta.credits"),
      refunds: literal(sideEffectsInput.refunds, 0, "faultInjection.diagnosisFailure.commerceSideEffectsDelta.refunds"),
      emails: literal(sideEffectsInput.emails, 0, "faultInjection.diagnosisFailure.commerceSideEffectsDelta.emails"),
      accessGrants: literal(sideEffectsInput.accessGrants, 0, "faultInjection.diagnosisFailure.commerceSideEffectsDelta.accessGrants")
    }
  };
  if (diagnosisFailure.coreArtifactRevisionIdBefore !== faultIdentities.coreArtifactRevisionId
    || diagnosisFailure.coreArtifactRevisionIdAfter !== faultIdentities.coreArtifactRevisionId) {
    throw new TypeError("diagnosis failure must leave the same core artifact revision active before and after injection.");
  }

  if (!Array.isArray(input.requirementResults) || input.requirementResults.length === 0) {
    throw new TypeError("requirementResults must be a nonempty array.");
  }
  const requirementIds = new Set<string>();
  const requirementResults = input.requirementResults.map((value, index) => {
    const item = strictRecord(value, `requirementResults[${index}]`, ["requirementId", "status", "verificationCommands"]);
    const requirementId = nonblank(item.requirementId, `requirementResults[${index}].requirementId`);
    if (!/^GEO-V4-[A-Z]+-[0-9]{2}$/.test(requirementId)) {
      throw new TypeError(`${requirementId} is not a valid report V4 requirement ID.`);
    }
    if (requirementIds.has(requirementId)) throw new TypeError(`Duplicate requirement result: ${requirementId}.`);
    requirementIds.add(requirementId);
    if (!Array.isArray(item.verificationCommands) || item.verificationCommands.length === 0) {
      throw new TypeError(`${requirementId}.verificationCommands must be a nonempty array.`);
    }
    const commands = new Set<string>();
    const verificationCommands = item.verificationCommands.map((value, commandIndex) => {
      const commandResult = strictRecord(value, `${requirementId}.verificationCommands[${commandIndex}]`, ["command", "exitCode"]);
      const command = nonblank(commandResult.command, `${requirementId}.verificationCommands[${commandIndex}].command`);
      if (commands.has(command)) throw new TypeError(`${requirementId} contains duplicate verification command ${command}.`);
      commands.add(command);
      return { command, exitCode: literal(commandResult.exitCode, 0, `${requirementId}.${command}.exitCode`) };
    });
    return {
      requirementId,
      status: literal(item.status, "PASS", `${requirementId}.status`),
      verificationCommands
    };
  });

  return {
    schemaVersion: literal(input.schemaVersion, "report_v4_protected_staging_acceptance_v1", "schemaVersion"),
    environment: literal(input.environment, "protected_staging", "environment"),
    contract: literal(input.contract, "combined_geo_report_v4", "contract"),
    recordedAt: recordedAt.value,
    deployment,
    configuration,
    identities,
    timings: {
      crawlStartedAt: crawlStartedAt.value,
      crawlCompletedAt: crawlCompletedAt.value,
      paymentConfirmedAt: paymentConfirmedAt.value,
      coreActivatedAt: coreActivatedAt.value,
      enhancementCompletedAt: enhancementCompletedAt.value
    },
    counters: {
      crawl,
      modelCalls,
      retries,
      sourceReads,
      revisions,
      wholeReportReruns: literal(countersInput.wholeReportReruns, 0, "counters.wholeReportReruns"),
      providerClaimCalls: literal(countersInput.providerClaimCalls, 0, "counters.providerClaimCalls"),
      qualificationCalls: literal(countersInput.qualificationCalls, 0, "counters.qualificationCalls"),
      fourSnapshotCalls: literal(countersInput.fourSnapshotCalls, 0, "counters.fourSnapshotCalls"),
      replacementFulfillmentCalls: literal(countersInput.replacementFulfillmentCalls, 0, "counters.replacementFulfillmentCalls"),
      pdfOperations: literal(countersInput.pdfOperations, 0, "counters.pdfOperations")
    },
    browser,
    commerce,
    legacy,
    faultInjection: { diagnosisFailure },
    productionUnchanged: literal(input.productionUnchanged, true, "productionUnchanged"),
    requirementResults
  };
}

export function parseReportV4Registry(value: unknown): ReportV4RequirementRegistry {
  const input = record(value, "report V4 registry");
  if (input.contract !== "combined_geo_report_v4") {
    throw new TypeError("Unsupported report V4 contract; expected combined_geo_report_v4.");
  }
  const requirementsInput = input.requirements;
  if (!Array.isArray(requirementsInput) || requirementsInput.length === 0) {
    throw new TypeError("requirements must be a nonempty array.");
  }
  const ids = new Set<string>();
  const requirements = requirementsInput.map((value, index): ReportV4Requirement => {
    const item = record(value, `requirements[${index}]`);
    const id = nonblank(item.id, `requirements[${index}].id`);
    if (!/^GEO-V4-[A-Z]+-[0-9]{2}$/.test(id)) {
      throw new TypeError(`${id} is not a valid report V4 requirement ID.`);
    }
    if (ids.has(id)) throw new TypeError(`Duplicate requirement ID: ${id}.`);
    ids.add(id);
    if (item.status !== "planned" && item.status !== "implemented" && item.status !== "verified") {
      throw new TypeError(`Unsupported requirement status for ${id}.`);
    }
    return {
      id,
      specSection: nonblank(item.specSection, `${id}.specSection`),
      title: nonblank(item.title, `${id}.title`),
      status: item.status,
      implementationPaths: nonemptyStrings(item.implementationPaths, `${id}.implementationPaths`, workspacePath),
      testPaths: nonemptyStrings(item.testPaths, `${id}.testPaths`, workspacePath),
      verificationCommands: nonemptyStrings(item.verificationCommands, `${id}.verificationCommands`),
      runtimeEvidencePaths: nonemptyStrings(item.runtimeEvidencePaths, `${id}.runtimeEvidencePaths`, workspacePath)
    };
  });
  return {
    contract: "combined_geo_report_v4",
    specPath: workspacePath(input.specPath, "specPath"),
    matrixPath: workspacePath(input.matrixPath, "matrixPath"),
    requirements
  };
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function codeList(values: string[]): string {
  return values.map((value) => `\`${cell(value)}\``).join("<br>");
}

export function renderReportV4CoverageMatrix(registry: ReportV4RequirementRegistry): string {
  const lines = [
    "# Report V4 Coverage Matrix",
    "",
    `Contract: \`${registry.contract}\``,
    "",
    `Specification: \`${registry.specPath}\``,
    "",
    "| ID | Spec | Requirement | Status | Implementation | Tests | Commands | Runtime evidence |",
    "|---|---|---|---|---|---|---|---|"
  ];
  for (const requirement of registry.requirements) {
    lines.push(
      `| \`${requirement.id}\` | ${cell(requirement.specSection)} | ${cell(requirement.title)} | \`${requirement.status}\` | ${codeList(requirement.implementationPaths)} | ${codeList(requirement.testPaths)} | ${codeList(requirement.verificationCommands)} | ${codeList(requirement.runtimeEvidencePaths)} |`
    );
  }
  lines.push(
    "",
    "This file is generated from `config/report-contracts/combined-geo-report-v4.requirements.json`. Do not edit it independently.",
    ""
  );
  return lines.join("\n");
}

function missingPathFailures(
  requirement: ReportV4Requirement,
  workspaceRoot: string,
  paths: string[],
  kind: "implementation" | "test" | "runtime evidence"
): string[] {
  return paths
    .filter((path) => {
      const absolutePath = resolve(workspaceRoot, path);
      return !existsSync(absolutePath) || !statSync(absolutePath).isFile();
    })
    .map((path) => `${requirement.id}: missing ${kind} path ${path}`);
}

export async function auditReportV4Registry(
  registry: ReportV4RequirementRegistry,
  workspaceRoot: string,
  mode: ReportV4AuditMode,
  commandRunner: VerificationCommandRunner
): Promise<ConformanceResult> {
  const failures: string[] = [];
  const specPath = resolve(workspaceRoot, registry.specPath);
  const matrixPath = resolve(workspaceRoot, registry.matrixPath);
  if (!existsSync(specPath) || !statSync(specPath).isFile()) failures.push(`missing specification path ${registry.specPath}`);
  if (!existsSync(matrixPath) || !statSync(matrixPath).isFile()) {
    failures.push(`missing coverage matrix path ${registry.matrixPath}`);
  } else if (readFileSync(matrixPath, "utf8") !== renderReportV4CoverageMatrix(registry)) {
    failures.push("coverage matrix is stale; run npm run report:v4:matrix");
  }

  if (mode === "acceptance") {
    const evidenceCache = new Map<string, ReportV4ProtectedStagingEvidence | Error>();
    const reportedEvidenceErrors = new Set<string>();
    const validatedEvidenceResultSets = new Set<string>();
    const validatedScreenshotEvidence = new Set<string>();
    const verifiedRequirementIds = registry.requirements
      .filter(({ status }) => status === "verified")
      .map(({ id }) => id)
      .sort();
    for (const requirement of registry.requirements) {
      if (requirement.status !== "verified") {
        failures.push(`${requirement.id} is ${requirement.status}, not verified`);
        continue;
      }
      failures.push(...missingPathFailures(requirement, workspaceRoot, requirement.implementationPaths, "implementation"));
      failures.push(...missingPathFailures(requirement, workspaceRoot, requirement.testPaths, "test"));
      failures.push(...missingPathFailures(requirement, workspaceRoot, requirement.runtimeEvidencePaths, "runtime evidence"));
      for (const testPath of requirement.testPaths) {
        const absoluteTestPath = resolve(workspaceRoot, testPath);
        if (existsSync(absoluteTestPath)) {
          const marker = `@requirement ${requirement.id}`;
          if (!readFileSync(absoluteTestPath, "utf8").includes(marker)) {
            failures.push(`${requirement.id}: ${testPath} is missing ${marker}`);
          }
        }
      }
      for (const evidencePath of requirement.runtimeEvidencePaths) {
        const absoluteEvidencePath = resolve(workspaceRoot, evidencePath);
        if (!existsSync(absoluteEvidencePath) || !statSync(absoluteEvidencePath).isFile()) continue;
        let evidence = evidenceCache.get(evidencePath);
        if (!evidence) {
          try {
            evidence = parseReportV4ProtectedStagingEvidence(JSON.parse(readFileSync(absoluteEvidencePath, "utf8")));
          } catch (error) {
            evidence = error instanceof Error ? error : new Error(String(error));
          }
          evidenceCache.set(evidencePath, evidence);
        }
        if (evidence instanceof Error) {
          if (!reportedEvidenceErrors.has(evidencePath)) {
            failures.push(`${evidencePath}: invalid protected-staging evidence: ${evidence.message}`);
            reportedEvidenceErrors.add(evidencePath);
          }
          continue;
        }
        if (!validatedEvidenceResultSets.has(evidencePath)) {
          const recordedRequirementIds = evidence.requirementResults.map(({ requirementId }) => requirementId).sort();
          if (verifiedRequirementIds.length !== recordedRequirementIds.length
            || verifiedRequirementIds.some((id, index) => id !== recordedRequirementIds[index])) {
            failures.push(`${evidencePath}: requirement result IDs must exactly match verified registry requirement IDs`);
          }
          validatedEvidenceResultSets.add(evidencePath);
        }
        if (!validatedScreenshotEvidence.has(evidencePath)) {
          const screenshots = [
            ["desktop", evidence.browser.authorizedDesktop.screenshotEvidenceRef],
            ["narrow", evidence.browser.authorizedNarrow.screenshotEvidenceRef]
          ] as const;
          const screenshotPaths = screenshots.map(([, path]) => resolve(workspaceRoot, path));
          const normalizedScreenshotPaths = screenshotPaths.map((path) => process.platform === "win32" ? path.toLowerCase() : path);
          if (normalizedScreenshotPaths[0] === normalizedScreenshotPaths[1]) {
            failures.push(`${evidencePath}: desktop and narrow screenshot evidence paths must be different`);
          }
          screenshots.forEach(([viewport], index) => {
            const screenshotPath = screenshotPaths[index]!;
            if (!existsSync(screenshotPath) || !statSync(screenshotPath).isFile()) {
              failures.push(`${evidencePath}: missing ${viewport} screenshot evidence file ${screenshots[index]![1]}`);
            }
          });
          validatedScreenshotEvidence.add(evidencePath);
        }
        const result = evidence.requirementResults.find(({ requirementId }) => requirementId === requirement.id);
        if (!result || result.status !== "PASS") {
          failures.push(`${requirement.id}: ${evidencePath} lacks an explicit PASS requirement result`);
          continue;
        }
        const expectedCommands = [...requirement.verificationCommands].sort();
        const recordedCommands = result.verificationCommands.map(({ command }) => command).sort();
        if (expectedCommands.length !== recordedCommands.length
          || expectedCommands.some((command, index) => command !== recordedCommands[index])) {
          failures.push(`${requirement.id}: verification command evidence must exactly match the registry`);
        }
      }
    }

    if (failures.length === 0) {
      const commands = [...new Set(registry.requirements.flatMap(({ verificationCommands }) => verificationCommands))];
      for (const command of commands) {
        let exitCode: number;
        try {
          exitCode = await commandRunner(command);
        } catch (error) {
          failures.push(`verification command threw: ${command}: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        if (exitCode !== 0) failures.push(`verification command failed (${exitCode}): ${command}`);
      }
    }
  }

  const label = mode === "traceability" ? "Traceability" : "Acceptance";
  if (failures.length > 0) {
    return { exitCode: 1, output: `${label} failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n` };
  }
  const statuses = registry.requirements.map(({ id, status }) => `${id} status=${status}`).join("\n");
  return {
    exitCode: 0,
    output: `${label} passed: ${registry.requirements.length} requirement(s) ${mode === "traceability" ? "structurally registered" : "verified"}.\n${statuses}\n`
  };
}
