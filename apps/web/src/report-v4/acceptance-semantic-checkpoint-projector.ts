import { createHash } from "node:crypto";
import type {
  ReportV4AcceptanceEvent,
  ReportV4AcceptanceScenario,
} from "../db/report-v4-acceptance-ledger";
import type {
  ReportV4AcceptanceLedgerAuthorityEventRecord,
} from "../db/report-v4-acceptance-ledger-guard-authority";
import type { ReportV4AcceptanceSiteReadManifestAuthority } from "../db/report-v4-site-read-manifest";
import type { ReportV4ArtifactAuthority } from "../db/report-v4-artifact-authority";
import type { ReportV4CommerceAuthoritySnapshot } from "../db/report-v4-commerce-authority-snapshot";
import {
  assertReportV4AcceptanceCompleteAuthorityPhasePayload,
  type ReportV4AcceptanceCompleteAuthorityPhasePayload,
} from "../db/report-v4-acceptance-authority-phase-snapshot";
import type { ReportV4AcceptanceSemanticAuthority } from "./acceptance-semantic-verifier";

type Projection = Pick<
  ReportV4AcceptanceSemanticAuthority,
  "questions" | "diagnoses" | "sourceFaultZeroClaim"
>;

export interface ProjectReportV4AcceptanceSemanticCheckpointsInput {
  readonly scenario: ReportV4AcceptanceScenario;
  readonly events: readonly ReportV4AcceptanceEvent[];
  readonly finalPhase: ReportV4AcceptanceCompleteAuthorityPhasePayload;
}

interface ProjectionContext extends ProjectReportV4AcceptanceSemanticCheckpointsInput {
  readonly ledgerEvents: readonly ReportV4AcceptanceLedgerAuthorityEventRecord[];
  readonly commerce: ReportV4CommerceAuthoritySnapshot;
  readonly siteReadManifest: ReportV4AcceptanceSiteReadManifestAuthority;
  readonly artifact: ReportV4ArtifactAuthority;
}

