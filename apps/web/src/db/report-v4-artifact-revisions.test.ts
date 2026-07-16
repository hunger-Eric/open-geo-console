import { describe, expect, it } from "vitest";
import {
  activateReportV4CoreRevision,
  activateReportV4DiagnosisEnhancement,
  assertReportV4ArtifactRevisionKind,
  createPostgresReportV4ArtifactRevisionExecutor,
  failReportV4DiagnosisEnhancement,
  prepareReportV4CoreGeneration,
  prepareReportV4DiagnosisEnhancement,
  type ReportV4ArtifactRevisionExecutor,
  type ReportV4ArtifactRevisionPostgresDatabase,
  type ReportV4ArtifactRevisionRow,
  type ReportV4ArtifactRevisionSql,
  type ReportV4ArtifactRevisionSqlValue,
  type ReportV4ArtifactRevisionTransaction
} from "./report-v4-artifact-revisions";

// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-COMMERCE-01

const coreInput = {
  artifactRevisionId: "core-revision",
  reportId: "report-1",
  orderId: "order-1",
  jobId: "core-job",
  configSnapshotId: "config-snapshot-1",
  payloadIdentityHash: "a".repeat(64),
  htmlSha256: "b".repeat(64)
};

const coreIdentity = {
  artifactRevisionId: coreInput.artifactRevisionId,
  reportId: coreInput.reportId,
  orderId: coreInput.orderId,
  jobId: coreInput.jobId,
  configSnapshotId: coreInput.configSnapshotId
};

const enhancementIdentity = {
  artifactRevisionId: "enhancement-revision",
  reportId: "report-1",
  orderId: "order-1",
  jobId: "enhancement-job",
  sourceArtifactRevisionId: "core-revision",
  configSnapshotId: "config-snapshot-1"
};

