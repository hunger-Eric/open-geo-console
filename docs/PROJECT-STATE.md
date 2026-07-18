# Open GEO Console Project State

## Current Goal

Deliver a self-hostable, evidence-bound GEO product whose customer artifact is one secure HTML report. The persisted generation locale remains immutable throughout generation and delivery. HTML-to-PDF remains a private Worker readiness/storage artifact and is never a customer format.

## Current Snapshot (2026-07-18)

- Work is local on branch `codex/report-v4-implementation`; no Report V4 deployment or protected-staging acceptance has been performed from this branch.
- PostgreSQL schema authority is v40. V1-V3 runtime and historical artifacts remain readable and unchanged.
- The two-stage `combined_geo_report_v4` implementation is present locally: global-prefix authority phase snapshots, semantic checkpoint/runtime projectors, a three-scenario semantic authority aggregator, sealed-scenario append protection, an interleaving-safe atomic seal operation, and the `report-v4-acceptance-semantic-evidence/v2` collector contract.
- `config/report-contracts/combined-geo-report-v4.requirements.json` is the machine authority and `docs/REPORT-V4-COVERAGE-MATRIX.md` is its generated view. All 20 requirements are `implemented`; none is `verified`.
- `npm run report:v4:traceability` passes for all 20 requirements. `npm run report:v4:acceptance` intentionally fails all 20 because protected-staging evidence is absent and no requirement has been promoted to `verified`.
- Local verification is green: `npm test` reports 289 passed files / 42 skipped and 2,561 passed tests / 173 skipped; lint and the production build pass; CodeGraph is current.

## Architecture and Product Boundaries

- `apps/web` owns PostgreSQL persistence, job orchestration, routes, access control, commerce, and UI. Workers alone crawl pages, call models, capture evidence, and materialize report artifacts.
- PostgreSQL is the report, job, dispatch, payment, credit, refund, email, and access authority. Cloudflare Queue is notification-only.
- A verified payment Webhook is the only authority that marks an order paid and creates its entitlement/deep job. Terminal commercial outcomes use the atomic job-and-credit boundary.
- Customers receive authorized HTML only. Customer PDF routes, actions, and email claims remain forbidden; private Chromium readiness, hashes, page counts, and storage stay internal.
- The production free limit remains two distinct sites per rolling 24 hours. Forced regeneration and operator acceptance controls are protected-staging-only.
- Production is outside the V4 acceptance scope and must remain untouched; Report V4 must not be deployed to or exercised against production.

## Deployed Runtime and Historical Evidence

- The deployed product remains on the established V1-V3 paths; the local V4 branch has not changed protected staging or production.
- Protected-staging V2/V3 acceptance and correction evidence remains under `docs/operations/evidence/`; those dated records are historical evidence, not the current V4 rollout state.
- Historical terminal jobs, orders, credits, refunds, question sets, and artifacts remain immutable. Remediation must use a sanctioned replacement/correction boundary rather than reopening or rewriting them.

## Remaining Work / Blockers

1. Obtain explicit user authorization before any deployment, protected-staging database mutation, Airwallex Sandbox payment/refund, redirected email, push, or pull request.
2. After authorization, align protected-staging schema v40 plus Web, free Worker, deep Worker, and commerce code without touching production.
3. Run the three exact V4 scenarios, preserve the sealed global ledger and immutable baseline/final/config authorities, and collect `report-v4-acceptance-semantic-evidence/v2` output.
4. Store requirement-bound protected-staging evidence for all 20 requirements. Only then may registry statuses be reviewed for promotion from `implemented` to `verified` and `npm run report:v4:acceptance` be expected to pass.
5. Keep live V2/V3 fault-injection recovery, adaptive public-source acquisition follow-ups, and unresolved Airwallex Sandbox refunds separate from V4 acceptance.

## Verification

```powershell
npm test
npm run lint
npm run build
npm run report:v4:traceability
npm run report:v4:acceptance
codegraph status
```

Expected local truth: tests, lint, build, traceability, and CodeGraph pass. Until protected-staging evidence exists and statuses are explicitly promoted, `report:v4:acceptance` must fail with all 20 requirements reported as `implemented`, not `verified`.
