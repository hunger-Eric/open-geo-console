import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditReportV4Registry,
  parseReportV4Registry,
  renderReportV4CoverageMatrix,
  type ReportV4RequirementRegistry
} from "./conformance";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function registry(status: "planned" | "implemented" | "verified" = "planned"): ReportV4RequirementRegistry {
  return {
    contract: "combined_geo_report_v4",
    specPath: "docs/spec.md",
    matrixPath: "docs/matrix.md",
    requirements: [{
      id: "GEO-V4-TEST-01",
      specSection: "1",
      title: "A testable product boundary",
      status,
      implementationPaths: ["src/implementation.ts"],
      testPaths: ["src/implementation.test.ts"],
      verificationCommands: ["npm test -- src/implementation.test.ts"],
      runtimeEvidencePaths: ["docs/evidence.json"]
    }]
  };
}

function workspace(input: ReportV4RequirementRegistry, options: {
  implementation?: boolean;
  testMarker?: boolean;
  evidence?: boolean;
  staleMatrix?: boolean;
} = {}): string {
  const root = mkdtempSync(join(tmpdir(), "ogc-v4-conformance-"));
  roots.push(root);
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, input.specPath), "# Spec\n", "utf8");
  writeFileSync(
    join(root, input.matrixPath),
    options.staleMatrix ? "stale\n" : renderReportV4CoverageMatrix(input),
    "utf8"
  );
  if (options.implementation) writeFileSync(join(root, "src/implementation.ts"), "export {};\n", "utf8");
  if (options.testMarker) {
    writeFileSync(join(root, "src/implementation.test.ts"), "// @requirement GEO-V4-TEST-01\n", "utf8");
  }
  if (options.evidence) {
    writeFileSync(join(root, "docs/evidence.json"), '{"requirementIds":["GEO-V4-TEST-01"]}\n', "utf8");
  }
  return root;
}

describe("report V4 conformance registry", () => {
  it("loads the committed registry with every approved requirement ID", () => {
    const committed = parseReportV4Registry(JSON.parse(readFileSync(
      join(process.cwd(), "config/report-contracts/combined-geo-report-v4.requirements.json"),
      "utf8"
    )));
    expect(committed.requirements).toHaveLength(20);
    expect(new Set(committed.requirements.map(({ id }) => id)).size).toBe(20);
    expect(committed.requirements.map(({ id }) => id)).toContain("GEO-V4-ACCEPT-01");
  });

  it("parses the exact V4 registry contract", () => {
    expect(parseReportV4Registry(registry())).toEqual(registry());
  });

  it("rejects duplicate IDs, unsupported status and unsafe paths", () => {
    const duplicateIds = registry();
    duplicateIds.requirements.push({ ...duplicateIds.requirements[0]! });
    expect(() => parseReportV4Registry(duplicateIds)).toThrow(/duplicate requirement id/i);

    const badStatus = structuredClone(registry()) as unknown as { requirements: Array<{ status: string }> };
    badStatus.requirements[0]!.status = "done";
    expect(() => parseReportV4Registry(badStatus)).toThrow(/unsupported requirement status/i);

    const unsafePath = registry();
    unsafePath.requirements[0]!.implementationPaths = ["../outside.ts"];
    expect(() => parseReportV4Registry(unsafePath)).toThrow(/relative workspace path/i);
  });

  it("passes planned structural traceability without running verification commands", async () => {
    const input = registry();
    const root = workspace(input);
    const commands: string[] = [];
    const result = await auditReportV4Registry(input, root, "traceability", async (command) => {
      commands.push(command);
      return 0;
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Traceability passed");
    expect(result.output).toContain("GEO-V4-TEST-01 status=planned");
    expect(commands).toEqual([]);
  });

  it("fails final acceptance while any requirement is not verified", async () => {
    const input = registry("planned");
    const root = workspace(input);
    const commands: string[] = [];
    const result = await auditReportV4Registry(input, root, "acceptance", async (command) => {
      commands.push(command);
      return 0;
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("GEO-V4-TEST-01 is planned, not verified");
    expect(commands).toEqual([]);
  });

  it("passes acceptance only with files, marker, evidence and a successful command", async () => {
    const input = registry("verified");
    const root = workspace(input, { implementation: true, testMarker: true, evidence: true });
    const commands: string[] = [];
    const result = await auditReportV4Registry(input, root, "acceptance", async (command) => {
      commands.push(command);
      return 0;
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Acceptance passed");
    expect(commands).toEqual(["npm test -- src/implementation.test.ts"]);
  });

  it("reports missing files, missing markers, stale matrix and failing commands", async () => {
    const input = registry("verified");
    const missing = await auditReportV4Registry(input, workspace(input), "acceptance", async () => 0);
    expect(missing.output).toContain("missing implementation path");
    expect(missing.output).toContain("missing test path");
    expect(missing.output).toContain("missing runtime evidence path");

    const noMarker = await auditReportV4Registry(
      input,
      workspace(input, { implementation: true, evidence: true }),
      "acceptance",
      async () => 0
    );
    expect(noMarker.output).toContain("missing test path");

    const stale = await auditReportV4Registry(
      input,
      workspace(input, { implementation: true, testMarker: true, evidence: true, staleMatrix: true }),
      "acceptance",
      async () => 0
    );
    expect(stale.output).toContain("coverage matrix is stale");

    const root = workspace(input, { implementation: true, testMarker: true, evidence: true });
    writeFileSync(join(root, "src/implementation.test.ts"), "// no marker\n", "utf8");
    const marker = await auditReportV4Registry(input, root, "acceptance", async () => 0);
    expect(marker.output).toContain("missing @requirement GEO-V4-TEST-01");

    writeFileSync(join(root, "src/implementation.test.ts"), "// @requirement GEO-V4-TEST-01\n", "utf8");
    writeFileSync(join(root, "docs/evidence.json"), "{}\n", "utf8");
    const evidence = await auditReportV4Registry(input, root, "acceptance", async () => 0);
    expect(evidence.output).toContain("does not bind GEO-V4-TEST-01");

    writeFileSync(join(root, "docs/evidence.json"), '{"requirementIds":["GEO-V4-TEST-01"]}\n', "utf8");
    const command = await auditReportV4Registry(input, root, "acceptance", async () => 7);
    expect(command.output).toContain("verification command failed (7)");
  });
});
