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
  runReportV4CoreStage,
  runReportV4EnhancementStage,
  type ReportV4CoreStageDependencies,
  type ReportV4CoreStageInput,
  type ReportV4EnhancementStageDependencies,
  type ReportV4EnhancementStageInput
} from "./report-v4-orchestrator";

// @requirement GEO-V4-ANSWER-02
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-02
// @requirement GEO-V4-COMMERCE-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01

describe("V4 independently claimed core and enhancement stages", () => {
  it("ends the core claim after activation, commerce terminalization, and exact enhancement enqueue", async () => {
    const core = createCoreHarness();

    const result = await runReportV4CoreStage(coreInput(), core.dependencies);

    expect(result.delivery).toBe("core_active");
    expect(result.activeReport?.artifactRevisionId).toBe("core-revision");
    expect(result.enhancement.status).toBe("not_started");
    expect(core.events).toEqual([
      "load-core", "resolve-snapshot", "synthesize", "answer", "prepare:core", "render:core", "persist:core",
      "activate:core", "terminalize", "after-terminalize", "enqueue"
    ]);
    expect(core.events.join(" ")).not.toMatch(/audit|diagnose|prepare:enhancement|activate:enhancement/i);
    expect(result.counters.modelCalls.sourceDiagnosis).toBe(0);
    expect(result.counters.sourceReads).toEqual({ raw: 0, browser: 0 });
    expect(result.counters.wholeReportReruns).toBe(0);
    expect(result.counters.pdfOperations).toBe(0);

    const enhancement = createEnhancementHarness({ failedDiagnosisQuestionIds: new Set(["q3"]) });
    const enhanced = await runReportV4EnhancementStage(enhancementInput(), enhancement.dependencies);
    expect(enhanced.delivery).toBe("enhancement_active");
    expect(enhancement.events[0]).toBe("load-claimed-enhancement");
    expect(enhancement.events).toContain("audit:q1");
    expect(enhancement.events).toContain("diagnose:q2");
    expect(enhanced.enhancement).toEqual({
      status: "completed",
      completedQuestionIds: ["q1", "q2"],
      failedQuestionIds: ["q3"]
    });
    expect(enhancement.terminalizations).toEqual([{
      reportId: "report-v4",
      coreJobId: "core-job",
      enhancementJobId: "enhancement-job",
      sourceCoreArtifactRevisionId: "core-revision",
      enhancementArtifactRevisionId: "enhancement-revision",
      outcome: "completed",
      completedQuestionIds: ["q1", "q2"],
      failedQuestionIds: ["q3"]
    }]);
  });

  it("fail-closes a zero-page snapshot without model, artifact, paid commerce, or enhancement enqueue", async () => {
    const harness = createCoreHarness({ snapshotStatus: "unavailable", analyzablePages: 0 });

    const result = await runReportV4CoreStage(coreInput(), harness.dependencies);

    expect(result.delivery).toBe("unavailable");
    expect(harness.events).toEqual(["load-core", "resolve-snapshot"]);
    expect(harness.events.join(" ")).not.toMatch(/terminalize|enqueue|render|persist|activate/i);
    expect(result.counters.modelCalls.total).toBe(0);
  });

  it("uses the unavailable commerce terminalizer when all three questions are unavailable", async () => {
    const harness = createCoreHarness({ unavailableQuestions: 3 });

    const result = await runReportV4CoreStage(coreInput(), harness.dependencies);

    expect(result.delivery).toBe("unavailable");
    expect(harness.events).toContain("terminalize:unavailable");
    expect(harness.events).not.toContain("prepare:core");
    expect(harness.events).not.toContain("render:core");
    expect(harness.events).not.toContain("terminalize");
    expect(harness.events).not.toContain("enqueue");
  });

  it.each([
    { snapshotStatus: "completed_limited" as const, unavailableQuestions: 0, expected: "completed_limited" as const },
    { snapshotStatus: "completed" as const, unavailableQuestions: 1, expected: "completed_limited" as const },
    { snapshotStatus: "completed" as const, unavailableQuestions: 0, expected: "completed" as const }
  ])("terminalizes and enqueues one deliverable $expected core", async ({ snapshotStatus, unavailableQuestions, expected }) => {
    const harness = createCoreHarness({ snapshotStatus, unavailableQuestions });

    const result = await runReportV4CoreStage(coreInput(), harness.dependencies);

    expect(result.status).toBe(expected);
    expect(result.delivery).toBe("core_active");
    expect(harness.events.filter((event) => event === "terminalize")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "after-terminalize")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "enqueue")).toHaveLength(1);
    expect(harness.events.slice(-3)).toEqual(["terminalize", "after-terminalize", "enqueue"]);
  });

  it("uses an explicit no-op after hook default between committed commerce and enqueue", async () => {
    const harness = createCoreHarness({ includeAfterHook: false });

    await expect(runReportV4CoreStage(coreInput(), harness.dependencies)).resolves.toMatchObject({
      delivery: "core_active"
    });

    expect(harness.events.slice(-2)).toEqual(["terminalize", "enqueue"]);
    expect(harness.terminalizeCalls).toBe(1);
  });

  it.each(["success", "diagnosis_failure"] as const)(
    "enqueues the enhancement for three answered questions before downstream %s handling",
    async () => {
      const harness = createCoreHarness();

      const result = await runReportV4CoreStage(coreInput(), harness.dependencies);

      expect(result.enqueueOutcome).toBeUndefined();
      expect(harness.events.filter((event) => event === "enqueue")).toHaveLength(1);
    }
  );

  it.each(["completed", "completed_limited"] as const)(
    "preserves the activated %s core status and does not start enhancement on question failure",
    async (snapshotStatus) => {
      const harness = createCoreHarness({ snapshotStatus, enqueueOutcome: "question_failure" });

      const result = await runReportV4CoreStage(coreInput(), harness.dependencies);

      expect(result).toMatchObject({
        status: snapshotStatus,
        delivery: "core_active",
        enqueueOutcome: "question_failure",
        enhancement: { status: "not_started", completedQuestionIds: [], failedQuestionIds: [] }
      });
      expect(result.activeReport?.status).toBe(snapshotStatus);
      expect(harness.events.slice(-3)).toEqual(["terminalize", "after-terminalize", "enqueue"]);
      expect(harness.events.join(" ")).not.toMatch(/audit|diagnose|prepare:enhancement|activate:enhancement/i);
    }
  );

  it("does not enqueue after a post-commit hook failure and retries from exact commercial replay", async () => {
    const harness = createCoreHarness({ hookFailuresRemaining: 1 });

    await expect(runReportV4CoreStage(coreInput(), harness.dependencies)).rejects.toThrow(/post-commit hook failed/i);
    expect(harness.activeCore?.artifactRevisionId).toBe("core-revision");
    expect(harness.committedTerminalizations).toBe(1);
    expect(harness.terminalizeCalls).toBe(1);
    expect(harness.events.filter((event) => event === "enqueue")).toHaveLength(0);

    const boundary = harness.events.length;
    const recovered = await runReportV4CoreStage(coreInput(), harness.dependencies);

    expect(recovered.delivery).toBe("core_active");
    expect(harness.events.slice(boundary)).toEqual([
      "load-core", "resolve-snapshot", "activate:core", "terminalize", "after-terminalize", "enqueue"
    ]);
    expect(harness.terminalizeCalls).toBe(2);
    expect(harness.committedTerminalizations).toBe(1);
    expect(harness.events.filter((event) => event === "answer")).toHaveLength(1);
  });

  it("keeps the activated core accessible and recovers an enqueue fault after exact commercial replay", async () => {
    const harness = createCoreHarness({ enqueueFailuresRemaining: 1 });

    await expect(runReportV4CoreStage(coreInput(), harness.dependencies)).rejects.toThrow(/enqueue failed/i);
    expect(harness.activeCore?.artifactRevisionId).toBe("core-revision");
    expect(harness.committedTerminalizations).toBe(1);
    expect(harness.terminalizeCalls).toBe(1);
    expect(harness.events.filter((event) => event === "synthesize")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "answer")).toHaveLength(1);

    const boundary = harness.events.length;
    const recovered = await runReportV4CoreStage(coreInput(), harness.dependencies);

    expect(recovered.delivery).toBe("core_active");
    expect(harness.events.slice(boundary)).toEqual([
      "load-core", "resolve-snapshot", "activate:core", "terminalize", "after-terminalize", "enqueue"
    ]);
    expect(harness.terminalizeCalls).toBe(2);
    expect(harness.events.filter((event) => event === "enqueue")).toHaveLength(2);
    expect(harness.committedTerminalizations).toBe(1);
    expect(harness.events.filter((event) => event === "answer")).toHaveLength(1);
    expect(recovered.counters.wholeReportReruns).toBe(0);
  });

  it("validates a persisted recovery payload before idempotent activation", async () => {
    const drifted = { ...coreReportFromInput("core-revision", "completed", 0), targetUrl: "https://drift.example/" };
    const harness = createCoreHarness({ existingCore: drifted });

    await expect(runReportV4CoreStage(coreInput(), harness.dependencies)).rejects.toThrow(/artifact.*stage identity|match.*identity/i);
    expect(harness.events).toEqual(["load-core", "resolve-snapshot"]);
    expect(harness.events).not.toContain("activate:core");
    expect(harness.events).not.toContain("terminalize");
    expect(harness.events).not.toContain("enqueue");
  });

  it("does no enhancement work when the no-credit job was not independently claimed", async () => {
    const harness = createEnhancementHarness({ claimed: false });

    await expect(runReportV4EnhancementStage(enhancementInput(), harness.dependencies))
      .rejects.toThrow(/independently claimed|claimed enhancement/i);

    expect(harness.events).toEqual(["load-claimed-enhancement"]);
  });

  it("starts answered-question enhancement units in parallel only after the independent claim", async () => {
    const harness = createEnhancementHarness({ unavailableQuestions: 1 });
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalAudit = harness.dependencies.auditQuestionSources;
    const dependencies: ReportV4EnhancementStageDependencies = {
      ...harness.dependencies,
      async auditQuestionSources(input) {
        started.push(input.question.questionId);
        await gate;
        return originalAudit(input);
      }
    };

    const running = runReportV4EnhancementStage(enhancementInput(), dependencies);
    try {
      for (let check = 0; check < 50 && started.length < 2; check += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(started).toEqual(["q1", "q2"]);
      expect(harness.events[0]).toBe("load-claimed-enhancement");
    } finally {
      release();
    }
    await expect(running).resolves.toMatchObject({ delivery: "enhancement_active" });
  });

  it("counts completed diagnosis checkpoint recovery as zero provider calls", async () => {
    const harness = createEnhancementHarness({ diagnosisProviderAttempts: 0 });

    const result = await runReportV4EnhancementStage(enhancementInput(), harness.dependencies);

    expect(result.delivery).toBe("enhancement_active");
    expect(result.counters.modelCalls.sourceDiagnosis).toBe(0);
    expect(result.counters.providerRetries.sourceDiagnosis).toBe(0);
  });

  it.each([
    "source",
    "diagnosis",
    "prepare_enhancement",
    "render_enhancement",
    "persist_enhancement"
  ] as const)(
    "keeps the settled core active without commerce effects when %s enhancement work fails",
    async (failure) => {
      const harness = createEnhancementHarness({ failure });

      const result = await runReportV4EnhancementStage(enhancementInput(), harness.dependencies);

      expect(result.delivery).toBe("core_active");
      expect(result.activeReport?.artifactRevisionId).toBe("core-revision");
      expect(harness.activeRevisionId).toBe("core-revision");
      expect(result.enhancement.status).toBe("failed");
      expect(result.counters.revisions.enhancementActivated).toBe(0);
      expect(harness.events.join(" ")).not.toMatch(/commerce|terminalize:core|refund|credit|access/i);
      const unitsFailed = failure === "source" || failure === "diagnosis";
      expect(harness.terminalizations).toEqual([{
        reportId: "report-v4",
        coreJobId: "core-job",
        enhancementJobId: "enhancement-job",
        sourceCoreArtifactRevisionId: "core-revision",
        enhancementArtifactRevisionId: "enhancement-revision",
        outcome: "failed",
        completedQuestionIds: unitsFailed ? [] : ["q1", "q2", "q3"],
        failedQuestionIds: unitsFailed ? ["q1", "q2", "q3"] : []
      }]);
      const prepared = failure === "render_enhancement" || failure === "persist_enhancement";
      expect(harness.events.includes("fail-revision:enhancement")).toBe(prepared);
      if (prepared) {
        expect(harness.events.indexOf("fail-revision:enhancement"))
          .toBeLessThan(harness.events.indexOf("terminalize-enhancement:failed"));
        expect(harness.enhancementRevisionState).toBe("failed");
        expect(harness.failedRevisionIdentities).toEqual([{
          artifactRevisionId: "enhancement-revision",
          reportId: "report-v4",
          orderId: "order-v4",
          jobId: "enhancement-job",
          configSnapshotId: "config-snapshot-v4",
          sourceArtifactRevisionId: "core-revision"
        }]);
      } else {
        expect(harness.enhancementRevisionState).toBe("absent");
        expect(harness.failedRevisionIdentities).toEqual([]);
      }
    }
  );

  it("propagates enhancement abort without retracting the active core or writing commerce", async () => {
    const controller = new AbortController();
    const reason = new DOMException("caller stopped", "AbortError");
    const harness = createEnhancementHarness({ abortController: controller, abortReason: reason });

    await expect(runReportV4EnhancementStage(
      { ...enhancementInput(), signal: controller.signal },
      harness.dependencies
    )).rejects.toBe(reason);

    expect(harness.activeRevisionId).toBe("core-revision");
    expect(harness.events).not.toContain("prepare:enhancement");
    expect(harness.terminalizations).toEqual([]);
    expect(harness.events.join(" ")).not.toMatch(/commerce|terminalize/i);
  });

  it.each([
    ["prepare", "pending"],
    ["render", "pending"],
    ["persist", "ready"],
    ["activate", "active"]
  ] as const)("does not fail a revision or terminalize when caller aborts during %s", async (deliveryAbortAt, expectedState) => {
    const controller = new AbortController();
    const reason = new DOMException(`caller stopped at ${deliveryAbortAt}`, "AbortError");
    const harness = createEnhancementHarness({
      abortController: controller,
      abortReason: reason,
      deliveryAbortAt
    });

    await expect(runReportV4EnhancementStage(
      { ...enhancementInput(), signal: controller.signal },
      harness.dependencies
    )).rejects.toBe(reason);

    expect(harness.enhancementRevisionState).toBe(expectedState);
    expect(harness.events).not.toContain("fail-revision:enhancement");
    expect(harness.terminalizations).toEqual([]);
  });

  it("returns an already active enhancement without rerunning audit, diagnosis, rendering, or activation", async () => {
    const harness = createEnhancementHarness({ activeEnhancement: enhancedReport("completed") });

    const result = await runReportV4EnhancementStage(enhancementInput(), harness.dependencies);

    expect(result.delivery).toBe("enhancement_active");
    expect(result.enhancement.completedQuestionIds).toEqual(["q1"]);
    expect(harness.events).toEqual(["load-claimed-enhancement", "terminalize-enhancement:completed"]);
    expect(harness.terminalizations).toEqual([expect.objectContaining({
      outcome: "completed",
      completedQuestionIds: ["q1"],
      failedQuestionIds: ["q2", "q3"]
    })]);
    expect(result.counters.wholeReportReruns).toBe(0);
    expect(result.counters.pdfOperations).toBe(0);
  });

  it("rejects an active enhancement that changes an immutable core answer", async () => {
    const original = enhancedReport("completed");
    const changed: CombinedGeoReportV4 = {
      ...original,
      questions: [{ ...original.questions[0], answer: "Replaced answer." }, original.questions[1], original.questions[2]]
    };
    const harness = createEnhancementHarness({ activeEnhancement: changed });

    await expect(runReportV4EnhancementStage(enhancementInput(), harness.dependencies))
      .rejects.toThrow(/cannot retract|replace core question/i);
    expect(harness.events).toEqual(["load-claimed-enhancement"]);
  });

  it("throws when crash-window terminalization fails while preserving the already active enhancement", async () => {
    const harness = createEnhancementHarness({
      activeEnhancement: enhancedReport("completed"),
      terminalizeFailure: true
    });

    await expect(runReportV4EnhancementStage(enhancementInput(), harness.dependencies))
      .rejects.toThrow(/enhancement terminalization failed/i);

    expect(harness.activeRevisionId).toBe("enhancement-revision");
    expect(harness.events).toEqual(["load-claimed-enhancement", "terminalize-enhancement:completed"]);
    expect(harness.events.join(" ")).not.toMatch(/audit|diagnose|render|persist|activate:enhancement/i);
  });

  it("does not report success when terminalization fails after a new enhancement activation", async () => {
    const harness = createEnhancementHarness({ terminalizeFailure: true });

    await expect(runReportV4EnhancementStage(enhancementInput(), harness.dependencies))
      .rejects.toThrow(/enhancement terminalization failed/i);

    expect(harness.activeRevisionId).toBe("enhancement-revision");
    expect(harness.events.indexOf("activate:enhancement"))
      .toBeLessThan(harness.events.indexOf("terminalize-enhancement:completed"));
  });

  it("does not report failed completion when failed-outcome terminalization itself fails", async () => {
    const harness = createEnhancementHarness({ failure: "source", terminalizeFailure: true });

    await expect(runReportV4EnhancementStage(enhancementInput(), harness.dependencies))
      .rejects.toThrow(/enhancement terminalization failed/i);

    expect(harness.activeRevisionId).toBe("core-revision");
    expect(harness.events).toContain("terminalize-enhancement:failed");
  });

  it("keeps the claimed job recoverable when failing a prepared revision itself fails", async () => {
    const harness = createEnhancementHarness({ failure: "fail_enhancement_revision" });

    await expect(runReportV4EnhancementStage(enhancementInput(), harness.dependencies))
      .rejects.toThrow(/enhancement revision cleanup failed/i);

    expect(harness.activeRevisionId).toBe("core-revision");
    expect(harness.enhancementRevisionState).toBe("ready");
    expect(harness.events).toContain("fail-revision:enhancement");
    expect(harness.events).not.toContain("terminalize-enhancement:failed");
    expect(harness.terminalizations).toEqual([]);
  });

  it("keeps an ambiguous pre-commit activation failure nonterminal for exact-claim recovery", async () => {
    const harness = createEnhancementHarness({ failure: "activate_enhancement" });

    const result = await runReportV4EnhancementStage(enhancementInput(), harness.dependencies);

    expect(result.delivery).toBe("core_active");
    expect(result.enhancement.status).toBe("not_started");
    expect(harness.activeRevisionId).toBe("core-revision");
    expect(harness.enhancementRevisionState).toBe("ready");
    expect(harness.events.filter((event) => event === "load-claimed-enhancement")).toHaveLength(2);
    expect(harness.events).not.toContain("fail-revision:enhancement");
    expect(harness.events.join(" ")).not.toMatch(/terminalize-enhancement/);
    expect(harness.terminalizations).toEqual([]);
  });

  it("recovers an activation commit whose client saw an error in the same claimed execution", async () => {
    const harness = createEnhancementHarness({ failure: "activate_enhancement_after_commit" });

    const recovered = await runReportV4EnhancementStage(enhancementInput(), harness.dependencies);

    expect(recovered.delivery).toBe("enhancement_active");
    expect(recovered.enhancement.status).toBe("completed");
    expect(harness.activeRevisionId).toBe("enhancement-revision");
    expect(harness.enhancementRevisionState).toBe("active");
    expect(harness.events.filter((event) => event === "load-claimed-enhancement")).toHaveLength(2);
    expect(harness.events).not.toContain("fail-revision:enhancement");
    expect(harness.events.slice(-2)).toEqual(["load-claimed-enhancement", "terminalize-enhancement:completed"]);
    expect(harness.terminalizations).toEqual([expect.objectContaining({
      outcome: "completed",
      completedQuestionIds: ["q1", "q2", "q3"],
      failedQuestionIds: []
    })]);
  });

  it("preserves exact-claim retry when activation recovery cannot reload the active pointer", async () => {
    const harness = createEnhancementHarness({ failure: "activate_enhancement_recovery_unknown" });

    const result = await runReportV4EnhancementStage(enhancementInput(), harness.dependencies);

    expect(result.delivery).toBe("core_active");
    expect(result.enhancement.status).toBe("not_started");
    expect(harness.activeRevisionId).toBe("enhancement-revision");
    expect(harness.enhancementRevisionState).toBe("active");
    expect(harness.events.filter((event) => event === "load-claimed-enhancement")).toHaveLength(2);
    expect(harness.events).not.toContain("fail-revision:enhancement");
    expect(harness.terminalizations).toEqual([]);
  });

  it.each([
    { coreCommerceStatus: "reserved" as const, coreAccessStatus: "active" as const },
    { coreCommerceStatus: "settled" as const, coreAccessStatus: "missing" as const }
  ])("refuses enhancement unless source core is settled and accessible: $coreCommerceStatus/$coreAccessStatus", async (options) => {
    const harness = createEnhancementHarness(options);

    await expect(runReportV4EnhancementStage(enhancementInput(), harness.dependencies))
      .rejects.toThrow(/settled.*active|active.*settled|accessible/i);
    expect(harness.events).toEqual(["load-claimed-enhancement"]);
  });

  it("rejects legacy, replacement, PDF, and provider-qualification dependencies from the stage source", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => (
      readFile(new URL("./report-v4-orchestrator.ts", import.meta.url), "utf8")
    ));
    expect(source).not.toMatch(/providerClaim|providerQualification|fourSnapshots|replacementFulfillment|generatePdf|pdfPageCount/i);
    expect(source).not.toContain("terminalizeDeliverableCoreAndEnqueueEnhancement");
  });
});

