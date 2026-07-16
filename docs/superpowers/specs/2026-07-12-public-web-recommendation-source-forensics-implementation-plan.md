# Public-Web Recommendation Source Forensics V2 Implementation Plan

Date: 2026-07-12

Design authority: `docs/superpowers/specs/2026-07-12-public-web-recommendation-source-forensics-design.md`

Target branch: `codex/refactor-simulator-log-analyzer`

Starting database authority: schema v9

Target database authority: schema v10

Stable commercial/access scope: `recommendation_forensics_v1`

New report contract: `RecommendationForensicReportV2`

New fulfillment methodology: `public_search_source_forensics_v1`

## Purpose and outcome

Implement the approved product correction from per-order answer-engine observation to a transparent public-web retrieval and source-forensics product. Preserve every historical `RecommendationForensicReportV1`, in-flight V1 job, access token, HTML/PDF route, commercial ledger, and refund invariant. Add V2 as an explicit, separately persisted methodology behind the existing stable commercial and artifact scope.

This plan deliberately does **not** choose, implement, or certify a live public-search vendor. It delivers provider-neutral contracts, deterministic fixtures, PostgreSQL authority, V2 execution and report plumbing, and a certification framework. At the end of this plan:

- historical V1 remains readable without provider credentials; in-flight V1 remains dispatchable only while its existing V1 adapters and credentials are deliberately retained during the audited drain;
- V2 fixture and deterministic integration paths are complete;
- OpenAI and Perplexity are unreachable from new-order and V2 runtime paths;
- the V2 checkout/product-availability gate remains fail-closed because no live search surface is installed;
- a later, separately approved design and implementation plan must select a vendor, implement its adapter, complete terms and evidence review, install staging authority, and run protected-staging acceptance before checkout can open.

## Non-negotiable implementation rules

1. Do not rename V1 answer-engine rows, backfill them into V2 snapshots, or infer V2 from missing V1 fields.
2. Keep `recommendation_forensics_v1` as the stable product contract and artifact/access scope. Report version and fulfillment methodology are separate persisted dimensions.
3. Every paid order and deep job persists its fulfillment methodology at creation. A Worker dispatches from that value only.
4. Existing non-terminal V1 jobs continue as `answer_engine_recommendation_forensics_v1`; they are never silently converted to V2.
5. V2 search observations use new public-search tables and contracts, never `answer_snapshot_*` cells or provider-certification rows.
6. Shared snapshot rows reject customer, report, job, order, email, token, URL, client-IP, and trigger identity at schema and repository boundaries.
7. PostgreSQL uniqueness and compare-and-swap leases are the single-flight authority. In-process locks are only an optimization and cannot determine billing.
8. A refresh inserts a new immutable snapshot. It never updates a completion timestamp to make old evidence appear fresh.
9. V2 formal claims must resolve to stored public-source or submitted-site evidence and pass prohibited-language verification.
10. Reuse the existing atomic job/credit/order terminalization and email/refund state machine. Do not create a parallel commercial state machine.
11. V1 parsing and rendering remain credential-free after adapter retirement.
12. No phase may enable public checkout, operator paid admission, or a live catalog flag. Fixtures cannot satisfy a search-surface authority gate.
13. The old design and implementation plan remain historical records. Do not rewrite them as V2.
14. Use `npm` workspaces. Do not introduce pnpm/yarn.

## Execution protocol for every phase

Each phase is one independently reviewed commit and follows this sequence:

1. Re-read this plan, the approved design, `AGENTS.md`, `docs/PROJECT-STATE.md`, and the current diff.
2. Run `git status --short` and `codegraph status`. If source, configuration, tests, generated code, dependencies, or branch state changed, run `codegraph sync` before graph queries.
3. Write the specified failing tests first and run them to prove the intended failure.
4. Implement only the phase scope. Preserve unrelated and user-owned changes.
5. Run the phase's targeted tests, `npm run lint`, and `git diff --check`.
6. Run `codegraph sync`, then inspect callers/callees or `codegraph affected` for the changed public symbols. Read real files before making any line-level judgment.
7. Hand the diff to an independent reviewer. Resolve every P0/P1/P2 issue or explicitly reject it with repository evidence before proceeding.
8. Stage only phase-owned files and create the exact phase commit shown below. Do not push.

Run `npm run build` whenever a phase changes exports, workspace dependencies, database types, Next.js routes, or React renderers. Run the PostgreSQL staging security command whenever a phase changes schema, repositories, jobs, access, commerce, or availability.

## Cross-phase version and compatibility model

Introduce these explicit values in `apps/web/src/db/schema.ts` and the corresponding contracts:

```ts
type RecommendationFulfillmentMethodology =
  | "answer_engine_recommendation_forensics_v1"
  | "public_search_source_forensics_v1";

type RecommendationReportVersion = 1 | 2;
```

`ReportProductContract` and `ReportArtifactScope` remain:

```ts
"legacy_website_audit_v1" | "recommendation_forensics_v1"
```

Dispatch rules are exact:

| Persisted product contract | Persisted methodology | Worker/report behavior |
|---|---|---|
| `legacy_website_audit_v1` | `null` | Existing legacy website-audit path |
| `recommendation_forensics_v1` | `answer_engine_recommendation_forensics_v1` | Historical/in-flight V1 path |
| `recommendation_forensics_v1` | `public_search_source_forensics_v1` | New V2 path |
| Any other pairing or missing methodology for a newly created recommendation job | invalid | Fail closed before work or payment admission |

The schema-v10 migration may assign `answer_engine_recommendation_forensics_v1` only to existing V1 recommendation orders/jobs using an auditable migration rule. New recommendation orders must always write an explicit methodology. Do not derive methodology at Worker runtime from feature flags or from which report table happens to contain a row.

## Phase 0 — Persist methodology, migrate v9 to v10, and protect in-flight V1

**Depends on:** none. This phase blocks all later implementation.

### Files and symbols

