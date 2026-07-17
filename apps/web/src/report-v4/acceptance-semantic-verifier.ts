import { createHash } from "node:crypto";
import type {
  ReportV4AcceptanceEvent,
  ReportV4AcceptanceScenario
} from "../db/report-v4-acceptance-ledger";
import type {
  ReportV4CommerceAuthorityComparison,
  ReportV4CommerceComponentName
} from "./report-v4-commerce-authority-comparator";

const HASH = /^[a-f0-9]{64}$/u;
const TEN_MINUTES = 10 * 60 * 1_000;
const FIVE_MINUTES = 5 * 60 * 1_000;

export interface ReportV4AllowedSiteRead {
  /** Trusted deterministic DB binding shared by raw/browser claims for one URL. */
  readonly pairBindingHash: string;
  readonly unitId: string;
  readonly mode: "raw" | "browser";
  readonly urlHash: string;
  readonly attempt: 0 | 1;
}

export interface ReportV4ExpectedSiteRead extends ReportV4AllowedSiteRead {
  readonly terminalPhase: "completed" | "failed";
}

export interface ReportV4ExpectedCheckpoint {
  readonly questionId: string;
  readonly identityHash: string;
  readonly terminalFingerprint: string;
  readonly state: "answered" | "unavailable";
  readonly logicalProviderCallCount: 0 | 1 | 2;
  /** Derived from trusted DB logical count plus exact injected-fault semantics, never by counting ledger events. */
  readonly physicalProviderCallCount: 0 | 1 | 2;
  readonly sourceCount: number;
  readonly sourceOwnershipVerified: true;
  readonly inputScopeVerified: true;
}

export interface ReportV4ExpectedDiagnosisCheckpoint {
  readonly questionId: string;
  readonly identityHash: string;
  readonly terminalFingerprint: string;
  readonly state: "completed" | "failed";
  readonly logicalProviderCallCount: 0 | 1 | 2;
  /** Derived from trusted DB logical count plus exact injected-fault semantics, never by counting ledger events. */
  readonly physicalProviderCallCount: 0 | 1 | 2;
  readonly sourceAuditCount: number;
  readonly sourceAuditOwnershipVerified: true;
  readonly inputScopeVerified: true;
}

export interface ReportV4ExpectedPageSummary {
  readonly pageId: string;
  readonly identityHash: string;
  readonly parsedHierarchyIntegrity: true;
  readonly chunkIntegrity: true;
  readonly sourcePositionIntegrity: true;
}

export interface ReportV4AcceptanceSemanticAuthority {
  readonly scenarioId: string;
  readonly dispatch: {
    readonly preAdmissionJobId: string;
    readonly coreJobId: string;
    readonly enhancementJobId: string | null;
  };
  readonly crawl: {
    readonly unitId: string;
    readonly terminalStatus: "completed";
    readonly candidatePages: number;
    readonly analyzablePages: number;
    readonly excludedPages: number;
    readonly jsDependentPages: number;
  };
  /** DB-derived minimum claims which must occur. Never populate from ledger echo. */
  readonly requiredSiteReads: readonly ReportV4ExpectedSiteRead[];
  /** DB-derived allow-list; optional known claims may be absent but unknown observed claims fail. */
  readonly allowedSiteReads: readonly ReportV4AllowedSiteRead[];
  readonly sourceFaultZeroClaim: null | {
    readonly unitId: string;
    readonly physicalClaimCount: 0;
    readonly injectedBeforeClaim: true;
    readonly questionId: string;
    readonly sourceId: string;
    readonly persistedAuditStatus: "inaccessible";
    readonly coreAnswerContentPreserved: true;
    readonly sourceLinkPreserved: true;
  };
  readonly analyzablePageIds: readonly string[];
  readonly pageSummaries: readonly ReportV4ExpectedPageSummary[];
  readonly websiteSynthesisUnitId: string;
  readonly websiteCheckpoint: {
    readonly state: "completed";
    readonly providerCallCount: 1;
    readonly correctionCount: 0;
    readonly identityHash: string;
    readonly inputIdentityHash: string;
    readonly pageSummaryIdentitySetHash: string;
  };
  readonly questions: readonly ReportV4ExpectedCheckpoint[];
  readonly diagnoses: readonly ReportV4ExpectedDiagnosisCheckpoint[];
  readonly oversizedTokenProbe: {
    /** Independent isolated probe evidence; a production emitter remains required downstream. */
    readonly operation: "page_analysis" | "website_synthesis" | "question_answer";
    readonly unitId: string;
    readonly estimatedSystemTokens: number;
    readonly estimatedInputTokens: number;
    readonly reservedOutputTokens: number;
    readonly providerSafetyMarginTokens: number;
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly contextWindowTokens: number;
  };
  readonly coreArtifact: {
    readonly revisionId: string;
    readonly htmlSha256: string;
    readonly payloadIdentityHash: string;
    readonly recomputedPayloadIdentityHash: string;
    readonly integrityVerified: true;
  };
  readonly enhancementArtifact: null | {
    readonly revisionId: string;
    readonly htmlSha256: string;
    readonly payloadIdentityHash: string;
    readonly recomputedPayloadIdentityHash: string;
    readonly integrityVerified: true;
    readonly coreAnswerContentPreserved: true;
    readonly coreSourceContentPreserved: true;
    readonly active: boolean;
  };
  readonly commerce: {
    readonly baselineUnitId: string;
    readonly finalUnitId: string;
    /** Must be produced by compareReportV4CommerceAuthoritySnapshots from two complete snapshots. */
    readonly comparison: ReportV4CommerceAuthorityComparison;
  };
  readonly databaseZeroClaims: {
    /** Trusted collector count from append-before-PDF-call instrumentation; artifact columns alone cannot prove this zero. */
    readonly pdfInvocationCount: 0;
    readonly replacementFulfillmentCount: 0;
    readonly correctionFulfillmentCount: 0;
    readonly fullRerunCount: 0;
    readonly extraSnapshotCountAfterPayment: 0;
  };
  readonly paidAt: Date;
}

export interface VerifyReportV4AcceptanceScenarioSemanticsInput {
  readonly scenario: ReportV4AcceptanceScenario;
  /** Exact append order returned by the already structurally verified ledger. */
  readonly events: readonly ReportV4AcceptanceEvent[];
  /**
   * A trusted REPEATABLE READ DB projection must construct this sealed
   * authority in production. It must not echo ledger units or accept caller
   * literals for siteReads, zero claims, checkpoints, artifacts, or commerce.
   */
  readonly authority: ReportV4AcceptanceSemanticAuthority;
}

export interface ReportV4AcceptanceSemanticVerification {
  readonly valid: true;
  readonly scenarioId: string;
  readonly verifiedEventCount: number;
}

export class ReportV4AcceptanceSemanticVerificationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Report V4 acceptance semantic verification failed:\n- ${issues.join("\n- ")}`);
    this.name = "ReportV4AcceptanceSemanticVerificationError";
    this.issues = Object.freeze([...issues]);
  }
}

/**
 * Pure fail-closed verifier for GEO-V4-ACCEPT-01, GEO-V4-TOKEN-01/02,
 * GEO-V4-CRAWL-01/02/04, GEO-V4-ANSWER-01/02, GEO-V4-SOURCE-01/02,
 * GEO-V4-DELIVERY-01, GEO-V4-DIAG-01/02, GEO-V4-PDF-01 and
 * GEO-V4-COMMERCE-01. Required evidence comes only from `authority`, never
 * from units which happen to occur in the ledger.
 */
export function verifyReportV4AcceptanceScenarioSemantics(
  input: VerifyReportV4AcceptanceScenarioSemanticsInput
): ReportV4AcceptanceSemanticVerification {
  const issues: string[] = [];
  if (!input || typeof input !== "object") {
    throw new ReportV4AcceptanceSemanticVerificationError(["input must be an explicit scenario, events, and authority object"]);
  }
  const { scenario, events, authority } = input;
  if (!scenario || !Array.isArray(events) || !authority) {
    throw new ReportV4AcceptanceSemanticVerificationError(["scenario, ordered events, and explicit authority are required"]);
  }
  validateAuthority(scenario, authority, issues);
  const scoped = events.filter((event) => event.scenarioId === scenario.scenarioId);
  if (scoped.length !== events.length) issues.push("events contain a foreign scenario event");
  if (events.some((event) => event.kind === "prohibited_operation")) issues.push("prohibited_operation events are forbidden");

  verifyDispatchAndCrawl(scenario, scoped, authority, issues);
  verifySiteReads(scenario, scoped, authority, issues);
  verifyCoreModels(scenario, scoped, authority, issues);
  verifyCheckpoints(scenario, scoped, authority, issues);
  verifyTokenProbe(scoped, authority, issues);
  verifyArtifacts(scenario, scoped, authority, issues);
  verifyCommerce(scenario, scoped, authority, issues);
  verifyNoExtraSemanticEvents(scoped, authority, issues);
  verifyTiming(scenario, scoped, authority, issues);

  if (issues.length > 0) throw new ReportV4AcceptanceSemanticVerificationError(issues);
  return Object.freeze({ valid: true, scenarioId: scenario.scenarioId, verifiedEventCount: scoped.length });
}

function validateAuthority(
  scenario: ReportV4AcceptanceScenario,
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  if (scenario.state !== "sealed") issues.push("scenario must be sealed");
  if (authority.scenarioId !== scenario.scenarioId) issues.push("authority.scenarioId does not match scenario");
  if (authority.dispatch.preAdmissionJobId !== scenario.preAdmissionJobId) issues.push("pre-admission dispatch authority does not match scenario");
  if (authority.dispatch.coreJobId !== scenario.coreJobId) issues.push("Core dispatch authority does not match scenario");
  if (authority.dispatch.enhancementJobId !== scenario.enhancementJobId) issues.push("enhancement dispatch authority does not match scenario");
  if (authority.requiredSiteReads.length === 0) issues.push("authority.requiredSiteReads must explicitly enumerate at least one DB-derived minimum read");
  if (authority.allowedSiteReads.length === 0) issues.push("authority.allowedSiteReads must explicitly enumerate DB-derived known reads");
  if (authority.analyzablePageIds.length === 0) issues.push("authority.analyzablePageIds must not be empty");
  if (authority.pageSummaries.length === 0) issues.push("authority.pageSummaries must not be empty");
  if (authority.questions.length === 0) issues.push("authority.questions must not be empty");
  if (authority.questions.length !== 3) issues.push("authority.questions must enumerate exactly three canonical buyer questions");
  unique(authority.requiredSiteReads.map((read) => `${read.unitId}:${read.mode}`), "required site-read claim", issues);
  unique(authority.allowedSiteReads.map((read) => `${read.unitId}:${read.mode}`), "allowed site-read claim", issues);
  for (const read of authority.allowedSiteReads) if (!HASH.test(read.pairBindingHash)) issues.push(`site read ${read.unitId} pairBindingHash must be SHA-256`);
  const allowedReadKeys = new Set(authority.allowedSiteReads.map(siteReadKey));
  if (authority.requiredSiteReads.some((read) => !allowedReadKeys.has(siteReadKey(read)))) issues.push("every required site read must belong to the allowed DB-derived set");
  for (const required of authority.requiredSiteReads) {
    const allowed = authority.allowedSiteReads.find((read) => siteReadKey(read) === siteReadKey(required));
    if (allowed && (allowed.urlHash !== required.urlHash || allowed.pairBindingHash !== required.pairBindingHash
      || allowed.unitId !== required.unitId || allowed.mode !== required.mode || allowed.attempt !== required.attempt)) {
      issues.push(`required site read ${required.unitId}/${required.mode} conflicts with allowed identity authority`);
    }
  }
  unique(authority.analyzablePageIds, "analyzable page", issues);
  unique(authority.pageSummaries.map((summary) => summary.pageId), "page summary", issues);
  unique(authority.pageSummaries.map((summary) => summary.identityHash), "page summary identity hash", issues);
  if (!sameSet(authority.analyzablePageIds, authority.pageSummaries.map((summary) => summary.pageId))) issues.push("page summary IDs must exactly equal analyzable page IDs");
  for (const summary of authority.pageSummaries) {
    if (!HASH.test(summary.identityHash) || !summary.parsedHierarchyIntegrity || !summary.chunkIntegrity || !summary.sourcePositionIntegrity) {
      issues.push(`page summary ${summary.pageId} lacks trusted identity/hierarchy/chunk/source-position integrity`);
    }
  }
  unique(authority.questions.map((question) => question.questionId), "question", issues);
  unique(authority.questions.map((question) => question.identityHash), "question checkpoint identity", issues);
  unique(authority.diagnoses.map((diagnosis) => diagnosis.questionId), "diagnosis", issues);
  unique(authority.diagnoses.map((diagnosis) => diagnosis.identityHash), "diagnosis checkpoint identity", issues);
  if (!validDate(authority.paidAt)) issues.push("authority.paidAt must be a valid Date");
  if (!HASH.test(authority.coreArtifact.htmlSha256)) issues.push("Core HTML authority hash must be SHA-256");
  if (authority.coreArtifact.revisionId !== scenario.coreArtifactRevisionId) issues.push("Core artifact authority revision does not match scenario lineage");
  if ((authority.enhancementArtifact?.revisionId ?? null) !== scenario.enhancementArtifactRevisionId) issues.push("enhancement artifact authority revision does not match scenario lineage");
  verifyArtifactIntegrityAuthority(authority.coreArtifact, "Core", issues);
  if (authority.enhancementArtifact) verifyArtifactIntegrityAuthority(authority.enhancementArtifact, "enhancement", issues);
  if (authority.enhancementArtifact
    && (!authority.enhancementArtifact.coreAnswerContentPreserved || !authority.enhancementArtifact.coreSourceContentPreserved)) {
    issues.push("enhancement must preserve Core answer and source content");
  }
  if (authority.websiteCheckpoint.state !== "completed" || authority.websiteCheckpoint.providerCallCount !== 1
    || authority.websiteCheckpoint.correctionCount !== 0 || !HASH.test(authority.websiteCheckpoint.identityHash)
    || !HASH.test(authority.websiteCheckpoint.inputIdentityHash)
    || authority.websiteCheckpoint.pageSummaryIdentitySetHash !== pageSummaryIdentitySetHash(authority.pageSummaries)) {
    issues.push("website checkpoint must be completed with one provider call, zero corrections, and stable identity hashes");
  }
  const crawlCounts = authority.crawl;
  for (const key of ["candidatePages", "analyzablePages", "excludedPages", "jsDependentPages"] as const) {
    if (!Number.isSafeInteger(crawlCounts[key]) || crawlCounts[key] < 0) issues.push(`authority.crawl.${key} must be a nonnegative integer`);
  }
  if (crawlCounts.terminalStatus !== "completed") issues.push("authority.crawl terminalStatus must be completed");
  if (crawlCounts.candidatePages !== crawlCounts.analyzablePages + crawlCounts.excludedPages) issues.push("crawl candidatePages must equal analyzablePages plus excludedPages");
  if (crawlCounts.analyzablePages !== authority.analyzablePageIds.length) issues.push("crawl analyzablePages must equal analyzablePageIds length");
  if (crawlCounts.analyzablePages < 1 || crawlCounts.analyzablePages > 50) issues.push("crawl analyzablePages must be between 1 and 50");
  if (crawlCounts.jsDependentPages > crawlCounts.analyzablePages) issues.push("crawl jsDependentPages cannot exceed analyzablePages");
  const comparison = authority.commerce.comparison;
  if (!HASH.test(comparison.baselineFingerprint) || !HASH.test(comparison.finalFingerprint)) {
    issues.push("commerce fingerprints must be SHA-256");
  }
  if (authority.commerce.baselineUnitId === authority.commerce.finalUnitId) issues.push("commerce baseline and final unit IDs must be distinct");
  if (comparison.baselineFingerprint === comparison.finalFingerprint) issues.push("commerce baseline and final whole fingerprints must be distinct");
  if (comparison.finalFingerprint !== scenario.finalFingerprint) issues.push("commerce final fingerprint must equal scenario.finalFingerprint");
  verifyCommerceComparison(comparison, scenario, issues);
  for (const [key, value] of Object.entries(authority.databaseZeroClaims)) {
    if (value !== 0) issues.push(`database zero claim ${key} must equal zero`);
  }
  const hasEnhancement = authority.dispatch.enhancementJobId !== null;
  if (hasEnhancement !== (authority.enhancementArtifact !== null)) issues.push("enhancement dispatch and artifact authority must be all-or-none");
  if (hasEnhancement && authority.diagnoses.length === 0) issues.push("enhancement authority must enumerate diagnoses");
  if (hasEnhancement && authority.diagnoses.length !== 3) issues.push("enhancement authority must enumerate exactly three diagnoses");
  if (!hasEnhancement && authority.diagnoses.length !== 0) issues.push("diagnoses are forbidden without an enhancement lane");
  if (scenario.kind === "question_failure" && hasEnhancement) issues.push("question_failure must not declare enhancement work");
  if ((scenario.kind === "success" || scenario.kind === "diagnosis_failure") && !hasEnhancement) issues.push(`${scenario.kind} must declare enhancement work`);
  if (scenario.kind === "diagnosis_failure" && !authority.enhancementArtifact?.active) {
    issues.push("diagnosis_failure must deliver and activate its partial enhancement");
  }
  if (scenario.kind === "success") {
    const expectedFaultUnit = `${scenario.enhancementJobId}:${scenario.faultQuestionId}:${scenario.faultSourceId}`;
    if (!authority.sourceFaultZeroClaim || authority.sourceFaultZeroClaim.unitId !== expectedFaultUnit) {
      issues.push("success must declare the exact source-fault zero-claim authority");
    }
    const sourceProof = authority.sourceFaultZeroClaim;
    if (sourceProof && (sourceProof.questionId !== scenario.faultQuestionId || sourceProof.sourceId !== scenario.faultSourceId
      || sourceProof.persistedAuditStatus !== "inaccessible" || !sourceProof.coreAnswerContentPreserved
      || !sourceProof.sourceLinkPreserved)) {
      issues.push("source-fault DB proof must preserve exact identities, inaccessible audit status, Core answer, and source link");
    }
    if (!authority.enhancementArtifact?.active) issues.push("success must activate its enhancement artifact");
  } else if (authority.sourceFaultZeroClaim !== null) {
    issues.push("source-fault zero-claim authority is only valid for success");
  }
  validateCheckpointAuthority(scenario, authority, issues);
}

function validateCheckpointAuthority(
  scenario: ReportV4AcceptanceScenario,
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  for (const question of authority.questions) {
    if (!HASH.test(question.identityHash) || !HASH.test(question.terminalFingerprint)) issues.push(`question ${question.questionId} has an invalid checkpoint hash`);
    if (question.physicalProviderCallCount > question.logicalProviderCallCount) issues.push(`question ${question.questionId} physical calls exceed logical calls`);
    if (question.state === "answered" && (question.logicalProviderCallCount === 0
      || question.physicalProviderCallCount !== question.logicalProviderCallCount)) {
      issues.push(`answered question ${question.questionId} must have one or two matching logical and physical calls`);
    }
    if (!Number.isSafeInteger(question.sourceCount) || question.sourceCount < 0 || question.sourceCount > 5
      || !question.sourceOwnershipVerified || !question.inputScopeVerified) {
      issues.push(`question ${question.questionId} source count/ownership/input scope authority is invalid`);
    }
  }
  for (const diagnosis of authority.diagnoses) {
    if (!HASH.test(diagnosis.identityHash) || !HASH.test(diagnosis.terminalFingerprint)) issues.push(`diagnosis ${diagnosis.questionId} has an invalid checkpoint hash`);
    if (diagnosis.physicalProviderCallCount > diagnosis.logicalProviderCallCount) issues.push(`diagnosis ${diagnosis.questionId} physical calls exceed logical calls`);
    if (diagnosis.state === "completed" && (diagnosis.logicalProviderCallCount === 0
      || diagnosis.physicalProviderCallCount !== diagnosis.logicalProviderCallCount)) {
      issues.push(`completed diagnosis ${diagnosis.questionId} must have one or two matching logical and physical calls`);
    }
    if (!Number.isSafeInteger(diagnosis.sourceAuditCount) || diagnosis.sourceAuditCount < 0 || diagnosis.sourceAuditCount > 5
      || !diagnosis.sourceAuditOwnershipVerified || !diagnosis.inputScopeVerified) {
      issues.push(`diagnosis ${diagnosis.questionId} source-audit count/ownership/input scope authority is invalid`);
    }
    const question = authority.questions.find((candidate) => candidate.questionId === diagnosis.questionId);
    if (question && diagnosis.sourceAuditCount !== question.sourceCount) issues.push(`diagnosis ${diagnosis.questionId} source-audit count must equal its question source count`);
  }
  const questionIds = authority.questions.map((question) => question.questionId);
  const diagnosisIds = authority.diagnoses.map((diagnosis) => diagnosis.questionId);
  if (authority.dispatch.enhancementJobId && !sameSet(questionIds, diagnosisIds)) issues.push("diagnosis question IDs must exactly equal question checkpoint IDs");
  const faultQuestion = authority.questions.find((question) => question.questionId === scenario.faultQuestionId);
  if (scenario.kind === "question_failure") {
    if (!faultQuestion || faultQuestion.state !== "unavailable" || faultQuestion.logicalProviderCallCount !== 2 || faultQuestion.physicalProviderCallCount !== 0) {
      issues.push("question_failure target must be unavailable with two logical and zero physical provider calls");
    }
    if (authority.questions.filter((question) => question.questionId !== scenario.faultQuestionId && question.state === "answered").length !== 2) {
      issues.push("question_failure must retain exactly two answered sibling questions");
    }
  } else if (authority.questions.some((question) => question.state !== "answered")) {
    issues.push(`${scenario.kind} must have exactly three answered questions`);
  }
  const faultDiagnosis = authority.diagnoses.find((diagnosis) => diagnosis.questionId === scenario.faultQuestionId);
  if (scenario.kind === "diagnosis_failure") {
    if (!faultDiagnosis || faultDiagnosis.state !== "failed" || faultDiagnosis.logicalProviderCallCount !== 2 || faultDiagnosis.physicalProviderCallCount !== 0) {
      issues.push("diagnosis_failure target must be failed with two logical and zero physical provider calls");
    }
    if (authority.diagnoses.filter((diagnosis) => diagnosis.questionId !== scenario.faultQuestionId && diagnosis.state === "completed").length !== 2) {
      issues.push("diagnosis_failure must retain two completed sibling diagnoses");
    }
  } else if (scenario.kind === "success" && authority.diagnoses.some((diagnosis) => diagnosis.state !== "completed")) {
    issues.push("success must have exactly three completed diagnoses");
  }
}

function verifyDispatchAndCrawl(
  scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const dispatchUnits = [authority.dispatch.preAdmissionJobId, authority.dispatch.coreJobId,
    ...(authority.dispatch.enhancementJobId ? [authority.dispatch.enhancementJobId] : [])];
  for (const unitId of dispatchUnits) exactEvent(events, { kind: "v4_dispatch", operation: "v4_dispatch", unitId, attempt: 0, phase: "observed" }, issues);
  const crawlStart = exactEvent(events, { kind: "crawl_run", operation: "crawl", unitId: authority.crawl.unitId, attempt: 0, phase: "started" }, issues);
  const crawlComplete = exactEvent(events, { kind: "crawl_run", operation: "crawl", unitId: authority.crawl.unitId, attempt: 0, phase: "completed" }, issues);
  verifyCrawlDetails(crawlStart, authority, "started", issues);
  verifyCrawlDetails(crawlComplete, authority, "completed", issues);
  if (events.some((event) => event.kind === "crawl_run" && event.phase === "failed")) issues.push("sealed scenario cannot contain a failed crawl terminal");
  before(findOne(events, "v4_dispatch", authority.dispatch.preAdmissionJobId, "observed"), crawlStart, "pre-admission dispatch must precede crawl", issues);
  before(crawlStart, crawlComplete, "crawl started must precede completed", issues);
  const coreDispatch = findOne(events, "v4_dispatch", authority.dispatch.coreJobId, "observed");
  before(crawlComplete, coreDispatch, "crawl completion must precede Core dispatch", issues);
  if (coreDispatch && coreDispatch.occurredAt.getTime() < authority.paidAt.getTime()) issues.push("Core dispatch timestamp must not precede paidAt");
  if (crawlStart && crawlComplete) {
    const crawlDuration = elapsed(crawlStart, crawlComplete);
    if (crawlDuration < 0) issues.push("fresh crawl timestamps are reversed");
    else if (crawlDuration > TEN_MINUTES) issues.push("fresh crawl exceeded 10 minutes");
  }
  if (scenario.preAdmissionJobId && authority.crawl.unitId !== `pre-admission-crawl:${scenario.preAdmissionJobId}`) issues.push("crawl unit does not match exact pre-admission job");
}

function verifySiteReads(
  scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const required = new Set(authority.requiredSiteReads.map(siteReadKey));
  const observedClaims: ReportV4ExpectedSiteRead[] = [];
  for (const expected of authority.allowedSiteReads) {
    const operation = expected.mode === "raw" ? "site_raw_read" : "site_browser_read";
    const present = events.some((event) => event.kind === "site_read" && event.operation === operation
      && event.unitId === expected.unitId && event.attempt === expected.attempt);
    if (!present && !required.has(siteReadKey(expected))) continue;
    const requiredClaim = authority.requiredSiteReads.find((candidate) => siteReadKey(candidate) === siteReadKey(expected));
    const terminalMatches = events.filter((event) => event.kind === "site_read" && event.operation === operation
      && event.unitId === expected.unitId && event.attempt === expected.attempt && (event.phase === "completed" || event.phase === "failed"));
    const terminalPhase = requiredClaim?.terminalPhase ?? (terminalMatches[0]?.phase === "failed" ? "failed" : "completed");
    const started = exactEvent(events, { kind: "site_read", operation, unitId: expected.unitId, attempt: expected.attempt, phase: "started" }, issues);
    if (terminalMatches.length !== 1) issues.push(`site read ${expected.unitId}/${expected.mode} must have exactly one completed-or-failed terminal`);
    const terminal = exactEvent(events, { kind: "site_read", operation, unitId: expected.unitId, attempt: expected.attempt, phase: terminalPhase }, issues);
    verifySiteDetails(started, expected, issues);
    verifySiteDetails(terminal, expected, issues);
    before(started, terminal, `site read ${expected.unitId}/${expected.mode} started must precede terminal`, issues);
    observedClaims.push({ ...expected, terminalPhase });
  }
  const pairs = new Map<string, ReportV4ExpectedSiteRead[]>();
  for (const expected of observedClaims) {
    const group = pairs.get(expected.pairBindingHash) ?? [];
    group.push(expected);
    pairs.set(expected.pairBindingHash, group);
  }
  const allowedKeys = new Set(authority.allowedSiteReads.map(siteReadKey));
  for (const event of events.filter((candidate) => candidate.kind === "site_read" && candidate.phase === "started")) {
    const mode = event.operation === "site_raw_read" ? "raw" : event.operation === "site_browser_read" ? "browser" : null;
    const key = mode ? `${event.unitId}|${mode}|${event.attempt}` : "";
    if (!allowedKeys.has(key)) issues.push(`observed site read ${event.unitId}/${event.operation} is outside DB-derived allowed authority`);
  }
  const crawlStart = findOne(events, "crawl_run", authority.crawl.unitId, "started");
  const crawlComplete = findOne(events, "crawl_run", authority.crawl.unitId, "completed");
  const enhancementDispatch = authority.dispatch.enhancementJobId
    ? findOne(events, "v4_dispatch", authority.dispatch.enhancementJobId, "observed") : undefined;
  for (const expected of observedClaims) {
    const operation = expected.mode === "raw" ? "site_raw_read" : "site_browser_read";
    const started = findOne(events, "site_read", expected.unitId, "started", operation, expected.attempt);
    const terminal = findOne(events, "site_read", expected.unitId, expected.terminalPhase, operation, expected.attempt);
    if (expected.attempt === 0) {
      before(crawlStart, started, `admission site read ${expected.unitId} must follow crawl start`, issues);
      before(terminal, crawlComplete, `admission site read ${expected.unitId} must finish before crawl completion`, issues);
    } else {
      before(enhancementDispatch, started, `enhancement source read ${expected.unitId} must follow enhancement dispatch`, issues);
    }
  }
  for (const [pairBindingHash, claims] of pairs) {
    const raw = claims.filter((claim) => claim.mode === "raw");
    const browser = claims.filter((claim) => claim.mode === "browser");
    if (raw.length !== 1 || browser.length > 1) issues.push(`site-read pair ${pairBindingHash} must contain exactly one raw and at most one browser claim`);
    if (new Set(claims.map((claim) => claim.urlHash)).size !== 1) issues.push(`site-read pair ${pairBindingHash} raw/browser URL hashes must match`);
    if (raw[0] && browser[0]) {
      before(findOne(events, "site_read", raw[0].unitId, raw[0].terminalPhase, "site_raw_read"),
        findOne(events, "site_read", browser[0].unitId, "started", "site_browser_read"),
        `site-read pair ${pairBindingHash} browser claim must follow raw terminal`, issues);
    }
  }
  if (scenario.kind === "success" && authority.sourceFaultZeroClaim) {
    const faultUnit = authority.sourceFaultZeroClaim.unitId;
    if (events.some((event) => event.kind === "site_read" && event.unitId === faultUnit)) issues.push("source-fault target must have zero physical site-read events");
    if (authority.sourceFaultZeroClaim.physicalClaimCount !== 0 || !authority.sourceFaultZeroClaim.injectedBeforeClaim) issues.push("source-fault DB authority must prove injection before a zero claim");
    const fault = events.filter((event) => event.kind === "fault_injection" && event.unitId === faultUnit && event.phase === "consumed");
    if (fault.length !== 1) issues.push("source-fault target must have exactly one consumed fault event");
  }
}

function verifyCoreModels(
  scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const coreDispatch = findOne(events, "v4_dispatch", authority.dispatch.coreJobId, "observed");
  for (const pageId of authority.analyzablePageIds) {
    const pair = verifyAllowedModelAttempt(events, "page_analysis", pageId, 1, "completed", issues);
    before(coreDispatch, pair.started, `Core dispatch must precede page ${pageId}`, issues);
  }
  const synthesis = verifyAllowedModelAttempt(events, "website_synthesis", authority.websiteSynthesisUnitId, 1, "completed", issues);
  for (const pageId of authority.analyzablePageIds) {
    before(findOne(events, "model_operation", pageId, "completed", "page_analysis", 1), synthesis.started,
      `page ${pageId} completion must precede website synthesis start`, issues);
  }
  before(coreDispatch, synthesis.started, "Core dispatch must precede website synthesis", issues);
  if (scenario.kind === "question_failure") {
    const target = authority.questions.find((question) => question.questionId === scenario.faultQuestionId);
    if (target && events.some((event) => event.kind === "model_operation" && event.operation === "question_answer" && event.unitId === target.questionId)) {
      issues.push("faulted question must have zero physical model events");
    }
  }
}

function verifyCheckpoints(
  scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const coreDispatch = findOne(events, "v4_dispatch", authority.dispatch.coreJobId, "observed");
  for (const question of authority.questions) {
    verifyProviderAttempts(events, "question_answer", question.questionId, question.state === "answered" ? "completed" : "failed",
      question.physicalProviderCallCount, issues);
    const terminal = exactEvent(events, { kind: "checkpoint_terminal", operation: "question_answer", unitId: question.identityHash, attempt: 0, phase: "observed" }, issues);
    verifyCheckpointDetails(terminal, question.terminalFingerprint, question.state, `question ${question.questionId}`, issues);
    before(coreDispatch, terminal, `Core dispatch must precede question checkpoint ${question.questionId}`, issues);
    for (let attempt = 1; attempt <= question.physicalProviderCallCount; attempt += 1) {
      before(coreDispatch, findOne(events, "model_operation", question.questionId, "started", "question_answer", attempt),
        `Core dispatch must precede question ${question.questionId} provider work`, issues);
    }
    if (question.physicalProviderCallCount > 0) {
      const finalPhase = question.state === "answered" ? "completed" : "failed";
      before(findOne(events, "model_operation", question.questionId, finalPhase, "question_answer", question.physicalProviderCallCount),
        terminal, `question ${question.questionId} provider terminal must precede its checkpoint`, issues);
    }
  }
  const enhancementDispatch = authority.dispatch.enhancementJobId
    ? findOne(events, "v4_dispatch", authority.dispatch.enhancementJobId, "observed") : undefined;
  for (const diagnosis of authority.diagnoses) {
    const unitId = `${authority.dispatch.enhancementJobId}:${diagnosis.questionId}`;
    verifyProviderAttempts(events, "source_diagnosis", unitId, diagnosis.state === "completed" ? "completed" : "failed",
      diagnosis.physicalProviderCallCount, issues);
    const terminal = exactEvent(events, { kind: "checkpoint_terminal", operation: "source_diagnosis", unitId: diagnosis.identityHash, attempt: 0, phase: "observed" }, issues);
    verifyCheckpointDetails(terminal, diagnosis.terminalFingerprint, diagnosis.state, `diagnosis ${diagnosis.questionId}`, issues);
    before(enhancementDispatch, terminal, `enhancement dispatch must precede diagnosis checkpoint ${diagnosis.questionId}`, issues);
    for (let attempt = 1; attempt <= diagnosis.physicalProviderCallCount; attempt += 1) {
      before(enhancementDispatch, findOne(events, "model_operation", unitId, "started", "source_diagnosis", attempt),
        `enhancement dispatch must precede diagnosis ${diagnosis.questionId} provider work`, issues);
    }
    if (diagnosis.physicalProviderCallCount > 0) {
      const finalPhase = diagnosis.state === "completed" ? "completed" : "failed";
      before(findOne(events, "model_operation", unitId, finalPhase, "source_diagnosis", diagnosis.physicalProviderCallCount),
        terminal, `diagnosis ${diagnosis.questionId} provider terminal must precede its checkpoint`, issues);
    }
    const diagnosisStart = diagnosis.physicalProviderCallCount > 0
      ? findOne(events, "model_operation", unitId, "started", "source_diagnosis", 1) : terminal;
    for (const read of authority.allowedSiteReads.filter((candidate) => candidate.attempt === 1
      && candidate.unitId.startsWith(`${authority.dispatch.enhancementJobId}:${diagnosis.questionId}:`))) {
      const operation = read.mode === "raw" ? "site_raw_read" : "site_browser_read";
      const terminalRead = events.find((event) => event.kind === "site_read" && event.operation === operation
        && event.unitId === read.unitId && (event.phase === "completed" || event.phase === "failed"));
      if (terminalRead) before(terminalRead, diagnosisStart, `source read ${read.unitId} must precede its diagnosis`, issues);
    }
  }
  const faultEvents = events.filter((event) => event.kind === "fault_injection" && event.operation === scenario.faultKind);
  const owningDispatch = scenario.kind === "question_failure" ? coreDispatch : enhancementDispatch;
  const targetCheckpoint = scenario.kind === "question_failure"
    ? findOne(events, "checkpoint_terminal", authority.questions.find((question) => question.questionId === scenario.faultQuestionId)?.identityHash ?? "", "observed")
    : findOne(events, "checkpoint_terminal", authority.diagnoses.find((diagnosis) => diagnosis.questionId === scenario.faultQuestionId)?.identityHash ?? "", "observed");
  for (const fault of faultEvents) {
    before(owningDispatch, fault, "fault consumption must follow owning lane dispatch", issues);
    before(fault, targetCheckpoint, "fault consumption must precede target terminal checkpoint", issues);
    if (scenario.kind === "success") {
      before(fault, findOne(events, "model_operation", `${authority.dispatch.enhancementJobId}:${scenario.faultQuestionId}`,
        "started", "source_diagnosis", 1), "source fault consumption must precede target diagnosis provider start", issues);
    }
  }
  if (scenario.kind === "diagnosis_failure") {
    const unitId = `${authority.dispatch.enhancementJobId}:${scenario.faultQuestionId}`;
    if (events.some((event) => event.kind === "model_operation" && event.operation === "source_diagnosis" && event.unitId === unitId)) {
      issues.push("faulted diagnosis must have zero physical model events");
    }
  }
}

function verifyProviderAttempts(
  events: readonly ReportV4AcceptanceEvent[],
  operation: "question_answer" | "source_diagnosis",
  unitId: string,
  finalPhase: "completed" | "failed",
  count: 0 | 1 | 2,
  issues: string[]
): void {
  const starts = events.filter((event) => event.kind === "model_operation" && event.operation === operation && event.unitId === unitId && event.phase === "started");
  if (starts.length !== count) issues.push(`${operation}/${unitId} physical provider starts must equal authority count ${count}`);
  if (count === 0) return;
  const firstTerminal = count === 2 ? "failed" : finalPhase;
  verifyAllowedModelAttempt(events, operation, unitId, 1, firstTerminal, issues);
  if (count === 2) {
    const firstFailed = findOne(events, "model_operation", unitId, "failed", operation, 1);
    const second = verifyAllowedModelAttempt(events, operation, unitId, 2, finalPhase, issues);
    before(firstFailed, second.started, `${operation}/${unitId} retry must follow attempt 1 failure`, issues);
  }
}

function verifyTokenProbe(
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const realUnits = new Set([...authority.analyzablePageIds, authority.websiteSynthesisUnitId,
    ...authority.questions.map((question) => question.questionId),
    ...authority.diagnoses.map((diagnosis) => `${authority.dispatch.enhancementJobId}:${diagnosis.questionId}`)]);
  if (realUnits.has(authority.oversizedTokenProbe.unitId)) issues.push("oversized token probe must not alias a real model unit");
  const expected = authority.oversizedTokenProbe;
  for (const key of ["estimatedSystemTokens", "estimatedInputTokens", "reservedOutputTokens", "providerSafetyMarginTokens"] as const) {
    if (!Number.isSafeInteger(expected[key]) || expected[key] < 0) issues.push(`oversized token probe ${key} must be a nonnegative integer`);
  }
  for (const key of ["maxInputTokens", "maxOutputTokens", "contextWindowTokens"] as const) {
    if (!Number.isSafeInteger(expected[key]) || expected[key] <= 0) issues.push(`oversized token probe ${key} must be a positive integer`);
  }
  // Exact evaluateModelTokenBudget formula: system tokens do not count toward
  // maxInputTokens, but system and safety both count toward the context window.
  const estimatedTotal = expected.estimatedSystemTokens + expected.estimatedInputTokens
    + expected.reservedOutputTokens + expected.providerSafetyMarginTokens;
  const overLimit = expected.estimatedInputTokens > expected.maxInputTokens
    || expected.reservedOutputTokens > expected.maxOutputTokens
    || estimatedTotal > expected.contextWindowTokens;
  if (!overLimit) issues.push("oversized token probe authority must prove a positive configured-limit violation");
  const started = exactEvent(events, { kind: "model_operation", operation: expected.operation, unitId: expected.unitId, attempt: 0, phase: "started" }, issues);
  const rejected = exactEvent(events, { kind: "model_operation", operation: expected.operation, unitId: expected.unitId, attempt: 0, phase: "rejected" }, issues);
  before(findOne(events, "v4_dispatch", authority.dispatch.coreJobId, "observed"), started,
    "Core dispatch must precede oversized token probe", issues);
  for (const event of [started, rejected]) {
    const details = detailRecord(event);
    if (details?.providerCall !== false || details.retry !== false || details.budgetOutcome !== "rejected"
      || details.inputTokens !== expected.estimatedSystemTokens + expected.estimatedInputTokens
      || details.outputTokens !== expected.reservedOutputTokens) {
      issues.push("oversized token probe must match recomputed estimates with providerCall=false, retry=false, budgetOutcome=rejected");
    }
  }
  before(started, rejected, "oversized token probe started must precede rejected", issues);
}

function verifyArtifacts(
  scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const coreHtml = verifyArtifactPair(events, "core_html", authority.coreArtifact, issues);
  const coreActivation = verifyActivation(events, authority.coreArtifact, issues);
  const coreDispatch = findOne(events, "v4_dispatch", authority.dispatch.coreJobId, "observed");
  before(coreDispatch, coreHtml.started, "Core dispatch must precede Core HTML", issues);
  for (const event of events.filter((candidate) => (candidate.kind === "model_operation" || candidate.kind === "checkpoint_terminal")
    && candidate.operation !== "source_diagnosis" && candidate.phase !== "rejected")) {
    before(event, coreHtml.started, "Core model/checkpoint work must precede Core HTML", issues);
  }
  before(coreHtml.completed, coreActivation, "Core HTML completion must precede activation", issues);

  if (authority.dispatch.enhancementJobId) {
    const enhancementDispatch = findOne(events, "v4_dispatch", authority.dispatch.enhancementJobId, "observed");
    before(coreActivation, enhancementDispatch, "Core activation must precede enhancement dispatch", issues);
  }
  if (authority.enhancementArtifact?.active) {
    const enhancementHtml = verifyArtifactPair(events, "enhancement_html", authority.enhancementArtifact, issues);
    const activation = verifyActivation(events, authority.enhancementArtifact, issues);
    const dispatch = findOne(events, "v4_dispatch", authority.dispatch.enhancementJobId!, "observed");
    before(dispatch, enhancementHtml.started, "enhancement dispatch must precede enhancement HTML", issues);
    for (const event of events.filter((candidate) => (candidate.kind === "site_read" || candidate.operation === "source_diagnosis")
      && candidate.phase !== "started")) before(event, enhancementHtml.started, "enhancement work must precede enhancement HTML", issues);
    before(enhancementHtml.completed, activation, "enhancement HTML completion must precede activation", issues);
  } else if (events.some((event) => event.kind === "html_assembly" && event.operation === "enhancement_html"
      || event.kind === "artifact_activation" && event.unitId === authority.enhancementArtifact?.revisionId)) {
    issues.push("enhancement-owned HTML/activation events are forbidden when authority is not active");
  }
  if (scenario.kind === "question_failure" && events.some(isEnhancementOwned)) issues.push("question_failure contains enhancement-owned events");
}

function verifyCommerce(
  scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const comparison = authority.commerce.comparison;
  for (const [label, unitId, fingerprint] of [
    ["baseline", authority.commerce.baselineUnitId, comparison.baselineFingerprint],
    ["final", authority.commerce.finalUnitId, comparison.finalFingerprint]
  ] as const) {
    const event = exactEvent(events, { kind: "commerce_fingerprint", operation: "commerce", unitId, attempt: 0, phase: "observed" }, issues);
    if (detailRecord(event)?.fingerprint !== fingerprint) issues.push(`commerce ${label} fingerprint mismatch`);
  }
  if (comparison.finalFingerprint !== scenario.finalFingerprint) issues.push("final commerce fingerprint is not bound to sealed scenario");
  const baseline = findOne(events, "commerce_fingerprint", authority.commerce.baselineUnitId, "observed");
  const final = findOne(events, "commerce_fingerprint", authority.commerce.finalUnitId, "observed");
  const coreActivation = findOne(events, "artifact_activation", authority.coreArtifact.revisionId, "observed");
  before(coreActivation, baseline, "commerce baseline must follow Core activation", issues);
  before(baseline, final, "commerce baseline must precede final", issues);
  if (authority.dispatch.enhancementJobId && authority.enhancementArtifact) {
    const enhancementDispatch = findOne(events, "v4_dispatch", authority.dispatch.enhancementJobId, "observed");
    const enhancementActivation = findOne(events, "artifact_activation", authority.enhancementArtifact.revisionId, "observed");
    before(baseline, enhancementDispatch, "commerce baseline must precede enhancement dispatch/work", issues);
    before(enhancementActivation, final, "commerce final must follow enhancement activation", issues);
  } else {
    before(coreActivation, final, "commerce final must follow Core activation", issues);
  }
}

function verifyNoExtraSemanticEvents(
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const allowed = new Set<string>();
  const add = (kind: string, operation: string, unit: string, attempt: number, ...phases: string[]) =>
    phases.forEach((phase) => allowed.add(`${kind}|${operation}|${unit}|${attempt}|${phase}`));
  for (const unit of [authority.dispatch.preAdmissionJobId, authority.dispatch.coreJobId,
    ...(authority.dispatch.enhancementJobId ? [authority.dispatch.enhancementJobId] : [])]) add("v4_dispatch", "v4_dispatch", unit, 0, "observed");
  add("crawl_run", "crawl", authority.crawl.unitId, 0, "started", "completed");
  authority.allowedSiteReads.forEach((read) => add("site_read", read.mode === "raw" ? "site_raw_read" : "site_browser_read", read.unitId, read.attempt, "started", "completed", "failed"));
  authority.analyzablePageIds.forEach((unit) => add("model_operation", "page_analysis", unit, 1, "started", "completed"));
  add("model_operation", "website_synthesis", authority.websiteSynthesisUnitId, 1, "started", "completed");
  for (const question of authority.questions) addProviderKeys(add, "question_answer", question.questionId, question.physicalProviderCallCount, question.state === "answered" ? "completed" : "failed");
  for (const diagnosis of authority.diagnoses) addProviderKeys(add, "source_diagnosis", `${authority.dispatch.enhancementJobId}:${diagnosis.questionId}`, diagnosis.physicalProviderCallCount, diagnosis.state === "completed" ? "completed" : "failed");
  add("model_operation", authority.oversizedTokenProbe.operation, authority.oversizedTokenProbe.unitId, 0, "started", "rejected");
  authority.questions.forEach((question) => add("checkpoint_terminal", "question_answer", question.identityHash, 0, "observed"));
  authority.diagnoses.forEach((diagnosis) => add("checkpoint_terminal", "source_diagnosis", diagnosis.identityHash, 0, "observed"));
  add("html_assembly", "core_html", authority.coreArtifact.revisionId, 0, "started", "completed");
  add("artifact_activation", "artifact_activation", authority.coreArtifact.revisionId, 0, "observed");
  if (authority.enhancementArtifact?.active) {
    add("html_assembly", "enhancement_html", authority.enhancementArtifact.revisionId, 0, "started", "completed");
    add("artifact_activation", "artifact_activation", authority.enhancementArtifact.revisionId, 0, "observed");
  }
  add("commerce_fingerprint", "commerce", authority.commerce.baselineUnitId, 0, "observed");
  add("commerce_fingerprint", "commerce", authority.commerce.finalUnitId, 0, "observed");
  const checkedKinds = new Set(["v4_dispatch", "crawl_run", "site_read", "model_operation", "checkpoint_terminal",
    "html_assembly", "artifact_activation", "commerce_fingerprint", "prohibited_operation"]);
  for (const event of events) {
    const key = `${event.kind}|${event.operation}|${event.unitId}|${event.attempt}|${event.phase}`;
    if (checkedKinds.has(event.kind) && !allowed.has(key)) issues.push(`extra or unowned semantic event ${key}`);
  }
}

function verifyTiming(
  _scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  authority: ReportV4AcceptanceSemanticAuthority,
  issues: string[]
): void {
  const coreActivation = findOne(events, "artifact_activation", authority.coreArtifact.revisionId, "observed");
  const crawlComplete = findOne(events, "crawl_run", authority.crawl.unitId, "completed");
  if (crawlComplete && crawlComplete.occurredAt.getTime() > authority.paidAt.getTime()) issues.push("admission crawl completion must not occur after paidAt");
  if (coreActivation) {
    const paidDuration = elapsedFrom(authority.paidAt, coreActivation);
    if (paidDuration < 0) issues.push("Core activation timestamp precedes paidAt");
    else if (paidDuration > FIVE_MINUTES) issues.push("paidAt to Core activation exceeded 5 minutes");
  }
  if (authority.enhancementArtifact?.active) {
    const enhancementActivation = findOne(events, "artifact_activation", authority.enhancementArtifact.revisionId, "observed");
    if (coreActivation && enhancementActivation) {
      const enhancementDuration = elapsed(coreActivation, enhancementActivation);
      if (enhancementDuration < 0) issues.push("enhancement activation timestamp precedes Core activation");
      else if (enhancementDuration > TEN_MINUTES) issues.push("Core to enhancement activation exceeded 10 minutes");
    }
  }
}

function verifyAllowedModelAttempt(
  events: readonly ReportV4AcceptanceEvent[],
  operation: "page_analysis" | "website_synthesis" | "question_answer" | "source_diagnosis",
  unitId: string,
  attempt: 1 | 2,
  terminalPhase: "completed" | "failed",
  issues: string[]
): { started?: ReportV4AcceptanceEvent; terminal?: ReportV4AcceptanceEvent } {
  const started = exactEvent(events, { kind: "model_operation", operation, unitId, attempt, phase: "started" }, issues);
  const terminal = exactEvent(events, { kind: "model_operation", operation, unitId, attempt, phase: terminalPhase }, issues);
  for (const event of [started, terminal]) {
    const details = detailRecord(event);
    if (details?.providerCall !== true || details.retry !== (attempt === 2) || details.budgetOutcome !== "allowed") {
      issues.push(`${operation}/${unitId}/attempt${attempt} must be providerCall=true, retry=${attempt === 2}, budgetOutcome=allowed`);
    }
    if (!Number.isSafeInteger(details?.inputTokens) || Number(details?.inputTokens) < 0
      || !Number.isSafeInteger(details?.outputTokens) || Number(details?.outputTokens) < 0) issues.push(`${operation}/${unitId} token estimates must be nonnegative integers`);
  }
  before(started, terminal, `${operation}/${unitId}/attempt${attempt} started must precede terminal`, issues);
  return { started, terminal };
}

function verifyArtifactPair(
  events: readonly ReportV4AcceptanceEvent[],
  operation: "core_html" | "enhancement_html",
  artifact: { readonly revisionId: string; readonly htmlSha256: string },
  issues: string[]
): { started?: ReportV4AcceptanceEvent; completed?: ReportV4AcceptanceEvent } {
  const started = exactEvent(events, { kind: "html_assembly", operation, unitId: artifact.revisionId, attempt: 0, phase: "started" }, issues);
  const completed = exactEvent(events, { kind: "html_assembly", operation, unitId: artifact.revisionId, attempt: 0, phase: "completed" }, issues);
  for (const event of [started, completed]) verifyArtifactDetails(event, artifact, `${operation} ${artifact.revisionId}`, issues);
  before(started, completed, `${operation} started must precede completed`, issues);
  return { started, completed };
}

function verifyActivation(
  events: readonly ReportV4AcceptanceEvent[],
  artifact: { readonly revisionId: string; readonly htmlSha256: string },
  issues: string[]
): ReportV4AcceptanceEvent | undefined {
  const event = exactEvent(events, { kind: "artifact_activation", operation: "artifact_activation", unitId: artifact.revisionId, attempt: 0, phase: "observed" }, issues);
  verifyArtifactDetails(event, artifact, `activation ${artifact.revisionId}`, issues);
  return event;
}

function verifyArtifactDetails(event: ReportV4AcceptanceEvent | undefined, artifact: { readonly revisionId: string; readonly htmlSha256: string }, label: string, issues: string[]): void {
  const details = detailRecord(event);
  if (details?.artifactRevisionId !== artifact.revisionId || details.htmlSha256 !== artifact.htmlSha256) issues.push(`${label} artifact ID or HTML hash mismatch`);
}

function verifyArtifactIntegrityAuthority(
  artifact: { readonly payloadIdentityHash: string; readonly recomputedPayloadIdentityHash: string; readonly integrityVerified: true },
  label: string,
  issues: string[]
): void {
  if (!HASH.test(artifact.payloadIdentityHash) || !HASH.test(artifact.recomputedPayloadIdentityHash)
    || artifact.payloadIdentityHash !== artifact.recomputedPayloadIdentityHash || !artifact.integrityVerified) {
    issues.push(`${label} artifact persisted/recomputed payload identity integrity proof is invalid`);
  }
}

function verifyCommerceComparison(
  comparison: ReportV4CommerceAuthorityComparison,
  scenario: ReportV4AcceptanceScenario,
  issues: string[]
): void {
  if (comparison.valid !== true) issues.push("commerce comparison must be valid");
  if (comparison.scenarioKind !== scenario.kind) issues.push("commerce comparison scenarioKind does not match scenario");
  if (comparison.violations.length !== 0) issues.push("commerce comparison must have no violations");
  const verifiedKeys = ["baselineFingerprint", "finalFingerprint", "distinctFingerprints", "captureOrder",
    "immutableLineage", "componentAuthority", "finalTopology"] as const;
  for (const key of verifiedKeys) if (comparison.verified[key] !== true) issues.push(`commerce comparison verified.${key} must be true`);
  const componentNames: readonly ReportV4CommerceComponentName[] = ["orders", "paymentEvents", "jobs", "dispatches",
    "accessKeys", "creditLedger", "refunds", "emailDeliveries", "emailEvents", "accessTokens", "artifacts",
    "questionCheckpoints", "diagnosisCheckpoints"];
  for (const name of componentNames) {
    const component = comparison.components[name];
    if (!component) {
      issues.push(`commerce comparison is missing component ${name}`);
      continue;
    }
    if (component.baseline.duplicateCount !== 0 || component.final.duplicateCount !== 0) {
      issues.push(`commerce comparison component ${name} contains duplicate authority rows`);
    }
    if (component.violations.length !== 0) issues.push(`commerce comparison component ${name} has violations`);
  }
}

function pageSummaryIdentitySetHash(summaries: readonly ReportV4ExpectedPageSummary[]): string {
  return createHash("sha256").update(JSON.stringify(summaries.map((summary) => summary.identityHash).sort())).digest("hex");
}

function verifyCrawlDetails(
  event: ReportV4AcceptanceEvent | undefined,
  authority: ReportV4AcceptanceSemanticAuthority,
  phase: "started" | "completed",
  issues: string[]
): void {
  const details = detailRecord(event);
  for (const key of ["candidatePages", "analyzablePages", "excludedPages", "jsDependentPages"] as const) {
    const expected = phase === "started" ? 0 : authority.crawl[key];
    if (details?.[key] !== expected) issues.push(`${phase} crawl ${key} does not match ${phase === "started" ? "fresh zero" : "explicit DB"} authority`);
  }
}

function verifySiteDetails(event: ReportV4AcceptanceEvent | undefined, expected: ReportV4AllowedSiteRead, issues: string[]): void {
  const details = detailRecord(event);
  if (details?.urlHash !== expected.urlHash || details.readMode !== expected.mode || details.networkPerformed !== true) issues.push(`site read ${expected.unitId}/${expected.mode} details mismatch`);
}

function verifyCheckpointDetails(event: ReportV4AcceptanceEvent | undefined, fingerprint: string, state: string, label: string, issues: string[]): void {
  const details = detailRecord(event);
  if (details?.checkpointHash !== fingerprint || details.state !== state) issues.push(`${label} terminal checkpoint state or fingerprint mismatch`);
}

function exactEvent(
  events: readonly ReportV4AcceptanceEvent[],
  expected: { kind: string; operation: string; unitId: string; attempt: number; phase: string },
  issues: string[]
): ReportV4AcceptanceEvent | undefined {
  const matches = events.filter((event) => event.kind === expected.kind && event.operation === expected.operation
    && event.unitId === expected.unitId && event.attempt === expected.attempt && event.phase === expected.phase);
  if (matches.length !== 1) issues.push(`${expected.kind}/${expected.operation}/${expected.unitId}/attempt${expected.attempt}/${expected.phase} must occur exactly once`);
  return matches[0];
}

function findOne(events: readonly ReportV4AcceptanceEvent[], kind: string, unitId: string, phase: string,
  operation?: string, attempt?: number): ReportV4AcceptanceEvent | undefined {
  return events.find((event) => event.kind === kind && event.unitId === unitId && event.phase === phase
    && (operation === undefined || event.operation === operation) && (attempt === undefined || event.attempt === attempt));
}

function detailRecord(event: ReportV4AcceptanceEvent | undefined): Record<string, unknown> | undefined {
  const value = event?.details;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function before(left: ReportV4AcceptanceEvent | undefined, right: ReportV4AcceptanceEvent | undefined, message: string, issues: string[]): void {
  if (left && right && left.sequence >= right.sequence) issues.push(message);
}

function elapsed(left: ReportV4AcceptanceEvent, right: ReportV4AcceptanceEvent): number {
  return right.occurredAt.getTime() - left.occurredAt.getTime();
}

function elapsedFrom(left: Date, right: ReportV4AcceptanceEvent): number {
  return right.occurredAt.getTime() - left.getTime();
}

function addProviderKeys(
  add: (kind: string, operation: string, unit: string, attempt: number, ...phases: string[]) => void,
  operation: string,
  unitId: string,
  count: 0 | 1 | 2,
  finalPhase: "completed" | "failed"
): void {
  if (count >= 1) add("model_operation", operation, unitId, 1, "started", count === 2 ? "failed" : finalPhase);
  if (count === 2) add("model_operation", operation, unitId, 2, "started", finalPhase);
}

function isEnhancementOwned(event: ReportV4AcceptanceEvent): boolean {
  return event.operation === "source_diagnosis" || event.operation === "enhancement_html"
    || event.kind === "site_read" && event.attempt === 1;
}

function unique(values: readonly string[], label: string, issues: string[]): void {
  if (values.some((value) => typeof value !== "string" || value.trim().length === 0)) issues.push(`${label} identifiers must be nonblank`);
  if (new Set(values).size !== values.length) issues.push(`${label} identifiers must be unique`);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function siteReadKey(read: Pick<ReportV4AllowedSiteRead, "unitId" | "mode" | "attempt">): string {
  return `${read.unitId}|${read.mode}|${read.attempt}`;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