type EnhancementFailure =
  | "source"
  | "diagnosis"
  | "prepare_enhancement"
  | "render_enhancement"
  | "persist_enhancement"
  | "activate_enhancement"
  | "activate_enhancement_after_commit"
  | "activate_enhancement_recovery_unknown"
  | "fail_enhancement_revision";

interface CoreHarnessOptions {
  readonly snapshotStatus?: "completed" | "completed_limited" | "unavailable";
  readonly analyzablePages?: number;
  readonly unavailableQuestions?: number;
  readonly reusedQuestionIds?: readonly string[];
  readonly questionModelCalls?: number;
  readonly hookFailuresRemaining?: number;
  readonly enqueueFailuresRemaining?: number;
  readonly enqueueOutcome?: "enqueued" | "question_failure";
  readonly includeAfterHook?: boolean;
  readonly existingCore?: CombinedGeoReportV4;
}

function createCoreHarness(options: CoreHarnessOptions = {}) {
  const events: string[] = [];
  const snapshot = snapshotBundle(options.snapshotStatus ?? "completed", options.analyzablePages ?? 2);
  let activeCore: CombinedGeoReportV4 | null = options.existingCore ?? null;
  let hookFailuresRemaining = options.hookFailuresRemaining ?? 0;
  let enqueueFailuresRemaining = options.enqueueFailuresRemaining ?? 0;
  let committedTerminalizations = 0;
  let terminalizeCalls = 0;
  let now = 1_000;
  const dependencies: ReportV4CoreStageDependencies = {
    nowMs: () => (now += 5),
    nowIso: () => "2026-07-17T00:00:00.000Z",
    async loadCoreArtifact() {
      events.push("load-core");
      return activeCore ? {
        report: activeCore,
        payloadIdentityHash: "a".repeat(64),
        htmlSha256: "b".repeat(64)
      } : null;
    },
    async resolveSnapshot() {
      events.push("resolve-snapshot");
      return snapshot;
    },
    async synthesizeWebsite() {
      events.push("synthesize");
      return { websiteSynthesis, modelCalls: 1 };
    },
    async answerQuestions() {
      events.push("answer");
      return {
        questions: questions(options.unavailableQuestions ?? 0),
        reusedQuestionIds: options.reusedQuestionIds ?? [],
        modelCalls: options.questionModelCalls ?? 3,
        providerRetries: 1
      };
    },
    async renderCoreHtml(input) {
      events.push("render:core");
      return `<html data-revision="${input.report.artifactRevisionId}"></html>`;
    },
    async prepareCoreRevision() {
      events.push("prepare:core");
    },
    async persistCoreArtifact() {
      events.push("persist:core");
      return { payloadIdentityHash: "a".repeat(64), htmlSha256: "b".repeat(64) };
    },
    async activateCoreRevision(input) {
      events.push("activate:core");
      activeCore = coreReportFromInput(input.artifactRevisionId, options.snapshotStatus ?? "completed", options.unavailableQuestions ?? 0);
    },
    async terminalizeUnavailableCore() {
      events.push("terminalize:unavailable");
    },
    async terminalizeCoreCommercial() {
      events.push("terminalize");
      terminalizeCalls += 1;
      committedTerminalizations = 1;
    },
    ...(options.includeAfterHook === false ? {} : {
      async afterCoreCommercialTerminalized() {
        events.push("after-terminalize");
        if (hookFailuresRemaining > 0) {
          hookFailuresRemaining -= 1;
          throw new Error("post-commit hook failed");
        }
      }
    }),
    async enqueueDiagnosisEnhancement() {
      events.push("enqueue");
      if (enqueueFailuresRemaining > 0) {
        enqueueFailuresRemaining -= 1;
        throw new Error("enhancement enqueue failed");
      }
      return options.enqueueOutcome === "question_failure"
        ? { status: "not_enqueued", reason: "question_failure" } as const
        : { status: "enqueued", enhancementJobId: "enhancement-job" } as const;
    }
  };
  return {
    dependencies,
    events,
    snapshot,
    get activeCore() { return activeCore; },
    get committedTerminalizations() { return committedTerminalizations; },
    get terminalizeCalls() { return terminalizeCalls; }
  };
}