export function projectReportV4AcceptanceSemanticCheckpoints(
  request: ProjectReportV4AcceptanceSemanticCheckpointsInput,
): Projection {
  assertReportV4AcceptanceCompleteAuthorityPhasePayload(request.finalPhase);
  if (request.finalPhase.phase !== "final") fail("checkpoint projection requires a validated final-phase payload");
  const input: ProjectionContext = {
    ...request,
    commerce: request.finalPhase.commerce,
    ledgerEvents: request.finalPhase.authorities.ledger_authority.events,
    siteReadManifest: request.finalPhase.authorities.site_read_manifest,
    artifact: request.finalPhase.authorities.artifact_combined_payload_integrity,
  };
  assertCompleteFinalScope(input);
  assertLedgerMapping(input.events, input.ledgerEvents, input.scenario);
  const scenario = input.scenario;
  const commerceQuestions = orderedCheckpoints(input.commerce.questionCheckpoints, "question");
  if (commerceQuestions.length !== 3) fail("final commerce authority must contain exactly three question checkpoints");

  const questionIds = deriveQuestionIds(scenario, input.events, commerceQuestions.map((row) => row.questionIdHash));
  const questions = commerceQuestions.map((checkpoint) => {
    const questionId = exactOpaqueId(questionIds, checkpoint.questionIdHash, `question ordinal ${checkpoint.ordinal}`);
    const terminal = exactTerminal(input.events, "question_answer", checkpoint.identityHash);
    assertTerminal(terminal, checkpoint.terminalFingerprint, checkpoint.state, `question ${questionId}`);
    const faultTarget = scenario.kind === "question_failure" && questionId === scenario.faultQuestionId;
    const physicalProviderCallCount = faultTarget ? 0 : checkpoint.providerCallCount;
    if (faultTarget) {
      if (checkpoint.providerCallCount !== 2 || checkpoint.state !== "unavailable") {
        fail("question-failure target must be unavailable with logical provider count two");
      }
      const faults = assertFaultEvents(input.events, scenario, `${required(scenario.coreJobId, "core job")}:${questionId}`, 2);
      assertFaultBeforeTarget(input.events, faults, "question_answer", questionId, checkpoint.identityHash);
    }
    assertPhysicalAttempts(input.events, "question_answer", questionId, checkpoint.state === "answered" ? "completed" : "failed",
      physicalProviderCallCount);
    assertQuestionScope(input, checkpoint);
    assertQuestionSourceOwnership(input, checkpoint, questionId);
    return Object.freeze({
      questionId,
      identityHash: checkpoint.identityHash,
      terminalFingerprint: checkpoint.terminalFingerprint,
      state: checkpoint.state,
      logicalProviderCallCount: checkpoint.providerCallCount,
      physicalProviderCallCount,
      sourceCount: checkpoint.sourceCount,
      sourceOwnershipVerified: true as const,
      inputScopeVerified: true as const,
    });
  });

  const commerceDiagnoses = orderedCheckpoints(input.commerce.diagnosisCheckpoints, "diagnosis");
  const expectedDiagnosisCount = scenario.kind === "question_failure" ? 0 : 3;
  if (commerceDiagnoses.length !== expectedDiagnosisCount) {
    fail(`final commerce authority must contain exactly ${expectedDiagnosisCount} diagnosis checkpoints`);
  }
  const diagnoses = commerceDiagnoses.map((checkpoint) => {
    const question = questions.find((candidate) => sha(candidate.questionId) === checkpoint.questionIdHash);
    if (!question || question.questionId !== questions[checkpoint.ordinal - 1]?.questionId) {
      fail(`diagnosis ordinal ${checkpoint.ordinal} does not bind the same ordered question`);
    }
    const terminal = exactTerminal(input.events, "source_diagnosis", checkpoint.identityHash);
    assertTerminal(terminal, checkpoint.terminalFingerprint, checkpoint.state, `diagnosis ${question.questionId}`);
    const faultTarget = scenario.kind === "diagnosis_failure" && question.questionId === scenario.faultQuestionId;
    const physicalProviderCallCount = faultTarget ? 0 : checkpoint.providerCallCount;
    if (faultTarget) {
      if (checkpoint.providerCallCount !== 2 || checkpoint.state !== "failed") {
        fail("diagnosis-failure target must be failed with logical provider count two");
      }
      const faults = assertFaultEvents(input.events, scenario,
        `${required(scenario.enhancementJobId, "enhancement job")}:${question.questionId}`, 2);
      assertFaultBeforeTarget(input.events, faults, "source_diagnosis",
        `${required(scenario.enhancementJobId, "enhancement job")}:${question.questionId}`, checkpoint.identityHash);
    }
    assertPhysicalAttempts(input.events, "source_diagnosis",
      `${required(scenario.enhancementJobId, "enhancement job")}:${question.questionId}`,
      checkpoint.state === "completed" ? "completed" : "failed", physicalProviderCallCount);
    assertDiagnosisScopeAndOwnership(input, checkpoint, question.questionId);
    return Object.freeze({
      questionId: question.questionId,
      identityHash: checkpoint.identityHash,
      terminalFingerprint: checkpoint.terminalFingerprint,
      state: checkpoint.state,
      logicalProviderCallCount: checkpoint.providerCallCount,
      physicalProviderCallCount,
      sourceAuditCount: checkpoint.sourceAuditCount,
      sourceAuditOwnershipVerified: true as const,
      inputScopeVerified: true as const,
    });
  });

  if (scenario.kind !== "question_failure" && diagnoses.some((diagnosis) =>
    diagnosis.sourceAuditCount !== questions.find((question) => question.questionId === diagnosis.questionId)?.sourceCount)) {
    fail("diagnosis source-audit count must equal its exact question source count");
  }
  assertEnhancementClosure(input);
  return Object.freeze({
    questions: Object.freeze(questions),
    diagnoses: Object.freeze(diagnoses),
    sourceFaultZeroClaim: scenario.kind === "success" ? projectSourceFault(input, questions) : null,
  });
}

