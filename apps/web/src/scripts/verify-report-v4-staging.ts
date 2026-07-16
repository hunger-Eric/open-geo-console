import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseReportV4Registry } from "../report-v4/conformance";
import {
  verifyReportV4StagingEvidence,
  type ReportV4StagingVerificationEvidence
} from "../report-v4/protected-staging-evidence";

export {
  verifyReportV4StagingEvidence,
  type ReportV4StagingVerificationEvidence
} from "../report-v4/protected-staging-evidence";

const DEFAULT_EVIDENCE_PATH = "docs/operations/evidence/report-v4-protected-staging-acceptance.json";
const REGISTRY_PATH = "config/report-contracts/combined-geo-report-v4.requirements.json";

export interface ReportV4StagingVerificationArgs {
  readonly evidencePath: string;
}

export interface ReportV4StagingVerificationResult {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

export interface ReportV4StagingVerificationDependencies {
  readonly readText?: (absolutePath: string) => string;
  readonly isFile?: (absolutePath: string) => boolean;
  readonly workspaceRoot?: string;
}

export function parseReportV4StagingVerificationArgs(argv: readonly string[]): ReportV4StagingVerificationArgs {
  if (argv.length === 0) return { evidencePath: DEFAULT_EVIDENCE_PATH };
  if (argv.length !== 2 || argv[0] !== "--evidence") {
    throw new TypeError("Usage: report:v4:staging:verify [--evidence <workspace-relative-json-path>].");
  }
  return { evidencePath: workspacePath(argv[1], "--evidence") };
}

export function runReportV4StagingVerification(
  argv: readonly string[],
  overrides: ReportV4StagingVerificationDependencies = {}
): ReportV4StagingVerificationResult {
  const workspaceRoot = overrides.workspaceRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const readText = overrides.readText ?? ((path: string) => readFileSync(path, "utf8"));
  const isFile = overrides.isFile ?? ((path: string) => statSync(path).isFile());
  try {
    const args = parseReportV4StagingVerificationArgs(argv);
    const evidencePath = resolve(workspaceRoot, args.evidencePath);
    const registry = parseReportV4Registry(JSON.parse(readText(resolve(workspaceRoot, REGISTRY_PATH))) as unknown);
    const evidence: ReportV4StagingVerificationEvidence = verifyReportV4StagingEvidence(
      JSON.parse(readText(evidencePath)) as unknown,
      registry
    );
    for (const [viewport, ref] of [
      ["desktop", evidence.browser.authorizedDesktop.screenshotEvidenceRef],
      ["narrow", evidence.browser.authorizedNarrow.screenshotEvidenceRef]
    ] as const) {
      if (!isFile(resolve(workspaceRoot, ref))) {
        throw new TypeError(`Missing ${viewport} screenshot evidence file ${ref}.`);
      }
    }
    return {
      exitCode: 0,
      output: `Report V4 protected-Staging verification passed for ${evidence.identities.reportId}; ${evidence.requirementResults.length} requirements proven.\n`
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `Report V4 protected-Staging verification failed: ${error instanceof Error ? error.message : String(error)}\n`
    };
  }
}

function workspacePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new TypeError(`${label} must be a nonblank trimmed string.`);
  }
  const parsed = value.replaceAll("\\", "/");
  if (isAbsolute(parsed) || parsed.startsWith("/") || parsed.split("/").includes("..")) {
    throw new TypeError(`${label} must be a safe workspace-relative path.`);
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runReportV4StagingVerification(process.argv.slice(2));
  (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
  process.exitCode = result.exitCode;
}