describe("V4 artifact revision repository", () => {
  it("prepares one exact pending HTML-only core before payload persistence and activates it with exact hashes", async () => {
    const executor = new MemoryExecutor();

    const pending = await prepareReportV4CoreGeneration(coreIdentity, executor);

    expect(pending).toMatchObject({
      id: "core-revision",
      revision: 1,
      revisionKind: "generation",
      sourceArtifactRevisionId: null,
      status: "pending",
      payloadIdentityHash: null,
      htmlSha256: null
    });
    expect(executor.activeByReport.has("report-1")).toBe(false);
    expect(JSON.stringify(pending)).not.toMatch(/pdf|pageCount|storage/i);

    const active = await activateReportV4CoreRevision(coreInput, executor);
    expect(active).toMatchObject({
      id: pending.id,
      revision: pending.revision,
      status: "active",
      payloadIdentityHash: coreInput.payloadIdentityHash,
      htmlSha256: coreInput.htmlSha256
    });
  });

  it("serializes concurrent core preparation and rejects drift or a distinct pending core", async () => {
    const executor = new MemoryExecutor();

    const [first, second] = await Promise.all([
      prepareReportV4CoreGeneration(coreIdentity, executor),
      prepareReportV4CoreGeneration(coreIdentity, executor)
    ]);

    expect(second).toEqual(first);
    expect(executor.log.filter((entry) => entry.startsWith("insert:"))).toEqual(["insert:core-revision:pending"]);
    expect(executor.activeByReport.has("report-1")).toBe(false);

    await expect(prepareReportV4CoreGeneration({
      ...coreIdentity,
      orderId: "other-order"
    }, executor)).rejects.toThrow(/identity conflict/i);
    await expect(prepareReportV4CoreGeneration({
      ...coreIdentity,
      artifactRevisionId: "other-core",
      jobId: "other-job"
    }, executor)).rejects.toThrow(/distinct.*core|core.*already/i);
    await expect(activateReportV4CoreRevision({
      ...coreInput,
      artifactRevisionId: "other-core",
      jobId: "other-job"
    }, executor)).rejects.toThrow(/distinct.*core|core.*already/i);

    expect(executor.rows).toHaveLength(1);
    expect(executor.rows.get("core-revision")).toEqual(first);
  });

  it("keeps preparation free of PDF/readiness inputs and rejects activation hash drift after preparation", async () => {
    const executor = new MemoryExecutor();
    for (const extra of [
      { pdfSha256: "pdf" },
      { pdfStorageKey: "private/key" },
      { pageCount: 5 },
      { payloadIdentityHash: "a".repeat(64) },
      { htmlSha256: "b".repeat(64) }
    ]) {
      await expect(prepareReportV4CoreGeneration({ ...coreIdentity, ...extra }, executor))
        .rejects.toThrow(/unknown.*(?:pdf|pageCount|payloadIdentityHash|htmlSha256)/i);
    }
    expect(executor.transactions).toBe(0);

    await prepareReportV4CoreGeneration(coreIdentity, executor);
    const active = await activateReportV4CoreRevision(coreInput, executor);
    await expect(activateReportV4CoreRevision({
      ...coreInput,
      htmlSha256: "c".repeat(64)
    }, executor)).rejects.toThrow(/idempotency conflict.*HTML|HTML.*identity changed/i);
    expect(executor.rows.get(active.id)).toEqual(active);
    expect(executor.activeByReport.get("report-1")).toBe(active.id);
  });

  it("atomically readies and activates an HTML-only core generation revision", async () => {
    const executor = new MemoryExecutor();

    const revision = await activateReportV4CoreRevision(coreInput, executor);

    expect(revision).toMatchObject({
      id: "core-revision",
      revision: 1,
      artifactContract: "combined_geo_report_v4",
      revisionKind: "generation",
      status: "active",
      htmlSha256: "b".repeat(64),
      sourceArtifactRevisionId: null,
      configSnapshotId: "config-snapshot-1"
    });
    expect(executor.activeByReport.get("report-1")).toBe("core-revision");
    expect(JSON.stringify(revision)).not.toMatch(/pdf|pageCount|storage/i);
    expect(executor.log).toEqual([
      "lock:report-1",
      "insert:core-revision:pending",
      "ready:core-revision",
      "status:core-revision:ready->active",
      "active:report-1:core-revision"
    ]);
  });

  it("prepares an enhancement from the same report/order core and atomically activates its complete HTML revision", async () => {
    const executor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, executor);
    executor.log.length = 0;

    const pending = await prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor);
    expect(pending).toMatchObject({ revisionKind: "diagnosis_enhancement", status: "pending", revision: 2 });

    const active = await activateReportV4DiagnosisEnhancement({
      ...enhancementIdentity,
      payloadIdentityHash: "c".repeat(64),
      htmlSha256: "d".repeat(64)
    }, executor);

    expect(active).toMatchObject({
      id: "enhancement-revision",
      revisionKind: "diagnosis_enhancement",
      sourceArtifactRevisionId: "core-revision",
      status: "active",
      htmlSha256: "d".repeat(64)
    });
    expect(executor.rows.get("core-revision")!.status).toBe("ready");
    expect(executor.activeByReport.get("report-1")).toBe("enhancement-revision");
    expect(JSON.stringify(active)).not.toMatch(/pdf|pageCount|storage/i);
  });

  it("marks a failed enhancement only and leaves the core active", async () => {
    const executor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, executor);
    await prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor);

    const failed = await failReportV4DiagnosisEnhancement(enhancementIdentity, executor);
    const repeated = await failReportV4DiagnosisEnhancement(enhancementIdentity, executor);

    expect(failed.status).toBe("failed");
    expect(repeated).toEqual(failed);
    expect(executor.rows.get("core-revision")!.status).toBe("active");
    expect(executor.activeByReport.get("report-1")).toBe("core-revision");
  });

  it("rejects an enhancement whose source is not a same-report/order ready or active core generation", async () => {
    const executor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, executor);
    const source = executor.rows.get("core-revision")!;
    executor.rows.set("core-revision", { ...source, orderId: "other-order" });

    await expect(prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor)).rejects.toThrow(/same report and order/i);
    expect(executor.rows.has("enhancement-revision")).toBe(false);
  });

  it("binds core and enhancement revisions to one immutable configuration snapshot", async () => {
    const executor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, executor);

    await expect(prepareReportV4DiagnosisEnhancement({
      ...enhancementIdentity,
      configSnapshotId: "different-config-snapshot"
    }, executor)).rejects.toThrow(/same.*configuration snapshot|snapshot.*core/i);
    expect(executor.rows.has("enhancement-revision")).toBe(false);

    await prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor);
    await expect(activateReportV4DiagnosisEnhancement({
      ...enhancementIdentity,
      configSnapshotId: "different-config-snapshot",
      payloadIdentityHash: "c".repeat(64),
      htmlSha256: "d".repeat(64)
    }, executor)).rejects.toThrow(/identity|configuration snapshot|snapshot/i);
  });

  it("requires diagnosis preparation and first activation to start from the report's current active core", async () => {
    const prepareExecutor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, prepareExecutor);
    prepareExecutor.rows.set("core-revision", { ...prepareExecutor.rows.get("core-revision")!, status: "ready" });
    prepareExecutor.activeByReport.delete("report-1");

    await expect(prepareReportV4DiagnosisEnhancement(enhancementIdentity, prepareExecutor)).rejects.toThrow(/current active core/i);

    const activateExecutor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, activateExecutor);
    await prepareReportV4DiagnosisEnhancement(enhancementIdentity, activateExecutor);
    activateExecutor.rows.set("core-revision", { ...activateExecutor.rows.get("core-revision")!, status: "ready" });
    activateExecutor.activeByReport.delete("report-1");

    await expect(activateReportV4DiagnosisEnhancement({
      ...enhancementIdentity,
      payloadIdentityHash: "c".repeat(64),
      htmlSha256: "d".repeat(64)
    }, activateExecutor)).rejects.toThrow(/current active core/i);
  });

  it("rejects a ready but no longer active core as a new enhancement source", async () => {
    const executor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, executor);
    executor.rows.set("core-revision", { ...executor.rows.get("core-revision")!, status: "ready" });

    await expect(prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor))
      .rejects.toThrow(/active core|source.*active/i);
    expect(executor.rows.has("enhancement-revision")).toBe(false);
  });

  it("forbids correction, replacement and evidence_refresh revision kinds", () => {
    expect(assertReportV4ArtifactRevisionKind("generation")).toBe("generation");
    expect(assertReportV4ArtifactRevisionKind("diagnosis_enhancement")).toBe("diagnosis_enhancement");
    for (const forbidden of ["correction", "replacement", "evidence_refresh", "presentation_refresh"]) {
      expect(() => assertReportV4ArtifactRevisionKind(forbidden)).toThrow(/not allowed.*V4/i);
    }
  });

  it("rejects every PDF/readiness storage input before opening a transaction", async () => {
    const executor = new MemoryExecutor();
    for (const extra of [
      { pdfSha256: "pdf" },
      { pdfStorageKey: "private/key" },
      { pageCount: 5 },
      { storageKey: "private/key" }
    ]) {
      await expect(activateReportV4CoreRevision({ ...coreInput, ...extra } as typeof coreInput, executor)).rejects.toThrow(/unknown.*(?:pdf|pageCount|storage)/i);
    }
    expect(executor.transactions).toBe(0);
  });

  it("requires lowercase 64-character SHA-256 payload and HTML hashes", async () => {
    const invalidHashes = [
      "short",
      "A".repeat(64),
      "g".repeat(64),
      "a".repeat(63),
      "a".repeat(65)
    ];
    for (const invalid of invalidHashes) {
      const executor = new MemoryExecutor();
      await expect(activateReportV4CoreRevision({ ...coreInput, payloadIdentityHash: invalid }, executor)).rejects.toThrow(/payloadIdentityHash.*SHA-256/i);
      await expect(activateReportV4CoreRevision({ ...coreInput, htmlSha256: invalid }, executor)).rejects.toThrow(/htmlSha256.*SHA-256/i);
      expect(executor.transactions).toBe(0);
    }
  });

  it("serializes concurrent idempotent core activation and preserves one active revision", async () => {
    const executor = new MemoryExecutor();

    const [first, second] = await Promise.all([
      activateReportV4CoreRevision(coreInput, executor),
      activateReportV4CoreRevision(coreInput, executor)
    ]);

    expect(first).toEqual(second);
    expect([...executor.rows.values()].filter(({ status }) => status === "active")).toHaveLength(1);
    expect(executor.log.filter((entry) => entry.startsWith("insert:"))).toHaveLength(1);
  });

  it("rejects a second distinct core and rolls back a failed enhancement activation", async () => {
    const executor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, executor);
    await expect(activateReportV4CoreRevision({ ...coreInput, artifactRevisionId: "other-core", jobId: "other-job" }, executor)).rejects.toThrow(/distinct.*core|core.*already/i);
    await prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor);
    executor.failNextActivePointer = true;

    await expect(activateReportV4DiagnosisEnhancement({
      ...enhancementIdentity,
      payloadIdentityHash: "c".repeat(64),
      htmlSha256: "d".repeat(64)
    }, executor)).rejects.toThrow(/active pointer failed/i);

    expect(executor.rows.get("core-revision")!.status).toBe("active");
    expect(executor.rows.get("enhancement-revision")!.status).toBe("pending");
    expect(executor.activeByReport.get("report-1")).toBe("core-revision");
  });

  it.each(["missing", "core"] as const)("fails closed when an idempotent active enhancement has a %s report pointer", async (pointer) => {
    const executor = new MemoryExecutor();
    await activateReportV4CoreRevision(coreInput, executor);
    await prepareReportV4DiagnosisEnhancement(enhancementIdentity, executor);
    const activation = {
      ...enhancementIdentity,
      payloadIdentityHash: "c".repeat(64),
      htmlSha256: "d".repeat(64)
    };
    await activateReportV4DiagnosisEnhancement(activation, executor);
    if (pointer === "missing") executor.activeByReport.delete("report-1");
    else executor.activeByReport.set("report-1", "core-revision");

    await expect(activateReportV4DiagnosisEnhancement(activation, executor)).rejects.toThrow(/active pointer.*enhancement/i);
  });

  it("adapts one PostgreSQL transaction into locked conditional V4-only revision SQL", async () => {
    const pending = postgresRow();
    const ready = postgresRow({ status: "ready", payload_identity_hash: "a".repeat(64), html_sha256: "b".repeat(64) });
    const active = postgresRow({ status: "active", payload_identity_hash: "a".repeat(64), html_sha256: "b".repeat(64) });
    const database = new ScriptedPostgresDatabase([
      [],
      [{ revision: 1 }],
      [pending],
      [ready],
      [active],
      [ready],
      [active],
      [{ id: "report-1" }]
    ]);
    const executor = createPostgresReportV4ArtifactRevisionExecutor(database);

    await executor.transaction(async (tx) => {
      await tx.lockReport("report-1");
      expect(await tx.nextRevision("report-1")).toBe(1);
      expect(await tx.insertRevision({
        id: "core-revision",
        reportId: "report-1",
        orderId: "order-1",
        jobId: "core-job",
        configSnapshotId: "config-snapshot-1",
        revision: 1,
        revisionKind: "generation",
        sourceArtifactRevisionId: null,
        artifactContract: "combined_geo_report_v4"
      })).toMatchObject({ status: "pending", artifactContract: "combined_geo_report_v4" });
      expect(await tx.markReady("core-revision", "a".repeat(64), "b".repeat(64))).toMatchObject({ status: "ready" });
      expect(await tx.transitionStatus("core-revision", "ready", "active")).toMatchObject({ status: "active" });
      expect(await tx.transitionStatus("core-revision", "active", "ready")).toMatchObject({ status: "ready" });
      expect(await tx.transitionStatus("core-revision", "ready", "active")).toMatchObject({ status: "active" });
      await tx.setActiveRevision("report-1", "core-revision");
    });

    expect(database.transactions).toBe(1);
    expect(database.calls[0]).toMatchObject({ values: ["artifact-revision:report-1"] });
    expect(database.calls[0]!.sql).toMatch(/pg_advisory_xact_lock\(hashtextextended/i);
    expect(database.calls[1]!.sql).toMatch(/max\(revision\).*report_artifact_revisions.*report_id=/i);
    expect(database.calls[2]!.sql).toMatch(/INSERT INTO report_artifact_revisions.*pdf_sha256.*pdf_storage_key.*NULL.*NULL.*ON CONFLICT.*DO NOTHING.*RETURNING/i);
    expect(database.calls[2]!.values).toContain("v4-pending:core-job:core-revision");
    expect(database.calls[3]!.sql).toMatch(/UPDATE report_artifact_revisions SET status='ready'.*pdf_sha256=NULL.*pdf_storage_key=NULL.*status='pending'.*artifact_contract='combined_geo_report_v4'/i);
    expect(database.calls[4]!.sql).toMatch(/status=.*activated_at=clock_timestamp\(\).*status=.*artifact_contract='combined_geo_report_v4'/i);
    expect(database.calls[5]!.sql).toMatch(/status=.*activated_at=NULL.*status=.*artifact_contract='combined_geo_report_v4'/i);
    expect(database.calls[7]!.sql).toMatch(/UPDATE scan_reports.*FROM report_artifact_revisions.*report_id=.*status='active'.*active_artifact_revision_id/i);
  });

  it("fails closed on affected-row loss and rejects non-V4 or PDF-bearing database rows", async () => {
    const unlocked = new ScriptedPostgresDatabase([]);
    await expect(createPostgresReportV4ArtifactRevisionExecutor(unlocked).transaction((tx) => tx.nextRevision("report-1")))
      .rejects.toThrow(/advisory lock.*required/i);
    expect(unlocked.calls).toHaveLength(0);

    const insertConflict = new ScriptedPostgresDatabase([[], []]);
    const insertExecutor = createPostgresReportV4ArtifactRevisionExecutor(insertConflict);
    await expect(insertExecutor.transaction(async (tx) => {
      await tx.lockReport("report-1");
      return tx.insertRevision({
        id: "core-revision",
        reportId: "report-1",
        orderId: "order-1",
        jobId: "core-job",
        configSnapshotId: "config-snapshot-1",
        revision: 1,
        revisionKind: "generation",
        sourceArtifactRevisionId: null,
        artifactContract: "combined_geo_report_v4"
      });
    })).rejects.toThrow(/insert.*affected|exactly one/i);

    const pointerConflict = new ScriptedPostgresDatabase([[], []]);
    const pointerExecutor = createPostgresReportV4ArtifactRevisionExecutor(pointerConflict);
    await expect(pointerExecutor.transaction(async (tx) => {
      await tx.lockReport("report-1");
      return tx.setActiveRevision("report-1", "core-revision");
    }))
      .rejects.toThrow(/active pointer.*same report.*active|exactly one/i);

    const conditionalMiss = new ScriptedPostgresDatabase([[], []]);
    const conditionalExecutor = createPostgresReportV4ArtifactRevisionExecutor(conditionalMiss);
    await conditionalExecutor.transaction(async (tx) => {
      expect(await tx.markReady("core-revision", "a".repeat(64), "b".repeat(64))).toBeNull();
      expect(await tx.transitionStatus("core-revision", "ready", "active")).toBeNull();
    });

    const legacy = new ScriptedPostgresDatabase([[postgresRow({ artifact_contract: "combined_geo_report_v3" })]]);
    await expect(createPostgresReportV4ArtifactRevisionExecutor(legacy).transaction((tx) => tx.getRevision("core-revision")))
      .rejects.toThrow(/V4 artifact contract/i);

    const pdfBearing = new ScriptedPostgresDatabase([[postgresRow({ status: "ready", pdf_sha256: "p".repeat(64), pdf_storage_key: "pdf/key" })]]);
    await expect(createPostgresReportV4ArtifactRevisionExecutor(pdfBearing).transaction((tx) => tx.getRevision("core-revision")))
      .rejects.toThrow(/V4.*PDF.*NULL/i);
  });
});

