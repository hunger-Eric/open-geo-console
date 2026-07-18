import { spawnSync } from "node:child_process";
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
  const launcherPath = fileURLToPath(new URL("../../../../scripts/start-report-v4-staging-workers.ps1", import.meta.url));
  const source = readFileSync(launcherPath, "utf8");
  const dockerIgnore = readFileSync(
    fileURLToPath(new URL("../../../../.dockerignore", import.meta.url)),
    "utf8"
  );

  it("allows only the collapsed untracked assets directory and protected V3 plan while rejecting every other entry", () => {
    const protectedPath = "docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md";
    expect(source).toMatch(/git -C \$Root status --porcelain=v1 --untracked-files=normal/u);
    expect(source).toMatch(/\$allowedUntrackedAssetsEntry = "\?\? assets\/"/u);
    expect(source.match(new RegExp(protectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu"))).toHaveLength(1);
    expect(source).toMatch(/unexpectedEntries[\s\S]*-cne \$allowedUntrackedAssetsEntry[\s\S]*-cne \$allowedProtectedPlanEntry/u);
    expect(source).toMatch(/unexpectedEntries\.Count -gt 0[\s\S]*untrackedAssetsEntries\.Count -gt 1[\s\S]*protectedPlanEntries\.Count -gt 1/u);
    expect(source).not.toMatch(/Get-ChildItem|Get-Content[^\n]*assets|Remove-Item[^\n]*assets|Move-Item[^\n]*assets|git\s+(?:add|stage)[^\n]*assets/iu);
    expect(source).not.toMatch(new RegExp(`(?:Get-Content|Remove-Item|Move-Item|git\\s+(?:add|stage))[^\\n]*${protectedPath}`, "iu"));
  });

  it("requires one effective exact assets exclusion immediately before the final exact docs exclusion", () => {
    const effectiveRules = dockerIgnore.split(/\r?\n/u)
      .filter((line) => line.trim().length > 0 && !line.trimStart().startsWith("#"));
    expect(effectiveRules.filter((line) => line === "assets")).toHaveLength(1);
    expect(effectiveRules.filter((line) => line === "docs")).toHaveLength(1);
    expect(effectiveRules.slice(-2)).toEqual(["assets", "docs"]);
    expect(source).toMatch(/Test-Path -LiteralPath \$dockerIgnorePath -PathType Leaf/u);
    expect(source).toMatch(/ReadAllLines\(\$dockerIgnorePath\)/u);
    expect(source).toMatch(/exactAssetsRules\.Count -ne 1[\s\S]*exactDocsRules\.Count -ne 1/u);
    expect(source).toMatch(/\$effectiveRules\[-2\] -cne "assets"[\s\S]*\$effectiveRules\[-1\] -cne "docs"/u);
    expect(source).toMatch(/requires \.dockerignore|requires one effective top-level exact 'assets'.*final exact 'docs'/u);
  });

  (process.platform === "win32" ? it : it.skip)("parses with the Windows PowerShell language parser", () => {
    const command = [
      "$tokens = $null",
      "$parseErrors = $null",
      "[System.Management.Automation.Language.Parser]::ParseFile($env:OGC_PARSE_TARGET, [ref]$tokens, [ref]$parseErrors) | Out-Null",
      "if ($parseErrors.Count -gt 0) { $parseErrors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }"
    ].join("; ");
    const parsed = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      env: { ...process.env, OGC_PARSE_TARGET: launcherPath }
    });
    if (parsed.status !== 0) throw new Error(`PowerShell parser rejected the staging launcher:\n${parsed.stderr}`);
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

describe("Worker image runtime-config contract", () => {
  const dockerfile = readFileSync(
    fileURLToPath(new URL("../../../../Dockerfile.worker", import.meta.url)),
    "utf8"
  );
  const runtimeConfigSource = readFileSync(
    fileURLToPath(new URL("../report-v4/model-runtime-config.ts", import.meta.url)),
    "utf8"
  );
  const profilePath = fileURLToPath(
    new URL("../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json", import.meta.url)
  );

  it("copies the tracked V4 model profile to its runtime import address", () => {
    expect(dockerfile).toMatch(/^WORKDIR \/app$/mu);
    expect(dockerfile.match(/^COPY config \.\/config$/gmu)).toHaveLength(1);
    expect(runtimeConfigSource).toContain(
      'from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json"'
    );
    expect(JSON.parse(readFileSync(profilePath, "utf8"))).toMatchObject({
      profileId: "report-v4-mimo-v2.5-pro-v1"
    });
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
