# Product Correction and Two-Way Email Implementation Plan

**Designs:**

- `docs/superpowers/specs/2026-07-12-ai-recommendation-forensic-report-design.md`
- `docs/superpowers/specs/2026-07-12-two-way-transactional-email-design.md`

**Objective:** Replace the paid product's top-level legacy website-audit flow with a versioned recommendation-forensic flow, retain the website audit as an appendix, and make every Resend transaction replyable through Cloud Mail.

## Locked rollout boundary

- Protected staging and operator-only paths may exercise incomplete recommendation-forensic work.
- Customer-visible claims and new paid entry points remain disabled until two independent source-bearing adapters pass protected-staging certification.
- `AiWebsiteReportV1` and `GeoAuditReport` remain supported as the website-foundation appendix and for legacy reports; neither is the top-level contract for a new recommendation-forensic report.
- Fixture and mock observations never qualify a commercial job or appear as live provider evidence.
- Production continues to use PostgreSQL as payment, job, artifact, access, email, refund, and completion authority.

## Phase 1: Two-way transactional email

1. Validate `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OGC_REPLY_TO_EMAIL`, and the staging recipient before network I/O.
2. Add Resend `reply_to` while preserving the current idempotency key and localized templates.
3. Redirect only `to` in test/staging; production retains the encrypted order recipient.
4. Require `OGC_REPLY_TO_EMAIL` in commerce readiness and document Cloud Mail/Resend DNS operations without secrets.
5. Prove request bodies, fail-closed behavior, test redirection, and production recipient behavior with unit tests.

Acceptance:

```bash
npm test -- --run apps/web/src/email/resend.test.ts apps/web/src/commerce/readiness.test.ts
```

If real ignored staging credentials exist, retry queued deliveries and verify Resend Webhook delivery plus a human reply to Cloud Mail. Missing credentials are an external acceptance blocker, not a reason to fabricate success.

## Phase 2: Recommendation-forensic runtime foundation

1. Add `RecommendationForensicReportV1` as an independent top-level contract.
2. Add deterministic non-branded purchase-question generation with three to five questions and an explicit low-confidence failure.
3. Add a Provider Registry that exposes certification state separately from adapter existence.
4. Add an Answer Snapshot Orchestrator with per-provider timeout, budget, resumable cell execution, immutable persistence, and sanitized failures.
5. Compose citation intelligence into recommendation signals, entity ambiguity, source categories, Grade A-D evidence, gaps, and non-causal opportunity hypotheses.
6. Add explicit qualified, limited, and failed coverage decisions. Only certified, source-bearing live cells count toward commercial qualification.

Acceptance must prove two deterministic adapters can exercise orchestration without being certified or commercially qualifying. Production runtime must not import testing fixtures.

## Phase 3: Paid job and artifact authority

1. Version the deep-job checkpoint so website evidence and recommendation snapshots resume independently.
2. Persist the new report separately from legacy `ai_reports`; do not overload an `AiWebsiteReportV1` JSON column.
3. Make new-product completion depend on qualified recommendation-forensic coverage. One-provider or otherwise usable partial coverage is `completed_limited + refunded`; unusable coverage is `failed + refunded`.
4. Preserve atomic job-and-credit terminalization.
5. Add a fail-closed product availability/readiness boundary so checkout cannot sell the new claim before two adapters are certified.
6. Keep existing reports readable through their legacy artifact path.

Acceptance includes idempotent resume, duplicate execution, successful/limited/failed coverage, credit settlement/refund invariants, and legacy-report compatibility.

## Phase 4: Two-layer private report

1. Build one versioned artifact model backed by `RecommendationForensicReportV1` plus the website appendix.
2. Render the executive sequence first: verdict, questions, multi-engine matrix, recommended entities, citation chain, evidence grades, blind spots, and three priorities.
3. Render a separate vendor task package with website/entity corrections, Schema/FAQ/page attachments, citeable data/content briefs, opportunity lists, acceptance criteria, and retest questions.
4. Move legacy technical scores, findings, screenshots, and roadmap into the website-foundation appendix.
5. Keep HTML as the canonical private artifact and generate PDF from the same authorized route.
6. Preserve anonymous `404`, report token/cookie access, localization, text alternatives, provenance, limitations, and non-causal language.

Acceptance requires component tests, private access tests, PDF generation, desktop/mobile browser QA, and proof that the first page is no longer GEO-score-led.

## Phase 5: Protected-staging certification

1. Implement and certify one live source-bearing adapter.
2. Implement and certify a second independent live source-bearing adapter.
3. Record provider, product, model, region, locale, collection surface, timestamp, source metadata, cost, and sanitized failures.
4. Run one paid protected-staging report with three to five questions across both adapters.
5. Verify immutable snapshots, source retrieval, grades, ambiguity/Unknown states, both report layers, private HTML/PDF, and anonymous denial.
6. Force one-provider and total-provider failures and prove the limited/refund and failed/refund outcomes.
7. Only after this acceptance may the new paid entry point and recommendation-forensic product claims be enabled.

## Cross-phase verification

After each phase, sync CodeGraph if source changed and inspect affected callers. Before final handoff run:

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
git diff --check
```

Update `docs/PROJECT-STATE.md`, `docs/TASKS.md`, and architectural decisions only with stable facts established by completed code and tests. Preserve all pre-existing uncommitted user edits and do not push without explicit approval.
