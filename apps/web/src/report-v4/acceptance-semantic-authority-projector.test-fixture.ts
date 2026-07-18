import { createHash } from "node:crypto";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import type { ReportV4AcceptanceEvent, ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import type { ReportV4AcceptanceLedgerAuthorityEventRecord } from "../db/report-v4-acceptance-ledger-guard-authority";
import type { ReportV4AcceptanceSiteReadManifestAuthority, ReportV4AcceptanceSiteReadManifestAuthorityRecord } from "../db/report-v4-site-read-manifest";
import type { ReportV4ArtifactPayloadAuthorityRecord } from "../db/report-v4-artifact-authority";
import type { ReportV4CommerceAuthoritySnapshot } from "../db/report-v4-commerce-authority-snapshot";
import type { ReportV4AcceptanceCompleteAuthorityPhasePayload } from "../db/report-v4-acceptance-authority-phase-snapshot";
import { completePayload, reseal, stableZero } from "../db/report-v4-acceptance-authority-phase-snapshot.test-fixture";
import { createReportV4CommerceAuthoritySnapshotPair, resealReportV4CommerceAuthoritySnapshot } from "./report-v4-commerce-authority-comparator.test-fixture";
import { buildReportV4OversizedTokenAcceptanceProbe, REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID } from "../worker/report-v4-oversized-token-acceptance-probe";
import { resolveReportV4LockedModelRuntime } from "./model-runtime-config";
import type { ProjectReportV4AcceptanceSemanticCheckpointsInput } from "./acceptance-semantic-checkpoint-projector";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";
const REPORT = "report"; const ORDER = "order"; const CORE = "job-core"; const ENHANCEMENT = "job-enhancement";
const SNAPSHOT = "snapshot"; const CONFIG = "config"; const QUESTION_SET = "questions";
const CORE_ARTIFACT = "artifact-core"; const ENHANCEMENT_ARTIFACT = "artifact-enhancement";
const QUESTIONS = ["question-1", "question-2", "question-3"] as const;
const SOURCES = ["source-1", "source-2", "source-3"] as const;

export type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
  ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
export type MutableInput = Mutable<ProjectReportV4AcceptanceSemanticCheckpointsInput>;

export function makeSemanticCheckpointFixture(kind: "success" | "diagnosis_failure" | "question_failure") {
  const events: ReportV4AcceptanceEvent[] = [];
  const questionCheckpoints: Mutable<ReportV4CommerceAuthoritySnapshot["questionCheckpoints"][number]>[] = [];
  const diagnosisCheckpoints: Mutable<ReportV4CommerceAuthoritySnapshot["diagnosisCheckpoints"][number]>[] = [];
  const manifestRecords: ReportV4AcceptanceSiteReadManifestAuthorityRecord[] = [];
  const hasEnhancement = kind !== "question_failure";
  for (const [index, questionId] of QUESTIONS.entries()) {
    const ordinal = (index + 1) as 1 | 2 | 3;
    const questionFault = kind === "question_failure" && ordinal === 2;
    const questionIdentity = sha(`question-checkpoint-${ordinal}`);
    const questionState = questionFault ? "unavailable" as const : "answered" as const;
    const questionCalls = questionFault ? 2 as const : 1 as const;
    if (!questionFault) addModelPair(events, "question_answer", questionId, 1, "completed");
    events.push(checkpointEvent("question_answer", questionIdentity, questionState, sha(`question-terminal-${ordinal}`), events.length + 1));
    questionCheckpoints.push({ identityHash: questionIdentity, reportIdHash: sha(REPORT), jobIdHash: sha(CORE),
      questionSetIdHash: sha(QUESTION_SET), questionIdHash: sha(questionId), snapshotIdHash: sha(SNAPSHOT), ordinal,
      state: questionState, questionIdentityHash: sha(`question-identity-${ordinal}`), modelConfigIdentityHash: sha("model"),
      inputIdentityHash: sha(`question-input-${ordinal}`), providerCallCount: questionCalls,
      sourcePayloadHash: sha(`source-${ordinal}`), sourceCount: questionFault ? 0 : 1,
      sourceRecords: questionFault ? [] : [{ questionIdHash: sha(questionId), sourceIdHash: sha(SOURCES[index]),
        titleHash: sha(`source-title-${ordinal}`), canonicalUrlHash: sha(`source-url-${ordinal}`),
        citedTextHash: sha(`source-cited-${ordinal}`), retrievalStatus: "not_checked" }],
      answerContentHash: questionFault ? null : sha(`answer-${ordinal}`), terminalFingerprint: sha(`question-terminal-${ordinal}`) });

    if (!hasEnhancement) continue;
    const sourceId = SOURCES[index];
    const sourceFault = kind === "success" && ordinal === 2;
    const diagnosisFault = kind === "diagnosis_failure" && ordinal === 2;
    const diagnosisIdentity = sha(`diagnosis-checkpoint-${ordinal}`);
    const diagnosisState = diagnosisFault ? "failed" as const : "completed" as const;
    const diagnosisCalls = diagnosisFault ? 2 as const : 1 as const;
    const urlHash = sha(`source-url-${ordinal}`);
    if (!sourceFault) {
      const unitId = `${ENHANCEMENT}:${questionId}:${sourceId}`;
      addSitePair(events, unitId, urlHash);
      manifestRecords.push(manifestRecord(questionId, sourceId, urlHash));
    }
    if (!diagnosisFault) addModelPair(events, "source_diagnosis", `${ENHANCEMENT}:${questionId}`, 1, "completed");
    events.push(checkpointEvent("source_diagnosis", diagnosisIdentity, diagnosisState,
      sha(`diagnosis-terminal-${ordinal}`), events.length + 1));
    diagnosisCheckpoints.push({ identityHash: diagnosisIdentity, reportIdHash: sha(REPORT),
      enhancementJobIdHash: sha(ENHANCEMENT), coreArtifactRevisionIdHash: sha(CORE_ARTIFACT),
      configSnapshotIdHash: sha(CONFIG), questionSetIdHash: sha(QUESTION_SET), questionIdHash: sha(questionId),
      snapshotIdHash: sha(SNAPSHOT), ordinal, state: diagnosisState, inputIdentityHash: sha(`diagnosis-input-${ordinal}`),
      providerCallCount: diagnosisCalls, sourceAuditPayloadHash: sha(`audit-${ordinal}`), sourceAuditCount: 1,
      sourceAuditRecords: [{ questionIdHash: sha(questionId), sourceIdHash: sha(sourceId), canonicalUrlHash: urlHash,
        status: sourceFault ? "inaccessible" : "available", summaryHash: sourceFault ? null : sha(`source-summary-${ordinal}`) }],
      diagnosisContentHash: diagnosisFault ? null : sha(`diagnosis-${ordinal}`),
      terminalFingerprint: sha(`diagnosis-terminal-${ordinal}`) });
  }
  {
    const urlHash = sha("admission-url"); const unitId = `admission-page:raw:${urlHash}`;
    for (const phase of ["started", "completed"] as const) events.push(makeEvent({ kind: "site_read",
      operation: "site_raw_read", unitId, attempt: 0, phase,
      details: { urlHash, readMode: "raw", networkPerformed: true } }, events.length + 1));
    manifestRecords.push({ identityHash: sha("manifest-admission"), reportIdHash: sha(REPORT), jobIdHash: sha("job-pre"),
      scope: "admission_page", purpose: "page", urlHash, mode: "raw", attempt: 0,
      pairBindingHash: sha("pair-admission"), ownerQuestionIdHash: null, ownerSourceIdHash: null,
      networkPerformed: true, terminalPhase: "completed", semanticState: "terminal",
      startedAt: "2026-07-18T00:00:00.000Z", terminalAt: "2026-07-18T00:00:01.000Z" });
  }
  const faultUnit = kind === "question_failure" ? `${CORE}:question-2`
    : kind === "diagnosis_failure" ? `${ENHANCEMENT}:question-2` : `${ENHANCEMENT}:question-2:source-2`;
  const faultKind = kind === "success" ? "independent_source_read_failure" as const : kind;
  const faultCount = kind === "success" ? 1 : 2;
  for (let occurrence = 1; occurrence <= faultCount; occurrence += 1) {
    events.push(makeEvent({ kind: "fault_injection", operation: faultKind, unitId: faultUnit,
      attempt: occurrence as 1 | 2, phase: "consumed", details: { fault: faultKind, occurrence,
        baselineFingerprint: sha("baseline") } }, events.length + 1));
  }
  const faults = events.splice(events.length - faultCount, faultCount);
  const targetIndex = events.findIndex((event) => kind === "question_failure"
    ? event.kind === "checkpoint_terminal" && event.operation === "question_answer" && event.unitId === sha("question-checkpoint-2")
    : event.operation === "source_diagnosis" && (event.unitId === `${ENHANCEMENT}:question-2`
      || event.unitId === sha("diagnosis-checkpoint-2")));
  events.splice(targetIndex, 0, ...faults);
  resequence(events);
  manifestRecords.sort((left, right) => left.identityHash.localeCompare(right.identityHash));
  const scenario = scenarioFixture(kind);
  const commerce = commerceFixture(kind, questionCheckpoints, diagnosisCheckpoints);
  Object.assign(scenario, { state: "sealed", finalFingerprint: commerce.fingerprint });
  appendCompletionEvents(events, kind, commerce);
  const siteReadManifest = { contractVersion: "report-v4-acceptance-site-read-manifest-authority-v1" as const, phase: "final" as const,
    scenarioKind: kind, sessionIdHash: sha(SESSION), scenarioIdHash: sha(SCENARIO), reportIdHash: sha(REPORT),
    preAdmissionJobIdHash: sha("job-pre"), enhancementJobIdHash: hasEnhancement ? sha(ENHANCEMENT) : null,
    records: manifestRecords, requiredIdentityHashes: manifestRecords.map((row) => row.identityHash),
    allowedIdentityHashes: manifestRecords.map((row) => row.identityHash), authorityHash: sha("manifest") };
  const input: ProjectReportV4AcceptanceSemanticCheckpointsInput = {
    scenario,
    events,
    finalPhase: completeFinalPhase(kind, commerce, mapLedger(events.slice(0, -1)), siteReadManifest,
      artifactFixture(kind), events.slice(0, -1)),
  };
  const finalPhase = input.finalPhase as unknown as Mutable<ReportV4AcceptanceCompleteAuthorityPhasePayload>;
  const site = finalPhase.authorities.site_snapshot_pages.records[0]!;
  Object.assign(site, { scenarioIdHash: sha(SCENARIO), reportIdHash: sha(REPORT), coreJobIdHash: sha(CORE), snapshotIdHash: sha(SNAPSHOT),
    candidatePageCount: 1, selectedPageCount: 1, analyzablePageCount: 1, excludedPageCount: 0, jsDependentPageCount: 0,
    pageIdHash: sha("page-1"), ordinal: 1, analyzable: true });
  finalPhase.authorities.site_snapshot_pages.recordCount = 1;
  const summary = finalPhase.authorities.page_summary_integrity.records[0]!;
  Object.assign(summary, { scenarioIdHash: sha(SCENARIO), reportIdHash: sha(REPORT), coreJobIdHash: sha(CORE), snapshotIdHash: sha(SNAPSHOT),
    pageIdHash: sha("page-1"), ordinal: 1, summaryIdentityHash: sha("summary-identity"), websiteInputSetHash: sha(JSON.stringify([sha("summary-identity")])) });
  finalPhase.authorities.page_summary_integrity.recordCount = 1;
  const sealedFinalPhase = finalPhase as unknown as ReportV4AcceptanceCompleteAuthorityPhasePayload;
  reseal(sealedFinalPhase, "site_snapshot_pages"); reseal(sealedFinalPhase, "page_summary_integrity");
  reseal(sealedFinalPhase, "ledger_authority");
  return { input };
}

function appendCompletionEvents(events: ReportV4AcceptanceEvent[], kind: "success" | "diagnosis_failure" | "question_failure",
  commerce: ReportV4CommerceAuthoritySnapshot): void {
  events.unshift(makeEvent({ kind: "v4_dispatch", operation: "v4_dispatch", unitId: "job-pre", attempt: 0, phase: "observed", details: {} }, 0));
  events.splice(1, 0, makeEvent({ kind: "crawl_run", operation: "crawl", unitId: "pre-admission-crawl:job-pre", attempt: 0, phase: "started", details: { candidatePages: 0, analyzablePages: 0, excludedPages: 0, jsDependentPages: 0 } }, 0));
  events.splice(2, 0, makeEvent({ kind: "crawl_run", operation: "crawl", unitId: "pre-admission-crawl:job-pre", attempt: 0, phase: "completed", details: { candidatePages: 1, analyzablePages: 1, excludedPages: 0, jsDependentPages: 0 } }, 0));
  events.splice(3, 0, makeEvent({ kind: "v4_dispatch", operation: "v4_dispatch", unitId: "job-core", attempt: 0, phase: "observed", details: {} }, 0));
  addModelPair(events, "page_analysis", "page-1", 1, "completed");
  addModelPair(events, "website_synthesis", "website-synthesis", 1, "completed");
  const evidence = buildReportV4OversizedTokenAcceptanceProbe(resolveReportV4LockedModelRuntime(profilePayload)).evidence;
  const probe = { providerCall: false, retry: false, budgetOutcome: "rejected", inputTokens: evidence.estimatedSystemTokens + evidence.estimatedInputTokens, outputTokens: evidence.reservedOutputTokens };
  events.push(makeEvent({ kind: "model_operation", operation: evidence.operation, unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID, attempt: 0, phase: "started", details: probe }, 0));
  events.push(makeEvent({ kind: "model_operation", operation: evidence.operation, unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID, attempt: 0, phase: "rejected", details: probe }, 0));
  addArtifactEvents(events, CORE_ARTIFACT, "core-html");
  events.push(makeEvent({ kind: "commerce_fingerprint", operation: "commerce", unitId: "commerce-baseline", attempt: 0, phase: "observed", details: { fingerprint: createReportV4CommerceAuthoritySnapshotPair(kind).baseline.fingerprint } }, 0));
  if (kind !== "question_failure") { events.push(makeEvent({ kind: "v4_dispatch", operation: "v4_dispatch", unitId: "job-enhancement", attempt: 0, phase: "observed", details: {} }, 0)); addArtifactEvents(events, ENHANCEMENT_ARTIFACT, "enhancement-html"); }
  events.push(makeEvent({ kind: "commerce_fingerprint", operation: "commerce", unitId: "commerce-final", attempt: 0, phase: "observed", details: { fingerprint: commerce.fingerprint } }, 0));
  const rank = (event: ReportV4AcceptanceEvent): number => {
    if (event.kind === "v4_dispatch" && event.unitId === "job-pre") return 0;
    if (event.kind === "crawl_run" && event.phase === "started") return 1;
    if (event.kind === "site_read" && event.unitId.startsWith("admission-page:")) return 2;
    if (event.kind === "crawl_run" && event.phase === "completed") return 3;
    if (event.kind === "v4_dispatch" && event.unitId === "job-core") return 4;
    if (event.kind === "model_operation" && (event.operation === "page_analysis" || event.operation === "website_synthesis")) return 5;
    if (event.kind === "model_operation" && event.operation === "question_answer"
      && event.unitId !== REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID) return 6;
    if (event.kind === "commerce_fingerprint" && event.unitId === "commerce-baseline") return 12;
    if (event.kind === "v4_dispatch" && event.unitId === "job-enhancement") return 13;
    if (event.kind === "fault_injection") return kind === "question_failure" ? 6.5 : 14;
    if (event.operation === "source_diagnosis" || (event.kind === "site_read" && !event.unitId.startsWith("admission-page:"))) return 14;
    if ((event.kind === "html_assembly" || event.kind === "artifact_activation") && event.unitId === CORE_ARTIFACT) return 11;
    if (event.kind === "html_assembly" || event.kind === "artifact_activation") return 15;
    if (event.kind === "commerce_fingerprint") return 16;
    return 7;
  };
  events.sort((left, right) => rank(left) - rank(right));
  resequence(events);
}

function addArtifactEvents(events: ReportV4AcceptanceEvent[], revisionId: string, htmlSha256: string): void {
  const details = { artifactRevisionId: revisionId, htmlSha256: sha(htmlSha256) };
  events.push(makeEvent({ kind: "html_assembly", operation: revisionId === CORE_ARTIFACT ? "core_html" : "enhancement_html", unitId: revisionId, attempt: 0, phase: "started", details }, 0));
  events.push(makeEvent({ kind: "html_assembly", operation: revisionId === CORE_ARTIFACT ? "core_html" : "enhancement_html", unitId: revisionId, attempt: 0, phase: "completed", details }, 0));
  events.push(makeEvent({ kind: "artifact_activation", operation: "artifact_activation", unitId: revisionId, attempt: 0, phase: "observed", details }, 0));
}

export function makeSemanticSuccessBaselineFixture() {
  return makeSemanticBaselineFixture("success");
}

export function makeSemanticDiagnosisFailureBaselineFixture() {
  return makeSemanticBaselineFixture("diagnosis_failure");
}

export function makeSemanticQuestionFailureBaselineFixture() {
  return makeSemanticBaselineFixture("question_failure");
}

function makeSemanticBaselineFixture(kind: "success" | "diagnosis_failure" | "question_failure") {
  const fixture = makeSemanticCheckpointFixture(kind);
  const events = fixture.input.events as ReportV4AcceptanceEvent[];
  const baseline = structuredClone(fixture.input.finalPhase) as unknown as Mutable<ReportV4AcceptanceCompleteAuthorityPhasePayload>;
  const commerce = createReportV4CommerceAuthoritySnapshotPair(kind).baseline;
  if (kind === "question_failure") {
    const finalQuestions = fixture.input.finalPhase.commerce.questionCheckpoints;
    commerce.questionCheckpoints = structuredClone(finalQuestions) as typeof commerce.questionCheckpoints;
    resealReportV4CommerceAuthoritySnapshot(commerce);
    const baselineEvent = events.find((event) => event.kind === "commerce_fingerprint"
      && event.unitId === "commerce-baseline");
    if (baselineEvent) (baselineEvent as unknown as { details: Record<string, unknown> }).details = { fingerprint: commerce.fingerprint };
    resequence(events);
    const ledger = fixture.input.finalPhase.authorities.ledger_authority as unknown as Mutable<
      ReportV4AcceptanceCompleteAuthorityPhasePayload["authorities"]["ledger_authority"]>;
    ledger.events = mapLedger(events.slice(0, -1));
    Object.assign(ledger.session, { headSequence: ledger.events.length, headHash: ledger.events.at(-1)?.eventHash ?? "0".repeat(64), eventCount: ledger.events.length });
    reseal(fixture.input.finalPhase, "ledger_authority");
  }
  const boundary = events.findIndex((event) => event.kind === "commerce_fingerprint"
    && (event.details as Record<string, unknown>).fingerprint === commerce.fingerprint);
  if (boundary < 0) throw new Error("success fixture has no baseline commerce boundary");
  const baselineEvents = events.slice(0, boundary);
  baseline.phase = "baseline"; baseline.scenarioKind = kind; baseline.capturedAt = commerce.capturedAt;
  baseline.commerce = commerce as Mutable<ReportV4CommerceAuthoritySnapshot>;
  Object.assign(baseline.session, { sessionState: "collecting", scenarioState: "collecting",
    headSequence: baselineEvents.length, headHash: baselineEvents.at(-1)?.eventHash ?? "0".repeat(64), eventCount: baselineEvents.length });
  baseline.authorities.ledger_authority.phase = "baseline";
  baseline.authorities.ledger_authority.events = mapLedger(baselineEvents);
  Object.assign(baseline.authorities.ledger_authority.session, { state: "collecting", headSequence: baselineEvents.length,
    headHash: baselineEvents.at(-1)?.eventHash ?? "0".repeat(64), eventCount: baselineEvents.length });
  Object.assign(baseline.authorities.ledger_authority.scenario, { enhancementJobIdHash: null,
    enhancementArtifactRevisionIdHash: null, state: "collecting", finalFingerprint: null });
  const manifest = baseline.authorities.site_read_manifest;
  manifest.phase = "baseline"; manifest.enhancementJobIdHash = null;
  manifest.records = manifest.records.filter((record) => record.scope !== "enhancement_source");
  manifest.requiredIdentityHashes = manifest.records.map((record) => record.identityHash);
  manifest.allowedIdentityHashes = [...manifest.requiredIdentityHashes];
  const artifact = baseline.authorities.artifact_combined_payload_integrity;
  artifact.phase = "baseline"; artifact.activeArtifactRevisionIdHash = commerce.scope.coreArtifactRevisionIdHash!;
  artifact.artifacts = artifact.artifacts.filter((record) => record.revisionKind === "generation");
  for (const record of artifact.artifacts) record.status = "active";
  const guard = baseline.authorities.prohibited_operation_guard_authority;
  guard.phase = "baseline"; Object.assign(guard.run, { state: "armed", completedAt: null });
  for (const counter of guard.counters) Object.assign(counter, { attemptCount: 0, attemptedAt: null, matchingEventFingerprint: null });
  const zero = baseline.authorities.zero_database_effect_counts;
  zero.phase = "baseline"; zero.scenarioKind = kind; zero.capturedAt = commerce.capturedAt;
  Object.assign(zero.lineage, { enhancementJobIdHash: null, enhancementArtifactRevisionIdHash: null,
    activeArtifactRevisionIdHash: commerce.scope.coreArtifactRevisionIdHash! });
  const sealedBaseline = baseline as unknown as ReportV4AcceptanceCompleteAuthorityPhasePayload;
  reseal(sealedBaseline, "artifact_combined_payload_integrity"); reseal(sealedBaseline, "site_read_manifest");
  reseal(sealedBaseline, "ledger_authority"); reseal(sealedBaseline, "prohibited_operation_guard_authority");
  reseal(sealedBaseline, "zero_database_effect_counts");
  return { input: fixture.input, baselinePhase: baseline };
}

export function makeSemanticSuccessConfig() {
  const modelProfile = profilePayload;
  const reportProfile = { profileId: "report" };
  return { id: CONFIG, reportId: REPORT, orderId: ORDER, coreJobId: CORE, identityHash: sha("config"),
    modelProfileId: modelProfile.profileId, modelProfileHash: sha(stableZero(modelProfile)), modelProfile,
    reportProfileId: reportProfile.profileId, reportProfileHash: sha(stableZero(reportProfile)), reportProfile,
    createdAt: new Date("2026-07-18T00:00:00.000Z") };
}


function completeFinalPhase(kind: "success" | "diagnosis_failure" | "question_failure",
  commerce: ReportV4CommerceAuthoritySnapshot, ledgerEvents: ReportV4AcceptanceLedgerAuthorityEventRecord[],
  manifest: ReportV4AcceptanceSiteReadManifestAuthority, artifact: ReturnType<typeof artifactFixture>,
  events: readonly ReportV4AcceptanceEvent[]): ReportV4AcceptanceCompleteAuthorityPhasePayload {
  const payload = structuredClone(completePayload()) as unknown as Mutable<ReportV4AcceptanceCompleteAuthorityPhasePayload>;
  payload.phase = "final"; payload.scenarioKind = kind; payload.capturedAt = commerce.capturedAt;
  payload.commerce = commerce as Mutable<ReportV4CommerceAuthoritySnapshot>;
  payload.authorities.site_read_manifest = manifest as unknown as Mutable<ReportV4AcceptanceSiteReadManifestAuthority>;
  payload.authorities.artifact_combined_payload_integrity = artifact as unknown as Mutable<typeof artifact>;
  const headHash = events.at(-1)?.eventHash ?? "0".repeat(64);
  Object.assign(payload.session, { headSequence: events.length, headHash, eventCount: events.length });
  const ledger = payload.authorities.ledger_authority;
  ledger.phase = "final"; ledger.events = ledgerEvents;
  Object.assign(ledger.session, { headSequence: events.length, headHash, eventCount: events.length });
  Object.assign(ledger.scenario, { kind, faultKind: kind === "success" ? "independent_source_read_failure" : kind,
    faultQuestionIdHash: sha("question-2"), faultSourceIdHash: kind === "success" ? sha("source-2") : null,
    expectedFaultOccurrences: kind === "success" ? 1 : 2, enhancementJobIdHash: kind === "question_failure" ? null : sha(ENHANCEMENT),
    enhancementArtifactRevisionIdHash: kind === "question_failure" ? null : sha(ENHANCEMENT_ARTIFACT),
    baselineFingerprint: sha("baseline"), storedBaselineFingerprint: sha("baseline") });
  const guard = payload.authorities.prohibited_operation_guard_authority;
  guard.phase = "final"; Object.assign(guard.run, { state: "completed", completedAt: commerce.capturedAt });
  const zero = payload.authorities.zero_database_effect_counts;
  zero.phase = "final"; zero.scenarioKind = kind; zero.capturedAt = commerce.capturedAt;
  Object.assign(zero.lineage, { enhancementJobIdHash: commerce.scope.enhancementJobIdHash,
    enhancementArtifactRevisionIdHash: commerce.scope.enhancementArtifactRevisionIdHash,
    activeArtifactRevisionIdHash: commerce.scope.activeArtifactRevisionIdHash });
  const collections = { paymentEventIds: commerce.paymentEvents, accessKeyIds: commerce.creditAuthority.accessKeys,
    creditLedgerIds: commerce.creditAuthority.creditLedger, refundIds: commerce.creditAuthority.refunds,
    emailDeliveryIds: commerce.emailAuthority.deliveries, emailEventIds: commerce.emailAuthority.events,
    accessTokenIds: commerce.accessTokens };
  zero.allowedCommerceTopology = Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name,
    { count: rows.length, idSetHash: sha(`raw-${name}`), authorityRowsHash: sha(stableZero(rows)) }])) as typeof zero.allowedCommerceTopology;
  const sealed = payload as unknown as ReportV4AcceptanceCompleteAuthorityPhasePayload;
  reseal(sealed, "artifact_combined_payload_integrity"); reseal(sealed, "site_read_manifest");
  reseal(sealed, "ledger_authority"); reseal(sealed, "prohibited_operation_guard_authority");
  reseal(sealed, "zero_database_effect_counts");
  return sealed;
}

