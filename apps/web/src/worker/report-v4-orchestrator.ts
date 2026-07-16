import {
  parseCombinedGeoReportV4,
  type CombinedGeoReportV4,
  type CombinedGeoReportV4Question,
  type CombinedGeoReportV4QuestionDiagnosis,
  type CombinedGeoReportV4Status,
  type CombinedGeoReportV4WebsiteSynthesis
} from "@open-geo-console/ai-report-engine";
import type {
  ActivateReportV4CoreRevisionInput,
  ActivateReportV4DiagnosisEnhancementInput,
  ReportV4DiagnosisEnhancementIdentity
} from "../db/report-v4-artifact-revisions";
import type {
  ReportV4SiteSnapshotBundle,
  ResolvePaidReportV4SiteSnapshotInput
} from "../db/report-v4-site-snapshots";
import type { ReportV4SourceAudit } from "./report-v4-source-audit";

export interface ReportV4OrchestratorQuestion {
  readonly order: 1 | 2 | 3;
  readonly questionId: string;
  readonly questionText: string;
}

export interface ReportV4OrchestratorInput {
  readonly reportId: string;
  readonly orderId: string;
  readonly coreJobId: string;
  readonly coreArtifactRevisionId: string;
  readonly enhancementJobId: string;
  readonly enhancementArtifactRevisionId: string;
  readonly targetUrl: string;
  readonly locale: string;
  readonly snapshotIdentity: ResolvePaidReportV4SiteSnapshotInput;
  readonly questions: readonly [
    ReportV4OrchestratorQuestion,
    ReportV4OrchestratorQuestion,
    ReportV4OrchestratorQuestion
  ];
  readonly signal?: AbortSignal;
}

export interface ReportV4WebsiteSynthesisResult {
  readonly websiteSynthesis: CombinedGeoReportV4WebsiteSynthesis;
  readonly modelCalls: number;
}

export interface ReportV4OrchestratorAnswerResult {
  readonly questions: readonly [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question];
  readonly reusedQuestionIds: readonly string[];
  readonly modelCalls: number;
  readonly providerRetries: number;
}

export interface ReportV4OrchestratorSourceAuditResult {
  readonly sourceAudits: readonly ReportV4SourceAudit[];
  readonly rawReads: number;
  readonly browserReads: number;
}

export type ReportV4OrchestratorDiagnosisResult =
  | {
      readonly status: "completed";
      readonly diagnosis: CombinedGeoReportV4QuestionDiagnosis;
      readonly providerAttempts: 1 | 2;
    }
  | {
      readonly status: "failed";
      readonly providerAttempts: 0 | 1 | 2;
    };

export interface ReportV4PersistedHtmlIdentity {
  readonly payloadIdentityHash: string;
  readonly htmlSha256: string;
}

