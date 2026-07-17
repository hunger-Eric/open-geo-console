import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { DATABASE_SCHEMA_VERSION as CURRENT_SCHEMA_VERSION } from "../db";
import {
  runReportV4StagingPreflight,
  type ReportV4StagingPreflightStore
} from "./report-v4-staging-preflight";

describe("Report V4 protected-Staging preflight", () => {
  it("returns non-secret JSON-ready evidence without migrating", async () => {
    const store = preflightStore({ schemaVersion: Math.min(33, CURRENT_SCHEMA_VERSION), diagnosisCheckpointCount: 0 });
    const result = await runReportV4StagingPreflight(protectedStaging(), store);

    expect(result).toEqual({
      profile: "staging",
      schemaVersion: Math.min(33, CURRENT_SCHEMA_VERSION),
      currentSchemaVersion: CURRENT_SCHEMA_VERSION,
      diagnosisCheckpointTableExists: true,
      diagnosisCheckpointCount: 0,
      v34MigrationSafe: true
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("blocks V34 when an older schema already has diagnosis checkpoints", async () => {
    await expect(runReportV4StagingPreflight(protectedStaging(), preflightStore({
      schemaVersion: 33,
      diagnosisCheckpointCount: 1
    }))).rejects.toThrow(/V34|existing|checkpoint/i);
  });

  it("accepts populated checkpoints after V34 and rejects a database newer than this checkout", async () => {
    if (CURRENT_SCHEMA_VERSION >= 34) {
      await expect(runReportV4StagingPreflight(protectedStaging(), preflightStore({
        schemaVersion: 34,
        diagnosisCheckpointCount: 3
      }))).resolves.toMatchObject({ v34MigrationSafe: true, diagnosisCheckpointCount: 3 });
    }
    await expect(runReportV4StagingPreflight(protectedStaging(), preflightStore({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      diagnosisCheckpointCount: 0
    }))).rejects.toThrow(/newer|deployment|checkout/i);
  });

  it("rejects a non-protected runtime before reading PostgreSQL", async () => {
    const inspect = vi.fn();
    await expect(runReportV4StagingPreflight({
      ...protectedStaging(),
      OGC_DEPLOYMENT_PROFILE: "production"
    }, { inspect })).rejects.toThrow(/protected|staging|Preview/i);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("represents an absent diagnosis table as zero without a count query", async () => {
    const store = preflightStore({
      schemaVersion: Math.min(32, CURRENT_SCHEMA_VERSION),
      diagnosisCheckpointTableExists: false,
      diagnosisCheckpointCount: 99
    });
    await expect(runReportV4StagingPreflight(protectedStaging(), store)).resolves.toMatchObject({
      diagnosisCheckpointTableExists: false,
      diagnosisCheckpointCount: 0
    });
  });

  it("keeps the CLI source free of ensureDatabase and migration execution", () => {
    const source = readFileSync(fileURLToPath(new URL("./report-v4-staging-preflight.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/ensureDatabase|databaseMigrationsAfter|DATABASE_MIGRATIONS|\.unsafe\([^)]*(ALTER|CREATE|UPDATE|INSERT|DELETE)/isu);
    expect(source).toMatch(/begin\("read only"/u);
  });
});

describe("exact-commit staging-only Worker launcher", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../../../../scripts/start-report-v4-staging-workers.ps1", import.meta.url)),
    "utf8"
  );

  it("allows only the protected untracked V3 plan while rejecting every other worktree entry", () => {
    const protectedPath = "docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md";
    expect(source).toMatch(/git -C \$Root status --porcelain=v1 --untracked-files=all/u);
    expect(source.match(new RegExp(protectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu"))).toHaveLength(1);
    expect(source).toMatch(/unexpectedEntries[\s\S]*-cne \$allowedProtectedPlanEntry/u);
    expect(source).toMatch(/unexpectedEntries\.Count -gt 0/u);
    expect(source).not.toMatch(new RegExp(`(?:Get-Content|Remove-Item|Move-Item|git\\s+(?:add|stage))[^\\n]*${protectedPath}`, "iu"));
  });

  it("rejects a missing or ineffective top-level docs Docker exclusion", () => {
    expect(source).toMatch(/Test-Path -LiteralPath \$dockerIgnorePath -PathType Leaf/u);
    expect(source).toMatch(/ReadAllLines\(\$dockerIgnorePath\)/u);
    expect(source).toMatch(/\$_ -ceq "docs"/u);
    expect(source).toMatch(/\$effectiveRules\[-1\] -cne "docs"/u);
    expect(source).toMatch(/requires \.dockerignore|requires a final top-level exact 'docs'/u);
  });

  it("binds build, image label, and deployment version to full HEAD", () => {
    expect(source).toMatch(/git rev-parse HEAD/u);
    expect(source).toMatch(/OGC_REVISION=\$revision/u);
    expect(source).toMatch(/org\.opencontainers\.image\.revision=\$revision/u);
    expect(source).toMatch(/OGC_DEPLOYMENT_VERSION.*\$revision/u);
  });

  it("does not mutate staging.env until preflight and image build succeed, and restores exact bytes on failed verification", () => {
    const preflight = source.indexOf("report-v4-staging-preflight.ts");
    const build = source.indexOf("docker build");
    const envMutation = source.indexOf("Set-RuntimeDeploymentVersion $runtimeEnv $revision");
    const compose = source.indexOf("docker compose @composeArgs up");
    expect(preflight).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(preflight);
    expect(envMutation).toBeGreaterThan(build);
    expect(compose).toBeGreaterThan(envMutation);
    expect(source).toMatch(/ReadAllBytes\(\$runtimeEnv\)/u);
    expect(source).toMatch(/-not \$launchVerified[\s\S]*WriteAllBytes\(\$runtimeEnv, \$originalRuntimeEnvBytes\)/u);
    expect(source).toMatch(/containers were not rolled back and remain unverified/u);
  });

  it("requires the merged staging env and all three dedicated V4 variables", () => {
    expect(source).toContain(".data\\workstation-docker\\staging.env");
    for (const name of [
      "OGC_REPORT_V4_MODEL_PROFILE_ID",
      "OGC_REPORT_V4_MIMO_BASE_URL",
      "OGC_REPORT_V4_MIMO_API_KEY"
    ]) expect(source).toContain(name);
  });

  it("recreates only the two staging lanes and never delegates to broad workstation or deployment commands", () => {
    expect(source).toMatch(/staging-worker-free.*staging-worker-deep/su);
    expect(source).toMatch(/compose.*up.*--no-build/su);
    expect(source).not.toMatch(/production-worker|production-commerce|start-workstation-workers|vercel\s+(deploy|alias)|db:migrate|ensureDatabase/iu);
  });

  it("verifies both containers against the exact image ID, revision label, and staging markers", () => {
    expect(source).toMatch(/docker image inspect/u);
    expect(source).toMatch(/docker inspect/u);
    expect(source).toMatch(/OGC_DEPLOYMENT_PROFILE/u);
    expect(source).toMatch(/VERCEL_ENV/u);
    expect(source).toMatch(/COMMERCE_MODE/u);
    expect(source).toMatch(/OGC_WORKER_TIER/u);
    expect(source).toMatch(/image ID|ImageId/u);
  });

  it("waits for running Workers and uses health or the existing ready log as the readiness boundary", () => {
    expect(source).toMatch(/State\.Running/u);
    expect(source).toMatch(/State\.Health\.Status.*healthy/u);
    expect(source).toMatch(/Open GEO Console.*worker .* is ready/u);
    expect(source).toMatch(/Start-Sleep/u);
  });

  it("reports the current forward-only schema instead of freezing the V34 migration number", () => {
    expect(source).toMatch(/currentSchemaVersion/u);
    expect(source).toMatch(/Schema \$currentSchemaVersion is forward-only/u);
    expect(source).not.toMatch(/Schema 34 is forward-only/u);
  });
});

function protectedStaging(): NodeJS.ProcessEnv {
  return {
    OGC_DEPLOYMENT_PROFILE: "staging",
    VERCEL_ENV: "preview",
    COMMERCE_MODE: "test",
    DATABASE_URL: "postgres://secret-value"
  };
}

function preflightStore(overrides: Partial<Awaited<ReturnType<ReportV4StagingPreflightStore["inspect"]>>> = {}): ReportV4StagingPreflightStore {
  return {
    inspect: vi.fn(async () => ({
      profile: "staging",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      diagnosisCheckpointTableExists: true,
      diagnosisCheckpointCount: 0,
      ...overrides
    }))
  };
}
