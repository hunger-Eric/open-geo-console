import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  loadReportV4AcceptanceLedgerGuardAuthority,
  projectReportV4AcceptanceLedgerGuardAuthority,
  type LoadReportV4AcceptanceLedgerGuardAuthorityInput,
  type ReportV4AcceptanceLedgerGuardRawSnapshot
} from "./report-v4-acceptance-ledger-guard-authority";
import {
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES,
  REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH
} from "@/report-v4/prohibited-operation-manifest";
import {
  reportV4ProhibitedOperationEventUnitId,
  reportV4ProhibitedOperationGuardRunId
} from "./report-v4-prohibited-operation-guard";

const sessionId = "11111111-1111-4111-8111-111111111111";
const scenarioId = "22222222-2222-4222-8222-222222222222";
const workerGitSha = "a".repeat(40);
const jobId = "job-guard";
const zeroHash = "0".repeat(64);

describe("Report V4 acceptance ledger and prohibited-operation guard authority", () => {
  it("projects a strict hash-safe baseline authority and commits phase to both canonical hashes", () => {
    const baseline = projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), snapshot());
    const finalRaw = snapshot();
    finalRaw.guardRuns[0]!.state = "completed";
    finalRaw.guardRuns[0]!.completed_at = "2026-07-17T00:00:03.000000Z";
    const final = projectReportV4AcceptanceLedgerGuardAuthority(input("final"), finalRaw);

    expect(baseline.ledgerAuthority.events).toHaveLength(1);
    expect(baseline.ledgerAuthority.session.sessionIdHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(baseline)).not.toContain(sessionId);
    expect(JSON.stringify(baseline)).not.toContain(scenarioId);
    expect(JSON.stringify(baseline)).not.toContain(jobId);
    expect(baseline.prohibitedOperationGuardAuthority.counters).toHaveLength(15);
    expect(baseline.ledgerAuthority.canonicalHash).not.toBe(final.ledgerAuthority.canonicalHash);
    expect(baseline.prohibitedOperationGuardAuthority.canonicalHash)
      .not.toBe(final.prohibitedOperationGuardAuthority.canonicalHash);
  });

  it("rejects chain gaps, previous/head tampering, and event fingerprint/hash tampering", () => {
    const gap = snapshot();
    gap.events[0]!.sequence = 2;
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), gap)).toThrow(/sequence|gap/iu);

    const previous = snapshot();
    previous.events[0]!.prev_hash = "f".repeat(64);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), previous)).toThrow(/previous|chain/iu);

    const fingerprint = snapshot();
    fingerprint.events[0]!.idempotency_key = "f".repeat(64);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), fingerprint)).toThrow(/fingerprint|idempotency/iu);

    const eventHash = snapshot();
    eventHash.events[0]!.event_hash = "f".repeat(64);
    eventHash.session.head_hash = "f".repeat(64);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), eventHash)).toThrow(/event hash/iu);

    const head = snapshot();
    head.session.head_hash = "f".repeat(64);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), head)).toThrow(/head hash/iu);
  });

  it("rejects non-canonical details, invalid kind-operation-phase shapes, and count/head drift", () => {
    const details = snapshot();
    details.events[0]!.details = { bindingHash: "b".repeat(64), extra: true };
    details.events[0]!.recomputed_details_canonical = JSON.stringify(details.events[0]!.details);
    details.events[0]!.details_canonical = details.events[0]!.recomputed_details_canonical;
    details.events[0]!.event_hash = recomputeEventHash(details.events[0]!);
    details.session.head_hash = details.events[0]!.event_hash;
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), details)).toThrow(/details|field/iu);

    const phase = snapshot();
    phase.events[0]!.phase = "started";
    phase.events[0]!.idempotency_key = recomputeFingerprint(phase.events[0]!);
    phase.events[0]!.event_hash = recomputeEventHash(phase.events[0]!);
    phase.session.head_hash = phase.events[0]!.event_hash;
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), phase)).toThrow(/kind.*operation.*phase|shape/iu);

    const count = snapshot();
    count.session.event_count = 2;
    count.session.head_sequence = 2;
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), count)).toThrow(/count|rows/iu);
  });

  it("rejects missing, extra, duplicated, or incorrectly mapped guard counters", () => {
    const missing = snapshot();
    missing.guardCounters.pop();
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), missing)).toThrow(/fifteen|counter/iu);

    const extra = snapshot();
    extra.guardCounters.push({ ...extra.guardCounters[0]!, guard_site: "extra_site" });
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), extra)).toThrow(/fifteen|counter|canonical/iu);

    const duplicate = snapshot();
    duplicate.guardCounters[1] = { ...duplicate.guardCounters[0]! };
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), duplicate)).toThrow(/duplicate|canonical|counter/iu);

    const mapped = snapshot();
    mapped.guardCounters[0]!.operation = "correction";
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), mapped)).toThrow(/mapping|canonical/iu);
  });

  it("rejects worker SHA, manifest, run identity, state, and completed-nonzero drift", () => {
    const sha = snapshot();
    sha.guardRuns[0]!.worker_git_sha = "b".repeat(40);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), sha)).toThrow(/worker.*sha/iu);

    const manifest = snapshot();
    manifest.guardRuns[0]!.manifest_hash = "f".repeat(64);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), manifest)).toThrow(/manifest/iu);

    const run = snapshot();
    run.guardRuns[0]!.id = "f".repeat(64);
    run.guardCounters.forEach((counter) => { counter.run_id = run.guardRuns[0]!.id; });
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), run)).toThrow(/run.*identity|deterministic/iu);

    const baselineCompleted = snapshot();
    baselineCompleted.guardRuns[0]!.state = "completed";
    baselineCompleted.guardRuns[0]!.completed_at = "2026-07-17T00:00:03.000000Z";
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), baselineCompleted)).toThrow(/baseline.*armed/iu);

    const finalArmed = snapshot();
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("final"), finalArmed)).toThrow(/final.*completed/iu);

    const completedNonzero = snapshot();
    completedNonzero.guardRuns[0]!.state = "completed";
    completedNonzero.guardRuns[0]!.completed_at = "2026-07-17T00:00:03.000000Z";
    completedNonzero.guardCounters[0]!.attempt_count = 1;
    completedNonzero.guardCounters[0]!.attempted_at = "2026-07-17T00:00:02.000000Z";
    addProhibitedEvent(completedNonzero, 0);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("final"), completedNonzero))
      .toThrow(/completed.*nonzero|final.*zero/iu);
  });

  it("requires every one counter to match one exact prohibited ledger event and every zero counter to have none", () => {
    const missingEvent = snapshot();
    missingEvent.guardCounters[0]!.attempt_count = 1;
    missingEvent.guardCounters[0]!.attempted_at = "2026-07-17T00:00:02.000000Z";
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), missingEvent)).toThrow(/matching prohibited.*event/iu);

    const eventForZero = snapshot();
    addProhibitedEvent(eventForZero, 0);
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), eventForZero)).toThrow(/zero.*event|counter.*event/iu);

    const wrongOperation = snapshot();
    wrongOperation.guardCounters[0]!.attempt_count = 1;
    wrongOperation.guardCounters[0]!.attempted_at = "2026-07-17T00:00:02.000000Z";
    addProhibitedEvent(wrongOperation, 0);
    wrongOperation.events[1]!.operation = "correction";
    wrongOperation.events[1]!.idempotency_key = recomputeFingerprint(wrongOperation.events[1]!);
    wrongOperation.events[1]!.event_hash = recomputeEventHash(wrongOperation.events[1]!);
    wrongOperation.session.head_hash = wrongOperation.events[1]!.event_hash;
    expect(() => projectReportV4AcceptanceLedgerGuardAuthority(input("baseline"), wrongOperation)).toThrow(/matching prohibited.*event|unmatched/iu);
  });

  it("opens exactly one repeatable-read read-only transaction in the public wrapper", async () => {
    const raw = snapshot();
    const tx = { unsafe: vi.fn(async (query: string) => query.includes("authority:isolation")
      ? [{ transaction_isolation: "repeatable read", transaction_read_only: "on" }]
      : query.includes("authority:session") ? [raw.session]
        : query.includes("authority:scenario") ? [raw.scenario]
          : query.includes("authority:events") ? raw.events
            : query.includes("authority:guard-runs") ? raw.guardRuns
              : raw.guardCounters) };
    const begin = vi.fn(async (_options: string, work: (value: typeof tx) => Promise<unknown>) => work(tx));
    await loadReportV4AcceptanceLedgerGuardAuthority({ begin }, input("baseline"));
    expect(begin).toHaveBeenCalledTimes(1);
    expect(begin.mock.calls[0]?.[0]).toBe("isolation level repeatable read read only");
  });
});

