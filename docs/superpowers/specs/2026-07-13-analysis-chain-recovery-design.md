# Analysis-Chain Recovery and Failure Observability Design

Date: 2026-07-13
Status: Approved design; implementation planning has not started.

## Problem statement

The paid V2 incident that motivated this design reached 90 percent after the
website foundation had been persisted, then failed before any public-source
snapshot, query, retrieval, or final V2 report was created. The website crawl
and AI analysis were successful. The failure was nevertheless recorded only as
the generic error type `Error`, and three attempts were consumed before the job
became terminal and its order entered the refund path.

The defect is not specific to the 90-percent boundary. The current job model
mixes execution phase, execution state, progress, retry policy, and commercial
outcome. A failure at any phase can therefore lose its cause, consume a
job-wide retry budget, or terminalize work that could continue from a valid
checkpoint after an operator repairs the underlying dependency.

This design gives the entire analysis chain one recoverable state model. It
preserves completed work, records structured private diagnostics, pauses on
operator-repairable failures, resumes only after checkpoint and readiness
validation, and keeps payment, refund, credit, and email transitions atomic.

## Goals

- Apply the same failure and recovery model from admission through report
  terminalization, rather than adding a special 90-percent branch.
- Separate current analysis phase, execution state, displayed progress, and
  commercial outcome.
- Resume from the latest validated checkpoint after a transient failure or an
  operator repair.
- Preserve successful pages, AI batches, market snapshots, evidence graphs,
  reports, and artifacts when their identities remain valid.
- Record an immutable, sanitized error and transition history for every job
  attempt.
- Distinguish target-site coverage limitations from system failures.
- Prevent rapid retries of deterministic configuration failures.
- Keep internal diagnostics private while giving customers accurate status.
- Preserve the 24-hour fulfillment SLA and atomic commercial terminalization.

## Non-goals

- No public or customer-controlled force-retry endpoint.
- No request-controlled quota, payment, authority, or certification bypass.
- No movement of crawling, model calls, or public-source collection into the
  Web process.
- No automatic reopening after a refund has been submitted or completed.
- No silent reuse of a checkpoint whose identity or referenced artifacts
  cannot be proven.
- No replacement of PostgreSQL as production authority.

## State model

The job state is represented by four independent values.

### Analysis phase

`current_phase` records where execution is logically positioned:

1. `admission`
2. `discovery`
3. `planning`
4. `fetching`
5. `technical_audit`
6. `page_analysis`
7. `website_synthesis`
8. `public_source_preflight`
9. `question_generation`
10. `snapshot_resolution`
11. `source_retrieval`
12. `evidence_graph`
13. `report_build`
14. `artifact_verification`
15. `terminalization`

Free and legacy jobs use only the phases applicable to their product contract.
Skipping an inapplicable phase is an explicit successful transition, not an
implicit inference from progress.

The `admission` phase begins only after the authoritative report and job rows
exist. Request validation that rejects input before a job is created remains a
normal synchronous API failure and is outside checkpoint recovery.

### Execution state

`execution_state` records whether the job can currently execute:

- `queued`: eligible for a Worker lease after `retry_not_before`.
- `running`: owned by one live Worker lease.
- `retry_wait`: paused until a bounded transient-error backoff expires.
- `repair_wait`: paused until an operator-repairable dependency passes its
  readiness probe.
- `completed`: analysis and authorized terminalization succeeded.
- `failed`: a permanent failure or SLA decision made the job terminal.

`repair_wait` is non-terminal, holds no Worker lease, does not consume automatic
retry attempts, and does not itself create a refund or failure email.

### Displayed progress

Progress is a bounded presentation value derived from the last committed phase
checkpoint. It is never used as authority for retry, recovery, settlement, or
refund decisions. A job may wait for repair at any displayed percentage.

### Commercial outcome

Payment and delivery state remains an adjacent commercial state machine:

- pending fulfillment;
- completed and settled;
- completed-limited with refund;
- failed with refund pending;
- refunded.

Only `completed` or `failed` execution transitions may propose a commercial
outcome. The existing atomic job, credit, order, refund, and email boundary
remains authoritative.

## Failure classification

Every thrown value is normalized at the phase boundary into one of four
classes.

### Transient

Examples include network timeouts, rate limits, temporary database
unavailability, lease loss, and retryable provider or object-storage outages.
The job enters `retry_wait` with bounded exponential backoff and jitter.

### Operator-repairable

Examples include missing or invalid runtime configuration, disabled runtime,
unavailable evidence storage, missing or mismatched public-search authority,
and an unavailable required Worker collaborator. The job enters `repair_wait`.
A deterministic readiness probe must pass before it can be queued again.

### Target limitation

Examples include valid 404 responses, login walls, robots restrictions, and a
page that remains unreadable after its page-local policy is exhausted. These
are recorded as coverage limitations. They do not fail the system job when the
product's minimum evidence and coverage contract can still be satisfied.

