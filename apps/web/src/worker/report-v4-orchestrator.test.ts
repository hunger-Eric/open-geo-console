import { describe, expect, it } from "vitest";
import type {
  CombinedGeoReportV4,
  CombinedGeoReportV4Question,
  CombinedGeoReportV4QuestionDiagnosis,
  CombinedGeoReportV4Status,
  CombinedGeoReportV4WebsiteSynthesis
} from "@open-geo-console/ai-report-engine";
import type { ReportV4SiteSnapshotBundle } from "../db/report-v4-site-snapshots";
import {
  runReportV4Orchestrator,
  type ReportV4OrchestratorDependencies,
  type ReportV4OrchestratorInput
} from "./report-v4-orchestrator";

// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-ANSWER-02
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-02
// @requirement GEO-V4-PDF-01

describe("V4 core-first orchestrator", () => {
  it("reuses one immutable snapshot, activates core before parallel local enhancement, and exposes verifier counters", async () => {
    const harness = createHarness({ failedDiagnosisQuestionIds: new Set(["q3"]) });

    const result = await runReportV4Orchestrator(baseInput(), harness.dependencies);

    expect(result.status).toBe("completed");
    expect(result.delivery).toBe("enhancement_active");
    expect(result.coreReport?.artifactRevisionId).toBe("core-revision");
    expect(result.activeReport?.artifactRevisionId).toBe("enhancement-revision");
    expect(result.activeReport?.questions.map((question) => Boolean(question.diagnosis))).toEqual([true, true, false]);
    expect(harness.snapshotInputs).toEqual([harness.snapshot, harness.snapshot]);
    expect(harness.revisionConfigSnapshotIds).toEqual([
      "config-snapshot-v4",
      "config-snapshot-v4",
      "config-snapshot-v4"
    ]);
    expect(harness.events.indexOf("activate:core")).toBeLessThan(harness.events.indexOf("audit:q1"));
    expect(harness.events.indexOf("persist:core")).toBeLessThan(harness.events.indexOf("activate:core"));
    expect(harness.events.indexOf("diagnose:q2")).toBeLessThan(harness.events.indexOf("prepare:enhancement"));
    expect(result.enhancement).toEqual({
      status: "completed",
      completedQuestionIds: ["q1", "q2"],
      failedQuestionIds: ["q3"]
    });
    expect(result.counters).toEqual({
      pages: { candidate: 4, analyzable: 2, excluded: 2, jsDependent: 1 },
      modelCalls: { websiteSynthesis: 1, questionAnswer: 3, sourceDiagnosis: 3, total: 7 },
      providerRetries: { questionAnswer: 1, sourceDiagnosis: 0, total: 1 },
      sourceReads: { raw: 3, browser: 1 },
      reusedQuestionCheckpoints: 0,
      revisions: {
        coreActivated: 1,
        enhancementActivated: 1,
        coreRevisionId: "core-revision",
        enhancementRevisionId: "enhancement-revision",
        activeRevisionId: "enhancement-revision"
      },
      wholeReportReruns: 0,
      pdfOperations: 0
    });
    expect(Object.values(result.timingsMs).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(harness.events.join(" ")).not.toMatch(/replacement|provider.switch|pdf|pageCount|storage/i);
  });

  it.each([
    { snapshotStatus: "completed_limited" as const, unavailableQuestions: 0, expected: "completed_limited" as const },
    { snapshotStatus: "completed" as const, unavailableQuestions: 1, expected: "completed_limited" as const },
    { snapshotStatus: "completed" as const, unavailableQuestions: 3, expected: "unavailable" as const }
  ])("applies explicit $snapshotStatus / $unavailableQuestions unavailable-question completion rules", async ({
    snapshotStatus,
    unavailableQuestions,
    expected
  }) => {
    const harness = createHarness({ snapshotStatus, unavailableQuestions, failedDiagnosisQuestionIds: new Set(["q1", "q2", "q3"]) });

    const result = await runReportV4Orchestrator(baseInput(), harness.dependencies);

    expect(result.status).toBe(expected);
    if (expected === "unavailable") {
      expect(result.delivery).toBe("unavailable");
      expect(harness.events).not.toContain("persist:core");
      expect(harness.events).not.toContain("activate:core");
    } else {
      expect(result.delivery).toBe("core_active");
      expect(result.coreReport?.status).toBe(expected);
    }
  });

  it("returns unavailable without standard generation when the snapshot has no analyzable page", async () => {
    const harness = createHarness({ snapshotStatus: "unavailable", analyzablePages: 0 });

    const result = await runReportV4Orchestrator(baseInput(), harness.dependencies);

    expect(result.status).toBe("unavailable");
    expect(result.delivery).toBe("unavailable");
    expect(harness.events).toEqual(["load-active", "resolve-snapshot"]);
    expect(result.counters.modelCalls.total).toBe(0);
    expect(result.counters.revisions).toEqual({
      coreActivated: 0,
      enhancementActivated: 0,
      coreRevisionId: null,
      enhancementRevisionId: null,
      activeRevisionId: null
    });
  });

  it("resumes from an already active core without whole-report or answered-question reruns", async () => {
    const activeCore = coreReport("completed");
    const harness = createHarness({ activeReport: activeCore });

    const result = await runReportV4Orchestrator(baseInput(), harness.dependencies);

    expect(result.delivery).toBe("enhancement_active");
    expect(harness.events).not.toContain("synthesize");
    expect(harness.events).not.toContain("answer");
    expect(harness.events).not.toContain("persist:core");
    expect(harness.events).not.toContain("activate:core");
    expect(result.counters.modelCalls.websiteSynthesis).toBe(0);
    expect(result.counters.modelCalls.questionAnswer).toBe(0);
    expect(result.counters.wholeReportReruns).toBe(0);
    expect(result.counters.revisions).toEqual({
      coreActivated: 0,
      enhancementActivated: 1,
      coreRevisionId: "core-revision",
      enhancementRevisionId: "enhancement-revision",
      activeRevisionId: "enhancement-revision"
    });
  });

  it("rejects an impossible active unavailable core before enhancement work", async () => {
    const harness = createHarness({ activeReport: coreReport("unavailable") });

    await expect(runReportV4Orchestrator(baseInput(), harness.dependencies))
      .rejects.toThrow(/active core.*deliverable|unavailable.*active core/i);

    expect(harness.events).not.toContain("audit:q1");
    expect(harness.events).not.toContain("prepare:enhancement");
  });

  it.each(["core", "enhancement"] as const)(
    "rejects an active %s artifact from a different immutable question set",
    async (stage) => {
      const original = stage === "core" ? coreReport("completed") : enhancedReport("completed");
      const activeReport: CombinedGeoReportV4 = {
        ...original,
        questions: [
          { ...original.questions[0], questionText: "A different immutable question." },
          original.questions[1],
          original.questions[2]
        ]
      };
      const harness = createHarness({ activeReport });

      await expect(runReportV4Orchestrator(baseInput(), harness.dependencies))
        .rejects.toThrow(/active.*immutable.*question|question.*identity/i);

      expect(harness.events).not.toContain("audit:q1");
      expect(harness.events).not.toContain("prepare:enhancement");
    }
  );

  it("returns a genuinely enhanced active revision without repeating core or enhancement work", async () => {
    const harness = createHarness({ activeReport: enhancedReport("completed") });

    const result = await runReportV4Orchestrator(baseInput(), harness.dependencies);

    expect(result.delivery).toBe("enhancement_active");
    expect(result.enhancement.completedQuestionIds).toEqual(["q1"]);
    expect(harness.events).toEqual(["load-active", "resolve-snapshot"]);
    expect(result.counters.revisions).toMatchObject({
      coreActivated: 0,
      enhancementActivated: 0,
      activeRevisionId: "enhancement-revision"
    });
  });

  it("rejects an active enhancement revision that contains no completed diagnosis", async () => {
    const emptyEnhancement: CombinedGeoReportV4 = {
      ...coreReport("completed"),
      artifactRevisionId: "enhancement-revision"
    };
    const harness = createHarness({ activeReport: emptyEnhancement });

    await expect(runReportV4Orchestrator(baseInput(), harness.dependencies))
      .rejects.toThrow(/active enhancement.*diagnosis|enhancement.*empty/i);

    expect(harness.events).not.toContain("audit:q1");
  });

  it("rejects an active enhancement when the exact snapshot is no longer standard-resolvable", async () => {
    const harness = createHarness({
      activeReport: enhancedReport("completed"),
      snapshotStatus: "unavailable",
      analyzablePages: 0
    });

    await expect(runReportV4Orchestrator(baseInput(), harness.dependencies))
      .rejects.toThrow(/active.*snapshot.*standard|standard-resolvable/i);

    expect(harness.events).not.toContain("audit:q1");
  });

  it.each(["core", "enhancement"] as const)(
    "rejects completed active %s status against a completed_limited snapshot",
    async (stage) => {
      const activeReport = stage === "core" ? coreReport("completed") : enhancedReport("completed");
      const harness = createHarness({ activeReport, snapshotStatus: "completed_limited" });

      await expect(runReportV4Orchestrator(baseInput(), harness.dependencies))
        .rejects.toThrow(/active.*status.*snapshot|status.*completion rules/i);

      expect(harness.events).not.toContain("audit:q1");
    }
  );

  it("reports checkpoint reuse without changing it into a whole-report rerun", async () => {
    const harness = createHarness({ reusedQuestionIds: ["q1", "q2"], questionModelCalls: 1 });

    const result = await runReportV4Orchestrator(baseInput(), harness.dependencies);

    expect(result.counters.reusedQuestionCheckpoints).toBe(2);
    expect(result.counters.modelCalls.questionAnswer).toBe(1);
    expect(result.counters.wholeReportReruns).toBe(0);
  });

  it("starts every answered question's enhancement locally in parallel after the core gate", async () => {
    const harness = createHarness();
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalAudit = harness.dependencies.auditQuestionSources;
    const dependencies: ReportV4OrchestratorDependencies = {
      ...harness.dependencies,
      async auditQuestionSources(input) {
        started.push(input.question.questionId);
        await gate;
        return originalAudit(input);
      }
    };

    const running = runReportV4Orchestrator(baseInput(), dependencies);
    try {
      for (let attempt = 0; attempt < 50 && started.length < 3; attempt += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(started).toEqual(["q1", "q2", "q3"]);
      expect(harness.events).toContain("activate:core");
    } finally {
      release();
    }
    await expect(running).resolves.toMatchObject({ delivery: "enhancement_active" });
  });

  it.each(["source", "diagnosis", "persist_enhancement", "activate_enhancement"] as const)(
    "keeps the core active when %s enhancement work fails",
    async (failure) => {
      const harness = createHarness({ failure });

      const result = await runReportV4Orchestrator(baseInput(), harness.dependencies);

      expect(result.delivery).toBe("core_active");
      expect(result.activeReport?.artifactRevisionId).toBe("core-revision");
      expect(harness.activeRevisionId).toBe("core-revision");
      expect(harness.events).toContain("activate:core");
      expect(result.enhancement.status).toBe("failed");
      expect(result.counters.revisions.coreActivated).toBe(1);
      expect(result.counters.revisions.enhancementActivated).toBe(0);
    }
  );

  it("propagates caller abort after core activation without writing an enhancement business failure", async () => {
    const controller = new AbortController();
    const abortReason = new DOMException("caller stopped", "AbortError");
    const harness = createHarness({ abortController: controller, abortReason });

    await expect(runReportV4Orchestrator({ ...baseInput(), signal: controller.signal }, harness.dependencies))
      .rejects.toBe(abortReason);

    expect(harness.activeRevisionId).toBe("core-revision");
    expect(harness.events).toContain("activate:core");
    expect(harness.events).not.toContain("prepare:enhancement");
    expect(harness.events).not.toContain("persist:enhancement");
    expect(harness.events).not.toContain("activate:enhancement");
    expect(harness.events).not.toContain("business-failure");
  });
});

type FailurePoint = "source" | "diagnosis" | "persist_enhancement" | "activate_enhancement";

interface HarnessOptions {
  readonly snapshotStatus?: "completed" | "completed_limited" | "unavailable";
  readonly analyzablePages?: number;
  readonly unavailableQuestions?: number;
  readonly activeReport?: CombinedGeoReportV4 | null;
  readonly reusedQuestionIds?: readonly string[];
  readonly questionModelCalls?: number;
  readonly failedDiagnosisQuestionIds?: ReadonlySet<string>;
  readonly failure?: FailurePoint;
  readonly abortController?: AbortController;
  readonly abortReason?: unknown;
}

function createHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const snapshot = snapshotBundle(options.snapshotStatus ?? "completed", options.analyzablePages ?? 2);
  const snapshotInputs: ReportV4SiteSnapshotBundle[] = [];
  const revisionConfigSnapshotIds: string[] = [];
  let activeRevisionId = options.activeReport?.artifactRevisionId ?? null;
  let now = 1_000;
  const dependencies: ReportV4OrchestratorDependencies = {
    nowMs: () => (now += 5),
    nowIso: () => "2026-07-17T00:00:00.000Z",
    async loadActiveArtifact() {
      events.push("load-active");
      return options.activeReport ?? null;
    },
    async resolveSnapshot() {
      events.push("resolve-snapshot");
      return snapshot;
    },
    async synthesizeWebsite(input) {
      events.push("synthesize");
      snapshotInputs.push(input.snapshot);
      return { websiteSynthesis, modelCalls: 1 };
    },
    async answerQuestions(input) {
      events.push("answer");
      snapshotInputs.push(input.snapshot);
      return {
        questions: questions(options.unavailableQuestions ?? 0),
        reusedQuestionIds: options.reusedQuestionIds ?? [],
        modelCalls: options.questionModelCalls ?? 3,
        providerRetries: 1
      };
    },
    async renderHtml(input) {
      events.push(`render:${input.stage}`);
      return `<html data-revision="${input.report.artifactRevisionId}"></html>`;
    },
    async persistArtifact(input) {
      events.push(`persist:${input.stage}`);
      if (input.stage === "enhancement" && options.failure === "persist_enhancement") throw new Error("enhancement persist failed");
      return {
        payloadIdentityHash: input.stage === "core" ? "a".repeat(64) : "c".repeat(64),
        htmlSha256: input.stage === "core" ? "b".repeat(64) : "d".repeat(64)
      };
    },
    async activateCoreRevision(input) {
      revisionConfigSnapshotIds.push(input.configSnapshotId);
      events.push("activate:core");
      activeRevisionId = "core-revision";
    },
    async auditQuestionSources(input) {
      events.push(`audit:${input.question.questionId}`);
      if (options.abortController && input.question.questionId === "q1") {
        options.abortController.abort(options.abortReason);
        throw options.abortReason;
      }
      if (options.failure === "source") throw new Error("source audit failed");
      return {
        sourceAudits: input.question.sources.map((source) => ({
          questionId: input.question.questionId,
          sourceId: source.sourceId,
          canonicalUrl: source.canonicalUrl,
          status: "available" as const,
          summary: "Readable source"
        })),
        rawReads: 1,
        browserReads: input.question.questionId === "q2" ? 1 : 0
      };
    },
    async diagnoseQuestion(input) {
      events.push(`diagnose:${input.question.questionId}`);
      if (options.failure === "diagnosis" || options.failedDiagnosisQuestionIds?.has(input.question.questionId)) {
        return { status: "failed", providerAttempts: 1 };
      }
      return { status: "completed", diagnosis: diagnosis(input.question), providerAttempts: 1 };
    },
    async prepareEnhancementRevision(input) {
      revisionConfigSnapshotIds.push(input.configSnapshotId);
      events.push("prepare:enhancement");
    },
    async activateEnhancementRevision(input) {
      revisionConfigSnapshotIds.push(input.configSnapshotId);
      events.push("activate:enhancement");
      if (options.failure === "activate_enhancement") throw new Error("enhancement activation failed");
      activeRevisionId = "enhancement-revision";
    }
  };
  return {
    dependencies,
    events,
    snapshot,
    snapshotInputs,
    revisionConfigSnapshotIds,
    get activeRevisionId() { return activeRevisionId; }
  };
}

const websiteSynthesis: CombinedGeoReportV4WebsiteSynthesis = {
  summary: "The immutable website snapshot contains analyzable business content.",
  strengths: ["The service scope is explicit."],
  gaps: ["Some delivery conditions remain implicit."],
  actions: ["Add verifiable delivery conditions to the service page."]
};

function baseInput(): ReportV4OrchestratorInput {
  return {
    reportId: "report-v4",
    orderId: "order-v4",
    coreJobId: "core-job",
    configSnapshotId: "config-snapshot-v4",
    coreArtifactRevisionId: "core-revision",
    enhancementJobId: "enhancement-job",
    enhancementArtifactRevisionId: "enhancement-revision",
    targetUrl: "https://example.com/",
    locale: "zh-CN",
    snapshotIdentity: {
      id: "snapshot-v4",
      reportId: "report-v4",
      siteKey: "example.com",
      collectorConfigIdentityHash: "a".repeat(64),
      contentIdentityHash: "b".repeat(64)
    },
    questions: [
      { order: 1, questionId: "q1", questionText: "Question 1?" },
      { order: 2, questionId: "q2", questionText: "Question 2?" },
      { order: 3, questionId: "q3", questionText: "Question 3?" }
    ]
  };
}

function snapshotBundle(
  status: "completed" | "completed_limited" | "unavailable",
  analyzablePages: number
): ReportV4SiteSnapshotBundle {
  const createdAt = new Date("2026-07-16T00:00:00.000Z");
  const pages = Array.from({ length: analyzablePages }, (_, index) => ({
    id: `page-${index + 1}`,
    snapshotId: "snapshot-v4",
    ordinal: index + 1,
    normalizedUrl: `https://example.com/page-${index + 1}`,
    analyzable: true,
    readMode: index === 1 ? "js_dependent" as const : "direct_readable" as const,
    summary: `Page ${index + 1} summary`,
    contentHash: String(index + 1).repeat(64),
    exclusionReason: null,
    createdAt
  }));
  const excluded = status === "unavailable" ? 4 : 2;
  for (let index = 0; index < excluded; index += 1) {
    pages.push({
      id: `excluded-${index + 1}`,
      snapshotId: "snapshot-v4",
      ordinal: pages.length + 1,
      normalizedUrl: `https://example.com/excluded-${index + 1}`,
      analyzable: false,
      readMode: null,
      summary: null,
      contentHash: null,
      exclusionReason: "not readable",
      createdAt
    });
  }
  return {
    snapshot: {
      id: "snapshot-v4",
      reportId: "report-v4",
      siteKey: "example.com",
      collectorConfigIdentityHash: "a".repeat(64),
      capturedAt: createdAt,
      status,
      completedAt: createdAt,
      contentIdentityHash: "b".repeat(64),
      candidateUrlCount: pages.length,
      analyzablePageCount: analyzablePages,
      excludedPageCount: excluded,
      createdAt
    },
    pages
  };
}

function questions(unavailableCount = 0): [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question] {
  return ([1, 2, 3] as const).map((order): CombinedGeoReportV4Question => {
    const questionId = `q${order}`;
    const unavailable = order > 3 - unavailableCount;
    return unavailable ? {
      order,
      questionId,
      questionText: `Question ${order}?`,
      status: "unavailable",
      answer: null,
      sources: []
    } : {
      order,
      questionId,
      questionText: `Question ${order}?`,
      status: "answered",
      answer: `Answer ${order}.`,
      sources: [{
        questionId,
        sourceId: `${questionId}:source-1`,
        title: `Source ${order}`,
        canonicalUrl: `https://source.example/${order}`,
        citedText: `Evidence ${order}`,
        retrievalStatus: "not_checked"
      }]
    };
  }) as [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question];
}

function diagnosis(question: CombinedGeoReportV4Question): CombinedGeoReportV4QuestionDiagnosis {
  const evidenceRefs = [question.sources[0]!.sourceId];
  return {
    selectionSummary: "The source directly addresses the customer question.",
    observableFactors: [
      { kind: "problem_match", observation: "The source matches the stated problem.", evidenceRefs },
      { kind: "factual_specificity", observation: "The source provides concrete facts.", evidenceRefs },
      { kind: "entity_clarity", observation: "The named entities are unambiguous.", evidenceRefs }
    ],
    targetGap: "The target site does not yet state the same verifiable conditions.",
    recommendedActions: [
      { priority: 1, action: "Add the missing conditions.", evidenceRefs },
      { priority: 2, action: "Clarify the entity relationship.", evidenceRefs },
      { priority: 3, action: "Keep the public facts current.", evidenceRefs }
    ],
    detailedEvidenceRefs: evidenceRefs
  };
}

function coreReport(status: CombinedGeoReportV4Status): CombinedGeoReportV4 {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId: "core-revision",
    targetUrl: "https://example.com/",
    locale: "zh-CN",
    generatedAt: "2026-07-17T00:00:00.000Z",
    status,
    websiteSynthesis,
    questions: questions()
  };
}

function enhancedReport(status: Exclude<CombinedGeoReportV4Status, "unavailable">): CombinedGeoReportV4 {
  const core = coreReport(status);
  return {
    ...core,
    artifactRevisionId: "enhancement-revision",
    questions: [
      { ...core.questions[0], diagnosis: diagnosis(core.questions[0]) },
      core.questions[1],
      core.questions[2]
    ]
  };
}