function input(phase: "baseline" | "final"): LoadReportV4AcceptanceLedgerGuardAuthorityInput {
  return { sessionId, scenarioId, phase };
}

function snapshot(): ReportV4AcceptanceLedgerGuardRawSnapshot {
  const event = eventRow({
    sequence: 1,
    prev_hash: zeroHash,
    kind: "scenario_bound",
    operation: "v4_dispatch",
    unit_id: "binding-unit",
    attempt: 0,
    phase: "observed",
    details: { bindingHash: "b".repeat(64) },
    occurred_at_canonical: "2026-07-17T00:00:01.000000Z"
  });
  const runInput = { sessionId, scenarioId, jobId, workerGitSha };
  const runId = reportV4ProhibitedOperationGuardRunId(runInput);
  return {
    session: {
      id: sessionId, environment: "protected_staging", preview_deployment_id: "dpl-safe",
      protected_alias_url: "https://preview.example", web_git_sha: workerGitSha, worker_git_sha: workerGitSha,
      state: "collecting", head_sequence: 1, head_hash: event.event_hash, event_count: 1,
      started_at: "2026-07-17T00:00:00.000000Z", terminal_at: null
    },
    scenario: {
      id: scenarioId, session_id: sessionId, report_id: "report-1", order_id: "order-1",
      pre_admission_job_id: jobId, core_job_id: "job-core", enhancement_job_id: null,
      site_snapshot_id: "snapshot-1", config_snapshot_id: "config-1", question_set_id: "questions-1",
      core_artifact_revision_id: "artifact-core", enhancement_artifact_revision_id: null,
      kind: "question_failure", fault_kind: "question_failure", fault_question_id: "question-1",
      fault_source_id: null, expected_fault_occurrences: 2, baseline_fingerprint: null, final_fingerprint: null,
      state: "collecting", created_at: "2026-07-17T00:00:00.000000Z", terminal_at: null
    },
    events: [event],
    guardRuns: [{
      id: runId, domain: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_DOMAIN, session_id: sessionId,
      scenario_id: scenarioId, job_id: jobId, worker_git_sha: workerGitSha,
      manifest_hash: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_HASH, state: "armed",
      armed_at: "2026-07-17T00:00:00.500000Z", completed_at: null
    }],
    guardCounters: REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.map(({ operation, guardSite }) => ({
      run_id: runId, operation, guard_site: guardSite, attempt_count: 0,
      seeded_at: "2026-07-17T00:00:00.500000Z", attempted_at: null
    }))
  };
}

