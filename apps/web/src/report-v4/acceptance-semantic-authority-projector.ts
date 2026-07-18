import { createHash } from "node:crypto";
import { assertReportV4AcceptanceAuthorityCaptureOrder, assertReportV4AcceptanceCompleteAuthorityPhasePayload,
  type ReportV4AcceptanceCompleteAuthorityPhasePayload } from "../db/report-v4-acceptance-authority-phase-snapshot";
import type { ReportV4AcceptanceEvent, ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import type { ReportV4ConfigSnapshotRow } from "../db/report-v4-config-snapshots";
import { compareReportV4CommerceAuthoritySnapshots } from "./report-v4-commerce-authority-comparator";
import { projectReportV4AcceptanceSemanticCheckpoints } from "./acceptance-semantic-checkpoint-projector";
import { projectReportV4SemanticRuntime } from "./acceptance-semantic-runtime-projector";
import type { ReportV4AcceptanceSemanticAuthority, ReportV4AllowedSiteRead,
  ReportV4ExpectedPageSummary } from "./acceptance-semantic-verifier";

export interface ProjectReportV4AcceptanceSemanticAuthorityInput {
  readonly scenario: ReportV4AcceptanceScenario;
  readonly events: readonly ReportV4AcceptanceEvent[];
  readonly baselinePhase: ReportV4AcceptanceCompleteAuthorityPhasePayload;
  readonly finalPhase: ReportV4AcceptanceCompleteAuthorityPhasePayload;
  readonly config: ReportV4ConfigSnapshotRow;
}

export function projectReportV4AcceptanceSemanticAuthority(
  input: ProjectReportV4AcceptanceSemanticAuthorityInput,
): ReportV4AcceptanceSemanticAuthority {
  assertReportV4AcceptanceCompleteAuthorityPhasePayload(input.baselinePhase);
  assertReportV4AcceptanceCompleteAuthorityPhasePayload(input.finalPhase);
  if (input.baselinePhase.phase !== "baseline" || input.finalPhase.phase !== "final") fail("baseline/final phases are not exact");
  assertReportV4AcceptanceAuthorityCaptureOrder(input.baselinePhase, input.finalPhase);
  assertScope(input);
  const finalLedgerEvents = assertCaptureLedgerBoundaries(input);
  const checkpoints = projectReportV4AcceptanceSemanticCheckpoints({ scenario: input.scenario,
    events: finalLedgerEvents, finalPhase: input.finalPhase });
  const runtime = projectReportV4SemanticRuntime({ config: input.config, finalPhase: input.finalPhase, events: finalLedgerEvents });
  const manifest = input.finalPhase.authorities.site_read_manifest;
  const reads = manifest.records.map((record) => projectRead(input, record));
  const byIdentity = new Map(manifest.records.map((record, index) => [record.identityHash, reads[index]!]));
  const allowedSiteReads = exactIdentityProjection(manifest.allowedIdentityHashes, byIdentity, "allowed site read");
  const requiredSiteReads = exactIdentityProjection(manifest.requiredIdentityHashes, byIdentity, "required site read")
    .map((read) => ({ ...read, terminalPhase: terminalFor(input.events, read) }));
  const pages = projectPages(input);
  const crawl = projectCrawl(input, pages.pageIds.length);
  const websiteSynthesisUnitId = uniqueUnit(input.events, "model_operation", "website_synthesis");
  const artifact = projectArtifacts(input);
  const comparison = compareReportV4CommerceAuthoritySnapshots({ baseline: input.baselinePhase.commerce,
    final: input.finalPhase.commerce, scenarioKind: input.scenario.kind });
  const commerceUnits = projectCommerceUnits(input.events, comparison.baselineFingerprint, comparison.finalFingerprint);
  const checkpoint = input.finalPhase.websiteCheckpoint;
  return Object.freeze({
    scenarioId: input.scenario.scenarioId,
    dispatch: Object.freeze({ preAdmissionJobId: required(input.scenario.preAdmissionJobId, "pre-admission job"),
      coreJobId: required(input.scenario.coreJobId, "core job"), enhancementJobId: input.scenario.enhancementJobId }),
    crawl, requiredSiteReads: Object.freeze(requiredSiteReads), allowedSiteReads: Object.freeze(allowedSiteReads),
    sourceFaultZeroClaim: checkpoints.sourceFaultZeroClaim, analyzablePageIds: pages.pageIds,
    pageSummaries: pages.summaries, websiteSynthesisUnitId,
    websiteCheckpoint: Object.freeze({ state: checkpoint.state, providerCallCount: checkpoint.providerCallCount,
      correctionCount: checkpoint.correctionCount, identityHash: checkpoint.identityHash,
      inputIdentityHash: checkpoint.inputIdentityHash, pageSummaryIdentitySetHash: checkpoint.pageSummaryIdentitySetHash }),
    questions: checkpoints.questions, diagnoses: checkpoints.diagnoses, oversizedTokenProbe: runtime.oversizedTokenProbe,
    coreArtifact: artifact.core, enhancementArtifact: artifact.enhancement,
    commerce: Object.freeze({ baselineUnitId: commerceUnits.baseline, finalUnitId: commerceUnits.final, comparison }),
    databaseZeroClaims: runtime.databaseZeroClaims,
    paidAt: exactPaidAt(input.baselinePhase, input.finalPhase),
  });
}

function assertCaptureLedgerBoundaries(
  input: ProjectReportV4AcceptanceSemanticAuthorityInput,
): readonly ReportV4AcceptanceEvent[] {
  const baseline = input.baselinePhase.authorities.ledger_authority;
  const final = input.finalPhase.authorities.ledger_authority;
  const baselineCount = baseline.events.length;
  const finalCount = final.events.length;
  if (baselineCount >= finalCount || input.events.length !== finalCount + 1
      || baseline.session.eventCount !== baselineCount || baseline.session.headSequence !== baselineCount
      || input.baselinePhase.session.eventCount !== baselineCount || input.baselinePhase.session.headSequence !== baselineCount
      || final.session.eventCount !== finalCount || final.session.headSequence !== finalCount
      || input.finalPhase.session.eventCount !== finalCount || input.finalPhase.session.headSequence !== finalCount) {
    fail("phase ledger capture boundary counts are not exact");
  }
  for (let index = 0; index < baselineCount; index += 1) {
    if (stable(baseline.events[index]) !== stable(final.events[index])) {
      fail("baseline ledger is not the exact unchanged prefix of the final ledger");
    }
  }
  const expectedHead = baselineCount === 0 ? "0".repeat(64) : baseline.events[baselineCount - 1]!.eventHash;
  if (baseline.session.headHash !== expectedHead || input.baselinePhase.session.headHash !== expectedHead) {
    fail("baseline ledger head does not seal its exact final-ledger prefix");
  }
  const finalHead = final.events[finalCount - 1]!.eventHash;
  if (final.session.headHash !== finalHead || input.finalPhase.session.headHash !== finalHead) {
    fail("final ledger head does not seal its exact raw prefix");
  }
  assertCommerceBoundary(input.events[baselineCount], "commerce-baseline", input.baselinePhase.commerce.fingerprint,
    "baseline");
  assertCommerceBoundary(input.events[finalCount], "commerce-final", input.finalPhase.commerce.fingerprint, "final");
  assertPostFinalChainEvent(input.events[finalCount]!, input, finalCount, finalHead);
  return input.events.slice(0, finalCount);
}

function assertCommerceBoundary(event: ReportV4AcceptanceEvent | undefined, unitId: string,
  fingerprint: string, label: string): void {
  if (!event || event.kind !== "commerce_fingerprint" || event.operation !== "commerce" || event.unitId !== unitId
      || event.attempt !== 0 || event.phase !== "observed"
      || stable(event.details) !== stable({ fingerprint })) {
    fail(`${label} ledger is not immediately followed by its exact commerce fingerprint event`);
  }
}

function assertPostFinalChainEvent(event: ReportV4AcceptanceEvent,
  input: ProjectReportV4AcceptanceSemanticAuthorityInput, finalCount: number, finalHead: string): void {
  const sequence = finalCount + 1;
  const detailsCanonical = `{"fingerprint": "${input.finalPhase.commerce.fingerprint}"}`;
  const idempotencyKey = shaParts([input.scenario.sessionId, input.scenario.scenarioId, "commerce_fingerprint",
    "commerce", "commerce-final", "0", "observed"]);
  if (event.sessionId !== input.scenario.sessionId || event.scenarioId !== input.scenario.scenarioId
      || event.sequence !== sequence || event.prevHash !== finalHead || event.idempotencyKey !== idempotencyKey
      || event.detailsCanonical !== detailsCanonical
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(event.occurredAtCanonical)
      || event.occurredAt.toISOString() !== `${event.occurredAtCanonical.slice(0, 23)}Z`) {
    fail("post-final commerce event envelope does not extend the exact final phase head");
  }
  const eventHash = shaParts([finalHead, idempotencyKey, String(sequence), "commerce_fingerprint", "commerce",
    "commerce-final", "0", "observed", detailsCanonical, event.occurredAtCanonical]);
  if (event.eventHash !== eventHash) fail("post-final commerce event hash is not canonical");
}

function assertScope(input: ProjectReportV4AcceptanceSemanticAuthorityInput): void {
  const { scenario, baselinePhase: baseline, finalPhase: final } = input;
  if (baseline.scenarioKind !== scenario.kind || final.scenarioKind !== scenario.kind
      || baseline.session.sessionIdHash !== sha(scenario.sessionId) || final.session.sessionIdHash !== sha(scenario.sessionId)
      || baseline.session.scenarioIdHash !== sha(scenario.scenarioId) || final.session.scenarioIdHash !== sha(scenario.scenarioId)) {
    fail("phase session/scenario scope does not bind raw scenario");
  }
  const scope = final.commerce.scope;
  for (const [actual, raw] of [[scope.reportIdHash, scenario.reportId], [scope.orderIdHash, scenario.orderId],
    [scope.preAdmissionJobIdHash, scenario.preAdmissionJobId], [scope.coreJobIdHash, scenario.coreJobId],
    [scope.enhancementJobIdHash, scenario.enhancementJobId], [scope.siteSnapshotIdHash, scenario.siteSnapshotId],
    [scope.configSnapshotIdHash, scenario.configSnapshotId], [scope.questionSetIdHash, scenario.questionSetId],
    [scope.coreArtifactRevisionIdHash, scenario.coreArtifactRevisionId],
    [scope.enhancementArtifactRevisionIdHash, scenario.enhancementArtifactRevisionId]] as const) {
    if (actual !== (raw === null ? null : sha(raw))) fail("final commerce scope does not bind raw scenario");
  }
  if (baseline.commerce.scope.reportIdHash !== scope.reportIdHash || baseline.commerce.scope.orderIdHash !== scope.orderIdHash
      || final.authorities.ledger_authority.scenario.scenarioIdHash !== sha(scenario.scenarioId)) fail("baseline/final scope differs");
}

function projectRead(input: ProjectReportV4AcceptanceSemanticAuthorityInput,
  record: ReportV4AcceptanceCompleteAuthorityPhasePayload["authorities"]["site_read_manifest"]["records"][number]): ReportV4AllowedSiteRead {
  const operation = record.mode === "raw" ? "site_raw_read" : "site_browser_read";
  const units = new Set(input.events.filter((event) => event.kind === "site_read" && event.operation === operation
    && event.attempt === record.attempt && (event.details as Record<string, unknown>).urlHash === record.urlHash
    && (event.details as Record<string, unknown>).readMode === record.mode).map((event) => event.unitId));
  if (units.size !== 1) fail(`manifest ${record.identityHash} has no unique raw event unit`);
  const unitId = [...units][0]!;
  if (record.scope.startsWith("admission_")) {
    if (record.jobIdHash !== sha(required(input.scenario.preAdmissionJobId, "pre-admission job"))
      || unitId !== `${record.scope.replace("_", "-")}:${record.mode}:${record.urlHash}`) fail("admission read unit/scope mismatch");
  } else {
    const jobId = required(input.scenario.enhancementJobId, "enhancement job");
    if (!unitId.startsWith(`${jobId}:`) || record.jobIdHash !== sha(jobId)) fail("enhancement read unit/scope mismatch");
    const tail = unitId.slice(jobId.length + 1); const separator = tail.indexOf(":");
    if (separator < 1 || record.ownerQuestionIdHash !== sha(tail.slice(0, separator))
      || record.ownerSourceIdHash !== sha(tail.slice(separator + 1))) fail("enhancement read opaque owner mismatch");
  }
  return Object.freeze({ pairBindingHash: record.pairBindingHash, unitId, mode: record.mode,
    urlHash: record.urlHash, attempt: record.attempt });
}

function projectPages(input: ProjectReportV4AcceptanceSemanticAuthorityInput): {
  pageIds: readonly string[]; summaries: readonly ReportV4ExpectedPageSummary[] } {
  const sites = input.finalPhase.authorities.site_snapshot_pages.records.filter((row) => row.analyzable);
  const summaries = input.finalPhase.authorities.page_summary_integrity.records;
  const pageIds = sites.map((site) => exactRawId(input.events.filter((event) => event.kind === "model_operation"
    && event.operation === "page_analysis").map((event) => event.unitId), site.pageIdHash, "page"));
  if (new Set(pageIds).size !== pageIds.length || summaries.length !== sites.length) fail("site/page authority exact set mismatch");
  const projected = pageIds.map((pageId) => {
    const rows = summaries.filter((row) => row.pageIdHash === sha(pageId));
    if (rows.length !== 1) fail("page summary has no exact site owner");
    return Object.freeze({ pageId, identityHash: rows[0]!.summaryIdentityHash,
      parsedHierarchyIntegrity: true as const, chunkIntegrity: true as const, sourcePositionIntegrity: true as const });
  });
  return { pageIds: Object.freeze(pageIds), summaries: Object.freeze(projected) };
}

function projectCrawl(input: ProjectReportV4AcceptanceSemanticAuthorityInput, pageCount: number) {
  const unitId = `pre-admission-crawl:${required(input.scenario.preAdmissionJobId, "pre-admission job")}`;
  const terminal = input.events.filter((event) => event.kind === "crawl_run" && event.operation === "crawl"
    && event.unitId === unitId && event.phase === "completed");
  const started = input.events.filter((event) => event.kind === "crawl_run" && event.operation === "crawl"
    && event.unitId === unitId && event.phase === "started");
  if (terminal.length !== 1 || started.length !== 1) fail("crawl has no exact started/completed raw event pair");
  const rows = input.finalPhase.authorities.site_snapshot_pages.records;
  if (rows.length === 0) fail("crawl has no site-page authority");
  const first = rows[0]!; const counts = [first.candidatePageCount, first.analyzablePageCount,
    first.excludedPageCount, first.jsDependentPageCount] as const;
  if (rows.some((row) => row.candidatePageCount !== counts[0] || row.analyzablePageCount !== counts[1]
    || row.excludedPageCount !== counts[2] || row.jsDependentPageCount !== counts[3]) || counts[1] !== pageCount) fail("crawl counts drift across site authority");
  const details = terminal[0]!.details as Record<string, unknown>;
  if (details.candidatePages !== counts[0] || details.analyzablePages !== counts[1]
      || details.excludedPages !== counts[2] || details.jsDependentPages !== counts[3]) fail("crawl raw terminal counts do not bind site authority");
  return Object.freeze({ unitId, terminalStatus: "completed" as const, candidatePages: counts[0], analyzablePages: counts[1],
    excludedPages: counts[2], jsDependentPages: counts[3] });
}

function projectArtifacts(input: ProjectReportV4AcceptanceSemanticAuthorityInput) {
  const rows = input.finalPhase.authorities.artifact_combined_payload_integrity.artifacts;
  const project = (kind: "generation" | "diagnosis_enhancement") => {
    const matches = rows.filter((row) => row.revisionKind === kind); if (matches.length !== 1) return null;
    const row = matches[0]!; const revisionId = exactRawId(input.events.filter((event) => event.kind === "html_assembly"
      || event.kind === "artifact_activation").map((event) => event.unitId), row.artifactRevisionIdHash, "artifact revision");
    const html = input.events.filter((event) => event.kind === "html_assembly" && event.unitId === revisionId
      && event.phase === "completed"); if (html.length !== 1) fail("artifact has no exact completed HTML event");
    const htmlSha256 = String((html[0]!.details as Record<string, unknown>).htmlSha256);
    return { row, revisionId, htmlSha256 };
  };
  const core = project("generation"); if (!core) fail("Core artifact authority missing");
  const coreOut = Object.freeze({ revisionId: core.revisionId, htmlSha256: core.htmlSha256,
    payloadIdentityHash: core.row.payloadIdentityHash, recomputedPayloadIdentityHash: core.row.payloadIdentityHash,
    integrityVerified: true as const });
  const enhancement = project("diagnosis_enhancement");
  return { core: coreOut, enhancement: enhancement ? Object.freeze({ revisionId: enhancement.revisionId,
    htmlSha256: enhancement.htmlSha256, payloadIdentityHash: enhancement.row.payloadIdentityHash,
    recomputedPayloadIdentityHash: enhancement.row.payloadIdentityHash, integrityVerified: true as const,
    coreAnswerContentPreserved: true as const, coreSourceContentPreserved: true as const,
    active: enhancement.row.status === "active" }) : null };
}

function projectCommerceUnits(events: readonly ReportV4AcceptanceEvent[], baseline: string, final: string) {
  const unit = (fingerprint: string) => { const matches = events.filter((event) => event.kind === "commerce_fingerprint"
    && event.operation === "commerce" && (event.details as Record<string, unknown>).fingerprint === fingerprint);
    if (matches.length !== 1) fail("commerce fingerprint has no unique raw unit"); return matches[0]!.unitId; };
  return { baseline: unit(baseline), final: unit(final) };
}

function exactPaidAt(baseline: ReportV4AcceptanceCompleteAuthorityPhasePayload,
  final: ReportV4AcceptanceCompleteAuthorityPhasePayload): Date {
  if (baseline.paidAt !== final.paidAt || baseline.paidAt !== final.commerce.orders[0]?.paidAt) fail("paidAt phase/commerce binding mismatch");
  const value = new Date(final.paidAt); if (Number.isNaN(value.getTime())) fail("paidAt is invalid"); return value;
}

function exactIdentityProjection<T>(ids: readonly string[], map: ReadonlyMap<string, T>, label: string): T[] {
  if (new Set(ids).size !== ids.length) fail(`${label} identities are not unique`);
  return ids.map((id) => { const row = map.get(id); if (!row) fail(`${label} identity is orphaned`); return row; });
}
function terminalFor(events: readonly ReportV4AcceptanceEvent[], read: ReportV4AllowedSiteRead): "completed" | "failed" {
  const matches = events.filter((event) => event.kind === "site_read" && event.unitId === read.unitId
    && event.attempt === read.attempt && (event.phase === "completed" || event.phase === "failed"));
  if (matches.length !== 1) fail("required read has no exact terminal"); return matches[0]!.phase as "completed" | "failed";
}
function uniqueUnit(events: readonly ReportV4AcceptanceEvent[], kind: string, operation: string): string {
  const units = new Set(events.filter((event) => event.kind === kind && event.operation === operation).map((event) => event.unitId));
  if (units.size !== 1) fail(`${operation} has no unique raw unit`); return [...units][0]!;
}
function exactRawId(ids: readonly string[], hash: string, label: string): string {
  const matches = [...new Set(ids)].filter((id) => sha(id) === hash); if (matches.length !== 1) fail(`${label} opaque ID is not exact`); return matches[0]!;
}
function required(value: string | null, label: string): string { if (!value) fail(`${label} is missing`); return value; }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function shaParts(values: readonly string[]): string { return sha(values.join("\x1f")); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value); }
function fail(message: string): never { throw new Error(`Report V4 semantic authority projector: ${message}`); }
