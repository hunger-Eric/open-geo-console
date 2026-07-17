import { describe, expect, it, vi } from "vitest";
import type {
  CombinedGeoReportV4,
  CombinedGeoReportV4Question,
  CombinedGeoReportV4WebsiteSynthesis
} from "@open-geo-console/ai-report-engine";
import type { ReportV4ConfigSnapshotRow } from "../db/report-v4-config-snapshots";
import type { ReportV4PaidCoreContext } from "../db/report-v4-production-jobs";
import type { ReportV4SiteSnapshotBundle } from "../db/report-v4-site-snapshots";
import type { ReportV4CoreStageDependencies } from "./report-v4-orchestrator";
import { ReportV4QuestionProviderError } from "./report-v4-question-answerer";
import { createStagingLiveDrill } from "./staging-live-drill";
import {
  buildReportV4CoreArtifactRevisionId,
  createReportV4CoreProductionWithDependencies,
  withReportV4QuestionFailureDrill,
  type ReportV4CoreProductionDependencies,
  type ReportV4CoreProductionInput
} from "./report-v4-core-production";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-ANSWER-01
// @requirement GEO-V4-ANSWER-02
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-COMMERCE-01

describe("Report V4 core production composition", () => {
  it("runs an exact reserved core through activation and atomic commerce in strict order", async () => {
    const harness = productionHarness();
    const result = await harness.run(input());

    expect(result.delivery).toBe("core_active");
    expect(result.counters.revisions.coreRevisionId).toBe(buildReportV4CoreArtifactRevisionId(input()));
    expect(harness.events).toEqual([
      "load-context", "load-config", "resolve-locked-config", "create-stage",
      "load-artifact", "resolve-snapshot", "synthesize-website", "answer-questions",
      "prepare-core", "render-html", "persist-payload", "activate-core", "terminalize-deliverable"
    ]);
  });

  it("recovers a settled existing exact artifact with zero model or render calls", async () => {
    const revisionId = buildReportV4CoreArtifactRevisionId(input());
    const harness = productionHarness({ existingArtifact: report(revisionId), context: settledContext(revisionId) });
    const result = await harness.run(input());

    expect(result.delivery).toBe("core_active");
    expect(result.counters.modelCalls.total).toBe(0);
    expect(harness.events).toEqual([
      "load-context", "load-config", "resolve-locked-config", "create-stage",
      "load-artifact", "resolve-snapshot", "activate-core", "terminalize-deliverable"
    ]);
  });

  it("preserves page, website, and question checkpoint reuse as zero model calls", async () => {
    const harness = productionHarness({ websiteModelCalls: 0, questionModelCalls: 0, reusedQuestionIds: ["q1", "q2", "q3"] });
    const result = await harness.run(input());

    expect(result.counters.modelCalls.total).toBe(0);
    expect(result.counters.reusedQuestionCheckpoints).toBe(3);
    expect(harness.events).toContain("synthesize-website");
    expect(harness.events).toContain("answer-questions");
  });

  it("terminalizes only the all-question-unavailable paid boundary", async () => {
    const harness = productionHarness({ unavailableQuestions: 3 });
    const result = await harness.run(input());

    expect(result.delivery).toBe("unavailable");
    expect(harness.events).toContain("terminalize-unavailable");
    expect(harness.events).not.toContain("render-html");
    expect(harness.events).not.toContain("terminalize-deliverable");
  });

  it("fails closed on an injected impossible zero-page paid snapshot without commercial writes", async () => {
    const harness = productionHarness({ snapshot: snapshotBundle("unavailable", 0) });

    await expect(harness.run(input())).rejects.toThrow(/paid.*snapshot.*analyzable|zero.*page/i);
    expect(harness.events).not.toContain("synthesize-website");
    expect(harness.events).not.toContain("answer-questions");
    expect(harness.events).not.toContain("terminalize-unavailable");
    expect(harness.events).not.toContain("terminalize-deliverable");
  });

  it("propagates abort without any terminal write", async () => {
    const controller = new AbortController();
    controller.abort(new Error("operator stop"));
    const harness = productionHarness();

    await expect(harness.run(input({ signal: controller.signal }))).rejects.toThrow("operator stop");
    expect(harness.events).toEqual([]);
  });

  it("rejects a claimed identity drift before config, artifact, or provider work", async () => {
    const harness = productionHarness();

    await expect(harness.run(input({ orderId: "wrong-order" }))).rejects.toThrow(/claimed.*lineage/i);
    expect(harness.events).toEqual(["load-context"]);
  });

  it("rejects locked configuration drift before revision, artifact, snapshot, or provider work", async () => {
    const harness = productionHarness({ config: configSnapshot({ modelProfileHash: "f".repeat(64) }) });

    await expect(harness.run(input())).rejects.toThrow(/configuration.*lineage|config.*drift/i);
    expect(harness.events).toEqual(["load-context", "load-config"]);
  });

  it("binds the deterministic core revision to every exact paid lineage field", () => {
    const base = input();
    const expected = buildReportV4CoreArtifactRevisionId(base);
    for (const changed of [
      { reportId: "other-report" }, { orderId: "other-order" }, { coreJobId: "other-job" },
      { configSnapshotId: "other-config" }, { siteSnapshotId: "other-site" },
      { questionSetId: "other-questions" }, { locale: "en" as const }
    ]) {
      expect(buildReportV4CoreArtifactRevisionId({ ...base, ...changed })).not.toBe(expected);
    }
  });

  it("maps only the exact protected-Staging question drill to a retryable provider failure", async () => {
    const answerWithSources = vi.fn(async () => ({ answerText: "ok", sources: [] }));
    const provider = withReportV4QuestionFailureDrill({
      provider: { providerId: "provider", model: "model", searchMode: "search", answerWithSources },
      coreJobId: "core-job-v4",
      liveDrill: createStagingLiveDrill({
        OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "preview", COMMERCE_MODE: "test",
        OGC_STAGING_LIVE_DRILL_JOB_ID: "core-job-v4",
        OGC_STAGING_LIVE_DRILL_FAULT: "question_failure",
        OGC_STAGING_LIVE_DRILL_QUESTION_ID: "q2",
        OGC_STAGING_LIVE_DRILL_OCCURRENCES: "2"
      })!
    });
    const signal = new AbortController().signal;

    await expect(provider.answerWithSources({
      questionId: "q2", question: "Question 2?", locale: "zh", region: "CN", signal
    })).rejects.toMatchObject({ code: "temporary_provider", retryable: true } satisfies Partial<ReportV4QuestionProviderError>);
    await expect(provider.answerWithSources({
      questionId: "q2", question: "Question 2?", locale: "zh", region: "CN", signal
    })).rejects.toMatchObject({ code: "temporary_provider", retryable: true } satisfies Partial<ReportV4QuestionProviderError>);
    await expect(provider.answerWithSources({
      questionId: "q1", question: "Question 1?", locale: "zh", region: "CN", signal
    })).resolves.toMatchObject({ answerText: "ok" });
    expect(answerWithSources).toHaveBeenCalledTimes(1);
  });
});