function assertCompleteFinalScope(input: ProjectionContext): void {
  const { scenario, commerce, siteReadManifest, artifact } = input;
  const ledgerScenario = input.finalPhase.authorities.ledger_authority.scenario;
  assertCanonicalFaultTopology(scenario);
  if (commerce.phase !== "final" || siteReadManifest.phase !== "final" || artifact.phase !== "final") {
    fail("checkpoint projection requires complete final-phase authorities");
  }
  if (commerce.scenarioKind !== scenario.kind || siteReadManifest.scenarioKind !== scenario.kind
      || artifact.scenarioKind !== scenario.kind) fail("authority scenario kinds do not match the raw scenario");
  const reportId = required(scenario.reportId, "report");
  const enhancementJobId = scenario.enhancementJobId;
  for (const [actual, raw, label] of [
    [commerce.scope.reportIdHash, reportId, "commerce report"],
    [commerce.scope.orderIdHash, required(scenario.orderId, "order"), "commerce order"],
    [commerce.scope.siteSnapshotIdHash, required(scenario.siteSnapshotId, "site snapshot"), "commerce site snapshot"],
    [commerce.scope.configSnapshotIdHash, required(scenario.configSnapshotId, "config snapshot"), "commerce config"],
    [commerce.scope.questionSetIdHash, required(scenario.questionSetId, "question set"), "commerce question set"],
    [commerce.scope.preAdmissionJobIdHash, required(scenario.preAdmissionJobId, "pre-admission job"), "commerce pre-admission job"],
    [commerce.scope.coreJobIdHash, required(scenario.coreJobId, "core job"), "commerce core job"],
    [commerce.scope.coreArtifactRevisionIdHash, required(scenario.coreArtifactRevisionId, "core artifact"), "commerce core artifact"],
    [siteReadManifest.sessionIdHash, scenario.sessionId, "manifest session"],
    [siteReadManifest.reportIdHash, reportId, "manifest report"],
    [siteReadManifest.scenarioIdHash, scenario.scenarioId, "manifest scenario"],
    [siteReadManifest.preAdmissionJobIdHash, required(scenario.preAdmissionJobId, "pre-admission job"), "manifest pre-admission job"],
    [artifact.faultQuestionIdHash, scenario.faultQuestionId, "artifact fault question"],
  ] as const) if (actual !== sha(raw)) fail(`${label} scope hash does not match the raw scenario`);
  if ((enhancementJobId === null ? null : sha(enhancementJobId)) !== commerce.scope.enhancementJobIdHash
      || (enhancementJobId === null ? null : sha(enhancementJobId)) !== siteReadManifest.enhancementJobIdHash) {
    fail("enhancement job scope hash does not match the raw scenario");
  }
  if ((scenario.enhancementArtifactRevisionId === null ? null : sha(scenario.enhancementArtifactRevisionId))
      !== commerce.scope.enhancementArtifactRevisionIdHash) {
    fail("enhancement artifact scope hash does not match the raw scenario");
  }
  if (artifact.activeArtifactRevisionIdHash !== commerce.scope.activeArtifactRevisionIdHash) {
    fail("artifact and commerce active artifact scope hashes disagree");
  }
  if ((scenario.faultSourceId === null ? null : sha(scenario.faultSourceId)) !== artifact.faultSourceIdHash) {
    fail("artifact fault source hash does not match the raw scenario");
  }
  if (ledgerScenario.kind !== scenario.kind || ledgerScenario.faultKind !== scenario.faultKind
      || ledgerScenario.faultQuestionIdHash !== sha(scenario.faultQuestionId)
      || ledgerScenario.faultSourceIdHash !== (scenario.faultSourceId === null ? null : sha(scenario.faultSourceId))
      || ledgerScenario.expectedFaultOccurrences !== scenario.expectedFaultOccurrences
      || ledgerScenario.baselineFingerprint !== scenario.baselineFingerprint
      || ledgerScenario.storedBaselineFingerprint !== scenario.baselineFingerprint) {
    fail("final ledger scenario fault metadata does not exactly bind the raw scenario");
  }
}

function assertCanonicalFaultTopology(scenario: ReportV4AcceptanceScenario): void {
  const valid = scenario.kind === "success"
    ? scenario.faultKind === "independent_source_read_failure" && scenario.expectedFaultOccurrences === 1
      && scenario.faultSourceId !== null && scenario.enhancementJobId !== null
    : scenario.kind === "diagnosis_failure"
      ? scenario.faultKind === "diagnosis_failure" && scenario.expectedFaultOccurrences === 2
        && scenario.faultSourceId === null && scenario.enhancementJobId !== null
      : scenario.faultKind === "question_failure" && scenario.expectedFaultOccurrences === 2
        && scenario.faultSourceId === null && scenario.enhancementJobId === null;
  if (!valid) fail("raw scenario does not satisfy its canonical fault topology");
}

function assertQuestionScope(
  input: ProjectionContext,
  checkpoint: ReportV4CommerceAuthoritySnapshot["questionCheckpoints"][number],
): void {
  const scope = input.commerce.scope;
  if (checkpoint.reportIdHash !== scope.reportIdHash || checkpoint.jobIdHash !== scope.coreJobIdHash
      || checkpoint.questionSetIdHash !== scope.questionSetIdHash || checkpoint.snapshotIdHash !== scope.siteSnapshotIdHash) {
    fail(`question ordinal ${checkpoint.ordinal} input scope is not exact`);
  }
}

