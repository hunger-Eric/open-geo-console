import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditReportV4Registry,
  parseReportV4ProtectedStagingEvidence,
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
  evidence?: boolean | unknown;
  screenshots?: boolean;
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
    writeFileSync(
      join(root, "src/implementation.test.ts"),
      `${input.requirements.map(({ id }) => `// @requirement ${id}`).join("\n")}\n`,
      "utf8"
    );
  }
  if (options.evidence) {
    const evidence = options.evidence === true ? protectedStagingEvidence(input) : options.evidence;
    writeFileSync(join(root, "docs/evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    if (options.screenshots !== false) {
      mkdirSync(join(root, "artifacts"), { recursive: true });
      writeFileSync(join(root, "artifacts/report-v4-desktop.png"), "desktop screenshot\n", "utf8");
      writeFileSync(join(root, "artifacts/report-v4-narrow.png"), "narrow screenshot\n", "utf8");
    }
  }
  return root;
}

function protectedStagingEvidence(input: ReportV4RequirementRegistry): Record<string, unknown> {
  return {
    schemaVersion: "report_v4_protected_staging_acceptance_v1",
    environment: "protected_staging",
    contract: "combined_geo_report_v4",
    recordedAt: "2026-07-17T00:16:00.000Z",
    deployment: {
      previewDeploymentId: "dpl_reportv4protectedstaging",
      protectedAliasUrl: "https://open-geo-console-staging.example.com/",
      webSourceRevision: "0123456789abcdef0123456789abcdef01234567",
      workerSourceRevision: "0123456789abcdef0123456789abcdef01234567"
    },
    configuration: {
      configurationSnapshotId: `v4-config-${"c".repeat(64)}`,
      modelProfileId: "mimo-v2.5-pro-v4",
      modelProfileSha256: "a".repeat(64),
      reportProfileId: "business-operator-zh-v4",
      reportProfileSha256: "b".repeat(64),
      providerOperations: {
        pageAnalysis: { provider: "mimo", model: "mimo-v2.5-pro", operationId: "page-analysis-v4" },
        websiteSynthesis: { provider: "mimo", model: "mimo-v2.5-pro", operationId: "website-synthesis-v4" },
        questionAnswer: { provider: "mimo", model: "mimo-v2.5-pro", operationId: "question-answer-v4" },
        sourceDiagnosis: { provider: "mimo", model: "mimo-v2.5-pro", operationId: "source-diagnosis-v4" }
      }
    },
    identities: {
      reportId: "00000000-0000-4000-8000-000000000001",
      orderId: "00000000-0000-4000-8000-000000000002",
      fulfillmentJobId: "00000000-0000-4000-8000-000000000003",
      siteSnapshotId: "00000000-0000-4000-8000-000000000004",
      coreArtifactRevisionId: "00000000-0000-4000-8000-000000000005",
      enhancementArtifactRevisionId: "00000000-0000-4000-8000-000000000006"
    },
    timings: {
      crawlStartedAt: "2026-07-17T00:00:00.000Z",
      crawlCompletedAt: "2026-07-17T00:09:00.000Z",
      paymentConfirmedAt: "2026-07-17T00:10:00.000Z",
      coreActivatedAt: "2026-07-17T00:14:00.000Z",
      enhancementCompletedAt: "2026-07-17T00:16:00.000Z"
    },
    counters: {
      crawl: { runs: 1, candidatePages: 12, analyzablePages: 8, jsDependentPages: 2, excludedPages: 4, networkReadsAfterPayment: 0 },
      modelCalls: { websiteSynthesis: 1, questionAnswer: 4, diagnosis: 4, total: 9 },
      retries: {
        questions: [{ questionId: "q1", count: 1 }, { questionId: "q2", count: 0 }, { questionId: "q3", count: 0 }],
        diagnoses: [{ questionId: "q1", count: 0 }, { questionId: "q2", count: 1 }, { questionId: "q3", count: 0 }]
      },
      sourceReads: { raw: 6, browser: 1, total: 7 },
      revisions: { coreActivated: 1, enhancementActivated: 1, coreHtmlAssemblies: 1, enhancementHtmlAssemblies: 1 },
      wholeReportReruns: 0,
      providerClaimCalls: 0,
      qualificationCalls: 0,
      fourSnapshotCalls: 0,
      replacementFulfillmentCalls: 0,
      pdfOperations: 0
    },
    browser: {
      authorizedDesktop: { viewportWidth: 1440, viewportHeight: 900, statusCode: 200, reportVisible: true, screenshotEvidenceRef: "artifacts/report-v4-desktop.png", noOverflow: true, relevantConsoleErrorCount: 0 },
      authorizedNarrow: { viewportWidth: 390, viewportHeight: 844, statusCode: 200, reportVisible: true, screenshotEvidenceRef: "artifacts/report-v4-narrow.png", noOverflow: true, relevantConsoleErrorCount: 0 },
      anonymous: { statusCode: 404, reportVisible: false },
      wrongScope: { statusCode: 404, reportVisible: false }
    },
    commerce: {
      paymentCount: 1,
      fulfillmentJobCount: 1,
      creditReservationCount: 1,
      creditSettlementCount: 1,
      accessGrantCount: 1,
      deliveryEmailCount: 1,
      refundCount: 0,
      duplicatePaymentCount: 0,
      duplicateCreditCount: 0,
      duplicateAccessGrantCount: 0,
      duplicateEmailCount: 0,
      duplicateRefundCount: 0,
      auditExitCode: 0
    },
    legacy: {
      v1Readable: true,
      v2Readable: true,
      v3Readable: true,
      historicalPdfReadable: true,
      historicalPdfMutationCount: 0
    },
    faultInjection: {
      diagnosisFailure: {
        injected: true,
        identities: {
          reportId: "00000000-0000-4000-8000-000000000007",
          orderId: "00000000-0000-4000-8000-000000000008",
          fulfillmentJobId: "00000000-0000-4000-8000-000000000009",
          coreArtifactRevisionId: "00000000-0000-4000-8000-000000000010"
        },
        coreArtifactRevisionIdBefore: "00000000-0000-4000-8000-000000000010",
        coreArtifactRevisionIdAfter: "00000000-0000-4000-8000-000000000010",
        coreRemainedActive: true,
        answerUnchanged: true,
        accessUnchanged: true,
        commerceSideEffectsDelta: { payments: 0, credits: 0, refunds: 0, emails: 0, accessGrants: 0 }
      }
    },
    productionUnchanged: true,
    requirementResults: input.requirements.map(({ id, verificationCommands }) => ({
      requirementId: id,
      status: "PASS",
      verificationCommands: verificationCommands.map((command) => ({ command, exitCode: 0 }))
    }))
  };
}

