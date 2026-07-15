# V3 Paid Acceptance Remediation Final Report — 2026-07-15

## Executive decision

**Overall status: failed closed after Sandbox payment; no customer V3 website analysis report was activated.**

All deterministic gates, MiMo preflight, protected Preview Airwallex retrieval, redirected Resend probe, deployment alignment and pre-order database audit passed. A new CNY 199 Sandbox payment then created exactly one entitlement/deep job. The job analyzed 6/7 planned pages and collected real provider/search evidence, but V3 artifact validation rejected an overclaimed `verified` Q1 sentence and the recovery model later returned a non-three-entry answer payload. The artifact stayed pending and non-active.

Commercial cleanup delivered all three emails and refunded the internal credit. The Airwallex cash refund itself failed with `airwallex_authentication_http_401`, so the customer page truthfully requests refund assistance. This run must not be represented as a successful report or successful cash refund.

## Runtime identities

| Object | ID / state |
| --- | --- |
| Source/Worker revision | `995351020966ef9413d39ec6d6d0a989f9289c3c` |
| Preview deployment | `dpl_GbzJtSVVMESqi1eJdBY64WGgDHkW` |
| Preview URL | `https://open-geo-console-m6f5wy0de-itheheda-6857s-projects.vercel.app` |
| Free report/job | `d2bb14cc-ea2d-48d5-a8a2-6d9a35c1aeb3` / `6c332552-3404-4cc5-b730-ab2d86fbace4` |
| Paid order / intent | `d98f2c1a-4b9a-44d4-ae34-d74d8c9d01dd` / `int_hkdmcczsvhkewg8jfql` |
| Deep job | `22e50f13-da98-426a-8ff4-03fcca2eaa8f` — terminal failed |
| Credit | `9c73f1a7-1e9d-4d3f-acb1-76af0ba5ce8f` — refunded |
| Artifact revision | `360f9cb0-463f-4cfe-82e8-55e3e2119246` — pending, non-active |
| Refund intent | `6e2dd3e9-0478-4225-a5e8-1ce976351826` — failed |

## Passed evidence

- Full deterministic suite: 176 files passed, 19 skipped; 1,052 tests passed, 41 skipped.
- Lint and build passed.
- Real MiMo probe passed all three bounded cases.
- Protected Preview provider probe returned Airwallex retrieval success and Resend provider email `037265a4-b0ad-4e32-aec3-96dfeb41edcf`.
- Payment Webhook persisted exactly one processed event, credit, deep job and artifact revision.
- Deep crawl analyzed 6/7 planned pages.
- Candidate verification persisted 39 observations and 8 available sources across 7 domains.
- Three transactional emails reached `delivered`.
- Final staging `db:audit` passed: no terminal commercial job retains a reserved credit.
- Customer failure/refund-assistance UI rendered at 1440×1024 and 390×844 with no browser console errors.

## Failed evidence

- V3 Q1 emitted `verified` confidence while its first grounded sentence had fewer than two independent registrable domains.
- Artifact verification retried the same contract failure three times under `unexpected_internal_error`.
- Terminal recovery returned fewer or more than exactly three ordered answer entries.
- Deep job terminalized failed at 99%; no V3 HTML became ready or active.
- Airwallex cash refund failed with `airwallex_authentication_http_401`; no provider refund ID was issued.
- Authorized `report.html`, three accepted answer cards, report-ready email and desktop/mobile report rendering do not exist for this run.

## Browser evidence

- Desktop: `C:\Users\fengc\.codex\visualizations\2026\07\15\019f64c5-8dc3-72d0-90a7-678ff375780b\v3-paid-failure-desktop-1440x1024.png`.
- Mobile: `C:\Users\fengc\.codex\visualizations\2026\07\15\019f64c5-8dc3-72d0-90a7-678ff375780b\v3-paid-failure-mobile-390x844.png`.

## Safety statement

Production database, production Workers, production deployment and production aliases were not changed. Historical failed order `d738b38f-63cb-4886-bdda-c8f745bf5b81` was not reopened, mutated or represented as successful. No second order was created after the hard stop, and PostgreSQL was not changed to fake a provider refund or artifact activation.

## Required next repair

Before any further paid attempt, add TDD coverage that downgrades one-domain claims to `limited`, preserves exactly three ordered answer entries across recovery, and maps these validation failures to a specific bounded code. Separately restore a sanctioned Airwallex Sandbox refund/reconciliation path for refund `6e2dd3e9-0478-4225-a5e8-1ce976351826`. Only after both repairs and all pre-order gates pass may a new paid acceptance attempt be created.
