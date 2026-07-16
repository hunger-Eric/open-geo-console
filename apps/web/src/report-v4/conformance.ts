import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export type ReportV4RequirementStatus = "planned" | "implemented" | "verified";
export type ReportV4AuditMode = "traceability" | "acceptance";

export interface ReportV4Requirement {
  id: string;
  specSection: string;
  title: string;
  status: ReportV4RequirementStatus;
  implementationPaths: string[];
  testPaths: string[];
  verificationCommands: string[];
  runtimeEvidencePaths: string[];
}

export interface ReportV4RequirementRegistry {
  contract: "combined_geo_report_v4";
  specPath: string;
  matrixPath: string;
  requirements: ReportV4Requirement[];
}

export interface ConformanceResult {
  exitCode: 0 | 1;
  output: string;
}

export type VerificationCommandRunner = (command: string) => Promise<number> | number;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonblank(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${label} must be a nonblank trimmed string.`);
  }
  return value;
}

function workspacePath(value: unknown, label: string): string {
  const parsed = nonblank(value, label);
  const normalized = parsed.replaceAll("\\", "/");
  if (isAbsolute(parsed) || normalized.split("/").includes("..") || normalized.startsWith("/")) {
    throw new TypeError(`${label} must be a safe relative workspace path.`);
  }
  return normalized;
}

function nonemptyStrings(
  value: unknown,
  label: string,
  itemParser: (item: unknown, itemLabel: string) => string = nonblank
): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a nonempty array.`);
  return value.map((item, index) => itemParser(item, `${label}[${index}]`));
}

