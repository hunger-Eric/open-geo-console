import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
export const POSTGRES_IMAGE = "postgres:16-alpine";
export const POSTGRES_DATA_TMPFS = "/var/lib/postgresql/data:rw,size=1g";
export const RUN_LABEL = "open-geo-console.disposable-postgres.run-id";
export const MAX_SETUP_ATTEMPTS = 3;
export const FORBIDDEN_PORTS = new Set([5432]);
export const CANONICAL_POSTGRES_TESTS = Object.freeze([
  "apps/web/src/db/commercial-orders-reissue.postgres.test.ts",
  "apps/web/src/db/commercial-orders-semantic-review.postgres.test.ts",
  "apps/web/src/db/commercial-orders-v4.postgres.test.ts",
  "apps/web/src/db/jobs-targeted-claim.postgres.test.ts",
  "apps/web/src/db/provider-evidence.postgres.test.ts",
  "apps/web/src/db/recovery-state.postgres.test.ts",
  "apps/web/src/db/report-v4-acceptance-ledger.postgres.test.ts",
  "apps/web/src/db/report-v4-artifact-authority.postgres.test.ts",
  "apps/web/src/db/report-v4-artifact-revisions.postgres.test.ts",
  "apps/web/src/db/report-v4-commerce-authority-snapshot.postgres.test.ts",
  "apps/web/src/db/report-v4-config-snapshots.postgres.test.ts",
  "apps/web/src/db/report-v4-diagnosis-checkpoints.postgres.test.ts",
  "apps/web/src/db/report-v4-enhancement-terminalization.postgres.test.ts",
  "apps/web/src/db/report-v4-page-summaries.postgres.test.ts",
  "apps/web/src/db/report-v4-production-jobs.postgres.test.ts",
  "apps/web/src/db/report-v4-site-page-authority.postgres.test.ts",
  "apps/web/src/db/report-v4-site-read-manifest.postgres.test.ts",
  "apps/web/src/db/report-v4-site-snapshots.postgres.test.ts",
  "apps/web/src/db/report-v4-website-synthesis-checkpoints.postgres.test.ts",
  "apps/web/src/db/schema-v10.postgres.test.ts",
  "apps/web/src/db/schema-v11.postgres.test.ts",
  "apps/web/src/db/schema-v12.postgres.test.ts",
  "apps/web/src/db/schema-v13.postgres.test.ts",
  "apps/web/src/db/schema-v14.postgres.test.ts",
  "apps/web/src/db/schema-v18.postgres.test.ts",
  "apps/web/src/db/schema-v19.postgres.test.ts",
  "apps/web/src/db/schema-v20.postgres.test.ts",
  "apps/web/src/db/schema-v21.postgres.test.ts",
  "apps/web/src/db/schema-v23.postgres.test.ts",
  "apps/web/src/db/schema-v25.postgres.test.ts",
  "apps/web/src/db/schema-v26.postgres.test.ts",
  "apps/web/src/db/schema-v27.postgres.test.ts",
  "apps/web/src/db/schema-v28.postgres.test.ts",
  "apps/web/src/db/schema-v29.postgres.test.ts",
  "apps/web/src/db/schema-v30.postgres.test.ts",
  "apps/web/src/db/schema-v31.postgres.test.ts",
  "apps/web/src/db/schema-v32.postgres.test.ts",
  "apps/web/src/db/schema-v34.postgres.test.ts",
  "apps/web/src/db/schema-v35.postgres.test.ts",
  "apps/web/src/db/schema-v36.postgres.test.ts",
  "apps/web/src/db/schema-v37.postgres.test.ts",
  "apps/web/src/db/schema-v38.postgres.test.ts",
  "apps/web/src/db/schema-v39.postgres.test.ts",
  "apps/web/src/db/schema-v41.postgres.test.ts",
  "apps/web/src/db/schema-v42.postgres.test.ts",
  "apps/web/src/db/schema-v43.postgres.test.ts",
  "apps/web/src/db/schema-v44.postgres.test.ts",
  "apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts",
  "apps/web/src/worker/report-v4-core-production.postgres.test.ts",
  "apps/web/src/worker/report-v4-enhancement-production.postgres.test.ts",
  "apps/web/src/worker/report-v4-independent-claims.postgres.test.ts"
]);
export const STAGING_PROFILE_POSTGRES_TESTS = Object.freeze([
  "apps/web/src/db/artifact-scope.postgres.test.ts",
  "apps/web/src/db/combined-correction-terminalization.postgres.test.ts",
  "apps/web/src/db/market-snapshots.postgres.test.ts",
  "apps/web/src/db/public-source-commerce.postgres.test.ts",
  "apps/web/src/db/recommendation-commerce.postgres.test.ts",
  "apps/web/src/db/recommendation-forensics.postgres.test.ts",
  "apps/web/src/db/source-forensic-reports.postgres.test.ts",
  "apps/web/src/db/staging-security.postgres.test.ts"
]);
export const POSTGRES_17_TESTS = Object.freeze([
  "apps/web/src/db/report-v4-acceptance-authority-phase-snapshot.postgres.test.ts",
  "apps/web/src/db/report-v4-acceptance-ledger-guard-authority.postgres.test.ts",
  "apps/web/src/db/report-v4-artifact-persistence.postgres.test.ts",
  "apps/web/src/db/report-v4-prohibited-operation-guard.postgres.test.ts",
  "apps/web/src/db/report-v4-zero-database-effects-authority.postgres.test.ts"
]);
export const SEMANTIC_CONTRACT_TESTS = Object.freeze([
  "packages/ai-report-engine/src/report-semantic-review.test.ts",
  "packages/ai-report-engine/src/report-semantic-review-manifests.test.ts",
  "apps/web/src/worker/paid-v3-semantic-review.test.ts",
  "apps/web/src/worker/paid-v3-compact-review-input.test.ts",
  "apps/web/src/worker/report-v4-admission-runtime.test.ts"
]);

