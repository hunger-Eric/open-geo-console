import { describe, expect, it } from "vitest";
import {
  createMemoryReportV4WebsiteSynthesisCheckpointRepository,
  createPostgresReportV4WebsiteSynthesisCheckpointRepository
} from "./report-v4-website-synthesis-checkpoints";

const input = { reportId:"r", orderId:"o", coreJobId:"c", configSnapshotId:"cfg", siteSnapshotId:"s", operationId:"op", profileId:"p" };
const output = { summary:"summary", strengths:["a"], gaps:["b"], actions:["c"] };

describe("report v4 website synthesis checkpoints", () => {
  it("claims once, completes with contract payload, and reuses completed", async () => {
    const repo=createMemoryReportV4WebsiteSynthesisCheckpointRepository();
    const row=await repo.initialize(input);
    expect(row.state).toBe("queued");
    const claim=await repo.claim({...input, workerId:"w", leaseMs:60_000});
    expect(claim.state).toBe("running");
    await expect(repo.claim({...input, workerId:"w2", leaseMs:60_000})).rejects.toThrow(/claimed|running/i);
    await repo.beginProviderCall({...input, workerId:"w"});
    const done=await repo.complete({...input, workerId:"w", output, providerCallCount:1, correctionCount:0});
    expect(done.state).toBe("completed");
    await expect(repo.claim({...input, workerId:"w", leaseMs:60_000})).resolves.toMatchObject({state:"completed"});
  });
  it("allows stale lease recovery and rejects lineage drift or excessive calls", async () => {
    const repo=createMemoryReportV4WebsiteSynthesisCheckpointRepository(); await repo.initialize(input);
    await repo.claim({...input, workerId:"w", leaseMs:1});
    await new Promise(r=>setTimeout(r,5));
    await expect(repo.claim({...input, workerId:"w2", leaseMs:1000})).resolves.toMatchObject({workerId:"w2"});
    await repo.beginProviderCall({...input, workerId:"w2"});
    await expect(repo.complete({...input, operationId:"drift", workerId:"w2", output})).rejects.toThrow();
    await repo.complete({...input, workerId:"w2", output});
    await expect(repo.complete({...input, workerId:"w2", output})).rejects.toThrow();
  });
  it("rejects invalid identity, worker, lease, and error code before persistence", async () => {
    let sqlCalls = 0;
    const fakeSql = (() => { sqlCalls += 1; return Promise.resolve([]); }) as never;
    const postgresRepo = createPostgresReportV4WebsiteSynthesisCheckpointRepository(fakeSql);
    await expect(postgresRepo.initialize({...input, reportId:" "})).rejects.toThrow(/reportId|non-empty/i);
    await expect(postgresRepo.claim({...input, workerId:"", leaseMs:60_000})).rejects.toThrow(/workerId|non-empty/i);
    await expect(postgresRepo.claim({...input, workerId:"w", leaseMs:Number.MAX_SAFE_INTEGER})).rejects.toThrow(/leaseMs/i);
    await expect(postgresRepo.fail({...input, workerId:"w", errorCode:"x".repeat(201)})).rejects.toThrow(/errorCode/i);
    expect(sqlCalls).toBe(0);

    const memoryRepo = createMemoryReportV4WebsiteSynthesisCheckpointRepository();
    await expect(memoryRepo.initialize({...input, operationId:"x".repeat(501)})).rejects.toThrow(/operationId/i);
    await memoryRepo.initialize(input);
    await expect(memoryRepo.claim({...input, workerId:"w", leaseMs:0})).rejects.toThrow(/leaseMs/i);
  });
});
