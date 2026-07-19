# Report V4 Atomic Core Terminalization Repair Implementation Plan

**Goal:** Prevent a Report V4 Core HTML artifact from becoming customer-active before its paid job, order, credit, access token, email, and refund authority terminalize consistently.

**Architecture:** Keep the existing three-question generation and checkpoint flow. Persist a generated Core revision as `ready`; atomically activate it inside `terminalizePaidReportV4Core`. Fail Worker startup when the commercial token secret is unavailable, and persist exact V4 production errors instead of waiting for lease exhaustion. Retain the existing damaged-run replay only as an operator-only legacy repair.

**Scope:** Protected Staging and a new Airwallex Sandbox CNY 199 report for `https://shun-express.com/`. Production remains untouched.

## Task 1: Fail closed on missing commercial runtime configuration

**Files:**

- Modify `scripts/start-workstation-workers.ps1`
- Modify `scripts/start-report-v4-staging-workers.ps1`
- Modify `apps/web/src/worker/report-v4-startup-readiness.ts`
- Modify `apps/web/src/worker/report-v4-startup-readiness.test.ts`
- Modify `apps/web/src/scripts/report-v4-staging-preflight.test.ts`

Steps:

1. Add failing tests for a missing, blank, or short `OGC_TOKEN_HASH_SECRET`.
2. Copy the secret from the workstation-local fallback only for Staging and never print it.
3. Require the secret in both exact-revision Staging container validation and Worker startup readiness.
4. Run the two focused readiness/preflight suites.

## Task 2: Make Core readiness distinct from customer activation

**Files:**

- Modify `apps/web/src/db/report-v4-artifact-revisions.ts`
- Modify `apps/web/src/db/report-v4-artifact-revisions.test.ts`
- Modify `apps/web/src/db/report-v4-artifact-authority.postgres.test.ts`
- Modify `apps/web/src/worker/report-v4-orchestrator.ts`
- Modify `apps/web/src/worker/report-v4-orchestrator.test.ts`
- Modify `apps/web/src/worker/report-v4-core-production.ts`
- Modify `apps/web/src/worker/report-v4-core-production.test.ts`

Steps:

1. Add `readyReportV4CoreRevision(...)`, which validates hashes and transitions only `pending → ready`.
2. Replace the normal Core orchestrator activation step with the ready transition.
3. Preserve idempotent loading of ready and already-active exact artifacts.
4. Update counters and tests so `coreActivated=1` only after commercial terminalization succeeds.

## Task 3: Atomically activate the Core with commerce

**Files:**

- Modify `apps/web/src/db/public-source-commerce.ts`
- Modify `apps/web/src/db/public-source-commerce.test.ts`
- Modify `apps/web/src/db/public-source-commerce.postgres.test.ts`

Steps:

1. Require a `ready` Core and no active V4 artifact for the first terminalization attempt.
2. In the existing commerce advisory-lock transaction, transition the artifact to `active` and set `scan_reports.active_artifact_revision_id` together with job, credit, order, refund, access-token, and email effects.
3. Keep exact terminal idempotent re-entry for the already-active topology.
4. Inject a failure after activation and every later commercial step; prove complete rollback and zero partial effects.
5. Adapt the existing operator replay so an old split-state artifact is demoted to `ready` and its active pointer is cleared before replay.

## Task 4: Persist the original V4 production error

**Files:**

- Modify `apps/web/src/worker/processor.ts`
- Modify `apps/web/src/worker/processor.test.ts`

Steps:

1. Normalize a non-terminal V4 runner error with its current phase, attempts, and configured-secret redaction.
2. Route operator-repairable errors to `repair_wait`, transient errors to `retry_wait`, and permanent errors through the existing fail-closed terminal path.
3. Prove `scan_job_error_events` retains the original code and message and the Worker does not wait for `lease_exhausted` to explain the failure.
4. Preserve the early return when V4 already reached a durable terminal state.

## Task 5: Local verification and atomic commits

1. Run focused tests for every changed boundary.
2. Run `codegraph sync` and affected-test analysis.
3. Run `npm test`, `npm run lint`, `npm run build`, `npm run db:audit`, and `npm run report:v4:traceability`.
4. Inspect the exact diff and preserve unrelated `assets/` and the historical untracked V3 plan.
5. Commit the implementation in bounded commits only after the relevant verification passes.

## Task 6: Protected-Staging Shun Express acceptance

1. Build and launch the exact repaired Staging Worker revision; prove the token secret is present by name and length only.
2. Deploy the exact repaired Web revision to protected Preview and update only the fixed Staging alias.
3. Start a forced-fresh scan for `https://shun-express.com/` and wait for V4 pre-admission.
4. Confirm exactly three Chinese business questions.
5. Create and complete one Airwallex Sandbox CNY 199 checkout.
6. Drain the exact Core without operator replay.
7. Verify three question checkpoints, sources, artifact, job, order, credit, refund, access-token, email, and optional enhancement authority.
8. Inspect the authorized HTML in a real browser and record exact IDs and outcomes.
9. Run `npm run db:audit` and write a dated evidence report.

## Task 7: Scoped project-state synchronization

Use the repository's neat sync rules to update only durable facts in `docs/PROJECT-STATE.md`, `docs/TASKS.md`, relevant decisions, and the dated evidence document. Do not promote all V4 requirements to `verified` from one successful customer run.
