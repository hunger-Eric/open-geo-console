# Active Change Scope Lock

Status: `APPROVED`

Approved by the user on 2026-08-02 with the explicit response `可以` to this
exact frozen allowlist.

## Objective

Prospectively repair the newly verified Paid V3 Direct terminal failure and
finish the already-approved one-model-call contract, using the smallest linear
change:

1. allow an exact `combined_geo_report_v3` / recommendation report version 3
   job to bind its completed public-search market snapshots during the existing
   atomic terminalization transaction, while preserving the existing V2
   binding contract and all snapshot identity, completion, freshness, cutoff,
   ownership, cost and uniqueness guards;
2. make Paid V3 Direct page planning, each page-analysis batch, and website
   synthesis configure exactly one model attempt, with no second provider call
   after a transient, parse, schema, language or other failure;
3. close the PostgreSQL regression hole by exercising the real V3 identity and
   four non-empty snapshot references through production terminalization.

This is prospective code and basic-test work only. It does not repair, replay,
resume, clone or otherwise mutate the failed report/order/job named below.

## Verified Baseline

- Staging report: `b5344edf-9885-4ee3-9244-d01969c6288b`.
- Order: `4aeddd1f-1734-4837-a78d-2188ee92a17e` (`paid`, fulfillment
  `failed`, refund `pending`).
- Paid job: `7dee92f7-08ab-458d-96eb-31acb7d43112`, recommendation report
  version `3`, artifact `combined_geo_report_v3`, one job attempt.
- The job completed page analysis, website synthesis, visual evidence,
  public-source admission, initial answers, provider discovery, public-source
  forensics, Q2/Q3 Direct analyses, HTML/PDF readiness and private PDF storage.
  It failed with about `103293ms` remaining, so this failure was not the
  900000ms hard deadline.
- The decisive trace event is `terminal_snapshot_bindings` with
  `snapshotCount=4`, PostgreSQL code `P0001`. The durable error message is
  `Market snapshot references require a V2 public-search job.`
- The current trigger `ogc_validate_report_market_snapshot_ref()` accepts only
  recommendation report version `2`; the production V3 terminalizer inserts
  the same guarded reference rows for an exact version `3` job.
- The active schema version is `44`; the repair must be a new forward-only
  schema version `45`, not an edit presented as historical schema state.
- The existing combined regression passes `snapshotRefs: []`, so it never
  reaches the failing trigger.
- Current Paid V3 Direct production wiring still configures `3` attempts for
  page planning, page-analysis batches and website synthesis. The observed run
  happened to succeed on the first call; the code still permits hidden retry.
- The prior 600-second public-source reserve fix worked: this run entered
  public-source work with about `504565ms` remaining and did not defer.
- Visual grouping worked: 9 citations across 5 unique canonical URLs produced
  exactly 5 navigations. Q2/Q3 started concurrently and each completed once.
- The failed artifact revision remains `pending`; there is no combined report
  row. Refund `attempts=0`, `submitted_at=null`; no payment platform was
  accessed during diagnosis.

## Allowed Production Files and Hard Diff Budgets

Only these production/runtime files may change:

| File | Allowed behavior | Hard budget |
| --- | --- | ---: |
| `apps/web/src/db/migrations.ts` | Add only `V45_DATABASE_MIGRATIONS`: replace the market-snapshot-reference validation function so it accepts either the existing exact V2 identity or an exact standard Paid V3 identity (`recommendation_forensics_v1`, `public_search_source_forensics_v1`, version 3, `combined_geo_report_v3`), then register migration step 45. V1, V4, wrong artifact/methodology/version/report ownership and every existing snapshot/cutoff/freshness guard remain rejected. | `+55 / -5` |
| `apps/web/src/db/index.ts` | Bump only the canonical schema version from 44 to 45. | `+2 / -2` |
| `apps/web/src/worker/processor.ts` | For the exact Paid V3 Direct lineage only, pass/configure `maxAttempts: 1` for page planning, each page-analysis batch and website synthesis, including the debug trace's configured-attempt value. Preserve deterministic non-model planning fallback and deterministic local data operations; do not add any second model call. | `+15 / -15` |

Aggregate production-code budget: **`+72 / -22`**. This is a hard limit.
Whitespace churn, unrelated formatting, refactors and compatibility layers count
against the budget and are not authorized.

No other production/runtime file is allowed. In particular,
`apps/web/src/db/combined-correction-terminalization.ts`,
`apps/web/src/db/market-snapshots.ts`, `packages/ai-report-engine/**`, checkout,
V4 and commerce implementation files are read-only in this scope. If the
repair cannot be completed without changing one of them, stop and report.

## Allowed Test Files and Test Diff Budget

Only these existing tests may change:

| File | Required coverage |
| --- | --- |
| `apps/web/src/db/index.test.ts` | Schema version 45 and migration-chain assertions; the new function text must preserve exact V2 and admit only exact V3, not V1/V4 or mismatched jobs. |
| `apps/web/src/worker/processor.test.ts` | Production caller passes `maxAttempts: 1` for Direct planning, page batches and synthesis; trace reports 1; a transient first failure cannot cause a second provider call. Legacy/non-Direct behavior stays unchanged. |
| `apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts` | Replace the empty-ref shortcut with four completed, identity-bound snapshots and four real refs; retain all existing model-call, concurrency, navigation, schema, language, artifact and commercial assertions. |

