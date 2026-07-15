# Open GEO Console Project State

## Current Goal

Deliver a self-hostable, evidence-bound GEO product whose customer artifact is one secure HTML report. New reports must keep their persisted generation locale throughout model output, deterministic copy, final readiness, and email delivery. HTML-to-PDF remains a private Worker readiness check and storage artifact; it is not a customer format.

## Architecture and Production Boundaries

- `apps/web` admits scans, persists PostgreSQL state, serves authorized HTML/evidence, and coordinates commerce. Workers alone crawl pages, call models, collect public-source evidence, capture screenshots, and materialize artifacts.
- PostgreSQL is the production authority for jobs, reports, immutable question sets, evidence graphs, artifact revisions, credits, orders, refunds, email intent, and access tokens. Cloudflare Queue is notification-only.
- `recommendation_forensics_v1` remains the paid SKU. Artifact selection is prospective and environment-owned: existing orders retain `combined_geo_report_v1`, while newly admitted work may persist `combined_geo_report_v2`; frozen V1 contracts remain readable and are never silently upgraded.
- A verified payment Webhook is the only authority that marks an order paid and creates its entitlement/job. Terminal job and credit outcomes are atomic. Configuration, authority, storage, and exhausted report-language failures enter `repair_wait` without automatic regeneration, refund, or failure email.
- Every report has one immutable generation locale. Route locale changes interface chrome only. Model prompts require that locale, a language failure receives at most one field-scoped corrective model call, and a prospective final gate runs before HTML/internal-PDF readiness. Corrected fields are applied onto the validated draft without rewriting evidence or unrelated fields; residual unapproved Latin fragments in otherwise Chinese corrections are removed deterministically. Source-original evidence stays verbatim and is labeled as such.
- Customers receive only authorized HTML links. There are no customer PDF routes, buttons, print workspace, or PDF email claims. Internal Chromium export, `%PDF-`/page-count checks, private storage keys, hashes, and database fields remain required. Existing payloads, active revisions, and stored PDF bytes are not migrated, rewritten, or deleted.
- Production free limits remain two distinct sites per rolling 24 hours. Forced regeneration and operator commerce controls are protected-staging-only. Production commerce remains intentionally disabled.

## Current Implementation

- Homepage-only free audit, private deep crawl/model analysis, verified citations, screenshot evidence, six AI dimensions, coverage/provenance, roadmap, and bilingual interface are implemented.
- Schema v22 supports the prospective answer-first `combined_geo_report_v3` contract, immutable three-card checkpoints, provider-discovery snapshot ancestry, immutable relevant passages and provider claims, and staging-only refresh lineage while preserving all V1/V2 rows.
- The answer-first V3 evidence boundary now treats safely retrieved, question-relevant candidate-verification body text as eligible Q1 evidence even when provider claims or qualification are empty. Search questions, notices, article headings and generic provider-role titles are rejected as company identities; titles may identify a source but never become factual evidence. The sentence validator still rejects cross-question/cross-subject binding, one eligible source remains `limited`, and `verified` still requires two independent registrable domains.
- V3 card coverage separately persists and renders planned/completed queries, returned search observations, retrieval attempts, safely retrieved pages and eligible direct evidence. Standard-question returned counts come from immutable snapshot observations rather than admitted evidence URLs. The bounded retrieval plan spreads attempts across queries and prioritizes ordinary HTML pages ahead of PDF/download candidates without changing SSRF, robots, URL, excerpt or 30-query/60-retrieval limits.
- The V2 provider pipeline uses a bounded discovery -> candidate verification -> relevant-passage -> claim-extraction -> deterministic qualification flow. Q1 renders strict Tier A/B suppliers separately from unverified candidates; Q2/Q3 render only claim-bound answers. Exact excerpts, source ownership and honest search/retrieval metrics remain visible, and absence of direct evidence produces an explicit gap rather than a fabricated answer.
- New-report language and terminology enforcement is prospective: newly materialized `geo_v1` combined revisions require the persisted locale and GEO terminology across page analysis, synthesis, combined answers, final prose, and application-owned labels, with at most one corrective model call before the final gate. Their deterministic technical analysis now detects exact duplicate titles and dominant shared title prefixes/suffixes across successful pages, reports those patterns as GEO findings with representative URLs, and compacts affected title cells around the page-specific segment while retaining the full captured title in expandable source evidence. Captured titles, H1 values, URLs, evidence quotes, code, stable technical identifiers, and independently resolved entity names remain source-original exceptions; internal stable `seo` identifiers remain compatible but display as GEO only for `geo_v1`. Existing revisions are neither rewritten nor reinterpreted.
- Customer delivery is HTML-only. The four historical/current artifact renderers expose HTML self-links only; completion emails contain the secure HTML link; former customer `.pdf` handlers and print components are removed.
- The internal PDF path remains wired through `apps/web/src/report/pdf-export.ts`, combined/V2 readiness, private storage, `pdf_sha256`, `pdf_storage_key`, and readiness `pageCount`.

## Staging and Rollout State

