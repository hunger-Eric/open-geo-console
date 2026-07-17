import { describe, expect, it, vi } from "vitest";
import type { ReportV4ConfigSnapshotRow } from "../db/report-v4-config-snapshots";
import type { ReportV4ModelRuntimeConfig } from "../report-v4/model-runtime-config";
import type { ReportV4ReportRuntimeConfig } from "../report-v4/report-runtime-config";
import { ReportV4DiagnosisProviderError } from "./report-v4-diagnosis-enhancer";
import type { ReportV4EnhancementStageDependencies } from "./report-v4-orchestrator";
import { auditReportV4Sources } from "./report-v4-source-audit";
import { createStagingLiveDrill } from "./staging-live-drill";
import {
  buildReportV4EnhancementArtifactRevisionId,
  createReportV4EnhancementProductionWithDependencies,
  withReportV4DiagnosisFailureDrill,
  withReportV4IndependentSourceReadFailureDrill,
  type ClaimedReportV4EnhancementContext,
  type ClaimedReportV4EnhancementJob,
  type ReportV4EnhancementProductionDependencies
} from "./report-v4-enhancement-production";

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-SOURCE-02
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-COMMERCE-01

const NOW = new Date("2026-07-17T00:00:00.000Z");

describe("Report V4 enhancement production boundary", () => {
  it("rejects a non-live local claim before reading authoritative state", async () => {
    const dependencies = dependenciesFor();
    const run = createReportV4EnhancementProductionWithDependencies(dependencies);

    await expect(run({
      job: { ...claimedJob(), leaseOwner: "another-worker" },
      workerId: "worker-1",
      signal: new AbortController().signal
    })).rejects.toThrow(/independently claimed/i);

    expect(dependencies.loadClaimedContext).not.toHaveBeenCalled();
  });

  it("loads authority, locked configuration, and only then enters the stage with exact lineage", async () => {
    const calls: string[] = [];
    const context = claimedContext();
    const stageDependencies = {} as ReportV4EnhancementStageDependencies;
    const runStage = vi.fn(async (input, dependencies) => {
      calls.push("stage");
      expect(dependencies).toBe(stageDependencies);
      expect(input).toMatchObject({
        reportId: "report-1",
        orderId: "order-1",
        coreJobId: "core-job-1",
        configSnapshotId: "config-1",
        questionSetId: "question-set-1",
        sourceCoreArtifactRevisionId: "core-artifact-1",
        enhancementJobId: "enhancement-job-1",
        enhancementArtifactRevisionId: buildReportV4EnhancementArtifactRevisionId(context.lineage),
        questions: [
          { order: 1, questionId: "q1", questionText: "Question one?" },
          { order: 2, questionId: "q2", questionText: "Question two?" },
          { order: 3, questionId: "q3", questionText: "Question three?" }
        ]
      });
      return { delivery: "enhancement_active" } as never;
    });
    const dependencies = dependenciesFor({
      loadClaimedContext: vi.fn(async (input) => {
        calls.push("authority");
        expect(input).toEqual({ enhancementJobId: "enhancement-job-1", workerId: "worker-1" });
        return context;
      }),
      loadConfigSnapshot: vi.fn(async () => {
        calls.push("snapshot");
        return configSnapshot();
      }),
      resolveLockedConfiguration: vi.fn(() => {
        calls.push("locked-runtime");
        return lockedConfiguration();
      }),
      createStageDependencies: vi.fn(() => {
        calls.push("stage-dependencies");
        return stageDependencies;
      }),
      runStage
    });

    await expect(createReportV4EnhancementProductionWithDependencies(dependencies)({
      job: claimedJob(), workerId: "worker-1", signal: new AbortController().signal
    })).resolves.toMatchObject({ delivery: "enhancement_active" });

    expect(calls).toEqual(["authority", "snapshot", "locked-runtime", "stage-dependencies", "stage"]);
  });

  it("fails closed when the authoritative owner conflicts before config or stage work", async () => {
    const context = claimedContext();
    const dependencies = dependenciesFor({
      loadClaimedContext: vi.fn(async () => ({
        ...context,
        enhancementJob: { ...context.enhancementJob, leaseOwner: "another-worker" }
      }))
    });

    await expect(createReportV4EnhancementProductionWithDependencies(dependencies)({
      job: claimedJob(), workerId: "worker-1", signal: new AbortController().signal
    })).rejects.toThrow(/authoritative.*lease/i);

    expect(dependencies.loadConfigSnapshot).not.toHaveBeenCalled();
    expect(dependencies.createStageDependencies).not.toHaveBeenCalled();
  });

  it("does not re-evaluate a stale claimed-job expiry after PostgreSQL returned authoritative live context", async () => {
    const dependencies = dependenciesFor();
    await expect(createReportV4EnhancementProductionWithDependencies(dependencies)({
      job: { ...claimedJob(), leaseExpiresAt: new Date("2020-01-01T00:00:00.000Z") },
      workerId: "worker-1",
      signal: new AbortController().signal
    })).resolves.toMatchObject({ delivery: "enhancement_active" });
    expect(dependencies.loadClaimedContext).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the immutable config snapshot drifts", async () => {
    const dependencies = dependenciesFor({
      loadConfigSnapshot: vi.fn(async () => ({ ...configSnapshot(), modelProfileHash: "drift" }))
    });

    await expect(createReportV4EnhancementProductionWithDependencies(dependencies)({
      job: claimedJob(), workerId: "worker-1", signal: new AbortController().signal
    })).rejects.toThrow(/configuration lineage has drifted/i);

    expect(dependencies.resolveLockedConfiguration).not.toHaveBeenCalled();
    expect(dependencies.createStageDependencies).not.toHaveBeenCalled();
  });

  it("propagates caller abort after authority loading without config or stage side effects", async () => {
    const controller = new AbortController();
    const dependencies = dependenciesFor({
      loadClaimedContext: vi.fn(async () => {
        controller.abort(new Error("operator stop"));
        return claimedContext();
      })
    });

    await expect(createReportV4EnhancementProductionWithDependencies(dependencies)({
      job: claimedJob(), workerId: "worker-1", signal: controller.signal
    })).rejects.toThrow(/operator stop/i);

    expect(dependencies.loadConfigSnapshot).not.toHaveBeenCalled();
    expect(dependencies.createStageDependencies).not.toHaveBeenCalled();
  });

  it("derives a stable revision id from authoritative lineage and changes on source revision", () => {
    const lineage = claimedContext().lineage;
    const first = buildReportV4EnhancementArtifactRevisionId(lineage);
    expect(first).toBe(buildReportV4EnhancementArtifactRevisionId({ ...lineage }));
    expect(first).toMatch(/^report-v4-enhancement-[a-f0-9]{64}$/u);
    expect(first).not.toBe(buildReportV4EnhancementArtifactRevisionId({
      ...lineage, coreArtifactRevisionId: "core-artifact-2"
    }));
  });

  it("maps two exact diagnosis drill occurrences to retryable provider failures", async () => {
    const generate = vi.fn(async () => ({ selectionSummary: "unused" }));
    const provider = withReportV4DiagnosisFailureDrill({
      provider: { generate },
      enhancementJobId: "enhancement-job-1",
      questionId: "q2",
      liveDrill: v4Drill("diagnosis_failure", "2")
    });
    const request = { kind: "diagnose" as const, input: {} as never, signal: new AbortController().signal };

    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "temporary_provider", retryable: true
    } satisfies Partial<ReportV4DiagnosisProviderError>);
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: "temporary_provider", retryable: true
    } satisfies Partial<ReportV4DiagnosisProviderError>);
    await expect(provider.generate(request)).resolves.toMatchObject({ selectionSummary: "unused" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("turns only the exact source read into an inaccessible audit while preserving the core answer and link", async () => {
    const readRawSource = vi.fn(async () => ({ status: "available" as const, summary: "available" }));
    const renderBrowserSource = vi.fn(async () => ({ status: "available" as const, summary: "browser" }));
    const dependencies = withReportV4IndependentSourceReadFailureDrill({
      dependencies: { readRawSource, renderBrowserSource },
      enhancementJobId: "enhancement-job-1",
      liveDrill: v4Drill("independent_source_read_failure", "1", "source-2")
    });
    const question = {
      order: 2 as const, questionId: "q2", questionText: "Question two?", status: "answered" as const,
      answer: "Persisted answer.",
      sources: [{
        questionId: "q2", sourceId: "source-2", title: "Persisted source",
        canonicalUrl: "https://source.example/two", citedText: "Persisted citation.", retrievalStatus: "not_checked" as const
      }]
    };

    const [result] = await auditReportV4Sources([question], dependencies);
    expect(result!.question).toBe(question);
    expect(result!.question.answer).toBe("Persisted answer.");
    expect(result!.question.sources[0]!.canonicalUrl).toBe("https://source.example/two");
    expect(result!.sourceAudits).toEqual([{
      questionId: "q2", sourceId: "source-2", canonicalUrl: "https://source.example/two", status: "inaccessible"
    }]);
    expect(readRawSource).not.toHaveBeenCalled();
    expect(renderBrowserSource).not.toHaveBeenCalled();
  });
});