function assertQuestionSourceOwnership(
  input: ProjectionContext,
  checkpoint: ReportV4CommerceAuthoritySnapshot["questionCheckpoints"][number],
  questionId: string,
): void {
  if (checkpoint.sourceRecords.length !== checkpoint.sourceCount
      || checkpoint.sourceRecords.some((record) => record.questionIdHash !== sha(questionId))) {
    fail(`question ${questionId} source ownership is not closed by its exact source records`);
  }
  const keys = checkpoint.sourceRecords.map(sourceKey);
  if (new Set(keys).size !== keys.length) fail(`question ${questionId} source records are not unique`);
  if (input.scenario.kind === "question_failure") return;
  const diagnosis = input.commerce.diagnosisCheckpoints.filter((row) => row.questionIdHash === sha(questionId));
  if (diagnosis.length !== 1) fail(`question ${questionId} has no unique diagnosis source owner`);
  const auditKeys = diagnosis[0]!.sourceAuditRecords.map(sourceKey);
  if (!sameSet(keys, auditKeys)) fail(`question ${questionId} sources and diagnosis audits are not an exact set`);
}

function assertEnhancementClosure(input: ProjectionContext): void {
  const records = input.siteReadManifest.records.filter((row) => row.scope === "enhancement_source");
  const audits = input.commerce.diagnosisCheckpoints.flatMap((row) => row.sourceAuditRecords);
  const faultKey = input.scenario.kind === "success"
    ? `${sha(input.scenario.faultQuestionId)}:${sha(required(input.scenario.faultSourceId, "fault source"))}` : null;
  const auditOwners = new Set(audits.map((row) => `${row.questionIdHash}:${row.sourceIdHash}`));
  for (const record of records) {
    const owner = `${record.ownerQuestionIdHash}:${record.ownerSourceIdHash}`;
    if (!auditOwners.has(owner)) fail("enhancement manifest contains an orphan source owner");
  }
  for (const audit of audits) {
    const owner = `${audit.questionIdHash}:${audit.sourceIdHash}`;
    const owned = records.filter((row) => `${row.ownerQuestionIdHash}:${row.ownerSourceIdHash}` === owner
      && row.urlHash === audit.canonicalUrlHash);
    if (owner === faultKey) {
      if (owned.length !== 0) fail("success fault audit must have no manifest records");
    } else if (owned.length === 0) fail("source audit has no exact manifest record");
  }
  const enhancementJobId = input.scenario.enhancementJobId;
  if (!enhancementJobId) {
    if (records.length !== 0) {
      fail("question-failure scenario contains orphan enhancement reads");
    }
    assertSiteReadPartition(input, records);
    return;
  }
  assertSiteReadPartition(input, records);
}

function assertSiteReadPartition(input: ProjectionContext,
  enhancementManifests: ReportV4AcceptanceSiteReadManifestAuthority["records"]): void {
  const preAdmissionJobId = required(input.scenario.preAdmissionJobId, "pre-admission job");
  const manifests = input.siteReadManifest.records.filter((record) => record.scope === "admission_page"
    || record.scope === "admission_discovery");
  const events = input.events.filter((event) => event.kind === "site_read");
  for (const manifest of manifests) {
    const unitId = `${manifest.scope.replace("_", "-")}:${manifest.mode}:${manifest.urlHash}`;
    const operation = manifest.mode === "raw" ? "site_raw_read" : "site_browser_read";
    const owned = events.filter((event) => event.operation === operation && event.unitId === unitId
      && event.attempt === manifest.attempt && (event.phase === "started" || event.phase === manifest.terminalPhase));
    if (manifest.jobIdHash !== sha(preAdmissionJobId) || owned.length !== 2
        || owned.filter((event) => event.phase === "started").length !== 1
        || owned.filter((event) => event.phase === manifest.terminalPhase).length !== 1
        || owned.some((event) => { const details = event.details as Record<string, unknown>;
          return details.urlHash !== manifest.urlHash || details.readMode !== manifest.mode
            || details.networkPerformed !== manifest.networkPerformed; })) {
      fail(`admission manifest ${manifest.identityHash} has no exact production-convention event pair`);
    }
  }
  for (const event of events) {
    const details = event.details as Record<string, unknown>;
    const admissionMatches = manifests.filter((manifest) => manifest.jobIdHash === sha(preAdmissionJobId)
      && event.unitId === `${manifest.scope.replace("_", "-")}:${manifest.mode}:${manifest.urlHash}`
      && event.operation === (manifest.mode === "raw" ? "site_raw_read" : "site_browser_read")
      && event.attempt === manifest.attempt && details.urlHash === manifest.urlHash
      && details.readMode === manifest.mode && details.networkPerformed === manifest.networkPerformed
      && (event.phase === "started" || event.phase === manifest.terminalPhase));
    const enhancementMatches = enhancementManifests.filter((manifest) => {
      const jobId = input.scenario.enhancementJobId;
      if (!jobId || manifest.jobIdHash !== sha(jobId) || !event.unitId.startsWith(`${jobId}:`)) return false;
      const tail = event.unitId.slice(jobId.length + 1); const separator = tail.indexOf(":");
      if (separator < 1) return false;
      const questionId = tail.slice(0, separator); const sourceId = tail.slice(separator + 1);
      return manifest.ownerQuestionIdHash === sha(questionId) && manifest.ownerSourceIdHash === sha(sourceId)
        && event.operation === (manifest.mode === "raw" ? "site_raw_read" : "site_browser_read")
        && event.attempt === manifest.attempt && details.urlHash === manifest.urlHash
        && details.readMode === manifest.mode && details.networkPerformed === manifest.networkPerformed
        && (event.phase === "started" || event.phase === manifest.terminalPhase);
    });
    if (admissionMatches.length + enhancementMatches.length !== 1) {
      fail("site-read event does not partition to one exact admission or enhancement manifest identity");
    }
  }
}

