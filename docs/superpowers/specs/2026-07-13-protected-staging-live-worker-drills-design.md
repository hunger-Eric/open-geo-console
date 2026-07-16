# Protected-staging live Worker fault drills

## Goal

Prove the existing checkpoint recovery contract against the protected Preview
database and real Worker dependencies before a fresh V2 Sandbox paid-order
acceptance. Each deliberate fault must move one named job through
`checkpoint -> repair_wait -> readiness repair -> queued` and resume its
persisted phase without duplicating crawl, public-source evidence, artifacts,
refunds, or email intent.

## Scope and safety boundary

The Worker receives an optional process-only drill configuration:

- `OGC_STAGING_LIVE_DRILL_JOB_ID` identifies exactly one job.
- `OGC_STAGING_LIVE_DRILL_FAULT` selects one named fault point.
- It is accepted only when the staging command guard has established a staging
  deployment profile and Preview environment. Any other deployment rejects it
  before a job is claimed.
- The hook is not read by Web routes, checkout, or commerce commands. It is
  not stored in PostgreSQL and cannot be supplied by a request.
- The hook consumes itself after its first matching checkpoint. A restarted
  Worker needs the operator to explicitly provide it again.

Protected Preview may use the validated production MiMo monthly-plan
credential under the operator's 2026-07-13 authorization. The exercise may
edit Preview configuration only; production records and deployments remain
untouched.

## Fault points

The hook throws a typed operator-repairable error only after the preceding
checkpoint has committed. The selected point corresponds to the phase to be
resumed:

| Fault | Injection boundary | Expected resume phase |
| --- | --- | --- |
| `crawl` | persisted discovery/plan before page retrieval | `crawl` |
| `model` | persisted crawl evidence before page analysis | `analysis` |
| `v2_runtime` | V2 preflight checkpoint before source collection | `public_source_preflight` |
| `artifact` | V2 report and artifact-verification checkpoint before readiness | `artifact_verification` |
| `terminalization` | verified artifact checkpoint immediately before atomic commercial terminalization | `terminalization` |

The terminalization hook must run before its single database transaction.
There is no partially committed report, credit, refund, order, or email state
to repair, so a successful retry remains exactly-once.

## Recovery and evidence

After every induced `repair_wait`, the operator runs a non-mutating readiness
check appropriate to the fault, calls the existing operator recovery boundary
with the checkpoint envelope hash, and starts the deep staging Worker without
the hook. Evidence for each drill records the checkpoint revision and phase,
transition events, resume generation, and invariant counts for crawl evidence,
source snapshots, report artifact, refunds, and email deliveries.

The final fresh paid order uses no drill hook. It must prove paid checkout,
source collection, authenticated V2 HTML/PDF, anonymous denial, credit
settlement, and report-email delivery.

## Validation

Unit tests cover environment rejection, exact job matching, one-shot behavior,
and typed failure classification. Existing PostgreSQL recovery and atomic
terminalization suites remain required. Live evidence is reported separately;
local tests do not substitute for it.
