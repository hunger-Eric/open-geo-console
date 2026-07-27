import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  auditReportV4Registry,
  parseReportV4Registry,
  renderReportV4CoverageMatrix,
  type ReportV4AuditMode
} from "../report-v4/conformance";

export interface ReportV4AuditArgs {
  mode: ReportV4AuditMode;
  writeMatrix: boolean;
}

export function parseReportV4AuditArgs(argv: string[]): ReportV4AuditArgs {
  const [mode, ...rest] = argv;
  if (mode !== "traceability" && mode !== "acceptance") {
    throw new TypeError("The first argument must be traceability or acceptance.");
  }
  const unknown = rest.filter((argument) => argument !== "--write-matrix");
  if (unknown.length > 0) throw new TypeError(`Unknown argument: ${unknown[0]}.`);
  if (rest.filter((argument) => argument === "--write-matrix").length > 1) {
    throw new TypeError("Unknown argument: duplicate --write-matrix.");
  }
  const writeMatrix = rest.includes("--write-matrix");
  if (writeMatrix && mode !== "traceability") {
    throw new TypeError("--write-matrix is available in traceability only.");
  }
  return { mode, writeMatrix };
}

export function reportV4AcceptanceCommandEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const sanitized = { ...environment };
  for (const name of Object.keys(sanitized)) {
    const normalizedName = name.toUpperCase();
    if (normalizedName === "OGC_REPORT_V4_STAGING_EVIDENCE"
      || normalizedName.startsWith("OGC_REPORT_V4_STAGING_EVIDENCE_")) {
      delete sanitized[name];
    }
  }
  return sanitized;
}

export async function runReportV4Conformance(argv: string[]): Promise<number> {
  const args = parseReportV4AuditArgs(argv);
  const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const registryPath = resolve(workspaceRoot, "config/report-contracts/combined-geo-report-v4.requirements.json");
  const registry = parseReportV4Registry(JSON.parse(readFileSync(registryPath, "utf8")));
  if (args.writeMatrix) {
    writeFileSync(resolve(workspaceRoot, registry.matrixPath), renderReportV4CoverageMatrix(registry), "utf8");
  }
  const result = await auditReportV4Registry(registry, workspaceRoot, args.mode, (command) => {
    const child = spawnSync(command, {
      cwd: workspaceRoot,
      shell: true,
      stdio: "inherit",
      env: args.mode === "acceptance" ? reportV4AcceptanceCommandEnvironment() : process.env
    });
    return child.status ?? 1;
  });
  (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runReportV4Conformance(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