Aggregate test-code budget: **`+360 / -110`**. The test-only budget is a
tracking bound under the repository's verification-only rule; it does not
authorize production changes or weaker assertions.

No new fixture, helper, snapshot, evidence or test file is authorized. Do not
modify the canonical disposable PostgreSQL runner or its test classification.

## Required Behavior

1. Existing exact V2 reference binding remains valid and unchanged.
2. Exact standard Paid V3 reference binding succeeds only when the job/report,
   methodology, version and `combined_geo_report_v3` artifact identity match.
3. V1, V4, version/artifact/methodology mismatch, cross-report binding,
   incomplete snapshots, stale/future cutoff mismatch, cache-identity mismatch
   and cost/uniqueness violations remain fail-closed.
4. Page planning makes at most one model call. If it fails, only the existing
   deterministic code fallback may run; there is no second model request.
5. Each page-analysis batch makes at most one model call. One batch may not
   retry itself, perform language correction or issue another hidden request.
6. Website synthesis makes at most one model call. There is no outer, inner,
   language-correction, compacted or simplified second request.
7. Q2/Q3 answer collection and Direct analyses remain concurrent where already
   designed, with at most one call per question/step and no automatic retry.
8. Public-source Direct admission continues to use the real job deadline and
   per-call timeout, not a 600-second fresh-attempt reserve.
9. Visual evidence remains grouped by canonical URL: N unique URLs means N
   navigations while every citation retains its own verified asset binding.
10. With four valid snapshot refs, the combined artifact becomes `active`, the
    job and fulfillment become `completed`, exactly four reference rows exist,
    and no refund row is created.
11. No schema, language, evidence, receipt, PDF/HTML readiness, artifact
    completeness or commercial gate may be weakened to make tests pass.

## Acceptance Checks

Run only the following local checks after implementation:

1. Focused unit tests:
   - `apps/web/src/db/index.test.ts`
   - `apps/web/src/worker/processor.test.ts`
2. The canonical disposable PostgreSQL runner selecting only:
   - `apps/web/src/worker/paid-v3-direct-linear-flow.postgres.test.ts`
3. `npm run lint`.
4. Read back every changed file and compare the complete changed surface with
   this allowlist and the hard production budget without using Git operations.

The PostgreSQL acceptance must prove the real trigger and transaction, not a
mocked terminalizer or empty snapshot list. A green unit test alone is not
sufficient. Local checks do not constitute deployed or browser-visible
acceptance.

## Forbidden Subsystems and Non-Goals

- No repair, replay, resume, reopening, cloning, deletion or cleanup of report
  `b5344edf-9885-4ee3-9244-d01969c6288b`, its order/job/artifact, its stored PDF
  or any other historical/customer row.
- No payment-provider, refund-provider, email-provider or real checkout access;
  no order/report/payment/refund/email creation or submission.
- No deployment, Vercel mutation, Worker recreation, Docker image build,
  Staging/Production mutation or live model/site/browser run.
- The single canonical disposable PostgreSQL test container is allowed only as
  local isolated test infrastructure. No shared, Staging or Production database
  may be used for validation.
- No checkout V3/V4 product-selection change, V4 snapshot reuse, admission
  redesign or `siteSnapshotId` addition.
- No UI progress redesign, 85%/99% copy change or polling change.
- No new retry/resume/defer/replay/checkpoint/lease state machine.
- No dependency, package manifest, lockfile, table, column, index or data
  migration. V45 may only replace the existing validation function and advance
  the schema-version ledger.
- No weakening of existing public-source, semantic, schema, language, evidence,
  receipt, artifact, PDF, HTML or commerce validation.
- No Git operations of any kind.

## Expensive or External Actions

Authorized: focused local tests, one selected canonical disposable PostgreSQL
run, lint and read-only file/scope inspection.

Not authorized: model/search/crawl/browser calls, shared database access,
payments, refunds, email, report generation, historical mutation, deployment,
Docker image build, publication or Git operations. If the disposable runner
fails during infrastructure setup before selected tests execute, retain its
receipt and stop/report; do not silently substitute another PostgreSQL path.

## Stop Conditions

Stop and report before editing further if any of these occurs:

- a required production/runtime file is outside the three-file allowlist;
- exact V3 binding cannot be admitted without changing tables, columns,
  dependencies, checkout/V4 meaning or the terminalization transaction shape;
- enforcing one Paid Direct model call requires changing
  `packages/ai-report-engine/**` rather than using its existing `maxAttempts`
  inputs;
- the combined regression requires live model/search/site/storage/payment
  services or a shared database;
- a proposed change would broaden snapshot binding beyond exact V2 and exact
  standard Paid V3 identities;
- a production diff budget would be exceeded;
- baseline evidence contradicts the verified failure mechanism.

## Approval Gate

While this file is `FROZEN`, production code must not be edited. After the user
explicitly approves this exact allowlist, change only the status to `APPROVED`
and implement within the stated files, behaviors and budgets.