function addProhibitedEvent(raw: ReportV4AcceptanceLedgerGuardRawSnapshot, counterIndex: number): void {
  const counter = raw.guardCounters[counterIndex]!;
  const previous = raw.events.at(-1)!;
  const event = eventRow({
    sequence: previous.sequence + 1,
    prev_hash: previous.event_hash,
    kind: "prohibited_operation",
    operation: counter.operation,
    unit_id: reportV4ProhibitedOperationEventUnitId(jobId, counter.guard_site as never),
    attempt: 0,
    phase: "started",
    details: {},
    occurred_at_canonical: "2026-07-17T00:00:02.000000Z"
  });
  raw.events.push(event);
  raw.session.head_sequence = raw.events.length;
  raw.session.event_count = raw.events.length;
  raw.session.head_hash = event.event_hash;
}

function eventRow(input: Record<string, unknown>): Record<string, unknown> {
  const row = {
    session_id: sessionId,
    scenario_id: scenarioId,
    ...input,
    occurred_at: input.occurred_at_canonical,
    details_canonical: JSON.stringify(input.details),
    recomputed_details_canonical: JSON.stringify(input.details),
    recomputed_occurred_at_canonical: input.occurred_at_canonical
  };
  return { ...row, idempotency_key: recomputeFingerprint(row), event_hash: recomputeEventHash({ ...row, idempotency_key: recomputeFingerprint(row) }) };
}

function recomputeFingerprint(row: Record<string, unknown>): string {
  return digest([row.session_id, row.scenario_id, row.kind, row.operation, row.unit_id, row.attempt, row.phase].join("\x1f"));
}

function recomputeEventHash(row: Record<string, unknown>): string {
  return digest([row.prev_hash, row.idempotency_key, row.sequence, row.kind, row.operation, row.unit_id,
    row.attempt, row.phase, row.details_canonical, row.occurred_at_canonical].join("\x1f"));
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
