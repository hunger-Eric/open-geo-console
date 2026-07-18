import { createHash } from "node:crypto";
import type { ReportV4CommerceAuthoritySnapshot } from "../db/report-v4-commerce-authority-snapshot";
import type { ReportV4CommerceScenarioKind } from "./report-v4-commerce-authority-comparator";
import { fingerprintNormalizedReportV4CommerceAuthority } from "./report-v4-commerce-authority-fingerprint";
import {
  normalizeReportV4CommerceDispatches,
  normalizeReportV4CommerceJobs,
} from "./report-v4-commerce-job-authority";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const baselineAt = "2026-07-17T00:00:00.000Z";
const finalAt = "2026-07-17T00:01:00.000Z";

export type MutableReportV4CommerceAuthoritySnapshot = {
  -readonly [K in keyof ReportV4CommerceAuthoritySnapshot]: ReportV4CommerceAuthoritySnapshot[K] extends readonly (infer R)[]
    ? R[]
    : ReportV4CommerceAuthoritySnapshot[K];
};

export function createReportV4CommerceAuthoritySnapshotPair(
  kind: ReportV4CommerceScenarioKind,
): Readonly<{
  baseline: MutableReportV4CommerceAuthoritySnapshot;
  final: MutableReportV4CommerceAuthoritySnapshot;
}> {
  return {
    baseline: createSnapshot(kind, "baseline"),
    final: createSnapshot(kind, "final"),
  };
}

export function createReportV4CommerceRefundAuthority(
  id: string,
  state: "pending" | "submitted" | "succeeded" | "failed",
) {
  return {
    idHash: hash(id),
    orderIdHash: hash("order"),
    provider: "airwallex" as const,
    providerRefundIdHash: state === "pending" ? null : hash(`${id}-provider`),
    reason: "completed_limited" as const,
    amountMinor: 1000,
    currency: "USD" as const,
    state,
    idempotencyKeyHash: hash(`${id}-idem`),
    attempts: state === "pending" ? 0 : 1,
    failureCode: null,
    submittedAt: state === "pending" ? null : finalAt,
    succeededAt: state === "succeeded" ? finalAt : null,
  };
}

export function resealReportV4CommerceAuthoritySnapshot(
  snapshot: MutableReportV4CommerceAuthoritySnapshot,
): void {
  snapshot.fingerprint = fingerprintNormalizedReportV4CommerceAuthority({
    phase: snapshot.phase,
    capturedAt: snapshot.capturedAt,
    scope: snapshot.scope,
    orders: snapshot.orders,
    paymentEvents: snapshot.paymentEvents,
    jobs: snapshot.jobs,
    dispatches: snapshot.dispatches,
    creditAuthority: snapshot.creditAuthority,
    emailAuthority: snapshot.emailAuthority,
    accessTokens: snapshot.accessTokens,
    artifacts: snapshot.artifacts,
    questionCheckpoints: snapshot.questionCheckpoints,
    diagnosisCheckpoints: snapshot.diagnosisCheckpoints,
  });
}

function createSnapshot(
  kind: ReportV4CommerceScenarioKind,
  phase: "baseline" | "final",
): MutableReportV4CommerceAuthoritySnapshot {
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
          sourceAuditCount: 1, sourceAuditRecords: [{ questionIdHash: hash(`question-${ordinal}`),
            sourceIdHash: hash(`source-${ordinal}`), canonicalUrlHash: hash(`source-url-${ordinal}`),
            status: "available" as const, summaryHash: hash(`source-summary-${ordinal}`) }],
          diagnosisContentHash: failed ? null : hash(`diagnosis-${ordinal}`),
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
      refunds: [] as Array<ReturnType<typeof createReportV4CommerceRefundAuthority>>,
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
  const result = base as unknown as MutableReportV4CommerceAuthoritySnapshot;
  resealReportV4CommerceAuthoritySnapshot(result);
  return result;
}

function job(id: string, reason: "standard" | "v4_pre_admission" | "v4_diagnosis_enhancement") {
  return { id, reportId: "report", siteSnapshotId: reason === "standard" ? "snapshot" : null, tier: "deep", productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4", recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4", businessQuestionSetId: reason === "v4_pre_admission" ? null : "questions", locale: "en", reason, stage: "completed", executionState: "completed", currentPhase: "terminalization", checkpointRevision: 1, phaseAttempt: 0, resumeGeneration: 0, progress: 100, plannedPages: 1, successfulPages: 1, failedPages: 0, attempts: 1, maxAttempts: 3, errorCode: null, publicError: null, creditReservationId: reason === "standard" ? "credit" : null };
}

function dispatch(id: string, jobId: string) {
  return { id, jobId, tier: "deep", schemaVersion: 1, state: "published", attempts: 1, publishedAt: baselineAt, lastErrorCode: null };
}

function artifact(kind: "core" | "enhancement", reportIdHash: string, orderIdHash: string, jobIdHash: string, configSnapshotIdHash: string, idHash: string, status: "active" | "ready", sourceArtifactRevisionIdHash: string | null = null) {
  return { idHash, reportIdHash, orderIdHash, jobIdHash, configSnapshotIdHash, correctionIdHash: null, replacementFulfillmentIdHash: null, sourceArtifactRevisionIdHash, revisionKind: kind === "core" ? "generation" as const : "diagnosis_enhancement" as const, revision: kind === "core" ? 1 : 2, artifactContract: "combined_geo_report_v4" as const, status, payloadIdentityHash: hash(`${kind}-payload`), htmlSha256: hash(`${kind}-html`), pdfSha256: null, pdfStorageKeyPresent: false, readyAt: baselineAt, activatedAt: status === "active" ? baselineAt : null };
}
