import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  fingerprintNormalizedReportV4CommerceAuthority,
  fingerprintReportV4CommerceAuthority,
} from "./report-v4-commerce-authority-fingerprint";
import {
  normalizeReportV4CommerceDispatches,
  normalizeReportV4CommerceJobs,
} from "./report-v4-commerce-job-authority";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const at = "2026-07-17T00:00:00.000Z";

const job = (
  id: string,
  reason: "standard" | "v4_pre_admission" | "v4_diagnosis_enhancement",
) => ({
  id,
  reportId: "report-1",
  siteSnapshotId: reason === "standard" ? "snapshot-1" : null,
  tier: "deep",
  productContract: "recommendation_forensics_v1",
  fulfillmentMethodology: "two_stage_geo_report_v4",
  recommendationReportVersion: 4,
  artifactContract: "combined_geo_report_v4",
  businessQuestionSetId:
    reason === "v4_pre_admission" ? null : "question-set-1",
  locale: "en",
  reason,
  stage: "completed",
  executionState: "completed",
  currentPhase: "terminalization",
  checkpointRevision: 3,
  phaseAttempt: 0,
  resumeGeneration: 0,
  progress: 100,
  plannedPages: 1,
  successfulPages: 1,
  failedPages: 0,
  attempts: 1,
  maxAttempts: 3,
  errorCode: null,
  publicError: null,
  creditReservationId: reason === "standard" ? "credit-1" : null,
});