interface HarnessOptions {
  context?: ReportV4PaidCoreContext;
  existingArtifact?: CombinedGeoReportV4;
  snapshot?: ReportV4SiteSnapshotBundle;
  config?: ReportV4ConfigSnapshotRow;
  websiteModelCalls?: number;
  questionModelCalls?: number;
  reusedQuestionIds?: string[];
  unavailableQuestions?: number;
}

function productionHarness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const context = options.context ?? paidContext();
  const dependencies: ReportV4CoreProductionDependencies = {
    async loadPaidCoreContext() {
      events.push("load-context");
      return context;
    },
    async loadConfigSnapshot() {
      events.push("load-config");
      return options.config ?? configSnapshot();
    },
    resolveLockedConfiguration() {
      events.push("resolve-locked-config");
      return { modelRuntime: {} as never, reportRuntime: {} as never };
    },
    createCoreStageDependencies(execution) {
      events.push("create-stage");
      const stage: ReportV4CoreStageDependencies = {
        nowMs: vi.fn(() => 100),
        nowIso: vi.fn(() => "2026-07-17T00:00:00.000Z"),
        async loadCoreArtifact() {
          events.push("load-artifact");
          return options.existingArtifact ? {
            report: options.existingArtifact,
            payloadIdentityHash: "c".repeat(64),
            htmlSha256: "d".repeat(64)
          } : null;
        },
        async resolveSnapshot() {
          events.push("resolve-snapshot");
          return options.snapshot ?? snapshotBundle("completed", 1);
        },
        async synthesizeWebsite() {
          events.push("synthesize-website");
          return { websiteSynthesis, modelCalls: options.websiteModelCalls ?? 2 };
        },
        async answerQuestions() {
          events.push("answer-questions");
          return {
            questions: questions(options.unavailableQuestions ?? 0),
            reusedQuestionIds: options.reusedQuestionIds ?? [],
            modelCalls: options.questionModelCalls ?? 3,
            providerRetries: 0
          };
        },
        async renderCoreHtml() {
          events.push("render-html");
          return "<!doctype html><html></html>";
        },
        async prepareCoreRevision() {
          events.push("prepare-core");
        },
        async persistCoreArtifact() {
          events.push("persist-payload");
          return { payloadIdentityHash: "c".repeat(64), htmlSha256: "d".repeat(64) };
        },
        async activateCoreRevision() {
          events.push("activate-core");
        },
        async terminalizeUnavailableCore() {
          events.push("terminalize-unavailable");
        },
        async terminalizeDeliverableCoreAndEnqueueEnhancement() {
          events.push("terminalize-deliverable");
          return { enhancementJobId: "enhancement-job" };
        }
      };
      expect(execution.context).toBe(context);
      return stage;
    }
  };
  return { events, run: createReportV4CoreProductionWithDependencies(dependencies) };
}

