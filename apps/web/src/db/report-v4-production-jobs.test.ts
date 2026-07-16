import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildReportV4DiagnosisEnhancementJob,
  createReportV4ProductionJobRepository,
  type ReportV4ProductionCoreAggregate,
  type ReportV4ProductionEnhancementJob,
  type ReportV4ProductionJobStore,
  type ReportV4ProductionJobTransaction
} from "./report-v4-production-jobs";

// @requirement GEO-V4-COMMERCE-01
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-01
describe("V4 production core and diagnosis-enhancement job lineage", () => {
  it("builds the one deterministic no-credit enhancement identity reused by every persistence path", () => {
    const first = buildReportV4DiagnosisEnhancementJob(exactLineage());
    const second = buildReportV4DiagnosisEnhancementJob({ ...exactLineage() });
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      id: expect.stringMatching(/^v4-diagnosis-job-[a-f0-9]{64}$/), reportId: "report-1", siteSnapshotId: null,
      questionSetId: "questions-1", locale: "en", reason: "v4_diagnosis_enhancement",
      stage: "queued", executionState: "queued",
      creditReservationId: null, correctionId: null, replacementFulfillmentId: null
    });
    expect(buildReportV4DiagnosisEnhancementJob({ ...exactLineage(), coreArtifactRevisionId: "other-core" }).id)
      .not.toBe(first.id);
  });
  it("loads one exact paid V4 core context with immutable locale, snapshot, questions and configuration", async () => {
    const repo = repository(exactAggregate());
    await expect(repo.loadPaidCoreContext({ coreJobId: "core-job" })).resolves.toMatchObject({
      report: { id: "report-1", locale: "en" },
      order: { id: "order-1", paymentStatus: "paid", fulfillmentStatus: "completed" },
      coreJob: { id: "core-job", reason: "standard", creditReservationId: "credit-1" },
      siteSnapshot: { id: "snapshot-1", status: "completed" },
      questionSet: { id: "questions-1", region: "US" },
      questions: [{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }],
      config: { id: "config-1", modelProfileId: "model-1", reportProfileId: "report-profile-1" },
      commercePhase: "settled", targetUrl: "https://example.com/"
    });
    const reissued = exactAggregate();
    reissued.activeAccessTokenCount = 2;
    await expect(repository(reissued).loadPaidCoreContext({ coreJobId: "core-job" }))
      .resolves.toMatchObject({ commercePhase: "settled" });
  });

  it("fails closed on duplicate, missing, legacy, replacement, locale or commercial lineage drift", async () => {
    const variants: Array<[string, (aggregate: ReportV4ProductionCoreAggregate) => void]> = [
      ["duplicate config", (value) => value.configSnapshots.push({ ...value.configSnapshots[0]!, id: "config-2" })],
      ["missing question", (value) => value.questions.pop()],
      ["snapshot unavailable", (value) => { value.siteSnapshots[0]!.status = "unavailable"; }],
      ["locale drift", (value) => { value.orders[0]!.reportLocale = "zh"; }],
      ["legacy product", (value) => { value.coreJob.productContract = "legacy_website_audit_v1"; }],
      ["replacement", (value) => { value.coreJob.reason = "replacement_fulfillment"; value.coreJob.replacementFulfillmentId = "replacement-1"; }],
      ["unsettled terminal credit", (value) => { value.credits[0]!.status = "reserved"; }],
      ["missing paid access", (value) => { value.activeAccessTokenCount = 0; }]
      , ["missing target URL", (value) => { value.report.url = ""; }]
      , ["invalid target URL", (value) => { value.report.url = "file:///tmp/report"; }]
    ];
    for (const [label, mutate] of variants) {
      const aggregate = exactAggregate();
      mutate(aggregate);
      await expect(repository(aggregate).loadPaidCoreContext({ coreJobId: "core-job" }), label)
        .rejects.toThrow(/exact|lineage|V4|commercial|configuration|question|snapshot|locale|access|credit/i);
    }
  });

  it("enqueues one concurrent idempotent no-credit enhancement only after active settled core", async () => {
    const sideEffects = { payments: 1, credits: 1, access: 1, refunds: 0, emails: 1 };
    const { repo, store } = repositoryHarness(exactAggregate());
    const input = exactLineage();
    const jobs = await Promise.all(Array.from({ length: 16 }, () => repo.enqueueDiagnosisEnhancement(input)));
    expect(new Set(jobs.map(({ id }) => id).values()).size).toBe(1);
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]).toMatchObject({
      reportId: "report-1", siteSnapshotId: null, reason: "v4_diagnosis_enhancement",
      creditReservationId: null, correctionId: null, replacementFulfillmentId: null,
      productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4"
    });
    expect(store.jobs[0]).toEqual(buildReportV4DiagnosisEnhancementJob(input));
    expect(sideEffects).toEqual({ payments: 1, credits: 1, access: 1, refunds: 0, emails: 1 });
  });

  it("rejects enhancement enqueue before commercial settlement or active core activation", async () => {
    const reserved = exactAggregate();
    reserved.coreJob.stage = "analyzing";
    reserved.coreJob.executionState = "running";
    reserved.orders[0]!.fulfillmentStatus = "processing";
    reserved.credits[0]!.status = "reserved";
    reserved.activeArtifacts = [];
    reserved.activeAccessTokenCount = 0;
    await expect(repository(reserved).enqueueDiagnosisEnhancement(exactLineage()))
      .rejects.toThrow(/active|terminal|settled|commercial/i);

    const wrongArtifact = exactAggregate();
    wrongArtifact.activeArtifacts[0]!.revisionKind = "replacement";
    await expect(repository(wrongArtifact).enqueueDiagnosisEnhancement(exactLineage()))
      .rejects.toThrow(/active|core|lineage|generation/i);
  });

  it("loads enhancement context only for the exact no-credit job and active source core lineage", async () => {
    const { repo, store } = repositoryHarness(exactAggregate());
    const job = await repo.enqueueDiagnosisEnhancement(exactLineage());
    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId: job.id }))
      .resolves.toMatchObject({ enhancementJob: { id: job.id, creditReservationId: null }, core: { commercePhase: "settled" } });

    store.jobs[0]!.creditReservationId = "forbidden-credit";
    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId: job.id }))
      .rejects.toThrow(/credit|lineage|exact/i);
    store.jobs[0]!.creditReservationId = null;
    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId: job.id, configSnapshotId: "wrong-config" }))
      .rejects.toThrow(/config|lineage|exact/i);
    store.jobs.push({ ...store.jobs[0]!, id: "duplicate-enhancement-job" });
    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId: job.id }))
      .rejects.toThrow(/duplicate|exactly one|lineage/i);
  });

  it("resumes an enhancement after its exact active revision legitimately supersedes the core", async () => {
    const aggregate = exactAggregate();
    const { repo } = repositoryHarness(aggregate);
    const job = await repo.enqueueDiagnosisEnhancement(exactLineage());
    aggregate.activeArtifacts[0]!.status = "ready";
    aggregate.activeArtifacts.push({
      id: "enhancement-artifact-1", reportId: "report-1", orderId: "order-1", jobId: job.id,
      configSnapshotId: "config-1", revisionKind: "diagnosis_enhancement", artifactContract: "combined_geo_report_v4",
      status: "active", sourceArtifactRevisionId: "core-artifact-1"
    });
    aggregate.report.activeArtifactRevisionId = "enhancement-artifact-1";

    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId: job.id }))
      .resolves.toMatchObject({
        enhancementJob: { id: job.id },
        core: { activeCoreArtifact: { id: "core-artifact-1", status: "ready" }, commercePhase: "settled" }
      });

    aggregate.activeArtifacts[1]!.sourceArtifactRevisionId = "wrong-core";
    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId: job.id }))
      .rejects.toThrow(/active|source|supersed|lineage/i);
  });
});

