import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import { assertReportV4AcceptanceCompleteAuthorityPhasePayload,
  type ReportV4AcceptanceCompleteAuthorityPhasePayload } from "../db/report-v4-acceptance-authority-phase-snapshot";
import { completePayload, reseal, stableZero } from "../db/report-v4-acceptance-authority-phase-snapshot.test-fixture";
import type { ReportV4AcceptanceEvent } from "../db/report-v4-acceptance-ledger";
import { createReportV4CommerceAuthoritySnapshotPair } from "./report-v4-commerce-authority-comparator.test-fixture";
import { buildReportV4OversizedTokenAcceptanceProbe, REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID } from "../worker/report-v4-oversized-token-acceptance-probe";
import { resolveReportV4LockedModelRuntime } from "./model-runtime-config";
import { projectReportV4SemanticRuntime, type ProjectReportV4SemanticRuntimeInput } from "./acceptance-semantic-runtime-projector";

describe("Report V4 semantic runtime projector", () => {
  it("projects a probe from a genuinely validated complete final payload", () => {
    const input = runtimeInput();
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(input.finalPhase)).not.toThrow();
    expect(projectReportV4SemanticRuntime(input)).toMatchObject({
      databaseZeroClaims: { pdfInvocationCount: 0, replacementFulfillmentCount: 0, correctionFulfillmentCount: 0,
        fullRerunCount: 0, extraSnapshotCountAfterPayment: 0 },
    });
  });

  it.each(["wrong order", "missing rejected", "provider call", "token sum", "unit hash", "raw event hash"])(
    "rejects probe/ledger tamper: %s", (kind) => {
      const input = runtimeInput();
      const events = input.events as MutableEvent[];
      const ledger = input.finalPhase.authorities.ledger_authority.events as MutableLedger[];
      if (kind === "wrong order") [events[0], events[1]] = [events[1]!, events[0]!];
      if (kind === "missing rejected") events.pop();
      if (kind === "provider call") (events[0]!.details as Record<string, unknown>).providerCall = true;
      if (kind === "token sum") (events[0]!.details as Record<string, unknown>).inputTokens = 1;
      if (kind === "unit hash") ledger[0]!.unitIdHash = "0".repeat(64);
      if (kind === "raw event hash") events[0]!.eventHash = "f".repeat(64);
      expect(() => projectReportV4SemanticRuntime(input)).toThrow();
    });

  it.each(["config scope", "zero lineage", "pdf attempt", "database zero"])("rejects authority tamper: %s", (kind) => {
    const input = runtimeInput();
    if (kind === "config scope") input.config.id = "foreign-config";
    if (kind === "zero lineage") input.finalPhase.authorities.zero_database_effect_counts.lineage.configSnapshotIdHash = hash("foreign");
    if (kind === "pdf attempt") input.finalPhase.authorities.prohibited_operation_guard_authority.counters[0]!.attemptCount = 1;
    if (kind === "database zero") input.finalPhase.authorities.zero_database_effect_counts.semanticZeroProjection.databaseSupported.fullRerunCount = 1;
    expect(() => projectReportV4SemanticRuntime(input)).toThrow();
  });

  it("rejects an exact resealed PDF ledger event when all guard counters remain zero", () => {
    const input = runtimeInput(); appendPdfEvent(input);
    expect(() => projectReportV4SemanticRuntime(input)).toThrow(/zero guard counters|prohibited-operation/i);
  });

  it("ignores foreign probe and prohibited events after verifying the complete global prefix", () => {
    const input = runtimeInput();
    const foreignScenario = "33333333-3333-4333-8333-333333333333";
    const probeDetails = input.events[0]!.details;
    appendEvent(input, foreignScenario, { kind: "model_operation", operation: "page_analysis",
      unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID, attempt: 0, phase: "started", details: probeDetails }, "foreign-probe-started");
    appendEvent(input, foreignScenario, { kind: "model_operation", operation: "page_analysis",
      unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID, attempt: 0, phase: "rejected", details: probeDetails }, "foreign-probe-rejected");
    appendEvent(input, foreignScenario, { kind: "prohibited_operation", operation: "pdf",
      unitId: "pdf_readiness_chromium", attempt: 0, phase: "started", details: {} }, "foreign-pdf");
    expect(projectReportV4SemanticRuntime(input).oversizedTokenProbe).toBeDefined();
  });
});

type MutableEvent = { -readonly [K in keyof ReportV4AcceptanceEvent]: ReportV4AcceptanceEvent[K] };
type MutableLedger = { sequence: number; fingerprint: string; eventHash: string; unitIdHash: string };
type MutableDeep<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer R)[] ? MutableDeep<R>[]
  : T[K] extends object ? MutableDeep<T[K]> : T[K] };
type MutableInput = ProjectReportV4SemanticRuntimeInput & { config: ProjectReportV4SemanticRuntimeInput["config"] & { id: string };
  finalPhase: MutableDeep<ReportV4AcceptanceCompleteAuthorityPhasePayload>; events: MutableEvent[] };