- Modify `apps/web/src/db/schema.ts`:
  - add `RecommendationFulfillmentMethodology`;
  - add `fulfillmentMethodology` to `scanJobs` and `paymentOrders`;
  - add check constraints coupling recommendation product code/contract to an allowed non-null methodology and legacy rows to `null`;
  - extend `ScanJobRow` and order row types without changing `ReportProductContract` or `ReportArtifactScope`;
  - define the complete additive V2 authority tables now, even though their repositories arrive in Phase 2: `public_search_surface_authorities`, `market_snapshot_questions`, `market_snapshot_queries`, `market_search_attempts`, `market_search_observations`, `market_source_evidence`, `market_snapshot_leases`, `report_market_snapshot_refs`, and `report_source_forensics`.
  - keep Phase 0 JSONB columns typed as `unknown` at the schema edge because the V2 TypeScript contract is intentionally introduced in Phase 4; only the Phase 4 parser may turn that persisted value into `RecommendationForensicReportV2`.
- Modify `apps/web/src/db/migrations.ts`:
  - add every v10 column, V2 table, foreign key, uniqueness/privacy check, and index in one advisory-locked migration before advancing the version marker;
  - backfill existing `recommendation_forensics_v1` rows to `answer_engine_recommendation_forensics_v1`, add methodology constraints/indexes after backfill, and leave historical V1 tables untouched;
  - ensure migration ordering is identical for v9 upgrade and empty bootstrap.
- Modify `apps/web/src/db/index.ts` and `apps/web/src/db/index.test.ts`:
  - set `DATABASE_SCHEMA_VERSION = 10`;
  - retain fail-closed behavior for database versions newer than the binary.
- Modify `apps/web/src/db/commercial-orders.ts`:
  - update `CreatePaymentOrderInput`, insert/select row mappings, `matchesImmutableOrder()`, and idempotency-conflict tests so methodology is immutable, server-selected, and never request-controlled;
  - extend `productContractForCode()` or add `fulfillmentMethodologyForProductAdmission()` so checkout creation persists the selected methodology once;
  - payment/Webhook job creation copies the immutable order methodology into the job.
- Modify `apps/web/src/commerce/config.ts`, catalog projection, `apps/web/src/recommendation-forensics/product-availability.ts`, and `apps/web/src/app/api/reports/[id]/checkout/route.ts` immediately:
  - hard-close all new recommendation catalog and checkout admission before any methodology migration is deployed;
  - do not allow the existing dual-provider authority, environment variables, request input, or operator path to create another V1 order;
  - keep already-paid V1 orders and jobs drainable through the existing Worker path.
- Modify `apps/web/src/db/jobs.ts` and `apps/web/src/db/memory.ts` so all recommendation job creation APIs require and preserve explicit methodology.
- Modify `apps/web/src/worker/processor.ts`:
  - add one explicit methodology dispatcher;
  - retain current `finalizeRecommendationJob()` as the V1 target;
  - reject an unknown/missing recommendation methodology;
  - fix the resume lookup to call `getAiReport(job.reportId, "deep", job.productContract)` rather than the legacy default.
- Add `apps/web/src/db/schema-v10.postgres.test.ts`.
- Modify `apps/web/src/worker/processor-contract.test.ts`, `apps/web/src/db/product-contract.test.ts`, and affected order/job tests.

### Failing tests first

1. A v9 database upgrades to v10 and assigns the V1 methodology to every existing recommendation order/job.
2. A fresh empty database reaches the same columns, constraints, indexes, and version marker as the upgraded database.
3. Existing non-terminal V1 jobs dispatch to V1 after migration.
4. A V2 job dispatches only to a placeholder V2 branch and cannot call V1 finalization.
5. A recommendation job with missing or unknown methodology is rejected.
6. Payment success copies the order methodology exactly; later environment changes do not change it.
7. V1 resume reads the product-scoped deep foundation and does not fall back to the legacy report.
8. The v10 marker is not written when any V2 table, constraint, or index creation fails; a retry converges safely.
9. Recommendation checkout/catalog remains closed even when the old dual-provider authority and credentials are valid; no new V1 order can be created after Phase 0.

Use a disposable, independently named PostgreSQL database for fresh bootstrap. Never drop or reset the shared staging database. The test must compare normalized `information_schema`/`pg_indexes` results, not only `DATABASE_SCHEMA_VERSION`.

### Implementation and acceptance

- Add an operator audit query/script that lists all non-terminal recommendation orders and jobs with IDs, states, and persisted methodology, without printing email or tokens. Put it in `apps/web/src/scripts/audit-recommendation-methodologies.ts` and expose `npm run recommendation:methodology:audit` in both `apps/web/package.json` and root `package.json`.
- The audit command is read-only and must fail when a recommendation row lacks methodology or an order/job pair disagrees.
- Record a drain decision for every non-terminal V1 row: continue with retained V1 credentials or terminalize/refund through the existing state machine. Do not remove V1 adapters or credentials until the audit returns zero non-terminal V1 rows.
- Run targeted unit tests plus the new PostgreSQL migration suite against disposable databases.
- Run `npm run build` and `npm run test:postgres:staging-security`.

**Commit:** `feat: persist recommendation fulfillment methodology`

**Rollback/compatibility boundary:** schema v10 is additive and older binaries intentionally fail closed. Rolling back code requires restoring a v10-aware binary; do not downgrade the database or delete methodology values.

## Phase 1 — Add the public-search observer workspace and deterministic fixtures

**Depends on:** Phase 0.

### Files and symbols

