# Active Change Scope Lock

## Staging regeneration reservation supersession fix and source-only deployment

Status: APPROVED

Approval record (2026-07-25): exact authority phrase received: APPROVE STAGING REGENERATION RESERVATION SUPERSESSION FIX AND ONE SOURCE-ONLY STAGING DEPLOYMENT. This covers only the locked code/tests, one source-only staging deployment, and Gate 3 zero report/payment; it does not authorize future Gate 4, any new report/payment, or historical data mutation.

### Objective

Fix the Protected Staging regeneration reservation livelock: a quiescent staging_regeneration repair_wait job with no lease, retry, or deadline must not permanently cause active_regeneration. Atomically supersede only the reservation, preserve historical report/job/checkpoints/errors/artifacts, and prevent the superseded job from resuming.

### Baseline

Current Web/Free/Deep are A356 behind the fixed alias. Historical report ca243d40-707d-4c54-a65e-ed07db47a9c3, job d79fdfdf-2190-43ac-9311-ccd94a9e70f1, reservation c9c86c79c9034cfcded01c2ae3ccd7b5, site hash 9d3c6c61be9a61ec74e15b68c1204073 is quiescent repair_wait with no lease/retry/deadline; no report/payment was created by the blocked scope. Current A356 full revision/tag image is sha256:91d8c2ebfc2f4c9cd6f56852630e999a9d294b2c4d582f46ce8b25e451c686d7; older rollback full revision/tag image is sha256:7d78311c673e2ae54b2ae384816458427c100199b281a95b34c767c877d353f5. Container IDs are be09... and b1b1.... Dirty AGENTS.md, runbook, and .codex are protected.

### Allowed implementation and exact semantics

Production files only: apps/web/src/db/scan-admission.ts and apps/web/src/db/jobs.ts. Tests: apps/web/src/db/staging-security.postgres.test.ts and optional apps/web/src/db/recovery-state.postgres.test.ts. Scope file is the only documentation write; runbook is forbidden. No schema, migration, dependency, UI, route, quota, commerce, crawler, model, or unrelated production change.

Under the existing site advisory lock, lock the exact site reservation and matching free staging_regeneration nonterminal repair_wait execution with FOR UPDATE; require lease_owner, lease_expires_at, retry_not_before, repair_deadline, and credit_reservation all NULL and repair_reason nonnull. Delete the exact reservation and create the new lineage atomically in one transaction; rollback on failure. A staging_regeneration resume must require the exact matching reservation or reject as superseded; ordinary/deep/commercial resume is unchanged.

Tests must cover two-key concurrency exactly one new reservation, immutable old-row JSON, superseded resume rejection, untouched active/queued/running/retry/lease/deadline/nonstaging rows, idempotency replay, production forceFresh403, and distinct limit2. Add concurrent resumeScanJobAfterRepair versus forceFresh supersede race coverage, allowing only: resume linearizes first and admission sees active old binding, or admission creates new and resume fails superseded. Assert never double-success, never old-job queued/lease transition after reservation deletion, exactly one final reservation, and correct old/new row counts and immutability; retain double-forceFresh and post-supersede tests.

### Budgets and deployment

Production diff +120/-25 total; tests +240/-40 total; scope tracking budget with reasonable headroom. After approval only: git branch/commit via git_operator; clean candidate worktree; one new Vercel Preview; one thin source-overlay based exact A356 image sha256:91d8...; no full build; recreate staging Free/Deep once; fixed alias switch once only after gates; retain A356 rollback. If cleanup is required, remove only exact older unreferenced staging image sha256:7d783... after verification and disk evidence. No production/commerce.

Gate 3 smoke/catalog with zero report, zero payment, and zero historical data mutation. Failure stops immediately with no retry.

### Future boundary

Gate 4 real-flow acceptance requires a separate future FROZEN scope and approval; this card authorizes no report or payment.

### Approval phrase

Approval phrase recorded above; no second approval is valid.

Lock protocol: nonlocking locator then, in one transaction, site advisory key staging-regeneration: via hashtextextended, exact reservation FOR UPDATE by site_key+reservation_id+report_id+job_id, exact job FOR UPDATE, full revalidation, then mutation. Resume match check and queued transition are one transaction; zero/multi/mismatch reservations fail closed. Admission enters dual locks only for locator-quiescent repair_wait; active states conservatively return to avoid terminalizer deadlock. Supersedable predicates require matching tier/reason, stage not completed/completed_limited/failed, execution_state repair_wait, lease/retry/deadline NULL, repair_reason nonnull, error=repair_reason, and credit/correction/replacement NULL. Roles: before mutation candidate=new TBD, current=A356 91d8, rollback=12449 7d; after verification new candidate current and A356 sole rollback; only exact older unreferenced 7d image may be deleted after containers verify, never production.