function runtimeInput(): MutableInput {
  const payload = structuredClone(completePayload()) as MutableDeep<ReportV4AcceptanceCompleteAuthorityPhasePayload>;
  const commerce = createReportV4CommerceAuthoritySnapshotPair("question_failure").final;
  payload.phase = "final"; payload.capturedAt = commerce.capturedAt; payload.commerce = commerce;
  for (const key of ["artifact_combined_payload_integrity", "site_read_manifest", "ledger_authority",
    "prohibited_operation_guard_authority", "zero_database_effect_counts"] as const) payload.authorities[key].phase = "final";
  payload.authorities.zero_database_effect_counts.capturedAt = commerce.capturedAt;
  payload.authorities.artifact_combined_payload_integrity.capturedAt = commerce.capturedAt;
  Object.assign(payload.authorities.prohibited_operation_guard_authority.run, {
    state: "completed", completedAt: commerce.capturedAt,
  });
  const collections = { paymentEventIds: commerce.paymentEvents, accessKeyIds: commerce.creditAuthority.accessKeys,
    creditLedgerIds: commerce.creditAuthority.creditLedger, refundIds: commerce.creditAuthority.refunds,
    emailDeliveryIds: commerce.emailAuthority.deliveries, emailEventIds: commerce.emailAuthority.events,
    accessTokenIds: commerce.accessTokens };
  payload.authorities.zero_database_effect_counts.allowedCommerceTopology = Object.fromEntries(
    Object.entries(collections).map(([name, rows]) => [name, { count: rows.length,
      idSetHash: hash(`raw-${name}`), authorityRowsHash: hash(stableZero(rows)) }]));
  const config = { id: "config", modelProfile: profilePayload,
    modelProfileId: profilePayload.profileId, modelProfileHash: hash(stable(profilePayload)),
    reportProfileId: "report", reportProfile: { profileId: "report" },
    reportProfileHash: hash(stable({ profileId: "report" })) } as unknown as MutableInput["config"];
  payload.authorities.zero_database_effect_counts.lineage.configSnapshotIdHash = hash(config.id);
  const recipe = buildReportV4OversizedTokenAcceptanceProbe(resolveReportV4LockedModelRuntime(profilePayload));
  const details = { providerCall: false, retry: false, budgetOutcome: "rejected",
    inputTokens: recipe.evidence.estimatedSystemTokens + recipe.evidence.estimatedInputTokens,
    outputTokens: recipe.evidence.reservedOutputTokens };
  const events = makeProbeEvents(details);
  const projected = events.map((event) => ({ sequence: event.sequence, fingerprint: event.idempotencyKey,
    scenarioIdHash: hash(event.scenarioId), kind: event.kind, operation: event.operation, unitIdHash: hash(event.unitId),
    attempt: event.attempt, eventPhase: event.phase, details: event.details, previousHash: event.prevHash,
    eventHash: event.eventHash, occurredAt: event.occurredAt.toISOString() }));
  payload.authorities.ledger_authority.events = projected;
  const head = events.at(-1)!.eventHash;
  Object.assign(payload.session, { headSequence: events.length, headHash: head, eventCount: events.length });
  Object.assign(payload.authorities.ledger_authority.session, { headSequence: events.length, headHash: head, eventCount: events.length });
  reseal(payload, "artifact_combined_payload_integrity");
  reseal(payload, "site_read_manifest"); reseal(payload, "ledger_authority");
  reseal(payload, "prohibited_operation_guard_authority"); reseal(payload, "zero_database_effect_counts");
  return { config, finalPhase: payload, events };
}

function makeProbeEvents(details: Record<string, unknown>): MutableEvent[] {
  let previousHash = "0".repeat(64);
  return (["started", "rejected"] as const).map((phase, index) => {
    const sequence = index + 1; const occurredAt = new Date(`2026-07-17T00:00:0${sequence}.000Z`);
    const eventHash = hash(`${previousHash}:${sequence}:${phase}`);
    const event = { sessionId: "11111111-1111-4111-8111-111111111111",
      scenarioId: "22222222-2222-4222-8222-222222222222", sequence, kind: "model_operation",
      operation: "page_analysis", unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID, attempt: 0,
      phase, details, detailsCanonical: stable(details), idempotencyKey: hash(`probe-${sequence}`),
      prevHash: previousHash, eventHash, occurredAt, occurredAtCanonical: occurredAt.toISOString() } as MutableEvent;
    previousHash = eventHash; return event;
  });
}

function appendPdfEvent(input: MutableInput): void {
  appendEvent(input, input.events[0]!.scenarioId, { kind: "prohibited_operation", operation: "pdf",
    unitId: "pdf_readiness_chromium", attempt: 0, phase: "started", details: {} }, "pdf-event");
}

function appendEvent(input: MutableInput, scenarioId: string,
  value: Pick<ReportV4AcceptanceEvent, "kind" | "operation" | "unitId" | "attempt" | "phase" | "details">,
  identity: string): void {
  const previous = input.events.at(-1)!; const sequence = previous.sequence + 1;
  const occurredAt = new Date(Date.parse("2026-07-17T00:00:00.000Z") + sequence * 1000);
  const eventHash = hash(`${previous.eventHash}:${sequence}:${identity}`);
  const event = { sessionId: previous.sessionId, scenarioId, sequence, ...value,
    detailsCanonical: stable(value.details), idempotencyKey: hash(identity),
    prevHash: previous.eventHash, eventHash, occurredAt, occurredAtCanonical: occurredAt.toISOString() } as MutableEvent;
  input.events.push(event);
  input.finalPhase.authorities.ledger_authority.events.push({ sequence, fingerprint: event.idempotencyKey,
    scenarioIdHash: hash(event.scenarioId), kind: event.kind, operation: event.operation, unitIdHash: hash(event.unitId),
    attempt: event.attempt, eventPhase: event.phase, details: event.details, previousHash: event.prevHash,
    eventHash, occurredAt: occurredAt.toISOString() });
  Object.assign(input.finalPhase.session, { headSequence: sequence, headHash: eventHash, eventCount: sequence });
  Object.assign(input.finalPhase.authorities.ledger_authority.session,
    { headSequence: sequence, headHash: eventHash, eventCount: sequence });
  reseal(input.finalPhase, "ledger_authority");
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value); }
