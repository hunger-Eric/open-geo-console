# Open GEO Console Project State

## Current Goal

Deliver a self-hostable, evidence-bound GEO product whose customer artifact is one secure HTML report. The persisted generation locale remains immutable throughout generation and delivery. Report V4 has no PDF generation or customer-PDF surface; V1-V3 retain their historical private-readiness records.

## Active Change Scope

- `docs/ACTIVE-CHANGE-SCOPE.md` is `APPROVED` for its exact two-phase protected-Staging V4 plan. Phase A's exact-job one-shot Worker is implemented within the seven-file code/test allowlist and independently verified `CONFORMANT`; ordinary FIFO Worker behavior and all prohibited subsystems remain unchanged.
- Phase A acceptance recorded 69 focused tests, a second independent disposable PostgreSQL targeted-claim run (2/2), lint, build, diff, and CodeGraph checks. The full `npm test` result remains 2,590 passed, 175 skipped, with five known unrelated acceptance-ledger failures.
- No deployment, report, crawl, model call, payment, refund, email, production action, or other external workflow was performed for Phase A. The user-owned `assets/` and protected V3 plan remain untouched.

## Current Snapshot (2026-07-19)

- The V4 current-question prompt now requires a direct useful answer, concrete provider/service identification, solution-to-scenario/condition/limitation mapping, and a practical purchase-verification checklist. Ordinary business questions cannot be replaced by research methodology, generic market background, or no-answer wording; only an explicit typed refusal may have an empty answer.
- Focused answer-boundary verification passes 64 tests across the MiMo provider, three-question answerer, and generative-answer parser; lint and diff checks pass. An independent checker classified the implementation and complete seven-file scope diff as `CONFORMANT`.
- No real model call, website scan, historical recovery/replay, payment, refund, email, Worker/Docker action, staging operation, or deployment was performed for this answer-optimization work unit. A real `shun-express.com` report remains a separate approval gate.
- Branch `codex/report-v4-implementation` is pushed through `7c3efab`. Protected Preview deployment `dpl_7XWvdMcJups3EjSeMQYe8y1oScHt` is Ready and the fixed staging alias points to it. Production was not deployed, mutated, or exercised.
- PostgreSQL schema authority is v40. V1-V3 runtime and historical artifacts remain readable and unchanged.
- One real CNY 199 Airwallex Sandbox V4 run for `https://mimo.xiaomi.com/zh` completed as `completed_limited`: report `43dbe8f5-49e6-48f5-a902-cc8c3965c199`, order `c2071a58-5ba3-4ff6-8576-5bfec30569e3`, core job `da19f154-acee-4c23-8c9e-5ccea9365992`, active artifact `report-v4-core-e3ffa435bdbb7996762aa87c8c0127d062c6cd0d493f5b7856b6a06f84980c9e`.
- The customer HTML is authorized and live at the protected deployment's `/reports/43dbe8f5-49e6-48f5-a902-cc8c3965c199/report.html`. Exact-route inspection returned HTTP 200, `data-report-version="4"`, three question cards, two answered cards, one explicit unavailable card, and ten public-source links.
- The immutable pre-admission snapshot is `completed_limited`: seven candidates, three analyzable pages, and two exclusions. The paid core reused that snapshot and did not enqueue an enhancement job after its limited terminal result.
- Payment is `paid`; fulfillment is `completed_limited`; the internal credit is refunded. The Airwallex Sandbox cash-refund submission is truthfully `failed`, and 21 queued test emails were retried but not delivered in the final commerce pass.
- The live repairs add bounded page-analysis contract recovery, collision-free legacy page locations, serialized question calls, generic business-question wording, exact pending-core resume identity, standalone-safe V4 rendering, and explicit active-V4 HTML access without broadening the legacy default artifact loader.
- Final source verification: focused access/renderer/report tests pass (30 tests), lint passes, and the production build passes. A prior full `npm test` run passed 2,565 tests but still has five unrelated PostgreSQL schema-drift failures in the V4 acceptance phase-snapshot suite.
- `config/report-contracts/combined-geo-report-v4.requirements.json` remains the machine authority. All 20 requirements remain `implemented`, not `verified`; one successful paid run is not the required three-scenario evidence set.

## Architecture and Product Boundaries

- `apps/web` owns PostgreSQL persistence, job orchestration, routes, access control, commerce, and UI. Workers alone crawl pages, call models, capture evidence, and materialize report artifacts.
- PostgreSQL is the report, job, dispatch, payment, credit, refund, email, and access authority. Cloudflare Queue is notification-only.
- A verified payment Webhook is the only authority that marks an order paid and creates its entitlement/deep job. Terminal commercial outcomes use the atomic job-and-credit boundary.
- Customers receive authorized HTML only. Report V4 has no PDF generation, readiness, storage, route, action, or email claim.
- The production free limit remains two distinct sites per rolling 24 hours. Forced regeneration and operator acceptance controls are protected-staging-only.
- Production is outside the V4 acceptance scope and must remain untouched.

## Durable Evidence

- The full paid-run identity, customer-content inspection, commercial outcome, deployment identity, code repairs, and limitations are recorded in `docs/operations/evidence/2026-07-19-report-v4-paid-deep-report.md`.
- Protected-staging V2/V3 acceptance and correction records remain historical evidence under `docs/operations/evidence/`.
- Historical terminal jobs, orders, credits, refunds, question sets, and artifacts remain immutable. Remediation must use a sanctioned replacement/correction boundary rather than reopening or rewriting them.

## Remaining Work / Blockers

1. Commit the exact Phase A diff after its final allowlist/budget audit; do not push.
2. On that same revision, execute Phase B only through the approved protected Preview and exact one-shot Worker path for the new `shun-express.com` V4 report.
3. Store requirement-bound evidence for all 20 requirements, review each registry promotion from `implemented` to `verified`, and only then expect `npm run report:v4:acceptance` to pass.
4. Resolve the five PostgreSQL acceptance phase-snapshot schema-drift failures before treating the full deterministic suite as green.
5. Keep live V2/V3 recovery and unresolved historical Sandbox refunds separate from V4 acceptance.

## Verification

```powershell
npm test
npm run lint
npm run build
npm run report:v4:traceability
npm run report:v4:acceptance
codegraph status
```

Expected current truth: lint, build, focused V4 tests, traceability, and CodeGraph pass. Full V4 acceptance must remain fail-closed until the two missing scenarios exist and all 20 requirement statuses are explicitly promoted from `implemented` to `verified`.