- Add workspace `packages/public-search-observer/` with `package.json`, `tsconfig.json`, and:
  - `src/types.ts`: `PublicSearchSurface`, `PublicSearchSurfaceAdapter`, `PublicSearchSurfaceAuthority`, `CanonicalBuyerQuestion`, `CanonicalBuyerQuestionSet`, `SearchQueryVariant`, `SearchQueryFanout`, `MarketSnapshotIdentity`, `MarketSearchObservation`, `SearchExecutionBudget`, `SearchAttemptUsage`, and explicit terminal/error statuses;
  - `src/validation.ts`: bounded string/metadata/usage validation and customer-identity exclusion;
  - `src/identity.ts`: exact deterministic hash over normalized question, locale, region, surface identity/version, and fanout version;
  - `src/questions.ts`: versioned deterministic three-question default, evidence-gated four/five-question expansion, brand/private-identity rejection, and low-confidence broadening;
  - `src/fanout.ts`: deterministic derivation rules, maximum six queries per question, fixed depth/budget, and separate fanout version;
  - `src/registry.ts`: authority-bound adapter registration with no built-in live adapter;
  - `src/orchestrator.ts`: bounded calls, abort propagation, sanitized attempts, and no model/recommendation terminology;
  - `src/coverage.ts`: surface-neutral input facts only; no commercial settlement calls;
  - `src/prohibited-claims.ts`: bilingual prohibited-claim detection with explicit methodology/limitation negation context;
  - `src/fixtures/logistics.ts`: deterministic Shenzhen-to-Taiwan fixture with three questions, six variants each, duplicate domains, syndicated pages, inaccessible source, ambiguous entity, contradiction, and customer absence;
  - `src/index.ts` and colocated tests.
- Modify root workspace/package references only as required by npm workspaces and TypeScript project resolution.
- Do not import `AnswerSnapshotCell`, `AnswerEngineRegistry`, provider certification types, or live adapters.

### Failing tests first

1. Same normalized inputs produce byte-stable question IDs, fanout, and cache identity.
2. Locale, region, surface ID, surface version, or fanout version changes the identity.
3. Similar/fuzzy questions do not match.
4. Default output is exactly three questions; four/five requires explicit sufficient site evidence.
5. Customer name, customer domain, competitors, email, order ID, and private input are excluded from shared questions and fanout.
6. A question emits at most six queries and each query records its derivation rule.
7. Adapter result order is named only `surfaceResultOrder`; no export maps it to AI rank/probability.
8. Timeout, partial, rate-limited, unavailable, malformed, and abort states retain bounded sanitized usage.
9. Chinese and English prohibited phrases are rejected, while methodology text such as “本报告不能声称豆包推荐” is allowed.
10. A fixture adapter cannot be registered when `NODE_ENV=production` or a protected deployment profile is active.

### Acceptance

- Run `npm test --workspace packages/public-search-observer`, package build/type checks, root lint, root build, and secret/prohibited-term searches.
- CodeGraph impact must confirm no active Web/checkout/Worker path imports the fixture registry.

**Commit:** `feat: add public search observer contracts`

**Rollback/compatibility boundary:** additive workspace only; V1 imports and runtime are unchanged.

## Phase 2 — Implement snapshot authority, immutable repositories, leases, and cost ledger

**Depends on:** Phases 0–1.

### Files and symbols

- Use the complete schema-v10 tables created in Phase 0. Do not add post-marker DDL under the same schema version. If an implementation review discovers that a required table, constraint, or index is missing, amend Phase 0 before any shared/staging database is migrated; after migration, the correction requires a reviewed schema v11 plan rather than silently changing v10.
- Treat the Phase 0 table semantics as follows:
  - `market_search_attempts` stores request status, idempotency reference, sanitized usage, configured/provider cost, and uncertainty;
  - `market_search_observations` stores immutable ordered result metadata and hashes;
  - `market_source_evidence` stores retrieval status, canonical URL, registrable domain, excerpts/hashes, categories, entities, claims, contradictions, and evidence-family identity;
  - `market_snapshot_leases` stores owner, heartbeat, expiry, attempt number, and terminal snapshot reference;
  - `report_market_snapshot_refs` stores the private report/job binding, evidence cutoff, freshness state, actual/allocated cost, and avoided cost;
  - `report_source_forensics` stores the private V2 payload and provenance hashes.
- Add `apps/web/src/db/public-search-authority.ts`:
  - `installPublicSearchSurfaceAuthority()`;
  - `getActivePublicSearchSurfaceAuthority()`;
  - exact environment/surface/version/locale/region matching.
- Add `apps/web/src/db/market-snapshots.ts`:
  - exact fresh/stale lookup;
  - `acquireMarketSnapshotLease()`, `heartbeatMarketSnapshotLease()`, `completeMarketSnapshotLease()`, `releaseFailedMarketSnapshotLease()` using CAS;
  - `waitForMarketSnapshot()` for non-owners using database time, bounded exponential backoff, a caller deadline, terminal-result polling, and retryable takeover only after observed expiry;
  - append-only attempt, observation, source-evidence, and cost writes;
  - immutable refresh versions;
  - atomic private snapshot-reference binding primitives for later use by the Phase 5 terminal transaction.
- Extend `apps/web/src/db/memory.ts` with a behaviorally equivalent deterministic repository for unit tests; keep it unreachable as production authority.
- Add `apps/web/src/db/market-snapshots.test.ts`, `market-snapshots.postgres.test.ts`, and `public-search-authority.test.ts`.
- Modify `apps/web/package.json` so `test:postgres:staging-security` explicitly includes every new V2 PostgreSQL suite. Root script continues delegating to it.

### Required schema constraints

- Deterministic cache identity plus immutable completion version is unique.
- Query/attempt/observation/source rows reference a snapshot and cannot be reassigned.
- A terminal snapshot cannot exist without a recorded attempt ledger and authority version.
- Lease acquisition/expiry uses database time and compare-and-swap.
- Shared tables contain no columns named or semantically equivalent to report, job, order, customer, email, access token, client IP, submitted URL, or trigger identity.
- Prefer strongly typed scalar columns over arbitrary JSONB. Where bounded metadata/usage JSONB is unavoidable, enforce a recursive key allowlist and scalar size/depth limits in both repository validation and a PostgreSQL check function/constraint. Direct SQL inserting nested prohibited keys such as `reportId`, `customer.email`, `submittedUrl`, or token/IP aliases must fail.
- Private `report_market_snapshot_refs` is the only report-to-shared join.
- Private V2 report row enforces version `2`, methodology `public_search_source_forensics_v1`, product contract `recommendation_forensics_v1`, report/job consistency, and content/provenance hashes.
- Excerpt expiry may clear retained text only through a separately tested retention function; durable hashes and observation metadata remain.