### Permanent

Examples include checkpoint identity conflicts, corrupt immutable evidence,
irreconcilable contract-version mismatch, prohibited authority changes during
resume, and invalid terminal commercial state. The job terminalizes as failed
unless a narrower deterministic reconstruction can prove a new valid
checkpoint without mutating historical evidence.

Unknown exceptions use `unexpected_internal_error`. They retain sanitized
private diagnostics and default to transient for one bounded attempt. A
repeated identical fingerprint moves the job to `repair_wait`; unknown errors
must not spin until the global attempt count is exhausted.

## Checkpoint and resume contract

Every phase checkpoint contains:

- job, report, product, methodology, locale, and authority identity;
- monotonic `checkpoint_revision`;
- phase-specific input hash;
- references and integrity hashes for completed artifacts;
- explicit remaining work;
- `phase_attempt` and `resume_generation`;
- the prior successful transition ID.

The failure event never destroys or rewrites the last successful checkpoint.
Before a resume, `CheckpointValidator` verifies:

1. job, report, order, product, locale, and methodology identity;
2. the checkpoint revision and transition chain;
3. the input hashes for the requested phase;
4. the existence and integrity of referenced artifacts;
5. the current runtime readiness and authority identity;
6. that the commercial state still permits fulfillment.

Resume executes only missing work. Representative phase behavior is:

- fetching retries only missing or invalid pages;
- page analysis reuses completed content-hash-bound batches;
- website synthesis reuses validated crawl and analysis inputs;
- public-source work reuses immutable terminal snapshots and retries only
  unresolved questions or queries;
- report construction reuses the website foundation and evidence graph;
- artifact verification regenerates only missing or invalid HTML/PDF material;
- terminalization retries the same idempotent transaction without duplicating
  settlement, refunds, or email.

If an upstream input changes, checkpoint invalidation propagates only to
dependent downstream phases. It never silently mixes artifacts from different
identity ledgers.

## Retry budgets

Retry accounting is phase-local rather than one global three-attempt counter.

- `phase_attempt` increments only for automatic transient retries in the same
  phase.
- A successful phase checkpoint resets the consecutive failure count.
- Entering or leaving `repair_wait` does not consume automatic retry budget.
- `resume_generation` increments after each successful operator-authorized
  repair resume.
- Repeated identical error fingerprints may move to `repair_wait` before the
  phase budget is exhausted.
- Total execution remains bounded by the job hard deadline, product cost cap,
  and commercial SLA.

The queue claimant respects `retry_not_before`; persistent Workers must not
immediately reclaim a job in backoff.

## Structured private diagnostics

`scan_job_error_events` is an append-only table. Each event records:

- job ID, phase, checkpoint revision, job attempt, phase attempt, and resume
  generation;
- classification, stable error code, stable error type, and fingerprint;
- sanitized bounded message, stack, and at most three nested causes;
- retry eligibility and timestamp;
- the transition event produced from the failure.

Stable V2 codes include distinct runtime-disabled, required-configuration,
adapter-approval, authority-missing, authority-mismatch, dependency-mismatch,
snapshot, retrieval, artifact, checkpoint, and terminalization failures.
Custom errors set stable `name`, `code`, `classification`, and `cause` values.
Lower layers must not use `catch { return null }` where the caller needs to
classify the actual failure.

Diagnostics remove API keys, authorization and cookie values, database URLs,
URL credentials, access tokens, report tokens, credit keys, raw client IPs, and
configured secret values. Message, stack, and cause depth have explicit size
limits. Arbitrary enumerable properties from third-party errors are not
serialized.

`scan_job_transition_events` records every queue, lease, checkpoint, retry,
repair wait, repair resume, and terminal transition. Error events and their
resulting state transition commit in the same PostgreSQL transaction.

The existing `error_code` and `public_error` remain a bounded current-state
projection. Internal diagnostics never enter customer APIs, report artifacts,
email, or public logs.

## Transition authority

`JobTransitionService` is the only application boundary allowed to change the
new execution state. It owns:

- lease claim and release;
- successful checkpoint advancement;
- transient failure and backoff;
- operator-repairable pause;
- validated repair resume;
- permanent failure;
- SLA terminalization;
- compatibility projection to the existing `stage` field.

`JobErrorClassifier` converts phase-specific exceptions to the normalized
contract. `PhaseReadinessProbe` supplies deterministic, non-mutating checks for
each repairable dependency. `RepairResumeService` locks the job and commercial
rows, validates the checkpoint and readiness result, increments
`resume_generation`, and queues the same phase.

The current `stage` column remains a compatibility projection during this
migration so existing APIs, UI, and scripts can be moved safely. New writes go
through the transition service, which updates the projection in the same
transaction. A later, separate migration may retire the legacy projection only
after all readers have moved.

## Alternatives considered