function scenarioFixture(kind: "success" | "diagnosis_failure" | "question_failure"): ReportV4AcceptanceScenario {
  return { sessionId: SESSION, scenarioId: SCENARIO, reportId: REPORT, orderId: ORDER, preAdmissionJobId: "job-pre",
    coreJobId: CORE, enhancementJobId: kind === "question_failure" ? null : ENHANCEMENT, siteSnapshotId: SNAPSHOT,
    configSnapshotId: CONFIG, questionSetId: QUESTION_SET, coreArtifactRevisionId: CORE_ARTIFACT,
    enhancementArtifactRevisionId: kind === "question_failure" ? null : ENHANCEMENT_ARTIFACT, kind,
    faultKind: kind === "success" ? "independent_source_read_failure" : kind, faultQuestionId: "question-2",
    faultSourceId: kind === "success" ? "source-2" : null, expectedFaultOccurrences: kind === "success" ? 1 : 2,
    baselineFingerprint: sha("baseline"), finalFingerprint: sha("final"), state: "collecting",
    createdAt: new Date("2026-07-18T00:00:00.000Z"), terminalAt: null };
}

function commerceFixture(kind: "success" | "diagnosis_failure" | "question_failure",
  questions: ReportV4CommerceAuthoritySnapshot["questionCheckpoints"],
  diagnoses: ReportV4CommerceAuthoritySnapshot["diagnosisCheckpoints"]): ReportV4CommerceAuthoritySnapshot {
  const commerce = structuredClone(createReportV4CommerceAuthoritySnapshotPair(kind).final);
  if (kind === "question_failure") commerce.questionCheckpoints = [...questions];
  if (kind !== "success") commerce.diagnosisCheckpoints = [...diagnoses];
  if (kind === "success") {
    const fault = commerce.diagnosisCheckpoints[1]!;
    Object.assign(fault.sourceAuditRecords[0]!, { status: "inaccessible", summaryHash: null });
  }
  resealReportV4CommerceAuthoritySnapshot(commerce);
  return commerce;
}