function validInput() {
  const reportIdHash = hash("report-1");
  const orderIdHash = hash("order-1");
  const preAdmissionJobIdHash = hash("pre-job-1");
  const coreJobIdHash = hash("core-job-1");
  const enhancementJobIdHash = hash("enhancement-job-1");
  const coreArtifactRevisionIdHash = hash("core-artifact-1");
  const enhancementArtifactRevisionIdHash = hash("enhancement-artifact-1");
  const questionSetIdHash = hash("question-set-1");
  const snapshotIdHash = hash("snapshot-1");
  const deliveryIdHash = hash("delivery-1");

  return {
    phase: "final",
    capturedAt: at,
    scope: {
      reportIdHash,
      orderIdHash,
      siteSnapshotIdHash: snapshotIdHash,
      configSnapshotIdHash: hash("config-1"),
      questionSetIdHash,
      activeArtifactRevisionIdHash: enhancementArtifactRevisionIdHash,
      preAdmissionJobIdHash,
      coreJobIdHash,
      enhancementJobIdHash,
      coreArtifactRevisionIdHash,
      enhancementArtifactRevisionIdHash,
    },
    orders: [
      {
        idHash: orderIdHash,
        provider: "airwallex",
        providerCheckoutIdHash: hash("checkout-1"),
        providerPaymentIdHash: hash("payment-1"),
        reportIdHash,
        siteKeyHash: hash("site-1"),
        siteSnapshotIdHash: snapshotIdHash,
        fulfillmentJobIdHash: coreJobIdHash,
        productCode: "recommendation_forensics_v1",
        businessQuestionSetIdHash: questionSetIdHash,
        fulfillmentMethodology: "two_stage_geo_report_v4",
        recommendationReportVersion: 4,
        catalogVersion: "catalog-v1",
        termsVersion: "terms-v1",
        refundPolicyVersion: "refund-v1",
        reportLocale: "en",
        currency: "USD",
        amountMinor: 1000,
        taxAmountMinor: 0,
        paymentStatus: "paid",
        fulfillmentStatus: "completed",
        refundStatus: "not_required",
        deliveryStatus: "delivered",
        courtesyNonBillable: false,
        paidAt: at,
        fulfillmentDeadlineAt: at,
        fulfilledAt: at,
        refundedAt: null,
      },
    ],
    paymentEvents: [
      {
        idHash: hash("payment-event-1"),
        provider: "airwallex",
        providerEventIdHash: hash("provider-payment-event-1"),
        eventType: "payment_intent.succeeded",
        payloadHash: hash("payment-payload-1"),
        selectedFieldsHash: hash("payment-selected-1"),
        processingStatus: "processed",
        orderIdHash,
        providerCreatedAt: at,
        processedAt: at,
        errorCode: null,
      },
    ],
    jobs: [
      job("enhancement-job-1", "v4_diagnosis_enhancement"),
      job("core-job-1", "standard"),
      job("pre-job-1", "v4_pre_admission"),
    ],
    dispatches: [
      {
        id: "dispatch-pre-1",
        jobId: "pre-job-1",
        tier: "deep",
        schemaVersion: 1,
        state: "published",
        attempts: 1,
        publishedAt: at,
        lastErrorCode: null,
      },
      {
        id: "dispatch-core-1",
        jobId: "core-job-1",
        tier: "deep",
        schemaVersion: 1,
        state: "published",
        attempts: 1,
        publishedAt: at,
        lastErrorCode: null,
      },
      {
        id: "dispatch-enhancement-1",
        jobId: "enhancement-job-1",
        tier: "deep",
        schemaVersion: 1,
        state: "published",
        attempts: 1,
        publishedAt: at,
        lastErrorCode: null,
      },
    ],
    creditAuthority: {
      accessKeys: [
        {
          idHash: hash("access-key-1"),
          keyPrefixHash: hash("key-prefix-1"),
          paymentOrderIdHash: orderIdHash,
          status: "exhausted",
          creditsRemaining: 0,
          expiresAt: at,
          revokedAt: null,
        },
      ],
      creditLedger: [
        {
          idHash: hash("credit-1"),
          accessKeyIdHash: hash("access-key-1"),
          reportIdHash,
          jobIdHash: coreJobIdHash,
          paymentOrderIdHash: orderIdHash,
          idempotencyKeyHash: hash("credit-idempotency-1"),
          credits: 1,
          status: "settled",
          reservedAt: at,
          settledAt: at,
          refundedAt: null,
        },
      ],
      refunds: [
        {
          idHash: hash("refund-1"),
          orderIdHash,
          provider: "airwallex",
          providerRefundIdHash: hash("provider-refund-1"),
          reason: "operator_approved",
          amountMinor: 1000,
          currency: "USD",
          state: "succeeded",
          idempotencyKeyHash: hash("refund-idempotency-1"),
          attempts: 1,
          failureCode: null,
          submittedAt: at,
          succeededAt: at,
        },
      ],
    },
    emailAuthority: {
      deliveries: [
        {
          idHash: deliveryIdHash,
          orderIdHash,
          reportIdHash,
          templateType: "report_ready",
          templateVersion: "v1",
          locale: "en",
          recipientRefHash: hash("recipient-1"),
          provider: "resend",
          providerEmailIdHash: hash("provider-email-1"),
          businessIdempotencyKeyHash: hash("email-idempotency-1"),
          state: "delivered",
          attempts: 1,
          failureCode: null,
          lastProviderEventAt: at,
          sentAt: at,
          deliveredAt: at,
        },
      ],
      events: [
        {
          idHash: hash("email-event-1"),
          providerEventIdHash: hash("provider-email-event-1"),
          providerEmailIdHash: hash("provider-email-1"),
          deliveryIdHash,
          provider: "resend",
          eventType: "email.delivered",
          processingStatus: "processed",
          payloadHash: hash("email-payload-1"),
          providerCreatedAt: at,
          errorCode: null,
        },
      ],
    },
    accessTokens: [
      {
        idHash: hash("access-token-1"),
        reportIdHash,
        tokenPrefixHash: hash("token-prefix-1"),
        artifactScope: "combined_geo_report_v4",
        expiresAt: at,
        lastUsedAt: at,
        revokedAt: null,
      },
    ],
    artifacts: [
      {
        idHash: enhancementArtifactRevisionIdHash,
        reportIdHash,
        orderIdHash,
        jobIdHash: enhancementJobIdHash,
        configSnapshotIdHash: hash("config-1"),
        correctionIdHash: null,
        replacementFulfillmentIdHash: null,
        sourceArtifactRevisionIdHash: coreArtifactRevisionIdHash,
        revisionKind: "diagnosis_enhancement",
        revision: 2,
        artifactContract: "combined_geo_report_v4",
        status: "active",
        payloadIdentityHash: hash("enhancement-payload-1"),
        htmlSha256: hash("enhancement-html-1"),
        pdfSha256: null,
        pdfStorageKeyPresent: false,
        readyAt: at,
        activatedAt: at,
      },
      {
        idHash: coreArtifactRevisionIdHash,
        reportIdHash,
        orderIdHash,
        jobIdHash: coreJobIdHash,
        configSnapshotIdHash: hash("config-1"),
        correctionIdHash: null,
        replacementFulfillmentIdHash: null,
        sourceArtifactRevisionIdHash: null,
        revisionKind: "generation",
        revision: 1,
        artifactContract: "combined_geo_report_v4",
        status: "ready",
        payloadIdentityHash: hash("core-payload-1"),
        htmlSha256: hash("core-html-1"),
        pdfSha256: null,
        pdfStorageKeyPresent: false,
        readyAt: at,
        activatedAt: null,
      },
    ],
    questionCheckpoints: ([1, 2, 3] as const).map((ordinal) => ({
        identityHash: hash(`question-checkpoint-${ordinal}`),
        reportIdHash,
        jobIdHash: coreJobIdHash,
        questionSetIdHash,
        questionIdHash: hash(`question-${ordinal}`),
        snapshotIdHash,
        ordinal,
        state: "answered",
        questionIdentityHash: hash(`question-identity-${ordinal}`),
        modelConfigIdentityHash: hash("model-config-1"),
        inputIdentityHash: hash(`question-input-${ordinal}`),
        providerCallCount: 1,
        sourcePayloadHash: hash(`source-payload-${ordinal}`),
        sourceCount: 1,
        sourceRecords: [{
          questionIdHash: hash(`question-${ordinal}`),
          sourceIdHash: hash(`source-${ordinal}`),
          titleHash: hash(`source-title-${ordinal}`),
          canonicalUrlHash: hash(`source-url-${ordinal}`),
          citedTextHash: hash(`source-cited-${ordinal}`),
          retrievalStatus: "not_checked" as const,
        }],
        answerContentHash: hash(`answer-${ordinal}`),
        terminalFingerprint: hash(`question-terminal-${ordinal}`),
      })),
    diagnosisCheckpoints: ([1, 2, 3] as const).map((ordinal) => ({
        identityHash: hash(`diagnosis-checkpoint-${ordinal}`),
        reportIdHash,
        enhancementJobIdHash,
        coreArtifactRevisionIdHash,
        configSnapshotIdHash: hash("config-1"),
        questionSetIdHash,
        questionIdHash: hash(`question-${ordinal}`),
        snapshotIdHash,
        ordinal,
        state: "completed",
        inputIdentityHash: hash(`diagnosis-input-${ordinal}`),
        providerCallCount: 1,
        sourceAuditPayloadHash: hash(`source-audit-${ordinal}`),
        sourceAuditCount: 1,
        sourceAuditRecords: [{
          questionIdHash: hash(`question-${ordinal}`),
          sourceIdHash: hash(`source-${ordinal}`),
          canonicalUrlHash: hash(`source-url-${ordinal}`),
          status: "available" as const,
          summaryHash: hash(`source-summary-${ordinal}`),
        }],
        diagnosisContentHash: hash(`diagnosis-${ordinal}`),
        terminalFingerprint: hash(`diagnosis-terminal-${ordinal}`),
      })),
  };
}

