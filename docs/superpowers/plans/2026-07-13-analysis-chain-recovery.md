# Analysis-Chain Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every report-analysis phase recover from a validated PostgreSQL checkpoint and retain private, structured, redacted failure history without changing the commercial source of truth.

**Architecture:** Add a schema-v16 execution ledger to `scan_jobs` while retaining `stage` as a transactionally updated compatibility projection. `JobTransitionService` becomes the sole writer for claims, checkpoints, waits, failures and terminal states; `JobErrorClassifier` and `CheckpointValidator` provide deterministic phase-boundary behavior. The Worker maps its existing reusable crawl/analysis/V2 artifacts onto the new phases and invokes the service rather than directly mutating `scan_jobs`.

**Tech Stack:** Next.js/TypeScript, Drizzle ORM, PostgreSQL transactions, Vitest, existing Worker and commercial repositories.

## Global Constraints

- PostgreSQL remains the sole production state authority; the Web process must not crawl or call AI/public-search providers.
- `stage` is a compatibility projection only; all new execution-state writes go through `JobTransitionService` in the same transaction as error/transition events.
- Customer APIs, emails, reports and public logs never contain private diagnostics, secrets, credentials, raw client IPs or operator details.
- `repair_wait` releases its Worker lease and cannot create a failure refund or failure email before SLA expiry.
- Do not add public force-retry, quota, payment, authority or certification bypasses.
- Preserve atomic paid terminalization and reject recovery once a refund is submitted/completed or failure/refund email is delivered.

---

## File Structure

- Create `apps/web/src/worker/job-state.ts`: execution phases/states, checkpoint envelope, stage projection and phase ordering.
- Create `apps/web/src/worker/job-errors.ts`: stable errors, normalization, redaction, fingerprinting and retry/backoff decisions.
- Create `apps/web/src/worker/job-transition-service.ts`: transactional claim/checkpoint/wait/resume/terminal transitions and event writes.
- Create `apps/web/src/worker/job-recovery.ts`: checkpoint and readiness validation plus restricted historical recovery.
- Modify `apps/web/src/db/schema.ts` and `apps/web/src/db/migrations.ts`: v16 ledger columns, append-only event tables, constraints and compatibility backfill.
- Modify `apps/web/src/db/jobs.ts`: preserve public readers but delegate all execution mutations to the transition service.
- Modify `apps/web/src/worker/processor.ts` and `apps/web/src/public-source-forensics/production-runtime.ts`: phase-boundary checkpoints, classified errors and lossless V2 runtime errors.
- Modify `apps/web/src/db/commercial-refunds.ts`: use execution terminal state for SLA terminalization and restricted recovery guards.
- Add unit tests under `apps/web/src/worker/` and PostgreSQL tests under `apps/web/src/db/`.

### Task 1: Add schema-v16 execution ledger and event tables

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Test: `apps/web/src/db/jobs.postgres.test.ts`

**Interfaces:**
- Produces `ScanJobExecutionState`, `ScanJobPhase`, `ScanJobErrorEventRow`, and `ScanJobTransitionEventRow`.
- Produces DB columns `execution_state`, `current_phase`, `checkpoint_revision`, `phase_attempt`, `resume_generation`, `retry_not_before`, `repair_reason_code`, and `repair_deadline_at`.

- [ ] **Step 1: Write PostgreSQL migration assertions**

```ts
expect(columns).toEqual(expect.arrayContaining([
  "execution_state", "current_phase", "checkpoint_revision", "phase_attempt",
  "resume_generation", "retry_not_before", "repair_reason_code", "repair_deadline_at"
]));
expect(errorEvents).toHaveLength(1);
expect(transitionEvents[0]).toMatchObject({ toExecutionState: "retry_wait" });
```

- [ ] **Step 2: Run the isolated migration test and verify it fails**

Run: `npm test -- --run apps/web/src/db/jobs.postgres.test.ts`

- [ ] **Step 3: Add v16 migrations and Drizzle schema definitions**

```sql
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS execution_state text NOT NULL DEFAULT 'queued';
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS current_phase text NOT NULL DEFAULT 'admission';
ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS checkpoint_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS scan_job_error_events (...);
CREATE TABLE IF NOT EXISTS scan_job_transition_events (...);
```

- [ ] **Step 4: Backfill only nonterminal legacy rows and keep terminal rows terminal**

```sql
UPDATE scan_jobs SET execution_state = CASE
  WHEN stage IN ('completed','completed_limited') THEN 'completed'
  WHEN stage = 'failed' THEN 'failed' ELSE 'queued' END;
```

- [ ] **Step 5: Run migration and schema tests**

Run: `npm test -- --run apps/web/src/db/jobs.postgres.test.ts`

### Task 2: Implement structured errors, redaction and phase-local retry policy