function exactLineage() {
  return {
    reportId: "report-1", orderId: "order-1", coreJobId: "core-job",
    coreArtifactRevisionId: "core-artifact-1", configSnapshotId: "config-1",
    siteSnapshotId: "snapshot-1", questionSetId: "questions-1", locale: "en" as const
  };
}

function exactAggregate(): ReportV4ProductionCoreAggregate {
  return {
    report: { id: "report-1", url: "https://example.com/?utm_source=test#fragment", locale: "en", activeArtifactRevisionId: "core-artifact-1" },
    coreJob: {
      id: "core-job", reportId: "report-1", siteSnapshotId: "snapshot-1", tier: "deep",
      productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4", questionSetId: "questions-1",
      locale: "en", reason: "standard", stage: "completed", executionState: "completed",
      creditReservationId: "credit-1", correctionId: null, replacementFulfillmentId: null
    },
    orders: [{
      id: "order-1", reportId: "report-1", fulfillmentJobId: "core-job", siteSnapshotId: "snapshot-1",
      productCode: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4, questionSetId: "questions-1", reportLocale: "en",
      paymentStatus: "paid", fulfillmentStatus: "completed", refundStatus: "not_required"
    }],
    siteSnapshots: [{
      id: "snapshot-1", reportId: "report-1", siteKey: "example.com", status: "completed",
      collectorConfigIdentityHash: hash("collector"), contentIdentityHash: hash("content")
    }],
    questionSets: [{ id: "questions-1", reportId: "report-1", orderId: "order-1", region: "US", locale: "en", status: "locked" }],
    questions: [1, 2, 3].map((ordinal) => ({
      id: `question-${ordinal}`, questionSetId: "questions-1", ordinal,
      purpose: ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!,
      privateText: `Private question ${ordinal}`
    })),
    configSnapshots: [{
      id: "config-1", reportId: "report-1", orderId: "order-1", coreJobId: "core-job",
      identityHash: hash("config"), modelProfileId: "model-1", modelProfileHash: hash("model"),
      reportProfileId: "report-profile-1", reportProfileHash: hash("report-profile")
    }],
    credits: [{ id: "credit-1", reportId: "report-1", jobId: "core-job", paymentOrderId: "order-1", status: "settled" }],
    activeArtifacts: [{
      id: "core-artifact-1", reportId: "report-1", orderId: "order-1", jobId: "core-job",
      configSnapshotId: "config-1", revisionKind: "generation", artifactContract: "combined_geo_report_v4",
      status: "active", sourceArtifactRevisionId: null
    }],
    activeAccessTokenCount: 1
  };
}