const HELP = `Usage:
  npm run test:postgres:disposable
  npm run test:postgres:disposable -- <test-file> [<test-file> ...]
  npm run test:postgres:disposable -- --dry-run [<test-file> ...]

With no test files, the runner selects the classified canonical PostgreSQL 16
suite plus the semantic-contract tests. Staging-profile and PostgreSQL 17 files
are refused by this runner. Selected tests must not skip.`;

export function parseCliArgs(argv) {
  const options = { help: false, dryRun: false, files: [] };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("-")) throw new Error(`Unsupported runner option: ${arg}`);
    else options.files.push(normalizeRepoPath(arg));
  }
  return options;
}

export function buildDockerRunArgs({ containerName, port, runId, image = POSTGRES_IMAGE }) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || FORBIDDEN_PORTS.has(port)) {
    throw new Error(`Refusing unsafe PostgreSQL host port: ${port}`);
  }
  return [
    "run", "--rm", "-d",
    "--name", containerName,
    "--label", `${RUN_LABEL}=${runId}`,
    "--tmpfs", POSTGRES_DATA_TMPFS,
    "-e", "POSTGRES_PASSWORD=postgres",
    "-p", `127.0.0.1:${port}:5432`,
    image
  ];
}

export async function allocateFreePort({ excluded = FORBIDDEN_PORTS } = {}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const selected = typeof address === "object" && address ? address.port : 0;
        server.close((error) => error ? reject(error) : resolve(selected));
      });
    });
    if (Number.isInteger(port) && port > 0 && !excluded.has(port)) return port;
  }
  throw new Error("Unable to allocate an isolated PostgreSQL host port.");
}

export async function discoverPostgresTests(root = REPO_ROOT) {
  const found = [];
  await walk(path.join(root, "apps"), found);
  return found
    .filter((file) => file.endsWith(".postgres.test.ts"))
    .map((file) => normalizeRepoPath(path.relative(root, file)))
    .sort();
}

