import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { completePayload, reseal, stableZero } from "../db/report-v4-acceptance-authority-phase-snapshot.test-fixture";
import { createReportV4CommerceAuthoritySnapshotPair, resealReportV4CommerceAuthoritySnapshot } from "./report-v4-commerce-authority-comparator.test-fixture";
import type { ReportV4AcceptanceEvent, ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import type { ReportV4AcceptanceLedgerAuthorityEventRecord } from "../db/report-v4-acceptance-ledger-guard-authority";
import type { ReportV4AcceptanceSiteReadManifestAuthority, ReportV4AcceptanceSiteReadManifestAuthorityRecord } from "../db/report-v4-site-read-manifest";
import type { ReportV4ArtifactPayloadAuthorityRecord } from "../db/report-v4-artifact-authority";
import type { ReportV4CommerceAuthoritySnapshot } from "../db/report-v4-commerce-authority-snapshot";
import type { ReportV4AcceptanceCompleteAuthorityPhasePayload } from "../db/report-v4-acceptance-authority-phase-snapshot";
import {
  projectReportV4AcceptanceSemanticCheckpoints,
  type ProjectReportV4AcceptanceSemanticCheckpointsInput,
} from "./acceptance-semantic-checkpoint-projector";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";
const REPORT = "report";
const ORDER = "order";
const CORE = "job-core";
const ENHANCEMENT = "job-enhancement";
const SNAPSHOT = "snapshot";
const CONFIG = "config";
const QUESTION_SET = "questions";
const CORE_ARTIFACT = "artifact-core";
const ENHANCEMENT_ARTIFACT = "artifact-enhancement";
const QUESTIONS = ["question-1", "question-2", "question-3"] as const;
const SOURCES = ["source-1", "source-2", "source-3"] as const;

describe("Report V4 semantic checkpoint projector", () => {
  it.each(["success", "diagnosis_failure", "question_failure"] as const)(
    "projects exact %s checkpoint authority",
    (kind) => {
      const fixture = makeFixture(kind);
      const result = projectReportV4AcceptanceSemanticCheckpoints(fixture.input);
      expect(result.questions.map((row) => row.questionId)).toEqual(QUESTIONS);
      expect(result.diagnoses).toHaveLength(kind === "question_failure" ? 0 : 3);
      if (kind === "question_failure") {
        expect(result.questions[1]).toMatchObject({ state: "unavailable", logicalProviderCallCount: 2,
          physicalProviderCallCount: 0, sourceCount: 0 });
      } else if (kind === "diagnosis_failure") {
        expect(result.diagnoses[1]).toMatchObject({ state: "failed", logicalProviderCallCount: 2,
          physicalProviderCallCount: 0 });
      } else {
        expect(result.sourceFaultZeroClaim).toEqual({ unitId: `${ENHANCEMENT}:question-2:source-2`,
          physicalClaimCount: 0, injectedBeforeClaim: true, questionId: "question-2", sourceId: "source-2",
          persistedAuditStatus: "inaccessible", coreAnswerContentPreserved: true, sourceLinkPreserved: true });
      }
      expect(result.questions.every((row) => row.sourceOwnershipVerified && row.inputScopeVerified)).toBe(true);
      expect(result.diagnoses.every((row) => row.sourceAuditOwnershipVerified && row.inputScopeVerified)).toBe(true);
    },
  );

  it("accepts a full global prefix with foreign scenario events and keeps checkpoint semantics scenario-local", () => {
    const input = structuredClone(makeFixture("success").input) as unknown as MutableInput;
    appendForeignScenarioBound(input);
    resealInput(input);
    expect(projectReportV4AcceptanceSemanticCheckpoints(
      input as unknown as ProjectReportV4AcceptanceSemanticCheckpointsInput,
    ).questions).toHaveLength(3);
  });

  it("rejects a foreign raw event mapped to the wrong projected scenario hash", () => {
    const input = structuredClone(makeFixture("success").input) as unknown as MutableInput;
    appendForeignScenarioBound(input);
    input.finalPhase.authorities.ledger_authority.events.at(-1)!.scenarioIdHash = sha(SCENARIO);
    resealInput(input);
    expect(() => projectReportV4AcceptanceSemanticCheckpoints(
      input as unknown as ProjectReportV4AcceptanceSemanticCheckpointsInput,
    )).toThrow(/does not exactly map/i);
  });

  it("rejects omission from the caller-supplied full global raw prefix", () => {
    const input = structuredClone(makeFixture("success").input) as unknown as MutableInput;
    input.events.pop();
    expect(() => projectReportV4AcceptanceSemanticCheckpoints(
      input as unknown as ProjectReportV4AcceptanceSemanticCheckpointsInput,
    )).toThrow(/counts differ|exact-length/i);
  });

  it.each([
    ["tampered question hash", "success", (input: MutableInput) => {
      input.finalPhase.commerce.questionCheckpoints[0]!.questionIdHash = sha("foreign-question");
    }, /recover.*question IDs|opaque ID|source record question/iu],
    ["duplicate ordinal", "success", (input: MutableInput) => {
      input.finalPhase.commerce.questionCheckpoints[2]!.ordinal = 2;
    }, /ordinal/iu],
    ["wrong fault logical count", "question_failure", (input: MutableInput) => {
      input.finalPhase.commerce.questionCheckpoints.find((row) => row.ordinal === 2)!.providerCallCount = 1;
    }, /logical provider count two/iu],
    ["wrong source-fault status", "success", (input: MutableInput) => {
      input.finalPhase.commerce.diagnosisCheckpoints.find((row) => row.ordinal === 2)!.sourceAuditRecords[0]!.status = "available";
    }, /fault source.*inaccessible/iu],
    ["wrong non-fault audit status", "diagnosis_failure", (input: MutableInput) => {
      input.finalPhase.commerce.diagnosisCheckpoints.find((row) => row.ordinal === 1)!.sourceAuditRecords[0]!.status = "inaccessible";
    }, /non-fault source-audit status.*available|inaccessible source audit/iu],
    ["foreign manifest source owner", "diagnosis_failure", (input: MutableInput) => {
      input.finalPhase.authorities.site_read_manifest.records[0]!.ownerSourceIdHash = sha("foreign-source");
    }, /ownership.*manifest pair/iu],
    ["duplicate opaque model question", "success", (input: MutableInput) => {
      input.events.push(modelEvent("question_answer", "foreign-question", 1, "started", input.events.length + 1));
      input.events.push(modelEvent("question_answer", "foreign-question", 1, "completed", input.events.length + 1));
      resequence(input.events as unknown as ReportV4AcceptanceEvent[]);
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /uniquely recover.*question IDs/iu],
    ["physical work on faulted question", "question_failure", (input: MutableInput) => {
      input.events.push(modelEvent("question_answer", "question-2", 1, "started", input.events.length + 1));
      input.events.push(modelEvent("question_answer", "question-2", 1, "failed", input.events.length + 1));
      resequence(input.events as unknown as ReportV4AcceptanceEvent[]);
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /zero physical model events/iu],
    ["tampered ledger mapping", "success", (input: MutableInput) => {
      input.finalPhase.authorities.ledger_authority.events[0]!.unitIdHash = sha("tampered-unit");
    }, /does not exactly map/iu],
    ["unprovable artifact preservation", "success", (input: MutableInput) => {
      input.finalPhase.authorities.artifact_combined_payload_integrity.artifacts.find((row) => row.revisionKind === "diagnosis_enhancement")!.preservedContentHash = sha("drift");
    }, /cannot uniquely prove Core answer.*source-link preservation/iu],
    ["foreign question source owner", "success", (input: MutableInput) => {
      input.finalPhase.commerce.questionCheckpoints[0]!.sourceRecords[0]!.questionIdHash = sha("foreign-question");
    }, /source ownership|source record question/iu],
    ["orphan manifest record", "success", (input: MutableInput) => {
      input.finalPhase.authorities.site_read_manifest.records.push(manifestRecord("question-1", "orphan-source", sha("orphan-url")));
    }, /orphan source owner/iu],
    ["orphan site-read event", "success", (input: MutableInput) => {
      addSitePair(input.events as unknown as ReportV4AcceptanceEvent[], `${ENHANCEMENT}:question-1:orphan-source`, sha("orphan-url"));
      resequence(input.events as unknown as ReportV4AcceptanceEvent[]);
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /partition|no exact manifest owner/iu],
    ["duplicate ledger fingerprint", "success", (input: MutableInput) => {
      input.finalPhase.authorities.ledger_authority.events[1]!.fingerprint =
        input.finalPhase.authorities.ledger_authority.events[0]!.fingerprint;
    }, /fingerprint.*uniqu|unique.*fingerprint/iu],
    ["late success fault", "success", (input: MutableInput) => {
      const fault = input.events.splice(input.events.findIndex((event) => event.kind === "fault_injection"), 1)[0]!;
      input.events.push(fault); resequence(input.events as unknown as ReportV4AcceptanceEvent[]);
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /not injected before/iu],
    ["orphan browser for existing owner", "success", (input: MutableInput) => {
      const events = input.events as unknown as ReportV4AcceptanceEvent[];
      for (const phase of ["started", "completed"] as const) events.push(makeEvent({ kind: "site_read",
        operation: "site_browser_read", unitId: `${ENHANCEMENT}:question-1:source-1`, attempt: 1, phase,
        details: { urlHash: sha("https://source-1.example/evidence"), readMode: "browser", networkPerformed: true } }, events.length + 1));
      resequence(events); input.finalPhase.authorities.ledger_authority.events = mapLedger(events);
    }, /partition|no exact manifest owner/iu],
    ["late question fault", "question_failure", (input: MutableInput) => moveFaultsLast(input), /not injected before/iu],
    ["late diagnosis fault", "diagnosis_failure", (input: MutableInput) => moveFaultsLast(input), /not injected before/iu],
    ["foreign admission unit", "question_failure", (input: MutableInput) => {
      for (const event of input.events.filter((row) => row.kind === "site_read")) event.unitId = "foreign-admission-unit";
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /production-convention|exact manifest identity/iu],
    ["admission details mode drift", "question_failure", (input: MutableInput) => {
      for (const event of input.events.filter((row) => row.kind === "site_read"))
        (event.details as Mutable<Record<string, unknown>>).readMode = "browser";
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /production-convention|exact manifest identity/iu],
    ["success foreign nonprefix site read", "success", (input: MutableInput) => addForeignRead(input),
      /partition|manifest identity/iu],
    ["diagnosis foreign nonprefix site read", "diagnosis_failure", (input: MutableInput) => addForeignRead(input),
      /partition|manifest identity/iu],
    ["success admission unit drift", "success", (input: MutableInput) => {
      for (const event of input.events.filter((row) => row.kind === "site_read" && row.attempt === 0))
        event.unitId = "foreign-admission-unit";
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /production-convention|partition|manifest identity/iu],
    ["diagnosis admission mode drift", "diagnosis_failure", (input: MutableInput) => {
      for (const event of input.events.filter((row) => row.kind === "site_read" && row.attempt === 0))
        (event.details as Mutable<Record<string, unknown>>).readMode = "browser";
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /production-convention|partition|manifest identity/iu],
    ["fault event baseline drift", "success", (input: MutableInput) => {
      for (const event of input.events.filter((row) => row.kind === "fault_injection"))
        (event.details as Mutable<Record<string, unknown>>).baselineFingerprint = sha("arbitrary-baseline");
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /fault target|baseline fingerprint|baselineFingerprint/iu],
    ["synchronized noncanonical fault kind", "success", (input: MutableInput) => {
      input.scenario.faultKind = "diagnosis_failure";
      input.finalPhase.authorities.ledger_authority.scenario.faultKind = "diagnosis_failure";
      for (const event of input.events.filter((row) => row.kind === "fault_injection")) {
        event.operation = "diagnosis_failure";
        (event.details as Mutable<Record<string, unknown>>).fault = "diagnosis_failure";
      }
      input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
    }, /canonical fault topology|fault topology/iu],
    ["caller-order disguised reversed fault occurrences", "diagnosis_failure", (input: MutableInput) => {
      const events = input.events as unknown as ReportV4AcceptanceEvent[];
      const indexes = events.map((event, index) => event.kind === "fault_injection" ? index : -1).filter((index) => index >= 0);
      [events[indexes[0]!]!, events[indexes[1]!]!] = [events[indexes[1]!]!, events[indexes[0]!]!];
      resequence(events);
      [events[indexes[0]!]!, events[indexes[1]!]!] = [events[indexes[1]!]!, events[indexes[0]!]!];
      input.finalPhase.authorities.ledger_authority.events = mapLedger([...events].sort((left, right) => left.sequence - right.sequence));
    }, /strict contiguous sequence order|fault target/iu],
  ] as const)("rejects %s", (_label, kind, mutate, pattern) => {
    const input = structuredClone(makeFixture(kind).input) as unknown as MutableInput;
    mutate(input);
    expect(() => { resealInput(input);
      projectReportV4AcceptanceSemanticCheckpoints(input as unknown as ProjectReportV4AcceptanceSemanticCheckpointsInput); })
      .toThrow(pattern);
  });
});

function moveFaultsLast(input: MutableInput): void {
  const events = input.events as unknown as ReportV4AcceptanceEvent[];
  const faults = events.filter((event) => event.kind === "fault_injection");
  const kept = events.filter((event) => event.kind !== "fault_injection"); events.splice(0, events.length, ...kept, ...faults);
  resequence(events); input.finalPhase.authorities.ledger_authority.events = mapLedger(events);
}

function addForeignRead(input: MutableInput): void {
  const events = input.events as unknown as ReportV4AcceptanceEvent[];
  addSitePair(events, "foreign-nonprefix-unit", sha("foreign-read-url")); resequence(events);
  input.finalPhase.authorities.ledger_authority.events = mapLedger(events);
}

function appendForeignScenarioBound(input: MutableInput): void {
  const foreign = makeEvent({ kind: "scenario_bound", operation: "v4_dispatch", unitId: "foreign-binding",
    attempt: 0, phase: "observed", details: { bindingHash: sha("foreign-binding") } }, input.events.length + 1);
  Object.assign(foreign, { scenarioId: "33333333-3333-4333-8333-333333333333" });
  input.events.push(foreign as Mutable<ReportV4AcceptanceEvent>);
  resequence(input.events as unknown as ReportV4AcceptanceEvent[]);
  input.finalPhase.authorities.ledger_authority.events = mapLedger(input.events);
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
  ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
type MutableInput = Mutable<ProjectReportV4AcceptanceSemanticCheckpointsInput>;

function makeFixture(kind: "success" | "diagnosis_failure" | "question_failure") {
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
      sourcePayloadHash: sha(`source-payload-${ordinal}`), sourceCount: questionFault ? 0 : 1,
      sourceRecords: questionFault ? [] : [{ questionIdHash: sha(questionId), sourceIdHash: sha(SOURCES[index]),
        titleHash: sha(`source-title-${ordinal}`), canonicalUrlHash: sha(`https://source-${ordinal}.example/evidence`),
        citedTextHash: sha(`source-cited-${ordinal}`), retrievalStatus: "not_checked" }],
      answerContentHash: questionFault ? null : sha(`answer-${ordinal}`), terminalFingerprint: sha(`question-terminal-${ordinal}`) });

    if (!hasEnhancement) continue;
    const sourceId = SOURCES[index];
    const sourceFault = kind === "success" && ordinal === 2;
    const diagnosisFault = kind === "diagnosis_failure" && ordinal === 2;
    const diagnosisIdentity = sha(`diagnosis-checkpoint-${ordinal}`);
    const diagnosisState = diagnosisFault ? "failed" as const : "completed" as const;
    const diagnosisCalls = diagnosisFault ? 2 as const : 1 as const;
    const urlHash = sha(`https://source-${ordinal}.example/evidence`);
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
      providerCallCount: diagnosisCalls, sourceAuditPayloadHash: sha(`audit-payload-${ordinal}`), sourceAuditCount: 1,
      sourceAuditRecords: [{ questionIdHash: sha(questionId), sourceIdHash: sha(sourceId), canonicalUrlHash: urlHash,
        status: sourceFault ? "inaccessible" : "available", summaryHash: sourceFault ? null : sha(`summary-${ordinal}`) }],
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
  const siteReadManifest = { contractVersion: "report-v4-acceptance-site-read-manifest-authority-v1" as const, phase: "final" as const,
    scenarioKind: kind, sessionIdHash: sha(SESSION), scenarioIdHash: sha(SCENARIO), reportIdHash: sha(REPORT),
    preAdmissionJobIdHash: sha("job-pre"), enhancementJobIdHash: hasEnhancement ? sha(ENHANCEMENT) : null,
    records: manifestRecords, requiredIdentityHashes: manifestRecords.map((row) => row.identityHash),
    allowedIdentityHashes: manifestRecords.map((row) => row.identityHash), authorityHash: sha("manifest") };
  const input: ProjectReportV4AcceptanceSemanticCheckpointsInput = {
    scenario,
    events,
    finalPhase: completeFinalPhase(kind, commerce, mapLedger(events), siteReadManifest, artifactFixture(kind), events),
  };
  return { input };
}

function resealInput(input: MutableInput): void {
  const phase = input.finalPhase;
  resealReportV4CommerceAuthoritySnapshot(phase.commerce);
  const manifest = phase.authorities.site_read_manifest;
  manifest.records.sort((left, right) => left.identityHash.localeCompare(right.identityHash));
  manifest.requiredIdentityHashes = manifest.records.map((row) => row.identityHash);
  manifest.allowedIdentityHashes = manifest.records.map((row) => row.identityHash);
  const headHash = input.events.at(-1)?.eventHash ?? "0".repeat(64);
  Object.assign(phase.session, { headSequence: input.events.length, headHash, eventCount: input.events.length });
  Object.assign(phase.authorities.ledger_authority.session,
    { headSequence: input.events.length, headHash, eventCount: input.events.length });
  reseal(phase, "artifact_combined_payload_integrity"); reseal(phase, "site_read_manifest");
  reseal(phase, "ledger_authority"); reseal(phase, "prohibited_operation_guard_authority");
  reseal(phase, "zero_database_effect_counts");
}

function completeFinalPhase(kind: "success" | "diagnosis_failure" | "question_failure",
  commerce: ReportV4CommerceAuthoritySnapshot, ledgerEvents: ReportV4AcceptanceLedgerAuthorityEventRecord[],
  manifest: ReportV4AcceptanceSiteReadManifestAuthority, artifact: ReturnType<typeof artifactFixture>,
  events: readonly ReportV4AcceptanceEvent[]): ReportV4AcceptanceCompleteAuthorityPhasePayload {
  const payload = structuredClone(completePayload()) as Mutable<ReportV4AcceptanceCompleteAuthorityPhasePayload>;
  payload.phase = "final"; payload.scenarioKind = kind; payload.capturedAt = commerce.capturedAt;
  payload.commerce = commerce as Mutable<ReportV4CommerceAuthoritySnapshot>;
  payload.authorities.site_read_manifest = manifest;
  payload.authorities.artifact_combined_payload_integrity = artifact;
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
  reseal(payload, "artifact_combined_payload_integrity"); reseal(payload, "site_read_manifest");
  reseal(payload, "ledger_authority"); reseal(payload, "prohibited_operation_guard_authority");
  reseal(payload, "zero_database_effect_counts");
  return payload;
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
  commerce.questionCheckpoints = [...questions]; commerce.diagnosisCheckpoints = [...diagnoses];
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

function addModelPair(events: ReportV4AcceptanceEvent[], operation: "question_answer" | "source_diagnosis",
  unitId: string, attempt: 1 | 2, terminal: "completed" | "failed"): void {
  events.push(modelEvent(operation, unitId, attempt, "started", events.length + 1));
  events.push(modelEvent(operation, unitId, attempt, terminal, events.length + 1));
}

function addSitePair(events: ReportV4AcceptanceEvent[], unitId: string, urlHash: string): void {
  for (const phase of ["started", "completed"] as const) events.push(makeEvent({ kind: "site_read", operation: "site_raw_read",
    unitId, attempt: 1, phase, details: { urlHash, readMode: "raw", networkPerformed: true } }, events.length + 1));
}

function modelEvent(operation: "question_answer" | "source_diagnosis", unitId: string, attempt: 1 | 2,
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

function makeEvent(value: Pick<ReportV4AcceptanceEvent, "kind" | "operation" | "unitId" | "attempt" | "phase" | "details">,
  sequence: number): ReportV4AcceptanceEvent {
  const occurredAt = new Date(Date.parse("2026-07-18T00:00:00.000Z") + sequence * 1000);
  return { ...value, idempotencyKey: sha(`event-${sequence}`), sessionId: SESSION, scenarioId: SCENARIO, sequence,
    detailsCanonical: stable(value.details), prevHash: sha(`prev-${sequence}`), eventHash: sha(`hash-${sequence}`),
    occurredAt, occurredAtCanonical: occurredAt.toISOString() } as ReportV4AcceptanceEvent;
}

function resequence(events: ReportV4AcceptanceEvent[]): void {
  let previousHash = "0".repeat(64);
  for (const [index, event] of events.entries()) {
    const sequence = index + 1;
    const occurredAt = new Date(Date.parse("2026-07-18T00:00:00.000Z") + sequence * 1000);
    Object.assign(event, { sequence, idempotencyKey: sha(`event-${sequence}`), prevHash: previousHash,
      eventHash: sha(`hash-${sequence}-${event.kind}-${event.operation}-${event.unitId}`), occurredAt,
      occurredAtCanonical: occurredAt.toISOString(), detailsCanonical: stable(event.details) });
    previousHash = event.eventHash;
  }
}

function mapLedger(events: readonly ReportV4AcceptanceEvent[]): ReportV4AcceptanceLedgerAuthorityEventRecord[] {
  return events.map((event) => ({ sequence: event.sequence, fingerprint: event.idempotencyKey,
    scenarioIdHash: sha(event.scenarioId), kind: event.kind, operation: event.operation, unitIdHash: sha(event.unitId),
    attempt: event.attempt, eventPhase: event.phase, details: event.details as Readonly<Record<string, unknown>>,
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
function stable(value: unknown): string { return JSON.stringify(value); }
