# Open GEO Console Project State

## Current Goal

Deliver a self-hostable, evidence-bound GEO product whose customer artifact is one secure HTML report. The persisted generation locale remains immutable throughout generation and delivery. Report V4 has no PDF generation or customer-PDF surface; V1-V3 retain their historical private-readiness records.

## Active Change Scope

- `docs/ACTIVE-CHANGE-SCOPE.md` is `FROZEN` at the final replacement's permanent-stop boundary. The remediation commit and protected runtime are aligned to `5a6ac0d24574581342d7bc45ca4867e44094a366`; Preview `dpl_FbWc3HYAFLJyqqDwewdViPwq3JMP`, fixed alias, image `sha256:9943d450435fdea586fa382ecb513cfb0c2f7e2112f2f9d7a23fda8e2794f0b1`, runtime marker, and free/deep presence match that SHA.
- Final authorized report `77d7577d-fbe7-4dec-b70b-912982394ff8` completed its free job, but admission snapshot `report-v4-site-33de08ce1642b15b6dc82b65f30ebb923571ac1a199eb7b73d6f363e119bcc46` terminalized `completed_limited` after `604.213` seconds with `116/23/93` candidates/analyzable/excluded. The 23 analyzable bodies were unique and identified `深圳市凌顺国际物流有限公司`; unresolved `deadline_exceeded=5` and `raw_fetch_failed=1` correctly kept the gate closed.
- The final replacement has zero orders, payment events, credits, artifacts, tokens, Core/diagnosis jobs, and active lineage jobs. No payment or customer deep report exists. No second report, replay, repair, push, merge, or production action is authorized; production deployment and containers remain unchanged.

## Current Execution Outcome (2026-07-20)

- The free foundation completed at score `76` and identified `深圳市凌顺国际物流有限公司` / `凌顺国际物流`; no SF or 顺丰 identity was present.
- The sole V4 pre-admission snapshot has one homepage candidate, zero analyzable pages, and one `deadline_exceeded` exclusion. The pre-admission job is terminal `completed` without a persisted retry, repair state, or successor job, so the exact-claim state machine cannot run it again.
- Question rows are zero because the checkout GET would normally create them lazily, but checkout refuses the unavailable snapshot. The three locked questions were therefore never persisted.
- Historical polluted report `8446d645-8db1-45ce-8f4a-8016f7ed1b8f` and job `58f10a1b-25af-4e7c-b7fa-7dee1b4947a4` retained their original hashes and timestamps. No ordinary/persistent Worker ran; both exact ephemeral containers were removed and the other 59 containers retained the same normalized snapshot hash.
- The requested complete paid V4 report was not produced. Continuing would require manual replay, a second report, or product/state-machine change, all outside the approved design and scope.
- Deterministic integration gates remain green: focused Unit 2/3/4-5 suites passed `54/56/185`, exact one-shot/claim passed `26`, ledger PostgreSQL passed `12`, phase-snapshot PostgreSQL passed `5`, Unit 7A PostgreSQL passed `7`, lint and build passed, and full tests passed `2,616` with `177` skipped and zero failures. Traceability lists all 20 requirements as implemented; final V4 acceptance remains correctly fail-closed because protected-Staging verification is incomplete. CodeGraph is current at 771 files, 11,184 nodes, and 33,524 edges.

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

- The complete 2026-07-20 integrated runtime, target identities, exact one-shot logs, unavailable snapshot, zero-commerce proof, historical immutability, production non-change, and terminal stop reason are recorded in `docs/operations/evidence/2026-07-19-shun-express-v4-deep-report.md`.
- The full paid-run identity, customer-content inspection, commercial outcome, deployment identity, code repairs, and limitations are recorded in `docs/operations/evidence/2026-07-19-report-v4-paid-deep-report.md`.
- Protected-staging V2/V3 acceptance and correction records remain historical evidence under `docs/operations/evidence/`.
- Historical terminal jobs, orders, credits, refunds, question sets, and artifacts remain immutable. Remediation must use a sanctioned replacement/correction boundary rather than reopening or rewriting them.

## Remaining Work / Blockers

1. Preserve the failed target report, jobs, unavailable snapshot, historical authority, runtime identities, and zero-commerce evidence unchanged.
2. Do not replay the completed pre-admission job, create or pay for a second report, alter the crawler/state machine, or push the branch under this frozen scope.
3. Any future attempt requires a new design and exact scope that explicitly resolves the admission deadline behavior and authorizes its report/payment count; this task provides no such authority.
4. Keep live V2/V3 recovery, unresolved historical Sandbox refunds, and production entirely separate from this failed V4 acceptance.

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
