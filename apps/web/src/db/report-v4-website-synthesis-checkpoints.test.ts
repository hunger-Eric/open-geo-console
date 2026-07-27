import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import {
  buildReportV4WebsiteSynthesisInputAuthority,
  createMemoryReportV4WebsiteSynthesisCheckpointRepository,
  createPostgresReportV4WebsiteSynthesisCheckpointRepository,
  reportV4PageSummaryIdentitySetHash
} from "./report-v4-website-synthesis-checkpoints";

const lineage = {
  reportId: "r",
  orderId: "o",
  coreJobId: "c",
  configSnapshotId: "cfg",
  siteSnapshotId: "s",
  operationId: "websiteSynthesis",
  profileId: "report-v4-mimo-v2.5-pro-v1"
};
const input = {
  ...lineage,
  inputIdentityHash: "1".repeat(64),
  pageSummaryIdentitySetHash: "2".repeat(64),
  pageSummaryCount: 1
};
const output = { summary: "summary", strengths: ["a"], gaps: ["b"], actions: ["c"] };
const page = {
  pageId: "page-1",
  url: "https://example.com/",
  contentHash: "a".repeat(64),
  readability: "direct_readable" as const,
  sourceLength: 8,
  chunks: [{ order: 1, summary: "summary", sourceLocations: [{ locationId: "loc-1", startOffset: 0, endOffset: 7 }] }]
};