### Failing tests first

1. First report creates three snapshots; an equivalent second report creates zero new attempts.
2. Locale/region/surface/version/fanout changes do not reuse a snapshot.
3. Two concurrent PostgreSQL transactions racing on one identity produce one lease owner and one externally chargeable attempt.
4. Expired lease takeover preserves all previous attempt/cost rows and records uncertain prior cost.
5. A refresh creates a new snapshot row and leaves old completion time/evidence unchanged.
6. Private snapshot-reference binding writes all refs, evidence cutoff, and freshness/cost attribution or writes none; the Phase 5 commercial terminal transaction must compose this primitive with V2 report and job/order writes.
7. Authority/deployment mismatch and inactive authority fail closed.
8. Shared rows and serialized shared artifacts contain none of the prohibited identities.
9. Two reports share snapshot IDs while customer-specific private rows remain distinct and non-enumerable.
10. V1 authority/report rows remain readable and hash-valid after v10 migration.
11. Lease claim commits before any external call; no database transaction remains open across network I/O. A losing claimant waits with a bounded deadline, observes completion, or takes over only after CAS-confirmed expiry.
12. Direct SQL cannot bypass recursive shared-metadata privacy constraints.

### Acceptance

- Run all new unit and PostgreSQL race tests repeatedly enough to exercise actual concurrency.
- Run `npm run test:postgres:staging-security`, `npm run db:audit`, root build, and schema v9→v10/fresh bootstrap convergence.

**Commit:** `feat: persist public search market snapshots`

**Rollback/compatibility boundary:** all new tables are additive; do not drop V1 tables or constraints. A failed migration must leave the v9 marker unchanged under the advisory lock.

## Phase 3 — Build the public-source evidence graph and surface-neutral citation intelligence

**Depends on:** Phases 1–2.

### Files and symbols

- Add V2-specific, surface-neutral types to `packages/citation-intelligence/src/types.ts` without changing V1 exports:
  - `PublicSourceObservationRef`, `PublicSourceEvidence`, `EvidenceFamily`, `ResolvedPublicEntity`, `VerifiedPublicClaim`, `RetrievalReadinessSignals`, `SourceEligibilitySignals`, and `PublicSourceEvidenceGrade`.
- Add or extend:
  - `packages/citation-intelligence/src/public-source-evidence.ts` for Grade A–D under V2 semantics;
  - `public-source-entities.ts` for deterministic ambiguity and merge rules;
  - `evidence-families.ts` for normalized-content-hash syndication collapse;
  - `domain-independence.ts` for registrable-domain/public-suffix ownership boundaries;
  - `retrieval-readiness.ts` and `source-eligibility.ts` for versioned explainable signals;
  - `public-source-opportunities.ts` for evidence-linked, non-causal hypotheses;
  - `index.ts` exports while retaining V1 behavior.
- Reuse safe mechanics from `apps/web/src/worker/recommendation-forensics.ts`, `apps/web/src/server/safe-fetch.ts`, and `packages/site-crawler`, but add a V2-specific `apps/web/src/worker/public-source-retrieval.ts`. Do not weaken DNS pinning, redirect-origin robots checks, response limits, browser fallback, or extraction bounds.
- Add deterministic fixture and retrieval tests in both packages.

### Failing tests first

1. A verified excerpt directly supporting an entity/capability is Grade A.
2. Clear topic/entity association without precise fact support is Grade B.
3. Repetition across query variants or independently controlled domains is Grade C and never model attribution.
4. Inaccessible, ambiguous, contradictory, or metadata-only evidence is Grade D.
5. Duplicate pages on one registrable domain are not independent corroboration.
6. `example.co.uk` and an unrelated `other.co.uk` are independent; subdomains under one registrable domain are not.
7. Same normalized content hash across domains is one syndicated evidence family.
8. Every entity and formal claim retains source observation IDs and retrieved evidence IDs.
9. Result order is preserved only as raw methodology context and never changes a grade or readiness score by itself.
10. Redirects re-check robots at each origin; unsafe/private destinations and login/paywall/CAPTCHA content remain inaccessible.
11. Customer-owned evidence and independent sources remain separately categorized.

### Acceptance

- Run citation-intelligence and crawler tests, V1 regression fixtures, root lint/build, and SSRF/security tests.
- CodeGraph impact must show V1 `evidence-grades.ts` callers remain intact or are version-dispatched.

**Commit:** `feat: add public source evidence forensics`

**Rollback/compatibility boundary:** V1 citation types/functions remain exported and behaviorally frozen. Do not migrate old grades.

## Phase 4 — Define V2 report contract, builder, cost model, and claim verifier

**Depends on:** Phases 1–3.

### Files and symbols

- Add `packages/ai-report-engine/src/recommendation-forensic-v2.ts` with:
  - `RECOMMENDATION_FORENSIC_REPORT_V2_VERSION = 2`;
  - `PUBLIC_SEARCH_SOURCE_FORENSICS_METHODOLOGY = "public_search_source_forensics_v1"`;
  - `RecommendationForensicReportV2`;
  - `parseRecommendationForensicReportV2()`;
  - typed sections for canonical questions/fanout, authority, snapshot refs/freshness, coverage, source graph, customer comparison, executive verdict, exactly three priorities, vendor tasks, technical appendix, cost/cache accounting, synthesis provenance, limitations, and commercial outcome.
