# Adaptive Public-Source Acquisition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an authorized HTML report with a truthful conclusion for each of the three locked questions, while preventing internal collection failures from being represented as public evidence absence.

**Architecture:** Add an append-only acquisition ledger and question checkpoint, then replace one-shot retrieval with a question-isolated adaptive coordinator. Safe HTTP remains the default; a transport-pinned browser is an optional fallback for explicitly classified JavaScript shells. Citation intelligence deterministically selects `verified`, `limited`, `observed`, or `unresolved` before model synthesis, and commercial terminalization remains separate from collection state.

**Tech Stack:** TypeScript, Node.js, npm workspaces, PostgreSQL, Drizzle schema declarations, Vitest, Undici, Playwright, React server rendering, existing Open GEO Console Worker and report contracts.

## Global Constraints

- PostgreSQL remains the only report, job, evidence, acquisition, and commercial authority.
- Workers alone perform public search, crawling, browser rendering, extraction, and model calls.
- Historical jobs, reports, revisions, payments, refunds, and evidence are immutable.
- Search titles and snippets may support only explicitly observational language; they are never verified page facts.
- `collection_failed` may never become `unresolved`, `completed_limited`, or an active artifact.
- Every question receives an independent minimum acquisition budget.
- Browser fallback must respect robots and prove pinned public transport for every permitted request.
- No CAPTCHA, authentication, paywall, robots, SSRF, redirect, size, or private-network bypass is permitted.
- Production paid admission remains disabled until protected-staging acceptance and explicit operator authorization.

## File Map

**Create**

- `packages/site-crawler/src/public-document.ts` — typed public-document stages, outcomes, HTTP result, decoding, and extraction contract.
- `packages/site-crawler/src/public-document.test.ts` — deterministic HTTP, decoding, extraction, and failure classification tests.
- `apps/web/src/db/public-source-acquisition.ts` — append-only retrieval-attempt and question-checkpoint repository.
- `apps/web/src/db/public-source-acquisition.test.ts` — repository validation and identity tests.
- `apps/web/src/db/schema-v25.postgres.test.ts` — migration, constraints, immutability, and environment isolation tests.
- `apps/web/src/worker/question-acquisition-coordinator.ts` — adaptive question-isolated scheduler and resume identity.
- `apps/web/src/worker/question-acquisition-coordinator.test.ts` — replenishment, budget, terminal-state, and recovery tests.
- `apps/web/src/worker/public-source-browser.ts` — allowlisted browser fallback with pinned transport contract.
- `apps/web/src/worker/public-source-browser.test.ts` — browser eligibility and security-boundary tests.

**Modify**

- `packages/site-crawler/src/index.ts` — export the public-document contract.
- `packages/site-crawler/package.json` — add only reviewed decoding/readability dependencies if the implementation cannot use an existing workspace dependency.
- `package-lock.json` — lock any reviewed dependency changes.
- `apps/web/src/db/migrations.ts` — add schema v25 tables, checks, indexes, and append-only triggers.
- `apps/web/src/db/schema.ts` — add Drizzle declarations for v25 tables.
- `apps/web/src/db/index.ts` and `apps/web/src/db/index.test.ts` — advance and verify schema version 25.
- `apps/web/src/server/safe-fetch.ts` and `.test.ts` — expose typed network stages and validated-address failover without weakening pinning.
- `apps/web/src/worker/public-source-retriever.ts` and `.test.ts` — return lossless typed retrieval outcomes.
- `apps/web/src/worker/public-source-plan.ts` and `.test.ts` — produce a complete candidate pool rather than a terminal fixed slice.
- `apps/web/src/worker/public-source-snapshot-resolver.ts` and `.test.ts` — delegate candidate execution to the coordinator and persist attempts separately from evidence.
- `apps/web/src/worker/provider-discovery-production.ts` and `.test.ts` — separate retrieval, relevance, subject, and evidence states.
- `apps/web/src/worker/processor.ts` and focused tests — save/resume acquisition checkpoints and block artifact work on `collection_failed`.
- `packages/citation-intelligence/src/types.ts`, evidence builder files, and tests — add observation evidence and deterministic answer-grade selection.
- `packages/ai-report-engine/src/open-geo-answer-v3.ts` and `.test.ts` — add `observed` and `unresolved` card contracts and language restrictions.
- `apps/web/src/worker/answer-first-v3.ts` and `.test.ts` — consume acquisition terminal states and allowed answer grades.
- `apps/web/src/components/combined-geo-report-v3-artifact.tsx` and `.test.tsx` — render all four customer answer states and acquisition metrics.
- `apps/web/src/db/combined-correction-terminalization.ts` and tests — keep collection failure out of deliverable outcomes and map graded cards to commercial outcomes.
- `apps/web/src/db/combined-replacement-terminalization.ts` and tests — enforce the same boundary for replacement fulfillment.
- `docs/PROJECT-STATE.md`, `docs/TASKS.md`, `docs/DECISIONS.md`, and the protected-staging evidence report — record only verified implementation and acceptance facts.