export async function selectTestFiles(requested, root = REPO_ROOT) {
  const discovered = await discoverPostgresTests(root);
  const inventory = validatePostgresInventory(discovered);
  const requestedNormalized = requested.map(normalizeRepoPath);
  const candidates = requestedNormalized.length > 0
    ? requestedNormalized
    : [...inventory.canonical, ...SEMANTIC_CONTRACT_TESTS];
  const selected = [...new Set(candidates.map(normalizeRepoPath))].sort();
  if (selected.length === 0) throw new Error("No test files were selected.");
  for (const file of selected) {
    if (!/\.test\.tsx?$/u.test(file)) throw new Error(`Refusing non-test path: ${file}`);
    const absolute = path.resolve(root, file);
    if (!isInside(root, absolute)) throw new Error(`Test path escapes the repository: ${file}`);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Selected test file does not exist: ${file}`);
  }
  if (requestedNormalized.length > 0) {
    const incompatible = selected.find((file) => inventory.stagingProfile.includes(file) || inventory.postgres17.includes(file));
    if (incompatible) {
      const environment = inventory.postgres17.includes(incompatible) ? "PostgreSQL 17" : "Staging profile";
      throw new Error(`Refusing ${incompatible}: it requires the separate ${environment} suite.`);
    }
    const allowed = new Set([...inventory.canonical, ...SEMANTIC_CONTRACT_TESTS]);
    const unsupported = selected.find((file) => !allowed.has(file));
    if (unsupported) throw new Error(`Refusing ${unsupported}: focused files must belong to the canonical PG16 or semantic-contract inventory.`);
  }
  return selected;
}

export function validatePostgresInventory(discovered) {
  const groups = {
    canonical: [...CANONICAL_POSTGRES_TESTS].sort(),
    stagingProfile: [...STAGING_PROFILE_POSTGRES_TESTS].sort(),
    postgres17: [...POSTGRES_17_TESTS].sort()
  };
  const classified = [...groups.canonical, ...groups.stagingProfile, ...groups.postgres17];
  const duplicate = classified.find((file, index) => classified.indexOf(file) !== index);
  if (duplicate) throw new Error(`PostgreSQL test is classified more than once: ${duplicate}`);
  const discoveredSet = new Set(discovered.map(normalizeRepoPath));
  const classifiedSet = new Set(classified);
  const unclassified = [...discoveredSet].filter((file) => !classifiedSet.has(file)).sort();
  const missing = [...classifiedSet].filter((file) => !discoveredSet.has(file)).sort();
  if (unclassified.length || missing.length) {
    throw new Error(`PostgreSQL test inventory drift. Unclassified: ${unclassified.join(", ") || "none"}. Missing: ${missing.join(", ") || "none"}.`);
  }
  return groups;
}

export function validateVitestReport(raw, selectedFiles, exitCode, root = REPO_ROOT) {
  if (!raw || typeof raw !== "object") throw new Error("Vitest JSON is missing or malformed.");
  const keys = ["numTotalTests", "numPassedTests", "numFailedTests", "numPendingTests"];
  for (const key of keys) {
    if (!Number.isInteger(raw[key]) || raw[key] < 0) throw new Error(`Vitest JSON has invalid ${key}.`);
  }
  if (!Array.isArray(raw.testResults)) throw new Error("Vitest JSON has no testResults array.");
  const observed = new Set(raw.testResults.map((row) => normalizeObservedTestPath(row?.name, root)));
  const missing = selectedFiles.filter((file) => !observed.has(normalizeRepoPath(file)));
  if (missing.length > 0) throw new Error(`Vitest JSON is missing selected files: ${missing.join(", ")}`);
  if (exitCode !== 0) throw new Error(`Vitest exited with ${exitCode}.`);
  if (raw.numFailedTests !== 0) throw new Error(`Vitest reported ${raw.numFailedTests} failed tests.`);
  if (raw.numPendingTests !== 0) throw new Error(`Vitest reported ${raw.numPendingTests} skipped or pending tests.`);
  if (raw.numTotalTests === 0 || raw.numPassedTests !== raw.numTotalTests) {
    throw new Error(`Vitest pass count mismatch: ${raw.numPassedTests}/${raw.numTotalTests}.`);
  }
  return {
    total: raw.numTotalTests,
    passed: raw.numPassedTests,
    failed: raw.numFailedTests,
    skipped: raw.numPendingTests,
    files: [...observed].sort()
  };
}

export async function executePhasedLifecycle({
  maxSetupAttempts = MAX_SETUP_ATTEMPTS,
  setupAttempt,
  cleanupRuntime,
  runTests,
  persistEvidence,
  parseEvidence
}) {
  let runtime;
  let lastSetupError;
  for (let attempt = 1; attempt <= maxSetupAttempts; attempt += 1) {
    const outcome = await setupAttempt(attempt);
    if (outcome.status === "ready") {
      runtime = outcome.runtime;
      break;
    }
    lastSetupError = outcome.error;
    if (outcome.runtime) await cleanupRuntime(outcome.runtime, { phase: "setup_failed" });
  }
  if (!runtime) throw lastSetupError ?? new Error("Disposable PostgreSQL preflight failed.");

  let testResult;
  let parsed;
  let evidenceError;
  try {
    testResult = await runTests(runtime);
    await persistEvidence(testResult, runtime);
    try {
      parsed = await parseEvidence(testResult, runtime);
    } catch (error) {
      evidenceError = error;
    }
  } finally {
    await cleanupRuntime(runtime, { phase: "test_completed" });
  }
  if (evidenceError) throw evidenceError;
  return { runtime, testResult, parsed };
}

async function main(argv = process.argv.slice(2)) {
  const cli = parseCliArgs(argv);
  if (cli.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const selectedFiles = await selectTestFiles(cli.files);
  const postgresInventory = validatePostgresInventory(await discoverPostgresTests());
  if (cli.dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: "dry-run",
      selectedFileCount: selectedFiles.length,
      selectedFiles,
      postgresImage: POSTGRES_IMAGE,
      tmpfs: POSTGRES_DATA_TMPFS,
      forbiddenPorts: [...FORBIDDEN_PORTS],
      postgresInventory
    }, null, 2)}\n`);
    return 0;
  }

  const runId = `pg-${new Date().toISOString().replace(/[^0-9]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const evidenceDir = path.join(REPO_ROOT, ".data", "test-runs", "postgres-disposable", runId);
  const vitestJsonPath = path.join(evidenceDir, "vitest.json");
  const exitCodePath = path.join(evidenceDir, "exit-code.txt");
  const receiptPath = path.join(evidenceDir, "receipt.json");
  await fs.mkdir(evidenceDir, { recursive: true });

  const receipt = {
    version: "disposable-postgres-test-receipt-v1",
    runId,
    status: "starting",
    startedAt: new Date().toISOString(),
    image: { tag: POSTGRES_IMAGE, id: null },
    selectedFiles,
    postgresInventory,
    setupAttempts: [],
    evidence: {
      vitestJson: normalizeRepoPath(path.relative(REPO_ROOT, vitestJsonPath)),
      exitCode: normalizeRepoPath(path.relative(REPO_ROOT, exitCodePath))
    },
    cleanup: null,
    result: null
  };
  await writeJsonAtomic(receiptPath, receipt);

  try {
    const dockerVersion = await requireSuccess("docker", ["version", "--format", "{{.Server.Version}}"]);
    const imageInspect = await requireSuccess("docker", ["image", "inspect", POSTGRES_IMAGE]);
    const image = JSON.parse(imageInspect.stdout)[0];
    if (!image?.Id) throw new Error(`Cannot resolve image ID for ${POSTGRES_IMAGE}.`);
    receipt.dockerServerVersion = dockerVersion.stdout.trim();
    receipt.image.id = image.Id;
    receipt.status = "preflight_ready";
    await writeJsonAtomic(receiptPath, receipt);

    const lifecycle = await executePhasedLifecycle({
      setupAttempt: async (attempt) => {
        const setupRecord = { attempt, startedAt: new Date().toISOString(), status: "starting" };
        receipt.setupAttempts.push(setupRecord);
        await writeJsonAtomic(receiptPath, receipt);
        const port = await allocateFreePort();
        const containerName = `${runId}-a${attempt}`;
        setupRecord.port = port;
        setupRecord.containerName = containerName;
        await writeJsonAtomic(receiptPath, receipt);
        let runtime;
        try {
          const launched = await requireSuccess("docker", buildDockerRunArgs({ containerName, port, runId }));
          const containerId = launched.stdout.trim();
          runtime = { attempt, runId, containerId, containerName, port };
          setupRecord.containerId = containerId;
          await writeJsonAtomic(receiptPath, receipt);
          const inspected = await inspectAndValidateRuntime(runtime, image.Id);
          await waitForPostgres(runtime);
          const selected = await requireSuccess("docker", [
            "exec", containerId, "psql", "-U", "postgres", "-d", "postgres",
            "-v", "ON_ERROR_STOP=1", "-tAc", "SELECT 1"
          ]);
          if (selected.stdout.trim() !== "1") throw new Error("Disposable PostgreSQL SELECT 1 returned an unexpected result.");
          setupRecord.status = "ready";
          setupRecord.completedAt = new Date().toISOString();
          setupRecord.mounts = inspected.Mounts;
          setupRecord.tmpfs = inspected.HostConfig.Tmpfs;
          receipt.status = "database_ready";
          await writeJsonAtomic(receiptPath, receipt);
          return { status: "ready", runtime };
        } catch (error) {
          setupRecord.status = "failed";
          setupRecord.completedAt = new Date().toISOString();
          setupRecord.error = errorMessage(error);
          await writeJsonAtomic(receiptPath, receipt);
          return { status: "failed", runtime, error };
        }
      },
      cleanupRuntime: async (runtime, context) => {
        const cleanup = await cleanupExactRuntime(runtime);
        receipt.cleanup = { ...cleanup, context, completedAt: new Date().toISOString() };
        receipt.status = context.phase === "test_completed" ? "runtime_cleaned" : receipt.status;
        await writeJsonAtomic(receiptPath, receipt);
      },
      runTests: async (runtime) => {
        receipt.status = "tests_running";
        receipt.testStartedAt = new Date().toISOString();
        await writeJsonAtomic(receiptPath, receipt);
        const vitestEntry = path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
        const adminUrl = `postgres://postgres:postgres@127.0.0.1:${runtime.port}/postgres`;
        return runProcess(process.execPath, [
          vitestEntry, "run", "--no-file-parallelism", "--reporter=json",
          `--outputFile=${vitestJsonPath}`, ...selectedFiles
        ], { env: { ...process.env, OGC_TEST_DATABASE_ADMIN_URL: adminUrl } });
      },
      persistEvidence: async (testResult) => {
        await fs.writeFile(exitCodePath, `${testResult.exitCode}\n`, "utf8");
        const jsonStat = await fs.stat(vitestJsonPath).catch(() => null);
        receipt.status = "test_evidence_persisted";
        receipt.testCompletedAt = new Date().toISOString();
        receipt.testExitCode = testResult.exitCode;
        receipt.vitestJsonBytes = jsonStat?.size ?? 0;
        await writeJsonAtomic(receiptPath, receipt);
      },
      parseEvidence: async (testResult) => {
        const raw = JSON.parse(await fs.readFile(vitestJsonPath, "utf8"));
        const result = validateVitestReport(raw, selectedFiles, testResult.exitCode);
        receipt.status = "test_evidence_validated";
        receipt.result = result;
        await writeJsonAtomic(receiptPath, receipt);
        return result;
      }
    });

    receipt.status = "passed";
    receipt.completedAt = new Date().toISOString();
    receipt.result = lifecycle.parsed;
    await writeJsonAtomic(receiptPath, receipt);
    process.stdout.write(`${JSON.stringify({ status: receipt.status, runId, receipt: receiptPath, result: receipt.result })}\n`);
    return 0;
  } catch (error) {
    receipt.status = "failed";
    receipt.completedAt = new Date().toISOString();
    receipt.error = errorMessage(error);
    await writeJsonAtomic(receiptPath, receipt).catch(() => undefined);
    process.stderr.write(`${receipt.error}\nEvidence: ${receiptPath}\n`);
    return 1;
  }
}