- Add explicit `parseRecommendationForensicReport()` version/methodology dispatch in a new neutral module or `packages/ai-report-engine/src/index.ts`. It must reject missing, inconsistent, or unknown version/methodology.
- Keep `parseRecommendationForensicReportV1()` unchanged.
- Add `packages/ai-report-engine/src/recommendation-forensic-v2-claims.ts` to verify every formal claim's evidence IDs and invoke `public-search-observer` prohibited-language rules.
- Add `apps/web/src/public-source-forensics/report-builder.ts` and tests. It builds from persisted snapshot/evidence/site inputs, never from answer text.
- Add `apps/web/src/db/source-forensic-reports.ts` for V2 save/get with mandatory `parseRecommendationForensicReportV2()` validation, plus `source-forensic-reports.test.ts` and `source-forensic-reports.postgres.test.ts`. This repository is introduced only after the V2 contract exists; it never casts Phase 0's JSONB `unknown` value.
- Add the new PostgreSQL report suite to `apps/web/package.json::test:postgres:staging-security` in this phase.
- Add deterministic cost functions for actual incremental cost, allocated shared cost, avoided cost, price/refund, and contribution margin. Customer payload exposes only safe freshness and whether this run collected a new observation; allocated reuse, another customer's activity, internal cost, and contribution margin remain operator-private.
- Add V2 contract, dispatch, builder, and bilingual claim tests.

### Failing tests first

1. V1 and V2 parse only through their exact version/methodology and cannot be cross-labeled.
2. Historical V1 payload bytes/hash and parser results remain unchanged.
3. V2 requires exact surface/locale/region/window denominators, all snapshot refs, evidence cutoff, and authority provenance.
4. V2 requires executive report, exactly three priorities, a separate vendor task package, and legacy technical appendix.
5. Every formal claim, gap, priority, and vendor task resolves to stored public-source or website finding IDs.
6. Unsupported claims are removed/downgraded or parsing fails; a synthesis model cannot invent an entity or source.
7. Chinese/English phrases implying a named model recommended/ranked/cited/preferred, all-model agreement, causal ranking, or guaranteed outcomes fail validation; limitation text that denies such claims passes.
8. Deterministic template generation succeeds when synthesis is unavailable and qualifying evidence exists.
9. Cost/cache/margin calculations reconcile for a first creator, cache reuse, retries, uncertain prior attempt, refund, storage, PDF, and email costs.
10. A truthful customer-absence result can qualify when all three fresh questions have complete provenance and retrieval was attempted.
11. V2 save/get rejects a payload with the wrong version, methodology, report/job binding, content hash, or authority provenance; V1 rows remain untouched.

### Acceptance

- Run package tests, V1 regression tests, builder tests, prohibited-term scan over active V2 copy, root lint/build, and `git diff --check`.

**Commit:** `feat: define recommendation forensics v2 report`

**Rollback/compatibility boundary:** V2 is additive and cannot overwrite `recommendation_forensic_reports`. V1 parser remains the only parser for V1 rows.

## Phase 5 — Implement V2 Worker orchestration, cache reuse, freshness, and commercial outcomes

**Depends on:** Phases 0–4.

### Files and symbols

- Add `apps/web/src/worker/public-source-forensics.ts` with `runPublicSourceForensicsPipeline()` and explicit dependencies for authority, registry, snapshot repository, source retriever, V2 builder, and clock.
- Modify `apps/web/src/worker/processor.ts`:
  - dispatch `public_search_source_forensics_v1` to the V2 pipeline only;
  - include methodology, question-set version, fanout version, authority, snapshot IDs, website-foundation hash, and evidence cutoff in checkpoint identity;
  - refuse resume across V1/V2, authority, fanout, locale/region, snapshot, or foundation mismatch.
- Add `apps/web/src/public-source-forensics/coverage.ts` with exact commercial decisions:
  - age `<= 7 days` is fresh;
  - age `> 7 days && <= 30 days` must refresh first and can support `completed_limited + refund` only after refresh failure;
  - age `> 30 days` plus refresh failure is `failed + refund`;
  - all three default questions fresh and sufficiently evidenced produce `completed + settle`;
  - exactly two usable questions produce `completed_limited + refund` when the artifact remains honest/actionable;
  - fewer than two, authority/isolation/validation/artifact failure, or cost-cap exhaustion produces `failed + refund`.
- Refactor the SQL transition primitives behind `apps/web/src/db/jobs.ts::terminalizeScanJob()` and `apps/web/src/db/commercial-refunds.ts::recordPaidJobOutcome()` so they can participate in one caller-owned PostgreSQL transaction without nesting or committing early.
- Add `apps/web/src/db/public-source-commerce.ts::terminalizePaidPublicSourceReport()` as the V2 authority that, in one transaction, validates the lease/checkpoint, saves the V2 report and snapshot refs, terminalizes the job and credit, updates the order, creates any refund request, and enqueues the correct email intent. Processor-level reconciliation may retry uncertain provider-side effects, but it may not replace database atomicity or swallow a failed database terminalization.
- Extend cost/budget configuration with daily request/amount caps, per-question result/token limits, one bounded transient retry, and source-fetch caps. Do not add a live credential or vendor.
- Define an `ArtifactReadinessGate` dependency. In Phase 5 deployed V2 wiring supplies a fail-closed implementation, so no V2 `completed`/`completed_limited` terminalization is possible yet; unit tests may inject a deterministic readiness fixture. Phase 6 supplies the real pre-terminal HTML/PDF materialization gate and unlocks only fixture/staging V2 terminal tests, not checkout.
- Add `apps/web/src/worker/public-source-forensics.test.ts`, `public-source-forensics.postgres.test.ts`, and V1/V2 processor/commercial regression tests.

### Failing tests first

1. First fixture order creates three snapshots and three chargeable attempts; second equivalent order creates zero.
2. Two concurrent fixture jobs for one uncached identity cause one lease-owned chargeable attempt.
3. A snapshot exactly seven days old qualifies; one millisecond older must refresh.
4. An 8–30-day snapshot is used only after a recorded refresh failure and yields limited/refunded with historical labeling.
5. A >30-day snapshot plus refresh failure yields failed/refunded.
6. Two of three fresh questions yield limited/refunded; fewer than two yield failed/refunded.
7. Synthesis failure falls back to deterministic templates without refreshing or corrupting evidence.
8. Authority absence/mismatch, daily cap, timeout, rate limit, malformed result, total outage, inaccessible sources, evidence-isolation failure, parser failure, or artifact failure produce the documented fail-closed outcome.
9. Resume never mixes V1 cells, different surfaces/fanout, or customer-specific questions into a shared snapshot.
10. Terminal job, report refs, credit settlement/refund, payment fulfillment state, refund request, and email intent are atomic under race/retry in `terminalizePaidPublicSourceReport()`; a fault injected after each write rolls back every write.
11. Duplicate Webhook/Queue/Worker delivery remains exactly once.
12. Existing in-flight V1 job fixtures still execute V1 and retain current settlement/refund behavior.

