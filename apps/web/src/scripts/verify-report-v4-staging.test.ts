import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runReportV4StagingVerification,
  verifyReportV4StagingEvidence
} from "./verify-report-v4-staging";

// @requirement GEO-V4-ACCEPT-01

const workspaceRoot = resolve(import.meta.dirname, "../../../..");
const registry = JSON.parse(readFileSync(
  resolve(workspaceRoot, "config/report-contracts/combined-geo-report-v4.requirements.json"),
  "utf8"
)) as RegistryFixture;

describe("Report V4 protected-Staging verifier", () => {
  it("keeps the no-env command pinned to the formal committed evidence path", () => {
    const reads: string[] = [];
    const result = runReportV4StagingVerification([], {
      environment: {},
      readText(path) {
        reads.push(path);
        return path.endsWith("combined-geo-report-v4.requirements.json")
          ? JSON.stringify(registry)
          : JSON.stringify(fixture());
      },
      isFile: () => true
    });

    expect(result.exitCode).toBe(0);
    expect(reads.some((path) => path.replaceAll("\\", "/")
      .endsWith("docs/operations/evidence/report-v4-protected-staging-acceptance.json")))
      .toBe(true);
  });

  it("allows the unchanged no-argument command to verify one protected-Staging candidate", () => {
    const candidate = "docs/operations/evidence/.report-v4-00000000-0000-4000-8000-000000000321.candidate.json";
    const reads: string[] = [];
    const result = runReportV4StagingVerification([], {
      environment: {
        OGC_DEPLOYMENT_PROFILE: "staging",
        VERCEL_ENV: "preview",
        COMMERCE_MODE: "test",
        OGC_REPORT_V4_STAGING_EVIDENCE_CANDIDATE_PATH: candidate
      },
      realpath: (path) => path,
      readText(path) {
        reads.push(path);
        return path.endsWith("combined-geo-report-v4.requirements.json")
          ? JSON.stringify(registry)
          : JSON.stringify(fixture());
      },
      isFile: () => true
    });

    expect(result.exitCode).toBe(0);
    expect(reads.some((path) => path.replaceAll("\\", "/").endsWith(candidate))).toBe(true);
    expect(reads.some((path) => path.endsWith("report-v4-protected-staging-acceptance.json"))).toBe(false);
  });

  it("rejects a candidate override outside protected Staging Preview", () => {
    const result = runReportV4StagingVerification([], {
      environment: {
        OGC_DEPLOYMENT_PROFILE: "production",
        VERCEL_ENV: "production",
        COMMERCE_MODE: "live",
        OGC_REPORT_V4_STAGING_EVIDENCE_CANDIDATE_PATH:
          "docs/operations/evidence/.report-v4-00000000-0000-4000-8000-000000000321.candidate.json"
      }
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/protected staging Preview/i);
  });

  it.each([
    ["parent traversal", "../docs/operations/evidence/.report-v4-00000000-0000-4000-8000-000000000321.candidate.json"],
    ["absolute", "C:/tmp/.report-v4-00000000-0000-4000-8000-000000000321.candidate.json"],
    ["wrong directory", "artifacts/.report-v4-00000000-0000-4000-8000-000000000321.candidate.json"],
    ["wrong filename", "docs/operations/evidence/report-v4-candidate.json"]
  ])("rejects candidate path escape: %s", (_label, candidate) => {
    const result = runReportV4StagingVerification([], {
      environment: {
        OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "preview", COMMERCE_MODE: "test",
        OGC_REPORT_V4_STAGING_EVIDENCE_CANDIDATE_PATH: candidate
      }
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/candidate|workspace-relative|path/i);
  });

  it("rejects a candidate whose real path escapes through a symlink", () => {
    const candidate = "docs/operations/evidence/.report-v4-00000000-0000-4000-8000-000000000321.candidate.json";
    const result = runReportV4StagingVerification([], {
      environment: {
        OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "preview", COMMERCE_MODE: "test",
        OGC_REPORT_V4_STAGING_EVIDENCE_CANDIDATE_PATH: candidate
      },
      realpath(path) {
        return path.endsWith(".candidate.json") ? resolve(workspaceRoot, "../outside/candidate.json") : path;
      }
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/symlink|workspace/i);
  });

  it("keeps the explicit --evidence test path compatible when no candidate env is present", () => {
    const reads: string[] = [];
    const result = runReportV4StagingVerification(["--evidence", "artifacts/report-v4-test-evidence.json"], {
      environment: {},
      readText(path) {
        reads.push(path);
        return path.endsWith("combined-geo-report-v4.requirements.json")
          ? JSON.stringify(registry)
          : JSON.stringify(fixture());
      },
      isFile: () => true
    });
    expect(result.exitCode).toBe(0);
    expect(reads.some((path) => path.replaceAll("\\", "/").endsWith("artifacts/report-v4-test-evidence.json")))
      .toBe(true);
  });

  it("fails closed for an absent evidence file", () => {
    const result = runReportV4StagingVerification([], {
      readText() {
        throw new Error("ENOENT protected staging evidence");
      }
    });

    expect(result).toEqual(expect.objectContaining({ exitCode: 1 }));
    expect(result.output).toMatch(/ENOENT protected staging evidence/i);
  });

  it("runs the local-only CLI against structured evidence and two screenshot files", () => {
    const checkedScreenshots: string[] = [];
    const result = runReportV4StagingVerification([], {
      readText(path) {
        return path.endsWith("combined-geo-report-v4.requirements.json")
          ? JSON.stringify(registry)
          : JSON.stringify(fixture());
      },
      isFile(path) {
        checkedScreenshots.push(path);
        return true;
      }
    });

    expect(result).toEqual(expect.objectContaining({ exitCode: 0 }));
    expect(checkedScreenshots).toHaveLength(2);
    expect(checkedScreenshots[0]).not.toBe(checkedScreenshots[1]);
  });

  it.each([
    ["absent", undefined],
    ["empty", {}],
    ["narrative-only", "Protected Staging passed all checks."]
  ])("rejects %s structured evidence", (_label, value) => {
    expect(() => verifyReportV4StagingEvidence(value, registry)).toThrow(/evidence|object|field/i);
  });

  it("rejects a missing registry requirement ID", () => {
    const evidence = fixture();
    evidence.requirementResults = asArray(evidence.requirementResults).slice(1);
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/requirement.*exactly match/i);
  });

  it("rejects a missing exact lineage identity", () => {
    const evidence = fixture();
    delete asRecord(evidence.identities).coreJobId;
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/identities.*missing.*coreJobId/i);

    const missingConfig = fixture();
    delete asRecord(asRecord(missingConfig.lineage).configuration).modelProfileHash;
    expect(() => verifyReportV4StagingEvidence(missingConfig, registry)).toThrow(/configuration.*missing.*modelProfileHash/i);
  });

  it("rejects provider retry and prohibited-mainline counter overflow", () => {
    const retryOverflow = fixture();
    const firstQuestion = asRecord(asArray(asRecord(retryOverflow.providerCalls).questions)[0]);
    firstQuestion.calls = 3;
    firstQuestion.retries = 2;
    expect(() => verifyReportV4StagingEvidence(retryOverflow, registry)).toThrow(/questions.*calls|retries/i);

    const prohibited = fixture();
    asRecord(prohibited.mainline).providerClaimCalls = 1;
    expect(() => verifyReportV4StagingEvidence(prohibited, registry)).toThrow(/providerClaimCalls.*0/i);
  });

  it("accepts more than 50 discovered candidates but requires exact terminal crawl accounting", () => {
    const inconsistent = fixture();
    asRecord(inconsistent.crawl).excludedPages = 12;
    expect(() => verifyReportV4StagingEvidence(inconsistent, registry)).toThrow(/candidatePages.*analyzablePages.*excludedPages/i);
  });

  it("requires the deterministic report-v4-site snapshot identity contract", () => {
    const evidence = fixture();
    asRecord(evidence.identities).siteSnapshotId = id(7);
    asRecord(evidence.crawl).siteSnapshotId = id(7);
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/report-v4-site-.*64 lowercase hex/i);
  });

  it("rejects unbound page-analysis calls and an inconsistent all-model-call total", () => {
    const evidence = fixture();
    asRecord(asRecord(evidence.providerCalls).pageAnalysis).calls = 4;
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/pageAnalysis.*analyzable/i);
  });

  it("rejects Token-budget rejection evidence with provider or retry side effects", () => {
    const evidence = fixture();
    asRecord(evidence.tokenBudgetRejection).providerCallDelta = 1;
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/providerCallDelta.*0/i);
  });

  it("rejects customer HTML leakage, internal terms, or SEO framing", () => {
    const evidence = fixture();
    asRecord(evidence.customerHtml).seoFramingCount = 1;
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/seoFramingCount.*0/i);
  });

  it("rejects more than five displayed sources or destructive independent read failure", () => {
    const tooMany = fixture();
    asRecord(asArray(asRecord(tooMany.sources).questions)[0]).displayedSourceCount = 6;
    expect(() => verifyReportV4StagingEvidence(tooMany, registry)).toThrow(/displayedSourceCount.*0 through 5/i);

    const destructive = fixture();
    asRecord(asRecord(destructive.sources).independentReadFailure).answerPreserved = false;
    expect(() => verifyReportV4StagingEvidence(destructive, registry)).toThrow(/answerPreserved.*true/i);
  });

  it("rejects core/enhancement ordering and engineering time violations", () => {
    const ordering = fixture();
    asRecord(ordering.timings).enhancementStartedAt = "2030-01-01T00:13:59.000Z";
    expect(() => verifyReportV4StagingEvidence(ordering, registry)).toThrow(/core.*before.*enhancement|execution order/i);

    const deadline = fixture();
    asRecord(deadline.timings).crawlCompletedAt = "2030-01-01T00:10:00.001Z";
    expect(() => verifyReportV4StagingEvidence(deadline, registry)).toThrow(/crawl.*10 minutes/i);
  });

  it("rejects PDF/customer-format evidence outside HTML-only delivery", () => {
    const evidence = fixture();
    asRecord(evidence.delivery).pdfOperations = 1;
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/pdfOperations.*0/i);
  });

  it("rejects failed desktop or narrow browser evidence", () => {
    const evidence = fixture();
    asRecord(asRecord(evidence.browser).authorizedNarrow).noHorizontalOverflow = false;
    expect(() => verifyReportV4StagingEvidence(evidence, registry)).toThrow(/authorizedNarrow.*noHorizontalOverflow.*true/i);
  });

  it("rejects mismatched protected deployment revisions or legacy mutations", () => {
    const deployment = fixture();
    asRecord(deployment.deployment).workerSourceRevision = "e".repeat(40);
    expect(() => verifyReportV4StagingEvidence(deployment, registry)).toThrow(/Web and Worker.*match/i);

    const legacy = fixture();
    asRecord(legacy.legacy).historicalPdfMutationCount = 1;
    expect(() => verifyReportV4StagingEvidence(legacy, registry)).toThrow(/historicalPdfMutationCount.*0/i);
  });

  it("rejects merged stage jobs or enhancement commercial/email side effects", () => {
    const stageCount = fixture();
    asRecord(stageCount.commerce).enhancementJobCount = 0;
    expect(() => verifyReportV4StagingEvidence(stageCount, registry)).toThrow(/enhancementJobCount.*1/i);

    const enhancementSideEffect = fixture();
    asRecord(asRecord(enhancementSideEffect.commerce).enhancementSideEffects).emails = 1;
    expect(() => verifyReportV4StagingEvidence(enhancementSideEffect, registry)).toThrow(/enhancementSideEffects.*emails.*0/i);
  });

  it("rejects a question-failure scenario that does not isolate one failure and preserve two checkpoints", () => {
    const twoFailures = fixture();
    const questions = asArray(asRecord(twoFailures.questionFailure).questions);
    questions[0] = failedQuestion("failure-q-1");
    expect(() => verifyReportV4StagingEvidence(twoFailures, registry)).toThrow(/exactly two answered.*one unavailable/i);

    const changedCheckpoint = fixture();
    asRecord(asArray(asRecord(changedCheckpoint.questionFailure).questions)[0]).answerCheckpointUnchanged = false;
    expect(() => verifyReportV4StagingEvidence(changedCheckpoint, registry)).toThrow(/answerCheckpointUnchanged.*true/i);

    const rerun = fixture();
    asRecord(rerun.questionFailure).wholeReportReruns = 1;
    expect(() => verifyReportV4StagingEvidence(rerun, registry)).toThrow(/wholeReportReruns.*0/i);
  });

  it("rejects nonzero or registry-mismatched verification command results", () => {
    const failed = fixture();
    const firstResult = asRecord(asArray(failed.requirementResults)[0]);
    asRecord(asArray(firstResult.verificationCommands)[0]).exitCode = 1;
    expect(() => verifyReportV4StagingEvidence(failed, registry)).toThrow(/exitCode.*0/i);

    const mismatched = fixture();
    asRecord(asArray(mismatched.requirementResults)[0]).verificationCommands = [{ command: "npm test -- wrong.ts", exitCode: 0 }];
    expect(() => verifyReportV4StagingEvidence(mismatched, registry)).toThrow(/commands.*registry/i);
  });

  it("accepts one complete structured fixture covering every registry requirement", () => {
    const result = verifyReportV4StagingEvidence(fixture(), registry);
    expect(result.requirementResults).toHaveLength(20);
    expect(result.identities).toMatchObject({
      reportId: id(1),
      orderId: id(2),
      coreJobId: id(3),
      enhancementJobId: id(4),
      coreArtifactRevisionId: id(5),
      enhancementArtifactRevisionId: id(6)
    });
  });
});

function fixture(): Record<string, unknown> {
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
      authorizedDesktop: browserCheck(1440, "docs/operations/evidence/report-v4-desktop.png"),
      authorizedNarrow: browserCheck(390, "docs/operations/evidence/report-v4-narrow.png"),
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
    requirementResults: registry.requirements.map((requirement) => ({
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected an object fixture.");
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected an array fixture.");
  return value;
}

interface RegistryFixture {
  requirements: Array<{ id: string; verificationCommands: string[] }>;
}