function artifactFixture(kind: "success" | "diagnosis_failure" | "question_failure") {
  const hasEnhancement = kind !== "question_failure";
  const questionHashes = [sha("question-content-1"), sha("question-content-2"), sha("question-content-3")] as const;
  const core: ReportV4ArtifactPayloadAuthorityRecord = { artifactRevisionIdHash: sha(CORE_ARTIFACT), reportIdHash: sha(REPORT),
    orderIdHash: sha(ORDER), jobIdHash: sha(CORE), configSnapshotIdHash: sha(CONFIG), questionSetIdHash: sha(QUESTION_SET),
    sourceArtifactRevisionIdHash: null, revisionKind: "generation", status: hasEnhancement ? "ready" : "active", revision: 1,
    payloadIdentityHash: sha("core-payload"), preservedContentHash: sha("preserved"), questionContentHashes: questionHashes,
    diagnosisContentHashes: [null, null, null] };
  const enhancement: ReportV4ArtifactPayloadAuthorityRecord = { ...core, artifactRevisionIdHash: sha(ENHANCEMENT_ARTIFACT),
    jobIdHash: sha(ENHANCEMENT), sourceArtifactRevisionIdHash: sha(CORE_ARTIFACT), revisionKind: "diagnosis_enhancement",
    status: "active", revision: 2, payloadIdentityHash: sha("enhancement-payload"),
    diagnosisContentHashes: [sha("diagnosis-1"), kind === "diagnosis_failure" ? null : sha("diagnosis-2"), sha("diagnosis-3")] };
  return { phase: "final" as const, scenarioKind: kind, faultQuestionIdHash: sha("question-2"),
    faultSourceIdHash: kind === "success" ? sha("source-2") : null, capturedAt: "2026-07-18T00:00:10.000Z",
    activeArtifactRevisionIdHash: sha(hasEnhancement ? ENHANCEMENT_ARTIFACT : CORE_ARTIFACT),
    artifacts: hasEnhancement ? [core, enhancement] : [core], canonicalHash: sha("artifact"),
    transactionProfile: { isolation: "repeatable read" as const, readOnly: true as const } };
}