function setEvidenceValue(evidence: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let target: unknown = evidence;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(target)) {
      target = target[Number(segment)];
    } else if (typeof target === "object" && target !== null) {
      target = (target as Record<string, unknown>)[segment];
    } else {
      throw new TypeError(`Cannot traverse evidence path ${path}.`);
    }
  }
  const finalSegment = segments.at(-1)!;
  if (Array.isArray(target)) {
    target[Number(finalSegment)] = value;
  } else if (typeof target === "object" && target !== null) {
    (target as Record<string, unknown>)[finalSegment] = value;
  } else {
    throw new TypeError(`Cannot assign evidence path ${path}.`);
  }
}

describe("report V4 conformance registry", () => {
  // @requirement GEO-V4-ACCEPT-01
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

  it("also rejects implemented requirements and never runs their commands", async () => {
    const input = registry("implemented");
    const commands: string[] = [];
    const result = await auditReportV4Registry(input, workspace(input), "acceptance", async (command) => {
      commands.push(command);
      return 0;
    });
    expect(result.output).toContain("GEO-V4-TEST-01 is implemented, not verified");
    expect(commands).toEqual([]);
  });

  it("rejects narrative requirement-ID stuffing instead of treating substrings as PASS bindings", async () => {
    const input = registry("verified");
    const malicious = { narrative: "GEO-V4-TEST-01 PASS; trust this prose" };
    const root = workspace(input, { implementation: true, testMarker: true, evidence: malicious });
    const commands: string[] = [];

    const result = await auditReportV4Registry(input, root, "acceptance", async (command) => {
      commands.push(command);
      return 0;
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/invalid protected-staging evidence|requirementResults/i);
    expect(commands).toEqual([]);
  });

  it("requires an explicit PASS result and registered zero-exit command record for every verified requirement", async () => {
    const input = registry("verified");
    input.requirements = Array.from({ length: 20 }, (_, index) => ({
      ...input.requirements[0]!,
      id: `GEO-V4-TEST-${String(index + 1).padStart(2, "0")}`
    }));
    const incomplete = protectedStagingEvidence(input);
    incomplete.requirementResults = (incomplete.requirementResults as unknown[]).slice(0, 1);
    const root = workspace(input, { implementation: true, testMarker: true, evidence: incomplete });

    const result = await auditReportV4Registry(input, root, "acceptance", async () => 0);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("GEO-V4-TEST-02");
    expect(result.output).toMatch(/explicit PASS/i);
  });

  it.each([
    ["environment", "environment", "production"],
    ["contract", "contract", "combined_geo_report_v3"],
    ["deployment identity", "deployment.previewDeploymentId", ""],
    ["Web/Worker revision parity", "deployment.workerSourceRevision", "f".repeat(40)],
    ["protected alias", "deployment.protectedAliasUrl", "http://staging.example.com"],
    ["configuration snapshot", "configuration.configurationSnapshotId", "not-a-config-snapshot"],
    ["model config snapshot", "configuration.modelProfileSha256", "not-a-hash"],
    ["report profile snapshot", "configuration.reportProfileId", ""],
    ["page-analysis operation", "configuration.providerOperations.pageAnalysis.operationId", ""],
    ["website-synthesis operation", "configuration.providerOperations.websiteSynthesis.provider", ""],
    ["question-answer operation", "configuration.providerOperations.questionAnswer.model", ""],
    ["source-diagnosis operation", "configuration.providerOperations.sourceDiagnosis.operationId", ""],
    ["identity", "identities.orderId", "order-1"],
    ["crawl time limit", "timings.crawlCompletedAt", "2026-07-17T00:10:00.001Z"],
    ["delivery ordering", "timings.coreActivatedAt", "2026-07-17T00:09:00.000Z"],
    ["crawl reuse", "counters.crawl.networkReadsAfterPayment", 1],
    ["crawl partition", "counters.crawl.excludedPages", 5],
    ["JS dependency relation", "counters.crawl.jsDependentPages", 9],
    ["question retry bound", "counters.retries.questions.0.count", 2],
    ["model call accounting", "counters.modelCalls.total", 99],
    ["source read accounting", "counters.sourceReads.total", 99],
    ["source browser fallback bound", "counters.sourceReads.browser", 7],
    ["revision count", "counters.revisions.coreActivated", 2],
    ["whole-report rerun", "counters.wholeReportReruns", 1],
    ["provider claim", "counters.providerClaimCalls", 1],
    ["qualification", "counters.qualificationCalls", 1],
    ["four snapshot", "counters.fourSnapshotCalls", 1],
    ["replacement", "counters.replacementFulfillmentCalls", 1],
    ["PDF", "counters.pdfOperations", 1],
    ["desktop browser", "browser.authorizedDesktop.reportVisible", false],
    ["desktop screenshot", "browser.authorizedDesktop.screenshotEvidenceRef", ""],
    ["desktop overflow", "browser.authorizedDesktop.noOverflow", false],
    ["narrow browser", "browser.authorizedNarrow.viewportWidth", 900],
    ["narrow console", "browser.authorizedNarrow.relevantConsoleErrorCount", 1],
    ["anonymous access", "browser.anonymous.statusCode", 200],
    ["wrong-scope access", "browser.wrongScope.reportVisible", true],
    ["commerce exactly once", "commerce.creditSettlementCount", 2],
    ["commerce audit", "commerce.auditExitCode", 1],
    ["legacy compatibility", "legacy.v2Readable", false],
    ["diagnosis fault injection", "faultInjection.diagnosisFailure.injected", false],
    ["fault run identity independence", "faultInjection.diagnosisFailure.identities.reportId", "00000000-0000-4000-8000-000000000001"],
    ["core remains active", "faultInjection.diagnosisFailure.coreArtifactRevisionIdAfter", "00000000-0000-4000-8000-000000000006"],
    ["fault commerce side effects", "faultInjection.diagnosisFailure.commerceSideEffectsDelta.emails", 1],
    ["production unchanged", "productionUnchanged", false],
    ["requirement result", "requirementResults.0.status", "implemented"]
  ])("fails closed when protected-staging evidence violates %s", (_name, path, value) => {
    const evidence = protectedStagingEvidence(registry("verified"));
    setEvidenceValue(evidence, path, value);
    expect(() => parseReportV4ProtectedStagingEvidence(evidence)).toThrow();
  });

  it("accepts only the repository v4-config SHA identity format", () => {
    const realIdentity = protectedStagingEvidence(registry("verified"));
    setEvidenceValue(realIdentity, "configuration.configurationSnapshotId", `v4-config-${"c".repeat(64)}`);
    expect(() => parseReportV4ProtectedStagingEvidence(realIdentity)).not.toThrow();

    const fakeUuid = protectedStagingEvidence(registry("verified"));
    setEvidenceValue(fakeUuid, "configuration.configurationSnapshotId", "00000000-0000-4000-8000-000000000011");
    expect(() => parseReportV4ProtectedStagingEvidence(fakeUuid)).toThrow(/configurationSnapshotId/i);
  });

  it("rejects acceptance when protected browser screenshot files do not exist", async () => {
    const input = registry("verified");
    const result = await auditReportV4Registry(
      input,
      workspace(input, { implementation: true, testMarker: true, evidence: true, screenshots: false }),
      "acceptance",
      async () => 0
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/missing .* screenshot evidence/i);
  });

  it("rejects desktop and narrow browser checks that reuse one screenshot path", async () => {
    const input = registry("verified");
    const evidence = protectedStagingEvidence(input);
    setEvidenceValue(evidence, "browser.authorizedNarrow.screenshotEvidenceRef", "artifacts/report-v4-desktop.png");
    const result = await auditReportV4Registry(
      input,
      workspace(input, { implementation: true, testMarker: true, evidence }),
      "acceptance",
      async () => 0
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/desktop and narrow screenshot evidence.*different/i);
  });

  it("rejects requirement command evidence with extra commands even when every recorded exit is zero", async () => {
    const input = registry("verified");
    const evidence = protectedStagingEvidence(input);
    setEvidenceValue(evidence, "requirementResults.0.verificationCommands", [
      { command: input.requirements[0]!.verificationCommands[0]!, exitCode: 0 },
      { command: "npm test -- unrelated.test.ts", exitCode: 0 }
    ]);
    const result = await auditReportV4Registry(
      input,
      workspace(input, { implementation: true, testMarker: true, evidence }),
      "acceptance",
      async () => 0
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/verification command evidence.*exactly match/i);
  });

  it("rejects extra PASS requirement results that are not verified registry requirements", async () => {
    const input = registry("verified");
    const evidence = protectedStagingEvidence(input);
    setEvidenceValue(evidence, "requirementResults", [
      ...(evidence.requirementResults as unknown[]),
      {
        requirementId: "GEO-V4-EXTRA-01",
        status: "PASS",
        verificationCommands: [{ command: "npm test -- extra.test.ts", exitCode: 0 }]
      }
    ]);
    const result = await auditReportV4Registry(
      input,
      workspace(input, { implementation: true, testMarker: true, evidence }),
      "acceptance",
      async () => 0
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/requirement result IDs.*exactly match/i);
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
    expect(evidence.output).toContain("invalid protected-staging evidence");

    writeFileSync(join(root, "docs/evidence.json"), `${JSON.stringify(protectedStagingEvidence(input))}\n`, "utf8");
    const command = await auditReportV4Registry(input, root, "acceptance", async () => 7);
    expect(command.output).toContain("verification command failed (7)");
  });
});