---

### Task 1: Add typed acquisition contracts and schema v25

**Files:**
- Create: `packages/site-crawler/src/public-document.ts`
- Modify: `packages/site-crawler/src/index.ts`
- Create: `apps/web/src/db/public-source-acquisition.ts`
- Create: `apps/web/src/db/public-source-acquisition.test.ts`
- Modify: `apps/web/src/db/migrations.ts`
- Modify: `apps/web/src/db/schema.ts`
- Modify: `apps/web/src/db/index.ts`
- Modify: `apps/web/src/db/index.test.ts`
- Create: `apps/web/src/db/schema-v25.postgres.test.ts`

**Interfaces:**
- Produces: `PublicDocumentStage`, `PublicDocumentOutcome`, `PublicDocumentAttemptResult`, `QuestionCollectionState`, `appendPublicSourceRetrievalAttempt()`, `saveQuestionAcquisitionCheckpoint()`, and `getQuestionAcquisitionCheckpoint()`.
- Consumes: existing market snapshot, query, observation, report, job, and artifact revision identities.

- [ ] **Step 1: Write failing contract and repository tests**

Add tests that require the following exact public contract:

```ts
export type PublicDocumentStage =
  | "candidate_selected" | "dns_validation" | "robots_evaluation"
  | "http_request" | "http_response_validation" | "document_decoding"
  | "content_extraction" | "question_relevance" | "subject_resolution"
  | "evidence_classification" | "terminal";

export type PublicDocumentOutcome =
  | "available" | "duplicate" | "domain_cap" | "question_budget_exhausted"
  | "unsafe_destination" | "dns_failed" | "connect_timeout" | "tls_failed"
  | "robots_denied" | "robots_unavailable" | "redirect_invalid" | "redirect_limit"
  | "http_403" | "http_404" | "http_429" | "http_5xx" | "challenge_detected"
  | "authentication_required" | "unsupported_content_type" | "response_too_large"
  | "body_empty" | "javascript_shell" | "decoding_failed" | "extraction_failed"
  | "irrelevant_to_question" | "subject_ambiguous" | "contradictory"
  | "evidence_rejected" | "caller_aborted" | "phase_deadline"
  | "worker_deadline" | "internal_failure";

export type QuestionCollectionState =
  | "collecting" | "evidence_target_met" | "exhausted" | "collection_failed";
```

Test that attempt rows are append-only, scoped to one snapshot observation, reject private URLs and unbounded diagnostics, and preserve method/stage/outcome independently from source evidence. Test that checkpoints reject negative budgets, mismatched question identities, and transition from a terminal state back to `collecting`.

- [ ] **Step 2: Run focused tests and verify red state**

Run:

```powershell
npm exec vitest run -- packages/site-crawler/src/public-document.test.ts apps/web/src/db/public-source-acquisition.test.ts apps/web/src/db/schema-v25.postgres.test.ts
```

Expected: TypeScript/module failures because the contracts, repository, and v25 migration do not exist. PostgreSQL cases may skip only when the sanctioned isolated test admin URL is absent; deterministic repository tests must fail.

- [ ] **Step 3: Implement contracts, schema, and repository**

Define a bounded result rather than storing raw errors:

```ts
export interface PublicDocumentAttemptResult {
  method: "http" | "browser";
  stage: PublicDocumentStage;
  outcome: PublicDocumentOutcome;
  canonicalUrl: string;
  finalUrl?: string;
  registrableDomain: string;
  httpStatus?: number;
  robotsOutcome?: "allowed" | "denied" | "missing" | "unavailable";
  contentType?: string;
  contentBytes?: number;
  durationMs: number;
  normalizedText?: string;
  normalizedContentHash?: string;
  retryEligible: boolean;
  browserEligible: boolean;
}
```