class MemoryExecutor implements ReportV4ArtifactRevisionExecutor {
  rows = new Map<string, ReportV4ArtifactRevisionRow>();
  activeByReport = new Map<string, string>();
  log: string[] = [];
  transactions = 0;
  failNextActivePointer = false;
  private queue = Promise.resolve();

  transaction<T>(work: (tx: ReportV4ArtifactRevisionTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const run = this.queue.then(async () => {
      const rows = cloneRows(this.rows);
      const active = new Map(this.activeByReport);
      const transaction = this.createTransaction(rows, active);
      const result = await work(transaction);
      if (this.failNextActivePointer) this.failNextActivePointer = false;
      this.rows = rows;
      this.activeByReport = active;
      return result;
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private createTransaction(rows: Map<string, ReportV4ArtifactRevisionRow>, active: Map<string, string>): ReportV4ArtifactRevisionTransaction {
    return {
      lockReport: async (reportId) => { this.log.push(`lock:${reportId}`); },
      getRevision: async (id) => rows.get(id) ?? null,
      getCoreRevision: async (reportId) => [...rows.values()].find((row) => (
        row.reportId === reportId && row.revisionKind === "generation"
      )) ?? null,
      getActiveRevision: async (reportId) => rows.get(active.get(reportId) ?? "") ?? null,
      nextRevision: async (reportId) => Math.max(0, ...[...rows.values()].filter((row) => row.reportId === reportId).map((row) => row.revision)) + 1,
      insertRevision: async (row) => {
        if (rows.has(row.id)) throw new Error("duplicate revision");
        const inserted = { ...row, status: "pending" as const, htmlSha256: null, payloadIdentityHash: null };
        rows.set(row.id, inserted);
        this.log.push(`insert:${row.id}:pending`);
        return inserted;
      },
      markReady: async (id, payloadIdentityHash, htmlSha256) => {
        const row = rows.get(id);
        if (!row || row.status !== "pending") return null;
        const ready = { ...row, status: "ready" as const, payloadIdentityHash, htmlSha256 };
        rows.set(id, ready);
        this.log.push(`ready:${id}`);
        return ready;
      },
      transitionStatus: async (id, from, to) => {
        const row = rows.get(id);
        if (!row || row.status !== from) return null;
        const changed = { ...row, status: to };
        rows.set(id, changed);
        this.log.push(`status:${id}:${from}->${to}`);
        return changed;
      },
      setActiveRevision: async (reportId, revisionId) => {
        if (this.failNextActivePointer) throw new Error("active pointer failed");
        active.set(reportId, revisionId);
        this.log.push(`active:${reportId}:${revisionId}`);
      }
    };
  }
}

function cloneRows(rows: Map<string, ReportV4ArtifactRevisionRow>): Map<string, ReportV4ArtifactRevisionRow> {
  return new Map([...rows].map(([id, row]) => [id, { ...row }]));
}

interface RecordedSqlCall {
  readonly sql: string;
  readonly values: readonly unknown[];
}

class ScriptedPostgresDatabase implements ReportV4ArtifactRevisionPostgresDatabase {
  readonly calls: RecordedSqlCall[] = [];
  transactions = 0;
  private readonly responses: Array<readonly Record<string, unknown>[]>;

  constructor(responses: Array<readonly Record<string, unknown>[]>) {
    this.responses = [...responses];
  }

  readonly query: ReportV4ArtifactRevisionSql = async <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4ArtifactRevisionSqlValue[]
  ): Promise<T[]> => {
    const sql = strings.reduce((text, fragment, index) => (
      `${text}${fragment}${index < values.length ? `$${index + 1}` : ""}`
    ), "").replace(/\s+/gu, " ").trim();
    this.calls.push({ sql, values });
    const response = this.responses.shift();
    if (!response) throw new Error(`Missing scripted SQL response for: ${sql}`);
    return response as T[];
  };

  transaction<T>(work: (sql: ReportV4ArtifactRevisionSql) => Promise<T>): Promise<T> {
    this.transactions += 1;
    return work(this.query);
  }
}

function postgresRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "core-revision",
    report_id: "report-1",
    order_id: "order-1",
    job_id: "core-job",
    config_snapshot_id: "config-snapshot-1",
    revision: 1,
    revision_kind: "generation",
    source_artifact_revision_id: null,
    artifact_contract: "combined_geo_report_v4",
    status: "pending",
    payload_identity_hash: null,
    html_sha256: null,
    pdf_sha256: null,
    pdf_storage_key: null,
    ...overrides
  };
}
