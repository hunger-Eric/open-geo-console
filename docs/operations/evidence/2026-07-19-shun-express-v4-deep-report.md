# Unit 1 protected-Staging preflight — shun-express V4

Date: 2026-07-19 (UTC evidence captured during Unit 1)

## Scope and outcome

- Unit: read-only preflight plus exact-commit protected-Staging Web/Worker alignment.
- Exact source requested: `9c19d2c4e17eebf2d93bd69537f877e4183fb255` (short `9c19d2c`).
- Outcome: `DEVIATION_REVIEW_REQUIRED` before deployment or Worker recreation.
- No report, crawl, model call, checkout/payment, commerce/refund/email, historical replay/recovery, production mutation, git commit, or git push was performed.

## Read-only evidence

- `git status --short --branch`: branch `codex/v4-answer-optimization-scope-reset`; only the approved modified scope document plus untracked `assets/` and protected V3 plan were present.
- `git rev-parse HEAD`: `9c19d2c4e17eebf2d93bd69537f877e4183fb255`.
- `codegraph status`: index up to date (764 files, 11,113 nodes, 33,294 edges).
- Protected-Staging V4 preflight, run with `.data/workstation-docker/staging.env`: `{"profile":"staging","schemaVersion":40,"currentSchemaVersion":40,"diagnosisCheckpointTableExists":true,"diagnosisCheckpointCount":3,"v34MigrationSafe":true}`.
- `db-audit`, run against the merged staging environment: passed; no terminal commercial job has a reserved credit.
- Merged staging marker names were present and nonblank: `OGC_DEPLOYMENT_PROFILE=staging`, `VERCEL_ENV=preview`, `COMMERCE_MODE=test`, `FULFILLMENT_MODE=realtime`, `OGC_REPORT_V4_MODEL_PROFILE_ID=report-v4-mimo-v2.5-pro-v1`, and the configured MiMo base URL. Secret values were not printed.
- Docker read-only identity: production free/deep containers remain `Up` on `open-geo-console:prod-v25-11befe9`; staging free/deep containers existed but were `Exited (0)` on the older image `open-geo-console:staging-4b8a450d7a4163452982388d48ded7938bf699e1`. No production container/image was changed.

## Blocking queue-safety finding

Read-only PostgreSQL counts from staging:

```text
scan_jobs: analyzing=1, completed=71, completed_limited=5, failed=57, synthesizing=1
payment_orders: completed=4, completed_limited=5, failed=29, not_started=4
```

The approved launcher `scripts/start-report-v4-staging-workers.ps1` recreates `staging-worker-free` and `staging-worker-deep` with realtime PostgreSQL polling. Because staging already contains `analyzing=1` and `synthesizing=1`, starting either Worker could claim existing business work and invoke the model. The scope explicitly forbids allowing a Worker to claim or generate business reports during Unit 1 and requires stopping if the launcher would drain existing work.

Therefore deployment and Docker alignment were not attempted. Continuing requires the parent/scope owner to decide a safe, in-scope no-claim alignment method or issue a new scope; no code/config/script workaround was created.

## Unit 1 drift audit

`CONFORMANT` for the completed read-only preflight evidence; `DEVIATION_REVIEW_REQUIRED` for the requested alignment because the current staging queue contradicts the no-business-claim gate. Files modified by this unit: this evidence file only. Production/test/config/script files remain unchanged; `assets/` and the protected plan remain untouched.

## Phase A exact-job implementation evidence (local only)

- Added the approved exact one-shot Worker path only: atomic `jobId + reportId + tier` claim, target-only lease/exhaustion/credit/artifact/regeneration maintenance, pre-claim V4 contract admission, and a staging CLI which runs the staging database/profile guard and V4 readiness before one claim and the ordinary processor.
- Ordinary `claimScanJob(workerId, tier, leaseSeconds)` remains unchanged, including FIFO selection and global maintenance; no Worker/presence/drain/queue, deployment, Docker, database runtime, model, payment, browser, or external action was run by Phase A.
- Focused unit result: `apps/web/src/worker/exact-job.test.ts` 10 passed. The new targeted PostgreSQL test is guarded by `OGC_TEST_DATABASE_ADMIN_URL` and was skipped in this shell because that sanctioned admin URL was absent; no staging or production database was substituted.
- Related test result: 45 passed, 1 guarded PostgreSQL suite skipped. `npm run lint` and `npm run build` passed. Full `npm test` had 2,590 passed, 175 skipped, and five pre-existing failures in `report-v4-acceptance-authority-phase-snapshot.postgres.test.ts` at `report_v4_acceptance_events_details_check`; this exact-job diff is outside that ledger path.
- `codegraph sync`/`status` passed (768 files, 11,154 nodes, 33,431 edges) and `git diff --check` passed. Phase A changes remain in the seven approved code/test paths; no commit was made.

### Targeted PostgreSQL recheck

- The independent checker supplied a disposable local PostgreSQL test endpoint and authorized only a passwordless connection attempt for the targeted claim test. The attempt reached no authentication step: `ECONNREFUSED` at the supplied loopback port. No container inspection, environment/secret read, retry against another endpoint, or container/database operation was performed.
- Therefore `apps/web/src/db/jobs-targeted-claim.postgres.test.ts` remains unexecuted against PostgreSQL. This is an environment reachability block, not a code failure; the Phase A acceptance classification remains `REVISE_WITHIN_PLAN`.

### Disposable PostgreSQL targeted-claim execution

- A locally created disposable `postgres:17` container was bound to loopback only, used only for `apps/web/src/db/jobs-targeted-claim.postgres.test.ts`, and removed by the same command's cleanup block. No pre-existing container, staging/production endpoint, Worker, or external workflow was touched; no credential was printed or persisted.
- The test first exposed two fixture-only defects in the new test (an invalid queued phase and order-dependent assertion). Both were corrected in that allowlisted test file. The rerun passed 2/2 against PostgreSQL.
- Regression after the fixture correction: focused/related tests 55 passed; Web lint and monorepo build passed; `git diff --check` and CodeGraph sync/status passed. The previous full-suite result remains the recorded 2,590 passed with five unrelated acceptance-ledger constraint failures; it was not rerun after this test-only correction.