Add v25 tables `public_source_retrieval_attempts` and `question_acquisition_checkpoints`. Use checks for enum values, nonnegative budgets, bounded safe detail, HTTP(S) URLs, and terminal timestamps. Add triggers that reject update/delete and reject report/job/question/snapshot identity mismatches. Increment `DATABASE_SCHEMA_VERSION` to 25 and register `{ version: 25, migrations: V25_DATABASE_MIGRATIONS }`.

- [ ] **Step 4: Run focused tests and schema checks**

Run the command from Step 2 and:

```powershell
npm exec vitest run -- apps/web/src/db/index.test.ts apps/web/src/db/staging-security.postgres.test.ts
```

Expected: deterministic tests pass; isolated PostgreSQL tests pass when configured or retain their explicit sanctioned skip.

- [ ] **Step 5: Commit Task 1**

```powershell
git add packages/site-crawler/src/public-document.ts packages/site-crawler/src/public-document.test.ts packages/site-crawler/src/index.ts apps/web/src/db/public-source-acquisition.ts apps/web/src/db/public-source-acquisition.test.ts apps/web/src/db/migrations.ts apps/web/src/db/schema.ts apps/web/src/db/index.ts apps/web/src/db/index.test.ts apps/web/src/db/schema-v25.postgres.test.ts
git commit -m "feat: add public source acquisition ledger"
```

### Task 2: Make HTTP retrieval lossless and diagnostically typed

**Files:**
- Modify: `apps/web/src/server/safe-fetch.ts`
- Modify: `apps/web/src/server/safe-fetch.test.ts`
- Modify: `apps/web/src/worker/public-source-retriever.ts`
- Modify: `apps/web/src/worker/public-source-retriever.test.ts`
- Create: `packages/site-crawler/src/public-document.test.ts`

**Interfaces:**
- Consumes: `PublicDocumentAttemptResult` from Task 1.
- Produces: `executePublicDocumentHttpAttempt(input, options): Promise<PublicDocumentAttemptResult>` and typed safe-fetch errors carrying stage, safe status, and retry eligibility.

- [ ] **Step 1: Add failing tests for the previously collapsed cases**

Create fixtures for DNS failure, first-address connection failure with second-address success, robots 403, robots 404, robots denial, TLS/connect timeout, safe redirect, unsafe redirect, 403, 429, 5xx, oversized body, unsupported content type, empty body, and caller abort.

Assert, for example:

```ts
expect(result).toMatchObject({
  method: "http",
  stage: "robots_evaluation",
  outcome: "robots_unavailable",
  retryEligible: true,
  browserEligible: false
});
```

and verify caller/phase/Worker aborts throw their original reason rather than returning `inaccessible`.

- [ ] **Step 2: Run tests and verify that collapsed `inaccessible` behavior fails them**

```powershell
npm exec vitest run -- apps/web/src/server/safe-fetch.test.ts apps/web/src/worker/public-source-retriever.test.ts packages/site-crawler/src/public-document.test.ts
```

Expected: assertions fail because current code returns `inaccessible/unknown` and pins only the first address.

- [ ] **Step 3: Implement typed safe-fetch and address failover**

Introduce one stable error class:

```ts
export class SafeFetchError extends Error {
  constructor(
    readonly stage: "dns" | "connect" | "redirect" | "response" | "body",
    readonly code: string,
    readonly retryEligible: boolean,
    options: ErrorOptions = {}
  ) { super(code, options); }
}
```

Resolve once per destination, validate every returned address, and try the next validated address only for connection-class failures. Keep per-attempt dispatcher destruction and never fail over after an HTTP response, robots denial, caller abort, or unsafe destination.

Refactor `executePublicSourceRetrieval` into `executePublicDocumentHttpAttempt`; retain a temporary adapter for existing callers until Task 4. Map HTTP and robots states exactly and preserve final URL, type, bytes, and duration.

- [ ] **Step 4: Run focused tests**