function assertFaultBeforeTarget(events: readonly ReportV4AcceptanceEvent[], faults: readonly ReportV4AcceptanceEvent[],
  operation: "question_answer" | "source_diagnosis", modelUnitId: string, terminalIdentity: string): void {
  const firstTarget = Math.min(...events.filter((event) => (event.kind === "model_operation" && event.operation === operation
    && event.unitId === modelUnitId) || (event.kind === "checkpoint_terminal" && event.operation === operation
    && event.unitId === terminalIdentity)).map((event) => event.sequence));
  if (!Number.isFinite(firstTarget) || faults.some((fault) => fault.sequence >= firstTarget)) {
    fail(`${operation} fault was not injected before its corresponding model work and terminal`);
  }
}

function sourceKey(record: { questionIdHash: string; sourceIdHash: string; canonicalUrlHash: string }): string {
  return `${record.questionIdHash}:${record.sourceIdHash}:${record.canonicalUrlHash}`;
}
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length
    && new Set(right).size === right.length && left.every((value) => right.includes(value));
}

function assertDiagnosisScopeAndOwnership(
  input: ProjectionContext,
  checkpoint: ReportV4CommerceAuthoritySnapshot["diagnosisCheckpoints"][number],
  questionId: string,
): void {
  const scope = input.commerce.scope;
  if (checkpoint.reportIdHash !== scope.reportIdHash || checkpoint.enhancementJobIdHash !== scope.enhancementJobIdHash
      || checkpoint.coreArtifactRevisionIdHash !== scope.coreArtifactRevisionIdHash
      || checkpoint.configSnapshotIdHash !== scope.configSnapshotIdHash
      || checkpoint.questionSetIdHash !== scope.questionSetIdHash || checkpoint.snapshotIdHash !== scope.siteSnapshotIdHash) {
    fail(`diagnosis ordinal ${checkpoint.ordinal} input scope is not exact`);
  }
  if (checkpoint.sourceAuditRecords.length !== checkpoint.sourceAuditCount) {
    fail(`diagnosis ${questionId} source-audit count does not match its records`);
  }
  const enhancementJobId = required(input.scenario.enhancementJobId, "enhancement job");
  for (const record of checkpoint.sourceAuditRecords) {
    if (record.questionIdHash !== sha(questionId)) fail(`diagnosis ${questionId} contains a foreign source-audit question`);
    const faultZero = input.scenario.kind === "success" && questionId === input.scenario.faultQuestionId
      && record.sourceIdHash === sha(required(input.scenario.faultSourceId, "fault source"));
    const owners = input.siteReadManifest.records.filter((row) => row.scope === "enhancement_source"
      && row.ownerQuestionIdHash === record.questionIdHash && row.ownerSourceIdHash === record.sourceIdHash);
    if (faultZero) {
      if (record.status !== "inaccessible" || owners.length !== 0) {
        fail("success fault source must be inaccessible and absent from the network manifest");
      }
      continue;
    }
    if (record.status !== "available") {
      fail(`diagnosis ${questionId} non-fault source-audit status must be available`);
    }
    const raw = owners.filter((row) => row.mode === "raw");
    if (raw.length !== 1 || owners.length > 2 || owners.some((row) => row.jobIdHash !== sha(enhancementJobId)
      || row.urlHash !== record.canonicalUrlHash || row.networkPerformed !== true || row.semanticState !== "terminal")) {
      fail(`diagnosis ${questionId} source-audit ownership is not closed by one exact manifest pair`);
    }
    const sourceId = sourceIdFromEvents(input.events, enhancementJobId, questionId, record.sourceIdHash);
    const unitId = `${enhancementJobId}:${questionId}:${sourceId}`;
    assertSiteReadEvents(input.events, unitId, record, owners);
  }
}

