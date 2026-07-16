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
    schemaVersion: "report_v4_protected_staging_acceptance_v2",
    environment: "protected_staging",
    contract: "combined_geo_report_v4",
    recordedAt: "2030-01-01T00:24:00.000Z",
    deployment: {
      previewDeploymentId: "preview-v4-acceptance-1",
      protectedAliasUrl: "https://protected-staging.example.com/",
      webSourceRevision: "d".repeat(40),
      workerSourceRevision: "d".repeat(40)
    },
    identities: {
      reportId: id(1),
      orderId: id(2),
      coreJobId: id(3),
      enhancementJobId: id(4),
      coreArtifactRevisionId: id(5),
      enhancementArtifactRevisionId: id(6),
      siteSnapshotId: siteSnapshotId()
    },
    lineage: {
      configuration: {
        configSnapshotId: `v4-config-${"c".repeat(64)}`,
        modelProfileHash: "a".repeat(64),
        reportProfileHash: "b".repeat(64)
      },
      core: {
        reportId: id(1),
        orderId: id(2),
        jobId: id(3),
        artifactRevisionId: id(5),
        configSnapshotId: `v4-config-${"c".repeat(64)}`
      },
      enhancement: {
        reportId: id(1),
        orderId: id(2),
        jobId: id(4),
        artifactRevisionId: id(6),
        sourceArtifactRevisionId: id(5),
        configSnapshotId: `v4-config-${"c".repeat(64)}`
      }
    },
    timings: {
      crawlStartedAt: "2030-01-01T00:00:00.000Z",
      crawlDeadlineAt: "2030-01-01T00:10:00.000Z",
      crawlCompletedAt: "2030-01-01T00:09:00.000Z",
      paymentConfirmedAt: "2030-01-01T00:10:00.000Z",
      coreActivatedAt: "2030-01-01T00:14:00.000Z",
      enhancementStartedAt: "2030-01-01T00:14:01.000Z",
      enhancementCompletedAt: "2030-01-01T00:23:00.000Z"
    },
    crawl: {
      siteSnapshotId: siteSnapshotId(),
      runs: 1,
      candidatePages: 63,
      analyzablePages: 50,
      jsDependentPages: 1,
      excludedPages: 13,
      rawReads: 50,
      browserReads: 1,
      browserFallbacks: 1,
      networkReadsAfterPayment: 0,
      reusedSnapshotAfterPayment: true
    },
    providerCalls: {
      pageAnalysis: { calls: 50, retries: 0, retryPolicy: "none" },
      websiteSynthesis: 1,
      questions: [attempt("q-1"), attempt("q-2"), attempt("q-3")],
      diagnoses: [attempt("q-1"), attempt("q-2"), attempt("q-3")],
      total: 57
    },
    tokenBudgetRejection: {
      operation: "page_analysis",
      oversizedSmallestUnit: true,
      rejectedBeforeProvider: true,
      providerCallDelta: 0,
      retryDelta: 0
    },
    customerHtml: {
      promptLeakCount: 0,
      rawProviderPayloadLeakCount: 0,
      internalWorkflowTermCount: 0,
      seoFramingCount: 0
    },
    sources: {
      questions: [sourceCount("q-1", 3), sourceCount("q-2", 2), sourceCount("q-3", 4)],
      independentReadFailure: {
        questionId: "q-2",
        sourceId: "source-q2-1",
        readStatus: "inaccessible",
        answerPreserved: true,
        linkPreserved: true
      }
    },
    delivery: {
      customerFormats: ["html"],
      coreHtmlAssemblies: 1,
      enhancementHtmlAssemblies: 1,
      pdfOperations: 0
    },
    mainline: {
      wholeReportReruns: 0,
      providerClaimCalls: 0,
      qualificationCalls: 0,
      fourSnapshotCalls: 0,
      replacementFulfillmentCalls: 0
    },
    diagnosisFailure: {
      injected: true,
      identities: {
        reportId: id(101),
        orderId: id(102),
        coreJobId: id(103),
        coreArtifactRevisionId: id(104)
      },
      coreArtifactRevisionIdBefore: id(104),
      coreArtifactRevisionIdAfter: id(104),
      coreRemainedActive: true,
      answerUnchanged: true,
      accessUnchanged: true,
      commerceSideEffectsDelta: { payments: 0, credits: 0, refunds: 0, emails: 0, accessGrants: 0 }
    },
    questionFailure: {
      injected: true,
      identities: {
        reportId: id(201),
        orderId: id(202),
        coreJobId: id(203),
        coreArtifactRevisionId: id(204)
      },
      questions: [
        answeredQuestion("failure-q-1"),
        failedQuestion("failure-q-2"),
        answeredQuestion("failure-q-3")
      ],
      totalQuestionCalls: 4,
      coreStatus: "completed_limited",
      coreDelivered: true,
      wholeReportReruns: 0,
      commerce: {
        paymentCount: 1,
        creditSettlementCount: 1,
        accessGrantCount: 1,
        coreReportReadyEmailCount: 1,
        refundCount: 0,
        duplicateSideEffectCount: 0
      },
      accessStateValid: true
    },
    commerce: {
      paymentCount: 1,
      coreJobCount: 1,
      enhancementJobCount: 1,
      creditBoundJobCount: 1,
      enhancementCreditCount: 0,
      creditReservationCount: 1,
      creditSettlementCount: 1,
      accessGrantCount: 1,
      paymentConfirmationEmailCount: 1,
      coreReportReadyEmailCount: 1,
      enhancementSideEffects: { payments: 0, credits: 0, refunds: 0, emails: 0, accessGrants: 0 },
      refundCount: 0,
      duplicatePaymentCount: 0,
      duplicateCreditCount: 0,
      duplicateAccessGrantCount: 0,
      duplicateEmailCount: 0,
      duplicateRefundCount: 0,
      auditExitCode: 0
    },
    browser: {
      authorizedDesktop: browserCheck(1440, "artifacts/report-v4-desktop.png"),
      authorizedNarrow: browserCheck(390, "artifacts/report-v4-narrow.png"),
      anonymous: { statusCode: 404, reportVisible: false },
      wrongScope: { statusCode: 404, reportVisible: false }
    },
    legacy: {
      v1Readable: true,
      v2Readable: true,
      v3Readable: true,
      historicalPdfReadable: true,
      historicalPdfMutationCount: 0
    },
    productionUnchanged: true,
    requirementResults: input.requirements.map((requirement) => ({
      requirementId: requirement.id,
      status: "PASS",
      verificationCommands: requirement.verificationCommands.map((command) => ({ command, exitCode: 0 }))
    }))
  };
}

