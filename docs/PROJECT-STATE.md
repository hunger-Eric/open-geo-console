# Open GEO Console Project State

## Current Goal

Deliver a self-hostable, evidence-bound GEO product whose customer artifact is one secure HTML report. New reports must keep their persisted generation locale throughout model output, deterministic copy, final readiness, and email delivery. HTML-to-PDF remains a private Worker readiness check and storage artifact; it is not a customer format.

## Architecture and Production Boundaries

- `apps/web` admits scans, persists PostgreSQL state, serves authorized HTML/evidence, and coordinates commerce. Workers alone crawl pages, call models, collect public-source evidence, capture screenshots, and materialize artifacts.
- PostgreSQL is the production authority for jobs, reports, immutable question sets, evidence graphs, artifact revisions, credits, orders, refunds, email intent, and access tokens. Cloudflare Queue is notification-only.
- `recommendation_forensics_v1` remains the paid SKU. New paid work uses V2 public-search evidence and activates `combined_geo_report_v1`; frozen V1 contracts remain readable but are not imported into active Worker graphs.
- A verified payment Webhook is the only authority that marks an order paid and creates its entitlement/job. Terminal job and credit outcomes are atomic. Configuration, authority, storage, and exhausted report-language failures enter `repair_wait` without automatic regeneration, refund, or failure email.
- Every report has one immutable generation locale. Route locale changes interface chrome only. Model prompts require that locale, a language failure receives at most one field-scoped corrective model call, and a prospective final gate runs before HTML/internal-PDF readiness. Corrected fields are applied onto the validated draft without rewriting evidence or unrelated fields; residual unapproved Latin fragments in otherwise Chinese corrections are removed deterministically. Source-original evidence stays verbatim and is labeled as such.
- Customers receive only authorized HTML links. There are no customer PDF routes, buttons, print workspace, or PDF email claims. Internal Chromium export, `%PDF-`/page-count checks, private storage keys, hashes, and database fields remain required. Existing payloads, active revisions, and stored PDF bytes are not migrated, rewritten, or deleted.
- Production free limits remain two distinct sites per rolling 24 hours. Forced regeneration and operator commerce controls are protected-staging-only. Production commerce remains intentionally disabled.

## Current Implementation

- Homepage-only free audit, private deep crawl/model analysis, verified citations, screenshot evidence, six AI dimensions, coverage/provenance, roadmap, and bilingual interface are implemented.
- Schema v19 supports V2 public-source snapshots/evidence, phase-ledgered recovery, immutable three-question sets, one non-billable correction per paid order, combined answer checkpoints, and revisioned artifact activation.
- New-report language and terminology enforcement is prospective: newly materialized `geo_v1` combined revisions require the persisted locale and GEO terminology across page analysis, synthesis, combined answers, final prose, and application-owned labels, with at most one corrective model call before the final gate. Their deterministic technical analysis now detects exact duplicate titles and dominant shared title prefixes/suffixes across successful pages, reports those patterns as GEO findings with representative URLs, and compacts affected title cells around the page-specific segment while retaining the full captured title in expandable source evidence. Captured titles, H1 values, URLs, evidence quotes, code, stable technical identifiers, and independently resolved entity names remain source-original exceptions; internal stable `seo` identifiers remain compatible but display as GEO only for `geo_v1`. Existing revisions are neither rewritten nor reinterpreted.
- Customer delivery is HTML-only. The four historical/current artifact renderers expose HTML self-links only; completion emails contain the secure HTML link; former customer `.pdf` handlers and print components are removed.
- The internal PDF path remains wired through `apps/web/src/report/pdf-export.ts`, combined/V2 readiness, private storage, `pdf_sha256`, `pdf_storage_key`, and readiness `pageCount`.

## Staging and Rollout State

Protected staging has an active signed MiMo public-search authority and previously completed the paid V2/correction chain for order `5f999610-17d5-4df9-9aa0-a6cce5e5b741`: three snapshot refs, 22 source-evidence rows, ten screenshots, atomic combined revision activation, settled credit, zero refunds, and delivered transactional email. The preserved acceptance record is `docs/operations/evidence/2026-07-14-combined-report-correction-acceptance.md`; authority/operator status is `docs/operations/public-search-surface-certification.md`.

The locale-safe, HTML-only customer-delivery change is deployed to protected staging. A new Chinese free report for `https://shun-express.com/` (`6c13e91a-f836-4f04-b426-4b45807234b7`) completed through the real MiMo Worker after checkpoint-preserving `repair_wait` recovery: one homepage analysis and website synthesis persisted at 100%, the AI row is `zh`, customer prose contains no legacy SEO term, the customer URL remains HTML-only, and no replacement report was created. Production containers, database, aliases, and commerce state were not changed by this work.

## Remaining Work / Blockers

- Complete the remaining protected-staging acceptance with one new English report and a paid Chinese deep/combined report. Verify source-original labels, HTML-only email/UI, former PDF endpoints returning application `404`, and populated private PDF readiness fields for only those new revisions. The Chinese free-report path is accepted; free V1 reports do not materialize the paid artifact-readiness PDF.
- Complete live protected-staging fault injections for crawl, model, V2 runtime, artifact readiness, and terminalization; prove checkpoint resume without duplicate evidence, billing, refunds, or email.
- Keep production paid admission disabled until staging acceptance, invariant audit, deployment review, and explicit operator authorization are complete.

## Verification

```powershell
npm test
npm run lint
npm run build
npm run db:audit
npx vitest run apps/web/src/report/visibility.test.ts
rg -n "report\.pdf|recommendation-report\.pdf|legacy-report\.pdf|Print / PDF|打印 / PDF|same-source PDF|同源 PDF" apps/web/src
rg -n "exportCanonicalArtifactHtmlPdf|pdfSha256|pdfStorageKey|pageCount" apps/web/src/report apps/web/src/worker apps/web/src/db
codegraph status
```

Expected: deterministic checks pass; customer surfaces/routes contain no PDF delivery; internal export/readiness/storage references remain; CodeGraph reports an up-to-date index.
