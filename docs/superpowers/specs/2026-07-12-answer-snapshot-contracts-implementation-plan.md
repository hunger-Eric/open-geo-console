# Answer Snapshot Contracts Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-12-ai-recommendation-forensic-report-design.md`

**Slice:** 1 of the approved recommendation-forensic rollout: contracts, persistence shape, and deterministic fixtures only.

**Objective:** Add provider-neutral answer-snapshot and citation-evidence contracts, pure attribution primitives, immutable PostgreSQL persistence, and deterministic two-provider fixtures without calling a live provider, changing a Worker flow, or exposing a new report claim.

## Guardrails

- This slice does not call OpenAI, Perplexity, DeepSeek, Doubao, or any other live answer provider.
- No provider is marked certified. Certification requires a later protected-staging slice.
- No report page, API response, marketing copy, checkout promise, or commercial qualification threshold changes in this slice.
- Free reports continue to fetch only the submitted homepage and standard assets.
- PostgreSQL remains the only production authority; any in-memory path exists only for deterministic tests.
- Snapshot cells are immutable observations. A rerun creates a new run/cell identity instead of updating answer content.
- Provider API observations never use a consumer-application label.
- Third-party full-page content is not stored in snapshot rows. Source evidence stores bounded excerpts and expiry metadata only.
- Existing scan, payment, credit, refund, email, access, and Worker state machines remain unchanged.
- Use `npm` workspaces and preserve all existing package boundaries.

## Acceptance Boundary

At the end of this slice, the repository can represent and persist a complete deterministic fixture containing:

- two candidate provider surfaces;
- four non-branded market questions;
- customer absence and competitor recommendations;
- owned and third-party source metadata;
- one inaccessible source;
- one ambiguous entity;
- one explicit no-recommendation answer;
- Grade A, B, C, and D evidence examples.

The slice is accepted only when the contracts reject malformed or misleading states, persistence rejects mutation of an existing snapshot identity, and no runtime code starts executing these fixtures or providers.

## Phase 1: Add the provider-neutral answer observer package

### Tests first

Create:

- `packages/answer-engine-observer/src/index.test.ts`

Prove:

1. a question requires a stable ID, locale, category, exact text, and non-empty inference basis;
2. a provider surface distinguishes provider, API product, model, region, locale, and collection surface;
3. `collectionSurface: "developer_api"` cannot be labeled as a consumer application;
4. a successful cell requires answer text, execution time, response hash, and normalized source metadata;
5. a failed cell requires a bounded error class and cannot contain a fabricated successful answer;
6. source order is non-negative and URLs are absolute HTTP(S) URLs;
7. a no-recommendation answer remains a successful observation;
8. identical normalized identity input produces the same snapshot-cell ID;
9. changing run, question, provider surface, model, locale, or region changes the cell ID;
10. volatile fields such as provider request ID, usage, answer text, and execution duration do not change identity.

### Implementation

Create:

- `packages/answer-engine-observer/package.json`
- `packages/answer-engine-observer/tsconfig.json`
- `packages/answer-engine-observer/src/types.ts`
- `packages/answer-engine-observer/src/validation.ts`
- `packages/answer-engine-observer/src/identity.ts`
- `packages/answer-engine-observer/src/index.ts`

Define:

- `AnswerQuestionCategory` for category selection, supplier selection, solution comparison, and use-case suitability;
- `AnswerQuestion` with stable ID, exact text, locale, category, and inference evidence;
- `AnswerEngineCollectionSurface = "developer_api" | "approved_browser_capture"`;
- `AnswerEngineSurface` with provider ID, product ID, model ID, collection surface, locale, region, and certification state;
- `AnswerAdapterErrorClass` with timeout, rate-limit, authentication, unsupported, provider-unavailable, invalid-response, and policy-blocked values;
- `AnswerSnapshotRunContract` with report/job binding, locale, region, question-set version, and immutable run ID;
- successful and failed `AnswerSnapshotCell` discriminated unions;
- `AnswerSnapshotSource` with URL, title, provider order, and provider metadata;
- `AnswerEngineAdapter` interface without a concrete implementation;
- pure `parse*`/`assert*` validation boundaries;
- deterministic SHA-256 run and cell identity helpers.

The package exports only contracts, validation, and identity. It must not import Web, database, crawler, or model-client code.

Run:

```bash
npm test -- --run packages/answer-engine-observer/src/index.test.ts
npm run build --workspace @open-geo-console/answer-engine-observer
```

## Phase 2: Add deterministic recommendation and citation primitives

### Tests first

Create:

- `packages/citation-intelligence/src/index.test.ts`

Prove:

1. a brand mention without preference language is not classified as a recommendation;
2. a direct candidate, preferred choice, example, or suitability statement can be classified as a recommendation with supporting text;
3. same-name organizations remain ambiguous without domain or contextual identity evidence;
4. a source is categorized as customer-owned only when it matches the submitted registrable site identity;
5. competitor-owned, editorial, directory/reference, community/UGC, institution, social, and unknown categories remain distinct;
6. Grade A requires a provider-returned source plus a verified excerpt that directly supports the recommendation fact;
7. Grade B requires relevant source/entity evidence but no precise answer-to-source sentence mapping;
8. Grade C requires a repeated pattern across independent cells and never upgrades itself to direct evidence;
9. inaccessible, ambiguous, or unsupported evidence is Grade D;
10. an opportunity hypothesis names its evidence cells and source pattern but contains no guaranteed ranking or placement language;
11. prohibited claims such as “caused the model to rank first” fail validation;
12. deterministic fixture output is stable across runs.

### Implementation

Create:

- `packages/citation-intelligence/package.json`
- `packages/citation-intelligence/tsconfig.json`
- `packages/citation-intelligence/src/types.ts`
- `packages/citation-intelligence/src/recommendations.ts`
- `packages/citation-intelligence/src/entities.ts`
- `packages/citation-intelligence/src/sources.ts`
- `packages/citation-intelligence/src/evidence-grades.ts`
- `packages/citation-intelligence/src/opportunities.ts`
- `packages/citation-intelligence/src/validation.ts`
- `packages/citation-intelligence/src/index.ts`

Add a dependency on `@open-geo-console/answer-engine-observer` and reuse its normalized cells and sources.

Keep this package pure. It consumes already extracted text and site identities; it does not fetch URLs, call a model, write a database, or generate customer prose.

Run:

```bash
npm test -- --run packages/citation-intelligence/src/index.test.ts
npm run build --workspace @open-geo-console/citation-intelligence
```

## Phase 3: Add reusable deterministic fixtures

### Tests first

Extend both package test suites and create:

- `packages/answer-engine-observer/src/testing.test.ts`
- `packages/citation-intelligence/src/fixture-contract.test.ts`

The fixture must contain:

- run ID `fixture-run-1` bound to a fake report and deep job;
- provider surfaces `fixture-global-a` and `fixture-global-b`, both explicitly uncertified candidates;
- four stable market questions;
- at least eight successful provider/question cells plus one explicit failed cell;
- a customer that is absent from most recommendation answers;
- two distinct competitors;
- customer-owned, competitor-owned, editorial, directory, community, and inaccessible sources;
- exact short excerpts that produce Grades A and B;
- repeated source/entity patterns that produce Grade C;
- inaccessible or ambiguous evidence that produces Grade D;
- one successful cell with no recommendation objects.

Prove that:

1. every fixture passes package validation;
2. fixture IDs and hashes are stable;
3. no fixture provider is marked certified;
4. fixture text and domains are reserved examples and cannot be mistaken for live customer/provider evidence;
5. the fixture produces all four evidence grades without a model call.

### Implementation

Add:

- `packages/answer-engine-observer/src/testing.ts`
- a `./testing` export in `packages/answer-engine-observer/package.json`;
- `packages/citation-intelligence/src/testing.ts`
- a `./testing` export in `packages/citation-intelligence/package.json`.

Testing exports must use `example.com`, `example.org`, and documentation-reserved addresses only. Production code must not import the `./testing` entry points.

Run:

```bash
npm test -- --run packages/answer-engine-observer packages/citation-intelligence
```

## Phase 4: Add immutable PostgreSQL snapshot persistence

### Tests first

Create:

- `apps/web/src/db/recommendation-forensics.test.ts`
- `apps/web/src/db/recommendation-forensics.postgres.test.ts`

Extend:

- `apps/web/src/db/index.test.ts`
- `apps/web/src/db/staging-security.postgres.test.ts`

Prove:

1. one run is bound to exactly one report and one job;
2. deleting a report/job cascades all report-scoped snapshot data;
3. a cell identity is unique within its immutable run/question/surface/model/locale/region contract;
4. inserting the same cell and response hash is idempotent;
5. inserting the same cell identity with different answer text or response hash fails as an immutability violation;
6. successful and failed cells satisfy mutually exclusive database checks;
7. source order and source URL identity are unique within a cell;
8. citation evidence retains only a bounded excerpt, category, retrieval state, hashes, and expiry metadata;
9. inaccessible evidence may omit excerpt/content hash only with an unavailable state;
10. report-scoped reads return a complete normalized bundle in stable question/provider/source order;
11. no public report query automatically joins or serializes private snapshot/source evidence;
12. schema version 4 is required and newer-schema fail-closed behavior remains intact.

### Implementation

Modify:

- `apps/web/package.json`
- `apps/web/src/db/memory.ts`
- `apps/web/src/db/schema.ts`
- `apps/web/src/db/migrations.ts`
- `apps/web/src/db/index.ts`

Create:

- `apps/web/src/db/recommendation-forensics.ts`

Add the minimum tables required by this slice:

- `answer_snapshot_runs`;
- `answer_snapshot_cells`;
- `answer_snapshot_sources`;
- `citation_source_evidence`.