interface EnhancementHarnessOptions {
  readonly claimed?: boolean;
  readonly unavailableQuestions?: number;
  readonly failedDiagnosisQuestionIds?: ReadonlySet<string>;
  readonly failure?: EnhancementFailure;
  readonly abortController?: AbortController;
  readonly abortReason?: unknown;
  readonly activeEnhancement?: CombinedGeoReportV4 | null;
  readonly coreCommerceStatus?: "reserved" | "settled";
  readonly coreAccessStatus?: "active" | "missing";
  readonly terminalizeFailure?: boolean;
  readonly deliveryAbortAt?: "prepare" | "render" | "persist" | "activate";
  readonly diagnosisProviderAttempts?: 0 | 1 | 2;
}

function createEnhancementHarness(options: EnhancementHarnessOptions = {}) {
  const events: string[] = [];
  const sourceCore = coreReportFromInput("core-revision", "completed", options.unavailableQuestions ?? 0);
  const snapshot = snapshotBundle("completed", 2);
  let activeArtifact = options.activeEnhancement ?? sourceCore;
  let activeRevisionId = activeArtifact.artifactRevisionId;
  let enhancementRevisionState: "absent" | "pending" | "ready" | "active" | "failed" = options.activeEnhancement
    ? "active"
    : "absent";
  let enhancementCandidate: CombinedGeoReportV4 | null = options.activeEnhancement ?? null;
  let claimedContextLoads = 0;
  const terminalizations: Array<{
    reportId: string;
    coreJobId: string;
    enhancementJobId: string;
    sourceCoreArtifactRevisionId: string;
    enhancementArtifactRevisionId: string;
    outcome: "completed" | "failed";
    completedQuestionIds: readonly string[];
    failedQuestionIds: readonly string[];
  }> = [];
  const failedRevisionIdentities: Array<{
    artifactRevisionId: string;
    reportId: string;
    orderId: string;
    jobId: string;
    configSnapshotId: string;
    sourceArtifactRevisionId: string;
  }> = [];
  let now = 1_000;
  const dependencies: ReportV4EnhancementStageDependencies = {
    nowMs: () => (now += 5),
    nowIso: () => "2026-07-17T00:00:00.000Z",
    async loadClaimedEnhancementContext() {
      events.push("load-claimed-enhancement");
      claimedContextLoads += 1;
      if (options.failure === "activate_enhancement_recovery_unknown" && claimedContextLoads > 1) {
        throw new Error("active pointer reload unavailable");
      }
      if (options.claimed === false) return null;
      return {
        enhancementJobId: "enhancement-job",
        sourceCore,
        activeArtifact,
        snapshot,
        coreCommerceStatus: options.coreCommerceStatus ?? "settled",
        coreAccessStatus: options.coreAccessStatus ?? "active"
      };
    },
    async auditQuestionSources(input) {
      events.push(`audit:${input.question.questionId}`);
      if (options.abortController && !options.deliveryAbortAt && input.question.questionId === "q1") {
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
      return {
        status: "completed",
        diagnosis: diagnosis(input.question),
        providerAttempts: options.diagnosisProviderAttempts ?? 1
      };
    },
    async prepareEnhancementRevision() {
      events.push("prepare:enhancement");
      if (options.failure === "prepare_enhancement") throw new Error("enhancement prepare failed");
      enhancementRevisionState = "pending";
      abortDelivery("prepare");
    },
    async renderEnhancementHtml(input) {
      events.push("render:enhancement");
      if (options.failure === "render_enhancement") throw new Error("enhancement render failed");
      abortDelivery("render");
      return `<html data-revision="${input.report.artifactRevisionId}"></html>`;
    },
    async persistEnhancementArtifact(input) {
      events.push("persist:enhancement");
      if (options.failure === "persist_enhancement") throw new Error("enhancement persist failed");
      enhancementCandidate = input.report;
      enhancementRevisionState = "ready";
      if (options.failure === "fail_enhancement_revision") throw new Error("enhancement persist response failed");
      abortDelivery("persist");
      return { payloadIdentityHash: "c".repeat(64), htmlSha256: "d".repeat(64) };
    },
    async activateEnhancementRevision() {
      events.push("activate:enhancement");
      if (options.failure === "activate_enhancement") {
        throw new Error("enhancement activation failed");
      }
      activeRevisionId = "enhancement-revision";
      activeArtifact = enhancementCandidate!;
      enhancementRevisionState = "active";
      abortDelivery("activate");
      if (options.failure === "activate_enhancement_after_commit"
        || options.failure === "activate_enhancement_recovery_unknown") {
        throw new Error("activation client response failed");
      }
    },
    async failEnhancementRevision(input) {
      events.push("fail-revision:enhancement");
      failedRevisionIdentities.push({
        artifactRevisionId: input.artifactRevisionId,
        reportId: input.reportId,
        orderId: input.orderId,
        jobId: input.jobId,
        configSnapshotId: input.configSnapshotId,
        sourceArtifactRevisionId: input.sourceArtifactRevisionId
      });
      if (enhancementRevisionState === "active") throw new Error("active enhancement revision cannot be failed");
      if (options.failure === "fail_enhancement_revision") throw new Error("enhancement revision cleanup failed");
      enhancementRevisionState = "failed";
    },
    async terminalizeEnhancementJob(input) {
      events.push(`terminalize-enhancement:${input.outcome}`);
      terminalizations.push({
        reportId: input.reportId,
        coreJobId: input.coreJobId,
        enhancementJobId: input.enhancementJobId,
        sourceCoreArtifactRevisionId: input.sourceCoreArtifactRevisionId,
        enhancementArtifactRevisionId: input.enhancementArtifactRevisionId,
        outcome: input.outcome,
        completedQuestionIds: [...input.completedQuestionIds],
        failedQuestionIds: [...input.failedQuestionIds]
      });
      if (options.terminalizeFailure) throw new Error("enhancement terminalization failed");
    }
  };
  return {
    dependencies,
    events,
    terminalizations,
    failedRevisionIdentities,
    get activeRevisionId() { return activeRevisionId; },
    get enhancementRevisionState() { return enhancementRevisionState; }
  };

  function abortDelivery(point: NonNullable<EnhancementHarnessOptions["deliveryAbortAt"]>): void {
    if (options.deliveryAbortAt !== point || !options.abortController) return;
    options.abortController.abort(options.abortReason);
    throw options.abortReason;
  }
}

function coreInput(): ReportV4CoreStageInput {
  return {
    reportId: "report-v4",
    orderId: "order-v4",
    coreJobId: "core-job",
    configSnapshotId: "config-snapshot-v4",
    questionSetId: "question-set-v4",
    coreArtifactRevisionId: "core-revision",
    targetUrl: "https://example.com/",
    locale: "zh-CN",
    snapshotIdentity: snapshotIdentity(),
    questions: questionSpecs()
  };
}

function enhancementInput(): ReportV4EnhancementStageInput {
  return {
    reportId: "report-v4",
    orderId: "order-v4",
    coreJobId: "core-job",
    configSnapshotId: "config-snapshot-v4",
    questionSetId: "question-set-v4",
    sourceCoreArtifactRevisionId: "core-revision",
    enhancementJobId: "enhancement-job",
    enhancementArtifactRevisionId: "enhancement-revision",
    targetUrl: "https://example.com/",
    locale: "zh-CN",
    snapshotIdentity: snapshotIdentity(),
    questions: questionSpecs()
  };
}

function snapshotIdentity() {
  return {
    id: "snapshot-v4",
    reportId: "report-v4",
    siteKey: "example.com",
    collectorConfigIdentityHash: "a".repeat(64),
    contentIdentityHash: "b".repeat(64)
  };
}

function questionSpecs() {
  return [
    { order: 1 as const, questionId: "q1", questionText: "Question 1?" },
    { order: 2 as const, questionId: "q2", questionText: "Question 2?" },
    { order: 3 as const, questionId: "q3", questionText: "Question 3?" }
  ] as const;
}

const websiteSynthesis: CombinedGeoReportV4WebsiteSynthesis = {
  summary: "The immutable website snapshot contains analyzable business content.",
  strengths: ["The service scope is explicit."],
  gaps: ["Some delivery conditions remain implicit."],
  actions: ["Add verifiable delivery conditions to the service page."]
};

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
    return order > 3 - unavailableCount ? {
      order, questionId, questionText: `Question ${order}?`, status: "unavailable", answer: null, sources: []
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

function coreReportFromInput(
  artifactRevisionId: string,
  snapshotStatus: "completed" | "completed_limited" | "unavailable",
  unavailableQuestions: number
): CombinedGeoReportV4 {
  const reportQuestions = questions(unavailableQuestions);
  const answered = reportQuestions.filter(({ status }) => status === "answered").length;
  const status: CombinedGeoReportV4Status = answered === 0
    ? "unavailable"
    : snapshotStatus === "completed" && answered === 3 ? "completed" : "completed_limited";
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId,
    targetUrl: "https://example.com/",
    locale: "zh-CN",
    generatedAt: "2026-07-17T00:00:00.000Z",
    status,
    websiteSynthesis,
    questions: reportQuestions
  };
}

function enhancedReport(status: Exclude<CombinedGeoReportV4Status, "unavailable">): CombinedGeoReportV4 {
  const core = coreReportFromInput("core-revision", status, 0);
  return {
    ...core,
    artifactRevisionId: "enhancement-revision",
    status,
    questions: [{ ...core.questions[0], diagnosis: diagnosis(core.questions[0]) }, core.questions[1], core.questions[2]]
  };
}
