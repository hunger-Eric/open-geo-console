# V3 Paid Acceptance Remediation Final Report — 2026-07-15

## Executive decision

**Overall status: blocked before checkout; customer-deliverable V3 acceptance is not complete.**

The planned deterministic remediation, protected-staging deployment alignment, staging-only Worker alignment, database audit, and real MiMo public-search gate completed successfully. The next read-only provider gate stopped with `airwallex_authentication_invalid_configuration` before it could retrieve the historical Sandbox payment intent or send the redirected Resend probe email. Per the fail-closed plan, no new order was created and no payment, entitlement, deep job, artifact activation, delivery email, or browser acceptance was attempted.

This result must not be represented as a successful paid V3 acceptance.

## Scope and safety boundaries

- Repository: `E:\project\open-geo-console`
- Target used by the acceptance plan: `https://shun-express.com/`
- Execution environment: protected staging Preview and staging-only Docker Workers.
- Production database, production Workers, production alias, production deployment, and historical reports were not modified.
- Failed historical order `d738b38f-63cb-4886-bdda-c8f745bf5b81` was not reopened, mutated, or represented as successful. The provider probe failed at local authentication configuration before retrieving it.
- The user-provided plan remains untracked at `docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md` and was not silently added to implementation commits.

## Completed remediation

| Commit | Result |
| --- | --- |
| `830a4de` | Classifies public-source snapshot failures by stage. |
| `b9a7962` | Filters privacy-invalid provider rows before persistence while retaining valid observations. |
| `5666675` | Produces compact, source-driven buyer questions with bounded examples and markets. |
| `70e1eb1` | Adds typed commerce-provider failures and the read-only staging provider probe. |
| `53092df` | Keeps pending payment returns polling and renders truthful refund-failure state. |
| `fa4cdb2` | Covers missing, anonymous, and wrong-scope private HTML report reads as application `404`. |
| `7df74bc` | Fixes the public-search probe to consume the merged staging Worker runtime env. |

The MiMo probe regression was verified red/green: source env files contained empty Sensitive-value placeholders, while the staging Workers correctly used merged `.data/workstation-docker/staging.env` values. The durable operator rule is recorded in `AGENTS.md` and `docs/PROTECTED-STAGING-OPERATIONS.md` by commit `2d57066`.

## Verification evidence

| Check | Result |
| --- | --- |
| Focused probe configuration tests | 2 files, 2 tests passed |
| Full `npm test` after the probe repair | 175 files passed, 19 skipped; 1,049 tests passed, 41 skipped |
| `npm run lint` | Passed |
| `npm run build` for the deployed remediation source | Passed locally and in Vercel Preview |
| Staging `db:audit` | Passed; no terminal commercial job retains a reserved credit |
| Database identity | `staging`, schema version `22` |
| CodeGraph | Synchronized and up to date for the remediation source |
| `git diff --check` | Passed before each remediation/documentation commit |

PostgreSQL-only observer tests remained skipped where no isolated `OGC_TEST_DATABASE_ADMIN_URL` was supplied; those skips are not presented as live PostgreSQL acceptance.

## Protected-staging identities

| Identity | Value |
| --- | --- |
| Deployed remediation source | `fa4cdb28dbc9f877a7ac2c124b66d5cc122e46c7` |
| Preview deployment | `dpl_56sV5LHa7Gb9W95VEVCCbvUtAeuj` |
| Preview URL | `https://open-geo-console-63n3rf4hc-itheheda-6857s-projects.vercel.app` |
| Fixed protected alias | `https://open-geo-console-staging-itheheda.vercel.app` |
| Staging Worker image revision | `fa4cdb28dbc9f877a7ac2c124b66d5cc122e46c7` |
| Local probe repair | `7df74bc` — local operator command only; no new Preview was required for this CLI env-source correction |

Only `staging-worker-free` and `staging-worker-deep` were rebuilt/recreated from the aligned image. Both reported ready with `OGC_DEPLOYMENT_PROFILE=staging`.

## Provider gates