Do not add recommendation-opportunity, vendor-task, or report-v2 tables in this slice; those belong to later behavior-driven plans.

Persistence boundaries:

- `createAnswerSnapshotRun`;
- `saveAnswerSnapshotCellImmutable`;
- `saveAnswerSnapshotSourcesImmutable`;
- `saveCitationSourceEvidenceImmutable`;
- `getAnswerSnapshotBundleForJob`;
- `deleteExpiredCitationSourceContent` for clearing bounded excerpts without deleting audit metadata.

Mirror these boundaries in the existing test-only memory store and clear them through the same test reset lifecycle. Production code must continue to select PostgreSQL whenever `DATABASE_URL` is configured.

Use HMACs only where a future public identifier needs secrecy; internal deterministic IDs may use content hashes because the records are private and contain no credentials. Never persist provider keys, raw authorization headers, access tokens, or unsanitized provider errors.

Bump `DATABASE_SCHEMA_VERSION` from 3 to 4 only after every idempotent migration statement and Drizzle schema check is present.

Run:

```bash
npm install
npm test -- --run apps/web/src/db/recommendation-forensics.test.ts apps/web/src/db/index.test.ts
npm run test:postgres:staging-security
```

The PostgreSQL test must use the protected staging marker and existing environment refusal rules. It must not clean or mutate production.

## Phase 5: Prove package-to-persistence compatibility without runtime wiring

### Tests first

Create:

- `apps/web/src/recommendation-forensics/fixture-persistence.test.ts`

Prove:

1. the deterministic two-provider fixture can be written through persistence boundaries and read back without loss;
2. read-back package validation succeeds;
3. evidence grades remain identical before and after persistence;
4. rerunning the same fixture is idempotent;
5. mutating one answer under the same cell ID is rejected;
6. expired source excerpts can be cleared while URL, category, grade, timestamps, and hashes remain auditable;
7. no Worker, API route, report component, commerce module, or provider client is imported by the compatibility path.

### Implementation

Create only a test-facing composition helper if needed:

- `apps/web/src/recommendation-forensics/testing.ts`

Do not add a production orchestrator, Worker stage, feature flag, API route, or UI component. This phase proves that later slices have stable foundations without silently enabling the product.

Run:

```bash
npm test -- --run apps/web/src/recommendation-forensics packages/answer-engine-observer packages/citation-intelligence
```

## Phase 6: Contract and dependency audit

Run CodeGraph sync after adding the workspaces, then verify:

```bash
codegraph sync
codegraph status
codegraph affected packages/answer-engine-observer/src/index.ts packages/citation-intelligence/src/index.ts apps/web/src/db/recommendation-forensics.ts
```

Inspect the affected set and prove:

- new packages depend only in the intended direction;
- `site-crawler` does not depend on either new package;
- `geo-auditor` and `ai-report-engine` are unchanged in this slice;
- no route or report component imports private snapshot persistence;
- no runtime Worker imports test fixtures;
- package-lock changes contain only the two new workspaces and declared dependencies.

## Phase 7: Full verification and documentation closeout

Run:

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
git diff --check
```

Then perform a scoped documentation sync:

- update `AGENTS.md` architecture boundaries only if the new packages are implemented and exported;
- update `README.md` workspace list, but do not claim live provider or report support;
- update `docs/PROJECT-STATE.md` with implemented contracts, schema version, validation commands, and the fact that no provider/runtime/UI is wired;
- update `docs/TASKS.md` to complete only the contract/fixture item;
- add a `docs/DECISIONS.md` entry stating that snapshot identity is immutable and provider certification is separate from adapter existence.

Commit only after all checks pass. Do not deploy this slice: it has no customer-visible behavior and no live-provider acceptance to verify.

## Slice Acceptance Criteria

- Both new packages build independently and have complete deterministic tests.
- Successful, failed, and no-recommendation observations are distinct valid states.
- API and consumer-application surfaces cannot be mislabeled by the contract.
- Mention, recommendation, entity ambiguity, source category, and Grade A-D rules are deterministic.
- The fixture covers two candidate providers, four questions, all evidence grades, inaccessible evidence, ambiguous identity, and no-recommendation output.
- PostgreSQL schema version 4 stores immutable snapshot runs, cells, sources, and bounded citation evidence.
- Replaying identical observations is idempotent; mutating an existing cell identity fails.
- Private snapshot data is not reachable through existing public report reads.
- No live provider call, Worker orchestration, UI, report-v2 payload, checkout promise, or commercial threshold is enabled.
- Lint, tests, builds, database invariants, protected-staging schema tests, CodeGraph impact review, and diff checks pass.

## Explicit Follow-Up

After this slice is implemented and accepted, write a separate plan for Slice 2: one live certified provider adapter in protected staging, with provider-specific cost, timeout, source, retention, and commercial-use acceptance. Do not combine that work into this plan.
