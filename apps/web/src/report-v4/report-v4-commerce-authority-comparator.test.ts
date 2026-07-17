import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ReportV4CommerceAuthoritySnapshot } from "../db/report-v4-commerce-authority-snapshot";
import {
  compareReportV4CommerceAuthoritySnapshots,
  type ReportV4CommerceScenarioKind,
} from "./report-v4-commerce-authority-comparator";
import { fingerprintNormalizedReportV4CommerceAuthority } from "./report-v4-commerce-authority-fingerprint";
import {
  normalizeReportV4CommerceDispatches,
  normalizeReportV4CommerceJobs,
} from "./report-v4-commerce-job-authority";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const baselineAt = "2026-07-17T00:00:00.000Z";
const finalAt = "2026-07-17T00:01:00.000Z";

/** @requirement GEO-V4-COMMERCE-01 */
describe("Report V4 commerce baseline/final comparator", () => {
  it.each(["success", "diagnosis_failure", "question_failure"] as const)(
    "accepts the exact protected %s topology",
    (scenarioKind) => {
      const result = compare(scenarioKind);
      expect(result.violations).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.verified).toEqual({
        baselineFingerprint: true,
        finalFingerprint: true,
        distinctFingerprints: true,
        captureOrder: true,
        immutableLineage: true,
        componentAuthority: true,
        finalTopology: true,
      });
      expect(result.components.jobs.delta).toBe(
        scenarioKind === "question_failure" ? 0 : 1,
      );
    },
  );

  it("rejects arbitrary stored fingerprints and typed-field tampering", () => {
    const baseline = snapshot("success", "baseline");
    const final = snapshot("success", "final");
    baseline.fingerprint = hash("arbitrary");
    expect(compareWith("success", baseline, final).verified.baselineFingerprint).toBe(false);

    const typedTamper = snapshot("success", "final");
    typedTamper.orders[0].amountMinor = 1001;
    const result = compareWith("success", snapshot("success", "baseline"), typedTamper);
    expect(result.valid).toBe(false);
    expect(result.violations.some((violation) => violation.code === "fingerprint_mismatch")).toBe(true);
  });

  it.each([
    ["order", (value: MutableSnapshot) => value.orders.pop()],
    ["job", (value: MutableSnapshot) => value.jobs.pop()],
    ["dispatch", (value: MutableSnapshot) => value.dispatches.pop()],
    ["credit", (value: MutableSnapshot) => value.creditAuthority.creditLedger.pop()],
    ["email", (value: MutableSnapshot) => value.emailAuthority.deliveries.pop()],
    ["token", (value: MutableSnapshot) => value.accessTokens.pop()],
    ["artifact", (value: MutableSnapshot) => value.artifacts.pop()],
    ["checkpoint", (value: MutableSnapshot) => value.questionCheckpoints.pop()],
  ] as const)("rejects missing final %s authority", (_label, mutate) => {
    const final = snapshot("success", "final");
    mutate(final);
    expect(compareWith("success", snapshot("success", "baseline"), final).valid).toBe(false);
  });

  it("rejects extra jobs, dispatches, credits, emails, tokens, artifacts, and checkpoints", () => {
    const mutators: Array<(value: MutableSnapshot) => void> = [
      (value) => value.orders.push({ ...value.orders[0], idHash: hash("extra-order") }),
      (value) => value.jobs.push({ ...value.jobs[0], idHash: hash("extra-job") }),
      (value) => value.dispatches.push({ ...value.dispatches[0], idHash: hash("extra-dispatch"), jobIdHash: hash("extra-job") }),
      (value) => value.creditAuthority.accessKeys.push({ ...value.creditAuthority.accessKeys[0], idHash: hash("extra-access"), keyPrefixHash: hash("extra-prefix") }),
      (value) => value.creditAuthority.creditLedger.push({ ...value.creditAuthority.creditLedger[0], idHash: hash("extra-credit"), idempotencyKeyHash: hash("extra-credit-idem") }),
      (value) => value.emailAuthority.deliveries.push({ ...value.emailAuthority.deliveries[0], idHash: hash("extra-email"), businessIdempotencyKeyHash: hash("extra-email-idem"), providerEmailIdHash: hash("extra-provider-email") }),
      (value) => value.accessTokens.push({ ...value.accessTokens[0], idHash: hash("extra-token"), tokenPrefixHash: hash("extra-token-prefix") }),
      (value) => value.artifacts.push({ ...value.artifacts[0], idHash: hash("extra-artifact") }),
      (value) => value.diagnosisCheckpoints.push({ ...value.diagnosisCheckpoints[0], identityHash: hash("extra-diagnosis") }),
    ];
    for (const mutate of mutators) {
      const final = snapshot("success", "final");
      mutate(final);
      expect(compareWith("success", snapshot("success", "baseline"), final).valid).toBe(false);
    }
  });

  it("reports duplicate natural keys rather than trusting distinct row ids", () => {
    const final = snapshot("success", "final");
    final.paymentEvents.push({
      ...final.paymentEvents[0],
      idHash: hash("second-payment-row"),
    });
    const result = compareWith("success", snapshot("success", "baseline"), final);
    expect(result.valid).toBe(false);
    expect(result.components.paymentEvents.final.duplicateCount).toBe(1);
  });

  it("rejects every commercial state transition after Core activation", () => {
    const baseline = snapshot("success", "baseline");
    baseline.orders[0].deliveryStatus = "sent";
    baseline.emailAuthority.deliveries[0].state = "sent";
    baseline.emailAuthority.deliveries[0].deliveredAt = null;
    reseal(baseline);
    expect(compareWith("success", baseline, snapshot("success", "final")).valid).toBe(false);

    const regressed = snapshot("success", "final");
    regressed.orders[0].deliveryStatus = "queued";
    regressed.emailAuthority.deliveries[0].state = "queued";
    regressed.emailAuthority.deliveries[0].sentAt = null;
    regressed.emailAuthority.deliveries[0].deliveredAt = null;
    reseal(regressed);
    const result = compareWith("success", snapshot("success", "baseline"), regressed);
    expect(result.valid).toBe(false);
    expect(result.components.orders.violations.length).toBeGreaterThan(0);
  });

  it("rejects new and duplicate refunds after Core activation", () => {
    const baseline = snapshot("diagnosis_failure", "baseline");
    const final = snapshot("diagnosis_failure", "final");
    final.orders[0].refundStatus = "pending";
    final.creditAuthority.refunds.push(refundRow("refund-1", "pending"));
    reseal(final);
    expect(compareWith("diagnosis_failure", baseline, final).valid).toBe(false);

    final.creditAuthority.refunds.push(refundRow("refund-2", "pending"));
    expect(compareWith("diagnosis_failure", baseline, final).valid).toBe(false);
  });

  it.each([
    ["orders", (value: MutableSnapshot) => void (value.orders[0].amountMinor = 1001)],
    ["paymentEvents", (value: MutableSnapshot) => void (value.paymentEvents[0].eventType = "payment_intent.updated")],
    ["accessKeys", (value: MutableSnapshot) => void (value.creditAuthority.accessKeys[0].status = "revoked")],
    ["creditLedger", (value: MutableSnapshot) => {
      value.creditAuthority.creditLedger[0].status = "refunded";
      value.creditAuthority.creditLedger[0].refundedAt = finalAt;
    }],
    ["refunds", (value: MutableSnapshot) => value.creditAuthority.refunds.push(refundRow("late-refund", "pending"))],
    ["emailDeliveries", (value: MutableSnapshot) => void (value.emailAuthority.deliveries[0].attempts = 2)],
    ["emailEvents", (value: MutableSnapshot) => void (value.emailAuthority.events[0].eventType = "email.opened")],
    ["accessTokens", (value: MutableSnapshot) => void (value.accessTokens[0].lastUsedAt = finalAt)],
    ["questionCheckpoints", (value: MutableSnapshot) => void (value.questionCheckpoints[0].sourceCount = 2)],
  ] as const)("rejects a sealed post-baseline %s mutation", (component, mutate) => {
    const final = snapshot("success", "final");
    mutate(final);
    reseal(final);
    const result = compareWith("success", snapshot("success", "baseline"), final);
    expect(result.valid).toBe(false);
    expect(result.components[component].violations.length).toBeGreaterThan(0);
  });

  it("rejects missing and duplicate payment authority", () => {
    const missing = snapshot("success", "final");
    missing.paymentEvents.pop();
    expect(compareWith("success", snapshot("success", "baseline"), missing).valid).toBe(false);

    const duplicate = snapshot("success", "final");
    duplicate.paymentEvents.push({ ...duplicate.paymentEvents[0], idHash: hash("duplicate-payment") });
    expect(compareWith("success", snapshot("success", "baseline"), duplicate).valid).toBe(false);
  });

  it("rejects equal whole fingerprints and reversed capture order", () => {
    const baseline = snapshot("question_failure", "baseline");
    const final = snapshot("question_failure", "final");
    final.fingerprint = baseline.fingerprint;
    let result = compareWith("question_failure", baseline, final);
    expect(result.valid).toBe(false);
    expect(result.verified.distinctFingerprints).toBe(false);

    const reversed = snapshot("question_failure", "final");
    reversed.capturedAt = "2026-07-16T23:59:59.999Z";
    reseal(reversed);
    result = compareWith("question_failure", snapshot("question_failure", "baseline"), reversed);
    expect(result.valid).toBe(false);
    expect(result.verified.captureOrder).toBe(false);
  });

  it("rejects equal capture timestamps", () => {
    const final = snapshot("question_failure", "final");
    final.capturedAt = baselineAt;
    reseal(final);
    expect(
      compareWith(
        "question_failure",
        snapshot("question_failure", "baseline"),
        final,
      ).verified.captureOrder,
    ).toBe(false);
  });

  it("rejects an unknown runtime scenario kind", () => {
    const result = compareReportV4CommerceAuthoritySnapshots({
      baseline: snapshot("success", "baseline"),
      final: snapshot("success", "final"),
      scenarioKind: "unknown" as never,
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((violation) => violation.code === "invalid_scenario_kind")).toBe(true);
  });

  it.each([
    ["pre-admission", "v4_pre_admission", "queued", "queued"],
    ["core", "standard", "synthesizing", "running"],
    ["enhancement", "v4_diagnosis_enhancement", "synthesizing", "repair_wait"],
  ] as const)("rejects a non-terminal %s lane", (_label, reason, stage, executionState) => {
    const final = snapshot("success", "final");
    const job = final.jobs.find((candidate) => candidate.reason === reason)!;
    job.stage = stage;
    job.executionState = executionState;
    job.currentPhase = "report_build";
    job.progress = 50;
    reseal(final);
    const result = compareWith("success", snapshot("success", "baseline"), final);
    expect(result.valid).toBe(false);
    expect(result.violations.some((violation) => violation.code === "job_terminal_state")).toBe(true);
  });

  it("rejects the wrong final scenario topology even with an official seal", () => {
    const final = snapshot("success", "final");
    final.diagnosisCheckpoints[0].state = "failed";
    final.diagnosisCheckpoints[0].diagnosisContentHash = null;
    reseal(final);
    const result = compareWith("success", snapshot("success", "baseline"), final);
    expect(result.valid).toBe(false);
    expect(result.verified.finalTopology).toBe(false);
  });
});