### Acceptance

- Include V2 PostgreSQL race/commercial tests in `test:postgres:staging-security` and run it.
- Run `npm run db:audit`, V1/V2 Worker tests, lint, and build.
- Confirm no fixture adapter is constructible in a deployed environment.

**Commit:** `feat: orchestrate public source forensics fulfillment`

**Rollback/compatibility boundary:** new V2 jobs are still not admitted by checkout. Existing V1 jobs remain executable. Do not remove V1 Worker code in this phase.

## Phase 6 — Dispatch V1/V2 artifacts, renderers, HTML/PDF, and evidence authorization

**Depends on:** Phases 4–5.

### Files and symbols

- Modify `apps/web/src/report/artifact-model.ts`:
  - replace the V1-only recommendation artifact with a discriminated `RecommendationPrivateReportArtifactModelV1 | RecommendationPrivateReportArtifactModelV2`;
  - authorize `recommendation_forensics_v1` first, then dispatch from persisted version/methodology;
  - never infer version from missing fields.
- Preserve `apps/web/src/components/recommendation-report-artifact.tsx` as the V1 renderer.
- Add `apps/web/src/components/public-source-forensics-report-artifact.tsx` for V2 executive report, source/evidence views, customer-safe coverage/freshness/new-observation facts, methodology/limitations, separate vendor package, and technical appendix. Never render internal margin, allocated cost, or another customer's reuse.
- Modify only dispatch plumbing in:
  - `apps/web/src/app/reports/[id]/recommendation-report.html/page.tsx`;
  - `apps/web/src/report/scoped-html-artifact.ts`;
  - `apps/web/src/app/api/reports/[id]/artifacts/recommendation-report.pdf/route.ts`;
  - `apps/web/src/report/pdf-artifact-route.ts` and `pdf-export.ts` if needed.
- Continue generating PDF from the same authorized HTML composition.
- Add a distinct V2 source-evidence resolver and opaque ID namespace behind the authorized report route. Do not overload V1 screenshot asset IDs. A V2 asset is readable only when the requesting report has a private `report_market_snapshot_refs` chain to that source; a shared source ID alone must never authorize or enumerate access.
- Add a real pre-terminal artifact readiness path: parse the built V2 model in memory, render the exact SSR composition, materialize the PDF from that same HTML through the existing browser exporter, and write both as job-scoped pending objects in private artifact storage. Verify integrity/readback before calling `terminalizePaidPublicSourceReport()`; that transaction atomically activates the pending artifact metadata with the report and commercial rows. Failed database terminalization leaves unreferenced pending objects for bounded cleanup, never customer-visible artifacts. HTML/PDF materialization failure prevents commercial terminalization. Customer routes serve only activated, verified artifacts rather than first discovering PDF failure after settlement.
- Keep cookie names, access tokens, product scope, HTML route, PDF route, and V1 link destinations stable.
- Add SSR renderer tests, authorization tests, print tests, and mobile overflow tests.

### Failing tests first

1. A historical V1 token renders original V1 provider provenance and copy.
2. A V2 token under the same stable scope renders V2 methodology and no named-model claims.
3. Parser/renderer dispatch rejects unknown or mismatched version/methodology.
4. V1 and V2 tokens cannot cross report IDs; legacy-audit tokens cannot access recommendation artifacts.
5. V2 evidence access requires report→snapshot→source binding; guessing a shared source/asset ID returns private `404`.
6. Anonymous HTML/PDF/evidence reads return private `404`.
7. HTML and PDF use the same V2 composition and persisted locale.
8. Chinese and English V2 artifacts show exact surface, locale, region, snapshot ages, denominators, limitations, limited/refund state, three priorities, and vendor tasks.
9. Narrow mobile output has no document-level horizontal overflow; wide evidence tables scroll locally.
10. V1 snapshots/rendered fixtures remain unchanged.
11. Injected SSR, PDF export, private storage, or authorized-read failure prevents V2 settlement/refund delivery terminalization and leaves a retryable or refundable system outcome according to the Phase 5 matrix.

### Acceptance

- Run TSX SSR tests, HTML/PDF route tests, access/security tests, root build, and browser/static layout checks at 341×740 plus a desktop viewport.
- Run `npm run test:postgres:staging-security` for token and evidence joins.

**Commit:** `feat: render public source forensics artifacts`

**Rollback/compatibility boundary:** route and scope compatibility is permanent. Rollback must preserve the V2 parser/dispatch needed to read any V2 rows already created in tests or staging.

## Phase 7 — Retire V1 providers from active admission and keep V2 fail-closed

**Depends on:** Phases 0–6 and a methodology audit returning zero non-terminal V1 recommendation orders/jobs. If any remain, stop this phase and retain the V1 adapters and credentials until they complete or are atomically refunded.

### Files and symbols

- Replace the Phase 0 hard-closed readiness implementation in `apps/web/src/recommendation-forensics/product-availability.ts` with a V2 authority/readiness gate that requires an exact, active, environment-matched public-search surface authority and a non-fixture registry; because the registry is empty in this plan, the result remains closed.
- Modify `apps/web/src/app/api/reports/[id]/checkout/route.ts`, catalog/config code, and tests so new recommendation orders select V2 methodology only after availability succeeds.
- Until a live vendor is separately implemented/certified, `assertRecommendationProductAvailable()` must always reject recommendation checkout in staging and production. No environment-only override, admin bypass, request flag, or fixture authority may open it.
- Remove active imports and configuration requirements for:
  - `apps/web/src/recommendation-forensics/production-runtime.ts::createProductionAnswerEngineRegistry()` and `createProductionRecommendationDependencies()`;
  - `adapters/openai-web-search.ts`;
  - `adapters/perplexity-sonar.ts`;
  - V1 two-provider availability/certification from checkout and V2 Worker graphs.