Adding only a latest private error message to `scan_jobs` was rejected because
each retry would overwrite the evidence needed to reconstruct earlier attempts.
Keeping the global three-attempt model and adding a special V2 90-percent
recovery branch was rejected because the same recoverable failure can occur in
every earlier or later phase. A full external telemetry platform was also
rejected as the source of truth: telemetry may mirror these events later, but
it cannot replace the transactional PostgreSQL state and commercial boundary.

## Customer and operator status

Customer-visible states remain safe and accurate:

- `retry_wait`: a temporary system issue is being recovered automatically;
- `repair_wait`: the service is repairing a fulfillment dependency and already
  completed work will be preserved;
- target limitation: the limitation appears in report coverage while analysis
  continues;
- `failed`: shown only after a permanent failure or SLA terminal decision.

Customers never receive stack traces, environment-variable names, authority
IDs, provider internals, or operator instructions.

Operators can inspect a chronological phase, checkpoint, error-fingerprint,
retry, repair, and transition timeline. Resume is an authenticated CLI or
protected operator action scoped to one exact job. There is no public retry
surface.

## Commercial recovery

Normal `repair_wait` occurs before commercial terminalization and therefore
does not require refund reversal.

For historical jobs already terminalized by the old behavior, one restricted
transaction may reopen the exact order only when all of the following hold:

- the refund is still `pending` and has never been submitted to the provider;
- the failure/refund promise email has not been delivered;
- the payment remains verified and the order has no competing fulfillment;
- the credit reservation can be restored without charging the customer;
- the checkpoint and current runtime readiness pass validation;
- the commercial SLA has not expired.

The transaction cancels the pending refund and undelivered failure email,
restores the reservation and pending fulfillment state, records an immutable
recovery transition, and queues the preserved phase. It is all-or-nothing.

If the refund was submitted or completed, or a refund promise was delivered,
the original order remains immutable. After the underlying issue is fixed, an
operator may create a separately audited replacement fulfillment without a
second customer charge. The replacement links back to the original failed job
and does not rewrite its history.

## Schema migration

The next schema version adds the new execution columns, error-event table, and
transition-event table. Expected job columns are:

- `execution_state`
- `current_phase`
- `checkpoint_revision`
- `phase_attempt`
- `resume_generation`
- `retry_not_before`
- `repair_reason_code`
- `repair_deadline_at`

Existing non-terminal jobs map their current stage to a phase and execution
state. Existing terminal jobs remain terminal. The migration does not fabricate
historical error events. Existing checkpoints pass through a compatibility
parser; an unverifiable non-terminal checkpoint enters `repair_wait` rather
than restarting silently.

Database constraints prevent a repair-waiting job from retaining a Worker
lease, prevent queued jobs from being claimed before `retry_not_before`, and
prevent non-terminal analysis state from creating a normal failure refund.

## Verification

Unit tests cover error normalization, secret redaction, phase classification,
fingerprinting, backoff, checkpoint validation, invalidation propagation, and
public status projection.

Deterministic Worker tests inject failures at discovery, fetching, page
analysis, website synthesis, public-source preflight, snapshot resolution,
retrieval, report construction, artifact verification, and terminalization.
Each test proves that completed upstream work is reused after recovery.

PostgreSQL integration tests prove:

- error event and state transition atomicity;
- monotonic checkpoint revisions and stale-Worker rejection;
- lease exclusion during `repair_wait`;
- delayed claim during `retry_wait`;
- no refund or failure email while repair is pending;
- one atomic refund after permanent failure or SLA expiry;
- exact-once terminalization and delivery intents;
- refusal to reopen submitted or completed refunds;
- all-or-nothing historical pending-refund recovery.

Customer API tests prove that internal diagnostics are never returned. Existing
free, legacy, V2, payment, refund, email, HTML, and PDF regressions remain in
the required suite.

Protected staging acceptance injects representative crawl, model, V2 runtime,
public-search, artifact, and terminalization failures. After each dependency is
repaired, the same job must continue from its validated checkpoint and complete
without duplicate payment, refund, evidence, artifact, or email effects.

Repository acceptance includes lint, unit tests, build, targeted PostgreSQL
integration suites, database audit, and CodeGraph synchronization after the
implementation changes.

## Rollout order

1. Add schema and read-compatible state projections without changing runtime
   behavior.
2. Introduce the transition service, event repositories, classifier, sanitizer,
   and checkpoint validator behind deterministic tests.
3. Move phase writers and queue claiming to the transition service.
4. Add readiness probes, `retry_wait`, and `repair_wait` behavior.
5. Move commercial SLA and terminalization readers to the new execution state.
6. Add restricted historical recovery and replacement-fulfillment operations.
7. Update customer and operator status surfaces.
8. Run deterministic and PostgreSQL verification.
9. Exercise protected-staging fault and recovery cases before production
   activation.

At every step, PostgreSQL remains authoritative and old readers continue to
receive a consistent compatibility projection until they are migrated.