type MutableSnapshot = ReturnType<typeof snapshot>;

function compare(kind: ReportV4CommerceScenarioKind) {
  return compareWith(kind, snapshot(kind, "baseline"), snapshot(kind, "final"));
}

function compareWith(
  scenarioKind: ReportV4CommerceScenarioKind,
  baseline: MutableSnapshot,
  final: MutableSnapshot,
) {
  return compareReportV4CommerceAuthoritySnapshots({ baseline, final, scenarioKind });
}

function snapshot(kind: ReportV4CommerceScenarioKind, phase: "baseline" | "final") {
  const reportIdHash = hash("report");
  const orderIdHash = hash("order");
  const snapshotIdHash = hash("snapshot");
  const configIdHash = hash("config");
  const questionSetIdHash = hash("questions");
  const preJobIdHash = hash("job-pre");
  const coreJobIdHash = hash("job-core");
  const enhancementJobIdHash = phase === "final" && kind !== "question_failure" ? hash("job-enhancement") : null;
  const coreArtifactIdHash = hash("artifact-core");
  const enhancementArtifactIdHash = phase === "final" && kind !== "question_failure" ? hash("artifact-enhancement") : null;
  const accessKeyIdHash = hash("access-key");
  const creditIdHash = hash("credit");
  const jobs = [job("job-pre", "v4_pre_admission"), job("job-core", "standard")];
  if (kind === "question_failure") jobs[1].stage = "completed_limited";
  const dispatches = [dispatch("dispatch-pre", "job-pre"), dispatch("dispatch-core", "job-core")];
  if (enhancementJobIdHash) {
    const enhancementJob = job("job-enhancement", "v4_diagnosis_enhancement");
    enhancementJob.plannedPages = 0;
    enhancementJob.successfulPages = 0;
    jobs.push(enhancementJob);
    dispatches.push(dispatch("dispatch-enhancement", "job-enhancement"));
  }
  const questions = ([1, 2, 3] as const).map((ordinal) => {
    const unavailable = kind === "question_failure" && ordinal === 2;
    return {
      identityHash: hash(`question-checkpoint-${ordinal}`), reportIdHash, jobIdHash: coreJobIdHash,
      questionSetIdHash, questionIdHash: hash(`question-${ordinal}`), snapshotIdHash, ordinal,
      state: unavailable ? "unavailable" as const : "answered" as const,
      questionIdentityHash: hash(`question-identity-${ordinal}`), modelConfigIdentityHash: hash("model-config"),
      inputIdentityHash: hash(`question-input-${ordinal}`), providerCallCount: unavailable ? 0 as const : 1 as const,
      sourcePayloadHash: hash(`source-${ordinal}`), sourceCount: unavailable ? 0 : 1,
      answerContentHash: unavailable ? null : hash(`answer-${ordinal}`), terminalFingerprint: hash(`question-terminal-${ordinal}`),
    };
  });
  const diagnoses = enhancementJobIdHash
    ? ([1, 2, 3] as const).map((ordinal) => {
        const failed = kind === "diagnosis_failure" && ordinal === 2;
        return {
          identityHash: hash(`diagnosis-checkpoint-${ordinal}`), reportIdHash, enhancementJobIdHash,
          coreArtifactRevisionIdHash: coreArtifactIdHash, configSnapshotIdHash: configIdHash,
          questionSetIdHash, questionIdHash: hash(`question-${ordinal}`), snapshotIdHash, ordinal,
          state: failed ? "failed" as const : "completed" as const, inputIdentityHash: hash(`diagnosis-input-${ordinal}`),
          providerCallCount: failed ? 2 as const : 1 as const, sourceAuditPayloadHash: hash(`audit-${ordinal}`),
          sourceAuditCount: 1, diagnosisContentHash: failed ? null : hash(`diagnosis-${ordinal}`),
          terminalFingerprint: hash(`diagnosis-terminal-${ordinal}`),
        };
      })
    : [];
  const base = {
    phase,
    scenarioKind: kind,
    capturedAt: phase === "baseline" ? baselineAt : finalAt,
    scope: {
      reportIdHash, orderIdHash, siteSnapshotIdHash: snapshotIdHash, configSnapshotIdHash: configIdHash,
      questionSetIdHash, preAdmissionJobIdHash: preJobIdHash, coreJobIdHash, enhancementJobIdHash,
      coreArtifactRevisionIdHash: coreArtifactIdHash, enhancementArtifactRevisionIdHash: enhancementArtifactIdHash,
      activeArtifactRevisionIdHash: enhancementArtifactIdHash ?? coreArtifactIdHash,
    },
    orders: [{
      idHash: orderIdHash, provider: "airwallex" as const, providerCheckoutIdHash: hash("checkout"), providerPaymentIdHash: hash("payment"),
      reportIdHash, siteKeyHash: hash("site"), siteSnapshotIdHash: snapshotIdHash, fulfillmentJobIdHash: coreJobIdHash,
      productCode: "recommendation_forensics_v1" as const, businessQuestionSetIdHash: questionSetIdHash,
      fulfillmentMethodology: "two_stage_geo_report_v4" as const, recommendationReportVersion: 4 as const,
      catalogVersion: "catalog-v4", termsVersion: "terms-v4", refundPolicyVersion: "refund-v4", reportLocale: "en" as const,
      currency: "USD" as const, amountMinor: 1000, taxAmountMinor: 0, paymentStatus: "paid" as const,
      fulfillmentStatus: "completed" as const, refundStatus: "not_required" as "not_required" | "pending" | "submitted" | "refunded" | "failed",
      deliveryStatus: "delivered" as "not_queued" | "queued" | "sent" | "delivered" | "bounced" | "failed",
      courtesyNonBillable: false, paidAt: baselineAt, fulfillmentDeadlineAt: finalAt, fulfilledAt: baselineAt, refundedAt: null,
    }],
    paymentEvents: [{
      idHash: hash("payment-event"), provider: "airwallex" as const, providerEventIdHash: hash("provider-event"),
      eventType: "payment_intent.succeeded", payloadHash: hash("payment-payload"), selectedFieldsHash: hash("selected"),
      processingStatus: "processed" as const, orderIdHash, providerCreatedAt: baselineAt, processedAt: baselineAt, errorCode: null,
    }],
    jobs: normalizeReportV4CommerceJobs(jobs),
    dispatches: normalizeReportV4CommerceDispatches(dispatches),
    creditAuthority: {
      accessKeys: [{ idHash: accessKeyIdHash, keyPrefixHash: hash("prefix"), paymentOrderIdHash: orderIdHash, status: "exhausted" as "active" | "exhausted" | "revoked", creditsRemaining: 0, expiresAt: finalAt, revokedAt: null }],
      creditLedger: [{ idHash: creditIdHash, accessKeyIdHash, reportIdHash, jobIdHash: coreJobIdHash, paymentOrderIdHash: orderIdHash, idempotencyKeyHash: hash("credit-idem"), credits: 1, status: "settled" as "reserved" | "settled" | "refunded", reservedAt: baselineAt, settledAt: baselineAt, refundedAt: null }],
      refunds: [] as Array<ReturnType<typeof refundRow>>,
    },
    emailAuthority: {
      deliveries: [{ idHash: hash("delivery"), orderIdHash, reportIdHash, templateType: "report_ready" as const, templateVersion: "v4", locale: "en" as const, recipientRefHash: hash("recipient"), provider: "resend" as const, providerEmailIdHash: hash("provider-email"), businessIdempotencyKeyHash: hash("email-idem"), state: "delivered" as "queued" | "sent" | "delivered" | "bounced" | "failed", attempts: 1, failureCode: null, lastProviderEventAt: baselineAt, sentAt: baselineAt, deliveredAt: baselineAt }],
      events: [{ idHash: hash("email-event"), providerEventIdHash: hash("provider-email-event"), providerEmailIdHash: hash("provider-email"), deliveryIdHash: hash("delivery"), provider: "resend" as const, eventType: "email.delivered", processingStatus: "processed" as const, payloadHash: hash("email-payload"), providerCreatedAt: baselineAt, errorCode: null }],
    },
    accessTokens: [{ idHash: hash("token"), reportIdHash, tokenPrefixHash: hash("token-prefix"), artifactScope: "combined_geo_report_v4" as const, expiresAt: finalAt, lastUsedAt: null, revokedAt: null }],
    artifacts: [artifact("core", reportIdHash, orderIdHash, coreJobIdHash, configIdHash, coreArtifactIdHash, phase === "final" && kind !== "question_failure" ? "ready" : "active")],
    questionCheckpoints: questions,
    diagnosisCheckpoints: diagnoses,
    fingerprint: "",
    transactionProfile: { isolation: "repeatable read" as const, readOnly: true as const },
  };
  if (enhancementArtifactIdHash && enhancementJobIdHash)
    base.artifacts.push(artifact("enhancement", reportIdHash, orderIdHash, enhancementJobIdHash, configIdHash, enhancementArtifactIdHash, "active", coreArtifactIdHash));
  const result = base as unknown as MutableReportV4Snapshot;
  reseal(result);
  return result;
}