function input(overrides: Partial<ReportV4CoreProductionInput> = {}): ReportV4CoreProductionInput {
  return {
    reportId: "report-v4",
    orderId: "order-v4",
    coreJobId: "core-job-v4",
    configSnapshotId: "config-v4",
    siteSnapshotId: "site-v4",
    questionSetId: "questions-v4",
    locale: "zh",
    workerId: "worker-v4",
    leaseMs: 60_000,
    signal: new AbortController().signal,
    ...overrides
  };
}

function paidContext(): ReportV4PaidCoreContext {
  return {
    report: { id: "report-v4", url: "https://example.com/", locale: "zh", activeArtifactRevisionId: null },
    targetUrl: "https://example.com/",
    order: {
      id: "order-v4", reportId: "report-v4", fulfillmentJobId: "core-job-v4", siteSnapshotId: "site-v4",
      productCode: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4, questionSetId: "questions-v4", reportLocale: "zh", paymentStatus: "paid",
      fulfillmentStatus: "processing", refundStatus: "not_required"
    },
    coreJob: {
      id: "core-job-v4", reportId: "report-v4", siteSnapshotId: "site-v4", tier: "deep",
      productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4", questionSetId: "questions-v4",
      locale: "zh", reason: "standard", stage: "queued", executionState: "running", creditReservationId: "credit-v4",
      correctionId: null, replacementFulfillmentId: null
    },
    siteSnapshot: {
      id: "site-v4", reportId: "report-v4", siteKey: "example.com", status: "completed",
      collectorConfigIdentityHash: "a".repeat(64), contentIdentityHash: "b".repeat(64)
    },
    questionSet: {
      id: "questions-v4", reportId: "report-v4", orderId: "order-v4", region: "CN", locale: "zh", status: "locked"
    },
    questions: [1, 2, 3].map((ordinal) => ({
      id: `q${ordinal}`, questionSetId: "questions-v4", ordinal,
      purpose: ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!,
      privateText: `Question ${ordinal}?`
    })),
    config: {
      id: "config-v4", reportId: "report-v4", orderId: "order-v4", coreJobId: "core-job-v4",
      identityHash: "e".repeat(64), modelProfileId: "model-v4", modelProfileHash: "1".repeat(64),
      reportProfileId: "report-profile-v4", reportProfileHash: "2".repeat(64)
    },
    credit: { id: "credit-v4", reportId: "report-v4", jobId: "core-job-v4", paymentOrderId: "order-v4", status: "reserved" },
    activeCoreArtifact: null,
    commercePhase: "reserved"
  };
}