**Files:**
- Create: `apps/web/src/worker/job-errors.ts`
- Test: `apps/web/src/worker/job-errors.test.ts`

**Interfaces:**
- Produces `normalizeJobError(error, context): NormalizedJobError` and `JobFailureClassification`.
- Produces `RuntimeDisabledError`, `RequiredConfigurationError`, `AuthorityMismatchError`, `CheckpointValidationError` and `TerminalizationError` with stable `name`, `code`, `classification`, and optional `cause`.

- [ ] **Step 1: Write failing normalization and redaction tests**

```ts
expect(normalizeJobError(new Error("Bearer super-secret postgres://u:p@host/db"), ctx))
  .toMatchObject({ classification: "transient", code: "unexpected_internal_error" });
expect(event.message).not.toContain("super-secret");
expect(event.stack).not.toContain("postgres://u:p@host/db");
expect(event.fingerprint).toMatch(/^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run the unit test to verify failure**

Run: `npm test -- --run apps/web/src/worker/job-errors.test.ts`

- [ ] **Step 3: Implement bounded private diagnostics and deterministic classification**

```ts
export function normalizeJobError(error: unknown, context: JobErrorContext): NormalizedJobError {
  const known = error instanceof JobError ? error : unknownError(error);
  return { ...known, message: redactAndLimit(known.message, 1_000),
    stack: redactAndLimit(known.stack ?? "", 8_000), fingerprint: fingerprint(known, context) };
}
```

- [ ] **Step 4: Verify repeated unknown fingerprints pause for repair and target limitations do not fail jobs**

Run: `npm test -- --run apps/web/src/worker/job-errors.test.ts`

### Task 3: Implement the single transition authority and checkpoint validation

**Files:**
- Create: `apps/web/src/worker/job-state.ts`
- Create: `apps/web/src/worker/job-transition-service.ts`
- Create: `apps/web/src/worker/job-recovery.ts`
- Test: `apps/web/src/worker/job-transition-service.test.ts`
- Test: `apps/web/src/db/jobs.postgres.test.ts`

**Interfaces:**
- Produces `JobTransitionService.claim`, `.checkpoint`, `.transientFailure`, `.repairWait`, `.resumeAfterRepair`, `.terminalize`, and `.terminalizeForSla`.
- Produces `CheckpointValidator.validate({ job, checkpoint, phase, readiness })`.

- [ ] **Step 1: Write failing transition tests for stale leases, monotonic revision, backoff and repair lease release**

```ts
await service.checkpoint({ jobId, workerId, phase: "planning", checkpoint, progress: 25 });
await expect(service.checkpoint({ jobId, workerId: "stale", phase: "fetching", checkpoint, progress: 35 }))
  .rejects.toThrow("lease");
expect(after.checkpointRevision).toBe(before.checkpointRevision + 1);
expect(after.executionState).toBe("repair_wait");
expect(after.leaseOwner).toBeNull();
```

- [ ] **Step 2: Implement transactional transitions and append-only event writes**

```ts
await tx.begin(async (transaction) => {
  await updateJobWithLease(transaction, input);
  await insertTransitionEvent(transaction, event);
  if (normalizedError) await insertErrorEvent(transaction, normalizedError);
});
```

- [ ] **Step 3: Make resume validate identity, revision, input hash, artifacts, readiness and commercial state**

```ts
const validation = await validator.validate(input);
if (!validation.ok) throw new CheckpointValidationError(validation.reason);
return service.resumeAfterRepair({ ...input, phase: validation.phase });
```

- [ ] **Step 4: Run deterministic and PostgreSQL transition suites**

Run: `npm test -- --run apps/web/src/worker/job-transition-service.test.ts apps/web/src/db/jobs.postgres.test.ts`

### Task 4: Move queue claiming, Worker checkpoints and error boundaries to the service

**Files:**
- Modify: `apps/web/src/db/jobs.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: `apps/web/src/worker/index.ts`
- Test: `apps/web/src/worker/processor-contract.test.ts`
- Test: `apps/web/src/worker/processor.test.ts`

**Interfaces:**
- `claimScanJob` claims only `queued` jobs where `retry_not_before IS NULL OR retry_not_before <= now()`.
- `processScanJob` reports every phase through `JobTransitionService`; it never classifies by error message text.

- [ ] **Step 1: Write phase fault-injection tests**

```ts
for (const phase of ["discovery", "fetching", "page_analysis", "website_synthesis", "public_source_preflight", "snapshot_resolution", "source_retrieval", "evidence_graph", "report_build", "artifact_verification", "terminalization"] as const) {
  await expect(runFault(phase)).resolves.toMatchObject({ state: "repair_wait" });
}
```

- [ ] **Step 2: Map existing stages to explicit phases and write phase checkpoint envelopes**