- Remove active scripts from root and `apps/web/package.json`:
  - `recommendation:certify`;
  - `recommendation:authority:install`.
- Remove `OGC_ANSWER_OPENAI_*`, `OGC_ANSWER_PERPLEXITY_*`, and answer-provider certification readiness variables from `.env.example` and active configuration validation.
- Retire or replace `docs/operations/recommendation-provider-certification.md` with a historical notice and pointer to the V2 framework. Do not delete historical V1 data or make V1 rendering depend on credentials.
- After the zero-non-terminal audit, keep old adapters only as test/history source if V1 audit fixtures require them; deployed runtime no longer needs their keys. Ensure no checkout, catalog, V2 Worker, availability, or production registry imports them.
- Keep OpenAI/Perplexity crawler identities in `packages/crawler-rules` and `packages/log-parser` because they are independent log evidence.
- Add a source-level reachability test that walks active runtime imports or asserts prohibited module imports are absent.

### Failing tests first

1. New-order admission cannot create a V1 methodology order.
2. With no live V2 authority/adapter, public and operator checkout remain unavailable.
3. Fixture authority, one-sided configuration, environment flags, request inputs, and historical V1 authority cannot open V2.
4. Existing terminal V1 reports continue to parse and render without OpenAI/Perplexity keys; no non-terminal V1 row exists when deployed V1 credentials are removed.
5. Active checkout/V2 runtime dependency graphs contain no OpenAI/Perplexity adapter or answer-engine certification imports.
6. Crawler/log detection for OpenAI/Perplexity agents is unchanged.
7. Public/private copy contains no active multi-engine agreement or named-model recommendation promise; historical V1 artifact copy is exempt and version-scoped.

### Acceptance

- Run catalog/checkout/readiness/production-runtime tests, V1 regression tests, `rg` reachability checks, lint, build, PostgreSQL security tests, and methodology audit.
- Confirm recommendation catalog flags and checkout remain closed in local, staging, and production configurations.

**Commit:** `refactor: retire answer providers from active fulfillment`

**Rollback/compatibility boundary:** do not delete V1 tables, reports, parser, renderer, or in-flight execution target. Removal of V1 execution requires a later audited migration after every non-terminal V1 job is terminal.

## Phase 8 — Add search-surface certification framework and deterministic fixtures

**Depends on:** Phases 1–7.

### Scope boundary

This phase builds only the generic certification mechanism and fake deterministic evidence used in tests. It does **not** select a vendor, add a vendor SDK/API endpoint, call the network, create a live artifact, install a live authority, or enable catalog/checkout.

### Files and symbols

- Add `apps/web/src/public-search/certification-artifact.ts` with an immutable signed artifact contract covering:
  - exact surface/provider/product/contract/adapter versions;
  - locale/region capabilities;
  - commercial-use and storage/display review references;
  - result provenance and error semantics;
  - budget/timeout behavior;
  - reviewer identity as a non-customer operator reference;
  - environment, signing key ID/version, payload hash, and HMAC signature.
- Add `apps/web/src/public-search/certification-path.ts` with existing symlink/junction/path-escape defenses adapted for V2 artifacts.
- Add `apps/web/src/scripts/certify-public-search-surface.ts` as a framework command that accepts only an adapter ID from a compile-time `approvedPublicSearchCertificationAdapters` registry. The registry is empty in this plan, so the command exits fail-closed. Never dynamically import a caller-supplied path or module.
- Add `apps/web/src/scripts/install-public-search-authority.ts` that verifies signature, content hash, review completeness, environment, and exact surface capability before calling `installPublicSearchSurfaceAuthority()`.
- Add root/workspace scripts `public-search:certify` and `public-search:authority:install`, but document them as unavailable until the separate vendor plan adds an approved adapter.
- Add deterministic fixture artifacts, tamper tests, path-security tests, and install idempotence tests. Test signing secrets must be obvious fixtures and rejected outside tests.

### Failing tests first

1. Tamper + rehash, wrong signature, wrong key/version, wrong environment, missing review, stale surface version, or capability mismatch is rejected.
2. Signing secret equal to any runtime credential is rejected before marker/network access.
3. Symlink, junction, path traversal, and non-private artifact directory are rejected.
4. Installing the same valid authority is idempotent; conflicting authority is rejected.
5. A deterministic fixture can exercise parser/installer tests but cannot activate protected staging or production.
6. The framework command refuses to call the network or install authority without an explicitly approved adapter and completed external review.
7. V2 availability remains closed after all fixture tests pass.

### Acceptance

- Run certification/path/CLI tests, authority PostgreSQL tests, secret scan, lint, build, and staging security tests.
- Verify that no real vendor name, endpoint, price, credentials, or terms claim was introduced.

**Commit:** `feat: add public search surface certification framework`

**Rollback/compatibility boundary:** framework is inert without a separately implemented adapter and live authority. It cannot be treated as protected-staging certification evidence.

## Phase 9 — Scoped documentation sync and full acceptance

**Depends on:** Phases 0–8, every independent review accepted, and no live-vendor work mixed into the branch.

### Documentation changes

Run a scoped `neat-freak` sync based on the final diff. Preserve user-owned changes and update existing entries rather than appending a chat transcript.

- Update `AGENTS.md`:
  - `packages/public-search-observer` owns V2 search-surface contracts, exact identity, questions/fanout, and prohibited-claim primitives;
  - `answer-engine-observer` is V1 history/calibration only and is not V2 production authority;
  - `citation-intelligence` owns both frozen V1 semantics and versioned V2 public-source evidence semantics;
  - add methodology-audit and relevant Worker/security commands;
  - state that checkout remains closed until separate live-vendor certification.
