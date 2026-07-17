import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  compareReportV4CommerceAuthoritySnapshots,
  type ReportV4CommerceScenarioKind,
} from "./report-v4-commerce-authority-comparator";
import {
  createReportV4CommerceAuthoritySnapshotPair,
  createReportV4CommerceRefundAuthority,
  resealReportV4CommerceAuthoritySnapshot,
  type MutableReportV4CommerceAuthoritySnapshot,
} from "./report-v4-commerce-authority-comparator.test-fixture";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
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
    final.paymentEvents.push({ ...final.paymentEvents[0], idHash: hash("second-payment-row") });
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
    const baseline = snapshot("question_failure", "baseline");
    const final = snapshot("question_failure", "final");
    final.capturedAt = baseline.capturedAt;
    reseal(final);
    expect(compareWith("question_failure", baseline, final).verified.captureOrder).toBe(false);
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

type MutableSnapshot = MutableReportV4CommerceAuthoritySnapshot;
const reseal = resealReportV4CommerceAuthoritySnapshot;
const refundRow = createReportV4CommerceRefundAuthority;

function compare(kind: ReportV4CommerceScenarioKind) {
  const pair = createReportV4CommerceAuthoritySnapshotPair(kind);
  return compareWith(kind, pair.baseline, pair.final);
}

function compareWith(
  scenarioKind: ReportV4CommerceScenarioKind,
  baseline: MutableSnapshot,
  final: MutableSnapshot,
) {
  return compareReportV4CommerceAuthoritySnapshots({ baseline, final, scenarioKind });
}

function snapshot(
  kind: ReportV4CommerceScenarioKind,
  phase: "baseline" | "final",
): MutableSnapshot {
  return createReportV4CommerceAuthoritySnapshotPair(kind)[phase];
}