function addModelPair(events: ReportV4AcceptanceEvent[], operation: "question_answer" | "source_diagnosis" | "page_analysis" | "website_synthesis",
  unitId: string, attempt: 1 | 2, terminal: "completed" | "failed"): void {
  events.push(modelEvent(operation, unitId, attempt, "started", events.length + 1));
  events.push(modelEvent(operation, unitId, attempt, terminal, events.length + 1));
}

function addSitePair(events: ReportV4AcceptanceEvent[], unitId: string, urlHash: string): void {
  for (const phase of ["started", "completed"] as const) events.push(makeEvent({ kind: "site_read", operation: "site_raw_read",
    unitId, attempt: 1, phase, details: { urlHash, readMode: "raw", networkPerformed: true } }, events.length + 1));
}

function modelEvent(operation: "question_answer" | "source_diagnosis" | "page_analysis" | "website_synthesis", unitId: string, attempt: 1 | 2,
  phase: "started" | "completed" | "failed", sequence: number): ReportV4AcceptanceEvent {
  return makeEvent({ kind: "model_operation", operation, unitId, attempt, phase,
    details: { providerCall: true, retry: attempt === 2, budgetOutcome: "allowed", inputTokens: 10, outputTokens: 5 } }, sequence);
}

function checkpointEvent(operation: "question_answer" | "source_diagnosis", unitId: string,
  state: "answered" | "unavailable" | "completed" | "failed", checkpointHash: string,
  sequence: number): ReportV4AcceptanceEvent {
  return makeEvent({ kind: "checkpoint_terminal", operation, unitId, attempt: 0, phase: "observed",
    details: { checkpointHash, state } }, sequence);
}