- Update `docs/PROJECT-STATE.md` with current V2 implementation, schema v10, closed checkout, V1 compatibility, acceptance evidence, and external next step.
- Replace stale V1 Phase 5A tasks in `docs/TASKS.md` with completed V2 implementation tasks and explicit future vendor-selection/certification/staging drills.
- Add a dated decision to `docs/DECISIONS.md`: base paid product is public-web source forensics; stable scope remains; V1 is immutable/history-compatible; no named-model attribution; live search vendor is separate and checkout remains closed.
- Update `README.md`, `.env.example`, and operations docs so active commands/configuration describe V2 without promising a live vendor.
- Keep the approved design and this plan as durable authorities. Preserve old design/plan as superseded history.

### Full automated acceptance

Run from the repository root:

```powershell
codegraph sync
npm run lint
npm test
npm run build
npm run test:postgres:staging-security
npm run db:audit
npm run recommendation:methodology:audit
git diff --check
git status --short --branch
```

Also run the fresh disposable PostgreSQL bootstrap and v9→v10 convergence suite. Record commands, database isolation method, test counts, and results in `docs/PROJECT-STATE.md`; do not record secrets or connection strings.

### Required final regression matrix

The final acceptance reviewer must independently verify all of these:

| Area | Required proof |
|---|---|
| V1 history | Existing V1 payload/hash parses and renders with original provider provenance and no credentials |
| V1 in-flight | Migrated non-terminal V1 dispatches to V1 and terminalizes under existing commercial rules |
| V2 dispatch | Only explicit `public_search_source_forensics_v1` reaches V2 |
| Migration | v9→v10 and empty bootstrap converge; older binaries fail closed on v10 |
| Exact reuse | First fixture order creates three observations; second equivalent order creates zero |
| Concurrency | PostgreSQL race purchases one exact snapshot; expired takeover preserves cost/attempt history |
| Freshness | `<=7d` qualifies; `>7d..<=30d` refresh-failure is limited/refunded; `>30d` refresh-failure is failed/refunded |
| Privacy | Shared schema/rows/artifacts contain no customer/report/job/order/email/token/IP/submitted-URL identity |
| Evidence | Entity, grade, gap, priority, and vendor task resolve to immutable source/site IDs |
| Claims | No active V2/model/catalog copy attributes recommendation, ranking, citation, causation, agreement, or guarantee to named models |
| Commercial | Job/report/ref/refund/credit/order/email terminalization remains atomic and retry-safe |
| Access | V1/V2 same-scope tokens work only for their report; cross-report/scope and anonymous reads return private `404` |
| Artifacts | Bilingual V2 HTML and same-HTML PDF render; mobile has no document overflow |
| Retirement | Active new-order/V2 graphs cannot reach OpenAI/Perplexity adapters; crawler/log identities remain |
| Availability | Fixture authority cannot open catalog/checkout; product is closed in staging and production |

### Final independent review questions

1. Can any newly created order or environment drift change a persisted V1/V2 methodology?
2. Can any V2 row be mistaken for an answer-engine observation or certification?
3. Can a shared snapshot reveal which customer paid for or reused it?
4. Can a timeout/lease takeover cause an unrecorded or double-counted search charge?
5. Can a report claim more than its stored evidence, raw search-surface observation, or window supports?
6. Can any fixture, admin/request flag, historical authority, or single environment variable open checkout?
7. Can V1 be read and rendered after all OpenAI/Perplexity secrets are removed?
8. Are all new PostgreSQL race/cache/privacy tests actually included in `test:postgres:staging-security`?

**Commit:** `docs: sync public source forensics v2 state`

## Checkout-enablement gate — intentionally unmet by this plan

Do not enable recommendation checkout after Phase 9. All of the following require a later approved vendor-specific design and plan and must pass before any catalog or checkout flag changes:

1. Select one documented API, licensed index, or self-hosted index with commercial collection, storage, display, and derived-analysis rights.
2. Implement its real `PublicSearchSurfaceAdapter` with exact surface labeling, locale/region behavior, bounded result depth, abort/timeout, error taxonomy, sanitized usage/cost, and no consumer-interface scraping.
3. Create and manually review a live signed protected-staging certification artifact; install matching PostgreSQL authority.
4. Prove exact environment/config/artifact/database authority agreement and credential isolation.
5. Run the Shenzhen-to-Taiwan example and manually inspect exact queries, result metadata, retrieved sources, evidence graph, entity ambiguity, contradictions, and limitations.
6. Complete paid protected-staging first-order three-new-snapshot and second-order zero-call acceptance.
7. Race two real paid tests and reconcile provider usage to one PostgreSQL chargeable attempt per identity.
8. Drill 7-day, 8–30-day, and >30-day outcomes; timeout, rate limit, malformed response, total outage, cost cap, inaccessible source, synthesis failure, refund, and email failure.
9. Verify real private HTML/PDF, page count, bilingual/mobile layout, scoped evidence, anonymous `404`, transactional email delivery/reply, settlement, and refund.
10. Audit shared database rows/artifacts for identity privacy and run the fresh PostgreSQL bootstrap plus all security suites.
11. Complete a final prohibited-copy and active-import audit.
12. Receive explicit operator approval to open the catalog.

Until all twelve gates pass, the correct final state is: V2 implemented, V1 history supported, no live search vendor certified, recommendation product unavailable, checkout fail-closed.

## Commit sequence

1. `feat: persist recommendation fulfillment methodology`
2. `feat: add public search observer contracts`
3. `feat: persist public search market snapshots`
4. `feat: add public source evidence forensics`
5. `feat: define recommendation forensics v2 report`
6. `feat: orchestrate public source forensics fulfillment`
7. `feat: render public source forensics artifacts`
8. `refactor: retire answer providers from active fulfillment`
9. `feat: add public search surface certification framework`
10. `docs: sync public source forensics v2 state`

Do not squash these phases before independent review. Do not push unless the user separately authorizes it.