Run Step 2. Expected: all focused deterministic tests pass and abort tests retain their exact sentinel reasons.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/web/src/server/safe-fetch.ts apps/web/src/server/safe-fetch.test.ts apps/web/src/worker/public-source-retriever.ts apps/web/src/worker/public-source-retriever.test.ts packages/site-crawler/src/public-document.test.ts
git commit -m "fix: preserve public document retrieval outcomes"
```

### Task 3: Add robust decoding, extraction, and relevance separation

**Files:**
- Modify: `packages/site-crawler/src/public-document.ts`
- Modify: `packages/site-crawler/src/public-document.test.ts`
- Modify: `packages/site-crawler/package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/src/worker/provider-discovery-production.ts`
- Modify: `apps/web/src/worker/provider-discovery-production.test.ts`

**Interfaces:**
- Produces: `decodePublicDocument(bytes, contentType)`, `extractPublicDocumentText(decoded, contentType)`, and a relevance result distinct from retrieval state.
- Consumes: typed HTTP attempt results from Task 2.

- [ ] **Step 1: Add failing extraction tests**

Test UTF-8 HTML, declared GBK HTML, article/main preference, script-only shells, challenge pages, empty readable bodies, and a bounded PDF fixture. Test that a successfully extracted irrelevant page remains `outcome=available` with `relevanceOutcome=irrelevant_to_question`; it must not become inaccessible.

- [ ] **Step 2: Run the extraction tests and confirm failures**

```powershell
npm exec vitest run -- packages/site-crawler/src/public-document.test.ts apps/web/src/worker/provider-discovery-production.test.ts
```

Expected: GBK, structured extraction, PDF, JavaScript-shell, and separate relevance assertions fail.

- [ ] **Step 3: Implement minimal reviewed decoding and extraction**

Use a reviewed, locked decoder/readability dependency only if the platform APIs and existing workspace packages cannot meet deterministic fixtures. Return:

```ts
export interface ExtractedPublicDocument {
  outcome: "extracted" | "javascript_shell" | "challenge_detected" | "body_empty" | "extraction_failed";
  text?: string;
  contentHash?: string;
  decoderVersion: string;
  extractorVersion: string;
}
```

Change `bindQuestionScopedDirectEvidence` to return `{ retrieval, relevance, subject, evidence }` rather than deleting `verifiedExcerpt` on the retrieved fact. Persist evidence only when evidence classification succeeds; persist the successful retrieval attempt regardless.

- [ ] **Step 4: Run focused tests and dependency audit**

```powershell
npm exec vitest run -- packages/site-crawler/src/public-document.test.ts apps/web/src/worker/provider-discovery-production.test.ts
npm audit --omit=dev
```

Expected: tests pass; audit introduces no high/critical runtime vulnerability. If a reviewed dependency creates one, remove it and use a safer bounded implementation.

- [ ] **Step 5: Commit Task 3**

```powershell
git add packages/site-crawler/src/public-document.ts packages/site-crawler/src/public-document.test.ts packages/site-crawler/package.json package-lock.json apps/web/src/worker/provider-discovery-production.ts apps/web/src/worker/provider-discovery-production.test.ts
git commit -m "feat: extract public documents without losing retrieval state"
```

### Task 4: Replace fixed retrieval with adaptive question-isolated coordination

**Files:**
- Modify: `apps/web/src/worker/public-source-plan.ts`
- Modify: `apps/web/src/worker/public-source-plan.test.ts`
- Create: `apps/web/src/worker/question-acquisition-coordinator.ts`
- Create: `apps/web/src/worker/question-acquisition-coordinator.test.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.ts`
- Modify: `apps/web/src/worker/public-source-snapshot-resolver.test.ts`
- Modify: `apps/web/src/worker/processor.ts`
- Modify: focused processor recovery tests

**Interfaces:**
- Produces: `resolveQuestionAcquisition(input): Promise<QuestionAcquisitionResult>`.
- Consumes: complete candidate pools, typed attempts, attempt repository, checkpoints, and evidence classifier.

- [ ] **Step 1: Write failing scheduler tests**

Cover: failed top six URLs replenish from remaining observations; new domains precede repeat domains; Q1 cannot consume Q2/Q3 minimum budgets; one question reaching two domains stops without cancelling siblings; one bounded reformulation adds candidates; terminal non-retryable outcomes are not replayed; interruption resumes only remaining candidates.

Use this terminal result shape:

```ts
export interface QuestionAcquisitionResult {
  questionId: string;
  state: QuestionCollectionState;
  plannedCandidates: number;
  attemptedCandidates: number;
  remainingCandidates: number;
  returnedObservations: number;
  extractedDocuments: number;
  eligibleEvidenceIds: string[];
  independentDomains: string[];
}
```

- [ ] **Step 2: Run focused tests and verify fixed-plan failures**

```powershell
npm exec vitest run -- apps/web/src/worker/public-source-plan.test.ts apps/web/src/worker/question-acquisition-coordinator.test.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts
```

Expected: replenishment, budget-isolation, resume, and exhaustion assertions fail.

- [ ] **Step 3: Implement the coordinator and integrate snapshots**

Make `createPublicSourceRetrievalPlan()` return all normalized candidates with priority metadata and skip reasons instead of truncating to the attempt cap. The coordinator owns the cap and selects one next sanctioned candidate at a time through the existing concurrency gate.

Persist the attempt before selecting another candidate. Save the question checkpoint after each terminal attempt and evidence change. Mark `exhausted` only when the original pool, one reformulation, and the question budget have a normal terminal record. Map caller/phase/Worker interruption to `collection_failed` or propagated control flow, never `exhausted`.

- [ ] **Step 4: Run scheduler and recovery tests**

Run Step 2 plus focused processor recovery tests. Expected: all pass without duplicate attempt or evidence identities.

- [ ] **Step 5: Commit Task 4**

```powershell
git add apps/web/src/worker/public-source-plan.ts apps/web/src/worker/public-source-plan.test.ts apps/web/src/worker/question-acquisition-coordinator.ts apps/web/src/worker/question-acquisition-coordinator.test.ts apps/web/src/worker/public-source-snapshot-resolver.ts apps/web/src/worker/public-source-snapshot-resolver.test.ts apps/web/src/worker/processor.ts apps/web/src/worker/*recovery*.test.ts
git commit -m "feat: adapt public source acquisition per question"
```

### Task 5: Add hardened browser fallback

**Files:**
- Create: `apps/web/src/worker/public-source-browser.ts`
- Create: `apps/web/src/worker/public-source-browser.test.ts`
- Modify: `apps/web/src/worker/question-acquisition-coordinator.ts`
- Modify: `apps/web/src/worker/question-acquisition-coordinator.test.ts`
- Modify: `apps/web/src/worker/crawler-runtime.ts` only if a safe shared primitive can replace duplicated logic without changing existing site-crawl behavior

**Interfaces:**
- Produces: `executePublicDocumentBrowserAttempt(input, policy): Promise<PublicDocumentAttemptResult>`.
- Consumes: successful robots decision, allowlisted fallback outcome, validated public destination, bounded browser policy, and abort signal.

- [ ] **Step 1: Write browser eligibility and security tests**

Assert browser fallback refuses robots denial/unavailability, non-allowlisted reasons, missing transport pinning, private/reserved/metadata destinations, unsafe redirects, WebSocket, download, file/data/blob main navigation, and over-budget requests. Assert an ephemeral context and exact abort propagation.

- [ ] **Step 2: Run tests and verify red state**

```powershell
npm exec vitest run -- apps/web/src/worker/public-source-browser.test.ts apps/web/src/worker/question-acquisition-coordinator.test.ts
```

Expected: missing module failures.

- [ ] **Step 3: Implement the pinned browser adapter**

Define an explicit policy:

```ts
export interface PublicSourceBrowserPolicy {
  maxNavigationMs: number;
  maxRequests: number;
  maxResponseBytes: number;
  maxRedirects: number;
  allowedFallbackOutcomes: readonly ["javascript_shell"];
}
```

Use a transport mechanism that demonstrably connects through validated pinned public addresses. Request interception alone is insufficient. Validate every requested HTTP(S) destination, block WebSocket/download/local protocols and unnecessary image/media/font resources, and return a typed failure if safe pinning is unavailable. Do not silently fall back to ordinary Playwright DNS.

- [ ] **Step 4: Run browser security and coordinator tests**

Run Step 2. Expected: all pass; a JavaScript-shell fixture becomes available only through the browser path and records two distinct attempts.

- [ ] **Step 5: Commit Task 5**

```powershell
git add apps/web/src/worker/public-source-browser.ts apps/web/src/worker/public-source-browser.test.ts apps/web/src/worker/question-acquisition-coordinator.ts apps/web/src/worker/question-acquisition-coordinator.test.ts apps/web/src/worker/crawler-runtime.ts
git commit -m "feat: add safe browser fallback for public sources"
```

### Task 6: Add deterministic observed and unresolved answer states

**Files:**
- Modify: `packages/citation-intelligence/src/types.ts`
- Modify: relevant citation-intelligence evidence builder and tests
- Modify: `packages/ai-report-engine/src/open-geo-answer-v3.ts`
- Modify: `packages/ai-report-engine/src/open-geo-answer-v3.test.ts`
- Modify: `apps/web/src/worker/answer-first-v3.ts`
- Modify: `apps/web/src/worker/answer-first-v3.test.ts`

**Interfaces:**
- Produces: `OpenGeoAnswerCardV3.status` values `verified | limited | observed | unresolved` for prospective artifacts and an allowed-grade selector derived before synthesis.
- Consumes: terminal question acquisition state, direct evidence, structured observations, subject identity, domain independence, and contradictions.

- [ ] **Step 1: Add failing answer-grade tests**

Test these exact rules:

```ts
twoDirectDomains -> "verified"
oneDirectDomain -> "limited"
zeroDirectDomains + exhausted + twoConsistentObservationDomains -> "observed"
zeroDirectDomains + exhausted + ambiguousOrContradictoryObservations -> "unresolved"
collection_failed -> throws CollectionIncompleteError
```

Verify observational sentences must use localized observational framing and bind only observation IDs. Verify the model cannot request a higher grade, add unsupported facts, or cross question/subject boundaries.

- [ ] **Step 2: Run focused answer tests and confirm failures**

```powershell
npm exec vitest run -- packages/ai-report-engine/src/open-geo-answer-v3.test.ts apps/web/src/worker/answer-first-v3.test.ts packages/citation-intelligence/src
```

Expected: new statuses and collection-incomplete boundary fail.

- [ ] **Step 3: Implement grade selection and synthesis restrictions**

Compute the allowed grade before calling the model. For `observed`, supply only qualifying title/snippet/domain/URL observations and require wording equivalent to “public search results mention/describe”. For `unresolved`, generate deterministic coverage prose and no factual model sentence. Retain backward parsing for historical V3 cards; only new artifacts use the prospective contract revision.

- [ ] **Step 4: Run answer and language tests**

Run Step 2 plus the report-language suites. Expected: all pass in Chinese and English; historical fixtures remain readable.

- [ ] **Step 5: Commit Task 6**

```powershell
git add packages/citation-intelligence packages/ai-report-engine/src/open-geo-answer-v3.ts packages/ai-report-engine/src/open-geo-answer-v3.test.ts apps/web/src/worker/answer-first-v3.ts apps/web/src/worker/answer-first-v3.test.ts
git commit -m "feat: grade answers from completed acquisition evidence"
```

### Task 7: Render complete three-question reports and preserve commercial boundaries

**Files:**
- Modify: `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-v3-artifact.test.tsx`
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: readiness tests
- Modify: `apps/web/src/db/combined-correction-terminalization.ts`
- Modify: `apps/web/src/db/combined-correction-terminalization.test.ts`
- Modify: `apps/web/src/db/combined-replacement-terminalization.ts`
- Modify: replacement terminalization tests
- Modify: customer status/email tests only where copy or terminal state changes

**Interfaces:**
- Consumes: four answer states and question acquisition metrics.
- Produces: exactly three nonblank customer cards and unchanged exactly-once settlement/refund/email effects.

- [ ] **Step 1: Write failing artifact and terminalization tests**

Render one card of each prospective state and assert every card contains a conclusion, evidence label, queries, returned observations, attempted pages, extracted pages, eligible evidence, limitation reason, source links appropriate to the state, and retest question.

Test commercial mapping:

```ts
[verified, verified, verified] -> completed
any limited | observed | unresolved with terminal acquisition -> completed_limited
any collection_failed -> reject terminalization and remain repair_wait
```

Assert `completed_limited` activates one immutable artifact and creates one refund intent; `collection_failed` activates none and creates neither premature refund nor failure email while recovery remains sanctioned.

- [ ] **Step 2: Run focused report and commerce tests**

```powershell
npm exec vitest run -- apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/db/combined-replacement-terminalization.test.ts
```

Expected: status/rendering and collection-failure boundary assertions fail.

- [ ] **Step 3: Implement report rendering and terminalization mapping**

Render observational answers as observations, not facts. Render unresolved cards with deterministic exhausted-coverage language. Keep customer delivery HTML-only and retain private PDF readiness from the same canonical revision. Update commercial outcome logic only after validating every question acquisition state.

- [ ] **Step 4: Run focused artifact, language, access, and commerce tests**

Run Step 2 plus report visibility, customer PDF absence, access token, refund, and email intent suites. Expected: all pass with no customer PDF route or copy regression.

- [ ] **Step 5: Commit Task 7**

```powershell
git add apps/web/src/components/combined-geo-report-v3-artifact.tsx apps/web/src/components/combined-geo-report-v3-artifact.test.tsx apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/*readiness*.test.tsx apps/web/src/db/combined-correction-terminalization.ts apps/web/src/db/combined-correction-terminalization.test.ts apps/web/src/db/combined-replacement-terminalization.ts apps/web/src/db/*replacement*terminalization*.test.ts apps/web/src
git commit -m "feat: deliver complete graded three-question reports"
```

Before committing, inspect `git diff --cached --name-only` and unstage any unrelated path accidentally matched by the final broad `apps/web/src` argument.

### Task 8: Full verification, documentation, and protected-staging acceptance

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Create: `docs/operations/evidence/2026-07-15-adaptive-public-source-acquisition-acceptance.md`

**Interfaces:**
- Consumes: completed implementation and live protected-staging evidence.
- Produces: reproducible acceptance evidence and current project-state truth.

- [ ] **Step 1: Run deterministic verification**

```powershell
npm test
npm run lint
npm run build
npm run db:audit
npm run test:postgres:staging-security
git diff --check
```

Expected: all configured deterministic checks pass. PostgreSQL tests require the sanctioned isolated admin URL; do not convert missing configuration, timeout, or skip into a pass.

- [ ] **Step 2: Run security and invariant searches**

```powershell
rg -n "report\.pdf|Print / PDF|打印 / PDF" apps/web/src
rg -n "collection_failed.*(unresolved|completed_limited)|inaccessible.*unknown" apps/web/src packages
```

Expected: no customer PDF delivery match; no code path directly maps collection failure to a deliverable evidence state; any remaining legacy `inaccessible` mapping is documented and outside the prospective path.

- [ ] **Step 3: Run protected-staging pre-order gates**

Verify exact deployment/Worker source alignment, schema 25, active signed public-search authority, real MiMo probe, Airwallex retrieval, redirected Resend probe, staging commerce drain, and `db:audit`. Stop before checkout if any gate fails.

- [ ] **Step 4: Complete one protected-staging paid acceptance**

Create one new report and one Sandbox payment only after Step 3 passes. Drain the deep lane and record report, order, job, artifact, three question checkpoints, attempt ledger, snapshot, credit, refund, email, deployment, and Worker revision identities without recording secrets.

Acceptance requires:

- exactly three visible nonblank question cards;
- independent question budgets;
- explicit reasons for every attempted URL;
- replenishment after initial failures when candidates remain;
- no `unresolved` without normal exhaustion;
- no collection failure represented as evidence absence;
- canonical authorized HTML and private PDF readiness on the same revision;
- exact settlement/refund outcome for the achieved grades;
- no duplicate commercial or evidence effects;
- no production or historical mutation.

- [ ] **Step 5: Perform real browser acceptance**

Open authorized desktop and mobile canonical HTML, verify all three complete cards and source links, verify anonymous and wrong-scope access return application 404, and capture evidence paths. Do not substitute unit HTML, screenshots of fixtures, or headless-only output for real protected-staging browser evidence.

- [ ] **Step 6: Update durable project truth**

Update `PROJECT-STATE`, `TASKS`, and `DECISIONS` from the exact code and live outcome. The acceptance report must separate deterministic, deployment, provider, database, browser, and commercial evidence and identify any remaining blocker honestly.

- [ ] **Step 7: Commit verification documentation**

```powershell
git add docs/PROJECT-STATE.md docs/TASKS.md docs/DECISIONS.md docs/operations/evidence/2026-07-15-adaptive-public-source-acquisition-acceptance.md
git commit -m "docs: record adaptive acquisition acceptance"
```

## Plan Self-Review Result

- Every approved design section maps to at least one task.
- Retrieval, extraction, relevance, subject, evidence, answer, and commerce states remain separate.
- Browser fallback is gated on transport pinning and cannot silently reuse ordinary browser DNS.
- Historical compatibility and production isolation are explicit.
- Each task has a red test, minimal implementation boundary, green verification, and scoped commit.
- No implementation placeholder or unspecified error-handling step remains.