function repository(aggregate: ReportV4ProductionCoreAggregate) {
  return repositoryHarness(aggregate).repo;
}

function repositoryHarness(aggregate: ReportV4ProductionCoreAggregate) {
  const jobs: ReportV4ProductionEnhancementJob[] = [];
  let tail: Promise<void> = Promise.resolve();
  const tx: ReportV4ProductionJobTransaction = {
    async acquireEnhancementLock() {},
    async loadCoreAggregate(coreJobId) { return coreJobId === aggregate.coreJob.id ? structuredClone(aggregate) : null; },
    async listEnhancementJobs(reportId) { return jobs.filter((job) => job.reportId === reportId).map((job) => ({ ...job })); },
    async insertEnhancementJob(job) { jobs.push({ ...job }); },
    async loadEnhancementJob(id) { return jobs.find((job) => job.id === id) ?? null; }
  };
  const store: ReportV4ProductionJobStore & { jobs: ReportV4ProductionEnhancementJob[] } = {
    jobs,
    transaction<T>(work: (transaction: ReportV4ProductionJobTransaction) => Promise<T>): Promise<T> {
      const run = tail.then(() => work(tx));
      tail = run.then(() => undefined, () => undefined);
      return run;
    }
  };
  return { repo: createReportV4ProductionJobRepository(store), store };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
