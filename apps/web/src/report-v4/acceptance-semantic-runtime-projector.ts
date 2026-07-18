import { createHash } from "node:crypto";
import type { ReportV4ConfigSnapshotRow } from "../db/report-v4-config-snapshots";
import type { ReportV4AcceptanceCompleteAuthorityPhasePayload } from "../db/report-v4-acceptance-authority-phase-snapshot";
import type { ReportV4AcceptanceEvent } from "../db/report-v4-acceptance-ledger";
import { REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES } from "./prohibited-operation-manifest";
import { resolveReportV4LockedModelRuntime } from "./model-runtime-config";
import { buildReportV4OversizedTokenAcceptanceProbe, REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID } from "../worker/report-v4-oversized-token-acceptance-probe";
import { assertReportV4AcceptanceCompleteAuthorityPhasePayload } from "../db/report-v4-acceptance-authority-phase-snapshot";

export interface ReportV4SemanticRuntimeProjection {
  readonly oversizedTokenProbe: ReturnType<typeof buildReportV4OversizedTokenAcceptanceProbe>["evidence"];
  readonly databaseZeroClaims: { readonly pdfInvocationCount: 0; readonly replacementFulfillmentCount: 0; readonly correctionFulfillmentCount: 0; readonly fullRerunCount: 0; readonly extraSnapshotCountAfterPayment: 0 };
}
export interface ProjectReportV4SemanticRuntimeInput {
  readonly config: ReportV4ConfigSnapshotRow;
  readonly finalPhase: ReportV4AcceptanceCompleteAuthorityPhasePayload;
  readonly events: readonly ReportV4AcceptanceEvent[];
}