function attempt(questionId: string) {
  return { questionId, calls: 1, retries: 0, status: "completed" };
}

function sourceCount(questionId: string, displayedSourceCount: number) {
  return { questionId, displayedSourceCount };
}

function answeredQuestion(questionId: string) {
  return {
    questionId,
    status: "answered",
    calls: 1,
    retries: 0,
    answerCheckpointUnchanged: true,
    sourceCheckpointUnchanged: true
  };
}

function failedQuestion(questionId: string) {
  return {
    questionId,
    status: "unavailable",
    calls: 2,
    retries: 1,
    terminalFailureRecorded: true
  };
}

function browserCheck(viewportWidth: number, screenshotEvidenceRef: string) {
  return {
    viewportWidth,
    viewportHeight: 900,
    statusCode: 200,
    reportVisible: true,
    noHorizontalOverflow: true,
    relevantConsoleErrorCount: 0,
    screenshotEvidenceRef
  };
}

function id(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function siteSnapshotId(): string {
  return `report-v4-site-${"7".repeat(64)}`;
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

  it("rejects the legacy protected-Staging V1 evidence contract", () => {
    const input = registry("verified");
    const legacy = protectedStagingEvidence(input);
    legacy.schemaVersion = "report_v4_protected_staging_acceptance_v1";
    expect(() => parseReportV4ProtectedStagingEvidence(legacy, input))
      .toThrow(/acceptance_v2|schemaVersion/i);
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
    expect(result.output).toMatch(/requirement result IDs.*exactly match|explicit PASS/i);
  });

  it.each([
    ["environment", "environment", "production"],
    ["contract", "contract", "combined_geo_report_v3"],
    ["deployment identity", "deployment.previewDeploymentId", ""],
    ["Web/Worker revision parity", "deployment.workerSourceRevision", "f".repeat(40)],
    ["protected alias", "deployment.protectedAliasUrl", "http://staging.example.com"],
    ["configuration snapshot", "lineage.configuration.configSnapshotId", "not-a-config-snapshot"],
    ["model profile hash", "lineage.configuration.modelProfileHash", "not-a-hash"],
    ["report profile hash", "lineage.configuration.reportProfileHash", ""],
    ["identity", "identities.orderId", "order-1"],
    ["crawl time limit", "timings.crawlCompletedAt", "2030-01-01T00:10:00.001Z"],
    ["delivery ordering", "timings.enhancementStartedAt", "2030-01-01T00:13:59.000Z"],
    ["crawl reuse", "crawl.networkReadsAfterPayment", 1],
    ["crawl partition", "crawl.excludedPages", 12],
    ["JS dependency relation", "crawl.jsDependentPages", 51],
    ["question retry bound", "providerCalls.questions.0.retries", 2],
    ["model call accounting", "providerCalls.total", 99],
    ["source read accounting", "crawl.rawReads", 99],
    ["source browser fallback bound", "crawl.browserReads", 51],
    ["revision count", "delivery.coreHtmlAssemblies", 2],
    ["whole-report rerun", "mainline.wholeReportReruns", 1],
    ["provider claim", "mainline.providerClaimCalls", 1],
    ["qualification", "mainline.qualificationCalls", 1],
    ["four snapshot", "mainline.fourSnapshotCalls", 1],
    ["replacement", "mainline.replacementFulfillmentCalls", 1],
    ["PDF", "delivery.pdfOperations", 1],
    ["token rejection side effect", "tokenBudgetRejection.providerCallDelta", 1],
    ["customer HTML leakage", "customerHtml.promptLeakCount", 1],
    ["source display limit", "sources.questions.0.displayedSourceCount", 6],
    ["desktop browser", "browser.authorizedDesktop.reportVisible", false],
    ["desktop screenshot", "browser.authorizedDesktop.screenshotEvidenceRef", ""],
    ["desktop overflow", "browser.authorizedDesktop.noHorizontalOverflow", false],
    ["narrow browser", "browser.authorizedNarrow.viewportWidth", 900],
    ["narrow console", "browser.authorizedNarrow.relevantConsoleErrorCount", 1],
    ["anonymous access", "browser.anonymous.statusCode", 200],
    ["wrong-scope access", "browser.wrongScope.reportVisible", true],
    ["commerce exactly once", "commerce.creditSettlementCount", 2],
    ["enhancement commercial isolation", "commerce.enhancementSideEffects.emails", 1],
    ["commerce audit", "commerce.auditExitCode", 1],
    ["legacy compatibility", "legacy.v2Readable", false],
    ["diagnosis fault injection", "diagnosisFailure.injected", false],
    ["fault run identity independence", "diagnosisFailure.identities.reportId", id(1)],
    ["core remains active", "diagnosisFailure.coreArtifactRevisionIdAfter", id(106)],
    ["fault commerce side effects", "diagnosisFailure.commerceSideEffectsDelta.emails", 1],
    ["question failure isolation", "questionFailure.wholeReportReruns", 1],
    ["production unchanged", "productionUnchanged", false],
    ["requirement result", "requirementResults.0.status", "implemented"]
  ])("fails closed when protected-staging evidence violates %s", (_name, path, value) => {
    const input = registry("verified");
    const evidence = protectedStagingEvidence(input);
    setEvidenceValue(evidence, path, value);
    expect(() => parseReportV4ProtectedStagingEvidence(evidence, input)).toThrow();
  });

  it("accepts only the repository v4-config SHA identity format", () => {
    const input = registry("verified");
    const realIdentity = protectedStagingEvidence(input);
    setEvidenceValue(realIdentity, "lineage.configuration.configSnapshotId", `v4-config-${"c".repeat(64)}`);
    expect(() => parseReportV4ProtectedStagingEvidence(realIdentity, input)).not.toThrow();

    const fakeUuid = protectedStagingEvidence(input);
    setEvidenceValue(fakeUuid, "lineage.configuration.configSnapshotId", id(11));
    expect(() => parseReportV4ProtectedStagingEvidence(fakeUuid, input)).toThrow(/configSnapshotId/i);
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
    expect(result.output).toMatch(/verification commands?.*exactly match/i);
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