function v4Drill(
  fault: "diagnosis_failure" | "independent_source_read_failure",
  occurrences: "1" | "2",
  sourceId?: string
) {
  return createStagingLiveDrill({
    OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "preview", COMMERCE_MODE: "test",
    OGC_STAGING_LIVE_DRILL_JOB_ID: "enhancement-job-1",
    OGC_STAGING_LIVE_DRILL_FAULT: fault,
    OGC_STAGING_LIVE_DRILL_QUESTION_ID: "q2",
    OGC_STAGING_LIVE_DRILL_OCCURRENCES: occurrences,
    ...(sourceId ? { OGC_STAGING_LIVE_DRILL_SOURCE_ID: sourceId } : {})
  })!;
}

function dependenciesFor(
  overrides: Partial<ReportV4EnhancementProductionDependencies> = {}
): ReportV4EnhancementProductionDependencies {
  return {
    now: () => NOW,
    loadClaimedContext: vi.fn(async () => claimedContext()),
    loadConfigSnapshot: vi.fn(async () => configSnapshot()),
    resolveLockedConfiguration: vi.fn(() => lockedConfiguration()),
    createStageDependencies: vi.fn(() => ({} as ReportV4EnhancementStageDependencies)),
    runStage: vi.fn(async () => ({ delivery: "enhancement_active" } as never)),
    ...overrides
  };
}