describe("report v4 website synthesis checkpoints", () => {
  it("uses the semantic-verifier set formula and a golden hash-safe provider-input authority", () => {
    const authority = buildReportV4WebsiteSynthesisInputAuthority({
      ...lineage,
      targetUrl: "https://EXAMPLE.com",
      locale: "en",
      pages: [page],
      modelProfile: profilePayload
    });
    expect(authority).toEqual({
      inputIdentityHash: "12823bdf339cddef4a01079f01d26e3be25d00830a3814ad24bfdada666518f0",
      pageSummaryIdentitySetHash: "ef3960e7c709b66b8b7315f0eb2222af9ca22bf63bf0d3689df2adf099f29acc",
      pageSummaryCount: 1
    });
    expect(authority.pageSummaryIdentitySetHash).toBe(reportV4PageSummaryIdentitySetHash([
      "4435e8c0bd5376363f6d8575b73c2cd4d5d4fe61b0415f07323a2c1b6511bc02"
    ]));
  });

  it("keeps the page identity set order-stable while ordered provider-input drift changes the input hash", () => {
    const page2 = {
      ...page,
      pageId: "page-2",
      url: "https://example.com/two",
      contentHash: "b".repeat(64),
      chunks: [{ ...page.chunks[0]!, sourceLocations: [{ locationId: "loc-2", startOffset: 0, endOffset: 7 }] }]
    };
    const first = buildReportV4WebsiteSynthesisInputAuthority({
      ...lineage, targetUrl: "https://example.com/", locale: "en", pages: [page, page2], modelProfile: profilePayload
    });
    const reordered = buildReportV4WebsiteSynthesisInputAuthority({
      ...lineage, targetUrl: "https://example.com/", locale: "en", pages: [page2, page], modelProfile: profilePayload
    });
    expect(reordered.pageSummaryIdentitySetHash).toBe(first.pageSummaryIdentitySetHash);
    expect(reordered.inputIdentityHash).not.toBe(first.inputIdentityHash);
    const localeDrift = buildReportV4WebsiteSynthesisInputAuthority({
      ...lineage, targetUrl: "https://example.com/", locale: "zh", pages: [page, page2], modelProfile: profilePayload
    });
    expect(localeDrift.inputIdentityHash).not.toBe(first.inputIdentityHash);
  });

  it("claims once, completes with contract payload, reuses exact authority, and rejects completed replay drift", async () => {
    const repo = createMemoryReportV4WebsiteSynthesisCheckpointRepository();
    const row = await repo.initialize(input);
    expect(row).toMatchObject({ state: "queued", inputIdentityHash: input.inputIdentityHash,
      pageSummaryIdentitySetHash: input.pageSummaryIdentitySetHash, pageSummaryCount: 1 });
    const claim = await repo.claim({ ...input, workerId: "w", leaseMs: 60_000 });
    expect(claim.state).toBe("running");
    await expect(repo.claim({ ...input, workerId: "w2", leaseMs: 60_000 })).rejects.toThrow(/claimed|running/i);
    await repo.beginProviderCall({ ...input, workerId: "w" });
    const done = await repo.complete({ ...input, workerId: "w", output });
    expect(done.state).toBe("completed");
    await expect(repo.claim({ ...input, workerId: "w", leaseMs: 60_000 })).resolves.toMatchObject({ state: "completed" });
    await expect(repo.initialize({ ...input, inputIdentityHash: "3".repeat(64) })).rejects.toThrow(/authority|drift/i);
    await expect(repo.load({ ...input, pageSummaryIdentitySetHash: "4".repeat(64) })).rejects.toThrow(/authority|drift/i);
  });

  it("allows stale lease recovery and rejects lineage drift or excessive calls", async () => {
    const repo = createMemoryReportV4WebsiteSynthesisCheckpointRepository();
    await repo.initialize(input);
    await repo.claim({ ...input, workerId: "w", leaseMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(repo.claim({ ...input, workerId: "w2", leaseMs: 1000 })).resolves.toMatchObject({ workerId: "w2" });
    await repo.beginProviderCall({ ...input, workerId: "w2" });
    await expect(repo.complete({ ...input, operationId: "drift", workerId: "w2", output })).rejects.toThrow();
    await repo.complete({ ...input, workerId: "w2", output });
    await expect(repo.complete({ ...input, workerId: "w2", output })).rejects.toThrow();
  });

  it("accepts failed terminalization only after one authorized provider call", async () => {
    const repo = createMemoryReportV4WebsiteSynthesisCheckpointRepository();
    await repo.initialize(input);
    await repo.claim({ ...input, workerId: "w", leaseMs: 60_000 });
    await repo.beginProviderCall({ ...input, workerId: "w" });
    await expect(repo.fail({ ...input, workerId: "w", errorCode: "provider_error" }))
      .resolves.toMatchObject({ state: "failed", providerCallCount: 1, workerId: null, leaseExpiresAt: null });
    await expect(repo.load(input)).resolves.toMatchObject({ state: "failed", errorCode: "provider_error" });
  });

  it.each(["completed", "failed"] as const)("rejects persisted %s authority with zero provider calls on load and initialize", async (state) => {
    const valid = await createMemoryReportV4WebsiteSynthesisCheckpointRepository().initialize(input);
    const row = persistedRow(valid, {
      state,
      provider_call_count: 0,
      output_payload: state === "completed" ? output : null,
      output_hash: state === "completed" ? createHash("sha256").update(JSON.stringify(output)).digest("hex") : null,
      error_code: state === "failed" ? "provider_error" : null
    });
    const fakeSql = (() => Promise.resolve([row])) as never;
    const repo = createPostgresReportV4WebsiteSynthesisCheckpointRepository(fakeSql);
    await expect(repo.load(input)).rejects.toThrow(/integrity/i);
    await expect(repo.initialize(input)).rejects.toThrow(/integrity/i);
  });

  it("rejects invalid input authority, worker, lease, and error code before persistence", async () => {
    let sqlCalls = 0;
    const fakeSql = (() => { sqlCalls += 1; return Promise.resolve([]); }) as never;
    const postgresRepo = createPostgresReportV4WebsiteSynthesisCheckpointRepository(fakeSql);
    await expect(postgresRepo.initialize({ ...input, reportId: " " })).rejects.toThrow(/reportId|non-empty/i);
    await expect(postgresRepo.initialize({ ...input, inputIdentityHash: "not-a-hash" })).rejects.toThrow(/inputIdentityHash|SHA-256/i);
    await expect(postgresRepo.initialize({ ...input, pageSummaryCount: 0 })).rejects.toThrow(/pageSummaryCount/i);
    await expect(postgresRepo.claim({ ...input, workerId: "", leaseMs: 60_000 })).rejects.toThrow(/workerId|non-empty/i);
    await expect(postgresRepo.claim({ ...input, workerId: "w", leaseMs: Number.MAX_SAFE_INTEGER })).rejects.toThrow(/leaseMs/i);
    await expect(postgresRepo.fail({ ...input, workerId: "w", errorCode: "x".repeat(201) })).rejects.toThrow(/errorCode/i);
    expect(sqlCalls).toBe(0);
  });
});

function persistedRow(
  checkpoint: Awaited<ReturnType<ReturnType<typeof createMemoryReportV4WebsiteSynthesisCheckpointRepository>["initialize"]>>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return {
    identity_hash: checkpoint.identityHash,
    report_id: checkpoint.reportId,
    order_id: checkpoint.orderId,
    core_job_id: checkpoint.coreJobId,
    config_snapshot_id: checkpoint.configSnapshotId,
    site_snapshot_id: checkpoint.siteSnapshotId,
    operation_id: checkpoint.operationId,
    profile_id: checkpoint.profileId,
    input_identity_hash: checkpoint.inputIdentityHash,
    page_summary_identity_set_hash: checkpoint.pageSummaryIdentitySetHash,
    page_summary_count: checkpoint.pageSummaryCount,
    state: checkpoint.state,
    worker_id: checkpoint.workerId,
    lease_expires_at: checkpoint.leaseExpiresAt,
    provider_call_count: checkpoint.providerCallCount,
    correction_count: checkpoint.correctionCount,
    output_payload: checkpoint.output,
    output_hash: checkpoint.outputHash,
    error_code: checkpoint.errorCode,
    ...overrides
  };
}