function normalizedInput() {
  const raw = validInput();
  return {
    ...raw,
    jobs: normalizeReportV4CommerceJobs(raw.jobs),
    dispatches: normalizeReportV4CommerceDispatches(raw.dispatches),
  };
}

/** @requirement GEO-V4-COMMERCE-01 */
describe("Report V4 final commerce authority fingerprint", () => {
  it("recomputes the same official fingerprint from the complete hash-safe normalized authority", () => {
    expect(
      fingerprintNormalizedReportV4CommerceAuthority(normalizedInput()),
    ).toBe(fingerprintReportV4CommerceAuthority(validInput()));
  });

  it("rejects double-encoded, missing, extra, and foreign normalized job/dispatch authority", () => {
    const doubleEncoded = normalizedInput();
    doubleEncoded.jobs[0].idHash = hash(doubleEncoded.jobs[0].idHash);
    expect(() =>
      fingerprintNormalizedReportV4CommerceAuthority(doubleEncoded),
    ).toThrow(/scope|lineage/i);

    const missing = normalizedInput() as ReturnType<typeof normalizedInput> & {
      jobs: Array<Record<string, unknown>>;
    };
    delete missing.jobs[0].progress;
    expect(() =>
      fingerprintNormalizedReportV4CommerceAuthority(missing),
    ).toThrow(/missing field progress/i);

    const extra = normalizedInput() as ReturnType<typeof normalizedInput> & {
      dispatches: Array<Record<string, unknown>>;
    };
    extra.dispatches[0].rawJobId = "must-not-be-accepted";
    expect(() =>
      fingerprintNormalizedReportV4CommerceAuthority(extra),
    ).toThrow(/unknown field rawJobId/i);

    const foreignDispatch = normalizedInput();
    foreignDispatch.dispatches[0].jobIdHash = hash("foreign-job");
    expect(() =>
      fingerprintNormalizedReportV4CommerceAuthority(foreignDispatch),
    ).toThrow(/dispatch.*lineage/i);
  });
  it("returns only an opaque deterministic SHA-256", () => {
    const input = validInput();
    const first = fingerprintReportV4CommerceAuthority(input);
    const second = fingerprintReportV4CommerceAuthority(structuredClone(input));

    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(second).toBe(first);
    expect(first).not.toContain("report-1");
  });

  it("domain-separates baseline and final", () => {
    const input = validInput();
    expect(
      fingerprintReportV4CommerceAuthority({ ...input, phase: "baseline" }),
    ).not.toBe(fingerprintReportV4CommerceAuthority(input));
  });

  it("excludes capturedAt and normalizes collection order", () => {
    const input = validInput();
    const changed = structuredClone(input);
    changed.capturedAt = "2026-07-17T01:00:00.000Z";
    changed.jobs.reverse();
    changed.dispatches.reverse();
    changed.artifacts.reverse();

    expect(fingerprintReportV4CommerceAuthority(changed)).toBe(
      fingerprintReportV4CommerceAuthority(input),
    );
  });

  it("commits every authority collection to the fingerprint", () => {
    const mutations: Array<(value: ReturnType<typeof validInput>) => void> = [
      (v) => {
        v.orders[0].amountMinor = 1001;
        v.creditAuthority.refunds[0].amountMinor = 1001;
      },
      (v) => void (v.paymentEvents[0].eventType = "payment_intent.updated"),
      (v) => void (v.jobs[0].progress = 99),
      (v) => void (v.dispatches[0].attempts = 2),
      (v) => void (v.creditAuthority.accessKeys[0].creditsRemaining = 1),
      (v) => void (v.creditAuthority.creditLedger[0].credits = 2),
      (v) => void (v.creditAuthority.refunds[0].attempts = 2),
      (v) => void (v.emailAuthority.deliveries[0].attempts = 2),
      (v) => void (v.emailAuthority.events[0].eventType = "email.opened"),
      (v) => void (v.accessTokens[0].lastUsedAt = null),
      (v) => void (v.artifacts[0].payloadIdentityHash = hash("changed")),
      (v) => {
        v.questionCheckpoints[0].sourceCount = 2;
        v.questionCheckpoints[0].sourceRecords.push({
          ...v.questionCheckpoints[0].sourceRecords[0],
          sourceIdHash: hash("second-question-source"),
          canonicalUrlHash: hash("second-question-source-url"),
        });
      },
      (v) => {
        v.diagnosisCheckpoints[0].sourceAuditCount = 2;
        v.diagnosisCheckpoints[0].sourceAuditRecords.push({
          ...v.diagnosisCheckpoints[0].sourceAuditRecords[0],
          sourceIdHash: hash("second-source"),
          canonicalUrlHash: hash("second-source-url"),
        });
      },
    ];
    const expected = fingerprintReportV4CommerceAuthority(validInput());

    for (const mutate of mutations) {
      const changed = validInput();
      mutate(changed);
      expect(fingerprintReportV4CommerceAuthority(changed)).not.toBe(expected);
    }
  });

  it("fails closed on missing, duplicate, or aliased scope", () => {
    const missing = validInput();
    missing.jobs = missing.jobs.filter((row) => row.reason !== "standard");
    expect(() => fingerprintReportV4CommerceAuthority(missing)).toThrow(
      /scope|core/i,
    );

    const duplicate = validInput();
    duplicate.orders.push(structuredClone(duplicate.orders[0]));
    expect(() => fingerprintReportV4CommerceAuthority(duplicate)).toThrow(
      /duplicate|exactly/i,
    );

    const aliased = validInput();
    aliased.scope.preAdmissionJobIdHash = aliased.scope.coreJobIdHash;
    expect(() => fingerprintReportV4CommerceAuthority(aliased)).toThrow(
      /distinct|scope/i,
    );
  });

  it("requires exact dispatch, deep standard lane, terminal artifacts, and exact checkpoints", () => {
    const missingDispatch = validInput();
    missingDispatch.dispatches.pop();
    expect(() =>
      fingerprintReportV4CommerceAuthority(missingDispatch),
    ).toThrow(/dispatch scope/i);

    const freeStandard = validInput();
    const core = freeStandard.jobs.find((row) => row.reason === "standard");
    if (!core) throw new Error("fixture missing core job");
    core.tier = "free";
    expect(() => fingerprintReportV4CommerceAuthority(freeStandard)).toThrow(
      /tier must be deep/i,
    );

    const pendingEnhancement = validInput();
    pendingEnhancement.artifacts[0].status = "pending";
    pendingEnhancement.artifacts[0].htmlSha256 = null;
    pendingEnhancement.artifacts[0].readyAt = null;
    pendingEnhancement.artifacts[0].activatedAt = null;
    expect(() =>
      fingerprintReportV4CommerceAuthority(pendingEnhancement),
    ).toThrow(/active|terminal/i);

    const twoQuestions = validInput();
    twoQuestions.questionCheckpoints.pop();
    expect(() => fingerprintReportV4CommerceAuthority(twoQuestions)).toThrow(
      /exactly three/i,
    );
  });

  it("accepts all protected final artifact topologies", () => {
    expect(fingerprintReportV4CommerceAuthority(validInput())).toMatch(
      /^[a-f0-9]{64}$/u,
    );

    const activePartialEnhancement = validInput();
    activePartialEnhancement.diagnosisCheckpoints[0].state = "failed";
    activePartialEnhancement.diagnosisCheckpoints[0].diagnosisContentHash = null;
    expect(
      fingerprintReportV4CommerceAuthority(activePartialEnhancement),
    ).toMatch(/^[a-f0-9]{64}$/u);

    const failedEnhancement = validInput();
    failedEnhancement.artifacts[0].status = "failed";
    failedEnhancement.artifacts[0].htmlSha256 = null;
    failedEnhancement.artifacts[0].readyAt = null;
    failedEnhancement.artifacts[0].activatedAt = null;
    failedEnhancement.artifacts[1].status = "active";
    failedEnhancement.artifacts[1].activatedAt = at;
    failedEnhancement.scope.activeArtifactRevisionIdHash =
      failedEnhancement.scope.coreArtifactRevisionIdHash;
    expect(fingerprintReportV4CommerceAuthority(failedEnhancement)).toMatch(
      /^[a-f0-9]{64}$/u,
    );

    const questionFailure = validInput();
    questionFailure.scope.enhancementJobIdHash = null;
    questionFailure.scope.enhancementArtifactRevisionIdHash = null;
    questionFailure.scope.activeArtifactRevisionIdHash =
      questionFailure.scope.coreArtifactRevisionIdHash;
    questionFailure.jobs = questionFailure.jobs.filter(
      (row) => row.reason !== "v4_diagnosis_enhancement",
    );
    questionFailure.dispatches = questionFailure.dispatches.filter(
      (row) => row.jobId !== "enhancement-job-1",
    );
    questionFailure.artifacts = questionFailure.artifacts.filter(
      (row) => row.revisionKind !== "diagnosis_enhancement",
    );
    questionFailure.artifacts[0].status = "active";
    questionFailure.artifacts[0].activatedAt = at;
    questionFailure.diagnosisCheckpoints = [];
    expect(fingerprintReportV4CommerceAuthority(questionFailure)).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it("rejects ambiguous active artifacts, wrong pointers, and half-bound enhancement", () => {
    const twoActive = validInput();
    twoActive.artifacts[1].status = "active";
    twoActive.artifacts[1].activatedAt = at;
    expect(() => fingerprintReportV4CommerceAuthority(twoActive)).toThrow(
      /active/i,
    );

    const wrongPointer = validInput();
    wrongPointer.scope.activeArtifactRevisionIdHash =
      wrongPointer.scope.coreArtifactRevisionIdHash;
    expect(() => fingerprintReportV4CommerceAuthority(wrongPointer)).toThrow(
      /active|pointer/i,
    );

    const halfBound = validInput();
    halfBound.scope.enhancementArtifactRevisionIdHash = null;
    expect(() => fingerprintReportV4CommerceAuthority(halfBound)).toThrow(
      /all-or-none|enhancement/i,
    );

    const danglingBaselinePointer = validInput();
    danglingBaselinePointer.phase = "baseline";
    danglingBaselinePointer.scope.activeArtifactRevisionIdHash =
      danglingBaselinePointer.scope.coreArtifactRevisionIdHash;
    danglingBaselinePointer.scope.coreArtifactRevisionIdHash = null;
    danglingBaselinePointer.scope.enhancementJobIdHash = null;
    danglingBaselinePointer.scope.enhancementArtifactRevisionIdHash = null;
    danglingBaselinePointer.jobs = danglingBaselinePointer.jobs.filter(
      (row) => row.reason !== "v4_diagnosis_enhancement",
    );
    danglingBaselinePointer.dispatches = danglingBaselinePointer.dispatches.filter(
      (row) => row.jobId !== "enhancement-job-1",
    );
    danglingBaselinePointer.artifacts = [];
    danglingBaselinePointer.diagnosisCheckpoints = [];
    expect(() =>
      fingerprintReportV4CommerceAuthority(danglingBaselinePointer),
    ).toThrow(/active.*pointer/i);
  });

  it("rejects duplicate natural keys even when row IDs differ", () => {
    const duplicateDispatch = validInput();
    duplicateDispatch.dispatches.push({
      ...duplicateDispatch.dispatches[0],
      id: "another-dispatch",
    });
    expect(() =>
      fingerprintReportV4CommerceAuthority(duplicateDispatch),
    ).toThrow(/duplicate dispatch/i);

    const duplicateQuestion = validInput();
    duplicateQuestion.questionCheckpoints[1].questionIdentityHash =
      duplicateQuestion.questionCheckpoints[0].questionIdentityHash;
    expect(() =>
      fingerprintReportV4CommerceAuthority(duplicateQuestion),
    ).toThrow(/duplicate question content identity/i);
  });

  it("fails closed on mixed report, order, job, artifact, and delivery lineage", () => {
    const mutations: Array<(value: ReturnType<typeof validInput>) => void> = [
      (v) => void (v.orders[0].reportIdHash = hash("other-report")),
      (v) => void (v.paymentEvents[0].orderIdHash = hash("other-order")),
      (v) => void (v.jobs[0].reportId = "other-report"),
      (v) => void (v.dispatches[0].jobId = "other-job"),
      (v) => void (v.creditAuthority.creditLedger[0].jobIdHash = hash("other-job")),
      (v) => void (v.emailAuthority.deliveries[0].reportIdHash = hash("other-report")),
      (v) => void (v.emailAuthority.events[0].deliveryIdHash = hash("other-delivery")),
      (v) => void (v.accessTokens[0].reportIdHash = hash("other-report")),
      (v) => void (v.artifacts[0].jobIdHash = hash("other-job")),
      (v) => void (v.questionCheckpoints[0].jobIdHash = hash("other-job")),
      (v) =>
        void (v.diagnosisCheckpoints[0].coreArtifactRevisionIdHash =
          hash("other-artifact")),
    ];

    for (const mutate of mutations) {
      const changed = validInput();
      mutate(changed);
      expect(() => fingerprintReportV4CommerceAuthority(changed)).toThrow(
        /lineage|scope/i,
      );
    }
  });

  it("binds credit, provider, currency, and locale across collections", () => {
    const mutations: Array<(value: ReturnType<typeof validInput>) => void> = [
      (v) => {
        const core = v.jobs.find((row) => row.reason === "standard");
        if (!core) throw new Error("fixture missing core job");
        core.creditReservationId = "other-credit";
      },
      (v) => void (v.paymentEvents[0].provider = "stripe"),
      (v) => void (v.creditAuthority.refunds[0].provider = "stripe"),
      (v) => void (v.creditAuthority.refunds[0].currency = "CNY"),
      (v) => void (v.jobs[0].locale = "zh"),
      (v) => void (v.emailAuthority.deliveries[0].locale = "zh"),
    ];

    for (const mutate of mutations) {
      const changed = validInput();
      mutate(changed);
      expect(() => fingerprintReportV4CommerceAuthority(changed)).toThrow(
        /lineage|reservation/i,
      );
    }
  });

  it("requires at most one full refund for the scoped order", () => {
    const wrongAmount = validInput();
    wrongAmount.creditAuthority.refunds[0].amountMinor = 999;
    expect(() => fingerprintReportV4CommerceAuthority(wrongAmount)).toThrow(
      /refund amount lineage/i,
    );

    const duplicate = validInput();
    duplicate.creditAuthority.refunds.push({
      ...duplicate.creditAuthority.refunds[0],
      idHash: hash("refund-2"),
      providerRefundIdHash: hash("provider-refund-2"),
      idempotencyKeyHash: hash("refund-idempotency-2"),
    });
    expect(() => fingerprintReportV4CommerceAuthority(duplicate)).toThrow(
      /at most one full refund/i,
    );
  });

  it("rejects a self-consistent authority that misses a declared scope anchor", () => {
    for (const anchor of [
      "siteSnapshotIdHash",
      "configSnapshotIdHash",
      "questionSetIdHash",
    ] as const) {
      const changed = validInput();
      changed.scope[anchor] = hash(`wrong-${anchor}`);
      expect(() => fingerprintReportV4CommerceAuthority(changed)).toThrow(
        /scope|lineage/i,
      );
    }
  });

  it("seals a legitimate pre-run baseline with explicit null scope", () => {
    const input = validInput();
    input.phase = "baseline";
    input.scope.preAdmissionJobIdHash = null;
    input.scope.coreJobIdHash = null;
    input.scope.enhancementJobIdHash = null;
    input.scope.coreArtifactRevisionIdHash = null;
    input.scope.enhancementArtifactRevisionIdHash = null;
    input.scope.siteSnapshotIdHash = null;
    input.scope.configSnapshotIdHash = null;
    input.scope.questionSetIdHash = null;
    input.scope.activeArtifactRevisionIdHash = null;
    input.orders[0].fulfillmentJobIdHash = null;
    input.orders[0].siteSnapshotIdHash = null;
    input.orders[0].businessQuestionSetIdHash = null;
    input.orders[0].fulfillmentStatus = "queued";
    input.orders[0].deliveryStatus = "sent";
    input.orders[0].fulfilledAt = null;
    input.jobs = [];
    input.dispatches = [];
    input.creditAuthority.accessKeys[0].status = "active";
    input.creditAuthority.creditLedger[0].jobIdHash = null;
    input.creditAuthority.creditLedger[0].status = "reserved";
    input.creditAuthority.creditLedger[0].settledAt = null;
    input.creditAuthority.refunds = [];
    input.emailAuthority.deliveries[0].templateType = "payment_confirmed";
    input.emailAuthority.deliveries[0].state = "sent";
    input.emailAuthority.deliveries[0].deliveredAt = null;
    input.accessTokens = [];
    input.artifacts = [];
    input.questionCheckpoints = [];
    input.diagnosisCheckpoints = [];

    expect(fingerprintReportV4CommerceAuthority(input)).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it("rejects one- or two-row baseline checkpoint sets", () => {
    for (const count of [1, 2]) {
      const input = validInput();
      input.phase = "baseline";
      input.questionCheckpoints = input.questionCheckpoints.slice(0, count);
      input.diagnosisCheckpoints = [];
      expect(() => fingerprintReportV4CommerceAuthority(input)).toThrow(
        /zero or exactly three/i,
      );
    }
  });

  it("rejects malformed capture metadata and unknown volatile fields", () => {
    expect(() =>
      fingerprintReportV4CommerceAuthority({
        ...validInput(),
        capturedAt: "2026-07-17T00:00:00Z",
      }),
    ).toThrow(/capturedAt/i);
    expect(() =>
      fingerprintReportV4CommerceAuthority({
        ...validInput(),
        updatedAt: at,
      }),
    ).toThrow(/unknown/i);
  });
});