### MiMo public search — passed

The corrected command used the same merged runtime env as the staging Docker Workers. All three bounded cases completed:

| Case | Status | Sources |
| --- | --- | --- |
| `official-factual` | Passed | 3 domains |
| `chinese-b2b-discovery` | Passed | 3 domains |
| `narrow-structured-search` | Passed | 3 domains |

Authentication, rate-limit, timeout, and malformed-response failure semantics were all present in the probe result.

### Airwallex / Resend — blocked

The read-only provider command was invoked with historical payment intent `int_hkdmp9krrhkepyhp2bz` and order `d738b38f-63cb-4886-bdda-c8f745bf5b81`. It stopped with `airwallex_authentication_invalid_configuration` before provider retrieval. Available local staging, pulled Preview, process, user, and machine sources did not expose non-empty Airwallex credentials to the probe. Resend was therefore not reached.

No secret values were printed, logged, copied into tracked files, or substituted from production.

## Commercial and report outcomes

### New remediation attempt

| Object | Result |
| --- | --- |
| New free report | Not created |
| New Airwallex order | Not created |
| New payment intent | Not created |
| New entitlement / credit reservation | Not created |
| New deep task/job | Not created |
| New artifact revision | Not created |
| New refund intent | Not created |
| New email intent | Not created |
| Active customer V3 HTML | Not produced |

There are no new report, order, task/job, payment-intent, entitlement, or artifact-revision IDs to report.

### Preserved historical V3 chain

These terminal identities are historical context only and were not reopened:

| Object | ID / state |
| --- | --- |
| Report | `98caffd1-c8af-4ceb-88ab-063194ea74b7` |
| Paid order | `dee37006-7924-4965-8ef3-181d447f27db` — terminal refunded/delivered |
| Deep task/job | `7607a664-05c6-4b47-800e-03d420894aea` — terminal failed |
| Artifact revision | `ae8f0485-ff26-4457-92bc-3fcd7002e970` — ready but non-active |
| Refund intent | `eadf87eb-fc3c-4674-9be8-b1322ffe62ba` — succeeded |

The earlier chain proves fail-closed refund/email/non-activation behavior, not successful V3 product acceptance.

## Product and browser acceptance

- Three newly generated answer cards: not available because no new report was admitted.
- New V3 HTML activation: not attempted.
- New delivery email: not attempted.
- Commercial convergence for a new order: not applicable because no order was created.
- Desktop 1440×1024 browser verification: not attempted.
- Mobile 390×844 browser verification: not attempted.
- Authorized `report.html` and anonymous/wrong-scope `404` browser verification: not attempted for a new report.
- Screenshot paths: none.

Historical screenshots or browser observations are not reused as evidence for this remediation attempt.

## Required continuation

1. Restore an authorized protected-staging Airwallex Sandbox credential source for the read-only provider probe without copying production secrets or writing secrets into tracked files.
2. Rerun the Airwallex/Resend provider probe against the immutable historical identifiers. Stop again if either provider fails.
3. Run protected-staging commerce reconciliation and staging `db:audit`; confirm no new `unknown_error` and no terminal reserved credit.
4. Only after every pre-order gate passes, create one new protected-staging Airwallex Sandbox order and complete it with the official success test card.
5. Prove exactly one signed-Webhook entitlement/deep job, complete the V3 Worker path, activate the new HTML only if all three cards meet product acceptance, settle email/commercial state, and record all new IDs.
6. Complete real desktop and 390×844 mobile browser acceptance and store new screenshots outside the repository.

## Final classification

- Deterministic remediation: **passed**.
- Protected-staging source/Worker/database alignment: **passed**.
- MiMo provider preflight: **passed**.
- Airwallex provider preflight: **blocked**.
- Resend provider preflight: **not reached**.
- New Sandbox checkout/payment: **not created**.
- New V3 report/card/email/browser acceptance: **not completed**.
- Production and historical-state preservation: **passed**.

The only truthful final status is: **remediation implemented and partially validated; paid V3 acceptance remains blocked before checkout**.