function projectSourceFault(
  input: ProjectionContext,
  questions: Projection["questions"],
): NonNullable<Projection["sourceFaultZeroClaim"]> {
  const scenario = input.scenario;
  const enhancementJobId = required(scenario.enhancementJobId, "enhancement job");
  const sourceId = required(scenario.faultSourceId, "fault source");
  const question = questions.find((candidate) => candidate.questionId === scenario.faultQuestionId);
  if (!question) fail("success fault question is absent from the exact question checkpoints");
  const diagnosis = input.commerce.diagnosisCheckpoints.find((candidate) => candidate.questionIdHash === sha(question.questionId));
  const audit = diagnosis?.sourceAuditRecords.filter((candidate) => candidate.sourceIdHash === sha(sourceId));
  if (!diagnosis || audit?.length !== 1 || audit[0]?.status !== "inaccessible") {
    fail("success fault source has no unique inaccessible persisted source-audit record");
  }
  const unitId = `${enhancementJobId}:${question.questionId}:${sourceId}`;
  const faults = assertFaultEvents(input.events, scenario, unitId, 1);
  if (input.events.some((event) => event.kind === "site_read" && event.unitId === unitId && event.phase === "started")) {
    fail("success fault source has a physical site-read started event");
  }
  if (input.siteReadManifest.records.some((row) => row.ownerQuestionIdHash === sha(question.questionId)
    && row.ownerSourceIdHash === sha(sourceId))) fail("success fault source has a physical manifest network row");
  const claimSequences = input.events.filter((event) => (event.kind === "site_read" && event.unitId === unitId)
    || (event.operation === "source_diagnosis" && (event.unitId === `${enhancementJobId}:${question.questionId}`
      || event.unitId === diagnosis.identityHash))).map((event) => event.sequence);
  if (claimSequences.some((sequence) => faults[0]!.sequence >= sequence)) {
    fail("success source fault was not injected before every corresponding claim and diagnosis terminal");
  }
  const core = input.artifact.artifacts.find((row) => row.revisionKind === "generation");
  const enhancement = input.artifact.artifacts.find((row) => row.revisionKind === "diagnosis_enhancement");
  if (!core || !enhancement || enhancement.sourceArtifactRevisionIdHash !== core.artifactRevisionIdHash
      || core.preservedContentHash !== enhancement.preservedContentHash
      || core.questionContentHashes[questionOrdinal(input.commerce, question.questionId) - 1]
        !== enhancement.questionContentHashes[questionOrdinal(input.commerce, question.questionId) - 1]) {
    fail("artifact authority cannot uniquely prove Core answer and source-link preservation for the success fault");
  }
  return Object.freeze({ unitId, physicalClaimCount: 0 as const, injectedBeforeClaim: true as const,
    questionId: question.questionId, sourceId, persistedAuditStatus: "inaccessible" as const,
    coreAnswerContentPreserved: true as const, sourceLinkPreserved: true as const });
}

function deriveQuestionIds(
  scenario: ReportV4AcceptanceScenario,
  events: readonly ReportV4AcceptanceEvent[],
  expectedHashes: readonly string[],
): readonly string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind === "model_operation" && event.operation === "question_answer") ids.add(event.unitId);
    if (event.kind === "model_operation" && event.operation === "source_diagnosis" && scenario.enhancementJobId) {
      const prefix = `${scenario.enhancementJobId}:`;
      if (!event.unitId.startsWith(prefix)) fail("source-diagnosis event is outside the enhancement job scope");
      ids.add(event.unitId.slice(prefix.length));
    }
  }
  const faultUnit = scenario.kind === "question_failure"
    ? `${required(scenario.coreJobId, "core job")}:${scenario.faultQuestionId}`
    : scenario.kind === "diagnosis_failure"
      ? `${required(scenario.enhancementJobId, "enhancement job")}:${scenario.faultQuestionId}`
      : `${required(scenario.enhancementJobId, "enhancement job")}:${scenario.faultQuestionId}:${required(scenario.faultSourceId, "fault source")}`;
  if (events.some((event) => event.kind === "fault_injection" && event.unitId === faultUnit)) ids.add(scenario.faultQuestionId);
  const matched = [...ids].filter((id) => expectedHashes.includes(sha(id)));
  if (ids.size !== 3 || matched.length !== 3 || new Set(matched.map(sha)).size !== 3
      || expectedHashes.some((hash) => !matched.some((id) => sha(id) === hash))) {
    fail("raw model/fault events do not uniquely recover the three commerce checkpoint question IDs");
  }
  return Object.freeze(matched);
}

