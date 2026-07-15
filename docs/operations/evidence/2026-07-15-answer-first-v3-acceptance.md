# Answer-first V3 protected-staging acceptance — 2026-07-15

## Outcome classification

- Commercial failure/refund/email/non-activation path: passed.
- Private HTML/PDF readiness for the failed artifact: passed.
- Answer-first V3 product acceptance: failed; all three cards were `insufficient` despite real Q1 search and retrieved-body evidence.
- Customer-deliverable V3 acceptance: incomplete. The original report/order/job/artifact/refund are terminal and were not reopened.

## Scope and boundaries

- Target: `https://shun-express.com/`
- Preview only; no `--prod`, production database, production alias, production environment, or production service was changed.
- Historical reports were read-only. In particular, report `6c13e91a-f836-4f04-b426-4b45807234b7` was not modified.
- The original refunded V3 attempt remained immutable. This run used one new order and one manually completed Airwallex Sandbox payment; no second payment was requested during recovery.

## Identities

- Preview deployment: `DVA7VKpot6tDEJZRHarLBSaaq1Df`
- Preview URL: `https://open-geo-console-7zktxor9e-itheheda-6857s-projects.vercel.app`
- Fixed protected alias: `https://open-geo-console-staging-itheheda.vercel.app`
- Free report/job: `98caffd1-c8af-4ceb-88ab-063194ea74b7` / `f5f63f65-dd62-4b1d-9135-078f84c33066`
- Paid order / intent: `dee37006-7924-4965-8ef3-181d447f27db` / `int_hkdmp9krrhkel0ly540`
- Deep job: `7607a664-05c6-4b47-800e-03d420894aea`
- V3 artifact revision: `ae8f0485-ff26-4457-92bc-3fcd7002e970`
- Credit reservation: `768f75fc-f301-4933-8bfe-c82126aaa86b`
- Refund intent: `eadf87eb-fc3c-4674-9be8-b1322ffe62ba`
- Provider refund: `rfd_hkdmcczsvhkeob5qfmn_0ly540`

## Root-cause repairs proven by the live run

1. Public-source retrieval now contains source-local `TimeoutError` failures while preserving caller/deadline abort control flow (`cedcb27`).
2. A partially successful terminal search ledger resumes without replaying successful queries (`b13b39f`).
3. An interrupted pending ledger is failed and replaced during takeover (`b3d6a01`).
4. Concurrent snapshot waiters require matching purpose metadata before reuse (`2b3ee27`).
5. Answer-card coverage reasons are deterministic localized report prose; legacy language-invalid answer checkpoints regenerate (`2726349`).
6. Language correction preserves complete target hostnames and narrowly restores the legacy `shun-express.英文术语` form from the known target URL (`8042799`).

These six items prove recovery and commercial terminality only. They did not prove that V3 could produce a useful answer.

## Read-only staging diagnosis after the failed run

- Q1 completed 22 of 30 queries, returned 90 search observations and safely retrieved nine pages. Candidate-verification storage included direct 永利八达通 body text describing `100,000 m2` overseas-warehouse area, globally distributed self-operated warehouses, drop shipping, transfer/replenishment and reverse logistics.
- Search-result headings such as “您的海外仓服务供应商” and “有哪些比较好的美国海外仓……” were incorrectly promoted to provider subjects. They could not match the real brand in the body, provider claim extraction returned zero claims, and the safely retrieved page never entered the permitted answer evidence map.
- Q2/Q3 returned 12 and 15 search observations respectively. Their six selected retrievals per question all failed; the cards incorrectly displayed zero returned results because eligible evidence URL count was used as the search-result count.

## Local automated repair evidence

- Commit `92879e6` rejects question/article/notice/generic-role titles as provider identities and admits question-relevant candidate-verification body evidence into Q1 under a traceable domain subject even when qualification/claims are empty.
- Commit `c8ca110` separates planned/completed queries, returned observations, attempted retrievals, safe pages and eligible direct evidence; historical V3 payload parsing remains backward compatible.
- Commit `511047f` spreads the fixed retrieval budget across queries and prioritizes ordinary pages ahead of PDF/download candidates without changing the 30-query/60-retrieval or safety boundaries.
- `npm test`: 170 files passed, 19 skipped; 1,028 tests passed, 40 skipped.
- `npm run lint`, `npm run build`, staging `db:audit`, `git diff --check`, focused V3/readiness suites and CodeGraph sync/impact checks passed.
- Customer route/copy/email PDF search had no matches. Private PDF export, hash, storage-key and page-count readiness references remain present.

## Repaired protected Preview deployment

- Deployment: `dpl_4EQQpkeqyM1v9zuw7NnR5AhXWw6P`
- Preview: `https://open-geo-console-3r9vntoku-itheheda-6857s-projects.vercel.app`
- Vercel target/status: `preview / Ready`; Functions built in `sin1`.
- Fixed staging alias was updated only after Ready. Staging free/deep Docker Workers were rebuilt from the same source image; schema remains v21. Production was not changed.
- This deployment evidence is not a new answer-report acceptance. No new V3 artifact was generated or activated.

## Runtime evidence

