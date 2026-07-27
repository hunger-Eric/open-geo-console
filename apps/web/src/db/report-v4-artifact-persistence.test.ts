import { describe, expect, it } from "vitest";
import {
  createMemoryReportV4ArtifactPersistenceStore,
  createPostgresReportV4ArtifactPersistenceStore,
  getReportV4ArtifactPayload,
  persistReportV4ArtifactPayload,
  type ReportV4ArtifactPersistenceContext,
  type ReportV4ArtifactPersistencePostgresDatabase,
  type ReportV4ArtifactPersistenceSql
} from "./report-v4-artifact-persistence";

// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01

const canonicalHtml = '<main class="report-v4-artifact" data-report-version="4"><h1>V4</h1></main>';

describe("V4 combined artifact payload persistence", () => {
  it("persists one exact core payload and returns the same deeply frozen identities on reentry and read", async () => {
    const store = createMemoryReportV4ArtifactPersistenceStore([coreContext()]);
    const input = coreInput();

    const first = await persistReportV4ArtifactPayload(input, store);
    const second = await persistReportV4ArtifactPayload(input, store);
    const loaded = await getReportV4ArtifactPayload("core-v4", store);

    expect(second).toEqual(first);
    expect(loaded).toEqual(first);
    expect(first).toMatchObject({
      artifactRevisionId: "core-v4",
      reportId: "report-v4",
      orderId: "order-v4",
      jobId: "core-job",
      coreJobId: "core-job",
      questionSetId: "questions-v4",
      configSnapshotId: "config-v4",
      siteSnapshotId: "snapshot-v4",
      revisionKind: "generation",
      sourceArtifactRevisionId: null
    });
    expect(first.payloadIdentityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.htmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(first.report)).toBe(true);
    expect(Object.isFrozen(first.report.questions)).toBe(true);
    expect(Object.isFrozen(first.report.questions[0])).toBe(true);
    expect(() => { (first.report.questions[0] as { answer: string | null }).answer = "changed"; }).toThrow();
    expect(JSON.stringify(first)).not.toMatch(/pdf|pageCount|storageKey|provider|prompt|apiKey/i);
    expect(store.writeCount).toBe(1);
  });

  it("recovers an existing pending payload whose HTML hash was not bound before interruption", async () => {
    const store = createMemoryReportV4ArtifactPersistenceStore([coreContext()], [{
      artifactRevisionId: "core-v4",
      reportId: "report-v4",
      orderId: "order-v4",
      jobId: "core-job",
      questionSetId: "questions-v4",
      payload: report()
    }]);

    const recovered = await persistReportV4ArtifactPayload(coreInput(), store);

    expect(recovered.htmlSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(getReportV4ArtifactPayload("core-v4", store)).resolves.toEqual(recovered);
    expect(store.writeCount).toBe(0);
  });

  it("recovers an ON CONFLICT insert race before pending hashes have been bound", async () => {
    const postgres = new FakePostgresPersistenceDatabase(true);
    const store = createPostgresReportV4ArtifactPersistenceStore(postgres);

    const recovered = await persistReportV4ArtifactPayload(coreInput(), store);

    expect(recovered.htmlSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(getReportV4ArtifactPayload("core-v4", store)).resolves.toEqual(recovered);
    expect(postgres.insertCount).toBe(1);
  });

  it("fails closed when an idempotent reentry drifts in payload, HTML, or any lineage identity", async () => {
    const store = createMemoryReportV4ArtifactPersistenceStore([coreContext()]);
    const input = coreInput();
    await persistReportV4ArtifactPayload(input, store);

    const cases = [
      { ...input, report: { ...report(), generatedAt: "2026-07-17T01:00:00.000Z" } },
      { ...input, canonicalHtml: canonicalHtml.replace("V4</h1>", "changed</h1>") },
      { ...input, orderId: "other-order" },
      { ...input, jobId: "other-job" },
      { ...input, coreJobId: "other-core" },
      { ...input, questionSetId: "other-questions" },
      { ...input, configSnapshotId: "other-config" },
      { ...input, siteSnapshotId: "other-snapshot" },
      { ...input, revisionKind: "diagnosis_enhancement" as const, sourceArtifactRevisionId: "core-v4" }
    ];

    for (const candidate of cases) {
      await expect(persistReportV4ArtifactPayload(candidate, store)).rejects.toThrow(/identity|lineage|conflict|match/i);
    }
    expect(store.writeCount).toBe(1);
  });

  it("fails closed when the exact paid V4 order lineage or commercial state drifts", async () => {
    const valid = coreContext();
    const cases: ReportV4ArtifactPersistenceContext[] = [
      { ...valid, orderBinding: { ...valid.orderBinding, reportId: "other-report" } },
      { ...valid, orderBinding: { ...valid.orderBinding, fulfillmentJobId: "other-core" } },
      { ...valid, orderBinding: { ...valid.orderBinding, siteSnapshotId: "other-snapshot" } },
      { ...valid, orderBinding: { ...valid.orderBinding, fulfillmentMethodology: "public_search_source_forensics_v1" } },
      { ...valid, orderBinding: { ...valid.orderBinding, paymentStatus: "pending" } },
      { ...valid, orderBinding: { ...valid.orderBinding, fulfillmentStatus: "failed" } }
    ];

    for (const context of cases) {
      const store = createMemoryReportV4ArtifactPersistenceStore([context]);
      await expect(persistReportV4ArtifactPayload(coreInput(), store)).rejects.toThrow(/order|paid|V4/i);
      expect(store.writeCount).toBe(0);
    }
  });

  it("binds an enhancement payload to its exact enhancement job and active core source", async () => {
    const store = createMemoryReportV4ArtifactPersistenceStore([coreContext(), enhancementContext()]);
    await persistReportV4ArtifactPayload(coreInput(), store);
    const enhanced = report("enhancement-v4", true);

    const persisted = await persistReportV4ArtifactPayload({
      ...coreInput(),
      report: enhanced,
      artifactRevisionId: "enhancement-v4",
      jobId: "enhancement-job",
      revisionKind: "diagnosis_enhancement",
      sourceArtifactRevisionId: "core-v4"
    }, store);

    expect(persisted).toMatchObject({
      artifactRevisionId: "enhancement-v4",
      jobId: "enhancement-job",
      coreJobId: "core-job",
      revisionKind: "diagnosis_enhancement",
      sourceArtifactRevisionId: "core-v4"
    });
  });

  it("rejects malformed V4 payloads, non-rendered HTML, PDF-shaped input, and legacy artifact contexts without writing", async () => {
    const core = coreContext();
    const legacy = { ...core, artifactRevisionId: "legacy", artifactContract: "combined_geo_report_v3" } as unknown as ReportV4ArtifactPersistenceContext;
    const store = createMemoryReportV4ArtifactPersistenceStore([core, legacy]);

    await expect(persistReportV4ArtifactPayload({ ...coreInput(), report: { ...report(), version: 3 } }, store)).rejects.toThrow(/version/i);
    await expect(persistReportV4ArtifactPayload({ ...coreInput(), canonicalHtml: "<main>not V4</main>" }, store)).rejects.toThrow(/rendered V4 HTML/i);
    await expect(persistReportV4ArtifactPayload({ ...coreInput(), pdfSha256: "a".repeat(64) } as never, store)).rejects.toThrow(/unknown.*pdfSha256|PDF/i);
    await expect(persistReportV4ArtifactPayload({ ...coreInput(), artifactRevisionId: "legacy", report: report("legacy") }, store)).rejects.toThrow(/V4|contract/i);
    expect(store.writeCount).toBe(0);
  });

  it("accepts a ready or active exact reentry but never creates a missing payload after pending", async () => {
    const readyStore = createMemoryReportV4ArtifactPersistenceStore([{ ...coreContext(), status: "ready" }], [{
      artifactRevisionId: "core-v4",
      reportId: "report-v4",
      orderId: "order-v4",
      jobId: "core-job",
      questionSetId: "questions-v4",
      payload: report()
    }], coreInput());
    const exactReady = await persistReportV4ArtifactPayload(coreInput(), readyStore);
    expect(exactReady).toMatchObject({ artifactRevisionId: "core-v4" });

    const missingReady = createMemoryReportV4ArtifactPersistenceStore([{ ...coreContext(), status: "active" }]);
    await expect(persistReportV4ArtifactPayload(coreInput(), missingReady)).rejects.toThrow(/pending|missing/i);

    const invalidReady = createMemoryReportV4ArtifactPersistenceStore([{
      ...coreContext(),
      status: "ready",
      payloadIdentityHash: exactReady.payloadIdentityHash
    }], [{
      artifactRevisionId: "core-v4",
      reportId: "report-v4",
      orderId: "order-v4",
      jobId: "core-job",
      questionSetId: "questions-v4",
      payload: report()
    }]);
    await expect(getReportV4ArtifactPayload("core-v4", invalidReady)).rejects.toThrow(/HTML hash/i);
  });

  it("keeps the production SQL store and memory store behaviorally identical", async () => {
    const memory = createMemoryReportV4ArtifactPersistenceStore([coreContext()]);
    const postgres = new FakePostgresPersistenceDatabase();
    const postgresStore = createPostgresReportV4ArtifactPersistenceStore(postgres);

    const expected = await persistReportV4ArtifactPayload(coreInput(), memory);
    const actual = await persistReportV4ArtifactPayload(coreInput(), postgresStore);

    expect(actual).toEqual(expected);
    await expect(persistReportV4ArtifactPayload(coreInput(), postgresStore)).resolves.toEqual(expected);
    await expect(getReportV4ArtifactPayload("core-v4", postgresStore)).resolves.toEqual(expected);
    expect(postgres.insertCount).toBe(1);
    expect(postgres.statements.some((statement) => statement.includes("pdf"))).toBe(false);
    expect(postgres.statements.some((statement) => statement.includes("INSERT INTO combined_geo_reports"))).toBe(true);
    expect(postgres.statements.some((statement) => statement.includes("UPDATE report_artifact_revisions"))).toBe(true);
    const lockStatement = postgres.statements.find((statement) => statement.includes("FROM report_artifact_revisions artifact"));
    expect(lockStatement).toContain("JOIN payment_orders payment ON payment.id=artifact.order_id");
    expect(lockStatement).not.toContain("LEFT JOIN payment_orders payment");
    expect(lockStatement).toContain("FOR UPDATE OF artifact,payment");
  });
});

class FakePostgresPersistenceDatabase implements ReportV4ArtifactPersistencePostgresDatabase {
  readonly statements: string[] = [];
  insertCount = 0;
  private payload: Record<string, unknown> | null = null;
  private context = databaseContext();

  constructor(private readonly simulateInsertConflict = false) {}

  async transaction<T>(work: (sql: ReportV4ArtifactPersistenceSql) => Promise<T>): Promise<T> {
    const sql: ReportV4ArtifactPersistenceSql = async (strings, ...values) => {
      const statement = strings.join("?").replace(/\s+/g, " ").trim();
      this.statements.push(statement);
      if (statement.includes("FROM report_artifact_revisions artifact")) return [structuredClone(this.context)];
      if (statement.includes("FROM report_business_questions")) return questionRows();
      if (statement.includes("FROM combined_geo_reports")) return this.payload ? [structuredClone(this.payload)] : [];
      if (statement.includes("INSERT INTO combined_geo_reports")) {
        if (this.payload) return [];
        this.insertCount += 1;
        this.payload = {
          artifact_revision_id: values[0], report_id: values[1], order_id: values[2], job_id: values[3],
          question_set_id: values[4], payload: JSON.parse(String(values[5]))
        };
        return this.simulateInsertConflict ? [] : [structuredClone(this.payload)];
      }
      if (statement.includes("UPDATE report_artifact_revisions")) {
        const [payloadIdentityHash, htmlSha256] = values;
        if (this.context.status !== "pending") return [];
        if (!String(this.context.payload_identity_hash).startsWith("v4-pending:")
          && this.context.payload_identity_hash !== payloadIdentityHash) return [];
        if (this.context.html_sha256 !== null && this.context.html_sha256 !== htmlSha256) return [];
        this.context = { ...this.context, payload_identity_hash: payloadIdentityHash, html_sha256: htmlSha256 };
        return [{ id: "core-v4" }];
      }
      throw new Error(`Unexpected persistence SQL: ${statement}`);
    };
    return work(sql);
  }
}

function coreInput() {
  return {
    report: report(),
    canonicalHtml,
    artifactRevisionId: "core-v4",
    reportId: "report-v4",
    orderId: "order-v4",
    jobId: "core-job",
    coreJobId: "core-job",
    questionSetId: "questions-v4",
    configSnapshotId: "config-v4",
    siteSnapshotId: "snapshot-v4",
    revisionKind: "generation" as const,
    sourceArtifactRevisionId: null
  };
}

function coreContext(): ReportV4ArtifactPersistenceContext {
  return {
    artifactRevisionId: "core-v4",
    reportId: "report-v4",
    orderId: "order-v4",
    jobId: "core-job",
    coreJobId: "core-job",
    questionSetId: "questions-v4",
    configSnapshotId: "config-v4",
    siteSnapshotId: "snapshot-v4",
    revisionKind: "generation",
    sourceArtifactRevisionId: null,
    artifactContract: "combined_geo_report_v4",
    status: "pending",
    payloadIdentityHash: "v4-pending:core-job:core-v4",
    htmlSha256: null,
    orderBinding: {
      orderId: "order-v4",
      reportId: "report-v4",
      fulfillmentJobId: "core-job",
      siteSnapshotId: "snapshot-v4",
      productCode: "recommendation_forensics_v1",
      fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4,
      paymentStatus: "paid",
      fulfillmentStatus: "processing"
    },
    questionBindings: [
      { order: 1, questionId: "questions-v4:1", questionText: "Question 1?" },
      { order: 2, questionId: "questions-v4:2", questionText: "Question 2?" },
      { order: 3, questionId: "questions-v4:3", questionText: "Question 3?" }
    ]
  };
}

function enhancementContext(): ReportV4ArtifactPersistenceContext {
  return {
    ...coreContext(),
    artifactRevisionId: "enhancement-v4",
    jobId: "enhancement-job",
    revisionKind: "diagnosis_enhancement",
    sourceArtifactRevisionId: "core-v4",
    payloadIdentityHash: "v4-pending:enhancement-job:enhancement-v4"
  };
}

function report(artifactRevisionId = "core-v4", diagnosed = false) {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId,
    targetUrl: "https://example.com/",
    locale: "zh-CN",
    generatedAt: "2026-07-17T00:00:00.000Z",
    status: "completed" as const,
    websiteSynthesis: {
      summary: "Website summary.",
      strengths: ["Clear services."],
      gaps: ["Delivery evidence is limited."],
      actions: ["Publish delivery evidence."]
    },
    questions: ([1, 2, 3] as const).map((order) => ({
      order,
      questionId: `questions-v4:${order}`,
      questionText: `Question ${order}?`,
      status: "answered" as const,
      answer: `Answer ${order}.`,
      sources: [],
      ...(diagnosed && order === 1 ? {
        diagnosis: {
          selectionSummary: "Selection summary.",
          observableFactors: ([1, 2, 3] as const).map((item) => ({ kind: `factor-${item}`, observation: `Observation ${item}.`, evidenceRefs: [] })),
          targetGap: "Target gap.",
          recommendedActions: ([1, 2, 3] as const).map((priority) => ({ priority, action: `Action ${priority}.`, evidenceRefs: [] })),
          detailedEvidenceRefs: []
        }
      } : {})
    }))
  };
}

function databaseContext(): Record<string, unknown> {
  return {
    artifact_revision_id: "core-v4",
    report_id: "report-v4",
    order_id: "order-v4",
    job_id: "core-job",
    config_snapshot_id: "config-v4",
    revision_kind: "generation",
    source_artifact_revision_id: null,
    artifact_contract: "combined_geo_report_v4",
    status: "pending",
    payload_identity_hash: "v4-pending:core-job:core-v4",
    html_sha256: null,
    config_report_id: "report-v4",
    config_order_id: "order-v4",
    core_job_id: "core-job",
    payment_order_id: "order-v4",
    payment_report_id: "report-v4",
    payment_fulfillment_job_id: "core-job",
    payment_site_snapshot_id: "snapshot-v4",
    payment_product_code: "recommendation_forensics_v1",
    payment_fulfillment_methodology: "two_stage_geo_report_v4",
    payment_recommendation_report_version: 4,
    payment_status: "paid",
    fulfillment_status: "processing",
    job_report_id: "report-v4",
    job_reason: "standard",
    job_artifact_contract: "combined_geo_report_v4",
    job_question_set_id: "questions-v4",
    core_report_id: "report-v4",
    core_reason: "standard",
    core_artifact_contract: "combined_geo_report_v4",
    core_question_set_id: "questions-v4",
    site_snapshot_id: "snapshot-v4",
    question_report_id: "report-v4",
    question_order_id: "order-v4",
    question_status: "locked",
    site_report_id: "report-v4",
    site_status: "completed",
    site_content_identity_hash: "f".repeat(64),
    source_report_id: null,
    source_order_id: null,
    source_job_id: null,
    source_config_snapshot_id: null,
    source_revision_kind: null,
    source_artifact_contract: null,
    source_status: null
  };
}

function questionRows(): Record<string, unknown>[] {
  return [1, 2, 3].map((ordinal) => ({
    id: `questions-v4:${ordinal}`,
    ordinal,
    question_text: `Question ${ordinal}?`
  }));
}