function assertLedgerMapping(
  events: readonly ReportV4AcceptanceEvent[],
  ledgerEvents: readonly ReportV4AcceptanceLedgerAuthorityEventRecord[],
  scenario: ReportV4AcceptanceScenario,
): void {
  if (events.length !== ledgerEvents.length) fail("raw and ledger authority event counts differ");
  if (events.some((event, index) => event.sequence !== index + 1)) {
    fail("raw event array must be in strict contiguous sequence order");
  }
  const raw = [...events].sort((a, b) => a.sequence - b.sequence);
  const projected = [...ledgerEvents].sort((a, b) => a.sequence - b.sequence);
  if (new Set(raw.map((row) => row.sequence)).size !== raw.length
      || new Set(raw.map((row) => row.idempotencyKey)).size !== raw.length
      || new Set(projected.map((row) => row.sequence)).size !== projected.length
      || new Set(projected.map((row) => row.fingerprint)).size !== projected.length) {
    fail("raw and ledger events require unique sequences and fingerprints");
  }
  let previousHash = "0".repeat(64);
  for (let index = 0; index < raw.length; index += 1) {
    const event = raw[index]!;
    const row = projected[index]!;
    if (event.sequence !== index + 1 || row.sequence !== index + 1
        || event.prevHash !== previousHash || row.previousHash !== previousHash) {
      fail("raw and ledger event arrays do not form one strict contiguous hash chain");
    }
    if (event.sessionId !== scenario.sessionId || event.scenarioId !== scenario.scenarioId) {
      fail(`raw event sequence ${event.sequence} is outside the exact scenario scope`);
    }
    const details = event.kind === "html_assembly" || event.kind === "artifact_activation"
      ? { artifactRevisionIdHash: sha(String((event.details as Record<string, unknown>).artifactRevisionId)),
        htmlSha256: (event.details as Record<string, unknown>).htmlSha256 }
      : event.details;
    if (row.fingerprint !== event.idempotencyKey || row.scenarioIdHash !== sha(event.scenarioId)
        || row.kind !== event.kind || row.operation !== event.operation || row.unitIdHash !== sha(event.unitId)
        || row.attempt !== event.attempt || row.eventPhase !== event.phase || stableJson(row.details) !== stableJson(details)
        || row.previousHash !== event.prevHash || row.eventHash !== event.eventHash
        || row.occurredAt !== event.occurredAt.toISOString()) {
      fail(`raw event sequence ${event.sequence} does not exactly map to its ledger authority record`);
    }
    previousHash = event.eventHash;
  }
}

function assertPhysicalAttempts(
  events: readonly ReportV4AcceptanceEvent[],
  operation: "question_answer" | "source_diagnosis",
  unitId: string,
  finalPhase: "completed" | "failed",
  count: 0 | 1 | 2,
): void {
  const owned = events.filter((event) => event.kind === "model_operation" && event.operation === operation && event.unitId === unitId);
  if (count === 0) {
    if (owned.length !== 0) fail(`${operation}/${unitId} must have zero physical model events`);
    return;
  }
  const expected = new Set<string>();
  for (let attempt = 1; attempt <= count; attempt += 1) {
    expected.add(`${attempt}:started`);
    expected.add(`${attempt}:${attempt < count ? "failed" : finalPhase}`);
  }
  const actual = new Set(owned.map((event) => `${event.attempt}:${event.phase}`));
  if (owned.length !== expected.size || actual.size !== expected.size || [...expected].some((key) => !actual.has(key))) {
    fail(`${operation}/${unitId} physical events do not equal logical provider count ${count}`);
  }
  for (const event of owned) {
    const details = event.details as Record<string, unknown>;
    if (details.providerCall !== true || details.budgetOutcome !== "allowed"
        || details.retry !== (event.attempt === 2)) fail(`${operation}/${unitId} model event details are not exact`);
  }
}