- Signed payment Webhook created exactly one paid deep job for the order.
- The same job resumed four times from preserved phase checkpoints after readiness probes; no new order, payment, entitlement, or deep job was created.
- Candidate verification completed with 12 attempts, 9 successful searches, 43 observations, and 42 retained source rows. Provider qualification truthfully produced zero strict providers.
- The final three cards were all `insufficient`. Q1 completed 22 of 30 planned queries with 90 returned observations and 9 safely retrieved pages; Q2/Q3 each completed 6 planned queries but produced no eligible direct evidence.
- Atomic terminalization produced job `failed / terminalization / combined_v3_evidence_failed`, credit `refunded`, and one full-refund intent. The protected Preview commerce runner submitted and completed the Airwallex Sandbox refund; the order is `paid / failed / refunded / delivered`.
- Artifact revision `ae8f0485-ff26-4457-92bc-3fcd7002e970` is `ready` but not active. Readiness is `htmlCanonical=true`, `privateEvidenceReady=true`, `pageCount=17`; HTML SHA-256 is `ec1260597a8713d161205b94503284008f4330e22f8f87e4462e5012f23dbc3a`, private PDF SHA-256 is `b004735627beda79fc55aa961d25f6e83b2adf0392af4f0fb94531cedb48f354`.
- The failed artifact is not customer-deliverable. Its protected staging-access route returns application `404`, while the Preview homepage and staging commerce page return `200`.
- `payment_confirmed`, `report_failed_refund`, and `refund_succeeded` redirected test emails all reached `delivered`.

## Verification

- `npm test`: 170 files passed, 19 skipped; 1,024 tests passed, 40 skipped.
- `npm run lint`: passed.
- `npm run build`: passed locally and in Vercel Preview.
- Staging `db:audit`: passed; no terminal commercial job has a reserved credit.
- Focused answer/language/artifact suites: 5 files and 125 tests passed after the final fixes.
- CodeGraph: 518 files, 5,846 nodes, 15,502 edges; index up to date.
- Google Chrome 150 automation: desktop 1440×1024 and mobile 390×844 homepage rendered with HTTP 200; protected staging commerce rendered with HTTP 200; the failed report's operator-access route returned HTTP 404 as required.

The bullets above describe the original failed run and its then-current Preview. They do not validate the repaired Preview. Real Chrome control could not initialize for the repaired deployment, so no new desktop/mobile/report/404 browser evidence is claimed.

## Remaining protected-staging boundary

The existing staging refresh lineage requires an active V1/V2 source artifact. Revision `ae8f0485-ff26-4457-92bc-3fcd7002e970` is a non-active V3 generation artifact, and its Airwallex refund has completed; code rejects reopening submitted/completed refunds and terminal jobs. A new full run therefore requires a new Sandbox checkout unless a separately audited replacement-fulfillment mechanism is added. No headless browser was used to pay, no new payment was requested, and no payment link was fabricated while Chrome control was unavailable.

## 2026-07-15 paid-acceptance remediation attempt

### Deterministic remediation

- `830a4de` classifies public-source snapshot failures by stage.
- `b9a7962` rejects privacy-invalid provider rows before persistence while retaining valid observations.
- `5666675` compacts buyer questions to source-driven focus text and at most three examples/markets.
- `70e1eb1` adds typed commerce-provider failures plus a read-only staging provider probe.
- `53092df` keeps pending payment returns polling and renders truthful refund-failure state.
- `fa4cdb2` covers missing, anonymous and wrong-scope private HTML report reads as application `404`.
- `npm test` passed: 174 files passed, 19 skipped; 1,048 tests passed, 41 skipped.
- `npm run lint`, `npm run build`, staging `db:audit`, `git diff --check`, and CodeGraph sync passed. PostgreSQL-only observer cases remained skipped when no isolated `OGC_TEST_DATABASE_ADMIN_URL` was supplied.

### Protected-staging alignment

- Source revision: `fa4cdb28dbc9f877a7ac2c124b66d5cc122e46c7`.
- Preview deployment: `dpl_56sV5LHa7Gb9W95VEVCCbvUtAeuj`.
- Preview URL: `https://open-geo-console-63n3rf4hc-itheheda-6857s-projects.vercel.app`.
- The fixed protected staging alias was moved only after the Preview was Ready. No production alias or deployment was changed.
- Only `staging-worker-free` and `staging-worker-deep` were rebuilt/recreated. Both run the matching image revision with `OGC_DEPLOYMENT_PROFILE=staging`; the staging database marker is `staging` and schema version is `22`.
- Production services were read only. No production database, Worker, alias, report or historical artifact was modified.

### Stop-gate result

- The first pre-order gate, `npm run public-search:probe -- --adapter mimo --locale zh-CN --region CN`, failed before making an acceptance order because `OGC_PUBLIC_SEARCH_MIMO_BASE_URL` is absent from the staging probe environment.
- Per the remediation plan, execution stopped at this gate. Airwallex/Resend commerce probes, staging commerce reconciliation, checkout, payment, deep fulfillment, activation, email delivery and desktop/mobile browser acceptance were not attempted.
- No new report, order, payment intent, entitlement, job, artifact revision, refund or email intent was created. There are therefore no new report/order/task/revision IDs and no acceptance screenshots.
- Failed historical order `d738b38f-63cb-4886-bdda-c8f745bf5b81` was not reopened, mutated, probed or represented as successful. The earlier terminal V3 chain documented above also remains immutable.
- Customer-deliverable V3 acceptance remains blocked on restoring the staging MiMo base-URL configuration and rerunning every pre-order gate from the beginning.

## Commercial terminality

Refund intent `eadf87eb-fc3c-4674-9be8-b1322ffe62ba` succeeded on its fourth bounded attempt at `2026-07-15T04:57:59.343Z`, bound to provider refund `rfd_hkdmcczsvhkeob5qfmn_0ly540`. The credit remains refunded, all three transactional emails are delivered, and `db:audit` confirms no terminal commercial job retains a reserved credit. The evidence-insufficient job and its non-active artifact remain terminal and must not be reopened.
