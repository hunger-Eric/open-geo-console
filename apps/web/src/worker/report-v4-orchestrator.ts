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

interface ReportV4StageIdentity {
  readonly reportId: string;
  readonly orderId: string;
  readonly coreJobId: string;
  readonly configSnapshotId: string;
  readonly questionSetId: string;
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

export interface ReportV4CoreStageInput extends ReportV4StageIdentity {
  readonly coreArtifactRevisionId: string;
}

export interface ReportV4EnhancementStageInput extends ReportV4StageIdentity {
  readonly sourceCoreArtifactRevisionId: string;
  readonly enhancementJobId: string;
  readonly enhancementArtifactRevisionId: string;
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

interface ReportV4ClockDependencies {
  readonly nowMs: () => number;
  readonly nowIso: () => string;
}

export interface ReportV4CoreStageDependencies extends ReportV4ClockDependencies {
  readonly loadCoreArtifact: (input: {
    readonly reportId: string;
    readonly coreArtifactRevisionId: string;
    readonly signal?: AbortSignal;
  }) => Promise<CombinedGeoReportV4 | null>;
  readonly resolveSnapshot: (input: {
    readonly identity: ResolvePaidReportV4SiteSnapshotInput;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4SiteSnapshotBundle>;
  readonly synthesizeWebsite: (input: {
    readonly snapshot: ReportV4SiteSnapshotBundle;
    readonly questions: ReportV4CoreStageInput["questions"];
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4WebsiteSynthesisResult>;
  readonly answerQuestions: (input: {
    readonly snapshot: ReportV4SiteSnapshotBundle;
    readonly questions: ReportV4CoreStageInput["questions"];
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4OrchestratorAnswerResult>;
  readonly renderCoreHtml: (input: {
    readonly report: CombinedGeoReportV4;
    readonly signal?: AbortSignal;
  }) => Promise<string>;
  readonly persistCoreArtifact: (input: {
    readonly report: CombinedGeoReportV4;
    readonly html: string;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4PersistedHtmlIdentity>;
  readonly activateCoreRevision: (
    input: ActivateReportV4CoreRevisionInput,
    signal?: AbortSignal
  ) => Promise<unknown>;
  readonly terminalizeUnavailableCore: (input: {
    readonly reportId: string;
    readonly orderId: string;
    readonly coreJobId: string;
    readonly reason: "all_questions_unavailable";
    readonly signal?: AbortSignal;
  }) => Promise<unknown>;
  readonly terminalizeDeliverableCoreAndEnqueueEnhancement: (input: {
    readonly report: CombinedGeoReportV4;
    readonly reportId: string;
    readonly orderId: string;
    readonly coreJobId: string;
    readonly coreArtifactRevisionId: string;
    readonly configSnapshotId: string;
    readonly siteSnapshotId: string;
    readonly questionSetId: string;
    readonly locale: string;
    readonly signal?: AbortSignal;
  }) => Promise<{ readonly enhancementJobId: string }>;
}

export interface ReportV4ClaimedEnhancementContext {
  readonly enhancementJobId: string;
  readonly sourceCore: CombinedGeoReportV4;
  readonly activeArtifact: CombinedGeoReportV4;
  readonly snapshot: ReportV4SiteSnapshotBundle;
  readonly coreCommerceStatus: "reserved" | "settled";
  readonly coreAccessStatus: "active" | "missing";
}

export interface ReportV4EnhancementStageDependencies extends ReportV4ClockDependencies {
  readonly loadClaimedEnhancementContext: (input: {
    readonly reportId: string;
    readonly coreJobId: string;
    readonly enhancementJobId: string;
    readonly sourceCoreArtifactRevisionId: string;
    readonly enhancementArtifactRevisionId: string;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4ClaimedEnhancementContext | null>;
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
  readonly renderEnhancementHtml: (input: {
    readonly report: CombinedGeoReportV4;
    readonly signal?: AbortSignal;
  }) => Promise<string>;
  readonly persistEnhancementArtifact: (input: {
    readonly report: CombinedGeoReportV4;
    readonly html: string;
    readonly signal?: AbortSignal;
  }) => Promise<ReportV4PersistedHtmlIdentity>;
  readonly activateEnhancementRevision: (
    input: ActivateReportV4DiagnosisEnhancementInput,
    signal?: AbortSignal
  ) => Promise<unknown>;
  readonly failEnhancementRevision: (
    input: ReportV4DiagnosisEnhancementIdentity,
    signal?: AbortSignal
  ) => Promise<unknown>;
  readonly terminalizeEnhancementJob: (input: {
    readonly reportId: string;
    readonly coreJobId: string;
    readonly enhancementJobId: string;
    readonly sourceCoreArtifactRevisionId: string;
    readonly enhancementArtifactRevisionId: string;
    readonly outcome: "completed" | "failed";
    readonly completedQuestionIds: readonly string[];
    readonly failedQuestionIds: readonly string[];
    readonly signal?: AbortSignal;
  }) => Promise<unknown>;
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

export async function runReportV4CoreStage(
  input: ReportV4CoreStageInput,
  dependencies: ReportV4CoreStageDependencies
): Promise<ReportV4OrchestratorResult> {
  const parsedInput = parseCoreInput(input);
  const signal = parsedInput.signal;
  const counters = emptyCounters();
  const timings = emptyTimings();
  const totalStartedAt = dependencies.nowMs();
  throwIfAborted(signal);

  const existing = await measured(dependencies, timings, "activeArtifactLookup", () => (
    dependencies.loadCoreArtifact({
      reportId: parsedInput.reportId,
      coreArtifactRevisionId: parsedInput.coreArtifactRevisionId,
      signal
    })
  ));
  throwIfAborted(signal);
  const snapshot = await measured(dependencies, timings, "snapshotResolution", () => (
    dependencies.resolveSnapshot({ identity: parsedInput.snapshotIdentity, signal })
  ));
  throwIfAborted(signal);
  acceptSnapshot(snapshot, parsedInput);
  counters.pages = pageCounters(snapshot);

  if (!existing && !isStandardResolvableSnapshot(snapshot)) {
    return finishStage({
      dependencies,
      totalStartedAt,
      counters,
      timings,
      status: "unavailable",
      delivery: "unavailable",
      coreReport: null,
      activeReport: null,
      enhancement: notStartedEnhancement(),
      coreRevisionId: null,
      enhancementRevisionId: null
    });
  }

  let coreReport: CombinedGeoReportV4;
  if (existing) {
    coreReport = acceptCoreArtifact(existing, parsedInput);
    assertArtifactAgainstSnapshot(coreReport, parsedInput, snapshot, "active core");
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
    counters.reusedQuestionCheckpoints = uniqueKnownQuestionIds(answerResult.reusedQuestionIds, parsedInput.questions).length;
    assertQuestionIdentity(answerResult.questions, parsedInput.questions);
    const status = coreStatus(snapshot, answerResult.questions);
    if (status === "unavailable") {
      await dependencies.terminalizeUnavailableCore({
        reportId: parsedInput.reportId,
        orderId: parsedInput.orderId,
        coreJobId: parsedInput.coreJobId,
        reason: "all_questions_unavailable",
        signal
      });
      throwIfAborted(signal);
      return finishStage({
        dependencies,
        totalStartedAt,
        counters,
        timings,
        status,
        delivery: "unavailable",
        coreReport: null,
        activeReport: null,
        enhancement: notStartedEnhancement(),
        coreRevisionId: null,
        enhancementRevisionId: null
      });
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
      const html = await dependencies.renderCoreHtml({ report: coreReport, signal });
      throwIfAborted(signal);
      const identity = await dependencies.persistCoreArtifact({ report: coreReport, html, signal });
      throwIfAborted(signal);
      await dependencies.activateCoreRevision({
        artifactRevisionId: parsedInput.coreArtifactRevisionId,
        reportId: parsedInput.reportId,
        orderId: parsedInput.orderId,
        jobId: parsedInput.coreJobId,
        configSnapshotId: parsedInput.configSnapshotId,
        payloadIdentityHash: identity.payloadIdentityHash,
        htmlSha256: identity.htmlSha256
      }, signal);
      throwIfAborted(signal);
    });
    counters.revisions.coreActivated = 1;
  }

  const enqueued = await dependencies.terminalizeDeliverableCoreAndEnqueueEnhancement({
    report: coreReport,
    reportId: parsedInput.reportId,
    orderId: parsedInput.orderId,
    coreJobId: parsedInput.coreJobId,
    coreArtifactRevisionId: parsedInput.coreArtifactRevisionId,
    configSnapshotId: parsedInput.configSnapshotId,
    siteSnapshotId: parsedInput.snapshotIdentity.id,
    questionSetId: parsedInput.questionSetId,
    locale: parsedInput.locale,
    signal
  });
  throwIfAborted(signal);
  boundedText(enqueued.enhancementJobId, "enqueued enhancementJobId", 500);

  return finishStage({
    dependencies,
    totalStartedAt,
    counters,
    timings,
    status: coreReport.status,
    delivery: "core_active",
    coreReport,
    activeReport: coreReport,
    enhancement: notStartedEnhancement(),
    coreRevisionId: parsedInput.coreArtifactRevisionId,
    enhancementRevisionId: null
  });
}

export async function runReportV4EnhancementStage(
  input: ReportV4EnhancementStageInput,
  dependencies: ReportV4EnhancementStageDependencies
): Promise<ReportV4OrchestratorResult> {
  const parsedInput = parseEnhancementInput(input);
  const signal = parsedInput.signal;
  const counters = emptyCounters();
  const timings = emptyTimings();
  const totalStartedAt = dependencies.nowMs();
  throwIfAborted(signal);

  const context = await measured(dependencies, timings, "activeArtifactLookup", () => (
    dependencies.loadClaimedEnhancementContext({
      reportId: parsedInput.reportId,
      coreJobId: parsedInput.coreJobId,
      enhancementJobId: parsedInput.enhancementJobId,
      sourceCoreArtifactRevisionId: parsedInput.sourceCoreArtifactRevisionId,
      enhancementArtifactRevisionId: parsedInput.enhancementArtifactRevisionId,
      signal
    })
  ));
  throwIfAborted(signal);
  if (!context || context.enhancementJobId !== parsedInput.enhancementJobId) {
    throw new Error("The V4 diagnosis enhancement job was not independently claimed.");
  }
  if (context.coreCommerceStatus !== "settled" || context.coreAccessStatus !== "active") {
    throw new Error("The V4 diagnosis enhancement requires a settled and accessible active core.");
  }

  acceptSnapshot(context.snapshot, parsedInput);
  counters.pages = pageCounters(context.snapshot);
  const coreReport = acceptSourceCoreArtifact(context.sourceCore, parsedInput);
  assertArtifactAgainstSnapshot(coreReport, parsedInput, context.snapshot, "source core");
  const activeArtifact = acceptEnhancementActiveArtifact(context.activeArtifact, coreReport, parsedInput);
  if (activeArtifact.artifactRevisionId === parsedInput.enhancementArtifactRevisionId) {
    const completedQuestionIds = activeArtifact.questions.filter(({ diagnosis }) => diagnosis).map(({ questionId }) => questionId);
    const failedQuestionIds = activeArtifact.questions
      .filter(({ status, diagnosis }) => status === "answered" && !diagnosis)
      .map(({ questionId }) => questionId);
    await terminalizeEnhancementJob({
      input: parsedInput,
      dependencies,
      outcome: "completed",
      completedQuestionIds,
      failedQuestionIds
    });
    return finishStage({
      dependencies,
      totalStartedAt,
      counters,
      timings,
      status: activeArtifact.status,
      delivery: "enhancement_active",
      coreReport,
      activeReport: activeArtifact,
      enhancement: {
        status: "completed",
        completedQuestionIds,
        failedQuestionIds
      },
      coreRevisionId: parsedInput.sourceCoreArtifactRevisionId,
      enhancementRevisionId: parsedInput.enhancementArtifactRevisionId
    });
  }

  const enhancementUnits = await Promise.all(coreReport.questions.map((question) => enhanceQuestion({
    question,
    snapshot: context.snapshot,
    locale: parsedInput.locale,
    signal,
    dependencies,
    counters,
    timings
  })));
  throwIfAborted(signal);
  const completed = enhancementUnits.filter(
    (unit): unit is Extract<EnhancementUnit, { status: "completed" }> => unit.status === "completed"
  );
  const failedQuestionIds = enhancementUnits
    .filter((unit): unit is Extract<EnhancementUnit, { status: "failed" }> => unit.status === "failed")
    .map(({ questionId }) => questionId);
  if (!completed.length) {
    return finishEnhancementFailure({
      input: parsedInput,
      dependencies,
      totalStartedAt,
      counters,
      timings,
      coreReport,
      completedQuestionIds: [],
      failedQuestionIds
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

  const enhancementIdentity: ReportV4DiagnosisEnhancementIdentity = {
    artifactRevisionId: parsedInput.enhancementArtifactRevisionId,
    reportId: parsedInput.reportId,
    orderId: parsedInput.orderId,
    jobId: parsedInput.enhancementJobId,
    configSnapshotId: parsedInput.configSnapshotId,
    sourceArtifactRevisionId: parsedInput.sourceCoreArtifactRevisionId
  };
  let enhancedReport: CombinedGeoReportV4;
  let enhancementRevisionPrepared = false;
  try {
    enhancedReport = buildReport({
      input: parsedInput,
      artifactRevisionId: parsedInput.enhancementArtifactRevisionId,
      status: deliverableStatus(coreReport.status, "source core"),
      generatedAt: dependencies.nowIso(),
      websiteSynthesis: coreReport.websiteSynthesis,
      questions: enhancedQuestions
    });
    await measured(dependencies, timings, "enhancementDelivery", async () => {
      await dependencies.prepareEnhancementRevision(enhancementIdentity, signal);
      enhancementRevisionPrepared = true;
      throwIfAborted(signal);
      const html = await dependencies.renderEnhancementHtml({ report: enhancedReport, signal });
      throwIfAborted(signal);
      const persisted = await dependencies.persistEnhancementArtifact({ report: enhancedReport, html, signal });
      throwIfAborted(signal);
      await dependencies.activateEnhancementRevision({
        ...enhancementIdentity,
        payloadIdentityHash: persisted.payloadIdentityHash,
        htmlSha256: persisted.htmlSha256
      }, signal);
      throwIfAborted(signal);
    });
    counters.revisions.enhancementActivated = 1;
  } catch {
    propagateAbort(signal);
    if (enhancementRevisionPrepared) {
      await dependencies.failEnhancementRevision(enhancementIdentity, signal);
      throwIfAborted(signal);
    }
    return finishEnhancementFailure({
      input: parsedInput,
      dependencies,
      totalStartedAt,
      counters,
      timings,
      coreReport,
      completedQuestionIds: completed.map(({ question }) => question.questionId),
      failedQuestionIds
    });
  }

  const completedQuestionIds = completed.map(({ question }) => question.questionId);
  await terminalizeEnhancementJob({
    input: parsedInput,
    dependencies,
    outcome: "completed",
    completedQuestionIds,
    failedQuestionIds
  });

  return finishStage({
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
      completedQuestionIds,
      failedQuestionIds
    },
    coreRevisionId: parsedInput.sourceCoreArtifactRevisionId,
    enhancementRevisionId: parsedInput.enhancementArtifactRevisionId
  });
}

async function enhanceQuestion(input: {
  question: CombinedGeoReportV4Question;
  snapshot: ReportV4SiteSnapshotBundle;
  locale: string;
  signal?: AbortSignal;
  dependencies: ReportV4EnhancementStageDependencies;
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
  return {
    ...question,
    sources: question.sources.map((source) => {
      const audit = bySource.get(source.sourceId);
      return audit ? { ...source, retrievalStatus: audit.status } : source;
    })
  };
}

function parseCoreInput(input: ReportV4CoreStageInput): ReportV4CoreStageInput {
  return {
    ...parseStageIdentity(input),
    coreArtifactRevisionId: boundedText(input.coreArtifactRevisionId, "coreArtifactRevisionId", 500)
  };
}

function parseEnhancementInput(input: ReportV4EnhancementStageInput): ReportV4EnhancementStageInput {
  return {
    ...parseStageIdentity(input),
    sourceCoreArtifactRevisionId: boundedText(input.sourceCoreArtifactRevisionId, "sourceCoreArtifactRevisionId", 500),
    enhancementJobId: boundedText(input.enhancementJobId, "enhancementJobId", 500),
    enhancementArtifactRevisionId: boundedText(input.enhancementArtifactRevisionId, "enhancementArtifactRevisionId", 500)
  };
}

function parseStageIdentity(input: ReportV4StageIdentity): ReportV4StageIdentity {
  const reportId = boundedText(input.reportId, "reportId", 500);
  if (input.snapshotIdentity.reportId !== reportId) throw new Error("V4 snapshot identity must belong to the report.");
  const questions: ReportV4StageIdentity["questions"] = [
    parseQuestionSpec(input.questions[0], 0),
    parseQuestionSpec(input.questions[1], 1),
    parseQuestionSpec(input.questions[2], 2)
  ];
  if (new Set(questions.map(({ questionId }) => questionId)).size !== 3) throw new Error("V4 question ids must be unique.");
  return {
    reportId,
    orderId: boundedText(input.orderId, "orderId", 500),
    coreJobId: boundedText(input.coreJobId, "coreJobId", 500),
    configSnapshotId: boundedText(input.configSnapshotId, "configSnapshotId", 500),
    questionSetId: boundedText(input.questionSetId, "questionSetId", 500),
    targetUrl: publicUrl(input.targetUrl),
    locale: boundedText(input.locale, "locale", 100),
    snapshotIdentity: input.snapshotIdentity,
    questions,
    signal: input.signal
  };
}

function parseQuestionSpec(question: ReportV4OrchestratorQuestion, index: 0 | 1 | 2): ReportV4OrchestratorQuestion {
  return {
    order: exactOrder(question.order, index),
    questionId: boundedText(question.questionId, `questions[${index}].questionId`, 500),
    questionText: boundedText(question.questionText, `questions[${index}].questionText`, 10_000)
  };
}

function acceptSnapshot(snapshot: ReportV4SiteSnapshotBundle, input: ReportV4StageIdentity): void {
  const identity = input.snapshotIdentity;
  if (snapshot.snapshot.id !== identity.id || snapshot.snapshot.reportId !== input.reportId
    || snapshot.snapshot.siteKey !== identity.siteKey
    || snapshot.snapshot.collectorConfigIdentityHash !== identity.collectorConfigIdentityHash
    || snapshot.snapshot.contentIdentityHash !== identity.contentIdentityHash) {
    throw new Error("The paid V4 stage did not resolve the exact immutable pre-admission snapshot.");
  }
  const analyzable = snapshot.pages.filter(({ analyzable: value }) => value).length;
  const excluded = snapshot.pages.length - analyzable;
  if (analyzable !== snapshot.snapshot.analyzablePageCount || excluded !== snapshot.snapshot.excludedPageCount
    || snapshot.snapshot.candidateUrlCount < snapshot.pages.length) {
    throw new Error("The immutable V4 snapshot counters do not match its persisted pages.");
  }
  if (!("completed" === snapshot.snapshot.status || "completed_limited" === snapshot.snapshot.status
    || "unavailable" === snapshot.snapshot.status)) {
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
  input: ReportV4StageIdentity;
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

function acceptCoreArtifact(value: CombinedGeoReportV4, input: ReportV4CoreStageInput): CombinedGeoReportV4 {
  const report = parseCombinedGeoReportV4(value);
  assertArtifactIdentity(report, input);
  if (report.artifactRevisionId !== input.coreArtifactRevisionId || report.questions.some(({ diagnosis }) => diagnosis)) {
    throw new Error("The resumable V4 core artifact must be the exact diagnosis-free core revision.");
  }
  deliverableStatus(report.status, "active core");
  return report;
}

function acceptSourceCoreArtifact(
  value: CombinedGeoReportV4,
  input: ReportV4EnhancementStageInput
): CombinedGeoReportV4 {
  const report = parseCombinedGeoReportV4(value);
  assertArtifactIdentity(report, input);
  if (report.artifactRevisionId !== input.sourceCoreArtifactRevisionId || report.questions.some(({ diagnosis }) => diagnosis)) {
    throw new Error("The enhancement source must be the exact diagnosis-free core revision.");
  }
  deliverableStatus(report.status, "source core");
  return report;
}

function acceptEnhancementActiveArtifact(
  value: CombinedGeoReportV4,
  sourceCore: CombinedGeoReportV4,
  input: ReportV4EnhancementStageInput
): CombinedGeoReportV4 {
  const report = parseCombinedGeoReportV4(value);
  assertArtifactIdentity(report, input);
  if (report.artifactRevisionId === input.sourceCoreArtifactRevisionId) {
    if (report.questions.some(({ diagnosis }) => diagnosis)) throw new Error("The active source core must remain diagnosis-free.");
    if (JSON.stringify(report) !== JSON.stringify(sourceCore)) {
      throw new Error("The active source core does not match the claimed immutable core payload.");
    }
    return report;
  }
  if (report.artifactRevisionId !== input.enhancementArtifactRevisionId) {
    throw new Error("The active V4 artifact is outside the claimed enhancement lineage.");
  }
  if (!report.questions.some(({ diagnosis }) => diagnosis)) {
    throw new Error("The active V4 enhancement must contain at least one completed diagnosis.");
  }
  assertEnhancementPreservesCore(report, sourceCore);
  assertQuestionIdentity(report.questions, input.questions);
  return report;
}

function assertEnhancementPreservesCore(enhancement: CombinedGeoReportV4, core: CombinedGeoReportV4): void {
  if (enhancement.status !== core.status
    || JSON.stringify(enhancement.websiteSynthesis) !== JSON.stringify(core.websiteSynthesis)) {
    throw new Error("The active V4 enhancement cannot replace the immutable core content.");
  }
  enhancement.questions.forEach((question, index) => {
    const source = core.questions[index]!;
    const questionPayload = {
      order: question.order,
      questionId: question.questionId,
      questionText: question.questionText,
      status: question.status,
      answer: question.answer,
      sources: question.sources.map(coreSourcePayload)
    };
    const sourcePayload = {
      order: source.order,
      questionId: source.questionId,
      questionText: source.questionText,
      status: source.status,
      answer: source.answer,
      sources: source.sources.map(coreSourcePayload)
    };
    if (JSON.stringify(questionPayload) !== JSON.stringify(sourcePayload)) {
      throw new Error("The active V4 enhancement cannot retract or replace core question content.");
    }
  });
}

function coreSourcePayload(source: CombinedGeoReportV4Question["sources"][number]) {
  return {
    questionId: source.questionId,
    sourceId: source.sourceId,
    title: source.title,
    canonicalUrl: source.canonicalUrl,
    citedText: source.citedText
  };
}

function assertArtifactIdentity(report: CombinedGeoReportV4, input: ReportV4StageIdentity): void {
  if (report.reportId !== input.reportId || report.targetUrl !== input.targetUrl || report.locale !== input.locale) {
    throw new Error("The V4 artifact does not match the stage identity.");
  }
  assertQuestionIdentity(report.questions, input.questions);
}

function assertArtifactAgainstSnapshot(
  report: CombinedGeoReportV4,
  input: ReportV4StageIdentity,
  snapshot: ReportV4SiteSnapshotBundle,
  label: string
): void {
  if (!isStandardResolvableSnapshot(snapshot)) throw new Error(`The ${label} requires a standard-resolvable snapshot.`);
  assertQuestionIdentity(report.questions, input.questions);
  if (report.status !== coreStatus(snapshot, report.questions)) {
    throw new Error(`The ${label} status conflicts with the immutable snapshot completion rules.`);
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
  expected: ReportV4StageIdentity["questions"]
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
  questions: ReportV4StageIdentity["questions"]
): string[] {
  const known = new Set(questions.map(({ questionId }) => questionId));
  const unique = [...new Set(values)];
  if (unique.some((questionId) => !known.has(questionId))) {
    throw new Error("A reused checkpoint does not belong to this report's questions.");
  }
  return unique;
}

async function measured<T>(
  dependencies: ReportV4ClockDependencies,
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

async function finishEnhancementFailure(input: {
  input: ReportV4EnhancementStageInput;
  dependencies: ReportV4EnhancementStageDependencies;
  totalStartedAt: number;
  counters: MutableCounters;
  timings: MutableTimings;
  coreReport: CombinedGeoReportV4;
  completedQuestionIds: readonly string[];
  failedQuestionIds: readonly string[];
}): Promise<ReportV4OrchestratorResult> {
  await terminalizeEnhancementJob({
    input: input.input,
    dependencies: input.dependencies,
    outcome: "failed",
    completedQuestionIds: input.completedQuestionIds,
    failedQuestionIds: input.failedQuestionIds
  });
  return finishStage({
    dependencies: input.dependencies,
    totalStartedAt: input.totalStartedAt,
    counters: input.counters,
    timings: input.timings,
    status: input.coreReport.status,
    delivery: "core_active",
    coreReport: input.coreReport,
    activeReport: input.coreReport,
    enhancement: {
      status: "failed",
      completedQuestionIds: input.completedQuestionIds,
      failedQuestionIds: input.failedQuestionIds
    },
    coreRevisionId: input.input.sourceCoreArtifactRevisionId,
    enhancementRevisionId: null
  });
}

async function terminalizeEnhancementJob(input: {
  input: ReportV4EnhancementStageInput;
  dependencies: ReportV4EnhancementStageDependencies;
  outcome: "completed" | "failed";
  completedQuestionIds: readonly string[];
  failedQuestionIds: readonly string[];
}): Promise<void> {
  throwIfAborted(input.input.signal);
  await input.dependencies.terminalizeEnhancementJob({
    reportId: input.input.reportId,
    coreJobId: input.input.coreJobId,
    enhancementJobId: input.input.enhancementJobId,
    sourceCoreArtifactRevisionId: input.input.sourceCoreArtifactRevisionId,
    enhancementArtifactRevisionId: input.input.enhancementArtifactRevisionId,
    outcome: input.outcome,
    completedQuestionIds: Object.freeze([...input.completedQuestionIds]),
    failedQuestionIds: Object.freeze([...input.failedQuestionIds]),
    signal: input.input.signal
  });
  throwIfAborted(input.input.signal);
}

function notStartedEnhancement(): ReportV4OrchestratorResult["enhancement"] {
  return { status: "not_started", completedQuestionIds: [], failedQuestionIds: [] };
}

function finishStage(input: {
  dependencies: ReportV4ClockDependencies;
  totalStartedAt: number;
  counters: MutableCounters;
  timings: MutableTimings;
  status: CombinedGeoReportV4Status;
  delivery: ReportV4OrchestratorResult["delivery"];
  coreReport: CombinedGeoReportV4 | null;
  activeReport: CombinedGeoReportV4 | null;
  enhancement: ReportV4OrchestratorResult["enhancement"];
  coreRevisionId: string | null;
  enhancementRevisionId: string | null;
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
        coreRevisionId: input.coreRevisionId,
        enhancementRevisionId: input.enhancementRevisionId,
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