```ts
await transitions.checkpoint({ jobId: job.id, workerId, phase: "page_analysis",
  progress: analysisProgress(done, total), checkpoint: withEnvelope(checkpoint, job, "page_analysis") });
```

- [ ] **Step 3: Replace `isRetryable()` and `failScanJob()` branching with normalized transition decisions**

```ts
const error = normalizeJobError(caught, context);
await transitions.recordFailure({ job, workerId, error, coverage });
```

- [ ] **Step 4: Verify completed crawl pages, AI batches, website foundation and snapshots are not recomputed**

Run: `npm test -- --run apps/web/src/worker/processor.test.ts apps/web/src/worker/processor-contract.test.ts`

### Task 5: Preserve V2 runtime causes and add deterministic readiness probes

**Files:**
- Modify: `apps/web/src/public-source-forensics/production-runtime.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Test: `apps/web/src/public-source-forensics/production-runtime.test.ts`
- Test: `apps/web/src/worker/processor-contract.test.ts`

**Interfaces:**
- `createProductionPublicSourceForensicsDependencies` throws classified runtime errors rather than returning `null` for a failed runtime resolution.
- `PhaseReadinessProbe.probe(phase, job)` is non-mutating and verifies only the dependency required for that phase.

- [ ] **Step 1: Write a regression test for runtime-disabled, missing-config and authority-mismatch codes**

```ts
await expect(createProductionPublicSourceForensicsDependencies({ OGC_PUBLIC_SEARCH_RUNTIME_ENABLED: "false" }))
  .rejects.toMatchObject({ code: "public_source_runtime_disabled", classification: "operator_repairable" });
```

- [ ] **Step 2: Replace the blanket `catch { return null }` with typed propagation**

```ts
catch (error) { throw classifyPublicSourceRuntimeError(error); }
```

- [ ] **Step 3: Verify a repaired V2 preflight resumes at `public_source_preflight` with its website foundation intact**

Run: `npm test -- --run apps/web/src/public-source-forensics/production-runtime.test.ts apps/web/src/worker/processor-contract.test.ts`

### Task 6: Protect commercial SLA behavior and restricted historical recovery

**Files:**
- Modify: `apps/web/src/db/commercial-refunds.ts`
- Modify: `apps/web/src/worker/job-recovery.ts`
- Test: `apps/web/src/db/recommendation-commerce.postgres.test.ts`
- Test: `apps/web/src/db/commercial-refunds.postgres.test.ts`

**Interfaces:**
- `recordPaidJobOutcome` is called only for execution `completed` or `failed` terminal transitions.
- `recoverHistoricalJob({ jobId, readiness })` is all-or-nothing and rejects submitted/refunded refunds or delivered failure/refund email.

- [ ] **Step 1: Write failing commercial guards**

```ts
await expect(recoverHistoricalJob({ jobId: submittedRefundJob, readiness })).rejects.toThrow("submitted");
await expect(recoverHistoricalJob({ jobId: pendingRefundJob, readiness })).resolves.toMatchObject({ executionState: "queued" });
```

- [ ] **Step 2: Gate normal repair waits from refund/email creation and terminalize only on SLA/permanent failure**

```ts
if (job.executionState === "repair_wait" && !slaExpired(job)) return;
await transitions.terminalizeForSla(job);
```

- [ ] **Step 3: Implement pending-refund reversal, undelivered failure-email cancellation, reservation restore and requeue in one transaction**

Run: `npm test -- --run apps/web/src/db/recommendation-commerce.postgres.test.ts apps/web/src/db/commercial-refunds.postgres.test.ts`

### Task 7: Customer-safe status, documentation, acceptance and commit

**Files:**
- Modify: customer status readers under `apps/web/src/`
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Test: affected status/API tests

- [ ] **Step 1: Add customer-safe execution-state projection tests**

```ts
expect(publicStatus(repairWaitJob)).toEqual(expect.objectContaining({ state: "repairing" }));
expect(JSON.stringify(publicStatus(repairWaitJob))).not.toMatch(/stack|authority|OGC_|fingerprint/i);
```

- [ ] **Step 2: Run full repository acceptance**

Run: `npm test && npm run lint && npm run build && npm run db:audit && git diff --check && codegraph sync`

- [ ] **Step 3: Perform scoped documentation sync and commit only verified project facts**

```bash
git add apps/web docs
git commit -m "feat: recover analysis jobs with structured failures"
```

## Coverage Review

- Schema, phase/state split, atomic error/transition events: Tasks 1 and 3.
- Redaction, stable codes, retry policy and target limitation: Task 2.
- All analysis phases, checkpoint resume and queue backoff: Task 4.
- V2 swallowed runtime failure and readiness: Task 5.
- SLA, refunds, emails and terminal historical recovery: Task 6.
- Customer isolation, docs, full verification and CodeGraph: Task 7.