function claimedJob(): ClaimedReportV4EnhancementJob {
  return {
    id: "enhancement-job-1", reportId: "report-1", siteSnapshotId: null, tier: "deep",
    productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
    recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4",
    businessQuestionSetId: "question-set-1", locale: "en", reason: "v4_diagnosis_enhancement",
    stage: "analyzing", executionState: "running", leaseOwner: "worker-1",
    leaseExpiresAt: new Date("2026-07-17T00:05:00.000Z"), creditReservationId: null,
    correctionId: null, replacementFulfillmentId: null
  };
}

function claimedContext(): ClaimedReportV4EnhancementContext {
  const enhancementJob = {
    ...claimedJob(),
    questionSetId: "question-set-1"
  } as ClaimedReportV4EnhancementContext["enhancementJob"];
  return {
    enhancementJob,
    lineage: {
      reportId: "report-1", orderId: "order-1", coreJobId: "core-job-1",
      coreArtifactRevisionId: "core-artifact-1", configSnapshotId: "config-1",
      siteSnapshotId: "site-snapshot-1", questionSetId: "question-set-1", locale: "en"
    },
    core: {
      report: { id: "report-1", url: "https://target.example/", locale: "en", activeArtifactRevisionId: "core-artifact-1" },
      targetUrl: "https://target.example/",
      order: {
        id: "order-1", reportId: "report-1", fulfillmentJobId: "core-job-1", siteSnapshotId: "site-snapshot-1",
        productCode: "deep_report", fulfillmentMethodology: "two_stage_geo_report_v4", recommendationReportVersion: 4,
        questionSetId: "question-set-1", reportLocale: "en", paymentStatus: "paid",
        fulfillmentStatus: "completed", refundStatus: "not_required"
      },
      coreJob: { ...claimedJob(), id: "core-job-1", siteSnapshotId: "site-snapshot-1", questionSetId: "question-set-1", reason: "standard",
        stage: "completed", executionState: "completed", creditReservationId: "credit-1" },
      siteSnapshot: { id: "site-snapshot-1", reportId: "report-1", siteKey: "target.example", status: "ready",
        collectorConfigIdentityHash: "a".repeat(64), contentIdentityHash: "b".repeat(64) },
      questionSet: { id: "question-set-1", reportId: "report-1", orderId: "order-1", region: "US", locale: "en", status: "locked" },
      questions: [
        { id: "q2", questionSetId: "question-set-1", ordinal: 2, purpose: "p2", privateText: "Question two?" },
        { id: "q1", questionSetId: "question-set-1", ordinal: 1, purpose: "p1", privateText: "Question one?" },
        { id: "q3", questionSetId: "question-set-1", ordinal: 3, purpose: "p3", privateText: "Question three?" }
      ],
      config: { id: "config-1", reportId: "report-1", orderId: "order-1", coreJobId: "core-job-1", identityHash: "config-hash",
        modelProfileId: "model-profile", modelProfileHash: "model-hash", reportProfileId: "report-profile", reportProfileHash: "report-hash" },
      credit: { id: "credit-1", reportId: "report-1", jobId: "core-job-1", paymentOrderId: "order-1", status: "settled" },
      activeCoreArtifact: { id: "core-artifact-1", reportId: "report-1", orderId: "order-1", jobId: "core-job-1",
        configSnapshotId: "config-1", revisionKind: "generation", artifactContract: "combined_geo_report_v4",
        status: "active", sourceArtifactRevisionId: null },
      commercePhase: "settled"
    }
  };
}

function configSnapshot(): ReportV4ConfigSnapshotRow {
  return {
    id: "config-1", reportId: "report-1", orderId: "order-1", coreJobId: "core-job-1", identityHash: "config-hash",
    modelProfileId: "model-profile", modelProfileHash: "model-hash", modelProfile: {} as never,
    reportProfileId: "report-profile", reportProfileHash: "report-hash", reportProfile: {} as never,
    createdAt: NOW
  };
}

function lockedConfiguration() {
  return {
    modelRuntime: {} as ReportV4ModelRuntimeConfig,
    reportRuntime: {} as ReportV4ReportRuntimeConfig
  };
}