export function projectReportV4SemanticRuntime(input: ProjectReportV4SemanticRuntimeInput): ReportV4SemanticRuntimeProjection {
  if (input.finalPhase.phase !== "final") throw new Error("Runtime projection requires the final phase.");
  assertReportV4AcceptanceCompleteAuthorityPhasePayload(input.finalPhase);
  const configHash = hash(input.config.id);
  if (input.config.modelProfileId !== (input.config.modelProfile as { profileId?: string }).profileId || input.config.modelProfileHash !== hash(stable(input.config.modelProfile)) || input.config.reportProfileId !== (input.config.reportProfile as { profileId?: string }).profileId || input.config.reportProfileHash !== hash(stable(input.config.reportProfile))) throw new Error("Immutable config snapshot identity is invalid.");
  const scope = input.finalPhase.commerce.scope;
  const lineage = input.finalPhase.authorities.zero_database_effect_counts.lineage;
  const lineagePairs: ReadonlyArray<readonly [string, string | null]> = [["sessionIdHash", input.finalPhase.session.sessionIdHash], ["scenarioIdHash", input.finalPhase.session.scenarioIdHash], ["reportIdHash", scope.reportIdHash], ["orderIdHash", scope.orderIdHash], ["preAdmissionJobIdHash", scope.preAdmissionJobIdHash], ["coreJobIdHash", scope.coreJobIdHash], ["enhancementJobIdHash", scope.enhancementJobIdHash], ["configSnapshotIdHash", configHash], ["questionSetIdHash", scope.questionSetIdHash], ["coreArtifactRevisionIdHash", scope.coreArtifactRevisionIdHash], ["enhancementArtifactRevisionIdHash", scope.enhancementArtifactRevisionIdHash], ["activeArtifactRevisionIdHash", scope.activeArtifactRevisionIdHash]];
  if (lineagePairs.some(([key, value]) => lineage[key as keyof typeof lineage] !== value)) throw new Error("Final zero-effects lineage does not match final phase authority.");
  const runtime = resolveReportV4LockedModelRuntime(input.config.modelProfile);
  const recipe = buildReportV4OversizedTokenAcceptanceProbe(runtime);
  const projectedEvents = input.finalPhase.authorities.ledger_authority.events;
  if (input.events.length !== projectedEvents.length
      || new Set(input.events.map((event) => event.sequence)).size !== input.events.length
      || new Set(input.events.map((event) => event.idempotencyKey)).size !== input.events.length
      || new Set(projectedEvents.map((event) => event.sequence)).size !== projectedEvents.length
      || new Set(projectedEvents.map((event) => event.fingerprint)).size !== projectedEvents.length) {
    throw new Error("Raw and projected ledger events must be unique exact-length arrays.");
  }
  let previousHash = "0".repeat(64);
  for (let index = 0; index < input.events.length; index += 1) {
    const event = input.events[index]!; const record = projectedEvents[index]!;
    if (event.sequence !== index + 1 || record.sequence !== index + 1 || event.prevHash !== previousHash
        || record.previousHash !== previousHash || hash(event.sessionId) !== input.finalPhase.session.sessionIdHash
        || hash(event.scenarioId) !== input.finalPhase.session.scenarioIdHash || record.eventHash !== event.eventHash
        || record.fingerprint !== event.idempotencyKey || record.kind !== event.kind || record.operation !== event.operation
        || record.unitIdHash !== hash(event.unitId) || record.scenarioIdHash !== hash(event.scenarioId)
        || record.attempt !== event.attempt || record.eventPhase !== event.phase
        || stable(record.details) !== stable(event.details) || record.occurredAt !== event.occurredAt.toISOString()) {
      throw new Error("Raw event arrays are not an exact contiguous projected ledger hash chain.");
    }
    previousHash = event.eventHash;
  }
  const probeEvents = input.events.filter((event) => event.kind === "model_operation" && event.operation === "page_analysis" && event.unitId === REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID && event.attempt === 0);
  if (probeEvents.length !== 2 || probeEvents[0]!.phase !== "started" || probeEvents[1]!.phase !== "rejected" || probeEvents[0]!.sequence >= probeEvents[1]!.sequence) throw new Error("Oversized-token probe must have exact started then rejected events.");
  const expected = recipe.evidence;
  for (const event of probeEvents) {
    const details = event.details as { providerCall?: unknown; retry?: unknown; budgetOutcome?: unknown; inputTokens?: unknown; outputTokens?: unknown };
    if (details.providerCall !== false || details.retry !== false || details.budgetOutcome !== "rejected" || details.inputTokens !== expected.estimatedSystemTokens + expected.estimatedInputTokens || details.outputTokens !== expected.reservedOutputTokens) throw new Error("Oversized-token probe event details do not match the locked recipe.");
    const records = input.finalPhase.authorities.ledger_authority.events.filter((candidate) => candidate.sequence === event.sequence);
    const record = records.length === 1 ? records[0] : undefined;
    if (!record || record.eventHash !== event.eventHash || record.fingerprint !== event.idempotencyKey || record.kind !== event.kind || record.operation !== event.operation || record.unitIdHash !== hash(event.unitId) || record.scenarioIdHash !== input.finalPhase.session.scenarioIdHash || record.attempt !== event.attempt || record.eventPhase !== event.phase || stable(record.details) !== stable(event.details)) throw new Error("Oversized-token event is not bound to its verified ledger record.");
  }
  const pdfSites: readonly string[] = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.filter((entry) => entry.operation === "pdf").map((entry) => entry.guardSite);
  const counters = input.finalPhase.authorities.prohibited_operation_guard_authority.counters.filter((counter) => counter.operation === "pdf");
  if (counters.length !== pdfSites.length || new Set(counters.map((counter) => counter.guardSite)).size !== pdfSites.length || counters.some((counter) => !pdfSites.includes(counter.guardSite) || counter.attemptCount !== 0 || counter.attemptedAt !== null || counter.matchingEventFingerprint !== null)) throw new Error("PDF guard authority is not the exact four-site zero set.");
  const prohibitedOperations = new Set<string>(REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.map((entry) => entry.operation));
  if (input.events.some((event) => event.kind === "prohibited_operation" && prohibitedOperations.has(event.operation))
      || projectedEvents.some((event) => event.kind === "prohibited_operation" && prohibitedOperations.has(event.operation))) {
    throw new Error("Zero guard counters conflict with a prohibited-operation ledger event.");
  }
  const zero = input.finalPhase.authorities.zero_database_effect_counts.semanticZeroProjection.databaseSupported;
  if (Object.values(zero).some((value) => value !== 0)) throw new Error("Database zero-effects authority contains a nonzero claim.");
  return Object.freeze({ oversizedTokenProbe: expected, databaseZeroClaims: Object.freeze({ pdfInvocationCount: 0, ...zero }) });
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`; return JSON.stringify(value); }