type MutableReportV4Snapshot = {
  -readonly [K in keyof ReportV4CommerceAuthoritySnapshot]: ReportV4CommerceAuthoritySnapshot[K] extends readonly (infer R)[] ? R[] : ReportV4CommerceAuthoritySnapshot[K];
};

function job(id: string, reason: "standard" | "v4_pre_admission" | "v4_diagnosis_enhancement") {
  return { id, reportId: "report", siteSnapshotId: reason === "standard" ? "snapshot" : null, tier: "deep", productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4", recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4", businessQuestionSetId: reason === "v4_pre_admission" ? null : "questions", locale: "en", reason, stage: "completed", executionState: "completed", currentPhase: "terminalization", checkpointRevision: 1, phaseAttempt: 0, resumeGeneration: 0, progress: 100, plannedPages: 1, successfulPages: 1, failedPages: 0, attempts: 1, maxAttempts: 3, errorCode: null, publicError: null, creditReservationId: reason === "standard" ? "credit" : null };
}

function dispatch(id: string, jobId: string) {
  return { id, jobId, tier: "deep", schemaVersion: 1, state: "published", attempts: 1, publishedAt: baselineAt, lastErrorCode: null };
}

function artifact(kind: "core" | "enhancement", reportIdHash: string, orderIdHash: string, jobIdHash: string, configSnapshotIdHash: string, idHash: string, status: "active" | "ready", sourceArtifactRevisionIdHash: string | null = null) {
  return { idHash, reportIdHash, orderIdHash, jobIdHash, configSnapshotIdHash, correctionIdHash: null, replacementFulfillmentIdHash: null, sourceArtifactRevisionIdHash, revisionKind: kind === "core" ? "generation" as const : "diagnosis_enhancement" as const, revision: kind === "core" ? 1 : 2, artifactContract: "combined_geo_report_v4" as const, status, payloadIdentityHash: hash(`${kind}-payload`), htmlSha256: hash(`${kind}-html`), pdfSha256: null, pdfStorageKeyPresent: false, readyAt: baselineAt, activatedAt: status === "active" ? baselineAt : null };
}