function settledContext(artifactRevisionId: string): ReportV4PaidCoreContext {
  const context = paidContext();
  return {
    ...context,
    report: { ...context.report, activeArtifactRevisionId: artifactRevisionId },
    order: { ...context.order, fulfillmentStatus: "completed" },
    coreJob: { ...context.coreJob, stage: "completed", executionState: "completed" },
    credit: { ...context.credit, status: "settled" },
    activeCoreArtifact: {
      id: artifactRevisionId,
      reportId: context.report.id,
      orderId: context.order.id,
      jobId: context.coreJob.id,
      configSnapshotId: context.config.id,
      revisionKind: "generation",
      artifactContract: "combined_geo_report_v4",
      status: "active",
      sourceArtifactRevisionId: null
    },
    commercePhase: "settled"
  };
}

function configSnapshot(overrides: Partial<ReportV4ConfigSnapshotRow> = {}): ReportV4ConfigSnapshotRow {
  return {
    id: "config-v4", reportId: "report-v4", orderId: "order-v4", coreJobId: "core-job-v4",
    identityHash: "e".repeat(64), modelProfileId: "model-v4", modelProfileHash: "1".repeat(64),
    modelProfile: {} as never, reportProfileId: "report-profile-v4", reportProfileHash: "2".repeat(64),
    reportProfile: {} as never, createdAt: new Date("2026-07-17T00:00:00.000Z"), ...overrides
  };
}

const websiteSynthesis: CombinedGeoReportV4WebsiteSynthesis = {
  summary: "The website has analyzable business content.", strengths: ["Clear service scope."],
  gaps: ["Delivery conditions are incomplete."], actions: ["Publish verifiable delivery conditions."]
};

function questions(unavailableCount = 0): [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question] {
  return ([1, 2, 3] as const).map((order): CombinedGeoReportV4Question => order > 3 - unavailableCount
    ? { order, questionId: `q${order}`, questionText: `Question ${order}?`, status: "unavailable", answer: null, sources: [] }
    : {
        order, questionId: `q${order}`, questionText: `Question ${order}?`, status: "answered", answer: `Answer ${order}.`,
        sources: [{
          questionId: `q${order}`, sourceId: `q${order}:source`, title: `Source ${order}`,
          canonicalUrl: `https://source.example/${order}`, citedText: `Evidence ${order}.`, retrievalStatus: "not_checked"
        }]
      }) as [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question];
}

function snapshotBundle(status: "completed" | "unavailable", analyzablePageCount: number): ReportV4SiteSnapshotBundle {
  const createdAt = new Date("2026-07-17T00:00:00.000Z");
  return {
    snapshot: {
      id: "site-v4", reportId: "report-v4", siteKey: "example.com", collectorConfigIdentityHash: "a".repeat(64),
      capturedAt: createdAt, status, completedAt: createdAt, contentIdentityHash: "b".repeat(64),
      candidateUrlCount: analyzablePageCount, analyzablePageCount, excludedPageCount: 0, createdAt
    },
    pages: Array.from({ length: analyzablePageCount }, (_, index) => ({
      id: `page-${index + 1}`, snapshotId: "site-v4", ordinal: index + 1,
      normalizedUrl: `https://example.com/page-${index + 1}`, analyzable: true,
      readMode: "direct_readable" as const, summary: null, retainedText: `Page ${index + 1}`,
      contentHash: String(index + 1).repeat(64), exclusionReason: null, createdAt
    }))
  };
}

function report(artifactRevisionId: string): CombinedGeoReportV4 {
  return {
    version: 4, artifactContract: "combined_geo_report_v4", reportId: "report-v4", artifactRevisionId,
    targetUrl: "https://example.com/", locale: "zh", generatedAt: "2026-07-17T00:00:00.000Z",
    status: "completed", websiteSynthesis, questions: questions()
  };
}