Protected staging has an active signed MiMo public-search authority and previously completed the paid V2/correction chain for order `5f999610-17d5-4df9-9aa0-a6cce5e5b741`: three snapshot refs, 22 source-evidence rows, ten screenshots, atomic combined revision activation, settled credit, zero refunds, and delivered transactional email. The preserved acceptance record is `docs/operations/evidence/2026-07-14-combined-report-correction-acceptance.md`; authority/operator status is `docs/operations/public-search-surface-certification.md`.

The locale-safe, HTML-only customer-delivery change is deployed to protected staging. The Chinese `https://shun-express.com/` report (`6c13e91a-f836-4f04-b426-4b45807234b7`) completed its paid V2 continuation through the real MiMo Worker after checkpoint-preserving recovery. Its public-source result is honestly `completed_limited` (18 planned queries, 10 completed, 29 observations, 22 domains), so the CNY 199 Sandbox payment was fully refunded while the V2 HTML remains available as a complimentary report. The order is `refunded/delivered`, all three transactional emails are delivered, and protected staging can issue a one-day operator preview for either `completed` or `completed_limited`. The fixed staging alias runs schema-v20-compatible Web code; production containers, database, aliases, and commerce state were not changed.

The 2026-07-15 answer-first V3 staging run used new report `98caffd1-c8af-4ceb-88ab-063194ea74b7`, paid order `dee37006-7924-4965-8ef3-181d447f27db`, and deep job `7607a664-05c6-4b47-800e-03d420894aea`. Live recovery proved the commercial failure/refund/email/non-activation path and private artifact readiness, but all three cards were `insufficient`; this is a failed V3 product acceptance, not a deliverable answer report. Read-only staging evidence later showed that Q1 had 90 search observations and nine safely retrieved pages, including direct company-owned service text that the old subject/qualification boundary discarded; Q2/Q3 had 12 and 15 observations but no successful selected retrievals. The refunded job/order/artifact remain immutable and cannot be refreshed or reopened.

The paid-acceptance remediation is deployed as protected Preview `dpl_56sV5LHa7Gb9W95VEVCCbvUtAeuj` at `https://open-geo-console-63n3rf4hc-itheheda-6857s-projects.vercel.app`; the fixed staging alias and staging-only free/deep Workers match source revision `fa4cdb28dbc9f877a7ac2c124b66d5cc122e46c7`. Schema is v22. The latest full deterministic suite (1,049 passed, 41 skipped), lint, build and staging `db:audit` pass. Commit `7df74bc` corrected the public-search probe to use the Workers' merged staging runtime env, and all three real MiMo probe cases pass. The next read-only provider gate stopped with `airwallex_authentication_invalid_configuration` because available local/pulled staging sources contain empty Airwallex placeholders; no checkout, payment, report activation, delivery or browser acceptance was attempted. No new commercial or report IDs exist. Production, failed order `d738b38f-63cb-4886-bdda-c8f745bf5b81`, and every prior report remain untouched.

## Remaining Work / Blockers

- Provide an isolated `OGC_TEST_DATABASE_ADMIN_URL`. Deterministic verification and the live staging `db:audit` pass, but the full staging-security runner still does not exit reliably after its PostgreSQL cases.
- Restore an authorized protected-staging Airwallex credential source for the read-only provider probe, then rerun Airwallex, Resend, deployment-alignment and commerce gates. Create a new Airwallex Sandbox order only if every gate passes. The prior failed/refunded orders and non-active artifacts must remain immutable.
- Complete a fully answered Chinese V3 and one new English report. There is no legal free refresh lineage for the non-active refunded V3 artifact: existing staging refresh supports only an active V1/V2 source revision, and submitted/completed refunds cannot be reopened.
- Restore the ChatGPT Chrome control plugin before browser acceptance. The 2026-07-15 runtime could not initialize its local browser-control session, so no desktop/mobile/report/404 evidence was claimed for the new Preview and no headless browser was substituted for payment.
- Complete live protected-staging fault injections for crawl, model, V2 runtime, artifact readiness, and terminalization; prove checkpoint resume without duplicate evidence, billing, refunds, or email.
- Keep production paid admission disabled until staging acceptance, invariant audit, deployment review, and explicit operator authorization are complete.

## Verification

```powershell
npm test
npm run lint
npm run build
npm run db:audit
npm run test:postgres:staging-security
npm exec vitest run -- apps/web/src/worker/provider-discovery-production.test.ts
npx vitest run apps/web/src/report/visibility.test.ts
rg -n "report\.pdf|recommendation-report\.pdf|legacy-report\.pdf|Print / PDF|打印 / PDF|same-source PDF|同源 PDF" apps/web/src
rg -n "exportCanonicalArtifactHtmlPdf|pdfSha256|pdfStorageKey|pageCount" apps/web/src/report apps/web/src/worker apps/web/src/db
codegraph status
```

Expected: deterministic checks pass; customer surfaces/routes contain no PDF delivery; internal export/readiness/storage references remain; CodeGraph reports an up-to-date index.