function refundRow(id: string, state: "pending" | "submitted" | "succeeded" | "failed") {
  return { idHash: hash(id), orderIdHash: hash("order"), provider: "airwallex" as const, providerRefundIdHash: state === "pending" ? null : hash(`${id}-provider`), reason: "completed_limited" as const, amountMinor: 1000, currency: "USD" as const, state, idempotencyKeyHash: hash(`${id}-idem`), attempts: state === "pending" ? 0 : 1, failureCode: null, submittedAt: state === "pending" ? null : finalAt, succeededAt: state === "succeeded" ? finalAt : null };
}

function reseal(snapshot: MutableReportV4Snapshot): void {
  snapshot.fingerprint = fingerprintNormalizedReportV4CommerceAuthority({
    phase: snapshot.phase, capturedAt: snapshot.capturedAt, scope: snapshot.scope, orders: snapshot.orders,
    paymentEvents: snapshot.paymentEvents, jobs: snapshot.jobs, dispatches: snapshot.dispatches,
    creditAuthority: snapshot.creditAuthority, emailAuthority: snapshot.emailAuthority, accessTokens: snapshot.accessTokens,
    artifacts: snapshot.artifacts, questionCheckpoints: snapshot.questionCheckpoints, diagnosisCheckpoints: snapshot.diagnosisCheckpoints,
  });
}