export interface ReportV4OrchestratorDependencies {
  readonly nowMs: () => number;
  readonly nowIso: () => string;
  readonly loadActiveArtifact: (input: {
    readonly reportId: string;
    readonly signal?: AbortSignal;
  }) => Promise<CombinedGeoReportV4 | null>;
  readonly resolveSnapshot: (input: {
    readonly identity: ResolvePaidReportV4SiteSnapshotInput;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4SiteSnapshotBundle>;
  readonly synthesizeWebsite: (input: {
    readonly snapshot: ReportV4SiteSnapshotBundle;
    readonly questions: ReportV4OrchestratorInput["questions"];
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4WebsiteSynthesisResult>;
  readonly answerQuestions: (input: {
    readonly snapshot: ReportV4SiteSnapshotBundle;
    readonly questions: ReportV4OrchestratorInput["questions"];
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4OrchestratorAnswerResult>;
  readonly renderHtml: (input: {
    readonly stage: "core" | "enhancement";
    readonly report: CombinedGeoReportV4;
    readonly signal?: AbortSignal;
  }) => Promise<string>;
  readonly persistArtifact: (input: {
    readonly stage: "core" | "enhancement";
    readonly report: CombinedGeoReportV4;
    readonly html: string;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4PersistedHtmlIdentity>;
  readonly activateCoreRevision: (
    input: ActivateReportV4CoreRevisionInput,
    signal?: AbortSignal
  ) => Promise<unknown>;
  readonly auditQuestionSources: (input: {
    readonly question: CombinedGeoReportV4Question;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4OrchestratorSourceAuditResult>;
  readonly diagnoseQuestion: (input: {
    readonly question: CombinedGeoReportV4Question;
    readonly sourceAudits: readonly ReportV4SourceAudit[];
    readonly snapshot: ReportV4SiteSnapshotBundle;
    readonly locale: string;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4OrchestratorDiagnosisResult>;
  readonly prepareEnhancementRevision: (
    input: ReportV4DiagnosisEnhancementIdentity,
    signal?: AbortSignal
  ) => Promise<unknown>;
  readonly activateEnhancementRevision: (
    input: ActivateReportV4DiagnosisEnhancementInput,
    signal?: AbortSignal
  ) => Promise<unknown>;
}

export interface ReportV4OrchestratorCounters {
  readonly pages: {
    readonly candidate: number;
    readonly analyzable: number;
    readonly excluded: number;
    readonly jsDependent: number;
  };
  readonly modelCalls: {
    readonly websiteSynthesis: number;
    readonly questionAnswer: number;
    readonly sourceDiagnosis: number;
    readonly total: number;
  };
  readonly providerRetries: {
    readonly questionAnswer: number;
    readonly sourceDiagnosis: number;
    readonly total: number;
  };
  readonly sourceReads: { readonly raw: number; readonly browser: number };
  readonly reusedQuestionCheckpoints: number;
  readonly revisions: {
    readonly coreActivated: number;
    readonly enhancementActivated: number;
    readonly coreRevisionId: string | null;
    readonly enhancementRevisionId: string | null;
    readonly activeRevisionId: string | null;
  };
  readonly wholeReportReruns: 0;
  readonly pdfOperations: 0;
}

export interface ReportV4OrchestratorTimings {
  readonly total: number;
  readonly activeArtifactLookup: number;
  readonly snapshotResolution: number;
  readonly websiteSynthesis: number;
  readonly questionAnswer: number;
  readonly coreDelivery: number;
  readonly sourceAudit: number;
  readonly diagnosis: number;
  readonly enhancementDelivery: number;
}

export interface ReportV4OrchestratorResult {
  readonly status: CombinedGeoReportV4Status;
  readonly delivery: "unavailable" | "core_active" | "enhancement_active";
  readonly coreReport: CombinedGeoReportV4 | null;
  readonly activeReport: CombinedGeoReportV4 | null;
  readonly enhancement: {
    readonly status: "not_started" | "completed" | "failed";
    readonly completedQuestionIds: readonly string[];
    readonly failedQuestionIds: readonly string[];
  };
  readonly counters: ReportV4OrchestratorCounters;
  readonly timingsMs: ReportV4OrchestratorTimings;
}

interface MutableCounters {
  pages: { candidate: number; analyzable: number; excluded: number; jsDependent: number };
  modelCalls: { websiteSynthesis: number; questionAnswer: number; sourceDiagnosis: number };
  providerRetries: { questionAnswer: number; sourceDiagnosis: number };
  sourceReads: { raw: number; browser: number };
  reusedQuestionCheckpoints: number;
  revisions: { coreActivated: number; enhancementActivated: number };
}

interface MutableTimings {
  activeArtifactLookup: number;
  snapshotResolution: number;
  websiteSynthesis: number;
  questionAnswer: number;
  coreDelivery: number;
  sourceAudit: number;
  diagnosis: number;
  enhancementDelivery: number;
}

type EnhancementUnit =
  | {
      readonly status: "completed";
      readonly question: CombinedGeoReportV4Question;
      readonly diagnosis: CombinedGeoReportV4QuestionDiagnosis;
    }
  | { readonly status: "failed"; readonly questionId: string }
  | { readonly status: "skipped"; readonly questionId: string };

export async function runReportV4Orchestrator(
  input: ReportV4OrchestratorInput,
  dependencies: ReportV4OrchestratorDependencies
): Promise<ReportV4OrchestratorResult> {
  const parsedInput = parseInput(input);
  const signal = parsedInput.signal;
  const counters = emptyCounters();
  const timings = emptyTimings();
  const totalStartedAt = dependencies.nowMs();
  throwIfAborted(signal);

  const activeArtifact = await measured(dependencies, timings, "activeArtifactLookup", () => (
    dependencies.loadActiveArtifact({ reportId: parsedInput.reportId, signal })
  ));
  throwIfAborted(signal);
  const snapshot = await measured(dependencies, timings, "snapshotResolution", () => (
    dependencies.resolveSnapshot({ identity: parsedInput.snapshotIdentity, signal })
  ));
  throwIfAborted(signal);
  acceptSnapshot(snapshot, parsedInput);
  counters.pages = pageCounters(snapshot);

  if (activeArtifact) {
    const active = acceptActiveArtifact(activeArtifact, parsedInput);
    assertActiveArtifactRecovery(active, parsedInput, snapshot);
    if (active.artifactRevisionId === parsedInput.enhancementArtifactRevisionId) {
      return finish({
        input: parsedInput,
        dependencies,
        totalStartedAt,
        counters,
        timings,
        status: active.status,
        delivery: "enhancement_active",
        coreReport: null,
        activeReport: active,
        enhancement: {
          status: "completed",
          completedQuestionIds: active.questions.filter(({ diagnosis }) => diagnosis).map(({ questionId }) => questionId),
          failedQuestionIds: active.questions.filter(({ status, diagnosis }) => status === "answered" && !diagnosis).map(({ questionId }) => questionId)
        }
      });
    }
  }

  if (!isStandardResolvableSnapshot(snapshot)) {
    return finishUnavailable(parsedInput, dependencies, totalStartedAt, counters, timings);
  }

  let coreReport: CombinedGeoReportV4;
  if (activeArtifact) {
    coreReport = acceptCoreArtifact(activeArtifact, parsedInput);
  } else {
    const [websiteResult, answerResult] = await Promise.all([
      measured(dependencies, timings, "websiteSynthesis", () => dependencies.synthesizeWebsite({
        snapshot,
        questions: parsedInput.questions,
        signal
      })),
      measured(dependencies, timings, "questionAnswer", () => dependencies.answerQuestions({
        snapshot,
        questions: parsedInput.questions,
        signal
      }))
    ]);
    throwIfAborted(signal);
    counters.modelCalls.websiteSynthesis = nonnegativeInteger(websiteResult.modelCalls, "website synthesis model calls");
    counters.modelCalls.questionAnswer = nonnegativeInteger(answerResult.modelCalls, "question answer model calls");
    counters.providerRetries.questionAnswer = nonnegativeInteger(answerResult.providerRetries, "question provider retries");
    counters.reusedQuestionCheckpoints = uniqueKnownQuestionIds(
      answerResult.reusedQuestionIds,
      parsedInput.questions
    ).length;
    assertQuestionIdentity(answerResult.questions, parsedInput.questions);
    const status = coreStatus(snapshot, answerResult.questions);
    if (status === "unavailable") {
      return finishUnavailable(parsedInput, dependencies, totalStartedAt, counters, timings);
    }
    coreReport = buildReport({
      input: parsedInput,
      artifactRevisionId: parsedInput.coreArtifactRevisionId,
      status,
      generatedAt: dependencies.nowIso(),
      websiteSynthesis: websiteResult.websiteSynthesis,
      questions: answerResult.questions
    });
    await measured(dependencies, timings, "coreDelivery", async () => {
      const html = await dependencies.renderHtml({ stage: "core", report: coreReport, signal });
      throwIfAborted(signal);
      const identity = await dependencies.persistArtifact({ stage: "core", report: coreReport, html, signal });
      throwIfAborted(signal);
      await dependencies.activateCoreRevision({
        artifactRevisionId: parsedInput.coreArtifactRevisionId,
        reportId: parsedInput.reportId,
        orderId: parsedInput.orderId,
        jobId: parsedInput.coreJobId,
        payloadIdentityHash: identity.payloadIdentityHash,
        htmlSha256: identity.htmlSha256
      }, signal);
      throwIfAborted(signal);
    });
    counters.revisions.coreActivated = 1;
  }

  const enhancementUnits = await Promise.all(coreReport.questions.map((question) => enhanceQuestion({
    question,
    snapshot,
    locale: parsedInput.locale,
    signal,
    dependencies,
    counters,
    timings
  })));
  throwIfAborted(signal);
  const completed = enhancementUnits.filter((unit): unit is Extract<EnhancementUnit, { status: "completed" }> => unit.status === "completed");
  const failedQuestionIds = enhancementUnits
    .filter((unit): unit is Extract<EnhancementUnit, { status: "failed" }> => unit.status === "failed")
    .map(({ questionId }) => questionId);
  if (!completed.length) {
    return finish({
      input: parsedInput,
      dependencies,
      totalStartedAt,
      counters,
      timings,
      status: coreReport.status,
      delivery: "core_active",
      coreReport,
      activeReport: coreReport,
      enhancement: {
        status: "failed",
        completedQuestionIds: [],
        failedQuestionIds
      }
    });
  }

  const completedByQuestion = new Map(completed.map((unit) => [unit.question.questionId, unit]));
  const withDiagnosis = (question: CombinedGeoReportV4Question): CombinedGeoReportV4Question => {
    const unit = completedByQuestion.get(question.questionId);
    return unit ? { ...unit.question, diagnosis: unit.diagnosis } : question;
  };
  const enhancedQuestions: CombinedGeoReportV4["questions"] = [
    withDiagnosis(coreReport.questions[0]),
    withDiagnosis(coreReport.questions[1]),
    withDiagnosis(coreReport.questions[2])
  ];

  let enhancedReport: CombinedGeoReportV4;
  try {
    enhancedReport = buildReport({
      input: parsedInput,
      artifactRevisionId: parsedInput.enhancementArtifactRevisionId,
      status: deliverableStatus(coreReport.status, "active core"),
      generatedAt: dependencies.nowIso(),
      websiteSynthesis: coreReport.websiteSynthesis,
      questions: enhancedQuestions
    });
    await measured(dependencies, timings, "enhancementDelivery", async () => {
      const enhancementIdentity: ReportV4DiagnosisEnhancementIdentity = {
        artifactRevisionId: parsedInput.enhancementArtifactRevisionId,
        reportId: parsedInput.reportId,
        orderId: parsedInput.orderId,
        jobId: parsedInput.enhancementJobId,
        sourceArtifactRevisionId: parsedInput.coreArtifactRevisionId
      };
      await dependencies.prepareEnhancementRevision(enhancementIdentity, signal);
      throwIfAborted(signal);
      const html = await dependencies.renderHtml({ stage: "enhancement", report: enhancedReport, signal });
      throwIfAborted(signal);
      const identity = await dependencies.persistArtifact({ stage: "enhancement", report: enhancedReport, html, signal });
      throwIfAborted(signal);
      await dependencies.activateEnhancementRevision({
        ...enhancementIdentity,
        payloadIdentityHash: identity.payloadIdentityHash,
        htmlSha256: identity.htmlSha256
      }, signal);
      throwIfAborted(signal);
    });
    counters.revisions.enhancementActivated = 1;
  } catch {
    propagateAbort(signal);
    return finish({
      input: parsedInput,
      dependencies,
      totalStartedAt,
      counters,
      timings,
      status: coreReport.status,
      delivery: "core_active",
      coreReport,
      activeReport: coreReport,
      enhancement: {
        status: "failed",
        completedQuestionIds: completed.map(({ question }) => question.questionId),
        failedQuestionIds
      }
    });
  }

  return finish({
    input: parsedInput,
    dependencies,
    totalStartedAt,
    counters,
    timings,
    status: coreReport.status,
    delivery: "enhancement_active",
    coreReport,
    activeReport: enhancedReport,
    enhancement: {
      status: "completed",
      completedQuestionIds: completed.map(({ question }) => question.questionId),
      failedQuestionIds
    }
  });
}

async function enhanceQuestion(input: {
  question: CombinedGeoReportV4Question;
  snapshot: ReportV4SiteSnapshotBundle;
  locale: string;
  signal?: AbortSignal;
  dependencies: ReportV4OrchestratorDependencies;
  counters: MutableCounters;
  timings: MutableTimings;
}): Promise<EnhancementUnit> {
  if (input.question.status !== "answered") return { status: "skipped", questionId: input.question.questionId };
  let audit: ReportV4OrchestratorSourceAuditResult;
  try {
    audit = await measured(input.dependencies, input.timings, "sourceAudit", () => (
      input.dependencies.auditQuestionSources({ question: input.question, signal: input.signal })
    ), true);
  } catch {
    propagateAbort(input.signal);
    return { status: "failed", questionId: input.question.questionId };
  }
  input.counters.sourceReads.raw += nonnegativeInteger(audit.rawReads, "raw source reads");
  input.counters.sourceReads.browser += nonnegativeInteger(audit.browserReads, "browser source reads");
  let auditedQuestion: CombinedGeoReportV4Question;
  try {
    auditedQuestion = applySourceAudits(input.question, audit.sourceAudits);
  } catch {
    propagateAbort(input.signal);
    return { status: "failed", questionId: input.question.questionId };
  }

  let diagnosis: ReportV4OrchestratorDiagnosisResult;
  try {
    diagnosis = await measured(input.dependencies, input.timings, "diagnosis", () => (
      input.dependencies.diagnoseQuestion({
        question: auditedQuestion,
        sourceAudits: audit.sourceAudits,
        snapshot: input.snapshot,
        locale: input.locale,
        signal: input.signal
      })
    ), true);
  } catch {
    propagateAbort(input.signal);
    return { status: "failed", questionId: input.question.questionId };
  }
  const attempts = nonnegativeInteger(diagnosis.providerAttempts, "diagnosis provider attempts");
  if (attempts > 2) throw new Error("A V4 diagnosis cannot exceed two provider attempts.");
  input.counters.modelCalls.sourceDiagnosis += attempts;
  input.counters.providerRetries.sourceDiagnosis += Math.max(0, attempts - 1);
  return diagnosis.status === "completed"
    ? { status: "completed", question: auditedQuestion, diagnosis: diagnosis.diagnosis }
    : { status: "failed", questionId: input.question.questionId };
}

function applySourceAudits(
  question: CombinedGeoReportV4Question,
  audits: readonly ReportV4SourceAudit[]
): CombinedGeoReportV4Question {
  const sourcesById = new Map(question.sources.map((source) => [source.sourceId, source]));
  const bySource = new Map<string, ReportV4SourceAudit>();
  for (const audit of audits) {
    const source = sourcesById.get(audit.sourceId);
    if (!source || bySource.has(audit.sourceId) || audit.questionId !== question.questionId
      || audit.canonicalUrl !== source.canonicalUrl) {
      throw new Error("V4 source audit ownership does not match its question source.");
    }
    bySource.set(audit.sourceId, audit);
  }
  const sources = question.sources.map((source) => {
    const audit = bySource.get(source.sourceId);
    if (!audit) return source;
    return { ...source, retrievalStatus: audit.status };
  });
  return { ...question, sources };
}

function parseInput(input: ReportV4OrchestratorInput): ReportV4OrchestratorInput {
  const reportId = boundedText(input.reportId, "reportId", 500);
  if (input.snapshotIdentity.reportId !== reportId) throw new Error("V4 snapshot identity must belong to the report.");
  const questions: ReportV4OrchestratorInput["questions"] = [
    parseQuestionSpec(input.questions[0], 0),
    parseQuestionSpec(input.questions[1], 1),
    parseQuestionSpec(input.questions[2], 2)
  ];
  if (new Set(questions.map(({ questionId }) => questionId)).size !== 3) throw new Error("V4 question ids must be unique.");
  return {
    reportId,
    orderId: boundedText(input.orderId, "orderId", 500),
    coreJobId: boundedText(input.coreJobId, "coreJobId", 500),
    coreArtifactRevisionId: boundedText(input.coreArtifactRevisionId, "coreArtifactRevisionId", 500),
    enhancementJobId: boundedText(input.enhancementJobId, "enhancementJobId", 500),
    enhancementArtifactRevisionId: boundedText(input.enhancementArtifactRevisionId, "enhancementArtifactRevisionId", 500),
    targetUrl: publicUrl(input.targetUrl),
    locale: boundedText(input.locale, "locale", 100),
    snapshotIdentity: input.snapshotIdentity,
    questions,
    signal: input.signal
  };
}

function parseQuestionSpec(
  question: ReportV4OrchestratorQuestion,
  index: 0 | 1 | 2
): ReportV4OrchestratorQuestion {
  return {
    order: exactOrder(question.order, index),
    questionId: boundedText(question.questionId, `questions[${index}].questionId`, 500),
    questionText: boundedText(question.questionText, `questions[${index}].questionText`, 10_000)
  };
}

function acceptSnapshot(snapshot: ReportV4SiteSnapshotBundle, input: ReportV4OrchestratorInput): void {
  const identity = input.snapshotIdentity;
  if (snapshot.snapshot.id !== identity.id || snapshot.snapshot.reportId !== input.reportId
    || snapshot.snapshot.siteKey !== identity.siteKey
    || snapshot.snapshot.collectorConfigIdentityHash !== identity.collectorConfigIdentityHash
    || snapshot.snapshot.contentIdentityHash !== identity.contentIdentityHash) {
    throw new Error("The paid V4 run did not resolve the exact immutable pre-admission snapshot.");
  }
  const analyzable = snapshot.pages.filter(({ analyzable: value }) => value).length;
  const excluded = snapshot.pages.length - analyzable;
  if (analyzable !== snapshot.snapshot.analyzablePageCount || excluded !== snapshot.snapshot.excludedPageCount
    || snapshot.snapshot.candidateUrlCount < snapshot.pages.length) {
    throw new Error("The immutable V4 snapshot counters do not match its persisted pages.");
  }
  if (!(["completed", "completed_limited", "unavailable"] as const).includes(
    snapshot.snapshot.status as "completed" | "completed_limited" | "unavailable"
  )) {
    throw new Error("The snapshot is not eligible for standard V4 orchestration.");
  }
}

function isStandardResolvableSnapshot(snapshot: ReportV4SiteSnapshotBundle): boolean {
  return (snapshot.snapshot.status === "completed" || snapshot.snapshot.status === "completed_limited")
    && snapshot.snapshot.analyzablePageCount > 0;
}

function pageCounters(snapshot: ReportV4SiteSnapshotBundle): MutableCounters["pages"] {
  return {
    candidate: snapshot.snapshot.candidateUrlCount,
    analyzable: snapshot.snapshot.analyzablePageCount,
    excluded: snapshot.snapshot.excludedPageCount,
    jsDependent: snapshot.pages.filter(({ analyzable, readMode }) => analyzable && readMode === "js_dependent").length
  };
}

function coreStatus(
  snapshot: ReportV4SiteSnapshotBundle,
  questions: CombinedGeoReportV4["questions"]
): CombinedGeoReportV4Status {
  if (snapshot.snapshot.analyzablePageCount === 0) return "unavailable";
  const answered = questions.filter(({ status }) => status === "answered").length;
  if (answered === 0) return "unavailable";
  return snapshot.snapshot.status === "completed" && answered === 3 ? "completed" : "completed_limited";
}

function buildReport(input: {
  input: ReportV4OrchestratorInput;
  artifactRevisionId: string;
  status: Exclude<CombinedGeoReportV4Status, "unavailable">;
  generatedAt: string;
  websiteSynthesis: CombinedGeoReportV4WebsiteSynthesis;
  questions: CombinedGeoReportV4["questions"];
}): CombinedGeoReportV4 {
  return parseCombinedGeoReportV4({
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: input.input.reportId,
    artifactRevisionId: input.artifactRevisionId,
    targetUrl: input.input.targetUrl,
    locale: input.input.locale,
    generatedAt: input.generatedAt,
    status: input.status,
    websiteSynthesis: input.websiteSynthesis,
    questions: input.questions
  });
}

function acceptActiveArtifact(
  value: CombinedGeoReportV4,
  input: ReportV4OrchestratorInput
): CombinedGeoReportV4 {
  const report = parseCombinedGeoReportV4(value);
  if (report.reportId !== input.reportId || report.targetUrl !== input.targetUrl || report.locale !== input.locale) {
    throw new Error("The active V4 artifact does not match the orchestrator identity.");
  }
  if (report.artifactRevisionId !== input.coreArtifactRevisionId
    && report.artifactRevisionId !== input.enhancementArtifactRevisionId) {
    throw new Error("The active V4 artifact revision is outside this orchestrator run.");
  }
  return report;
}

function acceptCoreArtifact(value: CombinedGeoReportV4, input: ReportV4OrchestratorInput): CombinedGeoReportV4 {
  const report = acceptActiveArtifact(value, input);
  if (report.artifactRevisionId !== input.coreArtifactRevisionId || report.questions.some(({ diagnosis }) => diagnosis)) {
    throw new Error("The resumable V4 core artifact must be the diagnosis-free core revision.");
  }
  deliverableStatus(report.status, "active core");
  return report;
}

function assertActiveArtifactRecovery(
  report: CombinedGeoReportV4,
  input: ReportV4OrchestratorInput,
  snapshot: ReportV4SiteSnapshotBundle
): void {
  const label = report.artifactRevisionId === input.coreArtifactRevisionId
    ? "active core"
    : "active enhancement";
  assertQuestionIdentity(report.questions, input.questions);
  const diagnosisCount = report.questions.filter(({ diagnosis }) => diagnosis).length;
  if (label === "active core" && diagnosisCount !== 0) {
    throw new Error("The active core must remain diagnosis-free.");
  }
  if (label === "active enhancement" && diagnosisCount === 0) {
    throw new Error("The active enhancement must contain at least one completed diagnosis.");
  }
  deliverableStatus(report.status, label);
  if (!isStandardResolvableSnapshot(snapshot)) {
    throw new Error(`The ${label} requires its exact snapshot to remain standard-resolvable.`);
  }
  const expectedStatus = coreStatus(snapshot, report.questions);
  if (report.status !== expectedStatus) {
    throw new Error(`The ${label} status does not match the immutable snapshot completion rules.`);
  }
}

function deliverableStatus(
  status: CombinedGeoReportV4Status,
  label: string
): Exclude<CombinedGeoReportV4Status, "unavailable"> {
  if (status === "unavailable") throw new Error(`The ${label} must be deliverable and cannot be unavailable.`);
  return status;
}

function assertQuestionIdentity(
  actual: CombinedGeoReportV4["questions"],
  expected: ReportV4OrchestratorInput["questions"]
): void {
  actual.forEach((question, index) => {
    const spec = expected[index]!;
    if (question.order !== spec.order || question.questionId !== spec.questionId || question.questionText !== spec.questionText) {
      throw new Error("V4 question identity does not match the immutable ordered questions.");
    }
  });
}

function uniqueKnownQuestionIds(
  values: readonly string[],
  questions: ReportV4OrchestratorInput["questions"]
): string[] {
  const known = new Set(questions.map(({ questionId }) => questionId));
  const unique = [...new Set(values)];
  if (unique.some((questionId) => !known.has(questionId))) throw new Error("A reused checkpoint does not belong to this report's questions.");
  return unique;
}

async function measured<T>(
  dependencies: ReportV4OrchestratorDependencies,
  timings: MutableTimings,
  field: keyof MutableTimings,
  work: () => Promise<T>,
  accumulate = false
): Promise<T> {
  const startedAt = dependencies.nowMs();
  try {
    return await work();
  } finally {
    const elapsed = Math.max(0, dependencies.nowMs() - startedAt);
    timings[field] = accumulate ? timings[field] + elapsed : elapsed;
  }
}

function finishUnavailable(
  input: ReportV4OrchestratorInput,
  dependencies: ReportV4OrchestratorDependencies,
  totalStartedAt: number,
  counters: MutableCounters,
  timings: MutableTimings
): ReportV4OrchestratorResult {
  return finish({
    input,
    dependencies,
    totalStartedAt,
    counters,
    timings,
    status: "unavailable",
    delivery: "unavailable",
    coreReport: null,
    activeReport: null,
    enhancement: { status: "not_started", completedQuestionIds: [], failedQuestionIds: [] }
  });
}

function finish(input: {
  input: ReportV4OrchestratorInput;
  dependencies: ReportV4OrchestratorDependencies;
  totalStartedAt: number;
  counters: MutableCounters;
  timings: MutableTimings;
  status: CombinedGeoReportV4Status;
  delivery: ReportV4OrchestratorResult["delivery"];
  coreReport: CombinedGeoReportV4 | null;
  activeReport: CombinedGeoReportV4 | null;
  enhancement: ReportV4OrchestratorResult["enhancement"];
}): ReportV4OrchestratorResult {
  const modelTotal = input.counters.modelCalls.websiteSynthesis
    + input.counters.modelCalls.questionAnswer
    + input.counters.modelCalls.sourceDiagnosis;
  const retryTotal = input.counters.providerRetries.questionAnswer + input.counters.providerRetries.sourceDiagnosis;
  return Object.freeze({
    status: input.status,
    delivery: input.delivery,
    coreReport: input.coreReport,
    activeReport: input.activeReport,
    enhancement: Object.freeze({
      ...input.enhancement,
      completedQuestionIds: Object.freeze([...input.enhancement.completedQuestionIds]),
      failedQuestionIds: Object.freeze([...input.enhancement.failedQuestionIds])
    }),
    counters: Object.freeze({
      pages: Object.freeze({ ...input.counters.pages }),
      modelCalls: Object.freeze({ ...input.counters.modelCalls, total: modelTotal }),
      providerRetries: Object.freeze({ ...input.counters.providerRetries, total: retryTotal }),
      sourceReads: Object.freeze({ ...input.counters.sourceReads }),
      reusedQuestionCheckpoints: input.counters.reusedQuestionCheckpoints,
      revisions: Object.freeze({
        ...input.counters.revisions,
        coreRevisionId: input.coreReport || input.activeReport ? input.input.coreArtifactRevisionId : null,
        enhancementRevisionId: input.activeReport?.artifactRevisionId === input.input.enhancementArtifactRevisionId
          ? input.input.enhancementArtifactRevisionId
          : null,
        activeRevisionId: input.activeReport?.artifactRevisionId ?? null
      }),
      wholeReportReruns: 0 as const,
      pdfOperations: 0 as const
    }),
    timingsMs: Object.freeze({
      total: Math.max(0, input.dependencies.nowMs() - input.totalStartedAt),
      ...input.timings
    })
  });
}

function emptyCounters(): MutableCounters {
  return {
    pages: { candidate: 0, analyzable: 0, excluded: 0, jsDependent: 0 },
    modelCalls: { websiteSynthesis: 0, questionAnswer: 0, sourceDiagnosis: 0 },
    providerRetries: { questionAnswer: 0, sourceDiagnosis: 0 },
    sourceReads: { raw: 0, browser: 0 },
    reusedQuestionCheckpoints: 0,
    revisions: { coreActivated: 0, enhancementActivated: 0 }
  };
}

function emptyTimings(): MutableTimings {
  return {
    activeArtifactLookup: 0,
    snapshotResolution: 0,
    websiteSynthesis: 0,
    questionAnswer: 0,
    coreDelivery: 0,
    sourceAudit: 0,
    diagnosis: 0,
    enhancementDelivery: 0
  };
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer.`);
  return Number(value);
}

function exactOrder(value: unknown, index: number): 1 | 2 | 3 {
  if (value !== index + 1) throw new Error("V4 questions must preserve exact order 1, 2, 3.");
  return value as 1 | 2 | 3;
}

function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${field} must be bounded text.`);
  return value.trim();
}

function publicUrl(value: unknown): string {
  const parsed = new URL(boundedText(value, "targetUrl", 2_000));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new TypeError("targetUrl must be public HTTP(S).");
  return parsed.toString();
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

function propagateAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason;
}
