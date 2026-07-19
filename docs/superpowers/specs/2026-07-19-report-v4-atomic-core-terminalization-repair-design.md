# Report V4 Atomic Core Terminalization Repair

**Date:** 2026-07-19

**Status:** Approved for implementation

**Scope:** Protected Staging first; no production mutation

## Goal

Keep the existing Report V4 three-question answer contract, but repair the boundary that can activate a customer HTML artifact before payment fulfillment, credit, access, email, and refund authority have terminalized consistently.

The acceptance target is one new protected-Staging Airwallex Sandbox CNY 199 report for `https://shun-express.com/`. The run is successful only when the customer HTML and every commercial authority agree on the same terminal outcome.

## Confirmed Failure

The failed MiMo run proved that three answered question checkpoints and an active HTML artifact can coexist with a `lease_exhausted` Core job and failed fulfillment order. The immediate exception was caused by a missing `OGC_TOKEN_HASH_SECRET` in the rebuilt Staging Worker. The environment builder, V4 launch preflight, and Worker startup readiness did not require that downstream commercial secret.

This is not an answer-generation failure. It is a readiness and state-machine boundary failure. Operator replay alone is insufficient because it repairs one damaged run without preventing the same split state from recurring.

## Non-Goals

- Do not redesign the three customer questions, their independent checkpoints, or their per-question retry limit.
- Do not add another report contract or schema generation.
- Do not replace V4 with V3 or mutate historical V1-V3 reports.
- Do not change payment-provider authority or introduce a checkout bypass.
- Do not deploy, query, or mutate production for this acceptance run.
- Do not make the existing operator recovery path part of normal fulfillment.

## Design

### 1. Fail-closed runtime readiness

The workstation environment builder must carry a nonblank `OGC_TOKEN_HASH_SECRET` into the merged Staging Worker environment without printing it. The Report V4 launch preflight and Worker startup readiness must reject a runtime that cannot complete customer access-token generation.

Readiness covers all configuration required by the normal V4 Core terminal path, not only the model transport. Tests must prove that a missing or blank token secret prevents Worker readiness before any job is claimed.

### 2. Ready artifact before commercial terminalization

Core generation may persist the immutable report payload and canonical HTML, but it must leave the generation revision in `ready` state. It must not update the report's active artifact pointer before commercial terminalization begins.

The report remains unavailable to the customer while the Core job is non-terminal. A failed or interrupted terminalization therefore leaves a recoverable ready artifact rather than a customer-visible artifact attached to a failed order.

### 3. One atomic activation and commerce transaction

`terminalizePaidReportV4Core(...)` becomes the only normal boundary allowed to activate a new V4 Core generation revision. Under the existing per-report commerce advisory lock and one PostgreSQL transaction, it must validate and commit:

1. exact ready Core artifact and persisted payload identity;
2. exact running leased standard paid Core job;
3. exact verified paid order and reserved internal credit;
4. Core artifact activation and report active-artifact pointer;
5. terminal job state and transition event;
6. credit settlement or return;
7. refund authority for a limited result;
8. report access token;
9. terminal email delivery row;
10. order fulfillment, refund, and delivery state.

Any exception rolls back all ten effects. Idempotent re-entry accepts only the exact already-terminal topology and creates no duplicate token, refund, email, credit, or enhancement side effect.

The diagnosis enhancement remains downstream of successful Core terminalization and cannot retract the active Core report.

### 4. Exact error evidence and lease behavior

A V4 production exception that occurs before a durable terminal state must be normalized and persisted with its real phase and code. The Worker may still fail closed, but it must not reduce a missing configuration or transaction conflict to the generic log line `A claimed report job exited unexpectedly.`

The original error must remain queryable even if a later lease recovery transition occurs. Repeated claims must not consume the full job retry budget when the existing ready artifact can safely re-enter the same terminalization boundary.

### 5. Existing damaged-run recovery

The in-progress operator recovery code may be retained only as a separately named, guarded repair for artifacts that were activated by the old split boundary. It must require exact report, order, job, artifact, checkpoint, credit, refund, email, access-token, and enhancement topology and refuse any submitted refund or delivered terminal email.

Recovery must first pass the same runtime readiness used by normal fulfillment. It may restore a damaged run to a legal terminal replay state, but it must never regenerate answers, create a second paid job, or become the path used by the new Shun Express acceptance run.

## Verification

### Deterministic tests

- Environment-generation tests prove the token secret is present by name and remains secret-safe.
- Startup-readiness tests prove missing or blank commercial secrets fail before job claim.
- PostgreSQL tests inject a failure after every atomic terminalization step and prove zero partial effects.
- Re-entry tests prove no duplicate access token, refund, email, credit transition, artifact activation, or enhancement job.
- Processor tests prove the original V4 terminalization error is persisted and not replaced by a generic lease-only diagnosis.
- Historical V1-V3 access and artifact tests remain green.

Required validation includes focused tests, `npm test`, `npm run lint`, `npm run build`, `npm run db:audit`, `npm run report:v4:traceability`, and CodeGraph synchronization after source changes.

### Protected-Staging Shun Express acceptance

After the exact repaired revision is deployed to the Staging Web and both Staging Worker lanes:

1. preflight the merged runtime without exposing secrets;
2. start a forced-fresh Staging scan for `https://shun-express.com/`;
3. wait for the immutable V4 pre-admission snapshot;
4. confirm exactly three Chinese business questions;
5. create and complete one Airwallex Sandbox CNY 199 checkout;
6. drain the exact paid Core job without operator recovery;
7. inspect all three question checkpoints, provider-call counts, and question-owned sources;
8. verify authorized customer HTML in a real browser;
9. verify report, artifact, job, order, credit, refund, access-token, email, and optional enhancement states from PostgreSQL;
10. run `npm run db:audit` and record exact identities and outcomes in a dated evidence document.

Acceptance fails if the HTML is active while the Core job or order is failed, if the report requires operator replay, if the original error is hidden, or if any commercial side effect is duplicated.

## Rollout Boundary

The repair is deployed and exercised in protected Staging only. Production remains untouched until the user separately authorizes production rollout after reviewing the Shun Express report and its evidence.