function makeEvent(value: { kind: ReportV4AcceptanceEvent["kind"]; operation: string; unitId: string;
  attempt: 0 | 1 | 2; phase: string; details: Readonly<Record<string, unknown>> },
  sequence: number): ReportV4AcceptanceEvent {
  const occurredAt = new Date(Date.parse("2026-07-17T00:00:00.000Z") - 60_000 + sequence * 100);
  return { ...value, idempotencyKey: sha(`event-${sequence}`), sessionId: SESSION, scenarioId: SCENARIO, sequence,
    detailsCanonical: stable(value.details), prevHash: sha(`prev-${sequence}`), eventHash: sha(`hash-${sequence}`),
    occurredAt, occurredAtCanonical: occurredAt.toISOString() } as ReportV4AcceptanceEvent;
}

function resequence(events: ReportV4AcceptanceEvent[]): void {
  let previousHash = "0".repeat(64);
  for (const [index, event] of events.entries()) {
    const sequence = index + 1;
    const late = event.kind === "v4_dispatch" && event.unitId !== "job-pre" || event.kind === "model_operation" || event.kind === "html_assembly" || event.kind === "artifact_activation" || event.kind === "commerce_fingerprint";
    const occurredAt = new Date(Date.parse(late ? "2026-07-17T00:00:01.000Z" : "2026-07-17T00:00:00.000Z") + (late ? sequence * 100 : -60_000 + sequence * 100));
    Object.assign(event, { sequence, idempotencyKey: sha(`event-${sequence}`), prevHash: previousHash,
      eventHash: sha(`hash-${sequence}-${event.kind}-${event.operation}-${event.unitId}`), occurredAt,
      occurredAtCanonical: occurredAt.toISOString(), detailsCanonical: stable(event.details) });
    if (event.kind === "commerce_fingerprint" && event.unitId === "commerce-final") {
      const detailsCanonical = `{"fingerprint": "${String((event.details as Record<string, unknown>).fingerprint)}"}`;
      const occurredAtCanonical = `${occurredAt.toISOString().slice(0, 23)}000Z`;
      const idempotencyKey = shaParts([event.sessionId, event.scenarioId, event.kind, event.operation,
        event.unitId, String(event.attempt), event.phase]);
      Object.assign(event, { idempotencyKey, detailsCanonical, occurredAtCanonical,
        eventHash: shaParts([previousHash, idempotencyKey, String(sequence), event.kind, event.operation,
          event.unitId, String(event.attempt), event.phase, detailsCanonical, occurredAtCanonical]) });
    }
    previousHash = event.eventHash;
  }
}

