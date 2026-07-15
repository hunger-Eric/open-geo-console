# Answer-first V3 protected-staging acceptance — 2026-07-15

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

## Commercial terminality

Refund intent `eadf87eb-fc3c-4674-9be8-b1322ffe62ba` succeeded on its fourth bounded attempt at `2026-07-15T04:57:59.343Z`, bound to provider refund `rfd_hkdmcczsvhkeob5qfmn_0ly540`. The credit remains refunded, all three transactional emails are delivered, and `db:audit` confirms no terminal commercial job retains a reserved credit. The evidence-insufficient job and its non-active artifact remain terminal and must not be reopened.
