# Combined GEO Report, Business Questions, and One-Time Correction Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in one lead-owned thread. Do not use subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one real protected-staging `combined_geo_report_v1` HTML report and same-HTML PDF for existing paid order `5f999610-17d5-4df9-9aa0-a6cce5e5b741` through its single non-billable correction.

**Architecture:** Keep the commercial SKU `recommendation_forensics_v1`, add a distinct combined artifact contract and active-revision pointer, bind exactly three confirmed private questions to each paid order, and persist only identity-neutral variants in shared public-search storage. The existing Worker remains PostgreSQL-authoritative and activates a correction artifact only after technical, public-source, private-evidence, HTML, and PDF readiness all pass.

**Tech Stack:** TypeScript, Node.js 24, Next.js 16, React, PostgreSQL/Drizzle, Undici, Vitest, Docker Compose, Vercel Preview, Playwright CLI, Airwallex Sandbox, Resend.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-07-14-combined-geo-report-business-question-correction-design.md` at `72242e4`.
- Do not change production configuration, database, Workers, aliases, or domains.
- Do not create another paid order; the fixed existing order is the acceptance vehicle.
- Keep payment/Webhook SKU `recommendation_forensics_v1`; use artifact contract `combined_geo_report_v1`.
- HTML is canonical. PDF is derived from the same component, payload revision, and print CSS.
- Exactly three fixed-purpose questions are editable but cannot be added, removed, or reordered.
- Private questions may contain customer identity; shared search/snapshot/evidence rows may contain only validated neutral variants.
- The only user pause is after real replacement candidates and their neutral variants are displayed for confirmation.
- Correction must create no charge, credit reservation, settlement, refund, or normal report-ready email.
- Failed correction leaves the previous active artifact unchanged.

---

### Task 1: Prove and enforce bounded safe-fetch cancellation

**Files:**
- Modify: `packages/site-crawler/src/security.ts`
- Modify: `packages/site-crawler/src/security.test.ts`
- Modify: `apps/web/src/server/safe-fetch.ts`
- Modify: `apps/web/src/server/safe-fetch.test.ts`
- Modify: `apps/web/src/worker/public-source-retriever.ts`
- Modify: `apps/web/src/worker/public-source-retriever.test.ts`
- Modify: `apps/web/src/worker/bounded-scheduler.ts`
- Modify: `apps/web/src/worker/bounded-scheduler.test.ts`

**Interfaces:**
- `HostnameResolver(hostname, signal?)`
- `UrlSafetyOptions.signal?: AbortSignal`
- caller/deadline abort retains the exact reason across DNS, robots, redirects, headers, body streaming, and cleanup.

- [x] Add failing tests for pre-abort; abort during DNS, robots, redirect resolution, headers, and body; hanging dispatcher cleanup; and scheduler stop-after-abort.
- [x] Run the focused tests and verify the new cases fail.
- [x] Thread the caller signal through URL safety and DoH resolution; never convert an active caller abort into `UrlSafetyError` or `inaccessible`.
- [x] Destroy an aborted per-request dispatcher immediately, bound cleanup waiting, and preserve the original abort reason even if cleanup fails.
- [x] Ensure the bounded scheduler starts no new source after abort and in-flight work exits within the cleanup bound.
- [x] Run focused safe-fetch/retriever/scheduler/heartbeat tests and commit `fix: enforce bounded public source cancellation`.

### Task 2: Define the fixed three-question contract and neutralization

**Files:**
- Modify: `packages/public-search-observer/src/types.ts`
- Modify: `packages/public-search-observer/src/questions.ts`
- Modify: `packages/public-search-observer/src/validation.ts`
- Add focused contract tests in the same package.

**Interfaces:**
- `BusinessQuestionPurpose = core_service_discovery | customer_region_fit | purchase_delivery_risk`.
- A question set is a length-three tuple with generated/private/neutral text, purpose, edit state, evidence derivation, confidence, confirmation, rule version, and hashes.
- `neutralization_failed` blocks search and shared persistence.

- [x] Add failing tests for rich and low-confidence profiles, non-lexical selection, exactly three purposes, editing, duplicates, bounds, secrets, and neutralization.
- [x] Select service/audience/region using confidence, independent citations, cross-field support, then discovery order; never lexical order.
- [x] Generate exactly one question for each fixed purpose and require explicit low-confidence acknowledgement.
- [x] Remove customer/brand/legal/domain/email/order/report identities while retaining service, audience, region, delivery, and risk meaning.
- [x] Commit the pure contract/generator slice with the checkout binding slice below as `feat: bind three confirmed business questions`.

### Task 3: Add schema v18 and private/shared persistence boundaries

**Files:**
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Create: `apps/web/src/db/schema-v18.postgres.test.ts`
- Create focused persistence modules/tests for question sets, corrections, and artifact revisions.

**Interfaces:**
- Tables: `report_business_question_sets`, `report_business_questions`, `report_corrections`, `combined_geo_reports`, `report_artifact_revisions`.
- `scan_reports.active_artifact_revision_id` and correction-bound `scan_jobs` metadata.
- One correction per order; one active artifact per report; correction jobs have `reason=paid_report_correction` and no credit reservation.

- [x] Write upgrade/bootstrap PostgreSQL failures first.
- [x] Add exact-purpose, ordinal, confirmation, neutralization, order-binding, correction-uniqueness, and active-artifact constraints.
- [x] Add database tests proving private/customer identifiers cannot enter shared snapshot/query/observation/evidence payloads.
- [x] Require the fixed order/report/job to be paid/completed/settled/unrefunded before creating its unique correction.
- [x] Commit `feat: persist combined report revisions and corrections`.

### Task 4: Add pre-payment question API and UI

**Files:**
- Create: `apps/web/src/app/api/reports/[id]/business-questions/route.ts` and tests.
- Modify: `apps/web/src/components/commercial-checkout.tsx` and tests.
- Modify: `apps/web/src/app/api/reports/[id]/checkout/route.ts` and tests.
- Modify: `apps/web/src/db/commercial-orders.ts` and PostgreSQL tests.

- [x] GET returns exactly three profile-derived candidates; POST validates, neutralizes, explicitly confirms, and returns a confirmed question-set identity.
- [x] Render three fixed editable fields with no add/delete/reorder controls and a required low-confidence acknowledgement.
- [x] Require `questionSetId` at checkout and bind the confirmed set in the same transaction that creates the payment order.
- [x] Prove retries and duplicate checkout requests reuse the same immutable question-set identity.
- [x] Complete commit `feat: bind three confirmed business questions`.

### Task 5: Build and validate `CombinedGeoReportV1`

**Files:**
- Create contract/parser/tests under `packages/ai-report-engine/src/`.
- Create `apps/web/src/components/combined-geo-report-artifact.tsx` and tests.
- Create combined report builder/readiness modules and tests under `apps/web/src/public-source-forensics/`.

**Interfaces:**
- `technicalFoundation`: full deep technical/AI reports plus private evidence references.
- `businessQuestionSet`: locked private and neutral questions.
- `publicSourceForensics`: authority, fanouts, snapshot refs, source graph, coverage, freshness, and limitations.
- Every report/order/job/locale/target/cutoff/technical/question/artifact identity must agree.

- [x] Add parser mismatch tests and full-section renderer tests.
- [x] Render all pages, verified findings, URLs, quotes, screenshots, deterministic score, six AI dimensions, page types, three investigations, 90-day roadmap, vendor tasks, methodology, coverage, freshness, and limitations.
- [x] Render canonical HTML once, hash it, export the PDF from that HTML/component/CSS, validate `%PDF-` and substantive page content, and store PDF in private staging artifact storage.
- [x] Persist pending payload before readiness so artifact repair never repeats crawl/search.
- [x] Commit `feat: compose canonical combined GEO reports`.

### Task 6: Route all paid views through the active combined artifact

**Files:**
- Modify artifact scope schema/token/cookie helpers.
- Modify `apps/web/src/report/artifact-model.ts`, visible report loading, HTML/PDF routes, and localized workspace routes.
- Add route/component authorization tests.

- [x] Add scope `combined_geo_report_v1` without changing historical scopes.
- [x] Resolve the report's active artifact revision before selecting payload/access.
- [x] Make `/report.html`, `/technical`, `/analysis`, `/issues`, and `report.pdf` consume that same combined payload and revision.
- [x] For combined access, prohibit homepage/free projection and legacy deep fallback.
- [x] Return application-level `404` for anonymous, expired, wrong-report, and wrong-contract requests.
- [x] Commit `fix: route paid report views through active combined artifact`.

### Task 7: Implement the one-time non-billable correction Worker flow

**Files:**
- Add staging-only prepare/confirm CLI scripts and package scripts.
- Modify Worker processor/checkpoint/terminalization and commerce/email modules with focused tests.

- [x] `staging:correction:prepare` verifies staging identity and idempotently generates candidates for the fixed order.
- [x] Pause only after showing candidate/private/neutral text, evidence dimensions, and confidence.
- [x] `staging:correction:confirm` locks the user-confirmed set and creates the unique correction job without credit.
- [x] Reuse technical data only after target, locale, content identity, completeness, evidence, and retention checks; otherwise recrawl paid scope.
- [x] Reuse public evidence only for exact neutral identity/surface/fanout/cutoff; otherwise rerun search and retrieval.
- [x] Atomically activate the ready combined revision; failure retains the prior active artifact.
- [x] Queue exactly one `corrected_report_ready` email after activation and never alter payment/credit/refund state.
- [x] Commit `feat: add one-time non-billable report correction`.

### Task 8: Review and verify the implementation revision

- [x] Run all focused unit and PostgreSQL suites.
- [x] Run `npm test`, `npm run lint`, `npm run build`, `npm run db:audit`, `npm run test:postgres:staging-security`, and `git diff --check`.
- [x] Sync CodeGraph after each major slice and inspect impact plus real files.
- [x] Review the full diff for secrets, privacy leaks, production changes, and unintended historical-contract changes.
- [x] Commit the final reviewed code revision with a clean worktree.

### Task 9: Deploy only protected staging from the reviewed revision

- [x] Record existing production container IDs and staging deployment state.
- [x] Build one revision-labeled Worker image and force-recreate only `staging-worker-free` and `staging-worker-deep`.
- [x] Verify image ID, OCI revision, staging profile, ready log, `worker_presence`, heartbeat, and lease behavior for both lanes.
- [x] Deploy a Vercel Preview from the same clean revision, repoint the fixed protected staging alias, and retain Vercel Authentication.
- [x] Verify Web and Worker revision compatibility and that production state did not change.

### Task 10: Prepare the real correction and pause once

- [x] Run `staging:correction:prepare` for the fixed order/report/original job.
- [x] Display the three actual candidates and neutral variants with service/audience/region evidence and confidence.
- [x] Wait for user confirmation. Before confirmation, create no correction job, shared search, or active-artifact change.

### Task 11: Complete real staging delivery after confirmation

- [x] Confirm and dispatch the correction, then monitor phases, checkpoint, heartbeat, lease, snapshots, evidence, artifact readiness, and atomic activation.
- [x] Require real public search/retrieval and idempotent persistence for all three questions.
- [x] Deliver canonical HTML, same-HTML PDF, private screenshots, and exactly one corrected completion email.
- [x] Use headed Playwright Chromium to inspect every required section and route; use a fresh cookie-less context to prove application `404` for HTML/PDF/evidence.
- [x] Record snapshot refs, `market_source_evidence`, screenshot coverage, artifact hashes/revision, and provider email delivery.

### Task 12: Audit side effects and perform scoped neat-freak closeout

- [x] Prove the original order remains paid/completed, its credit remains settled, and there are zero new charges, reservations, settlements, refunds, duplicate artifacts/evidence, or duplicate emails.
- [x] Rerun the full verification matrix and staging `db:audit`.
- [x] Update stable project state, tasks, decisions/runbook where required, and a non-secret staging acceptance record; do not add historical narrative to `AGENTS.md`.
- [x] Commit `docs: record combined report correction acceptance`.
- [x] Require a clean final worktree and explicitly record that production was untouched.
- [x] Declare the next paid order releasable only after every gate passes; do not create it.