async function inspectAndValidateRuntime(runtime, expectedImageId) {
  const result = await requireSuccess("docker", ["inspect", runtime.containerId]);
  const inspected = JSON.parse(result.stdout)[0];
  validateDockerRuntimeInspect(inspected, runtime, expectedImageId);
  return inspected;
}

export function validateDockerRuntimeInspect(inspected, runtime, expectedImageId) {
  if (!inspected || inspected.Id !== runtime.containerId) throw new Error("Docker inspect returned the wrong container ID.");
  if (inspected.Name !== `/${runtime.containerName}`) throw new Error("Docker inspect returned the wrong container name.");
  if (inspected.Image !== expectedImageId) throw new Error("Disposable PostgreSQL image identity changed.");
  if (inspected.Config?.Labels?.[RUN_LABEL] !== runtime.runId) throw new Error("Disposable PostgreSQL run label is missing.");
  const binding = inspected.HostConfig?.PortBindings?.["5432/tcp"]?.[0];
  if (binding?.HostIp !== "127.0.0.1" || Number(binding.HostPort) !== runtime.port || FORBIDDEN_PORTS.has(runtime.port)) {
    throw new Error("Disposable PostgreSQL port binding is not isolated.");
  }
  const mounts = Array.isArray(inspected.Mounts) ? inspected.Mounts : [];
  if (mounts.some((mount) => mount.Type === "volume")) throw new Error("Disposable PostgreSQL unexpectedly created a Docker volume.");
  const tmpfsOptions = inspected.HostConfig?.Tmpfs?.["/var/lib/postgresql/data"];
  if (typeof tmpfsOptions !== "string" || !tmpfsOptions.split(",").includes("rw") ||
      !tmpfsOptions.split(",").some((option) => option === "size=1g" || option === "size=1073741824")) {
    throw new Error("Disposable PostgreSQL data directory is not mounted as tmpfs.");
  }
  return inspected;
}