function mapLedger(events: readonly ReportV4AcceptanceEvent[]): ReportV4AcceptanceLedgerAuthorityEventRecord[] {
  return events.map((event) => ({ sequence: event.sequence, fingerprint: event.idempotencyKey,
    scenarioIdHash: sha(event.scenarioId), kind: event.kind, operation: event.operation, unitIdHash: sha(event.unitId),
    attempt: event.attempt, eventPhase: event.phase, details: event.kind === "html_assembly" || event.kind === "artifact_activation"
      ? { artifactRevisionIdHash: sha(String((event.details as Record<string, unknown>).artifactRevisionId)), htmlSha256: (event.details as Record<string, unknown>).htmlSha256 }
      : event.details as Readonly<Record<string, unknown>>,
    previousHash: event.prevHash, eventHash: event.eventHash, occurredAt: event.occurredAt.toISOString() }));
}

function manifestRecord(questionId: string, sourceId: string, urlHash: string): ReportV4AcceptanceSiteReadManifestAuthorityRecord {
  return { identityHash: sha(`manifest-${questionId}-${sourceId}`), reportIdHash: sha(REPORT), jobIdHash: sha(ENHANCEMENT),
    scope: "enhancement_source", purpose: "source", urlHash, mode: "raw", attempt: 1,
    pairBindingHash: sha(`pair-${questionId}-${sourceId}`), ownerQuestionIdHash: sha(questionId),
    ownerSourceIdHash: sha(sourceId), networkPerformed: true, terminalPhase: "completed", semanticState: "terminal",
    startedAt: "2026-07-18T00:00:00.000Z", terminalAt: "2026-07-18T00:00:01.000Z" };
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function shaParts(values: readonly string[]): string { return sha(values.join("\x1f")); }
function stable(value: unknown): string { return JSON.stringify(value); }
