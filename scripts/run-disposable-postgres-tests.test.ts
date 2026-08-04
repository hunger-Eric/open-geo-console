import { describe, expect, it, vi } from "vitest";
import {
  CANONICAL_POSTGRES_TESTS,
  POSTGRES_DATA_TMPFS,
  POSTGRES_17_TESTS,
  REPO_ROOT,
  RUN_LABEL,
  STAGING_PROFILE_POSTGRES_TESTS,
  allocateFreePort,
  buildDockerRunArgs,
  discoverPostgresTests,
  executePhasedLifecycle,
  parseCliArgs,
  selectTestFiles,
  validateDockerRuntimeInspect,
  validatePostgresInventory,
  validateVitestReport
} from "./run-disposable-postgres-tests.mjs";

describe("disposable PostgreSQL test runner", () => {
  it("builds an isolated tmpfs-only PostgreSQL container command", () => {
    const args = buildDockerRunArgs({ containerName: "ogc-test", port: 6543, runId: "run-1" });

    expect(args).toContain("--tmpfs");
    expect(args).toContain(POSTGRES_DATA_TMPFS);
    expect(args).toContain(`${RUN_LABEL}=run-1`);
    expect(args).toContain("127.0.0.1:6543:5432");
    expect(args).not.toContain("--volume");
    expect(args).not.toContain("-v");
    expect(() => buildDockerRunArgs({ containerName: "unsafe", port: 5432, runId: "run-2" })).toThrow(/5432|unsafe/i);
  });

  it("allocates a loopback port outside the forbidden set", async () => {
    const port = await allocateFreePort({ excluded: new Set([5432]) });
    expect(port).toBeGreaterThan(0);
    expect(port).not.toBe(5432);
  });

  it("accepts Docker Desktop's HostConfig tmpfs authority and rejects a volume", () => {
    const runtime = { containerId: "container-1", containerName: "ogc-test", runId: "run-1", port: 6543 };
    const inspected = {
      Id: runtime.containerId,
      Name: `/${runtime.containerName}`,
      Image: "image-1",
      Config: { Labels: { [RUN_LABEL]: runtime.runId } },
      HostConfig: {
        PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: String(runtime.port) }] },
        Tmpfs: { "/var/lib/postgresql/data": "rw,size=1073741824" }
      },
      Mounts: []
    };

    expect(validateDockerRuntimeInspect(inspected, runtime, "image-1")).toBe(inspected);
    expect(() => validateDockerRuntimeInspect({
      ...inspected,
      Mounts: [{ Type: "volume", Destination: "/var/lib/postgresql/data" }]
    }, runtime, "image-1")).toThrow(/volume/i);
  });

  it("parses help, dry-run and focused file arguments without forwarding unknown flags", () => {
    expect(parseCliArgs(["--help"])).toMatchObject({ help: true });
    expect(parseCliArgs(["--dry-run", "apps/web/src/db/recovery-state.postgres.test.ts"])).toEqual({
      help: false,
      dryRun: true,
      files: ["apps/web/src/db/recovery-state.postgres.test.ts"]
    });
    expect(() => parseCliArgs(["--unknown"])).toThrow(/unsupported/i);
  });

  it("selects inventoried focused tests and rejects arbitrary or escaping paths", async () => {
    const discovered = await discoverPostgresTests();
    const select = (files: string[]) => selectTestFiles(files, REPO_ROOT, discovered);
    await expect(select(["apps/web/src/db/recovery-state.postgres.test.ts"]))
      .resolves.toEqual(["apps/web/src/db/recovery-state.postgres.test.ts"]);
    await expect(select(["apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts"]))
      .resolves.toEqual(["apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts"]);
    await expect(select(["scripts/run-disposable-postgres-tests.test.ts"]))
      .rejects.toThrow(/canonical PG16|semantic-contract/i);
    await expect(select(["../outside.test.ts"]))
      .rejects.toThrow(/escapes/i);
  });

  it("classifies every PostgreSQL test exactly once and fails inventory drift", () => {
    const discovered = [...CANONICAL_POSTGRES_TESTS, ...STAGING_PROFILE_POSTGRES_TESTS, ...POSTGRES_17_TESTS];
    expect(validatePostgresInventory(discovered)).toMatchObject({
      canonical: expect.arrayContaining([
        "apps/web/src/db/recovery-state.postgres.test.ts",
        "apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts"
      ]),
      stagingProfile: expect.arrayContaining(["apps/web/src/db/staging-security.postgres.test.ts"]),
      postgres17: expect.arrayContaining(["apps/web/src/db/report-v4-artifact-persistence.postgres.test.ts"])
    });
    expect(() => validatePostgresInventory([...discovered, "apps/web/src/db/new.postgres.test.ts"]))
      .toThrow(/unclassified.*new\.postgres\.test\.ts/i);
    expect(() => validatePostgresInventory(discovered.filter((file) => file !== CANONICAL_POSTGRES_TESTS[0])))
      .toThrow(/missing/i);
  });

  it("refuses Staging-profile and PostgreSQL 17 files before starting Docker", async () => {
    const discovered = await discoverPostgresTests();
    const select = (files: string[]) => selectTestFiles(files, REPO_ROOT, discovered);
    await expect(select([STAGING_PROFILE_POSTGRES_TESTS[0]!])).rejects.toThrow(/Staging profile/i);
    await expect(select([POSTGRES_17_TESTS[0]!])).rejects.toThrow(/PostgreSQL 17/i);
  });

  it("accepts only complete zero-skip Vitest JSON containing every selected file", () => {
    const selected = ["scripts/run-disposable-postgres-tests.test.ts"];
    const passing = {
      numTotalTests: 5,
      numPassedTests: 5,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [{ name: `${process.cwd()}\\scripts\\run-disposable-postgres-tests.test.ts`, status: "passed" }]
    };

    expect(validateVitestReport(passing, selected, 0)).toMatchObject({ total: 5, passed: 5, failed: 0, skipped: 0 });
    expect(() => validateVitestReport({ ...passing, numPendingTests: 1 }, selected, 0)).toThrow(/skipped|pending/i);
    expect(() => validateVitestReport({ ...passing, testResults: [] }, selected, 0)).toThrow(/missing selected/i);
    expect(() => validateVitestReport(passing, selected, 1)).toThrow(/exited/i);
  });

  it("retries setup before tests, then persists and parses evidence before cleanup", async () => {
    const events: string[] = [];
    let testCalls = 0;
    const parsed = { total: 1, passed: 1, failed: 0, skipped: 0 };

    const result = await executePhasedLifecycle({
      maxSetupAttempts: 3,
      setupAttempt: vi.fn(async (attempt) => {
        events.push(`setup:${attempt}`);
        return attempt === 1
          ? { status: "failed" as const, runtime: { id: "failed" }, error: new Error("bind race") }
          : { status: "ready" as const, runtime: { id: "ready" } };
      }),
      cleanupRuntime: vi.fn(async (runtime: { id: string }) => { events.push(`cleanup:${runtime.id}`); }),
      runTests: vi.fn(async () => {
        testCalls += 1;
        events.push("test");
        return { exitCode: 0 };
      }),
      persistEvidence: vi.fn(async () => { events.push("persist"); }),
      parseEvidence: vi.fn(async () => { events.push("parse"); return parsed; })
    });

    expect(testCalls).toBe(1);
    expect(result.parsed).toBe(parsed);
    expect(events).toEqual(["setup:1", "cleanup:failed", "setup:2", "test", "persist", "parse", "cleanup:ready"]);
  });

  it("cleans the exact runtime after evidence parsing fails and never starts a second test", async () => {
    const events: string[] = [];
    const runTests = vi.fn(async () => ({ exitCode: 0 }));

    await expect(executePhasedLifecycle({
      setupAttempt: async () => ({ status: "ready" as const, runtime: { id: "ready" } }),
      cleanupRuntime: async () => { events.push("cleanup"); },
      runTests,
      persistEvidence: async () => { events.push("persist"); },
      parseEvidence: async () => { events.push("parse"); throw new Error("malformed JSON"); }
    })).rejects.toThrow(/malformed JSON/i);

    expect(runTests).toHaveBeenCalledOnce();
    expect(events).toEqual(["persist", "parse", "cleanup"]);
  });
});