async function waitForPostgres(runtime) {
  let lastError = "PostgreSQL did not become ready.";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = await runProcess("docker", ["exec", runtime.containerId, "pg_isready", "-U", "postgres", "-d", "postgres"]);
    if (probe.exitCode === 0) return;
    lastError = probe.stderr.trim() || probe.stdout.trim() || lastError;
    await delay(500);
  }
  throw new Error(lastError);
}

async function cleanupExactRuntime(runtime) {
  const inspected = await runProcess("docker", ["inspect", runtime.containerId]);
  if (inspected.exitCode === 0) {
    const row = JSON.parse(inspected.stdout)[0];
    if (row?.Name !== `/${runtime.containerName}` || row?.Config?.Labels?.[RUN_LABEL] !== runtime.runId) {
      throw new Error("Refusing to clean a container with mismatched identity.");
    }
    await requireSuccess("docker", ["rm", "-f", runtime.containerId]);
  }
  const remaining = await requireSuccess("docker", ["ps", "-a", "--filter", `label=${RUN_LABEL}=${runtime.runId}`, "--format", "{{.ID}}"]);
  if (remaining.stdout.trim()) throw new Error(`Run-owned container remains after cleanup: ${remaining.stdout.trim()}`);
  return { containerId: runtime.containerId, containerName: runtime.containerName, removed: true };
}

async function walk(directory, found) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, found);
    else if (entry.isFile()) found.push(absolute);
  }
}

function normalizeObservedTestPath(value, root) {
  if (typeof value !== "string" || !value) return "";
  const absolute = path.isAbsolute(value) ? value : path.resolve(root, value);
  return normalizeRepoPath(path.relative(root, absolute));
}

function normalizeRepoPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function requireSuccess(command, args, options) {
  const result = await runProcess(command, args, options);
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result;
}

async function runProcess(command, args, { cwd = REPO_ROOT, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ exitCode: code ?? 1, signal, stdout, stderr }));
  });
}

async function writeJsonAtomic(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = await main();
}

export { main };
