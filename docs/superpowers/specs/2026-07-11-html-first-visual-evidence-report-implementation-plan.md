# HTML-First Visual Evidence Report Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-11-html-first-visual-evidence-report-design.md`

**Objective:** Capture private visual evidence inside the deep Worker job, persist only metadata in PostgreSQL, keep bytes behind a private storage adapter, render `report.html` as the canonical paid artifact, and export `report.pdf` from the same HTML composition without changing payment or entitlement authority.

## Guardrails

- Only deep jobs create screenshot evidence. Public/free reports never expose private visual assets.
- Verified textual citations remain authoritative. Screenshot or crop failure is non-fatal and renders `screenshot unavailable` beside the verified quote and URL.
- PostgreSQL stores evidence metadata only; screenshot and PDF bytes never enter `ai_reports.payload`, `scan_reports.payload`, or crawl JSON.
- Filesystem storage is development-only. Staging and production must select the S3-compatible adapter and fail closed if its private-bucket configuration is incomplete.
- Asset routes authorize with the existing report-specific access cookie/token boundary and return `no-store`; no stable public object URL is returned to the browser.
- `report.html` and `report.pdf` use one server-rendered report model and one artifact component. PDF-specific behavior is CSS/media emulation only.
- Airwallex verification, paid-order transition, entitlement creation, deep-job creation, refunds, and commercial terminalization are not modified.

## Phase 1: Define metadata and storage contracts with tests

### Tests first

Add focused tests for:

- metadata validation and database mapping;
- deterministic private storage keys and traversal rejection;
- filesystem put/get/delete behavior;
- S3-compatible adapter selection and incomplete-production configuration rejection;
- binary payload exclusion from stored report JSON.

### Implementation

Modify:

- `apps/web/src/db/schema.ts`
- `apps/web/src/db/migrations.ts`
- `apps/web/src/db/index.ts`

Add:

- `apps/web/src/db/evidence-assets.ts`
- `apps/web/src/evidence/storage.ts`
- `apps/web/src/evidence/storage-filesystem.ts`
- `apps/web/src/evidence/storage-s3.ts`

The `report_evidence_assets` table will bind each asset to report, job, finding, citation index, source URL, quote, optional page element, captured time, viewport, content/evidence hash, asset hash, storage provider/key, kind (`issue_crop`, `context`, `compact`, `viewport`), status, MIME type, byte size, and sanitized failure code. Foreign-key cascades align metadata with the private report lifecycle. Storage keys are opaque and report-scoped; the adapter owns byte deletion.

Run:

```bash
npm test -- --run apps/web/src/evidence apps/web/src/db/evidence-assets.test.ts apps/web/src/db/index.test.ts
```

## Phase 2: Capture visual evidence inside the deep Worker

### Tests first

Prove:

1. free jobs never invoke visual capture;
2. deep verified findings group captures by source URL;
3. critical findings receive an issue crop plus context thumbnail when quote localization succeeds;
4. warning/opportunity findings receive a compact capture;
5. an unreliable crop falls back to a viewport screenshot;
6. navigation, storage, or screenshot failure persists unavailable metadata and does not discard verified quote/URL evidence;
7. capture metadata uses the crawled page content hash plus a normalized evidence hash;
8. retried/resumed jobs upsert deterministically instead of leaking duplicate assets.

### Implementation

Add `apps/web/src/worker/visual-evidence.ts` and extend `apps/web/src/worker/processor.ts` after verified synthesis and before AI persistence/terminalization.

The capture service will:

- open one isolated Playwright context per source URL with the existing SSRF-safe request interception;
- use a fixed desktop viewport and capture timestamp;
- locate the shortest visible DOM element containing a normalized quote prefix;
- crop with bounded padding when the rectangle is trustworthy;
- otherwise capture the current viewport;
- generate a small context thumbnail for critical findings;
- persist bytes through the selected adapter and metadata through PostgreSQL;
- close browser resources on every path and sanitize operational failures.

Run:

```bash
npm test -- --run apps/web/src/worker/visual-evidence.test.ts apps/web/src/worker
```

## Phase 3: Add protected asset and artifact routes

### Tests first

Add route tests proving:

- unauthenticated evidence asset, HTML artifact, and PDF routes return `403` or `404` without leaking existence;
- a valid report cookie can read only assets belonging to that report;
- responses are `private, no-store`, deny framing, and never redirect to a stable object URL;
- unavailable metadata returns a safe non-binary response;
- free/public report access cannot enumerate deep assets.

### Implementation

Add:

- `apps/web/src/app/api/reports/[id]/evidence/[assetId]/route.ts`
- `apps/web/src/app/api/reports/[id]/artifacts/report.html/route.ts`
- `apps/web/src/app/api/reports/[id]/artifacts/report.pdf/route.ts`

Reuse `requestHasReportAccess` for all three routes. The evidence route streams bytes through the adapter after an exact `(report_id, asset_id)` metadata lookup. Artifact routes load only the authorized deep AI/technical bundle and private evidence metadata.

## Phase 4: Build one canonical HTML artifact composition

### Tests first

Add render tests for:

- cover/summary, technical and AI scores, priority findings, roadmap, appendix, and source list;
- graded evidence cards with quote, URL, issue crop/context or compact screenshot, `capturedAt`, page element, recommendation, and unavailable fallback;
- stable anchors and no client-only dependency for material content;
- free or unauthorized data never entering the artifact model.

### Implementation

Add a server-only artifact model builder and shared component, for example:

- `apps/web/src/report/artifact-model.ts`
- `apps/web/src/components/report-artifact.tsx`

Update `report-view.tsx` so the authorized paid print/report action links to `report.html` and `report.pdf`. The artifact uses the accepted visual baseline: editorial hierarchy, warm neutral surfaces, forest text, teal actions, red/amber severity, Lucide icons, system CJK fonts, and 8px radii. It includes summary, scores, priority findings, visual evidence, 90-day roadmap, technical appendix, and source list.

## Phase 5: Export PDF from the same HTML

### Tests first

Prove:

- PDF generation navigates only to the controlled HTML artifact route with the caller's authorized cookie;
- print media is emulated and interactive controls are hidden;
- export failure is retryable and does not remove HTML availability;
- generated bytes begin with a valid PDF signature and retain material finding/recommendation text.

### Implementation

Add `apps/web/src/report/pdf-export.ts`. The PDF route launches Playwright Chromium, forwards only the current report access cookie to the local controlled HTML route, waits for fonts/images, emulates print media, and calls `page.pdf` with A4 margins, background graphics, headers/footers, and page numbers.

Add print CSS that avoids wide desktop grids, keeps evidence image/caption groups together, prevents orphan headings, moves lower-priority evidence to an appendix when needed, and never hides material findings or recommendations.

## Phase 6: Security and regression verification

Run targeted tests plus:

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```

Also inspect the diff for payment authority: no browser parameter, provider retrieval, artifact route, or asset route may write `payment_orders.payment_status`, create entitlement/credit, or enqueue a deep job. Existing signed-Airwallex Webhook tests must remain green.

## Phase 7: Browser and PDF acceptance

The flow under test is: authorized paid report -> open `report.html` -> inspect visual evidence cards and source details -> open `report.pdf` -> verify the same material content and protected assets.

Use the in-app Browser plugin first. Verify desktop and mobile HTML, page identity, meaningful DOM, console health, no framework overlay, protected image loading, evidence interaction, and explicit unauthorized asset failure. Save the generated PDF outside committed source, render every page to PNG, and inspect pagination, image/text grouping, CJK glyphs, headers/footers, whitespace, and source readability.

If staging credentials and object storage are fully configured, apply schema version 3, deploy protected Preview, repoint the fixed alias, and repeat acceptance against the paid completed staging report. Do not deploy a filesystem-backed evidence configuration to staging/production.

## Phase 8: Neat sync and commit

- Sync CodeGraph after edits and use the current files for final impact checks.
- Update `docs/PROJECT-STATE.md`, `docs/TASKS.md`, and `docs/DECISIONS.md` with stable implementation facts, acceptance evidence, configuration, and remaining operational risks.
- Keep `AGENTS.md` unchanged unless a new hard invariant or operator command must be visible before future code changes.
- Review `git diff`, ensure no secret or generated evidence byte is tracked, then commit the implementation.

## Acceptance Criteria

- Every private deep finding retains verified quote and URL evidence even when screenshot capture fails.
- Critical findings show crop plus context when localization is reliable; lower severity uses compact visual evidence; crop failure falls back safely.
- PostgreSQL contains metadata only, while filesystem/S3-compatible adapters own bytes.
- Private assets and both artifacts reject unauthorized requests and never expose stable public URLs.
- `report.html` is the canonical, polished, complete paid report.
- `report.pdf` is generated from the same HTML composition and preserves material evidence and recommendations without broken pagination.
- Lint, tests, build, database audit, access tests, Browser QA, and rendered PDF QA pass.
- Verified Airwallex Webhook remains the sole paid/entitlement/deep-job authority.