export function parseReportV4Registry(value: unknown): ReportV4RequirementRegistry {
  const input = record(value, "report V4 registry");
  if (input.contract !== "combined_geo_report_v4") {
    throw new TypeError("Unsupported report V4 contract; expected combined_geo_report_v4.");
  }
  const requirementsInput = input.requirements;
  if (!Array.isArray(requirementsInput) || requirementsInput.length === 0) {
    throw new TypeError("requirements must be a nonempty array.");
  }
  const ids = new Set<string>();
  const requirements = requirementsInput.map((value, index): ReportV4Requirement => {
    const item = record(value, `requirements[${index}]`);
    const id = nonblank(item.id, `requirements[${index}].id`);
    if (!/^GEO-V4-[A-Z]+-[0-9]{2}$/.test(id)) {
      throw new TypeError(`${id} is not a valid report V4 requirement ID.`);
    }
    if (ids.has(id)) throw new TypeError(`Duplicate requirement ID: ${id}.`);
    ids.add(id);
    if (item.status !== "planned" && item.status !== "implemented" && item.status !== "verified") {
      throw new TypeError(`Unsupported requirement status for ${id}.`);
    }
    return {
      id,
      specSection: nonblank(item.specSection, `${id}.specSection`),
      title: nonblank(item.title, `${id}.title`),
      status: item.status,
      implementationPaths: nonemptyStrings(item.implementationPaths, `${id}.implementationPaths`, workspacePath),
      testPaths: nonemptyStrings(item.testPaths, `${id}.testPaths`, workspacePath),
      verificationCommands: nonemptyStrings(item.verificationCommands, `${id}.verificationCommands`),
      runtimeEvidencePaths: nonemptyStrings(item.runtimeEvidencePaths, `${id}.runtimeEvidencePaths`, workspacePath)
    };
  });
  return {
    contract: "combined_geo_report_v4",
    specPath: workspacePath(input.specPath, "specPath"),
    matrixPath: workspacePath(input.matrixPath, "matrixPath"),
    requirements
  };
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function codeList(values: string[]): string {
  return values.map((value) => `\`${cell(value)}\``).join("<br>");
}

export function renderReportV4CoverageMatrix(registry: ReportV4RequirementRegistry): string {
  const lines = [
    "# Report V4 Coverage Matrix",
    "",
    `Contract: \`${registry.contract}\``,
    "",
    `Specification: \`${registry.specPath}\``,
    "",
    "| ID | Spec | Requirement | Status | Implementation | Tests | Commands | Runtime evidence |",
    "|---|---|---|---|---|---|---|---|"
  ];
  for (const requirement of registry.requirements) {
    lines.push(
      `| \`${requirement.id}\` | ${cell(requirement.specSection)} | ${cell(requirement.title)} | \`${requirement.status}\` | ${codeList(requirement.implementationPaths)} | ${codeList(requirement.testPaths)} | ${codeList(requirement.verificationCommands)} | ${codeList(requirement.runtimeEvidencePaths)} |`
    );
  }
  lines.push(
    "",
    "This file is generated from `config/report-contracts/combined-geo-report-v4.requirements.json`. Do not edit it independently.",
    ""
  );
  return lines.join("\n");
}

function missingPathFailures(
  requirement: ReportV4Requirement,
  workspaceRoot: string,
  paths: string[],
  kind: "implementation" | "test" | "runtime evidence"
): string[] {
  return paths
    .filter((path) => {
      const absolutePath = resolve(workspaceRoot, path);
      return !existsSync(absolutePath) || !statSync(absolutePath).isFile();
    })
    .map((path) => `${requirement.id}: missing ${kind} path ${path}`);
}

export async function auditReportV4Registry(
  registry: ReportV4RequirementRegistry,
  workspaceRoot: string,
  mode: ReportV4AuditMode,
  commandRunner: VerificationCommandRunner
): Promise<ConformanceResult> {
  const failures: string[] = [];
  const specPath = resolve(workspaceRoot, registry.specPath);
  const matrixPath = resolve(workspaceRoot, registry.matrixPath);
  if (!existsSync(specPath) || !statSync(specPath).isFile()) failures.push(`missing specification path ${registry.specPath}`);
  if (!existsSync(matrixPath) || !statSync(matrixPath).isFile()) {
    failures.push(`missing coverage matrix path ${registry.matrixPath}`);
  } else if (readFileSync(matrixPath, "utf8") !== renderReportV4CoverageMatrix(registry)) {
    failures.push("coverage matrix is stale; run npm run report:v4:matrix");
  }

  if (mode === "acceptance") {
    for (const requirement of registry.requirements) {
      if (requirement.status !== "verified") {
        failures.push(`${requirement.id} is ${requirement.status}, not verified`);
        continue;
      }
      failures.push(...missingPathFailures(requirement, workspaceRoot, requirement.implementationPaths, "implementation"));
      failures.push(...missingPathFailures(requirement, workspaceRoot, requirement.testPaths, "test"));
      failures.push(...missingPathFailures(requirement, workspaceRoot, requirement.runtimeEvidencePaths, "runtime evidence"));
      for (const testPath of requirement.testPaths) {
        const absoluteTestPath = resolve(workspaceRoot, testPath);
        if (existsSync(absoluteTestPath)) {
          const marker = `@requirement ${requirement.id}`;
          if (!readFileSync(absoluteTestPath, "utf8").includes(marker)) {
            failures.push(`${requirement.id}: ${testPath} is missing ${marker}`);
          }
        }
      }
      for (const evidencePath of requirement.runtimeEvidencePaths) {
        const absoluteEvidencePath = resolve(workspaceRoot, evidencePath);
        if (existsSync(absoluteEvidencePath) && !readFileSync(absoluteEvidencePath, "utf8").includes(requirement.id)) {
          failures.push(`${requirement.id}: ${evidencePath} does not bind ${requirement.id}`);
        }
      }
    }

    if (failures.length === 0) {
      const commands = [...new Set(registry.requirements.flatMap(({ verificationCommands }) => verificationCommands))];
      for (const command of commands) {
        let exitCode: number;
        try {
          exitCode = await commandRunner(command);
        } catch (error) {
          failures.push(`verification command threw: ${command}: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        if (exitCode !== 0) failures.push(`verification command failed (${exitCode}): ${command}`);
      }
    }
  }

  const label = mode === "traceability" ? "Traceability" : "Acceptance";
  if (failures.length > 0) {
    return { exitCode: 1, output: `${label} failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n` };
  }
  const statuses = registry.requirements.map(({ id, status }) => `${id} status=${status}`).join("\n");
  return {
    exitCode: 0,
    output: `${label} passed: ${registry.requirements.length} requirement(s) ${mode === "traceability" ? "structurally registered" : "verified"}.\n${statuses}\n`
  };
}