function assertSiteReadEvents(
  events: readonly ReportV4AcceptanceEvent[],
  unitId: string,
  audit: ReportV4CommerceAuthoritySnapshot["diagnosisCheckpoints"][number]["sourceAuditRecords"][number],
  manifests: ReportV4AcceptanceSiteReadManifestAuthority["records"],
): void {
  for (const manifest of manifests) {
    const operation = manifest.mode === "raw" ? "site_raw_read" : "site_browser_read";
    const started = events.filter((event) => event.kind === "site_read" && event.operation === operation
      && event.unitId === unitId && event.attempt === 1 && event.phase === "started");
    const terminal = events.filter((event) => event.kind === "site_read" && event.operation === operation
      && event.unitId === unitId && event.attempt === 1 && event.phase === manifest.terminalPhase);
    if (started.length !== 1 || terminal.length !== 1 || manifest.terminalPhase === null) {
      fail(`source ${unitId} manifest row has no exact started/terminal event pair`);
    }
    for (const event of [...started, ...terminal]) {
      const details = event.details as Record<string, unknown>;
      if (details.urlHash !== audit.canonicalUrlHash || details.networkPerformed !== true
          || details.readMode !== manifest.mode) fail(`source ${unitId} site-read event details are not exact`);
    }
  }
}

function sourceIdFromEvents(
  events: readonly ReportV4AcceptanceEvent[],
  enhancementJobId: string,
  questionId: string,
  sourceIdHash: string,
): string {
  const prefix = `${enhancementJobId}:${questionId}:`;
  const candidates = new Set(events.filter((event) => event.kind === "site_read" && event.unitId.startsWith(prefix))
    .map((event) => event.unitId.slice(prefix.length)).filter((sourceId) => sha(sourceId) === sourceIdHash));
  if (candidates.size !== 1) fail(`source-audit ${questionId}/${sourceIdHash} has no unique raw event source ID`);
  return [...candidates][0]!;
}

function assertFaultEvents(
  events: readonly ReportV4AcceptanceEvent[],
  scenario: ReportV4AcceptanceScenario,
  unitId: string,
  count: 1 | 2,
): readonly ReportV4AcceptanceEvent[] {
  const faults = events.filter((event) => event.kind === "fault_injection" && event.operation === scenario.faultKind)
    .sort((left, right) => left.sequence - right.sequence);
  if (faults.length !== count || faults.some((event, index) => event.unitId !== unitId || event.attempt !== index + 1
    || event.phase !== "consumed" || (event.details as Record<string, unknown>).occurrence !== index + 1
    || (event.details as Record<string, unknown>).baselineFingerprint !== scenario.baselineFingerprint)) {
    fail(`fault target ${unitId} must have exact occurrences 1..${count}`);
  }
  return faults;
}

function exactTerminal(
  events: readonly ReportV4AcceptanceEvent[],
  operation: "question_answer" | "source_diagnosis",
  identityHash: string,
): ReportV4AcceptanceEvent {
  const matches = events.filter((event) => event.kind === "checkpoint_terminal" && event.operation === operation
    && event.unitId === identityHash && event.attempt === 0 && event.phase === "observed");
  if (matches.length !== 1) fail(`${operation} checkpoint ${identityHash} has no unique terminal event`);
  return matches[0]!;
}

function assertTerminal(event: ReportV4AcceptanceEvent, fingerprint: string, state: string, label: string): void {
  const details = event.details as Record<string, unknown>;
  if (details.checkpointHash !== fingerprint || details.state !== state) fail(`${label} terminal fingerprint/state is not exact`);
}

function orderedCheckpoints<T extends { ordinal: 1 | 2 | 3; identityHash: string }>(rows: readonly T[], label: string): T[] {
  const ordered = [...rows].sort((left, right) => left.ordinal - right.ordinal);
  if (new Set(ordered.map((row) => row.ordinal)).size !== ordered.length
      || new Set(ordered.map((row) => row.identityHash)).size !== ordered.length) {
    fail(`${label} checkpoint ordinals/identities must be unique`);
  }
  return ordered;
}

function exactOpaqueId(ids: readonly string[], hash: string, label: string): string {
  const matches = ids.filter((id) => sha(id) === hash);
  if (matches.length !== 1) fail(`${label} has no unique raw opaque ID`);
  return matches[0]!;
}

function questionOrdinal(commerce: ReportV4CommerceAuthoritySnapshot, questionId: string): 1 | 2 | 3 {
  const matches = commerce.questionCheckpoints.filter((row) => row.questionIdHash === sha(questionId));
  if (matches.length !== 1) fail(`question ${questionId} has no unique commerce ordinal`);
  return matches[0]!.ordinal;
}

function required(value: string | null, label: string): string {
  if (value === null || value.length === 0) fail(`raw scenario ${label} binding is missing`);
  return value;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  const json = JSON.stringify(value);
  if (json === undefined) fail("event authority contains an unsupported value");
  return json;
}

function fail(message: string): never {
  throw new Error(`Report V4 semantic checkpoint projector: ${message}`);
}
